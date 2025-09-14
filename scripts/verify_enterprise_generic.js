require('dotenv').config();

const { MongoClient } = require('mongodb');

(async function verify() {
  const uri = process.env.DB_URI;
  const domain = process.env.MIGRATE_DOMAIN;
  const emails = (process.env.MIGRATE_USER_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!uri) { console.error('Missing DB_URI'); process.exit(1); }
  if (!domain) { console.error('Missing MIGRATE_DOMAIN'); process.exit(1); }
  if (!emails.length) { console.error('Missing MIGRATE_USER_EMAILS'); process.exit(1); }

  const client = new MongoClient(uri, {});
  try {
    await client.connect();
    const db = client.db('papyrus');
    const users = db.collection('users');

    const estructura = await users.findOne({ tipo_cuenta: 'estructura_empresa', empresa: domain });
    const targets = await users.find({ email: { $in: emails } }).toArray();

    const out = {
      estructura: estructura ? {
        _id: String(estructura._id),
        empresa: estructura.empresa,
        profile_type: estructura.profile_type,
        subscription_plan: estructura.subscription_plan,
        admin_principal_id: estructura.admin_principal_id ? String(estructura.admin_principal_id) : null,
        legacy_user_ids: Array.isArray(estructura.legacy_user_ids) ? estructura.legacy_user_ids.map(id => String(id)) : [],
        has_backups: Object.keys(estructura || {}).some(k => k.endsWith('_old'))
      } : null,
      users: targets.map(u => ({
        email: u.email,
        tipo_cuenta: u.tipo_cuenta,
        empresa: u.empresa,
        permiso: u.permiso,
        estructura_empresa_id: u.estructura_empresa_id ? String(u.estructura_empresa_id) : null,
        admin_empresa_id: u.admin_empresa_id ? String(u.admin_empresa_id) : null,
        subscription_plan: u.subscription_plan,
        backup_keys: Object.keys(u).filter(k => k.endsWith('_old')).sort(),
        has_user_id_old: Boolean(u.user_id_old)
      }))
    };

    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('verify_error:', e);
    process.exit(1);
  } finally {
    await client.close();
  }
})();


