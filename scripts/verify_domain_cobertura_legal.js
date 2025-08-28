const { MongoClient } = require('mongodb');

(async function verify() {
  const uri = process.argv[2] || process.env.DB_URI;
  const targetDomain = process.argv[3] || '@webershandwick.com';
  if (!uri) {
    console.error('Missing DB_URI');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('papyrus');
    const users = db.collection('users');

    const all = await db.listCollections({}, { nameOnly: true }).toArray();
    const partCols = all.map(c => c.name).filter(n => /^PARTICIPACION/.test(n)).filter(n => !/_test$/i.test(n));
    const partUpper = Array.from(new Set(partCols.map(s => s.toUpperCase())));

    const domainRegex = new RegExp(targetDomain.replace('.', '\\.') + '$', 'i');
    const list = await users.find({ email: { $regex: domainRegex } }).toArray();

    let ok = true;
    const report = [];
    for (const u of list) {
      const cov = u.cobertura_legal || {};
      const backup = u.cobertura_legal_old;
      const fuentes = Array.isArray(cov.fuentes_gobierno) ? cov.fuentes_gobierno : [];
      const upper = Array.from(new Set(fuentes.map(x => String(x).toUpperCase())));
      const missing = partUpper.filter(x => !upper.includes(x));
      const hasTest = upper.some(x => /_TEST$/i.test(x));
      const rowOk = missing.length === 0 && !hasTest && Boolean(backup);
      ok = ok && rowOk;
      report.push({ email: u.email, ok: rowOk, missingCount: missing.length, hasTest, count: upper.length });
    }

    console.log(JSON.stringify({ domain: targetDomain, total: list.length, ok, reportSample: report.slice(0, 5) }, null, 2));
  } catch (e) {
    console.error('Verify domain error:', e);
    process.exit(2);
  } finally {
    await client.close();
  }
})(); 