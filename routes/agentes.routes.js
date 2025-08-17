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
		const existingEtiquetas = user.etiquetas_personalizadas || {};
		const newEtiquetas = { ...existingEtiquetas, ...parsedAgent.etiqueta_personalizada };
		await usersCollection.updateOne({ _id: new ObjectId(req.user._id) }, { $set: { etiquetas_personalizadas: newEtiquetas } });
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
		const existingEtiquetas = user.etiquetas_personalizadas || {};
		const newEtiquetas = { ...existingEtiquetas, ...parsedAgent.etiqueta_personalizada };
		await usersCollection.updateOne({ _id: new ObjectId(req.user._id) }, { $set: { etiquetas_personalizadas: newEtiquetas } });
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
		const existingEtiquetas = user.etiquetas_personalizadas || {};
		const newEtiquetas = { ...existingEtiquetas, ...parsedAgent.etiqueta_personalizada };
		await usersCollection.updateOne({ _id: new ObjectId(req.user._id) }, { $set: { etiquetas_personalizadas: newEtiquetas } });
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
		const existingEtiquetas = user.etiquetas_personalizadas || {};
		const newEtiquetas = { ...existingEtiquetas, ...parsedAgent.etiqueta_personalizada };
		await usersCollection.updateOne({ _id: new ObjectId(req.user._id) }, { $set: { etiquetas_personalizadas: newEtiquetas } });
		await client.close();
		console.log('Custom agent generated and saved successfully:', parsedAgent.etiqueta_personalizada);
		res.json({ success: true, agent: parsedAgent, message: 'Custom agent generated and saved successfully' });
	} catch (error) {
		console.error('Error in generate-custom-agent endpoint:', error);
		res.status(500).json({ success: false, error: 'Internal server error' });
	}
});

module.exports = router; 