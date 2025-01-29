require('dotenv').config();
const express = require('express');
const passport = require('passport');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const moment = require('moment');
const fs = require('fs');

// Use your Stripe secret key
const stripe = require('stripe')(process.env.STRIPE);

// NEW toggle for plan2
const IS_PLAN2_FREE = "yes";//process.env.IS_PLAN2_FREE || 'no';

// to avoid deprecation error
const mongodbOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true
};

require('./auth'); // Ensure this file is configured correctly

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', 1); // IMPORTANT when behind a proxy (Render)

// Then your session:
app.use(session({
  secret: process.env.SESSION_SECRET || 'default_session_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    sameSite: 'none',
    httpOnly: true
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html')); // Serve the global index.html
});

// Middleware to ensure user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/'); // Redirect to the login page if not authenticated
}

// Route to serve multistep.html only if authenticated
app.get('/multistep.html', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'multistep.html'));
});

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve static files from the "public/dist" directory for the built files
app.use('/dist', express.static(path.join(__dirname, 'public/dist')));

const uri = process.env.DB_URI;

app.get('/select-industries', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'industryForm.html'));
});

app.post('/save-industries', async (req, res) => {
  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const industries = Array.isArray(req.body.industries)
      ? req.body.industries
      : [req.body.industries];
    await usersCollection.updateOne(
      { googleId: req.user.googleId },
      { $set: { industry_tags: industries } }
    );

    res.redirect('/profile');
  } catch (err) {
    console.error('Error connecting to MongoDB', err);
    res.redirect('/');
  } finally {
    await client.close();
  }
});

// Google OAuth routes with prompt to re-authenticate
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  async (req, res) => {
    const client = new MongoClient(uri, mongodbOptions);
    try {
      await client.connect();
      const database = client.db("papyrus");
      const usersCollection = database.collection("users");

      // Find the user in the database
      const existingUser = await usersCollection.findOne({ googleId: req.user.googleId });

      if (existingUser && existingUser.industry_tags && existingUser.industry_tags.length > 0) {
        // Redirect to profile if user has selected industry tags
        return res.redirect('/profile');
      } else {
        // Redirect to the multistep form if industry tags are not set
        return res.redirect('/multistep.html');
      }
    } catch (err) {
      console.error('Error connecting to MongoDB', err);
      return res.redirect('/');
    } finally {
      await client.close();
    }
  }
);

