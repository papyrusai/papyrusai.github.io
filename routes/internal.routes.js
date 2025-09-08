/*
Routes: Internal dashboard (admin/review) endpoints for labeled document review across users.
Endpoints:
- GET  '/api/internal/seguimiento-users' (auth): returns saved list of users/empresas under tomas@reversa.ai for seguimiento
- POST '/api/internal/seguimiento-users' (auth): updates saved seguimiento users with backup of previous value
- GET  '/api/internal/ranking' (auth): returns ranking of users/empresas by total etiqueta matches across collections/date range with pagination
- GET  '/api/internal/data' (auth): returns documents and analytics for a selected user/empresa with filters (usuario, etiquetas, boletines, rango, fecha)

Notes:
- Reuses buildEtiquetasQueryForIds and db utils for consistent behavior with /profile and /data
- Selection persistence follows backup policy: also store 'usuarios_en_seguimiento_old'
*/

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const { expandCollectionsWithTest, collectionExists, buildDateFilter } = require('../services/db.utils');
const { buildEtiquetasQueryForIds } = require('../services/enterprise.service');

const router = express.Router();
const uri = process.env.DB_URI;
const mongodbOptions = {};

// Utilities
function parseCollectionsParam(param, fallback = ['BOE']) {
	if (!param || typeof param !== 'string') return fallback;
	const arr = param.split('||').map(s => s.trim()).filter(Boolean);
	return arr.length ? arr : fallback;
}

function parseDateISO(dateStr) {
	if (!dateStr || typeof dateStr !== 'string') return null;
	const [y, m, d] = dateStr.split('-').map(Number);
	if (!y || !m || !d) return null;
	const dt = new Date(y, m - 1, d);
	return isNaN(dt.getTime()) ? null : dt;
}

// ------------------------------
// Seguimiento (selected users storage under tomas@reversa.ai)
// ------------------------------
router.get('/api/internal/seguimiento-users', ensureAuthenticated, async (req, res) => {
    if (req.user?.email !== 'tomas@reversa.ai') {
        return res.status(403).json({ success: false, error: 'No autorizado' });
    }
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const db = client.db('papyrus');
		const usersColl = db.collection('users');
		// Storage owner (fixed): tomas@reversa.ai
		const owner = await usersColl.findOne({ email: 'tomas@reversa.ai' }, { projection: { usuarios_en_seguimiento: 1 } });
		const ids = Array.isArray(owner?.usuarios_en_seguimiento) ? owner.usuarios_en_seguimiento : [];
		// Fetch details for those ids
		const objectIds = ids.map(id => (id instanceof ObjectId) ? id : new ObjectId(String(id)));
		const details = objectIds.length ? await usersColl.find({ _id: { $in: objectIds } }, { projection: { email: 1, tipo_cuenta: 1, empresa_name: 1, empresa_domain: 1, empresa: 1 } }).toArray() : [];
		const byId = new Map(details.map(d => [String(d._id), d]));
		const items = ids.map(id => {
			const s = String(id);
			const d = byId.get(s) || null;
			const hasEmail = !!d?.email;
			const tipo = d?.tipo_cuenta || null;
			const isEmpresa = (!hasEmail) && (tipo === 'empresa' || tipo === 'estructura_empresa');
			const displayName = isEmpresa ? (d?.empresa || d?.empresa_name || d?.empresa_domain || 'Empresa') : (d?.email || s);
			return { userId: s, email: d?.email || null, tipo_cuenta: tipo, isEmpresa, displayName };
		});
		return res.json({ success: true, items });
	} catch (e) {
		console.error('[internal] seguimiento-users GET error:', e);
		return res.status(500).json({ success: false, error: 'Error obteniendo usuarios en seguimiento' });
	} finally {
		await client.close();
	}
});

router.post('/api/internal/seguimiento-users', ensureAuthenticated, async (req, res) => {
	const { selectedUserIds } = req.body || {};
    if (req.user?.email !== 'tomas@reversa.ai') {
        return res.status(403).json({ success: false, error: 'No autorizado' });
    }
	if (!Array.isArray(selectedUserIds)) {
		return res.status(400).json({ success: false, error: 'selectedUserIds debe ser un array' });
	}
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const db = client.db('papyrus');
		const usersColl = db.collection('users');
		// Only allow updates from owner account
		if (req.user?.email !== 'tomas@reversa.ai') {
			return res.status(403).json({ success: false, error: 'Solo tomas@reversa.ai puede actualizar la selección' });
		}
		const owner = await usersColl.findOne({ email: 'tomas@reversa.ai' }, { projection: { usuarios_en_seguimiento: 1 } });
		const prev = Array.isArray(owner?.usuarios_en_seguimiento) ? owner.usuarios_en_seguimiento : [];
		await usersColl.updateOne(
			{ email: 'tomas@reversa.ai' },
			{
				$set: { usuarios_en_seguimiento: selectedUserIds },
				$setOnInsert: { createdAt: new Date() },
				$currentDate: { updatedAt: true },
				$rename: {}
			}
		);
		// Backup field policy: store old in _old
		await usersColl.updateOne(
			{ email: 'tomas@reversa.ai' },
			{ $set: { usuarios_en_seguimiento_old: prev } }
		);
		return res.json({ success: true });
	} catch (e) {
		console.error('[internal] seguimiento-users POST error:', e);
		return res.status(500).json({ success: false, error: 'Error guardando usuarios en seguimiento' });
	} finally {
		await client.close();
	}
});

