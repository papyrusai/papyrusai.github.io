# 📊 PLAN DE IMPLEMENTACIÓN - SISTEMA DE ANALYTICS PAPYRUS AI

## 🎯 RESUMEN EJECUTIVO

### Objetivo
Implementar un sistema completo de analytics para tracking del uso de la plataforma, con métricas detalladas por usuario, agregados empresariales y visión global, incluyendo un dashboard de monitoreo en tiempo real.

### Decisión de Arquitectura
✅ **Colección separada para analytics** en MongoDB (`analytics_events`)
- **Razón**: Mejor performance para queries agregadas, no infla documentos de users, escalabilidad, separación de concerns
- **Alternativa descartada**: Almacenar en colección users (limitaciones de tamaño documento MongoDB 16MB, peor performance en agregaciones)

### Métricas a Trackear

#### Métricas Core Solicitadas
1. **Sesiones**: # inicios de sesión, tiempo en plataforma
2. **Análisis de Impacto**: Resúmenes, cuadros de obligaciones, riesgos y oportunidades
3. **Generación de Contenido**: Desde tus listas, por tipo
4. **Gestión Documental**: # listas creadas, documentos guardados
5. **Exports**: Iniciativas parlamentarias, generaciones, análisis

#### Métricas Adicionales Recomendadas
6. **Engagement**: Documentos vistos, búsquedas realizadas, filtros aplicados
7. **Feature Adoption**: Uso de agentes IA, configuración perfil regulatorio
8. **Performance**: Tiempos de respuesta, errores por usuario
9. **Conversión**: Upgrades de plan, cancelaciones
10. **Colaboración** (empresas): Documentos compartidos, ediciones colaborativas

### Niveles de Agregación
- **Individual**: Métricas por usuario
- **Empresarial**: Total empresa + media por usuario
- **Global**: Total plataforma + media general

---

## 📐 MODELO DE DATOS

### Colección: `analytics_events`
```javascript
{
  _id: ObjectId,
  
  // === IDENTIFICACIÓN ===
  user_id: ObjectId,               // Referencia al usuario
  user_email: String,              // Email para búsquedas rápidas
  tipo_cuenta: "individual" | "empresa",
  empresa: String,                 // Dominio si es empresa
  empresa_id: ObjectId,            // estructura_empresa_id si aplica
  
  // === EVENTO ===
  event_type: String,              // "login", "analysis", "export", etc.
  event_category: String,          // "session", "content", "document", etc.
  event_action: String,            // Acción específica
  event_value: Number,             // Valor opcional (ej: tiempo en segundos)
  event_metadata: {                // Datos adicionales del evento
    // Específicos por tipo de evento
    document_id: ObjectId,
    collection_name: String,
    analysis_type: String,         // "resumen", "obligaciones", "riesgos"
    content_type: String,          // "whatsapp", "linkedin", "email"
    export_format: String,         // "xlsx", "csv", "pdf", "word", "json"
    export_type: String,           // "iniciativas_legales" | "iniciativas_parlamentarias" | "analysis" | "content"
    export_rows: Number,           // filas exportadas (opcional)
    filters_applied: Object,       // snapshot mínimo de filtros (opcional)
    list_name: String,
    agent_name: String,
    search_query: String,
    error_code: String,
    response_time_ms: Number,
    // ... más según necesidad
  },
  
  // === CONTEXTO ===
  session_id: String,              // ID de sesión para agrupar eventos
  ip_address: String,              // IP del usuario
  user_agent: String,              // Browser/device info
  referrer: String,                // De dónde vino
  
  // === TIMESTAMPS ===
  timestamp: Date,                 // Momento exacto del evento
  date_day: String,                // "2024-01-15" para agregaciones diarias
  date_week: String,               // "2024-W03" para agregaciones semanales
  date_month: String,              // "2024-01" para agregaciones mensuales
  date_year: Number,               // 2024 para agregaciones anuales
  hour_of_day: Number,             // 0-23 para análisis por hora
  day_of_week: Number,             // 0-6 para análisis por día de semana
  
  // === PLAN Y LÍMITES ===
  subscription_plan: String,       // plan1, plan2, plan3, plan4
  within_limits: Boolean,          // Si estaba dentro de límites del plan
  
  // === ÍNDICES ===
  created_at: Date,
  updated_at: Date
}
```

### Colección: `analytics_aggregates` (Cache de agregaciones)
```javascript
{
  _id: ObjectId,
  
  // === IDENTIFICACIÓN ===
  aggregate_type: "user" | "empresa" | "global",
  aggregate_id: String,            // user_id, empresa domain, o "global"
  period_type: "daily" | "weekly" | "monthly" | "yearly" | "all_time",
  period_value: String,            // "2024-01-15", "2024-W03", "2024-01", "2024", "all"
  
  // === MÉTRICAS AGREGADAS ===
  metrics: {
    // Sesiones
    login_count: Number,
    unique_days_active: Number,
    total_session_time: Number,     // Segundos
    avg_session_time: Number,
    
    // Análisis de Impacto
    analysis_count: Number,
    analysis_by_type: {
      resumen: Number,
      obligaciones: Number,
      riesgos: Number
    },
    
    // Generación de Contenido
    content_generation_count: Number,
    content_by_type: {
      whatsapp: Number,
      linkedin: Number,
      email: Number,
      presentation: Number,
      legal: Number
    },
    
    // Gestión Documental
    lists_created: Number,
    documents_saved: Number,
    documents_viewed: Number,
    searches_performed: Number,
    
    // Exports
    export_count: Number,
    export_by_type: {
      iniciativas_parlamentarias: Number,
      iniciativas_legales: Number,
      generaciones: Number,
      analisis: Number
    },
    // Exports Excel (formato xlsx únicamente)
    export_excel_count: Number,
    export_excel_by_type: {
      iniciativas_parlamentarias: Number,
      iniciativas_legales: Number
    },
    
    // Engagement
    feature_adoption: {
      agents_used: [String],
      perfil_regulatorio_configured: Boolean,
      carpetas_created: Number
    },
    
    // Performance
    avg_response_time: Number,
    error_count: Number,
    
    // Para empresas
    active_users: Number,           // Solo para agregados empresa/global
    user_breakdown: [{               // Solo para empresas
      user_id: ObjectId,
      user_email: String,
      metrics: {}                   // Subset de métricas por usuario
    }]
  },
  
  // === METADATA ===
  last_calculated: Date,
  calculation_version: Number,
  created_at: Date,
  updated_at: Date
}
```

### Índices MongoDB Necesarios
```javascript
// analytics_events - Índices para queries eficientes
db.analytics_events.createIndex({ "user_id": 1, "timestamp": -1 })
db.analytics_events.createIndex({ "empresa": 1, "timestamp": -1 })
db.analytics_events.createIndex({ "event_type": 1, "timestamp": -1 })
db.analytics_events.createIndex({ "date_day": 1 })
db.analytics_events.createIndex({ "date_month": 1 })
db.analytics_events.createIndex({ "session_id": 1 })
db.analytics_events.createIndex({ "event_type": 1, "event_metadata.export_type": 1, "timestamp": -1 })
db.analytics_events.createIndex({ "event_type": 1, "event_metadata.export_format": 1, "timestamp": -1 })

// analytics_aggregates - Índices para cache
db.analytics_aggregates.createIndex({ 
  "aggregate_type": 1, 
  "aggregate_id": 1, 
  "period_type": 1, 
  "period_value": 1 
}, { unique: true })
```