app.get('/profile', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/');
  }

  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ googleId: req.user.googleId });
    if (!user.industry_tags || user.industry_tags.length === 0) {
      return res.redirect('/select-industries');
    }

    // We safely read possible user.rama_juridicas if it exists
    const userRamas = user.rama_juridicas || []; // default empty

    const collections = req.query.collections || ['BOE']; // Default to BOE

    // Calculate the start date for the last month
    const now = new Date();
    const startDate = new Date();
    startDate.setMonth(now.getMonth() - 1);

    const query = {
      $and: [
        { anio: { $gte: startDate.getFullYear() } },
        {
          $or: [
            { mes: { $gt: startDate.getMonth() + 1 } },
            { mes: startDate.getMonth() + 1, dia: { $gte: startDate.getDate() } }
          ]
        }
      ]
    };

    const projection = {
      short_name: 1, divisiones_cnae: 1, resumen: 1,
      dia: 1, mes: 1, anio: 1, url_pdf: 1,
      rama_juridica: 1, sub_rama_juridica: 1
    };

    let allDocuments = [];

    // Loop through the selected collections and fetch docs
    for (const collectionName of collections) {
      const collection = database.collection(collectionName);
      const documents = await collection.find(query).project(projection).toArray();
      allDocuments = allDocuments.concat(documents);
    }

    // Sort by date descending
    allDocuments.sort((a, b) => {
      const dateA = new Date(a.anio, a.mes - 1, a.dia);
      const dateB = new Date(b.anio, b.mes - 1, b.dia);
      return dateB - dateA;
    });

    // Build documentsHtml
    let documentsHtml;
    if (allDocuments.length < 1) {
      documentsHtml = `<div class="no-results">No hay resultados para esa búsqueda</div>`;
    } else {
      documentsHtml = allDocuments.map(doc => `
        <div class="data-item">
          <div class="header-row">
            <div class="id-values">
              ${doc.short_name}
            </div>
            <span class="date"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span>
          </div>
          <div class="etiquetas-values">
            ${
              doc.divisiones_cnae && doc.divisiones_cnae.length > 0
                ? doc.divisiones_cnae.map(div => `<span>${div}</span>`).join('')
                : ''
            }
          </div>
          <div class="rama-juridica-values">
            ${
              doc.rama_juridica && doc.rama_juridica.length > 0
                ? doc.rama_juridica.map(rama => `<span class="rama-value">${rama}</span>`).join('')
                : ''
            }
          </div>
          <div class="sub-rama-juridica-values">
            ${
              doc.sub_rama_juridica && doc.sub_rama_juridica.length > 0
                ? doc.sub_rama_juridica.map(subRama => `<span class="sub-rama-value"><i><b>#${subRama}</b></i></span>`).join('')
                : ''
            }
          </div>
          <div class="resumen-label">Resumen</div>
          <div class="resumen-content">${doc.resumen}</div>
          <a href="${doc.url_pdf}" target="_blank">Leer más</a>
        </div>
      `).join('');
    }

    // Build chart data
    const documentsByMonth = {};
    allDocuments.forEach(doc => {
      const month = `${doc.anio}-${doc.mes.toString().padStart(2, '0')}`;
      if (!documentsByMonth[month]) {
        documentsByMonth[month] = 0;
      }
      documentsByMonth[month]++;
    });

    const months = Object.keys(documentsByMonth).sort();
    const counts = months.map(month => documentsByMonth[month]);

    // Read and replace tokens in profile.html
    let profileHtml = fs.readFileSync(path.join(__dirname, 'public', 'profile.html'), 'utf8');
    profileHtml = profileHtml
      .replace('{{name}}', user.name)
      .replace('{{email}}', user.email)
      .replace('{{industry_tags}}', user.industry_tags.join(', '))
      .replace('{{industry_tags_json}}', JSON.stringify(user.industry_tags))
      .replace('{{rama_juridicas_json}}', JSON.stringify(userRamas))
      .replace('{{boeDocuments}}', documentsHtml)
      .replace('{{months_json}}', JSON.stringify(months))
      .replace('{{counts_json}}', JSON.stringify(counts))
      .replace('{{subscription_plan}}', JSON.stringify(user.subscription_plan || 'plan1'))
      .replace('{{start_date}}', JSON.stringify(startDate));

    res.send(profileHtml);

  } catch (err) {
    console.error('Error connecting to MongoDB', err);
    res.status(500).send('Error retrieving documents');
  } finally {
    await client.close();
  }
});

const Fuse = require('fuse.js');

app.get('/search-ramas-juridicas', async (req, res) => {
  const query = req.query.q;
  const ramaJuridicaList = [
    "Derecho Civil", "Derecho Mercantil", "Derecho Administrativo", "Derecho Fiscal",
    "Derecho Laboral", "Derecho Procesal-Civil", "Derecho Procesal-Penal", "Derecho Constitucional",
    "Derecho de la UE", "Derecho Internacional Público", "Derecho Internacional Privado"
  ];

  const fuse = new Fuse(ramaJuridicaList, {
    includeScore: true,
    threshold: 0.3,
    ignoreLocation: true,
    minMatchCharLength: 2,
    distance: 100
  });

  const results = fuse.search(query).map(result => result.item);
  res.json(results);
});

app.get('/data', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    // 1) Current user must have industries, or 400
    const user = await usersCollection.findOne({ googleId: req.user.googleId });
    if (!user.industry_tags || user.industry_tags.length === 0) {
      return res.status(400).json({ error: 'No industry tags selected' });
    }

    // 2) Read query
    const collections = req.query.collections || ['BOE'];
    const industry = req.query.industry || 'Todas';
    const ramaValue = req.query.rama || 'Todas';
    const subRamasStr = req.query.subRamas || '';
    const startDate = req.query.desde;
    const endDate = req.query.hasta;

    // Build the query object
    const query = {};

    if (industry.toLowerCase() !== 'todas') {
      query.divisiones_cnae = industry;
    }

    if (ramaValue.toLowerCase() !== 'todas') {
      query.rama_juridica = { $in: [ramaValue] };
    }

    let subRamasArray = [];
    if (subRamasStr.trim() !== '') {
      subRamasArray = subRamasStr.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (subRamasArray.length > 0) {
      query.sub_rama_juridica = { $in: subRamasArray };
    }

    if (startDate || endDate) {
      query.$and = query.$and || [];
      if (startDate) {
        const [anio, mes, dia] = startDate.split('-').map(Number);
        query.$and.push({
          $or: [
            { anio: { $gt: anio } },
            { anio: anio, mes: { $gt: mes } },
            { anio: anio, mes: mes, dia: { $gte: dia } },
          ],
        });
      }
      if (endDate) {
        const [anio, mes, dia] = endDate.split('-').map(Number);
        query.$and.push({
          $or: [
            { anio: { $lt: anio } },
            { anio: anio, mes: { $lt: mes } },
            { anio: anio, mes: mes, dia: { $lte: dia } },
          ],
        });
      }
    }

    console.log('Final query =>', query);

    const projection = {
      short_name: 1, divisiones_cnae: 1, resumen: 1,
      dia: 1, mes: 1, anio: 1, url_pdf: 1,
      rama_juridica: 1, sub_rama_juridica: 1
    };
    let allDocuments = [];
    for (const collectionName of collections) {
      const coll = database.collection(collectionName);
      const docs = await coll.find(query).project(projection).toArray();
      allDocuments = allDocuments.concat(docs);
    }

    // sort descending
    allDocuments.sort((a, b) => {
      const dateA = new Date(a.anio, a.mes - 1, a.dia);
      const dateB = new Date(b.anio, b.mes - 1, b.dia);
      return dateB - dateA;
    });

    // Build HTML or no-results
    let documentsHtml;
    if (allDocuments.length === 0) {
      documentsHtml = `<div class="no-results">No hay resultados para esa búsqueda</div>`;
    } else {
      documentsHtml = allDocuments.map(doc => `
        <div class="data-item">
          <div class="header-row">
            <div class="id-values">
              ${doc.short_name}
            </div>
            <span class="date"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span>
          </div>
          <div class="etiquetas-values">
            ${
              doc.divisiones_cnae
              ? doc.divisiones_cnae.map(div => `<span>${div}</span>`).join('')
              : ''
            }
          </div>
          <div class="rama-juridica-values">
            ${
              doc.rama_juridica && doc.rama_juridica.length > 0
                ? doc.rama_juridica.map(rama => `<span class="rama-value">${rama}</span>`).join('')
                : ''
            }
          </div>
          <div class="sub-rama-juridica-values">
            ${
              doc.sub_rama_juridica && doc.sub_rama_juridica.length > 0
                ? doc.sub_rama_juridica.map(sr => `<span class="sub-rama-value"><i><b>#${sr}</b></i></span>`).join('')
                : ''
            }
          </div>
          <div class="resumen-label">Resumen</div>
          <div class="resumen-content">${doc.resumen}</div>
          <a href="${doc.url_pdf}" target="_blank">Leer más</a>
        </div>
      `).join('');
    }

    // Chart data
    const documentsByMonth = {};
    for (const doc of allDocuments) {
      const month = `${doc.anio}-${String(doc.mes).padStart(2, '0')}`;
      documentsByMonth[month] = (documentsByMonth[month] || 0) + 1;
    }
    const months = Object.keys(documentsByMonth).sort();
    const counts = months.map(m => documentsByMonth[m]);

    res.json({ documentsHtml, months, counts });
  } catch (err) {
    console.error('Error retrieving data:', err);
    res.status(500).json({ error: 'Error retrieving data' });
  } finally {
    await client.close();
  }
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Cancel subscription example
app.delete('/api/cancel-subscription', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'No user in session' });
    }

    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const db = client.db("papyrus");
    await db.collection('users').updateOne(
      { googleId: req.user.googleId },
      {
        $unset: {
          googleId: "",
          email: "",
          name: ""
        }
      }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Error removing user credentials:', err);
    res.status(500).json({ error: 'Failed to remove user credentials' });
  }
});

app.get('/logout', (req, res) => {
  req.session = null;
  res.clearCookie('connect.sid', { path: '/' });
  res.redirect('/index.html');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

/*Stripe*/
app.post('/create-checkout-session', async (req, res) => {
  const {
    plan,
    industry_tags,
    rama_juridicas,
    profile_type,
    sub_rama_map,
    isTrial
  } = req.body;

  try {
    // 1) If plan2 is free => skip Stripe
    if (plan === 'plan2' && IS_PLAN2_FREE === 'yes') {
      console.log("Plan2 is free => skipping Stripe checkout");

      // We can just store the user data in DB as if they've subscribed
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized user' });
      }

      const client = new MongoClient(uri, mongodbOptions);
      await client.connect();
      const db = client.db('papyrus');
      const usersCollection = db.collection('users');

      await usersCollection.updateOne(
        { googleId: req.user.googleId },
        {
          $set: {
            industry_tags,
            rama_juridicas,
            subscription_plan: plan,  // plan2
            profile_type,
            sub_rama_map,
            stripe_subscription_id: null // no stripe sub
          }
        },
        { upsert: true }
      );

      await client.close();
      // Return a response so the front-end knows we didn't call Stripe
      return res.json({
        skipStripe: true,
        redirectUrl: '/profile'
      });
    }

    // 2) Otherwise normal Stripe code
    const priceIdMap = {
      plan2: 'price_1QOlhEEpe9srfTKESkjGMFvI', // live
      plan3: 'price_1QOlwZEpe9srfTKEBRzcNR8A', // test
    };

    if (!priceIdMap[plan]) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    const encodedIndustryTags  = encodeURIComponent(JSON.stringify(industry_tags));
    const encodedRamaJuridicas = encodeURIComponent(JSON.stringify(rama_juridicas));
    const encodedPlan          = encodeURIComponent(plan);
    const encodedProfileType   = encodeURIComponent(profile_type);
    const encodedSubRamaMap    = encodeURIComponent(JSON.stringify(sub_rama_map));

    // Build subscription data
    let subscriptionData = {};
    if (plan === 'plan2' && isTrial) {
      subscriptionData = {
        trial_period_days: 60 // 2-month free trial
      };
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceIdMap[plan],
          quantity: 1
        }
      ],
      mode: 'subscription',
      subscription_data: subscriptionData,
      locale: 'es',
      success_url: `https://papyrus-ai.com/save-user?session_id={CHECKOUT_SESSION_ID}&industry_tags=${encodedIndustryTags}&rama_juridicas=${encodedRamaJuridicas}&plan=${encodedPlan}&profile_type=${encodedProfileType}&sub_rama_map=${encodedSubRamaMap}`,
      cancel_url: 'https://papyrus-ai.com/multistep.html'
    });

    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating Checkout Session:', error);
    res.status(500).json({ error: 'Failed to create Checkout Session' });
  }
});

