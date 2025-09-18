/*
Routes: Boletín diario APIs to drive the daily bulletin view and filters.
Endpoints:
- GET '/api/available-collections' (auth): returns available boletines (collections) for filters
- GET '/api/boletin-diario' (auth): returns the latest date with documents across selected boletines and rangos
*/
const express = require('express');
const { ObjectId } = require('mongodb');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');

const router = express.Router();

const { expandCollectionsWithTest, collectionExists, withDatabase } = require('../services/db.utils');

// ------------------------- Available Collections for Boletin Diario -----------------------------
router.get('/api/available-collections', ensureAuthenticated, async (req, res) => {
	try {
		const result = await withDatabase(async (database) => {
			const allCollections = await database.listCollections().toArray();
			const excludedCollections = ['logs', 'Feedback', 'Ramas boja', 'Ramas UE', 'users', 'embedding_alerts', 'embedding_filter_metrics', 'tag_change_log', 'tag_embeddings'];

			const availableCollections = [];
			for (const collection of allCollections) {
				const collectionName = collection.name;
				if (!excludedCollections.includes(collectionName) && !collectionName.endsWith('_test')) {
					availableCollections.push(collectionName.toUpperCase());
				}
			}

			availableCollections.sort();
			return { collections: availableCollections };
		});

		return res.json(result);
	} catch (error) {
		console.error('Error fetching available collections:', error);
		res.status(500).json({ error: 'Error interno del servidor' });
	}
});

// ------------------------- Boletin Diario -----------------------------
router.get('/api/boletin-diario', ensureAuthenticated, async (req, res) => {
	try {
		const result = await withDatabase(async (database) => {
			const usersCollection = database.collection('users');

			const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
			if (!user) {
				return { error: 'User not found' };
			}

			let userBoletines = [];
			const fuentesGobierno =
				user.cobertura_legal?.['fuentes-gobierno'] ||
				user.cobertura_legal?.fuentes_gobierno ||
				user.cobertura_legal?.fuentes || [];
			if (fuentesGobierno.length > 0) {
				userBoletines = userBoletines.concat(fuentesGobierno);
			}

			const fuentesReguladores =
				user.cobertura_legal?.['fuentes-reguladores'] ||
				user.cobertura_legal?.fuentes_reguladores ||
				user.cobertura_legal?.['fuentes-regulador'] ||
				user.cobertura_legal?.reguladores || [];
			if (fuentesReguladores.length > 0) {
				userBoletines = userBoletines.concat(fuentesReguladores);
			}
			userBoletines = userBoletines.map((b) => b.toUpperCase());
			if (userBoletines.length === 0) {
				userBoletines = ['BOE'];
			}

			const { boletines, rangos } = req.query;
			const selectedBoletines = boletines ? JSON.parse(boletines) : userBoletines;

			let allRangos = [
				'Acuerdos Internacionales',
				'Normativa Europea',
				'Legislacion Nacional',
				'Normativa Reglamentaria',
				'Decisiones Judiciales',
				'Doctrina Administrativa',
				'Comunicados, Guias y Opiniones Consultivas',
				'Consultas Publicas',
				'Normativa en tramitación',
				'Otras',
			];

			const selectedRangos = rangos && JSON.parse(rangos).length > 0 ? JSON.parse(rangos) : allRangos;

			const todayProjection = {
				short_name: 1,
				divisiones: 1,
				resumen: 1,
				dia: 1,
				mes: 1,
				anio: 1,
				url_pdf: 1,
				url_html: 1,
				ramas_juridicas: 1,
				rango_titulo: 1,
				_id: 1,
			};

			const today = new Date();
			let foundDocuments = [];
			let foundDate = null;

			for (let daysAgo = 0; daysAgo <= 60; daysAgo++) {
				const checkDate = new Date();
				checkDate.setDate(today.getDate() - daysAgo);

				const dateQuery = {
					anio: checkDate.getFullYear(),
					mes: checkDate.getMonth() + 1,
					dia: checkDate.getDate(),
					rango_titulo: { $in: selectedRangos },
				};

				let documentsOnDate = [];
				const expandedBoletines = expandCollectionsWithTest(selectedBoletines).filter(n => !String(n).toLowerCase().endsWith('_test'));

				for (const collectionName of expandedBoletines) {
					try {
						const exists = await collectionExists(database, collectionName);
						if (!exists) continue;

						const coll = database.collection(collectionName);
						const docs = await coll.find(dateQuery).project(todayProjection).toArray();
						if (docs.length > 0) {
							docs.forEach((doc) => {
								doc.collectionName = collectionName;
							});
							documentsOnDate = documentsOnDate.concat(docs);
						}
					} catch (err) {
						console.error(`Error fetching docs for collection ${collectionName} on date ${checkDate.toISOString()}:`, err);
					}
				}

				if (documentsOnDate.length > 0) {
					foundDocuments = documentsOnDate;
					foundDate = {
						dia: checkDate.getDate(),
						mes: checkDate.getMonth() + 1,
						anio: checkDate.getFullYear(),
					};
					break;
				}
			}

			if (foundDocuments.length > 0) {
				foundDocuments.sort((a, b) => {
					if (a.collectionName < b.collectionName) return -1;
					if (a.collectionName > b.collectionName) return 1;
					return (a.short_name || '').localeCompare(b.short_name || '');
				});
			}

			return {
				date: foundDate,
				documents: foundDocuments,
				availableBoletines: userBoletines,
				availableRangos: allRangos,
			};
		});

		return res.json(result);
	} catch (error) {
		console.error('Error in boletin-diario:', error);
		res.status(500).json({ error: 'Error interno del servidor' });
	}
});

