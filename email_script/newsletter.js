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
    case 'BOCG':  return 'Boletín Oficial de las Cortes Generales';
    case 'DOGC':  return 'Diario Oficial de la Generalitat Catalana';
    case 'BOJA':  return 'Boletín Oficial de la Junta de Andalucía';
    case 'BOPV':  return 'Boletín Oficial del País Vasco';
    case 'CNMV':  return 'Comisión Nacional del Mercado de Valores';
    case 'AEPD': return 'Agencia Española de Protección de Datos'
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
    @font-face { 
      font-family: "Satoshi";
      /* Add other properties here, as needed. For example: */
      /*
      font-weight: 100 900;
      font-style: normal italic;
      */
      src: url(data:application/octet-stream;base64,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);
    }

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
           @font-face { 
            font-family: "Satoshi";
            /* Add other properties here, as needed. For example: */
            /*
            font-weight: 100 900;
            font-style: normal italic;
            */
            src: url(data:application/octet-stream;base64,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);
          }

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