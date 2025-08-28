# 📋 Arquitectura del Código - Papyrus AI Platform

## 🔍 RESUMEN EJECUTIVO

**Papyrus AI** es una plataforma web especializada en análisis y gestión de documentación normativa y regulatoria. Tras un proceso de refactoring completo, la aplicación ha evolucionado de una arquitectura monolítica (app.js ~7000 líneas) a una **arquitectura modular** altamente organizada y mantenible.

### 🎯 **Características Principales:**
- **Análisis de normativa** con IA (Google Gemini)
- **Generación de contenido de marketing** personalizado
- **Sistema de listas y gestión documental**
- **Autenticación multi-modal** (local + Google OAuth)
- **Facturación integrada** con Stripe
- **Dashboard personalizado** para distintos tipos de usuarios

### 📊 **Métricas de Refactoring:**
- **Reducción de complejidad:** 7000 → 175 líneas en app.js (98% reducción)
- **Modularización:** 12 routers + 5 servicios + 1 middleware
- **Mantenibilidad:** Separación clara de responsabilidades
- **Escalabilidad:** Arquitectura preparada para nuevas funcionalidades

### 🏗️ **BEST PRACTICES IMPLEMENTADAS**

El sistema sigue las siguientes mejores prácticas de desarrollo que sirven como **guía para la IA** y futuros desarrollos:

#### **1. Arquitectura Modular Backend**
- ✅ **Separación por dominio funcional**: Cada router maneja un área específica (auth, billing, normativa, etc.)
- ✅ **Principio de responsabilidad única**: Un módulo = una función principal
- ✅ **Reutilización de servicios**: Lógica compartida en `services/` (email, users, db)
- ✅ **Middleware centralizado**: Autenticación y validaciones en `middleware/`

#### **2. Bootstrap Liviano (app.js)**
- ✅ **Solo configuración**: Express setup, middlewares, montaje de routers
- ✅ **Sin lógica de negocio**: Toda la lógica específica en sus módulos respectivos
- ✅ **Gestión de dependencias**: Imports centralizados y organizados
- ✅ **Servidor resiliente**: Manejo automático de puertos ocupados

#### **3. Configuración Externa Modular**
- ✅ **Prompts en archivos separados**: Configuración IA en `prompts/*.md` con formato YAML
- ✅ **Variables de entorno**: Configuración sensible en `.env`
- ✅ **Constantes organizadas**: Valores reutilizables centralizados
- ✅ **JSON de configuración**: Estructuras complejas en archivos dedicados

#### **4. Frontend Organizado**
- ✅ **Separación HTML/JS**: Estructura en archivos independientes por vista
- ✅ **CSS modular**: Estilos específicos por componente/funcionalidad
- ✅ **SPA con carga dinámica**: Un shell principal que carga contenido específico
- ✅ **Assets organizados**: Recursos estáticos en carpetas especializadas

#### **5. División por Casos de Uso**
- ✅ **Agrupación funcional**: Archivos organizados por dominio de producto
- ✅ **API RESTful coherente**: Endpoints organizados por entidad/acción
- ✅ **Integración IA modular**: Scripts Python separados por propósito
- ✅ **Testing preparado**: Cada módulo testeable independientemente

#### **6. Integración Tecnológica**
- ✅ **Node.js + Python**: Integración spawn para procesamiento IA
- ✅ **MongoDB connection patterns**: Patrones consistentes de conexión
- ✅ **API externa integration**: Servicios como Stripe, SendGrid, Google APIs
- ✅ **Error handling centralizado**: Patrones consistentes de manejo de errores

#### **7. UX/UI Consistente**
- ✅ **Confirmaciones estandarizadas**: SIEMPRE usar modal estándar para confirmaciones de usuario (eliminar, cancelar, etc.) - NUNCA alerts del navegador
- ✅ **Feedback visual coherente**: Loaders, spinners y estados de carga unificados
- ✅ **Design system aplicado**: Colores, tipografía y componentes según estándar Reversa
- ✅ **Responsive design**: Adaptabilidad a diferentes dispositivos y tamaños de pantalla

---

## 📖 ESQUEMA DEL DOCUMENTO

### **Sección 1:** [Punto de Entrada](#🏗️-overview-de-appjs---punto-de-entrada)
- 1.1 Función actual de app.js
- 1.2 Configuración base, sesión y autenticación
- 1.3 Servicio de archivos estáticos
- 1.4 Montaje de routers modulares
- 1.5 Inicio del servidor

