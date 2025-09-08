# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🔍 RESUMEN EJECUTIVO

**Papyrus AI** (now "Reversa App") is a specialized web platform for regulatory and normative documentation analysis and management. After a complete refactoring process, the application evolved from a monolithic architecture (app.js ~7000 lines) to a **highly organized and maintainable modular architecture**.

### 🎯 **Main Features:**
- **Regulatory analysis** with AI (Google Gemini)
- **Personalized marketing content generation**
- **List system and document management**
- **Multi-modal authentication** (local + Google OAuth)
- **Integrated billing** with Stripe
- **Personalized dashboard** for different user types

### 📊 **Refactoring Metrics:**
- **Complexity reduction:** 7000 → 175 lines in app.js (98% reduction)
- **Modularization:** 12 routers + 5 services + 1 middleware
- **Maintainability:** Clear separation of responsibilities
- **Scalability:** Architecture prepared for new functionalities

## Development Commands

- **Start development server**: `npm run dev` (Parcel dev server)
- **Start production server**: `npm start` (runs app.js with Node.js)
- **Build for production**: `npm run build` (Parcel build)
- **Newsletter script**: `npm run newsletter` (runs email newsletter script)
- **No tests configured**: The test script currently exits with error

## 🏗️ **BEST PRACTICES IMPLEMENTED**

The system follows these development best practices that serve as **guidance for AI** and future developments:

### **1. Modular Backend Architecture**
- ✅ **Functional domain separation**: Each router handles a specific area (auth, billing, normativa, etc.)
- ✅ **Single responsibility principle**: One module = one main function
- ✅ **Service reuse**: Shared logic in `services/` (email, users, db)
- ✅ **Centralized middleware**: Authentication and validations in `middleware/`

### **2. Lightweight Bootstrap (app.js)**
- ✅ **Configuration only**: Express setup, middlewares, router mounting
- ✅ **No business logic**: All specific logic in their respective modules
- ✅ **Dependency management**: Centralized and organized imports
- ✅ **Resilient server**: Automatic handling of busy ports

### **3. Modular External Configuration**
- ✅ **Prompts in separate files**: AI configuration in `prompts/*.md` with YAML format
- ✅ **Environment variables**: Sensitive configuration in `.env`
- ✅ **Organized constants**: Centralized reusable values
- ✅ **Configuration JSON**: Complex structures in dedicated files

### **4. Organized Frontend**
- ✅ **HTML/JS separation**: Structure in independent files per view
- ✅ **Modular CSS**: Specific styles per component/functionality
- ✅ **SPA with dynamic loading**: One main shell that loads specific content
- ✅ **Organized assets**: Static resources in specialized folders

### **5. Use Case Division**
- ✅ **Functional grouping**: Files organized by product domain
- ✅ **Coherent RESTful API**: Endpoints organized by entity/action
- ✅ **Modular AI integration**: Python scripts separated by purpose
- ✅ **Testing ready**: Each module independently testable

### **6. Technology Integration**
- ✅ **Node.js + Python**: Spawn integration for AI processing
- ✅ **MongoDB connection patterns**: Consistent connection patterns
- ✅ **External API integration**: Services like Stripe, SendGrid, Google APIs
- ✅ **Centralized error handling**: Consistent error handling patterns

### **7. Consistent UX/UI**
- ✅ **Standardized confirmations**: ALWAYS use standard modal for user confirmations (delete, cancel, etc.) - NEVER browser alerts
- ✅ **Coherent visual feedback**: Unified loaders, spinners and loading states
- ✅ **Applied design system**: Colors, typography and components according to Reversa standard
- ✅ **Responsive design**: Adaptability to different devices and screen sizes

## 🏗️ APP.JS OVERVIEW - ENTRY POINT

### 📄 **Current app.js function (175 lines)**

`app.js` acts as **main orchestrator** and contains only:

#### 🔧 **1. Base Configuration:**
```javascript
// Environment variables and dependencies
require('dotenv').config();
const express = require('express');

// Express configuration
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.set('trust proxy', 1);
```

#### 🔐 **2. Session and Authentication Configuration:**
```javascript
// Session with MongoDB Store
app.use(session({
  store: MongoStore.create({ mongoUrl: uri, ttl: 14 * 24 * 60 * 60 })
}));

// Passport for authentication
app.use(passport.initialize());
app.use(passport.session());
```

#### 📁 **3. Static File Service:**
```javascript
app.use(express.static(path.join(__dirname, 'public')));
app.use('/prompts', express.static(path.join(__dirname, 'prompts')));
app.use('/dist', express.static(path.join(__dirname, 'public/dist')));
```

