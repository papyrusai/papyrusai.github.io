/************************************************
 * newsletter.js
 *
 * To run:
 *   node newsletter.js
 *
 * - Cada usuario recibe un email con matches de
 *   las colecciones definidas en user.cobertura_legal,
 *   o BOE si no existe/está vacío.
 ************************************************/
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const moment = require('moment');
const path = require('path');

require('dotenv').config();


// 1) Configuration
const MONGODB_URI = process.env.DB_URI;
const DB_NAME = 'papyrus';

// Take today's date in real time
const TODAY = moment().utc();
//const TOMORROW = TODAY.clone().add(1, 'day');
const anioToday = TODAY.year();
const mesToday  = TODAY.month() + 1;
const diaToday  = TODAY.date();

// Format current date as YYYY-MM-DD for logs
const currentDateString = TODAY.format('YYYY-MM-DD');

// 2) Setup nodemailer with SendGrid transport
console.log("SendGrid key is:", process.env.SENDGRID_API_KEY);
const transporter = nodemailer.createTransport(
  sgTransport({
    auth: {
      api_key: process.env.SENDGRID_API_KEY
    }
  })
);

/**
 * Check if webscraping ran today by looking for a log entry
 */
async function checkWebscrapingRanToday(db) {
  try {
    const logsCollection = db.collection('logs');
    const logEntry = await logsCollection.findOne({ "date_range.start": currentDateString });
    return logEntry !== null;
  } catch (err) {
    console.error('Error checking webscraping logs:', err);
    return false;
  }
}

/**
 * Send warning email to info@reversa.ai
 */
async function sendWarningEmail() {
  const warningMailOptions = {
    from: 'Reversa <info@reversa.ai>',
    to: 'info@reversa.ai',
    subject: `WARNING - Webscraping no ejecutado - ${currentDateString}`,
    html: `
      <h2>WARNING</h2>
      <p>No se ha corrido el código webscraping hoy (${currentDateString}).</p>
      <p>Por favor, verificar el sistema de webscraping.</p>
      <p>Timestamp: ${moment().format('YYYY-MM-DD HH:mm:ss')} UTC</p>
    `
  };

  try {
    await transporter.sendMail(warningMailOptions);
    console.log('Warning email sent to info@reversa.ai');
  } catch (err) {
    console.error('Error sending warning email:', err);
  }
}

/**
 * Get all collections that have documents for today
 */
async function getAvailableCollectionsToday(db) {
  // Get all collections from the database
  const allCollections = await db.listCollections().toArray();
  const excludedCollections = ['logs', 'Feedback', 'Ramas boja', 'Ramas UE', 'users'];
  
  // Filter out excluded collections
  const availableCollections = [];
  for (const collection of allCollections) {
    const collectionName = collection.name;
    if (!excludedCollections.includes(collectionName)) {
      try {
        const coll = db.collection(collectionName);
        const query = {
          anio: anioToday,
          mes: mesToday,
          dia: diaToday
        };
        
        const count = await coll.countDocuments(query);
        if (count > 0) {
          availableCollections.push(collectionName);
        }
      } catch (err) {
        console.warn(`Error checking collection ${collectionName}:`, err);
      }
    }
  }

  return availableCollections;
}

/**
 * Log the first shipment information
 */
async function logFirstShipment(db, availableCollections) {
  try {
    const logsCollection = db.collection('logs');
    const currentTimestamp = moment().toDate();
    
    const updateResult = await logsCollection.updateOne(
      { "date_range.start": currentDateString },
      {
        $set: {
          first_shipment: {
            time_stamp: currentTimestamp,
            collections: availableCollections
          }
        }
      },
      { upsert: true }
    );

    console.log('First shipment logged successfully:', {
      date: currentDateString,
      timestamp: currentTimestamp,
      collections: availableCollections
    });
  } catch (err) {
    console.error('Error logging first shipment:', err);
  }
}

/** Mapea ciertos nombres de colección a textos más descriptivos */
function mapCollectionNameToDisplay(cName) {
  const upper = (cName || '').toUpperCase();
  switch (upper) {
    // Fuentes de Gobierno
    case 'BOE':   return 'Boletín Oficial del Estado';
    case 'DOUE':  return 'Diario Oficial de la Unión Europea';
    case 'BOCG':  return 'Boletín Oficial de las Cortes Generales';
    case 'BOA':   return 'Boletín Oficial de Aragón';
    case 'BOCYL': return 'Boletín Oficial de Castilla y León';
    case 'BOCM':  return 'Boletín Oficial de la Comunidad de Madrid';
    case 'BORM':  return 'Boletín Oficial de la Región de Murcia';
    case 'DOGC':  return 'Diario Oficial de la Generalitat Catalana';
    case 'DOG':   return 'Diario Oficial de Galicia';
    case 'BOJA':  return 'Boletín Oficial de la Junta de Andalucía';
    case 'BOPV':  return 'Boletín Oficial del País Vasco';
    
    // Fuentes de Reguladores
    case 'AEPD':  return 'Agencia Española de Protección de Datos';
    case 'EBA':   return 'Autoridad Bancaria Europea';
    case 'ESMA':  return 'Autoridad Europea de Valores y Mercados';
    case 'CNMV':  return 'Comisión Nacional del Mercado de Valores';
    case 'CNMC':  return 'Comisión Nacional de los Mercados y la Competencia';
    
    // Default case
    default:      return upper;
  }
}

/**
 * buildDocumentHTML:
 * Genera un snippet HTML para un único doc.
 * Modificado para mostrar solo etiquetas personalizadas en caso de match
 */