---

## 🏗️ ARQUITECTURA DE IMPLEMENTACIÓN

### 1. Servicio de Analytics (`/services/analytics.service.js`)
```javascript
// services/analytics.service.js
const { MongoClient } = require('mongodb');

class AnalyticsService {
  constructor() {
    this.eventsCollection = 'analytics_events';
    this.aggregatesCollection = 'analytics_aggregates';
  }

  // === TRACKING DE EVENTOS ===
  async trackEvent({
    userId,
    eventType,
    eventCategory,
    eventAction,
    eventValue = null,
    metadata = {},
    sessionId = null,
    req = null
  }) {
    try {
      const db = await this.getDb();
      const user = await this.getUserContext(userId);
      
      const now = new Date();
      const event = {
        user_id: userId,
        user_email: user.email,
        tipo_cuenta: user.tipo_cuenta || 'individual',
        empresa: user.empresa || null,
        empresa_id: user.estructura_empresa_id || null,
        
        event_type: eventType,
        event_category: eventCategory,
        event_action: eventAction,
        event_value: eventValue,
        event_metadata: metadata,
        
        session_id: sessionId || req?.session?.id,
        ip_address: req?.ip,
        user_agent: req?.get('user-agent'),
        referrer: req?.get('referrer'),
        
        timestamp: now,
        date_day: this.formatDate(now, 'day'),
        date_week: this.formatDate(now, 'week'),
        date_month: this.formatDate(now, 'month'),
        date_year: now.getFullYear(),
        hour_of_day: now.getHours(),
        day_of_week: now.getDay(),
        
        subscription_plan: user.subscription_plan,
        within_limits: this.checkWithinLimits(user, eventType),
        
        created_at: now,
        updated_at: now
      };
      
      await db.collection(this.eventsCollection).insertOne(event);
      
      // Trigger async aggregation update (no blocking)
      this.updateAggregates(userId, user.empresa, eventType).catch(console.error);
      
      return { success: true, eventId: event._id };
    } catch (error) {
      console.error('Error tracking event:', error);
      // No fallar silenciosamente - los analytics no deben romper la app
      return { success: false, error: error.message };
    }
  }

  // === EVENTOS ESPECÍFICOS ===
  async trackLogin(userId, req) {
    return this.trackEvent({
      userId,
      eventType: 'login',
      eventCategory: 'session',
      eventAction: 'user_login',
      metadata: {
        login_method: req.body?.oauth ? 'google' : 'local'
      },
      req
    });
  }

  async trackAnalysis(userId, analysisType, documentId, collectionName, req) {
    return this.trackEvent({
      userId,
      eventType: 'analysis',
      eventCategory: 'content',
      eventAction: `analysis_${analysisType}`,
      metadata: {
        analysis_type: analysisType,
        document_id: documentId,
        collection_name: collectionName
      },
      req
    });
  }

  async trackContentGeneration(userId, contentType, documentIds, listName, req) {
    return this.trackEvent({
      userId,
      eventType: 'content_generation',
      eventCategory: 'content',
      eventAction: `generate_${contentType}`,
      metadata: {
        content_type: contentType,
        document_count: documentIds.length,
        document_ids: documentIds,
        list_name: listName
      },
      req
    });
  }

  async trackExport(userId, exportType, format, documentId, req) {
    return this.trackEvent({
      userId,
      eventType: 'export',
      eventCategory: 'document',
      eventAction: `export_${exportType}`,
      metadata: {
        export_type: exportType,
        export_format: format,
        document_id: documentId
      },
      req
    });
  }

  async trackListOperation(userId, operation, listName, documentCount, req) {
    return this.trackEvent({
      userId,
      eventType: 'list_operation',
      eventCategory: 'document',
      eventAction: `list_${operation}`,
      metadata: {
        operation,
        list_name: listName,
        document_count: documentCount
      },
      req
    });
  }

  // === CÁLCULO DE TIEMPO DE SESIÓN ===
  async trackSessionTime(userId, sessionId, startTime, endTime) {
    const duration = Math.floor((endTime - startTime) / 1000); // segundos
    return this.trackEvent({
      userId,
      eventType: 'session_time',
      eventCategory: 'session',
      eventAction: 'session_duration',
      eventValue: duration,
      metadata: {
        start_time: startTime,
        end_time: endTime,
        duration_seconds: duration
      },
      sessionId
    });
  }

  // === AGREGACIONES ===
  async getUserMetrics(userId, period = 'all_time') {
    const db = await this.getDb();
    
    // Intentar obtener del cache primero
    const cached = await db.collection(this.aggregatesCollection).findOne({
      aggregate_type: 'user',
      aggregate_id: userId.toString(),
      period_type: period === 'all_time' ? 'all_time' : period.type,
      period_value: period === 'all_time' ? 'all' : period.value
    });
    
    if (cached && this.isCacheValid(cached)) {
      return cached.metrics;
    }
    
    // Calcular agregaciones en tiempo real
    return this.calculateUserMetrics(userId, period);
  }

  async getEmpresaMetrics(empresa, period = 'all_time') {
    const db = await this.getDb();
    
    // Obtener todos los usuarios de la empresa
    const users = await db.collection('users').find({
      tipo_cuenta: 'empresa',
      empresa: empresa
    }).toArray();
    
    const userIds = users.map(u => u._id);
    
    // Calcular métricas agregadas
    const pipeline = [
      {
        $match: {
          user_id: { $in: userIds },
          ...this.getPeriodFilter(period)
        }
      },
      {
        $group: {
          _id: null,
          login_count: {
            $sum: { $cond: [{ $eq: ['$event_type', 'login'] }, 1, 0] }
          },
          analysis_count: {
            $sum: { $cond: [{ $eq: ['$event_type', 'analysis'] }, 1, 0] }
          },
          content_generation_count: {
            $sum: { $cond: [{ $eq: ['$event_type', 'content_generation'] }, 1, 0] }
          },
          export_count: {
            $sum: { $cond: [{ $eq: ['$event_type', 'export'] }, 1, 0] }
          },
          total_session_time: {
            $sum: {
              $cond: [
                { $eq: ['$event_type', 'session_time'] },
                '$event_value',
                0
              ]
            }
          },
          unique_users: { $addToSet: '$user_id' }
        }
      }
    ];
    
    const result = await db.collection(this.eventsCollection)
      .aggregate(pipeline)
      .toArray();
    
    if (result.length === 0) {
      return this.getEmptyMetrics();
    }
    
    const metrics = result[0];
    const activeUsers = metrics.unique_users.length;
    
    // Calcular medias
    return {
      total: {
        login_count: metrics.login_count,
        analysis_count: metrics.analysis_count,
        content_generation_count: metrics.content_generation_count,
        export_count: metrics.export_count,
        total_session_time: metrics.total_session_time,
        active_users: activeUsers
      },
      average_per_user: {
        login_count: activeUsers > 0 ? metrics.login_count / activeUsers : 0,
        analysis_count: activeUsers > 0 ? metrics.analysis_count / activeUsers : 0,
        content_generation_count: activeUsers > 0 ? metrics.content_generation_count / activeUsers : 0,
        export_count: activeUsers > 0 ? metrics.export_count / activeUsers : 0,
        avg_session_time: activeUsers > 0 ? metrics.total_session_time / activeUsers : 0
      },
      user_breakdown: await this.getUserBreakdown(userIds, period)
    };
  }

  async getGlobalMetrics(period = 'all_time') {
    const db = await this.getDb();
    
    const pipeline = [
      {
        $match: this.getPeriodFilter(period)
      },
      {
        $group: {
          _id: null,
          total_events: { $sum: 1 },
          unique_users: { $addToSet: '$user_id' },
          unique_empresas: { $addToSet: '$empresa' },
          login_count: {
            $sum: { $cond: [{ $eq: ['$event_type', 'login'] }, 1, 0] }
          },
          analysis_count: {
            $sum: { $cond: [{ $eq: ['$event_type', 'analysis'] }, 1, 0] }
          },
          content_generation_count: {
            $sum: { $cond: [{ $eq: ['$event_type', 'content_generation'] }, 1, 0] }
          },
          export_count: {
            $sum: { $cond: [{ $eq: ['$event_type', 'export'] }, 1, 0] }
          },
          total_session_time: {
            $sum: {
              $cond: [
                { $eq: ['$event_type', 'session_time'] },
                '$event_value',
                0
              ]
            }
          }
        }
      }
    ];
    
    const result = await db.collection(this.eventsCollection)
      .aggregate(pipeline)
      .toArray();
    
    if (result.length === 0) {
      return this.getEmptyMetrics();
    }
    
    const metrics = result[0];
    const totalUsers = metrics.unique_users.length;
    const totalEmpresas = metrics.unique_empresas.filter(e => e !== null).length;
    
    return {
      total: {
        total_events: metrics.total_events,
        total_users: totalUsers,
        total_empresas: totalEmpresas,
        login_count: metrics.login_count,
        analysis_count: metrics.analysis_count,
        content_generation_count: metrics.content_generation_count,
        export_count: metrics.export_count,
        total_session_time: metrics.total_session_time
      },
      average_per_user: {
        login_count: totalUsers > 0 ? metrics.login_count / totalUsers : 0,
        analysis_count: totalUsers > 0 ? metrics.analysis_count / totalUsers : 0,
        content_generation_count: totalUsers > 0 ? metrics.content_generation_count / totalUsers : 0,
        export_count: totalUsers > 0 ? metrics.export_count / totalUsers : 0,
        avg_session_time: totalUsers > 0 ? metrics.total_session_time / totalUsers : 0
      }
    };
  }

  // === HELPERS ===
  getPeriodFilter(period) {
    if (period === 'all_time') {
      return {};
    }
    
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        return {};
    }
    
    return { timestamp: { $gte: startDate } };
  }

  formatDate(date, format) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const week = this.getWeekNumber(d);
    
    switch (format) {
      case 'day':
        return `${year}-${month}-${day}`;
      case 'week':
        return `${year}-W${String(week).padStart(2, '0')}`;
      case 'month':
        return `${year}-${month}`;
      default:
        return date.toISOString();
    }
  }

  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  getEmptyMetrics() {
    return {
      login_count: 0,
      analysis_count: 0,
      content_generation_count: 0,
      export_count: 0,
      lists_created: 0,
      documents_saved: 0,
      total_session_time: 0,
      avg_session_time: 0
    };
  }
}

module.exports = new AnalyticsService();
```

