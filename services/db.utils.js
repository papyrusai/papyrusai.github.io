const { MongoClient } = require('mongodb');

// Connection pool configuration
let mongoClient = null;
const mongodbOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4 // Use IPv4, skip trying IPv6
};

/**
 * Get or create MongoDB client instance
 * @returns {Promise<MongoClient>} Connected MongoDB client
 */
async function getMongoClient() {
  if (!mongoClient) {
    try {
      mongoClient = new MongoClient(process.env.DB_URI, mongodbOptions);
      await mongoClient.connect();
      console.log('✅ MongoDB client connected with connection pool');
      
      // Handle connection events
      mongoClient.on('connectionPoolCreated', () => {
        console.log('📊 MongoDB connection pool created');
      });
      
      mongoClient.on('connectionPoolClosed', () => {
        console.log('📊 MongoDB connection pool closed');
      });
      
      mongoClient.on('error', (error) => {
        console.error('❌ MongoDB client error:', error.message);
      });
      
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error.message);
      throw error;
    }
  }
  return mongoClient;
}

/**
 * Get database instance
 * @param {string} dbName - Database name (default: 'papyrus')
 * @returns {Promise<Db>} Database instance
 */
async function getDatabase(dbName = 'papyrus') {
  const client = await getMongoClient();
  return client.db(dbName);
}

/**
 * Execute a database operation with proper error handling
 * @param {Function} operation - Async function that receives the database instance
 * @param {string} dbName - Database name (default: 'papyrus')
 * @returns {Promise<any>} Operation result
 */
async function withDatabase(operation, dbName = 'papyrus') {
  try {
    const db = await getDatabase(dbName);
    return await operation(db);
  } catch (error) {
    console.error('❌ Database operation failed:', error.message);
    throw error;
  }
}

/**
 * Gracefully close MongoDB connection
 */
async function closeMongoConnection() {
  if (mongoClient) {
    try {
      await mongoClient.close();
      mongoClient = null;
      console.log('✅ MongoDB connection closed');
    } catch (error) {
      console.error('❌ Error closing MongoDB connection:', error.message);
    }
  }
}

/**
 * Expande una lista de colecciones para incluir sus versiones de test
 * @param {string[]} collections - Array de nombres de colecciones
 * @returns {string[]} - Array expandido que incluye colecciones originales y sus versiones _test
 */
function expandCollectionsWithTest(collections) {
    const expandedCollections = [];
    
    collections.forEach(collection => {
        // Agregar la colección original
        expandedCollections.push(collection);
        
        // Agregar la versión de test si no termina ya en _test
        if (!collection.endsWith('_test')) {
            expandedCollections.push(collection + '_test');
        }
    });
    
    return expandedCollections;
}

/**
 * Verifica si una colección existe en la base de datos
 * @param {Db} database - Instancia de la base de datos MongoDB
 * @param {string} collectionName - Nombre de la colección a verificar
 * @returns {Promise<boolean>} - true si la colección existe, false en caso contrario
 */
async function collectionExists(database, collectionName) {
    try {
        const collections = await database.listCollections({ name: collectionName }).toArray();
        return collections.length > 0;
    } catch (error) {
        console.error(`Error checking if collection ${collectionName} exists:`, error);
        return false;
    }
}

/**
 * Obtiene la fecha más reciente para una colección específica
 * @param {string} collectionName - Nombre de la colección
 * @param {Db} database - Instancia de la base de datos MongoDB
 * @returns {Promise<Date|null>} - La fecha más reciente o null si no hay documentos
 */
async function getLatestDateForCollection(collectionName, database) {
    try {
        const collection = database.collection(collectionName);
        const latestDoc = await collection.findOne(
            {},
            { sort: { fecha: -1 }, projection: { fecha: 1 } }
        );
        
        return latestDoc ? latestDoc.fecha : null;
    } catch (error) {
        console.error(`Error getting latest date for collection ${collectionName}:`, error);
        return null;
    }
}

/**
 * Construye filtros de fecha para consultas MongoDB
 * @param {Date} start - Fecha de inicio (opcional)
 * @param {Date} end - Fecha de fin (opcional)
 * @returns {Array} - Array de filtros MongoDB para usar con $and
 */
function buildDateFilter(start, end) {
    const filters = [];

    // Normalizar a límites de día en UTC para coherencia entre campos anio/mes/dia y fechas Date
    let normStart = null;
    let normEnd = null;
    if (start instanceof Date && !isNaN(start.getTime())) {
        normStart = new Date(start);
        normStart.setUTCHours(0, 0, 0, 0);
    }
    if (end instanceof Date && !isNaN(end.getTime())) {
        normEnd = new Date(end);
        normEnd.setUTCHours(23, 59, 59, 999);
    }

    if (normStart) {
        filters.push({
            $or: [
                // Modelos con anio/mes/dia
                { anio: { $gt: normStart.getUTCFullYear() } },
                { anio: normStart.getUTCFullYear(), mes: { $gt: normStart.getUTCMonth() + 1 } },
                { anio: normStart.getUTCFullYear(), mes: normStart.getUTCMonth() + 1, dia: { $gte: normStart.getUTCDate() } },
                // Modelos con fecha_publicacion o fecha o datetime_insert
                { fecha_publicacion: { $gte: normStart } },
                { fecha: { $gte: normStart } },
                { datetime_insert: { $gte: normStart } }
            ]
        });
    }

    if (normEnd) {
        filters.push({
            $or: [
                // Modelos con anio/mes/dia
                { anio: { $lt: normEnd.getUTCFullYear() } },
                { anio: normEnd.getUTCFullYear(), mes: { $lt: normEnd.getUTCMonth() + 1 } },
                { anio: normEnd.getUTCFullYear(), mes: normEnd.getUTCMonth() + 1, dia: { $lte: normEnd.getUTCDate() } },
                // Modelos con fecha_publicacion o fecha o datetime_insert
                { fecha_publicacion: { $lte: normEnd } },
                { fecha: { $lte: normEnd } },
                { datetime_insert: { $lte: normEnd } }
            ]
        });
    }

    return filters;    // <- se inyecta con el spread operator …
}

module.exports = {
    getMongoClient,
    getDatabase,
    withDatabase,
    closeMongoConnection,
    expandCollectionsWithTest,
    collectionExists,
    getLatestDateForCollection,
    buildDateFilter
}; 