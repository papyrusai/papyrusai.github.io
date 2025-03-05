/************************************************
 * newsletter.js
 *
 * To run:
 *    node newsletter.js
 * Variables: solo enviamos BOE
 * * Produccion: ELIMINAR EN produccion --> cambiar filteredUsers to allUsers
 ************************************************/
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const moment = require('moment');
const path = require('path');

require('dotenv').config();

// 1) Some configuration
const MONGODB_URI = process.env.DB_URI;
const DB_NAME = 'papyrus';

// Example: Hard-coded date for testing => 2025-01-24

/*const TODAY = moment().utc();
const anioToday = 2025;
const mesToday  = 1;
const diaToday  = 24;
*/

// If you want the real "today," comment out the lines above and do:
const TODAY = moment().utc();
const anioToday = TODAY.year();
const mesToday  = TODAY.month() + 1;
const diaToday  = TODAY.date();


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
 * Convert a collection name (BOE, BOA, BOPV, BOCM, BOJA)
 * into its descriptive text for display.
 */
function mapCollectionNameToDisplay(cName) {
  const upper = (cName || '').toUpperCase();
  switch (upper) {
    case 'BOE':
      return 'Boletín Oficial del Estado';
    case 'BOCM':
      return 'Boletín Oficial de la Comunidad de Madrid';
    case 'BOA':
      return 'Boletín Oficial de Aragón';
    case 'BOJA':
      return 'Boletín Oficial de la Junta de Andalucía';
    case 'BOPV':
      return 'Boletín Oficial del País Vasco';
    default:
      return upper; // fallback if none match
  }
}

/**
 * Build the HTML snippet for each doc, optionally without an <hr> if it's the last doc.
 * doc.divisiones_cnae and doc.sub_rama_juridica are now pre-filtered to only matches.
 */
