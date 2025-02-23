require('dotenv').config();
const express = require('express');
const passport = require('passport');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const moment = require('moment');
const fs = require('fs');
const { spawn } = require('child_process'); // Import the spawn function
const Fuse = require('fuse.js');
const stripe = require('stripe')(process.env.STRIPE);

//to avoid deprecation error
const mongodbOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true
  }

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
  req.session.returnTo = req.originalUrl;
  return res.redirect('/');
}

// Route to serve multistep.html only if authenticated
app.get('/multistep.html', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'multistep.html'));
});
// Route to serve multistep.html only if authenticated
app.get('/suscripcion.html', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'suscripcion.html'));
});

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve static files from the "public/dist" directory for the built files
app.use('/dist', express.static(path.join(__dirname, 'public/dist')));

const uri = process.env.DB_URI;

app.post('/save-industries', async (req, res) => {
  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const industries = Array.isArray(req.body.industries) ? req.body.industries : [req.body.industries];
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


// New route for email/password login using Passport Local Strategy
app.post('/login', passport.authenticate('local', { 
  successRedirect: '/profile',
  failureRedirect: '/index.html'
}));
 
/*register*/
// Registration route for new users
app.post('/register', async (req, res) => {
  const { email, password, confirmPassword, name } = req.body;
  const bcrypt = require('bcryptjs');
  
  // Basic server-side validation
  if (password !== confirmPassword) {
    return res.status(400).send("Las contraseñas no coinciden.");
  }
  if (password.length < 7) {
    return res.status(400).send("La contraseña debe tener al menos 7 caracteres.");
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return res.status(400).send("La contraseña debe contener al menos un carácter especial.");
  }

  const client = new MongoClient(process.env.DB_URI, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email: email });
    if (existingUser) {
      return res.status(400).send("El usuario ya existe. Por favor, inicia sesión.");
    }
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      email,
      password: hashedPassword,
      name: name || "", // Optional name field
      // You can add other default fields as needed
    };
    
    const result = await usersCollection.insertOne(newUser);
    // Attach the generated _id to newUser so it works with session serialization
    newUser._id = result.insertedId;
    
    // Log in the user immediately after registration
    req.login(newUser, (err) => {
      if (err) {
        console.error("Error during login after registration:", err);
        return res.status(500).send("Registro completado, pero fallo al iniciar sesión.");
      }
      return res.redirect('/profile');
    });
  } catch (err) {
    console.error("Error registering user:", err);
    res.status(500).send("Error al registrar el usuario.");
  } finally {
    await client.close();
  }
});



