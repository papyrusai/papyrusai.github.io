/*
Routes: Agentes (generación de etiquetas personalizadas)
Endpoints:
- POST '/api/generate-agent'
- POST '/api/generate-client-agent'
- POST '/api/generate-sector-agent'
- POST '/api/generate-custom-agent'
*/
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const fs = require('fs');
const path = require('path');

// Import the resolver service
const { updateEtiquetasPersonalizadas, getEtiquetasPersonalizadas } = require('../services/enterprise.service');

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

// === NUEVOS ENDPOINTS: Gestión de carpetas de agentes y selección personalizada ===
const {
	getCarpetasEstructura,
	createCarpeta,
	renameCarpeta,
	moveCarpeta,
	deleteCarpeta,
	assignAgenteToCarpeta,
	getSeleccionAgentes,
	updateSeleccionAgentes,
	lockCarpetasForEdit,
	unlockCarpetasForEdit,
	getUserContext
} = require('../services/enterprise.service');

// GET /api/carpetas-context - Obtener estructura de carpetas con conteos
router.get('/api/carpetas-context', ensureAuthenticated, async (req, res) => {
	try {
		const result = await getCarpetasEstructura(req.user);
		res.json({ success: true, data: result.estructura_carpetas, counts: result.counts, source: result.source });
	} catch (error) {
		console.error('Error obteniendo carpetas:', error);
		res.status(500).json({ success: false, error: 'Error interno al obtener estructura de carpetas' });
	}
});

// POST /api/carpetas - Crear carpeta
router.post('/api/carpetas', ensureAuthenticated, async (req, res) => {
	try {
		const { nombre, parentId = null, expectedVersion = null } = req.body || {};
		if (!nombre || typeof nombre !== 'string') {
			return res.status(400).json({ success: false, error: 'Se requiere nombre de carpeta' });
		}
		const result = await createCarpeta(req.user, nombre.trim(), parentId || null, expectedVersion);
		if (!result.success) {
			const status = result.conflict ? 409 : (result.error && result.error.includes('admins de empresa') ? 403 : 400);
			return res.status(status).json(result);
		}
		res.json(result);
	} catch (error) {
		console.error('Error creando carpeta:', error);
		res.status(500).json({ success: false, error: 'Error interno al crear carpeta' });
	}
});

// PUT /api/carpetas/:folderId/rename - Renombrar carpeta
router.put('/api/carpetas/:folderId/rename', ensureAuthenticated, async (req, res) => {
	try {
		const { folderId } = req.params;
		const { newName, expectedVersion = null } = req.body || {};
		if (!newName || typeof newName !== 'string') {
			return res.status(400).json({ success: false, error: 'Se requiere nuevo nombre' });
		}
		const result = await renameCarpeta(req.user, folderId, newName.trim(), expectedVersion);
		if (!result.success) {
			const status = result.conflict ? 409 : (result.error && result.error.includes('admins de empresa') ? 403 : 400);
			return res.status(status).json(result);
		}
		res.json(result);
	} catch (error) {
		console.error('Error renombrando carpeta:', error);
		res.status(500).json({ success: false, error: 'Error interno al renombrar carpeta' });
	}
});

// PUT /api/carpetas/:folderId/move - Mover carpeta
router.put('/api/carpetas/:folderId/move', ensureAuthenticated, async (req, res) => {
	try {
		const { folderId } = req.params;
		const { newParentId = null, expectedVersion = null } = req.body || {};
		const result = await moveCarpeta(req.user, folderId, newParentId || null, expectedVersion);
		if (!result.success) {
			const status = result.conflict ? 409 : (result.error && result.error.includes('admins de empresa') ? 403 : 400);
			return res.status(status).json(result);
		}
		res.json(result);
	} catch (error) {
		console.error('Error moviendo carpeta:', error);
		res.status(500).json({ success: false, error: 'Error interno al mover carpeta' });
	}
});

// DELETE /api/carpetas/:folderId - Eliminar carpeta
router.delete('/api/carpetas/:folderId', ensureAuthenticated, async (req, res) => {
	try {
		const { folderId } = req.params;
		const { expectedVersion = null } = req.body || {};
		const result = await deleteCarpeta(req.user, folderId, expectedVersion);
		if (!result.success) {
			const status = result.conflict ? 409 : (result.error && result.error.includes('admins de empresa') ? 403 : 400);
			return res.status(status).json(result);
		}
		res.json(result);
	} catch (error) {
		console.error('Error eliminando carpeta:', error);
		res.status(500).json({ success: false, error: 'Error interno al eliminar carpeta' });
	}
});