### **Sección 2:** [Frontend → Backend Flow](#🎨-frontend--backend-flow)
- 2.1 Punto de entrada frontend
- 2.2 Flujo de navegación SPA
- 2.3 Vistas especializadas y funcionalidades de producto

### **Sección 3:** [Arquitectura Backend](#🏛️-arquitectura-backend)
- 3.1 Estructura de directorios
- 3.2 Routers y endpoints por módulo
- 3.3 Servicios de soporte

### **Sección 4:** [Integración Python](#🐍-integración-python)
- 4.1 Script de análisis (questionsMongo.py)
- 4.2 Script de marketing (marketing.py)
- 4.3 Integración con Node.js

### **Sección 5:** [Sistema de Prompts](#📚-sistema-de-prompts)
- 5.1 Configuración de prompts externos
- 5.2 Carga dinámica de prompts

### **Sección 6:** [Sistema de Autenticación](#🔐-sistema-de-autenticación)
- 6.1 Flujos de autenticación
- 6.2 Tipos de usuario y procesamiento especial

### **Sección 7:** [Sistema de Facturación](#💳-sistema-de-facturación)
- 7.1 Integración Stripe
- 7.2 Planes de suscripción
- 7.3 Gestión de suscripciones

### **Sección 8:** [Conclusión](#📈-conclusión)
- 8.1 Logros del refactoring
- 8.2 Beneficios técnicos
- 8.3 Preparación para el futuro

---

## 🏗️ OVERVIEW DE APP.JS - PUNTO DE ENTRADA

### 📄 **Función actual de app.js (175 líneas)**

`app.js` actúa como **orchestrator principal** y contiene únicamente:

#### 🔧 **1. Configuración Base:**
```javascript
// Variables de entorno y dependencias
require('dotenv').config();
const express = require('express');

// Configuración Express
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.set('trust proxy', 1);
```

#### 🔐 **2. Configuración de Sesión y Autenticación:**
```javascript
// Sesión con MongoDB Store
app.use(session({
  store: MongoStore.create({ mongoUrl: uri, ttl: 14 * 24 * 60 * 60 })
}));

// Passport para autenticación
app.use(passport.initialize());
app.use(passport.session());
```

#### 📁 **3. Servicio de Archivos Estáticos:**
```javascript
app.use(express.static(path.join(__dirname, 'public')));
app.use('/prompts', express.static(path.join(__dirname, 'prompts')));
app.use('/dist', express.static(path.join(__dirname, 'public/dist')));
```

#### 🔗 **4. Montaje de Routers Modulares:**
```javascript
// 12 routers especializados
app.use(authRoutes);           // Autenticación
app.use(profileRoutes);        // Perfil usuario
app.use(staticRoutes);         // Páginas estáticas
app.use(normativaRoutes);      // Análisis normativo
app.use(feedbackRoutes);       // Sistema feedback
app.use(billingRoutes);        // Facturación Stripe
app.use(userRoutes);           // CRUD usuarios
app.use(generacioncontenidoRoutes); // Marketing content
app.use(agentesRoutes);        // Generación agentes IA
app.use(listasRoutes);         // Gestión listas
app.use(onboardingRoutes);     // Onboarding usuarios
app.use(boletinRoutes);        // Boletín diario
```

#### 🚀 **5. Inicio del Servidor:**
```javascript
function startServer(currentPort) {
  // Manejo automático de puertos ocupados
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      startServer(currentPort + 1);
    }
  });
}
```

---

## 🎨 FRONTEND → BACKEND FLOW

### 🌐 **1. PUNTO DE ENTRADA FRONTEND**

#### **`public/profile.html` - Shell Principal**
```html
<!-- Dashboard principal con navegación SPA -->
<div class="profile-container">
  <!-- Menú lateral dinámico -->
  <div class="sidebar">
    <div class="nav-item" data-section="boletin">📰 Boletín Diario</div>
    <div class="nav-item" data-section="busqueda">🔍 Búsqueda</div>
    <div class="nav-item" data-section="listas">📝 Tus listas</div>
    <div class="nav-item" data-section="configuracion">⚙️ Configuración</div>
    <div class="nav-item" data-section="agentes">🤖 Agentes</div>
  </div>
  
  <!-- Contenido dinámico que cambia según la sección -->
  <div id="main-content">
    <div id="content-boletin" class="vision-section"><!-- Dinámico --></div>
    <div id="content-listas" class="vision-section"><!-- Dinámico --></div>
    <!-- ... más secciones ... -->
  </div>
</div>
```

