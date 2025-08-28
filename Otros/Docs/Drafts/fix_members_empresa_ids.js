require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');

/**
 * Fix empresa members IDs (one-off) for a given domain
 * - Saves backups with values: estructura_empresa_id_old, admin_empresa_id_old
 * - Sets estructura_empresa_id to current estructura._id and admin_empresa_id to current admin._id
 * - Only updates users with tipo_cuenta='empresa' and empresa=domain
 */

const CONFIG = {
  empresaDomain: 'reversa.ai',
  adminEmail: 'tomas@reversa.ai',
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

    const estructuraId = new ObjectId(String(estructura._id));
    const adminId = new ObjectId(String(admin._id));

    const members = await users.find({ tipo_cuenta: 'empresa', empresa: CONFIG.empresaDomain }).toArray();
    console.log(`Encontrados ${members.length} miembros de empresa (${CONFIG.empresaDomain}).`);

    let updated = 0;
    for (const u of members) {
      const setBackups = {};
      if (u.estructura_empresa_id !== undefined && u.estructura_empresa_id !== null) setBackups.estructura_empresa_id_old = u.estructura_empresa_id;
      if (u.admin_empresa_id !== undefined && u.admin_empresa_id !== null) setBackups.admin_empresa_id_old = u.admin_empresa_id;
      const update = {
        $set: {
          ...setBackups,
          estructura_empresa_id: estructuraId,
          admin_empresa_id: adminId,
          updated_at: new Date()
        }
      };
      if (CONFIG.dryRun) {
        console.log(`[DRY_RUN] Update ${u.email}:`, JSON.stringify(update.$set));
      } else {
        await users.updateOne({ _id: u._id }, update);
        updated += 1;
        console.log(`✅ Updated ${u.email}`);
      }
    }
    console.log(`✅ Completado. Usuarios actualizados: ${updated}`);
  } catch (err) {
    console.error('❌ Error en fix_members_empresa_ids:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main }; 