#### 🔗 **4. Modular Router Mounting:**
```javascript
// 12 specialized routers
app.use(authRoutes);           // Authentication
app.use(profileRoutes);        // User profile
app.use(staticRoutes);         // Static pages
app.use(normativaRoutes);      // Regulatory analysis
app.use(feedbackRoutes);       // Feedback system
app.use(billingRoutes);        // Stripe billing
app.use(userRoutes);           // User CRUD
app.use(generacioncontenidoRoutes); // Marketing content
app.use(agentesRoutes);        // AI agents
app.use(listasRoutes);         // List management
app.use(onboardingRoutes);     // User onboarding
app.use(boletinRoutes);        // Daily newsletter
```

#### 🚀 **5. Server Start:**
```javascript
function startServer(currentPort) {
  // Automatic handling of busy ports
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      startServer(currentPort + 1);
    }
  });
}
```

## 🎨 FRONTEND → BACKEND FLOW

### 🌐 **1. FRONTEND ENTRY POINT**

#### **`public/profile.html` - Main Shell**
```html
<!-- Main dashboard with SPA navigation -->
<div class="profile-container">
  <!-- Dynamic sidebar menu -->
  <div class="sidebar">
    <div class="nav-item" data-section="boletin">📰 Daily Newsletter</div>
    <div class="nav-item" data-section="busqueda">🔍 Search</div>
    <div class="nav-item" data-section="listas">📝 Your lists</div>
    <div class="nav-item" data-section="configuracion">⚙️ Configuration</div>
    <div class="nav-item" data-section="agentes">🤖 Agents</div>
  </div>
  
  <!-- Dynamic content that changes according to section -->
  <div id="main-content">
    <div id="content-boletin" class="vision-section"><!-- Dynamic --></div>
    <div id="content-listas" class="vision-section"><!-- Dynamic --></div>
    <!-- ... more sections ... -->
  </div>
</div>
```

### 🔄 **2. SPA NAVIGATION FLOW**

#### **Frontend JavaScript (dynamic loading):**
```javascript
// public/profile.html - Navigation system
function showSection(sectionName) {
  switch(sectionName) {
    case 'boletin':
      loadBoletinContent();          // → routes/boletin.routes.js
      break;
    case 'listas':
      loadListasContent();           // → routes/listas.routes.js
      break;
    case 'configuracion':
      loadConfiguracionContent();    // → routes/generacioncontenido.routes.js
      break;
    case 'busqueda':
      loadBusquedaContent();         // → routes/normativa.routes.js
      break;
  }
}
```

## 🏛️ BACKEND ARCHITECTURE

### 📂 **Directory Structure**

```
papyrusai.github.io/
├── 📄 app.js                     # Bootstrap (175 lines)
├── 📄 auth.js                    # Passport configuration
├── 📂 routes/                    # 12 modular routers
│   ├── 📄 auth.routes.js         # Authentication (286 lines)
│   ├── 📄 profile.routes.js      # User profile, agent impact, save lists (573 lines)
│   ├── 📄 static.routes.js       # HTML pages (71 lines)
│   ├── 📄 normativa.routes.js    # Document analysis (260 lines)
│   ├── 📄 feedback.routes.js     # Feedback system (227 lines)
│   ├── 📄 billing.routes.js      # Stripe/billing (468 lines)
│   ├── 📄 user.routes.js         # User CRUD (253 lines)
│   ├── 📄 generacioncontenido.routes.js # Marketing (268 lines)
│   ├── 📄 agentes.routes.js      # AI agents (284 lines)
│   ├── 📄 listas.routes.js       # List management (294 lines)
│   ├── 📄 onboarding.routes.js   # Onboarding (312 lines)
│   └── 📄 boletin.routes.js      # Daily newsletter (183 lines)
├── 📂 services/                  # Business logic
│   ├── 📄 email.service.js       # SendGrid emails (518 lines)
│   ├── 📄 users.service.js       # User management (198 lines)
│   └── 📄 db.utils.js            # MongoDB utilities (61 lines)
├── 📂 middleware/                # Shared middleware
│   └── 📄 ensureAuthenticated.js # Required authentication
├── 📂 python/                    # AI scripts
│   ├── 📄 questionsMongo.py      # Document analysis with Gemini
│   └── 📄 marketing.py           # Marketing content generation
├── 📂 prompts/                   # AI configuration
│   ├── 📄 contexto_regulatorio.md # Regulatory profile prompt
│   ├── 📄 analisis_normativo.md   # Analysis prompts
│   └── 📄 generacion_contenido.md # Marketing prompts
└── 📂 public/                    # Static frontend
    ├── 📄 profile.html           # Main dashboard
    ├── 📂 views/                 # Specialized views
    ├── 📂 styles/                # Modular CSS
    └── 📂 assets/                # Static resources
```

### 🔌 **ROUTERS AND ENDPOINTS**