module.exports = router; 
// ------------------------- Iniciativas Parlamentarias (iniciativas_legislativas) -----------------------------
router.get('/api/iniciativas-parlamentarias', ensureAuthenticated, async (req, res) => {
	try {
		const result = await withDatabase(async (database) => {
			const desiredCollections = ['BOCG_test', 'MONCLOA_REFERENCIAS_test', 'OEIL_test'];
			const allCollections = await database.listCollections({}, { nameOnly: true }).toArray();
			const availableNames = allCollections.map(c => String(c.name));
			const resolvedCollections = [];
			for (const desired of desiredCollections) {
				const found = availableNames.find(n => n.toLowerCase() === desired.toLowerCase());
				if (found) resolvedCollections.push(found);
			}
			if (resolvedCollections.length === 0) {
				return { date: null, iniciativas: [], fuentes: [] };
			}
			const projection = {
				_id: 1,
				anio: 1,
				mes: 1,
				dia: 1,
				url_pdf: 1,
				pdf_url: 1,
				url_html: 1,
				iniciativas_legislativas: 1,
			};

			const today = new Date();
			const maxDays = 60;
			let aggregated = [];
			const seen = new Set();

			for (let daysAgo = 0; daysAgo <= maxDays; daysAgo++) {
				const checkDate = new Date();
				checkDate.setDate(today.getDate() - daysAgo);

				const startOfDay = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate());
				const endOfDay = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate() + 1);

				const dateQuery = {
					$and: [
						{ 'iniciativas_legislativas.iniciativas.0': { $exists: true } },
						{
							$or: [
								{ anio: startOfDay.getFullYear(), mes: startOfDay.getMonth() + 1, dia: startOfDay.getDate() },
								{ fecha_publicacion: { $gte: startOfDay, $lt: endOfDay } },
								{ fecha: { $gte: startOfDay, $lt: endOfDay } },
								{ date: { $gte: startOfDay, $lt: endOfDay } },
							],
						},
					],
				};

				for (const collectionName of resolvedCollections) {
					try {
						const exists = await collectionExists(database, collectionName);
						if (!exists) continue;

						const coll = database.collection(collectionName);
						const docs = await coll.find(dateQuery).project(projection).toArray();
						if (docs.length === 0) continue;

						for (const doc of docs) {
							const initiatives = doc?.iniciativas_legislativas?.iniciativas || [];
							if (!Array.isArray(initiatives) || initiatives.length === 0) continue;

							const link = doc.pdf_url || doc.url_pdf || doc.url_html || null;

                            initiatives.forEach((ini, idx) => {
								// Fecha preferida: del documento (anio/mes/dia) y si no de datetime_insert
								let displayDate = '';
								if (Number.isInteger(doc?.anio) && Number.isInteger(doc?.mes) && Number.isInteger(doc?.dia)) {
									const d = String(doc.dia).padStart(2, '0');
									const m = String(doc.mes).padStart(2, '0');
									const y = String(doc.anio).padStart(4, '0');
									displayDate = `${d}-${m}-${y}`;
								} else if (doc?.datetime_insert) {
									const dt = new Date(doc.datetime_insert);
									if (!isNaN(dt.getTime())) {
										const d = String(dt.getDate()).padStart(2, '0');
										const m = String(dt.getMonth() + 1).padStart(2, '0');
										const y = String(dt.getFullYear());
										displayDate = `${d}-${m}-${y}`;
									}
								}

								const key = `${collectionName}|${String(doc._id)}|${idx}`;
								if (seen.has(key)) return;
								seen.add(key);

                                aggregated.push({
									id: ini?.id || `${String(doc._id)}-${idx + 1}`,
									sector: ini?.sector || 'No especificado',
                                    subsector: ini?.subsector || 'No especificado',
									tema: ini?.tema || 'No especificado',
									marco: ini?.marco_geografico || 'No especificado',
									titulo: ini?.titulo_iniciativa || 'Sin título',
									fuente: collectionName,
									proponente: ini?.proponente || 'No especificado',
									tipo: ini?.tipo_iniciativa || 'No especificado',
									fecha: displayDate,
									link: link,
									doc_id: String(doc._id),
								});
							});
						}
					} catch (err) {
						console.error(`Error fetching iniciativas for collection ${collectionName} on date ${checkDate.toISOString()}:`, err);
					}
				}
			}

			aggregated.sort((a, b) => {
				if (a.fuente < b.fuente) return -1;
				if (a.fuente > b.fuente) return 1;
				return (a.titulo || '').localeCompare(b.titulo || '');
			});

			return {
				date: null,
				iniciativas: aggregated,
				fuentes: resolvedCollections,
			};
		});

		return res.json(result);
	} catch (error) {
		console.error('Error in iniciativas-parlamentarias:', error);
		res.status(500).json({ error: 'Error interno del servidor' });
	}
});

