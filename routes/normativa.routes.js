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
const { TextDecoder: NodeTextDecoder } = require('util');
const { getEtiquetasPersonalizadasAdapter, getEtiquetasSeleccionadasAdapter } = require('../services/enterprise.service');

const router = express.Router();

const uri = process.env.DB_URI;
// Add a conservative server selection timeout to avoid long hangs on transient DB issues
const mongodbOptions = { serverSelectionTimeoutMS: 8000 };

// GET /api/norma-details
router.get('/api/norma-details', ensureAuthenticated, async (req, res) => {
	const documentId = req.query.documentId;
	const collectionName = req.query.collectionName || 'BOE';
	// Excluir colecciones *_test
	if (String(collectionName).toLowerCase().endsWith('_test')) {
		return res.status(400).json({ error: 'Colección no permitida' });
	}
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const database = client.db('papyrus');
		const collection = database.collection(collectionName);
		const usersCollection = database.collection('users');

		let perfilRegulatorioUser = null;
		let etiquetasDefiniciones = {};
		let isEnterpriseUser = false;
		let estructuraEmpresaIdStr = null;
		let etiquetasSeleccionadasArray = [];
		if (req.user && req.user._id) {
			const userDoc = await usersCollection.findOne(
				{ _id: new ObjectId(req.user._id) },
				{ projection: { perfil_regulatorio: 1, tipo_cuenta: 1, estructura_empresa_id: 1 } }
			);
			perfilRegulatorioUser = userDoc?.perfil_regulatorio || null;
			isEnterpriseUser = (userDoc?.tipo_cuenta === 'empresa') && !!userDoc?.estructura_empresa_id;
			estructuraEmpresaIdStr = userDoc?.estructura_empresa_id ? String(userDoc.estructura_empresa_id) : null;
			
			// ENTERPRISE ADAPTER: Obtener etiquetas según tipo de cuenta
			const etiquetasResult = await getEtiquetasPersonalizadasAdapter(req.user);
			etiquetasDefiniciones = etiquetasResult.etiquetas_personalizadas || {};

			// ENTERPRISE ADAPTER: Obtener selección de etiquetas del usuario (si existe)
			try {
				const seleccionResult = await getEtiquetasSeleccionadasAdapter(req.user);
				etiquetasSeleccionadasArray = Array.isArray(seleccionResult?.etiquetas_seleccionadas)
					? seleccionResult.etiquetas_seleccionadas
					: [];
			} catch (_) {}
		}

		// Be robust to _id type (string vs ObjectId)
		let document = null;
		try {
			// First try exact string match (many collections use string ids)
			document = await collection.findOne({ _id: documentId });
			if (!document && ObjectId.isValid(String(documentId))) {
				// Fallback to ObjectId match
				document = await collection.findOne({ _id: new ObjectId(String(documentId)) });
			}
		} catch (_) {
			// As a last resort, try ObjectId if valid
			if (!document && ObjectId.isValid(String(documentId))) {
				try { document = await collection.findOne({ _id: new ObjectId(String(documentId)) }); } catch(_) {}
			}
		}
		if (!document) return res.status(404).json({ error: 'Document not found' });

		let userEtiquetasPersonalizadas = null;
		// INDIVIDUAL: mantener comportamiento actual (etiquetas del documento por userId)
		if (!isEnterpriseUser) {
			if (document.etiquetas_personalizadas && req.user && req.user._id) {
				const userId = req.user._id.toString();
				if (document.etiquetas_personalizadas[userId]) {
					userEtiquetasPersonalizadas = document.etiquetas_personalizadas[userId];
				}
			}
		} else {
			// EMPRESA: mostrar SOLO etiquetas que hagan match con este documento
			// 1) Disponibles desde adapter (definiciones globales de empresa)
			let disponibles = etiquetasDefiniciones || {};
			// 2) Obtener conjunto de etiquetas que hacen match en el documento para estructura_empresa
			const docRawForEmpresa = (document.etiquetas_personalizadas && estructuraEmpresaIdStr)
				? (document.etiquetas_personalizadas[estructuraEmpresaIdStr] || {})
				: {};
			let docMatchedSet = new Set();
			if (Array.isArray(docRawForEmpresa)) {
				docRawForEmpresa.forEach(n => { if (typeof n === 'string') docMatchedSet.add(n); });
			} else if (docRawForEmpresa && typeof docRawForEmpresa === 'object') {
				Object.keys(docRawForEmpresa).forEach(n => docMatchedSet.add(n));
			}
			// 3) Filtrar disponibles por las que realmente hacen match con el documento
			const soloMatched = {};
			Object.keys(disponibles || {}).forEach((name) => {
				if (docMatchedSet.has(name)) soloMatched[name] = disponibles[name];
			});
			// 4) Si hay selección personal, intersectar también por selección
			let filtradas = soloMatched;
			if (Array.isArray(etiquetasSeleccionadasArray) && etiquetasSeleccionadasArray.length > 0) {
				const tmp = {};
				etiquetasSeleccionadasArray.forEach((name) => {
					if (Object.prototype.hasOwnProperty.call(filtradas, name)) tmp[name] = filtradas[name];
				});
				filtradas = tmp;
			}
			// 5) Enriquecer valores con la información específica del documento si existe (nivel_impacto, etc.)
			const finalMap = {};
			Object.keys(filtradas || {}).forEach((k) => {
				const hasDocSpecific = (!Array.isArray(docRawForEmpresa)) && Object.prototype.hasOwnProperty.call(docRawForEmpresa || {}, k);
				finalMap[k] = hasDocSpecific ? docRawForEmpresa[k] : filtradas[k];
			});
			userEtiquetasPersonalizadas = finalMap;
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
			user_is_enterprise: isEnterpriseUser,
			user_etiquetas_seleccionadas: etiquetasSeleccionadasArray,
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
	// Excluir colecciones *_test
	if (String(collectionName || '').toLowerCase().endsWith('_test')) {
		return res.status(400).json({ error: 'Colección no permitida' });
	}
	const pythonScriptPath = path.join(__dirname, '..', 'python', 'questionsMongo.py');
	try {
		const baseCommandLength =
			'python '.length + pythonScriptPath.length + (documentId || '').length + (collectionName || '').length + 20;
		const promptLength = (userPrompt || '').length;
		const htmlContentLength = (htmlContent || '').length;
		const totalLength = baseCommandLength + promptLength + htmlContentLength;
		const useStdin = totalLength > 5000;

		// Helper to run Python with fallback and capture outputs in a Promise (avoid double sends)
		const runPythonWithFallback = (args, stdinJsonString = null) => {
			const bins = [process.env.PYTHON_BIN, 'python', 'python3'].filter(Boolean);
			let lastError = null;
			const trySpawn = (binIndex) => {
				if (binIndex >= bins.length) {
					const err = lastError || new Error('Python binary not found');
					err.code = err.code || 'ENOENT';
					return Promise.reject(err);
				}
				const bin = bins[binIndex];
				return new Promise((resolve, reject) => {
					try {
						const proc = spawn(bin, args);
						proc.stdout.setEncoding('utf8');
						proc.stderr.setEncoding('utf8');
						let out = '';
						let errOut = '';
						proc.stdout.on('data', (d) => { out += d; });
						proc.stderr.on('data', (d) => { errOut += d; console.error(`Python stderr: ${d}`); });
						proc.on('error', (e) => {
							lastError = e;
							if (e && (e.code === 'ENOENT' || e.errno === -2)) {
								// Try next binary
								return reject({ retry: true });
							}
							return reject(e);
						});
						proc.on('close', (code) => {
							return resolve({ code, out, errOut });
						});
						if (stdinJsonString) {
							try {
								proc.stdin.write(stdinJsonString);
							} catch (_) {}
							try { proc.stdin.end(); } catch (_) {}
						}
					} catch (e) {
						lastError = e;
						if (e && (e.code === 'ENOENT' || e.errno === -2)) {
							return reject({ retry: true });
						}
						return reject(e);
					}
				});
			};
			// Attempt sequentially across binaries
			return trySpawn(0).catch((e1) => {
				if (e1 && e1.retry) return trySpawn(1);
				throw e1;
			}).catch((e2) => {
				if (e2 && e2.retry) return trySpawn(2);
				throw e2;
			});
		};

		// Build args and run
		let args = [];
		let stdinJsonString = null;
		if (useStdin) {
			args = [pythonScriptPath, documentId, '--stdin'];
			stdinJsonString = JSON.stringify({ user_prompt: userPrompt, collection_name: collectionName, html_content: htmlContent });
		} else {
			args = htmlContent
				? [pythonScriptPath, documentId, userPrompt, collectionName, htmlContent]
				: [pythonScriptPath, documentId, userPrompt, collectionName];
		}

		let runResult;
		try {
			runResult = await runPythonWithFallback(args, stdinJsonString);
		} catch (spawnErr) {
			console.error('Error executing Python script:', spawnErr);
			const isNotFound = spawnErr && (spawnErr.code === 'ENOENT' || spawnErr.errno === -2);
			res.setHeader('Content-Type', 'application/json; charset=utf-8');
			return res.status(500).json({
				error: isNotFound ? 'PYTHON_NOT_FOUND' : 'SCRIPT_EXECUTION_ERROR',
				message: isNotFound ? 'Error: Python no está disponible en el servidor. Instala python3 o define PYTHON_BIN.' : 'Error: Ocurrió un error inesperado al procesar la respuesta del análisis. Prueba de nuevo por favor',
				details: spawnErr.message || String(spawnErr),
			});
		}

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
						const DecoderClass = (typeof TextDecoder !== 'undefined' ? TextDecoder : NodeTextDecoder);
						if (DecoderClass) {
							const decoder = new DecoderClass('utf-8');
							const decoded = decoder.decode(bytes);
							if (/[áéíóúñÁÉÍÓÚÑ]/.test(decoded)) fixedText = decoded;
						}
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

		const { code, out: result, errOut: errorOutput } = runResult;
		const sendCleanResult = (cleanStr) => {
				// Normalize and strip common wrappers (```json, ```html, leading 'json ')
				let raw = (cleanStr || '').trim();
				raw = raw.replace(/^```(?:json|html)?\s*/i, '').replace(/\s*```$/i, '');
				raw = raw.replace(/^json\s+/i, '');
				// Try to extract a JSON object with html_response safely
				let jsonCandidate = null;
				if (raw.startsWith('{') && raw.includes('"html_response"')) {
					jsonCandidate = raw;
				} else if (raw.includes('{"html_response"')) {
					const startIndex = raw.indexOf('{"html_response"');
					const endIndex = raw.lastIndexOf('}');
					if (startIndex !== -1 && endIndex > startIndex) {
						jsonCandidate = raw.substring(startIndex, endIndex + 1);
					}
				}

				if (jsonCandidate) {
					try {
						const jsonResult = JSON.parse(jsonCandidate);
						if (jsonResult && jsonResult.html_response) {
							let html = jsonResult.html_response;
							// Unescape common sequences from model output
							html = html.replace(/\\n/g, '\n').replace(/\\\"/g, '"').replace(/\\\\/g, '\\');
							html = html.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '');
							html = fixUTF8Encoding(html);
							res.setHeader('Content-Type', 'text/html; charset=utf-8');
							return res.send(html);
						}
						if (jsonResult && jsonResult.error) {
							res.setHeader('Content-Type', 'application/json; charset=utf-8');
							return res.status(500).json(jsonResult);
						}
					} catch (_) {}
				}

				// As a last resort, attempt to strip wrappers and send only HTML-like content
				let fixedContent = fixUTF8Encoding(raw);
				fixedContent = fixedContent.replace(/^```(?:html|json)?\s*/i, '').replace(/\s*```$/i, '');
				fixedContent = fixedContent.replace(/^json\s+/i, '');
				const isHtml =
					fixedContent.includes('<h2>') ||
					fixedContent.includes('<p>') ||
					fixedContent.includes('<table>') ||
					fixedContent.includes('<html>');
				res.setHeader('Content-Type', isHtml ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
				return res.send(fixedContent);
		};

		if (code !== 0 && !(result && (result.includes('<h2>') || result.includes('<p>') || result.includes('<table>') || result.includes('<html>')))) {
			// Detect missing Python modules to provide actionable error
			const missingMatch = (errorOutput || '').match(/ModuleNotFoundError: No module named '([^']+)'/);
			if (missingMatch && missingMatch[1]) {
				const missingModule = missingMatch[1];
				const pkgMap = {
					'google': 'google-generativeai',
					'google.generativeai': 'google-generativeai',
					'pymongo': 'pymongo',
					'pypdf': 'pypdf',
					'dotenv': 'python-dotenv',
					'requests': 'requests'
				};
				const pipPackage = pkgMap[missingModule] || missingModule;
				res.setHeader('Content-Type', 'application/json; charset=utf-8');
				return res.status(500).json({
					error: 'PYTHON_DEPENDENCY_MISSING',
					missing_module: missingModule,
					pip_package: pipPackage,
					requirements_path: '/python/requirements.txt',
					message: `Falta el módulo de Python "${missingModule}". Instala dependencias con: pip install -r python/requirements.txt`
				});
			}
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