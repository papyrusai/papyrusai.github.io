require('dotenv').config();
const express = require('express');
const passport = require('passport');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const moment = require('moment');
const fs = require('fs');
const { spawn } = require('child_process'); // Import the spawn function
const Fuse = require('fuse.js');
const stripe = require('stripe')(process.env.STRIPE);

const SPECIAL_DOMAIN = "@cuatrecasas.com";
const SPECIAL_ADDRESS = "xx";

// Añadir al inicio del archivo, junto con otros imports
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY); // Asegúrate de tener esta variable en tu .env


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
/*
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
*/
app.use(session({ 
  secret: process.env.SESSION_SECRET || 'default_session_secret', 
  resave: false, 
  saveUninitialized: false, 
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // Only use secure in production
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    httpOnly: true 
  } 
}));


app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html')); // Serve the global index.html
});


// This array holds the A&O labels in JS
// but in the database, they will be stored under the key "etiquetas_ao".
const etiquetasAandO = [
  "Chemicals",
  "Consumer and retail",
  "Communications, media and entertainment - Sports",
  "Communications, media and entertainment - Media",
  "Communications, media and entertainment - Telecommunications",
  "Energy - Oil and gas",
  "Energy - Hydrogen",
  "Energy - Carbon capture and storage",
  "Energy - Power",
  "Energy - Energy networks",
  "Energy - Nuclear",
  "Financial institutions - Banks",
  "Financial institutions - Insurance",
  "Financial institutions - Fintech",
  "Industrials and manufacturing - Automotive",
  "Industrials and manufacturing - Aerospace and defense",
  "Infrastructure and transport - Aviation",
  "Infrastructure and transport - Digital infrastructure",
  "Life sciences and healthcare",
  "Mining and metals",
  "Private capital - Family office",
  "Private capital - Infrastructure funds",
  "Private capital - Private credit",
  "Private capital - Private equity",
  "Private capital - Sovereign wealth and institutional investors",
  "Capital solutions",
  "Technology"
];

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

app.get('/paso1.html', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'paso1.html'));
});

app.get('/profile.html', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/suscripcion.html', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'suscripcion.html'));
});

app.get('/norma.html', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'norma.html'));
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
      { _id: new ObjectId(req.user._id) },
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

async function processSpecialDomainUser(user) {
  // Create a new connection to check/create the special user.
  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    // Check if a special user exists with this email.
    const specialUser = await usersCollection.findOne({ email: user.email });
    if (specialUser) {
      return specialUser;
    } else {
      // Create a new user with the special defaults.
      const specialDefaults = {
        email: user.email,
        cobertura_legal: {
          "Nacional y Europeo": ["BOE", "DOUE"],
          "Autonomico": ["BOA", "BOCM", "BOCYL", "BOJA", "BOPV"],
          "Reguladores": ["CNMV"]
        },
        profile_type: "Departamento conocimiento",
        company_name: "Cuatrecasas",
        subscription_plan: "plan2",
        etiquetas_cuatrecasas: [
          "Arbitraje Internacional",
          "Competencia",
          "Deporte y Entretenimiento",
          "Empresa y Derechos Humanos",
          "Energía e Infraestructura",
          "Farmacéutico y Sanitario",
          "Financiero",
          "Fiscalidad Contenciosa",
          "Fiscalidad Corporativa",
          "Fiscalidad Financiera",
          "Fiscalidad Indirecta",
          "Fondos",
          "Gobierno Corporativo y Compliance",
          "Inmobiliario y Urbanismo",
          "Laboral",
          "Litigación",
          "Mercado de Capitales",
          "Mercantil y M&A",
          "Penal",
          "Precios de Transferencia y Tax Governance",
          "Private Client & Wealth Management",
          "Private Equity",
          "Propiedad Intelectual, Industrial y Secretos",
          "Protección de Datos",
          "Público",
          "Reestructuraciones, Insolvencias y Situaciones Especiales",
          "Servicios Financieros y de Seguros",
          "Tecnologías y Medios Digitales",
          "Venture Capital"
        ]
      };
      const result = await usersCollection.insertOne(specialDefaults);
      specialDefaults._id = result.insertedId;
      return specialDefaults;
    }
  } finally {
    await client.close();
  }
}

async function processAODomainUser(user) {
  // This is specifically for A&O
  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    // Check if the user already exists
    const aoUser = await usersCollection.findOne({ email: user.email });
    if (aoUser) {
      return aoUser;
    } else {
      // Create a new user with A&O defaults
      // Notice how the property name in the DB is "etiquetas_ao"
      const specialDefaults = {
        email: user.email,
        cobertura_legal: {
          "Nacional y Europeo": ["BOE", "DOUE"],
          "Autonomico": ["BOA", "BOCM", "BOCYL", "BOJA", "BOPV"],
          "Reguladores": ["CNMV"]
        },
        profile_type: "Departamento conocimiento",
        company_name: "A&O", // or "Allen & Overy"
        subscription_plan: "plan2",
        etiquetas_ao: etiquetasAandO
      };

      const result = await usersCollection.insertOne(specialDefaults);
      specialDefaults._id = result.insertedId;
      return specialDefaults;
    }
  } finally {
    await client.close();
  }
}


// New route for email/password login using Passport Local Strategy
app.post('/login', (req, res, next) => {
  passport.authenticate('local', async (err, user, info) => {
    if (err) {
      return res.status(500).json({ error: "Error interno de autenticación" });
    }
    if (!user) {
      return res.status(400).json({
        error: "Correo o contraseña equivocada, por favor, intente de nuevo o regístrese"
      });
    }

    req.logIn(user, async (err) => {
      if (err) {
        return res.status(500).json({ error: "Error al iniciar sesión" });
      }

      // If the email ends with Cuatrecasas domain
      if (user.email.toLowerCase().endsWith(SPECIAL_DOMAIN)) {
        await processSpecialDomainUser(user);
        return res.status(200).json({ redirectUrl: '/profile_cuatrecasas' });
      }

      // If the email ends with A&O domain
      if (user.email.toLowerCase().endsWith(SPECIAL_ADDRESS)) {
        await processAODomainUser(user);
        return res.status(200).json({ redirectUrl: '/profile_a&o' });
      }

      // Otherwise normal flow
      if (user.subscription_plan) {
        return res.status(200).json({ redirectUrl: '/profile' });
        //return res.redirect('/profile');
      } else {
        return res.status(200).json({ redirectUrl: '/paso1.html' });
      }
    });
  })(req, res, next);
});


 
/*register*/
// Registration route for new users
app.post('/register', async (req, res) => {
  const { email, password, confirmPassword } = req.body;
  const bcrypt = require('bcryptjs');

  // Basic validations
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Las contraseñas no coinciden." });
  }
  if (password.length < 7) {
    return res.status(400).json({
      error: "La contraseña debe tener al menos 7 caracteres."
    });
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return res.status(400).json({
      error: "La contraseña debe contener al menos un carácter especial."
    });
  }

  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    // Check if user exists by email
    const existingUser = await usersCollection.findOne({ email: email });
    if (existingUser) {
      return res.status(400).json({
        error: "El usuario ya existe, por favor inicia sesión"
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      email,
      password: hashedPassword
      // subscription_plan remains undefined for new users
    };

    const result = await usersCollection.insertOne(newUser);
    newUser._id = result.insertedId;

    req.login(newUser, async (err) => {
      if (err) {
        console.error("Error during login after registration:", err);
        return res.status(500).json({
          error: "Registro completado, pero fallo al iniciar sesión"
        });
      }

      // If the email is Cuatrecasas
      if (newUser.email.toLowerCase().endsWith(SPECIAL_DOMAIN)) {
        await processSpecialDomainUser(newUser);
        return res.status(200).json({ redirectUrl: '/profile_cuatrecasas' });
      }

      // If the email is A&O
      if (newUser.email.toLowerCase().endsWith(SPECIAL_ADDRESS)) {
        await processAODomainUser(newUser);
        return res.status(200).json({ redirectUrl: '/profile_a&o' });
      }

      // Otherwise normal new user flow
      return res.status(200).json({ redirectUrl: '/paso1.html' });
    });
  } catch (err) {
    console.error("Error registering user:", err);
    return res.status(500).json({ error: "Error al registrar el usuario." });
  } finally {
    await client.close();
  }
});




app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  async (req, res) => {
    const client = new MongoClient(uri, mongodbOptions);
    try {
      await client.connect();
      const database = client.db("papyrus");
      const usersCollection = database.collection("users");

      // Fetch the user from DB
      const existingUser = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });

      // If user is Cuatrecasas
      if (req.user.email.toLowerCase().endsWith(SPECIAL_DOMAIN)) {
        await processSpecialDomainUser(req.user);
        return res.redirect('/profile_cuatrecasas');
      }

      // If user is A&O
      if (req.user.email.toLowerCase().endsWith(SPECIAL_ADDRESS)) {
        await processAODomainUser(req.user);
        return res.redirect('/profile_a&o');
      }

      // Otherwise normal flow
      if (existingUser && existingUser.industry_tags && existingUser.industry_tags.length > 0) {
        if (req.session.returnTo) {
          const redirectPath = req.session.returnTo;
          req.session.returnTo = null;
          return res.redirect(redirectPath);
        }
        return res.redirect('/profile');
      } else {
        return res.redirect('/paso1.html');
      }
    } catch (err) {
      console.error('Error connecting to MongoDB', err);
      return res.redirect('/');
    } finally {
      await client.close();
    }
  }
);