### 🔄 **2. FLUJO DE NAVEGACIÓN SPA**

#### **Frontend JavaScript (carga dinámica):**
```javascript
// public/profile.html - Sistema de navegación
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

### 📱 **3. VISTAS ESPECIALIZADAS Y FUNCIONALIDADES DE PRODUCTO**

#### **A. Vista Boletín Diario** 📰
**🎯 Funcionalidad de Producto:**
- **Para el usuario:** Acceso diario a normativa relevante filtrada por sus intereses
- **Valor:** Ahorro de tiempo en búsqueda manual de documentos normativos
- **Casos de uso:** Revisión matutina de novedades, seguimiento de regulaciones específicas

**🔧 Flujo Técnico:**
```
Frontend: public/profile.html (sección boletín)
↓ fetch('/api/boletin-diario')
Backend: routes/boletin.routes.js → GET /api/boletin-diario
↓ MongoDB query con filtros de usuario
Respuesta: { documents: [...], collections: [...] }

Notas UX:
- Banner de newsletter condicionado por plan y preferencia de email (accept/reject) con POST /api/update-user-data
- Para plan1, "Analizar documento" abre modal de upgrade (gating por plan)
```

#### **B. Vista Tus Listas** 📝
**🎯 Funcionalidad de Producto:**
- **Para el usuario:** Organización personalizada de documentos por proyectos/temas
- **Valor:** Gestión eficiente de documentación relevante para casos específicos
- **Casos de uso:** Preparación de informes, seguimiento de expedientes, research jurídico

**🔧 Flujo Técnico:**
```
Frontend: public/views/tuslistas/tuslistas.html
↓ fetch('/api/get-user-lists')
Backend: routes/listas.routes.js → GET /api/get-user-lists
↓ Lógica: getUserLists() con documentos asociados
Respuesta: { lists: [...], documents: [...] }
```

#### **C. Vista Configuración/Onboarding** ⚙️
**🎯 Funcionalidad de Producto:**
- **Para el usuario:** Personalización del perfil regulatorio y preferencias
- **Valor:** Contenido curado según sector, jurisdicción e intereses específicos
- **Casos de uso:** Setup inicial, actualización de intereses, cambio de contexto regulatorio

**🔧 Flujo Técnico:**
```
Frontend: public/views/configuracion/contexto.js
↓ fetch('/api/get-user-data')
Backend: routes/user.routes.js → GET /api/get-user-data
↓ Si no hay perfil → frontend carga onboarding
Frontend: fetch('/views/configuracion/estructura_onboarding.json')
↓ Usuario completa formulario de intereses regulatorios
Frontend: fetch('/api/regulatory-profile', {método: 'POST'})
Backend: routes/onboarding.routes.js → POST /api/regulatory-profile
↓ Llama a Google Gemini con prompt de prompts/contexto_regulatorio.md
Respuesta: { html_response: "perfil regulatorio generado por IA" }
```

#### **D. Vista Análisis de Normativa** 🔍
**🎯 Funcionalidad de Producto:**
- **Para el usuario:** Análisis inteligente de documentos normativos complejos
- **Valor:** Comprensión rápida de implicaciones legales y acciones requeridas
- **Casos de uso:** Due diligence, compliance check, análisis de impacto regulatorio

**🔧 Flujo Técnico:**
```
Frontend: public/views/analisis/norma.html
↓ Usuario sube documento PDF/URL o selecciona de base de datos
Frontend: fetch('/api/analyze-norma', {documentId, prompt personalizado})
Backend: routes/normativa.routes.js → POST /api/analyze-norma
↓ Ejecuta Python script con documento y contexto
Sistema: spawn('python', ['python/questionsMongo.py'])
↓ Python: extrae texto, conecta MongoDB, analiza con Gemini
Respuesta: { analysis: "análisis jurídico detallado con recomendaciones" }
```

#### **E. Vista Generación de Contenido** 📄
**🎯 Funcionalidad de Producto:**
- **Para el usuario:** Creación automática de contenido profesional basado en normativa
- **Valor:** Transformación de documentos complejos en comunicación clara
- **Casos de uso:** Newsletters jurídicas, posts LinkedIn, briefings ejecutivos, comunicación interna

**🔧 Flujo Técnico:**
```
Frontend: public/views/tuslistas/tuslistas.html (generar contenido)
↓ Usuario selecciona documentos de sus listas + parámetros (tipo, audiencia, idioma)
Frontend: fetch('/api/generate-marketing-content', {documents, instructions, type})
Backend: routes/generacioncontenido.routes.js → POST /api/generate-marketing-content
↓ Ejecuta Python script con documentos seleccionados
Sistema: spawn('python', ['python/marketing.py'])
↓ Python: procesa múltiples documentos, extrae insights, genera contenido específico
Respuesta: { success: true, content: "contenido profesional adaptado al canal" }
```

#### **F. Vista Agentes IA** 🤖
**🎯 Funcionalidad de Producto:**
- **Para el usuario:** Creación de agentes especializados para análisis automático
- **Valor:** Automatización de análisis repetitivos con criterios personalizados
- **Casos de uso:** Monitoreo continuo de regulaciones, alertas automáticas, análisis sectorial

**🔧 Flujo Técnico:**
```
Frontend: Configuración de agente especializado (sector, criterios, frecuencia)
↓ fetch('/api/generate-agent', {sector, criteria, schedule})
Backend: routes/agentes.routes.js → POST /api/generate-agent
↓ Crea agente con prompts especializados y configuración de ejecución
Respuesta: { agent_id, configuration, status: "active" }
```

---

## 🏛️ ARQUITECTURA BACKEND

### 📂 **1. ESTRUCTURA DE DIRECTORIOS**

```
papyrusai.github.io/
├── 📄 app.js                     # Bootstrap (175 líneas)
├── 📄 auth.js                    # Configuración Passport
├── 📂 routes/                    # 12 routers modulares
│   ├── 📄 auth.routes.js         # Autenticación (286 líneas)
│   ├── 📄 profile.routes.js      # Perfil usuario, impacto agentes, guardar listas (573 líneas)
│   ├── 📄 static.routes.js       # Páginas HTML (71 líneas)
│   ├── 📄 normativa.routes.js    # Análisis docs (260 líneas)
│   ├── 📄 feedback.routes.js     # Sistema feedback (227 líneas)
│   ├── 📄 billing.routes.js      # Stripe/facturación (468 líneas)
│   ├── 📄 user.routes.js         # CRUD usuarios (253 líneas)
│   ├── 📄 generacioncontenido.routes.js # Marketing (268 líneas)
│   ├── 📄 agentes.routes.js      # Agentes IA (284 líneas)
│   ├── 📄 listas.routes.js       # Gestión listas (294 líneas)
│   ├── 📄 onboarding.routes.js   # Onboarding (312 líneas)
│   └── 📄 boletin.routes.js      # Boletín diario (183 líneas)
├── 📂 services/                  # Lógica de negocio
│   ├── 📄 email.service.js       # SendGrid emails (518 líneas)
│   ├── 📄 users.service.js       # Gestión usuarios (198 líneas)
│   └── 📄 db.utils.js            # Utilidades MongoDB (61 líneas)
├── 📂 middleware/                # Middleware compartido
│   └── 📄 ensureAuthenticated.js # Autenticación requerida
├── 📂 python/                    # Scripts IA
│   ├── 📄 questionsMongo.py      # Análisis documentos con Gemini
│   └── 📄 marketing.py           # Generación contenido marketing
├── 📂 prompts/                   # Configuración IA
│   ├── 📄 contexto_regulatorio.md # Prompt perfil regulatorio
│   ├── 📄 analisis_normativo.md   # Prompts análisis
│   └── 📄 generacion_contenido.md # Prompts marketing
└── 📂 public/                    # Frontend estático
    ├── 📄 profile.html           # Dashboard principal
    ├── 📂 views/                 # Vistas especializadas
    ├── 📂 styles/                # CSS modular
    └── 📂 assets/                # Recursos estáticos
