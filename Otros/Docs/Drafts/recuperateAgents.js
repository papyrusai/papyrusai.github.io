require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');

/**
 * Recupera nombres de etiquetas_personalizadas que han hecho match
 * para un usuario individual en colecciones BOE y DOUE entre julio-agosto 2025,
 * los imprime por consola y los reinstala en el usuario con backup.
 */

const CONFIG = {
  userId: '6805034851cc777ddb5a76a1',
  userEmail: 'tomas@reversa.ai',
  collections: ['BOE', 'DOUE'],
  rangoFechas: { desde: new Date(2025, 6, 1), hasta: new Date(2025, 7, 31) }, // julio(6) a agosto(7) 2025
  limitPerCollection: 2000
};

function buildDateFilter(desde, hasta) {
  const filters = [];
  if (desde) {
    filters.push({
      $or: [
        { anio: { $gt: desde.getFullYear() } },
        { anio: desde.getFullYear(), mes: { $gt: desde.getMonth() + 1 } },
        { anio: desde.getFullYear(), mes: desde.getMonth() + 1, dia: { $gte: desde.getDate() } }
      ]
    });
  }
  if (hasta) {
    filters.push({
      $or: [
        { anio: { $lt: hasta.getFullYear() } },
        { anio: hasta.getFullYear(), mes: { $lt: hasta.getMonth() + 1 } },
        { anio: hasta.getFullYear(), mes: hasta.getMonth() + 1, dia: { $lte: hasta.getDate() } }
      ]
    });
  }
  return filters;
}

async function main() {
  const client = new MongoClient(process.env.DB_URI, {});
  try {
    const { userId, userEmail, collections, rangoFechas, limitPerCollection } = CONFIG;
    const targetUserId = new ObjectId(userId).toString();

    await client.connect();
    const db = client.db('papyrus');

    const dateFilter = buildDateFilter(rangoFechas.desde, rangoFechas.hasta);
    const baseMatch = { $and: [...dateFilter] };

    const etiquetasSet = new Set();

    for (const name of collections) {
      const coll = db.collection(name);
      const projection = { etiquetas_personalizadas: 1, anio: 1, mes: 1, dia: 1, _id: 1 };
      // Quitar sort para reducir uso de memoria; no necesitamos orden para extraer etiquetas
      const cursor = coll.find(baseMatch).project(projection).limit(limitPerCollection);
      const docs = await cursor.toArray();

      for (const doc of docs) {
        const ep = doc.etiquetas_personalizadas;
        if (!ep) continue;
        const forUser = ep[targetUserId];
        if (!forUser) continue;
        if (Array.isArray(forUser)) {
          forUser.forEach(e => { if (typeof e === 'string') etiquetasSet.add(e); });
        } else if (typeof forUser === 'object') {
          Object.keys(forUser).forEach(k => etiquetasSet.add(k));
        }
      }
    }

    const etiquetas = Array.from(etiquetasSet).sort((a, b) => a.localeCompare(b));
    console.log('Etiquetas con match para el usuario', targetUserId, 'en julio-agosto 2025:');
    etiquetas.forEach(e => console.log(e));

    // Reinstalar en el usuario con backup
    const users = db.collection('users');
    const userDoc = await users.findOne({ email: userEmail });
    if (!userDoc) {
      console.warn(`Usuario ${userEmail} no encontrado; no se reinstalan etiquetas.`);
      return;
    }

    const etiquetasObj = etiquetas.reduce((acc, k) => { acc[k] = ''; return acc; }, {});
    const now = new Date();
    const update = {
      $set: {
        etiquetas_personalizadas_old: userDoc.etiquetas_personalizadas || {},
        etiquetas_personalizadas: etiquetasObj,
        updated_at: now
      }
    };

    await users.updateOne({ _id: userDoc._id }, update);
    console.log(`✅ Reinstaladas ${etiquetas.length} etiquetas en ${userEmail} con backup en etiquetas_personalizadas_old.`);
  } catch (err) {
    console.error('❌ Error en recuperación de etiquetas:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

// Run only if executed directly
if (require.main === module) {
  main();
}

module.exports = { main };
