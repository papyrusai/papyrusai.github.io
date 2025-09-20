/*
App bootstrap file: Punto de entrada principal del servidor Express
- Carga variables de entorno y crea la instancia de Express
- Configura middlewares base: CORS, JSON/urlencoded, trust proxy, sesión con MongoStore y Passport
- Sirve archivos estáticos desde public/, prompts/ y /dist
- Monta routers de dominio: auth, profile, static, normativa, feedback, billing, user, generacioncontenido, agentes, listas, onboarding, boletin, enterprise, permisos, fuentes, stats
- Expone endpoint /api-key para Perplexity API
- Inicia servidor con startServer(port) con manejo automático de puertos ocupados

Arquitectura:
- Lógica de negocio y endpoints específicos → routes/*.routes.js
- Servicios reutilizables → services/ (email, users, db utils)
- Middleware compartido → middleware/
- Prompts de IA → prompts/
- Este archivo NO debe contener lógica de dominio, solo configuración y montaje
*/


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
const crypto = require('crypto'); // Add crypto import for password reset tokens
const MongoStore = require('connect-mongo');
const { GoogleAuth } = require('google-auth-library');

// Ensure fetch is available (Node < 18 compatibility)
if (typeof fetch === 'undefined') {
  global.fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

//to avoid deprecation error
const mongodbOptions = {
  // Removidas las opciones deprecadas useNewUrlParser y useUnifiedTopology
}

require('./auth'); // Ensure this file is configured correctly

const app = express();
const port = process.env.PORT || 5000;
const uri = process.env.DB_URI;

// Define a base URL for development and production
const BASE_URL = process.env.BASE_URL || 'https://app.reversa.ai';


app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.set('trust proxy', 1); // IMPORTANT when behind a proxy (Render)


app.use(session({
  secret: process.env.SESSION_SECRET || 'default_session_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Only use secure in production
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    httpOnly: true
  },
  store: MongoStore.create({
    mongoUrl: uri,
    ttl: 14 * 24 * 60 * 60 // 14 days
  })
}));


app.use(passport.initialize());
app.use(passport.session());

// Analytics middleware (no bloqueante)
try {
  const { trackPageView, sessionTimeTracker } = require('./middleware/analytics.middleware');
  app.use(sessionTimeTracker);
  app.use(trackPageView);
} catch (e) {
  console.warn('Analytics middleware not loaded:', e?.message || e);
}

// Mount routers
const boletinRoutes = require('./routes/boletin.routes');
app.use(boletinRoutes);

// Routers
const staticRoutes = require('./routes/static.routes');
const profileRoutes = require('./routes/profile.routes');
const authRoutes = require('./routes/auth.routes');
const normativaRoutes = require('./routes/normativa.routes');
const feedbackRoutes = require('./routes/feedback.routes');
const billingRoutes = require('./routes/billing.routes');
const userRoutes = require('./routes/user.routes');
const generacioncontenidoRoutes = require('./routes/generacioncontenido.routes');
const agentesRoutes = require('./routes/agentes.routes');
const listasRoutes = require('./routes/listas.routes');
const onboardingRoutes = require('./routes/onboarding.routes');
const enterpriseRoutes = require('./routes/enterprise.routes');
const permisosRoutes = require('./routes/permisos.routes');
const etiquetasRoutes = require('./routes/etiquetas.routes');
const fuentesRoutes = require('./routes/fuentes.routes');

// Mount routers
app.use(authRoutes);
app.use(profileRoutes);
app.use(staticRoutes);
app.use(normativaRoutes);
app.use(feedbackRoutes);
app.use(billingRoutes);
app.use(userRoutes);
app.use(generacioncontenidoRoutes);
app.use(agentesRoutes);
app.use(listasRoutes);
app.use(onboardingRoutes);
app.use(etiquetasRoutes);    // New unified etiquetas endpoints
app.use(enterpriseRoutes);   // Must be before permisosRoutes (contains /api/user-context)
app.use(permisosRoutes);
app.use(fuentesRoutes);
const statsRoutes = require('./routes/stats.routes');
app.use(statsRoutes);

// NEW: Internal dashboard routes
const internalRoutes = require('./routes/internal.routes');
app.use(internalRoutes);

// NEW: Internal Feedback Review routes (for dashboard Feedback tab)
const internalReviewFeedbackRoutes = require('./routes/internal.review.feedback');
app.use(internalReviewFeedbackRoutes);

// Middleware to ensure user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
      return next();
  }
  req.session.returnTo = req.originalUrl;
  return res.redirect('/');
}

// Serve static files from the "public" directory with proper MIME types
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));
app.use('/prompts', express.static(path.join(__dirname, 'prompts')));
app.use('/dist', express.static(path.join(__dirname, 'public/dist')));

/**
 * Expande una lista de colecciones para incluir sus versiones de test
 * @param {string[]} collections - Array de nombres de colecciones
 * @returns {string[]} - Array expandido que incluye colecciones originales y sus versiones _test
 */
// Helpers moved to services/db.utils.js
const { expandCollectionsWithTest, collectionExists } = require('./services/db.utils');
// Helper moved to services/db.utils.js
const { getLatestDateForCollection } = require('./services/db.utils');

/*fetch api_perplixity*/
app.get('/api-key', (req, res) => {
  res.json({ apiKey: process.env.API_KEY_PERPLEXITY });
});

// Helper function to extract name from email if name is empty
function getDisplayName(userName, userEmail) {
  if (userName && userName.trim() !== '') {
    return userName;
  }
  
  if (userEmail && userEmail.includes('@')) {
    const emailPrefix = userEmail.split('@')[0];
    // Capitalize first letter and return
    return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1).toLowerCase();
  }
  
  return '';
}
function startServer(currentPort) {
  const server = app.listen(currentPort, () => {
    console.log(`Server is running on port ${currentPort}`);
    console.log(`Access the app at http://localhost:${currentPort}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${currentPort} is busy, trying ${currentPort + 1}...`);
      startServer(currentPort + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  return server;
}

// Start the server with error handling
startServer(port);