function buildDocumentHTML(doc, isLastDoc) {
  // Manejar etiquetas personalizadas
  let etiquetasPersonalizadasHTML = '';
  
  // Verificar si hay etiquetas personalizadas coincidentes
  if (doc.matched_etiquetas_personalizadas && doc.matched_etiquetas_personalizadas.length) {
    etiquetasPersonalizadasHTML = doc.matched_etiquetas_personalizadas.map(etiqueta => 
      `<span class="etiqueta">${etiqueta}</span>`
    ).join('');
  }

  // Nueva sección: Impacto en agentes
  let impactoAgentesHTML = '';
  if (doc.matched_etiquetas_personalizadas && doc.matched_etiquetas_personalizadas.length && doc.matched_etiquetas_descriptions) {
    impactoAgentesHTML = `
      <div style="
        margin-top: 15px;
        margin-bottom: 20px;
        padding-left: 15px;
        border-left: 4px solid #4ce3a7;
        background-color: rgba(76, 227, 167, 0.05);
      ">
        <h4 style="margin-bottom: 8px; color: #0c2532;">Impacto en agentes</h4>
        ${doc.matched_etiquetas_personalizadas.map((etiqueta, index) => {
          const description = doc.matched_etiquetas_descriptions[index] || '';
          return `<p style="margin: 5px 0; font-size: 0.9em;"><strong>${etiqueta}:</strong> ${description}</p>`;
        }).join('')}
      </div>
    `;
  }

  const hrOrNot = isLastDoc
    ? ''
    : `
      <hr style="
        border: none;
        border-top: 1px solid #ddd;
        width: 75%;
        margin: 10px auto;
      ">
    `;

  return `
    <div class="document">
      <h2>${doc.short_name}</h2>
      <p>${etiquetasPersonalizadasHTML}</p>
      <p style="color: black;">${doc.resumen}</p>
      ${impactoAgentesHTML}
      <p>
        <div class="margin-impacto">
          <a class="button-impacto"
            href="https://app.reversa.ai/norma.html?documentId=${doc._id}&collectionName=${doc.collectionName}"
            style="margin-right: 10px;">
            Análisis impacto normativo
          </a>
        </div>
        <a href="${doc.url_pdf}" target="_blank" style="color:#4ce3a7;">
          Leer más: ${doc._id}
        </a>
        <span class="less-opacity">
          ${doc.num_paginas || 0} 
          ${doc.num_paginas === 1 ? 'página' : 'páginas'}
          - tiempo estimado de lectura: ${doc.tiempo_lectura || 1} minutos
        </span>
      </p>
    </div>
    ${hrOrNot}
  `;
}
  
/**
 * buildDocumentHTMLnoMatches:
 * Genera un snippet HTML para un único doc en caso de no match.
 * Modificado para mostrar solo etiquetas de ramas e industrias (sin subramas y subindustrias)
 */
function buildDocumentHTMLnoMatches(doc, isLastDoc) {
  // Extraer todas las industrias del documento
  let industrias = [];
  
  if (doc.divisiones) {
    // Si divisiones_cnae es un objeto (nueva estructura)
    if (typeof doc.divisiones === 'object' && !Array.isArray(doc.divisiones)) {
      industrias = Object.keys(doc.divisiones);
    } 
    // Si divisiones_cnae es un array (estructura antigua)
    else if (Array.isArray(doc.divisiones)) {
      industrias = doc.divisiones;
    }
    // Si divisiones_cnae es un string
    else {
      industrias = [doc.divisiones];
    }
  }

  // Extraer todas las ramas jurídicas
  let ramas = [];
  if (doc.ramas_juridicas) {
    ramas = doc.ramas_juridicas;
  }

  // Generar HTML para cada tipo de etiqueta
  const industriasHTML = industrias.map(ind => `<span class="etiqueta">${ind}</span>`).join('');
  const ramaHTML = ramas.map(r => `<span class="etiqueta" style="background-color: #092534; color: white;">${r}</span>`).join('');

  const hrOrNot = isLastDoc ? '' : `<hr style="border: none; border-top: 1px solid #ddd; width: 75%; margin: 10px auto;">`;

  return `
  <div class="document">
    <h2>${doc.short_name}</h2>
    <p>${industriasHTML} ${ramaHTML}</p>
    <p style="color: black;">${doc.resumen}</p>
    <p>
      <div class="margin-impacto">
        <a class="button-impacto"
           href="https://app.reversa.ai/norma.html?documentId=${doc._id}&collectionName=${doc.collectionName}"
           style="margin-right: 10px;">
          Análisis impacto normativo
        </a>
      </div>
      <a href="${doc.url_pdf}" target="_blank" style="color:#4ce3a7;">
        Leer más: ${doc._id}
      </a>
      <span class="less-opacity">
        ${doc.num_paginas || 0} 
        ${doc.num_paginas === 1 ? 'página' : 'páginas'}
        - tiempo estimado de lectura: ${doc.tiempo_lectura || 1} minutos
      </span>
    </p>
  </div>
  ${hrOrNot}
`;  
}

/**
 * buildNewsletterHTML:
 * Construye el newsletter con matches para un usuario.
 */
