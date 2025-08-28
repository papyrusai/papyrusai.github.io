/*
Routes: Generación de contenido (ajustes y generación de marketing)
Endpoints:
- POST '/api/save-generation-settings' (auth): guarda ajustes por lista
- POST '/api/get-generation-settings' (auth): obtiene ajustes por lista
- POST '/api/generate-marketing-content' (auth): genera contenido de marketing vía Python
*/
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getEtiquetasPersonalizadasAdapter } = require('../services/enterprise.service');

// Ensure fetch is available
if (typeof fetch === 'undefined') {
	global.fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

const router = express.Router();
const uri = process.env.DB_URI;
const mongodbOptions = {};

// Helpers: load YAML-style prompts and render with tokens
function loadYamlPrompts(filePath) {
	try {
		const mdText = fs.readFileSync(filePath, 'utf8');
		const trimmed = mdText.trimStart();
		const result = {};
		if (trimmed.startsWith('---')) {
			const endIdx = trimmed.indexOf('\n---');
			if (endIdx !== -1) {
				const yamlBlock = trimmed.substring(3, endIdx + 1);
				const lines = yamlBlock.split('\n');
				let currentKey = null;
				let collectingBlock = false;
				let buffer = [];
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					const keyMatch = line.match(/^([A-Z_]+):\s*(\|)?\s*$/);
					if (keyMatch) {
						if (currentKey) {
							result[currentKey] = buffer.join('\n').replace(/\s+$/, '');
						}
						currentKey = keyMatch[1].trim();
						collectingBlock = !!keyMatch[2];
						buffer = [];
					} else if (currentKey) {
						if (collectingBlock) {
							const contentLine = line.replace(/^\s{2}/, '');
							buffer.push(contentLine);
						}
					}
				}
				if (currentKey) {
					result[currentKey] = buffer.join('\n').replace(/\s+$/, '');
				}
			}
		}
		return result;
	} catch (e) {
		console.error('Error loading YAML prompts:', e.message);
		return {};
	}
}

function renderTemplate(tpl, replacements) {
	let out = (tpl || '').slice();
	for (const [k, v] of Object.entries(replacements || {})) {
		const token = new RegExp('\\{\\{'+k+'\\}\\}', 'g');
		out = out.replace(token, (v ?? '').toString());
	}
	return out;
}

// API para guardar configuraciones de generación
router.post('/api/save-generation-settings', ensureAuthenticated, async (req, res) => {
	try {
		const { listName, instrucciones_generales, color_palette, language, documentType, logo } = req.body;
		const userEmail = req.user.email;
		if (!listName) {
			return res.status(400).json({ error: 'El nombre de la lista es requerido' });
		}
		const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
		await client.connect();
		const db = client.db('papyrus');
		const usersCollection = db.collection('users');
		const user = await usersCollection.findOne({ email: userEmail });
		if (!user) {
			await client.close();
			return res.status(404).json({ error: 'Usuario no encontrado' });
		}
		const settingsData = {
			instrucciones_generales: instrucciones_generales || '',
			color_palette: color_palette || { primary: '#04db8d', secondary: '#0b2431', text: '#455862' },
			language: language || 'juridico',
			documentType: documentType || 'whatsapp',
			updatedAt: new Date()
		};
		if (logo) { settingsData.logo = logo; }
		const updateQuery = { $set: { [`guardados_ajustes.${listName}`]: settingsData } };
		const result = await usersCollection.updateOne({ email: userEmail }, updateQuery);
		await client.close();
		if (result.modifiedCount > 0) {
			res.json({ success: true, message: 'Configuraciones guardadas exitosamente', settings: settingsData });
		} else {
			res.status(500).json({ error: 'No se pudieron guardar las configuraciones' });
		}
	} catch (error) {
		console.error('Error saving generation settings:', error);
		res.status(500).json({ error: 'Error interno del servidor' });
	}
});

