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
const momentTimezone = require('moment-timezone');
const path = require('path');

require('dotenv').config();


// 1) Configuration
const MONGODB_URI = process.env.DB_URI;
const DB_NAME = 'papyrus';

// Control whether to send emails to users without matches
const SEND_EMAILS_TO_USERS_WITHOUT_MATCHES = false;

// Take today's date in real time
//const TODAY = moment().utc().subtract(3, 'days'); //moment().utc();
const TODAY = moment().utc();
//const TOMORROW = TODAY.clone().add(1, 'day');
const YESTERDAY = moment().utc().subtract(1, 'days');

const anioToday = TODAY.year();
const mesToday  = TODAY.month() + 1;
const diaToday  = TODAY.date();

// Format current date as YYYY-MM-DD for logs
const currentDateString = TODAY.format('YYYY-MM-DD'); //TODAY

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
 * Check if webscraping ran today by looking for a log entry with datetime_run
 */
async function checkWebscrapingRanToday(db) {
  try {
    const logsCollection = db.collection('logs');
    
    // Create date range for the specified day
    const targetDate = moment(currentDateString, 'YYYY-MM-DD');
    const startOfDay = targetDate.clone().startOf('day').toDate();
    const endOfDay = targetDate.clone().endOf('day').toDate();
    
    console.log(`Checking for webscraping logs between ${startOfDay} and ${endOfDay} with environment = production`);
    
    // Check if there are any logs with datetime_run for today with production environment
    const logEntry = await logsCollection.findOne({
      datetime_run: { 
        $exists: true,
        $gte: startOfDay,
        $lte: endOfDay
      },
      "run_info.environment": "production"
    });
    
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
    // Exclude specific collections and any collection ending with "_test"
    if (!excludedCollections.includes(collectionName) && !collectionName.endsWith('_test')) {
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
 * Now uses datetime_run to find the most recent log entry
 */
async function logFirstShipment(db, availableCollections) {
  try {
    const logsCollection = db.collection('logs');
    const currentTimestamp = moment().toDate();
    
    // Create date range for the specified day
    const targetDate = moment(currentDateString, 'YYYY-MM-DD');
    const startOfDay = targetDate.clone().startOf('day').toDate();
    const endOfDay = targetDate.clone().endOf('day').toDate();
    
    // Find the most recent log entry by datetime_run for the specified date with production environment
    const recentLogEntry = await logsCollection.findOne(
      { 
        datetime_run: { 
          $exists: true,
          $gte: startOfDay,
          $lte: endOfDay
        },
        "run_info.environment": "production"
      },
      { sort: { datetime_run: -1 } }
    );
    
    if (recentLogEntry) {
      // Update the most recent log entry
      const updateResult = await logsCollection.updateOne(
        { _id: recentLogEntry._id },
        {
          $set: {
            first_shipment: {
              time_stamp: currentTimestamp,
              collections: availableCollections
            }
          }
        }
      );
      
      console.log('First shipment logged successfully:', {
        date: currentDateString,
        timestamp: currentTimestamp,
        collections: availableCollections,
        logId: recentLogEntry._id
      });
    } else {
      console.warn('No recent log entry found to update with first shipment info');
    }
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
 * buildDocumentHTMLWithCollectionRango:
 * Genera un snippet HTML para un único doc mostrando colección y rango.
 */
function buildDocumentHTMLWithCollectionRango(doc, isLastDoc) {
  // Mostrar colección y rango en lugar de etiquetas
  const collectionRangoHTML = `<p style="color: #666; font-size: 0.9em; margin-bottom: 10px;">${doc.collectionDisplayName} | ${doc.rangoTitle}</p>`;

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
          const fullDescription = doc.matched_etiquetas_descriptions[index] || '';
          
          // Extraer nivel de impacto del texto si está presente
          let descripcion = fullDescription;
          let nivelImpacto = '';
          let nivelTag = '';
          
          const nivelMatch = fullDescription.match(/\(Nivel:\s*([^)]+)\)$/);
          if (nivelMatch) {
            nivelImpacto = nivelMatch[1].trim();
            descripcion = fullDescription.replace(/\s*\(Nivel:[^)]+\)$/, '');
            
            // Generar tag de nivel de impacto con colores para email
            let bgColor = '#f8f9fa';
            let textColor = '#6c757d';
            
            switch (nivelImpacto.toLowerCase()) {
              case 'alto':
                bgColor = '#ffe6e6';
                textColor = '#dc3545';
                break;
              case 'medio':
                bgColor = '#fff3cd';
                textColor = '#856404';
                break;
              case 'bajo':
                bgColor = '#d4edda';
                textColor = '#155724';
                break;
            }
            
            nivelTag = `<span style="background-color: ${bgColor}; color: ${textColor}; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; font-weight: 500; margin-left: 8px; display: inline-block;">${nivelImpacto}</span>`;
          }
          
          return `<p style="margin: 8px 0; font-size: 0.9em; line-height: 1.4;">
            <strong>${etiqueta}</strong>${nivelTag}
            <br>
            <span style="color: #555;">${descripcion}</span>
          </p>`;
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
      ${collectionRangoHTML}
      <p style="color: black;">${doc.resumen}</p>
      ${impactoAgentesHTML}
      <p>
        <div class="margin-impacto">
          <a class="button-impacto"
            href="https://app.reversa.ai/norma.html?documentId=${doc._id}&collectionName=${doc.collectionName}"
            style="margin-right: 10px;">
            Analizar documento
          </a>
        </div>
        ${doc.url_pdf ? 
          `<a href="${doc.url_pdf}" target="_blank" style="color:#4ce3a7;">Leer más: ${doc._id}</a>` :
          doc.url_html ? 
          `<a href="${doc.url_html}" target="_blank" style="color:#4ce3a7;">Leer más: ${doc._id}</a>` :
          `<span style="color:#999;">Link no Identificado</span>`
        }
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
          const fullDescription = doc.matched_etiquetas_descriptions[index] || '';
          
          // Extraer nivel de impacto del texto si está presente
          let descripcion = fullDescription;
          let nivelImpacto = '';
          let nivelTag = '';
          
          const nivelMatch = fullDescription.match(/\(Nivel:\s*([^)]+)\)$/);
          if (nivelMatch) {
            nivelImpacto = nivelMatch[1].trim();
            descripcion = fullDescription.replace(/\s*\(Nivel:[^)]+\)$/, '');
            
            // Generar tag de nivel de impacto con colores para email
            let bgColor = '#f8f9fa';
            let textColor = '#6c757d';
            
            switch (nivelImpacto.toLowerCase()) {
              case 'alto':
                bgColor = '#ffe6e6';
                textColor = '#dc3545';
                break;
              case 'medio':
                bgColor = '#fff3cd';
                textColor = '#856404';
                break;
              case 'bajo':
                bgColor = '#d4edda';
                textColor = '#155724';
                break;
            }
            
            nivelTag = `<span style="background-color: ${bgColor}; color: ${textColor}; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; font-weight: 500; margin-left: 8px; display: inline-block;">${nivelImpacto}</span>`;
          }
          
          return `<p style="margin: 8px 0; font-size: 0.9em; line-height: 1.4;">
            <strong>${etiqueta}</strong>${nivelTag}
            <br>
            <span style="color: #555;">${descripcion}</span>
          </p>`;
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
            Analizar documento
          </a>
        </div>
        ${doc.url_pdf ? 
          `<a href="${doc.url_pdf}" target="_blank" style="color:#4ce3a7;">Leer más: ${doc._id}</a>` :
          doc.url_html ? 
          `<a href="${doc.url_html}" target="_blank" style="color:#4ce3a7;">Leer más: ${doc._id}</a>` :
          `<span style="color:#999;">Link no Identificado</span>`
        }
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
          Analizar documento
        </a>
      </div>
      ${doc.url_pdf ? 
        `<a href="${doc.url_pdf}" target="_blank" style="color:#4ce3a7;">Leer más: ${doc._id}</a>` :
        doc.url_html ? 
        `<a href="${doc.url_html}" target="_blank" style="color:#4ce3a7;">Leer más: ${doc._id}</a>` :
        `<span style="color:#999;">Link no Identificado</span>`
      }
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
function buildNewsletterHTML(userName, userId, dateString, etiquetaGroups, isExtraVersion = false) {
  // Create summary section by etiquetas personalizadas
  console.log("Normal html is triggered");
  
  // Sort etiquetaGroups by total number of documents (descending)
  const sortedEtiquetaGroups = [...etiquetaGroups].sort((a, b) => {
    const totalDocsA = a.collections.reduce((sum, coll) => 
      sum + coll.rangos.reduce((rangoSum, rango) => rangoSum + rango.docs.length, 0), 0);
    const totalDocsB = b.collections.reduce((sum, coll) => 
      sum + coll.rangos.reduce((rangoSum, rango) => rangoSum + rango.docs.length, 0), 0);
    return totalDocsB - totalDocsA;
  });
  
  // Calculate total documents across all etiquetas
  const grandTotal = sortedEtiquetaGroups.reduce((total, etiqueta) => {
    const etiquetaTotal = etiqueta.collections.reduce((sum, coll) => 
      sum + coll.rangos.reduce((rangoSum, rango) => rangoSum + rango.docs.length, 0), 0);
    return total + etiquetaTotal;
  }, 0);
  
  const etiquetaSummaryHTML = sortedEtiquetaGroups.map(etiqueta => {
    const totalDocs = etiqueta.collections.reduce((sum, coll) => 
      sum + coll.rangos.reduce((rangoSum, rango) => rangoSum + rango.docs.length, 0), 0);
    return `<li>${totalDocs} Alertas de <span style="color:#4ce3a7;">${etiqueta.etiquetaTitle}</span></li>`;
  }).join('');

  let summarySection = '';
  if (etiquetaGroups.length > 0) {
    summarySection = `
      <h4 style="font-size:16px; margin-bottom:15px; color:#0c2532">
        RESUMEN POR AGENTE
      </h4>
      <p style="font-weight:bold; margin-bottom:10px; color:#0c2532;">Total: ${grandTotal} alertas</p>
      <ul style="margin-bottom:15px;">
        ${etiquetaSummaryHTML}
      </ul>
    `;
  }

  // Build detail blocks by etiqueta (no grouping by collection or rango)
  const detailBlocks = sortedEtiquetaGroups.map((etiqueta, etiquetaIndex) => {
    // Etiqueta header
    const etiquetaHeading = `
      <div style="background-color:#4ce3a7; margin:5% 0; padding:5px 20px; border-radius:20px;">
        <h2 style="margin:0; color:#fefefe; font-size:14px;">
          ${etiquetaIndex + 1}. ${etiqueta.etiquetaTitle.toUpperCase()}
        </h2>
      </div>
    `;

    // Collect all documents from all collections and rangos
    const allDocs = [];
    etiqueta.collections.forEach(collObj => {
      collObj.rangos.forEach(rangoObj => {
        rangoObj.docs.forEach(doc => {
          // Find the impact level for this specific etiqueta
          let impactLevel = null; // no default, will be set to 'bajo' if not found
          if (doc.matched_etiquetas_personalizadas && doc.matched_etiquetas_descriptions) {
            const etiquetaIndex = doc.matched_etiquetas_personalizadas.indexOf(etiqueta.etiquetaTitle);
            if (etiquetaIndex !== -1 && doc.matched_etiquetas_descriptions[etiquetaIndex]) {
              const description = doc.matched_etiquetas_descriptions[etiquetaIndex];
              const nivelMatch = description.match(/\(Nivel:\s*([^)]+)\)$/i);
              if (nivelMatch) {
                impactLevel = nivelMatch[1].trim().toLowerCase();
              }
            }
          }
          
          // Set default if no impact level found
          if (!impactLevel || !['alto', 'medio', 'bajo'].includes(impactLevel)) {
            impactLevel = 'bajo';
          }
          
          allDocs.push({
            ...doc,
            collectionName: collObj.collectionName,
            collectionDisplayName: collObj.displayName,
            rangoTitle: rangoObj.rangoTitle,
            impactLevel: impactLevel
          });
        });
      });
    });

    // Sort documents by impact level (alto -> medio -> bajo) and then by collection name
    allDocs.sort((a, b) => {
      const impactOrder = { 'alto': 3, 'medio': 2, 'bajo': 1 };
      
      // Primary sort: by impact level (descending)
      const impactDiff = (impactOrder[b.impactLevel] || 1) - (impactOrder[a.impactLevel] || 1);
      if (impactDiff !== 0) {
        return impactDiff;
      }
      
      // Secondary sort: by collection name (ascending)
      return a.collectionName.localeCompare(b.collectionName);
    });

    // Build documents HTML without grouping
    const docsHTML = allDocs.map((doc, idx) => {
      const isLastDoc = (idx === allDocs.length - 1);
      return buildDocumentHTMLWithCollectionRango(doc, isLastDoc);
    }).join('');

    const etiquetaSeparator = `
      <hr style="
        border: none;
        border-top: 1px solid #0c2532;
        width: 100%;
        margin: 10px auto;
      ">
    `;

    return `
      ${etiquetaSeparator}
      ${etiquetaHeading}
      ${docsHTML}
    `;
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
 * FIXED: Busca CUALQUIER log del día que tenga first_shipment, no necesariamente el más reciente
 * Esto evita que envíos duplicados ocurran cuando hay múltiples runs de webscraping en el día
 */
async function getFirstShipmentInfo(db) {
  try {
    const logsCollection = db.collection('logs');
    
    // Create date range for the specified day
    const targetDate = moment(currentDateString, 'YYYY-MM-DD');
    const startOfDay = targetDate.clone().startOf('day').toDate();
    const endOfDay = targetDate.clone().endOf('day').toDate();
    
    console.log(`Checking for ANY log with first_shipment between ${startOfDay} and ${endOfDay} with environment = production`);
    
    // CAMBIO CLAVE: Busca CUALQUIER log que YA tenga first_shipment, no el más reciente del webscraping
    // Esto evita que si hay un nuevo run de webscraping después del primer envío, 
    // el segundo envío piense que es la primera vez
    const logEntry = await logsCollection.findOne(
      { 
        datetime_run: { 
          $exists: true,
          $gte: startOfDay,
          $lte: endOfDay
        },
        "run_info.environment": "production",
        "first_shipment": { $exists: true }  // ← BUSCAR SOLO LOGS QUE YA TENGAN first_shipment
      },
      { sort: { "first_shipment.time_stamp": -1 } }  // ← Ordenar por timestamp del envío, no del run
    );
    
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
 * Check if any collections have documents uploaded (docs_uploaded > 0) using ETL detailed stats
 * UPDATED: Always examines ALL logs from the day to avoid missing documents from earlier runs
 */
async function checkCollectionsHaveDocuments(db) {
  try {
    const logsCollection = db.collection('logs');
    
    // Create date range for the specified day
    const targetDate = moment(currentDateString, 'YYYY-MM-DD');
    const startOfDay = targetDate.clone().startOf('day').toDate();
    const endOfDay = targetDate.clone().endOf('day').toDate();
    
    console.log(`Checking for documents uploaded between ${startOfDay} and ${endOfDay} with environment = production`);
    
    // CHANGE: Always get ALL production logs from the day, regardless of execution time
    // This prevents missing documents when there are multiple webscraping runs in the same day
    const allDayLogs = await logsCollection.find(
      { 
        datetime_run: { 
          $exists: true,
          $gte: startOfDay,
          $lte: endOfDay
        },
        "run_info.environment": "production"
      },
      { sort: { datetime_run: -1 } }
    ).toArray();
    
    const allLogEntries = allDayLogs.filter(log => log.etl_detailed_stats);
    
    if (allLogEntries.length === 0) {
      console.warn(`No log entries with etl_detailed_stats found for date ${currentDateString} with environment=production`);
      return false;
    }
    
    console.log(`Found ${allLogEntries.length} total runs with ETL stats. Checking all runs for docs_uploaded > 0...`);
    
    // Check across ALL log entries for any collection with docs_uploaded > 0
    for (const logEntry of allLogEntries) {
      const runTime = moment(logEntry.datetime_run).format('HH:mm:ss');
      
      for (const [collectionName, stats] of Object.entries(logEntry.etl_detailed_stats)) {
        if (stats.docs_uploaded && stats.docs_uploaded > 0) {
          console.log(`Found collection ${collectionName} with ${stats.docs_uploaded} docs uploaded in run at ${runTime}`);
          return true;
        }
      }
    }
    
    console.log('No collections found with docs_uploaded > 0 across all runs of the day');
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
 * Identify hot accounts based on email patterns
 */
function identifyHotAccounts(userStats) {
  const hotAccountsConfig = [
    { pattern: 'antonio.madueno@cartesio.com', company: 'Cartesio', type: 'exact' },
    { pattern: 'ecix', company: 'ECIX', type: 'contains' },
    { pattern: 'burgalonso@gmail.com', company: 'Harmon', type: 'exact' },
    { pattern: 'axact', company: 'Axactor', type: 'contains' },
    { pattern: 'pareja', company: 'Pareja Advocats', type: 'contains' }
  ];
  
  const hotAccounts = [];
  const allUsers = [...userStats.withMatches, ...userStats.withoutMatches];
  
  for (const user of allUsers) {
    for (const config of hotAccountsConfig) {
      let isMatch = false;
      const email = user.email.toLowerCase();
      
      if (config.type === 'exact' && email === config.pattern) {
        isMatch = true;
      } else if (config.type === 'contains' && email.includes(config.pattern)) {
        isMatch = true;
      }
      
      if (isMatch) {
        hotAccounts.push({
          ...user,
          company: config.company,
          hasMatches: userStats.withMatches.includes(user)
        });
        break; // Only add once per user
      }
    }
  }
  
  return hotAccounts;
}

/**
 * Send comprehensive report email with statistics
 */
async function sendReportEmail(db, userStats) {
  try {
    // Identify hot accounts
    const hotAccounts = identifyHotAccounts(userStats);
    
    // 1. Build Hot Accounts Summary
    let hotAccountsSummaryHTML = '';
    for (const hotAccount of hotAccounts) {
      // Count total user etiquetas personalizadas
      const userEtiquetasPersonalizadas = hotAccount.etiquetas_personalizadas || {};
      const totalUserEtiquetas = Object.keys(userEtiquetasPersonalizadas).length;
      
      // Count etiquetas demo
      const userEtiquetasDemo = hotAccount.etiquetas_demo || {};
      const totalDemoEtiquetas = Object.keys(userEtiquetasDemo).length;
      
      if (hotAccount.hasMatches) {
        // Count unique etiquetas with matches for this user
        const etiquetaGroups = new Map();
        for (const docInfo of hotAccount.detailedMatches) {
          for (const etiqueta of docInfo.matchedEtiquetas) {
            etiquetaGroups.set(etiqueta, true);
          }
        }
        const userEtiquetasWithMatches = etiquetaGroups.size;
        
        // Count collections with matches
        const collectionsWithMatches = new Map();
        for (const docInfo of hotAccount.detailedMatches) {
          const collection = docInfo.collectionName;
          if (!collectionsWithMatches.has(collection)) {
            collectionsWithMatches.set(collection, 0);
          }
          collectionsWithMatches.set(collection, collectionsWithMatches.get(collection) + 1);
        }
        
        const collectionsText = Array.from(collectionsWithMatches.entries())
          .map(([collection, count]) => `${collection}(${count})`)
          .join(', ');
        
        hotAccountsSummaryHTML += `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${hotAccount.email} - ${hotAccount.company}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${userEtiquetasWithMatches}/${totalUserEtiquetas}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${totalDemoEtiquetas}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${collectionsText}</td>
          </tr>
        `;
      } else {
        hotAccountsSummaryHTML += `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${hotAccount.email} - ${hotAccount.company}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">0/${totalUserEtiquetas}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${totalDemoEtiquetas}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Sin matches</td>
          </tr>
        `;
      }
    }
    
    // 2. Build Hot Accounts Detail Table
    let hotAccountsDetailHTML = '';
    
    // Get all collections from hot accounts with matches
    const allCollections = new Set();
    for (const hotAccount of hotAccounts) {
      if (hotAccount.hasMatches) {
        for (const docInfo of hotAccount.detailedMatches) {
          allCollections.add(docInfo.collectionName);
        }
      }
    }
    const collectionsArray = Array.from(allCollections).sort();
    
    // Build table header
    let headerHTML = `
      <tr style="background-color: #f2f2f2;">
        <th style="border: 1px solid #ddd; padding: 8px;">Fecha</th>
        <th style="border: 1px solid #ddd; padding: 8px;">Usuario - Empresa</th>
        <th style="border: 1px solid #ddd; padding: 8px;">Agente</th>
    `;
    for (const collection of collectionsArray) {
      headerHTML += `<th style="border: 1px solid #ddd; padding: 8px;">${collection}</th>`;
    }
    headerHTML += `</tr>`;
    
    // Build table rows
    let totalMatches = 0;
    for (const hotAccount of hotAccounts) {
      if (!hotAccount.hasMatches) continue;
      
      // Group matches by etiqueta
      const etiquetaGroups = new Map();
      for (const docInfo of hotAccount.detailedMatches) {
        for (const etiqueta of docInfo.matchedEtiquetas) {
          if (!etiquetaGroups.has(etiqueta)) {
            etiquetaGroups.set(etiqueta, new Map());
          }
          const collection = docInfo.collectionName;
          if (!etiquetaGroups.get(etiqueta).has(collection)) {
            etiquetaGroups.get(etiqueta).set(collection, []);
          }
          etiquetaGroups.get(etiqueta).get(collection).push({
            id: docInfo.shortName,
            name: docInfo.shortName,
            url: docInfo.urlPdf
          });
        }
      }
      
      let isFirstEtiqueta = true;
      for (const [etiqueta, collectionsMap] of etiquetaGroups.entries()) {
        const userCell = isFirstEtiqueta ? 
          `<td style="border: 1px solid #ddd; padding: 8px; vertical-align: top;" rowspan="${etiquetaGroups.size}">${hotAccount.email} - ${hotAccount.company}</td>` : 
          '';
        
        hotAccountsDetailHTML += `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${currentDateString}</td>
            ${userCell}
            <td style="border: 1px solid #ddd; padding: 8px;">${etiqueta}</td>
        `;
        
        for (const collection of collectionsArray) {
          const docs = collectionsMap.get(collection) || [];
          let cellContent = '';
          
          if (docs.length > 0) {
            cellContent = docs.map(doc => 
              `• <a href="${doc.url}" target="_blank" style="color: #0066cc; text-decoration: none;">${doc.id}</a>`
            ).join('<br>');
            totalMatches += docs.length;
          }
          
          hotAccountsDetailHTML += `<td style="border: 1px solid #ddd; padding: 8px; font-size: 12px; line-height: 1.6;">${cellContent}</td>`;
        }
        
        hotAccountsDetailHTML += `</tr>`;
        isFirstEtiqueta = false;
      }
      
      // Add subtotal row for this user
      hotAccountsDetailHTML += `
        <tr style="background-color: #f9f9f9; font-weight: bold;">
          <td style="border: 1px solid #ddd; padding: 8px;" colspan="3">Subtotal ${hotAccount.email}</td>
      `;
      for (const collection of collectionsArray) {
        const userCollectionTotal = hotAccount.detailedMatches
          .filter(doc => doc.collectionName === collection).length;
        hotAccountsDetailHTML += `<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${userCollectionTotal || ''}</td>`;
      }
      hotAccountsDetailHTML += `</tr>`;
    }
    
    // Add total row
    hotAccountsDetailHTML += `
      <tr style="background-color: #f2f2f2; font-weight: bold;">
        <td style="border: 1px solid #ddd; padding: 8px;" colspan="3">TOTAL</td>
    `;
    for (const collection of collectionsArray) {
      const collectionTotal = hotAccounts
        .filter(acc => acc.hasMatches)
        .reduce((sum, acc) => sum + acc.detailedMatches.filter(doc => doc.collectionName === collection).length, 0);
      hotAccountsDetailHTML += `<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${collectionTotal || ''}</td>`;
    }
    hotAccountsDetailHTML += `</tr>`;
    
    // 3. Build regular users with matches summary table
    let usersWithMatchesSummaryHTML = '';
    let totalEmailsWithMatches = 0;
    let totalEtiquetasWithMatches = 0;
    let totalDemoEtiquetas = 0;
    
    for (const userStat of userStats.withMatches) {
      totalEmailsWithMatches++;
      
      // Count total user etiquetas personalizadas
      const userEtiquetasPersonalizadas = userStat.etiquetas_personalizadas || {};
      const totalUserEtiquetas = Object.keys(userEtiquetasPersonalizadas).length;
      
      // Count etiquetas demo
      const userEtiquetasDemo = userStat.etiquetas_demo || {};
      const userDemoCount = Object.keys(userEtiquetasDemo).length;
      totalDemoEtiquetas += userDemoCount;
      
      // Count unique etiquetas with matches for this user
      const etiquetaGroups = new Map();
      for (const docInfo of userStat.detailedMatches) {
        for (const etiqueta of docInfo.matchedEtiquetas) {
          etiquetaGroups.set(etiqueta, true);
        }
      }
      const userEtiquetasWithMatches = etiquetaGroups.size;
      totalEtiquetasWithMatches += userEtiquetasWithMatches;
      
      usersWithMatchesSummaryHTML += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">${userStat.email}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${userEtiquetasWithMatches}/${totalUserEtiquetas}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${userDemoCount}</td>
        </tr>
      `;
    }
    
    usersWithMatchesSummaryHTML += `
      <tr style="background-color: #f2f2f2; font-weight: bold;">
        <td style="border: 1px solid #ddd; padding: 8px;">TOTAL</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${totalEtiquetasWithMatches}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${totalDemoEtiquetas}</td>
      </tr>
    `;
    
    // 4. Build users without matches table
    let usersWithoutMatchesHTML = '';
    let totalEmailsWithoutMatches = 0;
    let totalEtiquetasWithoutMatches = 0;
    let totalDemoEtiquetasWithoutMatches = 0;
    
    for (const userStat of userStats.withoutMatches) {
      totalEmailsWithoutMatches++;
      
      // Count total user etiquetas personalizadas
      const userEtiquetasPersonalizadas = userStat.etiquetas_personalizadas || {};
      const totalUserEtiquetas = Object.keys(userEtiquetasPersonalizadas).length;
      totalEtiquetasWithoutMatches += totalUserEtiquetas;
      
      // Count etiquetas demo
      const userEtiquetasDemo = userStat.etiquetas_demo || {};
      const userDemoCount = Object.keys(userEtiquetasDemo).length;
      totalDemoEtiquetasWithoutMatches += userDemoCount;
      
      usersWithoutMatchesHTML += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">${userStat.email}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">0/${totalUserEtiquetas}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${userDemoCount}</td>
        </tr>
      `;
    }
    
    usersWithoutMatchesHTML += `
      <tr style="background-color: #f2f2f2; font-weight: bold;">
        <td style="border: 1px solid #ddd; padding: 8px;">TOTAL</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${totalEtiquetasWithoutMatches}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${totalDemoEtiquetasWithoutMatches}</td>
      </tr>
    `;
    
    // 5. Build detailed users with matches table (existing structure)
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
        
        <h2>1. Cuentas Calientes</h2>
        
        <h3>1.1. Resumen Cuentas Calientes</h3>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 8px;">Usuario - Empresa</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Etiquetas (match/total)</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Etiquetas demo</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Colecciones con Match</th>
            </tr>
          </thead>
          <tbody>
            ${hotAccountsSummaryHTML}
          </tbody>
        </table>
        
        <h3>1.2. Detalle Cuentas Calientes por Agente y Boletín</h3>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px; font-size: 12px;">
          <thead>
            ${headerHTML}
          </thead>
          <tbody>
            ${hotAccountsDetailHTML}
          </tbody>
        </table>
        
        <h2>2. Todos los Usuarios</h2>
        
        <h3>2.1. Usuarios con match</h3>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 8px;">Email</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Etiquetas (match/total)</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Etiquetas demo</th>
            </tr>
          </thead>
          <tbody>
            ${usersWithMatchesSummaryHTML}
          </tbody>
        </table>
        <p><strong>Total:</strong> ${totalEmailsWithMatches} emails, ${totalEtiquetasWithMatches} etiquetas personalizadas con match, ${totalDemoEtiquetas} etiquetas demo</p>
        
        <h3>2.2. Usuarios sin match</h3>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 8px;">Email</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Etiquetas (match/total)</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Etiquetas demo</th>
            </tr>
          </thead>
          <tbody>
            ${usersWithoutMatchesHTML}
          </tbody>
        </table>
        <p><strong>Total:</strong> ${totalEmailsWithoutMatches} usuarios, ${totalEtiquetasWithoutMatches} etiquetas, ${totalDemoEtiquetasWithoutMatches} etiquetas demo</p>
        
        <h3>2.3. Detalle usuarios con match agentes</h3>
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

/**
 * Send comprehensive report email with collection statistics from ETL process
 * ETL SYNC: Uses synchronized interval from last newsletter run
 */
async function sendCollectionsReportEmail(db, lastEtlLogId = null) {
  try {
    const logsCollection = db.collection('logs');
    
    let queryFilter = {
      "datetime_run": { $exists: true },
      "run_info.environment": "production"
    };
    
    // ETL SYNC: Si tenemos lastEtlLogId, buscar desde ese log hasta el más reciente
    if (lastEtlLogId) {
      try {
        // Encontrar el log de referencia
        const referenceLog = await logsCollection.findOne({ _id: lastEtlLogId });
        if (referenceLog) {
          // Buscar logs desde (exclusivo) el log de referencia hasta ahora
          queryFilter.datetime_run.$gt = referenceLog.datetime_run;
          console.log(`🔗 ETL SYNC: Searching logs since ${referenceLog.datetime_run} (exclusive) with environment = production`);
        } else {
          console.warn(`⚠️ ETL SYNC: Reference log ${lastEtlLogId} not found, falling back to daily range`);
          // Fallback a rango diario
          const targetDate = moment(currentDateString, 'YYYY-MM-DD');
          queryFilter.datetime_run.$gte = targetDate.clone().startOf('day').toDate();
          queryFilter.datetime_run.$lte = targetDate.clone().endOf('day').toDate();
        }
      } catch (err) {
        console.error(`Error fetching reference log ${lastEtlLogId}:`, err);
        // Fallback a rango diario
        const targetDate = moment(currentDateString, 'YYYY-MM-DD');
        queryFilter.datetime_run.$gte = targetDate.clone().startOf('day').toDate();
        queryFilter.datetime_run.$lte = targetDate.clone().endOf('day').toDate();
      }
    } else {
      // Sin sincronización: usar rango diario tradicional
      const targetDate = moment(currentDateString, 'YYYY-MM-DD');
      queryFilter.datetime_run.$gte = targetDate.clone().startOf('day').toDate();
      queryFilter.datetime_run.$lte = targetDate.clone().endOf('day').toDate();
      console.log(`📅 No ETL sync: Searching for logs between ${queryFilter.datetime_run.$gte} and ${queryFilter.datetime_run.$lte} with environment = production`);
    }
    
    // Buscar logs en el intervalo sincronizado
    const syncedLogEntries = await logsCollection.find(queryFilter, { sort: { datetime_run: -1 } }).toArray();
    
    // Tomar el más reciente para información de cabecera
    const recentLogEntry = syncedLogEntries.length > 0 ? syncedLogEntries[0] : null;
    
    if (!recentLogEntry || !recentLogEntry.etl_detailed_stats) {
      console.warn(`No log entry with etl_detailed_stats found for date ${currentDateString} with environment=production. Sending empty report...`);
      
      // Send a report indicating no data was found
      const noDataReportHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Reporte Colecciones ETL - Sin Datos</title>
        </head>
        <body style="font-family: Arial, sans-serif; margin: 20px; font-size: 12px;">
          <h1 style="font-size: 18px;">Reporte Colecciones ETL - ${currentDateString}</h1>
          
          <h2 style="font-size: 16px;">🚨 Sin Datos Disponibles</h2>
          <p style="font-size: 12px; color: #dc3545;">
            <strong>No se encontraron logs de ETL para la fecha ${currentDateString} con environment=production.</strong>
          </p>
          
          <h3 style="font-size: 14px;">Posibles causas:</h3>
          <ul style="font-size: 12px;">
            <li>El proceso ETL no se ejecutó</li>
            <li>El proceso ETL no completó exitosamente</li>
            <li>No se guardaron estadísticas detalladas</li>
            <li>El environment no está configurado como "production"</li>
          </ul>
          
          <hr>
          <p style="font-size: 10px; color: #666;">
            Generado automáticamente el ${moment().format('YYYY-MM-DD HH:mm:ss')} UTC
          </p>
        </body>
        </html>
      `;
      
      const noDataMailOptions = {
        from: 'Reversa <info@reversa.ai>',
        to: 'info@reversa.ai',
        subject: `Reporte Colecciones ETL - Sin Datos - ${currentDateString}`,
        html: noDataReportHTML
      };
      
      await transporter.sendMail(noDataMailOptions);
      console.log('Collections ETL report (no data) sent to info@reversa.ai');
      return;
    }
    
    console.log(`Found recent log entry for date ${currentDateString} with datetime_run: ${recentLogEntry.datetime_run} (environment: ${recentLogEntry.run_info?.environment})`);
    
    // ETL SYNC: Usar todos los logs del intervalo sincronizado
    const allLogEntries = syncedLogEntries.filter(log => log.etl_detailed_stats);
    let otherRunsIncluded = []; // Declarar fuera del scope
    
    if (allLogEntries.length === 0) {
      console.warn(`No logs with etl_detailed_stats found in synchronized interval`);
    } else {
      console.log(`📊 ETL SYNC: Found ${allLogEntries.length} logs in synchronized interval`);
      if (allLogEntries.length > 1) {
        otherRunsIncluded = allLogEntries.slice(1).map(log => 
          moment(log.datetime_run).format('HH:mm:ss')
        );
        console.log(`Other runs included: ${otherRunsIncluded.join(', ')}`);
      }
    }
    
    // Combine statistics from all log entries FIRST
    const combinedStats = {};
    
    // Process each log entry
    for (let logIndex = 0; logIndex < allLogEntries.length; logIndex++) {
      const logEntry = allLogEntries[logIndex];
      const runTime = moment(logEntry.datetime_run).format('HH:mm:ss');
      
      for (const [collectionName, stats] of Object.entries(logEntry.etl_detailed_stats)) {
        if (!combinedStats[collectionName]) {
          combinedStats[collectionName] = {
            docs_scraped: 0,
            docs_new: 0,
            docs_processed: 0,
            docs_uploaded: 0,
            etiquetas_found: 0,
            input_tokens: 0,
            output_tokens: 0,
            error_count: 0,
            errors: []
          };
        }
        
        // For docs_scraped, take the maximum value across all runs
        combinedStats[collectionName].docs_scraped = Math.max(
          combinedStats[collectionName].docs_scraped, 
          stats.docs_scraped || 0
        );
        
        // For all other metrics, sum them
        combinedStats[collectionName].docs_new += stats.docs_new || 0;
        combinedStats[collectionName].docs_processed += stats.docs_processed || 0;
        combinedStats[collectionName].docs_uploaded += stats.docs_uploaded || 0;
        combinedStats[collectionName].etiquetas_found += stats.etiquetas_found || 0;
        combinedStats[collectionName].input_tokens += stats.input_tokens || 0;
        combinedStats[collectionName].output_tokens += stats.output_tokens || 0;
        combinedStats[collectionName].error_count += stats.error_count || 0;
        
        // Collect errors from all runs
        if (stats.errors && Array.isArray(stats.errors)) {
          combinedStats[collectionName].errors.push(...stats.errors);
        }
      }
    }

    // Build collections statistics table
    let collectionsStatsTableHTML = '';
    let totalDocsScraped = 0;
    let totalDocsNew = 0;
    let totalDocsProcessed = 0;
    let totalDocsUploaded = 0;
    let totalEtiquetasFound = 0;
    let totalErrorCount = 0;
    let totalCostEUR = 0;
    let collectionsWithData = 0;
    
    // API pricing (USD per million tokens)
    const INPUT_TOKEN_COST_USD = 1.100; // USD per 1M tokens
    const OUTPUT_TOKEN_COST_USD = 4.400; // USD per 1M tokens
    const USD_TO_EUR_RATE = 0.92; // Approximate conversion rate
    
    // Process each collection in combined stats
    for (const [collectionName, stats] of Object.entries(combinedStats)) {
      const docsScraped = stats.docs_scraped || 0;
      const docsNew = stats.docs_new || 0;
      const docsProcessed = stats.docs_processed || 0;
      const docsUploaded = stats.docs_uploaded || 0;
      const etiquetasFound = stats.etiquetas_found || 0;
      const errorCount = stats.error_count || 0;
      
      // Calculate cost in EUR
      const inputTokens = stats.input_tokens || 0;
      const outputTokens = stats.output_tokens || 0;
      
      const inputCostUSD = (inputTokens / 1000000) * INPUT_TOKEN_COST_USD;
      const outputCostUSD = (outputTokens / 1000000) * OUTPUT_TOKEN_COST_USD;
      const totalCostUSD = inputCostUSD + outputCostUSD;
      const totalCostCollectionEUR = totalCostUSD * USD_TO_EUR_RATE;
      
      // Add to totals
      totalDocsScraped += docsScraped;
      totalDocsNew += docsNew;
      totalDocsProcessed += docsProcessed;
      totalDocsUploaded += docsUploaded;
      totalEtiquetasFound += etiquetasFound;
      totalErrorCount += errorCount;
      totalCostEUR += totalCostCollectionEUR;
      
      if (docsScraped > 0 || docsNew > 0 || docsProcessed > 0) {
        collectionsWithData++;
      }
      
      // Determine row color based on status
      let rowStyle = '';
      if (errorCount > 0) {
        rowStyle = 'background-color: #ffebee;'; // Light red for errors
      } else if (docsNew === 0 && docsScraped === 0) {
        rowStyle = 'background-color: #f5f5f5;'; // Light gray for no activity
      } else if (docsUploaded > 0) {
        rowStyle = 'background-color: #e8f5e8;'; // Light green for successful uploads
      }
      
      collectionsStatsTableHTML += `
        <tr style="${rowStyle}">
          <td style="border: 1px solid #ddd; padding: 6px; font-weight: bold; font-size: 11px;">${collectionName}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${docsScraped}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${docsNew}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${docsProcessed}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${docsUploaded}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${etiquetasFound}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">€${totalCostCollectionEUR.toFixed(2)}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${allLogEntries.length > 1 ? 'Multi-run' : (recentLogEntry.etl_detailed_stats[collectionName]?.duration || '-')}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${errorCount}</td>
        </tr>
      `;
    }
    
    // Add totals row
    collectionsStatsTableHTML += `
      <tr style="background-color: #f2f2f2; font-weight: bold;">
        <td style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">TOTAL</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${totalDocsScraped}</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${totalDocsNew}</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${totalDocsProcessed}</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${totalDocsUploaded}</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${totalEtiquetasFound}</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">€${totalCostEUR.toFixed(2)}</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">-</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${totalErrorCount}</td>
      </tr>
    `;
    
    // Format the datetime_run for display
    const formattedDateTime = moment(recentLogEntry.datetime_run).format('YYYY-MM-DD HH:mm:ss');
    
    // Build errors and warnings sections from combined data
    let errorsHTML = '';
    let warningsHTML = '';
    let totalErrors = 0;
    let totalWarnings = 0;
    
    for (const [collectionName, stats] of Object.entries(combinedStats)) {
      if (stats.errors && stats.errors.length > 0) {
        for (const errorObj of stats.errors) {
          if (collectionName.toUpperCase() === 'BOCG') {
            // Move BOCG errors to warnings section
            totalWarnings++;
            warningsHTML += `<li style="margin-bottom: 5px;"><strong>${collectionName}:</strong> ${errorObj.error}</li>`;
          } else {
            // Keep other errors in errors section
            totalErrors++;
            errorsHTML += `<li style="margin-bottom: 5px;"><strong>${collectionName}:</strong> ${errorObj.error}</li>`;
          }
        }
      }
    }
    
    let errorsSection = '';
    if (totalErrors > 0) {
      errorsSection = `
        <h2 style="font-size: 16px;">3. Detalle de errores</h2>
        <ul style="font-size: 11px; margin-bottom: 30px;">
          ${errorsHTML}
        </ul>
      `;
    } else {
      errorsSection = `
        <h2 style="font-size: 16px;">3. Detalle de errores</h2>
        <p style="font-size: 12px; color: #28a745;">✅ No se encontraron errores en el procesamiento.</p>
      `;
    }
    
    let warningsSection = '';
    if (totalWarnings > 0) {
      warningsSection = `
        <h2 style="font-size: 16px;">4. Warnings</h2>
        <ul style="font-size: 11px; margin-bottom: 30px;">
          ${warningsHTML}
        </ul>
      `;
    } else {
      warningsSection = `
        <h2 style="font-size: 16px;">4. Warnings</h2>
        <p style="font-size: 12px; color: #28a745;">✅ No se encontraron warnings en el procesamiento.</p>
      `;
    }
    
    const collectionsReportHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte Colecciones ETL</title>
      </head>
      <body style="font-family: Arial, sans-serif; margin: 20px; font-size: 12px;">
        <h1 style="font-size: 18px;">Reporte Colecciones ETL - ${formattedDateTime}</h1>
        
        <h2 style="font-size: 16px;">1. Resumen General</h2>
        <p style="font-size: 12px;"><strong>Fecha/Hora de Ejecución:</strong> ${formattedDateTime}</p>
        ${otherRunsIncluded.length > 0 ? `<p style="font-size: 12px;"><strong>Otros runs incluidos:</strong> ${otherRunsIncluded.join(', ')}</p>` : ''}
        <p style="font-size: 12px;"><strong>Colecciones Procesadas:</strong> ${Object.keys(combinedStats).length}</p>
        <p style="font-size: 12px;"><strong>Colecciones con Actividad:</strong> ${collectionsWithData}</p>
        <ul style="font-size: 12px; margin-bottom: 30px;">
          <li><strong>Total Documentos Scrapeados:</strong> ${totalDocsScraped}</li>
          <li><strong>Total Documentos Nuevos:</strong> ${totalDocsNew}</li>
          <li><strong>Total Documentos Procesados:</strong> ${totalDocsProcessed}</li>
          <li><strong>Total Documentos Subidos:</strong> ${totalDocsUploaded}</li>
          <li><strong>Total Etiquetas Encontradas:</strong> ${totalEtiquetasFound}</li>
          <li><strong>Total Coste API:</strong> €${totalCostEUR.toFixed(2)}</li>
          <li><strong>Total Errores:</strong> ${totalErrorCount}</li>
        </ul>
        
        <h2 style="font-size: 16px;">2. Estadísticas Detalladas por Colección</h2>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px; font-size: 11px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Colección</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Docs Scraped</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Docs New</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Docs Processed</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Docs Uploaded</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Etiquetas Found</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Coste (€)</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Duration</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Errors</th>
            </tr>
          </thead>
          <tbody>
            ${collectionsStatsTableHTML}
          </tbody>
        </table>
        
        <h3 style="font-size: 12px; margin-top: 20px;">Códigos de Color</h3>
        <ul style="font-size: 10px; margin-bottom: 30px;">
          <li><span style="background-color: #e8f5e8; padding: 1px 6px; border-radius: 3px; font-size: 9px;">Verde claro</span> - Documentos procesados exitosamente</li>
          <li><span style="background-color: #f5f5f5; padding: 1px 6px; border-radius: 3px; font-size: 9px;">Gris claro</span> - Sin actividad</li>
          <li><span style="background-color: #ffebee; padding: 1px 6px; border-radius: 3px; font-size: 9px;">Rojo claro</span> - Errores encontrados</li>
        </ul>
        
        ${errorsSection}
        
        ${warningsSection}
        
        <hr>
        <p style="font-size: 12px; color: #666;">
          Generado automáticamente el ${moment().format('YYYY-MM-DD HH:mm:ss')} UTC
        </p>
      </body>
      </html>
    `;
    
    const collectionsReportMailOptions = {
      from: 'Reversa <info@reversa.ai>',
      to: 'info@reversa.ai',
      subject: `Reporte Colecciones ETL - ${moment(recentLogEntry.datetime_run).format('YYYY-MM-DD')}`,
      html: collectionsReportHTML
    };
    
    await transporter.sendMail(collectionsReportMailOptions);
    console.log('Collections ETL report email sent to info@reversa.ai');
    
  } catch (err) {
    console.error('Error sending collections report email:', err);
  }
}

/**
 * Get the last newsletter run from logs_newsletter collection
 * NEW LOGIC: Uses datetime_insert filtering instead of anio/mes/dia
 * EXTRA VERSION: Detects if there was already a run today to mark as "Versión Extra"
 * ETL SYNC: Also gets last_etl_log for synchronized reporting
 * TIMEZONE: All timestamps in UTC
 */
async function getLastNewsletterRun(db) {
  try {
    const logsCollection = db.collection('logs_newsletter');
    
    const lastRun = await logsCollection.findOne(
      { 
        "datetime_run_newsletter": { $exists: true },
        "run_info.environment": "production"
      },
      { sort: { "datetime_run_newsletter": -1 } }
    );
    
    let isExtraVersion = false;
    
    if (lastRun) {
      // Convertir a UTC para mostrar y comparar
      const lastRunUTC = moment(lastRun.datetime_run_newsletter).utc();
      console.log(`Last newsletter run found: ${lastRunUTC.format()} (UTC)`);
      
      // Check if the last run was today (same date in UTC)
      const currentDate = moment().utc();
      
      // If last run was today, this is an extra version
      if (lastRunUTC.isSame(currentDate, 'day')) {
        isExtraVersion = true;
        console.log(`📧 Last run was today (${lastRunUTC.format('YYYY-MM-DD')}). This will be marked as Versión Extra.`);
      }
      
      return {
        exists: true,
        lastRunTime: lastRun.datetime_run_newsletter, // Usar el campo Date original
        isExtraVersion: isExtraVersion,
        lastEtlLogId: lastRun.last_etl_log || null // Para sincronización con ETL reports
      };
    }
    
    // Primera ejecución: día anterior a las 10:00 AM UTC
    const yesterday = moment().utc().subtract(1, 'day').hour(10).minute(0).second(0);
    console.log(`No previous newsletter run found. Using default: ${yesterday.format()}`);
    return {
      exists: false,
      lastRunTime: yesterday.toDate(),
      isExtraVersion: false,
      lastEtlLogId: null // Primera ejecución
    };
  } catch (err) {
    console.error('Error getting last newsletter run:', err);
    // Fallback to yesterday 10:00 AM
    const yesterday = moment().utc().subtract(1, 'day').hour(10).minute(0).second(0);
    return {
      exists: false,
      lastRunTime: yesterday.toDate(),
      isExtraVersion: false,
      lastEtlLogId: null // Error fallback
    };
  }
}

/**
 * Get documents by datetime_insert range from all collections
 * NEW LOGIC: Replaces getAvailableCollectionsToday logic
 */
async function getDocumentsByDatetimeInsert(db, fromDateTime, toDateTime) {
  const allCollections = await db.listCollections().toArray();
  const excludedCollections = ['logs', 'logs_newsletter', 'Feedback', 'Ramas boja', 'Ramas UE', 'users','embedding_alerts','embedding_filter_metrics','tag_change_log','tag_embeddings'];
  const documentsAnalyzedDetail = {};
  const allDocuments = [];
  
  console.log(`📊 Searching documents from ${moment(fromDateTime).utc().format()} to ${moment(toDateTime).utc().format()}`);
  
  for (const collection of allCollections) {
    const collectionName = collection.name;
    
    if (!excludedCollections.includes(collectionName) && !collectionName.endsWith('_test')) {
      try {
        const coll = db.collection(collectionName);
        const query = {
          datetime_insert: {
            $gt: fromDateTime,
            $lte: toDateTime
          }
        };
        
        const docs = await coll.find(query).toArray();
        documentsAnalyzedDetail[collectionName] = docs.length;
        
        docs.forEach(doc => {
          allDocuments.push({
            collectionName: collectionName,
            doc: doc
          });
        });
        
        if (docs.length > 0) {
          console.log(`📄 ${collectionName}: ${docs.length} documentos encontrados`);
        }
      } catch (err) {
        console.warn(`⚠️ Error checking collection ${collectionName}:`, err);
        documentsAnalyzedDetail[collectionName] = 0;
      }
    } else {
      // Incluir colecciones excluidas con 0 para reporte completo
      documentsAnalyzedDetail[collectionName] = 0;
    }
  }
  
  console.log(`📈 Total documents found: ${allDocuments.length} across ${Object.keys(documentsAnalyzedDetail).filter(k => documentsAnalyzedDetail[k] > 0).length} collections`);
  
  return {
    allDocuments,
    documentsAnalyzedDetail,
    totalCount: allDocuments.length
  };
}

/**
 * Determine environment based on users with matches
 * NEW LOGIC: Auto-detect test vs production environment
 */
function determineEnvironment(usersWithMatches) {
  // Si solo hay un usuario y es tomas@reversa.ai → test
  if (usersWithMatches.length === 1 && 
      usersWithMatches[0].email.toLowerCase() === 'tomas@reversa.ai') {
    return 'test';
  }
  return 'production';
}

/**
 * Get the latest ETL log ID for synchronization
 */
async function getLatestEtlLogId(db) {
  try {
    const logsCollection = db.collection('logs');
    const latestEtlLog = await logsCollection.findOne(
      { 
        "datetime_run": { $exists: true },
        "run_info.environment": "production"
      },
      { sort: { "datetime_run": -1 } }
    );
    
    return latestEtlLog ? latestEtlLog._id : null;
  } catch (err) {
    console.error('Error getting latest ETL log ID:', err);
    return null;
  }
}

/**
 * Create newsletter log in logs_newsletter collection
 * NEW LOGIC: Detailed statistics and user match tracking
 * ETL SYNC: Includes last_etl_log for synchronized reporting
 * TIMEZONE: All timestamps in UTC
 */
async function createNewsletterLog(db, userStats, documentsAnalyzedDetail, totalDocsAnalyzed, uniqueDocsMatch, totalMatchesCount) {
  try {
    const logsCollection = db.collection('logs_newsletter');
    
    // Crear timestamp en UTC como Date object
    const currentTimeUTC = moment().utc();
    const currentTime = currentTimeUTC.toDate(); // Date object que MongoDB guardará en UTC
    
    // Determinar environment
    const environment = determineEnvironment(userStats.withMatches);
    
    // Obtener último ETL log ID para sincronización
    const latestEtlLogId = await getLatestEtlLogId(db);
    
    // Construir users_match object
    const usersMatch = {};
    for (const userStat of userStats.withMatches) {
      const userEtiquetas = {};
      
      // Procesar detailedMatches para estructura requerida
      const etiquetaGroups = new Map();
      for (const match of userStat.detailedMatches) {
        for (const etiqueta of match.matchedEtiquetas) {
          if (!etiquetaGroups.has(etiqueta)) {
            etiquetaGroups.set(etiqueta, new Map());
          }
          
          const etiquetaMap = etiquetaGroups.get(etiqueta);
          if (!etiquetaMap.has(match.collectionName)) {
            etiquetaMap.set(match.collectionName, []);
          }
          
          etiquetaMap.get(match.collectionName).push(match.docId || match.shortName);
        }
      }
      
      // Convertir a formato final
      for (const [etiqueta, collectionsMap] of etiquetaGroups.entries()) {
        userEtiquetas[etiqueta] = {};
        for (const [collectionName, docIds] of collectionsMap.entries()) {
          userEtiquetas[etiqueta][collectionName] = docIds;
        }
      }
      
      usersMatch[userStat.email] = {
        etiquetas_personalizadas: userEtiquetas
      };
    }
    
    const logEntry = {
      datetime_run_newsletter: currentTime, // Date object (compatible con logs anteriores)
      last_etl_log: latestEtlLogId, // NEW: ID del último log ETL para sincronización
      run_info: {
        environment: environment,
        documents_analyzed_count: totalDocsAnalyzed,
        unique_documents_match_count: uniqueDocsMatch, // NEW: Unique documents with at least one match
        documents_match_count: totalMatchesCount, // UPDATED: Total number of matches (can be multiple per document)
        users_match_count: userStats.withMatches.length,
        documents_analyzed_detail: documentsAnalyzedDetail,
        users_match: usersMatch
      }
    };
    
    const result = await logsCollection.insertOne(logEntry);
    console.log('✅ Newsletter log created successfully:', {
      logId: result.insertedId,
      environment: environment,
      timestamp: currentTimeUTC.format(), // Mostrar timestamp UTC
      users: userStats.withMatches.length,
      documentsAnalyzed: totalDocsAnalyzed,
      uniqueDocumentsMatch: uniqueDocsMatch,
      totalMatchesCount: totalMatchesCount,
      lastEtlLogId: latestEtlLogId // Para debugging de sincronización
    });
    
    return result.insertedId;
  } catch (err) {
    console.error('❌ Error creating newsletter log:', err);
    throw err;
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
    
    console.log('📊 NEWSLETTER EXECUTION STARTED');
    console.log(`⏰ Current time (UTC): ${moment().utc().format()}`);
    
    // NEW LOGIC: Get last newsletter run
    const lastNewsletterRun = await getLastNewsletterRun(db);
    const currentTime = moment().utc().toDate();
    
    // Extract isExtraVersion from the response
    const isExtraVersion = lastNewsletterRun.isExtraVersion || false;
    
    console.log(`📅 Last run: ${lastNewsletterRun.exists ? moment(lastNewsletterRun.lastRunTime).utc().format() : 'First execution'}`);
    console.log(`📧 Extra version: ${isExtraVersion ? 'YES - Versión Extra' : 'NO - Regular newsletter'}`);
    
    // NEW LOGIC: Get documents by datetime_insert
    const documentsData = await getDocumentsByDatetimeInsert(
      db, 
      lastNewsletterRun.lastRunTime, 
      currentTime
    );
    
    if (documentsData.totalCount === 0) {
      console.log('📭 No new documents found since last newsletter run. Exiting...');
      
      // Still send collections ETL report (sin sincronización porque no hay newsletter)
      console.log('Sending collections ETL report...');
      await sendCollectionsReportEmail(db);
      
      await client.close();
      return;
    }
    
    console.log(`📈 Found ${documentsData.totalCount} documents to analyze from ${Object.keys(documentsData.documentsAnalyzedDetail).filter(k => documentsData.documentsAnalyzedDetail[k] > 0).length} collections`);
    
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
        if (emailLower.endsWith('@cuatrecasas.com')) {
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

    const filteredUsers = filterUniqueEmails(allUsers); //allUsers.filter(u => u.email && u.email.toLowerCase() === 'tomas@reversa.ai'); //
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
      // NEW LOGIC: Filter documents from documentsData.allDocuments based on user's coverage
      const userMatchingDocs = documentsData.allDocuments.filter(docObj => 
        coverageCollections.includes(docObj.collectionName.toUpperCase())
      );
      
      if (userMatchingDocs.length === 0) {
        console.log(`👤 User ${user.email} has no documents in subscribed collections. Skipping.`);
        continue;
      }
      
      console.log(`👤 User ${user.email}: Processing ${userMatchingDocs.length} documents from ${[...new Set(userMatchingDocs.map(d => d.collectionName))].join(', ')}`);

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
                
                // Extraer descripción y nivel de impacto según la estructura
                const etiquetaData = docEtiquetasObj[etiquetaKey];
                let descripcion = '';
                let nivelImpacto = '';
                
                if (typeof etiquetaData === 'string') {
                  // Estructura antigua: solo string
                  descripcion = etiquetaData;
                } else if (typeof etiquetaData === 'object' && etiquetaData !== null) {
                  // Estructura nueva: objeto con explicacion y nivel_impacto
                  descripcion = etiquetaData.explicacion || '';
                  nivelImpacto = etiquetaData.nivel_impacto || '';
                }
                
                // Combinar descripción y nivel de impacto para compatibilidad
                const fullDescription = nivelImpacto ? `${descripcion} (Nivel: ${nivelImpacto})` : descripcion;
                matchedEtiquetasDescriptions.push(fullDescription);
                
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
      
      // 4) Build etiqueta & collection & rango grouping
      const etiquetaGroups = {};

      userMatchingDocsFiltered.forEach(({ collectionName, doc }) => {
        // Get matched etiquetas personalizadas
        const matchedEtiquetas = doc.matched_etiquetas_personalizadas || [];
        const rango = doc.rango_titulo || "Otras";
        
        matchedEtiquetas.forEach(etiqueta => {
          // Initialize the etiqueta group if needed
          if (!etiquetaGroups[etiqueta]) {
            etiquetaGroups[etiqueta] = {};
          }
          
          // Initialize the collection subgroup if needed
          if (!etiquetaGroups[etiqueta][collectionName]) {
            etiquetaGroups[etiqueta][collectionName] = {};
          }
          
          // Initialize the rango subgroup if needed
          if (!etiquetaGroups[etiqueta][collectionName][rango]) {
            etiquetaGroups[etiqueta][collectionName][rango] = [];
          }
          
          // Add document to its group
          etiquetaGroups[etiqueta][collectionName][rango].push({
            ...doc,
            collectionName
          });
        });
      });

      // Convert to array structure for template processing
      const finalGroups = [];
      for (const [etiqueta, collections] of Object.entries(etiquetaGroups)) {
        const etiquetaGroup = {
          etiquetaTitle: etiqueta,
          collections: []
        };
        
        for (const [collName, rangos] of Object.entries(collections)) {
          const collectionGroup = {
            collectionName: collName,
            displayName: mapCollectionNameToDisplay(collName),
            rangos: []
          };
          
          for (const [rango, docs] of Object.entries(rangos)) {
            collectionGroup.rangos.push({
              rangoTitle: rango,
              docs: docs
            });
          }
          
          // Sort rangos by predefined order
          collectionGroup.rangos.sort((a, b) => {
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
          
          etiquetaGroup.collections.push(collectionGroup);
        }
        
        // Sort collections by predefined order
        etiquetaGroup.collections.sort((a, b) => {
          const order = ["BOE", "DOUE", "DOG", "BOA", "BOCM", "BOCYL", "BOJA", "BOPV", "CNMV"];
          return order.indexOf(a.collectionName.toUpperCase()) - order.indexOf(b.collectionName.toUpperCase());
        });
        
        finalGroups.push(etiquetaGroup);
      }

      // Sort etiqueta groups alphabetically
      finalGroups.sort((a, b) => a.etiquetaTitle.localeCompare(b.etiquetaTitle));

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
        // Add to statistics - users without matches
        userStats.withoutMatches.push({
          email: user.email,
          etiquetasCount: userEtiquetasKeys.length,
          etiquetas_personalizadas: user.etiquetas_personalizadas || {},
          etiquetas_demo: user.etiquetas_demo || {}
        });

        // Check if we should send emails to users without matches
        if (!SEND_EMAILS_TO_USERS_WITHOUT_MATCHES) {
          console.log(`Skipping email for ${user.email} - no matches and SEND_EMAILS_TO_USERS_WITHOUT_MATCHES is false`);
          continue; // Skip to next user
        }

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
        
        // Calculate total matches count (sum of all etiquetas matches across all documents)
        const totalMatchesCount = userMatchingDocsFiltered.reduce((sum, docObj) => {
          return sum + (docObj.doc.matched_etiquetas_personalizadas || []).length;
        }, 0);

        userStats.withMatches.push({
          email: user.email,
          totalDocs: userMatchingDocsFiltered.length, // Unique documents with matches
          totalMatches: totalMatchesCount, // Total number of matches (including multiple per document)
          uniqueEtiquetas: userMatchStats.size,
          matchDetails: matchDetails.join(' ; '),
          etiquetas_personalizadas: user.etiquetas_personalizadas || {},
          etiquetas_demo: user.etiquetas_demo || {},
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
        subject: `Reversa Alertas Normativas${isExtraVersion ? ' - Versión Extra' : ''} — ${moment().format('YYYY-MM-DD')}`,
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

    console.log('✅ All emails processed. Creating newsletter log and sending reports...');
    
    // NEW LOGIC: Calculate statistics
    const totalDocsAnalyzed = documentsData.totalCount;
    const uniqueDocsMatch = userStats.withMatches.reduce((sum, user) => sum + user.totalDocs, 0);
    const totalMatchesCount = userStats.withMatches.reduce((sum, user) => sum + user.totalMatches, 0);
    
    console.log(`📊 Final Statistics:`);
    console.log(`   - Documents analyzed: ${totalDocsAnalyzed}`);
    console.log(`   - Unique documents with matches: ${uniqueDocsMatch}`);
    console.log(`   - Total matches count: ${totalMatchesCount}`);
    console.log(`   - Users with matches: ${userStats.withMatches.length}`);
    console.log(`   - Users without matches: ${userStats.withoutMatches.length}`);
    
    // NEW LOGIC: Create newsletter log
    try {
      await createNewsletterLog(db, userStats, documentsData.documentsAnalyzedDetail, totalDocsAnalyzed, uniqueDocsMatch, totalMatchesCount);
    } catch (err) {
      console.error('Failed to create newsletter log, but continuing with reports:', err);
    }
    
    // Send reports (keep existing functionality)
    console.log('📧 Sending daily report...');
    await sendReportEmail(db, userStats);

    console.log('📊 Sending synchronized ETL report...');
    await sendCollectionsReportEmail(db, lastNewsletterRun.lastEtlLogId);

    console.log('All done. Closing DB.');
    await client.close();

  } catch (err) {
    console.error('Error =>', err);
  }

})();