//
// 1) PROFILE_CUATRECASAS
//
app.get('/profile_cuatrecasas', ensureAuthenticated, async (req, res) => {
  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const boeCollection = database.collection("BOE"); // Hardcoded to "BOE"

    const projection = {
      short_name: 1,
      etiquetas_cuatrecasas: 1,
      dia: 1,
      mes: 1,
      anio: 1,
      resumen: 1,
      url_pdf: 1,
      _id: 1,
      seccion: 1,
      rango_titulo: 1
    };

    // Attempt to load docs for today's date
    const today = new Date();
    const queryToday = {
      anio: today.getFullYear(),
      mes: today.getMonth() + 1,
      dia: today.getDate()
    };

    let docs = await boeCollection.find(queryToday).project(projection).toArray();
    let docDate = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;

    // If none found, load the most recent
    if (docs.length === 0) {
      const latestDocsArr = await boeCollection.find({})
        .sort({ anio: -1, mes: -1, dia: -1 })
        .limit(1)
        .toArray();
      if (latestDocsArr.length > 0) {
        const latestDoc = latestDocsArr[0];
        const queryLatest = {
          anio: latestDoc.anio,
          mes: latestDoc.mes,
          dia: latestDoc.dia
        };
        docs = await boeCollection.find(queryLatest).project(projection).toArray();
        docDate = `${latestDoc.dia}-${latestDoc.mes}-${latestDoc.anio}`;
      }
    }

    // Mark each doc
    docs.forEach(doc => {
      doc.collectionName = "BOE";
    });

    // Build HTML with thumbs icons
    let documentsHtml = "";
    docs.forEach(doc => {
      let etiquetasHtml = "";
      if (
        doc.etiquetas_cuatrecasas &&
        Array.isArray(doc.etiquetas_cuatrecasas) &&
        doc.etiquetas_cuatrecasas.length > 0
      ) {
        etiquetasHtml = doc.etiquetas_cuatrecasas.map(e => `<span>${e}</span>`).join('');
      } else {
        etiquetasHtml = `<span>Genérico</span>`;
      }

      const rangoToShow = doc.rango_titulo || "Indefinido";

      documentsHtml += `
        <div class="data-item">
          <div class="header-row">
            <div class="id-values">${doc.short_name}</div>
            <span class="date"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span>
          </div>
          <div style="color: gray; font-size: 1.1em; margin-bottom: 6px;">
             ${rangoToShow}
          </div>
          <div class="etiquetas-values">
            ${etiquetasHtml}
          </div>
          <div class="resumen-label">Resumen</div>
          <div class="resumen-content">${doc.resumen}</div>
          <div class="margin-impacto">
            <a class="button-impacto" href="/norma.html?documentId=${doc._id}&collectionName=${doc.collectionName}">
              Análisis impacto normativo
            </a>
          </div>
          <a class="leer-mas" href="${doc.url_pdf}" target="_blank" style="margin-right: 15px;">
            Leer más: ${doc._id}
          </a>
          <!-- Thumbs up/down icons -->
          <i class="fa fa-thumbs-up thumb-icon" onclick="sendFeedback('${doc._id}', 'like', this)"></i>
          <i class="fa fa-thumbs-down thumb-icon" style="margin-left: 10px;"
             onclick="sendFeedback('${doc._id}', 'dislike', this)"></i>

          <!-- Hidden for filters -->
          <span class="doc-seccion" style="display:none;">${doc.seccion || "Disposiciones generales"}</span>
          <span class="doc-rango" style="display:none;">${rangoToShow}</span>
        </div>
      `;
    });

    let template = fs.readFileSync(
      path.join(__dirname, 'public', 'profile_cuatrecasas.html'),
      'utf8'
    );
    template = template.replace('{{boeDocuments}}', documentsHtml);
    template = template.replace('{{documentDate}}', docDate);

    // Insert user name
    const usersCollection = database.collection("users");
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    template = template.replace('{{name}}', user.name || '');

    // CSS + script for feedback
    const feedbackScript = `
      <style>
        .thumb-icon {
          border: 2px solid #092534;
          border-radius: 4px;
          padding: 4px;
          color: #092534;
          cursor: pointer;
        }
        .thumb-icon.selected {
          background-color: #092534;
          color: #fff;
        }
      </style>
      <script>
        function sendFeedback(docId, feedbackType, element) {
          // Toggle the 'selected' class on the clicked icon
          element.classList.toggle('selected');

          // Optionally, if you want to unselect the other icon in the same data-item, do that here.
          // For now, we just independently toggle the clicked one.

          fetch('/feedback-thumbs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ docId: docId, feedback: feedbackType })
          })
          .then(response => response.json())
          .then(data => {
            console.log('Feedback response:', data);
          })
          .catch(err => console.error('Error sending feedback:', err));
        }
      </script>
    `;
    template += feedbackScript;

    res.send(template);
  } catch (err) {
    console.error("Error in /profile_cuatrecasas:", err);
    res.status(500).send("Error retrieving documents");
  } finally {
    await client.close();
  }
});

//
// 2) PROFILE_A&O
//
app.get('/profile_a&o', ensureAuthenticated, async (req, res) => {
  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const boeCollection = database.collection("BOE");

    const projection = {
      short_name: 1,
      etiquetas_ao: 1,
      dia: 1,
      mes: 1,
      anio: 1,
      resumen: 1,
      url_pdf: 1,
      _id: 1,
      seccion: 1,
      rango_titulo: 1
    };

    const today = new Date();
    const queryToday = {
      anio: today.getFullYear(),
      mes: today.getMonth() + 1,
      dia: today.getDate()
    };

    let docs = await boeCollection.find(queryToday).project(projection).toArray();
    let docDate = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;

    if (docs.length === 0) {
      const latestDocsArr = await boeCollection.find({})
        .sort({ anio: -1, mes: -1, dia: -1 })
        .limit(1)
        .toArray();
      if (latestDocsArr.length > 0) {
        const latestDoc = latestDocsArr[0];
        const queryLatest = {
          anio: latestDoc.anio,
          mes: latestDoc.mes,
          dia: latestDoc.dia
        };
        docs = await boeCollection.find(queryLatest).project(projection).toArray();
        docDate = `${latestDoc.dia}-${latestDoc.mes}-${latestDoc.anio}`;
      }
    }

    docs.forEach(doc => {
      doc.collectionName = "BOE";
    });

    let documentsHtml = "";
    docs.forEach(doc => {
      let etiquetasHtml = "";
      const aoTags = doc.etiquetas_ao;
      if (aoTags && Array.isArray(aoTags) && aoTags.length > 0) {
        etiquetasHtml = aoTags.map(e => `<span>${e}</span>`).join('');
      } else {
        etiquetasHtml = `<span>Genérico</span>`;
      }

      const rangoToShow = doc.rango_titulo || "Indefinido";

      documentsHtml += `
        <div class="data-item">
          <div class="header-row">
            <div class="id-values">${doc.short_name}</div>
            <span class="date"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span>
          </div>
          <div style="color: gray; font-size: 1.1em; margin-bottom: 6px;">
            ${rangoToShow}
          </div>
          <div class="etiquetas-values">
            ${etiquetasHtml}
          </div>
          <div class="resumen-label">Resumen</div>
          <div class="resumen-content">${doc.resumen}</div>
          <div class="margin-impacto">
            <a class="button-impacto" href="/norma.html?documentId=${doc._id}&collectionName=${doc.collectionName}">
              Análisis impacto normativo
            </a>
          </div>
          <a class="leer-mas" href="${doc.url_pdf}" target="_blank" style="margin-right: 15px;">
            Leer más: ${doc._id}
          </a>
          <!-- Thumbs up/down icons -->
          <i class="fa fa-thumbs-up thumb-icon" onclick="sendFeedback('${doc._id}', 'like', this)"></i>
          <i class="fa fa-thumbs-down thumb-icon" style="margin-left: 10px;"
             onclick="sendFeedback('${doc._id}', 'dislike', this)"></i>

          <span class="doc-seccion" style="display:none;">${doc.seccion || "Disposiciones generales"}</span>
          <span class="doc-rango" style="display:none;">${rangoToShow}</span>
        </div>
      `;
    });

    let template = fs.readFileSync(
      path.join(__dirname, 'public', 'profile_a&o.html'),
      'utf8'
    );
    template = template.replace('{{boeDocuments}}', documentsHtml);
    template = template.replace('{{documentDate}}', docDate);

    const usersCollection = database.collection("users");
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    template = template.replace('{{name}}', user.name || '');

    // Add style + feedback script
    const feedbackScript = `
      <style>
        .thumb-icon {
          border: 2px solid #092534;
          border-radius: 4px;
          padding: 4px;
          color: #092534;
          cursor: pointer;
        }
        .thumb-icon.selected {
          background-color: #092534;
          color: #fff;
        }
      </style>
      <script>
        function sendFeedback(docId, feedbackType, element) {
          element.classList.toggle('selected');

          fetch('/feedback-thumbs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ docId: docId, feedback: feedbackType })
          })
          .then(response => response.json())
          .then(data => {
            console.log('Feedback response:', data);
          })
          .catch(err => console.error('Error sending feedback:', err));
        }
      </script>
    `;
    template += feedbackScript;

    res.send(template);
  } catch (err) {
    console.error("Error in /profile_a&o:", err);
    res.status(500).send("Error retrieving documents");
  } finally {
    await client.close();
  }
});

