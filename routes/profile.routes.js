/*
Routes: Profile dashboard HTML and data endpoints that power the user's panel.
Endpoints:
- GET '/profile' (auth): renders profile.html populated with user info, filters and documents with complete functionality
- GET '/data' (auth): returns filtered documents + stats JSON for the profile views with impact sections and save buttons
- POST '/delete-document' (auth): marks a document as deleted for the user

Features included:
- Complete impact section with nivel_impacto, explanations and feedback thumbs up/down functionality
- Save to lists functionality with dropdown, create new lists, and manage document collections
- Responsive design compatible with tracker view and standard profile view
*/
const express = require('express');
const path = require('path');
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const { getDisplayName } = require('../services/users.service');
const { getEtiquetasPersonalizadasAdapter, buildEtiquetasQuery, getEtiquetasSeleccionadasAdapter } = require('../services/enterprise.service');

const router = express.Router();
const uri = process.env.DB_URI;
const mongodbOptions = {};




// Helpers from services
const { buildDateFilter, expandCollectionsWithTest, collectionExists } = require('../services/db.utils');

// GET /profile (same behavior)
router.get('/profile', ensureAuthenticated, async (req, res) => {
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const database = client.db('papyrus');
		const usersCollection = database.collection('users');

		const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
		const documentosEliminados = user.documentos_eliminados || [];

		let formattedRegDate = '01/04/2025';
		if (user && user.registration_date) {
			try {
				const dateObj = new Date(user.registration_date);
				if (!isNaN(dateObj.getTime())) {
					const day = String(dateObj.getDate()).padStart(2, '0');
					const month = String(dateObj.getMonth() + 1).padStart(2, '0');
					const year = dateObj.getFullYear();
					formattedRegDate = `${day}/${month}/${year}`;
				} else {
					console.warn(`Fecha de registro inválida para el usuario ${user._id}: ${user.registration_date}`);
				}
			} catch (e) {
				console.error(`Error al formatear fecha de registro para usuario ${user._id}:`, e);
			}
		} else {
			console.warn(`No se encontró fecha de registro para el usuario ${user._id}`);
		}

		const userSubRamaMap = user.sub_rama_map || {};
		const userSubIndustriaMap = user.sub_industria_map || {};
		const userIndustries = user.industry_tags || [];
		const userRamas = user.rama_juridicas || [];
		const userRangos = user.rangos || [];
		// ENTERPRISE ADAPTER: Obtener etiquetas según tipo de cuenta (empresa/individual)
		// ENTERPRISE ADAPTER: Usar req.user para resolver etiquetas correctamente en cuentas empresa
		const etiquetasResult = await getEtiquetasPersonalizadasAdapter(req.user);
		const userEtiquetasPersonalizadas = etiquetasResult.etiquetas_personalizadas || {};
		const etiquetasKeys = Array.isArray(userEtiquetasPersonalizadas) ? userEtiquetasPersonalizadas : Object.keys(userEtiquetasPersonalizadas);

		let userBoletines = [];
		// ENTERPRISE ADAPTER: Resolver cobertura_legal desde estructura_empresa si aplica
		let coberturaSource = user.cobertura_legal || {};
		try {
			if (req.user.tipo_cuenta === 'empresa' && req.user.estructura_empresa_id) {
				const estructuraDoc = await database.collection('users').findOne(
					{ _id: new ObjectId(req.user.estructura_empresa_id) },
					{ projection: { cobertura_legal: 1, legacy_user_ids: 1 } }
				);
				if (estructuraDoc && estructuraDoc.cobertura_legal) coberturaSource = estructuraDoc.cobertura_legal;
			}
		} catch (e) { console.error('[profile] Error resolviendo cobertura_legal empresa:', e.message); }
		const fuentesGobierno = coberturaSource?.['fuentes-gobierno'] || coberturaSource?.fuentes_gobierno || coberturaSource?.fuentes || [];
		if (fuentesGobierno.length > 0) userBoletines = userBoletines.concat(fuentesGobierno);
		const fuentesReguladores = coberturaSource?.['fuentes-reguladores'] || coberturaSource?.fuentes_reguladores || coberturaSource?.['fuentes-regulador'] || coberturaSource?.reguladores || [];
		if (fuentesReguladores.length > 0) userBoletines = userBoletines.concat(fuentesReguladores);
		userBoletines = userBoletines.map(b => b.toUpperCase());
		if (userBoletines.length === 0) userBoletines = ['BOE'];

		const now = new Date();
		const defaultStart = new Date(now);
		defaultStart.setDate(defaultStart.getDate() - 7);
		const defaultEnd = now;
		const { etiquetas, boletines, rangos, startDate: queryStartDate, endDate: queryEndDate } = req.query;
		const searchStartDate = queryStartDate ? new Date(queryStartDate) : defaultStart;
		const searchEndDate = queryEndDate ? new Date(queryEndDate) : defaultEnd;
		const formatDateForFrontend = (date) => {
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			return `${year}-${month}-${day}`;
		};
		const searchStartDateFormatted = formatDateForFrontend(searchStartDate);
		const searchEndDateFormatted = formatDateForFrontend(searchEndDate);

		if (etiquetasKeys.length === 0) {
			let profileHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'profile.html'), 'utf8');
			profileHtml = profileHtml
				.replace('<div class="analytics-label">Estadísticas de la búsqueda</div>', '<div class="analytics-label" style="display: none;">Estadísticas de la búsqueda</div>')
				.replace('<div class="analytics-label">Documentos</div>', '<div class="analytics-label" style="display: none;">Documentos</div>')
				.replace('{{name}}', getDisplayName(user.name, user.email))
				.replace('{{email}}', user.email || '')
				.replace('{{subindustria_map_json}}', JSON.stringify(userSubIndustriaMap))
				.replace('{{industry_tags_json}}', JSON.stringify(userIndustries))
				.replace('{{rama_juridicas_json}}', JSON.stringify(userRamas))
				.replace('{{subrama_juridicas_json}}', JSON.stringify(userSubRamaMap))
				.replace('{{boeDocuments}}', `<div class="no-results" style="color: #04db8d; display:none;font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Hemos lanzado una nueva versión del producto para poder personalizar más las alertas del usuario. Por favor, configura de nuevo tu perfil en menos de 5mins.</div>`)
				.replace('{{months_json}}', JSON.stringify([]))
				.replace('{{counts_json}}', JSON.stringify([]))
				.replace('{{subscription_plan}}', JSON.stringify(user.subscription_plan || 'plan1'))
				.replace('{{start_date}}', JSON.stringify((() => { const now = new Date(); const d = new Date(now); d.setDate(d.getDate() - 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()))
				.replace('{{end_date}}', JSON.stringify((() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()))
				.replace('{{user_boletines_json}}', JSON.stringify(userBoletines || []))
				.replace('{{user_rangos_json}}', JSON.stringify(userRangos || []))
				.replace('{{etiquetas_personalizadas_json}}', JSON.stringify(userEtiquetasPersonalizadas))
				.replace('{{registration_date_formatted}}', formattedRegDate);
			return res.send(profileHtml);
		}

		console.log(`[profile] === INICIO PROCESAMIENTO DOCUMENTOS ===`);
		console.log(`[profile] Usuario: ${req.user.email}, Tipo: ${req.user.tipo_cuenta}`);
		console.log(`[profile] Etiquetas disponibles: ${etiquetasKeys.length} - ${etiquetasKeys.slice(0, 3).join(', ')}${etiquetasKeys.length > 3 ? '...' : ''}`);
		console.log(`[profile] Boletines usuario: ${userBoletines.length} - ${userBoletines.join(', ')}`);
		console.log(`[profile] Rangos usuario: ${userRangos.length} - ${userRangos.join(', ')}`);
		
		// ENTERPRISE ADAPTER: Para usuarios enterprise, usar etiquetas seleccionadas si las hay, sino todas las disponibles
		let defaultEtiquetas = etiquetasKeys;
		if (req.user.tipo_cuenta === 'empresa') {
			try {
				const etiquetasSeleccionadasResult = await getEtiquetasSeleccionadasAdapter(req.user);
				const etiquetasSeleccionadas = etiquetasSeleccionadasResult.etiquetas_seleccionadas || [];
				
				// Si hay etiquetas seleccionadas, usarlas; sino usar todas las disponibles
				if (etiquetasSeleccionadas.length > 0) {
					defaultEtiquetas = etiquetasSeleccionadas;
					console.log(`[profile] Usuario empresa: usando ${defaultEtiquetas.length} etiquetas seleccionadas por defecto`);
				} else {
					defaultEtiquetas = etiquetasKeys;
					console.log(`[profile] Usuario empresa: sin etiquetas seleccionadas, usando ${defaultEtiquetas.length} etiquetas disponibles`);
				}
			} catch (error) {
				console.error('[profile] Error obteniendo etiquetas seleccionadas, fallback a todas:', error);
				defaultEtiquetas = etiquetasKeys;
			}
		} else {
			console.log(`[profile] Usuario individual: usando ${defaultEtiquetas.length} etiquetas disponibles`);
		}
		
		const selectedEtiquetas = etiquetas ? JSON.parse(etiquetas) : defaultEtiquetas;
		const selectedBoletines = boletines ? JSON.parse(boletines) : userBoletines;
		const selectedRangos = rangos ? JSON.parse(rangos) : [];
		// Normalizar etiquetas a minúsculas para matching posterior, pero usamos buildEtiquetasQuery para la query
		const etiquetasForMatch = Array.isArray(selectedEtiquetas) ? selectedEtiquetas.map(e => e.toLowerCase()) : [];
		const dateFilter = buildDateFilter(searchStartDate, searchEndDate);
		
		console.log(`[profile] === PARÁMETROS FINALES ===`);
		console.log(`[profile] Etiquetas seleccionadas: ${selectedEtiquetas.length} - ${selectedEtiquetas.slice(0, 3).join(', ')}${selectedEtiquetas.length > 3 ? '...' : ''}`);
		console.log(`[profile] Boletines seleccionados: ${selectedBoletines.length} - ${selectedBoletines.join(', ')}`);
		console.log(`[profile] Rangos seleccionados: ${selectedRangos.length} - ${selectedRangos.join(', ')}`);
		console.log(`[profile] Filtro de fechas: ${JSON.stringify(dateFilter)}`);
		
		// ENTERPRISE ADAPTER: Determinar userId correcto para filtrado
		let targetUserIds;
		if (req.user.tipo_cuenta === 'empresa' && req.user.estructura_empresa_id) {
			let legacyIds = [];
			try {
				const estructuraDoc = await database.collection('users').findOne(
					{ _id: new ObjectId(req.user.estructura_empresa_id) },
					{ projection: { legacy_user_ids: 1 } }
				);
				legacyIds = Array.isArray(estructuraDoc?.legacy_user_ids) ? estructuraDoc.legacy_user_ids.map(String) : [];
			} catch(_){ legacyIds = []; }
			targetUserIds = [req.user.estructura_empresa_id.toString(), ...legacyIds];
		} else {
			targetUserIds = [user._id.toString()];
		}
		
		console.log(`[profile] Target User IDs: ${targetUserIds.join(', ')}`);
		
		// ENTERPRISE ADAPTER: Usar query builder multi-ID para empresa/individual
		const etiquetasQuery = require('../services/enterprise.service').buildEtiquetasQueryForIds(Array.isArray(selectedEtiquetas) ? selectedEtiquetas : [], targetUserIds);
		console.log(`[profile] Etiquetas Query: ${JSON.stringify(etiquetasQuery)}`);
		
		const query = {
			$and: [
				...dateFilter,
				...(selectedRangos.length > 0 ? [{ rango_titulo: { $in: selectedRangos } }] : []),
				...(Object.keys(etiquetasQuery).length > 0 ? [etiquetasQuery] : [])
			]
		};
		
		console.log(`[profile] Query MongoDB final: ${JSON.stringify(query, null, 2)}`);
		
		// Verificar que query no tenga filtros vacíos
		if (query.$and && query.$and.length === 0) {
			delete query.$and;
		}
		console.log(`[profile] Query MongoDB final limpia: ${JSON.stringify(query, null, 2)}`);
		
		const projection = { short_name: 1, divisiones: 1, resumen: 1, dia: 1, mes: 1, anio: 1, url_pdf: 1, url_html: 1, ramas_juridicas: 1, rango_titulo: 1, _id: 1, etiquetas_personalizadas: 1, fecha_publicacion: 1, fecha: 1, datetime_insert: 1 };
		let allDocuments = [];
		const expandedBoletines = expandCollectionsWithTest(selectedBoletines).filter(n => !String(n).toLowerCase().endsWith('_test'));
		
		console.log(`[profile] Colecciones expandidas a consultar: ${expandedBoletines.join(', ')}`);
		console.log(`[profile] === INICIANDO CONSULTAS MONGODB ===`);
		
		// OPTIMIZACIÓN: Usar Promise.all para consultas paralelas y límite de documentos
		const queryPromises = expandedBoletines.map(async (collectionName) => {
			try {
				console.log(`[profile] Verificando existencia de colección: ${collectionName}`);
				const exists = await collectionExists(database, collectionName);
				if (!exists) {
					console.log(`[profile] Colección ${collectionName} no existe, saltando...`);
					return [];
				}
				
				console.log(`[profile] Consultando colección: ${collectionName}`);
				const coll = database.collection(collectionName);
				// Límite de 500 documentos por colección y ordenar por fecha en DB
				const docs = await coll.find(query)
					.project(projection)
					.sort({ anio: -1, mes: -1, dia: -1 })
					.limit(500)
					.toArray();
				
				console.log(`[profile] Colección ${collectionName}: ${docs.length} documentos encontrados`);
				docs.forEach(doc => {
					doc.collectionName = collectionName;
					// Rellenar anio/mes/dia si faltan con la fecha efectiva
					if (!(typeof doc.anio === 'number' && typeof doc.mes === 'number' && typeof doc.dia === 'number')) {
						const eff = doc.fecha_publicacion || doc.fecha || doc.datetime_insert;
						if (eff) {
							const dt = new Date(eff);
							if (!isNaN(dt.getTime())) {
								doc.anio = dt.getUTCFullYear();
								doc.mes = dt.getUTCMonth() + 1;
								doc.dia = dt.getUTCDate();
							}
						}
					}
				});
				return docs;
			} catch (error) {
				console.error(`[profile] Error consultando colección ${collectionName}:`, error.message);
				return [];
			}
		});
		
		console.log(`[profile] === ESPERANDO RESULTADOS DE TODAS LAS CONSULTAS ===`);
		const collectionResults = await Promise.all(queryPromises);
		allDocuments = collectionResults.flat();
		console.log(`[profile] Total documentos encontrados: ${allDocuments.length}`);
		console.log(`[profile] === INICIANDO PROCESAMIENTO Y RENDERIZADO ===`);
		// OPTIMIZACIÓN: Ordenar y filtrar con límite para renderizado más rápido (fallback a fecha_publicacion/fecha/datetime_insert)
		const getEffectiveDateSsr = (doc) => {
			if (typeof doc.anio === 'number' && typeof doc.mes === 'number' && typeof doc.dia === 'number') return new Date(doc.anio, doc.mes - 1, doc.dia);
			const d = doc.fecha_publicacion || doc.fecha || doc.datetime_insert;
			return d ? new Date(d) : new Date(0);
		};
		allDocuments.sort((a, b) => getEffectiveDateSsr(b) - getEffectiveDateSsr(a));
		// Excluir documentos eliminados por Feedback para este usuario (y su empresa si aplica)
		let feedbackDeletedSetSsr = new Set();
		try {
			const feedbackCol = database.collection('Feedback');
			const deletionScope = (() => {
				const ids = new Set([ String(user._id) ]);
				if (req.user && req.user.tipo_cuenta === 'empresa' && req.user.estructura_empresa_id) ids.add(String(req.user.estructura_empresa_id));
				return Array.from(ids);
			})();
			const delRows = await feedbackCol.find(
				{ content_evaluated: 'doc_eliminado', deleted_from: { $in: deletionScope } },
				{ projection: { coleccion: 1, collection_name: 1, doc_id: 1 } }
			).toArray();
			for (const r of delRows) {
				const coll = r.coleccion || r.collection_name;
				const did = r.doc_id != null ? String(r.doc_id) : '';
				if (coll && did) feedbackDeletedSetSsr.add(`${coll}|${did}`);
			}
		} catch(_){ /* ignore feedback deletions errors */ }
		allDocuments = allDocuments.filter(doc => {
			const key = `${doc.collectionName}|${String(doc._id)}`;
			const isFbDel = feedbackDeletedSetSsr.has(key);
			const isUserDel = (documentosEliminados && documentosEliminados.some(d => d.coleccion === doc.collectionName && d.id === doc._id.toString()));
			return !isFbDel && !isUserDel;
		});
		
		// PAGINACIÓN SSR: 25 docs por página, manteniendo estadísticas sobre todo el conjunto
		const totalDocsSsr = allDocuments.length;
		const pageSizeSsr = Math.max(1, Math.min(parseInt(req.query.pageSize || '25', 10) || 25, 100));
		const pageSsrRaw = parseInt(req.query.page || '1', 10);
		const pageSsr = Math.max(1, isNaN(pageSsrRaw) ? 1 : pageSsrRaw);
		const totalPagesSsr = Math.max(1, Math.ceil(totalDocsSsr / pageSizeSsr));
		const safePageSsr = Math.min(pageSsr, totalPagesSsr);
		const startIndexSsr = (safePageSsr - 1) * pageSizeSsr;
		const endIndexSsr = Math.min(startIndexSsr + pageSizeSsr, totalDocsSsr);
		const pageDocsSsr = allDocuments.slice(startIndexSsr, endIndexSsr);

		let documentsHtml;
		let hideAnalyticsLabels = false;
		if (allDocuments.length === 0) {
			// OPTIMIZACIÓN: Evitar consulta adicional costosa, usar aggregation pipeline para count rápido
			const queryWithoutEtiquetas = { $and: [ ...dateFilter ] };
			let totalPages = 0;
			
			const pageCountPromises = expandedBoletines.map(async (collectionName) => {
				try {
					const exists = await collectionExists(database, collectionName);
					if (!exists) return 0;
					const coll = database.collection(collectionName);
					// Usar aggregation para suma rápida
					const result = await coll.aggregate([
						{ $match: queryWithoutEtiquetas },
						{ $group: { _id: null, totalPages: { $sum: "$num_paginas" } } }
					]).toArray();
					return result.length > 0 ? (result[0].totalPages || 0) : 0;
				} catch (error) {
					console.error(`Error counting pages for collection ${collectionName}:`, error.message);
					return 0;
				}
			});
			
			const pageCounts = await Promise.all(pageCountPromises);
			totalPages = pageCounts.reduce((sum, count) => sum + count, 0);
			
			documentsHtml = `<div class="no-results" style="color: #04db8d; font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Puedes estar tranquilo. Tus agentes han analizado ${totalPages} páginas hoy y no hay nada que te afecte.</div>`;
			hideAnalyticsLabels = true;
		} else {
			documentsHtml = pageDocsSsr.map(doc => {
				const rangoToShow = doc.rango_titulo || 'Indefinido';
				const etiquetasPersonalizadasHtml = (() => {
					if (!doc.etiquetas_personalizadas) return '';
					// ENTERPRISE ADAPTER: Usar primer userId con datos
					let userEtiquetas = null;
					for (const tid of targetUserIds) {
						const val = doc.etiquetas_personalizadas ? doc.etiquetas_personalizadas[tid] : null;
						if (!val) continue;
						if (Array.isArray(val) && val.length) { userEtiquetas = val; break; }
						if (typeof val === 'object' && val !== null && Object.keys(val).length) { userEtiquetas = val; break; }
					}
					if (!userEtiquetas) return '';
					let etiquetasParaMostrar = [];
					if (Array.isArray(userEtiquetas)) etiquetasParaMostrar = userEtiquetas; else if (typeof userEtiquetas === 'object') etiquetasParaMostrar = Object.keys(userEtiquetas);
					return `
					  <div class="etiquetas-personalizadas-values">
						${etiquetasParaMostrar.map(etiqueta => `<span class=\"etiqueta-personalizada-value\">${etiqueta}</span>`).join(' ')}
					  </div>
					`;
				})();
				const impactoAgentesHtml = (() => {
					if (!doc.etiquetas_personalizadas) return '';
					// ENTERPRISE ADAPTER: Usar primer userId con objeto de impacto
					let userEtiquetas = null;
					for (const tid of targetUserIds) {
						const val = doc.etiquetas_personalizadas ? doc.etiquetas_personalizadas[tid] : null;
						if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length) { userEtiquetas = val; break; }
					}
					if (!userEtiquetas) return '';
					const etiquetasKeys = Object.keys(userEtiquetas);
					if (etiquetasKeys.length === 0) return '';
					return `
					  <div class=\"impacto-agentes\" style=\"margin-top: 15px; margin-bottom: 15px; padding-left: 15px; border-left: 4px solid #04db8d; background-color: rgba(4, 219, 141, 0.05);\">
						<div style=\"font-weight: 600;font-size: large; margin-bottom: 10px; color: #455862; padding: 5px;\">Impacto en agentes</div>
						<div style=\"padding: 0 5px 10px 5px; font-size: 1.1em; line-height: 1.5;\">
						  ${etiquetasKeys.map(etiqueta => {
							const etiquetaData = userEtiquetas[etiqueta];
							let explicacion = '';
							let nivelImpacto = '';
							if (typeof etiquetaData === 'string') {
								explicacion = etiquetaData;
							} else if (typeof etiquetaData === 'object' && etiquetaData !== null) {
								explicacion = etiquetaData.explicacion || '';
								nivelImpacto = etiquetaData.nivel_impacto || '';
							}
							let nivelTag = '';
							if (nivelImpacto) {
								let bgColor = '#f8f9fa'; let textColor = '#6c757d';
								switch ((nivelImpacto||'').toLowerCase()) { case 'alto': bgColor = '#ffe6e6'; textColor = '#dc3545'; break; case 'medio': bgColor = '#fff3cd'; textColor = '#856404'; break; case 'bajo': bgColor = '#d4edda'; textColor = '#155724'; break; }
								nivelTag = `<span style=\"background-color: ${bgColor}; color: ${textColor}; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; font-weight: 500; margin-left: 8px;\">${nivelImpacto}</span>`;
							}
							const feedbackIcons = nivelImpacto ? `
							  <span style=\"margin-left: 12px; display: inline-flex; align-items: center; gap: 8px;\">
								<i class=\"fa fa-thumbs-up thumb-icon\" onclick=\"sendFeedback('${doc._id}', 'like', this, '${etiqueta}', '${doc.collectionName}', '${doc.url_pdf || doc.url_html || ''}', '${doc.short_name}')\" style=\"cursor: pointer; color: #6c757d; font-size: 0.9em; transition: color 0.2s;\"></i>
								<i class=\"fa fa-thumbs-down thumb-icon\" onclick=\"sendFeedback('${doc._id}', 'dislike', this, '${etiqueta}', '${doc.collectionName}', '${doc.url_pdf || doc.url_html || ''}', '${doc.short_name}')\" style=\"cursor: pointer; color: #6c757d; font-size: 0.9em; transition: color 0.2s;\"></i>
							  </span>
							` : '';
							return `<div style=\"margin-bottom: 12px; display: flex; align-items: baseline;\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" style=\"color: #04db8d; margin-right: 10px; flex-shrink: 0;\"><path fill=\"currentColor\" d=\"M10.5 17.5l7.5-7.5-7.5-7.5-1.5 1.5L15 10l-6 6z\"></path></svg><div style=\"flex: 1;\"><span style=\"font-weight: 600;\">${etiqueta}</span>${nivelTag}${feedbackIcons}<div style=\"margin-top: 4px; color: #555;\">${explicacion}</div></div></div>`;
						}).join('')}
						</div>
					  </div>`;
				})();
				const dateTextSsr = (() => { if (typeof doc.anio === 'number' && typeof doc.mes === 'number' && typeof doc.dia === 'number') return `${doc.dia}/${doc.mes}/${doc.anio}`; const d = doc.fecha_publicacion || doc.fecha || doc.datetime_insert; if (!d) return '-'; const dt = new Date(d); return `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}/${dt.getUTCFullYear()}`; })();
				const datetimeAttrSsr = (() => { const d = doc.fecha_publicacion || doc.fecha || doc.datetime_insert; if (!d) return ''; try { return new Date(d).toISOString(); } catch(_){ return ''; } })();
				return `
				  <div class="data-item">
					<div class="header-row">
					  <div class="id-values">${doc.short_name}</div>
					  <span class="date" data-datetime-insert="${datetimeAttrSsr}"><em>${dateTextSsr}</em></span>
					</div>
					<div style="color: gray; font-size: 1.1em; margin-bottom: 6px;">${rangoToShow} | ${doc.collectionName}</div>
					${etiquetasPersonalizadasHtml}
					<div class="resumen-label">Resumen</div>
					<div class="resumen-content" style="font-size: 1.1em; line-height: 1.4;">${doc.resumen}</div>
					${impactoAgentesHtml}
					<div class="margin-impacto"><a class="button-impacto" href="/profile?view=analisis&documentId=${doc._id}&collectionName=${doc.collectionName}">Analizar documento</a></div>
					${doc.url_pdf || doc.url_html ? `<a class="leer-mas" href="${doc.url_pdf || doc.url_html}" target="_blank" style="margin-right: 15px;">Leer más: ${doc._id}</a>` : `<span class="leer-mas" style="margin-right: 15px; color: #ccc;">Leer más: ${doc._id} (No disponible)</span>`}
					
					<!-- Botón de Guardar -->
					<div class="guardar-button">
					  <button class="save-btn" onclick="toggleListsDropdown(this, '${doc._id}', '${doc.collectionName}')">
						<i class="fas fa-bookmark"></i>
						Guardar
					  </button>
					  <div class="lists-dropdown">
						<div class="lists-dropdown-header">
						  <span>Guardar en...</span>
						  <button class="save-ok-btn" onclick="saveToSelectedLists(this)">OK</button>
						</div>
						<div class="lists-content">
						  <div class="lists-container">
							<!-- Las listas se cargarán dinámicamente -->
						  </div>
						  <div class="add-new-list" onclick="showNewListForm(this)">
							<i class="fas fa-plus"></i>
							Añadir nueva
						  </div>
						  <div class="new-list-form">
							<input type="text" class="new-list-input" placeholder="Nombre de la nueva lista" maxlength="50">
							<div class="new-list-buttons">
							  <button class="new-list-btn cancel" onclick="hideNewListForm(this)">Cancelar</button>
							  <button class="new-list-btn save" onclick="createNewList(this, '${doc._id}', '${doc.collectionName}')">OK</button>
							</div>
						  </div>
						</div>
					  </div>
					</div>
					<span class="doc-seccion" style="display:none;">Disposiciones generales</span>
					<span class="doc-rango" style="display:none;">${rangoToShow}</span>
				  </div>`;
				}).join('');

				// Controles de paginación SSR (abajo a la derecha)
				const buildQuery = (page) => {
					const q = { ...req.query, page: String(page), pageSize: String(pageSizeSsr) };
					const usp = new URLSearchParams();
					for (const [k,v] of Object.entries(q)) { if (v !== undefined && v !== null && v !== '') usp.append(k, v); }
					return `/profile?${usp.toString()}`;
				};
				const prevDisabled = safePageSsr <= 1;
				const nextDisabled = safePageSsr >= totalPagesSsr;
				const paginationHtml = `
				  <div class="pagination-container" style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px;">
					<button class="pagination-btn" ${prevDisabled ? 'disabled' : ''} onclick="location.href='${buildQuery(Math.max(1, safePageSsr-1))}'">◀</button>
					<span class="pagination-info">Página</span>
					<span class="pagination-page">${safePageSsr}</span>
					<span class="pagination-info">de ${totalPagesSsr}</span>
					<button class="pagination-btn" ${nextDisabled ? 'disabled' : ''} onclick="location.href='${buildQuery(Math.min(totalPagesSsr, safePageSsr+1))}'">▶</button>
					<span class=\"pagination-subtle\">${pageSizeSsr} por página</span>
				  </div>`;
				documentsHtml += paginationHtml;
		}

		const documentsByMonth = {};
		allDocuments.forEach(doc => {
			const month = `${doc.anio}-${String(doc.mes).padStart(2, '0')}`;
			if (!documentsByMonth[month]) documentsByMonth[month] = new Set();
			documentsByMonth[month].add(String(doc._id));
		});
		const sortedMonths = Object.keys(documentsByMonth).sort();
		const monthsForChart = sortedMonths.map(m => { const [year, month] = m.split('-'); const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']; return `${monthNames[parseInt(month) - 1]} ${year}`; });
		const countsForChart = sortedMonths.map(m => (documentsByMonth[m] instanceof Set ? documentsByMonth[m].size : documentsByMonth[m]));

		let profileHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'profile.html'), 'utf8');
		if (hideAnalyticsLabels) {
			profileHtml = profileHtml
				.replace('<div class="analytics-label">Estadísticas de la búsqueda</div>', '<div class="analytics-label" style="display: none;">Estadísticas de la búsqueda</div>')
				.replace('<div id="chartContainer">', '<div id="chartContainer" style="display:none;">')
				.replace('<div class="analytics-label">Documentos</div>', '<div class="analytics-label" style="display:none;">Documentos</div>');
		}
		profileHtml = profileHtml
			.replace('{{name}}', getDisplayName(user.name, user.email))
			.replace('{{email}}', user.email || '')
			.replace('{{subindustria_map_json}}', JSON.stringify(userSubIndustriaMap))
			.replace('{{industry_tags_json}}', JSON.stringify(userIndustries))
			.replace('{{rama_juridicas_json}}', JSON.stringify(userRamas))
			.replace('{{subrama_juridicas_json}}', JSON.stringify(userSubRamaMap))
			.replace('{{boeDocuments}}', documentsHtml)
			.replace('{{months_json}}', JSON.stringify(monthsForChart))
			.replace('{{counts_json}}', JSON.stringify(countsForChart))
			.replace('{{subscription_plan}}', JSON.stringify(user.subscription_plan || 'plan1'))
			.replace('{{start_date}}', JSON.stringify(searchStartDateFormatted))
			.replace('{{end_date}}', JSON.stringify(searchEndDateFormatted))
			.replace('{{user_boletines_json}}', JSON.stringify(selectedBoletines))
			.replace('{{user_rangos_json}}', JSON.stringify(selectedRangos))
			.replace('{{etiquetas_personalizadas_json}}', JSON.stringify(userEtiquetasPersonalizadas))
			.replace('{{registration_date_formatted}}', formattedRegDate);
			
		console.log(`[profile] === FINALIZANDO RESPUESTA ===`);
		console.log(`[profile] HTML generado, enviando respuesta al cliente`);
		return res.send(profileHtml);
	} catch (error) {
		console.error('Error in profile route:', error);
		return res.status(500).send('Error interno del servidor');
	} finally {
		await client.close();
	}
});

// GET /data (same behavior)
router.get('/data', async (req, res) => {
	if (!req.isAuthenticated()) {
		return res.status(401).json({ error: 'Unauthorized' });
	}
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const database = client.db('papyrus');
		const usersCollection = database.collection('users');
		const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
		// ENTERPRISE ADAPTER: Obtener etiquetas según tipo de cuenta (empresa/individual)
		const etiquetasResult = await getEtiquetasPersonalizadasAdapter(req.user);
		const userEtiquetasPersonalizadas = etiquetasResult.etiquetas_personalizadas || {};
		const etiquetasKeys = Array.isArray(userEtiquetasPersonalizadas) ? userEtiquetasPersonalizadas : Object.keys(userEtiquetasPersonalizadas);
		if (etiquetasKeys.length === 0) {
			return res.json({
				documentsHtml: `<div class="no-results" style="color: #04db8d; font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Hemos lanzado una nueva versión del producto para poder personalizar más las alertas del usuario. Por favor, configura de nuevo tu perfil en menos de 5mins.</div>`,
				hideAnalyticsLabels: true,
				monthsForChart: [],
				countsForChart: []
			});
		}
		let userBoletines = [];
		// ENTERPRISE ADAPTER: Resolver cobertura_legal desde estructura_empresa si aplica
		let coberturaSource = user.cobertura_legal || {};
		try {
			if (req.user.tipo_cuenta === 'empresa' && req.user.estructura_empresa_id) {
				const estructuraDoc = await usersCollection.findOne(
					{ _id: new ObjectId(req.user._id) },
					{ projection: { estructura_empresa_id: 1 } }
				);
				const estructuraId = estructuraDoc?.estructura_empresa_id || req.user.estructura_empresa_id;
				if (estructuraId) {
					const empresaDoc = await database.collection('users').findOne(
						{ _id: (estructuraId instanceof ObjectId) ? estructuraId : new ObjectId(String(estructuraId)) },
						{ projection: { cobertura_legal: 1 } }
					);
					if (empresaDoc && empresaDoc.cobertura_legal) coberturaSource = empresaDoc.cobertura_legal;
				}
			}
		} catch (e) { console.error('[data] Error resolviendo cobertura_legal empresa:', e.message); }
		const fuentesGobierno = coberturaSource?.['fuentes-gobierno'] || coberturaSource?.fuentes_gobierno || coberturaSource?.fuentes || [];
		if (fuentesGobierno.length > 0) userBoletines = userBoletines.concat(fuentesGobierno);
		const fuentesReguladores = coberturaSource?.['fuentes-reguladores'] || coberturaSource?.fuentes_reguladores || coberturaSource?.['fuentes-regulador'] || coberturaSource?.reguladores || [];
		if (fuentesReguladores.length > 0) userBoletines = userBoletines.concat(fuentesReguladores);
		userBoletines = userBoletines.map(b => b.toUpperCase());
		if (userBoletines.length === 0) userBoletines = ['BOE'];
		const collections = req.query.collections ? req.query.collections.split('||') : userBoletines;
		const rangoStr = req.query.rango || '';
		const startDate = req.query.desde;
		const endDate = req.query.hasta;
			const etiquetasStr = req.query.etiquetas || '';
	let selectedEtiquetas = [];
	
	if (etiquetasStr.trim() !== '') {
		selectedEtiquetas = etiquetasStr.split('||').map(s => s.trim()).filter(Boolean);
	} else {
		// ENTERPRISE ADAPTER: Para usuarios enterprise, usar etiquetas seleccionadas si las hay, sino todas las disponibles
		if (req.user.tipo_cuenta === 'empresa') {
			try {
				const etiquetasSeleccionadasResult = await getEtiquetasSeleccionadasAdapter(req.user);
				const etiquetasSeleccionadas = etiquetasSeleccionadasResult.etiquetas_seleccionadas || [];
				
				if (etiquetasSeleccionadas.length > 0) {
					selectedEtiquetas = etiquetasSeleccionadas;
					console.log(`[data] Usuario empresa: usando ${selectedEtiquetas.length} etiquetas seleccionadas por defecto`);
				} else {
					selectedEtiquetas = etiquetasKeys;
					console.log(`[data] Usuario empresa: sin etiquetas seleccionadas, usando ${selectedEtiquetas.length} etiquetas disponibles`);
				}
			} catch (error) {
				console.error('[data] Error obteniendo etiquetas seleccionadas, fallback a todas:', error);
				selectedEtiquetas = etiquetasKeys;
			}
		} else {
			selectedEtiquetas = etiquetasKeys;
			console.log(`[data] Usuario individual: usando ${selectedEtiquetas.length} etiquetas disponibles`);
		}
	}
	
	if (selectedEtiquetas.length === 0) {
		return res.json({
			documentsHtml: `<div class="no-results" style="color: #04db8d; font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Por favor, selecciona al menos un agente para realizar la búsqueda.</div>`,
			hideAnalyticsLabels: true,
			monthsForChart: [],
			countsForChart: []
		});
	}
		// ENTERPRISE ADAPTER: Determinar userIds correctos para filtrado
		let targetUserIds;
		if (req.user.tipo_cuenta === 'empresa' && req.user.estructura_empresa_id) {
			let estructuraId = null;
			try {
				const estructuraDoc = await usersCollection.findOne(
					{ _id: new ObjectId(req.user._id) },
					{ projection: { estructura_empresa_id: 1 } }
				);
				estructuraId = estructuraDoc?.estructura_empresa_id || req.user.estructura_empresa_id;
			} catch(_){ estructuraId = req.user.estructura_empresa_id; }
			let legacyIds = [];
			try {
				const empresaDoc = await database.collection('users').findOne(
					{ _id: (estructuraId instanceof ObjectId) ? estructuraId : new ObjectId(String(estructuraId)) },
					{ projection: { legacy_user_ids: 1 } }
				);
				legacyIds = Array.isArray(empresaDoc?.legacy_user_ids) ? empresaDoc.legacy_user_ids.map(String) : [];
			} catch(_){ legacyIds = []; }
			targetUserIds = [String(estructuraId), ...legacyIds];
		} else {
			targetUserIds = [user._id.toString()];
		}
		
		let selectedRangos = [];
		if (rangoStr.trim() !== '') selectedRangos = rangoStr.split('||').map(s => s.trim()).filter(Boolean);
		
		// ENTERPRISE ADAPTER: Usar buildEtiquetasQueryForIds para construir query multi-ID (sin lowercasing)
		const etiquetasQuery = require('../services/enterprise.service').buildEtiquetasQueryForIds(Array.isArray(selectedEtiquetas) ? selectedEtiquetas : [], targetUserIds);
		
		// Normalizar etiquetas para matching posterior (minúsculas) solo para comparar dentro de cada doc
		const etiquetasForMatch = Array.isArray(selectedEtiquetas) ? selectedEtiquetas.map(e => String(e).toLowerCase()) : [];
		
		const query = {
			$and: []
		};
		
		// Añadir filtro de fechas (normalizado UTC) con fallback a fecha_publicacion/fecha/datetime_insert
		if (startDate || endDate) {
			const start = startDate ? new Date(startDate) : null;
			const end = endDate ? new Date(endDate) : null;
			const dateFilters = buildDateFilter(start, end);
			if (dateFilters.length > 0) {
				query.$and.push(...dateFilters);
			}
		}
		
		// Añadir filtro de etiquetas usando adaptador enterprise
		if (Object.keys(etiquetasQuery).length > 0) {
			query.$and.push(etiquetasQuery);
		}
		
		// Si no hay filtros, usar query vacía
		if (query.$and.length === 0) {
			delete query.$and;
		}
		const projection = { short_name: 1, resumen: 1, dia: 1, mes: 1, anio: 1, url_pdf: 1, url_html: 1, rango_titulo: 1, etiquetas_personalizadas: 1, num_paginas: 1, _id: 1, fecha_publicacion: 1, fecha: 1, datetime_insert: 1 };
		let allDocuments = [];
		const expandedCollections = expandCollectionsWithTest(collections).filter(n => !String(n).toLowerCase().endsWith('_test'));
		
		// OPTIMIZACIÓN: Consultas paralelas con límite para /data
		const dataQueryPromises = expandedCollections.map(async (cName) => {
			try {
				const exists = await collectionExists(database, cName);
				if (!exists) return [];
				const coll = database.collection(cName);
				// Límite de 300 documentos por colección con ordenación
				const docs = await coll.find(query)
					.project(projection)
					.sort({ anio: -1, mes: -1, dia: -1 })
					.limit(300)
					.toArray();
				docs.forEach(d => {
					d.collectionName = cName;
					// Rellenar anio/mes/dia si faltan con la fecha efectiva
					if (!(typeof d.anio === 'number' && typeof d.mes === 'number' && typeof d.dia === 'number')) {
						const eff = d.fecha_publicacion || d.fecha || d.datetime_insert;
						if (eff) {
							const dt = new Date(eff);
							if (!isNaN(dt.getTime())) {
								d.anio = dt.getUTCFullYear();
								d.mes = dt.getUTCMonth() + 1;
								d.dia = dt.getUTCDate();
							}
						}
					}
				});
				return docs;
			} catch (error) {
				console.error(`Error querying collection ${cName}:`, error.message);
				return [];
			}
		});
		
		// NUEVO: agregación diaria completa sin límite de documentos
		// Agregación diaria con fallback de fecha (anio/mes/dia o fecha_publicacion/fecha/datetime_insert)
		const rangoMatchStage = selectedRangos.length > 0 ? { rango_titulo: { $in: selectedRangos } } : null;
		const etiquetasStage = Object.keys(etiquetasQuery).length > 0 ? etiquetasQuery : null;
		const startAgg = startDate ? new Date(startDate) : null;
		const endAgg = endDate ? new Date(endDate) : null;
		const dateFiltersAgg = buildDateFilter(startAgg, endAgg);
		const fullMatch = { $and: [ ...(dateFiltersAgg.length ? dateFiltersAgg : []), ...(rangoMatchStage ? [rangoMatchStage] : []), ...(etiquetasStage ? [etiquetasStage] : []) ] };
		if (fullMatch.$and.length === 0) delete fullMatch.$and;
		const dailyAggPromises = expandedCollections.map(async (cName) => {
			try {
				const exists = await collectionExists(database, cName);
				if (!exists) return [];
				return await database.collection(cName).aggregate([
					// Fijar fecha efectiva y completar anio/mes/dia si faltan
					{ $addFields: { __effectiveDate: { $ifNull: [ "$fecha_publicacion", { $ifNull: [ "$fecha", "$datetime_insert" ] } ] } } },
					{ $addFields: {
						anio: { $ifNull: [ "$anio", { $year: "$__effectiveDate" } ] },
						mes: { $ifNull: [ "$mes", { $month: "$__effectiveDate" } ] },
						dia: { $ifNull: [ "$dia", { $dayOfMonth: "$__effectiveDate" } ] }
					}},
					{ $match: fullMatch },
					{ $group: { _id: { anio: "$anio", mes: "$mes", dia: "$dia" }, count: { $sum: 1 } } }
				]).toArray();
			} catch (e) { console.error('dailyAgg error', cName, e.message); return []; }
		});
		
		const dataResults = await Promise.all(dataQueryPromises);
		const dailyAggResults = await Promise.all(dailyAggPromises);
		allDocuments = dataResults.flat();
		// Ordenar por fecha efectiva (anio/mes/dia o fecha_publicacion/fecha/datetime_insert)
		const getEffectiveDate = (doc) => {
			if (typeof doc.anio === 'number' && typeof doc.mes === 'number' && typeof doc.dia === 'number') return new Date(doc.anio, doc.mes - 1, doc.dia);
			const d = doc.fecha_publicacion || doc.fecha || doc.datetime_insert;
			return d ? new Date(d) : new Date(0);
		};
		allDocuments.sort((a, b) => getEffectiveDate(b) - getEffectiveDate(a));
		const startMain = startDate ? new Date(startDate) : null;
		const endMain = endDate ? new Date(endDate) : null;
		const dateFilter = buildDateFilter(startMain, endMain);
		const queryWithoutEtiquetas = { $and: [ ...dateFilter ] };
		const documentosEliminados = user.documentos_eliminados || [];
		// Cargar eliminaciones desde Feedback
		let feedbackDeletedSet = new Set();
		try {
			const feedbackCol = database.collection('Feedback');
			const deletionScope = (() => {
				const ids = new Set([ String(user._id) ]);
				if (req.user && req.user.tipo_cuenta === 'empresa' && req.user.estructura_empresa_id) ids.add(String(req.user.estructura_empresa_id));
				return Array.from(ids);
			})();
			const delRows = await feedbackCol.find(
				{ content_evaluated: 'doc_eliminado', deleted_from: { $in: deletionScope } },
				{ projection: { coleccion: 1, collection_name: 1, doc_id: 1 } }
			).toArray();
			for (const r of delRows) {
				const coll = r.coleccion || r.collection_name;
				const did = r.doc_id != null ? String(r.doc_id) : '';
				if (coll && did) feedbackDeletedSet.add(`${coll}|${did}`);
			}
		} catch(_){ /* ignore */ }
		const filteredDocuments = [];
		for (const doc of allDocuments) {
			const delKey = `${doc.collectionName}|${String(doc._id)}`;
			if (feedbackDeletedSet.has(delKey)) continue;
			if (documentosEliminados.some(d => d.coleccion === doc.collectionName && d.id === doc._id.toString())) continue;
			const docRango = doc.rango_titulo || 'Indefinido';
			let passesRangoFilter = true;
			if (selectedRangos.length > 0) passesRangoFilter = selectedRangos.includes(docRango);
			if (!passesRangoFilter) continue;
			let hasEtiquetasMatch = false;
			let matchedEtiquetas = [];
			// ENTERPRISE ADAPTER: Buscar match bajo cualquiera de los targetUserIds
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
			if (hasEtiquetasMatch) {
				doc.matched_etiquetas = [...new Set(matchedEtiquetas)];
				filteredDocuments.push(doc);
			}
		}
		
		// OPTIMIZACIÓN: Limitar documentos filtrados para mejor UX
		// PAGINACIÓN: calcular totales y recortar por página sin afectar estadísticas
		const totalFiltered = filteredDocuments.length;
		const pageSize = Math.max(1, Math.min(parseInt(req.query.pageSize || '25', 10) || 25, 100));
		const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
		const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
		const safePage = Math.min(page, totalPages);
		const startIndex = (safePage - 1) * pageSize;
		const endIndex = Math.min(startIndex + pageSize, totalFiltered);
		const pageDocuments = filteredDocuments.slice(startIndex, endIndex);
		// Construir mapa diario consolidado de la agregación
		const dailyMap = {};
		for (const arr of dailyAggResults) {
			for (const row of arr) {
				const y = row._id.anio; const m = String(row._id.mes).padStart(2,'0'); const d = String(row._id.dia).padStart(2,'0');
				const key = `${y}-${m}-${d}`;
				dailyMap[key] = (dailyMap[key] || 0) + (row.count || 0);
			}
		}
		const dailyLabels = Object.keys(dailyMap).sort();
		const dailyCounts = dailyLabels.map(k => dailyMap[k]);
		// Derivar meses para chart mensual (por compatibilidad)
		const monthMap = {};
		for (const key of dailyLabels) {
			const [y, m] = key.split('-');
			const mk = `${y}-${m}`;
			monthMap[mk] = (monthMap[mk] || 0) + (dailyMap[key] || 0);
		}
		const sortedMonthsKeys = Object.keys(monthMap).sort();
		const monthsForChart = sortedMonthsKeys.map(mk => { const [yy, mm] = mk.split('-'); const name = new Date(parseInt(yy), parseInt(mm)-1, 1).toLocaleString('es-ES', { month: 'long' }); return `${name} ${yy}`; });
		const countsForChart = sortedMonthsKeys.map(mk => monthMap[mk]);
		// Estadísticas diarias e impacto del conjunto completo
		const totalAlerts = dailyCounts.reduce((a,b)=>a+b,0);
		const impactCounts = { alto: 0, medio: 0, bajo: 0 };
		for (const doc of allDocuments) {
			let userEtiq = null;
			if (doc.etiquetas_personalizadas) {
				for (const tid of targetUserIds) {
					const val = doc.etiquetas_personalizadas[tid];
					if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length) { userEtiq = val; break; }
				}
			}
			let level = '';
			if (userEtiq && typeof userEtiq === 'object' && !Array.isArray(userEtiq)) {
				const matchKeys = Array.isArray(doc.matched_etiquetas) && doc.matched_etiquetas.length ? doc.matched_etiquetas : Object.keys(userEtiq);
				let hasAlto=false, hasMedio=false, hasBajo=false;
				for (const et of matchKeys) {
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
		let avgAlertsPerDay = 0;
		try {
			const sd = startDate ? new Date(startDate) : (dailyLabels[0] ? new Date(dailyLabels[0]) : null);
			const ed = endDate ? new Date(endDate) : (dailyLabels[dailyLabels.length-1] ? new Date(dailyLabels[dailyLabels.length-1]) : null);
			if (sd && ed && !isNaN(sd.getTime()) && !isNaN(ed.getTime())) {
				const diffDays = Math.max(1, Math.round((ed - sd)/(1000*60*60*24)) + 1);
				avgAlertsPerDay = totalAlerts / diffDays;
			}
		} catch(_){}
		let documentsHtml;
		if (filteredDocuments.length === 0) {
			documentsHtml = `<div class="no-results" style="color: #04db8d; font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Puedes estar tranquilo. Tus agentes han analizado ${totalAlerts} alertas en el rango seleccionado y no hay nada que te afecte.</div>`;
		} else {
			documentsHtml = pageDocuments.map(doc => {
				const rangoToShow = doc.rango_titulo || 'Indefinido';
				const matchedEtiquetasHtml = doc.matched_etiquetas && doc.matched_etiquetas.length > 0 ? `<div class="etiquetas-personalizadas-values">${doc.matched_etiquetas.map(e => `<span class="etiqueta-personalizada-value">${e}</span>`).join(' ')}</div>` : '';
				
				// Generar sección de impacto en agentes
				const impactoAgentesHtml = (() => {
					if (!doc.etiquetas_personalizadas) return '';
								// ENTERPRISE ADAPTER: Usar primer userId con objeto de impacto (segunda instancia)
			let userEtiquetas = null;
			for (const tid of targetUserIds) {
				const val = doc.etiquetas_personalizadas ? doc.etiquetas_personalizadas[tid] : null;
				if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length) { userEtiquetas = val; break; }
			}
			if (!userEtiquetas) return '';
					const etiquetasKeys = Object.keys(userEtiquetas);
					if (etiquetasKeys.length === 0) return '';
					return `
					  <div class="impacto-agentes" style="margin-top: 15px; margin-bottom: 15px; padding-left: 15px; border-left: 4px solid #04db8d; background-color: rgba(4, 219, 141, 0.05);">
						<div style="font-weight: 600; font-size: large; margin-bottom: 10px; color: #455862; padding: 5px;">Impacto en agentes</div>
						<div style="padding: 0 5px 10px 5px; font-size: 1.1em; line-height: 1.5;">
						  ${etiquetasKeys.map(etiqueta => {
							const etiquetaData = userEtiquetas[etiqueta];
							let explicacion = '';
							let nivelImpacto = '';
							if (typeof etiquetaData === 'string') {
								explicacion = etiquetaData;
							} else if (typeof etiquetaData === 'object' && etiquetaData !== null) {
								explicacion = etiquetaData.explicacion || '';
								nivelImpacto = etiquetaData.nivel_impacto || '';
							}
							let nivelTag = '';
							if (nivelImpacto) {
								let bgColor = '#f8f9fa'; let textColor = '#6c757d';
								switch ((nivelImpacto||'').toLowerCase()) { case 'alto': bgColor = '#ffe6e6'; textColor = '#dc3545'; break; case 'medio': bgColor = '#fff3cd'; textColor = '#856404'; break; case 'bajo': bgColor = '#d4edda'; textColor = '#155724'; break; }
								nivelTag = `<span style="background-color: ${bgColor}; color: ${textColor}; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; font-weight: 500; margin-left: 8px;">${nivelImpacto}</span>`;
							}
							const feedbackIcons = nivelImpacto ? `
							  <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 8px;">
								<i class="fa fa-thumbs-up thumb-icon" onclick="sendFeedback('${doc._id}', 'like', this, '${etiqueta}', '${doc.collectionName}', '${doc.url_pdf || doc.url_html || ''}', '${doc.short_name}')" style="cursor: pointer; color: #6c757d; font-size: 0.9em; transition: color 0.2s;"></i>
								<i class="fa fa-thumbs-down thumb-icon" onclick="sendFeedback('${doc._id}', 'dislike', this, '${etiqueta}', '${doc.collectionName}', '${doc.url_pdf || doc.url_html || ''}', '${doc.short_name}')" style="cursor: pointer; color: #6c757d; font-size: 0.9em; transition: color 0.2s;"></i>
							  </span>
							` : '';
							return `<div style="margin-bottom: 12px; display: flex; align-items: baseline;"><svg width="16" height="16" viewBox="0 0 24 24" style="color: #04db8d; margin-right: 10px; flex-shrink: 0;"><path fill="currentColor" d="M10.5 17.5l7.5-7.5-7.5-7.5-1.5 1.5L15 10l-6 6z"></path></svg><div style="flex: 1;"><span style="font-weight: 600;">${etiqueta}</span>${nivelTag}${feedbackIcons}<div style="margin-top: 4px; color: #555;">${explicacion}</div></div></div>`;
						}).join('')}
						</div>
					  </div>`;
				})();
				
				const dateText = (() => { if (typeof doc.anio === 'number' && typeof doc.mes === 'number' && typeof doc.dia === 'number') return `${doc.dia}/${doc.mes}/${doc.anio}`; const d = doc.fecha_publicacion || doc.fecha || doc.datetime_insert; if (!d) return '-'; const dt = new Date(d); return `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}/${dt.getUTCFullYear()}`; })();
				const datetimeAttr = (() => { const d = doc.fecha_publicacion || doc.fecha || doc.datetime_insert; if (!d) return ''; try { return new Date(d).toISOString(); } catch(_){ return ''; } })();
				return `
					<div class="data-item">
					  <div class="header-row"><div class="id-values">${doc.short_name}</div><span class="date" data-datetime-insert="${datetimeAttr}"><em>${dateText}</em></span></div>
					  <div style="color: gray; font-size: 1.1em; margin-bottom: 6px;">${rangoToShow} | ${doc.collectionName}</div>
					  ${matchedEtiquetasHtml}
					  <div class="resumen-label">Resumen</div>
					  <div class="resumen-content" style="font-size: 1.1em; line-height: 1.4;">${doc.resumen}</div>
					  ${impactoAgentesHtml}
					  <div class="margin-impacto"><a class="button-impacto" href="/profile?view=analisis&documentId=${doc._id}&collectionName=${doc.collectionName}">Analizar documento</a></div>
					  ${doc.url_pdf || doc.url_html ? `<a class="leer-mas" href="${doc.url_pdf || doc.url_html}" target="_blank" style="margin-right: 15px;">Leer más: ${doc._id}</a>` : `<span class="leer-mas" style="margin-right: 15px; color: #ccc;">Leer más: ${doc._id} (No disponible)</span>`}
					  
					  <!-- Botón de Guardar -->
					  <div class="guardar-button">
						<button class="save-btn" onclick="toggleListsDropdown(this, '${doc._id}', '${doc.collectionName}')">
						  <i class="fas fa-bookmark"></i>
						  Guardar
						</button>
						<div class="lists-dropdown">
						  <div class="lists-dropdown-header">
							<span>Guardar en...</span>
							<button class="save-ok-btn" onclick="saveToSelectedLists(this)">OK</button>
						  </div>
						  <div class="lists-content">
							<div class="lists-container">
							  <!-- Las listas se cargarán dinámicamente -->
							</div>
							<div class="add-new-list" onclick="showNewListForm(this)">
							  <i class="fas fa-plus"></i>
							  Añadir nueva
							</div>
							<div class="new-list-form">
							  <input type="text" class="new-list-input" placeholder="Nombre de la nueva lista" maxlength="50">
							  <div class="new-list-buttons">
								<button class="new-list-btn cancel" onclick="hideNewListForm(this)">Cancelar</button>
								<button class="new-list-btn save" onclick="createNewList(this, '${doc._id}', '${doc.collectionName}')">OK</button>
							  </div>
							</div>
						  </div>
						</div>
					  </div>
					  
					  <span class="doc-seccion" style="display:none;">Disposiciones generales</span>
					  <span class="doc-rango" style="display:none;">${rangoToShow}</span>
					</div>`;
				}).join('');
		}
		return res.json({ documentsHtml, hideAnalyticsLabels: false, monthsForChart, countsForChart, dailyLabels, dailyCounts, impactCounts, totalAlerts, avgAlertsPerDay, pagination: { page: safePage, pageSize, total: totalFiltered, totalPages } });
	} catch (err) {
		console.error('Error in /data:', err);
		return res.status(500).json({ error: 'Error interno del servidor' });
	} finally {
		await client.close();
	}
});

// -----------------------------------------------------------------------------
// ENDPOINT PARA QUE EL USUARIO MARQUE UN DOCUMENTO COMO ELIMINADO
// -----------------------------------------------------------------------------
router.post('/delete-document', ensureAuthenticated, async (req, res) => {
	const { collectionName, documentId } = req.body;
	if (!collectionName || !documentId) {
		return res.status(400).json({ error: 'Parámetros requeridos: collectionName, documentId' });
	}
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const database = client.db('papyrus');
		const usersCollection = database.collection('users');

		await usersCollection.updateOne(
			{ _id: new ObjectId(req.user._id) },
			{ $addToSet: { documentos_eliminados: { coleccion: collectionName, id: documentId } } }
		);

		res.json({ success: true });
	} catch (error) {
		console.error('Error en /delete-document:', error);
		res.status(500).json({ error: 'Error interno del servidor' });
	} finally {
		await client.close();
	}
});

module.exports = router; 