#### Nuevo: actualización de agregados para exports Excel de iniciativas
```javascript
// Dentro de services/analytics.service.js
async updateAggregates(userId, empresa, event) {
  const db = await this.getDb();
  const now = new Date();
  const periods = [
    { type: 'daily', value: this.formatDate(now, 'day') },
    { type: 'monthly', value: this.formatDate(now, 'month') },
    { type: 'yearly', value: String(now.getFullYear()) },
    { type: 'all_time', value: 'all' }
  ];
  const targets = [
    { aggregate_type: 'user', aggregate_id: userId.toString() },
    ...(empresa ? [{ aggregate_type: 'empresa', aggregate_id: empresa }] : []),
    { aggregate_type: 'global', aggregate_id: 'global' }
  ];

  // Incrementos base
  const isExport = event?.event_type === 'export';
  const isExcel = event?.event_metadata?.export_format === 'xlsx';
  const expType = event?.event_metadata?.export_type; // iniciativas_legales | iniciativas_parlamentarias | ...

  const baseInc = {
    total_events: 1,
    login_count: event?.event_type === 'login' ? 1 : 0,
    analysis_count: event?.event_type === 'analysis' ? 1 : 0,
    content_generation_count: event?.event_type === 'content_generation' ? 1 : 0,
    export_count: isExport ? 1 : 0,
    total_session_time: event?.event_type === 'session_time' ? (event?.event_value || 0) : 0
  };

  // Incrementos específicos de export por tipo
  if (isExport && (expType === 'iniciativas_legales' || expType === 'iniciativas_parlamentarias')) {
    baseInc[`export_by_type.${expType}`] = 1;
    if (isExcel) {
      baseInc['export_excel_count'] = 1;
      baseInc[`export_excel_by_type.${expType}`] = 1;
    }
  }

  for (const p of periods) {
    for (const t of targets) {
      await db.collection(this.aggregatesCollection).updateOne(
        { ...t, period_type: p.type, period_value: p.value },
        { $inc: baseInc, $set: { updated_at: now }, $setOnInsert: { created_at: now } },
        { upsert: true }
      );
    }
  }
}
```

### 2. Middleware de Tracking (`/middleware/analytics.middleware.js`)
```javascript
// middleware/analytics.middleware.js
const analyticsService = require('../services/analytics.service');

// Middleware para tracking automático de páginas vistas
const trackPageView = (req, res, next) => {
  if (req.user && req.user._id) {
    analyticsService.trackEvent({
      userId: req.user._id,
      eventType: 'page_view',
      eventCategory: 'navigation',
      eventAction: req.path,
      metadata: {
        path: req.path,
        method: req.method,
        query: req.query
      },
      req
    }).catch(console.error);
  }
  next();
};

// Middleware para tracking de tiempo de sesión
const sessionTimeTracker = (req, res, next) => {
  if (req.session && req.user) {
    // Marcar inicio de sesión si no existe
    if (!req.session.startTime) {
      req.session.startTime = new Date();
    }
    
    // Actualizar última actividad
    req.session.lastActivity = new Date();
    
    // Al hacer logout o timeout, calcular duración
    if (req.path === '/logout') {
      const startTime = new Date(req.session.startTime);
      const endTime = new Date();
      
      analyticsService.trackSessionTime(
        req.user._id,
        req.session.id,
        startTime,
        endTime
      ).catch(console.error);
    }
  }
  next();
};

module.exports = {
  trackPageView,
  sessionTimeTracker
};
```