//
// 3) NORMAL PROFILE
//
app.get('/profile', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/');
  }
  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    // Retrieve the logged-in user
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    const userSubRamaMap = user.sub_rama_map || {};
    const userSubIndustriaMap = user.sub_industria_map || {};
    // NEW: Extract user's industries, ramas, and rangos
    const userIndustries = user.industry_tags || [];
    const userRamas = Object.keys(user.rama_juridicas || {});
    const userRangos = user.rangos || [
      "Leyes", "Reglamentos", "Decisiones Interpretativas y Reguladores",
      "Jurisprudencia", "Ayudas, Subvenciones y Premios", "Otras"
    ];
    const userEtiquetasPersonalizadas = user.etiquetas_personalizadas || [];
    console.log(userEtiquetasPersonalizadas);
    // NEW: Extract bulletins from cobertura_legal
    let userBoletines = [];
    if (user.cobertura_legal && user.cobertura_legal['fuentes-gobierno']) {
      userBoletines = userBoletines.concat(user.cobertura_legal['fuentes-gobierno']);
    }
    if (user.cobertura_legal && user.cobertura_legal['fuentes-reguladores']) {
      userBoletines = userBoletines.concat(user.cobertura_legal['fuentes-reguladores']);
    }
    userBoletines = userBoletines.map(b => b.toUpperCase());
    if (userBoletines.length === 0) {
      userBoletines = ["BOE"];
    }

    console.log(`User subindustrias: ${userSubIndustriaMap}:`, userSubIndustriaMap);

    // Verificar si userSubIndustriaMap está vacío, undefined o no tiene entradas válidas
    if (!userSubIndustriaMap || typeof userSubIndustriaMap !== 'object' || Object.keys(userSubIndustriaMap).length === 0) {
      // Preparar HTML con mensaje de error
      let profileHtml = fs.readFileSync(path.join(__dirname, 'public', 'profile.html'), 'utf8');
      profileHtml = profileHtml
        .replace('{{name}}', user.name || '')
        .replace('{{email}}', user.email || '')
        .replace('{{subindustria_map_json}}', JSON.stringify({}))
        .replace('{{industry_tags_json}}', JSON.stringify(user.industry_tags || []))
        .replace('{{rama_juridicas_json}}', JSON.stringify(user.rama_juridicas || {}))
        .replace('{{subrama_juridicas_json}}', JSON.stringify(user.sub_rama_map || {}))
        .replace('{{boeDocuments}}', `<div class="no-results" style="color: red; font-weight: bold; padding: 20px; text-align: center; font-size: 16px;">El avatar Juridico de tu usuario está incompleto: por favor edita tu suscripción para seleccionar tus filtros de nuevo. ¡Gracias!</div>`)
        .replace('{{months_json}}', JSON.stringify([]))
        .replace('{{counts_json}}', JSON.stringify([]))
        .replace('{{subscription_plan}}', JSON.stringify(user.subscription_plan || 'plan1'))
        .replace('{{start_date}}', JSON.stringify(new Date()))
        .replace('{{end_date}}', JSON.stringify(new Date()))
        .replace('{{user_boletines_json}}', JSON.stringify(userBoletines || []))
        .replace('{{user_rangos_json}}', JSON.stringify(userRangos || []))
        .replace('{{etiquetas_personalizadas_json}}', JSON.stringify(userEtiquetasPersonalizadas))
;
      
      // Enviar respuesta y terminar la ejecución
      return res.send(profileHtml);
    }

    // Default date range for "profile": from 1 month ago to now
    const now = new Date();
    const startDate = new Date();
    startDate.setMonth(now.getMonth());
    startDate.setDate(now.getDate()-1);
    const endDate = now;

    // NEW: Modified query to match user's rango, boletines, and (ramas or industrias)
    // Reemplazar el bloque de consulta (líneas 43-62):
    const query = {
      $and: [
        // Condiciones de fecha y rango (siempre requeridas)
        { anio: { $gte: startDate.getFullYear() } },
        {
          $or: [
            { mes: { $gt: startDate.getMonth() + 1 } },
            {
              mes: startDate.getMonth() + 1,
              dia: { $gte: startDate.getDate() }
            }
          ]
        },
        { rango_titulo: { $in: userRangos } },
        
        // Condición OR que incluye las opciones existentes y la nueva condición de etiquetas
        {
          $or: [
            // Opción 1: Documentos que cumplen con ramas jurídicas Y subindustrias
            {
              $and: [
                // Filtro por ramas jurídicas
                { 'ramas_juridicas': { $in: userRamas } },
                
                // Filtro por subindustrias
                {
                  $or: Object.entries(userSubIndustriaMap).flatMap(([industria, subIndustrias]) => 
                    subIndustrias.map(subIndustria => ({
                      [`divisiones_cnae.${industria}`]: subIndustria
                    }))
                  )
                }
              ]
            },
            
            // Opción 2: Documentos que tienen "General" en cualquier subindustria
            {
              $or: Object.keys(userSubIndustriaMap).map(industria => ({
                [`divisiones_cnae.${industria}`]: "General"
              }))
            }
          ]
        }
      ]
    };

// MODIFICACIÓN: Añadir el filtro de etiquetas personalizadas
console.log("=== DEBUG ETIQUETAS PERSONALIZADAS ===");
console.log("User ID:", user._id.toString());
console.log("User etiquetas personalizadas (array):", userEtiquetasPersonalizadas);
console.log("User etiquetas personalizadas length:", userEtiquetasPersonalizadas.length);


if (userEtiquetasPersonalizadas.length > 0) {
  const userId = user._id.toString();
  
  // Crear la condición para etiquetas personalizadas
  const etiquetasCondition = {};
  etiquetasCondition[`etiquetas_personalizadas.${userId}`] = { 
    $in: userEtiquetasPersonalizadas 
  };
  
  console.log("User ID 2:", userId);
  console.log("User etiquetas personalizadas (array) 2:", userEtiquetasPersonalizadas);
  console.log("Etiquetas condition:", etiquetasCondition);
  
  // Añadir la condición de etiquetas personalizadas como una opción más en el $or
  // Esto asegura que los documentos se recuperen si coinciden con las etiquetas
  // incluso si no coinciden con las ramas/industrias
  const orCondition = query.$and[3].$or;
  orCondition.push(etiquetasCondition);
}
console.log(`Query:`, query);

    const projection = {
      short_name: 1,
      divisiones_cnae: 1,
      resumen: 1,
      dia: 1,
      mes: 1,
      anio: 1,
      url_pdf: 1,
      ramas_juridicas: 1,
      rango_titulo: 1,
      _id: 1,
      etiquetas_personalizadas: 1,
    };

    let allDocuments = [];
    // For each chosen collection => gather docs
    for (const collectionName of userBoletines) {
      const coll = database.collection(collectionName);
      const docs = await coll.find(query).project(projection).toArray();
      docs.forEach(doc => {
        doc.collectionName = collectionName;
      });
      allDocuments = allDocuments.concat(docs);
    }

    // Sort descending by date
    allDocuments.sort((a, b) => {
      const dateA = new Date(a.anio, a.mes - 1, a.dia);
      const dateB = new Date(b.anio, b.mes - 1, b.dia);
      return dateB - dateA;
    });

    // NEW: Modified HTML generation to include collection name, cnaes, rama, and subrama
    let documentsHtml;
    if (allDocuments.length === 0) {
      documentsHtml = `<div class="no-results">No hay resultados para esa búsqueda</div>`;
    } else {
      documentsHtml = allDocuments.map(doc => {
        const rangoToShow = doc.rango_titulo || "Indefinido";
        
        // Filtrar industrias para mostrar solo las que coinciden con las del usuario
        let cnaesHtml = '';
        if (doc.divisiones_cnae) {
          if (Array.isArray(doc.divisiones_cnae)) {
            // Si es un array (formato antiguo), filtrar por userIndustries
            const matchingIndustries = doc.divisiones_cnae.filter(ind => 
              userIndustries.includes(ind)
            );
            cnaesHtml = matchingIndustries.map(div => `<span>${div}</span>`).join('');
          } else {
            // Si es un objeto (nuevo formato), filtrar por las claves en userSubIndustriaMap
            const matchingIndustries = Object.keys(doc.divisiones_cnae).filter(industria => 
              Object.keys(userSubIndustriaMap).includes(industria)
            );
            cnaesHtml = matchingIndustries.map(industria => 
              `<span class="industria-value">${industria}</span>`
            ).join('');
          }
        }
      
        // Filtrar subindustrias para mostrar solo las que coinciden con las del usuario
        let subIndustriasHtml = '';
        if (doc.divisiones_cnae && typeof doc.divisiones_cnae === 'object' && !Array.isArray(doc.divisiones_cnae)) {
          // Iterar sobre cada industria en el documento
          subIndustriasHtml = Object.entries(doc.divisiones_cnae)
            // Filtrar solo las industrias que están en userSubIndustriaMap
            .filter(([industria, _]) => Object.keys(userSubIndustriaMap).includes(industria))
            // Para cada industria coincidente, filtrar sus subindustrias
            .flatMap(([industria, subIndustrias]) => {
              if (!Array.isArray(subIndustrias)) return [];
              
              // Filtrar subindustrias que coinciden con las del usuario
              const matchingSubIndustrias = subIndustrias.filter(subInd => 
                userSubIndustriaMap[industria] && userSubIndustriaMap[industria].includes(subInd)
              );
              
              // Generar HTML solo para las subindustrias coincidentes
              return matchingSubIndustrias.map(si => 
                `<span class="sub-industria-value"><i><b>#${si}</b></i></span>`
              );
            })
            .join(' ');
        }
      
       // Filtrar ramas jurídicas para mostrar según las condiciones específicas
          // Filtrar ramas jurídicas para mostrar según las condiciones específicas
          let ramaHtml = '';
          if (doc.ramas_juridicas) {
            const matchingRamas = Object.keys(doc.ramas_juridicas).filter(rama => {
              // Verificar si la rama está en las ramas del usuario
              if (userRamas.includes(rama)) {
                // Caso 1: Si el usuario no tiene subramas seleccionadas para esta rama específica,
                // mostrar la rama siempre
                if (!userSubRamaMap[rama] || userSubRamaMap[rama].length === 0) {
                  return true;
                }
                // Caso 2: Si el documento tiene la rama pero no tiene subramas asociadas,
                // mostrar la rama siempre
                else if (!Array.isArray(doc.ramas_juridicas[rama]) || doc.ramas_juridicas[rama].length === 0) {
                  return true;
                }
                // Caso 3: Si el usuario tiene subramas seleccionadas para esta rama y el documento tiene subramas,
                // verificar si hay coincidencia de subramas
                else if (Array.isArray(doc.ramas_juridicas[rama])) {
                  return doc.ramas_juridicas[rama].some(subRama => 
                    userSubRamaMap[rama].includes(subRama)
                  );
                }
              }
              return false;
            });
            
            ramaHtml = matchingRamas.map(r => 
              `<span class="rama-value">${r}</span>`
            ).join('');
            console.log(matchingRamas);
          }

      
        // Filtrar subramas jurídicas para mostrar solo las que coinciden con las del usuario
        const subRamasHtml = Object.entries(doc.ramas_juridicas || {})
          // Filtrar solo las ramas que están en userSubRamaMap
          .filter(([rama, _]) => Object.keys(userSubRamaMap).includes(rama))
          // Para cada rama coincidente, filtrar sus subramas
          .flatMap(([rama, subRamas]) => {
            if (!Array.isArray(subRamas)) return [];
            
            // Filtrar subramas que coinciden con las del usuario
            const matchingSubRamas = subRamas.filter(subRama => 
              userSubRamaMap[rama] && userSubRamaMap[rama].includes(subRama)
            );
            
            // Generar HTML solo para las subramas coincidentes
            return matchingSubRamas.map(sr => 
              `<span class="sub-rama-value"><i><b>#${sr}</b></i></span>`
            );
          })
          .join(' ');

          const etiquetasPersonalizadasHtml = (() => { 
            // If the document does not have personalized etiquetas, return an empty string.
            if (!doc.etiquetas_personalizadas) return '';
            
            // Collect all etiquetas from every user.
            const etiquetasArray = Object.entries(doc.etiquetas_personalizadas)
              .flatMap(([userId, etiquetas]) => Array.isArray(etiquetas) ? etiquetas : [])
              .filter(etiqueta => etiqueta); // Remove any empty values
            
            // If there are no etiquetas, return an empty string.
            if (etiquetasArray.length === 0) return '';
            
            // Use a Set to remove duplicates and convert it back to an array.
            const allEtiquetas = [...new Set(etiquetasArray)];
            
            
            // Generar HTML para las etiquetas
            return `
              <div class="etiquetas-personalizadas-values">
                ${allEtiquetas.map(etiqueta => 
                  `<span class="etiqueta-personalizada-value">${etiqueta}</span>`
                ).join(' ')}
              </div>
            `;
          })();
      
        // Determinar si se debe mostrar alguna sección de etiquetas
        const hasIndustrias = cnaesHtml.trim() !== '';
        const hasSubIndustrias = subIndustriasHtml.trim() !== '';
        const hasRamas = ramaHtml.trim() !== '';
        const hasSubRamas = subRamasHtml.trim() !== '';
      
        return `
          <div class="data-item">
            <div class="header-row">
              <div class="id-values">${doc.short_name}</div>
              <span class="date"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span>
            </div>
            <div style="color: gray; font-size: 1.1em; margin-bottom: 6px;">
              ${rangoToShow} | ${doc.collectionName}
            </div>
            ${hasIndustrias ? `<div class="etiquetas-values">${cnaesHtml}</div>` : ''}
            ${hasSubIndustrias ? `<div class="sub-industria-values">${subIndustriasHtml}</div>` : ''}
            ${hasRamas ? `<div class="rama-juridica-values">${ramaHtml}</div>` : ''}
            ${hasSubRamas ? `<div class="sub-rama-juridica-values">${subRamasHtml}</div>` : ''}
            ${etiquetasPersonalizadasHtml}
            <div class="resumen-label">Resumen</div>
            <div class="resumen-content">${doc.resumen}</div>
            <div class="margin-impacto">
              <a class="button-impacto" 
                 href="/norma.html?documentId=${doc._id}&collectionName=${doc.collectionName}">
                 Análisis impacto normativo
              </a>
            </div>
            <a class="leer-mas" href="${doc.url_pdf}" target="_blank" style="margin-right: 15px;">
              Leer más: ${doc._id}
            </a>
            <i class="fa fa-thumbs-up thumb-icon" onclick="sendFeedback('${doc._id}', 'like', this)"></i>
            <i class="fa fa-thumbs-down thumb-icon" style="margin-left: 10px;"
               onclick="sendFeedback('${doc._id}', 'dislike', this)"></i>
            <span class="doc-seccion" style="display:none;">Disposiciones generales</span>
            <span class="doc-rango" style="display:none;">${rangoToShow}</span>
          </div>
        `;
      }).join('');
      
    }
    // Build chart data (by year-month)
    const documentsByMonth = {};
    allDocuments.forEach(doc => {
      const month = `${doc.anio}-${String(doc.mes).padStart(2, '0')}`;
      documentsByMonth[month] = (documentsByMonth[month] || 0) + 1;
    });
    const months = Object.keys(documentsByMonth).sort();
    const counts = months.map(m => documentsByMonth[m]);

    // Read and fill in the profile.html template
    let profileHtml = fs.readFileSync(path.join(__dirname, 'public', 'profile.html'), 'utf8');
    profileHtml = profileHtml
      .replace('{{name}}', user.name)
      .replace('{{email}}', user.email)
      // Añadir en la sección de reemplazos (líneas 150-166):
      .replace('{{subindustria_map_json}}', JSON.stringify(user.sub_industria_map || {}))
      .replace('{{industry_tags_json}}', JSON.stringify(user.industry_tags))
      .replace('{{rama_juridicas_json}}', JSON.stringify(user.rama_juridicas || {}))
      .replace('{{subrama_juridicas_json}}', JSON.stringify(user.sub_rama_map || {}))
      .replace('{{boeDocuments}}', documentsHtml)
      .replace('{{months_json}}', JSON.stringify(months))
      .replace('{{counts_json}}', JSON.stringify(counts))
      .replace('{{subscription_plan}}', JSON.stringify(user.subscription_plan || 'plan1'))
      .replace('{{start_date}}', JSON.stringify(startDate))
      .replace('{{end_date}}', JSON.stringify(endDate)) 
      // NEW: Add these two lines
      .replace('{{user_boletines_json}}', JSON.stringify(userBoletines))
      .replace('{{user_rangos_json}}', JSON.stringify(userRangos))
      .replace('{{etiquetas_personalizadas_json}}', JSON.stringify(userEtiquetasPersonalizadas));

    // Insert style + script for thumbs
    const feedbackScript = `
      <style>
        .thumb-icon {
          border: 2px solid #092534;
          border-radius: 4px;
          padding: 4px;
          color: #092534;
          cursor: pointer;
        }
        .thumb-icon.selected {
          background-color: #092534;
          color: #fff;
        }
      </style>
      <script>
        function sendFeedback(docId, feedbackType, element) {
          element.classList.toggle('selected');

          fetch('/feedback-thumbs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ docId: docId, feedback: feedbackType })
          })
          .then(response => response.json())
          .then(data => {
            console.log('Feedback response:', data);
          })
          .catch(err => console.error('Error sending feedback:', err));
        }
      </script>
    `;
    profileHtml += feedbackScript;

    res.send(profileHtml);
  } catch (err) {
    console.error('Error connecting to MongoDB', err);
    res.status(500).send('Error retrieving documents');
  } finally {
    await client.close();
  }
});

