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
// ------------------------- Iniciativas Parlamentarias (legal_initiatives) -----------------------------
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
				legal_initiatives: 1,
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
						{ 'legal_initiatives.iniciativas.0': { $exists: true } },
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
							const initiatives = doc?.legal_initiatives?.iniciativas || [];
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