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
const anioToday = TODAY.year();
const mesToday  = TODAY.month() + 1;
const diaToday  = TODAY.date()-2;

// 2) Setup nodemailer with SendGrid transport
console.log("SendGrid key is:", process.env.SENDGRID_API_KEY);
const transporter = nodemailer.createTransport(
  sgTransport({
    auth: {
      api_key: process.env.SENDGRID_API_KEY
    }
  })
);

/** Mapea ciertos nombres de colección a textos más descriptivos */
function mapCollectionNameToDisplay(cName) {
    const upper = (cName || '').toUpperCase();
    switch (upper) {
      case 'BOE':   return 'Boletín Oficial del Estado';
      case 'DOUE':  return 'Diario Oficial de la Unión Europea';
      case 'DOG':   return 'Diario Oficial de Galicia';
      case 'BOA':   return 'Boletín Oficial de Aragón';
      case 'BOCM':  return 'Boletín Oficial de la Comunidad de Madrid';
      case 'BOCYL': return 'Boletín Oficial de Castilla y León';
      case 'BOJA':  return 'Boletín Oficial de la Junta de Andalucía';
      case 'BOPV':  return 'Boletín Oficial del País Vasco';
      case 'CNMV':  return 'Comisión Nacional del Mercado de Valores';
      default:      return upper;
    }
  }
  

/**
 * buildDocumentHTML:
 * Genera un snippet HTML para un único doc.
 */
