require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');

/**
 * Swap Tomás _id to the old estructura_empresa _id
 * - Find Tomás by email
 * - Determine estructura old id (from estructura_old_id saved earlier or provided directly)
 * - Clone Tomás with target _id and set user_id_old backup
 * - Delete old Tomás _id document
 */

const CONFIG = {
  adminEmail: 'tomas@reversa.ai',
  // If you know the target id directly, set it here (string). Otherwise, we try to infer from backups in structure
  targetStructureOldId: '6805034851cc777ddb5a76a1',
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

    const targetId = new ObjectId(String(CONFIG.targetStructureOldId));
    const currentId = new ObjectId(String(admin._id));

    if (String(targetId) === String(currentId)) {
      console.log('Nada que hacer: Tomás ya tiene el _id de estructura antigua');
      return;
    }

    const session = client.startSession();
    await session.withTransaction(async () => {
      // Clone admin with target _id
      const adminClone = { ...admin };
      delete adminClone._id;
      adminClone._id = targetId;
      if (adminClone.user_id_old === undefined) adminClone.user_id_old = currentId;
      adminClone.updated_at = new Date();

      if (!CONFIG.dryRun) {
        await users.insertOne(adminClone, { session });
        await users.deleteOne({ _id: currentId }, { session });
      } else {
        console.log('[DRY_RUN] Would insert admin with _id=', String(targetId), 'and delete', String(currentId));
      }
    });
    await session.endSession();

    console.log(`✅ Tomás _id cambiado a ${String(CONFIG.targetStructureOldId)} con backup user_id_old=${String(admin._id)}`);
  } catch (err) {
    console.error('❌ Error en swap_tomas_id_to_structure_old:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main }; 