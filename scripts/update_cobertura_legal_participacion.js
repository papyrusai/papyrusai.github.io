const { MongoClient } = require('mongodb');

(async function run() {
  const uri = process.argv[2] || process.env.DB_URI;
  if (!uri) {
    console.error('Missing DB_URI env var');
    process.exit(1);
  }

  const client = new MongoClient(uri, { useUnifiedTopology: true });
  try {
    await client.connect();
    const db = client.db('papyrus');
    const users = db.collection('users');

    // 1) Obtener todas las colecciones que empiezan por "PARTICIPACION"
    const allCollections = await db.listCollections({}, { nameOnly: true }).toArray();
    const participacionCollections = allCollections
      .map(c => c.name)
      .filter(name => /^PARTICIPACION/.test(name))
      .filter(name => !/_test$/i.test(name));

    if (participacionCollections.length === 0) {
      console.log('No PARTICIPACION* collections found, exiting.');
      return;
    }

    // 2) Localizar doc de estructura empresa reversa.ai
    const filter = { tipo_cuenta: 'estructura_empresa', empresa: 'reversa.ai' };
    const doc = await users.findOne(filter);
    if (!doc) {
      console.error('No estructura_empresa document found for empresa "reversa.ai"');
      process.exit(2);
    }

    const cobertura = doc.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] };

    // 3) Backup previo
    const backup = { ...cobertura };

    // Guardar dos backups por petición del usuario
    const updateBackup = {
      $set: {
        cobertura_legal_old: backup,
        cobertura_legal_old2: backup
      }
    };
    await users.updateOne({ _id: doc._id }, updateBackup);

    // 4) Fusionar colecciones PARTICIPACION* en fuentes_gobierno, sin duplicados y manteniendo existentes
    const currentFuentesGob = Array.isArray(cobertura.fuentes_gobierno) ? cobertura.fuentes_gobierno : [];

    // Normalizar a mayúsculas para evitar duplicados por casing
    const normalize = (arr) => Array.from(new Set((arr || []).map(x => String(x).toUpperCase())));

    const mergedUpper = normalize(currentFuentesGob)
      .filter(x => !/_TEST$/i.test(x))
      .concat(normalize(participacionCollections));
    const mergedUnique = Array.from(new Set(mergedUpper));

    // Mantener formato consistente (usar mayúsculas, acorde a ejemplo del usuario)
    const finalFuentesGobierno = mergedUnique;

    const result = await users.updateOne(
      { _id: doc._id },
      {
        $set: {
          'cobertura_legal.fuentes_gobierno': finalFuentesGobierno
        }
      }
    );

    console.log('Updated document:', {
      _id: String(doc._id),
      addedCount: participacionCollections.length,
      finalCount: finalFuentesGobierno.length
    });
  } catch (err) {
    console.error('Error running migration:', err);
    process.exit(3);
  } finally {
    await client.close();
  }
})(); 