function buildNewsletterHTML(userName, userId, dateString, rangoGroups, isExtraVersion = false) {
  // Create summary section by ranges instead of CNAE/juridical categories
  console.log("Normal html is triggered");
  const rangoSummaryHTML = rangoGroups.map(rango => {
    const totalDocs = rango.collections.reduce((sum, coll) => sum + coll.docs.length, 0);
    return `<li>${totalDocs} Alertas de <span style="color:#4ce3a7;">${rango.rangoTitle}</span></li>`;
  }).join('');

  let summarySection = '';
  if (rangoGroups.length > 0) {
    summarySection = `
      <h4 style="font-size:16px; margin-bottom:15px; color:#0c2532">
        RESUMEN POR TIPO DE NORMATIVA
      </h4>
      <ul style="margin-bottom:15px;">
        ${rangoSummaryHTML}
      </ul>
    `;
  }

  // Build detail blocks by range and collection
  const detailBlocks = rangoGroups.map((rango, rangoIndex) => {
    // Range header (Legislación, Normativa Reglamentaria, etc.)
    const rangoHeading = `
      <div style="background-color:#4ce3a7; margin:5% 0; padding:5px 20px; border-radius:20px;">
        <h2 style="margin:0; color:#fefefe; font-size:14px;">
          ${rangoIndex + 1}. ${rango.rangoTitle.toUpperCase()}
        </h2>
      </div>
    `;

    // Collection blocks within this range
    const collectionBlocks = rango.collections.map((collObj, collIndex) => {
      const docsHTML = collObj.docs.map((doc, idx) => {
        const isLastDoc = (idx === collObj.docs.length - 1);
        return buildDocumentHTML(doc, isLastDoc);
      }).join('');

      // Collection header with numbered sections (1.1, 1.2, etc.)
      const collectionHeading = `
        <h3 style="
          color:#0c2532;
          margin: 3% auto;
          margin-top:5%;
          text-align:center;
          font-style:italic;
        ">
          ${rangoIndex + 1}.${collIndex + 1} ${collObj.displayName}
        </h3>
      `;

      const collectionSeparator = `
        <hr style="
          border: none;
          border-top: 1px solid #0c2532;
          width: 100%;
          margin: 10px auto;
        ">
      `;

      return `
        ${collectionSeparator}
        ${collectionHeading}
        ${docsHTML}
      `;
    }).join('');

    return rangoHeading + collectionBlocks;
  }).join('');
  
  // Extra version message
  const extraVersionMessage = isExtraVersion ? `
    <div style="text-align: center; margin: 10px 0 20px 0;">
      <p style="font-style: italic; color: #666; font-size: 14px; margin: 0;">
        Versión Extra: para cubrir boletines emitidos con retraso
      </p>
    </div>
  ` : '';
  
  // HTML final
  return `
  <!DOCTYPE html>
  <html lang="es">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Newsletter</title>
    <style>  
   
        body {
        font-family: 'Satoshi', sans-serif;
        margin: 0;
        padding: 0;
        background-color: #fefefe;
        color: #0c2532;
      }
      .container {
        max-width: 800px;
        margin: 20px auto;
        padding: 20px;
        background-color: #ffffff;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      }
               .button-impacto {
      background-color: #0c2532;
      color: white;
      padding: 5px 10px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      margin-bottom: 2%;
      font-size: 14px;
      text-decoration: none;
    }

    .button-impacto:hover {
      background-color: #0c2532; /* Darker blue on hover */
    }
      
    .margin-impacto {
      margin-bottom: 3%;
    }
 
      h2 {
        color: #0c2532;
        margin-bottom: 10px;
      }
      a:hover {
        text-decoration: underline;
      }
      .document {
        margin-bottom: 20px;
        padding: 15px;
      }
      .etiqueta {
        display: inline-block;
        background-color: #4ce3a7;
        color: #0c2532;
        padding: 5px 10px;
        border-radius: 15px;
        margin: 2px;
        font-size: 0.9em;
      }
      .less-opacity {
        opacity: 0.6;
        font-size: 0.9em;
        font-style: italic;
      }
      ul {
        margin-left: 20px;
      }
      .online-link {
        text-align: right;
        font-size: 14px;
        margin-bottom: 5px;
      }
      .online-link a {
        color: #0c2532;
        text-decoration: underline;
      }
      .logo-container {
        margin-top: 10px;
        margin-bottom: 20px;
        text-align: center;
      }
      @media (max-width: 600px) {
        .container {
          margin: 10px auto;
          padding: 15px;
          width: 95%;
        }
        .less-opacity {
          display: block;
          margin-top: 5px;
        }
        h2 {
          font-size: 18px;
        }
      }
    </style>
  </head>
  <link href="https://api.fontshare.com/v2/css?f[]=satoshi@300&display=swap" rel="stylesheet">
  <body>
    <div class="container">
      <div class="online-link">
        <a href="https://reversa.ai/profile" target="_blank">Ver online</a>
      </div>
      <div class="logo-container">
        <img src="cid:reversaLogo" alt="Reversa Logo" style="max-width:250px; height:auto;" />
      </div>

      ${extraVersionMessage}

      <p>Hola ${userName}, a continuación te resumimos las novedades normativas de tu interés del día <strong>${dateString}</strong>:</p>

      ${summarySection}

      <div style="text-align:center; margin:15px 0;">
        <a href="https://reversa.ai/"
           style="
             display:inline-block;
             background-color:#4ce3a7;
             color:#fff;
             padding:8px 16px;
             border-radius:5px;
             text-decoration:none;
             font-weight:bold;
             margin-top:10px;
           ">
          Inicia sesión
        </a>
      </div>

      <hr style="border:none; border-top:1px solid #ddd; margin:5% 0;">
      <p>Encuentra un resumen de cada norma con sus principales implicaciones a continuación.</p>

      ${detailBlocks}

      <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;">

      <!-- Bloque de 1-5 satisfecho -->
      <div style="text-align:center; margin: 20px 0;">
        <p style="font-size:16px; color:#0c2532; font-weight:bold; margin-bottom:10px;">
          ¿Qué te ha parecido este resumen normativo?
        </p>
        <table align="center" style="border-spacing:10px;">
          <tr>
            <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.reversa.ai/feedback?userId=${userId}&grade=1"
                 style="color:#fff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                1
              </a>
            </td>
            <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.reversa.ai/feedback?userId=${userId}&grade=2"
                 style="color:#fff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                2
              </a>
            </td>
            <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.reversa.ai/feedback?userId=${userId}&grade=3"
                 style="color:#fff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                3
              </a>
            </td>
            <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.reversa.ai/feedback?userId=${userId}&grade=4"
                 style="color:#fff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                4
              </a>
            </td>
            <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.reversa.ai/feedback?userId=${userId}&grade=5"
                 style="color:#fff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                5
              </a>
            </td>
          </tr>
          <tr>
            <td style="text-align:center; font-size:12px; color:#0c2532;">
              Poco<br>satisfecho
            </td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td style="text-align:center; font-size:12px; color:#0c2532;">
              Muy<br>satisfecho
            </td>
          </tr>
        </table>
      </div>

      <p style="font-size:0.9em; color:#666; text-align:center;">
        &copy; ${moment().year()} Reversa. Todos los derechos reservados.
      </p>

      <div style="text-align:center; margin-top: 20px;">
        <a href="https://reversa.ai/suscripcion.html"
           target="_blank"
           style="color: #0c2532; text-decoration: underline; font-size: 14px;">
          Cancelar Suscripción
        </a>
      </div>
    </div>
  </body>
  </html>
  `;
}

/**
 * Newsletter "no matches" scenario.
 * Muestra SOLO docs BOE con seccion = "Disposiciones Generales".
 * Si no hay ninguno => "No se han publicado disposiciones generales en el BOE hoy".
 */
