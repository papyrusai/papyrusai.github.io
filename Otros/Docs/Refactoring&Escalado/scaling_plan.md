## 1) Análisis de la situación (tech stack actual)

### Backend: Node.js + Express
- **Descripción**: Node.js utiliza un modelo de **single-threaded event loop** con **I/O no bloqueante**, que significa que puede manejar múltiples conexiones concurrentes sin crear hilos adicionales para cada request. Express proporciona la capa de routing y middleware.
- **Patrón actual**: Arquitectura modular con routers separados (`routes/*.routes.js`) que manejan dominios específicos (auth, billing, normativa, etc.).
- **Fortalezas**: Excelente para aplicaciones I/O intensivas como APIs REST, manejo eficiente de conexiones WebSocket, y ecosistema npm robusto.
- **Limitaciones identificadas**: Al ser single-threaded, operaciones CPU-intensivas (como el procesamiento de Python) pueden bloquear el event loop, afectando la responsividad de toda la aplicación.

### Sesiones y Estado
- **Implementación actual**: Sesiones persistidas en MongoDB via `connect-mongo` con TTL de 14 días.
- **Ventaja crítica**: Esto habilita **stateless web servers**, permitiendo escalado horizontal sin "sticky sessions" (no necesita que el usuario siempre llegue al mismo servidor).
- **Patrón session-based vs JWT**: Aunque las sesiones en DB tienen overhead de lookup, proporcionan mejor control de revocación y seguridad para aplicaciones enterprise.

### Base de datos: MongoDB
- **Modelo de datos**: Base de datos NoSQL orientada a documentos, ideal para esquemas flexibles como los perfiles de usuario y documentos normativos con campos variables.
- **Patrón de conexión actual**: **CRÍTICO - ANTIPATRÓN DETECTADO**. Muchos routers crean `new MongoClient(uri)` por petición y ejecutan `connect()/close()` por request.
- **Por qué es problemático**: Cada `connect()` implica:
  - **TCP handshake** (3-way handshake): ~1-3 RTT
  - **TLS handshake** (para Atlas): ~2-4 RTT adicionales
  - **Autenticación MongoDB**: ~1 RTT
  - **Total**: 50-200ms de overhead puro + consumo de file descriptors + presión en el connection pool del servidor MongoDB.

### Pool de conexiones existente
- **Configuración actual**: `services/db.utils.js` define un pool con `maxPoolSize: 10, minPoolSize: 2`.
- **Problema**: No se utiliza consistentemente. La mayoría de routers ignoran este pool y crean conexiones adhoc.
- **Implicación**: Con 10 conexiones máximas y múltiples instancias web, se alcanza rápidamente el límite de conexiones concurrentes de MongoDB Atlas (especialmente en tiers M10-M20 con ~500-1000 max connections).

### Procesamiento de IA (Python)
- **Implementación actual**: `child_process.spawn('python', ['questionsMongo.py'])` ejecutado **síncronamente** dentro del request HTTP.
- **Problemas críticos**:
  - **Bloqueo del event loop**: Aunque spawn es asíncrono, la espera de resultado mantiene el request activo.
  - **Competencia por CPU**: Múltiples procesos Python concurrentes pueden saturar CPU y memoria.
  - **No hay backpressure**: Sin límites de concurrencia, 100 usuarios ejecutando análisis simultáneamente pueden colapsar el servidor.
  - **Timeout issues**: Procesos largos (>30s) pueden causar timeouts HTTP sin manejo graceful.

### Frontend y entrega estática
- **Patrón actual**: Express sirve archivos estáticos desde `public/`, `prompts/`, `/dist`.
- **Limitación**: El mismo proceso Node.js que maneja API también sirve estáticos, compitiendo por CPU/memoria/ancho de banda.
- **Missing**: No se observa CDN (Content Delivery Network) ni compresión optimizada.

Referencias a código:

```1:12:services/db.utils.js
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
```

## 2) Usuarios soportados (totales y concurrentes) con la estructura actual

### Metodología de cálculo
Basado en benchmarks típicos de Node.js + MongoDB y el análisis del código actual, considerando:
- **Servidor**: 1 instancia Render (~1-2 vCPU, 1-2GB RAM)
- **MongoDB**: Atlas M10-M20 (2-4GB RAM, 500-1000 max connections)
- **Patrón de tráfico**: Mix realista 90% operaciones ligeras (CRUD), 10% operaciones pesadas (IA)

### Tráfico ligero (lecturas/CRUD simples)
- **Operaciones**: Login, obtener listas, guardar documentos, navegación de perfil.
- **Throughput estimado con antipatrón actual**: 30-80 RPS
  - **Limitación principal**: Overhead de `connect()/close()` por request (50-200ms adicionales)
  - **Con pool optimizado**: 200-400 RPS posible
- **Concurrencia sostenible**: 40-120 requests simultáneas antes de degradación notable
- **Usuarios activos/día**: 500-1.500 (asumiendo 10-50 requests/usuario/sesión)

### Tráfico pesado (endpoints con Python/IA)
- **Operaciones**: `/api/analyze-norma`, `/api/generate-marketing-content`
- **Limitación crítica**: CPU-bound + sin control de concurrencia
- **Concurrencia segura actual**: 1-3 procesos Python simultáneos antes de:
  - Saturación de CPU (>80% utilization)
  - Memory pressure y posible OOM
  - Latencia degradada en endpoints ligeros
- **Throughput realista**: 10-30 ejecuciones/minuto (muy dependiente del tamaño de input y complejidad del modelo Gemini)

### Capacidad total estimada (mix realista)
- **Usuarios concurrentes efectivos**: 50-150 usuarios antes de degradación
- **Breakdown por tipo de operación**:
  - 135 usuarios haciendo operaciones ligeras (~90%)
  - 15 usuarios en cola/procesando IA (~10%)
- **Usuarios totales registrados**: 10,000+ sin problemas (limitación es concurrencia, no almacenamiento)

### Puntos de fallo identificados
1. **Saturación de conexiones DB**: Con 150 usuarios concurrentes y el antipatrón actual, se pueden agotar las conexiones disponibles en Atlas
2. **CPU starvation**: Procesos Python compitiendo con el event loop de Node.js
3. **Memory leaks potenciales**: Sin proper cleanup de procesos Python fallidos

## 3) Puntos críticos / cuellos de botella

### 1. Antipatrón de conexiones MongoDB (CRÍTICO)
- **Descripción técnica**: `new MongoClient().connect()` por request implica establecer conexión TCP, handshake TLS, y autenticación MongoDB por cada operación.
- **Impacto cuantificado**: 
  - Overhead de latencia: +50-200ms por request
  - Consumo de file descriptors: ~2-3 FDs por conexión activa
  - Presión en connection pool del servidor: reduce slots disponibles para otros requests
