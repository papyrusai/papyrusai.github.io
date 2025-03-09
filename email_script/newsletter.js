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
const anioToday = 2025 //TODAY.year();
const mesToday  = 3 //TODAY.month() + 1;
const diaToday  = 7 //TODAY.date();

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
    case 'BOCM':  return 'Boletín Oficial de la Comunidad de Madrid';
    case 'BOA':   return 'Boletín Oficial de Aragón';
    case 'BOJA':  return 'Boletín Oficial de la Junta de Andalucía';
    case 'BOPV':  return 'Boletín Oficial del País Vasco';
    case 'CNMV':  return 'Comisión Nacional del Mercado de Valores';
    // Añade más si deseas
    default:      return upper;
  }
}

/**
 * buildDocumentHTML:
 * Genera un snippet HTML para un único doc.
 */
function buildDocumentHTML(doc, isLastDoc) {
  let cnaes = doc.divisiones_cnae || [];
  if (!Array.isArray(cnaes)) cnaes = [cnaes];

  let subRamas = doc.sub_rama_juridica || [];
  if (!Array.isArray(subRamas)) subRamas = [subRamas];

  const cnaeHTML = cnaes.length
    ? cnaes.map(div => `<span class="etiqueta">${div}</span>`).join('')
    : '';

  const subRamaHTML = subRamas.length
    ? subRamas.map(sr =>
        `<span style="padding:5px 0; color:#83a300; margin-left:10px;">
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
      <p>${cnaeHTML}</p>
      <p>${subRamaHTML}</p>
      <p>${doc.resumen}</p>
      <p>
  <div class="margin-impacto">
    <a class="button-impacto"
           href="https://app.papyrus-ai.com/norma.html?documentId=${doc._id}&collectionName=${doc.collectionName}"
           style="margin-right: 10px;">
          Análisis impacto normativo
        </a>
</div>
        <a href="${doc.url_pdf}" target="_blank" style="color:#83a300;">
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
function buildNewsletterHTML(userName, userId, dateString, groupedData) {
  // Filtrar 'cnae' vs 'subRama'
  const cnaeGroups = groupedData.filter(g => g.type === 'cnae');
  const subRamaGroups = groupedData.filter(g => g.type === 'subRama');

  // Summaries
  const cnaeSummaryHTML = cnaeGroups.map(g => {
    const docCount = g.docs.length;
    return `<li>${docCount} Alertas de <span style="color:#89A231;">${g.coincidentValue}</span></li>`;
  }).join('');

  const subRamaSummaryHTML = subRamaGroups.map(g => {
    const docCount = g.docs.length;
    return `<li>${docCount} Alertas de <span style="color:#89A231;">${g.coincidentValue}</span></li>`;
  }).join('');

  let summarySection = '';
  if (cnaeGroups.length > 0) {
    summarySection += `
      <h4 style="font-size:16px; margin-bottom:15px; color:#092534">
        SECTOR ECONÓMICO
      </h4>
      <ul style="margin-bottom:15px;">
        ${cnaeSummaryHTML}
      </ul>
    `;
  }
  if (subRamaGroups.length > 0) {
    summarySection += `
      <h4 style="font-size:16px; margin-bottom:15px; color:#092534">
        RAMA JURIDICA
      </h4>
      <ul style="margin-bottom:15px;">
        ${subRamaSummaryHTML}
      </ul>
    `;
  }

  // [CAMBIO] => detailBlocks: agrupar docs por group, luego agrupar por doc.collectionName
  const detailBlocks = groupedData.map(group => {
    // Bloque separador para 'coincidentValue'
    const separatorBlock = `
      <div style="background-color:#89A231; margin:5% 0; padding:5px 20px; border-radius:20px;">
        <h2 style="margin:0; color:#FAF7F0; font-size:14px;">
          ${group.coincidentValue.toUpperCase()}
        </h2>
      </div>
    `;

    // Agrupamos docs por collectionName en lugar de forzar "BOE"
    const byCollection = {};
    group.docs.forEach(doc => {
      const cName = doc.collectionName || 'BOE'; 
      if (!byCollection[cName]) {
        byCollection[cName] = [];
      }
      byCollection[cName].push(doc);
    });

    // [CAMBIO] => "BOE" primero, luego resto
    let collArr = Object.keys(byCollection).map(key => ({
      collectionName: key,
      docs: byCollection[key],
    }));
    // localizamos BOE si existe
    const boeIndex = collArr.findIndex(c => c.collectionName.toUpperCase() === 'BOE');
    let boeItem = null;
    if (boeIndex >= 0) {
      boeItem = collArr.splice(boeIndex, 1)[0];
    }
    // Ordenamos asc por docCount
    collArr.sort((a, b) => a.docs.length - b.docs.length);
    if (boeItem) {
      collArr.unshift(boeItem);
    }

    // Contruimos un 'collectionBlock' por cada colec
    const collectionBlocks = collArr.map(collObj => {
      const cName = collObj.collectionName;
      const displayName = mapCollectionNameToDisplay(cName);

      const docsHTML = collObj.docs.map((doc, idx) => {
        const isLastDoc = (idx === collObj.docs.length - 1);
        return buildDocumentHTML(doc, isLastDoc);
      }).join('');

      const collectionSeparator = `
        <hr style="
          border: none;
          border-top: 1px solid #092534;
          width: 100%;
          margin: 10px auto;
        ">
      `;
      return `
        ${collectionSeparator}
        <h3 style="
          color:#092534;
          margin: 3% auto;
          margin-top:5%;
          text-align:center;
          font-style:italic;
        ">
          ${displayName}
        </h3>
        ${docsHTML}
      `;
    }).join('');

    return separatorBlock + collectionBlocks;
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
      @import url('https://fonts.googleapis.com/css2?family=Aptos:wght@400;700&display=swap');
      body {
        font-family: 'Aptos', sans-serif;
        margin: 0;
        padding: 0;
        background-color: #FAF7F0;
        color: #333;
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
      background-color: #83a300; /* Darker blue on hover */
    }
      
    .margin-impacto {
      margin-bottom: 1%;
    }
      h2 {
        color: #092534;
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
        background-color: #FAF7F0;
        color: #05141C;
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
        font-size: 12px;
        margin-bottom: 5px;
      }
      .online-link a {
        color: #092534;
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
             background-color:#83a300;
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
        <p style="font-size:16px; color:#092534; font-weight:bold; margin-bottom:10px;">
          ¿Qué te ha parecido este resumen normativo?
        </p>
        <table align="center" style="border-spacing:10px;">
          <tr>
            <td style="background-color:#83a300; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=1"
                 style="color:#fff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                1
              </a>
            </td>
            <td style="background-color:#83a300; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=2"
                 style="color:#fff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                2
              </a>
            </td>
            <td style="background-color:#83a300; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=3"
                 style="color:#fff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                3
              </a>
            </td>
            <td style="background-color:#83a300; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=4"
                 style="color:#fff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                4
              </a>
            </td>
            <td style="background-color:#83a300; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=5"
                 style="color:#fff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                5
              </a>
            </td>
          </tr>
          <tr>
            <td style="text-align:center; font-size:12px; color:#092534;">
              Poco<br>satisfecho
            </td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td style="text-align:center; font-size:12px; color:#092534;">
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
           style="color: #092534; text-decoration: underline; font-size: 12px;">
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
  // [1] Filtrar docs BOE para que solo queden con doc.seccion === "Disposiciones Generales"
  const boeGeneralDocs = boeDocs.filter(doc => doc.seccion === "Disposiciones Generales");

  // [2] Si no hay ninguno => Cambiamos el texto del párrafo principal
  let introText = '';
  if (boeGeneralDocs.length === 0) {
    introText = `<p>No se han publicado disposiciones generales en el BOE hoy</p>`;
  } else {
    introText = `<p>A continuación, te compartimos un resumen inteligente de las disposiciones generales del BOE de hoy</p>`;
  }

  // Mapeo de CNAE
  const cnaeMap = {};

  // Igual que antes, generamos sub_rama_juridica y clasificamos en cnaeMap
  boeGeneralDocs.forEach(doc => {
    let cnaes = doc.divisiones_cnae || [];
    if (!Array.isArray(cnaes)) cnaes = [cnaes];

    // Normalizamos sub‐ramas
    let subRamas = [];
    if (doc.ramas_juridicas && typeof doc.ramas_juridicas === 'object') {
      for (const arr of Object.values(doc.ramas_juridicas)) {
        if (Array.isArray(arr)) {
          subRamas.push(...arr);
        }
      }
    }
    doc.sub_rama_juridica = subRamas;

    if (cnaes.length > 0) {
      cnaes.forEach(c => {
        if (!cnaeMap[c]) cnaeMap[c] = [];
        cnaeMap[c].push(doc);
      });
    } else {
      // Si no tiene cnaes => agruparlo como "Genérico"
      const placeholder = 'Genérico';
      if (!cnaeMap[placeholder]) cnaeMap[placeholder] = [];
      cnaeMap[placeholder].push(doc);
    }
  });

  // Reordenar "Genérico" al final
  const cnaeKeys = Object.keys(cnaeMap);
  const genIndex = cnaeKeys.findIndex(k => k.toLowerCase().trim() === 'genérico');
  if (genIndex >= 0) {
    const [generic] = cnaeKeys.splice(genIndex, 1);
    cnaeKeys.push(generic);
  }

  // Construimos detailBlocks
  const detailBlocks = cnaeKeys.map(cnae => {
    const docs = cnaeMap[cnae];
    const heading = `
      <div style="background-color:#89A231;  
                  margin:5% 0; 
                  padding:5px 20px; 
                  border-radius:20px;">
        <h2 style="margin:0; color:#FAF7F0; font-size:14px;">
          ${cnae.toUpperCase()}
        </h2>
      </div>
    `;
    const docsHTML = docs.map((doc, i) =>
      buildDocumentHTML(doc, i === docs.length - 1)
    ).join('');

    return heading + docsHTML;
  }).join('');

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
      @import url('https://fonts.googleapis.com/css2?family=Aptos:wght@400;700&display=swap');
      body {
        font-family: 'Aptos', sans-serif;
        margin: 0;
        padding: 0;
        background-color: #FAF7F0;
        color: #333;
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
        color: #092534; 
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
        background-color: #FAF7F0;
        color: #05141C;
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
        font-size: 12px;
        margin-bottom: 5px;
      }
      .online-link a {
        color: #092534;
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
  <body>
    <div class="container">
      <!-- top-right "Ver online" link -->
      <div class="online-link">
        <a href="https://papyrus-ai.com/profile" target="_blank">Ver online</a>
      </div>
      <!-- Embedded logo -->
      <div class="logo-container">
        <img src="cid:papyrusLogo" alt="Papyrus Logo" style="max-width:200px; height:auto;" />
      </div>

      <p>Hola ${userName}, <strong>no hay novedades regulatorias</strong> de tus alertas normativas el día <strong>${dateString}</strong>.</p>

      <div style="text-align:center; margin:15px 0;">
        <a href="https://papyrus-ai.com" 
           style="
             display:inline-block;
             background-color:#83a300;
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

      <!-- [CAMBIO 1/2] => Si no hay docs boeGeneralDocs => "No se han publicado..." -->
      ${introText}

      ${detailBlocks}

      <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;">

      <!-- Bloque de 1-5 satisfecho (estrellas/cuadros) -->
      <div style="text-align:center; margin: 20px 0;">
        <p style="font-size:16px; color:#092534; font-weight:bold; margin-bottom:10px;">
          ¿Qué te ha parecido este resumen normativo?
        </p>
        <table align="center" style="border-spacing:10px;">
          <tr>
            <td style="background-color:#83a300; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=1"
                 style="color:#ffffff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                1
              </a>
            </td>
            <td style="background-color:#83a300; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=2"
                 style="color:#ffffff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                2
              </a>
            </td>
            <td style="background-color:#83a300; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=3"
                 style="color:#ffffff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                3
              </a>
            </td>
            <td style="background-color:#83a300; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=4"
                 style="color:#ffffff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                4
              </a>
            </td>
            <td style="background-color:#83a300; width:40px; height:40px; text-align:center; vertical-align:middle;">
              <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=5"
                 style="color:#ffffff; text-decoration:none; display:inline-block; line-height:40px; width:100%;">
                5
              </a>
            </td>
          </tr>
          <tr>
            <td style="text-align:center; font-size:12px; color:#092534;">
              Poco<br>satisfecho
            </td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td style="text-align:center; font-size:12px; color:#092534;">
              Muy<br>satisfecho
            </td>
          </tr>
        </table>
      </div>

      <p style="font-size:0.9em; color:#666; text-align:center;">
        &copy; ${moment().year()} Papyrus. Todos los derechos reservados.
      </p>

      <div style="text-align:center; margin-top: 20px;">
        <a href="https://papyrus-ai.com/suscripcion"
           target="_blank"
           style="color: #092534; text-decoration: underline; font-size: 12px;">
          Cancelar Suscripción
        </a>
      </div>

    </div>
  </body>
  </html>
  `;
}


// MAIN EXECUTION
/**
 * MAIN EXECUTION
 */
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

    const filteredUsers = allUsers.filter(u => u.email === '6inimartin6@gmail.com');

    for (const user of filteredUsers) {
      // 2) Obtenemos coverage_legal => array de colecciones (BOE, BOA, BOJA, CNMV, etc.)
      const coverageObj = user.cobertura_legal || {}; // ejemplo => {"Nacional y Europeo":["BOE"],"Autonomico":["BOA","BOJA"],"Reguladores":["CNMV"]}
      let coverageCollections = [];
      Object.values(coverageObj).forEach(arr => {
        if (Array.isArray(arr)) coverageCollections.push(...arr);
      });
      if (coverageCollections.length === 0) {
        coverageCollections = ["BOE"]; // fallback
      }

      // 3) Recogemos docs de HOY de las colecciones
      const queryToday = { anio: anioToday, mes: mesToday, dia: diaToday };
      const userMatchingDocs = [];
      for (const collName of coverageCollections) {
        // Si la coleccion no existe, skip / try-catch
        try {
          const coll = db.collection(collName);
          const docs = await coll.find(queryToday).toArray();
          docs.forEach(d => userMatchingDocs.push({ collectionName: collName, doc: d }));
        } catch (err) {
          console.warn(`No existe la colección ${collName} o error =>`, err);
        }
      }

      // 4) Build cnae & subRama matching
      const cnaeGroups = {};
      const ramaGroups = {};

      userMatchingDocs.forEach(({ collectionName, doc }) => {
        // cnae intersection
        let cnaes = doc.divisiones_cnae || [];
        if (!Array.isArray(cnaes)) cnaes = [cnaes];
        const matchedCnaes = cnaes.filter(c => user.industry_tags?.includes(c));

        // sub-rama intersection
        let matchedSubs = [];
        if (doc.ramas_juridicas && user.sub_rama_map) {
          for (const [ramaName, docSubsArr] of Object.entries(doc.ramas_juridicas)) {
            const userSubs = user.sub_rama_map[ramaName] || [];
            const intersection = (docSubsArr || []).filter(x => userSubs.includes(x));
            if (intersection.length > 0) {
              matchedSubs.push(...intersection);
              // push doc => ramaGroups[ramaName]
              if (!ramaGroups[ramaName]) ramaGroups[ramaName] = [];
              ramaGroups[ramaName].push({
                ...doc,
                collectionName,
                sub_rama_juridica: intersection,
                divisiones_cnae: matchedCnaes
              });
            }
          }
        }

        if (matchedCnaes.length > 0) {
          matchedCnaes.forEach(cv => {
            if (!cnaeGroups[cv]) cnaeGroups[cv] = [];
            cnaeGroups[cv].push({
              ...doc,
              collectionName,
              divisiones_cnae: matchedCnaes,
              sub_rama_juridica: [] // sub-rama handled above
            });
          });
        }
      });

      const cnaeArr = Object.keys(cnaeGroups).map(key => ({
        coincidentValue: key,
        docs: cnaeGroups[key],
        type: 'cnae'
      }));
      const ramaArr = Object.keys(ramaGroups).map(key => ({
        coincidentValue: key,
        docs: ramaGroups[key],
        type: 'subRama'
      }));

      const finalGroups = [...cnaeArr, ...ramaArr].sort((a,b)=> b.docs.length - a.docs.length);

      // 5) Build HTML
      let htmlBody = '';
      if (!finalGroups.length) {
        // No matches => fallback noMatches con boeDocs
        const boeDocs = userMatchingDocs
          .filter(x => (x.collectionName || '').toLowerCase() === 'boe')
          .map(x => x.doc);

        htmlBody = buildNewsletterHTMLNoMatches(
          user.name,
          user._id.toString(),
          moment().format('YYYY-MM-DD'),
          boeDocs
        );
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
            filename: 'papyrus_alertas.png',
            path: path.join(__dirname, 'assets', 'papyrus_alertas.png'),
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