// POST /api/carpetas/assign - Asignar agente a carpeta
router.post('/api/carpetas/assign', ensureAuthenticated, async (req, res) => {
	try {
		const { agenteName, folderId = null, expectedVersion = null } = req.body || {};
		if (!agenteName || typeof agenteName !== 'string') {
			return res.status(400).json({ success: false, error: 'Se requiere agenteName' });
		}
		const result = await assignAgenteToCarpeta(req.user, agenteName, folderId || null, expectedVersion);
		if (!result.success) {
			const status = result.conflict ? 409 : (result.error && result.error.includes('permisos') ? 403 : 400);
			return res.status(status).json(result);
		}
		res.json(result);
	} catch (error) {
		console.error('Error asignando agente a carpeta:', error);
		res.status(500).json({ success: false, error: 'Error interno al asignar agente' });
	}
});

// GET /api/agentes-seleccion-personalizada - Obtener selección del usuario
router.get('/api/agentes-seleccion-personalizada', ensureAuthenticated, async (req, res) => {
	try {
		const result = await getSeleccionAgentes(req.user);
		res.json(result);
	} catch (error) {
		console.error('Error obteniendo selección personalizada:', error);
		res.status(500).json({ success: false, error: 'Error interno al obtener selección' });
	}
});

// POST /api/agentes-seleccion-personalizada - Actualizar selección del usuario
router.post('/api/agentes-seleccion-personalizada', ensureAuthenticated, async (req, res) => {
	try {
		const { seleccion = [] } = req.body || {};
		const result = await updateSeleccionAgentes(req.user, Array.isArray(seleccion) ? seleccion : []);
		if (!result.success) {
			const status = result.error && result.error.includes('límite') ? 403 : 400;
			return res.status(status).json(result);
		}
		res.json(result);
	} catch (error) {
		console.error('Error actualizando selección personalizada:', error);
		res.status(500).json({ success: false, error: 'Error interno al actualizar selección' });
	}
});

// POST /api/carpetas-lock - Bloqueo de edición de carpetas
router.post('/api/carpetas-lock', ensureAuthenticated, async (req, res) => {
	try {
		const { folderId = null } = req.body || {};
		const result = await lockCarpetasForEdit(req.user, folderId);
		if (!result.success) return res.status(423).json(result);
		res.json(result);
	} catch (error) {
		console.error('Error bloqueando edición de carpetas:', error);
		res.status(500).json({ success: false, error: 'Error interno al bloquear edición' });
	}
});

// DELETE /api/carpetas-lock - Liberar bloqueo de edición de carpetas
router.delete('/api/carpetas-lock', ensureAuthenticated, async (req, res) => {
	try {
		const { folderId = null } = req.body || {};
		const result = await unlockCarpetasForEdit(req.user, folderId);
		res.json(result);
	} catch (error) {
		console.error('Error liberando bloqueo de carpetas:', error);
		res.status(500).json({ success: false, error: 'Error interno al liberar bloqueo' });
	}
});

// GET /api/historial/carpetas - Obtener historial de cambios de carpetas
router.get('/api/historial/carpetas', ensureAuthenticated, async (req, res) => {
	try {
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const users = client.db('papyrus').collection('users');
		let doc;
		if (req.user.tipo_cuenta === 'empresa' && req.user.estructura_empresa_id) {
			doc = await users.findOne({ _id: (req.user.estructura_empresa_id instanceof ObjectId) ? req.user.estructura_empresa_id : new ObjectId(String(req.user.estructura_empresa_id)) });
		} else {
			doc = await users.findOne({ _id: (req.user._id instanceof ObjectId) ? req.user._id : new ObjectId(String(req.user._id)) });
		}
		await client.close();
		return res.json({ success: true, historial: doc?.historial_carpetas || [] });
	} catch (error) {
		console.error('Error obteniendo historial de carpetas:', error);
		res.status(500).json({ success: false, error: 'Error interno al obtener historial de carpetas' });
	}
});