```

### 🔌 **2. ROUTERS Y ENDPOINTS**

#### **A. Authentication Router (auth.routes.js)**
```javascript
// Endpoints de autenticación
POST /login                    # Login local
POST /register                 # Registro usuario
GET  /auth/google             # OAuth Google
GET  /auth/google/callback    # Callback OAuth
GET  /logout                  # Cerrar sesión
POST /forgot-password         # Solicitar reset password
POST /reset-password          # Confirmar reset password

// Servicios utilizados:
- services/email.service.js → sendPasswordResetEmail()
- services/users.service.js → processSpecialDomainUser(), processAODomainUser()
```

#### **B. Profile Router (profile.routes.js)**
```javascript
// Endpoints de perfil
GET  /profile                 # Dashboard HTML dinámico con funcionalidad completa
GET  /data                    # Datos usuario + estadísticas + impacto + botones guardar
POST /delete-document         # Marcar documento eliminado

// Funcionalidades:
- Renderizado dinámico de profile.html con datos usuario
- Filtrado de documentos por fechas y colecciones
- Estadísticas de uso y límites por plan de suscripción
- Sección de impacto en agentes con nivel_impacto, explicaciones y feedback thumbs por etiqueta
- UI de etiquetas personalizadas del usuario por documento (badges)
- Botón "Analizar documento" con gating por plan
- Botones "Guardar" con dropdown para añadir documentos a listas de usuario
- Integración completa con sistema de listas y funcionalidad de creación de nuevas listas
```

#### **C. Normativa Router (normativa.routes.js)**
```javascript
// Endpoints análisis normativo
GET  /search-ramas-juridicas  # Búsqueda categorías jurídicas
GET  /api/norma-details       # Detalles documento específico
POST /api/webscrape           # Scraping contenido HTML
POST /api/analyze-norma       # Análisis IA de documentos

