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
		const details = objectIds.length ? await usersColl.find({ _id: { $in: objectIds } }, { projection: { email: 1, tipo_cuenta: 1, empresa_name: 1, empresa_domain: 1 } }).toArray() : [];
		const byId = new Map(details.map(d => [String(d._id), d]));
		const items = ids.map(id => {
			const s = String(id);
			const d = byId.get(s) || null;
			return {
				userId: s,
				email: d?.email || null,
				tipo_cuenta: d?.tipo_cuenta || null,
				isEmpresa: d?.tipo_cuenta === 'empresa',
				displayName: d?.tipo_cuenta === 'empresa' ? (d?.empresa_name || d?.empresa_domain || 'Empresa') : (d?.email || s)
			};
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
		const expanded = expandCollectionsWithTest(collections);
		const countsMap = new Map(); // userId -> count

		for (const cName of expanded) {
			try {
				const exists = await collectionExists(db, cName);
				if (!exists) continue;
				const pipeline = [];
				if (dateFilter.length) pipeline.push({ $match: { $and: dateFilter } });
				pipeline.push(
					{ $project: { ep: { $objectToArray: "$etiquetas_personalizadas" } } },
					{ $unwind: "$ep" },
					{ $group: { _id: "$ep.k", matches: { $sum: 1 } } }
				);
				const rows = await db.collection(cName).aggregate(pipeline).toArray();
				for (const r of rows) {
					const k = String(r._id);
					countsMap.set(k, (countsMap.get(k) || 0) + (r.matches || 0));
				}
			} catch (e) {
				console.error('[internal] ranking aggregation error', cName, e.message);
			}
		}

		// Build result array with user details
		const allIds = Array.from(countsMap.keys());
		const objIds = allIds.map(id => (id.match(/^[a-fA-F0-9]{24}$/) ? new ObjectId(id) : null)).filter(Boolean);
		const details = objIds.length ? await usersColl.find({ _id: { $in: objIds } }, { projection: { email: 1, tipo_cuenta: 1, empresa_name: 1, empresa_domain: 1 } }).toArray() : [];
		const detailsById = new Map(details.map(d => [String(d._id), d]));

		let items = allIds.map(id => {
			const d = detailsById.get(String(id));
			const tipo = d?.tipo_cuenta || 'individual';
			return {
				userId: String(id),
				matches: countsMap.get(String(id)) || 0,
				email: d?.email || null,
				tipo_cuenta: tipo,
				isEmpresa: tipo === 'empresa',
				displayName: tipo === 'empresa' ? (d?.empresa_name || d?.empresa_domain || 'Empresa') : (d?.email || String(id)),
				empresa: tipo === 'empresa' ? (d?.empresa_name || d?.empresa_domain || 'Empresa') : null
			};
		});

		items.sort((a, b) => b.matches - a.matches);
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
		try {
			const maybeObjId = targetUserId.match(/^[a-fA-F0-9]{24}$/) ? new ObjectId(targetUserId) : null;
			if (maybeObjId) {
				const userDoc = await usersCollection.findOne({ _id: maybeObjId }, { projection: { tipo_cuenta: 1, estructura_empresa_id: 1, legacy_user_ids: 1, etiquetas_personalizadas: 1 } });
				if (userDoc) {
					if (userDoc.tipo_cuenta === 'empresa') {
						const legacy = Array.isArray(userDoc.legacy_user_ids) ? userDoc.legacy_user_ids.map(String) : [];
						targetUserIds = [targetUserId, ...legacy];
					} else if (userDoc.estructura_empresa_id) {
						// Para usuarios individuales dentro de empresa, usar el id de la empresa + legacy ids
						const empresaId = userDoc.estructura_empresa_id instanceof ObjectId ? userDoc.estructura_empresa_id : new ObjectId(String(userDoc.estructura_empresa_id));
						let legacy = [];
						try {
							const empresaDoc = await usersCollection.findOne({ _id: empresaId }, { projection: { legacy_user_ids: 1 } });
							legacy = Array.isArray(empresaDoc?.legacy_user_ids) ? empresaDoc.legacy_user_ids.map(String) : [];
						} catch(_) { legacy = []; }
						targetUserIds = [String(empresaId), ...legacy];
					}
					// Derivar etiquetas por defecto del propio doc si existen
					let etiquetas = userDoc?.etiquetas_personalizadas || {};
					if (Array.isArray(etiquetas)) selectedEtiquetas = etiquetas; else if (etiquetas && typeof etiquetas === 'object') selectedEtiquetas = Object.keys(etiquetas);
				}
			}
		} catch(_) {}

		const collections = parseCollectionsParam(req.query.collections, (JSON.parse(req.query.user_boletines || '[]') || []));
		const expandedCollections = expandCollectionsWithTest(collections.length ? collections : ['BOE']);
		const startDate = parseDateISO(req.query.desde);
		const endDate = parseDateISO(req.query.hasta);
		const rangoStr = req.query.rango || '';
		const etiquetasStr = req.query.etiquetas || '';
		// Prioridad a etiquetas explícitas desde la query
		if (etiquetasStr) selectedEtiquetas = etiquetasStr.split('||').map(s => s.trim()).filter(Boolean);
		// Si aún vacío y el usuario pertenece a empresa, intentar derivarlas desde el doc de empresa
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
		if (Object.keys(etiquetasQuery).length > 0) query.$and.push(etiquetasQuery);
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

		// Post-filter by etiquetas across any targetUserId (replica de profile)
		const etiquetasForMatch = Array.isArray(selectedEtiquetas) ? selectedEtiquetas.map(e => String(e).toLowerCase()) : [];
		const filteredResults = [];
		for (const doc of allResults) {
			let hasEtiquetasMatch = false; let matchedEtiquetas = [];
			if (doc.etiquetas_personalizadas) {
				for (const tid of targetUserIds) {
					const userEtiquetas = doc.etiquetas_personalizadas[tid];
					if (!userEtiquetas) continue;
					if (Array.isArray(userEtiquetas)) {
						const etiquetasCoincidentes = userEtiquetas.filter(et => etiquetasForMatch.includes(String(et).toLowerCase()));
						if (etiquetasCoincidentes.length > 0) { hasEtiquetasMatch = true; matchedEtiquetas = etiquetasCoincidentes; break; }
					} else if (typeof userEtiquetas === 'object' && userEtiquetas !== null) {
						const docEtiquetasKeys = Object.keys(userEtiquetas);
						const etiquetasCoincidentes = docEtiquetasKeys.filter(et => etiquetasForMatch.includes(String(et).toLowerCase()));
						if (etiquetasCoincidentes.length > 0) { hasEtiquetasMatch = true; matchedEtiquetas = etiquetasCoincidentes; break; }
					}
				}
			}
			if (hasEtiquetasMatch || etiquetasForMatch.length === 0) {
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
				  <div class=\"impacto-agentes\" style=\"margin-top: 15px; margin-bottom: 15px; padding-left: 15px; border-left: 4px solid #495057; background-color: #45586221;\">
					<div style=\"font-weight: 600;font-size: large; margin-bottom: 10px; color: #0b2431; padding: 5px;\">Impacto en agentes</div>
					<div style=\"padding: 0 5px 10px 5px; font-size: 1.1em; line-height: 1.5;\">
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
							nivelTag = `<span style=\"background-color: ${bgColor}; color: ${textColor}; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; font-weight: 500; margin-left: 8px;\">${nivelImpacto}</span>`;
						}
						return `<div style=\"margin-bottom: 12px; display: flex; align-items: baseline;\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" style=\"color: #0b2431; margin-right: 10px; flex-shrink: 0;\"><path fill=\"currentColor\" d=\"M10.5 17.5l7.5-7.5-7.5-7.5-1.5 1.5L15 10l-6 6z\"></path></svg><div style=\"flex: 1;\"><span style=\"font-weight: 600;\">${etiqueta}</span>${nivelTag}<div style=\"margin-top: 4px; color: #555;\">${explicacion}</div></div></div>`;
					}).join('')}
					</div>
				  </div>`;
			})();

			return `
			  <div class=\"data-item\"> 
				<div class=\"header-row\"> 
				  <div class=\"id-values\">${doc.short_name} <i class=\"fas fa-clipboard-check\" style=\"margin-left:8px;color:#0b2431;opacity:.8;\"></i></div>
				  <span class=\"date\"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span>
				</div>
				<div style=\"color: gray; font-size: 1.1em; margin-bottom: 6px;\">${rangoToShow} | ${doc.collectionName}</div>
				${etiquetasHtml}
				<div class=\"resumen-label\">Resumen</div>
				<div class=\"resumen-content\" style=\"font-size: 1.1em; line-height: 1.4;\">${doc.resumen}</div>
				${impactoAgentesHtml}
				${doc.url_pdf || doc.url_html ? `<a class=\\"leer-mas\\" href=\\"${doc.url_pdf || doc.url_html}\\" target=\\"_blank\\" style=\\"margin-right: 15px;\\">Leer más: ${doc._id}</a>` : `<span class=\\"leer-mas\\" style=\\"margin-right: 15px; color: #ccc;\\">Leer más: ${doc._id} (No disponible)</span>`}
				<span class=\"doc-seccion\" style=\"display:none;\">Disposiciones generales</span>
				<span class=\"doc-rango\" style=\"display:none;\">${rangoToShow}</span>
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
			const userDoc = await usersCollection.findOne({ _id: targetId }, { projection: { tipo_cuenta: 1, estructura_empresa_id: 1, cobertura_legal: 1 } });
			let coberturaSource = userDoc?.cobertura_legal || {};
			if (userDoc && userDoc.tipo_cuenta !== 'empresa' && userDoc.estructura_empresa_id) {
				const empresaDoc = await usersCollection.findOne({ _id: userDoc.estructura_empresa_id }, { projection: { cobertura_legal: 1 } });
				if (empresaDoc?.cobertura_legal) coberturaSource = empresaDoc.cobertura_legal;
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
            const userDoc = await usersCollection.findOne({ _id: targetId }, { projection: { tipo_cuenta: 1, estructura_empresa_id: 1, rangos: 1 } });
            // Como en profile: usar rangos del usuario (si existen). Si no existen, devolver [] (no filtrar en frontend)
            if (Array.isArray(userDoc?.rangos)) rangos = userDoc.rangos.filter(Boolean);
        }
        console.log('[internal/user-rangos] rangos count:', rangos.length);
        return res.json({ success: true, rangos });
    } catch (e) {
        console.error('[internal] user-rangos error:', e);
        return res.status(500).json({ success: false, error: 'Error obteniendo rangos del usuario' });
    } finally {
        await client.close();
    }
});

module.exports = router; 