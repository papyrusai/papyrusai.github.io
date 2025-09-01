/*
  Seed script: Populate the `info_fuentes` collection with all sources defined in
  `public/views/configuracion/fuentes.js` (fuentesData). It extracts the object
  literal from the file, normalizes items, infers geographic metadata, and upserts
  documents with indexes for efficient filtering.
*/

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { getDatabase, closeMongoConnection, collectionExists } = require('../services/db.utils');

const TARGET_COLLECTION = 'info_fuentes';

function readFileText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function extractObjectLiteral(text, variableName) {
  const anchor = `const ${variableName} =`;
  const startIdx = text.indexOf(anchor);
  if (startIdx === -1) {
    throw new Error(`Variable ${variableName} not found in source file`);
  }
  const braceStart = text.indexOf('{', startIdx);
  if (braceStart === -1) {
    throw new Error(`Opening { for ${variableName} not found`);
  }
  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) {
      const objectLiteral = text.slice(braceStart, i + 1);
      return objectLiteral;
    }
  }
  throw new Error(`Matching closing } for ${variableName} not found`);
}

function evaluateObjectLiteral(objectLiteral) {
  // Evaluate in a clean context; wrap in parentheses to get object value
  const script = new vm.Script(`(${objectLiteral})`);
  const context = vm.createContext({});
  return script.runInContext(context);
}

function flattenFuentesData(fuentesData) {
  const flattened = [];
  Object.keys(fuentesData).forEach((sectionTitle) => {
    const sectionContent = fuentesData[sectionTitle];
    if (Array.isArray(sectionContent)) {
      // Sections like Reguladores, Actividad Parlamentaria, etc.
      sectionContent.forEach((item) => {
        flattened.push({ ...item, tipo_fuente: sectionTitle });
      });
    } else if (sectionContent && typeof sectionContent === 'object') {
      // Section with subsections: Boletines Oficiales
      Object.keys(sectionContent).forEach((subsectionTitle) => {
        const arr = sectionContent[subsectionTitle] || [];
        arr.forEach((item) => {
          flattened.push({ ...item, tipo_fuente: sectionTitle, _subsection: subsectionTitle });
        });
      });
    }
  });
  return flattened;
}

// Mapping helpers
const ES_REGIONS_BY_SIGLA = {
  // Boletines regionales
  BOPV: 'País Vasco',
  CGCC: 'Cataluña',
  DOGC: 'Cataluña',
  DOG: 'Galicia',
  BOC: 'Cantabria',
  BORM: 'Región de Murcia',
  BOA: 'Aragón',
  BOCM: 'Comunidad de Madrid',
  DOE: 'Extremadura',
  BOCYL: 'Castilla y León',
  BOJA: 'Andalucía',
  BOIB: 'Islas Baleares',
  BOPA: 'Principado de Asturias',
  DOGV: 'Comunitat Valenciana',
  BOCA: 'Canarias',
  BOR: 'La Rioja',
  BON: 'Navarra',
  DOCM: 'Castilla-La Mancha',
  // Comunicados y prensa (regionales)
  COMUNIDAD_VALENCIANA_NOTICIAS: 'Comunitat Valenciana',
  COMUNIDAD_MADRID_NOTICIAS: 'Comunidad de Madrid',
  ASTURIAS_NOTICIAS: 'Principado de Asturias',
  CANARIAS_NOTICIAS: 'Canarias',
  EXTREMADURA_NOTICIAS: 'Extremadura',
  ANDALUCIA_NOTICIAS: 'Andalucía',
  // Organismos Gubernamentales (regionales)
  ASTURIAS_CONSEJO_GOBIERNO_NOTICIAS: 'Principado de Asturias',
  EXTREMADURA_CONSEJO_GOBIERNO: 'Extremadura',
  COMUNIDAD_VALENCIANA_ACTOS: 'Comunitat Valenciana',
  ANDALUCIA_ULTIMA_SESION_CONSEJO_GOBIERNO: 'Andalucía'
};

const EU_SIGLA_PREFIXES = [
  'EUROPARL_',
  'CONSILIUM_',
  'OEIL',
  'CEPC',
  'CE_ALL_NOTICIAS',
  'DANISH_PRESIDENCY_' // Presidency of the Council of the EU
];

