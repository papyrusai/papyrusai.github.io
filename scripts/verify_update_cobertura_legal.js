const { MongoClient } = require('mongodb');

(async function verify() {
  const uri = process.argv[2] || process.env.DB_URI;
  if (!uri) {
    console.error('Missing DB_URI argument or env var');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('papyrus');
    const users = db.collection('users');

    // Listar colecciones PARTICIPACION*
      const all = await db.listCollections({}, { nameOnly: true }).toArray();
  const partCols = all
    .map(c => c.name)
    .filter(n => /^PARTICIPACION/.test(n))
    .filter(n => !/_test$/i.test(n));
  const partUpper = Array.from(new Set(partCols.map(s => s.toUpperCase())));

    const doc = await users.findOne({ tipo_cuenta: 'estructura_empresa', empresa: 'reversa.ai' });
    if (!doc) {
      console.error('estructura_empresa reversa.ai not found');
      process.exit(2);
    }

    const cov = doc.cobertura_legal || {};
    const backup = doc.cobertura_legal_old2;
    const fuentes = Array.isArray(cov.fuentes_gobierno) ? cov.fuentes_gobierno : [];
    const fuentesUpper = Array.from(new Set(fuentes.map(s => String(s).toUpperCase())));

    const missing = partUpper.filter(x => !fuentesUpper.includes(x));

    const beforeCount = Array.isArray(backup?.fuentes_gobierno) ? backup.fuentes_gobierno.length : null;

    console.log(JSON.stringify({
      ok: missing.length === 0,
      empresa: doc.empresa,
      backups: {
        cobertura_legal_old2_exists: Boolean(backup),
        fuentes_gobierno_old2_count: beforeCount
      },
      fuentes_gobierno: {
        count: fuentesUpper.length,
        hasAllParticipacion: missing.length === 0,
        missingCount: missing.length,
        sampleFirst10: fuentesUpper.slice(0, 10)
      },
      participacionCollections: {
        count: partUpper.length,
        sampleFirst10: partUpper.slice(0, 10)
      }
    }, null, 2));
  } catch (e) {
    console.error('Verification error:', e);
    process.exit(3);
  } finally {
    await client.close();
  }
})(); 