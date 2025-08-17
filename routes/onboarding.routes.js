/*
Routes: Onboarding API endpoints for user data collection and regulatory profile generation.
Endpoints:
- POST /api/regulatory-profile: Generate regulatory profile using Gemini AI based on user answers
- POST /api/save-onboarding-data: Save initial onboarding data (requires auth)
- POST /api/save-regulatory-profile: Save generated regulatory profile (requires auth)
*/
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// MongoDB configuration
const uri = process.env.DB_URI;
const mongodbOptions = {};

// POST /api/regulatory-profile - Generate regulatory profile using Gemini AI
router.post('/api/regulatory-profile', async (req, res) => {
  try {
    const answers = req.body.answers || {};
    if (!answers || Object.keys(answers).length === 0) {
      return res.status(400).json({ error: 'No answers provided' });
    }

    /* ---------------- GOOGLE GEMINI CONFIG ---------------- */
    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Google Gemini API key not configured' });
    }

    const companyWebsite = answers['web_empresa'] || '';

    // ✅ HELPER MEJORADO: Extraer texto de sitio web con mejor manejo de errores
    async function extractWebsiteText(url) {
      try {
        // ✅ MEJORA 1: Verificar si ya tiene protocolo antes de agregarlo
        let fullUrl = url;
        if (!url.match(/^https?:\/\//i)) {
          fullUrl = `https://${url}`;
        }
        
        // ✅ MEJORA: Timeout correcto para Node.js usando AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const resp = await fetch(fullUrl, { 
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!resp.ok) {
          console.warn(`Website fetch failed with status: ${resp.status} for URL: ${fullUrl}`);
          return { success: false, content: '', error: `HTTP ${resp.status}` };
        }
        
        const html = await resp.text();
        
        // Verificar si el contenido HTML está vacío o es muy corto
        if (!html || html.trim().length < 50) {
          console.warn(`Website content too short or empty for URL: ${fullUrl}`);
          return { success: false, content: '', error: 'Contenido vacío' };
        }
        
        // Remove script/style tags and collapse whitespace
        const cleaned = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ') // strip tags
          .replace(/&[a-z]+;/gi, ' ') // basic entity removal
          .replace(/\s+/g, ' ') // collapse whitespace
          .trim();
          
        // No limit content - send the full cleaned text to ensure complete analysis
        const finalContent = cleaned;
        
        // Verificar si después de la limpieza queda contenido útil
        if (finalContent.length < 100) {
          console.warn(`Cleaned content too short for URL: ${fullUrl}`);
          return { success: false, content: finalContent, error: 'Contenido insuficiente' };
        }
        
        console.log(`✓ Full content length: ${finalContent.length} characters (no truncation)`);
        
        return { success: true, content: finalContent, error: null };
      } catch (err) {
        console.error('Error fetching website content:', err.message, 'for URL:', url);
        return { success: false, content: '', error: err.message };
      }
    }

    // ✅ MEJORA 2: Detectar errores de extracción web y crear metadata
    let websiteExtract = '';
    let websiteExtractionStatus = { success: true, error: null };
    
    if (companyWebsite) {
      console.log('🌐 Attempting to extract website content from:', companyWebsite);
      const extractResult = await extractWebsiteText(companyWebsite);
      websiteExtract = extractResult.content;
      websiteExtractionStatus = {
        success: extractResult.success,
        error: extractResult.error
      };
      
      // ✅ DEBUG: Log extraction status
      console.log('🌐 Website extraction result:', {
        url: companyWebsite,
        success: websiteExtractionStatus.success,
        error: websiteExtractionStatus.error,
        contentLength: websiteExtract.length
      });
    }

    // ✅ FILTRAR "Captación de clientes | Marketing" del prompt pero mantenerlo en answers
    const answersForPrompt = { ...answers };
    if (answersForPrompt['motivacion_principal'] === 'Captación de clientes | Marketing') {
      // Eliminar esta motivación específica del prompt pero mantenerla en el objeto original
      delete answersForPrompt['motivacion_principal'];
    }

    // ✅ CONSTRUIR PROMPT MEJORADO CON MANEJO ESPECÍFICO DE VARIABLES
    function buildEnhancedPrompt(answersData, websiteExtract, companyWebsite) {
      // Extraer variables específicas del objeto answers
      const tipoEmpresa = answersData['tipo_empresa'] || 'No especificado';
      const motivacionPrincipal = answersData['motivacion_principal'] || 'No especificado';
      const numEmpleados = answersData['num_empleados'] || 'No especificado';
      const webEmpresa = answersData['web_empresa'] || companyWebsite || 'No especificado';
      
      // Variables específicas según tipo de empresa
      let contextoEspecifico = '';
      
      if (tipoEmpresa === 'despacho') {
        const origenInteres = answersData['pregunta_origen_interes'] || 'No especificado';
        const areaPractica = answersData['pregunta_area_practica'] || 'No especificado';
        contextoEspecifico = `\n- Origen del interés regulatorio: ${origenInteres}\n- Área práctica principal: ${areaPractica}`;
      } else if (tipoEmpresa === 'consultora') {
        const especializacion = answersData['pregunta_especializacion'] || 'No especificado';
        contextoEspecifico = `\n- Especialización: ${especializacion}`;
      } else if (tipoEmpresa === 'empresa_regulada') {
        const sector = answersData['pregunta_sector'] || 'No especificado';
        const actividad = answersData['pregunta_actividad'] || 'No especificado';
        contextoEspecifico = `\n- Sector: ${sector}\n- Actividad específica: ${actividad}`;
      }
      
      // Construir lista de información organizada
      const infoOrganizada = `INFORMACIÓN BÁSICA:
- Tipo de empresa: ${tipoEmpresa}
- Motivación principal: ${motivacionPrincipal}
- Tamaño de empresa: ${numEmpleados}
- Sitio web: ${webEmpresa}${contextoEspecifico}

INFORMACIÓN ADICIONAL DEL CUESTIONARIO:`;
      
      // Agregar otras variables que no sean las ya incluidas
      const variablesExcluidas = ['tipo_empresa', 'motivacion_principal', 'num_empleados', 'web_empresa', 'pregunta_origen_interes', 'pregunta_area_practica', 'pregunta_especializacion', 'pregunta_sector', 'pregunta_actividad'];
      const otrasVariables = Object.entries(answersData)
        .filter(([k, v]) => !variablesExcluidas.includes(k) && v && v.trim() !== '')
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n');
      
      const infoCompleta = otrasVariables ? `${infoOrganizada}\n${otrasVariables}` : infoOrganizada;
      
      return `A continuación encontrarás la información recopilada de una empresa a través de un cuestionario breve. Con estos datos y la siguiente información adicional obtenida de su página web oficial, genera un PERFIL REGULATORIO completo y conciso que pueda servir como contexto para modelos posteriores (agentes) que evaluarán el impacto de normativas en dicha empresa.

${infoCompleta}

EXTRACTO DE LA PÁGINA WEB (texto plano):
${websiteExtract || 'No se pudo obtener información de la página web'}`;
    }

    // Build user prompt con la nueva función
    const userPrompt = buildEnhancedPrompt(answersForPrompt, websiteExtract, companyWebsite);

    // Load system instructions from prompts file
    const promptsPath = path.join(__dirname, '..', 'prompts', 'contexto_regulatorio.md');
    const promptsContent = fs.readFileSync(promptsPath, 'utf8');
    const systemInstructions = promptsContent.match(/contexto: \|([\s\S]*?)---/)[1].trim();

    /* ---------------- CALL GEMINI 1.5 PRO ---------------- */
    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;

    const body = {
      systemInstruction: {
        parts: [{ text: systemInstructions }]
      },
      contents: [
        { role: 'user', parts: [{ text: userPrompt }] }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 2048
      }
    };

    const response = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error('Gemini API error:', txt);
      return res.status(500).json({ error: 'Gemini API request failed' });
    }

    const data = await response.json();
    const aiContent = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    let parsed;
    try {
      parsed = JSON.parse(aiContent);
      
      // ✅ AGREGAR METADATA DE EXTRACCIÓN WEB AL RESPONSE
      parsed.website_extraction_status = websiteExtractionStatus;
      
      // ✅ DEBUG: Log response being sent
      console.log('📤 Sending response with website_extraction_status:', {
        success: parsed.website_extraction_status.success,
        error: parsed.website_extraction_status.error
      });
      
    } catch (err) {
      console.error('Failed to parse Gemini response:', err, aiContent);
      return res.status(500).json({ error: 'Invalid AI response format' });
    }

    return res.json(parsed);
  } catch (err) {
    console.error('Error generating regulatory profile', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/save-onboarding-data - Save initial onboarding data
router.post('/api/save-onboarding-data', ensureAuthenticated, async (req, res) => {
  try {
    const { tipo_empresa, detalle_empresa, interes, tamaño_empresa, web } = req.body;

    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const updateData = {
      tipo_empresa,
      detalle_empresa,
      interes,
      tamaño_empresa,
      web
    };

    // Remove undefined fields
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    if (Object.keys(updateData).length > 0) {
        await usersCollection.updateOne(
          { _id: new ObjectId(req.user._id) },
          { $set: updateData }
        );
    }

    await client.close();
    res.status(200).json({ success: true, message: 'Onboarding data saved.' });
  } catch (error) {
    console.error('Error saving onboarding data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/save-regulatory-profile - Save generated regulatory profile
router.post('/api/save-regulatory-profile', ensureAuthenticated, async (req, res) => {
  try {
    const { perfil_regulatorio, website_extraction_status } = req.body;
    if (!perfil_regulatorio) {
      return res.status(400).json({ error: 'perfil_regulatorio is required' });
    }

    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    // ✅ GUARDAR TAMBIÉN ESTADO DE EXTRACCIÓN WEB
    const updateData = { perfil_regulatorio };
    if (website_extraction_status) {
      updateData.website_extraction_status = website_extraction_status;
    }

    await usersCollection.updateOne(
      { _id: new ObjectId(req.user._id) },
      { $set: updateData }
    );

    await client.close();
    res.status(200).json({ success: true, message: 'Regulatory profile saved.' });
  } catch (error) {
    console.error('Error saving regulatory profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 