// Integración Python:
- Ejecuta python/questionsMongo.py para análisis con Gemini
- Manejo de stdin/stdout para documentos largos
- Extracción de texto de PDFs y HTML
```

#### **D. Billing Router (billing.routes.js)**
```javascript
// Endpoints facturación Stripe
GET  /api-key                     # API keys usuario
POST /create-checkout-session    # Crear sesión pago Stripe
POST /update-subscription        # Actualizar suscripción
POST /save-free-plan             # Plan gratuito
POST /save-same-plan2            # Renovar plan actual
POST /cancel-plan2               # Cancelar suscripción

// Servicios utilizados:
- services/email.service.js → sendSubscriptionEmail()
- services/users.service.js → getUserLimits()
- Integración completa con Stripe API
```

#### **E. Listas Router (listas.routes.js)**
```javascript
// Endpoints gestión listas
GET    /api/get-user-lists            # Listar listas usuario (devuelve { lists, guardados })
POST   /api/create-user-list          # Crear nueva lista (inicializa como objeto)
POST   /api/save-document-to-lists    # Guardar documento en una o varias listas
POST   /api/remove-document-from-list # Quitar documento de una lista
DELETE /api/delete-user-list          # Eliminar lista completa

// Modelo de datos (campo users.guardados):
// {
//   "Nombre Lista": {
//     "<documentId>": {
//        documentId, collectionName, savedAt,
//        url_pdf, short_name, resumen, rango_titulo, dia, mes, anio,
//        etiquetas_personalizadas: [coincidentes con perfil]
//     },
//     ...
//   },
//   ...
// }

// Migración automática:
// - Si una lista está en formato array, se convierte a objeto usando documentId como clave

// Emparejamiento de etiquetas:
// - Al guardar, cruza etiquetas del documento con etiquetas_personalizadas del usuario
```

### 🎨 FRONTEND → BACKEND FLOW

#### **Tus Listas – UX actualizada**
```
Frontend: public/profile.html → sección "Tus listas" (cargada dinámicamente)
↓ Al abrir dropdown "Guardar":
   - Carga listas del usuario desde /api/get-user-lists (con cache en sessionStorage y force refresh al abrir)
   - Muestra checkboxes por lista, pre-marcando según estado real (sin botón OK)
   - Acciones inmediatas al marcar/desmarcar (persistencia en servidor + actualización de cache)
↓ Crear nueva lista inline dentro del dropdown → /api/create-user-list
↓ Eliminar documento de lista → /api/remove-document-from-list
Respuesta: feedback visual inmediato (loader en checkbox, check verde)
```

#### **Impacto por etiquetas personalizadas**
```
Origen: profile.routes.js construye una sección "Impacto en agentes" por documento
- Para cada etiqueta del usuario en el documento: muestra explicación y nivel_impacto (bajo/medio/alto) con color
- Incluye thumbs up/down por etiqueta que llaman a POST /feedback-thumbs con { docId, agenteEtiquetado, ... }
```

#### **F. Generación Contenido Router (generacioncontenido.routes.js)**
```javascript
// Endpoints marketing content
POST /api/save-generation-settings    # Guardar configuración generación
POST /api/get-generation-settings     # Obtener configuración
POST /api/generate-marketing-content  # Generar contenido marketing

