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
  // Removidas las opciones deprecadas useNewUrlParser y useUnifiedTopology
}

require('./auth'); // Ensure this file is configured correctly

const app = express();
const port = process.env.PORT || 5000;
/*const port = process.env.PORT || 0;
const server = app.listen(port, () => {
  const actualPort = server.address().port;
  console.log(`Server is running on port ${actualPort}`);
  console.log(`Access the app at http://localhost:${actualPort}/profile`);
});
*/
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

app.get('/paso0.html', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'paso0.html'));
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
      console.log(err);
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

      // Store the user email in a cookie for client-side access
      if (user && user.email) {
        // Set a cookie with the user's email - this will be accessible to client-side JavaScript
        res.cookie('userEmail', user.email, { 
          maxAge: 24 * 60 * 60 * 1000, // 1 day
          httpOnly: false, // Allow JavaScript access
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
        });
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
        return res.status(200).json({ redirectUrl: '/paso0.html' });
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
  const specialCharRegex = /[^\p{L}\p{N}]/u;

  if (!specialCharRegex.test(password)) {
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

      // Store the user email in a cookie for client-side access
      if (newUser && newUser.email) {
        // Set a cookie with the user's email - this will be accessible to client-side JavaScript
        res.cookie('userEmail', newUser.email, { 
          maxAge: 24 * 60 * 60 * 1000, // 1 day
          httpOnly: false, // Allow JavaScript access
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
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
      return res.status(200).json({ redirectUrl: '/paso0.html' });
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

      // Store the user email in a cookie for client-side access
      if (req.user && req.user.email) {
        // Set a cookie with the user's email - this will be accessible to client-side JavaScript
        res.cookie('userEmail', req.user.email, { 
          maxAge: 24 * 60 * 60 * 1000, // 1 day
          httpOnly: false, // Allow JavaScript access
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
        });
      }

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
      if (req.user.subscription_plan) {
        if (req.session.returnTo) {
          const redirectPath = req.session.returnTo;
          req.session.returnTo = null;
          return res.redirect(redirectPath);
        }
        return res.redirect('/profile');
      } else {
        return res.redirect('/paso0.html');
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
              Analizar documento
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
              Analizar documento
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
/*
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
                 Analizar documento
              </a>
            </div>
            <a class="leer-mas" href="${doc.url_pdf}" target="_blank" style="margin-right: 15px;">
              Leer más: ${doc._id}
            </a>
            <i class="fa fa-thumbs-up thumb-icon" onclick="sendFeedback('${doc._id}', 'like', this)"></i>
            <i class="fa fa-thumbs-down thumb-icon" style="margin-left: 10px;"
               onclick="sendFeedback('${doc._id}', 'dislike', this)"></i>

            <!-- Botón de Guardar -->
            <div class="guardar-button">
              <button class="save-btn" onclick="toggleListsDropdown(this, '${doc._id}', '${doc.collectionName}')">
                <i class="fas fa-bookmark"></i>
                Guardar
              </button>
              <div class="lists-dropdown">
                <div class="lists-dropdown-header">Guardar en lista</div>
                <div class="lists-container">
                  <!-- Las listas se cargarán dinámicamente -->
                </div>
                <div class="add-new-list" onclick="showNewListForm(this)">
                  <i class="fas fa-plus"></i>
                  Añadir nueva
                </div>
                <div class="new-list-form">
                  <input type="text" class="new-list-input" placeholder="Nombre de la nueva lista" maxlength="50">
                  <div class="new-list-buttons">
                    <button class="new-list-btn cancel" onclick="hideNewListForm(this)">Cancelar</button>
                    <button class="new-list-btn save" onclick="createNewList(this, '${doc._id}', '${doc.collectionName}')">OK</button>
                  </div>
                </div>
              </div>
            </div>
            
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
    console.error('Error in profile route:', error);
    res.status(500).send('Error interno del servidor');
  } finally {
    await client.close();
  }
});
*/
// ──────────────────────────── FUNCIÓN COMÚN ────────────────────────────
/**
 * Devuelve un array con las condiciones Mongo para
 *  • fecha inicial  >= start   (si viene)
 *  • fecha final    <= end     (si viene)
 * La fecha se guarda en tres campos numéricos: anio, mes (1‑12) y dia.
 */
function buildDateFilter(start, end) {
  const filters = [];

  if (start) {
    filters.push({
      $or: [
        { anio: { $gt: start.getFullYear() } },
        { anio: start.getFullYear(), mes: { $gt: start.getMonth() + 1 } },
        {
          anio: start.getFullYear(),
          mes: start.getMonth() + 1,
          dia: { $gte: start.getDate() }
        }
      ]
    });
  }

  if (end) {
    filters.push({
      $or: [
        { anio: { $lt: end.getFullYear() } },
        { anio: end.getFullYear(), mes: { $lt: end.getMonth() + 1 } },
        {
          anio: end.getFullYear(),
          mes: end.getMonth() + 1,
          dia: { $lte: end.getDate() }
        }
      ]
    });
  }

  return filters;    // <- se inyecta con el spread operator …
}
// ──────────────────────────── /FUNCIÓN COMÚN ────────────────────────────
// Helper function to get the latest date with documents in a collection
async function getLatestDateForCollection(db, collectionName) {
  try {
      const latestDoc = await db.collection(collectionName).find({})
        .sort({ anio: -1, mes: -1, dia: -1 })
        .project({ anio: 1, mes: 1, dia: 1 })
        .limit(1)
        .toArray();
      if (latestDoc.length > 0) {
        return { anio: latestDoc[0].anio, mes: latestDoc[0].mes, dia: latestDoc[0].dia };
      }
  } catch (err) {
      // Handle potential errors, e.g., collection not found
      console.warn(`Could not get latest date for collection ${collectionName}: ${err.message}`);
  }
  return null;
}
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
    
    // Obtener las etiquetas personalizadas del usuario (ahora es un objeto con etiquetas como claves)
    const userEtiquetasPersonalizadas = user.etiquetas_personalizadas || {};
    const etiquetasKeys = Object.keys(userEtiquetasPersonalizadas);
    
        let formattedRegDate = "01/04/2025"; // Fecha por defecto si no se encuentra o hay error
    if (user && user.registration_date) {
        try {
            // Intenta crear un objeto Date. MongoDB a veces devuelve string, a veces Date.
            const dateObj = new Date(user.registration_date);
            
            // Verifica si la fecha es válida
            if (!isNaN(dateObj.getTime())) {
                const day = String(dateObj.getDate()).padStart(2, '0');
                const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // Los meses son 0-indexados
                const year = dateObj.getFullYear();
                formattedRegDate = `${day}/${month}/${year}`;
            } else {
                console.warn(`Fecha de registro inválida para el usuario ${user._id}: ${user.registration_date}`);
            }
        } catch (e) {
            console.error(`Error al formatear fecha de registro para usuario ${user._id}:`, e);
            // Se usará la fecha por defecto
        }
    } else {
        console.warn(`No se encontró fecha de registro para el usuario ${user._id}`);
        // Se usará la fecha por defecto
    }

    // Mantener estos valores para compatibilidad con el código existente
    const userSubRamaMap = user.sub_rama_map || {};
    const userSubIndustriaMap = user.sub_industria_map || {};
    const userIndustries = user.industry_tags || [];
    const userRamas = user.rama_juridicas || [];
    const userRangos = user.rangos || [];
    
    // Extraer boletines de cobertura_legal
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
// Verificar si el usuario tiene etiquetas personalizadas
if (etiquetasKeys.length === 0) {
  // Preparar HTML con mensaje personalizado
  let profileHtml = fs.readFileSync(path.join(__dirname, 'public', 'profile.html'), 'utf8');
  
  // Ocultar los títulos de estadísticas y documentos
  profileHtml = profileHtml
    .replace('<div class="analytics-label">Estadísticas de la búsqueda</div>', '<div class="analytics-label" style="display: none;">Estadísticas de la búsqueda</div>')
    .replace('<div class="analytics-label">Documentos</div>', '<div class="analytics-label" style="display: none;">Documentos</div>');
  
  // Reemplazar el mensaje de error con el nuevo mensaje personalizado
  profileHtml = profileHtml
    .replace('{{name}}', user.name || '')
    .replace('{{email}}', user.email || '')
    .replace('{{subindustria_map_json}}', JSON.stringify(userSubIndustriaMap))
    .replace('{{industry_tags_json}}', JSON.stringify(userIndustries))
    .replace('{{rama_juridicas_json}}', JSON.stringify(userRamas))
    .replace('{{subrama_juridicas_json}}', JSON.stringify(userSubRamaMap))
    .replace('{{boeDocuments}}', `<div class="no-results" style="color: #04db8d; font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Hemos lanzado una nueva versión del producto para poder personalizar más las alertas del usuario. Por favor, configura de nuevo tu perfil en menos de 5mins.</div>`)
    .replace('{{months_json}}', JSON.stringify([]))
    .replace('{{counts_json}}', JSON.stringify([]))
    .replace('{{subscription_plan}}', JSON.stringify(user.subscription_plan || 'plan1'))
    .replace('{{start_date}}', JSON.stringify(new Date()))
    .replace('{{end_date}}', JSON.stringify(new Date()))
    .replace('{{user_boletines_json}}', JSON.stringify(userBoletines || []))
    .replace('{{user_rangos_json}}', JSON.stringify(userRangos || []))
    .replace('{{etiquetas_personalizadas_json}}', JSON.stringify(userEtiquetasPersonalizadas))
    .replace('{{registration_date_formatted}}', formattedRegDate);
  
  // Enviar respuesta y terminar la ejecución
  return res.send(profileHtml);
}

    // Default date range for "profile": from 1 month ago to now
    const now = new Date();
    const startDate = new Date();
    startDate.setMonth(now.getMonth());
    startDate.setDate(now.getDate()-1);
    const endDate = now;

    // Obtener parámetros de búsqueda de la URL
    const { etiquetas, boletines, rangos, startDate: queryStartDate, endDate: queryEndDate } = req.query;
    
    // Parsear parámetros si existen
    const selectedEtiquetas = etiquetas ? JSON.parse(etiquetas) : etiquetasKeys;
    const selectedBoletines = boletines ? JSON.parse(boletines) : userBoletines;
    const selectedRangos = rangos ? JSON.parse(rangos) : userRangos;
    
    // Parsear fechas si existen
    const searchStartDate = queryStartDate ? new Date(queryStartDate) : startDate;
    const searchEndDate = queryEndDate ? new Date(queryEndDate) : endDate;
    const dateFilter = buildDateFilter(searchStartDate, searchEndDate);

    // NUEVA CONSULTA: Filtrar principalmente por etiquetas personalizadas
    const query = {
      $and: [
        // Condiciones de fecha (siempre requeridas)
        ...dateFilter,
        // Filtro por rango (siempre requerido)
        { rango_titulo: { $in: selectedRangos } },
        // Filtro por etiquetas personalizadas (principal criterio de búsqueda)
        {
          $or: [
            // Opción 1: Los documentos tienen etiquetas como objeto (nueva estructura)
            {
              $or: selectedEtiquetas.map(etiqueta => {
                const field = `etiquetas_personalizadas.${user._id.toString()}.${etiqueta}`;
                return { [field]: { $exists: true } };
              })
            },
            // Opción 2: Los documentos tienen etiquetas como array (estructura antigua)
            {
              [`etiquetas_personalizadas.${user._id.toString()}`]: { 
                $in: selectedEtiquetas 
              }
            }
          ]
        }  
      ]
    };

    console.log(`Query:`, JSON.stringify(query, null, 2));

    const projection = {
      short_name: 1,
      divisiones: 1,
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
    for (const collectionName of selectedBoletines) {
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

    // Generar HTML para los documentos
    // 2. Modificación para el mensaje cuando no hay resultados pero hay documentos que cumplen con otros filtros
// Añadir después de la consulta principal y antes de generar el HTML de documentos

// Crear una consulta sin el filtro de etiquetas personalizadas para contar páginas
    const queryWithoutEtiquetas = {
      $and: [
        // Condiciones de fecha (siempre requeridas)
        ...dateFilter,
        
        // Filtro por rango (siempre requerido)
       // { rango_titulo: { $in: selectedRangos } }
      ]
    };

// Proyección para obtener solo el número de páginas
    const projectionWithPages = {
      num_paginas: 1
          };

      // Generar HTML para los documentos
      let documentsHtml;
      let hideAnalyticsLabels = false;

      if (allDocuments.length === 0) {
        // Si no hay documentos que coincidan con las etiquetas, buscar documentos que cumplan con otros filtros
        let totalPages = 0;
        
        // Para cada colección seleccionada, contar el número total de páginas
        for (const collectionName of selectedBoletines) {
          const coll = database.collection(collectionName);
          const docs = await coll.find(queryWithoutEtiquetas).project(projectionWithPages).toArray();
          
          // Sumar el número de páginas de todos los documentos
          docs.forEach(doc => {
            totalPages += doc.num_paginas || 0;
          });
        }
        
        // Generar mensaje personalizado con el número total de páginas
        documentsHtml = `<div class="no-results" style="color: #04db8d; font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Puedes estar tranquilo. Tus agentes han analizado ${totalPages} páginas hoy y no hay nada que te afecte.</div>`;
        
        // Indicar que se deben ocultar los títulos de estadísticas y documentos
        hideAnalyticsLabels = true;
      } else {
  // Si hay documentos, generar el HTML normalmente
      documentsHtml = allDocuments.map(doc => {
        const rangoToShow = doc.rango_titulo || "Indefinido";
        
        // Generar HTML para etiquetas personalizadas - compatible con ambas estructuras
        const etiquetasPersonalizadasHtml = (() => { 
          // Si el documento no tiene etiquetas personalizadas, devolver cadena vacía
          if (!doc.etiquetas_personalizadas) return '';
          
          // En documentos, las etiquetas están bajo el ID del usuario
          const userId = user._id.toString();
          const userEtiquetas = doc.etiquetas_personalizadas[userId];
          
          // Si no hay etiquetas para este usuario, devolver cadena vacía
          if (!userEtiquetas || (Array.isArray(userEtiquetas) && userEtiquetas.length === 0) || 
              (typeof userEtiquetas === 'object' && Object.keys(userEtiquetas).length === 0)) {
            return '';
          }
          
          // Determinar qué etiquetas mostrar según la estructura
          let etiquetasParaMostrar = [];
          
          if (Array.isArray(userEtiquetas)) {
            // ESTRUCTURA ANTIGUA: Array de etiquetas
            etiquetasParaMostrar = userEtiquetas;
          } else if (typeof userEtiquetas === 'object' && userEtiquetas !== null) {
            // ESTRUCTURA NUEVA: Objeto con etiquetas como claves
            etiquetasParaMostrar = Object.keys(userEtiquetas);
          }
          
          // Generar HTML solo para las etiquetas (badges)
          return `
            <div class="etiquetas-personalizadas-values">
              ${etiquetasParaMostrar.map(etiqueta => 
                `<span class="etiqueta-personalizada-value">${etiqueta}</span>`
              ).join(' ')}
            </div>
          `;
        })();

        // Generar HTML para la sección "Impacto en agentes" solo si es estructura nueva
        const impactoAgentesHtml = (() => {
          if (!doc.etiquetas_personalizadas) return '';
          
          const userId = user._id.toString();
          const userEtiquetas = doc.etiquetas_personalizadas[userId];
          
          // Solo mostrar para la estructura nueva (objeto, no array)
          if (!userEtiquetas || Array.isArray(userEtiquetas) || typeof userEtiquetas !== 'object') return '';
          
          const etiquetasKeys = Object.keys(userEtiquetas);
          if (etiquetasKeys.length === 0) return '';
          
          return `
            <div class="impacto-agentes" style="margin-top: 15px; margin-bottom: 15px; padding-left: 15px; border-left: 4px solid #04db8d; background-color: rgba(4, 219, 141, 0.05);">
              <div style="font-weight: 600;font-size: large; margin-bottom: 10px; color: #455862; padding: 5px;">Impacto en agentes</div>
              <div style="padding: 0 5px 10px 5px; font-size: 1.1em; line-height: 1.5;">
                ${etiquetasKeys.map(etiqueta => 
                  `<div style="margin-bottom: 12px; display: flex; align-items: baseline;">
                    <svg width="16" height="16" viewBox="0 0 24 24" style="color: #04db8d; margin-right: 10px; flex-shrink: 0;">
                      <path fill="currentColor" d="M10.5 17.5l7.5-7.5-7.5-7.5-1.5 1.5L15 10l-6 6z"></path>
                    </svg>
                    <div style="flex: 1;"><span style="font-weight: 600;">${etiqueta}:</span> ${userEtiquetas[etiqueta]}</div>
                  </div>`
                ).join('')}
              </div>
            </div>
          `;
        })();

        
        // Generar HTML para el documento
        return `
          <div class="data-item">
            <div class="header-row">
              <div class="id-values">${doc.short_name}</div>
              <span class="date"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span>
            </div>
            <div style="color: gray; font-size: 1.1em; margin-bottom: 6px;">
              ${rangoToShow} | ${doc.collectionName}
            </div>
            ${etiquetasPersonalizadasHtml}
            <div class="resumen-label">Resumen</div>
            <div class="resumen-content" style="font-size: 1.1em; line-height: 1.4;">${doc.resumen}</div>
            ${impactoAgentesHtml}
            <div class="margin-impacto">
              <a class="button-impacto" 
                 href="/norma.html?documentId=${doc._id}&collectionName=${doc.collectionName}">
                 Analizar documento
              </a>
            </div>
            <a class="leer-mas" href="${doc.url_pdf}" target="_blank" style="margin-right: 15px;">
              Leer más: ${doc._id}
            </a>
            <i class="fa fa-thumbs-up thumb-icon" onclick="sendFeedback('${doc._id}', 'like', this)"></i>
            <i class="fa fa-thumbs-down thumb-icon" style="margin-left: 10px;"
               onclick="sendFeedback('${doc._id}', 'dislike', this)"></i>
            
            <!-- Botón de Guardar -->
            <div class="guardar-button">
              <button class="save-btn" onclick="toggleListsDropdown(this, '${doc._id}', '${doc.collectionName}')">
                <i class="fas fa-bookmark"></i>
                Guardar
              </button>
              <div class="lists-dropdown">
                <div class="lists-dropdown-header">
                  <span>Guardar en...</span>
                  <button class="save-ok-btn" onclick="saveToSelectedLists(this)">OK</button>
                </div>
                <div class="lists-content">
                  <div class="lists-container">
                    <!-- Las listas se cargarán dinámicamente -->
                  </div>
                  <div class="add-new-list" onclick="showNewListForm(this)">
                    <i class="fas fa-plus"></i>
                    Añadir nueva
                  </div>
                  <div class="new-list-form">
                    <input type="text" class="new-list-input" placeholder="Nombre de la nueva lista" maxlength="50">
                    <div class="new-list-buttons">
                      <button class="new-list-btn cancel" onclick="hideNewListForm(this)">Cancelar</button>
                      <button class="new-list-btn save" onclick="createNewList(this, '${doc._id}', '${doc.collectionName}')">OK</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
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

    // Sort months and prepare data for chart
    const sortedMonths = Object.keys(documentsByMonth).sort();
    const monthsForChart = sortedMonths.map(m => {
      const [year, month] = m.split('-');
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return `${monthNames[parseInt(month) - 1]} ${year}`;
    });
    const countsForChart = sortedMonths.map(m => documentsByMonth[m]);

    // Render the profile page with data
    let profileHtml = fs.readFileSync(path.join(__dirname, 'public', 'profile.html'), 'utf8');
    // Si se deben ocultar los títulos, modificar el HTML
    if (hideAnalyticsLabels) {
      profileHtml = profileHtml
        .replace('<div class="analytics-label">Estadísticas de la búsqueda</div>', '<div class="analytics-label" style="display: none;">Estadísticas de la búsqueda</div>')
        .replace('<div id="chartContainer">', '<div id="chartContainer" style="display:none;">')
        .replace('<div class="analytics-label">Documentos</div>', '<div class="analytics-label" style="display:none;">Documentos</div>');
    }

    profileHtml = profileHtml
      .replace('{{name}}', user.name || '')
      .replace('{{email}}', user.email || '')
      .replace('{{subindustria_map_json}}', JSON.stringify(userSubIndustriaMap))
      .replace('{{industry_tags_json}}', JSON.stringify(userIndustries))
      .replace('{{rama_juridicas_json}}', JSON.stringify(userRamas))
      .replace('{{subrama_juridicas_json}}', JSON.stringify(userSubRamaMap))
      .replace('{{boeDocuments}}', documentsHtml)
      .replace('{{months_json}}', JSON.stringify(monthsForChart))
      .replace('{{counts_json}}', JSON.stringify(countsForChart))
      .replace('{{subscription_plan}}', JSON.stringify(user.subscription_plan || 'plan1'))
      .replace('{{start_date}}', JSON.stringify(searchStartDate))
      .replace('{{end_date}}', JSON.stringify(searchEndDate))
      .replace('{{user_boletines_json}}', JSON.stringify(selectedBoletines))
      .replace('{{user_rangos_json}}', JSON.stringify(selectedRangos))
      .replace('{{etiquetas_personalizadas_json}}', JSON.stringify(userEtiquetasPersonalizadas))
      .replace('{{registration_date_formatted}}', formattedRegDate);

    res.send(profileHtml);
  } catch (error) {
    console.error('Error in profile route:', error);
    res.status(500).send('Error interno del servidor');
  } finally {
    await client.close();
  }
});

//------------------------- Boletin Diario -----------------------------
app.get('/api/boletin-diario', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    // Retrieve the logged-in user
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's subscribed collections (boletines)
    let userBoletines = [];
    if (user.cobertura_legal && user.cobertura_legal['fuentes-gobierno']) {
      userBoletines = userBoletines.concat(user.cobertura_legal['fuentes-gobierno']);
    }
    if (user.cobertura_legal && user.cobertura_legal['fuentes-reguladores']) {
      userBoletines = userBoletines.concat(user.cobertura_legal['fuentes-reguladores']);
    }
    userBoletines = userBoletines.map(b => b.toUpperCase());
    if (userBoletines.length === 0) {
      userBoletines = ["BOE"]; // Default if none subscribed
    }

    // Get filter parameters from query string (or use defaults)
    const { boletines, rangos } = req.query;
    const selectedBoletines = boletines ? JSON.parse(boletines) : userBoletines;
    
    // Read the full list of possible rangos from the file generated earlier.
    let allRangos = [];
    
      //  console.error("Error reading rangos_list.txt:", fsError);
        // Use a hardcoded default list as fallback
    allRangos = ["Acuerdos Internacionales",
    "Normativa Europea",
    "Legislacion Nacional",
    "Normativa Reglamentaria",
    "Decisiones Judiciales",
    "Doctrina Administrativa",
    "Comunicados, Guias y Opiniones Consultivas",
    "Consultas Publicas",
    "Normativa en tramitación",
    "Otras"];
    
    // If 'rangos' query param is missing or empty, use all available rangos for filtering.
    const selectedRangos = (rangos && JSON.parse(rangos).length > 0) ? JSON.parse(rangos) : allRangos;

    const todayProjection = {
      short_name: 1,
      divisiones: 1,
      resumen: 1,
      dia: 1,
      mes: 1,
      anio: 1,
      url_pdf: 1,
      ramas_juridicas: 1,
      rango_titulo: 1,
      _id: 1
    };

    // ---------- COMPLETELY REVISED LOGIC ----------
    // 1. Get today's date for comparison
    const today = new Date();
    
    // 2. Initialize variable to store found date and documents
    let foundDocuments = [];
    let foundDate = null;
    
    // 3. Iterate backwards from today up to 60 days
    for (let daysAgo = 0; daysAgo <= 60; daysAgo++) {
      // Calculate the date to check
      const checkDate = new Date();
      checkDate.setDate(today.getDate() - daysAgo);
      
      // Create the query for this date
      const dateQuery = {
        anio: checkDate.getFullYear(),
        mes: checkDate.getMonth() + 1,
        dia: checkDate.getDate(),
        rango_titulo: { $in: selectedRangos }
      };
      
      console.log(`Checking date: ${checkDate.getDate()}/${checkDate.getMonth() + 1}/${checkDate.getFullYear()}`);
      
      // Search for documents on this date across all selected boletines
      let documentsOnDate = [];
      for (const collectionName of selectedBoletines) {
        try {
          const coll = database.collection(collectionName);
          const docs = await coll.find(dateQuery).project(todayProjection).toArray();
          
          if (docs.length > 0) {
            // Add collection name to each document
            docs.forEach(doc => {
              doc.collectionName = collectionName;
            });
            documentsOnDate = documentsOnDate.concat(docs);
          }
        } catch (err) {
          console.error(`Error fetching docs for collection ${collectionName} on date ${checkDate.toISOString()}:`, err);
        }
      }
      
      // If we found documents for this date, save and break the loop
      if (documentsOnDate.length > 0) {
        foundDocuments = documentsOnDate;
        foundDate = {
          dia: checkDate.getDate(),
          mes: checkDate.getMonth() + 1,
          anio: checkDate.getFullYear()
        };
        console.log(`Found ${documentsOnDate.length} documents for date ${foundDate.dia}/${foundDate.mes}/${foundDate.anio}`);
        break;
      }
    }
    
    // 4. Sort the documents if we found any
    if (foundDocuments.length > 0) {
      foundDocuments.sort((a, b) => {
        if (a.collectionName < b.collectionName) return -1;
        if (a.collectionName > b.collectionName) return 1;
        return (a.short_name || '').localeCompare(b.short_name || '');
      });
    }
    
    // 5. Return the results
    return res.json({
      date: foundDate,
      documents: foundDocuments,
      availableBoletines: userBoletines,
      availableRangos: allRangos
    });
    // ---------- END REVISED LOGIC ----------

  } catch (error) {
    console.error('Error in /api/boletin-diario route:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    if (client) {
        await client.close();
    }
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
    
    // Obtener las etiquetas personalizadas del usuario (ahora es un objeto con etiquetas como claves)
    const userEtiquetasPersonalizadas = user.etiquetas_personalizadas || {};
    const etiquetasKeys = Object.keys(userEtiquetasPersonalizadas);
    
    // Verificar si el usuario tiene etiquetas personalizadas
    if (etiquetasKeys.length === 0) {
      return res.json({
        documentsHtml: `<div class="no-results" style="color: #04db8d; font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Hemos lanzado una nueva versión del producto para poder personalizar más las alertas del usuario. Por favor, configura de nuevo tu perfil en menos de 5mins.</div>`,
        hideAnalyticsLabels: true,
        monthsForChart: [],
        countsForChart: []
      });
    }

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
    // 1) Collect query parameters from the front-end
    const collections = req.query.collections ? req.query.collections.split('||') : userBoletines; // bulletins
    const rangoStr = req.query.rango || '';              // e.g. "Leyes||Reglamentos"
    const startDate = req.query.desde;
    const endDate = req.query.hasta;
    
    // Extraer las etiquetas personalizadas seleccionadas
    const etiquetasStr = req.query.etiquetas || '';
    let selectedEtiquetas = [];
    if (etiquetasStr.trim() !== '') {
      selectedEtiquetas = etiquetasStr.split('||').map(s => s.trim().toLowerCase()).filter(Boolean);
    }
    
    // CORRECCIÓN: Si no se seleccionaron etiquetas específicas, mostrar mensaje
    if (selectedEtiquetas.length === 0) {
      return res.json({
        documentsHtml: `<div class="no-results" style="color: #04db8d; font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Por favor, selecciona al menos un agente para realizar la búsqueda.</div>`,
        hideAnalyticsLabels: true,
        monthsForChart: [],
        countsForChart: []
      });
    }
    
    const userId = user._id.toString();
    
    // 2) Parse multiple Rango
    let selectedRangos = [];
    if (rangoStr.trim() !== '') {
      selectedRangos = rangoStr.split('||').map(s => s.trim()).filter(Boolean);
    }

    // 3) Build base MongoDB query for DB-level fields: bulletins, date
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
      

    // 4) Proyección para incluir etiquetas_personalizadas y num_paginas
    const projection = {
      short_name: 1,
      resumen: 1,
      dia: 1,
      mes: 1,
      anio: 1,
      url_pdf: 1,
      rango_titulo: 1,
      etiquetas_personalizadas: 1,
      num_paginas: 1,
      _id: 1
    };

    // 5) Collect documents from each chosen bulletin
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
//
// 5.1) Construir queryWithoutEtiquetas (igual que en /profile)
//

// convertir los strings ISO (YYYY‑MM‑DD) a Date sólo una vez
const start = startDate ? new Date(startDate) : null;
const end   = endDate   ? new Date(endDate)   : null;

const dateFilter = buildDateFilter(start, end);

const queryWithoutEtiquetas = {
  $and: [
   ...dateFilter,
    
    // Filtro por rango (siempre requerido)
   // ...(selectedRangos.length > 0 ? [{ rango_titulo: { $in: selectedRangos } }] : [])
  ]
};
    // 6) Filtrar documentos por rango y etiquetas personalizadas
    const filteredDocuments = [];
    for (const doc of allDocuments) {
      // Rango filter (must match user rangos if specified)
      const docRango = doc.rango_titulo || "Indefinido";
      let passesRangoFilter = true;
      if (selectedRangos.length > 0) {
        passesRangoFilter = selectedRangos.includes(docRango);
      }
      
      if (!passesRangoFilter) continue;

      // Verificar coincidencia de etiquetas personalizadas - soportando ambas estructuras
      let hasEtiquetasMatch = false;
      let matchedEtiquetas = [];
      
      // Verificar si el documento tiene etiquetas personalizadas para este usuario
      if (doc.etiquetas_personalizadas && doc.etiquetas_personalizadas[userId]) {
        const userEtiquetas = doc.etiquetas_personalizadas[userId];
        
        if (Array.isArray(userEtiquetas)) {
          // ESTRUCTURA ANTIGUA: Array de etiquetas
          // Verificar si alguna de las etiquetas elegidas coincide con las del documento (case-insensitive)
          const etiquetasCoincidentes = userEtiquetas.filter(etiqueta => 
            selectedEtiquetas.includes(etiqueta.toLowerCase())
          );
          
          if (etiquetasCoincidentes.length > 0) {
            hasEtiquetasMatch = true;
            matchedEtiquetas = etiquetasCoincidentes;
          }
        } else if (typeof userEtiquetas === 'object' && userEtiquetas !== null) {
          // ESTRUCTURA NUEVA: Objeto con etiquetas como claves
          const docEtiquetasKeys = Object.keys(userEtiquetas);
          
          // Verificar si alguna de las etiquetas elegidas coincide con las del documento (case-insensitive)
          const etiquetasCoincidentes = docEtiquetasKeys.filter(etiqueta => 
            selectedEtiquetas.includes(etiqueta.toLowerCase())
          );
          
          if (etiquetasCoincidentes.length > 0) {
            hasEtiquetasMatch = true;
            matchedEtiquetas = etiquetasCoincidentes;
          }
        }
      }
      
      // Si hay coincidencia de etiquetas, añadir el documento a los resultados
      if (hasEtiquetasMatch) {
        doc.matched_etiquetas = [...new Set(matchedEtiquetas)];
        filteredDocuments.push(doc);
      }
    }

    // 7) Generar datos para el gráfico de estadísticas
    const monthsForChart = [];
    const countsForChart = [];
    
    // Agrupar documentos por mes
    const documentsByMonth = {};
    
    for (const doc of filteredDocuments) {
      const monthKey = `${doc.anio}-${doc.mes.toString().padStart(2, '0')}`;
      documentsByMonth[monthKey] = (documentsByMonth[monthKey] || 0) + 1;
    }
    
    // Ordenar meses cronológicamente
    const sortedMonths = Object.keys(documentsByMonth).sort();
    
    // Generar datos para el gráfico
    for (const month of sortedMonths) {
      const [year, monthNum] = month.split('-');
      const monthName = new Date(parseInt(year), parseInt(monthNum) - 1, 1).toLocaleString('es-ES', { month: 'long' });
      monthsForChart.push(`${monthName} ${year}`);
      countsForChart.push(documentsByMonth[month]);
    }

    //recuento paginas
    let totalPages = 0;
    for (const cName of collections) {
      const docs = await database
        .collection(cName)
        .find(queryWithoutEtiquetas)
        .project({ num_paginas: 1 })
        .toArray();
      totalPages += docs.reduce((sum, d) => sum + (d.num_paginas||0), 0);
    }


    // 8) Si no hay documentos que coincidan con las etiquetas, buscar documentos que cumplan con otros filtros
    // y sumar el número total de páginas
    if (filteredDocuments.length === 0) {
      /*let totalPages = 0;
      
      // Para cada boletín, consulta solo num_paginas usando queryWithoutEtiquetas
      for (const cName of collections) {
        const coll = database.collection(cName);
        const docs = await coll
          .find(queryWithoutEtiquetas)
          .project({ num_paginas: 1 })
          .toArray();
        
        // Sumar el número de páginas de todos los documentos
        docs.forEach(d => {
          totalPages += d.num_paginas || 0;
        });
      }
        */
    
      // Si totalPages sigue siendo 0, mensaje de "sin resultados"
      if (totalPages === 0) {
        return res.json({
          documentsHtml: `<div class="no-results">No hay resultados para esta búsqueda.</div>`,
          hideAnalyticsLabels: true,
          monthsForChart: [],
          countsForChart: []
        });
      }
    
      // Devolver mensaje con el total de páginas revisadas
      return res.json({
        documentsHtml: `<div class="no-results" style="color: #04db8d; font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Puedes estar tranquilo. Tus agentes han analizado ${totalPages.toLocaleString()} páginas y no hay nada que te afecte.</div>`,
        hideAnalyticsLabels: true,
        monthsForChart: [],
        countsForChart: []
      });
    }

    // 9) Build documentsHtml
    const documentsHtml = filteredDocuments.map(doc => {
      const rangoToShow = doc.rango_titulo || "Indefinido";
      
      // Generar HTML para etiquetas personalizadas - compatible con ambas estructuras
      const etiquetasPersonalizadasHtml = (() => { 
        // Si el documento no tiene etiquetas personalizadas, devolver cadena vacía
        if (!doc.etiquetas_personalizadas) return '';
        
        // En documentos, las etiquetas están bajo el ID del usuario
        const userId = user._id.toString();
        const userEtiquetas = doc.etiquetas_personalizadas[userId];
        
        // Si no hay etiquetas para este usuario, devolver cadena vacía
        if (!userEtiquetas || (Array.isArray(userEtiquetas) && userEtiquetas.length === 0) || 
            (typeof userEtiquetas === 'object' && Object.keys(userEtiquetas).length === 0)) {
          return '';
        }
        
        // Determinar qué etiquetas mostrar según la estructura
        let etiquetasParaMostrar = [];
        
        if (Array.isArray(userEtiquetas)) {
          // ESTRUCTURA ANTIGUA: Array de etiquetas
          etiquetasParaMostrar = userEtiquetas;
        } else if (typeof userEtiquetas === 'object' && userEtiquetas !== null) {
          // ESTRUCTURA NUEVA: Objeto con etiquetas como claves
          etiquetasParaMostrar = Object.keys(userEtiquetas);
        }
        
        // Generar HTML solo para las etiquetas (badges)
        return `
          <div class="etiquetas-personalizadas-values">
            ${etiquetasParaMostrar.map(etiqueta => 
              `<span class="etiqueta-personalizada-value">${etiqueta}</span>`
            ).join(' ')}
          </div>
        `;
      })();

      // Generar HTML para la sección "Impacto en agentes" solo si es estructura nueva
      const impactoAgentesHtml = (() => {
        if (!doc.etiquetas_personalizadas) return '';
        
        const userId = user._id.toString();
        const userEtiquetas = doc.etiquetas_personalizadas[userId];
        
        // Solo mostrar para la estructura nueva (objeto, no array)
        if (!userEtiquetas || Array.isArray(userEtiquetas) || typeof userEtiquetas !== 'object') return '';
        
        const etiquetasKeys = Object.keys(userEtiquetas);
        if (etiquetasKeys.length === 0) return '';
        
        return `
          <div class="impacto-agentes" style="margin-top: 15px; margin-bottom: 15px; padding-left: 15px; border-left: 4px solid #04db8d; background-color: rgba(4, 219, 141, 0.05);">
            <div style="font-weight: 600; margin-bottom: 10px; color: #455862; padding: 5px;">Impacto en agentes</div>
            <div style="padding: 0 5px 10px 5px; font-size: 1.1em; line-height: 1.5;">
              ${etiquetasKeys.map(etiqueta => 
                `<div style="margin-bottom: 12px; display: flex; align-items: baseline;">
                  <svg width="16" height="16" viewBox="0 0 24 24" style="color: #04db8d; margin-right: 10px; flex-shrink: 0;">
                    <path fill="currentColor" d="M10.5 17.5l7.5-7.5-7.5-7.5-1.5 1.5L15 10l-6 6z"></path>
                  </svg>
                  <div style="flex: 1;"><span style="font-weight: 600;">${etiqueta}:</span> ${userEtiquetas[etiqueta]}</div>
                </div>`
              ).join('')}
            </div>
          </div>
        `;
      })();

      
      // Generar HTML para el documento
      return `
        <div class="data-item">
          <div class="header-row">
            <div class="id-values">${doc.short_name}</div>
            <span class="date"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span>
          </div>
          <div style="color: gray; font-size: 1.1em; margin-bottom: 6px;">
            ${rangoToShow} | ${doc.collectionName}
          </div>
          ${etiquetasPersonalizadasHtml}
          <div class="resumen-label">Resumen</div>
          <div class="resumen-content" style="font-size: 1.1em; line-height: 1.4;">${doc.resumen}</div>
          ${impactoAgentesHtml}
          <div class="margin-impacto">
            <a class="button-impacto" 
               href="/norma.html?documentId=${doc._id}&collectionName=${doc.collectionName}">
               Analizar documento
            </a>
          </div>
          <a class="leer-mas" href="${doc.url_pdf}" target="_blank" style="margin-right: 15px;">
            Leer más: ${doc._id}
          </a>
          <i class="fa fa-thumbs-up thumb-icon" onclick="sendFeedback('${doc._id}', 'like', this)"></i>
          <i class="fa fa-thumbs-down thumb-icon" style="margin-left: 10px;"
             onclick="sendFeedback('${doc._id}', 'dislike', this)"></i>
          
          <!-- Botón de Guardar -->
          <div class="guardar-button">
            <button class="save-btn" onclick="toggleListsDropdown(this, '${doc._id}', '${doc.collectionName}')">
              <i class="fas fa-bookmark"></i>
              Guardar
            </button>
            <div class="lists-dropdown">
              <div class="lists-dropdown-header">
                <span>Guardar en...</span>
                <button class="save-ok-btn" onclick="saveToSelectedLists(this)">OK</button>
              </div>
              <div class="lists-content">
                <div class="lists-container">
                  <!-- Las listas se cargarán dinámicamente -->
                </div>
                <div class="add-new-list" onclick="showNewListForm(this)">
                  <i class="fas fa-plus"></i>
                  Añadir nueva
                </div>
                <div class="new-list-form">
                  <input type="text" class="new-list-input" placeholder="Nombre de la nueva lista" maxlength="50">
                  <div class="new-list-buttons">
                    <button class="new-list-btn cancel" onclick="hideNewListForm(this)">Cancelar</button>
                    <button class="new-list-btn save" onclick="createNewList(this, '${doc._id}', '${doc.collectionName}')">OK</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <span class="doc-seccion" style="display:none;">Disposiciones generales</span>
          <span class="doc-rango" style="display:none;">${rangoToShow}</span>
        </div>
      `;
    }).join('');

    // 10) Return the HTML and chart data
    res.json({
      documentsHtml: documentsHtml,
      hideAnalyticsLabels: false,
      monthsForChart: monthsForChart,
      countsForChart: countsForChart,
      totalPages,
    });
  } catch (error) {
    console.error('Error in data route:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      monthsForChart: [],
      countsForChart: []
    });
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
app.post('/api/cancel-subscription', ensureAuthenticated, async (req, res) => {
  try {
    // Obtener el usuario actual
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Obtener los datos enviados desde el frontend
    const { cancel_stripe_subscription, billing_interval, rangos, cobertura_legal, etiquetas_personalizadas } = req.body;

    // Conectar a la base de datos
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const db = client.db("papyrus");
    const usersCollection = db.collection("users");

    // Obtener los datos actuales del usuario
    const currentUser = await usersCollection.findOne({ _id: new ObjectId(user._id) });
    
    // Verificar si el usuario tiene una suscripción activa en Stripe
    if (cancel_stripe_subscription && currentUser.stripe_subscription_id) {
      try {
        // Cancelar la suscripción en Stripe
        await stripe.subscriptions.cancel(currentUser.stripe_subscription_id, {
          prorate: true, // Prorratear el reembolso si es necesario
        });
        
        console.log(`Suscripción ${currentUser.stripe_subscription_id} cancelada en Stripe`);
      } catch (stripeError) {
        console.error('Error al cancelar suscripción en Stripe:', stripeError);
        // Continuamos con la actualización en la base de datos incluso si hay un error en Stripe
      }
    }

    // Crear current date en formato yyyy-mm-dd
    const currentDate = new Date();
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dd = String(currentDate.getDate()).padStart(2, '0');
    const formattedDate = `${yyyy}-${mm}-${dd}`;

    // Datos a actualizar en la base de datos
    const updateData = {
      subscription_plan: 'plan1', // Cambiar a plan gratuito
      billing_interval: billing_interval || 'suscripción cancelada',
      rangos: rangos || [],
      cobertura_legal: cobertura_legal || {
        'fuentes-gobierno': [],
        'fuentes-reguladores': []
      },
      etiquetas_personalizadas: etiquetas_personalizadas || {},
      cancellation_date: formattedDate,
      cancellation_date_obj: currentDate,
      payment_status: 'canceled',
      // Resetear los extras
      extra_agentes: 0,
      extra_fuentes: 0,
      impact_analysis_limit: 0
    };

    // Actualizar el usuario en la base de datos
    await usersCollection.updateOne(
      { _id: new ObjectId(user._id) },
      { $set: updateData }
    );

    await client.close();

    // Enviar respuesta de éxito
    res.status(200).json({
      success: true,
      message: 'Suscripción cancelada correctamente',
      user: {
        ...updateData,
        _id: user._id,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Error al cancelar suscripción:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cancelar la suscripción',
      details: error.message
    });
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
        res.json({
          short_name: document.short_name,
          collectionName: collectionName, // Este es el nombre de la colección de MongoDB que ya estabas enviando
          rango_titulo: document.rango_titulo, // Nuevo: Añade esta línea
          url_pdf: document.url_pdf // Nuevo: Añade esta línea
      });   
      
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

      // Explicitly set encoding for stdout and stderr
      pythonProcess.stdout.setEncoding('utf8');
      pythonProcess.stderr.setEncoding('utf8');

      let result = '';
      let errorOutput = '';

      // Capture the output from the Python script
      pythonProcess.stdout.on('data', (data) => {
          result += data; // data is now a UTF-8 string
           console.log(`Python stdout: ${data}`);
      });

      // Capture errors from the Python script
      pythonProcess.stderr.on('data', (data) => {
          errorOutput += data; // data is now a UTF-8 string
           console.error(`Python stderr: ${data}`);
      });

      // Handle process completion
      pythonProcess.on('close', (code) => {
          if (code !== 0) {
              console.error(`Python script exited with code ${code}`, errorOutput);
              return res.status(500).send(`Python script failed with error: ${errorOutput}`);
          }

          // Send the result back to the client with explicit UTF-8 encoding
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
        planPrice = '120€';
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
  <title>Confirmación de Suscripción a Reversa</title>
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
      <img src="cid:reversaLogo" alt="Reversa Logo">
    </div>
    
    <div class="content">
      <h1>Confirmación de Suscripción</h1>
      
      <p id="greeting">Estimado/a ${userData.name || 'Usuario'},</p>
      
      <p>
         Como bien sabría decir un viejo jurista, en el complejo tablero de la ley, quien domina la información, 
        domina el juego. Y ahora, con Reversa, tienes las mejores cartas en la mano.
      </p>
      
      <p>
        No se trata simplemente de un servicio. Al contratar Reversa eliges tranquilidad: estarás siempre al día 
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
        <a href="https://reversa.ai" class="btn">Acceder a mi cuenta</a>
      </div>
      
      <p><em>La inteligencia es la capacidad de adaptarse al cambio.</em></p>
<p style="text-align: right;"><strong>— Stephen Hawking</strong></p>


      <p>
        Atentamente,
      </p>
      
      <p style="font-weight: 500;">
        El equipo de Reversa
      </p>
      
      <div class="footer">
        <p style="margin-bottom: 8px;">© Reversa Legal, ${currentYear}. Todos los derechos reservados.</p>
        <p>
          Si tiene alguna pregunta, puede contactarnos en
          <a href="mailto:info@reversa.ai">info@reversa.ai</a>
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
      from: 'info@reversa.ai', // Ajusta esto a tu dirección de correo verificada en SendGrid
      subject: 'Confirmación de Suscripción a Reversa',
      html: emailHtml,
       attachments: [
                {
                  filename: 'reversa_white.png',
                  path: path.join(__dirname, 'assets', 'reversa_white.png'),
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
/*
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
    success_url: `https://app.reversa.ai/save-user?session_id={CHECKOUT_SESSION_ID}&industry_tags=${encodedIndustryTags}&rama_juridicas=${encodedRamaJuridicas}&plan=${encodedPlan}&profile_type=${encodedProfileType}&sub_rama_map=${encodedSubRamaMap}&sub_industria_map=${encodedSubIndustriaMap}&cobertura_legal=${encodedCoberturaLegal}&company_name=${encodedCompanyName}&name=${encodedName}&web=${encodedWeb}&linkedin=${encodedLinkedin}&perfil_profesional=${encodedPerfilProfesional}&rangos=${encodedRangos}&feedback=${encodedFeedback}&etiquetas_personalizadas=${encodedEtiquetasPersonalizadas}`,
    cancel_url: 'https://app.reversa.ai/paso1.html',
    });

    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating Checkout Session:', error);
    res.status(500).json({ error: 'Failed to create Checkout Session' });
  }
});
*/
app.post('/create-checkout-session', async (req, res) => {
  const {
    plan,
    billingInterval,
    extra_agentes,
    extra_fuentes,
    impact_analysis_limit,
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
    // Definir precios base según el plan y el intervalo (en céntimos)
    const basePrices = {
      plan1: { monthly: 0, annual: 0 },
      plan2: { monthly: 5600, annual: 54000 },
      plan3: { monthly: 7000, annual: 67200 },
      plan4: { monthly: 0, annual: 0 } // Personalizado, se maneja por separado
    };
    
    // Definir precios de extras (en céntimos) - CORREGIDOS
    const extraPrices = {
      agentes: { monthly: 2000, annual: 24000 }, // 5000 * 12 = 60000
      fuentes: { monthly: 1500, annual: 18000 } // 1500 * 12 = 18000
    };
    
    // Verificar que el plan existe
    if (!basePrices[plan]) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }
    
    // Determinar el intervalo de facturación
    const interval = billingInterval === 'annual' ? 'annual' : 'monthly';
    
    // Crear los elementos de línea para Stripe
    const lineItems = [];
    
    // Añadir el plan base si no es plan4 (Enterprise)
    if (plan !== 'plan4') {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Plan ${plan === 'plan1' ? 'Free' : plan === 'plan2' ? 'Starter' : 'Pro'} (${interval === 'annual' ? 'Anual' : 'Mensual'})`,
            tax_code: 'txcd_10000000', // Código de impuesto para servicios digitales
          },
          unit_amount: basePrices[plan][interval],
          tax_behavior: 'exclusive', // Indicar que el precio es sin impuestos
          recurring: {
            interval: interval === 'annual' ? 'year' : 'month',
          }
        },
        quantity: 1
      });
    } else {
      // Para plan4 (Enterprise), redirigir a una página de contacto
      return res.json({ 
        redirectUrl: 'https://cal.com/tomasburgaleta/30min',
        isEnterprise: true
      });
    }
    
    // Añadir extra de agentes si corresponde
// Convertir explícitamente a número y verificar que sea mayor que 0
const numExtraAgentes = parseInt(extra_agentes) || 0;
if (numExtraAgentes > 0) {
  console.log(`Añadiendo ${numExtraAgentes} extras de agentes`); // Para depuración
  lineItems.push({
    price_data: {
      currency: 'eur',
      product_data: {
        name: `Extra de 12 agentes personalizados (${interval === 'annual' ? 'Anual' : 'Mensual'})`,
        tax_code: 'txcd_10000000', // Código de impuesto para servicios digitales
      },
      unit_amount: extraPrices.agentes[interval],
      tax_behavior: 'exclusive', // Indicar que el precio es sin impuestos
      recurring: {
        interval: interval === 'annual' ? 'year' : 'month',
      }
    },
    quantity: 1
  });
}

// Añadir extra de fuentes si corresponde
// Convertir explícitamente a número y verificar que sea mayor que 0
const numExtraFuentes = parseInt(extra_fuentes) || 0;
if (numExtraFuentes > 0) {
  console.log(`Añadiendo ${numExtraFuentes} extras de fuentes`); // Para depuración
  lineItems.push({
    price_data: {
      currency: 'eur',
      product_data: {
        name: `Extra de ${numExtraFuentes} fuentes oficiales (${interval === 'annual' ? 'Anual' : 'Mensual'})`,
        tax_code: 'txcd_10000000', // Código de impuesto para servicios digitales
      },
      unit_amount: extraPrices.fuentes[interval] * numExtraFuentes,
      tax_behavior: 'exclusive', // Indicar que el precio es sin impuestos
      recurring: {
        interval: interval === 'annual' ? 'year' : 'month',
      }
    },
    quantity: 1
  });
}

  
    // Dividir los datos grandes en múltiples campos de metadatos
    const metadataChunks = {};
    
    // Datos básicos que son strings simples
    metadataChunks.plan = plan;
    metadataChunks.billing_interval = interval;
    metadataChunks.extra_agentes = extra_agentes.toString();
    metadataChunks.extra_fuentes = extra_fuentes.toString();
    metadataChunks.impact_analysis_limit = impact_analysis_limit.toString();
    metadataChunks.profile_type = profile_type;
    metadataChunks.company_name = company_name;
    metadataChunks.name = name;
    metadataChunks.web = web;
    metadataChunks.linkedin = linkedin;
    metadataChunks.perfil_profesional = perfil_profesional;
    
    // Datos complejos que necesitan ser divididos
    // Industry tags
    const industryTagsStr = JSON.stringify(industry_tags);
    if (industryTagsStr.length <= 500) {
      metadataChunks.industry_tags = industryTagsStr;
    } else {
      // Dividir en chunks de 450 caracteres para dejar margen
      const chunks = Math.ceil(industryTagsStr.length / 450);
      for (let i = 0; i < chunks; i++) {
        metadataChunks[`industry_tags_${i}`] = industryTagsStr.substring(i * 450, (i + 1) * 450);
      }
      metadataChunks.industry_tags_chunks = chunks.toString();
    }
    
    // Sub industria map
    const subIndustriaMapStr = JSON.stringify(sub_industria_map);
    if (subIndustriaMapStr.length <= 500) {
      metadataChunks.sub_industria_map = subIndustriaMapStr;
    } else {
      const chunks = Math.ceil(subIndustriaMapStr.length / 450);
      for (let i = 0; i < chunks; i++) {
        metadataChunks[`sub_industria_map_${i}`] = subIndustriaMapStr.substring(i * 450, (i + 1) * 450);
      }
      metadataChunks.sub_industria_map_chunks = chunks.toString();
    }
    
    // Rama juridicas
    const ramaJuridicasStr = JSON.stringify(rama_juridicas);
    if (ramaJuridicasStr.length <= 500) {
      metadataChunks.rama_juridicas = ramaJuridicasStr;
    } else {
      const chunks = Math.ceil(ramaJuridicasStr.length / 450);
      for (let i = 0; i < chunks; i++) {
        metadataChunks[`rama_juridicas_${i}`] = ramaJuridicasStr.substring(i * 450, (i + 1) * 450);
      }
      metadataChunks.rama_juridicas_chunks = chunks.toString();
    }
    
    // Sub rama map
    const subRamaMapStr = JSON.stringify(sub_rama_map);
    if (subRamaMapStr.length <= 500) {
      metadataChunks.sub_rama_map = subRamaMapStr;
    } else {
      const chunks = Math.ceil(subRamaMapStr.length / 450);
      for (let i = 0; i < chunks; i++) {
        metadataChunks[`sub_rama_map_${i}`] = subRamaMapStr.substring(i * 450, (i + 1) * 450);
      }
      metadataChunks.sub_rama_map_chunks = chunks.toString();
    }
    
    // Cobertura legal
    const coberturaLegalStr = JSON.stringify(cobertura_legal);
    if (coberturaLegalStr.length <= 500) {
      metadataChunks.cobertura_legal = coberturaLegalStr;
    } else {
      const chunks = Math.ceil(coberturaLegalStr.length / 450);
      for (let i = 0; i < chunks; i++) {
        metadataChunks[`cobertura_legal_${i}`] = coberturaLegalStr.substring(i * 450, (i + 1) * 450);
      }
      metadataChunks.cobertura_legal_chunks = chunks.toString();
    }
    
    // Rangos
    const rangosStr = JSON.stringify(rangos);
    if (rangosStr.length <= 500) {
      metadataChunks.rangos = rangosStr;
    } else {
      const chunks = Math.ceil(rangosStr.length / 450);
      for (let i = 0; i < chunks; i++) {
        metadataChunks[`rangos_${i}`] = rangosStr.substring(i * 450, (i + 1) * 450);
      }
      metadataChunks.rangos_chunks = chunks.toString();
    }
    
    // Feedback
    const feedbackStr = JSON.stringify(feedback);
    if (feedbackStr.length <= 500) {
      metadataChunks.feedback = feedbackStr;
    } else {
      const chunks = Math.ceil(feedbackStr.length / 450);
      for (let i = 0; i < chunks; i++) {
        metadataChunks[`feedback_${i}`] = feedbackStr.substring(i * 450, (i + 1) * 450);
      }
      metadataChunks.feedback_chunks = chunks.toString();
    }
    
    // Etiquetas personalizadas
    const etiquetasPersonalizadasStr = JSON.stringify(etiquetas_personalizadas);
    if (etiquetasPersonalizadasStr.length <= 500) {
      metadataChunks.etiquetas_personalizadas = etiquetasPersonalizadasStr;
    } else {
      const chunks = Math.ceil(etiquetasPersonalizadasStr.length / 450);
      for (let i = 0; i < chunks; i++) {
        metadataChunks[`etiquetas_personalizadas_${i}`] = etiquetasPersonalizadasStr.substring(i * 450, (i + 1) * 450);
      }
      metadataChunks.etiquetas_personalizadas_chunks = chunks.toString();
    }
    
    // Guardar el ID del usuario si está disponible
    if (req.user && req.user._id) {
      metadataChunks.user_id = req.user._id.toString();
    }
    
    // Configuración de datos de suscripción
    let subscriptionData = {};
    if (isTrial) {
      subscriptionData = {
        trial_period_days: 15,
      };
    }
// Crear la sesión de checkout con todos los metadatos
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: lineItems,
  mode: 'subscription',
  subscription_data: subscriptionData,
  locale: 'es',
  automatic_tax: {
    enabled: true
  },
  tax_id_collection: {
    enabled: true // Habilitar la recolección de ID fiscal para clientes empresariales
  },
 /* billing_address_collection: 'required', // Hacer obligatoria la dirección de facturación
  shipping_address_collection: {
    allowed_countries: ['ES', 'PT', 'FR', 'IT', 'DE'], // Países de la UE más relevantes
  },
  */
  metadata: metadataChunks,
  success_url: `https://app.reversa.ai/save-user?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: 'https://app.reversa.ai/paso3.html',
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
      expand: ['subscription', 'line_items']
    });
    
    // Obtener el usuario actual desde la sesión
    const user = req.user;
    if (!user) {
      console.error('No user found in session or through other means');
      return res.redirect('/login.html?error=session_lost&redirect_to=' + encodeURIComponent('/save-user?session_id=' + session_id));
    }
    
    // Obtener todos los metadatos de la sesión
    const metadata = session.metadata || {};
    
    // Reconstruir los objetos grandes que fueron divididos en chunks
    const reconstructedData = {};
    
    // Función para reconstruir un objeto dividido en chunks
    const reconstructObject = (prefix, chunksKey) => {
      if (metadata[prefix]) {
        // Si el objeto completo está en un solo campo
        return JSON.parse(metadata[prefix]);
      } else if (metadata[`${prefix}_chunks`]) {
        // Si el objeto está dividido en múltiples chunks
        const chunks = parseInt(metadata[`${prefix}_chunks`]);
        let fullString = '';
        for (let i = 0; i < chunks; i++) {
          fullString += metadata[`${prefix}_${i}`] || '';
        }
        return JSON.parse(fullString);
      }
      return null;
    };
    
    // Reconstruir cada objeto grande
    reconstructedData.industry_tags = reconstructObject('industry_tags');
    reconstructedData.sub_industria_map = reconstructObject('sub_industria_map');
    reconstructedData.rama_juridicas = reconstructObject('rama_juridicas');
    reconstructedData.sub_rama_map = reconstructObject('sub_rama_map');
    reconstructedData.cobertura_legal = reconstructObject('cobertura_legal');
    reconstructedData.rangos = reconstructObject('rangos');
    reconstructedData.feedback_login = reconstructObject('feedback');
    reconstructedData.etiquetas_personalizadas = reconstructObject('etiquetas_personalizadas');
    
    // Datos simples
    reconstructedData.subscription_plan = metadata.plan;
    reconstructedData.profile_type = metadata.profile_type;
    reconstructedData.company_name = metadata.company_name;
    reconstructedData.name = metadata.name;
    reconstructedData.web = metadata.web;
    reconstructedData.linkedin = metadata.linkedin;
    reconstructedData.perfil_profesional = metadata.perfil_profesional;
    
    // Información de facturación y extras
    reconstructedData.billing_interval = metadata.billing_interval || 'monthly';
    reconstructedData.extra_agentes = parseInt(metadata.extra_agentes || '0');
    reconstructedData.extra_fuentes = parseInt(metadata.extra_fuentes || '0');
    reconstructedData.impact_analysis_limit = parseInt(metadata.impact_analysis_limit || '0');
    
    // Crear current date en formato yyyy-mm-dd
    const currentDate = new Date();
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dd = String(currentDate.getDate()).padStart(2, '0');
    const formattedDate = `${yyyy}-${mm}-${dd}`;
    
    // Añadir información de Stripe y fechas
    reconstructedData.registration_date = formattedDate;
    reconstructedData.registration_date_obj = currentDate;
    reconstructedData.stripe_customer_id = session.customer;
    reconstructedData.stripe_subscription_id = session.subscription?.id;
    reconstructedData.payment_status = session.payment_status;
    
    // Información sobre los items comprados
    if (session.line_items && session.line_items.data) {
      reconstructedData.purchased_items = session.line_items.data.map(item => ({
        description: item.description,
        amount: item.amount_total,
        currency: item.currency
      }));
    }
    
    // Conectar a la base de datos
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const db = client.db("papyrus");
    const usersCollection = db.collection("users");
    
    // Actualizar el usuario en la base de datos
    await usersCollection.updateOne(
      { _id: new ObjectId(user._id) },
      { $set: reconstructedData },
      { upsert: true }
    );
    
    // Enviar correo de confirmación
    await sendSubscriptionEmail(user, reconstructedData);
    
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
    promotion_code,
    extra_agentes,
    extra_fuentes
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

    // Calculate impact analysis limit based on plan
    let impactAnalysisLimit = 0;
    if (plan === 'plan2') {
      impactAnalysisLimit = 50;
    } else if (plan === 'plan3') {
      impactAnalysisLimit = 500;
    } else if (plan === 'plan4') {
      impactAnalysisLimit = -1; // -1 means unlimited
    }

    // Crear un objeto con los datos del usuario para actualizar
    const userData = {
      industry_tags,
      sub_industria_map,
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
      feedback_login: feedback,
      registration_date: formattedDate,
      registration_date_obj: currentDate,
      etiquetas_personalizadas: etiquetas_personalizadas,
      promotion_code: promotion_code || 'no',
      impact_analysis_limit: impactAnalysisLimit,
      extra_agentes: parseInt(extra_agentes || '0'),
      extra_fuentes: parseInt(extra_fuentes || '0'),
      payment_status: promotion_code === 'yes' ? 'promotion_approved' : 'free_plan'
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
    return res.redirect(`https://app.reversa.ai/feedback.html?fid=${feedbackId}`);

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

// Actualización de la API existente para incluir los nuevos campos
app.get('/api/get-user-data', ensureAuthenticated, async (req, res) => {
  try {
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return all relevant user information including new fields
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
      sub_industria_map: user.sub_industria_map || {},
      rama_juridicas: user.rama_juridicas || [],
      sub_rama_map: user.sub_rama_map || {},
      rangos: user.rangos || [],
      // Actualización de la estructura de cobertura_legal para separar fuentes y reguladores
      cobertura_legal: user.cobertura_legal || {
        fuentes: [],
        reguladores: []
      },
      // Nuevos campos necesarios para el menú de gestión de suscripción
      etiquetas_personalizadas: user.etiquetas_personalizadas || {},
      impact_analysis_limit: user.impact_analysis_limit || 0,
      extra_agentes: user.extra_agentes || 0,
      extra_fuentes: user.extra_fuentes || 0,
      payment_status: user.payment_status || '',
      stripe_customer_id: user.stripe_customer_id || '',
      stripe_subscription_id: user.stripe_subscription_id || '',
      billing_interval: user.billing_interval || 'monthly',
      registration_date: user.registration_date || '',
      purchased_items: user.purchased_items || []
    });
    
    await client.close();
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Nueva API para actualizar los datos del usuario
app.post('/api/update-user-data', ensureAuthenticated, async (req, res) => {
  try {
    // Validar que hay datos para actualizar
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'No data provided for update' });
    }

    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    // Campos permitidos para actualización
    const allowedFields = [
      'etiquetas_personalizadas',
      'cobertura_legal',
      'rangos',
      'accepted_email'  // Add accepted_email as an allowed field
    ];

    // Filtrar solo los campos permitidos
    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    // Verificar que hay campos válidos para actualizar
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    // Actualizar el documento del usuario
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.user._id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Obtener el usuario actualizado
    const updatedUser = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    
    await client.close();

    // Devolver los campos actualizados
    const response = {};
    for (const field of Object.keys(updateData)) {
      response[field] = updatedUser[field];
    }

    res.json({
      success: true,
      message: 'User data updated successfully',
      updated_fields: response
    });
  } catch (error) {
    console.error('Error updating user data:', error);
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

// ==================== RUTAS PARA MANEJO DE LISTAS DE USUARIO ====================

// Ruta para obtener las listas del usuario
app.get('/api/get-user-lists', ensureAuthenticated, async (req, res) => {
  try {
    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Obtener las listas del usuario desde el campo 'guardados'
    const guardados = user.guardados || {};
    const lists = Object.keys(guardados).map(listName => ({
      id: listName.replace(/\s+/g, '_').toLowerCase(), // Usar el nombre como ID simplificado
      name: listName
    }));

    await client.close();
    res.json({ 
      lists: lists,
      guardados: guardados // Incluir los datos completos de guardados
    });
  } catch (error) {
    console.error('Error getting user lists:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para crear una nueva lista
app.post('/api/create-user-list', ensureAuthenticated, async (req, res) => {
  try {
    const { listName } = req.body;
    
    if (!listName || !listName.trim()) {
      return res.status(400).json({ error: 'El nombre de la lista es requerido' });
    }

    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verificar si ya existe una lista con ese nombre
    const guardados = user.guardados || {};
    if (guardados[listName]) {
      return res.status(400).json({ error: 'Ya existe una lista con ese nombre' });
    }

    // Crear la nueva lista vacía
    const updateField = `guardados.${listName}`;
    await usersCollection.updateOne(
      { _id: new ObjectId(req.user._id) },
      { $set: { [updateField]: {} } } // Cambiar de [] a {} para inicializar como objeto
    );

    await client.close();
    
    const listId = listName.replace(/\s+/g, '_').toLowerCase();
    res.json({ 
      success: true, 
      message: 'Lista creada exitosamente',
      listId: listId,
      listName: listName
    });
  } catch (error) {
    console.error('Error creating user list:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para guardar un documento en listas seleccionadas
app.post('/api/save-document-to-lists', ensureAuthenticated, async (req, res) => {
  try {
    const { documentId, collectionName, listIds, documentData } = req.body;
    
    if (!documentId || !collectionName || !listIds || !Array.isArray(listIds)) {
      return res.status(400).json({ error: 'Parámetros requeridos: documentId, collectionName, listIds' });
    }

    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const guardados = user.guardados || {};
    
    // Obtener las etiquetas personalizadas del usuario
    const userEtiquetasPersonalizadas = user.etiquetas_personalizadas || {};
    
    // Encontrar etiquetas que coincidan con el documento
    let matchingEtiquetas = [];
    if (documentData && documentData.etiquetas_personalizadas && Array.isArray(documentData.etiquetas_personalizadas)) {
      matchingEtiquetas = documentData.etiquetas_personalizadas.filter(etiqueta => 
        Object.keys(userEtiquetasPersonalizadas).some(userEtiqueta => 
          userEtiqueta.toLowerCase() === etiqueta.toLowerCase()
        )
      );
    }
    
    // Crear el objeto del documento a guardar con información completa
    const documentToSave = {
      documentId: documentId,
      collectionName: collectionName,
      savedAt: new Date(),
      // Información adicional del documento
      url_pdf: documentData?.url_pdf || null,
      short_name: documentData?.short_name || null,
      resumen: documentData?.resumen || null,
      rango_titulo: documentData?.rango_titulo || null,
      dia: documentData?.dia || null,
      mes: documentData?.mes || null,
      anio: documentData?.anio || null,
      etiquetas_personalizadas: matchingEtiquetas
    };

    // Procesar cada lista seleccionada
    for (const listId of listIds) {
      // Convertir listId de vuelta al nombre de la lista
      const listName = Object.keys(guardados).find(name => 
        name.replace(/\s+/g, '_').toLowerCase() === listId
      );
      
      if (listName) {
        const existingList = guardados[listName];
        
        // Si la lista es un array, convertirla a objeto primero
        if (Array.isArray(existingList)) {
          console.log(`Converting list "${listName}" from array to object`);
          
          // Crear un objeto con los documentos existentes usando sus IDs como claves
          const convertedList = {};
          existingList.forEach((doc, index) => {
            const docId = doc.documentId || doc._id || `doc_${index}`;
            convertedList[docId] = doc;
          });
          
          // Actualizar la lista completa a formato objeto
          await usersCollection.updateOne(
            { _id: new ObjectId(req.user._id) },
            { $set: { [`guardados.${listName}`]: convertedList } }
          );
        }
        
        // Ahora añadir el nuevo documento usando su ID como clave
        await usersCollection.updateOne(
          { _id: new ObjectId(req.user._id) },
          { $set: { [`guardados.${listName}.${documentId}`]: documentToSave } }
        );
      }
    }

    await client.close();
    
    res.json({ 
      success: true, 
      message: 'Documento guardado exitosamente en las listas seleccionadas',
      savedToLists: listIds.length,
      documentData: documentToSave
    });
  } catch (error) {
    console.error('Error saving document to lists:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para eliminar una lista de usuario
app.delete('/api/delete-user-list', ensureAuthenticated, async (req, res) => {
  try {
    const { listName } = req.body;
    
    if (!listName || !listName.trim()) {
      return res.status(400).json({ error: 'El nombre de la lista es requerido' });
    }

    const client = new MongoClient(uri, mongodbOptions);
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verificar si la lista existe
    const guardados = user.guardados || {};
    if (!guardados[listName]) {
      return res.status(404).json({ error: 'La lista no existe' });
    }

    // Eliminar la lista
    await usersCollection.updateOne(
      { _id: new ObjectId(req.user._id) },
      { $unset: { [`guardados.${listName}`]: "" } }
    );

    await client.close();
    
    res.json({ 
      success: true, 
      message: 'Lista eliminada exitosamente',
      deletedList: listName
    });
  } catch (error) {
    console.error('Error deleting user list:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// API para guardar configuraciones de generación
app.post('/api/save-generation-settings', ensureAuthenticated, async (req, res) => {
  try {
    const { listName, instrucciones_generales, color_palette, language, documentType, logo } = req.body;
    const userEmail = req.user.email;
    
    if (!listName) {
      return res.status(400).json({ error: 'El nombre de la lista es requerido' });
    }
    
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    const db = client.db('papyrus');
    const usersCollection = db.collection('users');
    
    // Buscar el usuario
    const user = await usersCollection.findOne({ email: userEmail });
    if (!user) {
      await client.close();
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    // Preparar los datos de configuración
    const settingsData = {
      instrucciones_generales: instrucciones_generales || '',
      color_palette: color_palette || {
        primary: '#04db8d',
        secondary: '#0b2431',
        text: '#455862'
      },
      language: language || 'juridico',
      documentType: documentType || 'whatsapp',
      updatedAt: new Date()
    };
    
    // Añadir logo si existe
    if (logo) {
      settingsData.logo = logo;
    }
    
    // Actualizar o crear la estructura guardados_ajustes
    const updateQuery = {
      $set: {
        [`guardados_ajustes.${listName}`]: settingsData
      }
    };
    
    const result = await usersCollection.updateOne(
      { email: userEmail },
      updateQuery
    );
    
    await client.close();
    
    if (result.modifiedCount > 0) {
      res.json({ 
        success: true, 
        message: 'Configuraciones guardadas exitosamente',
        settings: settingsData
      });
    } else {
      res.status(500).json({ error: 'No se pudieron guardar las configuraciones' });
    }
    
  } catch (error) {
    console.error('Error saving generation settings:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// API para obtener configuraciones de generación
app.post('/api/get-generation-settings', ensureAuthenticated, async (req, res) => {
  try {
    const { listName } = req.body;
    const userEmail = req.user.email;
    
    if (!listName) {
      return res.status(400).json({ error: 'El nombre de la lista es requerido' });
    }
    
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    const db = client.db('papyrus');
    const usersCollection = db.collection('users');
    
    // Buscar el usuario y sus configuraciones
    const user = await usersCollection.findOne(
      { email: userEmail },
      { projection: { guardados_ajustes: 1 } }
    );
    
    await client.close();
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    // Obtener las configuraciones para la lista específica
    const settings = user.guardados_ajustes && user.guardados_ajustes[listName] 
      ? user.guardados_ajustes[listName] 
      : null;
    
    res.json({ 
      success: true,
      settings: settings
    });
    
  } catch (error) {
    console.error('Error getting generation settings:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para generar contenido de marketing con IA
app.post('/api/generate-marketing-content', ensureAuthenticated, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const { 
      selectedDocuments, 
      instructions, 
      language, 
      documentType,
      colorPalette 
    } = req.body;

    // Validar datos de entrada
    if (!selectedDocuments || !Array.isArray(selectedDocuments) || selectedDocuments.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se proporcionaron documentos válidos' 
      });
    }

    if (!instructions || typeof instructions !== 'string' || instructions.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Las instrucciones son requeridas' 
      });
    }

    console.log(`Generating marketing content for user: ${userEmail}`);
    console.log(`Documents count: ${selectedDocuments.length}`);
    console.log(`Instructions: ${instructions.substring(0, 100)}...`);

    // Preparar los datos para el script de Python
    const pythonInput = {
      documents: selectedDocuments,
      instructions: instructions.trim(),
      language: language || 'juridico',
      documentType: documentType || 'whatsapp'
    };

    // Llamar al script de Python
    const { spawn } = require('child_process');
    const pythonProcess = spawn('python', ['marketing.py', JSON.stringify(pythonInput)], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let pythonOutput = '';
    let pythonError = '';

    pythonProcess.stdout.setEncoding('utf8');
    pythonProcess.stderr.setEncoding('utf8');

    pythonProcess.stdout.on('data', (data) => {
      pythonOutput += data.toString('utf8');
    });

    pythonProcess.stderr.on('data', (data) => {
      pythonError += data.toString('utf8');
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script exited with code ${code}`);
        console.error(`Python error: ${pythonError}`);
        return res.status(500).json({ 
          success: false, 
          error: 'Error interno al generar el contenido' 
        });
      }

      try {
        // Parsear la respuesta del script de Python
        const result = JSON.parse(pythonOutput.trim());
        
        if (result.success) {
          console.log('Marketing content generated successfully');
          res.json({
            success: true,
            content: result.content
          });
        } else {
          console.error('Python script returned error:', result.error);
          res.status(400).json({
            success: false,
            error: result.error || 'Error al generar el contenido'
          });
        }
      } catch (parseError) {
        console.error('Error parsing Python output:', parseError);
        console.error('Raw Python output:', pythonOutput);
        res.status(500).json({ 
          success: false, 
          error: 'Error al procesar la respuesta del generador de contenido' 
        });
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('Error spawning Python process:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error al iniciar el generador de contenido' 
      });
    });

  } catch (error) {
    console.error('Error in generate-marketing-content endpoint:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

