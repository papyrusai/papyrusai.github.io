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
		const userEtiquetasPersonalizadas = user.etiquetas_personalizadas || {};
		const etiquetasKeys = Array.isArray(userEtiquetasPersonalizadas) ? userEtiquetasPersonalizadas : Object.keys(userEtiquetasPersonalizadas);

		let userBoletines = [];
		const fuentesGobierno = user.cobertura_legal?.['fuentes-gobierno'] || user.cobertura_legal?.fuentes_gobierno || user.cobertura_legal?.fuentes || [];
		if (fuentesGobierno.length > 0) userBoletines = userBoletines.concat(fuentesGobierno);
		const fuentesReguladores = user.cobertura_legal?.['fuentes-reguladores'] || user.cobertura_legal?.fuentes_reguladores || user.cobertura_legal?.['fuentes-regulador'] || user.cobertura_legal?.reguladores || [];
		if (fuentesReguladores.length > 0) userBoletines = userBoletines.concat(fuentesReguladores);
		userBoletines = userBoletines.map(b => b.toUpperCase());
		if (userBoletines.length === 0) userBoletines = ['BOE'];

		const now = new Date();
		const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
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
				.replace('{{start_date}}', JSON.stringify((() => { const d = new Date(new Date().getFullYear(), new Date().getMonth(), 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()))
				.replace('{{end_date}}', JSON.stringify((() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()))
				.replace('{{user_boletines_json}}', JSON.stringify(userBoletines || []))
				.replace('{{user_rangos_json}}', JSON.stringify(userRangos || []))
				.replace('{{etiquetas_personalizadas_json}}', JSON.stringify(userEtiquetasPersonalizadas))
				.replace('{{registration_date_formatted}}', formattedRegDate);
			return res.send(profileHtml);
		}

		const selectedEtiquetas = etiquetas ? JSON.parse(etiquetas) : etiquetasKeys;
		const selectedBoletines = boletines ? JSON.parse(boletines) : userBoletines;
		const selectedRangos = rangos ? JSON.parse(rangos) : userRangos;
		const dateFilter = buildDateFilter(searchStartDate, searchEndDate);
		const query = {
			$and: [
				...dateFilter,
				{ rango_titulo: { $in: selectedRangos } },
				{
					$or: [
						{ $or: selectedEtiquetas.map(etiqueta => ({ [`etiquetas_personalizadas.${user._id.toString()}.${etiqueta}`]: { $exists: true } })) },
						{ [`etiquetas_personalizadas.${user._id.toString()}`]: { $in: selectedEtiquetas } }
					]
				}
			]
		};

		const projection = { short_name: 1, divisiones: 1, resumen: 1, dia: 1, mes: 1, anio: 1, url_pdf: 1, url_html: 1, ramas_juridicas: 1, rango_titulo: 1, _id: 1, etiquetas_personalizadas: 1 };
		let allDocuments = [];
		const expandedBoletines = expandCollectionsWithTest(selectedBoletines);
		
		// OPTIMIZACIÓN: Usar Promise.all para consultas paralelas y límite de documentos
		const queryPromises = expandedBoletines.map(async (collectionName) => {
			try {
				const exists = await collectionExists(database, collectionName);
				if (!exists) return [];
				const coll = database.collection(collectionName);
				// Límite de 500 documentos por colección y ordenar por fecha en DB
				const docs = await coll.find(query)
					.project(projection)
					.sort({ anio: -1, mes: -1, dia: -1 })
					.limit(500)
					.toArray();
				docs.forEach(doc => { doc.collectionName = collectionName; });
				return docs;
			} catch (error) {
				console.error(`Error querying collection ${collectionName}:`, error.message);
				return [];
			}
		});
		
		const collectionResults = await Promise.all(queryPromises);
		allDocuments = collectionResults.flat();
		// OPTIMIZACIÓN: Ordenar y filtrar con límite para renderizado más rápido
		allDocuments.sort((a, b) => (new Date(a.anio, a.mes - 1, a.dia)) - (new Date(b.anio, b.mes - 1, b.dia)) < 0 ? 1 : -1);
		allDocuments = allDocuments.filter(doc => !(documentosEliminados && documentosEliminados.some(d => d.coleccion === doc.collectionName && d.id === doc._id.toString())));
		
		// Limitar a los 100 documentos más recientes para mejorar renderizado
		const maxDocumentsToShow = 100;
		if (allDocuments.length > maxDocumentsToShow) {
			allDocuments = allDocuments.slice(0, maxDocumentsToShow);
		}

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
			documentsHtml = allDocuments.map(doc => {
				const rangoToShow = doc.rango_titulo || 'Indefinido';
				const etiquetasPersonalizadasHtml = (() => {
					if (!doc.etiquetas_personalizadas) return '';
					const userId = user._id.toString();
					const userEtiquetas = doc.etiquetas_personalizadas[userId];
					if (!userEtiquetas || (Array.isArray(userEtiquetas) && userEtiquetas.length === 0) || (typeof userEtiquetas === 'object' && Object.keys(userEtiquetas).length === 0)) return '';
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
					const userId = user._id.toString();
					const userEtiquetas = doc.etiquetas_personalizadas[userId];
					if (!userEtiquetas || Array.isArray(userEtiquetas) || typeof userEtiquetas !== 'object') return '';
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
				return `
				  <div class=\"data-item\">
					<div class=\"header-row\">
					  <div class=\"id-values\">${doc.short_name}</div>
					  <span class=\"date\"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span>
					</div>
					<div style=\"color: gray; font-size: 1.1em; margin-bottom: 6px;\">${rangoToShow} | ${doc.collectionName}</div>
					${etiquetasPersonalizadasHtml}
					<div class=\"resumen-label\">Resumen</div>
					<div class=\"resumen-content\" style=\"font-size: 1.1em; line-height: 1.4;\">${doc.resumen}</div>
					${impactoAgentesHtml}
					<div class=\"margin-impacto\"><a class=\"button-impacto\" href=\"/views/analisis/norma.html?documentId=${doc._id}&collectionName=${doc.collectionName}\">Analizar documento</a></div>
					${doc.url_pdf || doc.url_html ? `<a class=\"leer-mas\" href=\"${doc.url_pdf || doc.url_html}\" target=\"_blank\" style=\"margin-right: 15px;\">Leer más: ${doc._id}</a>` : `<span class=\"leer-mas\" style=\"margin-right: 15px; color: #ccc;\">Leer más: ${doc._id} (No disponible)</span>`}
					
					<!-- Botón de Guardar -->
					<div class=\"guardar-button\">
					  <button class=\"save-btn\" onclick=\"toggleListsDropdown(this, '${doc._id}', '${doc.collectionName}')\">
						<i class=\"fas fa-bookmark\"></i>
						Guardar
					  </button>
					  <div class=\"lists-dropdown\">
						<div class=\"lists-dropdown-header\">
						  <span>Guardar en...</span>
						  <button class=\"save-ok-btn\" onclick=\"saveToSelectedLists(this)\">OK</button>
						</div>
						<div class=\"lists-content\">
						  <div class=\"lists-container\">
							<!-- Las listas se cargarán dinámicamente -->
						  </div>
						  <div class=\"add-new-list\" onclick=\"showNewListForm(this)\">
							<i class=\"fas fa-plus\"></i>
							Añadir nueva
						  </div>
						  <div class=\"new-list-form\">
							<input type=\"text\" class=\"new-list-input\" placeholder=\"Nombre de la nueva lista\" maxlength=\"50\">
							<div class=\"new-list-buttons\">
							  <button class=\"new-list-btn cancel\" onclick=\"hideNewListForm(this)\">Cancelar</button>
							  <button class=\"new-list-btn save\" onclick=\"createNewList(this, '${doc._id}', '${doc.collectionName}')\">OK</button>
							</div>
						  </div>
						</div>
					  </div>
					</div>
					<span class=\"doc-seccion\" style=\"display:none;\">Disposiciones generales</span>
					<span class=\"doc-rango\" style=\"display:none;\">${rangoToShow}</span>
				  </div>`;
				}).join('');
		}

		const documentsByMonth = {};
		allDocuments.forEach(doc => {
			const month = `${doc.anio}-${String(doc.mes).padStart(2, '0')}`;
			documentsByMonth[month] = (documentsByMonth[month] || 0) + 1;
		});
		const sortedMonths = Object.keys(documentsByMonth).sort();
		const monthsForChart = sortedMonths.map(m => { const [year, month] = m.split('-'); const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']; return `${monthNames[parseInt(month) - 1]} ${year}`; });
		const countsForChart = sortedMonths.map(m => documentsByMonth[m]);

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
		const userEtiquetasPersonalizadas = user.etiquetas_personalizadas || {};
		const etiquetasKeys = Object.keys(userEtiquetasPersonalizadas);
		if (etiquetasKeys.length === 0) {
			return res.json({
				documentsHtml: `<div class="no-results" style="color: #04db8d; font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Hemos lanzado una nueva versión del producto para poder personalizar más las alertas del usuario. Por favor, configura de nuevo tu perfil en menos de 5mins.</div>`,
				hideAnalyticsLabels: true,
				monthsForChart: [],
				countsForChart: []
			});
		}
		let userBoletines = [];
		const fuentesGobierno = user.cobertura_legal?.['fuentes-gobierno'] || user.cobertura_legal?.fuentes_gobierno || user.cobertura_legal?.fuentes || [];
		if (fuentesGobierno.length > 0) userBoletines = userBoletines.concat(fuentesGobierno);
		const fuentesReguladores = user.cobertura_legal?.['fuentes-reguladores'] || user.cobertura_legal?.fuentes_reguladores || user.cobertura_legal?.['fuentes-regulador'] || user.cobertura_legal?.reguladores || [];
		if (fuentesReguladores.length > 0) userBoletines = userBoletines.concat(fuentesReguladores);
		userBoletines = userBoletines.map(b => b.toUpperCase());
		if (userBoletines.length === 0) userBoletines = ['BOE'];
		const collections = req.query.collections ? req.query.collections.split('||') : userBoletines;
		const rangoStr = req.query.rango || '';
		const startDate = req.query.desde;
		const endDate = req.query.hasta;
		const etiquetasStr = req.query.etiquetas || '';
		let selectedEtiquetas = [];
		if (etiquetasStr.trim() !== '') selectedEtiquetas = etiquetasStr.split('||').map(s => s.toLowerCase()).filter(Boolean);
		if (selectedEtiquetas.length === 0) {
			return res.json({
				documentsHtml: `<div class="no-results" style="color: #04db8d; font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Por favor, selecciona al menos un agente para realizar la búsqueda.</div>`,
				hideAnalyticsLabels: true,
				monthsForChart: [],
				countsForChart: []
			});
		}
		const userId = user._id.toString();
		let selectedRangos = [];
		if (rangoStr.trim() !== '') selectedRangos = rangoStr.split('||').map(s => s.trim()).filter(Boolean);
		const query = {};
		if (startDate || endDate) {
			query.$and = query.$and || [];
			if (startDate) {
				const [anio, mes, dia] = startDate.split('-').map(Number);
				query.$and.push({ $or: [ { anio: { $gt: anio } }, { anio: anio, mes: { $gt: mes } }, { anio: anio, mes: mes, dia: { $gte: dia } } ] });
			}
			if (endDate) {
				const [anio, mes, dia] = endDate.split('-').map(Number);
				query.$and.push({ $or: [ { anio: { $lt: anio } }, { anio: anio, mes: { $lt: mes } }, { anio: anio, mes: mes, dia: { $lte: dia } } ] });
			}
		}
		const projection = { short_name: 1, resumen: 1, dia: 1, mes: 1, anio: 1, url_pdf: 1, url_html: 1, rango_titulo: 1, etiquetas_personalizadas: 1, num_paginas: 1, _id: 1 };
		let allDocuments = [];
		const expandedCollections = expandCollectionsWithTest(collections);
		
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
				docs.forEach(d => { d.collectionName = cName; });
				return docs;
			} catch (error) {
				console.error(`Error querying collection ${cName}:`, error.message);
				return [];
			}
		});
		
		const dataResults = await Promise.all(dataQueryPromises);
		allDocuments = dataResults.flat();
		allDocuments.sort((a, b) => (new Date(a.anio, a.mes - 1, a.dia)) - (new Date(b.anio, b.mes - 1, b.dia)) < 0 ? 1 : -1);
		const start = startDate ? new Date(startDate) : null;
		const end = endDate ? new Date(endDate) : null;
		const dateFilter = buildDateFilter(start, end);
		const queryWithoutEtiquetas = { $and: [ ...dateFilter ] };
		const documentosEliminados = user.documentos_eliminados || [];
		const filteredDocuments = [];
		for (const doc of allDocuments) {
			if (documentosEliminados.some(d => d.coleccion === doc.collectionName && d.id === doc._id.toString())) continue;
			const docRango = doc.rango_titulo || 'Indefinido';
			let passesRangoFilter = true;
			if (selectedRangos.length > 0) passesRangoFilter = selectedRangos.includes(docRango);
			if (!passesRangoFilter) continue;
			let hasEtiquetasMatch = false;
			let matchedEtiquetas = [];
			if (doc.etiquetas_personalizadas && doc.etiquetas_personalizadas[userId]) {
				const userEtiquetas = doc.etiquetas_personalizadas[userId];
				if (Array.isArray(userEtiquetas)) {
					const etiquetasCoincidentes = userEtiquetas.filter(et => selectedEtiquetas.includes(et.toLowerCase()));
					if (etiquetasCoincidentes.length > 0) { hasEtiquetasMatch = true; matchedEtiquetas = etiquetasCoincidentes; }
				} else if (typeof userEtiquetas === 'object' && userEtiquetas !== null) {
					const docEtiquetasKeys = Object.keys(userEtiquetas);
					const etiquetasCoincidentes = docEtiquetasKeys.filter(et => selectedEtiquetas.includes(et.toLowerCase()));
					if (etiquetasCoincidentes.length > 0) { hasEtiquetasMatch = true; matchedEtiquetas = etiquetasCoincidentes; }
				}
			}
			if (hasEtiquetasMatch) {
				doc.matched_etiquetas = [...new Set(matchedEtiquetas)];
				filteredDocuments.push(doc);
			}
		}
		
		// OPTIMIZACIÓN: Limitar documentos filtrados para mejor UX
		const maxFilteredDocs = 100;
		if (filteredDocuments.length > maxFilteredDocs) {
			filteredDocuments.splice(maxFilteredDocs);
		}
		const monthsForChart = [];
		const countsForChart = [];
		const documentsByMonth = {};
		for (const doc of filteredDocuments) {
			const monthKey = `${doc.anio}-${doc.mes.toString().padStart(2, '0')}`;
			documentsByMonth[monthKey] = (documentsByMonth[monthKey] || 0) + 1;
		}
		const sortedMonths = Object.keys(documentsByMonth).sort();
		for (const month of sortedMonths) {
			const [year, monthNum] = month.split('-');
			const monthName = new Date(parseInt(year), parseInt(monthNum) - 1, 1).toLocaleString('es-ES', { month: 'long' });
			monthsForChart.push(`${monthName} ${year}`);
			countsForChart.push(documentsByMonth[month]);
		}
		// OPTIMIZACIÓN: Contar páginas con aggregation pipeline paralelo
		const pageCountDataPromises = expandedCollections.map(async (cName) => {
			try {
				const exists = await collectionExists(database, cName);
				if (!exists) return 0;
				const result = await database.collection(cName).aggregate([
					{ $match: queryWithoutEtiquetas },
					{ $group: { _id: null, totalPages: { $sum: "$num_paginas" } } }
				]).toArray();
				return result.length > 0 ? (result[0].totalPages || 0) : 0;
			} catch (error) {
				console.error(`Error counting pages for collection ${cName}:`, error.message);
				return 0;
			}
		});
		
		const pageCountsData = await Promise.all(pageCountDataPromises);
		const totalPages = pageCountsData.reduce((sum, count) => sum + count, 0);
		let documentsHtml;
		if (filteredDocuments.length === 0) {
			documentsHtml = `<div class=\"no-results\" style=\"color: #04db8d; font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);\">Puedes estar tranquilo. Tus agentes han analizado ${totalPages} páginas en el rango seleccionado y no hay nada que te afecte.</div>`;
		} else {
			documentsHtml = filteredDocuments.map(doc => {
				const rangoToShow = doc.rango_titulo || 'Indefinido';
				const matchedEtiquetasHtml = doc.matched_etiquetas && doc.matched_etiquetas.length > 0 ? `<div class=\"etiquetas-personalizadas-values\">${doc.matched_etiquetas.map(e => `<span class=\"etiqueta-personalizada-value\">${e}</span>`).join(' ')}</div>` : '';
				
				// Generar sección de impacto en agentes
				const impactoAgentesHtml = (() => {
					if (!doc.etiquetas_personalizadas) return '';
					const userId = user._id.toString();
					const userEtiquetas = doc.etiquetas_personalizadas[userId];
					if (!userEtiquetas || Array.isArray(userEtiquetas) || typeof userEtiquetas !== 'object') return '';
					const etiquetasKeys = Object.keys(userEtiquetas);
					if (etiquetasKeys.length === 0) return '';
					return `
					  <div class=\"impacto-agentes\" style=\"margin-top: 15px; margin-bottom: 15px; padding-left: 15px; border-left: 4px solid #04db8d; background-color: rgba(4, 219, 141, 0.05);\">
						<div style=\"font-weight: 600; font-size: large; margin-bottom: 10px; color: #455862; padding: 5px;\">Impacto en agentes</div>
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
				
				return `
					<div class=\"data-item\">
					  <div class=\"header-row\"><div class=\"id-values\">${doc.short_name}</div><span class=\"date\"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span></div>
					  <div style=\"color: gray; font-size: 1.1em; margin-bottom: 6px;\">${rangoToShow} | ${doc.collectionName}</div>
					  ${matchedEtiquetasHtml}
					  <div class=\"resumen-label\">Resumen</div>
					  <div class=\"resumen-content\" style=\"font-size: 1.1em; line-height: 1.4;\">${doc.resumen}</div>
					  ${impactoAgentesHtml}
					  <div class=\"margin-impacto\"><a class=\"button-impacto\" href=\"/views/analisis/norma.html?documentId=${doc._id}&collectionName=${doc.collectionName}\">Analizar documento</a></div>
					  ${doc.url_pdf || doc.url_html ? `<a class=\"leer-mas\" href=\"${doc.url_pdf || doc.url_html}\" target=\"_blank\" style=\"margin-right: 15px;\">Leer más: ${doc._id}</a>` : `<span class=\"leer-mas\" style=\"margin-right: 15px; color: #ccc;\">Leer más: ${doc._id} (No disponible)</span>`}
					  
					  <!-- Botón de Guardar -->
					  <div class=\"guardar-button\">
						<button class=\"save-btn\" onclick=\"toggleListsDropdown(this, '${doc._id}', '${doc.collectionName}')\">
						  <i class=\"fas fa-bookmark\"></i>
						  Guardar
						</button>
						<div class=\"lists-dropdown\">
						  <div class=\"lists-dropdown-header\">
							<span>Guardar en...</span>
							<button class=\"save-ok-btn\" onclick=\"saveToSelectedLists(this)\">OK</button>
						  </div>
						  <div class=\"lists-content\">
							<div class=\"lists-container\">
							  <!-- Las listas se cargarán dinámicamente -->
							</div>
							<div class=\"add-new-list\" onclick=\"showNewListForm(this)\">
							  <i class=\"fas fa-plus\"></i>
							  Añadir nueva
							</div>
							<div class=\"new-list-form\">
							  <input type=\"text\" class=\"new-list-input\" placeholder=\"Nombre de la nueva lista\" maxlength=\"50\">
							  <div class=\"new-list-buttons\">
								<button class=\"new-list-btn cancel\" onclick=\"hideNewListForm(this)\">Cancelar</button>
								<button class=\"new-list-btn save\" onclick=\"createNewList(this, '${doc._id}', '${doc.collectionName}')\">OK</button>
							  </div>
							</div>
						  </div>
						</div>
					  </div>
					  
					  <span class=\"doc-seccion\" style=\"display:none;\">Disposiciones generales</span>
					  <span class=\"doc-rango\" style=\"display:none;\">${rangoToShow}</span>
					</div>`;
				}).join('');
		}
		return res.json({ documentsHtml, hideAnalyticsLabels: false, monthsForChart, countsForChart });
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