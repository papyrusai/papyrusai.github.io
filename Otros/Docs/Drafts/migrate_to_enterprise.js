require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');

/**
 * Preventive enterprise migration script
 * - Backs up all user fields as <field>_old before unsetting
 * - Copies/merges enterprise-relevant fields into estructura_empresa BEFORE removing them from users
 * - Sets plan4 limits and permissions
 * - Supports dryRun to preview changes
 * - Optional: useAdminIdAsEmpresaId => estructura_empresa._id = adminOldId (preserves historical matches)
 */

const CONFIG = {
  userEmails: ['tomas@reversa.ai', 'inigo@reversa.ai'],
  adminEmail: 'tomas@reversa.ai',
  empresaDomain: 'reversa.ai', // optional, auto-detected from adminEmail if empty
  defaultPermiso: 'lectura', // for non-admin users: 'lectura' | 'edicion'
  dryRun: false,
  useAdminIdAsEmpresaId: true
};

const FIELDS_TO_COPY = [
  'cobertura_legal',
  'etiquetas_personalizadas',
  'perfil_regulatorio',
  'industry_tags',
  'sub_industria_map',
  'rama_juridicas',
  'sub_rama_map',
  'rangos',
  'tipo_empresa',
  'detalle_empresa',
  'interes',
  'tamaño_empresa',
  'web',
  'company_name',
  'website_extraction_status',
  'estructura_carpetas_user'
];

function isEmptyValue(val) {
  if (val == null) return true;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'object') return Object.keys(val).length === 0;
  if (typeof val === 'string') return val.trim() === '';
  return false;
}

function uniqueArray(arr) {
  return Array.from(new Set((arr || []).filter(v => v != null)));
}

function mergeArraysUnique(a, b) {
  return uniqueArray([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]);
}

function mergeObjectsShallow(a, b) {
  return { ...(a || {}), ...(b || {}) };
}

function normalizeCobertura(cob) {
  if (!cob || typeof cob !== 'object') return { fuentes_gobierno: [], fuentes_reguladores: [] };
  const fuentesGob = cob['fuentes-gobierno'] || cob.fuentes_gobierno || cob.fuentes || [];
  const fuentesReg = cob['fuentes-reguladores'] || cob.fuentes_reguladores || cob['fuentes-regulador'] || cob.reguladores || [];
  return { fuentes_gobierno: uniqueArray(fuentesGob), fuentes_reguladores: uniqueArray(fuentesReg) };
}

function mergeCobertura(a, b) {
  const na = normalizeCobertura(a);
  const nb = normalizeCobertura(b);
  return {
    fuentes_gobierno: mergeArraysUnique(na.fuentes_gobierno, nb.fuentes_gobierno),
    fuentes_reguladores: mergeArraysUnique(na.fuentes_reguladores, nb.fuentes_reguladores)
  };
}

async function ensureEmpresaIndex(db) {
  const users = db.collection('users');
  try {
    await users.createIndex(
      { empresa: 1, tipo_cuenta: 1 },
      {
        name: 'unique_estructura_empresa_por_empresa',
        unique: true,
        partialFilterExpression: { tipo_cuenta: 'estructura_empresa' }
      }
    );
  } catch (_) { /* ignore */ }
}

