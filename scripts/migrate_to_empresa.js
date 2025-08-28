require('dotenv').config();

const { MongoClient } = require('mongodb');
const { migrateUsersToEmpresa } = require('../services/enterprise.service');

async function main() {
  const input = {
    userEmails: [
      'tomas@reversa.ai',
      'inigo@reversa.ai'
    ],
    adminEmail: 'tomas@reversa.ai',
    empresaDomain: 'reversa.ai',
    // defaultPermiso omitted => 'lectura' for non-admin
    // empresaData optional: set only if you need to prefill context
    empresaData: {}
  };

  console.log('▶️ Starting enterprise migration with input:', JSON.stringify({
    userEmails: input.userEmails,
    adminEmail: input.adminEmail,
    empresaDomain: input.empresaDomain
  }));

  const result = await migrateUsersToEmpresa(input);
  console.log('✅ Migration result:', JSON.stringify(result, null, 2));

  if (!result.success) {
    process.exitCode = 1;
    return;
  }

  // Verify updates in DB
  const client = new MongoClient(process.env.DB_URI, {});
  try {
    await client.connect();
    const db = client.db('papyrus');
    const users = db.collection('users');

    const [u1, u2, estructura] = await Promise.all([
      users.findOne({ email: 'tomas@reversa.ai' }),
      users.findOne({ email: 'inigo@reversa.ai' }),
      users.findOne({ tipo_cuenta: 'estructura_empresa', empresa: 'reversa.ai' })
    ]);

    function pickUserFields(u) {
      if (!u) return null;
      return {
        _id: u._id,
        email: u.email,
        tipo_cuenta: u.tipo_cuenta,
        empresa: u.empresa,
        estructura_empresa_id: u.estructura_empresa_id,
        admin_empresa_id: u.admin_empresa_id,
        permiso: u.permiso,
        subscription_plan: u.subscription_plan,
        limit_agentes: u.limit_agentes,
        limit_fuentes: u.limit_fuentes,
        etiquetas_personalizadas_seleccionadas: Array.isArray(u.etiquetas_personalizadas_seleccionadas) ? u.etiquetas_personalizadas_seleccionadas : []
      };
    }

    function pickEstructuraFields(e) {
      if (!e) return null;
      return {
        _id: e._id,
        tipo_cuenta: e.tipo_cuenta,
        empresa: e.empresa,
        subscription_plan: e.subscription_plan,
        limit_agentes: e.limit_agentes,
        limit_fuentes: e.limit_fuentes,
        impact_analysis_limit: e.impact_analysis_limit,
        profile_type: e.profile_type,
        admin_principal_id: e.admin_principal_id,
        estructura_carpetas_version: e.estructura_carpetas?.version || 1,
        updated_at: e.updated_at
      };
    }

    console.log('🔎 User (admin) after migration:', JSON.stringify(pickUserFields(u1), null, 2));
    console.log('🔎 User (member) after migration:', JSON.stringify(pickUserFields(u2), null, 2));
    console.log('🏢 Estructura empresa:', JSON.stringify(pickEstructuraFields(estructura), null, 2));
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('❌ Migration script error:', err);
  process.exitCode = 1;
}); 