const ES_NATIONAL_SIGLA_PREFIXES = [
  'SENADO_',
  'PARTICIPACION_',
  'MONCLOA_',
  'MIN_',
  'MITES_',
  'MITECO_',
  'MAPA_',
  'EXTERIORES_',
  'MICIU_',
  'MIN_CULTURA_',
  'MIN_DEFENSA_',
  'MIN_DCSA_',
  'MINECO_',
  'MIN_EDUCACIONFPYDEPORTES_',
  'MIN_HACIENDA_',
  'MIN_INDUSTRIAYTURISMO_',
  'MIN_INTERIOR_',
  'MIN_JUSTICIA_',
  'MIN_MPT_',
  'MIN_SANIDAD_',
  'MIN_DIGITAL_',
  'MIN_MIVAU_',
  'MIN_INCLUSION_',
  'MIN_JUVENTUDEINFANCIA_',
  'MIN_TRANSPORTES_',
  'CONGRESO_'
];

function startsWithAny(sigla, prefixes) {
  return prefixes.some((p) => sigla.startsWith(p));
}

function inferGeography({ sigla, nombre, tipo_fuente, _subsection }) {
  // Defaults
  let nivel_geografico = 'Pendiente';
  let pais = null;
  let region = null;

  // Explicit cases
  if (tipo_fuente === 'Boletines Oficiales') {
    if (sigla === 'DOUE') {
      nivel_geografico = 'Europeo';
    } else if (sigla === 'BOE') {
      nivel_geografico = 'Nacional';
      pais = 'España';
    } else if (sigla === 'BOPA_ANDORRA') {
      nivel_geografico = 'Nacional';
      pais = 'Andorra';
    } else if (ES_REGIONS_BY_SIGLA[sigla]) {
      nivel_geografico = 'Regional';
      pais = 'España';
      region = ES_REGIONS_BY_SIGLA[sigla];
    }
  }

  if (nivel_geografico === 'Pendiente') {
    // Reguladores
    if (tipo_fuente === 'Reguladores') {
      if (['EBA', 'EBA_QA', 'ESMA', 'ESMA_QA', 'EDPB'].includes(sigla)) {
        nivel_geografico = 'Europeo';
      } else if (['CNMV', 'CNMC', 'AEPD', 'AEPD_guias', 'SEPBLAC', 'INCIBE'].includes(sigla)) {
        nivel_geografico = 'Nacional';
        pais = 'España';
      } else if (sigla === 'NIST') {
        nivel_geografico = 'Nacional';
        pais = 'Estados Unidos';
      }
    }
  }

  if (nivel_geografico === 'Pendiente') {
    // Actividad Parlamentaria
    if (tipo_fuente === 'Actividad Parlamentaria') {
      if (startsWithAny(sigla, ['EUROPARL_', 'CONSILIUM_', 'OEIL', 'DANISH_PRESIDENCY_'])) {
        nivel_geografico = 'Europeo';
      } else if (sigla === 'BOCG' || sigla.startsWith('SENADO_') || sigla.startsWith('PARTICIPACION_')) {
        nivel_geografico = 'Nacional';
        pais = 'España';
      }
    }
  }

  if (nivel_geografico === 'Pendiente') {
    // Comunicados y prensa
    if (tipo_fuente === 'Comunicados y prensa') {
      if (startsWithAny(sigla, EU_SIGLA_PREFIXES)) {
        nivel_geografico = 'Europeo';
      } else if (sigla === 'NIST_NEWS') {
        nivel_geografico = 'Nacional';
        pais = 'Estados Unidos';
      } else if (sigla === 'EIOPA_news') {
        nivel_geografico = 'Europeo';
      } else if (sigla === 'CONSEJO_ESTADO_NOTICIAS') {
        nivel_geografico = 'Nacional';
        pais = 'España';
      } else if (ES_REGIONS_BY_SIGLA[sigla]) {
        nivel_geografico = 'Regional';
        pais = 'España';
        region = ES_REGIONS_BY_SIGLA[sigla];
      } else if (sigla === 'ANDORRA_NOTICIAS') {
        nivel_geografico = 'Nacional';
        pais = 'Andorra';
      }
    }
  }

  if (nivel_geografico === 'Pendiente') {
    // Organismos Gubernamentales
    if (tipo_fuente === 'Organismos Gubernamentales') {
      if (ES_REGIONS_BY_SIGLA[sigla]) {
        nivel_geografico = 'Regional';
        pais = 'España';
        region = ES_REGIONS_BY_SIGLA[sigla];
      } else if (startsWithAny(sigla, ES_NATIONAL_SIGLA_PREFIXES) || ['MONCLOA_NOTICIAS', 'MONCLOA_REFERENCIAS', 'MONCLOA_AGENDA'].includes(sigla)) {
        nivel_geografico = 'Nacional';
        pais = 'España';
      }
    }
  }

  // Final fallback: mark EU/National/International based on hints
  if (nivel_geografico === 'Pendiente') {
    if (sigla === 'DOUE' || nombre?.includes('European') || nombre?.includes('Europeo') || nombre?.includes('Comisión Europea') || nombre?.includes('Parlamento Europeo')) {
      nivel_geografico = 'Europeo';
    } else if (nombre?.includes('Andorra')) {
      nivel_geografico = 'Nacional';
      pais = 'Andorra';
    } else if (nombre?.includes('España') || nombre?.includes('Junta') || nombre?.includes('Ministerio') || nombre?.includes('Congreso') || nombre?.includes('Senado')) {
      // If it looks Spanish and not region-mapped, assume national Spain
      nivel_geografico = 'Nacional';
      pais = 'España';
    }
  }

  return { nivel_geografico, pais, region };
}