function buildDocumentHTML(doc, isLastDoc) {
  // Manejar industrias (matched_cnaes o divisiones_cnae)
  let industriasHTML = '';
  let subIndustriasHTML = '';
  
  // Usar matched_cnaes si está disponible, de lo contrario usar divisiones_cnae
  if (doc.matched_cnaes && doc.matched_cnaes.length) {
      industriasHTML = doc.matched_cnaes.map(div => `<span class="etiqueta">${div}</span>`).join('');
  } else if (doc.divisiones_cnae) {
      // Si divisiones_cnae es un objeto (nueva estructura)
      if (typeof doc.divisiones_cnae === 'object' && !Array.isArray(doc.divisiones_cnae)) {
          industriasHTML = Object.keys(doc.divisiones_cnae)
              .map(industria => `<span class="etiqueta">${industria}</span>`)
              .join('');
              
          // Generar HTML para subindustrias
          const subIndustrias = [];
          Object.entries(doc.divisiones_cnae).forEach(([industria, subs]) => {
              if (Array.isArray(subs)) {
                  subs.forEach(sub => subIndustrias.push(sub));
              }
          });
          
          if (subIndustrias.length) {
              subIndustriasHTML = subIndustrias.map(si => 
                  `<span style="padding:5px 0; color:#4ce3a7; margin-left:10px;">
                      <i><b>#${si}</b></i>
                  </span>`
              ).join(' ');
          }
      } 
      // Si divisiones_cnae es un array (estructura antigua)
      else if (Array.isArray(doc.divisiones_cnae)) {
          industriasHTML = doc.divisiones_cnae.map(div => `<span class="etiqueta">${div}</span>`).join('');
      }
      // Si divisiones_cnae es un string
      else {
          industriasHTML = `<span class="etiqueta">${doc.divisiones_cnae}</span>`;
      }
  }

  // Manejar ramas jurídicas
  let ramas = doc.matched_rama_juridica || [];
  if (!Array.isArray(ramas)) ramas = [ramas];

  let subRamas = doc.sub_rama_juridica || [];
  if (!Array.isArray(subRamas)) subRamas = [subRamas];

  const ramaHTML = ramas.length
    ? ramas.map(r => `<span class="etiqueta" style="background-color: #0c2532; color: white;">${r}</span>`).join('')
    : '';

  const subRamaHTML = subRamas.length
    ? subRamas.map(sr =>
        `<span style="padding:5px 0; color:#4ce3a7; margin-left:10px;">
          <i><b>#${sr}</b></i>
        </span>`
      ).join(' ')
    : '';

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
        <p>${industriasHTML}${ramaHTML}</p>
        <p>${subIndustriasHTML}${subRamaHTML}</p>
        <p>${doc.resumen}</p>
        <p>
          <div class="margin-impacto">
            <a class="button-impacto"
              href="https://app.papyrus-ai.com/norma.html?documentId=${doc._id}&collectionName=${doc.collectionName}"
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
  
  // Replace or add this function to your code
  function buildDocumentHTMLnoMatches(doc, isLastDoc) {
    // Extraer todas las industrias y subindustrias del documento
    let industrias = [];
    let subIndustrias = new Set();
    
    if (doc.divisiones_cnae) {
      // Si divisiones_cnae es un objeto (nueva estructura)
      if (typeof doc.divisiones_cnae === 'object' && !Array.isArray(doc.divisiones_cnae)) {
        industrias = Object.keys(doc.divisiones_cnae);
        
        // Extraer todas las subindustrias
        Object.values(doc.divisiones_cnae).forEach(subIndustriaArray => {
          if (Array.isArray(subIndustriaArray)) {
            subIndustriaArray.forEach(subIndustria => subIndustrias.add(subIndustria));
          }
        });
      } 
      // Si divisiones_cnae es un array (estructura antigua)
      else if (Array.isArray(doc.divisiones_cnae)) {
        industrias = doc.divisiones_cnae;
      }
      // Si divisiones_cnae es un string
      else {
        industrias = [doc.divisiones_cnae];
      }
    }
  
    // Extraer todas las ramas jurídicas
    let ramas = [];
    if (doc.ramas_juridicas && typeof doc.ramas_juridicas === 'object') {
      ramas = Object.keys(doc.ramas_juridicas);
    }
  
    // Extraer todas las subramas jurídicas
    let subRamas = new Set();
    if (doc.ramas_juridicas) {
      Object.values(doc.ramas_juridicas).forEach(subRamaArray => {
        if (Array.isArray(subRamaArray)) {
          subRamaArray.forEach(subRama => subRamas.add(subRama));
        }
      });
    }
  
    // Generar HTML para cada tipo de etiqueta
    const industriasHTML = industrias.map(ind => `<span class="etiqueta">${ind}</span>`).join('');
    const subIndustriasHTML = Array.from(subIndustrias).map(si => 
      `<span style="padding:5px 0; color:#4ce3a7; margin-left:10px;">
        <i><b>#${si}</b></i>
      </span>`
    ).join(' ');
    const ramaHTML = ramas.map(r => `<span class="etiqueta" style="background-color: #092534; color: white;">${r}</span>`).join('');
    const subRamaHTML = Array.from(subRamas).map(sr => `<span class="sub-rama-value"><i><b>#${sr}</b></i></span>`).join(' ');
  
    const hrOrNot = isLastDoc ? '' : `<hr style="border: none; border-top: 1px solid #ddd; width: 75%; margin: 10px auto;">`;
  
    return `
    <div class="document">
      <h2>${doc.short_name}</h2>
      <p>${industriasHTML} ${ramaHTML}</p>
      <p>${subIndustriasHTML} ${subRamaHTML}</p>
      <p>${doc.resumen}</p>
      <p>
        <div class="margin-impacto">
          <a class="button-impacto"
             href="https://app.papyrus-ai.com/norma.html?documentId=${doc._id}&collectionName=${doc.collectionName}"
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
 * [CAMBIO] => en el bloque "detailBlocks", ya no hardcodeamos "BOE".
 *            Se agrupan docs por doc.collectionName real.
 */
 function buildNewsletterHTML(userName, userId, dateString, rangoGroups) {
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
      @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap');
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
        <a href="https://papyrus-ai.com/profile" target="_blank">Ver online</a>
      </div>
      <div class="logo-container">
        <img src="cid:papyrusLogo" alt="Papyrus Logo" style="max-width:200px; height:auto;" />
      </div>

      <p>Hola ${userName}, a continuación te resumimos las novedades regulatorias de tus alertas normativas suscritas del día <strong>${dateString}</strong>:</p>

      ${summarySection}

      <div style="text-align:center; margin:15px 0;">
        <a href="https://papyrus-ai.com/"
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
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=1"
                 style="color:#fff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                1
              </a>
            </td>
            <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=2"
                 style="color:#fff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                2
              </a>
            </td>
            <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=3"
                 style="color:#fff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                3
              </a>
            </td>
            <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=4"
                 style="color:#fff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                4
              </a>
            </td>
            <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=5"
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
        &copy; ${moment().year()} Papyrus. Todos los derechos reservados.
      </p>

      <div style="text-align:center; margin-top: 20px;">
        <a href="https://papyrus-ai.com/suscripcion.html"
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
 * Only BOE docs, grouped by divisiones_cnae, 'Genérico' last.
 */
/**
 * Newsletter "no matches" scenario (actualizado).
 * Muestra SOLO docs BOE con seccion = "Disposiciones Generales".
 * Si no hay ninguno => “No se han publicado disposiciones generales en el BOE hoy”.
 */
function buildNewsletterHTMLNoMatches(userName, userId, dateString, boeDocs) {
    // Filter for disposiciones generales
    const boeGeneralDocs = boeDocs.filter(doc => doc.seccion === "Disposiciones generales");
    
    console.log("No matches is being triggered");
  
    // Intro text based on document count
    let introText = '';
    if (boeGeneralDocs.length === 0) {
      introText = `<p>No se han publicado disposiciones generales en el BOE hoy</p>`;
    } else {
      introText = `<p>A continuación, te compartimos un resumen inteligente de las disposiciones generales del BOE de hoy</p>`;
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
          @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap');
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
          <a href="https://papyrus-ai.com/profile" target="_blank">Ver online</a>
        </div>
        <div class="logo-container">
          <img src="cid:papyrusLogo" alt="Papyrus Logo" style="max-width:200px; height:auto;" />
        </div>
  
        <p>Hola ${userName}, <strong>no hay novedades regulatorias</strong> de tus alertas normativas el día <strong>${dateString}</strong>.</p>
  
        <div style="text-align:center; margin:15px 0;">
          <a href="https://papyrus-ai.com" 
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
                <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=1"
                   style="color:#ffffff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                  1
                </a>
              </td>
              <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
                <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=2"
                   style="color:#ffffff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                  2
                </a>
              </td>
              <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
                <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=3"
                   style="color:#ffffff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                  3
                </a>
              </td>
              <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
                <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=4"
                   style="color:#ffffff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                  4
                </a>
              </td>
              <td style="background-color:#4ce3a7; width:40px; height:40px; text-align:center; vertical-align:middle;">
                <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=5"
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
          &copy; ${moment().year()} Papyrus. Todos los derechos reservados.
        </p>
        <div style="text-align:center; margin-top: 20px;">
          <a href="https://papyrus-ai.com/suscripcion"
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
  

// MAIN EXECUTION

(async () => {
  let client;
  try {
    client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(DB_NAME);
    const usersCollection = db.collection('users');

    // 1) Cargamos todos los usuarios
    const allUsers = await usersCollection.find({}).toArray();
        /**
     * Filters an array of users ensuring that only one user per unique email (in lower case) is included.
     */
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
          
          // Exclude emails that end with "@cuatrecasas.com"
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
  

    const filteredUsers = allUsers.filter(u => u.email && u.email.toLowerCase() === 'inigo.martin.llorente@gmail.com'); //filterUniqueEmails(allUsers);  //




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
      for (const collectionName of coverageCollections) {
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
          
          console.log(`Retrieved ${docs.length} documents from ${collectionName}`);
        } catch (err) {
          console.error(`Error retrieving documents from ${collectionName}:`, err);
        }
      }
     // 3B) NEW: Filter documents by user's rangos, ramas, and industries
const userRangos = user.rangos || [
    "Leyes", "Reglamentos", "Decisiones Interpretativas y Reguladores",
    "Jurisprudencia", "Ayudas, Subvenciones y Premios", "Otras"
  ];
  const userIndustries = user.industry_tags || [];
  const userRamas = user.rama_juridicas || [];
  const userSubIndustriaMap = user.sub_industria_map || {};
  console.log(userRamas);
  console.log(userIndustries);
  
  
  // Filter the matching docs
  const filteredMatchingDocs = [];
  for (const docObj of userMatchingDocs) {
    const doc = docObj.doc;
    const collectionName = docObj.collectionName;
    
    // FILTER 1: Check if the document's rango matches any of the user's rangos
    const docRango = doc.rango_titulo || "Otras";
    const rangoMatches = userRangos.includes(docRango);
    
    if (!rangoMatches) continue;
    
    // FILTER 2: Check for rama juridica match
    let hasRamaMatch = false;
    let matchedRamas = [];
    
    if (doc.ramas_juridicas && typeof doc.ramas_juridicas === 'object') {
      const docRamas = Object.keys(doc.ramas_juridicas);
      for (const rama of userRamas) {
        if (docRamas.includes(rama)) {
          hasRamaMatch = true;
          matchedRamas.push(rama);
        }
      }
    }
    
    if (!hasRamaMatch) continue;
    
    // FILTER 3: Check for industry match using sub_industria_map
    let hasIndustryMatch = false;
    let matchedIndustries = [];
    let matchedSubIndustrias = [];

    // Obtener sub_industria_map del usuario
    const userSubIndustriaMap = user.sub_industria_map || {};

    // Verificar si el documento tiene divisiones_cnae
    if (doc.divisiones_cnae) {
      // Si divisiones_cnae es un objeto (nueva estructura)
      if (typeof doc.divisiones_cnae === 'object' && !Array.isArray(doc.divisiones_cnae)) {
        const docIndustrias = Object.keys(doc.divisiones_cnae);
        
        // Caso especial: Si el documento tiene la industria "General", es una coincidencia
        if (docIndustrias.includes("General")) {
          hasIndustryMatch = true;
          matchedIndustries.push("General");
        } else {
          // Verificar coincidencias de subindustrias
          for (const [userIndustria, userSubIndustrias] of Object.entries(userSubIndustriaMap)) {
            // Si la industria del usuario está en el documento
            if (docIndustrias.includes(userIndustria)) {
              const docSubIndustrias = doc.divisiones_cnae[userIndustria] || [];
              
              // Si no hay subindustrias específicas seleccionadas por el usuario para esta industria,
              // o si hay al menos una subindustria coincidente, es una coincidencia
              if (userSubIndustrias.length === 0) {
                hasIndustryMatch = true;
                matchedIndustries.push(userIndustria);
              } else {
                // Verificar si hay subindustrias coincidentes
                for (const userSubIndustria of userSubIndustrias) {
                  if (docSubIndustrias.includes(userSubIndustria)) {
                    hasIndustryMatch = true;
                    matchedIndustries.push(userIndustria);
                    matchedSubIndustrias.push(userSubIndustria);
                    break; // Una coincidencia es suficiente para esta industria
                  }
                }
              }
            }
          }
          
          // Si no hay coincidencias de subindustrias, verificar coincidencias de industrias
          if (!hasIndustryMatch && userIndustries.length > 0) {
            for (const industry of userIndustries) {
              if (docIndustrias.includes(industry)) {
                hasIndustryMatch = true;
                matchedIndustries.push(industry);
              }
            }
          }
        }
      } 
      // Si divisiones_cnae es un array (estructura antigua)
      else {
        let docIndustrias = Array.isArray(doc.divisiones_cnae) ? doc.divisiones_cnae : [doc.divisiones_cnae];
        
        // Caso especial: Si el documento tiene la industria "General", es una coincidencia
        if (docIndustrias.includes("General")) {
          hasIndustryMatch = true;
          matchedIndustries.push("General");
        } else {
          // Verificar coincidencias de industrias
          for (const industry of userIndustries) {
            if (docIndustrias.includes(industry)) {
              hasIndustryMatch = true;
              matchedIndustries.push(industry);
            }
          }
        }
      }
    }

    
    // Document must match BOTH rama and industry criteria
    if (hasRamaMatch && hasIndustryMatch) {
      // Create enhanced version of the document with matched values
    // Create enhanced version of the document with matched values
      filteredMatchingDocs.push({
        collectionName: collectionName,
        doc: {
          ...doc,
          matched_cnaes: matchedIndustries,
          matched_rama_juridica: matchedRamas,
          matched_sub_industrias: matchedSubIndustrias
        }
      });

    }
  }
  
  // Replace the original collection with the filtered one
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
let htmlBody = '';
if (!finalGroups.length) {
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
      user.name,
      user._id.toString(),
      moment().format('YYYY-MM-DD'),
      boeDocsWithCollection
    );
  } catch (err) {
    console.warn(`Error retrieving BOE general docs: ${err}`);
    // If all else fails, show empty
    htmlBody = buildNewsletterHTMLNoMatches(
      user.name,
      user._id.toString(),
      moment().format('YYYY-MM-DD'),
      []
    );
  }
} else {
  htmlBody = buildNewsletterHTML(
    user.name,
    user._id.toString(),
    moment().format('YYYY-MM-DD'),
    finalGroups
  );
}


      // 6) Send email
      const emailSize = Buffer.byteLength(htmlBody, 'utf8');
      console.log(`Email size for ${user.email}: ${emailSize} bytes (~${(emailSize/1024).toFixed(2)} KB)`);

      const mailOptions = {
        from: 'Papyrus <info@papyrus-ai.com>',
        to: user.email,
        subject: `Papyrus Alertas Normativas — ${moment().format('YYYY-MM-DD')}`,
        html: htmlBody,
        attachments: [
          {
            filename: 'Intro_to_papyrus.jpeg',
            path: path.join(__dirname, 'assets', 'Intro_to_papyrus.jpeg'),
            cid: 'papyrusLogo'
          }
        ]
      };
      try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${user.email}.`);
      } catch(err) {
        console.error(`Error sending email to ${user.email}:`, err);
      }
    }

    console.log('All done. Closing DB.');
    await client.close();

  } catch (err) {
    console.error('Error =>', err);
  }

})();