// ------------------------------
// Ranking de usuarios/empresas por matches de etiquetas
// ------------------------------
router.get('/api/internal/ranking', ensureAuthenticated, async (req, res) => {
	if (req.user?.email !== 'tomas@reversa.ai') {
		return res.status(403).json({ success: false, error: 'No autorizado' });
	}
	const collections = parseCollectionsParam(req.query.collections);
	const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
	const pageSize = Math.max(1, Math.min(parseInt(req.query.pageSize || '15', 10) || 15, 100));
	const start = parseDateISO(req.query.desde);
	const end = parseDateISO(req.query.hasta);
	const dateFilter = buildDateFilter(start, end);

	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const db = client.db('papyrus');
		const usersColl = db.collection('users');
		const expanded = expandCollectionsWithTest(collections).filter(n => !String(n).toLowerCase().endsWith('_test'));

		// Aggregate per (id,label) to enable etiqueta-based filtered counts
		const idToTotal = new Map(); // id -> total matches
		const idToLabelCounts = new Map(); // id -> (label -> count)

		for (const cName of expanded) {
			try {
				const exists = await collectionExists(db, cName);
				if (!exists) continue;
				const pipeline = [];
				if (dateFilter.length) pipeline.push({ $match: { $and: dateFilter } });
				pipeline.push(
					{ $project: { ep: { $objectToArray: "$etiquetas_personalizadas" } } },
					{ $unwind: "$ep" },
					{ $project: { id: "$ep.k", v: "$ep.v" } },
					{ $addFields: {
						labels: {
							$cond: [
								{ $isArray: "$v" },
								"$v",
								{
									$cond: [
										{ $eq: [ { $type: "$v" }, "object" ] },
										{ $map: { input: { $objectToArray: "$v" }, as: "e", in: "$$e.k" } },
										[]
									]
								}
							]
						}
					} },
					{ $unwind: "$labels" },
					{ $group: { _id: { id: "$id", label: "$labels" }, matches: { $sum: 1 } } }
				);
				const rows = await db.collection(cName).aggregate(pipeline).toArray();
				for (const r of rows) {
					const id = String(r._id.id || '');
					const label = String(r._id.label || '');
					const count = Number(r.matches || 0);
					if (!id) continue;
					idToTotal.set(id, (idToTotal.get(id) || 0) + count);
					if (!idToLabelCounts.has(id)) idToLabelCounts.set(id, new Map());
					const lm = idToLabelCounts.get(id);
					lm.set(label, (lm.get(label) || 0) + count);
				}
			} catch (e) {
				console.error('[internal] ranking aggregation error', cName, e.message);
			}
		}

		// Build details for ids present in aggregation
		const directIds = Array.from(idToTotal.keys());
		const objIds = directIds.map(id => (id.match(/^[a-fA-F0-9]{24}$/) ? new ObjectId(id) : null)).filter(Boolean);
		const details = objIds.length ? await usersColl.find(
			{ _id: { $in: objIds } },
			{ projection: { email: 1, tipo_cuenta: 1, empresa_name: 1, empresa_domain: 1, empresa: 1 } }
		).toArray() : [];
		const detailsById = new Map(details.map(d => [String(d._id), d]));

		// Determine empresa structure ids among direct ids (no email + tipo empresa/estructura_empresa)
		const empresaIds = new Set();
		for (const id of directIds) {
			const d = detailsById.get(id);
			if (!d) continue; // skip orphan ids without users doc
			const tipo = d.tipo_cuenta || '';
			if (!d.email && (tipo === 'empresa' || tipo === 'estructura_empresa')) empresaIds.add(id);
		}

		// Fetch employees for those empresas (individuals with email)
		let employeeDocs = [];
		if (empresaIds.size > 0) {
			const empObjIds = Array.from(empresaIds).map(s => new ObjectId(s));
			employeeDocs = await usersColl.find(
				{ estructura_empresa_id: { $in: empObjIds }, email: { $exists: true, $ne: null } },
				{ projection: { email: 1, tipo_cuenta: 1, estructura_empresa_id: 1, etiquetas_personalizadas_seleccionadas: 1 } }
			).toArray();
		}

		// Build direct items (ids that appeared in aggregation) — only for existing user docs
		const itemsMap = new Map(); // userId -> item
		for (const id of directIds) {
			const d = detailsById.get(id);
			if (!d) continue; // orphan: skip
			const tipo = d?.tipo_cuenta || 'individual';
			const hasEmail = !!d?.email;
			const isEmpresa = (!hasEmail) && (tipo === 'empresa' || tipo === 'estructura_empresa');
			const empresaName = d?.empresa || d?.empresa_name || d?.empresa_domain || (isEmpresa ? 'Empresa' : null);
			const matches = idToTotal.get(id) || 0;
			const item = {
				userId: String(id),
				matches,
				email: d?.email || null,
				tipo_cuenta: tipo,
				isEmpresa: !!isEmpresa,
				displayName: isEmpresa ? (empresaName || 'Empresa') : (d?.email || String(id)),
				empresa: isEmpresa ? (empresaName || 'Empresa') : null
			};
			itemsMap.set(item.userId, item);
		}

		// Derived employee items: use empresa counts, optionally filter by etiquetas_personalizadas_seleccionadas
		for (const emp of employeeDocs) {
			const empId = String(emp._id);
			const empresaId = emp.estructura_empresa_id ? String(emp.estructura_empresa_id) : null;
			if (!empresaId) continue;
			const labelCounts = idToLabelCounts.get(empresaId);
			if (!labelCounts || labelCounts.size === 0) continue;
			let matches = 0;
			const selected = Array.isArray(emp.etiquetas_personalizadas_seleccionadas) ? emp.etiquetas_personalizadas_seleccionadas : [];
			if (selected.length > 0) {
				const selSet = new Set(selected.map(s => String(s).toLowerCase()));
				for (const [label, count] of labelCounts.entries()) {
					if (selSet.has(String(label).toLowerCase())) matches += Number(count || 0);
				}
			} else {
				for (const [, count] of labelCounts.entries()) matches += Number(count || 0);
			}
			const item = {
				userId: empId,
				matches,
				email: emp.email || null,
				tipo_cuenta: emp.tipo_cuenta || 'empresa',
				isEmpresa: false,
				displayName: emp.email || empId,
				empresa: null
			};
			// Keep max if duplicate
			const existing = itemsMap.get(empId);
			if (!existing || existing.matches < item.matches) itemsMap.set(empId, item);
		}

		// Append recent users (0 matches) to the selector: include individuals with email and empresa docs
		try {
			const recentUsers = await usersColl.find(
				{ $or: [ { email: { $exists: true, $ne: null } }, { tipo_cuenta: { $in: ['empresa', 'estructura_empresa'] } } ] },
				{ projection: { email: 1, tipo_cuenta: 1, empresa: 1, empresa_name: 1, empresa_domain: 1 } }
			)
			.sort({ registration_date_obj: -1, updated_at: -1, _id: -1 })
			.limit(200)
			.toArray();
			for (const u of recentUsers) {
				const uid = String(u._id);
				if (itemsMap.has(uid)) continue;
				const hasEmail = !!u.email;
				const tipo = u?.tipo_cuenta || (hasEmail ? 'individual' : 'empresa');
				const isEmpresa = (!hasEmail) && (tipo === 'empresa' || tipo === 'estructura_empresa');
				const empresaName = u?.empresa || u?.empresa_name || u?.empresa_domain || (isEmpresa ? 'Empresa' : null);
				itemsMap.set(uid, {
					userId: uid,
					matches: 0,
					email: u.email || null,
					tipo_cuenta: tipo,
					isEmpresa: !!isEmpresa,
					displayName: isEmpresa ? (empresaName || 'Empresa') : (u.email || uid),
					empresa: isEmpresa ? (empresaName || 'Empresa') : null
				});
			}
		} catch (e) { /* ignore recent users enrichment errors */ }

		let items = Array.from(itemsMap.values());
		items.sort((a, b) => (b.matches - a.matches));
		const total = items.length;
		const totalPages = Math.max(1, Math.ceil(total / pageSize));
		const safePage = Math.min(page, totalPages);
		const startIdx = (safePage - 1) * pageSize;
		const endIdx = Math.min(startIdx + pageSize, total);
		const pageItems = items.slice(startIdx, endIdx);

		return res.json({ success: true, total, page: safePage, pageSize, totalPages, items: pageItems });
	} catch (e) {
		console.error('[internal] ranking GET error:', e);
		return res.status(500).json({ success: false, error: 'Error obteniendo ranking' });
	} finally {
		await client.close();
	}
});