// Integración Python:
- Ejecuta python/marketing.py
- Procesamiento de múltiples documentos
- Generación de contenido personalizado (WhatsApp, LinkedIn, etc.)
```

#### **G. Feedback Router (feedback.routes.js)**
```javascript
// Endpoints de feedback
POST /feedback-thumbs             # Thumbs up/down del impacto por etiqueta (agente)
POST /api/feedback-analisis      # Feedback sobre resultados de análisis
GET  /feedback?userId=...&grade= # Crea feedback desde email y redirige a feedback.html
POST /feedback-comment           # Añade comentario de texto a un feedback existente

// Persistencia en MongoDB (colección 'Feedback'):
// 1) Documento agregado por usuario (evaluaciones[]) con append de entradas
// 2) Documento evento por feedback para consultas y analítica en tiempo real

// Enriquecimiento automático:
// - Si faltan 'coleccion' o 'doc_url', busca el documento en colecciones conocidas y completa campos
```

### 🛠️ **3. SERVICIOS DE SOPORTE**

#### **A. Email Service (services/email.service.js)**
```javascript
// Funciones centralizadas de email
sendPasswordResetEmail(email, resetToken)
- Plantilla HTML profesional de reset password
- Tokens seguros con expiración
- Integración SendGrid

sendSubscriptionEmail(user, userData)
- Confirmación de suscripción con detalles
- Plantillas dinámicas según plan
- Adjuntos de compliance
```

#### **B. Users Service (services/users.service.js)**
```javascript
// Gestión especializada de usuarios
getUserLimits(subscriptionPlan)
- Límites por plan: agentes, fuentes, features
- Lógica de planes: plan1 (gratis) → plan4 (enterprise)

processSpecialDomainUser(user)
- Lógica especial para @cuatrecasas.com
- Asignación automática de planes enterprise

processAODomainUser(user)
- Procesamiento para dominios A&O
- Configuración personalizada de acceso
```

#### **C. DB Utils Service (services/db.utils.js)**
```javascript
// Utilidades MongoDB reutilizables
expandCollectionsWithTest(collections)
- Expande colecciones para incluir versiones _test
- Usado en múltiples endpoints para testing

collectionExists(db, collectionName)
- Verificación de existencia de colecciones
- Prevención de errores en queries

buildDateFilter(fechaInicio, fechaFin)
- Constructor de filtros de fecha MongoDB
- Estandarización de queries temporales
```

---

## 🐍 INTEGRACIÓN PYTHON

### 📊 **1. Script de Análisis: questionsMongo.py**

#### **Propósito:**
Análisis inteligente de documentos normativos usando Google Gemini AI.

#### **Funcionalidades principales:**
```python
def main(document_id, user_prompt, collection_name, html_content=None):
    # 1. Conexión a MongoDB
    db = connect_to_mongodb()
    
    # 2. Extracción de contenido
    if html_content:
        text = clean_text_for_processing(html_content)  # HTML directo
    else:
        content_info = get_pdf_url_from_mongodb(db, collection_name, document_id)
        if content_info["type"] == "url_pdf":
            text = download_and_extract_text_from_pdf(url)  # PDF
        elif content_info["type"] == "content":
            text = clean_text_for_processing(content)  # Texto directo
    
    # 3. Análisis con Gemini
    response = ask_gemini(text, user_prompt)
    
    # 4. Respuesta JSON UTF-8
    print(json.dumps(response, ensure_ascii=False))
```

#### **Integración con Node.js:**
```javascript
// routes/normativa.routes.js
const pythonProcess = spawn('python', [
    path.join(__dirname, '..', 'python', 'questionsMongo.py'),
    documentId, userPrompt, collectionName, htmlContent
]);

