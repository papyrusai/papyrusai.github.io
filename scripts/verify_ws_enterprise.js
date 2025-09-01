require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');

async function verifyWebershandwickEnterprise() {
  const client = new MongoClient(process.env.DB_URI, {});

  const TARGET_DOMAIN = 'webershandwick.com';
  const TARGET_EMAILS = [
    'BGonzalez@webershandwick.com',
    'BHernandez@webershandwick.com',
    'AFernandez-Huidobro@webershandwick.com',
    'IBlanco@webershandwick.com',
    'egarciaramon@webershandwick.com'
  ];
  const ADMIN_EMAIL = 'BGonzalez@webershandwick.com';
  const LEGACY_EMAIL = 'BHernandez@webershandwick.com';

  try {
    await client.connect();
    const db = client.db('papyrus');
    const usersCol = db.collection('users');

    // Fetch all target users first (to compute relationships)
    const users = await usersCol
      .find({ email: { $in: TARGET_EMAILS } })
      .toArray();

    const usersByEmail = Object.fromEntries(users.map(u => [String(u.email).toLowerCase(), u]));
    const admin = usersByEmail[ADMIN_EMAIL.toLowerCase()];
    if (!admin) {
      throw new Error(`Admin user not found: ${ADMIN_EMAIL}`);
    }

    // Fetch estructura_empresa for the domain
    const estructura = await usersCol.findOne({ tipo_cuenta: 'estructura_empresa', empresa: TARGET_DOMAIN });
    if (!estructura) {
      throw new Error(`estructura_empresa not found for domain: ${TARGET_DOMAIN}`);
    }

    const estructuraIdStr = String(estructura._id);

    // Validate the empresa _id equals admin.user_id_old (if present)
    const adminOldIdStr = admin.user_id_old ? String(admin.user_id_old) : null;

    // Collect user summaries
    const userSummaries = users.map(u => ({
      email: u.email,
      tipo_cuenta: u.tipo_cuenta,
      empresa: u.empresa,
      estructura_empresa_id: u.estructura_empresa_id ? String(u.estructura_empresa_id) : null,
      admin_empresa_id: u.admin_empresa_id ? String(u.admin_empresa_id) : null,
      permiso: u.permiso,
      subscription_plan: u.subscription_plan,
      has_user_id_old: !!u.user_id_old,
      user_id_old: u.user_id_old ? String(u.user_id_old) : null,
      backup_keys: Object.keys(u).filter(k => k.endsWith('_old')).sort()
    }));

    // Check legacy_user_ids contains the legacy user's id
    const legacyUser = usersByEmail[LEGACY_EMAIL.toLowerCase()];
    const legacyUserIdStr = legacyUser ? String(legacyUser._id) : null;
    const legacyMatches = Array.isArray(estructura.legacy_user_ids)
      ? estructura.legacy_user_ids.map(id => String(id))
      : [];

    const result = {
      estructura: {
        _id: estructuraIdStr,
        empresa: estructura.empresa,
        profile_type: estructura.profile_type,
        subscription_plan: estructura.subscription_plan,
        admin_principal_id: estructura.admin_principal_id ? String(estructura.admin_principal_id) : null,
        legacy_user_ids: legacyMatches,
        // Validation expectations
        expected: {
          domain: TARGET_DOMAIN,
          estructura_id_should_equal_admin_user_id_old: adminOldIdStr,
          legacy_should_include_user: LEGACY_EMAIL,
          subscription_plan: 'plan4',
          profile_type: 'empresa'
        }
      },
      legacy_check: {
        legacy_email: LEGACY_EMAIL,
        bh_user_id: legacyUserIdStr,
        included: legacyUserIdStr ? legacyMatches.includes(legacyUserIdStr) : false
      },
      users: userSummaries
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  verifyWebershandwickEnterprise().catch(err => {
    console.error('Verification error:', err);
    process.exit(1);
  });
}

module.exports = { verifyWebershandwickEnterprise }; 