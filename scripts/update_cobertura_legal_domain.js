const { MongoClient } = require('mongodb');

(async function run() {
  const uri = process.argv[2] || process.env.DB_URI;
  const targetDomain = process.argv[3] || '@webershandwick.com';
  if (!uri) {
    console.error('Missing DB_URI argument or env var');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('papyrus');
    const users = db.collection('users');

    // 1) Obtener colecciones PARTICIPACION* excluyendo *_test
    const all = await db.listCollections({}, { nameOnly: true }).toArray();
    const partCols = all
      .map(c => c.name)
      .filter(n => /^PARTICIPACION/.test(n))
      .filter(n => !/_test$/i.test(n));
    const partUpper = Array.from(new Set(partCols.map(s => s.toUpperCase())));

    if (partUpper.length === 0) {
      console.log('No PARTICIPACION (non-test) collections found. Exiting.');
      return;
    }

    // 2) Seleccionar usuarios por dominio de email
    const domainRegex = new RegExp(targetDomain.replace('.', '\\.' ) + '$', 'i');
    const cursor = users.find({ email: { $regex: domainRegex } });

    let total = 0;
    let updated = 0;

    while (await cursor.hasNext()) {
      const u = await cursor.next();
      total++;

      const cov = u.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] };
      const backup = JSON.parse(JSON.stringify(cov));

      const current = Array.isArray(cov.fuentes_gobierno) ? cov.fuentes_gobierno : [];
      const currentUpper = Array.from(new Set(current.map(x => String(x).toUpperCase())));
      const currentClean = currentUpper.filter(x => !/_TEST$/i.test(x));

      const merged = Array.from(new Set([...currentClean, ...partUpper]));

      // Si no hay cambios, saltar pero asegurar backup
      const changed = JSON.stringify(merged) !== JSON.stringify(currentUpper);

      await users.updateOne(
        { _id: u._id },
        {
          $set: {
            cobertura_legal_old: backup,
            'cobertura_legal.fuentes_gobierno': merged
          }
        }
      );

      if (changed) updated++;
    }

    console.log(JSON.stringify({ domain: targetDomain, totalUsers: total, updatedUsers: updated, addedSourcesCount: partUpper.length }, null, 2));
  } catch (e) {
    console.error('Domain update error:', e);
    process.exit(2);
  } finally {
    await client.close();
  }
})(); 