// Manejo de entrada/salida
if (useStdin) {
    pythonProcess.stdin.write(JSON.stringify({
        user_prompt: userPrompt,
        collection_name: collectionName,
        html_content: htmlContent
    }));
}
```

### 📝 **2. Script de Marketing: marketing.py**

#### **Propósito:**
Generación de contenido de marketing personalizado basado en documentos jurídicos.

#### **Funcionalidades principales:**
```python
def main(documents_data, instructions, language, document_type, idioma='español'):
    enriched_documents = []
    
    # 1. Procesamiento de documentos
    for doc in documents_data:
        # Extracción de texto de múltiples fuentes
        full_text = extract_text_from_document(doc)
        
        # Enriquecimiento con etiquetas personalizadas
        parsed_tags = parse_etiquetas_personalizadas(doc)
        
        enriched_documents.append({
            'content': full_text,
            'tags': parsed_tags,
            'metadata': doc
        })
    
    # 2. Construcción de prompt especializado
    prompt = build_marketing_prompt(enriched_documents, instructions, language, document_type)
    
    # 3. Generación con Gemini
    response = generate_content_with_gemini(prompt)
    
    return {
        'success': True,
        'content': response,
        'metadata': {
            'documents_processed': len(enriched_documents),
            'language': language,
            'type': document_type
        }
    }
```

#### **Tipos de contenido soportados:**
- **WhatsApp**: Mensajes cortos y directos
- **LinkedIn**: Posts profesionales
- **Email**: Newsletters jurídicas
- **Presentación**: Slides ejecutivos
- **Jurídico**: Análisis técnicos

---

## 📚 SISTEMA DE PROMPTS

### 📄 **1. Configuración de Prompts (prompts/)**

#### **A. Contexto Regulatorio (contexto_regulatorio.md)**
```yaml
---
contexto: |
  Eres un asistente experto en regulación y compliance. 
  Debes devolver únicamente un objeto JSON válido con la clave "html_response".
  El valor debe ser un string HTML con exactamente tres párrafos <p>, 
  sin ningún texto ni etiqueta adicional.
  
  Análisis del contexto regulatorio:
  1. Primer párrafo: Resumen de las regulaciones principales
  2. Segundo párrafo: Impacto específico en el sector/empresa
  3. Tercer párrafo: Recomendaciones de compliance y siguientes pasos
---
```

#### **B. Análisis Normativo (analisis_normativo.md)**
- Prompts especializados para análisis de diferentes tipos de documentos
- Plantillas para BOE, DOGC, normativas europeas
- Instrucciones de formato de respuesta JSON

#### **C. Generación de Contenido (generacion_contenido.md)**
- Prompts para cada tipo de contenido de marketing
- Estilos y tonos específicos por canal
- Plantillas de estructura por idioma

### 🔄 **2. Carga Dinámica de Prompts**

```javascript
// routes/onboarding.routes.js - Ejemplo de carga
const promptsPath = path.join(__dirname, '..', 'prompts', 'contexto_regulatorio.md');
const promptsContent = fs.readFileSync(promptsPath, 'utf8');
const systemInstructions = promptsContent.match(/contexto: \|([\s\S]*?)---/)[1].trim();

// Uso en llamada a Gemini
const response = await genAI.generateContent({
    contents: [{
        role: 'user',
        parts: [{ text: systemInstructions + '\n\n' + userAnswers }]
    }]
});
```

---

## 🔐 SISTEMA DE AUTENTICACIÓN

### 🛡️ **1. Flujo de Autenticación**

#### **A. Autenticación Local**
```
Usuario → /login (POST) → auth.routes.js
↓ Passport local strategy
↓ Verificación bcrypt password
↓ Creación de sesión
→ Redirect a /profile
```

#### **B. OAuth Google**
```
Usuario → /auth/google → auth.routes.js
↓ Redirect a Google OAuth
Google → /auth/google/callback → auth.routes.js
↓ Passport Google strategy  
↓ Procesamiento de usuario especial (si aplica)
→ Redirect a /profile
```

#### **C. Middleware de Protección**
```javascript
// middleware/ensureAuthenticated.js
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    req.session.returnTo = req.originalUrl;
    return res.redirect('/');
}

