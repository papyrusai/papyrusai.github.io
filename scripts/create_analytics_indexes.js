// scripts/create_analytics_indexes.js
// Ejecuta este script una vez para crear los índices necesarios de analytics

require('dotenv').config();
const { getDatabase, closeMongoConnection } = require('../services/db.utils');

(async () => {
  try {
    const db = await getDatabase();

    const events = db.collection('analytics_events');
    const aggregates = db.collection('analytics_aggregates');

    console.log('Creating indexes for analytics_events...');
    await events.createIndex({ user_id: 1, timestamp: -1 });
    await events.createIndex({ empresa: 1, timestamp: -1 });
    await events.createIndex({ event_type: 1, timestamp: -1 });
    await events.createIndex({ date_day: 1 });
    await events.createIndex({ date_month: 1 });
    await events.createIndex({ session_id: 1 });
    await events.createIndex({ event_type: 1, 'event_metadata.export_type': 1, timestamp: -1 });
    await events.createIndex({ event_type: 1, 'event_metadata.export_format': 1, timestamp: -1 });

    console.log('Creating indexes for analytics_aggregates...');
    await aggregates.createIndex({ aggregate_type: 1, aggregate_id: 1, period_type: 1, period_value: 1 }, { unique: true });

    console.log('✅ Analytics indexes created.');
  } catch (err) {
    console.error('Error creating analytics indexes:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await closeMongoConnection();
  }
})();