// ------------------------------
// Data endpoint for selected user/empresa
// ------------------------------
router.get('/api/internal/data', ensureAuthenticated, async (req, res) => {
    if (req.user?.email !== 'tomas@reversa.ai') {
        return res.status(403).json({ success: false, error: 'No autorizado' });
    }
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const database = client.db('papyrus');
		const usersCollection = database.collection('users');

		// Target user(s)
		const targetUserId = req.query.userId ? String(req.query.userId) : null;
		if (!targetUserId) {
			return res.status(400).json({ success: false, error: 'Parámetro requerido: userId' });
		}

		// Determine target IDs (enterprise may include legacy ids)
		let targetUserIds = [targetUserId];
		let selectedEtiquetas = [];
		let deletedBySelectedUser = [];
		try {
			const maybeObjId = targetUserId.match(/^[a-fA-F0-9]{24}$/) ? new ObjectId(targetUserId) : null;
			if (maybeObjId) {
				const userDoc = await usersCollection.findOne(
					{ _id: maybeObjId },
					{ projection: { email: 1, tipo_cuenta: 1, estructura_empresa_id: 1, legacy_user_ids: 1, etiquetas_personalizadas: 1, etiquetas_personalizadas_seleccionadas: 1, documentos_eliminados: 1, empresa: 1, empresa_name: 1 } }
				);
				if (userDoc) {
					deletedBySelectedUser = Array.isArray(userDoc.documentos_eliminados) ? userDoc.documentos_eliminados : [];
					// CASO 1: Empleado enterprise (tiene estructura_empresa_id)
					if (userDoc.estructura_empresa_id) {
						const empresaId = userDoc.estructura_empresa_id instanceof ObjectId ? userDoc.estructura_empresa_id : new ObjectId(String(userDoc.estructura_empresa_id));
						let legacy = [];
						let empresaDoc = null;
						try {
							empresaDoc = await usersCollection.findOne({ _id: empresaId }, { projection: { legacy_user_ids: 1, etiquetas_personalizadas: 1 } });
							legacy = Array.isArray(empresaDoc?.legacy_user_ids) ? empresaDoc.legacy_user_ids.map(String) : [];
						} catch(_) { legacy = []; }
						targetUserIds = [String(empresaId), ...legacy];
						// Preferir seleccionadas del empleado; si no, usar etiquetas de empresa
						if (Array.isArray(userDoc.etiquetas_personalizadas_seleccionadas) && userDoc.etiquetas_personalizadas_seleccionadas.length > 0) {
							selectedEtiquetas = userDoc.etiquetas_personalizadas_seleccionadas;
						} else if (empresaDoc && empresaDoc.etiquetas_personalizadas) {
							const e = empresaDoc.etiquetas_personalizadas;
							selectedEtiquetas = Array.isArray(e) ? e : (typeof e === 'object' ? Object.keys(e) : []);
						}
					}
					// CASO 2: Documento de empresa (sin email)
					else if (!userDoc.email && userDoc.tipo_cuenta === 'empresa') {
						const legacy = Array.isArray(userDoc.legacy_user_ids) ? userDoc.legacy_user_ids.map(String) : [];
						targetUserIds = [targetUserId, ...legacy];
						const e = userDoc?.etiquetas_personalizadas || {};
						selectedEtiquetas = Array.isArray(e) ? e : (typeof e === 'object' ? Object.keys(e) : []);
					}
					// CASO 3: Empleado enterprise sin estructura_empresa_id pero con nombre de empresa → buscar doc empresa por nombre
					else if (userDoc.tipo_cuenta === 'empresa' && (userDoc.empresa || userDoc.empresa_name)) {
						const empName = userDoc.empresa || userDoc.empresa_name;
						const empresaDoc = await usersCollection.findOne(
							{ tipo_cuenta: 'empresa', $or: [ { empresa: empName }, { empresa_name: empName } ] },
							{ projection: { _id: 1, legacy_user_ids: 1, etiquetas_personalizadas: 1 } }
						);
						if (empresaDoc?._id) {
							const legacy = Array.isArray(empresaDoc.legacy_user_ids) ? empresaDoc.legacy_user_ids.map(String) : [];
							targetUserIds = [String(empresaDoc._id), ...legacy];
							const e = empresaDoc.etiquetas_personalizadas || {};
							selectedEtiquetas = Array.isArray(e) ? e : (typeof e === 'object' ? Object.keys(e) : []);
						}
					}
					// Fallback: si aún vacío, intentar usar etiquetas del propio doc
					if (selectedEtiquetas.length === 0) {
						const e = userDoc?.etiquetas_personalizadas || {};
						selectedEtiquetas = Array.isArray(e) ? e : (typeof e === 'object' ? Object.keys(e) : []);
					}
				}
			}
		} catch(_) {}

		const collections = parseCollectionsParam(req.query.collections, (JSON.parse(req.query.user_boletines || '[]') || []));
		const expandedCollections = Array.from(new Set(expandCollectionsWithTest(collections.length ? collections : ['BOE']).filter(n => !String(n).toLowerCase().endsWith('_test'))));
		const startDate = parseDateISO(req.query.desde);
		const endDate = parseDateISO(req.query.hasta);
		const rangoStr = req.query.rango || '';
		const etiquetasStr = req.query.etiquetas || '';
		// Prioridad a etiquetas explícitas desde la query
		if (etiquetasStr) selectedEtiquetas = etiquetasStr.split('||').map(s => s.trim()).filter(Boolean);
		// Si aún vacío, intentar derivarlas desde el doc base (empresa) usando primer targetUserId
		if (selectedEtiquetas.length === 0) {
			try {
				const baseId = targetUserIds[0];
				const baseObjId = baseId.match(/^[a-fA-F0-9]{24}$/) ? new ObjectId(baseId) : null;
				if (baseObjId) {
					const baseDoc = await usersCollection.findOne({ _id: baseObjId }, { projection: { etiquetas_personalizadas: 1 } });
					const etiquetas = baseDoc?.etiquetas_personalizadas || {};
					if (Array.isArray(etiquetas)) selectedEtiquetas = etiquetas; else if (etiquetas && typeof etiquetas === 'object') selectedEtiquetas = Object.keys(etiquetas);
				}
			} catch(_) { selectedEtiquetas = []; }
		}

		// Si no hay etiquetas a usar, devolver respuesta coherente con /data
		if (selectedEtiquetas.length === 0) {
			const pageSize = Math.max(1, Math.min(parseInt(req.query.pageSize || '25', 10) || 25, 100));
			return res.json({
				success: true,
				documentsHtml: `<div class="no-results" style="color: #04db8d; font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Por favor, selecciona al menos un agente para realizar la búsqueda.</div>`,
				hideAnalyticsLabels: true,
				monthsForChart: [], countsForChart: [], dailyLabels: [], dailyCounts: [], impactCounts: { alto: 0, medio: 0, bajo: 0 }, totalAlerts: 0, avgAlertsPerDay: 0,
				pagination: { page: 1, pageSize, total: 0, totalPages: 1 }
			});
		}

		let selectedRangos = [];
		if (rangoStr.trim() !== '') selectedRangos = rangoStr.split('||').map(s => s.trim()).filter(Boolean);
		const etiquetasQuery = buildEtiquetasQueryForIds(Array.isArray(selectedEtiquetas) ? selectedEtiquetas : [], targetUserIds);

		const query = { $and: [] };
		if (startDate || endDate) {
			if (startDate) {
				query.$and.push({ $or: [ { anio: { $gt: startDate.getFullYear() } }, { anio: startDate.getFullYear(), mes: { $gt: startDate.getMonth() + 1 } }, { anio: startDate.getFullYear(), mes: startDate.getMonth() + 1, dia: { $gte: startDate.getDate() } } ] });
			}
			if (endDate) {
				query.$and.push({ $or: [ { anio: { $lt: endDate.getFullYear() } }, { anio: endDate.getFullYear(), mes: { $lt: endDate.getMonth() + 1 } }, { anio: endDate.getFullYear(), mes: endDate.getMonth() + 1, dia: { $lte: endDate.getDate() } } ] });
			}
		}
		if (selectedRangos.length > 0) query.$and.push({ rango_titulo: { $in: selectedRangos } });
		if (Object.keys(etiquetasQuery).length > 0) {
			query.$and.push(etiquetasQuery);
		}
		if (query.$and.length === 0) delete query.$and;

		console.log('[internal/data] params:', {
			userId: targetUserId,
			targetUserIds,
			collections: expandedCollections,
			selectedEtiquetasCount: selectedEtiquetas.length,
			selectedRangosCount: selectedRangos.length,
			start: startDate,
			end: endDate
		});

		const projection = { short_name: 1, resumen: 1, dia: 1, mes: 1, anio: 1, url_pdf: 1, url_html: 1, rango_titulo: 1, etiquetas_personalizadas: 1, _id: 1 };
		const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
		const pageSize = Math.max(1, Math.min(parseInt(req.query.pageSize || '25', 10) || 25, 100));

		const dataQueryPromises = expandedCollections.map(async (cName) => {
			try {
				const exists = await collectionExists(database, cName);
				if (!exists) return [];
				const coll = database.collection(cName);
				const docs = await coll.find(query)
					.project(projection)
					.sort({ anio: -1, mes: -1, dia: -1 })
					.limit(500)
					.toArray();
				docs.forEach(d => { d.collectionName = cName; });
				return docs;
			} catch (error) {
				console.error('[internal] data query error', cName, error.message);
				return [];
			}
		});
		const allResults = (await Promise.all(dataQueryPromises)).flat();
		allResults.sort((a, b) => (new Date(a.anio, a.mes - 1, a.dia)) - (new Date(b.anio, b.mes - 1, b.dia)) < 0 ? 1 : -1);
		console.log('[internal/data] results fetched:', allResults.length);

		// Obtener eliminaciones desde Feedback para el usuario seleccionado y, si aplica, su estructura de empresa
		let deletedKeysSet = new Set();
		try {
			const feedbackCol = database.collection('Feedback');
			const deletionScope = Array.from(new Set([ String(targetUserId), ...targetUserIds.map(String) ]));
			const delRows = await feedbackCol.find(
				{ content_evaluated: 'doc_eliminado', deleted_from: { $in: deletionScope } },
				{ projection: { doc_id: 1, coleccion: 1, collection_name: 1 } }
			).toArray();
			for (const r of delRows) {
				const coll = r.coleccion || r.collection_name;
				const did = r.doc_id != null ? String(r.doc_id) : '';
				if (coll && did) deletedKeysSet.add(`${coll}|${did}`);
			}
		} catch (e) {
			console.error('[internal/data] error fetching Feedback deletions:', e.message);
		}

		// Post-filter by etiquetas across any targetUserId (replica de profile) y excluir eliminados
		const etiquetasForMatch = Array.isArray(selectedEtiquetas) ? selectedEtiquetas.map(e => String(e).toLowerCase()) : [];
		const filteredResults = [];
		for (const doc of allResults) {
			// Excluir documentos eliminados por Feedback (alcance: user seleccionado y su empresa si aplica)
			const delKey = `${doc.collectionName}|${String(doc._id)}`;
			const isDeleted = deletedKeysSet.has(delKey);
			if (isDeleted) continue;
			let hasEtiquetasMatch = false; let matchedEtiquetas = [];
			let hasAnyForTarget = false;
			if (doc.etiquetas_personalizadas) {
				for (const tid of targetUserIds) {
					const userEtiquetas = doc.etiquetas_personalizadas[tid];
					if (!userEtiquetas) continue;
					if (Array.isArray(userEtiquetas)) {
						if (userEtiquetas.length > 0) hasAnyForTarget = true;
						const etiquetasCoincidentes = etiquetasForMatch.length ? userEtiquetas.filter(et => etiquetasForMatch.includes(String(et).toLowerCase())) : [];
						if (etiquetasCoincidentes.length > 0) { hasEtiquetasMatch = true; matchedEtiquetas = etiquetasCoincidentes; break; }
					} else if (typeof userEtiquetas === 'object' && userEtiquetas !== null) {
						const keys = Object.keys(userEtiquetas);
						if (keys.length > 0) hasAnyForTarget = true;
						const etiquetasCoincidentes = etiquetasForMatch.length ? keys.filter(et => etiquetasForMatch.includes(String(et).toLowerCase())) : [];
						if (etiquetasCoincidentes.length > 0) { hasEtiquetasMatch = true; matchedEtiquetas = etiquetasCoincidentes; break; }
					}
				}
			}
			// Igual que /data: solo incluir si hay match real con etiquetas seleccionadas
			const include = hasEtiquetasMatch;
			if (include) {
				if (matchedEtiquetas.length) doc.matched_etiquetas = [...new Set(matchedEtiquetas)];
				filteredResults.push(doc);
			}
		}
		console.log('[internal/data] filtered by etiquetas:', filteredResults.length);

		// Build daily aggregation for chart over filtered
		const dailyMap = {};
		for (const d of filteredResults) {
			const key = `${d.anio}-${String(d.mes).padStart(2,'0')}-${String(d.dia).padStart(2,'0')}`;
			dailyMap[key] = (dailyMap[key] || 0) + 1;
		}
		const dailyLabels = Object.keys(dailyMap).sort();
		const dailyCounts = dailyLabels.map(k => dailyMap[k]);
		// Monthly aggregations for compatibility
		const monthMap = {};
		for (const key of dailyLabels) {
			const [y, m] = key.split('-');
			const mk = `${y}-${m}`;
			monthMap[mk] = (monthMap[mk] || 0) + (dailyMap[key] || 0);
		}
		const sortedMonthsKeys = Object.keys(monthMap).sort();
		const monthsForChart = sortedMonthsKeys.map(mk => { const [yy, mm] = mk.split('-'); const name = new Date(parseInt(yy), parseInt(mm)-1, 1).toLocaleString('es-ES', { month: 'long' }); return `${name} ${yy}`; });
		const countsForChart = sortedMonthsKeys.map(mk => monthMap[mk]);

		// Impact counts by nivel_impacto across matched etiquetas
		const impactCounts = { alto: 0, medio: 0, bajo: 0 };
		for (const doc of filteredResults) {
			let userEtiq = null;
			if (doc.etiquetas_personalizadas) {
				for (const tid of targetUserIds) {
					const val = doc.etiquetas_personalizadas[tid];
					if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length) { userEtiq = val; break; }
				}
			}
			let level = '';
			if (userEtiq && typeof userEtiq === 'object' && !Array.isArray(userEtiq)) {
				const keys = Object.keys(userEtiq);
				let hasAlto=false, hasMedio=false, hasBajo=false;
				for (const et of keys) {
					const data = userEtiq[et];
					if (data && typeof data === 'object') {
						const n = String(data.nivel_impacto || '').toLowerCase();
						if (n==='alto') hasAlto=true; else if (n==='medio') hasMedio=true; else if (n==='bajo') hasBajo=true;
					}
				}
				if (hasAlto) level='alto'; else if (hasMedio) level='medio'; else if (hasBajo) level='bajo';
			}
			if (!level) level='bajo';
			impactCounts[level] = (impactCounts[level]||0)+1;
		}

		// Pagination over filtered docs
		const totalFiltered = filteredResults.length;
		const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
		const safePage = Math.min(page, totalPages);
		const startIndex = (safePage - 1) * pageSize;
		const endIndex = Math.min(startIndex + pageSize, totalFiltered);
		const pageDocuments = filteredResults.slice(startIndex, endIndex);

		// Build documents HTML (internal variant)
		const documentsHtml = pageDocuments.map(doc => {
			const rangoToShow = doc.rango_titulo || 'Indefinido';
			// Compute etiquetas to display (names only)
			let etiquetasParaMostrar = [];
			if (doc.etiquetas_personalizadas) {
				for (const tid of targetUserIds) {
					const val = doc.etiquetas_personalizadas[tid];
					if (Array.isArray(val) && val.length) { etiquetasParaMostrar = val; break; }
					if (val && typeof val === 'object' && Object.keys(val).length) { etiquetasParaMostrar = Object.keys(val); break; }
				}
			}
			const etiquetasHtml = etiquetasParaMostrar.length ? `<div class="etiquetas-personalizadas-values">${etiquetasParaMostrar.map(et => `<span class="etiqueta-personalizada-value">${et}</span>`).join(' ')}</div>` : '';

			const impactoAgentesHtml = (() => {
				if (!doc.etiquetas_personalizadas) return '';
				let userEtiquetas = null;
				for (const tid of targetUserIds) {
					const val = doc.etiquetas_personalizadas[tid];
					if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length) { userEtiquetas = val; break; }
				}
				if (!userEtiquetas) return '';
				const keys = Object.keys(userEtiquetas);
				if (keys.length === 0) return '';
				return `
				  <div class="impacto-agentes" style="margin-top: 15px; margin-bottom: 15px; padding-left: 15px; border-left: 4px solid #495057; background-color: #45586221;">
					<div style="font-weight: 600;font-size: large; margin-bottom: 10px; color: #0b2431; padding: 5px;">Impacto en agentes</div>
					<div style="padding: 0 5px 10px 5px; font-size: 1.1em; line-height: 1.5;">
					  ${keys.map(etiqueta => {
						const data = userEtiquetas[etiqueta];
						let explicacion = '';
						let nivelImpacto = '';
						if (typeof data === 'string') { explicacion = data; }
						else if (typeof data === 'object' && data !== null) { explicacion = data.explicacion || ''; nivelImpacto = data.nivel_impacto || ''; }
						let nivelTag = '';
						if (nivelImpacto) {
							let bgColor = '#f8f9fa'; let textColor = '#6c757d';
							switch (String(nivelImpacto).toLowerCase()) { case 'alto': bgColor = '#ffe6e6'; textColor = '#d32f2f'; break; case 'medio': bgColor = '#fff3cd'; textColor = '#856404'; break; case 'bajo': bgColor = '#d4edda'; textColor = '#155724'; break; }
							nivelTag = `<span style="background-color: ${bgColor}; color: ${textColor}; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; font-weight: 500; margin-left: 8px;">${nivelImpacto}</span>`;
						}
						return `<div style="margin-bottom: 12px; display: flex; align-items: baseline;"><svg width="16" height="16" viewBox="0 0 24 24" style="color: #0b2431; margin-right: 10px; flex-shrink: 0;"><path fill="currentColor" d="M10.5 17.5l7.5-7.5-7.5-7.5-1.5 1.5L15 10l-6 6z"></path></svg><div style="flex: 1;"><span style="font-weight: 600;">${etiqueta}</span>${nivelTag}<div style="margin-top: 4px; color: #555;">${explicacion}</div></div></div>`;
					}).join('')}
					</div>
				  </div>`;
			})();

			const matchedAttr = Array.isArray(doc.matched_etiquetas) && doc.matched_etiquetas.length ? ` data-matched="${doc.matched_etiquetas.map(e=>String(e)).join('|')}"` : '';
			return `
			  <div class="data-item" data-doc-id="${doc._id}" data-collection="${doc.collectionName}"${matchedAttr}> 
				<div class="header-row"> 
				  <div class="id-values">${doc.short_name} <i class="fas fa-clipboard-check" style="margin-left:8px;color:#0b2431;opacity:.8;"></i></div>
				  <button class="internal-trash" title="Eliminar para seguimiento" style="margin-left:auto; background:transparent; border:none; cursor:pointer; color:#d32f2f;">
					<i class="fas fa-trash"></i>
				  </button>
				  <span class="date"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span>
				</div>
				<div style="color: gray; font-size: 1.1em; margin-bottom: 6px;">${rangoToShow} | ${doc.collectionName}</div>
				${etiquetasHtml}
				<div class="resumen-label">Resumen</div>
				<div class="resumen-content" style="font-size: 1.1em; line-height: 1.4;">${doc.resumen}</div>
				${impactoAgentesHtml}
				${doc.url_pdf || doc.url_html ? `<a class="leer-mas" href="${doc.url_pdf || doc.url_html}" target="_blank" style="margin-right: 15px;">Leer más: ${doc._id}</a>` : `<span class="leer-mas" style="margin-right: 15px; color: #ccc;">Leer más: ${doc._id} (No disponible)</span>`}
				<span class="doc-seccion" style="display:none;">Disposiciones generales</span>
				<span class="doc-rango" style="display:none;">${rangoToShow}</span>
			  </div>`;
		}).join('');

		console.log('[internal/data] sending:', { total: totalFiltered, page: safePage, pageSize, dailyLabels: dailyLabels.length });
		return res.json({ success: true, documentsHtml, hideAnalyticsLabels: false, monthsForChart, countsForChart, dailyLabels, dailyCounts, impactCounts, totalAlerts: filteredResults.length, avgAlertsPerDay: (dailyCounts.reduce((a,b)=>a+b,0) / Math.max(1, dailyLabels.length)), pagination: { page: safePage, pageSize, total: totalFiltered, totalPages } });
	} catch (err) {
		console.error('[internal] /api/internal/data error:', err);
		return res.status(500).json({ success: false, error: 'Error interno del servidor' });
	} finally {
		await client.close();
	}
});