// ------------------------- Iniciativas Legales (clasificacion_boletin) -----------------------------
router.get('/api/iniciativas-legales', ensureAuthenticated, async (req, res) => {
	try {
		const result = await withDatabase(async (database) => {
			// Fuentes base provistas; si test=yes, añadir sufijo _test
			const baseCollections = [
				'BOE','DOUE','BOA','BOCA','BOC','BOCM','BOCYL','BOIB','BON','BOPA','BOR','BORM','BOJA','BOPV','DOCM','DOG','DOGC','DOGV','DOE','BOCCE','BOME','BOPA_andorra'
			];
			const isTest = String(req.query?.test || 'yes').toLowerCase() === 'yes';
			let requestedFuentes = null;
			if (typeof req.query?.fuentes === 'string' && req.query.fuentes.length > 0) {
				try { const parsed = JSON.parse(req.query.fuentes); if (Array.isArray(parsed)) { requestedFuentes = parsed.map((s) => String(s)); } }
				catch { requestedFuentes = String(req.query.fuentes).split(',').map((s) => s.trim()).filter(Boolean); }
			}
			let selectedBase = baseCollections;
			if (Array.isArray(requestedFuentes) && requestedFuentes.length > 0) {
				const reqSet = new Set(requestedFuentes.map((s) => s.toLowerCase()));
				selectedBase = baseCollections.filter((n) => reqSet.has(n.toLowerCase()));
			}
			// Por defecto si no se envía fuentes, usar solo BOE_test para mayor rapidez
			if (!requestedFuentes || requestedFuentes.length === 0) {
				selectedBase = ['BOE'];
			}
			const desiredCollections = selectedBase.map((n) => isTest ? `${n}_test` : n);

			const projection = { _id: 1, anio: 1, mes: 1, dia: 1, url_pdf: 1, pdf_url: 1, url_html: 1, fecha_publicacion: 1, fecha: 1, date: 1, datetime_insert: 1, clasificacion_boletin: 1 };

			const today = new Date();
			const maxDays = 60;
			const aggregated = [];
			const seen = new Set();

			const parseYmd = (s) => { const [y, m, d] = s.split('-').map((v) => parseInt(v, 10)); if (!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d)) return null; const dt = new Date(y, m-1, d); return isNaN(dt.getTime()) ? null : dt; };
			const dateParam = typeof req.query?.date === 'string' && req.query.date.length === 10 ? parseYmd(req.query.date) : null;
			const desdeParam = typeof req.query?.desde === 'string' && req.query.desde.length === 10 ? parseYmd(req.query.desde) : null;
			const hastaParam = typeof req.query?.hasta === 'string' && req.query.hasta.length === 10 ? parseYmd(req.query.hasta) : null;
			// Nuevo: filtros por datetime_insert (>= desde_insert startOfDay, <= hasta_insert endOfDay)
			const insertHastaParam = typeof req.query?.hasta_insert === 'string' && req.query.hasta_insert.length === 10 ? parseYmd(req.query.hasta_insert) : null;
			const insertDesdeParam = typeof req.query?.desde_insert === 'string' && req.query.desde_insert.length === 10 ? parseYmd(req.query.desde_insert) : null;

			const useExplicitRange = !!(dateParam || desdeParam || hastaParam);
			let start = null, endExclusive = null;
			if (useExplicitRange) {
				if (dateParam) {
					start = new Date(dateParam.getFullYear(), dateParam.getMonth(), dateParam.getDate());
					endExclusive = new Date(dateParam.getFullYear(), dateParam.getMonth(), dateParam.getDate()+1);
				} else {
					if (desdeParam) start = new Date(desdeParam.getFullYear(), desdeParam.getMonth(), desdeParam.getDate());
					if (hastaParam) endExclusive = new Date(hastaParam.getFullYear(), hastaParam.getMonth(), hastaParam.getDate()+1);
					if (start && !endExclusive) endExclusive = new Date(start.getFullYear(), start.getMonth(), start.getDate()+1);
					if (!start && endExclusive) { const tmp = new Date(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate()-1); start = new Date(tmp.getFullYear(), tmp.getMonth(), tmp.getDate()); }
				}
			}


			// Modo nuevo: filtros por datetime_insert
			if (insertDesdeParam || insertHastaParam) {
				const startInclusiveInsert = insertDesdeParam ? new Date(insertDesdeParam.getFullYear(), insertDesdeParam.getMonth(), insertDesdeParam.getDate()) : null;
				const endExclusiveInsert = insertHastaParam ? new Date(insertHastaParam.getFullYear(), insertHastaParam.getMonth(), insertHastaParam.getDate() + 1) : null;
				const buildMatch = () => {
					const cond = { clasificacion_boletin: { $exists: true } };
					if (startInclusiveInsert && endExclusiveInsert) cond.datetime_insert = { $gte: startInclusiveInsert, $lt: endExclusiveInsert };
					else if (startInclusiveInsert) cond.datetime_insert = { $gte: startInclusiveInsert };
					else if (endExclusiveInsert) cond.datetime_insert = { $lt: endExclusiveInsert };
					return cond;
				};
				for (const collectionName of desiredCollections) {
					try {
						const exists = await collectionExists(database, collectionName); if (!exists) continue;
						const docs = await database.collection(collectionName).aggregate([
							{ $match: buildMatch() },
							{ $project: projection }
						]).toArray();
						if (docs.length === 0) continue;
						for (const doc of docs) {
							const cb = doc?.clasificacion_boletin || {};
							const key = `${collectionName}|${String(doc._id)}`; if (seen.has(key)) continue; seen.add(key);
							let displayDate = '';
							if (Number.isInteger(doc?.anio) && Number.isInteger(doc?.mes) && Number.isInteger(doc?.dia)) { const d = String(doc.dia).padStart(2,'0'); const m = String(doc.mes).padStart(2,'0'); const y = String(doc.anio).padStart(4,'0'); displayDate = `${d}-${m}-${y}`; }
							else if (doc?.datetime_insert) { const dt = new Date(doc.datetime_insert); if (!isNaN(dt.getTime())) { const d = String(dt.getDate()).padStart(2,'0'); const m = String(dt.getMonth()+1).padStart(2,'0'); const y = String(dt.getFullYear()); displayDate = `${d}-${m}-${y}`; } }
							const link = doc.pdf_url || doc.url_pdf || doc.url_html || null;
							aggregated.push({ id: String(doc._id), sector: Array.isArray(cb?.sector) ? cb.sector : (cb?.sector ? [cb.sector] : []), subsector: Array.isArray(cb?.subsector) ? cb.subsector : (cb?.subsector ? [cb.subsector] : []), tema: cb?.tema || 'Sin tema', marco: cb?.marco_geografico || 'No especificado', fuente: collectionName, proponente: cb?.proponente || 'No especificado', rango: cb?.rango_legal || 'No especificado', subgrupo: cb?.subgrupo || 'No especificado', fecha: displayDate, link, doc_id: String(doc._id) });
						}
					} catch (err) { console.error(`Error fetching iniciativas legales (insert filters) for ${collectionName}:`, err); }
				}
			} else if (useExplicitRange) {
				for (const collectionName of desiredCollections) {
					try {
						const exists = await collectionExists(database, collectionName); if (!exists) continue;
						const docs = await database.collection(collectionName).aggregate([
							{ $match: { clasificacion_boletin: { $exists: true } } },
							{ $addFields: { __effectiveDate: { $ifNull: [ "$fecha_publicacion", { $ifNull: [ "$fecha", "$datetime_insert" ] } ] } } },
							{ $match: { __effectiveDate: { $gte: start, $lt: endExclusive } } },
							{ $project: projection }
						]).toArray();
						if (docs.length === 0) continue;
						for (const doc of docs) {
							const cb = doc?.clasificacion_boletin || {};
							const key = `${collectionName}|${String(doc._id)}`; if (seen.has(key)) continue; seen.add(key);
							let displayDate = '';
							if (Number.isInteger(doc?.anio) && Number.isInteger(doc?.mes) && Number.isInteger(doc?.dia)) { const d = String(doc.dia).padStart(2,'0'); const m = String(doc.mes).padStart(2,'0'); const y = String(doc.anio).padStart(4,'0'); displayDate = `${d}-${m}-${y}`; }
							else if (doc?.datetime_insert) { const dt = new Date(doc.datetime_insert); if (!isNaN(dt.getTime())) { const d = String(dt.getDate()).padStart(2,'0'); const m = String(dt.getMonth()+1).padStart(2,'0'); const y = String(dt.getFullYear()); displayDate = `${d}-${m}-${y}`; } }
							const link = doc.pdf_url || doc.url_pdf || doc.url_html || null;
							aggregated.push({ id: String(doc._id), sector: Array.isArray(cb?.sector) ? cb.sector : (cb?.sector ? [cb.sector] : []), subsector: Array.isArray(cb?.subsector) ? cb.subsector : (cb?.subsector ? [cb.subsector] : []), tema: cb?.tema || 'Sin tema', marco: cb?.marco_geografico || 'No especificado', fuente: collectionName, proponente: cb?.proponente || 'No especificado', rango: cb?.rango_legal || 'No especificado', subgrupo: cb?.subgrupo || 'No especificado', fecha: displayDate, link, doc_id: String(doc._id) });
						}
					} catch (err) { console.error(`Error fetching iniciativas legales (explicit range) for ${collectionName}:`, err); }
				}
			} else {
				// Rolling last 60 days, day-by-day, using effective date
				for (let daysAgo = 0; daysAgo <= maxDays; daysAgo++) {
					const checkDate = new Date(); checkDate.setDate(today.getDate() - daysAgo);
					const startOfDay = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate());
					const endOfDay = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate() + 1);
					for (const collectionName of desiredCollections) {
						try {
							const exists = await collectionExists(database, collectionName); if (!exists) continue;
							const docs = await database.collection(collectionName).aggregate([
								{ $match: { clasificacion_boletin: { $exists: true } } },
								{ $addFields: { __effectiveDate: { $ifNull: [ "$fecha_publicacion", { $ifNull: [ "$fecha", "$datetime_insert" ] } ] } } },
								{ $match: { __effectiveDate: { $gte: startOfDay, $lt: endOfDay } } },
								{ $project: projection }
							]).toArray();
							if (docs.length === 0) continue;
							for (const doc of docs) {
								const cb = doc?.clasificacion_boletin || {};
								const key = `${collectionName}|${String(doc._id)}`; if (seen.has(key)) continue; seen.add(key);
								let displayDate = '';
								if (Number.isInteger(doc?.anio) && Number.isInteger(doc?.mes) && Number.isInteger(doc?.dia)) { const d = String(doc.dia).padStart(2,'0'); const m = String(doc.mes).padStart(2,'0'); const y = String(doc.anio).padStart(4,'0'); displayDate = `${d}-${m}-${y}`; }
								else if (doc?.datetime_insert) { const dt = new Date(doc.datetime_insert); if (!isNaN(dt.getTime())) { const d = String(dt.getDate()).padStart(2,'0'); const m = String(dt.getMonth()+1).padStart(2,'0'); const y = String(dt.getFullYear()); displayDate = `${d}-${m}-${y}`; } }
								const link = doc.pdf_url || doc.url_pdf || doc.url_html || null;
								aggregated.push({ id: String(doc._id), sector: Array.isArray(cb?.sector) ? cb.sector : (cb?.sector ? [cb.sector] : []), subsector: Array.isArray(cb?.subsector) ? cb.subsector : (cb?.subsector ? [cb.subsector] : []), tema: cb?.tema || 'Sin tema', marco: cb?.marco_geografico || 'No especificado', fuente: collectionName, proponente: cb?.proponente || 'No especificado', rango: cb?.rango_legal || 'No especificado', subgrupo: cb?.subgrupo || 'No especificado', fecha: displayDate, link, doc_id: String(doc._id) });
							}
						} catch (err) { console.error(`Error fetching iniciativas legales (rolling) for ${collectionName}:`, err); }
					}
				}
			}

			aggregated.sort((a, b) => { if (a.fuente < b.fuente) return -1; if (a.fuente > b.fuente) return 1; return (a.tema || '').localeCompare(b.tema || ''); });
			return { date: null, iniciativas: aggregated, fuentes: desiredCollections };
		});

		return res.json(result);
	} catch (error) {
		console.error('Error in iniciativas-legales:', error);
		res.status(500).json({ error: 'Error interno del servidor' });
	}
});