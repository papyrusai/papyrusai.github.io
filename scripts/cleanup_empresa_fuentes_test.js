const { MongoClient } = require('mongodb');

(async function cleanup() {
  const uri = process.argv[2] || process.env.DB_URI;
  if (!uri) {
    console.error('Missing DB_URI');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('papyrus');
    const users = db.collection('users');

    // Estructura empresa
    const estructura = await users.findOne({ tipo_cuenta: 'estructura_empresa', empresa: 'reversa.ai' });
    if (estructura) {
      const cov = estructura.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] };
      const fg = Array.isArray(cov.fuentes_gobierno) ? cov.fuentes_gobierno : [];
      const clean = Array.from(new Set(fg.map(x => String(x).toUpperCase()).filter(x => !/_TEST$/i.test(x))));
      if (JSON.stringify(clean) !== JSON.stringify(fg.map(x => String(x).toUpperCase()))) {
        await users.updateOne(
          { _id: estructura._id },
          {
            $set: {
              cobertura_legal_old2: cov,
              'cobertura_legal.fuentes_gobierno': clean
            }
          }
        );
        console.log('Estructura cleaned:', { finalCount: clean.length });
      } else {
        console.log('Estructura already clean');
      }
    }

    // Usuarios empresa reversa.ai
    const cursor = users.find({ tipo_cuenta: 'empresa', empresa: 'reversa.ai' });
    let updated = 0;
    while (await cursor.hasNext()) {
      const u = await cursor.next();
      const cov = u.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] };
      const fg = Array.isArray(cov.fuentes_gobierno) ? cov.fuentes_gobierno : [];
      const clean = Array.from(new Set(fg.map(x => String(x).toUpperCase()).filter(x => !/_TEST$/i.test(x))));
      if (JSON.stringify(clean) !== JSON.stringify(fg.map(x => String(x).toUpperCase()))) {
        await users.updateOne(
          { _id: u._id },
          {
            $set: {
              cobertura_legal_old2: cov,
              'cobertura_legal.fuentes_gobierno': clean
            }
          }
        );
        updated++;
      }
    }
    console.log('Empresa users cleaned:', { updated });
  } catch (e) {
    console.error('Cleanup error:', e);
    process.exit(2);
  } finally {
    await client.close();
  }
})(); 