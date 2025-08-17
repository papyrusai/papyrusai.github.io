/*
Routes: Feedback capture and comments for user evaluations.
Endpoints:
- POST '/feedback-thumbs' (auth): stores thumbs up/down with optional details for a document
- POST '/api/feedback-analisis' (auth): stores user feedback on analysis content
- GET '/feedback': creates a feedback entry from email link and redirects to feedback.html with fid
- POST '/feedback-comment': adds a text comment to an existing feedback by fid
*/
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const moment = require('moment');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');

const router = express.Router();

const uri = process.env.DB_URI;
const mongodbOptions = {};

// Endpoint de prueba para verificar que el router funciona
router.get('/feedback-test', (req, res) => {
	console.log('=== FEEDBACK TEST ENDPOINT CALLED ===');
	res.json({ 
		status: 'ok', 
		message: 'Feedback router funcionando correctamente',
		timestamp: new Date().toISOString(),
		user: req.user ? { id: req.user._id, email: req.user.email } : null
	});
});

// POST /feedback-thumbs
router.post('/feedback-thumbs', ensureAuthenticated, async (req, res) => {
	console.log('=== FEEDBACK-THUMBS ENDPOINT CALLED ===');
	console.log('Request body:', JSON.stringify(req.body, null, 2));
	console.log('User authenticated:', !!req.user);
	console.log('User details:', req.user ? { id: req.user._id, email: req.user.email } : 'No user');
	console.log('Request headers:', req.headers);
	
	// Verificar autenticación primero
	if (!req.user) {
		console.log('ERROR: Usuario no autenticado');
		res.setHeader('Content-Type', 'application/json; charset=utf-8');
		return res.status(401).json({ error: 'User not authenticated' });
	}
	
	const { docId, feedback, agenteEtiquetado, coleccion, docUrl, docTitle, feedbackDetalle } = req.body;
	console.log('Extracted fields:', { docId, feedback, agenteEtiquetado, coleccion, docUrl, docTitle, feedbackDetalle });
	
	if (!docId || !feedback) {
		console.log('ERROR: Missing required fields - docId:', !!docId, 'feedback:', !!feedback);
		res.setHeader('Content-Type', 'application/json; charset=utf-8');
		return res.status(400).json({ error: 'Missing docId or feedback', received: { docId: !!docId, feedback: !!feedback } });
	}

	const userId = req.user._id;
	const userEmail = req.user.email;
	const now = new Date();
	
	// Asegurar que usamos la fecha actual correcta
	const dia = String(now.getDate()).padStart(2, '0');
	const mes = String(now.getMonth() + 1).padStart(2, '0');
	const anio = now.getFullYear();
	const dateStr = `${dia}-${mes}-${anio}`;
	
	console.log('Fecha actual:', { dia, mes, anio, dateStr, timestamp: now.toISOString() });

	let feedbackType = feedback;
	let feedbackDetail = feedbackDetalle || '';
	if (feedback && feedback.includes('dislike:')) {
		feedbackType = 'dislike';
		feedbackDetail = feedback.split('dislike:')[1].trim();
	} else if (feedback && feedback.includes('like')) {
		feedbackType = 'like';
	}
	
	console.log('Processed feedback:', { feedbackType, feedbackDetail, originalFeedback: feedback });

	const nuevaEvaluacion = {
		content_evaluated: 'etiquetado',
		doc_id: docId,
		coleccion: coleccion || 'No especificada',
		fecha: dateStr,
		feedback: feedbackType,
		doc_url: docUrl || '',
		agente_etiquetados: agenteEtiquetado || 'No especificado',
		feedback_detalle: feedbackDetail,
		doc_title: docTitle || '',
		collection_name: coleccion || 'No especificada',
	};

	console.log('Nueva evaluación a guardar:', nuevaEvaluacion);
	
	const client = new MongoClient(uri, mongodbOptions);
	try {
		console.log('Conectando a MongoDB...');
		await client.connect();
		console.log('Conexión exitosa a MongoDB');
		
		const database = client.db('papyrus');
		const feedbackCollection = database.collection('Feedback');
		console.log('Accediendo a colección Feedback... (db: papyrus, collection: Feedback)');

		if (!coleccion || coleccion === 'No especificada' || !docUrl) {
			const collectionNames = [
				'BOE',
				'CEPC',
				'CNMV',
				'ESMA',
				'EBA',
				'DOUE',
				'AEPD',
				'BANCO_ESPANA',
				'SEPBLAC',
				'CNMC',
				'INCIBE',
				'NIST',
				'BOJA',
				'BOCM',
				'DOGC',
				'DOGV',
				'DOG',
				'BOIB',
				'BOPV',
				'BOCYL',
				'DOE',
				'BOA',
				'BORM',
				'BOPA',
				'BOC',
				'BOCa',
				'BOCG',
				'DGSFP',
				'BCE',
				'EIOPA',
				'edpb',
				'aepd_guias',
				'eiopa_news',
				'NIST_NEWS',
				'EBA_QA',
				'ESMA_QA',
			];
			for (const collName of collectionNames) {
				try {
					const searchCriteria = {
						$or: [
							{ _id: docId },
							{ short_name: docId },
							{ title: docId },
							{ _id: { $regex: docId, $options: 'i' } },
							{ short_name: { $regex: docId, $options: 'i' } },
						],
					};
					const docFound = await database.collection(collName).findOne(searchCriteria);
					if (docFound) {
						if (!coleccion || coleccion === 'No especificada') nuevaEvaluacion.coleccion = collName;
						if (!docUrl) nuevaEvaluacion.doc_url = docFound.url_pdf || docFound.url_html || '';
						break;
					}
				} catch (_) {
					continue;
				}
			}
		}

		console.log('Buscando feedback existente para usuario:', userEmail);
		const existingFeedback = await feedbackCollection.findOne({ user_email: userEmail });
		console.log('Feedback existente encontrado:', existingFeedback ? 'SÍ' : 'NO');
		
		if (existingFeedback) {
			console.log('Actualizando feedback existente...');
			const updateResult = await feedbackCollection.updateOne(
				{ user_email: userEmail },
				{ $push: { evaluaciones: nuevaEvaluacion }, $set: { updated_at: now } }
			);
			console.log('Resultado de actualización:', updateResult);
		} else {
			console.log('Creando nuevo documento de feedback (agregado por usuario)...');
			const newFeedbackDoc = {
				user_id: userId,
				user_email: userEmail,
				created_at: now,
				updated_at: now,
				evaluaciones: [nuevaEvaluacion],
			};
			console.log('Documento agregado por usuario a insertar:', newFeedbackDoc);
			const insertResult = await feedbackCollection.insertOne(newFeedbackDoc);
			console.log('Resultado de inserción (agregado por usuario):', insertResult);
		}
		
		// Inserción adicional: guardar cada feedback como documento individual para facilitar consultas
		const feedbackEventDoc = {
			user_id: userId,
			user_email: userEmail,
			created_at: now,
			updated_at: now,
			content_evaluated: nuevaEvaluacion.content_evaluated,
			doc_id: nuevaEvaluacion.doc_id,
			coleccion: nuevaEvaluacion.coleccion,
			fecha: nuevaEvaluacion.fecha,
			feedback: nuevaEvaluacion.feedback,
			doc_url: nuevaEvaluacion.doc_url,
			agente_etiquetados: nuevaEvaluacion.agente_etiquetados,
			feedback_detalle: nuevaEvaluacion.feedback_detalle,
			doc_title: nuevaEvaluacion.doc_title,
			collection_name: nuevaEvaluacion.collection_name,
		};
		console.log('Insertando documento individual de evento de feedback...', feedbackEventDoc);
		const insertEventResult = await feedbackCollection.insertOne(feedbackEventDoc);
		console.log('Resultado de inserción de evento:', insertEventResult);
		
		console.log('✅ FEEDBACK GUARDADO EXITOSAMENTE ✅');
		console.log('Documento final guardado para:', userEmail);
		res.setHeader('Content-Type', 'application/json; charset=utf-8');
		return res.json({ 
			success: true, 
			message: 'Feedback saved successfully',
			data: {
				user: userEmail,
				feedback: feedbackType,
				doc_id: docId,
				agente: agenteEtiquetado,
				timestamp: now.toISOString()
			}
		});
	} catch (err) {
		console.error('=== ERROR SAVING FEEDBACK ===');
		console.error('Error details:', err);
		console.error('Stack trace:', err.stack);
		res.setHeader('Content-Type', 'application/json; charset=utf-8');
		return res.status(500).json({ error: 'Failed to save feedback', details: err.message });
	} finally {
		console.log('Cerrando conexión MongoDB...');
		await client.close();
		console.log('Conexión cerrada');
	}
});