// GET /api/historial/agentes - Obtener historial de cambios de agentes
router.get('/api/historial/agentes', ensureAuthenticated, async (req, res) => {
	try {
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const users = client.db('papyrus').collection('users');
		let doc;
		if (req.user.tipo_cuenta === 'empresa' && req.user.estructura_empresa_id) {
			doc = await users.findOne({ _id: (req.user.estructura_empresa_id instanceof ObjectId) ? req.user.estructura_empresa_id : new ObjectId(String(req.user.estructura_empresa_id)) });
		} else {
			doc = await users.findOne({ _id: (req.user._id instanceof ObjectId) ? req.user._id : new ObjectId(String(req.user._id)) });
		}
		await client.close();
		return res.json({ success: true, historial: doc?.historial_agentes || [] });
	} catch (error) {
		console.error('Error obteniendo historial de agentes:', error);
		res.status(500).json({ success: false, error: 'Error interno al obtener historial de agentes' });
	}
});
// === FIN NUEVOS ENDPOINTS ===

// Generate Agent endpoint
router.post('/api/generate-agent', ensureAuthenticated, async (req, res) => {
	try {
		const { productData } = req.body;
		if (!productData) {
			return res.status(400).json({ success: false, error: 'Product data is required' });
		}
		console.log(`Generating agent for user: ${req.user._id}`);
		console.log(`Product data:`, productData);
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const database = client.db('papyrus');
		const usersCollection = database.collection('users');
		const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
		if (!user) { await client.close(); return res.status(404).json({ success: false, error: 'User not found' }); }
		const perfilRegulatorio = user.perfil_regulatorio || '';
		const promptsPath = path.join(__dirname, '..', 'prompts', 'generacion_agentes.md');
		const PROMPTS = loadYamlPrompts(promptsPath);
		const prompt = renderTemplate(PROMPTS.AGENT_PRODUCT, {
			PERFIL_REGULATORIO: perfilRegulatorio,
			PRODUCT_DESCRIPTION: productData.description || '',
			PRODUCT_PHASE: productData.phase || '',
			PRODUCT_CHARACTERISTICS: productData.characteristics || ''
		});
		console.log('=== PROMPT SENT TO LLM ===');
		console.log(prompt);
		console.log('=== END PROMPT ===');
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) { await client.close(); return res.status(500).json({ success: false, error: 'Google Gemini API key not configured' }); }
		const systemInstructions = `Eres un experto jurídico especializado en derecho español y de la Unión Europea. Tu tarea es generar etiquetas jurídicas precisas para clasificar documentos legales. Devuelve ÚNICAMENTE un objeto JSON válido con la estructura especificada en las instrucciones.`;
		const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;
		const body = { systemInstruction: { parts: [{ text: systemInstructions }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.7, topP: 0.95, topK: 64, maxOutputTokens: 1024 } };
		const response = await fetch(geminiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (!response.ok) { const errorText = await response.text(); console.error('Gemini API error:', errorText); await client.close(); return res.status(500).json({ success: false, error: 'Error generating agent with AI' }); }
		const data = await response.json();
		const aiContent = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
		console.log('=== LLM RESPONSE ===');
		console.log(aiContent);
		console.log('=== END LLM RESPONSE ===');
		let parsedAgent;
		try { parsedAgent = JSON.parse(aiContent); } catch (err) { console.error('Failed to parse Gemini response:', err, aiContent); await client.close(); return res.status(500).json({ success: false, error: 'Invalid AI response format' }); }
		if (!parsedAgent.etiqueta_personalizada || typeof parsedAgent.etiqueta_personalizada !== 'object') { console.error('Invalid agent structure:', parsedAgent); await client.close(); return res.status(500).json({ success: false, error: 'Invalid agent structure from AI' }); }
		// Get existing etiquetas using resolver
		const existingResult = await getEtiquetasPersonalizadas(req.user);
		const existingEtiquetas = existingResult.etiquetas_personalizadas || {};
		const newEtiquetas = { ...existingEtiquetas, ...parsedAgent.etiqueta_personalizada };
		
		// Use resolver to update etiquetas
		const updateResult = await updateEtiquetasPersonalizadas(req.user, newEtiquetas);
		if (!updateResult.success) {
			await client.close();
			return res.status(400).json({ success: false, error: updateResult.error });
		}
		
		await client.close();
		console.log('Agent generated and saved successfully:', parsedAgent.etiqueta_personalizada);
		res.json({ success: true, agent: parsedAgent, message: 'Agent generated and saved successfully' });
	} catch (error) {
		console.error('Error in generate-agent endpoint:', error);
		res.status(500).json({ success: false, error: 'Internal server error' });
	}
});

// Generate Client Agent endpoint
router.post('/api/generate-client-agent', ensureAuthenticated, async (req, res) => {
	try {
		const { clientData } = req.body;
		if (!clientData) { return res.status(400).json({ success: false, error: 'Client data is required' }); }
		console.log(`Generating client agent for user: ${req.user._id}`);
		console.log(`Client data:`, clientData);
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const database = client.db('papyrus');
		const usersCollection = database.collection('users');
		const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
		if (!user) { await client.close(); return res.status(404).json({ success: false, error: 'User not found' }); }
		const perfilRegulatorio = user.perfil_regulatorio || '';
		const promptsPath = path.join(__dirname, '..', 'prompts', 'generacion_agentes.md');
		const PROMPTS = loadYamlPrompts(promptsPath);
		const prompt = renderTemplate(PROMPTS.AGENT_CLIENT, {
			PERFIL_REGULATORIO: perfilRegulatorio,
			CLIENT_DESCRIPTION: clientData.description || '',
			CLIENT_WEBSITE: clientData.website || '',
			CLIENT_SCOPE: clientData.scope || ''
		});
		console.log('=== CLIENT PROMPT SENT TO LLM ===');
		console.log(prompt);
		console.log('=== END CLIENT PROMPT ===');
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) { await client.close(); return res.status(500).json({ success: false, error: 'Google Gemini API key not configured' }); }
		const systemInstructions = `Eres un experto jurídico especializado en derecho español y de la Unión Europea. Tu tarea es generar etiquetas jurídicas precisas para clasificar documentos legales. Devuelve ÚNICAMENTE un objeto JSON válido con la estructura especificada en las instrucciones.`;
		const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;
		const body = { systemInstruction: { parts: [{ text: systemInstructions }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.7, topP: 0.95, topK: 64, maxOutputTokens: 1024 } };
		const response = await fetch(geminiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (!response.ok) { const errorText = await response.text(); console.error('Gemini API error:', errorText); await client.close(); return res.status(500).json({ success: false, error: 'Error generating client agent with AI' }); }
		const data = await response.json();
		const aiContent = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
		console.log('=== CLIENT LLM RESPONSE ===');
		console.log(aiContent);
		console.log('=== END CLIENT LLM RESPONSE ===');
		let parsedAgent;
		try { parsedAgent = JSON.parse(aiContent); } catch (err) { console.error('Failed to parse Gemini response:', err, aiContent); await client.close(); return res.status(500).json({ success: false, error: 'Invalid AI response format' }); }
		if (!parsedAgent.etiqueta_personalizada || typeof parsedAgent.etiqueta_personalizada !== 'object') { console.error('Invalid agent structure:', parsedAgent); await client.close(); return res.status(500).json({ success: false, error: 'Invalid agent structure from AI' }); }
		// Get existing etiquetas using resolver
		const existingResult = await getEtiquetasPersonalizadas(req.user);
		const existingEtiquetas = existingResult.etiquetas_personalizadas || {};
		const newEtiquetas = { ...existingEtiquetas, ...parsedAgent.etiqueta_personalizada };
		
		// Use resolver to update etiquetas
		const updateResult = await updateEtiquetasPersonalizadas(req.user, newEtiquetas);
		if (!updateResult.success) {
			await client.close();
			return res.status(400).json({ success: false, error: updateResult.error });
		}
		
		await client.close();
		console.log('Client agent generated and saved successfully:', parsedAgent.etiqueta_personalizada);
		res.json({ success: true, agent: parsedAgent, message: 'Client agent generated and saved successfully' });
	} catch (error) {
		console.error('Error in generate-client-agent endpoint:', error);
		res.status(500).json({ success: false, error: 'Internal server error' });
	}
});

// Generate Sector Agent endpoint
router.post('/api/generate-sector-agent', ensureAuthenticated, async (req, res) => {
	try {
		const { sectorData } = req.body;
		if (!sectorData) { return res.status(400).json({ success: false, error: 'Sector data is required' }); }
		console.log(`Generating sector agent for user: ${req.user._id}`);
		console.log(`Sector data:`, sectorData);
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const database = client.db('papyrus');
		const usersCollection = database.collection('users');
		const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
		if (!user) { await client.close(); return res.status(404).json({ success: false, error: 'User not found' }); }
		const perfilRegulatorio = user.perfil_regulatorio || '';
		const promptsPath = path.join(__dirname, '..', 'prompts', 'generacion_agentes.md');
		const PROMPTS = loadYamlPrompts(promptsPath);
		const prompt = renderTemplate(PROMPTS.AGENT_SECTOR, {
			PERFIL_REGULATORIO: perfilRegulatorio,
			SECTOR_DESCRIPTION: sectorData.description || '',
			SECTOR_GEOGRAPHIC_SCOPE: sectorData.geographicScope || '',
			SECTOR_SUBTOPICS: sectorData.subtopics || ''
		});
		console.log('=== SECTOR PROMPT SENT TO LLM ===');
		console.log(prompt);
		console.log('=== END SECTOR PROMPT ===');
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) { await client.close(); return res.status(500).json({ success: false, error: 'Google Gemini API key not configured' }); }
		const systemInstructions = `Eres un experto jurídico especializado en derecho español y de la Unión Europea. Tu tarea es generar etiquetas jurídicas precisas para clasificar documentos legales. Devuelve ÚNICAMENTE un objeto JSON válido con la estructura especificada en las instrucciones.`;
		const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;
		const body = { systemInstruction: { parts: [{ text: systemInstructions }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.7, topP: 0.95, topK: 64, maxOutputTokens: 1024 } };
		const response = await fetch(geminiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (!response.ok) { const errorText = await response.text(); console.error('Gemini API error:', errorText); await client.close(); return res.status(500).json({ success: false, error: 'Error generating sector agent with AI' }); }
		const data = await response.json();
		const aiContent = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
		console.log('=== SECTOR LLM RESPONSE ===');
		console.log(aiContent);
		console.log('=== END SECTOR LLM RESPONSE ===');
		let parsedAgent;
		try { parsedAgent = JSON.parse(aiContent); } catch (err) { console.error('Failed to parse Gemini response:', err, aiContent); await client.close(); return res.status(500).json({ success: false, error: 'Invalid AI response format' }); }
		if (!parsedAgent.etiqueta_personalizada || typeof parsedAgent.etiqueta_personalizada !== 'object') { console.error('Invalid agent structure:', parsedAgent); await client.close(); return res.status(500).json({ success: false, error: 'Invalid agent structure from AI' }); }
		// Get existing etiquetas using resolver
		const existingResult = await getEtiquetasPersonalizadas(req.user);
		const existingEtiquetas = existingResult.etiquetas_personalizadas || {};
		const newEtiquetas = { ...existingEtiquetas, ...parsedAgent.etiqueta_personalizada };
		
		// Use resolver to update etiquetas
		const updateResult = await updateEtiquetasPersonalizadas(req.user, newEtiquetas);
		if (!updateResult.success) {
			await client.close();
			return res.status(400).json({ success: false, error: updateResult.error });
		}
		
		await client.close();
		console.log('Sector agent generated and saved successfully:', parsedAgent.etiqueta_personalizada);
		res.json({ success: true, agent: parsedAgent, message: 'Sector agent generated and saved successfully' });
	} catch (error) {
		console.error('Error in generate-sector-agent endpoint:', error);
		res.status(500).json({ success: false, error: 'Internal server error' });
	}
});

// Generate Custom Agent endpoint
router.post('/api/generate-custom-agent', ensureAuthenticated, async (req, res) => {
	try {
		const { customData } = req.body;
		if (!customData || !customData.description) { return res.status(400).json({ success: false, error: 'Custom description is required' }); }
		console.log(`Generating custom agent for user: ${req.user._id}`);
		console.log(`Custom data:`, customData);
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const database = client.db('papyrus');
		const usersCollection = database.collection('users');
		const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
		if (!user) { await client.close(); return res.status(404).json({ success: false, error: 'User not found' }); }
		const perfilRegulatorio = user.perfil_regulatorio || '';
		const promptsPath = path.join(__dirname, '..', 'prompts', 'generacion_agentes.md');
		const PROMPTS = loadYamlPrompts(promptsPath);
		const prompt = renderTemplate(PROMPTS.AGENT_CUSTOM, {
			PERFIL_REGULATORIO: perfilRegulatorio,
			CUSTOM_DESCRIPTION: customData.description || ''
		});
		console.log('=== CUSTOM PROMPT SENT TO LLM ===');
		console.log(prompt);
		console.log('=== END CUSTOM PROMPT ===');
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) { await client.close(); return res.status(500).json({ success: false, error: 'Google Gemini API key not configured' }); }
		const systemInstructions = `Eres un experto jurídico especializado en derecho español y de la Unión Europea. Tu tarea es generar etiquetas jurídicas precisas para clasificar documentos legales. Devuelve ÚNICAMENTE un objeto JSON válido con la estructura especificada en las instrucciones.`;
		const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;
		const body = { systemInstruction: { parts: [{ text: systemInstructions }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.7, topP: 0.95, topK: 64, maxOutputTokens: 1024 } };
		const response = await fetch(geminiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (!response.ok) { const errorText = await response.text(); console.error('Gemini API error:', errorText); await client.close(); return res.status(500).json({ success: false, error: 'Error generating custom agent with AI' }); }
		const data = await response.json();
		const aiContent = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
		console.log('=== CUSTOM LLM RESPONSE ===');
		console.log(aiContent);
		console.log('=== END CUSTOM LLM RESPONSE ===');
		let parsedAgent;
		try { parsedAgent = JSON.parse(aiContent); } catch (err) { console.error('Failed to parse Gemini response:', err, aiContent); await client.close(); return res.status(500).json({ success: false, error: 'Invalid AI response format' }); }
		if (!parsedAgent.etiqueta_personalizada || typeof parsedAgent.etiqueta_personalizada !== 'object') { console.error('Invalid agent structure:', parsedAgent); await client.close(); return res.status(500).json({ success: false, error: 'Invalid agent structure from AI' }); }
		// Get existing etiquetas using resolver
		const existingResult = await getEtiquetasPersonalizadas(req.user);
		const existingEtiquetas = existingResult.etiquetas_personalizadas || {};
		const newEtiquetas = { ...existingEtiquetas, ...parsedAgent.etiqueta_personalizada };
		
		// Use resolver to update etiquetas
		const updateResult = await updateEtiquetasPersonalizadas(req.user, newEtiquetas);
		if (!updateResult.success) {
			await client.close();
			return res.status(400).json({ success: false, error: updateResult.error });
		}
		
		await client.close();
		console.log('Custom agent generated and saved successfully:', parsedAgent.etiqueta_personalizada);
		res.json({ success: true, agent: parsedAgent, message: 'Custom agent generated and saved successfully' });
	} catch (error) {
		console.error('Error in generate-custom-agent endpoint:', error);
		res.status(500).json({ success: false, error: 'Internal server error' });
	}
});

// === Feedback endpoint ===
router.post('/api/sugerencia_edicion', ensureAuthenticated, async (req, res) => {
	try {
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const db = client.db('papyrus');
		const feedbackCol = db.collection('Feedback');

		const now = new Date();
		const dd = String(now.getDate()).padStart(2, '0');
		const mm = String(now.getMonth() + 1).padStart(2, '0');
		const yyyy = now.getFullYear();
		const fecha = `${dd}-${mm}-${yyyy}`;

		const body = req.body || {};
		const agente = body.agente || '';

		const doc = {
			user_id: String(req.user?._id || ''),
			user_email: req.user?.email || req.user?.username || '',
			created_at: now,
			updated_at: now,
			content_evaluated: 'agente',
			agente: agente,
			fecha,
			feedback: 'Sugerencia cambios',
			doc_url: body.doc_url || '',
			feedback_detalle: body.feedback_detalle || ''
		};

		await feedbackCol.insertOne({ ...doc });
		await client.close();
		return res.json({ success: true, data: doc });
	} catch (error) {
		console.error('Error guardando feedback:', error);
		return res.status(500).json({ success: false, error: 'Error interno al guardar feedback' });
	}
});

module.exports = router; 