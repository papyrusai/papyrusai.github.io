require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');

/**
 * Swap IDs between admin user and estructura_empresa
 * - estructura_empresa._id becomes the admin's current _id
 * - admin user gets a new _id
 * - Backups stored: user.user_id_old, estructura.estructura_old_id
 * - Preserves email/password/google fields so login keeps working
 * - Updates references in both docs: admin_principal_id, estructura_empresa_id, admin_empresa_id
 */

const CONFIG = {
  adminEmail: 'tomas@reversa.ai',
  empresaDomain: 'reversa.ai',
  dryRun: false
};

async function main() {
  const client = new MongoClient(process.env.DB_URI, {});
  try {
    await client.connect();
    const db = client.db('papyrus');
    const users = db.collection('users');

    const admin = await users.findOne({ email: CONFIG.adminEmail });
    if (!admin) throw new Error(`Admin no encontrado: ${CONFIG.adminEmail}`);
    const estructura = await users.findOne({ tipo_cuenta: 'estructura_empresa', empresa: CONFIG.empresaDomain });
    if (!estructura) throw new Error(`Estructura no encontrada para ${CONFIG.empresaDomain}`);

    const adminOldId = new ObjectId(String(admin._id));
    const estructuraOldId = new ObjectId(String(estructura._id));

    if (String(adminOldId) === String(estructuraOldId)) {
      console.log('Nada que intercambiar: IDs ya coinciden');
      return;
    }

    const adminNewId = new ObjectId();

    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        // 1) Create a clone of admin with new _id, copy all fields
        const adminClone = { ...admin };
        delete adminClone._id;
        adminClone._id = adminNewId;
        adminClone.user_id_old = adminOldId; // backup with value
        adminClone.updated_at = new Date();

        if (!CONFIG.dryRun) await users.insertOne(adminClone, { session });
        if (!CONFIG.dryRun) await users.deleteOne({ _id: adminOldId }, { session });

        // 2) Move estructura to adminOldId (already exists): replaceOne with _id=adminOldId
        const estructuraNew = { ...estructura };
        estructuraNew._id = adminOldId;
        estructuraNew.estructura_old_id = estructuraOldId; // backup with value
        estructuraNew.admin_principal_id = adminNewId; // admin is now new id
        estructuraNew.updated_at = new Date();

        if (!CONFIG.dryRun) {
          await users.deleteOne({ _id: estructuraOldId }, { session });
          await users.insertOne(estructuraNew, { session });
        }

        // 3) Update admin clone to point to estructura_empresa
        const userSet = {
          tipo_cuenta: adminClone.tipo_cuenta || 'empresa',
          estructura_empresa_id: adminOldId,
          admin_empresa_id: adminNewId,
          updated_at: new Date()
        };

        if (!CONFIG.dryRun) await users.updateOne({ _id: adminNewId }, { $set: userSet }, { session });
      });
    } finally {
      await session.endSession();
    }

    console.log(`✅ Swap IDs completado. estructura_empresa._id=${adminOldId}, admin._id=${adminNewId}`);
  } catch (err) {
    console.error('❌ Error en swap IDs enterprise:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main }; 