// POST /api/feedback-analisis
router.post('/api/feedback-analisis', ensureAuthenticated, async (req, res) => {
	const { documentId, collectionName, userPrompt, analysisResults, fecha, feedback, content_evaluated } = req.body;
	if (!documentId || !feedback) {
		res.setHeader('Content-Type', 'application/json; charset=utf-8');
		return res.status(400).json({ error: 'Missing required fields' });
	}
	const userId = req.user._id;
	const userEmail = req.user.email;
	const feedbackDoc = {
		user_id: userId,
		user_email: userEmail,
		content_evaluated: content_evaluated || 'analisis_impacto',
		doc_id: documentId,
		collection_name: collectionName,
		user_prompt: userPrompt,
		analysis_results: analysisResults,
		fecha,
		feedback,
	};
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const database = client.db('papyrus');
		await database.collection('Feedback').insertOne(feedbackDoc);
		res.setHeader('Content-Type', 'application/json; charset=utf-8');
		return res.json({ success: true, message: 'Feedback saved successfully' });
	} catch (err) {
		console.error('Error saving feedback:', err);
		res.setHeader('Content-Type', 'application/json; charset=utf-8');
		return res.status(500).json({ error: 'Failed to save feedback' });
	} finally {
		await client.close();
	}
});

// GET /feedback
router.get('/feedback', async (req, res) => {
	try {
		const userId = req.query.userId;
		const grade = parseInt(req.query.grade, 10);
		if (!userId || !grade) return res.status(400).send('Faltan parámetros');
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const db = client.db('papyrus');
		const feedbackCol = db.collection('Feedback');
		const usersCol = db.collection('users');
		const userInDB = await usersCol.findOne({ _id: new ObjectId(userId) });
		if (!userInDB) {
			await client.close();
			return res.status(404).send('Usuario no encontrado');
		}
		const fecha = moment().format('DD-MM-YYYY');
		const newFeedback = { user_id: new ObjectId(userId), user_email: userInDB.email, content_evaluated: 'email', fecha, grade, comentario: '' };
		const result = await feedbackCol.insertOne(newFeedback);
		const feedbackId = result.insertedId;
		await client.close();
		return res.redirect(`https://app.reversa.ai/feedback.html?fid=${feedbackId}`);
	} catch (err) {
		console.error('Error en /feedback =>', err);
		return res.status(500).send('Error guardando feedback');
	}
});

// POST /feedback-comment
router.post('/feedback-comment', express.json(), async (req, res) => {
	try {
		const { fid, comentario } = req.body;
		if (!fid || !ObjectId.isValid(fid)) return res.status(400).send('Parámetros inválidos (fid)');
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const db = client.db('papyrus');
		await db.collection('Feedback').updateOne({ _id: new ObjectId(fid) }, { $set: { comentario } });
		await client.close();
		return res.status(200).send('OK');
	} catch (err) {
		console.error('Error en /feedback-comment =>', err);
		return res.status(500).send('Error guardando comentario');
	}
});

module.exports = router;