// Uso en rutas protegidas
router.get('/profile', ensureAuthenticated, (req, res) => {
    // Lógica de endpoint protegido
});
```

### 👥 **2. Tipos de Usuario y Procesamiento Especial**

#### **A. Usuarios Estándar**
- Registro/login normal
- Planes de suscripción estándar
- Límites según plan contratado

#### **B. Usuarios Cuatrecasas (@cuatrecasas.com)**
```javascript
// services/users.service.js
async function processSpecialDomainUser(user) {
    // Asignación automática plan enterprise
    // Configuración especial de acceso
    // Límites ilimitados
}
```

#### **C. Usuarios A&O (dominio especial)**
```javascript
async function processAODomainUser(user) {
    // Procesamiento personalizado A&O
    // Configuración de compliance específica
}
```

---

## 💳 SISTEMA DE FACTURACIÓN

### 💰 **1. Integración Stripe**

#### **A. Planes de Suscripción**
```javascript
// services/users.service.js - Límites por plan
const getUserLimits = (subscriptionPlan) => {
    switch (subscriptionPlan) {
        case 'plan1': return { limit_agentes: 0, limit_fuentes: 0 };      // Gratis
        case 'plan2': return { limit_agentes: 5, limit_fuentes: 3 };      // Básico
        case 'plan3': return { limit_agentes: 10, limit_fuentes: 10 };    // Pro
        case 'plan4': return { limit_agentes: null, limit_fuentes: null }; // Enterprise
    }
};
```

#### **B. Flujo de Checkout**
```
Frontend → /create-checkout-session (POST) → billing.routes.js
↓ Stripe.checkout.sessions.create()
→ URL de pago Stripe
Usuario completa pago → Webhook Stripe
↓ Actualización automática en MongoDB
→ Activación de plan
```

#### **C. Gestión de Suscripciones**
```javascript
// billing.routes.js - Endpoints principales
POST /update-subscription     # Cambio de plan
POST /cancel-plan2           # Cancelación
POST /save-free-plan         # Downgrade a gratuito
```

#### Nota temporal
- Envío de correo de confirmación desactivado temporalmente para onboarding y plan gratuito:
  - `/save-user` (user.routes.js): envío comentado con log.
  - `/save-free-plan` (billing.routes.js): envío comentado con log.

---

## 📈 CONCLUSIÓN

### 🏆 **Logros del Refactoring**

1. **Modularización Completa**: Arquitectura de microservicios internos
2. **Mantenibilidad**: Código organizado por dominio funcional  
3. **Escalabilidad**: Fácil adición de nuevas funcionalidades
4. **Separación de Responsabilidades**: Backend/Frontend/IA claramente definidos
5. **Reutilización**: Servicios compartidos entre módulos

### 🚀 **Beneficios Técnicos**

- **Desarrollo Paralelo**: Múltiples desarrolladores pueden trabajar simultáneamente
- **Testing Modular**: Cada router/servicio puede probarse independientemente
- **Deploy Granular**: Posibilidad de deploy de módulos específicos
- **Debugging Simplificado**: Errores localizados por dominio
- **Documentación Clara**: Cada módulo con responsabilidades bien definidas

### 🎨 **Estándares UX/UI Implementados**

#### **A. Sistema de Confirmaciones**
```javascript
// ❌ INCORRECTO - No usar alerts del navegador
if (confirm('¿Estás seguro de que quieres eliminar esta lista?')) {
    deleteList();
}

// ✅ CORRECTO - Usar modal estándar
showConfirmationModal({
    title: 'Eliminar Lista',
    message: '¿Estás seguro de que quieres eliminar esta lista? Esta acción no se puede deshacer.',
    onConfirm: () => deleteList(),
    onCancel: () => hideModal()
});
```

#### **B. Componentes UI Estandarizados**
- **Modales**: Confirmaciones, alertas, formularios complejos
- **Loaders**: Estados de carga con spinners Reversa
- **Feedback**: Banners de éxito/error con colores corporativos
- **Botones**: Tipos específicos según acción (IA, danger, standard)

#### **C. Patrones de Interacción**
- **Acciones destructivas**: Siempre requieren confirmación modal
- **Procesos largos**: Feedback visual con loaders y estados
- **Errores**: Banners informativos en lugar de alerts
- **Éxito**: Confirmación visual sutil y persistente

### 🔮 **Preparación para el Futuro**

La arquitectura actual está preparada para:
- **Microservicios**: Fácil separación en servicios independientes
- **API REST Completa**: Endpoints organizados y documentados
- **Integración IA**: Sistema de prompts modular y escalable
- **Multi-tenant**: Base para soporte de múltiples organizaciones
- **Mobile Apps**: Backend API-first compatible con apps móviles
- **Design System Escalable**: Componentes reutilizables y consistentes 