// Google OAuth routes with prompt to re-authenticate
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }),
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
        
        if (req.session.returnTo) {
          const redirectPath = req.session.returnTo;
          req.session.returnTo = null;  // Clear it
          return res.redirect(redirectPath);
        }
        
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

    // We'll read user.sub_rama_map for the new sub‐rama logic
    const userSubRamaMap = user.sub_rama_map || {};

    const collections = req.query.collections || ['BOE']; // default to BOE if none chosen

    // Calculate the start date for the last ~month (adjust as needed)
    const now = new Date();
    const startDate = new Date();
    startDate.setMonth(now.getMonth() - 1);

    // Query to get docs from startDate to now
    const query = {
      $and: [
        { anio: { $gte: startDate.getFullYear() } },
        {
          $or: [
            { mes: { $gt: startDate.getMonth() + 1 } },
            {
              mes: startDate.getMonth() + 1,
              dia: { $gte: startDate.getDate() }
            }
          ]
        }
      ]
    };

    const projection = {
      short_name: 1,
      divisiones_cnae: 1,
      resumen: 1,
      dia: 1,
      mes: 1,
      anio: 1,
      url_pdf: 1,
      // doc.ramas_juridicas => { "Derecho Civil": [...], "Derecho Fiscal": [...], etc. }
      ramas_juridicas: 1,
      _id:1
    };

    let allDocuments = [];

    // Fetch documents from each selected collection
    for (const collectionName of collections) {
      const collection = database.collection(collectionName);
      const documents = await collection.find(query).project(projection).toArray();
      allDocuments = allDocuments.concat(documents);
    }

    // Sort all documents by date descending
    allDocuments.sort((a, b) => {
      const dateA = new Date(a.anio, a.mes - 1, a.dia);
      const dateB = new Date(b.anio, b.mes - 1, b.dia);
      return dateB - dateA; // descending
    });

    // Filter + annotate documents with matched values
    const filteredDocuments = [];
    for (const doc of allDocuments) {
      // 1) Check CNAE intersection with user.industry_tags
      let cnaes = doc.divisiones_cnae || [];
      if (!Array.isArray(cnaes)) cnaes = [cnaes];
      const matchedCnaes = cnaes.filter(c => user.industry_tags.includes(c));

      // 2) Check rama/sub‐rama intersection
      //    doc.ramas_juridicas => { [ramaName]: arrayOfSubRamas }
      //    user.sub_rama_map => { [ramaName]: arrayOfSubRamasUserWants }

      let matchedRamas = [];
      let matchedSubRamas = [];

      if (doc.ramas_juridicas && typeof doc.ramas_juridicas === 'object') {
        for (const [ramaName, docSubRamas] of Object.entries(doc.ramas_juridicas)) {
          // If the user doesn't have this rama in sub_rama_map, skip
          if (!userSubRamaMap[ramaName]) {
            continue;
          }

          // userSubRamaMap[ramaName] => the array of sub‐ramas the user wants for this rama
          const userSubArr = userSubRamaMap[ramaName];

          // docSubRamas => array of sub‐ramas the doc has for ramaName
          if (!Array.isArray(docSubRamas)) {
            // If it's not an array, ensure we treat it as one
            continue;
          }

          // NEW RULE:
          // (a) If docSubRamas is empty => match if user is subscribed to that ramaName at all
          // (b) If docSubRamas is not empty => intersect with userSubArr, must have at least 1
          if (docSubRamas.length === 0) {
            // The doc has the rama but no sub‐ramas
            // => treat as match if the user is subscribed to that rama
            // i.e. userSubArr is not undefined. (We've already checked that above)
            matchedRamas.push(ramaName);
            // (no sub‐ramas to add to matchedSubRamas)
          } else {
            // The doc does have sub‐ramas => must have at least one intersection
            const intersection = docSubRamas.filter(sr => userSubArr.includes(sr));
            if (intersection.length > 0) {
              matchedRamas.push(ramaName);
              matchedSubRamas = matchedSubRamas.concat(intersection);
            }
          }
        }
      }

      // If either cnae matched or (rama + sub‐rama) matched, we keep the doc
      if (matchedCnaes.length > 0 || matchedRamas.length > 0) {
        // Remove duplicates from matched arrays
        matchedRamas = [...new Set(matchedRamas)];
        matchedSubRamas = [...new Set(matchedSubRamas)];

        // Annotate doc so we can display the coincident values
        doc.matched_cnaes = matchedCnaes;
        doc.matched_rama_juridica = matchedRamas;
        doc.matched_sub_rama_juridica = matchedSubRamas;

        filteredDocuments.push(doc);
      }
    }

    // Now we only display `filteredDocuments`.
    let documentsHtml;
    if (filteredDocuments.length < 1) {
      documentsHtml = `<div class="no-results">No hay resultados para esa búsqueda</div>`;
    } else {
      documentsHtml = filteredDocuments.map(doc => {
        // doc.matched_cnaes => array of coincident CNAEs
        // doc.matched_rama_juridica => array of coincident ramas
        // doc.matched_sub_rama_juridica => array of coincident sub-ramas

        const cnaesHtml = doc.matched_cnaes && doc.matched_cnaes.length > 0
          ? doc.matched_cnaes.map(c => `<span>${c}</span>`).join('')
          : '';

        const ramasHtml = doc.matched_rama_juridica && doc.matched_rama_juridica.length > 0
          ? doc.matched_rama_juridica.map(r => `<span class="rama-value">${r}</span>`).join('')
          : '';

        const subRamasHtml = doc.matched_sub_rama_juridica && doc.matched_sub_rama_juridica.length > 0
          ? doc.matched_sub_rama_juridica
          .map(sr => `<span class="sub-rama-value"><i><b>#${sr}</b></i></span>`).join(' ')
          : '';

        return `
          <div class="data-item">
            <div class="header-row">
              <div class="id-values">${doc.short_name}</div>
              <span class="date"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span>
            </div>
            <div class="etiquetas-values">
              ${cnaesHtml}
            </div>
            <div class="rama-juridica-values">
              ${ramasHtml}
            </div>
            <div class="sub-rama-juridica-values">
              ${subRamasHtml}
            </div>
            
            <div class="resumen-label">Resumen</div>
            <div class="resumen-content">${doc.resumen}</div>
            <a href="${doc.url_pdf}" target="_blank">Leer más: ${doc._id}</a>
           <div> <a href="/norma.html?documentId=${doc._id}">Análisis impacto normativo</a> </div> <!-- Link to the new norma.html page with documentId -->
          </div>
        `;
      }).join('');
    }

    // Build chart data from filteredDocuments
    const documentsByMonth = {};
    filteredDocuments.forEach(doc => {
      const month = `${doc.anio}-${String(doc.mes).padStart(2, '0')}`;
      if (!documentsByMonth[month]) {
        documentsByMonth[month] = 0;
      }
      documentsByMonth[month]++;
    });

    const months = Object.keys(documentsByMonth).sort();
    const counts = months.map(month => documentsByMonth[month]);

    // Read the profile.html template
    let profileHtml = fs.readFileSync(path.join(__dirname, 'public', 'profile.html'), 'utf8');

    // Fill placeholders
    profileHtml = profileHtml
      .replace('{{name}}', user.name)
      .replace('{{email}}', user.email)
      .replace('{{industry_tags}}', user.industry_tags.join(', '))
      .replace('{{industry_tags_json}}', JSON.stringify(user.industry_tags))
      .replace('{{rama_juridicas_json}}', JSON.stringify(user.rama_juridicas || {}))
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