async function createEstructuraUsingAdminId(session, db, domain, adminDoc) {
  const usersCol = db.collection('users');
  const adminOldId = new ObjectId(String(adminDoc._id));
  const adminNewId = new ObjectId();

  // Determine created_at from admin registration_date
  let createdAtFromAdmin = null;
  if (adminDoc.registration_date_obj) {
    try { createdAtFromAdmin = new Date(adminDoc.registration_date_obj); } catch (_) {}
  }
  if (!createdAtFromAdmin && typeof adminDoc.registration_date === 'string') {
    try { createdAtFromAdmin = new Date(adminDoc.registration_date); } catch (_) {}
  }
  const fallbackNow = new Date();

  // Insert copy of admin with new _id, backup old id
  const adminCopy = { ...adminDoc };
  delete adminCopy._id;
  adminCopy._id = adminNewId;
  adminCopy.user_id_old = adminOldId; // backup with value
  adminCopy.updated_at = fallbackNow;

  await usersCol.insertOne(adminCopy, { session });
  await usersCol.deleteOne({ _id: adminOldId }, { session });

  // Create estructura with _id = adminOldId
  const baseDoc = {
    _id: adminOldId,
    tipo_cuenta: 'estructura_empresa',
    empresa: domain,
    industry_tags: [],
    sub_industria_map: {},
    rama_juridicas: [],
    sub_rama_map: {},
    cobertura_legal: { fuentes_gobierno: [], fuentes_reguladores: [] },
    rangos: [],
    subscription_plan: 'plan4',
    limit_agentes: null,
    limit_fuentes: null,
    impact_analysis_limit: -1,
    profile_type: 'empresa',
    company_name: '',
    web: '',
    detalle_empresa: {},
    interes: '',
    tamaño_empresa: '',
    perfil_regulatorio: '',
    website_extraction_status: { success: true, error: null },
    etiquetas_personalizadas: {},
    estructura_carpetas: { folders: {}, asignaciones: {}, version: 1 },
    bloqueos_edicion: { agentes: {}, carpetas: {} },
    historial_agentes: [],
    historial_carpetas: [],
    created_at: createdAtFromAdmin && !isNaN(createdAtFromAdmin.getTime()) ? createdAtFromAdmin : fallbackNow,
    updated_at: fallbackNow,
    admin_principal_id: adminNewId,
    estructura_old_id: null // no previous estructura
  };
  await usersCol.insertOne(baseDoc, { session });

  return { estructuraId: adminOldId, adminNewId };
}

