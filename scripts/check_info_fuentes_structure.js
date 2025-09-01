const { MongoClient } = require('mongodb');

(async function run() {
  const uri = process.argv[2] || process.env.DB_URI;
  if (!uri) { 
    console.error('Missing DB_URI'); 
    process.exit(1); 
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('papyrus');
    const col = db.collection('info_fuentes');

    console.log('=== INFO_FUENTES COLLECTION STRUCTURE ===\n');
    
    // Get total count
    const total = await col.countDocuments();
    console.log(`Total documents: ${total}\n`);

    // Get a few sample documents
    console.log('Sample documents:');
    const samples = await col.find({}).limit(3).toArray();
    samples.forEach((doc, index) => {
      console.log(`\nDocument ${index + 1}:`);
      console.log(JSON.stringify(doc, null, 2));
    });

    // Get distinct values for key fields
    console.log('\n=== FIELD VALUES ANALYSIS ===');
    
    const tipoFuenteValues = await col.distinct('tipo_fuente');
    console.log(`\nDistinct tipo_fuente values (${tipoFuenteValues.length}):`);
    tipoFuenteValues.forEach(val => console.log(`- ${val}`));

    const nivelGeoValues = await col.distinct('nivel_geografico');
    console.log(`\nDistinct nivel_geografico values (${nivelGeoValues.length}):`);
    nivelGeoValues.forEach(val => console.log(`- ${val}`));

    const paisValues = await col.distinct('pais');
    console.log(`\nDistinct pais values (${paisValues.length}):`);
    paisValues.forEach(val => console.log(`- ${val}`));

    const regionValues = await col.distinct('region');
    console.log(`\nDistinct region values (${regionValues.length}):`);
    regionValues.filter(val => val !== null).forEach(val => console.log(`- ${val}`));

    // Check if any sources we want to add already exist
    console.log('\n=== CHECKING FOR EXISTING SOURCES ===');
    const sourcesToCheck = [
      'EDUCACION_CONVOCATORIAS_AL_CIERRE',
      'TRANSFORMACION_DIGITAL_PROPUESTAS_LEGISLATIVAS_EUROPEAS',
      'COMUNIDAD_MADRID_ACUERDOS_GOBIERNO',
      'COMUNIDAD_MADRID_AGENDA',
      'BOPA_ANDORRA'
    ];

    for (const sigla of sourcesToCheck) {
      const existing = await col.findOne({ sigla });
      if (existing) {
        console.log(`⚠️  ${sigla} already exists:`);
        console.log(JSON.stringify(existing, null, 2));
      } else {
        console.log(`✅ ${sigla} - ready to add`);
      }
    }

  } catch (e) {
    console.error('Error:', e);
    process.exit(2);
  } finally {
    await client.close();
  }
})(); 