// ------------------------------
// User boletines (coverage) for filters
// ------------------------------
router.get('/api/internal/user-boletines', ensureAuthenticated, async (req, res) => {
    if (req.user?.email !== 'tomas@reversa.ai') {
        return res.status(403).json({ success: false, error: 'No autorizado' });
    }
	const userId = String(req.query.userId || '').trim();
	if (!userId) return res.status(400).json({ success: false, error: 'Parámetro requerido: userId' });
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const db = client.db('papyrus');
		const usersCollection = db.collection('users');
		const isObjId = /^[a-fA-F0-9]{24}$/.test(userId);
		const targetId = isObjId ? new ObjectId(userId) : null;
		let boletines = [];
		if (targetId) {
			const userDoc = await usersCollection.findOne({ _id: targetId }, { projection: { tipo_cuenta: 1, estructura_empresa_id: 1, cobertura_legal: 1, empresa: 1, empresa_name: 1 } });
			let coberturaSource = userDoc?.cobertura_legal || {};
			// Regla: si es usuario enterprise (tipo_cuenta == 'empresa' con estructura_empresa_id), cargar cobertura de la estructura_empresa
			if (userDoc) {
				if (userDoc.estructura_empresa_id) {
					const empresaDoc = await usersCollection.findOne({ _id: userDoc.estructura_empresa_id }, { projection: { cobertura_legal: 1 } });
					if (empresaDoc?.cobertura_legal) coberturaSource = empresaDoc.cobertura_legal;
				} else if (userDoc.tipo_cuenta === 'empresa') {
					// Podría ser el doc de empresa en sí; usar su propia cobertura si la tiene
					coberturaSource = userDoc.cobertura_legal || {};
				}
				// Fallback adicional: intentar localizar empresa por campo 'empresa' si no se encontró estructura
				if ((!coberturaSource || Object.keys(coberturaSource).length === 0) && (userDoc.empresa || userDoc.empresa_name)) {
					const empName = userDoc.empresa || userDoc.empresa_name;
					const empresaDocByName = await usersCollection.findOne({ tipo_cuenta: 'empresa', $or: [ { empresa: empName }, { empresa_name: empName } ] }, { projection: { cobertura_legal: 1 } });
					if (empresaDocByName?.cobertura_legal) coberturaSource = empresaDocByName.cobertura_legal;
				}
			}
			const fuentesGobierno = coberturaSource?.['fuentes-gobierno'] || coberturaSource?.fuentes_gobierno || coberturaSource?.fuentes || [];
			if (Array.isArray(fuentesGobierno) && fuentesGobierno.length) boletines = boletines.concat(fuentesGobierno);
			const fuentesReguladores = coberturaSource?.['fuentes-reguladores'] || coberturaSource?.fuentes_reguladores || coberturaSource?.['fuentes-regulador'] || coberturaSource?.reguladores || [];
			if (Array.isArray(fuentesReguladores) && fuentesReguladores.length) boletines = boletines.concat(fuentesReguladores);
		}
		boletines = (boletines.length ? boletines : ['BOE']).map(b => String(b).toUpperCase());
		return res.json({ success: true, boletines });
	} catch (e) {
		console.error('[internal] user-boletines error:', e);
		return res.status(500).json({ success: false, error: 'Error obteniendo fuentes del usuario' });
	} finally {
		await client.close();
	}
});

