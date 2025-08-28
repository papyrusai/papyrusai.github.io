/*
Routes: Normativa analysis endpoints for fetching document details, web scraping and analysis pipeline.
Endpoints:
- GET '/api/norma-details' (auth): returns detailed fields for a given documentId and collection
- POST '/api/webscrape' (auth): fetches and extracts readable text from a URL
- POST '/api/analyze-norma' (auth): runs Python analysis script and returns cleaned HTML/text output
*/
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const path = require('path');
const { spawn } = require('child_process');
const { getEtiquetasPersonalizadasAdapter } = require('../services/enterprise.service');

const router = express.Router();

const uri = process.env.DB_URI;
const mongodbOptions = {};

// GET /api/norma-details
router.get('/api/norma-details', ensureAuthenticated, async (req, res) => {
	const documentId = req.query.documentId;
	const collectionName = req.query.collectionName || 'BOE';
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const database = client.db('papyrus');
		const collection = database.collection(collectionName);
		const usersCollection = database.collection('users');

		let perfilRegulatorioUser = null;
		let etiquetasDefiniciones = {};
		if (req.user && req.user._id) {
			const userDoc = await usersCollection.findOne(
				{ _id: new ObjectId(req.user._id) },
				{ projection: { perfil_regulatorio: 1 } }
			);
			perfilRegulatorioUser = userDoc?.perfil_regulatorio || null;
			
			// ENTERPRISE ADAPTER: Obtener etiquetas según tipo de cuenta
			const etiquetasResult = await getEtiquetasPersonalizadasAdapter(req.user);
			etiquetasDefiniciones = etiquetasResult.etiquetas_personalizadas || {};
		}

		const document = await collection.findOne({ _id: documentId });
		if (!document) return res.status(404).json({ error: 'Document not found' });

		let userEtiquetasPersonalizadas = null;
		if (document.etiquetas_personalizadas && req.user && req.user._id) {
			const userId = req.user._id.toString();
			if (document.etiquetas_personalizadas[userId]) {
				userEtiquetasPersonalizadas = document.etiquetas_personalizadas[userId];
			}
		}

		return res.json({
			short_name: document.short_name,
			collectionName,
			rango_titulo: document.rango_titulo,
			url_pdf: document.url_pdf,
			url_html: document.url_html,
			contenido: document.contenido,
			user_etiquetas_personalizadas: userEtiquetasPersonalizadas,
			perfil_regulatorio: perfilRegulatorioUser,
			user_etiquetas_definiciones: etiquetasDefiniciones,
		});
	} catch (err) {
		console.error('Error fetching norma details:', err);
		return res.status(500).json({ error: 'Error fetching norma details' });
	} finally {
		await client.close();
	}
});

// POST /api/webscrape
router.post('/api/webscrape', ensureAuthenticated, async (req, res) => {
	const { url } = req.body;
	if (!url) return res.status(400).json({ error: 'URL is required' });
	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
			},
		});
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
		const html = await response.text();
		const textContent = html
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		return res.json({ text: textContent });
	} catch (error) {
		console.error('Error during webscraping:', error);
		return res.status(500).json({ error: 'Error during webscraping: ' + error.message });
	}
});