// API para obtener configuraciones de generación
router.post('/api/get-generation-settings', ensureAuthenticated, async (req, res) => {
	try {
		const { listName } = req.body;
		const userEmail = req.user.email;
		if (!listName) {
			return res.status(400).json({ error: 'El nombre de la lista es requerido' });
		}
		const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
		await client.connect();
		const db = client.db('papyrus');
		const usersCollection = db.collection('users');
		const user = await usersCollection.findOne({ email: userEmail }, { projection: { guardados_ajustes: 1 } });
		await client.close();
		if (!user) {
			return res.status(404).json({ error: 'Usuario no encontrado' });
		}
		const settings = user.guardados_ajustes && user.guardados_ajustes[listName] ? user.guardados_ajustes[listName] : null;
		res.json({ success: true, settings });
	} catch (error) {
		console.error('Error getting generation settings:', error);
		res.status(500).json({ error: 'Error interno del servidor' });
	}
});

// Endpoint para generar contenido de marketing con IA
router.post('/api/generate-marketing-content', ensureAuthenticated, async (req, res) => {
	try {
		const userEmail = req.user.email;
		const { selectedDocuments, instructions, language, documentType, idioma, colorPalette } = req.body;
		if (!selectedDocuments || !Array.isArray(selectedDocuments) || selectedDocuments.length === 0) {
			return res.status(400).json({ success: false, error: 'No se proporcionaron documentos válidos' });
		}
		if (!instructions || typeof instructions !== 'string' || instructions.trim().length === 0) {
			return res.status(400).json({ success: false, error: 'Las instrucciones son requeridas' });
		}
		console.log(`Generating marketing content for user: ${userEmail}`);
		console.log(`Instructions: ${instructions.substring(0, 100)}...`);
		console.log(`User ID: ${req.user._id}`);
		const client = new MongoClient(uri, mongodbOptions);
		let enrichedDocuments = [];
		try {
			await client.connect();
			const database = client.db('papyrus');
			const usersCollection = database.collection('users');
			// ENTERPRISE ADAPTER: Obtener etiquetas según tipo de cuenta (empresa/individual)
			const etiquetasResult = await getEtiquetasPersonalizadasAdapter(req.user);
			const userEtiquetasDefiniciones = etiquetasResult.etiquetas_personalizadas || {};
			console.log(`User tag definitions found: ${Object.keys(userEtiquetasDefiniciones).length} tags`);
			for (const doc of selectedDocuments) {
				const enrichedDoc = { ...doc };
				if (doc.collectionName && doc.short_name) {
					const collection = database.collection(doc.collectionName);
					console.log(`Searching for document with short_name: ${doc.short_name} in collection: ${doc.collectionName}`);
					const originalDoc = await collection.findOne({ short_name: doc.short_name }, { projection: { etiquetas_personalizadas: 1, short_name: 1 } });
					if (originalDoc && originalDoc.etiquetas_personalizadas) {
						const userId = req.user._id.toString();
						console.log(`Checking etiquetas_personalizadas for doc ${doc.short_name}, userId: ${userId}`);
						if (originalDoc.etiquetas_personalizadas[userId]) {
							console.log(`Found user tags for document: ${Object.keys(originalDoc.etiquetas_personalizadas[userId]).length} tags`);
							enrichedDoc.etiquetas_personalizadas = { [userId]: originalDoc.etiquetas_personalizadas[userId] };
						} else {
							console.log(`No user tags found for document ${doc.short_name}`);
							enrichedDoc.etiquetas_personalizadas = {};
						}
					} else {
						console.log(`No etiquetas_personalizadas field in document ${doc.short_name}`);
						enrichedDoc.etiquetas_personalizadas = {};
					}
				} else {
					console.log(`Missing short_name or collectionName for document ${doc.short_name}`);
					enrichedDoc.etiquetas_personalizadas = {};
				}
				enrichedDocuments.push(enrichedDoc);
			}
		} catch (dbError) {
			console.error('Error enriching documents with user tags:', dbError);
			enrichedDocuments = selectedDocuments.map(doc => ({ ...doc, etiquetas_personalizadas: {} }));
		} finally {
			await client.close();
		}
		const pythonInput = { documents: enrichedDocuments, instructions: instructions.trim(), language: language || 'juridico', documentType: documentType || 'whatsapp', idioma: idioma || 'español' };
		const pythonProcess = spawn('python', [path.join(__dirname, '..', 'python', 'marketing.py')], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
		pythonProcess.stdin.write(JSON.stringify(pythonInput));
		pythonProcess.stdin.end();
		let pythonOutput = '';
		let pythonError = '';
		pythonProcess.stdout.setEncoding('utf8');
		pythonProcess.stderr.setEncoding('utf8');
		pythonProcess.stdout.on('data', (data) => { pythonOutput += data.toString('utf8'); });
		pythonProcess.stderr.on('data', (data) => { const logData = data.toString('utf8'); console.log(logData); pythonError += logData; });
		pythonProcess.on('close', (code) => {
			const sendCleanResult = (cleanStr) => {
				try {
					let jsonString = cleanStr.trim();
					const jsonMatch = jsonString.match(/\{[^}]*"html_response"[^}]*\}/s);
					if (jsonMatch) { jsonString = jsonMatch[0]; }
					const jsonResult = JSON.parse(jsonString);
					if (jsonResult.html_response) {
						let htmlContent = jsonResult.html_response;
						htmlContent = htmlContent.replace(/\\n/g, '\n');
						htmlContent = htmlContent.replace(/\\\"/g, '"');
						htmlContent = htmlContent.replace(/\\\\/g, '\\');
						res.setHeader('Content-Type', 'text/html; charset=utf-8');
						res.send(htmlContent);
						return;
					} else if (jsonResult.error) {
						res.setHeader('Content-Type', 'application/json; charset=utf-8');
						return res.status(500).json(jsonResult);
					}
				} catch (e) {
					if (cleanStr.includes('{"html_response"')) {
						try {
							const startIndex = cleanStr.indexOf('{"html_response"');
							const endIndex = cleanStr.lastIndexOf('}') + 1;
							if (startIndex !== -1 && endIndex > startIndex) {
								const jsonStr = cleanStr.substring(startIndex, endIndex);
								const jsonResult = JSON.parse(jsonStr);
								if (jsonResult.html_response) {
									let htmlContent = jsonResult.html_response;
									htmlContent = htmlContent.replace(/\\n/g, '\n');
									htmlContent = htmlContent.replace(/\\\"/g, '"');
									htmlContent = htmlContent.replace(/\\\\/g, '\\');
									res.setHeader('Content-Type', 'text/html; charset=utf-8');
									res.send(htmlContent);
									return;
								}
							}
						} catch (e2) { }
					}
				}
				const isHtml = cleanStr.includes('<h2>') || cleanStr.includes('<p>') || cleanStr.includes('<table>') || cleanStr.includes('<html>');
				if (isHtml) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); } else { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); }
				res.send(cleanStr);
			};
			let cleanResult = pythonOutput.trim();
			const hasValidContent = cleanResult.length > 0 && (cleanResult.includes('<h2>') || cleanResult.includes('<p>') || cleanResult.includes('<table>') || cleanResult.includes('<html>'));
			if (code !== 0 && hasValidContent) { console.warn(`Python script exited with code ${code} but generated valid content. Proceeding with content.`); console.warn(`Error output (ignored): ${pythonError}`); return sendCleanResult(cleanResult); }
			if (code !== 0) { console.error(`Python script exited with code ${code} and no valid content`, pythonError); res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.status(500).json({ error: 'PYTHON_SCRIPT_ERROR', message: 'Error: Ocurrió un error inesperado al procesar la respuesta del análisis. Prueba de nuevo por favor', details: pythonError }); }
			if (cleanResult.includes('PDF_ACCESS_ERROR')) { console.log('PDF access error detected'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.status(400).json({ error: 'PDF_ACCESS_ERROR', message: 'Error al acceder al documento, análisis no disponible.' }); }
			if (pythonError.includes('querySrv ETIMEOUT') || pythonError.includes('grpc_wait_for_shutdown_with_timeout') || cleanResult.includes('ETIMEOUT') || cleanResult.includes('timeout')) { console.warn('Database timeout detected (ignored because script succeeded)'); }
			if (!cleanResult) { console.log('Empty result detected'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.status(500).json({ error: 'EMPTY_RESPONSE', message: 'Error: Ocurrió un error inesperado al procesar la respuesta del análisis. Prueba de nuevo por favor' }); }
			sendCleanResult(cleanResult);
		});
		pythonProcess.on('error', (error) => {
			console.error('Error spawning Python process:', error);
			res.status(500).json({ success: false, error: 'Error al iniciar el generador de contenido' });
		});
	} catch (error) {
		console.error('Error in generate-marketing-content endpoint:', error);
		res.status(500).json({ success: false, error: 'Error interno del servidor' });
	}
});

module.exports = router; 