//
// 4) /DATA ENDPOINT
//

app.get('/data', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    if (!user.industry_tags || user.industry_tags.length === 0) {
      return res.status(400).json({ error: 'No industry tags selected' });
    }
    const userSubRamaMap = user.sub_rama_map || {};
    const userSubIndustriaMap = user.sub_industria_map || {};


    // 1) Collect query parameters from the front-end
    const collections = req.query.collections || ['BOE']; // bulletins
    const industry = req.query.industry || 'Todas';       // e.g. "val1||val2"
    const ramaRaw = req.query.rama || 'Todas';            // e.g. "Derecho Civil||Derecho Mercantil"
    const subRamasStr = req.query.subRamas || '';
    const rangoStr = req.query.rango || '';              // e.g. "Leyes||Reglamentos"
    const startDate = req.query.desde;
    const endDate = req.query.hasta;
    // Extraer las etiquetas personalizadas del usuario

    // Después de recoger los otros parámetros de consulta
    const etiquetasStr = req.query.etiquetas || '';
    let chosenEtiquetas = [];
    if (etiquetasStr.trim() !== '') {
      chosenEtiquetas = etiquetasStr.split('||').map(s => s.trim()).filter(Boolean);
    }
    const userEtiquetasPersonalizadas = user.etiquetas_personalizadas || [];
    const userId = user._id.toString();
  //  console.log(`Etiquetas personalizadas usuario chosen:`, chosenEtiquetas);
   // console.log(`Etiquetas personalizadas usuario mongo:`, userEtiquetasPersonalizadas);

    // 2) Parse multiple Ramas
    let chosenRamas = [];
    if (ramaRaw.toLowerCase() !== 'todas') {
      chosenRamas = ramaRaw.split('||').map(s => s.trim()).filter(Boolean);
    }

    // 3) Parse multiple Industries
    let chosenIndustries = [];
    if (industry.toLowerCase() !== 'todas') {
      chosenIndustries = industry.split('||').map(s => s.trim()).filter(Boolean);
    }

    // 4) Parse multiple Rango
    let chosenRangos = [];
    if (rangoStr.trim() !== '') {
      chosenRangos = rangoStr.split('||').map(s => s.trim()).filter(Boolean);
    }

    // 5) Build base MongoDB query for DB-level fields: bulletins, date
    const query = {};

    // Date range
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

    console.log(`Start date ${startDate}:`, startDate);
    console.log(`End date ${endDate}:`, endDate);
    console.log('Final DB-level query =>', JSON.stringify(query, null, 2));
     // CHANGE 2: Console log userSubRamaList
     console.log(`Chosen ramas ${chosenRamas}:`, chosenRamas);
     
     console.log(`Chosen ramas ${chosenIndustries}:`, chosenIndustries);

    // 6) We also project "rango_titulo" for in-memory filtering
   // Modificar la proyección para incluir etiquetas_personalizadas
    const projection = {
      short_name: 1,
      divisiones_cnae: 1,
      resumen: 1,
      dia: 1,
      mes: 1,
      anio: 1,
      url_pdf: 1,
      ramas_juridicas: 1,
      rango_titulo: 1,
      etiquetas_personalizadas: 1, // Añadir esta línea
      _id: 1
    };


    // 7) Collect documents from each chosen bulletin
    let allDocuments = [];
    for (const cName of collections) {
      const coll = database.collection(cName);
      const docs = await coll.find(query).project(projection).toArray();
      docs.forEach(d => {
        d.collectionName = cName;
      });
      allDocuments = allDocuments.concat(docs);
    }

    // Sort all docs descending by date
    allDocuments.sort((a, b) => {
      const dateA = new Date(a.anio, a.mes - 1, a.dia);
      const dateB = new Date(b.anio, b.mes - 1, b.dia);
      return dateB - dateA;
    });

    // 8) Parse subRamas from JSON string
    let chosenSubRamasMap = {};
    if (subRamasStr.trim() !== '') {
      try {
        chosenSubRamasMap = JSON.parse(subRamasStr);
        console.log("Parsed subRamas:", chosenSubRamasMap);
      } catch (e) {
        console.error("Error parsing subRamas JSON:", e);
        // Fallback to old comma-separated format if JSON parsing fails
        const chosenSubRamas = subRamasStr.split(',').map(s => s.trim()).filter(Boolean);
        chosenSubRamasMap = {};
        chosenRamas.forEach(rama => {
          chosenSubRamasMap[rama] = chosenSubRamas;
        });
      }
    }
      // Parse subIndustrias from JSON string
      let chosenSubIndustriasMap = {};
      const subIndustriasStr = req.query.subIndustrias || '';
      if (subIndustriasStr.trim() !== '') {
        try {
          chosenSubIndustriasMap = JSON.parse(subIndustriasStr);
          console.log("Parsed subIndustrias:", chosenSubIndustriasMap);
        } catch (e) {
          console.error("Error parsing subIndustrias JSON:", e);
          chosenSubIndustriasMap = {};
        }
      }


    // 9) Final in-memory filter with new logic
    const filteredDocuments = [];
    for (const doc of allDocuments) {
      // Extract document data
      let cnaes = doc.divisiones_cnae || [];
      if (!Array.isArray(cnaes)) cnaes = [cnaes];
      
      // Rango filter (must match user rangos if specified)
      const docRango = doc.rango_titulo || "Indefinido";
      let passesRangoFilter = true;
      if (chosenRangos.length > 0) {
        passesRangoFilter = chosenRangos.includes(docRango);
      }
      
      if (!passesRangoFilter) continue;

      // Process ramas_juridicas from the document
      let docRamas = [];
      if (doc.ramas_juridicas && typeof doc.ramas_juridicas === 'object') {
        docRamas = Object.keys(doc.ramas_juridicas);
      }
      
      // CHANGE 1: Check rama match only if specific ramas are chosen
      let hasRamaMatch = chosenRamas.length === 0; // Default true if no ramas chosen
      let matchedRamas = [];
      let matchedSubRamas = [];
      
      // Only check ramas if specific ones were chosen
      if (chosenRamas.length > 0) {
        for (const rama of chosenRamas) {
          if (docRamas.includes(rama)) {
            hasRamaMatch = true;
            matchedRamas.push(rama);
            
            // Handle subramas for this rama
            const docSubRamas = Array.isArray(doc.ramas_juridicas[rama]) ? 
              doc.ramas_juridicas[rama] : [];
            const userSubRamaList = userSubRamaMap[rama] || [];
            
            // CHANGE 2: Console log userSubRamaList
            //console.log(`UserSubRamaList for ${rama}:`, userSubRamaList);
            
            if (docSubRamas.length === 0 && userSubRamaList.includes("genérico")) {
              matchedSubRamas.push("genérico");
            } else {
              const intersection = docSubRamas.filter(sr => userSubRamaList.includes(sr));
              matchedSubRamas = matchedSubRamas.concat(intersection);
            }
          }
        }
      }
      
    // Filter by chosen subramas if specified
    if (Object.keys(chosenSubRamasMap).length > 0) {
      let hasSubRamaMatch = false;
      
      for (const rama of matchedRamas) {
        const chosenSubRamasForRama = chosenSubRamasMap[rama] || [];
        
        if (chosenSubRamasForRama.length === 0) {
          // If no subramas specified for this rama, it's a match
          hasSubRamaMatch = true;
          continue;
        }
        
        const docSubRamas = Array.isArray(doc.ramas_juridicas[rama]) ? 
          doc.ramas_juridicas[rama] : [];
        
        if (docSubRamas.length === 0 && chosenSubRamasForRama.includes("genérico")) {
          // Document has no specific subramas but user selected "genérico"
          matchedSubRamas.push("genérico");
          hasSubRamaMatch = true;
        } else {
          // Check if any of the document's subramas match the chosen ones
          const intersection = docSubRamas.filter(sr => chosenSubRamasForRama.includes(sr));
          if (intersection.length > 0) {
            matchedSubRamas = matchedSubRamas.concat(intersection);
            hasSubRamaMatch = true;
          }
        }
      }
      
      // If no subrama matches were found, the document doesn't match
      if (!hasSubRamaMatch) {
        hasRamaMatch = false;
      }
    }

      
      // Check industry match (divisiones_cnae) --> subindustrias logic
      let hasIndustryMatch = chosenIndustries.length === 0; // Default true if no industries chosen
      let matchedIndustries = [];
      let matchedSubIndustrias = [];
            // Verificar si el documento tiene la industria "General"
      let hasGeneral = false;

      // Para la nueva estructura (objeto)
      if (typeof doc.divisiones_cnae === 'object' && !Array.isArray(doc.divisiones_cnae)) {
        // Verificar si "General" es una clave en el objeto
        if ("General" in doc.divisiones_cnae) {
          hasGeneral = true;
        }
      }    

      // If General is present, industry match is automatic
      if (hasGeneral && chosenRamas.length > 0) {
        hasIndustryMatch = true;
        matchedIndustries.push("General");
      } else {
        // Check for subindustrias matches
        if (Object.keys(chosenSubIndustriasMap).length > 0) {
          let hasSubIndustriaMatch = false;
          
          // Check each industry in the document
          if (doc.divisiones_cnae && typeof doc.divisiones_cnae === 'object' && !Array.isArray(doc.divisiones_cnae)) {
            for (const [industria, subIndustrias] of Object.entries(doc.divisiones_cnae)) {
              // Check if this industry is in the chosen subindustrias map
              if (chosenSubIndustriasMap[industria]) {
                const chosenSubIndustrias = chosenSubIndustriasMap[industria];
                
                if (chosenSubIndustrias.length === 0) {
                  // If no specific subindustrias chosen for this industry, it's a match
                  hasSubIndustriaMatch = true;
                  matchedIndustries.push(industria);
                  continue;
                }
                
                // Check if any of the document's subindustrias match the chosen ones
                if (Array.isArray(subIndustrias)) {
                  const intersection = subIndustrias.filter(si => chosenSubIndustrias.includes(si));
                  if (intersection.length > 0) {
                    hasSubIndustriaMatch = true;
                    matchedIndustries.push(industria);
                    matchedSubIndustrias = matchedSubIndustrias.concat(intersection);
                  }
                }
              }
            }
          }
          
          hasIndustryMatch = hasSubIndustriaMatch;
        } else if (chosenIndustries.length > 0) {
          // Fall back to old industry matching if no subindustrias specified
          if (Array.isArray(doc.divisiones_cnae)) {
            matchedIndustries = doc.divisiones_cnae.filter(cnae => chosenIndustries.includes(cnae));
          } else if (typeof doc.divisiones_cnae === 'object') {
            matchedIndustries = Object.keys(doc.divisiones_cnae).filter(cnae => chosenIndustries.includes(cnae));
          }
          hasIndustryMatch = matchedIndustries.length > 0;
        }
      }

      // Verificar coincidencia de etiquetas personalizadas
      let hasEtiquetasMatch = chosenEtiquetas.includes('Todas'); // Por defecto true si no hay etiquetas elegidas o se eligió "Todas"
      let matchedEtiquetas = [];
      
      // Solo verificar etiquetas si se han elegido específicas
      if (chosenEtiquetas.length > 0) {
        // Verificar si el documento tiene etiquetas personalizadas
        
        if (chosenEtiquetas = "Todas"){
          chosenEtiquetas = userEtiquetasPersonalizadas;
        }
        console.log(`Chosen etiquetas:`, chosenEtiquetas);
        //console.log(`Etiquetas personalizadas usuario mongo:`, userEtiquetasPersonalizadas);
        if (doc.etiquetas_personalizadas) { // && typeof doc.etiquetas_personalizadas === 'object'
          // Verificar si el documento tiene etiquetas para este usuario
          const docEtiquetasUsuario = doc.etiquetas_personalizadas[userId] || [];
          console.log(`Docetiquetasusuario:`, docEtiquetasUsuario);

          // Verificar si alguna de las etiquetas elegidas coincide con las del documento
          const etiquetasCoincidentes = docEtiquetasUsuario.filter(etiqueta => 
            chosenEtiquetas.includes(etiqueta)
          );
          console.log(`Etiquetas personalizadas coincidentes:`,etiquetasCoincidentes);
          // Si hay al menos una coincidencia, el documento pasa el filtro
          if (etiquetasCoincidentes.length > 0) {
            hasEtiquetasMatch = true;
            matchedEtiquetas = etiquetasCoincidentes;
          } else {
            hasEtiquetasMatch = false;
          }
        } else {
          // Si el documento no tiene etiquetas personalizadas, no pasa el filtro
          hasEtiquetasMatch = false;
        }
      }

      
      // CHANGE 3: Updated matching criteria based on chosen values
      let documentMatches = false;
      
     
      // Si se hya match etiquetas, show doc
      if (hasEtiquetasMatch) {
        documentMatches = hasEtiquetasMatch;
      }
      // Para los demás casos, mantener la lógica existente
      else if (chosenRamas.length > 0 && chosenIndustries.length > 0) {
        documentMatches = hasRamaMatch && hasIndustryMatch;
      }
      else if (chosenRamas.length > 0) {
        documentMatches = hasRamaMatch;
      }
      else if (chosenIndustries.length > 0) {
        documentMatches = hasIndustryMatch;
      }
      else {
        documentMatches = true;
      }
      
      if (documentMatches) {
        doc.matched_cnaes = matchedIndustries.length > 0 ? matchedIndustries : cnaes;
        doc.matched_rama_juridica = [...new Set(matchedRamas)];
        doc.matched_sub_rama_juridica = [...new Set(matchedSubRamas)];
        doc.matched_sub_industrias = [...new Set(matchedSubIndustrias)];
        doc.matched_etiquetas = [...new Set(matchedEtiquetas)]; // Añadir esta línea
        filteredDocuments.push(doc);
      }
    }

    // 10) Build documentsHtml
    let documentsHtml;
    if (filteredDocuments.length === 0) {
      documentsHtml = `<div class="no-results">No hay resultados para esa búsqueda</div>`;
    } else {
      documentsHtml = filteredDocuments.map(doc => {
        // Generate HTML for industries
        let cnaesHtml = '';
        if (doc.matched_cnaes && doc.matched_cnaes.length > 0) {
          cnaesHtml = doc.matched_cnaes.map(div => `<span>${div}</span>`).join('');
        }
        
        // Generate HTML for subindustrias
        let subIndustriasHtml = '';
        if (doc.divisiones_cnae && typeof doc.divisiones_cnae === 'object' && !Array.isArray(doc.divisiones_cnae)) {
          // Filter industries to only include matched ones
          const matchedIndustrias = doc.matched_cnaes || [];
          
          subIndustriasHtml = Object.entries(doc.divisiones_cnae)
            // Filter to only include matched industries
            .filter(([industria, _]) => matchedIndustrias.includes(industria))
            // For each matched industry, filter its subindustrias
            .flatMap(([industria, subIndustrias]) => {
              if (!Array.isArray(subIndustrias)) return [];
              
              // If we have specific subindustrias in chosenSubIndustriasMap, filter by them
              if (chosenSubIndustriasMap[industria] && chosenSubIndustriasMap[industria].length > 0) {
                return subIndustrias
                  .filter(si => chosenSubIndustriasMap[industria].includes(si))
                  .map(si => `<span class="sub-industria-value"><i><b>#${si}</b></i></span>`);
              }
              
              // Otherwise, show all subindustrias for this industry
              return subIndustrias.map(si => 
                `<span class="sub-industria-value"><i><b>#${si}</b></i></span>`
              );
            })
            .join(' ');
        }
        
          // Crear variables para el HTML de ramas y subramas
        let ramaHtml = '';
        let subRamasHtml = '';

        // Procesar cada rama coincidente individualmente
        const ramasToShow = [];
        const uniqueSubRamas = new Set(); // Conjunto para evitar duplicados en subramas

        (doc.matched_rama_juridica || []).forEach(rama => {
          // Verificar si el usuario ha seleccionado subramas específicas para esta rama
          const userHasSelectedSubRamasForThisRama = 
            userSubRamaMap && 
            userSubRamaMap[rama] && 
            Array.isArray(userSubRamaMap[rama]) && 
            userSubRamaMap[rama].length > 0;
          
          // Si el usuario no ha seleccionado subramas para esta rama, mostrarla
          if (!userHasSelectedSubRamasForThisRama) {
            ramasToShow.push(rama);
          } 
          // Si el usuario ha seleccionado subramas para esta rama, verificar coincidencias
          else {
            // Verificar si hay subramas coincidentes para esta rama
            const docSubRamas = doc.ramas_juridicas && doc.ramas_juridicas[rama] ? doc.ramas_juridicas[rama] : [];
            const matchedSubRamas = doc.matched_sub_rama_juridica || [];
            
            // Verificar si alguna de las subramas del documento para esta rama está en las subramas coincidentes
            let hasMatchingSubRama = false;
            let matchingSubRamasForThisRama = [];
            
            // Caso especial: si el documento no tiene subramas para esta rama y "genérico" está en las coincidencias
            if (docSubRamas.length === 0 && matchedSubRamas.includes("genérico")) {
              hasMatchingSubRama = true;
              matchingSubRamasForThisRama.push("genérico");
            } 
            // Caso normal: verificar intersección entre subramas del documento y subramas coincidentes
            else {
              for (const subRama of docSubRamas) {
                if (matchedSubRamas.includes(subRama)) {
                  hasMatchingSubRama = true;
                  matchingSubRamasForThisRama.push(subRama);
                }
              }
            }
            
            // Solo mostrar la rama si tiene subramas coincidentes
            if (hasMatchingSubRama) {
              ramasToShow.push(rama);
              
              // Añadir las subramas coincidentes al conjunto de subramas únicas
              matchingSubRamasForThisRama.forEach(sr => uniqueSubRamas.add(sr));
            }
          }
        });

        // Generar el HTML para las ramas que deben mostrarse
        ramaHtml = ramasToShow
          .map(r => `<span class="rama-value">${r}</span>`)
          .join('');

        // Mostrar solo las subramas únicas coincidentes
        subRamasHtml = Array.from(uniqueSubRamas)
          .map(sr => `<span class="sub-rama-value"><i><b>#${sr}</b></i></span>`)
          .join(' ');

        // Generar HTML para etiquetas personalizadas
        let etiquetasPersonalizadasHtml = '';
        if (doc.etiquetas_personalizadas) {
          // Obtener todas las etiquetas de todos los usuario
            
            // Collect all etiquetas from every user.
            const etiquetasArray = Object.entries(doc.etiquetas_personalizadas)
              .flatMap(([userId, etiquetas]) => Array.isArray(etiquetas) ? etiquetas : [])
              .filter(etiqueta => etiqueta); // Remove any empty values
            
            // If there are no etiquetas, return an empty string.
            if (etiquetasArray.length === 0) return '';
            
            // Use a Set to remove duplicates and convert it back to an array.
            const allEtiquetas = [...new Set(etiquetasArray)];
          
          // Si hay etiquetas, generar el HTML
          if (allEtiquetas.length > 0) {
            etiquetasPersonalizadasHtml = `
              <div class="etiquetas-personalizadas-values">
                ${allEtiquetas.map(etiqueta => 
                  `<span class="etiqueta-personalizada-value">${etiqueta}</span>`
                ).join(' ')}
              </div>
            `;
          }
        }

      const rangoToShow = doc.rango_titulo || "Indefinido";

        return `
          <div class="data-item">
            <div class="header-row">
              <div class="id-values">${doc.short_name}</div>
              <span class="date"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span>
            </div>
            <!-- Rango and collection name displayed in gray -->
            <div style="color: gray; font-size: 1.1em; margin-bottom: 6px;">
              ${rangoToShow} | ${doc.collectionName}
            </div>
      
            <div class="etiquetas-values">${cnaesHtml}</div>
            <div class="sub-industria-values">${subIndustriasHtml}</div>
            <div class="rama-juridica-values">${ramaHtml}</div>
            <div class="sub-rama-juridica-values">${subRamasHtml}</div>

              <!-- Añadir etiquetas personalizadas -->
            ${etiquetasPersonalizadasHtml}
      
            <div class="resumen-label">Resumen</div>
            <div class="resumen-content">${doc.resumen}</div>
            <div class="margin-impacto">
              <a class="button-impacto"
                href="/norma.html?documentId=${doc._id}&collectionName=${doc.collectionName}">
                Análisis impacto normativo
              </a>
            </div>
            <a class="leer-mas" href="${doc.url_pdf}" target="_blank" style="margin-right: 15px;">
              Leer más: ${doc._id}
            </a>
      
            <!-- Optional feedback icons -->
            <i class="fa fa-thumbs-up thumb-icon" onclick="sendFeedback('${doc._id}', 'like', this)"></i>
            <i class="fa fa-thumbs-down thumb-icon" style="margin-left: 10px;"
               onclick="sendFeedback('${doc._id}', 'dislike', this)"></i>
      
            <!-- Hidden fields for doc-rango or doc-seccion, if needed -->
            <span class="doc-rango" style="display:none;">${rangoToShow}</span>
          </div>
        `;
      }).join('');      
    }

    // 11) Chart data
    const documentsByMonth = {};
    for (const doc of filteredDocuments) {
      const month = `${doc.anio}-${String(doc.mes).padStart(2, '0')}`;
      documentsByMonth[month] = (documentsByMonth[month] || 0) + 1;
    }
    const months = Object.keys(documentsByMonth).sort();
    const counts = months.map(m => documentsByMonth[m]);

    // Return JSON with final HTML + chart data
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



//
// 5) FEEDBACK POST ROUTE
//
app.post('/feedback-thumbs', ensureAuthenticated, async (req, res) => {
  const { docId, feedback } = req.body;
  if (!docId || !feedback) {
    return res.status(400).json({ error: 'Missing docId or feedback' });
  }

  const userId = req.user._id;
  const userEmail = req.user.email;
  const contentEvaluated = 'norma';
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

  const feedbackDoc = {
    user_id: userId,
    user_email: userEmail,
    content_evaluated: contentEvaluated,
    doc_id: docId,
    fecha: dateStr,   // dd-mm-yyyy
    feedback: feedback
  };

  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const feedbackCollection = database.collection("Feedback");

    await feedbackCollection.insertOne(feedbackDoc);

    return res.json({ success: true, message: 'Feedback saved successfully' });
  } catch (err) {
    console.error('Error saving feedback:', err);
    return res.status(500).json({ error: 'Failed to save feedback' });
  } finally {
    await client.close();
  }
});