app.get('/search-ramas-juridicas', async (req, res) => {
    const query = req.query.q;

    const ramaJuridicaList = [
       "Derecho Civil",
    "Derecho Mercantil",
    "Derecho Administrativo",
    "Derecho Fiscal",
    "Derecho Laboral",
    "Derecho Procesal-Civil",
    "Derecho Procesal-Penal",
    "Derecho Constitucional",
    "Derecho de la UE",
    "Derecho Internacional Público",
    "Derecho Internacional Privado",
    "Derecho Penal Económico",
    "Derecho Informático",
    "Derecho Ambiental"
    ];

    const fuse = new Fuse(ramaJuridicaList, {
        includeScore: true,
        threshold: 0.3, // Increase threshold to make matching less strict
        ignoreLocation: true, // Allows matches anywhere in the string
        minMatchCharLength: 2, // Ensures partial matches for short queries
        distance: 100 // Adjust for token distance in matches
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

    // 1) Ensure current user has industry tags
    const user = await usersCollection.findOne({ googleId: req.user.googleId });
    if (!user.industry_tags || user.industry_tags.length === 0) {
      return res.status(400).json({ error: 'No industry tags selected' });
    }

    // We'll read the user's sub_rama_map for sub‐rama logic
    const userSubRamaMap = user.sub_rama_map || {};

    // 2) Read query (from frontend)
    // e.g.: ?collections[]=BOE&collections[]=BOCM&industry=Todas&rama=Todas&subRamas=...&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
    const collections = req.query.collections || ['BOE'];
    const industry = req.query.industry || 'Todas';

    // We'll handle ramaValue & subRamas in post-filter
    const ramaValue = req.query.rama || 'Todas';
    const subRamasStr = req.query.subRamas || '';
    const startDate = req.query.desde;
    const endDate = req.query.hasta;

    // 3) Build partial DB-level query
    const query = {};

    // If industry != 'Todas', filter by doc.divisiones_cnae at DB level
    if (industry.toLowerCase() !== 'todas') {
      query.divisiones_cnae = industry;
    }

    // Note: We do NOT directly filter for ramaValue/subRamas,
    // because doc.ramas_juridicas is stored as an object, not an array.

    // 4) Date range filter (startDate <= doc date <= endDate)
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

    console.log('Final DB-level query =>', JSON.stringify(query, null, 2));

    // 5) Fetch from each collection
    const projection = {
      short_name: 1,
      divisiones_cnae: 1,
      resumen: 1,
      dia: 1,
      mes: 1,
      anio: 1,
      url_pdf: 1,
      // e.g. ramas_juridicas: { "Derecho Civil": [...], "Derecho Fiscal": [...] }
      ramas_juridicas: 1
    };

    let allDocuments = [];
    for (const collectionName of collections) {
      const coll = database.collection(collectionName);
      const docs = await coll.find(query).project(projection).toArray();
      allDocuments = allDocuments.concat(docs);
    }

    // 6) Sort descending by date
    allDocuments.sort((a, b) => {
      const dateA = new Date(a.anio, a.mes - 1, a.dia);
      const dateB = new Date(b.anio, b.mes - 1, b.dia);
      return dateB - dateA;
    });

    // 7) Read the chosen subRamas from the UI for post-filter
    let chosenSubRamas = [];
    if (subRamasStr.trim() !== '') {
      chosenSubRamas = subRamasStr.split(',').map(s => s.trim()).filter(Boolean);
    }

    // 8) Post-filter docs
    // The doc is considered a match if:
    //   (a) doc intersects with user’s CNAEs, or
    //   (b) doc intersects with user’s ramas_juridicas. Specifically:
    //       - If doc has no sub-ramas for that rama => user must have "genérico"
    //       - If doc has sub-ramas => at least 1 overlaps with user

    const filteredDocuments = [];
    for (const doc of allDocuments) {
      // (A) Check CNAEs
      let cnaes = doc.divisiones_cnae || [];
      if (!Array.isArray(cnaes)) cnaes = [cnaes];
      const matchedCnaes = cnaes.filter(c => user.industry_tags.includes(c));

      // (B) Check ramas_juridicas
      let matchedRamas = [];
      let matchedSubRamas = [];

      if (doc.ramas_juridicas && typeof doc.ramas_juridicas === 'object') {
        for (const [ramaName, rawSubRamas] of Object.entries(doc.ramas_juridicas)) {
          // If user isn't subscribed to this rama => skip
          const userSubArr = userSubRamaMap[ramaName] || null;
          if (!userSubArr) continue;

          // Convert docSubRamas to a real array
          const docSubRamas = Array.isArray(rawSubRamas) ? rawSubRamas : [];

          // If doc has NO sub-ramas => match only if user has "genérico"
          if (docSubRamas.length === 0) {
            if (userSubArr.includes("genérico")) {
              matchedRamas.push(ramaName);
              // <-- IMPORTANT:
              // If user specifically selects "genérico" in the UI, we want doc to pass.
              // So let's push "genérico" into matchedSubRamas to help the intersection check below.
              matchedSubRamas.push("genérico");
            }
          } else {
            // docSubRamas is non-empty => at least 1 overlap
            const intersection = docSubRamas.filter(sr => userSubArr.includes(sr));
            if (intersection.length > 0) {
              matchedRamas.push(ramaName);
              matchedSubRamas = matchedSubRamas.concat(intersection);
            }
          }
        }
      }

      // (C) If user specifically chose a ramaValue != 'Todas', ensure matchedRamas includes that
      let passesChosenRama = true;
      if (ramaValue.toLowerCase() !== 'todas') {
        passesChosenRama = matchedRamas.includes(ramaValue);
      }

      // (D) If user specifically chose subRamas, ensure at least one intersection
      let passesChosenSubRamas = true;
      if (chosenSubRamas.length > 0) {
        const docIntersection = matchedSubRamas.filter(sr => chosenSubRamas.includes(sr));
        passesChosenSubRamas = docIntersection.length > 0;
      }

      // (E) Keep the doc if:
      //   - (matchedCnaes > 0) OR (matchedRamas > 0)
      //   - passesChosenRama
      //   - passesChosenSubRamas
      if ((matchedCnaes.length > 0 || matchedRamas.length > 0) &&
          passesChosenRama &&
          passesChosenSubRamas) {

        matchedRamas = [...new Set(matchedRamas)];
        matchedSubRamas = [...new Set(matchedSubRamas)];

        // Annotate doc for rendering
        doc.matched_cnaes = matchedCnaes;
        doc.matched_rama_juridica = matchedRamas;
        doc.matched_sub_rama_juridica = matchedSubRamas;

        filteredDocuments.push(doc);
      }
    }

    // 9) Build the HTML
    let documentsHtml;
    if (filteredDocuments.length === 0) {
      documentsHtml = `<div class="no-results">No hay resultados para esa búsqueda</div>`;
    } else {
      documentsHtml = filteredDocuments.map(doc => {
        const cnaesHtml = (doc.matched_cnaes || [])
          .map(div => `<span>${div}</span>`)
          .join('');

          const ramaHtml = (doc.matched_rama_juridica || [])
          .map(r => `<span class="rama-value">${r}</span>`)
          .join('');

        const subRamasHtml = (doc.matched_sub_rama_juridica || [])
          .map(sr => `<span class="sub-rama-value"><i><b>#${sr}</b></i></span>`)
          .join(' ');

        return `
          <div class="data-item">
            <div class="header-row">
              <div class="id-values">${doc.short_name}</div>
              <span class="date"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span>
            </div>
            <div class="etiquetas-values">${cnaesHtml}</div>
            <div class="rama-juridica-values">${ramaHtml}</div>
            <div class="sub-rama-juridica-values">${subRamasHtml}</div>
            
            <div class="resumen-label">Resumen</div>
            <div class="resumen-content">${doc.resumen}</div>
            <a href="${doc.url_pdf}" target="_blank">Leer más: ${doc._id}</a>
            <a href="/norma.html?documentId=${doc._id}">Análisis impacto</a> <!-- Link to the new norma.html page with documentId -->
          </div>
        `;
      }).join('');
    }

    // 10) Build months & counts for the chart
    const documentsByMonth = {};
    for (const doc of filteredDocuments) {
      const month = `${doc.anio}-${String(doc.mes).padStart(2, '0')}`;
      documentsByMonth[month] = (documentsByMonth[month] || 0) + 1;
    }
    const months = Object.keys(documentsByMonth).sort();
    const counts = months.map(m => documentsByMonth[m]);

    // 11) Return JSON with documentsHtml, months & counts
    res.json({
      documentsHtml,
      months,
      counts
    });

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

// In your server code (app.js)
app.delete('/api/cancel-subscription', async (req, res) => {
  try {
    // We'll assume your user is in req.user
    // or maybe in req.session.passport.user, etc.
    // Example: user => { googleId, email, name, ... }
    if (!req.user) {
      return res.status(401).json({ error: 'No user in session' });
    }

    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const db = client.db("papyrus");
    // Instead of deleteOne => we do updateOne with $unset
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
  // Destroy the session and clear cookies manually
  req.session = null; 
  res.clearCookie('connect.sid', { path: '/' }); // Clear session cookie
  
  // Redirect directly to index.html
  res.redirect('/index.html');
});

// New endpoint to fetch norma details
app.get('/api/norma-details', ensureAuthenticated, async (req, res) => {
    const documentId = req.query.documentId;

    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const database = client.db("papyrus");
        const collection = database.collection("BOE"); // Assuming "BOE" is the collection

        const document = await collection.findOne({ _id: documentId });
        if (document) {
            res.json({ short_name: document.short_name });
        } else {
            res.status(404).json({ error: 'Document not found' });
        }
    } catch (err) {
        console.error('Error fetching norma details:', err);
        res.status(500).json({ error: 'Error fetching norma details' });
    } finally {
        await client.close();
    }
});

// New endpoint to trigger Python script
app.post('/api/analyze-norma', ensureAuthenticated, async (req, res) => {
  const documentId = req.body.documentId;
  const userPrompt = req.body.userPrompt; // Get the user's prompt from the request body

  // Path to your Python script
  const pythonScriptPath = path.join(__dirname, 'questionsMongo.py');

  console.log(`Analyzing norma with documentId: ${documentId}, User Prompt: ${userPrompt}`); //Log the document ID

  try {
      // Spawn a new process to execute the Python script
      const pythonProcess = spawn('python', [pythonScriptPath, documentId, userPrompt]); // Pass documentId and userPrompt as arguments

      let result = '';
      let errorOutput = '';

      // Capture the output from the Python script
      pythonProcess.stdout.on('data', (data) => {
          result += data.toString();
           console.log(`Python stdout: ${data.toString()}`);
      });

      // Capture errors from the Python script
      pythonProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
           console.error(`Python stderr: ${data.toString()}`);
      });

      // Handle process completion
      pythonProcess.on('close', (code) => {
          if (code !== 0) {
              console.error(`Python script exited with code ${code}`, errorOutput);
              return res.status(500).send(`Python script failed with error: ${errorOutput}`);
          }

          // Send the result back to the client
          res.send(result);
      });

  } catch (error) {
      console.error('Error executing Python script:', error);
      res.status(500).send('Error executing Python script');
  }
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
    isTrial // <--- NEW param from client
  } = req.body;

  try {
    const priceIdMap = {
      plan2: 'price_1QOlhEEpe9srfTKESkjGMFvI', //live
      plan3: 'price_1QOlwZEpe9srfTKEBRzcNR8A', //test
    };

    if (!priceIdMap[plan]) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    // Encode your data for the success_url
    const encodedIndustryTags  = encodeURIComponent(JSON.stringify(industry_tags));
    const encodedRamaJuridicas = encodeURIComponent(JSON.stringify(rama_juridicas));
    const encodedPlan          = encodeURIComponent(plan);
    const encodedProfileType   = encodeURIComponent(profile_type);
    const encodedSubRamaMap    = encodeURIComponent(JSON.stringify(sub_rama_map));

    // Build base subscription data
    let subscriptionData = {};
    // If plan2, set trial_period_days: 60
    if (plan === 'plan2' && isTrial) {
      subscriptionData = {
        trial_period_days: 60,  // 2-month free trial
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

      // If plan2 is in trial:
      subscription_data: subscriptionData,
      locale: 'es', // 'es' for Spanish

      success_url: `https://app.papyrus-ai.com/save-user?session_id={CHECKOUT_SESSION_ID}&industry_tags=${encodedIndustryTags}&rama_juridicas=${encodedRamaJuridicas}&plan=${encodedPlan}&profile_type=${encodedProfileType}&sub_rama_map=${encodedSubRamaMap}`,
      cancel_url: 'https://app.papyrus-ai.com/multistep.html',
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
  const rawCobertura_legal = req.query.cobertura_legal;
  const rawCompanyName = req.query.company_name;

  // [ADDED] sub_rama_map
  const rawSubRamaMap = req.query.sub_rama_map;

  // [NEW] read session_id if present
  const sessionId = req.query.session_id || null;

  if (!req.user) {
    return res.status(401).send('Unauthorized: No logged-in user');
  }

  try {
    const industryTags = JSON.parse(decodeURIComponent(rawIndustryTags));
    const ramaJuridicas = JSON.parse(decodeURIComponent(rawRamaJuridicas));
    const profileType = decodeURIComponent(rawProfileType);
    const cobertura_legal = JSON.parse(decodeURIComponent(rawCobertura_legal));
    const company_name = JSON.parse(decodeURIComponent(rawCompanyName));


    // [CHANGED] parse sub_rama_map
    let subRamaMapObj = {};
    if (rawSubRamaMap) {
      subRamaMapObj = JSON.parse(decodeURIComponent(rawSubRamaMap));
    }

    // 1) Possibly retrieve the subscription ID from Stripe if sessionId is present
    let stripeSubscriptionId = null;
    if (sessionId) {
      // retrieve session from Stripe
      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      // the subscription ID is stored in stripeSession.subscription
      if (stripeSession.subscription) {
        stripeSubscriptionId = stripeSession.subscription;
      }
    }

    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    // 2) Update the user in DB with subscription_plan, plus the subscription_id if we got it
    const updateFields = {
      industry_tags: industryTags,
      rama_juridicas: ramaJuridicas,
      subscription_plan: plan,
      profile_type: profileType,
      sub_rama_map: subRamaMapObj,
      cobertura_legal: cobertura_legal ,
      company_name : company_name
    };

    // if we have a valid subscription ID, store it as well
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
  const { plan, industry_tags, rama_juridicas, profile_type, sub_rama_map,cobertura_legal,company_name} = req.body; 
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
          sub_rama_map,
          cobertura_legal,
          company_name 
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
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");
    const user = await usersCollection.findOne({ googleId: req.user.googleId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Return minimal info
    res.json({
      name: user.name || '',
      subscription_plan: user.subscription_plan || 'plan1' // default
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
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ googleId: req.user.googleId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return the relevant info
    res.json({
      name: user.name || '',
      subscription_plan: user.subscription_plan || 'plan1',
      industry_tags: user.industry_tags || [],       // array of strings
      rama_juridicas: user.rama_juridicas || []      // array of strings
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/save-same-plan2', async (req, res) => {
  // This is only called if the user is STILL on plan2, 
  // and we want to just update the new industries/ramas.
  const { plan, industry_tags, rama_juridicas, profile_type, sub_rama_map, cobertura_legal,company_name} = req.body; 
  
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
          subscription_plan: plan,  // still plan2
          profile_type,
          sub_rama_map,
          cobertura_legal,
          company_name
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
  // 1) read incoming data
  const { plan, industry_tags, rama_juridicas, sub_rama_map } = req.body;

  if (!req.user) {
    return res.status(401).send('Unauthorized: No logged-in user');
  }

  // 2) logic to cancel the existing plan2 subscription on Stripe

  let subscriptionId = null; // or read from user doc
  // We'll show an example approach below.

  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const db = client.db("papyrus");
    const usersCollection = db.collection("users");

    // 2a) Find the user in DB
    const user = await usersCollection.findOne({ googleId: req.user.googleId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // read subscriptionId from user doc if you store it
    subscriptionId = user.stripe_subscription_id; // or however you name it
    if (!subscriptionId) {
      console.warn('No subscription id found to cancel. Possibly user never had plan2 or we never saved subscription_id');
    } else {
      // 2b) Cancel the subscription in Stripe
      try {
        await stripe.subscriptions.cancel(subscriptionId);
        console.log(`Cancelled Stripe subscription: ${subscriptionId}`);
      } catch (error) {
        console.error('Error cancelling subscription in Stripe', error);
        // If you want to handle error, do it here. Possibly return or continue
      }
    }

    // 3) Now update user => switch to plan1, store new data
    await usersCollection.updateOne(
      { googleId: req.user.googleId },
      {
        $set: {
          subscription_plan: plan,  // "plan1"
          industry_tags,
          rama_juridicas,
          sub_rama_map,
          // Possibly also remove subscription_id if you store it
          stripe_subscription_id: null
        }
      },
      { upsert: true }
    );

    // 4) Return JSON with a redirect => /profile
    res.json({ redirectUrl: '/profile' });
  } catch (error) {
    console.error('Error switching from plan2 to plan1:', error);
    res.status(500).send('Error switching plan');
  } finally {
    await client.close();
  }
});