function normalizeFuentes(fuentes) {
  const dedupedBySigla = new Map();
  for (const f of fuentes) {
    const key = f.sigla;
    // Prefer the last occurrence to reflect latest naming if duplicates exist
    dedupedBySigla.set(key, f);
  }
  return Array.from(dedupedBySigla.values());
}

async function ensureCollectionAndIndexes(db) {
  const exists = await collectionExists(db, TARGET_COLLECTION);
  if (!exists) {
    // Create collection with Spanish collation to ease case-insensitive sorts if needed
    await db.createCollection(TARGET_COLLECTION, { collation: { locale: 'es', strength: 1 } });
  }
  const col = db.collection(TARGET_COLLECTION);
  // Unique index on sigla
  await col.createIndex({ sigla: 1 }, { unique: true, name: 'uniq_sigla' });
  // Filter-friendly index
  await col.createIndex({ nivel_geografico: 1, pais: 1, region: 1, tipo_fuente: 1 }, { name: 'geo_tipo_idx' });
}

async function upsertFuentes(db, fuentes) {
  const col = db.collection(TARGET_COLLECTION);
  const now = new Date();
  let upserts = 0;
  let updates = 0;
  let pendientes = [];

  for (const f of fuentes) {
    const { nivel_geografico, pais, region } = inferGeography(f);
    const estado_asignacion = nivel_geografico === 'Pendiente' ? 'Pendiente' : 'OK';
    if (estado_asignacion === 'Pendiente') pendientes.push(f.sigla);

    const doc = {
      sigla: f.sigla,
      nombre: f.nombre,
      tipo_fuente: f.tipo_fuente,
      nivel_geografico,
      pais: pais || null,
      region: region || null,
      estado_asignacion,
      metadata: {
        source_file: 'public/views/configuracion/fuentes.js',
        lastSyncedAt: now
      },
      updatedAt: now
    };

    const res = await col.updateOne(
      { sigla: f.sigla },
      {
        $set: doc,
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    );

    if (res.upsertedCount && res.upsertedId) upserts += 1;
    else if (res.matchedCount) updates += 1;
  }
  return { upserts, updates, pendientes };
}

async function main() {
  const sourcePath = path.join(__dirname, '..', 'public', 'views', 'configuracion', 'fuentes.js');
  const text = readFileText(sourcePath);
  const objectLiteral = extractObjectLiteral(text, 'fuentesData');
  const fuentesData = evaluateObjectLiteral(objectLiteral);
  const flattened = flattenFuentesData(fuentesData);
  const uniqueFuentes = normalizeFuentes(flattened);

  console.log(`Total fuentes (raw): ${flattened.length}`);
  console.log(`Total fuentes (unique by sigla): ${uniqueFuentes.length}`);

  const db = await getDatabase('papyrus');
  try {
    await ensureCollectionAndIndexes(db);
    const { upserts, updates, pendientes } = await upsertFuentes(db, uniqueFuentes);
    const totalInCollection = await db.collection(TARGET_COLLECTION).countDocuments();

    console.log('--- Seeding Report ---');
    console.log(`Inserted (new): ${upserts}`);
    console.log(`Updated (existing): ${updates}`);
    console.log(`Total in collection now: ${totalInCollection}`);
    if (pendientes.length > 0) {
      console.log(`Pendientes (${pendientes.length}): ${pendientes.join(', ')}`);
    } else {
      console.log('No hay fuentes con estado Pendiente.');
    }
  } finally {
    await closeMongoConnection();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
}); 