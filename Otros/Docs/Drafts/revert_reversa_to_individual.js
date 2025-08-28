require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');

/**
 * Revert enterprise -> individual for a domain
 * Steps:
 * 1) Copy ALL relevant common fields from estructura_empresa to admin user (Tomás), with *_old backups.
 * 2) If estructura_carpetas exists, copy as estructura_carpetas_user in admin (backup estructura_carpetas_user_old).
 * 3) Delete estructura_empresa document.
 * 4) Set all domain users to tipo_cuenta='individual', removing empresa/common refs, with *_old backups.
 */

const CONFIG = {
  empresaDomain: 'reversa.ai',
  adminEmail: 'tomas@reversa.ai',
  dryRun: false
};

const COMMON_FIELDS = [
  'perfil_regulatorio','tipo_empresa','detalle_empresa','interes','tamaño_empresa','web','company_name',
  'industry_tags','sub_industria_map','rama_juridicas','sub_rama_map','cobertura_legal','rangos',
  'etiquetas_personalizadas','website_extraction_status','limit_agentes','limit_fuentes','impact_analysis_limit','subscription_plan'
];

function isEmpty(val) {
  if (val == null) return true;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'object') return Object.keys(val).length === 0;
  if (typeof val === 'string') return val.trim() === '';
  return false;
}

function mergeShallow(a, b) {
  return { ...(a || {}), ...(b || {}) };
}

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

    const session = client.startSession();
    await session.withTransaction(async () => {
      // 1) Copy common fields into admin with backups
      const setAdmin = { updated_at: new Date() };
      const setAdminBackups = {};

      for (const f of COMMON_FIELDS) {
        const value = estructura[f];
        if (value !== undefined) {
          const backupKey = `${f}_old`;
          if (admin[backupKey] === undefined && admin[f] !== undefined) setAdminBackups[backupKey] = admin[f];
          // For etiquetas_personalizadas, merge admin and estructura (preserve admin overrides)
          if (f === 'etiquetas_personalizadas') setAdmin[f] = mergeShallow(value, admin[f]); else setAdmin[f] = value;
        }
      }

      // 2) estructura_carpetas -> estructura_carpetas_user in admin
      if (estructura.estructura_carpetas) {
        if (admin.estructura_carpetas_user && admin.estructura_carpetas_user_old === undefined) {
          setAdminBackups.estructura_carpetas_user_old = admin.estructura_carpetas_user;
        }
        setAdmin.estructura_carpetas_user = estructura.estructura_carpetas;
      }

      if (!CONFIG.dryRun) {
        // Apply admin update with backups
        const adminUpdate = { $set: { ...setAdminBackups, ...setAdmin } };
        await users.updateOne({ _id: admin._id }, adminUpdate, { session });
      }

      // 3) Delete estructura_empresa
      if (!CONFIG.dryRun) {
        await users.deleteOne({ _id: estructura._id }, { session });
      }

      // 4) Convert all domain users to individual
      const members = await users.find({ empresa: CONFIG.empresaDomain }).toArray();
      for (const u of members) {
        const setBackups = {};
        if (u.tipo_cuenta !== undefined) setBackups.tipo_cuenta_old = u.tipo_cuenta;
        if (u.empresa !== undefined) setBackups.empresa_old = u.empresa;
        if (u.estructura_empresa_id !== undefined) setBackups.estructura_empresa_id_old = u.estructura_empresa_id;
        if (u.admin_empresa_id !== undefined) setBackups.admin_empresa_id_old = u.admin_empresa_id;
        if (u.permiso !== undefined) setBackups.permiso_old = u.permiso;
        // limits backups if present
        if (u.limit_agentes !== undefined) setBackups.limit_agentes_old = u.limit_agentes;
        if (u.limit_fuentes !== undefined) setBackups.limit_fuentes_old = u.limit_fuentes;
        if (u.impact_analysis_limit !== undefined) setBackups.impact_analysis_limit_old = u.impact_analysis_limit;

        const unsetFields = { empresa: '', estructura_empresa_id: '', admin_empresa_id: '', permiso: '' };
        const setFields = { tipo_cuenta: 'individual', updated_at: new Date() };

        if (!CONFIG.dryRun) {
          const update = { $set: { ...setBackups, ...setFields }, $unset: unsetFields };
          await users.updateOne({ _id: u._id }, update, { session });
        }
      }
    });
    await session.endSession();

    console.log('✅ Reversión a individual completada para dominio:', CONFIG.empresaDomain);
  } catch (err) {
    console.error('❌ Error en revert_reversa_to_individual:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main }; 