async function main() {
  const client = new MongoClient(process.env.DB_URI, {});
  try {
    const { userEmails, adminEmail, empresaDomain, defaultPermiso, dryRun, useAdminIdAsEmpresaId } = CONFIG;
    if (!Array.isArray(userEmails) || userEmails.length === 0) throw new Error('CONFIG.userEmails vacío');
    if (!adminEmail) throw new Error('CONFIG.adminEmail vacío');

    await client.connect();
    const db = client.db('papyrus');
    const usersCol = db.collection('users');

    const admin = await usersCol.findOne({ email: adminEmail });
    if (!admin) throw new Error(`Admin no encontrado: ${adminEmail}`);
    const adminIdObj = new ObjectId(String(admin._id));

    const domain = (empresaDomain || (adminEmail.includes('@') ? adminEmail.split('@')[1] : '')).toLowerCase();
    if (!domain) throw new Error('No se pudo determinar empresaDomain');

    await ensureEmpresaIndex(db);

    let estructura = await usersCol.findOne({ tipo_cuenta: 'estructura_empresa', empresa: domain });

    let estructuraId;
    let adminNewId = adminIdObj;

    if (!estructura && useAdminIdAsEmpresaId && !dryRun) {
      // Create estructura with admin old id, and re-id admin in a transaction
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          const result = await createEstructuraUsingAdminId(session, db, domain, admin);
          estructuraId = result.estructuraId;
          adminNewId = result.adminNewId;
        });
      } finally {
        await session.endSession();
      }
      // Load newly created estructura
      estructura = await usersCol.findOne({ _id: estructuraId });
    } else {
      if (!estructura) {
        // Fallback: create standard estructura (no id swap) in dryRun or when disabled
        const now = new Date();
        // Determine created_at from admin registration_date
        let createdAtFromAdmin = null;
        if (admin.registration_date_obj) {
          try { createdAtFromAdmin = new Date(admin.registration_date_obj); } catch (_) {}
        }
        if (!createdAtFromAdmin && typeof admin.registration_date === 'string') {
          try { createdAtFromAdmin = new Date(admin.registration_date); } catch (_) {}
        }
        const baseDoc = {
          tipo_cuenta: 'estructura_empresa', empresa: domain,
          industry_tags: [], sub_industria_map: {}, rama_juridicas: [], sub_rama_map: {},
          cobertura_legal: { fuentes_gobierno: [], fuentes_reguladores: [] }, rangos: [],
          subscription_plan: 'plan4', limit_agentes: null, limit_fuentes: null, impact_analysis_limit: -1,
          profile_type: 'empresa', company_name: '', web: '', detalle_empresa: {}, interes: '', tamaño_empresa: '',
          perfil_regulatorio: '', website_extraction_status: { success: true, error: null }, etiquetas_personalizadas: {},
          estructura_carpetas: { folders: {}, asignaciones: {}, version: 1 }, bloqueos_edicion: { agentes: {}, carpetas: {} },
          historial_agentes: [], historial_carpetas: [], created_at: (createdAtFromAdmin && !isNaN(createdAtFromAdmin.getTime())) ? createdAtFromAdmin : now, updated_at: now, admin_principal_id: adminIdObj
        };
        if (!dryRun) {
          const { insertedId } = await usersCol.insertOne(baseDoc);
          estructura = { ...baseDoc, _id: insertedId };
        } else {
          estructura = { ...baseDoc, _id: new ObjectId() };
        }
      }
      estructuraId = new ObjectId(String(estructura._id));
    }

    // Seed/merge enterprise fields from all users (admin priority)
    const targetUsers = await usersCol.find({ email: { $in: userEmails } }).toArray();
    const usersByEmail = Object.fromEntries(targetUsers.map(u => [u.email, u]));

    const seed = {};
    // Admin first
    FIELDS_TO_COPY.forEach(f => { if (admin[f] !== undefined) seed[f] = admin[f]; });
    // Merge from others
    for (const email of userEmails) {
      const u = usersByEmail[email];
      if (!u) continue;
      for (const f of FIELDS_TO_COPY) {
        if (u[f] === undefined) continue;
        if (f === 'industry_tags' || f === 'rama_juridicas' || f === 'rangos') {
          seed[f] = mergeArraysUnique(seed[f], u[f]);
        } else if (f === 'sub_industria_map' || f === 'sub_rama_map' || f === 'detalle_empresa' || f === 'website_extraction_status' || f === 'estructura_carpetas_user' || f === 'etiquetas_personalizadas') {
          seed[f] = mergeObjectsShallow(seed[f], u[f]);
        } else if (f === 'cobertura_legal') {
          seed[f] = mergeCobertura(seed[f], u[f]);
        } else {
          // prefer admin non-empty; else take first non-empty
          if (isEmptyValue(seed[f]) && !isEmptyValue(u[f])) seed[f] = u[f];
        }
      }
    }

    // Build estructura update with backups (<field>_old) when overriding
    const now = new Date();
    const setUpdate = {
      subscription_plan: 'plan4',
      limit_agentes: null,
      limit_fuentes: null,
      impact_analysis_limit: -1,
      profile_type: 'empresa',
      admin_principal_id: estructura.admin_principal_id || adminNewId,
      updated_at: now
    };
    const setBackups = {};

    function assignIfProvided(fieldName, value, mergeStrategy = 'replace') {
      if (value === undefined) return;
      const current = estructura[fieldName];
      const willOverride = !isEmptyValue(value);
      if (!willOverride) return;
      if (!isEmptyValue(current) && JSON.stringify(current) !== JSON.stringify(value)) {
        const backupKey = `${fieldName}_old`;
        if (estructura[backupKey] === undefined) setBackups[backupKey] = current; // store value backup
      }
      if (mergeStrategy === 'replace') setUpdate[fieldName] = value;
      else if (mergeStrategy === 'shallowMerge') setUpdate[fieldName] = mergeObjectsShallow(current, value);
    }

    assignIfProvided('company_name', seed.company_name);
    assignIfProvided('web', seed.web);
    assignIfProvided('detalle_empresa', seed.detalle_empresa, 'shallowMerge');
    assignIfProvided('interes', seed.interes);
    assignIfProvided('tamaño_empresa', seed.tamaño_empresa);
    assignIfProvided('perfil_regulatorio', seed.perfil_regulatorio);
    if (seed.website_extraction_status) assignIfProvided('website_extraction_status', seed.website_extraction_status, 'shallowMerge');
    if (seed.industry_tags) assignIfProvided('industry_tags', uniqueArray(seed.industry_tags));
    if (seed.sub_industria_map) assignIfProvided('sub_industria_map', seed.sub_industria_map, 'shallowMerge');
    if (seed.rama_juridicas) assignIfProvided('rama_juridicas', uniqueArray(seed.rama_juridicas));
    if (seed.sub_rama_map) assignIfProvided('sub_rama_map', seed.sub_rama_map, 'shallowMerge');
    if (seed.cobertura_legal) assignIfProvided('cobertura_legal', normalizeCobertura(seed.cobertura_legal));
    if (seed.rangos) assignIfProvided('rangos', uniqueArray(seed.rangos));
    if (seed.etiquetas_personalizadas) assignIfProvided('etiquetas_personalizadas', seed.etiquetas_personalizadas, 'shallowMerge');

    const estructuraUpdate = { $set: setUpdate };
    if (Object.keys(setBackups).length > 0) estructuraUpdate.$set = { ...setBackups, ...estructuraUpdate.$set };

    if (CONFIG.dryRun) {
      console.log('DRY_RUN: Estructura update =>', JSON.stringify(estructuraUpdate, null, 2));
    } else {
      await usersCol.updateOne({ _id: estructuraId }, estructuraUpdate);
    }

    // Per-user updates: backup _old and migrate
    const plan4Limits = { limit_agentes: null, limit_fuentes: null };

    for (const email of userEmails) {
      const u = usersByEmail[email];
      if (!u) {
        console.log(`Usuario no encontrado, skip: ${email}`);
        continue;
      }
      const userId = new ObjectId(String(u._id));
      const isAdmin = email.toLowerCase() === adminEmail.toLowerCase();
      const permiso = isAdmin ? 'admin' : (defaultPermiso === 'edicion' ? 'edicion' : 'lectura');

      const userBackups = {};
      FIELDS_TO_COPY.forEach(f => {
        const val = u[f];
        if (val !== undefined && u[`${f}_old`] === undefined) userBackups[`${f}_old`] = val; // store value backup
      });
      // Backup id as well if re-id happened
      if (String(userId) !== String(adminNewId) && isAdmin && u.user_id_old === undefined) {
        userBackups['user_id_old'] = userId;
      }

      const userSet = {
        tipo_cuenta: 'empresa',
        empresa: domain,
        estructura_empresa_id: estructuraId,
        admin_empresa_id: adminNewId,
        permiso,
        subscription_plan: 'plan4',
        limit_agentes: plan4Limits.limit_agentes,
        limit_fuentes: plan4Limits.limit_fuentes,
        updated_at: now
      };

      const userUnset = {};
      FIELDS_TO_COPY.forEach(f => { if (u[f] !== undefined) userUnset[f] = ''; });

      const updateUser = { $set: { ...userBackups, ...userSet } };
      if (Object.keys(userUnset).length > 0) updateUser.$unset = userUnset;

      if (CONFIG.dryRun) {
        console.log(`DRY_RUN: Update user ${email} =>`, JSON.stringify(updateUser, null, 2));
      } else {
        await usersCol.updateOne({ _id: userId }, updateUser);
      }
    }

    console.log('✅ Migración preparada/aplicada correctamente.');
  } catch (err) {
    console.error('❌ Error en migración preventiva:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

// Run only if executed directly (node migrate_to_enterprise.js)
if (require.main === module) {
  main();
}

module.exports = { main };