// ------------------------------
// User rangos (same source as /profile -> user.rangos). If empty, frontend must not filter by rango
// ------------------------------
router.get('/api/internal/user-rangos', ensureAuthenticated, async (req, res) => {
    if (req.user?.email !== 'tomas@reversa.ai') {
        return res.status(403).json({ success: false, error: 'No autorizado' });
    }
    const userId = String(req.query.userId || '').trim();
    if (!userId) return res.status(400).json({ success: false, error: 'Parámetro requerido: userId' });
    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');
        const isObjId = /^[a-fA-F0-9]{24}$/.test(userId);
        const targetId = isObjId ? new ObjectId(userId) : null;
        let rangos = [];
        if (targetId) {
            const userDoc = await usersCollection.findOne({ _id: targetId }, { projection: { tipo_cuenta: 1, estructura_empresa_id: 1, rangos: 1, cobertura_legal: 1, empresa: 1, empresa_name: 1 } });
            // 1) Partir de los rangos definidos en el usuario si existen
            if (Array.isArray(userDoc?.rangos)) rangos = userDoc.rangos.filter(Boolean);

            // 2) Ampliar con todos los valores posibles de rango_titulo en colecciones de cobertura del usuario
            try {
                // Derivar cobertura (igual que en /api/internal/user-boletines)
                let coberturaSource = userDoc?.cobertura_legal || {};
                if (userDoc?.estructura_empresa_id) {
                    const empresaDoc = await usersCollection.findOne({ _id: userDoc.estructura_empresa_id }, { projection: { cobertura_legal: 1 } });
                    if (empresaDoc?.cobertura_legal) coberturaSource = empresaDoc.cobertura_legal;
                } else if (userDoc?.tipo_cuenta === 'empresa') {
                    coberturaSource = userDoc.cobertura_legal || {};
                } else if ((!coberturaSource || Object.keys(coberturaSource).length === 0) && (userDoc?.empresa || userDoc?.empresa_name)) {
                    const empName = userDoc.empresa || userDoc.empresa_name;
                    const empresaDocByName = await usersCollection.findOne({ tipo_cuenta: 'empresa', $or: [ { empresa: empName }, { empresa_name: empName } ] }, { projection: { cobertura_legal: 1 } });
                    if (empresaDocByName?.cobertura_legal) coberturaSource = empresaDocByName.cobertura_legal;
                }
                let boletines = [];
                const fuentesGobierno = coberturaSource?.['fuentes-gobierno'] || coberturaSource?.fuentes_gobierno || coberturaSource?.fuentes || [];
                if (Array.isArray(fuentesGobierno) && fuentesGobierno.length) boletines = boletines.concat(fuentesGobierno);
                const fuentesReguladores = coberturaSource?.['fuentes-reguladores'] || coberturaSource?.fuentes_reguladores || coberturaSource?.['fuentes-regulador'] || coberturaSource?.reguladores || [];
                if (Array.isArray(fuentesReguladores) && fuentesReguladores.length) boletines = boletines.concat(fuentesReguladores);
                if (!boletines.length) boletines = ['BOE'];

                const expanded = expandCollectionsWithTest(boletines).filter(n => !String(n).toLowerCase().endsWith('_test'));
                const set = new Set(rangos.map(String));
                for (const cName of expanded) {
                    try {
                        const exists = await collectionExists(db, cName);
                        if (!exists) continue;
                        const values = await db.collection(cName).distinct('rango_titulo', {});
                        (values || []).forEach(v => { if (v) set.add(String(v)); });
                    } catch(_) { /* ignore per collection */ }
                }
                // Asegurar inclusión de 'Otras'
                set.add('Otras');
                rangos = Array.from(set);
            } catch(_) { /* ignore */ }
        }
        // Orden básico: 'Otras' al final
        const cleaned = Array.from(new Set(rangos.filter(Boolean).map(String)));
        const withoutOtras = cleaned.filter(r => r.toLowerCase() !== 'otras');
        const finalRangos = withoutOtras.sort((a,b)=> a.localeCompare(b, 'es'));
        if (!cleaned.some(r => r.toLowerCase() === 'otras')) finalRangos.push('Otras'); else finalRangos.push('Otras');
        console.log('[internal/user-rangos] rangos count:', finalRangos.length);
        return res.json({ success: true, rangos: finalRangos });
    } catch (e) {
        console.error('[internal] user-rangos error:', e);
        return res.status(500).json({ success: false, error: 'Error obteniendo rangos del usuario' });
    } finally {
        await client.close();
    }
});

