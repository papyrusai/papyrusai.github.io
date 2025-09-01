const { MongoClient } = require('mongodb');

(async function run() {
  const uri = process.argv[2] || process.env.DB_URI;
  if (!uri) { 
    console.error('Missing DB_URI'); 
    process.exit(1); 
  }

  // New sources to add to cobertura_legal.fuentes_gobierno
  const toAdd = [
    'EDUCACION_CONVOCATORIAS_AL_CIERRE',
    'TRANSFORMACION_DIGITAL_PROPUESTAS_LEGISLATIVAS_EUROPEAS',
    'COMUNIDAD_MADRID_ACUERDOS_GOBIERNO',
    'COMUNIDAD_MADRID_AGENDA',
    'BOPA_ANDORRA'
  ];

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('papyrus');
    const users = db.collection('users');

    // Find @webershandwick.com users but exclude copies (email_copy field exists)
    const filter = {
      email: { $regex: /@webershandwick\.com$/i },
      email_copy: { $exists: false }  // Exclude users with email_copy field
    };

    console.log('Counting users with @webershandwick.com domain (excluding copies)...');
    const totalUsers = await users.countDocuments(filter);
    console.log(`Found ${totalUsers} webershandwick users to update`);

    // Count current sources before update
    const cursor = users.find(filter);
    let beforeCount = 0;
    let usersWithSources = 0;
    const beforeStats = [];

    while (await cursor.hasNext()) {
      const u = await cursor.next();
      const currentCov = u.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] };
      const currentSources = Array.isArray(currentCov.fuentes_gobierno) ? currentCov.fuentes_gobierno : [];
      
      beforeCount += currentSources.length;
      if (currentSources.length > 0) usersWithSources++;
      
      beforeStats.push({
        email: u.email,
        currentSourcesCount: currentSources.length,
        sources: currentSources
      });
    }

    console.log(`\nBEFORE UPDATE STATS:`);
    console.log(`- Total users: ${totalUsers}`);
    console.log(`- Users with existing sources: ${usersWithSources}`);
    console.log(`- Total sources across all users: ${beforeCount}`);

    // Now perform the update
    console.log('\nStarting update process...');
    const updateCursor = users.find(filter);
    let updated = 0;
    let totalSourcesAfter = 0;
    const afterStats = [];

    while (await updateCursor.hasNext()) {
      const u = await updateCursor.next();
      const currentCov = u.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] };

      // Create backup following memory requirement
      await users.updateOne(
        { _id: u._id }, 
        { $set: { cobertura_legal_old: currentCov } }
      );

      const current = Array.isArray(currentCov.fuentes_gobierno) ? currentCov.fuentes_gobierno : [];
      const merged = Array.from(new Set([...current, ...toAdd]));

      const res = await users.updateOne(
        { _id: u._id },
        { $set: { 'cobertura_legal.fuentes_gobierno': merged } }
      );

      if (res.modifiedCount > 0) updated++;
      
      totalSourcesAfter += merged.length;
      afterStats.push({
        email: u.email,
        newSourcesCount: merged.length,
        addedSources: merged.filter(s => !current.includes(s))
      });
    }

    console.log(`\nAFTER UPDATE STATS:`);
    console.log(`- Users successfully updated: ${updated}`);
    console.log(`- Total sources across all users: ${totalSourcesAfter}`);
    console.log(`- Sources added: ${JSON.stringify(toAdd, null, 2)}`);

    console.log('\nSUMMARY:');
    console.log(JSON.stringify({ 
      operation: 'add_sources_webershandwick',
      sourcesAdded: toAdd,
      totalUsers: totalUsers,
      updatedUsers: updated,
      beforeTotalSources: beforeCount,
      afterTotalSources: totalSourcesAfter,
      newSourcesAdded: totalSourcesAfter - beforeCount
    }, null, 2));

  } catch (e) {
    console.error('Add sources error:', e);
    process.exit(2);
  } finally {
    await client.close();
  }
})(); 