function buildNewsletterHTMLNoMatches(userName, userId, dateString, boeDocs) {
  // Filter for disposiciones generales
  const boeGeneralDocs = boeDocs.filter(doc => doc.seccion === "Disposiciones generales");
  
  console.log("No matches is being triggered");

  // Intro text based on document count
  let introText = '';
  if (boeGeneralDocs.length === 0) {
    introText = `<p>Hoy no hay nada que te afecte directamente, puedes estar tranquilo</p>`;
  } else {
    introText = `<p>Hoy no hay nada que te afecte directamente, pero por si te pica la curiosidad, aquí tienes un resumen de 5 minutos de las disposiciones generales del BOE:</p>`;
  }

  // NEW: Group by rango first, then by collection
  const rangoGroups = {};
  
  boeGeneralDocs.forEach(doc => {
    // Get rango_titulo or default to "Otras"
    const rango = doc.rango_titulo || "Otras";
    
    // Initialize the rango group if needed
    if (!rangoGroups[rango]) {
      rangoGroups[rango] = {};
    }
    
    // Use the document's collection name (should be BOE for all)
    const collectionName = doc.collectionName || "BOE";
    
    // Initialize the collection subgroup if needed
    if (!rangoGroups[rango][collectionName]) {
      rangoGroups[rango][collectionName] = [];
    }
    
    // Add document to its group
    rangoGroups[rango][collectionName].push(doc);
  });
  
  // Convert to array structure like in buildNewsletterHTML
  const finalGroups = [];
  for (const [rango, collections] of Object.entries(rangoGroups)) {
    const rangoGroup = {
      rangoTitle: rango,
      collections: []
    };
    
    for (const [collName, docs] of Object.entries(collections)) {
      rangoGroup.collections.push({
        collectionName: collName,
        displayName: mapCollectionNameToDisplay(collName),
        docs: docs
      });
    }
    
    finalGroups.push(rangoGroup);
  }
  
  // Sort rango groups 
  finalGroups.sort((a, b) => {
    const order = [
      "Legislación", 
      "Normativa Reglamentaria", 
      "Doctrina Administrativa",
      "Comunicados, Guías y Directivas de Reguladores",
      "Decisiones Judiciales",
      "Normativa Europea",
      "Acuerdos Internacionales",
      "Anuncios de Concentración de Empresas",
      "Dictámenes y Opiniones",
      "Subvenciones",
      "Declaraciones e Informes de Impacto Ambiental",
      "Otras"
    ];
    return order.indexOf(a.rangoTitle) - order.indexOf(b.rangoTitle);
  });
  
  // Build summary just like in the regular newsletter
  const rangoSummaryHTML = finalGroups.map(rango => {
    const totalDocs = rango.collections.reduce((sum, coll) => sum + coll.docs.length, 0);
    return `<li>${totalDocs} Alertas de <span style="color:#4ce3a7;">${rango.rangoTitle}</span></li>`;
  }).join('');
  
  let summarySection = '';
  if (finalGroups.length > 0) {
    summarySection = `
      <h4 style="font-size:16px; margin-bottom:15px; color:#0c2532">
        RESUMEN POR TIPO DE NORMATIVA
      </h4>
      <ul style="margin-bottom:15px;">
        ${rangoSummaryHTML}
      </ul>
    `;
  }
  
  // Build detail blocks exactly like in buildNewsletterHTML
  const detailBlocks = finalGroups.map((rango, rangoIndex) => {
    // Range header
    const rangoHeading = `
      <div style="background-color:#4ce3a7; margin:5% 0; padding:5px 20px; border-radius:20px;">
        <h2 style="margin:0; color:#fefefe; font-size:14px;">
          ${rangoIndex + 1}. ${rango.rangoTitle.toUpperCase()}
        </h2>
      </div>
    `;
  
    // Collection blocks within this range
    const collectionBlocks = rango.collections.map((collObj, collIndex) => {
      const docsHTML = collObj.docs.map((doc, idx) => {
        const isLastDoc = (idx === collObj.docs.length - 1);
        return buildDocumentHTMLnoMatches(doc, isLastDoc);
      }).join('');
  
      // Collection header with numbered sections
      const collectionHeading = `
        <h3 style="
          color:#0c2532;
          margin: 3% auto;
          margin-top:5%;
          text-align:center;
          font-style:italic;
        ">
          ${rangoIndex + 1}.${collIndex + 1} ${collObj.displayName}
        </h3>
      `;
  
      const collectionSeparator = `
        <hr style="
          border: none;
          border-top: 1px solid #0c2532;
          width: 100%;
          margin: 10px auto;
        ">
      `;
  
      return `
        ${collectionSeparator}
        ${collectionHeading}
        ${docsHTML}
      `;
    }).join('');
  
    return rangoHeading + collectionBlocks;
  }).join('');

  // The rest of the HTML remains the same
  return `
  <!DOCTYPE html>
  <html lang="es">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Newsletter - Sin coincidencias</title>
    <style>

        body {
        font-family: 'Satoshi', sans-serif;
        margin: 0;
        padding: 0;
        background-color: #ffffff;
        color: #0c2532;
      }
      .container {
        max-width: 800px;
        margin: 20px auto;
        padding: 20px;
        background-color: #ffffff;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      }
      h2 {
        color: #0c2532; 
        margin-bottom: 10px;
      }
      a:hover {
        text-decoration: underline;
      }
      .document {
        margin-bottom: 20px;
        padding: 15px;
      }
      .etiqueta {
      display: inline-block;
      background-color: #4ce3a7;
      color: #0c2532;
      padding: 5px 10px;
      border-radius: 15px;
      margin: 2px;
      font-size: 0.9em;
    }
   
      .less-opacity {
        opacity: 0.6;
        font-size: 0.9em;
        font-style: italic;
      }
      ul {
        margin-left: 20px;
      }
      .online-link {
        text-align: right;
        font-size: 14px;
        margin-bottom: 5px;
      }
      .online-link a {
        color: #0c2532;
        text-decoration: underline;
      }
  .button-impacto {
    background-color: #092534;
    color: white;
    padding: 5px 10px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    margin-bottom: 2%;
    font-size: 14px;
    text-decoration: none;
  }

  .button-impacto:hover {
    background-color: #4ce3a7; /* Darker blue on hover */
  }
    
  .margin-impacto {
    margin-bottom: 3%;
  }
      .logo-container {
        margin-top: 10px;
        margin-bottom: 20px;
        text-align: center;
      }
      @media (max-width: 600px) {
        .container {
          margin: 10px auto;  
          padding: 15px;      
          width: 95%;        
        }
        .less-opacity {
          display: block; 
          margin-top: 5px; 
        }
        h2 {
          font-size: 18px;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="online-link">
        <a href="https://reversa.ai/profile" target="_blank">Ver online</a>
      </div>
      <div class="logo-container">
        <img src="cid:reversaLogo" alt="Reversa Logo" style="max-width:250px; height:auto;" />
      </div>

      <p>Hola ${userName}, <strong>no hay novedades normativas</strong> de tu interés el día <strong>${dateString}</strong>.</p>

      <div style="text-align:center; margin:15px 0;">
        <a href="https://reversa.ai" 
           style="
             display:inline-block;
             background-color:#4ce3a7;
             color:#fff;
             padding:8px 16px;
             border-radius:5px;
             text-decoration:none;
             font-weight:bold;
             margin-top:10px;
           ">
          Inicia sesión
        </a>
      </div>

      <hr style="border:none; border-top:1px solid #ddd; margin:5% 0;">
      ${introText}
      ${summarySection}
      ${detailBlocks}

      <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;">

      <div style="text-align:center; margin: 20px 0;">
        <p style="font-size:16px; color:#0c2532; font-weight:bold; margin-bottom:10px;">
          ¿Qué te ha parecido este resumen normativo?
        </p>
        <table align="center" style="border-spacing:10px;">
          <tr>
            <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.reversa.ai/feedback?userId=${userId}&grade=1"
                 style="color:#ffffff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                1
              </a>
            </td>
            <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.reversa.ai/feedback?userId=${userId}&grade=2"
                 style="color:#ffffff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                2
              </a>
            </td>
            <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.reversa.ai/feedback?userId=${userId}&grade=3"
                 style="color:#ffffff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                3
              </a>
            </td>
            <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.reversa.ai/feedback?userId=${userId}&grade=4"
                 style="color:#ffffff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                4
              </a>
            </td>
            <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.reversa.ai/feedback?userId=${userId}&grade=5"
                 style="color:#ffffff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                5
              </a>
            </td>
          </tr>
          <tr>
            <td style="text-align:center; font-size:12px; color:#0c2532;">
              Poco<br>satisfecho
            </td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td style="text-align:center; font-size:12px; color:#0c2532;">
              Muy<br>satisfecho
            </td>
          </tr>
        </table>
      </div>

      <p style="font-size:0.9em; color:#0c2532; text-align:center;">
        &copy; ${moment().year()} Reversa. Todos los derechos reservados.
      </p>
      <div style="text-align:center; margin-top: 20px;">
        <a href="https://reversa.ai/suscripcion"
           target="_blank"
           style="color: #0c2532; text-decoration: underline; font-size: 14px;">
          Cancelar Suscripción
        </a>
      </div>
    </div>
  </body>
  </html>
  `;
}