function buildDocumentHTML(doc, isLastDoc) {
  // Ensure arrays
  let cnaes = doc.divisiones_cnae || [];
  if (!Array.isArray(cnaes)) cnaes = [cnaes];

  let subRamas = doc.sub_rama_juridica || [];
  if (!Array.isArray(subRamas)) subRamas = [subRamas];

  // Build CNAE HTML
  let cnaeHTML = '';
  if (cnaes.length > 0) {
    cnaeHTML = cnaes
      .map(div => `<span class="etiqueta">${div}</span>`)
      .join('');
  }

  // Build sub-rama HTML
  let subRamaHTML = '';
  if (subRamas.length > 0) {
    subRamaHTML = subRamas
      .map(sr => 
        `<span style="padding:5px 0; color:#83a300; margin-left:10px;">
          <i><b>#${sr}</b></i>
        </span>`
      )
      .join(' ');
  }

  // Possibly insert HR
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
 * Build the "normal" newsletter (some matches for the user).
 */
function buildNewsletterHTML(userName,userId,  dateString, groupedData) {
  // Split out cnae-based vs sub-rama-based
  const cnaeGroups = groupedData.filter(g => g.type === 'cnae');
  const subRamaGroups = groupedData.filter(g => g.type === 'subRama');

  // Summaries for each group
  const cnaeSummaryHTML = cnaeGroups.map(group => {
    const docCount = group.docs.length;
    return `<li>${docCount} Alertas de <span style="color:#89A231;">${group.coincidentValue}</span></li>`;
  }).join('');

  const subRamaSummaryHTML = subRamaGroups.map(group => {
    const docCount = group.docs.length;
    return `<li>${docCount} Alertas de <span style="color:#89A231;">${group.coincidentValue}</span></li>`;
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

  // Build detail blocks from groupedData
  const detailBlocks = groupedData.map(group => {
    // A visual separator for the group
    const separatorBlock = `
      <div style="background-color:#89A231;  
                  margin:5% 0; 
                  padding:5px 20px; 
                  border-radius:20px;">
        <h2 style="margin:0; color:#FAF7F0; font-size:14px;">
          ${group.coincidentValue.toUpperCase()}
        </h2>
      </div>
    `;

    // Group docs by collection
    const byCollection = {};
    group.docs.forEach(doc => {
      const cName = 'BOE';  // Hard-coded for "solo enviamos BOE"
      if (!byCollection[cName]) byCollection[cName] = [];
      byCollection[cName].push(doc);
    });

    // Typically we'd do "BOE first" sorting, but we only have BOE
    let collArr = Object.keys(byCollection).map(key => ({
      collectionName: key,
      docs: byCollection[key],
    }));
    // Not strictly necessary, but let's keep code consistent
    const boeIndex = collArr.findIndex(c => c.collectionName.toUpperCase() === 'BOE');
    let boeItem = null;
    if (boeIndex >= 0) {
      boeItem = collArr.splice(boeIndex, 1)[0];
    }
    collArr.sort((a, b) => a.docs.length - b.docs.length);
    if (boeItem) {
      collArr.unshift(boeItem);
    }

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

  // Return the final HTML
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
      /* "Ver online" link top-right */
      .online-link {
        text-align: right;
        font-size: 12px;
        margin-bottom: 5px;
      }
      .online-link a {
        color: #092534;
        text-decoration: underline;
      }
      /* Logo styling */
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

     <div style="text-align:center; margin: 20px 0;">
      <p>¿Qué te ha parecido el resumen normativo?</p>
   <!-- Fila de “estrellas” (1–5) con color #83a300 -->
  <p style="font-size:24px; margin:0;">
    <!-- 1 estrella -->
    <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=1"
       style="color:#83a300; text-decoration:none; margin-right:4px; font-family:sans-serif;">
       ★☆☆☆☆
    </a>
    <!-- 2 estrellas -->
    <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=2"
       style="color:#83a300; text-decoration:none; margin-right:4px; font-family:sans-serif;">
       ★★☆☆☆
    </a>
    <!-- 3 estrellas -->
    <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=3"
       style="color:#83a300; text-decoration:none; margin-right:4px; font-family:sans-serif;">
       ★★★☆☆
    </a>
    <!-- 4 estrellas -->
    <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=4"
       style="color:#83a300; text-decoration:none; margin-right:4px; font-family:sans-serif;">
       ★★★★☆
    </a>
    <!-- 5 estrellas -->
    <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=5"
       style="color:#83a300; text-decoration:none; margin-right:4px; font-family:sans-serif;">
       ★★★★★
    </a>
  </p>
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
function buildNewsletterHTMLNoMatches(userName, userId, dateString, boeDocs) {
  const cnaeMap = {};

  boeDocs.forEach(doc => {
    let cnaes = doc.divisiones_cnae || [];
    if (!Array.isArray(cnaes)) cnaes = [cnaes];

    // Normalize sub‐ramas for display
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
      const placeholder = 'Genérico';
      if (!cnaeMap[placeholder]) cnaeMap[placeholder] = [];
      cnaeMap[placeholder].push(doc);
    }
  });

  // reorder "Genérico" last
  const cnaeKeys = Object.keys(cnaeMap);
  const genIndex = cnaeKeys.findIndex(k => k.toLowerCase().trim() === 'genérico');
  if (genIndex >= 0) {
    const [generic] = cnaeKeys.splice(genIndex, 1);
    cnaeKeys.push(generic);
  }

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
      <p>A continuación, te compartimos un resumen inteligente de las disposiciones generales del BOE de hoy</p>

      ${detailBlocks}

      <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;">
     <div style="text-align:center; margin: 20px 0;">
 <p>Valora el resumen normativo</p>
<!-- Fila de “estrellas” (1–5) con color #83a300 -->
   <p>¿Qué te ha parecido el resumen normativo?</p>
   <!-- Fila de “estrellas” (1–5) con color #83a300 -->
  <p style="font-size:24px; margin:0;">
    <!-- 1 estrella -->
    <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=1"
       style="color:#83a300; text-decoration:none; margin-right:4px; font-family:sans-serif;">
       ★☆☆☆☆
    </a>
    <!-- 2 estrellas -->
    <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=2"
       style="color:#83a300; text-decoration:none; margin-right:4px; font-family:sans-serif;">
       ★★☆☆☆
    </a>
    <!-- 3 estrellas -->
    <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=3"
       style="color:#83a300; text-decoration:none; margin-right:4px; font-family:sans-serif;">
       ★★★☆☆
    </a>
    <!-- 4 estrellas -->
    <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=4"
       style="color:#83a300; text-decoration:none; margin-right:4px; font-family:sans-serif;">
       ★★★★☆
    </a>
    <!-- 5 estrellas -->
    <a href="https://app.papyrus-ai.com/feedback?userId=${userId}&grade=5"
       style="color:#83a300; text-decoration:none; margin-right:4px; font-family:sans-serif;">
       ★★★★★
    </a>
  </p>
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
(async () => {
  let client;
  try {
    client = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(DB_NAME);

    // Only BOE collection
    const docCollections = ['BOE'];

    // Query for today's docs
    const queryToday = {
      anio: anioToday,
      mes: mesToday,
      dia: diaToday,
    };
    const allMatchingDocs = [];

    // Get docs from only BOE
    for (const collName of docCollections) {
      const coll = db.collection(collName);
      const docs = await coll.find(queryToday).toArray();
      docs.forEach(doc => {
        allMatchingDocs.push({ collectionName: collName, doc });
      });
    }

    // Retrieve users
    const usersCollection = db.collection('users');
    const allUsers = await usersCollection.find({}).toArray();

    // ***** AÑADE ESTE FILTRO: solo "6inimartin6@gmail.com" *****
const filteredUsers = allUsers; //allUsers.filter(u => u.email === '6inimartin6@gmail.com');

    // For each user, build "cnae" + "subRama" groups
    for (const user of  filteredUsers){ //ELIMINAR EN PRODUCCION
      // We'll keep separate grouping structures, then combine them
      const cnaeGroups = {};
      const ramaGroups = {};

      // For each doc => see if it has matching cnaes & sub-ramas
      allMatchingDocs.forEach(({ collectionName, doc }) => {
        // 1) Find matched cnaes
        const docCnaes = Array.isArray(doc.divisiones_cnae)
          ? doc.divisiones_cnae
          : doc.divisiones_cnae
          ? [doc.divisiones_cnae]
          : [];
        // Intersection with user.industry_tags
        const matchedCnaes = docCnaes.filter(c =>
          user.industry_tags?.includes(c)
        );

        // 2) Build sub-rama matches
        // doc.ramas_juridicas => { "Derecho Fiscal": ["IVA", "IS", ...], ... }
        let matchedSubs = []; // store all matched sub-ramas across all "ramas"
        if (doc.ramas_juridicas && user.sub_rama_map) {
          for (const [ramaName, docSubArr] of Object.entries(doc.ramas_juridicas)) {
            // intersection with user.sub_rama_map[ramaName]
            const userSubs = user.sub_rama_map[ramaName] || [];
            const intersection = (docSubArr || []).filter(sr => userSubs.includes(sr));
            if (intersection.length > 0) {
              // We'll push them into matchedSubs
              matchedSubs.push(...intersection);
              // Also group the doc in ramaGroups[ramaName], but doc should only have "sub_rama_juridica" set to intersection
              if (!ramaGroups[ramaName]) ramaGroups[ramaName] = [];
              ramaGroups[ramaName].push({
                ...doc,
                collectionName,
                // Overwrite doc.sub_rama_juridica with just the matched sub-ramas
                sub_rama_juridica: intersection,
                // We'll restore doc.divisiones_cnae with only the matched ones for display
                divisiones_cnae: matchedCnaes
              });
            }
          }
        }

        // Overwrite doc with only matched cnaes if any
        if (matchedCnaes.length > 0) {
          matchedCnaes.forEach(cName => {
            if (!cnaeGroups[cName]) cnaeGroups[cName] = [];
            cnaeGroups[cName].push({
              ...doc,
              collectionName,
              // Overwrite doc.divisiones_cnae with the matchedCnaes
              divisiones_cnae: matchedCnaes,
              // Overwrite doc.sub_rama_juridica with nothing or the real matchedSubs?
              // Actually we do not want to break sub-rama logic here, so let's do blank and
              // sub-rama is handled in the ramaGroups logic
              sub_rama_juridica: []
            });
          });
        }
      });

      // Now transform cnaeGroups => array
      const cnaeArr = Object.keys(cnaeGroups).map(cnae => ({
        coincidentValue: cnae,
        docs: cnaeGroups[cnae],
        type: 'cnae'
      }));
      // Transform ramaGroups => array
      const ramaArr = Object.keys(ramaGroups).map(rama => ({
        coincidentValue: rama,
        docs: ramaGroups[rama],
        type: 'subRama'
      }));

      // Combine them
      const finalGroups = [...cnaeArr, ...ramaArr];
      // Sort descending by doc count
      finalGroups.sort((a, b) => b.docs.length - a.docs.length);

      // If no matches => noMatches template
      let htmlBody = '';
      if (finalGroups.length === 0) {
        const boeDocs = allMatchingDocs
          .filter(item => item.collectionName.toLowerCase() === 'boe')
          .map(item => {
            // For no-matches, we just display doc with all cnaes and sub-ramas
            // but let's unify sub-ramas for buildDocumentHTML
            let subRamas = [];
            if (item.doc.ramas_juridicas && typeof item.doc.ramas_juridicas === 'object') {
              for (const arr of Object.values(item.doc.ramas_juridicas)) {
                if (Array.isArray(arr)) subRamas.push(...arr);
              }
            }
            item.doc.sub_rama_juridica = subRamas;
            return item.doc;
          });
        htmlBody = buildNewsletterHTMLNoMatches(user.name,  user._id.toString(),moment().format('YYYY-MM-DD'), boeDocs);
      } else {
        htmlBody = buildNewsletterHTML(user.name,  user._id.toString(),moment().format('YYYY-MM-DD'), finalGroups);
      }

      // Log email size
      const emailSizeBytes = Buffer.byteLength(htmlBody, 'utf8');
      const emailSizeKB = (emailSizeBytes / 1024).toFixed(2);
      console.log(`Email size for ${user.email}: ${emailSizeBytes} bytes (${emailSizeKB} KB)`);

      // Send
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
      } catch (err) {
        console.error(`Error sending email to ${user.email}:`, err);
      }
    }

    console.log('All done. Closing DB.');
    await client.close();
  } catch (error) {
    console.error('Error =>', error);
    if (client) {
      await client.close();
    }
  }
})();
