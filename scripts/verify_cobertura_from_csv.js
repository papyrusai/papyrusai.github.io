const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

(async function verify() {
  const uri = process.argv[2] || process.env.DB_URI;
  const csvPath = process.argv[3] || path.join(__dirname, '..', 'Otros', 'Docs', 'Drafts', 'fuentes_colecciones_mapping.csv');
  if (!uri) { console.error('Missing DB_URI'); process.exit(1); }
  if (!fs.existsSync(csvPath)) { console.error('CSV not found at', csvPath); process.exit(1); }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length);
  lines.shift();
  const colls = new Set();
  for (const line of lines) {
    const parts = []; let current = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { parts.push(current); current = ''; } else { current += ch; }
    }
    parts.push(current);
    const col = (parts[3] || '').trim();
    if (!col || /^no encotnrado$/i.test(col)) continue;
    col.split('/').map(s => s.trim()).forEach(c => { if (c) colls.add(c); });
  }
  const expected = Array.from(colls);

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('papyrus');
    const users = db.collection('users');

    const domainRegex = /@webershandwick\.com$/i;
    const list = await users.find({ email: { $regex: domainRegex } }).toArray();

    const report = list.map(u => {
      const cov = u.cobertura_legal || {};
      const backup = u.cobertura_legal_old;
      const fg = Array.isArray(cov.fuentes_gobierno) ? cov.fuentes_gobierno : [];
      const missing = expected.filter(x => !fg.includes(x));
      return { email: u.email, ok: missing.length === 0, missingCount: missing.length, backup: !!backup, count: fg.length };
    });

    console.log(JSON.stringify({ total: list.length, expectedCount: expected.length, sample: report }, null, 2));
  } catch (e) {
    console.error('Verify error:', e);
    process.exit(2);
  } finally {
    await client.close();
  }
})(); 