const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

(async function run() {
  const uri = process.argv[2] || process.env.DB_URI;
  const csvPath = process.argv[3] || path.join(__dirname, '..', 'Otros', 'Docs', 'Drafts', 'fuentes_colecciones_mapping.csv');
  if (!uri) { console.error('Missing DB_URI'); process.exit(1); }
  if (!fs.existsSync(csvPath)) { console.error('CSV not found at', csvPath); process.exit(1); }

  // 1) Parse CSV and collect valid collections (exclude "no encotnrado")
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length);
  const header = lines.shift();
  const collections = new Set();
  for (const line of lines) {
    // CSV columns: Fuente,Descripcion,URL,ColeccionMongoDB
    const parts = []; let current = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { parts.push(current); current = ''; } else { current += ch; }
    }
    parts.push(current);
    const col = (parts[3] || '').trim();
    if (!col || /^no encotnrado$/i.test(col)) continue;
    // If multiple options separated by '/', include each
    col.split('/').map(s => s.trim()).forEach(c => { if (c) collections.add(c); });
  }
  const fuentesGobierno = Array.from(collections);

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('papyrus');
    const users = db.collection('users');

    const domainRegex = /@webershandwick\.com$/i;
    const cursor = users.find({ email: { $regex: domainRegex } });

    let total = 0, updated = 0;
    while (await cursor.hasNext()) {
      const u = await cursor.next();
      total++;
      const currentCov = u.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] };

      // Backup existing
      await users.updateOne({ _id: u._id }, { $set: { cobertura_legal_old: currentCov } });

      // Set new cobertura_legal strictly to the matched fuentes (fuentes_gobierno). No change to reguladores.
      const newCov = { fuentes_gobierno: fuentesGobierno, fuentes_reguladores: currentCov.fuentes_reguladores || [] };
      const res = await users.updateOne({ _id: u._id }, { $set: { cobertura_legal: newCov } });
      if (res.modifiedCount > 0) updated++;
    }

    console.log(JSON.stringify({ totalUsers: total, updatedUsers: updated, fuentesCount: fuentesGobierno.length }, null, 2));
  } catch (e) {
    console.error('Update error:', e);
    process.exit(2);
  } finally {
    await client.close();
  }
})(); 