/**
 * Check if first shipment already exists for today and get previously shipped collections
 */
async function getFirstShipmentInfo(db) {
  try {
    const logsCollection = db.collection('logs');
    const logEntry = await logsCollection.findOne({ "date_range.start": currentDateString });
    
    if (logEntry && logEntry.first_shipment) {
      return {
        exists: true,
        previousCollections: logEntry.first_shipment.collections || [],
        timestamp: logEntry.first_shipment.time_stamp
      };
    }
    
    return {
      exists: false,
      previousCollections: [],
      timestamp: null
    };
  } catch (err) {
    console.error('Error checking first shipment info:', err);
    return {
      exists: false,
      previousCollections: [],
      timestamp: null
    };
  }
}

/**
 * Get collections that are new (not in previous shipment)
 */
function getNewCollections(availableCollections, previousCollections) {
  return availableCollections.filter(collection => 
    !previousCollections.includes(collection)
  );
}

/**
 * Check if any collections have documents with doc_count > 0
 */
async function checkCollectionsHaveDocuments(db) {
  try {
    const logsCollection = db.collection('logs');
    const logEntry = await logsCollection.findOne({ "date_range.start": currentDateString });
    
    if (!logEntry || !logEntry.collections) {
      return false;
    }
    
    // Check if any collection has doc_count > 0
    for (const [collectionName, collectionData] of Object.entries(logEntry.collections)) {
      if (collectionData.doc_count && collectionData.doc_count > 0) {
        return true;
      }
    }
    
    return false;
  } catch (err) {
    console.error('Error checking collections document count:', err);
    return false;
  }
}

/**
 * Send warning email for no documents processed
 */
async function sendNoDocumentsWarningEmail() {
  const warningMailOptions = {
    from: 'Reversa <info@reversa.ai>',
    to: 'info@reversa.ai',
    subject: `WARNING - Webscraping procesado sin documentos - ${currentDateString}`,
    html: `
      <h2>WARNING</h2>
      <p>El webscraping se ha procesado hoy pero no se ha guardado ningún documento en la bbdd (${currentDateString}).</p>
      <p>Por favor, verificar el sistema de procesamiento de documentos.</p>
      <p>Timestamp: ${moment().format('YYYY-MM-DD HH:mm:ss')} UTC</p>
    `
  };

  try {
    await transporter.sendMail(warningMailOptions);
    console.log('No documents warning email sent to info@reversa.ai');
  } catch (err) {
    console.error('Error sending no documents warning email:', err);
  }
}

/**
 * Send comprehensive report email with statistics
 */
