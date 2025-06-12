const { MongoClient } = require('mongodb');
require('dotenv').config();

// Configuration
const MONGODB_URI = process.env.DB_URI;
const DB_NAME = 'papyrus';

async function updateUserVariables() {
    let client;
    try {
        client = new MongoClient(MONGODB_URI, {});
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db(DB_NAME);
        const users = db.collection('users');

        // Find the user document
        const user = await users.findOne({ email: "montse@augustico.law" });

        if (!user) {
            console.log('User not found');
            return;
        }

        console.log('Found user document:', user.email);

        // Check if cobertura_legal exists
        if (!user.cobertura_legal) {
            console.log('No cobertura_legal object found');
            return;
        }

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
            { email: "montse@augustico.law" },
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
            console.log('Successfully updated user document');
            
            // Verify the update
            const updatedUser = await users.findOne({ email: "montse@augustico.law" });
            console.log('Updated values:', {
                'fuentes_gobierno': updatedUser.cobertura_legal.fuentes_gobierno,
                'fuentes_reguladores': updatedUser.cobertura_legal.fuentes_reguladores
            });
        } else {
            console.log('No changes were made to the document');
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
            console.log('Disconnected from MongoDB');
        }
    }
}

// Run the update function
updateUserVariables().catch(err => {
    console.error('Error executing update:', err);
    process.exit(1);
});