/*Feedback analisis*/
app.post('/api/feedback-analisis', ensureAuthenticated, async (req, res) => {
  const { documentId, collectionName, userPrompt, analysisResults, fecha, feedback, content_evaluated } = req.body;
  
  if (!documentId || !feedback) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const userId = req.user._id;
  const userEmail = req.user.email;

  const feedbackDoc = {
    user_id: userId,
    user_email: userEmail,
    content_evaluated: content_evaluated || 'analisis_impacto',
    doc_id: documentId,
    collection_name: collectionName,
    user_prompt: userPrompt,
    analysis_results: analysisResults,
    fecha: fecha,   // yyyy-mm-dd
    feedback: feedback
  };

  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const feedbackCollection = database.collection("Feedback");

    await feedbackCollection.insertOne(feedbackDoc);

    return res.json({ success: true, message: 'Feedback saved successfully' });
  } catch (err) {
    console.error('Error saving feedback:', err);
    return res.status(500).json({ error: 'Failed to save feedback' });
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
      { _id: new ObjectId(req.user._id) },
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
// New endpoint to fetch norma details
 // New endpoint to fetch norma details
 // New endpoint to fetch norma details
 app.get('/api/norma-details', ensureAuthenticated, async (req, res) => {
  const documentId = req.query.documentId;
  let collectionName = req.query.collectionName || "BOE"; //set collection default to BOE

  const client = new MongoClient(uri, mongodbOptions);
  try {
      await client.connect();
      const database = client.db("papyrus");
      const collection = database.collection(collectionName); // Dynamically use the collection

      const document = await collection.findOne({ _id: documentId });
      if (document) {
          res.json({ short_name: document.short_name,collectionName: collectionName });
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
  const collectionName = req.body.collectionName; // Get the name of the collection from the request body

  // Path to your Python script
  const pythonScriptPath = path.join(__dirname, 'questionsMongo.py');

  console.log(`Analyzing norma with documentId: ${documentId}, User Prompt: ${userPrompt}, Collection Name: ${collectionName}`); //Log the document ID

  try {
      // Spawn a new process to execute the Python script
      const pythonProcess = spawn('python', [pythonScriptPath, documentId, userPrompt, collectionName]); // Pass documentId and userPrompt as arguments

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

/*fetch api_perplixity*/
app.get('/api-key', (req, res) => {
  res.json({ apiKey: process.env.API_KEY_PERPLEXITY });
});

/*Email suscripción*/
// Añadir esta función en algún lugar antes de tus rutas
async function sendSubscriptionEmail(user, userData) {
  try {
    if (!user || !user.email) {
      console.error('No se puede enviar correo: usuario o email no definido');
      return false;
    }
    
    // Determinar el nombre y precio del plan
    let planName = 'Indeterminado';
    let planPrice = '-';
    
    switch (userData.subscription_plan) {
      case 'plan1':
        planName = 'Starter';
        planPrice = '66€';
        break;
      case 'plan2':
        planName = 'Pro';
        planPrice = '220€';
        break;
      case 'plan3':
        planName = 'Enterprise';
        planPrice = 'Custom';
        break;
      case 'plan4':
      planName = 'Free';
      planPrice = '0€';
      break;
    }
    
    // Preparar las etiquetas personalizadas
    const etiquetasList = [];
    if (userData.etiquetas_personalizadas && typeof userData.etiquetas_personalizadas === 'object') {
      Object.keys(userData.etiquetas_personalizadas).forEach(key => {
        etiquetasList.push(key);
      });
    }
    
    // Si no hay etiquetas, añadir un mensaje predeterminado
    if (etiquetasList.length === 0) {
      etiquetasList.push('No especificadas');
    }
    
    // Preparar la cobertura legal con manejo seguro de valores nulos
    let coberturaLegal = 'No especificada';
    if (userData.cobertura_legal && typeof userData.cobertura_legal === 'object') {
      const fuentes = [];
      if (Array.isArray(userData.cobertura_legal['fuentes-gobierno'])) {
        fuentes.push(...userData.cobertura_legal['fuentes-gobierno']);
      }
      if (Array.isArray(userData.cobertura_legal['fuentes-reguladores'])) {
        fuentes.push(...userData.cobertura_legal['fuentes-reguladores']);
      }
      if (fuentes.length > 0) {
        coberturaLegal = fuentes.join(', ');
      }
    }
    coberturaLegal = toUpperCase(coberturaLegal);
    
    // Preparar los rangos con manejo seguro de valores nulos
    const rangosList = Array.isArray(userData.rangos) && userData.rangos.length > 0 
                      ? userData.rangos 
                      : ['No especificados'];
    
    // Análisis de impacto (puedes ajustar esto según tu lógica de negocio)
    const analisisImpacto = userData.subscription_plan === 'plan1' ? '50 llamadas/mes' : 
                          (userData.subscription_plan === 'plan2' ? '500 llamadas/mes' : 
                            userData.subscription_plan === 'plan3' ? '500 llamadas/mes/usuario' :'No incluido'
                          );
    
    // Obtener el año actual para el footer
    const currentYear = new Date().getFullYear();
    
    // Construir el HTML del correo electrónico
    const emailHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmación de Suscripción a Papyrus</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f8f8f8;
      margin: 0;
      padding: 20px;
      color: #0b2431;
    }
    
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .header {
      background-color: #0b2431;
      padding: 24px;
      text-align: center;
    }
    
    .header img {
      height: 48px;
    }
    
    .content {
      padding: 32px;
      font-family: Georgia, serif;
    }
    
    h1 {
      color: #04db8d;
      font-size: 24px;
      margin-bottom: 16px;
      font-family: Georgia, serif;
    }
    
    p {
      line-height: 1.6;
      margin-bottom: 16px;
      color: #0b2431;
    }
    
    .subscription-details {
      background-color: #f8f8f8;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
    }
    
    .subscription-details h2 {
      font-size: 20px;
      color: #455862;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e0e0e0;
      font-family: Georgia, serif;
    }
    
    .details-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
    }
    
    @media (min-width: 500px) {
      .details-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
    
    .details-label {
      font-size: 14px;
      color: #455862;
      margin-bottom: 4px;
    }
    
    .details-value {
      font-weight: 500;
      margin-bottom: 12px;
      color: #0b2431;
    }
    
    ul {
      margin: 0;
      padding-left: 20px;
    }
    
    .btn {
      display: inline-block;
      background-color: #04db8d;
      color: white;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 4px;
      font-weight: 500;
      text-align: center;
      transition: background-color 0.3s;
    }
    
    .btn:hover {
      background-color: #03c57f;
    }
    
    .text-center {
      text-align: center;
    }
    
    .footer {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      font-size: 14px;
      color: #455862;
    }
    
    .footer a {
      color: #04db8d;
      text-decoration: none;
    }
    
    .footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="cid:papyrusLogo" alt="Papyrus Logo">
    </div>
    
    <div class="content">
      <h1>Confirmación de Suscripción</h1>
      
      <p id="greeting">Estimado/a ${userData.name || 'Usuario'},</p>
      
      <p>
         Como bien sabría decir un viejo jurista, en el complejo tablero de la ley, quien domina la información, 
        domina el juego. Y ahora, con Papyrus, tienes las mejores cartas en la mano.
      </p>
      
      <p>
        No se trata simplemente de un servicio. Al contratar Papyrus eliges tranquilidad: estarás siempre al día 
        y contarás con una guía clara sobre riesgos jurídicos y novedades regulatorias.
      </p>
      
      <div class="subscription-details">
        <h2>Detalles de tu suscripción</h2>
        
        <div class="details-grid">
          <div>
            <p class="details-label">Nombre del Plan</p>
            <p class="details-value" id="plan-name">${planName}</p>
            
            <p class="details-label">Precio</p>
            <p class="details-value" id="plan-price">${planPrice}</p>
            
            <p class="details-label">Cobertura Legal</p>
            <p class="details-value" id="cobertura-legal">${coberturaLegal}</p>
            
            <p class="details-label">Etiquetas Personalizadas</p>
            <ul class="details-value" id="etiquetas-list">
              ${etiquetasList.map(etiqueta => `<li>${etiqueta}</li>`).join('')}
            </ul>
          </div>
          
          <div>
            <p class="details-label">Rangos</p>
            <ul class="details-value" id="rangos-list">
              ${rangosList.map(rango => `<li>${rango}</li>`).join('')}
            </ul>
            
            <p class="details-label">Análisis de Impacto</p>
            <p class="details-value" id="analisis-impacto">${analisisImpacto}</p>
          </div>
        </div>
      </div>
      
      <p>
        Recuerda que recibirás el resultado de tu scanner normativo de manera diaria, pudiendo consultar en todo momento el análisis del impacto a través de la app
      </p>
      
      <div class="text-center" style="margin-bottom: 24px;">
        <a href="https://papyrus-legal.com" class="btn">Acceder a mi cuenta</a>
      </div>
      
      <p>
        Quote
      </p>

      <p>
        Atentamente,
      </p>
      
      <p style="font-weight: 500;">
        El equipo de Papyrus
      </p>
      
      <div class="footer">
        <p style="margin-bottom: 8px;">© Papyrus Legal, ${currentYear}. Todos los derechos reservados.</p>
        <p>
          Si tiene alguna pregunta, puede contactarnos en
          <a href="mailto:info@papyrus-ai.com">info@papyrus-ai.com</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
    
    // Configurar el mensaje de correo electrónico
    const msg = {
      to: user.email,
      from: 'info@papyrus-ai.com', // Ajusta esto a tu dirección de correo verificada en SendGrid
      subject: 'Confirmación de Suscripción a Papyrus',
      html: emailHtml,
       attachments: [
                {
                  filename: 'papyrus_logo_white.png',
                  path: path.join(__dirname, 'assets', 'papyrus_logo_white.png'),
                  cid: 'papyrusLogo'
                }
              ]
    };
    
    // Enviar el correo electrónico
    await sgMail.send(msg);
    console.log(`Correo de confirmación enviado a ${user.email}`);
    return true;
  } catch (error) {
    console.error('Error al enviar el correo de confirmación:', error);
    // No lanzamos el error para que no interrumpa el flujo principal
    return false;
  }
}


/*Stripe*/

app.post('/create-checkout-session', async (req, res) => {
  const {
    plan,
    industry_tags,
    sub_industria_map,
    rama_juridicas,
    profile_type,
    sub_rama_map,
    cobertura_legal,
    company_name,
    name,
    web,
    linkedin,
    perfil_profesional,
    rangos,
    feedback,
    etiquetas_personalizadas,
    isTrial
  } = req.body;

  try {
    const priceIdMap = {
      plan1: 'price_dummy_for_plan1', // Añadir ID de precio dummy para plan1
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
   // Añadir los parámetros adicionales a la URL de éxito:
    const encodedSubIndustriaMap = encodeURIComponent(JSON.stringify(sub_industria_map));
    const encodedCoberturaLegal = encodeURIComponent(JSON.stringify(cobertura_legal));
    const encodedCompanyName = encodeURIComponent(company_name);
    const encodedName = encodeURIComponent(name);
    const encodedWeb = encodeURIComponent(web);
    const encodedLinkedin = encodeURIComponent(linkedin);
    const encodedPerfilProfesional = encodeURIComponent(perfil_profesional);
    const encodedRangos = encodeURIComponent(JSON.stringify(rangos));
    const encodedFeedback = encodeURIComponent(JSON.stringify(feedback));
    const encodedEtiquetasPersonalizadas = encodeURIComponent(JSON.stringify(etiquetas_personalizadas));

    // Build base subscription data
    let subscriptionData = {};
    // If plan2, set trial_period_days: 60
    if ((plan === 'plan1' || plan === 'plan2' || plan === 'plan3') && isTrial) {
      subscriptionData = {
        trial_period_days: 15,  // 15 días de prueba para todos los planes
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

      // Y luego añadirlos a la URL:
    success_url: `https://app.papyrus-ai.com/save-user?session_id={CHECKOUT_SESSION_ID}&industry_tags=${encodedIndustryTags}&rama_juridicas=${encodedRamaJuridicas}&plan=${encodedPlan}&profile_type=${encodedProfileType}&sub_rama_map=${encodedSubRamaMap}&sub_industria_map=${encodedSubIndustriaMap}&cobertura_legal=${encodedCoberturaLegal}&company_name=${encodedCompanyName}&name=${encodedName}&web=${encodedWeb}&linkedin=${encodedLinkedin}&perfil_profesional=${encodedPerfilProfesional}&rangos=${encodedRangos}&feedback=${encodedFeedback}&etiquetas_personalizadas=${encodedEtiquetasPersonalizadas}`,
    cancel_url: 'https://app.papyrus-ai.com/paso1.html',
    });

    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating Checkout Session:', error);
    res.status(500).json({ error: 'Failed to create Checkout Session' });
  }
});
/*
app.get('/save-user', async (req, res) => {
  const { session_id, ...userData } = req.query;
  
  try {
    // Verificar la sesión de Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (session.payment_status === 'paid') {
      // Crear current date en formato yyyy-mm-dd
      const currentDate = new Date();
      const yyyy = currentDate.getFullYear();
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0'); // January is 0!
      const dd = String(currentDate.getDate()).padStart(2, '0');
      const formattedDate = `${yyyy}-${mm}-${dd}`;
      
      // Procesar los datos del usuario (decodificar los parámetros)
      const decodedUserData = {
        industry_tags: JSON.parse(decodeURIComponent(userData.industry_tags)),
        sub_industria_map: JSON.parse(decodeURIComponent(userData.sub_industria_map)),
        rama_juridicas: JSON.parse(decodeURIComponent(userData.rama_juridicas)),
        subscription_plan: decodeURIComponent(userData.plan),
        profile_type: decodeURIComponent(userData.profile_type),
        sub_rama_map: JSON.parse(decodeURIComponent(userData.sub_rama_map)),
        cobertura_legal: JSON.parse(decodeURIComponent(userData.cobertura_legal)),
        company_name: decodeURIComponent(userData.company_name),
        name: decodeURIComponent(userData.name),
        web: decodeURIComponent(userData.web),
        linkedin: decodeURIComponent(userData.linkedin),
        perfil_profesional: decodeURIComponent(userData.perfil_profesional),
        rangos: JSON.parse(decodeURIComponent(userData.rangos)),
        feedback_login: JSON.parse(decodeURIComponent(userData.feedback)),
        etiquetas_personalizadas: JSON.parse(decodeURIComponent(userData.etiquetas_personalizadas)),
        registration_date: formattedDate,    // String format yyyy-mm-dd
        registration_date_obj: currentDate,  // Also save native Date object for better querying
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
        payment_status: session.payment_status
      };
      
      // Guardar en la base de datos
      const client = new MongoClient(uri, mongodbOptions);
      await client.connect();
      const db = client.db("papyrus");
      const usersCollection = db.collection("users");
      
      // Obtener el usuario actual desde la sesión
      const user = req.user;
      if (!user) {
        return res.status(401).redirect('/login.html');
      }
      
      // Actualizar el usuario en la base de datos
      await usersCollection.updateOne(
        { _id: new ObjectId(user._id) },
        { $set: decodedUserData },
        { upsert: true }
      );
      
      // Enviar correo de confirmación
      await sendSubscriptionEmail(user, decodedUserData);
      
      await client.close();
      
      // Redirigir al usuario a su perfil
      res.redirect('/profile');
    } else {
      // Si el pago no se completó correctamente
      console.error('Payment not completed:', session.payment_status);
      res.redirect('/payment-failed.html');
    }
  } catch (error) {
    console.error('Error saving user after payment:', error);
    res.redirect('/error.html');
  }
});
*/
app.get('/save-user', async (req, res) => {
  const { session_id } = req.query;
  
  try {
    // Verificar la sesión de Stripe con expansión de datos relacionados
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription']
    });
    
    // Obtener el usuario actual desde la sesión
    const user = req.user;
    if (!user) {
      return res.status(401).redirect('/login.html');
    }
    
    // Recuperar el client_reference_id de la sesión
    const clientReferenceId = session.client_reference_id;
    if (!clientReferenceId) {
      console.error('No client_reference_id found in session');
      return res.redirect('/error.html?reason=missing_reference');
    }
    
    // Conectar a la base de datos
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const db = client.db("papyrus");
    const tempDataCollection = db.collection("checkout_temp_data");
    const usersCollection = db.collection("users");
    
    // Recuperar los datos temporales almacenados
    const tempUserData = await tempDataCollection.findOne({ 
      client_reference_id: clientReferenceId 
    });
    
    if (!tempUserData) {
      console.error('No temporary data found for client_reference_id:', clientReferenceId);
      await client.close();
      return res.redirect('/error.html?reason=data_not_found');
    }
    
    // Crear current date en formato yyyy-mm-dd
    const currentDate = new Date();
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dd = String(currentDate.getDate()).padStart(2, '0');
    const formattedDate = `${yyyy}-${mm}-${dd}`;
    
    // Obtener metadatos básicos de la sesión
    const sessionMetadata = session.metadata || {};
    
    // Combinar datos almacenados con información de la sesión de Stripe
    const userData = {
      ...tempUserData.data,
      subscription_plan: sessionMetadata.plan || tempUserData.data.plan,
      registration_date: formattedDate,
      registration_date_obj: currentDate,
      stripe_customer_id: session.customer,
      stripe_subscription_id: session.subscription?.id,
      payment_status: session.payment_status,
      // Si hay metadatos adicionales en la sesión, también los incluimos
      ...Object.keys(sessionMetadata).reduce((acc, key) => {
        if (!['plan'].includes(key)) { // Excluir claves que ya procesamos
          acc[key] = sessionMetadata[key];
        }
        return acc;
      }, {})
    };
    
    // Actualizar el usuario en la base de datos
    await usersCollection.updateOne(
      { _id: new ObjectId(user._id) },
      { $set: userData },
      { upsert: true }
    );
    
    // Enviar correo de confirmación
    await sendSubscriptionEmail(user, userData);
    
    // Eliminar los datos temporales
    await tempDataCollection.deleteOne({ client_reference_id: clientReferenceId });
    
    await client.close();
    
    // Redirigir al usuario a su perfil
    res.redirect('/profile');
  } catch (error) {
    console.error('Error saving user after payment:', error);
    res.status(500).redirect('/error.html');
  }
});

app.post('/save-free-plan', async (req, res) => {
  const { 
    plan, 
    industry_tags, 
    sub_industria_map, // Añadido: mapa de subindustrias
    rama_juridicas, 
    profile_type, 
    sub_rama_map, 
    cobertura_legal, 
    company_name,
    name,
    web,
    linkedin,
    perfil_profesional,
    rangos,
    feedback, 
    etiquetas_personalizadas
  } = req.body;
  
  if (!req.user) {
    return res.status(401).send('Unauthorized');
  }

  try {
    // Create current date in yyyy-mm-dd format
    const currentDate = new Date();
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, '0'); // January is 0!
    const dd = String(currentDate.getDate()).padStart(2, '0');
    const formattedDate = `${yyyy}-${mm}-${dd}`;
    
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const db = client.db("papyrus");
    const usersCollection = db.collection("users");

    // Crear un objeto con los datos del usuario para actualizar
    const userData = {
      industry_tags,
      sub_industria_map, // Añadido: guardamos el mapa de subindustrias
      rama_juridicas,
      subscription_plan: plan,
      profile_type,
      sub_rama_map,
      cobertura_legal,
      company_name,
      name,
      web,
      linkedin,
      perfil_profesional,
      rangos,
      feedback_login: feedback, // Renamed from feedback to feedback_login
      registration_date: formattedDate,    // String format yyyy-mm-dd
      registration_date_obj: currentDate,  // Also save native Date object for better querying
      etiquetas_personalizadas: etiquetas_personalizadas
    };

    await usersCollection.updateOne(
      { _id: new ObjectId(req.user._id) },
      { $set: userData },
      { upsert: true }
    );
    
    // Enviar correo de confirmación
    await sendSubscriptionEmail(req.user, userData);
    
    await client.close();
    res.json({ redirectUrl: '/profile' });
  } catch (error) {
    console.error('Error saving free plan data:', error);
    res.status(500).send('Error saving user data');
  }
});


/*Feedback*/
// En tu app.js
// En app.js
app.get('/feedback', async (req, res) => {
  try {
    const userId = req.query.userId; 
    const grade = parseInt(req.query.grade, 10);

    if (!userId || !grade) {
      return res.status(400).send('Faltan parámetros');
    }

    // Conexión a Mongo
    const client = new MongoClient(process.env.DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    await client.connect();
    const db = client.db('papyrus');
    const feedbackCol = db.collection('Feedback');
    const usersCol = db.collection('users');

    // 1) Buscar el email del usuario en "users"
    const userInDB = await usersCol.findOne({ _id: new ObjectId(userId) });
    if (!userInDB) {
      await client.close();
      return res.status(404).send('Usuario no encontrado');
    }

    // 2) Crear objeto feedback
    const fecha = moment().format('DD-MM-YYYY');
    const newFeedback = {
      user_id: new ObjectId(userId),
      user_email: userInDB.email,  // <--- GUARDAMOS EL EMAIL
      content_evaluated: 'email',
      fecha,
      grade,
      comentario: ''
    };

    // 3) Insertar
    const result = await feedbackCol.insertOne(newFeedback);
    const feedbackId = result.insertedId;

    await client.close();

    // 4) En lugar de redirigir a feedback.html sin más, 
    //    le mandamos a feedback.html con el param fid=...
    return res.redirect(`https://app.papyrus-ai.com/feedback.html?fid=${feedbackId}`);

  } catch (err) {
    console.error('Error en /feedback =>', err);
    return res.status(500).send('Error guardando feedback');
  }
});


// app.js
app.post('/feedback-comment', express.json(), async (req, res) => {
  try {
    const { fid, comentario } = req.body;
    if (!fid) {
      return res.status(400).send('Faltan parámetros (fid)');
    }

    const client = new MongoClient(process.env.DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    await client.connect();
    const db = client.db('papyrus');
    const feedbackCol = db.collection('Feedback');

    // 1) Actualiza "comentario" en el doc con _id=fid
    await feedbackCol.updateOne(
      { _id: new ObjectId(fid) },
      { $set: { comentario } }
    );

    await client.close();

    // 2) Responde un 200 OK => para que en JS se muestre "gracias"
    return res.status(200).send('OK');
  } catch (err) {
    console.error('Error en /feedback-comment =>', err);
    return res.status(500).send('Error guardando comentario');
  }
});



/*Cambiar suscripcion*/
app.get('/api/current-user', ensureAuthenticated, async (req, res) => {
  try {
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
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


app.post('/update-subscription', ensureAuthenticated, async (req, res) => {
  const { 
    plan, 
    industry_tags, 
    sub_industria_map,
    rama_juridicas, 
    profile_type, 
    sub_rama_map, 
    cobertura_legal, 
    company_name,
    name,
    web,
    linkedin,
    perfil_profesional,
    especializacion,
    otro_perfil,
    rangos,
    feedback,
    etiquetas_personalizadas
  } = req.body;
  
  if (!req.user) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const db = client.db("papyrus");
    const usersCollection = db.collection("users");

    // Update the existing user
    await usersCollection.updateOne(
      { _id: new ObjectId(req.user._id) },
      {
        $set: {
          industry_tags,
          rama_juridicas,
          subscription_plan: plan,
          profile_type,
          sub_industria_map,
          sub_rama_map,
          cobertura_legal,
          company_name,
          name,
          web,
          linkedin,
          perfil_profesional,
          especializacion,
          otro_perfil,
          rangos,
          feedback_login: feedback,
          subscription_updated_at: new Date(),
          etiquetas_personalizadas
        }
      }
    );
    
    await client.close();
    res.json({ redirectUrl: '/profile', message: 'Subscription updated successfully' });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).send('Error updating subscription');
  }
});
/*old user details
app.get('/api/current-user-details', ensureAuthenticated, async (req, res) => {
  try {
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
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
*/
app.get('/api/current-user-details', ensureAuthenticated, async (req, res) => {
  try {
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return all relevant user information for onboarding
    res.json({
      name: user.name || '',
      web: user.web || '',
      linkedin: user.linkedin || '',
      perfil_profesional: user.perfil_profesional || '',
      especializacion: user.especializacion || '',
      otro_perfil: user.otro_perfil || '',
      subscription_plan: user.subscription_plan || 'plan1',
      profile_type: user.profile_type || 'individual',
      company_name: user.company_name || '',
      industry_tags: user.industry_tags || [],
      sub_industria_map: user.sub_industria_map || [],
      rama_juridicas: user.rama_juridicas || [],
      sub_rama_map: user.sub_rama_map || {},
      rangos: user.rangos || [],
      cobertura_legal: user.cobertura_legal || {
        "fuentes-gobierno": [],
        "fuentes-reguladores": []
      }
    });
    
    await client.close();
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
      { _id: new ObjectId(req.user._id) },
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
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
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
      { _id: new ObjectId(req.user._id) },
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