async function sendReportEmail(db, userStats) {
  try {
    const logsCollection = db.collection('logs');
    const logEntry = await logsCollection.findOne({ "date_range.start": currentDateString });
    
    if (!logEntry || !logEntry.collections) {
      console.warn('No log entry found for report email');
      return;
    }
    
    // 1. Build collections table
    let collectionsTableHTML = '';
    let totalBoletines = 0;
    let totalDocs = 0;
    let totalPages = 0;
    
    for (const [collectionName, collectionData] of Object.entries(logEntry.collections)) {
      const docCount = collectionData.doc_count || 0;
      const pageCount = collectionData.page_count || 0;
      
      if (docCount > 0) {
        totalBoletines++;
        totalDocs += docCount;
        totalPages += pageCount;
        
        collectionsTableHTML += `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${collectionName}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${docCount}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${pageCount}</td>
          </tr>
        `;
      }
    }
    
    collectionsTableHTML += `
      <tr style="background-color: #f2f2f2; font-weight: bold;">
        <td style="border: 1px solid #ddd; padding: 8px;">TOTAL</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${totalDocs}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${totalPages}</td>
      </tr>
    `;
    
    // 2.1. Build users with matches summary table
    let usersWithMatchesSummaryHTML = '';
    let totalEmailsWithMatches = 0;
    let totalEtiquetasWithMatches = 0;
    
    for (const userStat of userStats.withMatches) {
      totalEmailsWithMatches++;
      
      // Count unique etiquetas for this user
      const etiquetaGroups = new Map();
      for (const docInfo of userStat.detailedMatches) {
        for (const etiqueta of docInfo.matchedEtiquetas) {
          etiquetaGroups.set(etiqueta, true);
        }
      }
      const userEtiquetasCount = etiquetaGroups.size;
      totalEtiquetasWithMatches += userEtiquetasCount;
      
      usersWithMatchesSummaryHTML += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">${userStat.email}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${userEtiquetasCount}</td>
        </tr>
      `;
    }
    
    usersWithMatchesSummaryHTML += `
      <tr style="background-color: #f2f2f2; font-weight: bold;">
        <td style="border: 1px solid #ddd; padding: 8px;">TOTAL</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${totalEtiquetasWithMatches}</td>
      </tr>
    `;
    
    // 2.2. Build users without matches table
    let usersWithoutMatchesHTML = '';
    let totalEmailsWithoutMatches = 0;
    let totalEtiquetasWithoutMatches = 0;
    
    for (const userStat of userStats.withoutMatches) {
      totalEmailsWithoutMatches++;
      totalEtiquetasWithoutMatches += userStat.etiquetasCount;
      
      usersWithoutMatchesHTML += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">${userStat.email}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${userStat.etiquetasCount}</td>
        </tr>
      `;
    }
    
    usersWithoutMatchesHTML += `
      <tr style="background-color: #f2f2f2; font-weight: bold;">
        <td style="border: 1px solid #ddd; padding: 8px;">TOTAL</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${totalEtiquetasWithoutMatches}</td>
      </tr>
    `;
    
    // 3. Build detailed users with matches table
    let usersWithMatchesDetailHTML = '';
    
    for (const userStat of userStats.withMatches) {
      // Parse the detailed match information to create separate rows
      const etiquetaGroups = new Map(); // etiqueta -> { collections: Set, docs: Array }
      
      // Group documents by etiqueta
      for (const docInfo of userStat.detailedMatches) {
        for (const etiqueta of docInfo.matchedEtiquetas) {
          if (!etiquetaGroups.has(etiqueta)) {
            etiquetaGroups.set(etiqueta, { collections: new Set(), docs: [] });
          }
          etiquetaGroups.get(etiqueta).collections.add(docInfo.collectionName);
          etiquetaGroups.get(etiqueta).docs.push({
            collection: docInfo.collectionName,
            shortName: docInfo.shortName,
            urlPdf: docInfo.urlPdf
          });
        }
      }
      
      // Create rows for each etiqueta
      let isFirstRow = true;
      let userTotalEtiquetas = etiquetaGroups.size;
      let userTotalDocs = 0;
      let userTotalDocsCount = 0;
      
      for (const [etiqueta, groupData] of etiquetaGroups.entries()) {
        userTotalDocs += groupData.docs.length;
        userTotalDocsCount += groupData.docs.length;
        
        // Build docs column with bullet points and clickable links
        const docsHTML = groupData.docs.map(doc => 
          `• <a href="${doc.urlPdf}" target="_blank" style="color: #0066cc; text-decoration: none;">${doc.collection}-${doc.shortName}</a>`
        ).join('<br>');
        
        const emailCell = isFirstRow ? 
          `<td style="border: 1px solid #ddd; padding: 8px; vertical-align: top;" rowspan="${etiquetaGroups.size + 1}">${userStat.email}</td>` : 
          '';
        
        usersWithMatchesDetailHTML += `
          <tr>
            ${emailCell}
            <td style="border: 1px solid #ddd; padding: 8px;">${etiqueta}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${groupData.docs.length}</td>
            <td style="border: 1px solid #ddd; padding: 8px; font-size: 12px; line-height: 1.6;">${docsHTML}</td>
          </tr>
        `;
        
        isFirstRow = false;
      }
      
      // Add subtotal row for this user
      usersWithMatchesDetailHTML += `
        <tr style="background-color: #f9f9f9; font-weight: bold;">
          <td style="border: 1px solid #ddd; padding: 8px; font-style: italic;">Subtotal ${userStat.email}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${userTotalEtiquetas}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${userTotalDocs}</td>
          <td style="border: 1px solid #ddd; padding: 8px;"></td>
        </tr>
      `;
    }
    
    // Calculate totals for detailed table
    let grandTotalEtiquetas = 0;
    let grandTotalDocs = 0;
    
    for (const userStat of userStats.withMatches) {
      const etiquetaGroups = new Map();
      for (const docInfo of userStat.detailedMatches) {
        for (const etiqueta of docInfo.matchedEtiquetas) {
          if (!etiquetaGroups.has(etiqueta)) {
            etiquetaGroups.set(etiqueta, { docs: [] });
          }
          etiquetaGroups.get(etiqueta).docs.push(docInfo);
        }
      }
      grandTotalEtiquetas += etiquetaGroups.size;
      for (const [, groupData] of etiquetaGroups.entries()) {
        grandTotalDocs += groupData.docs.length;
      }
    }
    
    usersWithMatchesDetailHTML += `
      <tr style="background-color: #f2f2f2; font-weight: bold;">
        <td style="border: 1px solid #ddd; padding: 8px;">TOTAL</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${grandTotalEtiquetas}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${grandTotalDocs}</td>
        <td style="border: 1px solid #ddd; padding: 8px;"></td>
      </tr>
    `;
    
    const reportHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte Diario Newsletter</title>
      </head>
      <body style="font-family: Arial, sans-serif; margin: 20px;">
        <h1>Reporte Diario Newsletter - ${currentDateString}</h1>
        
        <h2>1. Documentos procesados hoy</h2>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 8px;">Boletín</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Documentos</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Páginas</th>
            </tr>
          </thead>
          <tbody>
            ${collectionsTableHTML}
          </tbody>
        </table>
        <p><strong>Resumen:</strong> ${totalBoletines} boletines, ${totalDocs} documentos, ${totalPages} páginas</p>
        
        <h2>2. Resumen usuarios</h2>
        
        <h3>2.1. Usuarios con match</h3>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 8px;">Email</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Número de Etiquetas</th>
            </tr>
          </thead>
          <tbody>
            ${usersWithMatchesSummaryHTML}
          </tbody>
        </table>
        <p><strong>Total:</strong> ${totalEmailsWithMatches} emails, ${totalEtiquetasWithMatches} etiquetas personalizadas con match</p>
        
        <h3>2.2. Usuarios sin match</h3>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 8px;">Email</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Número de Etiquetas</th>
            </tr>
          </thead>
          <tbody>
            ${usersWithoutMatchesHTML}
          </tbody>
        </table>
        <p><strong>Total:</strong> ${totalEmailsWithoutMatches} usuarios, ${totalEtiquetasWithoutMatches} etiquetas</p>
        
        <h2>3. Detalle usuarios con match agentes</h2>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 8px;">Email</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Etiqueta Personalizada</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Docs con Match</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Docs</th>
            </tr>
          </thead>
          <tbody>
            ${usersWithMatchesDetailHTML}
          </tbody>
        </table>
        
        <hr>
        <p style="font-size: 12px; color: #666;">
          Generado automáticamente el ${moment().format('YYYY-MM-DD HH:mm:ss')} UTC
        </p>
      </body>
      </html>
    `;
    
    const reportMailOptions = {
      from: 'Reversa <info@reversa.ai>',
      to: 'info@reversa.ai',
      subject: `Reporte Diario Newsletter - ${currentDateString}`,
      html: reportHTML
    };
    
    await transporter.sendMail(reportMailOptions);
    console.log('Daily report email sent to info@reversa.ai');
    
  } catch (err) {
    console.error('Error sending report email:', err);
  }
}

// MAIN EXECUTION

(async () => {
  let client;
  try {
    client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(DB_NAME);
    
    // Check if webscraping ran today
    console.log(`Checking if webscraping ran today (${currentDateString})...`);
    const webscrapingRanToday = await checkWebscrapingRanToday(db);
    
    if (!webscrapingRanToday) {
      console.log('Webscraping did not run today. Sending warning email and exiting.');
      await sendWarningEmail();
      await client.close();
      return;
    }
    
    console.log('Webscraping ran today. Checking if any documents were processed...');
    
    // Check if any collections have documents with doc_count > 0
    const hasDocuments = await checkCollectionsHaveDocuments(db);
    
    if (!hasDocuments) {
      console.log('No documents were processed today. Sending warning email and exiting.');
      await sendNoDocumentsWarningEmail();
      await client.close();
      return;
    }
    
    console.log('Documents were processed today. Proceeding with newsletter sending...');
    
    // Get available collections for today
    const availableCollections = await getAvailableCollectionsToday(db);
    console.log('Available collections today:', availableCollections);
    
    // Check if first shipment already exists
    const firstShipmentInfo = await getFirstShipmentInfo(db);
    console.log('First shipment info:', firstShipmentInfo);
    
    let collectionsToProcess = availableCollections;
    let isExtraVersion = false;
    
    if (firstShipmentInfo.exists) {
      const newCollections = getNewCollections(availableCollections, firstShipmentInfo.previousCollections);
      console.log('New collections since first shipment:', newCollections);
      
      if (newCollections.length === 0) {
        console.log('No new collections found. All collections were already processed in first shipment. Exiting.');
        await client.close();
        return;
      }
      
      // Only process new collections for extra version
      collectionsToProcess = newCollections;
      isExtraVersion = true;
      console.log('This will be an extra version covering delayed bulletins.');
    }
    
    console.log('Collections to process:', collectionsToProcess);
    
    const usersCollection = db.collection('users');

    // 1) Cargamos todos los usuarios
    const allUsers = await usersCollection.find({}).toArray();
    
    /**
     * Filters an array of users ensuring that only one user per unique email (in lower case) is included.
     * Users without a valid email are skipped.
     */
    function filterUniqueEmails(users) {
      const seen = new Set();
      return users.filter(user => {
        if (!user.email || typeof user.email !== 'string') {
          // Skip users without a valid email
          return false;
        }
        const emailLower = user.email.toLowerCase();
        
        // Exclude specific emails
        if (emailLower.endsWith('@cuatrecasas.com') || emailLower === 'pmolina@perezllorca.com') {
          return false;
        }
        
        if (seen.has(emailLower)) {
          return false;
        } else {
          seen.add(emailLower);
          return true;
        }
      });
    }

    const filteredUsers = filterUniqueEmails(allUsers); //allUsers.filter(u => u.email && u.email.toLowerCase() === 'tomas@reversa.ai');

    // Initialize user statistics for report
    const userStats = {
      withMatches: [],
      withoutMatches: []
    };

    for (const user of filteredUsers) {
      // 2) Obtenemos coverage_legal => array de colecciones (BOE, BOA, BOJA, CNMV, etc.)
      const coverageObj = user.cobertura_legal || {}; // ejemplo => {"Nacional y Europeo":["BOE"],"Autonomico":["BOA","BOJA"],"Reguladores":["CNMV"]}
      let coverageCollections = [];
      Object.values(coverageObj).forEach(arr => {
        if (Array.isArray(arr)) {
          coverageCollections.push(...arr.map(col => col.toUpperCase()));
        }
      });
      if (coverageCollections.length === 0) {
        coverageCollections = ["BOE"]; // fallback
      }
      const userMatchingDocs = [];

      // Get today's documents from each collection the user has subscribed to
      // Filter to only process collections that should be included (new collections for extra version)
      const userCollectionsToProcess = coverageCollections.filter(collection => 
        collectionsToProcess.includes(collection)
      );
      
      if (userCollectionsToProcess.length === 0) {
        console.log(`User ${user.email} has no subscriptions to new collections. Skipping.`);
        continue;
      }
      
      for (const collectionName of userCollectionsToProcess) {
        try {
          const coll = db.collection(collectionName);
          const query = {
            anio: anioToday,
            mes: mesToday,
            dia: diaToday
          };
          
          const docs = await coll.find(query).toArray();
          
          // Add each document with its collection name
          docs.forEach(doc => {
            userMatchingDocs.push({
              collectionName: collectionName,
              doc: doc
            });
          });
        } catch (err) {
          console.warn(`Error retrieving docs from ${collectionName}: ${err}`);
        }
      }

      // 3) Filtrar documentos según etiquetas personalizadas del usuario
      // Obtener etiquetas personalizadas del usuario - CORREGIDO: Ahora es un objeto, no un array
      const userEtiquetasPersonalizadas = user.etiquetas_personalizadas || {};
      
      // Obtener las claves (nombres de etiquetas) del objeto etiquetas_personalizadas
      const userEtiquetasKeys = Object.keys(userEtiquetasPersonalizadas);
      
      // Obtener rangos del usuario (mantener este filtro)
      const userRangos = user.rangos || [];
      
      // Filtrar documentos que coincidan con etiquetas personalizadas
      const filteredMatchingDocs = [];
      
      // Track matches for statistics
      const userMatchStats = new Map(); // etiqueta -> { collections: Set, totalMatches: number }
      
      for (const docObj of userMatchingDocs) {
        const doc = docObj.doc;
        const collectionName = docObj.collectionName;
        
        // FILTER 1: Check if the document's rango matches any of the user's rangos
        const docRango = doc.rango_titulo || "Otras";
        const rangoMatches = userRangos.includes(docRango);
        
        if (!rangoMatches) continue;
        
        // FILTER 2: Check for etiquetas personalizadas match
        let hasEtiquetasMatch = false;
        let matchedEtiquetas = [];
        let matchedEtiquetasDescriptions = [];
        
        // Verificar si el documento tiene etiquetas personalizadas y el usuario tiene un ID
        if (doc.etiquetas_personalizadas && user._id) {
          const userId = user._id.toString();
          
          // Verificar si hay etiquetas personalizadas para este usuario en el documento
          if (doc.etiquetas_personalizadas[userId]) {
            // En la nueva estructura, doc.etiquetas_personalizadas[userId] es un objeto donde las claves son los nombres de las etiquetas
            const docEtiquetasObj = doc.etiquetas_personalizadas[userId] || {};
            
            // Verificar coincidencias entre las etiquetas del documento para este usuario y las etiquetas del usuario
            for (const etiquetaKey of userEtiquetasKeys) {
              if (etiquetaKey in docEtiquetasObj) {
                hasEtiquetasMatch = true;
                matchedEtiquetas.push(etiquetaKey);
                matchedEtiquetasDescriptions.push(docEtiquetasObj[etiquetaKey] || '');
                
                // Track for statistics
                if (!userMatchStats.has(etiquetaKey)) {
                  userMatchStats.set(etiquetaKey, { collections: new Set(), totalMatches: 0 });
                }
                userMatchStats.get(etiquetaKey).collections.add(collectionName);
                userMatchStats.get(etiquetaKey).totalMatches++;
              }
            }
          }
        }
        
        // Solo incluir documentos que coincidan con etiquetas personalizadas
        if (hasEtiquetasMatch) {
          // Crear versión mejorada del documento con valores coincidentes
          filteredMatchingDocs.push({
            collectionName: collectionName,
            doc: {
              ...doc,
              matched_etiquetas_personalizadas: matchedEtiquetas,
              matched_etiquetas_descriptions: matchedEtiquetasDescriptions
            }
          });
        }
      }
      
      // Reemplazar la colección original con la filtrada
      const userMatchingDocsFiltered = filteredMatchingDocs;
      
      // 4) Build rango & collection grouping
      const rangoGroups = {};

      userMatchingDocsFiltered.forEach(({ collectionName, doc }) => {
        // Get rango_titulo or assign a default
        const rango = doc.rango_titulo || "Otras";
        
        // Initialize the rango group if needed
        if (!rangoGroups[rango]) {
          rangoGroups[rango] = {};
        }
        
        // Initialize the collection subgroup if needed
        if (!rangoGroups[rango][collectionName]) {
          rangoGroups[rango][collectionName] = [];
        }
        
        // Add document to its group
        rangoGroups[rango][collectionName].push({
          ...doc,
          collectionName
        });
      });

      // Convert to array structure for template processing
      const finalGroups = [];
      for (const [rango, collections] of Object.entries(rangoGroups)) {
        const rangoGroup = {
          rangoTitle: rango,
          collections: []
        };
        
        for (const [collName, docs] of Object.entries(collections)) {
          rangoGroup.collections.push({
            collectionName: collName,
            displayName: mapCollectionNameToDisplay(collName),
            docs: docs
          });
        }
        
        // Sort collections by predefined order
        rangoGroup.collections.sort((a, b) => {
          const order = ["BOE", "DOUE", "DOG", "BOA", "BOCM", "BOCYL", "BOJA", "BOPV", "CNMV"];
          return order.indexOf(a.collectionName.toUpperCase()) - order.indexOf(b.collectionName.toUpperCase());
        });
        
        finalGroups.push(rangoGroup);
      }

      // Sort rango groups by predefined order
      finalGroups.sort((a, b) => {
        const order = [
          "Legislación", 
          "Normativa Reglamentaria", 
          "Doctrina Administrativa",
          "Comunicados, Guías y Directivas de Reguladores",
          "Decisiones Judiciales",
          "Normativa Europea",
          "Acuerdos Internacionales",
          "Anuncios de Concentración de Empresas",
          "Dictámenes y Opiniones",
          "Subvenciones",
          "Declaraciones e Informes de Impacto Ambiental",
          "Otras"
        ];
        return order.indexOf(a.rangoTitle) - order.indexOf(b.rangoTitle);
      });

      // 5) Build HTML

          // if it's our special email and there are NO alerts today, skip entirely
        const isEaz = user.email.toLowerCase() === 'eaz@ayuelajimenez.es';
        if (isEaz && finalGroups.length === 0) {
          console.log(`Skipping email for ${user.email} – no matches today.`);
          continue;  // jump to next user, no template, no sendMail
        }

      let htmlBody = '';
      let hasMatches = finalGroups.length > 0;
      
      if (!hasMatches) {
        // No matches => get BOE documents with seccion = "Disposiciones generales"
        const queryBoeGeneral = { 
          anio: anioToday, 
          mes: mesToday, 
          dia: diaToday,
          seccion: "Disposiciones generales"
        };
        
        try {
          const boeColl = db.collection("BOE");
          const boeDocs = await boeColl.find(queryBoeGeneral).toArray();
          
          // Add collectionName to each doc
          const boeDocsWithCollection = boeDocs.map(doc => ({
            ...doc,
            collectionName: "BOE"
          }));
          
          htmlBody = buildNewsletterHTMLNoMatches(
            user.name || '',
            user._id.toString(),
            moment().format('YYYY-MM-DD'),
            boeDocsWithCollection
          );
        } catch (err) {
          console.warn(`Error retrieving BOE general docs: ${err}`);
          // If all else fails, show empty
          htmlBody = buildNewsletterHTMLNoMatches(
            user.name || '',
            user._id.toString(),
            moment().format('YYYY-MM-DD'),
            []
          );
        }
        
        // Add to statistics - users without matches
        userStats.withoutMatches.push({
          email: user.email,
          etiquetasCount: userEtiquetasKeys.length
        });
      } else {
        htmlBody = buildNewsletterHTML(
          user.name || '',
          user._id.toString(),
          moment().format('YYYY-MM-DD'),
          finalGroups,
          isExtraVersion
        );
        
        // Add to statistics - users with matches
        const matchDetails = [];
        for (const [etiqueta, stats] of userMatchStats.entries()) {
          for (const collection of stats.collections) {
            const matchCount = Array.from(userMatchStats.entries())
              .filter(([e, s]) => e === etiqueta && s.collections.has(collection))
              .reduce((sum, [, s]) => sum + s.totalMatches, 0);
            matchDetails.push(`${etiqueta}-${collection}-${matchCount}`);
          }
        }
        
        userStats.withMatches.push({
          email: user.email,
          totalDocs: userMatchingDocsFiltered.length,
          uniqueEtiquetas: userMatchStats.size,
          matchDetails: matchDetails.join(' ; '),
          detailedMatches: userMatchingDocsFiltered.map(docObj => ({
            collectionName: docObj.collectionName,
            shortName: docObj.doc.short_name,
            urlPdf: docObj.doc.url_pdf,
            matchedEtiquetas: docObj.doc.matched_etiquetas_personalizadas || []
          }))
        });
      }

      // 6) Send email
      const emailSize = Buffer.byteLength(htmlBody, 'utf8');
      console.log(`Email size for ${user.email}: ${emailSize} bytes (~${(emailSize/1024).toFixed(2)} KB)`);

      const mailOptions = {
        from: 'Reversa <info@reversa.ai>',
        to: user.email,
        subject: `Reversa Alertas Normativas${isExtraVersion ? ' - Extra' : ''} — ${moment().format('YYYY-MM-DD')}`,
        html: htmlBody,
        attachments: [
          {
            filename: 'Intro_to_reversa.jpg',
            path: path.join(__dirname, 'assets', 'Intro_to_reversa.jpg'),
            cid: 'reversaLogo'
          }
        ]
      };
      try {
        await transporter.sendMail(mailOptions);
      
        console.log(`Email sent to ${user.email}.`);
        //console.log(htmlBody);
      } catch(err) {
        console.error(`Error sending email to ${user.email}:`, err);
      }
    }

    console.log('All emails processed. Sending daily report...');
    
    // Send daily report email
    await sendReportEmail(db, userStats);

    console.log('Logging first shipment information...');
    
    // Log the first shipment information
    if (isExtraVersion) {
      // For extra versions, update the existing first_shipment to include new collections
      try {
        const logsCollection = db.collection('logs');
        const currentTimestamp = moment().toDate();
        
        // Get current first_shipment info
        const currentLog = await logsCollection.findOne({ "date_range.start": currentDateString });
        const existingCollections = currentLog?.first_shipment?.collections || [];
        
        // Merge existing collections with new ones
        const updatedCollections = [...new Set([...existingCollections, ...collectionsToProcess])];
        
        await logsCollection.updateOne(
          { "date_range.start": currentDateString },
          {
            $set: {
              "first_shipment.collections": updatedCollections,
              "first_shipment.last_update": currentTimestamp
            }
          }
        );
        
        console.log('Extra shipment logged successfully:', {
          date: currentDateString,
          newCollections: collectionsToProcess,
          allCollections: updatedCollections,
          timestamp: currentTimestamp
        });
      } catch (err) {
        console.error('Error logging extra shipment:', err);
      }
    } else {
      // For first shipment, use the original logic
      await logFirstShipment(db, availableCollections);
    }

    console.log('All done. Closing DB.');
    await client.close();

  } catch (err) {
    console.error('Error =>', err);
  }

})();