app.get('/save-user', async (req, res) => {
  const rawIndustryTags = req.query.industry_tags;
  const rawRamaJuridicas = req.query.rama_juridicas;
  const plan = req.query.plan;
  const rawProfileType = req.query.profile_type;
  const rawSubRamaMap = req.query.sub_rama_map;
  const sessionId = req.query.session_id || null;

  if (!req.user) {
    return res.status(401).send('Unauthorized: No logged-in user');
  }

  try {
    const industryTags = JSON.parse(decodeURIComponent(rawIndustryTags));
    const ramaJuridicas = JSON.parse(decodeURIComponent(rawRamaJuridicas));
    const profileType = decodeURIComponent(rawProfileType);

    let subRamaMapObj = {};
    if (rawSubRamaMap) {
      subRamaMapObj = JSON.parse(decodeURIComponent(rawSubRamaMap));
    }

    let stripeSubscriptionId = null;
    if (sessionId) {
      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      if (stripeSession.subscription) {
        stripeSubscriptionId = stripeSession.subscription;
      }
    }

    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const db = client.db("papyrus");
    const usersCollection = db.collection("users");

    const updateFields = {
      industry_tags: industryTags,
      rama_juridicas: ramaJuridicas,
      subscription_plan: plan,
      profile_type,
      sub_rama_map: subRamaMapObj
    };

    if (stripeSubscriptionId) {
      updateFields.stripe_subscription_id = stripeSubscriptionId;
    }

    await usersCollection.updateOne(
      { googleId: req.user.googleId },
      { $set: updateFields },
      { upsert: true }
    );

    res.redirect('/profile');
  } catch (error) {
    console.error('Error saving user data:', error);
    res.status(500).send('Error saving user data');
  }
});

