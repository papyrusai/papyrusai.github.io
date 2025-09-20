// services/analytics.service.js
// Servicio base de analytics: inserción de eventos y actualización incremental de agregados

const { ObjectId } = require('mongodb');
const { getDatabase } = require('./db.utils');

class AnalyticsService {
  constructor() {
    this.eventsCollection = 'analytics_events';
    this.aggregatesCollection = 'analytics_aggregates';
  }

  async getDb() {
    return getDatabase();
  }

  async getUserContext(userId) {
    try {
      const db = await this.getDb();
      const user = await db.collection('users').findOne({ _id: new ObjectId(userId) }, {
        projection: {
          email: 1,
          tipo_cuenta: 1,
          empresa: 1,
          estructura_empresa_id: 1,
          subscription_plan: 1
        }
      });
      return user || {};
    } catch (error) {
      console.error('Error getting user context for analytics:', error?.message || error);
      return {};
    }
  }

  checkWithinLimits() {
    // Implementación simple: no bloquea por límites en esta fase
    return true;
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
        user_id: typeof userId === 'string' ? new ObjectId(userId) : userId,
        user_email: user.email || null,
        tipo_cuenta: user.tipo_cuenta || 'individual',
        empresa: user.empresa || null,
        empresa_id: user.estructura_empresa_id || null,

        event_type: eventType,
        event_category: eventCategory,
        event_action: eventAction,
        event_value: eventValue,
        event_metadata: metadata || {},

        session_id: sessionId || req?.session?.id || null,
        ip_address: req?.ip || null,
        user_agent: req?.get ? req.get('user-agent') : null,
        referrer: req?.get ? req.get('referrer') : null,

        timestamp: now,
        date_day: this.formatDate(now, 'day'),
        date_week: this.formatDate(now, 'week'),
        date_month: this.formatDate(now, 'month'),
        date_year: now.getFullYear(),
        hour_of_day: now.getHours(),
        day_of_week: now.getDay(),

        subscription_plan: user.subscription_plan || null,
        within_limits: this.checkWithinLimits(user, eventType),

        created_at: now,
        updated_at: now
      };

      await db.collection(this.eventsCollection).insertOne(event);

      // Actualizar agregados de forma asíncrona (no bloqueante)
      this.updateAggregates(event.user_id, event.empresa, event).catch((err) => {
        console.error('Analytics updateAggregates error:', err?.message || err);
      });

      return { success: true };
    } catch (error) {
      console.error('Error tracking event:', error?.message || error);
      // Nunca romper la app por analytics
      return { success: false, error: error?.message || String(error) };
    }
  }

  async trackSessionTime(userId, sessionId, startTime, endTime) {
    const duration = Math.max(0, Math.floor((new Date(endTime) - new Date(startTime)) / 1000));
    return this.trackEvent({
      userId,
      eventType: 'session_time',
      eventCategory: 'session',
      eventAction: 'session_duration',
      eventValue: duration,
      metadata: { start_time: startTime, end_time: endTime, duration_seconds: duration },
      sessionId
    });
  }

  // === AGREGACIONES INCREMENTALES ===
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
      { aggregate_type: 'user', aggregate_id: String(userId) },
      ...(empresa ? [{ aggregate_type: 'empresa', aggregate_id: empresa }] : []),
      { aggregate_type: 'global', aggregate_id: 'global' }
    ];

    const isExport = event?.event_type === 'export';
    const isExcel = event?.event_metadata?.export_format === 'xlsx';
    const exportType = event?.event_metadata?.export_type; // iniciativas_legales | iniciativas_parlamentarias | ...

    const inc = {
      total_events: 1,
      login_count: event?.event_type === 'login' ? 1 : 0,
      analysis_count: event?.event_type === 'analysis' ? 1 : 0,
      content_generation_count: event?.event_type === 'content_generation' ? 1 : 0,
      export_count: isExport ? 1 : 0,
      total_session_time: event?.event_type === 'session_time' ? (event?.event_value || 0) : 0
    };

    if (isExport && exportType) {
      inc[`export_by_type.${exportType}`] = 1;
      if (isExcel) {
        inc['export_excel_count'] = 1;
        inc[`export_excel_by_type.${exportType}`] = 1;
      }
    }

    for (const p of periods) {
      for (const t of targets) {
        await db.collection(this.aggregatesCollection).updateOne(
          { ...t, period_type: p.type, period_value: p.value },
          { $inc: inc, $set: { updated_at: now }, $setOnInsert: { created_at: now, metrics: {} } },
          { upsert: true }
        );
      }
    }
  }

  // === HELPERS ===
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
        return d.toISOString();
    }
  }

  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }
}

module.exports = new AnalyticsService();