// ------------------------------
// User etiquetas (agentes) for internal filters
// ------------------------------
router.get('/api/internal/user-etiquetas', ensureAuthenticated, async (req, res) => {
    if (req.user?.email !== 'tomas@reversa.ai') {
        return res.status(403).json({ success: false, error: 'No autorizado' });
    }
    const userId = String(req.query.userId || '').trim();
    if (!userId) return res.status(400).json({ success: false, error: 'Parámetro requerido: userId' });
    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');
        const isObjId = /^[a-fA-F0-9]{24}$/.test(userId);
        const targetId = isObjId ? new ObjectId(userId) : null;
        let etiquetas = [];
        if (targetId) {
            const userDoc = await usersCollection.findOne(
                { _id: targetId },
                { projection: { email: 1, tipo_cuenta: 1, estructura_empresa_id: 1, empresa: 1, empresa_name: 1, etiquetas_personalizadas: 1, etiquetas_personalizadas_seleccionadas: 1 } }
            );
            if (userDoc) {
                // 1) Empleado enterprise: preferir seleccionadas del empleado; fallback etiquetas de empresa
                if (userDoc.estructura_empresa_id) {
                    if (Array.isArray(userDoc.etiquetas_personalizadas_seleccionadas) && userDoc.etiquetas_personalizadas_seleccionadas.length > 0) {
                        etiquetas = userDoc.etiquetas_personalizadas_seleccionadas;
                    } else {
                        try {
                            const empId = userDoc.estructura_empresa_id instanceof ObjectId ? userDoc.estructura_empresa_id : new ObjectId(String(userDoc.estructura_empresa_id));
                            const empDoc = await usersCollection.findOne({ _id: empId }, { projection: { etiquetas_personalizadas: 1 } });
                            const e = empDoc?.etiquetas_personalizadas || {};
                            etiquetas = Array.isArray(e) ? e : (typeof e === 'object' ? Object.keys(e) : []);
                        } catch(_) {}
                    }
                }
                // 2) Doc de empresa: usar sus etiquetas
                else if (!userDoc.email && userDoc.tipo_cuenta === 'empresa') {
                    const e = userDoc?.etiquetas_personalizadas || {};
                    etiquetas = Array.isArray(e) ? e : (typeof e === 'object' ? Object.keys(e) : []);
                }
                // 3) Fallback por nombre de empresa
                else if (userDoc.empresa || userDoc.empresa_name) {
                    try {
                        const empDoc = await usersCollection.findOne(
                            { tipo_cuenta: 'empresa', $or: [ { empresa: userDoc.empresa }, { empresa_name: userDoc.empresa_name } ] },
                            { projection: { etiquetas_personalizadas: 1 } }
                        );
                        const e = empDoc?.etiquetas_personalizadas || {};
                        etiquetas = Array.isArray(e) ? e : (typeof e === 'object' ? Object.keys(e) : []);
                    } catch(_) {}
                }
                // 4) Individual u otros: usar sus propias etiquetas si existen
                if (!Array.isArray(etiquetas) || etiquetas.length === 0) {
                    const e = userDoc?.etiquetas_personalizadas || {};
                    etiquetas = Array.isArray(e) ? e : (typeof e === 'object' ? Object.keys(e) : []);
                }
            }
        }
        // Orden alfabético, único
        etiquetas = Array.from(new Set((etiquetas || []).filter(Boolean).map(String))).sort((a,b)=> a.localeCompare(b, 'es'));
        return res.json({ success: true, etiquetas });
    } catch (e) {
        console.error('[internal] user-etiquetas error:', e);
        return res.status(500).json({ success: false, error: 'Error obteniendo agentes del usuario' });
    } finally {
        await client.close();
    }
});