#### **A. Authentication Router (auth.routes.js)**
```javascript
// Authentication endpoints
POST /login                    # Local login
POST /register                 # User registration
GET  /auth/google             # Google OAuth
GET  /auth/google/callback    # OAuth callback
GET  /logout                  # Log out
POST /forgot-password         # Request password reset
POST /reset-password          # Confirm password reset

// Services used:
- services/email.service.js → sendPasswordResetEmail()
- services/users.service.js → processSpecialDomainUser(), processAODomainUser()
```

#### **B. Profile Router (profile.routes.js)**
```javascript
// Profile endpoints
GET  /profile                 # Dynamic HTML dashboard with full functionality
GET  /data                    # User data + statistics + impact + save buttons
POST /delete-document         # Mark document as deleted

// Functionalities:
- Dynamic rendering of profile.html with user data
- Document filtering by dates and collections
- Usage statistics and limits by subscription plan
- Agent impact section with nivel_impacto, explanations and thumbs feedback by tag
- User custom tag UI per document (badges)
- "Analyze document" button with plan gating
- "Save" buttons with dropdown to add documents to user lists
- Full integration with list system and new list creation functionality
```

#### **C. Listas Router (listas.routes.js)**
```javascript
// List management endpoints
GET    /api/get-user-lists            # List user lists (returns { lists, guardados })
POST   /api/create-user-list          # Create new list (initializes as object)
POST   /api/save-document-to-lists    # Save document to one or several lists
POST   /api/remove-document-from-list # Remove document from a list
DELETE /api/delete-user-list          # Delete complete list

// Data model (users.guardados field):
// {
//   "List Name": {
//     "<documentId>": {
//        documentId, collectionName, savedAt,
//        url_pdf, short_name, resumen, rango_titulo, dia, mes, anio,
//        etiquetas_personalizadas: [matching with profile]
//     },
//     ...
//   },
//   ...
// }

// Automatic migration:
// - If a list is in array format, it converts to object using documentId as key

// Tag matching:
// - When saving, crosses document tags with user's etiquetas_personalizadas
```

### 🛠️ **SUPPORT SERVICES**

#### **A. Email Service (services/email.service.js)**
```javascript
// Centralized email functions
sendPasswordResetEmail(email, resetToken)
- Professional HTML template for password reset
- Secure tokens with expiration
- SendGrid integration

sendSubscriptionEmail(user, userData)
- Subscription confirmation with details
- Dynamic templates according to plan
- Compliance attachments
```

#### **B. Users Service (services/users.service.js)**
```javascript
// Specialized user management
getUserLimits(subscriptionPlan)
- Limits per plan: agents, sources, features
- Plan logic: plan1 (free) → plan4 (enterprise)

processSpecialDomainUser(user)
- Special logic for @cuatrecasas.com
- Automatic assignment of enterprise plans

processAODomainUser(user)
- Processing for A&O domains
- Personalized access configuration
```

## 🐍 PYTHON INTEGRATION

### 📊 **1. Analysis Script: questionsMongo.py**

#### **Purpose:**
Intelligent analysis of regulatory documents using Google Gemini AI.

#### **Main functionalities:**
```python
def main(document_id, user_prompt, collection_name, html_content=None):
    # 1. MongoDB connection
    db = connect_to_mongodb()
    
    # 2. Content extraction
    if html_content:
        text = clean_text_for_processing(html_content)  # Direct HTML
    else:
        content_info = get_pdf_url_from_mongodb(db, collection_name, document_id)
        if content_info["type"] == "url_pdf":
            text = download_and_extract_text_from_pdf(url)  # PDF
        elif content_info["type"] == "content":
            text = clean_text_for_processing(content)  # Direct text
    
    # 3. Analysis with Gemini
    response = ask_gemini(text, user_prompt)
    
    # 4. JSON UTF-8 response
    print(json.dumps(response, ensure_ascii=False))
```

### 📝 **2. Marketing Script: marketing.py**

#### **Purpose:**
Generation of personalized marketing content based on legal documents.

#### **Content types supported:**
- **WhatsApp**: Short and direct messages
- **LinkedIn**: Professional posts
- **Email**: Legal newsletters
- **Presentation**: Executive slides
- **Legal**: Technical analysis

## 📚 PROMPT SYSTEM

### 📄 **1. Prompt Configuration (prompts/)**

#### **A. Regulatory Context (contexto_regulatorio.md)**
```yaml
---
contexto: |
  You are an expert assistant in regulation and compliance. 
  You must return only a valid JSON object with the "html_response" key.
  The value must be an HTML string with exactly three <p> paragraphs, 
  without any additional text or tags.
  
  Regulatory context analysis:
  1. First paragraph: Summary of main regulations
  2. Second paragraph: Specific impact on sector/company
  3. Third paragraph: Compliance recommendations and next steps
---
```

### 🔄 **2. Dynamic Prompt Loading**