- **Evidencia en código**: 80+ instancias de `new MongoClient(uri)` across routers
- **Por qué es crítico**: [Como explican los expertos en escalado de Node.js](https://medium.com/@a_farag/scaling-node-js-in-production-from-startup-to-enterprise-architecture-b685deebd1fa), la gestión eficiente de conexiones de base de datos es fundamental para el rendimiento.

### 2. Procesamiento síncrono de workloads pesados
- **Descripción**: Python processes launched via `spawn()` ejecutados dentro del request HTTP path.
- **Problem técnico**: Aunque `spawn()` es no-bloqueante, el pattern de esperar resultado en el mismo request mantiene:
  - Memoria ocupada por el request context
  - Conexión HTTP abierta (consuming server resources)
  - Riesgo de timeout HTTP (typical 30-60s limits)
- **Scaling limitation**: Sin **queue-based architecture**, no hay forma de:
  - Priorizar trabajos importantes
  - Distribuir carga entre workers
  - Recuperarse de fallos de procesamiento
  - Implementar **backpressure** cuando el sistema está saturado

### 3. Falta de índices optimizados
- **Campos consultados frecuentemente sin índices**:
  - `short_name` (usado en lookups de documentos)
  - Fechas desnormalizadas `{anio, mes, dia}` (usado en filtros temporales)
  - `etiquetas_personalizadas.userId` (usado en personalization)
- **Impacto**: Con crecimiento de datos, queries pueden pasar de <10ms a >1000ms sin índices apropiados.

### 4. Entrega de contenido estático ineficiente
- **Missing CDN**: Todo el contenido estático (CSS, JS, images) se sirve desde el mismo proceso Node.js
- **Missing compression**: No se observa gzip/brotli compression habilitada
- **Impact**: En picos de tráfico, serving static content compite con CPU necesario para API logic

### 5. Ausencia de observabilidad y control de tráfico
- **Missing metrics**: No hay telemetría sobre p95/p99 latencies, error rates, throughput
- **Missing rate limiting**: Endpoints pesados no tienen protección contra abuse/DDoS
- **Missing circuit breakers**: No hay fallback mechanisms cuando servicios externos (Gemini API) fallan

## 4) Solución propuesta (corto, medio y largo plazo)

### Corto plazo (1–2 semanas) - Optimización crítica

#### 1. Migración a pool de conexiones compartido (PRIORIDAD 1)
- **Descripción técnica**: Reemplazar todas las instancias de `new MongoClient(uri).connect()` por el pattern `withDatabase()/getDatabase()` del `services/db.utils.js`.
- **Implementación específica**:
  ```javascript
  // Antes (antipatrón):
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('papyrus');
  // ... operaciones ...
  await client.close();
  
  // Después (optimizado):
  const { withDatabase } = require('../services/db.utils');
  await withDatabase(async (db) => {
    // ... operaciones ...
  });
  ```
- **Beneficio esperado**: 
  - Reducción de latencia: 50-70% en endpoints ligeros
  - Incremento de throughput: 2-3x en RPS sostenido
  - Estabilidad: eliminación de connection exhaustion
- **Ajustes de configuración**: Incrementar `maxPoolSize` a 30-50 connections

#### 2. Límites de concurrencia en endpoints pesados
- **Implementación**: Semáforo de concurrencia usando `p-limit` library:
  ```javascript
  const pLimit = require('p-limit');
  const pythonProcessLimit = pLimit(3); // máximo 3 procesos Python simultáneos
  
  router.post('/api/analyze-norma', async (req, res) => {
    try {
      const result = await pythonProcessLimit(() => executePythonAnalysis(req.body));
      res.json(result);
    } catch (error) {
      if (error.message.includes('queue full')) {
        return res.status(429).json({ error: 'Sistema saturado, intenta de nuevo' });
      }
      throw error;
    }
  });
  ```
- **Beneficio**: Previene saturación de CPU y permite que endpoints ligeros mantengan responsividad

#### 3. Índices críticos en MongoDB
- **Implementación**:
  ```javascript
  // En MongoDB shell o script de migración:
  db.users.createIndex({ email: 1 }, { unique: true });
  db.BOE.createIndex({ short_name: 1 }, { unique: true });
  db.BOE.createIndex({ anio: 1, mes: 1, dia: 1 });
  db.BOE.createIndex({ "etiquetas_personalizadas.userId": 1 });
  ```
- **Beneficio**: Queries complejas pasan de >500ms a <50ms average

#### 4. Optimización de entrega frontend
- **Compression middleware**:
  ```javascript
  const compression = require('compression');
  app.use(compression({ threshold: 1024 })); // comprimir responses >1KB
  ```
- **Cache headers optimizados**:
  ```javascript
  app.use('/public', express.static('public', {
    maxAge: '1h', // cachear estáticos 1 hora
    etag: true
  }));
  ```
- **Beneficio**: Reducción de ancho de banda 60-80%, faster load times

#### 5. Rate limiting y seguridad básica
- **Implementación**:
  ```javascript
  const rateLimit = require('express-rate-limit');
  
  // Rate limit para endpoints pesados
  const heavyEndpointsLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 5, // máximo 5 requests por minuto por IP
    message: 'Demasiadas solicitudes de análisis'
  });
  
  app.use('/api/analyze-norma', heavyEndpointsLimiter);
  app.use('/api/generate-marketing-content', heavyEndpointsLimiter);
  ```

**Estimación de usuarios concurrentes tras fase corta**: **300-500 usuarios concurrentes**
- Endpoints ligeros: ~450 usuarios (150% improvement)
- Endpoints pesados: ~50 usuarios en queue (controlled load)

### Medio plazo (1–3 meses) - Arquitectura asíncrona

#### 1. Separación de workloads pesados en workers (GAME CHANGER)
- **Arquitectura propuesta**: Queue-based processing con Redis + BullMQ
- **Descripción técnica**: [Como explican en la guía de escalado de Node.js para millones de requests](https://initjs.org/how-to-scale-a-node-api-for-millions-of-requests-per-second-the-ultimate-guide-e6f6694ad92b), separar trabajo CPU-intensivo en workers dedicados es crucial para mantener la responsividad de la API.
- **Implementación**:
  ```javascript
  // Producer (Web API):
  const Queue = require('bull');
  const analysisQueue = new Queue('document analysis', 'redis://localhost:6379');
  
  router.post('/api/analyze-norma', async (req, res) => {
    const job = await analysisQueue.add('analyze', {
      documentId: req.body.documentId,
      userPrompt: req.body.userPrompt,
      userId: req.user._id
    });
    
    res.status(202).json({ 
      jobId: job.id,
      status: 'processing',
      estimatedTime: '30-120 seconds'
    });
  });
  
  // Consumer (Worker process):
  analysisQueue.process('analyze', async (job) => {
    const result = await executePythonAnalysis(job.data);
    // Notify user via WebSocket or store result for polling
    return result;
  });
  ```
- **Beneficios críticos**:
  - **Horizontal scaling**: Workers pueden ejecutar en máquinas separadas
  - **Fault tolerance**: Jobs persisten en Redis si worker falla
  - **Prioritization**: Jobs críticos pueden tener mayor prioridad
  - **Backpressure**: API responde inmediatamente, workers procesan a su ritmo

#### 2. Escalado horizontal de la capa web
- **Implementación**: 2-3 instancias web detrás de load balancer
- **Render configuration**:
  ```yaml
  services:
    - type: web
      name: papyrus-api
      runtime: node
      scaling:
        minInstances: 2
        maxInstances: 4
        targetCPU: 70
  ```
- **Consideración crucial**: Como las sesiones viven en MongoDB, no se necesita sticky sessions
- **Beneficio**: Linear scaling de capacity para endpoints ligeros

#### 3. Capa de caché con Redis
- **Use cases específicos**:
  - Document metadata cache (norma-details): TTL 1 hora
  - User lists cache: TTL 15 minutos  
  - Processed analysis results: TTL 24 horas
- **Implementación**:
  ```javascript
  const redis = require('redis');
  const client = redis.createClient();
  
  async function getCachedNormaDetails(documentId) {
    const cached = await client.get(`norma:${documentId}`);
    if (cached) return JSON.parse(cached);
    
    const details = await fetchFromDatabase(documentId);
    await client.setex(`norma:${documentId}`, 3600, JSON.stringify(details));
    return details;
  }
  ```
- **Beneficio**: Reducción de carga en MongoDB 40-60% para read operations

#### 4. MongoDB Atlas auto-scaling habilitado
- **Configuración**: Habilitar vertical auto-scaling en Atlas
- **Thresholds recomendados**:
  - CPU > 75% por 5 minutos → scale up
  - Connections > 80% capacity → scale up
  - Memory > 85% → scale up
- **Consideración de sharding**: Si el dataset supera 100GB o throughput supera 10,000 ops/sec, considerar sharding horizontal

**Estimación de usuarios concurrentes tras fase media**: **1,500-3,000 usuarios concurrentes**
- Endpoints ligeros: ~2,700 usuarios (beneficio de caché + múltiples instancias web)
- Endpoints pesados: ~300 usuarios en workers (unlimited queue capacity)

### Largo plazo (3–12+ meses) - Arquitectura distribuida

#### 1. Microservicios por dominio
- **Separación propuesta**:
  - **API Gateway**: Routing, authentication, rate limiting
  - **User Service**: Registration, profiles, permissions  
  - **Document Service**: Normativa storage, search, metadata
  - **Analysis Service**: Python processing, ML models
  - **Notification Service**: Email, WebSocket, push notifications
- **Beneficios**:
  - **Independent scaling**: Cada servicio escala según su carga específica
  - **Technology flexibility**: Analysis service puede usar Go/Rust para mejor performance
  - **Team scalability**: Equipos independientes por servicio
  - **Fault isolation**: Falla en un servicio no afecta otros

#### 2. Sharding y distribución geográfica
- **MongoDB sharding strategy**:
  - Shard key: `collectionName + fecha` (documents)
  - Shard key: `userId` (user data)
- **Global clusters**: Réplicas en EU/US para latencia baja internacional
- **Implementación**: Atlas Global Clusters con read/write concerns optimizados

#### 3. Streaming y procesamiento en tiempo real
- **Event-driven architecture**:
  - Apache Kafka o Atlas Stream Processing
  - Events: DocumentUploaded, AnalysisCompleted, UserActivity
- **Materialized views**: Precomputar boletines diarios, trending content
- **Real-time features**: Live collaboration, instant notifications

#### 4. CDN global y edge computing
- **CDN implementation**: Cloudflare/AWS CloudFront para estáticos
- **Edge functions**: Procesamiento ligero en edge locations
- **Performance optimizations**:
  - HTTP/2 server push para critical resources
  - Service workers para offline capability
  - Progressive web app (PWA) features

#### 5. Observabilidad avanzada y SLOs
- **Distributed tracing**: Jaeger/Zipkin para seguir requests across services
- **Metrics**: Prometheus + Grafana dashboards
- **SLOs definidos**:
  - Endpoints ligeros: p95 < 200ms, p99 < 500ms
  - Endpoints pesados: 95% completion within 2 minutes
  - Availability: 99.9% uptime (8.76 hours downtime/year max)

**Estimación de usuarios concurrentes tras fase larga**: **10,000-50,000 usuarios concurrentes**
- Microservices architecture permite scaling independiente
- Edge caching reduce carga en origin servers
- Global distribution minimiza latency worldwide

---

## 5) Consideraciones sobre migración de lenguaje de programación

### ¿Es necesario migrar desde Node.js?

#### Escenarios donde Node.js sigue siendo óptimo:
- **I/O intensive workloads**: Node.js excel en aplicaciones con muchas operaciones de base de datos, API calls, file operations
- **Rapid development**: Ecosistema npm y JavaScript permiten desarrollo ágil
- **Team expertise**: Si el equipo domina JavaScript, mantener Node.js reduce risk y training costs
- **Microservices approach**: Con workers separados, los bottlenecks CPU-intensive ya están aislados

#### Casos específicos donde considerar migración:

##### 1. **Go (Golang)** - Para servicios específicos
- **Cuándo considerarlo**:
  - Document processing service (PDF parsing, text extraction)
  - Search/indexing service con alta concurrencia
  - Real-time analytics service
- **Beneficios**:
  - Goroutines proporcionan concurrencia verdadera (vs single-thread de Node)
  - Mejor performance en CPU-intensive tasks (2-5x faster)
  - Lower memory footprint (~30-50% menos RAM)
  - Excellent for high-throughput APIs (como evidencia [la guía de escalado para millones de requests](https://initjs.org/how-to-scale-a-node-api-for-millions-of-requests-per-second-the-ultimate-guide-e6f6694ad92b))
- **Desventajas**:
  - Learning curve para el equipo
  - Ecosistema menos maduro para ciertas librerías (ML, document processing)
  - Desarrollo más lento inicialmente

##### 2. **Rust** - Para workloads críticos de performance
- **Cuándo considerarlo**:
  - Analysis engine (reemplazar Python scripts)
  - Document parsing service
  - Real-time data processing
- **Beneficios**:
  - Performance comparable a C++ con memory safety
  - Zero-cost abstractions
  - Excellent concurrency model
  - Minimal runtime overhead
- **Desventajas**:
  - Steep learning curve
  - Longer development time
  - Smaller talent pool

##### 3. **Python con async/await** - Evolución gradual
- **Descripción**: Migrar scripts síncronos a FastAPI/asyncio
- **Beneficios**:
  - Mantener expertise en Python del equipo
  - Async Python puede manejar 1000s concurrent requests
  - Mejor integración con ML libraries (mantener ecosistema)
- **Cuándo es suficiente**: Si el bottleneck principal es I/O bound (database, API calls) más que CPU bound

### Recomendación estratégica:

#### Fase 1 (Próximos 6-12 meses): **Mantener Node.js**
- Implementar todas las optimizaciones propuestas (pool connections, workers, caching)
- Con estas mejoras, Node.js puede manejar **10,000-20,000 usuarios concurrentes**
- ROI: Alto (low risk, high impact)

#### Fase 2 (12-24 meses): **Migración selectiva**
- **Analysis Service → Go/Rust**: Solo si los workers de Python siguen siendo bottleneck
- **Document Processing → Go**: Si el volumen de PDFs/parsing se vuelve crítico
- **Core API → Node.js**: Mantener para operaciones CRUD y orquestación

#### Fase 3 (24+ meses): **Evaluación basada en métricas**
- Si p95 latency > 500ms de forma consistente → considerar migración completa
- Si scaling costs > 40% revenue → optimizar con lenguajes más eficientes
- Si team capacity permite → migración gradual por microservicio

### Conclusión sobre lenguajes:

**Para Papyrus AI específicamente**, la arquitectura Node.js optimizada es **suficiente para llegar a miles de usuarios** (5,000-20,000 concurrentes) sin migración de lenguaje. Los beneficios de migrar aparecen cuando:

1. **Throughput requirements** superan 50,000-100,000 RPS sostenido
2. **Cost optimization** se vuelve crítico (Go/Rust usan ~50% menos recursos)
3. **Latency requirements** exigen p95 < 50ms (Go/Rust achieve better tail latencies)

La **prioridad debe ser implementar las optimizaciones arquitecturales** (workers, caching, sharding) antes que considerar migración de lenguaje, ya que proporcionan 5-10x improvement con menor risk y cost.

---

**Resumen ejecutivo actualizado**:
- **Estado actual**: 50-150 usuarios concurrentes sostenibles
- **Corto plazo (2 semanas)**: 300-500 usuarios concurrentes con optimizaciones críticas  
- **Medio plazo (3 meses)**: 1,500-3,000 usuarios concurrentes con arquitectura asíncrona
- **Largo plazo (12 meses)**: 10,000-50,000 usuarios concurrentes con microservices
- **Migración de lenguaje**: No necesaria hasta superar 20,000 usuarios concurrentes sostenidos

Las optimizaciones arquitecturales proporcionan **orders of magnitude improvement** antes de necesitar cambio de tecnología core.