/*free*/
app.post('/save-free-plan', async (req, res) => {
  const { plan, industry_tags, rama_juridicas, profile_type, sub_rama_map } = req.body;
  if (!req.user) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const db = client.db("papyrus");
    const usersCollection = db.collection("users");

    await usersCollection.updateOne(
      { googleId: req.user.googleId },
      {
        $set: {
          industry_tags,
          rama_juridicas,
          subscription_plan: plan,
          profile_type,
          sub_rama_map
        }
      },
      { upsert: true }
    );
    res.json({ redirectUrl: '/profile' });
  } catch (error) {
    console.error('Error saving free plan data:', error);
    res.status(500).send('Error saving user data');
  }
});

/*Cambiar suscripcion*/
app.get('/api/current-user', ensureAuthenticated, async (req, res) => {
  try {
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const db = client.db("papyrus");
    const usersCollection = db.collection("users");

    const user = await usersCollection.findOne({ googleId: req.user.googleId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Return minimal info
    res.json({
      name: user.name || '',
      subscription_plan: user.subscription_plan || 'plan1'
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/current-user-details', ensureAuthenticated, async (req, res) => {
  try {
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const db = client.db("papyrus");
    const usersCollection = db.collection("users");

    const user = await usersCollection.findOne({ googleId: req.user.googleId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return the relevant info
    res.json({
      name: user.name || '',
      subscription_plan: user.subscription_plan || 'plan1',
      industry_tags: user.industry_tags || [],
      rama_juridicas: user.rama_juridicas || []
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/save-same-plan2', async (req, res) => {
  const { plan, industry_tags, rama_juridicas, profile_type, sub_rama_map } = req.body;

  if (!req.user) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const db = client.db("papyrus");
    const usersCollection = db.collection("users");

    await usersCollection.updateOne(
      { googleId: req.user.googleId },
      {
        $set: {
          industry_tags,
          rama_juridicas,
          subscription_plan: plan,
          profile_type,
          sub_rama_map
        }
      },
      { upsert: true }
    );

    // Return JSON with a redirect => /profile
    res.json({ redirectUrl: '/profile' });
  } catch (error) {
    console.error('Error saving same plan2 data:', error);
    res.status(500).send('Error saving user data');
  }
});

app.post('/cancel-plan2', ensureAuthenticated, async (req, res) => {
  const { plan, industry_tags, rama_juridicas, sub_rama_map } = req.body;

  if (!req.user) {
    return res.status(401).send('Unauthorized: No logged-in user');
  }

  let subscriptionId = null;
  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const db = client.db("papyrus");
    const usersCollection = db.collection("users");

    const user = await usersCollection.findOne({ googleId: req.user.googleId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    subscriptionId = user.stripe_subscription_id;
    if (subscriptionId) {
      try {
        await stripe.subscriptions.cancel(subscriptionId);
        console.log(`Cancelled Stripe subscription: ${subscriptionId}`);
      } catch (error) {
        console.error('Error cancelling subscription in Stripe', error);
      }
    }

    await usersCollection.updateOne(
      { googleId: req.user.googleId },
      {
        $set: {
          subscription_plan: plan,
          industry_tags,
          rama_juridicas,
          sub_rama_map,
          stripe_subscription_id: null
        }
      },
      { upsert: true }
    );

    res.json({ redirectUrl: '/profile' });
  } catch (error) {
    console.error('Error switching from plan2 to plan1:', error);
    res.status(500).send('Error switching plan');
  } finally {
    await client.close();
  }
});