// POST /api/analyze-norma
router.post('/api/analyze-norma', ensureAuthenticated, async (req, res) => {
	const { documentId, userPrompt, collectionName, htmlContent } = req.body;
	const pythonScriptPath = path.join(__dirname, '..', 'python', 'questionsMongo.py');
	try {
		const baseCommandLength =
			'python '.length + pythonScriptPath.length + (documentId || '').length + (collectionName || '').length + 20;
		const promptLength = (userPrompt || '').length;
		const htmlContentLength = (htmlContent || '').length;
		const totalLength = baseCommandLength + promptLength + htmlContentLength;
		const useStdin = totalLength > 5000;

		let pythonProcess;
		if (useStdin) {
			const args = [pythonScriptPath, documentId, '--stdin'];
			pythonProcess = spawn('python', args);
			const stdinData = JSON.stringify({ user_prompt: userPrompt, collection_name: collectionName, html_content: htmlContent });
			pythonProcess.stdin.write(stdinData);
			pythonProcess.stdin.end();
		} else {
			const args = htmlContent
				? [pythonScriptPath, documentId, userPrompt, collectionName, htmlContent]
				: [pythonScriptPath, documentId, userPrompt, collectionName];
			pythonProcess = spawn('python', args);
		}

		pythonProcess.stdout.setEncoding('utf8');
		pythonProcess.stderr.setEncoding('utf8');

		let result = '';
		let errorOutput = '';

		pythonProcess.on('error', (error) => {
			console.error('Error executing Python script:', error);
			res.setHeader('Content-Type', 'application/json; charset=utf-8');
			return res.status(500).json({
				error: 'SCRIPT_EXECUTION_ERROR',
				message: 'Error: Ocurrió un error inesperado al procesar la respuesta del análisis. Prueba de nuevo por favor',
				details: error.message,
			});
		});

		pythonProcess.stdout.on('data', (data) => {
			result += data;
		});

		pythonProcess.stderr.on('data', (data) => {
			errorOutput += data;
			console.error(`Python stderr: ${data}`);
		});

		const fixUTF8Encoding = (text) => {
			try {
				let fixedText = typeof text === 'string' ? text : String(text || '');
				// Normalize newlines early
				fixedText = fixedText.replace(/\r\n/g, '\n');
				// Attempt to fix common double-encoding issues (Ã³, Ã¡ ...)
				if (/(Ã¡|Ã©|Ã­|Ã³|Ãº|Ã±|Ã |Ã‰|Ã“|Ãš)/.test(fixedText)) {
					try {
						const bytes = new Uint8Array(fixedText.length);
						for (let i = 0; i < fixedText.length; i++) bytes[i] = fixedText.charCodeAt(i) & 0xff;
						const decoder = new TextDecoder('utf-8');
						const decoded = decoder.decode(bytes);
						if (/[áéíóúñÁÉÍÓÚÑ]/.test(decoded)) fixedText = decoded;
					} catch (_) {}
				}
				// Remove BOM and replacement chars
				fixedText = fixedText.replace(/[\ufeff]/g, '');
				// Keep diacritics: DO NOT strip them; only remove invalid surrogates
				fixedText = fixedText.split('').filter((ch) => {
					const code = ch.charCodeAt(0);
					return !(code >= 0xd800 && code <= 0xdfff);
				}).join('');
				// Normalize to NFC to preserve composed accents
				if (typeof fixedText.normalize === 'function') fixedText = fixedText.normalize('NFC');
				// Remove control chars except newlines and tabs
				fixedText = fixedText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
				// Preserve spaces but avoid collapsing meaningful whitespace inside HTML
				return fixedText.trim();
			} catch (_) {
				return text;
			}
		};

		pythonProcess.on('close', (code) => {
			const sendCleanResult = (cleanStr) => {
				try {
					let jsonString = cleanStr.trim();
					const jsonMatch = jsonString.match(/\{[^}]*"html_response"[^}]*\}/s);
					if (jsonMatch) jsonString = jsonMatch[0];
					const jsonResult = JSON.parse(jsonString);
					if (jsonResult.html_response) {
						let html = jsonResult.html_response;
						html = html.replace(/\\n/g, '\n').replace(/\\\"/g, '"').replace(/\\\\/g, '\\');
						html = fixUTF8Encoding(html);
						res.setHeader('Content-Type', 'text/html; charset=utf-8');
						return res.send(html);
					} else if (jsonResult.error) {
						res.setHeader('Content-Type', 'application/json; charset=utf-8');
						return res.status(500).json(jsonResult);
					}
				} catch (_) {
					if (cleanStr.includes('{"html_response"')) {
						try {
							const startIndex = cleanStr.indexOf('{"html_response"');
							const endIndex = cleanStr.lastIndexOf('}') + 1;
							if (startIndex !== -1 && endIndex > startIndex) {
								const jsonStr = cleanStr.substring(startIndex, endIndex);
								const jsonResult = JSON.parse(jsonStr);
								if (jsonResult.html_response) {
									let html = jsonResult.html_response;
									html = html.replace(/\\n/g, '\n').replace(/\\\"/g, '"').replace(/\\\\/g, '\\');
									html = fixUTF8Encoding(html);
									res.setHeader('Content-Type', 'text/html; charset=utf-8');
									return res.send(html);
								}
							}
						} catch (_) {}
					}
				}

				const fixedContent = fixUTF8Encoding(result.trim());
				const isHtml =
					fixedContent.includes('<h2>') ||
					fixedContent.includes('<p>') ||
					fixedContent.includes('<table>') ||
					fixedContent.includes('<html>');
				res.setHeader('Content-Type', isHtml ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
				return res.send(fixedContent);
			};

			if (code !== 0 && !(result && (result.includes('<h2>') || result.includes('<p>') || result.includes('<table>') || result.includes('<html>')))) {
				res.setHeader('Content-Type', 'application/json; charset=utf-8');
				return res.status(500).json({
					error: 'PYTHON_SCRIPT_ERROR',
					message: 'Error: Ocurrió un error inesperado al procesar la respuesta del análisis. Prueba de nuevo por favor',
					details: errorOutput,
				});
			}

			// Ensure we actually send the result in success or partial-success cases
			sendCleanResult(result);

			if (
				errorOutput.includes('querySrv ETIMEOUT') ||
				errorOutput.includes('grpc_wait_for_shutdown_with_timeout') ||
				result.includes('ETIMEOUT') ||
				result.includes('timeout')
			) {
				console.warn('Database timeout detected (ignored because script succeeded)');
			}
		});
	} catch (error) {
		console.error('Error executing Python script:', error);
		res.setHeader('Content-Type', 'application/json; charset=utf-8');
		return res.status(500).json({
			error: 'SCRIPT_EXECUTION_ERROR',
			message: 'Error: Ocurrió un error inesperado al procesar la respuesta del análisis. Prueba de nuevo por favor',
			details: error.message,
		});
	}
});

module.exports = router; 