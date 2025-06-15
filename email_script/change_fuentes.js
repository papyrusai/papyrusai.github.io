const { MongoClient } = require('mongodb');
require('dotenv').config();

// Configuration
const MONGODB_URI = process.env.DB_URI;
const DB_NAME = 'papyrus';

// Set the maximum number of users to update
const MAX_UPDATES = 5;

async function updateUserVariables() {
    let client;
    try {
        client = new MongoClient(MONGODB_URI, {});
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db(DB_NAME);
        const users = db.collection('users');

        // Find all users that have either of the old format variables in cobertura_legal
        const cursor = users.find({
            $or: [
                { 'cobertura_legal.fuentes-gobierno': { $exists: true } },
                { 'cobertura_legal.fuentes-reguladores': { $exists: true } }
            ]
        });

        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        let processedCount = 0;
        const updatedUsers = []; // Track which users were updated

        console.log(`Starting update process. Maximum updates allowed: ${MAX_UPDATES}`);

        // Process each user
        while (await cursor.hasNext() && updatedCount < MAX_UPDATES) {
            const user = await cursor.next();
            processedCount++;
            
            try {
                console.log(`\nProcessing user ${processedCount}: ${user.email}`);

                // Store the current values from the old format (with hyphens)
                const oldFuentesGobierno = user.cobertura_legal['fuentes-gobierno'] || [];
                const oldFuentesReguladores = user.cobertura_legal['fuentes-reguladores'] || [];

                // Store any existing values in the new format
                const existingFuentesGobierno = user.cobertura_legal['fuentes_gobierno'] || [];
                const existingFuentesReguladores = user.cobertura_legal['fuentes_reguladores'] || [];

                console.log('Current values:', {
                    'old format - fuentes-gobierno': oldFuentesGobierno,
                    'old format - fuentes-reguladores': oldFuentesReguladores,
                    'new format - fuentes_gobierno': existingFuentesGobierno,
                    'new format - fuentes_reguladores': existingFuentesReguladores
                });

                // Merge old and new values, removing duplicates
                const mergedFuentesGobierno = [...new Set([...oldFuentesGobierno, ...existingFuentesGobierno])];
                const mergedFuentesReguladores = [...new Set([...oldFuentesReguladores, ...existingFuentesReguladores])];

                // Update the document with new field names inside cobertura_legal
                const updateResult = await users.updateOne(
                    { _id: user._id },
                    {
                        $set: {
                            'cobertura_legal.fuentes_gobierno': mergedFuentesGobierno,
                            'cobertura_legal.fuentes_reguladores': mergedFuentesReguladores
                        },
                        $unset: {
                            'cobertura_legal.fuentes-gobierno': "",
                            'cobertura_legal.fuentes-reguladores': ""
                        }
                    }
                );

                if (updateResult.modifiedCount === 1) {
                    console.log(`✅ Successfully updated user: ${user.email}`);
                    updatedCount++;
                    updatedUsers.push({
                        email: user.email,
                        oldFuentesGobierno,
                        oldFuentesReguladores,
                        newFuentesGobierno: mergedFuentesGobierno,
                        newFuentesReguladores: mergedFuentesReguladores
                    });
                    
                    // Verify the update
                    const updatedUser = await users.findOne({ _id: user._id });
                    console.log('Updated values:', {
                        'fuentes_gobierno': updatedUser.cobertura_legal.fuentes_gobierno,
                        'fuentes_reguladores': updatedUser.cobertura_legal.fuentes_reguladores
                    });
                } else {
                    console.log(`⏭️ No changes needed for user: ${user.email}`);
                    skippedCount++;
                }
            } catch (error) {
                console.error(`❌ Error processing user ${user.email}:`, error);
                errorCount++;
            }
        }

        // Print summary
        console.log('\n' + '='.repeat(50));
        console.log('UPDATE SUMMARY');
        console.log('='.repeat(50));
        console.log(`Maximum updates allowed: ${MAX_UPDATES}`);
        console.log(`Total users processed: ${processedCount}`);
        console.log(`Successfully updated: ${updatedCount}`);
        console.log(`Skipped (no changes needed): ${skippedCount}`);
        console.log(`Errors encountered: ${errorCount}`);
        
        if (updatedCount >= MAX_UPDATES) {
            console.log(`\n⚠️ Reached maximum update limit of ${MAX_UPDATES} users.`);
        }

        // Show details of updated users
        if (updatedUsers.length > 0) {
            console.log('\n' + '-'.repeat(50));
            console.log('UPDATED USERS DETAILS:');
            console.log('-'.repeat(50));
            updatedUsers.forEach((user, index) => {
                console.log(`\n${index + 1}. ${user.email}`);
                console.log(`   Old fuentes-gobierno: [${user.oldFuentesGobierno.join(', ')}]`);
                console.log(`   Old fuentes-reguladores: [${user.oldFuentesReguladores.join(', ')}]`);
                console.log(`   New fuentes_gobierno: [${user.newFuentesGobierno.join(', ')}]`);
                console.log(`   New fuentes_reguladores: [${user.newFuentesReguladores.join(', ')}]`);
            });
        }

    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            name: error.name
        });
        throw error;
    } finally {
        if (client) {
            await client.close();
            console.log('\n🔌 Disconnected from MongoDB');
        }
    }
}

// Run the update function
updateUserVariables().catch(err => {
    console.error('Error executing update:', err);
    process.exit(1);
});
