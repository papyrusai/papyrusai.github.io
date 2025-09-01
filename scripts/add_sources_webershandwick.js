const { MongoClient } = require('mongodb');

(async function run() {
  const uri = process.argv[2] || process.env.DB_URI;
  if (!uri) { console.error('Missing DB_URI'); process.exit(1); }

  const toAdd = [
    'PARTICIPACION_TRANSFORMACION_DIGITAL_AUDIENCIAS',
    'PARTICIPACION_CIENCIA_AUDIENCIAS',
    'PARTICIPACION_EDUCACION_AUDIENCIAS'
  ];

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('papyrus');
    const users = db.collection('users');

    const cursor = users.find({ email: { $regex: /@webershandwick\.com$/i } });
    let total = 0, updated = 0;

    while (await cursor.hasNext()) {
      const u = await cursor.next();
      total++;
      const currentCov = u.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] };

      // Backup
      await users.updateOne({ _id: u._id }, { $set: { cobertura_legal_old: currentCov } });

      const current = Array.isArray(currentCov.fuentes_gobierno) ? currentCov.fuentes_gobierno : [];
      const merged = Array.from(new Set([...current, ...toAdd]));

      const res = await users.updateOne(
        { _id: u._id },
        { $set: { 'cobertura_legal.fuentes_gobierno': merged } }
      );
      if (res.modifiedCount > 0) updated++;
    }

    console.log(JSON.stringify({ totalUsers: total, updatedUsers: updated, added: toAdd }, null, 2));
  } catch (e) {
    console.error('Add sources error:', e);
    process.exit(2);
  } finally {
    await client.close();
  }
})(); 