module.exports = router; 

// ---------------------------------------------
// Crear registro de eliminación en Feedback
// ---------------------------------------------
router.post('/api/internal/delete-document', ensureAuthenticated, async (req, res) => {
    if (req.user?.email !== 'tomas@reversa.ai') {
        return res.status(403).json({ success: false, error: 'No autorizado' });
    }
    const { coleccion, doc_id, reason_delete, etiquetas_personalizadas_match, deleted_from } = req.body || {};
    if (!coleccion || !doc_id) {
        return res.status(400).json({ success: false, error: 'Parámetros requeridos: coleccion, doc_id' });
    }
    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const feedbackCol = db.collection('Feedback');
        const now = new Date();
        const dia = String(now.getDate()).padStart(2, '0');
        const mes = String(now.getMonth() + 1).padStart(2, '0');
        const anio = now.getFullYear();
        const fecha = `${dia}-${mes}-${anio}`;
        const doc = {
            content_evaluated: 'doc_eliminado',
            created_at: now,
            updated_at: now,
            fecha,
            user_id: req.user?._id || null,
            user_email: req.user?.email || null,
            deleted_from: String(deleted_from || req.user?._id || ''),
            coleccion: String(coleccion),
            doc_id: String(doc_id),
            reason_delete: String(reason_delete || ''),
            etiquetas_personalizadas_match: Array.isArray(etiquetas_personalizadas_match) ? etiquetas_personalizadas_match : []
        };
        await feedbackCol.insertOne(doc);
        return res.json({ success: true });
    } catch (e) {
        console.error('[internal] delete-document error:', e);
        return res.status(500).json({ success: false, error: 'Error guardando eliminación' });
    } finally {
        await client.close();
    }
});