### 3. Router de Analytics (`/routes/analytics.routes.js`)
```javascript
// routes/analytics.routes.js
const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analytics.service');
const { ensureAuthenticated } = require('../middleware/ensureAuthenticated');

// === ENDPOINTS PARA DASHBOARD ===

// Obtener métricas de usuario actual
router.get('/api/analytics/my-metrics', ensureAuthenticated, async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const metrics = await analyticsService.getUserMetrics(req.user._id, period);
    
    res.json({
      success: true,
      metrics,
      period
    });
  } catch (error) {
    console.error('Error getting user metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener métricas de empresa (solo admin empresa)
router.get('/api/analytics/empresa-metrics', ensureAuthenticated, async (req, res) => {
  try {
    // Verificar que es admin de empresa
    if (req.user.tipo_cuenta !== 'empresa' || req.user.permiso !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'No autorizado para ver métricas empresariales' 
      });
    }
    
    const { period = 'month' } = req.query;
    const metrics = await analyticsService.getEmpresaMetrics(req.user.empresa, period);
    
    res.json({
      success: true,
      empresa: req.user.empresa,
      metrics,
      period
    });
  } catch (error) {
    console.error('Error getting empresa metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener métricas globales (solo superadmin)
router.get('/api/analytics/global-metrics', ensureAuthenticated, async (req, res) => {
  try {
    // Verificar que es superadmin (implementar lógica de superadmin)
    if (!req.user.isSuperAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'No autorizado para ver métricas globales' 
      });
    }
    
    const { period = 'month' } = req.query;
    const metrics = await analyticsService.getGlobalMetrics(period);
    
    res.json({
      success: true,
      metrics,
      period
    });
  } catch (error) {
    console.error('Error getting global metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener métricas por rango de fechas personalizado
router.post('/api/analytics/custom-range', ensureAuthenticated, async (req, res) => {
  try {
    const { startDate, endDate, aggregateType = 'user', aggregateId } = req.body;
    
    // Validar permisos según tipo de agregación
    if (aggregateType === 'empresa' && req.user.permiso !== 'admin') {
      return res.status(403).json({ success: false, error: 'No autorizado' });
    }
    
    const metrics = await analyticsService.getMetricsByDateRange(
      aggregateType,
      aggregateId || req.user._id,
      new Date(startDate),
      new Date(endDate)
    );
    
    res.json({
      success: true,
      metrics,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('Error getting custom range metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Exportar métricas a CSV/Excel
router.get('/api/analytics/export', ensureAuthenticated, async (req, res) => {
  try {
    const { format = 'csv', type = 'user', period = 'month' } = req.query;
    
    let metrics;
    if (type === 'user') {
      metrics = await analyticsService.getUserMetrics(req.user._id, period);
    } else if (type === 'empresa' && req.user.permiso === 'admin') {
      metrics = await analyticsService.getEmpresaMetrics(req.user.empresa, period);
    } else {
      return res.status(403).json({ success: false, error: 'No autorizado' });
    }
    
    // Generar archivo según formato
    const file = await analyticsService.exportMetrics(metrics, format);
    
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename=analytics_${period}.${format}`);
    res.send(file);
  } catch (error) {
    console.error('Error exporting metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

#### Nuevo: endpoint para tracking de exports de iniciativas (cliente → backend)
```javascript
// routes/analytics.routes.js (añadir antes del module.exports)

// Track de export Excel de iniciativas (legales/parlamentarias)
router.post('/api/analytics/track-export-iniciativas', ensureAuthenticated, async (req, res) => {
  try {
    const { tipo, format = 'xlsx', rows = 0, filters = {} } = req.body; // tipo: 'iniciativas_legales' | 'iniciativas_parlamentarias'

    if (!['iniciativas_legales', 'iniciativas_parlamentarias'].includes(tipo)) {
      return res.status(400).json({ success: false, error: 'tipo inválido' });
    }

    await analyticsService.trackEvent({
      userId: req.user._id,
      eventType: 'export',
      eventCategory: 'document',
      eventAction: `export_${tipo}`,
      metadata: {
        export_type: tipo,
        export_format: format,
        export_rows: rows,
        filters_applied: filters
      },
      req
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Error tracking iniciativas export:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## 📝 INTEGRACIÓN EN ENDPOINTS EXISTENTES

### 1. Login/Logout (`/routes/auth.routes.js`)
```javascript
// Añadir después del login exitoso
const analyticsService = require('../services/analytics.service');

router.post('/login', async (req, res, next) => {
  // ... código existente de login ...
  
  // Después del login exitoso
  if (user) {
    // Track login event
    await analyticsService.trackLogin(user._id, req);
    
    // Inicializar tracking de sesión
    req.session.startTime = new Date();
  }
});

router.get('/logout', async (req, res) => {
  // Track session time antes de destruir sesión
  if (req.user && req.session.startTime) {
    await analyticsService.trackSessionTime(
      req.user._id,
      req.session.id,
      new Date(req.session.startTime),
      new Date()
    );
  }
  
  // ... código existente de logout ...
});
```

### 2. Análisis de Normativa (`/routes/normativa.routes.js`)
```javascript
// En endpoint de análisis
router.post('/api/analyze-norma', ensureAuthenticated, async (req, res) => {
  // ... código existente ...
  
  // Después de análisis exitoso
  if (result.success) {
    await analyticsService.trackAnalysis(
      req.user._id,
      req.body.analysisType || 'resumen',  // resumen, obligaciones, riesgos
      req.body.documentId,
      req.body.collectionName,
      req
    );
  }
});
```

### 3. Generación de Contenido (`/routes/generacioncontenido.routes.js`)
```javascript
router.post('/api/generate-marketing-content', ensureAuthenticated, async (req, res) => {
  // ... código existente ...
  
  // Después de generación exitosa
  if (result.success) {
    await analyticsService.trackContentGeneration(
      req.user._id,
      req.body.type,  // whatsapp, linkedin, email, etc.
      req.body.documentIds,
      req.body.listName,
      req
    );
  }
});
```

### 4. Gestión de Listas (`/routes/listas.routes.js`)
```javascript
// Crear lista
router.post('/api/create-user-list', ensureAuthenticated, async (req, res) => {
  // ... código existente ...
  
  if (result.success) {
    await analyticsService.trackListOperation(
      req.user._id,
      'create',
      req.body.listName,
      0,
      req
    );
  }
});

// Guardar documento en lista
router.post('/api/save-document-to-lists', ensureAuthenticated, async (req, res) => {
  // ... código existente ...
  
  if (result.success) {
    await analyticsService.trackListOperation(
      req.user._id,
      'save_document',
      req.body.listNames.join(','),
      1,
      req
    );
  }
});
```

### 5. Exports (`/routes/profile.routes.js`)
```javascript
// Añadir tracking en endpoints de export
router.post('/api/export-analysis', ensureAuthenticated, async (req, res) => {
  // ... código existente ...
  
  if (exportSuccess) {
    await analyticsService.trackExport(
      req.user._id,
      'analysis',  // analysis, iniciativas, content
      req.body.format,  // pdf, word, json
      req.body.documentId,
      req
    );
  }
});
```

### 6. Exports de Iniciativas (Frontend → Tracking)
```javascript
// public/views/boletindiario/iniciativas_legales.js
// Después de generar y descargar el XLSX con SheetJS
await fetch('/api/analytics/track-export-iniciativas', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tipo: 'iniciativas_legales',
    format: 'xlsx',
    rows: filteredData.length,
    filters: collectedFilters // snapshot mínimo (fechas, fuentes, etc.)
  })
});