```javascript
// routes/onboarding.routes.js - Loading example
const promptsPath = path.join(__dirname, '..', 'prompts', 'contexto_regulatorio.md');
const promptsContent = fs.readFileSync(promptsPath, 'utf8');
const systemInstructions = promptsContent.match(/contexto: \|([.\s\S]*?)---/)[1].trim();

// Use in Gemini call
const response = await genAI.generateContent({
    contents: [{
        role: 'user',
        parts: [{ text: systemInstructions + '\n\n' + userAnswers }]
    }]
});
```

## 🔐 AUTHENTICATION SYSTEM

### 🛡️ **1. Authentication Flow**

#### **A. Local Authentication**
```
User → /login (POST) → auth.routes.js
↓ Passport local strategy
↓ bcrypt password verification
↓ Session creation
→ Redirect to /profile
```

#### **B. Google OAuth**
```
User → /auth/google → auth.routes.js
↓ Redirect to Google OAuth
Google → /auth/google/callback → auth.routes.js
↓ Passport Google strategy  
↓ Special user processing (if applicable)
→ Redirect to /profile
```

#### **C. Protection Middleware**
```javascript
// middleware/ensureAuthenticated.js
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    req.session.returnTo = req.originalUrl;
    return res.redirect('/');
}
```

### 👥 **2. User Types and Special Processing**

#### **A. Standard Users**
- Normal registration/login
- Standard subscription plans
- Limits according to contracted plan

#### **B. Cuatrecasas Users (@cuatrecasas.com)**
```javascript
// services/users.service.js
async function processSpecialDomainUser(user) {
    // Automatic enterprise plan assignment
    // Special access configuration
    // Unlimited limits
}
```

## 💳 BILLING SYSTEM

### 💰 **1. Stripe Integration**

#### **A. Subscription Plans**
```javascript
// services/users.service.js - Limits per plan
const getUserLimits = (subscriptionPlan) => {
    switch (subscriptionPlan) {
        case 'plan1': return { limit_agentes: 0, limit_fuentes: 0 };      // Free
        case 'plan2': return { limit_agentes: 5, limit_fuentes: 3 };      // Basic
        case 'plan3': return { limit_agentes: 10, limit_fuentes: 10 };    // Pro
        case 'plan4': return { limit_agentes: null, limit_fuentes: null }; // Enterprise
    }
};
```

#### **B. Checkout Flow**
```
Frontend → /create-checkout-session (POST) → billing.routes.js
↓ Stripe.checkout.sessions.create()
→ Stripe payment URL
User completes payment → Stripe Webhook
↓ Automatic update in MongoDB
→ Plan activation
```

## 🎨 **UI/UX STANDARDS IMPLEMENTED**

### **A. Confirmation System**
```javascript
// ❌ INCORRECT - Don't use browser alerts
if (confirm('Are you sure you want to delete this list?')) {
    deleteList();
}

// ✅ CORRECT - Use standard modal
showConfirmationModal({
    title: 'Delete List',
    message: 'Are you sure you want to delete this list? This action cannot be undone.',
    onConfirm: () => deleteList(),
    onCancel: () => hideModal()
});
```

### **B. Standardized UI Components**
- **Modals**: Confirmations, alerts, complex forms
- **Loaders**: Loading states with Reversa spinners
- **Feedback**: Success/error banners with corporate colors
- **Buttons**: Specific types according to action (AI, danger, standard)

### **C. Interaction Patterns**
- **Destructive actions**: Always require modal confirmation
- **Long processes**: Visual feedback with loaders and states
- **Errors**: Informative banners instead of alerts
- **Success**: Subtle and persistent visual confirmation

## Environment Configuration

Critical environment variables (defined in `.env`):
- `DB_URI` - MongoDB connection string
- `GOOGLE_CLIENT_ID/SECRET` - OAuth credentials
- `STRIPE` - Stripe API key
- `SESSION_SECRET` - Session encryption key
- `API_KEY_PERPLEXITY` - Perplexity API access

## Key Dependencies

- **Web Framework**: Express.js with CORS, sessions, and Passport authentication
- **Database**: MongoDB via native driver and Mongoose
- **Payment**: Stripe integration
- **Email**: SendGrid and Nodemailer
- **AI Integration**: Google GenAI API
- **Frontend Bundling**: Parcel
- **Search**: Fuse.js for fuzzy search
- **Date Handling**: Moment.js with timezone support

## 🔮 **FUTURE PREPARATION**

The current architecture is prepared for:
- **Microservices**: Easy separation into independent services
- **Complete REST API**: Organized and documented endpoints
- **AI Integration**: Modular and scalable prompt system
- **Multi-tenant**: Base for multiple organization support
- **Mobile Apps**: API-first backend compatible with mobile apps
- **Scalable Design System**: Reusable and consistent components