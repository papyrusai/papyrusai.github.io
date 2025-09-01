const { MongoClient } = require('mongodb');
require('dotenv').config();

const DB_URI = process.env.DB_URI;
const DB_NAME = 'papyrus';

// Fecha de inicio: dd/mm/yyyy -> 11/08/2025 (11 de agosto de 2025)
const START_DATE_ISO = new Date('2025-08-11T00:00:00.000Z');

const REGION_TO_COLLECTION_CANDIDATES = {
  'Galicia': ['DOG', 'DOG_GALICIA', 'GALICIA_DOG'],
  'Castilla y León': ['BOCYL', 'BOCYL_test'],
  'País Vasco': ['BOPV'],
  'Canarias': ['BOC'],
  'Islas Baleares': ['BOIB', 'BOIB_test'],
  'Cataluña': ['DOGC', 'DOGC_test']
};

// Ampliamos campos candidatos con los usados en tus ejemplos
const CANDIDATE_DATE_FIELDS = [
  'fecha_disposicion',
  'fecha_publicacion',
  'publication_date',
  'publishedAt',
  'published_at',
  'pubDate',
  'pub_date',
  'fecha',
  'date',
  'fechaPublicacion',
  'fecha_publicado',
  'datetime_insert',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at'
];

async function listCollectionNames(db) {
  const cols = await db.listCollections({}, { nameOnly: true }).toArray();
  return new Set(cols.map(c => c.name));
}

async function findExistingCollectionName(db, candidates) {
  const existing = await listCollectionNames(db);
  for (const name of candidates) {
    if (existing.has(name)) return name;
  }
  return null;
}

// Construye expresiones de conversión seguras para cada campo candidato
function buildSafeDateExprForField(field) {
  return {
    $cond: [
      { $eq: [{ $type: `$${field}` }, 'date'] },
      `$${field}`,
      { $convert: { input: `$${field}`, to: 'date', onError: null, onNull: null } }
    ]
  };
}

function buildCoalescedDateExpr() {
  const candidatesExpr = CANDIDATE_DATE_FIELDS.map(buildSafeDateExprForField);
  return {
    $let: {
      vars: {
        arr: {
          $filter: {
            input: candidatesExpr,
            as: 'd',
            cond: { $ne: ['$$d', null] }
          }
        }
      },
      in: {
        $arrayElemAt: ['$$arr', 0]
      }
    }
  };
}

async function countSince(db, collectionName, startDate) {
  const col = db.collection(collectionName);

  const pipeline = [
    { $addFields: { __date: buildCoalescedDateExpr() } },
    { $match: { __date: { $gte: startDate } } },
    { $count: 'count' }
  ];

  const agg = await col.aggregate(pipeline).toArray();
  const count = agg.length ? agg[0].count : 0;
  return { count, field: 'multiple', note: null };
}

async function main() {
  if (!DB_URI) {
    console.error('❌ Falta la variable de entorno DB_URI');
    process.exit(1);
  }

  const client = new MongoClient(DB_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    console.log(`📅 Contando documentos publicados desde: ${START_DATE_ISO.toISOString()}`);

    const results = [];
    for (const [region, candidates] of Object.entries(REGION_TO_COLLECTION_CANDIDATES)) {
      const collectionName = await findExistingCollectionName(db, candidates);
      if (!collectionName) {
        results.push({ region, collection: candidates[0], exists: false, count: 0, field: null, note: 'Colección no encontrada' });
        continue;
      }

      const { count, field, note } = await countSince(db, collectionName, START_DATE_ISO);
      results.push({ region, collection: collectionName, exists: true, count, field, note });
    }

    console.log('\n📊 Resultados por colección:');
    console.log('='.repeat(60));
    for (const r of results) {
      if (!r.exists) {
        console.log(`- ${r.region}: ${r.collection} -> ❌ no encontrada`);
        continue;
      }
      console.log(`- ${r.region}: ${r.collection} -> ${r.count}`);
    }

    console.log('\n✅ Resumen:');
    for (const r of results) {
      console.log(`${r.region}: ${r.exists ? r.collection : '(no encontrada)'} => ${r.count}`);
    }

  } catch (err) {
    console.error('❌ Error:', err?.message || err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main(); 