// public/views/boletindiario/iniciativas_parlamentarias.js
await fetch('/api/analytics/track-export-iniciativas', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tipo: 'iniciativas_parlamentarias',
    format: 'xlsx',
    rows: filteredData.length,
    filters: collectedFilters
  })
});
```

Notas:
- El tracking se lanza tras crear el archivo XLSX en cliente (SheetJS) [[memory:9092358]] [[memory:9092325]].
- Mantener el uso de modal estándar para confirmaciones y feedback, sin `alert()` [[memory:7117596]].
- Si se muestra un modal de confirmación previo a exportar, esperar a que el `await` del export termine antes de cerrar [[memory:9092340]].

---

## 🎨 DASHBOARD FRONTEND

### 1. Vista Principal Dashboard (`/public/views/analytics/dashboard.html`)
```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Analytics Dashboard - Papyrus AI</title>
    <link rel="stylesheet" href="/styles/analytics-dashboard.css">
</head>
<body>
    <div class="analytics-container">
        <!-- Navegación del Dashboard -->
        <nav class="analytics-nav">
            <div class="nav-tabs">
                <button class="nav-tab active" data-view="overview">
                    <i class="fas fa-chart-line"></i> Resumen General
                </button>
                <button class="nav-tab" data-view="empresas">
                    <i class="fas fa-building"></i> Por Empresa
                </button>
                <button class="nav-tab" data-view="usuarios">
                    <i class="fas fa-users"></i> Por Usuario
                </button>
            </div>
            
            <!-- Selector de período -->
            <div class="period-selector">
                <select id="period-select">
                    <option value="today">Hoy</option>
                    <option value="week">Última Semana</option>
                    <option value="month" selected>Último Mes</option>
                    <option value="year">Último Año</option>
                    <option value="all_time">Todo el Tiempo</option>
                    <option value="custom">Personalizado...</option>
                </select>
                
                <!-- Rango personalizado (oculto por defecto) -->
                <div id="custom-range" style="display: none;">
                    <input type="date" id="start-date">
                    <input type="date" id="end-date">
                    <button id="apply-range">Aplicar</button>
                </div>
            </div>
            
            <!-- Botón de exportación -->
            <button id="export-btn" class="btn-export">
                <i class="fas fa-download"></i> Exportar
            </button>
        </nav>

        <!-- VISTA: Resumen General -->
        <div id="overview-view" class="analytics-view active">
            <!-- KPIs Principales -->
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-icon"><i class="fas fa-users"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-value" id="total-users">0</div>
                        <div class="kpi-label">Usuarios Totales</div>
                        <div class="kpi-change positive">+12% vs mes anterior</div>
                    </div>
                </div>
                
                <div class="kpi-card">
                    <div class="kpi-icon"><i class="fas fa-sign-in-alt"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-value" id="total-logins">0</div>
                        <div class="kpi-label">Inicios de Sesión</div>
                        <div class="kpi-change positive">+8% vs mes anterior</div>
                    </div>
                </div>
                
                <div class="kpi-card">
                    <div class="kpi-icon"><i class="fas fa-brain"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-value" id="total-analysis">0</div>
                        <div class="kpi-label">Análisis Realizados</div>
                        <div class="kpi-change positive">+25% vs mes anterior</div>
                    </div>
                </div>
                
                <div class="kpi-card">
                    <div class="kpi-icon"><i class="fas fa-clock"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-value" id="avg-session">0m</div>
                        <div class="kpi-label">Tiempo Promedio</div>
                        <div class="kpi-change neutral">Sin cambios</div>
                    </div>
                </div>
            </div>

            <!-- Gráficos -->
            <div class="charts-grid">
                <!-- Gráfico de línea: Actividad en el tiempo -->
                <div class="chart-container">
                    <h3>Actividad en el Tiempo</h3>
                    <canvas id="activity-chart"></canvas>
                </div>
                
                <!-- Gráfico de barras: Análisis por tipo -->
                <div class="chart-container">
                    <h3>Análisis por Tipo</h3>
                    <canvas id="analysis-type-chart"></canvas>
                </div>
                
                <!-- Gráfico circular: Distribución de planes -->
                <div class="chart-container small">
                    <h3>Distribución de Planes</h3>
                    <canvas id="plans-chart"></canvas>
                </div>
                
                <!-- Gráfico de barras: Top features -->
                <div class="chart-container small">
                    <h3>Features Más Usadas</h3>
                    <canvas id="features-chart"></canvas>
                </div>
            </div>

            <!-- Tabla resumen -->
            <div class="summary-table">
                <h3>Métricas Detalladas</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Métrica</th>
                            <th>Total</th>
                            <th>Promedio por Usuario</th>
                            <th>Tendencia</th>
                        </tr>
                    </thead>
                    <tbody id="metrics-table-body">
                        <!-- Generado dinámicamente -->
                    </tbody>
                </table>
            </div>
        </div>

        <!-- VISTA: Por Empresa -->
        <div id="empresas-view" class="analytics-view">
            <!-- Filtro de empresas -->
            <div class="filters-bar">
                <input type="text" id="empresa-search" placeholder="Buscar empresa...">
                <select id="empresa-sort">
                    <option value="users">Por # Usuarios</option>
                    <option value="activity">Por Actividad</option>
                    <option value="analysis">Por Análisis</option>
                </select>
            </div>

            <!-- Grid de empresas -->
            <div class="empresas-grid">
                <!-- Tarjetas de empresa generadas dinámicamente -->
            </div>

            <!-- Modal de detalle de empresa -->
            <div id="empresa-detail-modal" class="modal" style="display: none;">
                <div class="modal-content">
                    <span class="close">&times;</span>
                    <h2 id="empresa-name"></h2>
                    
                    <!-- KPIs de la empresa -->
                    <div class="empresa-kpis">
                        <!-- Similar a KPIs generales pero para empresa específica -->
                    </div>
                    
                    <!-- Tabla de usuarios de la empresa -->
                    <div class="empresa-users-table">
                        <h3>Usuarios de la Empresa</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Usuario</th>
                                    <th>Rol</th>
                                    <th>Logins</th>
                                    <th>Análisis</th>
                                    <th>Contenido</th>
                                    <th>Tiempo Total</th>
                                    <th>Última Actividad</th>
                                </tr>
                            </thead>
                            <tbody id="empresa-users-tbody">
                                <!-- Generado dinámicamente -->
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Gráficos de la empresa -->
                    <div class="empresa-charts">
                        <canvas id="empresa-activity-chart"></canvas>
                    </div>
                </div>
            </div>
        </div>

        <!-- VISTA: Por Usuario -->
        <div id="usuarios-view" class="analytics-view">
            <!-- Filtros y búsqueda -->
            <div class="filters-bar">
                <input type="text" id="user-search" placeholder="Buscar usuario...">
                <select id="user-filter-plan">
                    <option value="all">Todos los planes</option>
                    <option value="plan1">Plan Gratis</option>
                    <option value="plan2">Plan Básico</option>
                    <option value="plan3">Plan Pro</option>
                    <option value="plan4">Plan Enterprise</option>
                </select>
                <select id="user-filter-type">
                    <option value="all">Todos</option>
                    <option value="individual">Individual</option>
                    <option value="empresa">Empresa</option>
                </select>
            </div>

            <!-- Tabla de usuarios -->
            <div class="users-table-container">
                <table id="users-analytics-table">
                    <thead>
                        <tr>
                            <th>Email</th>
                            <th>Tipo</th>
                            <th>Empresa</th>
                            <th>Plan</th>
                            <th>Logins</th>
                            <th>Análisis</th>
                            <th>Contenido</th>
                            <th>Listas</th>
                            <th>Exports</th>
                            <th>Tiempo Total</th>
                            <th>Última Actividad</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="users-tbody">
                        <!-- Generado dinámicamente -->
                    </tbody>
                </table>
                
                <!-- Paginación -->
                <div class="pagination">
                    <button id="prev-page">Anterior</button>
                    <span id="page-info">Página 1 de 10</span>
                    <button id="next-page">Siguiente</button>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="/views/analytics/dashboard.js"></script>
</body>
</html>
```

### 2. JavaScript del Dashboard (`/public/views/analytics/dashboard.js`)
```javascript
// public/views/analytics/dashboard.js

class AnalyticsDashboard {
  constructor() {
    this.currentView = 'overview';
    this.currentPeriod = 'month';
    this.charts = {};
    this.metricsData = null;
    
    this.init();
  }

  async init() {
    // Inicializar event listeners
    this.setupEventListeners();
    
    // Cargar datos iniciales
    await this.loadData();
    
    // Renderizar vista inicial
    this.renderView();
  }

  setupEventListeners() {
    // Cambio de vista
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchView(e.target.dataset.view);
      });
    });
    
    // Cambio de período
    document.getElementById('period-select').addEventListener('change', async (e) => {
      this.currentPeriod = e.target.value;
      if (e.target.value === 'custom') {
        document.getElementById('custom-range').style.display = 'flex';
      } else {
        document.getElementById('custom-range').style.display = 'none';
        await this.loadData();
        this.renderView();
      }
    });
    
    // Aplicar rango personalizado
    document.getElementById('apply-range')?.addEventListener('click', async () => {
      const startDate = document.getElementById('start-date').value;
      const endDate = document.getElementById('end-date').value;
      
      if (startDate && endDate) {
        await this.loadCustomRange(startDate, endDate);
        this.renderView();
      }
    });
    
    // Exportar datos
    document.getElementById('export-btn').addEventListener('click', () => {
      this.exportData();
    });
    
    // Búsqueda en tablas
    document.getElementById('user-search')?.addEventListener('input', (e) => {
      this.filterUsers(e.target.value);
    });
    
    document.getElementById('empresa-search')?.addEventListener('input', (e) => {
      this.filterEmpresas(e.target.value);
    });
  }

  async loadData() {
    try {
      // Mostrar loader
      this.showLoader();
      
      let endpoint;
      switch (this.currentView) {
        case 'overview':
          endpoint = '/api/analytics/global-metrics';
          break;
        case 'empresas':
          endpoint = '/api/analytics/empresa-metrics';
          break;
        case 'usuarios':
          endpoint = '/api/analytics/all-users-metrics';
          break;
        default:
          endpoint = '/api/analytics/my-metrics';
      }
      
      const response = await fetch(`${endpoint}?period=${this.currentPeriod}`);
      
      if (!response.ok) {
        throw new Error('Error cargando métricas');
      }
      
      this.metricsData = await response.json();
      
    } catch (error) {
      console.error('Error loading analytics data:', error);
      this.showError('Error cargando datos de analytics');
    } finally {
      this.hideLoader();
    }
  }

  async loadCustomRange(startDate, endDate) {
    try {
      this.showLoader();
      
      const response = await fetch('/api/analytics/custom-range', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate,
          endDate,
          aggregateType: this.currentView === 'overview' ? 'global' : 'user'
        })
      });
      
      if (!response.ok) {
        throw new Error('Error cargando métricas personalizadas');
      }
      
      this.metricsData = await response.json();
      
    } catch (error) {
      console.error('Error loading custom range:', error);
      this.showError('Error cargando rango personalizado');
    } finally {
      this.hideLoader();
    }
  }

  renderView() {
    // Ocultar todas las vistas
    document.querySelectorAll('.analytics-view').forEach(view => {
      view.classList.remove('active');
    });
    
    // Mostrar vista actual
    document.getElementById(`${this.currentView}-view`).classList.add('active');
    
    // Actualizar tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.dataset.view === this.currentView) {
        tab.classList.add('active');
      }
    });
    
    // Renderizar contenido según vista
    switch (this.currentView) {
      case 'overview':
        this.renderOverview();
        break;
      case 'empresas':
        this.renderEmpresas();
        break;
      case 'usuarios':
        this.renderUsuarios();
        break;
    }
  }

  renderOverview() {
    if (!this.metricsData?.metrics) return;
    
    const { total, average_per_user } = this.metricsData.metrics;
    
    // Actualizar KPIs
    document.getElementById('total-users').textContent = total.total_users || 0;
    document.getElementById('total-logins').textContent = total.login_count || 0;
    document.getElementById('total-analysis').textContent = total.analysis_count || 0;
    document.getElementById('avg-session').textContent = 
      this.formatTime(average_per_user.avg_session_time || 0);
    
    // Renderizar gráficos
    this.renderActivityChart();
    this.renderAnalysisTypeChart();
    this.renderPlansChart();
    this.renderFeaturesChart();
    
    // Renderizar tabla de métricas
    this.renderMetricsTable();
  }

  renderActivityChart() {
    const ctx = document.getElementById('activity-chart');
    
    // Destruir gráfico existente si existe
    if (this.charts.activity) {
      this.charts.activity.destroy();
    }
    
    // Datos de ejemplo (en producción vendría del backend)
    this.charts.activity = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.generateDateLabels(),
        datasets: [{
          label: 'Logins',
          data: this.generateRandomData(30),
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1
        }, {
          label: 'Análisis',
          data: this.generateRandomData(30),
          borderColor: 'rgb(255, 99, 132)',
          tension: 0.1
        }, {
          label: 'Contenido Generado',
          data: this.generateRandomData(30),
          borderColor: 'rgb(255, 205, 86)',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
          },
          title: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  renderAnalysisTypeChart() {
    const ctx = document.getElementById('analysis-type-chart');
    
    if (this.charts.analysisType) {
      this.charts.analysisType.destroy();
    }
    
    // Datos del backend
    const analysisData = this.metricsData?.metrics?.total?.analysis_by_type || {
      resumen: 0,
      obligaciones: 0,
      riesgos: 0
    };
    
    this.charts.analysisType = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Resumen', 'Obligaciones', 'Riesgos y Oportunidades'],
        datasets: [{
          label: 'Cantidad',
          data: [
            analysisData.resumen,
            analysisData.obligaciones,
            analysisData.riesgos
          ],
          backgroundColor: [
            'rgba(75, 192, 192, 0.6)',
            'rgba(153, 102, 255, 0.6)',
            'rgba(255, 159, 64, 0.6)'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  renderMetricsTable() {
    const tbody = document.getElementById('metrics-table-body');
    const { total, average_per_user } = this.metricsData.metrics;
    
    const metrics = [
      { name: 'Inicios de Sesión', total: total.login_count, avg: average_per_user.login_count },
      { name: 'Análisis de Impacto', total: total.analysis_count, avg: average_per_user.analysis_count },
      { name: 'Generación de Contenido', total: total.content_generation_count, avg: average_per_user.content_generation_count },
      { name: 'Exports Realizados', total: total.export_count, avg: average_per_user.export_count },
      { name: 'Exports Excel Inic. Legales', total: total.export_excel_by_type?.iniciativas_legales || 0, avg: '-' },
      { name: 'Exports Excel Inic. Parl.', total: total.export_excel_by_type?.iniciativas_parlamentarias || 0, avg: '-' },
      { name: 'Tiempo en Plataforma', total: this.formatTime(total.total_session_time), avg: this.formatTime(average_per_user.avg_session_time) }
    ];
    
    tbody.innerHTML = metrics.map(metric => `
      <tr>
        <td>${metric.name}</td>
        <td>${metric.total}</td>
        <td>${typeof metric.avg === 'number' ? metric.avg.toFixed(2) : metric.avg}</td>
        <td><span class="trend positive">↑</span></td>
      </tr>
    `).join('');
  }

  renderEmpresas() {
    // Renderizar grid de empresas
    const empresasGrid = document.querySelector('.empresas-grid');
    
    // Obtener datos de empresas (mockup, en producción vendría del backend)
    const empresas = this.metricsData?.empresas || [];
    
    empresasGrid.innerHTML = empresas.map(empresa => `
      <div class="empresa-card" data-empresa="${empresa.domain}">
        <div class="empresa-header">
          <h3>${empresa.name}</h3>
          <span class="empresa-plan">Plan ${empresa.plan}</span>
        </div>
        <div class="empresa-stats">
          <div class="stat">
            <span class="stat-value">${empresa.active_users}</span>
            <span class="stat-label">Usuarios Activos</span>
          </div>
          <div class="stat">
            <span class="stat-value">${empresa.total_analysis}</span>
            <span class="stat-label">Análisis</span>
          </div>
          <div class="stat">
            <span class="stat-value">${empresa.avg_session_time}m</span>
            <span class="stat-label">Tiempo Promedio</span>
          </div>
        </div>
        <button class="btn-view-detail" onclick="dashboard.viewEmpresaDetail('${empresa.domain}')">
          Ver Detalle
        </button>
      </div>
    `).join('');
  }

  async viewEmpresaDetail(empresaDomain) {
    // Cargar detalle de empresa
    const response = await fetch(`/api/analytics/empresa-detail/${empresaDomain}`);
    const data = await response.json();
    
    // Mostrar modal con detalle
    const modal = document.getElementById('empresa-detail-modal');
    document.getElementById('empresa-name').textContent = data.empresa_name;
    
    // Renderizar tabla de usuarios
    const tbody = document.getElementById('empresa-users-tbody');
    tbody.innerHTML = data.users.map(user => `
      <tr>
        <td>${user.email}</td>
        <td>${user.permiso}</td>
        <td>${user.login_count}</td>
        <td>${user.analysis_count}</td>
        <td>${user.content_count}</td>
        <td>${this.formatTime(user.total_time)}</td>
        <td>${new Date(user.last_activity).toLocaleDateString()}</td>
      </tr>
    `).join('');
    
    modal.style.display = 'block';
  }

  renderUsuarios() {
    // Renderizar tabla de usuarios
    const tbody = document.getElementById('users-tbody');
    const users = this.metricsData?.users || [];
    
    tbody.innerHTML = users.map(user => `
      <tr>
        <td>${user.email}</td>
        <td>${user.tipo_cuenta}</td>
        <td>${user.empresa || '-'}</td>
        <td>${user.subscription_plan}</td>
        <td>${user.login_count}</td>
        <td>${user.analysis_count}</td>
        <td>${user.content_count}</td>
        <td>${user.lists_count}</td>
        <td>${user.export_count}</td>
        <td>${this.formatTime(user.total_time)}</td>
        <td>${new Date(user.last_activity).toLocaleDateString()}</td>
        <td>
          <button class="btn-view-user" onclick="dashboard.viewUserDetail('${user._id}')">
            <i class="fas fa-eye"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  async exportData() {
    try {
      const format = prompt('Formato de exportación (csv/excel):', 'csv');
      if (!format) return;
      
      const response = await fetch(`/api/analytics/export?format=${format}&type=${this.currentView}&period=${this.currentPeriod}`);
      
      if (!response.ok) {
        throw new Error('Error exportando datos');
      }
      
      // Descargar archivo
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics_${this.currentView}_${this.currentPeriod}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (error) {
      console.error('Error exporting data:', error);
      this.showError('Error exportando datos');
    }
  }

  // === HELPERS ===
  
  switchView(view) {
    this.currentView = view;
    this.loadData().then(() => this.renderView());
  }

  formatTime(seconds) {
    if (!seconds || seconds === 0) return '0m';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  generateDateLabels() {
    const labels = [];
    const today = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      labels.push(date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }));
    }
    
    return labels;
  }

  generateRandomData(count) {
    return Array.from({ length: count }, () => Math.floor(Math.random() * 100));
  }

  showLoader() {
    // Implementar loader
    console.log('Cargando...');
  }

  hideLoader() {
    // Ocultar loader
    console.log('Carga completa');
  }

  showError(message) {
    // Mostrar error con el sistema de notificaciones estándar
    console.error(message);
    alert(message); // Cambiar por modal estándar Reversa
  }

  filterUsers(searchTerm) {
    // Implementar filtrado de usuarios
    const rows = document.querySelectorAll('#users-tbody tr');
    rows.forEach(row => {
      const email = row.cells[0].textContent.toLowerCase();
      if (email.includes(searchTerm.toLowerCase())) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  }

  filterEmpresas(searchTerm) {
    // Implementar filtrado de empresas
    const cards = document.querySelectorAll('.empresa-card');
    cards.forEach(card => {
      const name = card.querySelector('h3').textContent.toLowerCase();
      if (name.includes(searchTerm.toLowerCase())) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  }
}

// Inicializar dashboard cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new AnalyticsDashboard();
});
```

#### Agregaciones de lectura (ejemplo) para Excel exports por tipo
```javascript
// Ejemplo de pipeline (user/empresa/global) filtrando Excel de iniciativas
const pipeline = [
  { $match: {
      event_type: 'export',
      'event_metadata.export_format': 'xlsx',
      'event_metadata.export_type': { $in: ['iniciativas_legales', 'iniciativas_parlamentarias'] },
      ...this.getPeriodFilter(period),
      ...(scope.userIds ? { user_id: { $in: scope.userIds } } : {})
    }
  },
  { $group: {
      _id: '$event_metadata.export_type',
      count: { $sum: 1 }
    }
  }
];
```

### 3. Estilos CSS (`/public/styles/analytics-dashboard.css`)
```css
/* public/styles/analytics-dashboard.css */

.analytics-container {
  padding: 20px;
  background: #f5f7fa;
  min-height: 100vh;
}

/* Navegación */
.analytics-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 15px 20px;
  border-radius: 10px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.nav-tabs {
  display: flex;
  gap: 10px;
}

.nav-tab {
  padding: 10px 20px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  font-weight: 500;
}

.nav-tab.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: transparent;
}

.nav-tab:hover:not(.active) {
  background: #f0f0f0;
}

/* KPI Cards */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.kpi-card {
  background: white;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  gap: 15px;
}

.kpi-icon {
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 24px;
}

.kpi-value {
  font-size: 32px;
  font-weight: bold;
  color: #333;
}

.kpi-label {
  color: #666;
  margin-top: 5px;
}

.kpi-change {
  font-size: 12px;
  margin-top: 5px;
}

.kpi-change.positive {
  color: #10b981;
}

.kpi-change.negative {
  color: #ef4444;
}

.kpi-change.neutral {
  color: #6b7280;
}

/* Gráficos */
.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.chart-container {
  background: white;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.chart-container.small {
  grid-column: span 1;
  max-height: 300px;
}

.chart-container h3 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 18px;
}

/* Tablas */
.summary-table {
  background: white;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.summary-table table {
  width: 100%;
  border-collapse: collapse;
}

.summary-table th {
  text-align: left;
  padding: 12px;
  background: #f8f9fa;
  border-bottom: 2px solid #e9ecef;
  color: #495057;
  font-weight: 600;
}

.summary-table td {
  padding: 12px;
  border-bottom: 1px solid #e9ecef;
}

/* Vista Empresas */
.empresas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.empresa-card {
  background: white;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  transition: transform 0.3s;
}

.empresa-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
}

.empresa-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.empresa-plan {
  background: #667eea;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.empresa-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 15px;
}

.stat {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: bold;
  color: #333;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-top: 5px;
}

/* Modal */
.modal {
  position: fixed;
  z-index: 1000;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0,0,0,0.4);
}

.modal-content {
  background-color: #fefefe;
  margin: 5% auto;
  padding: 20px;
  border: 1px solid #888;
  width: 80%;
  max-width: 1200px;
  border-radius: 10px;
  max-height: 80vh;
  overflow-y: auto;
}

.close {
  color: #aaa;
  float: right;
  font-size: 28px;
  font-weight: bold;
  cursor: pointer;
}

.close:hover,
.close:focus {
  color: black;
}

/* Responsive */
@media (max-width: 768px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
  
  .charts-grid {
    grid-template-columns: 1fr;
  }
  
  .empresas-grid {
    grid-template-columns: 1fr;
  }
  
  .analytics-nav {
    flex-direction: column;
    gap: 15px;
  }
  
  .nav-tabs {
    width: 100%;
    justify-content: space-around;
  }
}
```

---

## 🚀 PLAN DE IMPLEMENTACIÓN POR FASES

### FASE 1: Infraestructura Base (2-3 días)
1. ✅ Crear colecciones MongoDB (`analytics_events`, `analytics_aggregates`)
2. ✅ Implementar servicio base (`services/analytics.service.js`)
3. ✅ Crear middleware de tracking (`middleware/analytics.middleware.js`)
4. ✅ Configurar índices MongoDB (`scripts/create_analytics_indexes.js`)
5. ✅ Wire en `app.js` (sessionTimeTracker + trackPageView)
6. ✅ Tests básicos/linter sin errores

### FASE 2: Integración con Endpoints (3-4 días)
1. ✅ Integrar tracking en login/logout
2. ✅ Integrar tracking en análisis de normativa
3. ✅ Integrar tracking en generación de contenido
4. ✅ Integrar tracking en gestión de listas
5. ✅ Integrar tracking en exports
6. ✅ Añadir tracking de tiempo de sesión

### FASE 3: API de Analytics (2-3 días)
1. ✅ Implementar router de analytics
2. ✅ Endpoints de métricas por usuario
3. ✅ Endpoints de métricas empresariales
4. ✅ Endpoints de métricas globales
5. ✅ Sistema de caché para agregaciones
6. ✅ Exportación de datos

### FASE 4: Integración UI en Dashboard Interno (3-4 días)
1. ✅ Añadir pestaña "Analytics" en `public/views/internal/dashboard_interno.html`
2. ✅ Crear módulo `public/views/internal/analytics_internal.js` (overview/empresas/usuarios)
3. ✅ Integrar Chart.js y wiring de eventos/períodos (custom range incluido)
4. ✅ Renderizar KPIs, gráficos y tabla de métricas en panel interno
5. ✅ Mostrar contadores de exports Excel por tipo (legales/parlamentarias)
6. ✅ Añadir estilos `public/styles/analytics-internal.css` (responsive)
7. ✅ Export opcional de métricas desde el panel interno

### FASE 5: Optimización y Testing (2-3 días)
1. ✅ Optimizar queries de agregación
2. ✅ Implementar sistema de caché
3. ✅ Tests de integración
4. ✅ Tests de carga
5. ✅ Documentación

### FASE 6: Deployment y Monitoreo (1-2 días)
1. ✅ Deploy a producción
2. ✅ Configurar alertas
3. ✅ Monitoreo inicial
4. ✅ Ajustes según feedback

---

## 📋 CHECKLIST DE IMPLEMENTACIÓN

### Backend
- [ ] Crear archivo `services/analytics.service.js`
- [ ] Crear archivo `middleware/analytics.middleware.js`
- [ ] Crear archivo `routes/analytics.routes.js`
- [ ] Añadir router en `app.js`
- [ ] Integrar tracking en `routes/auth.routes.js`
- [ ] Integrar tracking en `routes/normativa.routes.js`
- [ ] Integrar tracking en `routes/generacioncontenido.routes.js`
- [ ] Integrar tracking en `routes/listas.routes.js`
- [ ] Integrar tracking en `routes/profile.routes.js`
- [ ] Crear índices MongoDB via script
- [ ] Añadir endpoint `POST /api/analytics/track-export-iniciativas`
- [ ] Actualizar `analytics.service.js` con incrementos `export_excel_by_type` y `export_excel_count`
- [ ] Añadir índices por `event_metadata.export_type` y `event_metadata.export_format`

### Frontend
- [ ] Añadir pestaña "Analytics" en `public/views/internal/dashboard_interno.html`
- [ ] Crear `public/views/internal/analytics_internal.js`
- [ ] Incluir `<script src="/views/internal/analytics_internal.js"></script>` en `dashboard_interno.html`
- [ ] Crear `public/styles/analytics-internal.css`
- [ ] Integrar Chart.js (ya presente en `dashboard_interno.html`)
- [ ] Renderizar KPIs/series/tabla en el panel interno
- [ ] Instrumentar `iniciativas_legales.js` para track de export XLSX (filas y filtros)
- [ ] Instrumentar `iniciativas_parlamentarias.js` para track de export XLSX (filas y filtros)

### Testing
- [ ] Tests unitarios del servicio
- [ ] Tests de integración de endpoints
- [ ] Tests de rendimiento de agregaciones
- [ ] Tests del dashboard

### Documentación
- [ ] Documentar API de analytics
- [ ] Guía de uso del dashboard
- [ ] Documentar métricas disponibles

---

## 🎯 MÉTRICAS DE ÉXITO

1. **Performance**: Queries de agregación < 2 segundos
2. **Precisión**: 100% de eventos trackeados correctamente
3. **Disponibilidad**: Dashboard disponible 99.9% del tiempo
4. **Adopción**: 80% de admins usando el dashboard regularmente
5. **Valor**: Decisiones basadas en datos mejoran KPIs en 20%

---

## 📝 NOTAS ADICIONALES

### Consideraciones de Privacidad
- Cumplir con GDPR/LOPD
- Anonimizar datos sensibles
- Permitir opt-out de tracking
- Período de retención de datos (ej: 2 años)

### Escalabilidad
- Considerar mover a ClickHouse o TimescaleDB si el volumen crece
- Implementar particionado de colecciones por fecha
- Usar Redis para caché de agregaciones frecuentes

### Mejoras Futuras
1. Dashboard en tiempo real con WebSockets
2. Alertas automáticas por anomalías
3. Predicciones con ML
4. Integración con herramientas externas (Google Analytics, Mixpanel)
5. A/B testing framework
6. Heatmaps de uso de features
7. Análisis de cohorts
8. Funnel analysis

---

**📅 Tiempo Total Estimado: 13-17 días**

**🚀 Listo para implementación siguiendo este plan detallado**
