# 📋 PLAN DE ACCIÓN: NUEVA LÓGICA NEWSLETTER BASADA EN DATETIME_INSERT

## 🎯 OBJETIVO
Cambiar la lógica de envío de newsletters de filtrado por `anio/mes/dia` a filtrado por `datetime_insert`, implementando un sistema de logs propios de newsletter independientes de los logs ETL del backend. Los logs se guardarán en una nueva colección llamada `logs_newsletter`.

---

## 📊 ANÁLISIS PREVIO Y VALIDACIONES

### ✅ **FORTALEZAS DEL DISEÑO ACTUAL**
1. **Sistema robusto anti-duplicados** con `first_shipment`
2. **Matching por etiquetas personalizadas** bien implementado
3. **HTML generation** completo y flexible
4. **Manejo de múltiples logs ETL** funcionando correctamente

### ⚠️ **PUNTOS DE MEJORA IDENTIFICADOS**
1. **Dependencia de logs ETL**: Acoplamiento con procesos backend
2. **Filtrado por anio/mes/dia**: No preciso para timing exacto
3. **Gestión de timezone**: GMT vs GMT+2 inconsistencias
4. **Falta de métricas detalladas**: Sin estadísticas granulares

### 🔍 **VALIDACIONES TÉCNICAS REQUERIDAS**
- [ ] **Campo `datetime_insert`**: Verificar existencia en todas las colecciones
- [ ] **Formato de `datetime_insert`**: Confirmar si es Date object o string
- [ ] **Timezone de `datetime_insert`**: Verificar si está en UTC o GMT+2
- [ ] **Cobertura**: Confirmar que todos los documentos tienen este campo

---

## 🏗️ ARQUITECTURA DE LA NUEVA SOLUCIÓN

### **📋 NUEVA ESTRUCTURA DE LOGS NEWSLETTER**
```json
{
  "_id": "ObjectId",
  "datetime_run_newsletter": "2025-08-15T10:00:00.000+02:00",  // GMT+2 España
  "run_info": {
    "environment": "production",  // o "test"
    "documents_analyzed_count": 150,
    "documents_match_count": 45,
    "users_match_count": 12,
    "documents_analyzed_detail": {
      "BOE": 25,
      "BOCM": 30,
      "BORM": 20,
      "CNMV": 15,
      "MIN_INDUSTRIAYTURISMO_NOTICIAS": 10,
      // ... todas las colecciones
    },
           "users_match": {
         "tomas@reversa.ai": {
           "etiquetas_personalizadas": {
             "Compliance Financiero": {
               "CNMV": ["doc1", "doc2"],
               "BOE": ["doc3"]
             },
             "Normativa Ambiental": {
               "BOCM": ["doc4", "doc5"]
             }
           }
         },
         "user2@example.com": {
           // ... estructura similar
         }
       }
  }
}
```

### **🔄 NUEVO FLUJO DE EJECUCIÓN**
1. **Inicio Newsletter** → Crear log con `datetime_run_newsletter` (GMT+2)
2. **Buscar Log Anterior** → Último `datetime_run_newsletter` con `environment: "production"`
3. **Filtrar Documentos** → `datetime_insert` entre último run y ahora
4. **Procesar Matches** → Misma lógica etiquetas personalizadas
5. **Generar HTML** → Sin cambios
6. **Finalizar** → Guardar estadísticas detalladas en log

---

## 📝 FASES DE IMPLEMENTACIÓN

### **🎯 FASE 1: PREPARACIÓN Y VALIDACIÓN**

#### **1.1 Validación de Campos `datetime_insert`**
```javascript
// Script de validación a crear
async function validateDatetimeInsertFields(db) {
  const collections = ['BOE', 'BOCM', 'BORM', 'CNMV', 'MIN_INDUSTRIAYTURISMO_NOTICIAS'];
  
  for (const collName of collections) {
    const coll = db.collection(collName);
    
    // Verificar existencia del campo
    const withField = await coll.countDocuments({"datetime_insert": {$exists: true}});
    const total = await coll.countDocuments({});
    
    // Verificar formato
    const sampleDoc = await coll.findOne({"datetime_insert": {$exists: true}});
    
    console.log(`${collName}: ${withField}/${total} docs con datetime_insert`);
    console.log(`Formato: ${typeof sampleDoc?.datetime_insert}, Valor: ${sampleDoc?.datetime_insert}`);
  }
}
```

#### **1.2 Backup de Lógica Actual**
- [ ] Crear `newsletter_backup.js` con lógica actual
- [ ] Documentar puntos de rollback
- [ ] Crear script de testing paralelo

### **🎯 FASE 2: IMPLEMENTACIÓN CORE**

#### **2.1 Nueva Función: `getLastNewsletterRun()`**
```javascript
async function getLastNewsletterRun(db) {
  const logsCollection = db.collection('logs_newsletter');
  
  const lastRun = await logsCollection.findOne(
    { 
      "datetime_run_newsletter": { $exists: true },
      "run_info.environment": "production"
    },
    { sort: { "datetime_run_newsletter": -1 } }
  );
  
  if (lastRun) {
    return {
      exists: true,
      lastRunTime: lastRun.datetime_run_newsletter
    };
  }
  
  // Primera ejecución: día anterior a las 10:00 AM GMT+2
  const yesterday = moment().tz('Europe/Madrid').subtract(1, 'day').hour(10).minute(0).second(0);
  return {
    exists: false,
    lastRunTime: yesterday.toDate()
  };
}
```

#### **2.2 Nueva Función: `getDocumentsByDatetimeInsert()`**
```javascript
async function getDocumentsByDatetimeInsert(db, fromDateTime, toDateTime) {
  const allCollections = await db.listCollections().toArray();
  const excludedCollections = ['logs', 'Feedback', 'Ramas boja', 'Ramas UE', 'users'];
  
  const documentsAnalyzedDetail = {};
  const allDocuments = [];
  
  for (const collection of allCollections) {
    const collectionName = collection.name;
    
    if (!excludedCollections.includes(collectionName) && !collectionName.endsWith('_test')) {
      try {
        const coll = db.collection(collectionName);
        const query = {
          datetime_insert: {
            $gt: fromDateTime,
            $lte: toDateTime
          }
        };
        
        const docs = await coll.find(query).toArray();
        documentsAnalyzedDetail[collectionName] = docs.length;
        
        docs.forEach(doc => {
          allDocuments.push({
            collectionName: collectionName,
            doc: doc
          });
        });
        
        console.log(`${collectionName}: ${docs.length} documentos encontrados`);
      } catch (err) {
        console.warn(`Error checking collection ${collectionName}:`, err);
        documentsAnalyzedDetail[collectionName] = 0;
      }
    } else {
      // Incluir colecciones excluidas con 0 para reporte completo
      documentsAnalyzedDetail[collectionName] = 0;
    }
  }
  
  return {
    allDocuments,
    documentsAnalyzedDetail,
    totalCount: allDocuments.length
  };
}
```

#### **2.3 Nueva Función: `determineEnvironment()`**
```javascript
function determineEnvironment(usersWithMatches) {
  // Si solo hay un usuario y es tomas@reversa.ai → test
  if (usersWithMatches.length === 1 && 
      usersWithMatches[0].email.toLowerCase() === 'tomas@reversa.ai') {
    return 'test';
  }
  return 'production';
}
```

#### **2.4 Nueva Función: `createNewsletterLog()`**
```javascript
async function createNewsletterLog(db, userStats, documentsAnalyzedDetail, totalDocsAnalyzed, totalDocsMatch) {
  const logsCollection = db.collection('logs_newsletter');
  
  // Crear timestamp en GMT+2
  const currentTime = moment().tz('Europe/Madrid').toDate();
  
  // Determinar environment
  const environment = determineEnvironment(userStats.withMatches);
  
  // Construir users_match object
  const usersMatch = {};
  for (const userStat of userStats.withMatches) {
    const userEtiquetas = {};
    
         // Procesar detailedMatches para estructura requerida
     const etiquetaGroups = new Map();
     for (const match of userStat.detailedMatches) {
       for (const etiqueta of match.matchedEtiquetas) {
         if (!etiquetaGroups.has(etiqueta)) {
           etiquetaGroups.set(etiqueta, new Map());
         }
         
         const etiquetaMap = etiquetaGroups.get(etiqueta);
         if (!etiquetaMap.has(match.collectionName)) {
           etiquetaMap.set(match.collectionName, []);
         }
         
         etiquetaMap.get(match.collectionName).push(match.docId);
       }
     }
     
     // Convertir a formato final
     for (const [etiqueta, collectionsMap] of etiquetaGroups.entries()) {
       userEtiquetas[etiqueta] = {};
       for (const [collectionName, docIds] of collectionsMap.entries()) {
         userEtiquetas[etiqueta][collectionName] = docIds;
       }
     }
    
    usersMatch[userStat.email] = {
      etiquetas_personalizadas: userEtiquetas
    };
  }
  
  const logEntry = {
    datetime_run_newsletter: currentTime,
    run_info: {
      environment: environment,
      documents_analyzed_count: totalDocsAnalyzed,
      documents_match_count: totalDocsMatch,
      users_match_count: userStats.withMatches.length,
      documents_analyzed_detail: documentsAnalyzedDetail,
      users_match: usersMatch
    }
  };
  
  try {
    const result = await logsCollection.insertOne(logEntry);
    console.log('Newsletter log created successfully:', {
      logId: result.insertedId,
      environment: environment,
      timestamp: currentTime,
      users: userStats.withMatches.length,
      documents: totalDocsMatch
    });
    
    return result.insertedId;
  } catch (err) {
    console.error('Error creating newsletter log:', err);
    throw err;
  }
}
```

### **🎯 FASE 3: INTEGRACIÓN Y TESTING**

#### **3.1 Modificación de Función Principal**
```javascript
// Reemplazar en main execution:

// ANTIGUO:
// const availableCollections = await getAvailableCollectionsToday(db);
// const firstShipmentInfo = await getFirstShipmentInfo(db);

// NUEVO:
const lastNewsletterRun = await getLastNewsletterRun(db);
const currentTime = moment().tz('Europe/Madrid').toDate();

console.log(`Filtering documents from ${lastNewsletterRun.lastRunTime} to ${currentTime}`);

const documentsData = await getDocumentsByDatetimeInsert(
  db, 
  lastNewsletterRun.lastRunTime, 
  currentTime
);

if (documentsData.totalCount === 0) {
  console.log('No new documents found since last newsletter run. Exiting...');
  await client.close();
  return;
}

console.log(`Found ${documentsData.totalCount} documents to analyze from ${Object.keys(documentsData.documentsAnalyzedDetail).length} collections`);
```

#### **3.2 Script de Testing Paralelo**
```javascript
// newsletter_test.js - Para validar nueva lógica
async function compareOldVsNewLogic(db) {
  // Ejecutar lógica antigua
  const oldResults = await getDocumentsOldWay(db);
  
  // Ejecutar lógica nueva  
  const newResults = await getDocumentsByDatetimeInsert(db, fromDate, toDate);
  
  // Comparar resultados
  console.log('Comparison Results:');
  console.log(`Old logic: ${oldResults.length} documents`);
  console.log(`New logic: ${newResults.totalCount} documents`);
  
  // Detectar diferencias
  // ... lógica de comparación
}
```

### **🎯 FASE 4: OBSERVABILIDAD Y MONITORING**

#### **4.1 Enhanced Logging**
```javascript
// Agregar logs detallados en todo el proceso
console.log(`📊 NEWSLETTER EXECUTION STARTED`);
console.log(`⏰ Current time (GMT+2): ${moment().tz('Europe/Madrid').format()}`);
console.log(`📅 Last run: ${lastNewsletterRun.exists ? lastNewsletterRun.lastRunTime : 'First execution'}`);
console.log(`📈 Documents found: ${documentsData.totalCount}`);
console.log(`👥 Users processed: ${filteredUsers.length}`);
console.log(`✅ Users with matches: ${userStats.withMatches.length}`);
console.log(`📝 Environment: ${environment}`);
```

#### **4.2 Métricas de Performance**
```javascript
const performanceStart = Date.now();

// ... ejecución del newsletter

const performanceEnd = Date.now();
const executionTime = performanceEnd - performanceStart;

console.log(`⚡ Newsletter executed in ${executionTime}ms`);
```

---

## ⚠️ RIESGOS Y MITIGACIONES

### **🚨 RIESGOS IDENTIFICADOS**

1. **Campo `datetime_insert` inexistente**
   - **Mitigación**: Script de validación previo + fallback a lógica actual

2. **Formato de timezone inconsistente**
   - **Mitigación**: Normalización explícita con moment.tz()

3. **Performance con muchos documentos**
   - **Mitigación**: Índices en `datetime_insert` + paginación si es necesario

4. **Pérdida de documentos en transición**
   - **Mitigación**: Período de overlap + testing exhaustivo

### **🛡️ ESTRATEGIAS DE ROLLBACK**

1. **Rollback Inmediato**: Restaurar `newsletter_backup.js`
2. **Rollback Gradual**: Ejecutar ambas lógicas en paralelo
3. **Rollback de Logs**: Limpiar logs de newsletter si es necesario

---

## 📋 CHECKLIST DE IMPLEMENTACIÓN

### **Pre-implementación**
- [ ] Validar campo `datetime_insert` en todas las colecciones
- [ ] Verificar formato y timezone de `datetime_insert`
- [ ] Crear backup completo de lógica actual
- [ ] Preparar scripts de testing

### **Implementación**
- [ ] Implementar `getLastNewsletterRun()`
- [ ] Implementar `getDocumentsByDatetimeInsert()`
- [ ] Implementar `determineEnvironment()`
- [ ] Implementar `createNewsletterLog()`
- [ ] Modificar función principal

### **Testing**
- [ ] Testing con usuario único (tomas@reversa.ai → environment: test)
- [ ] Testing con múltiples usuarios (environment: production)
- [ ] Validar estructura de logs generados
- [ ] Comparar resultados old vs new logic

### **Deployment**
- [ ] Testing en entorno de desarrollo
- [ ] Testing con datos reales
- [ ] Monitoring de primera ejecución en producción
- [ ] Validación de métricas y logs

### **Post-implementación**
- [ ] Verificar logs de newsletter se crean correctamente
- [ ] Confirmar timezone GMT+2 correcto
- [ ] Validar estadísticas detalladas
- [ ] Monitorear performance

---

## 🎯 RESULTADO ESPERADO

**Nuevo sistema de newsletter que:**
1. ✅ **Independiente** de logs ETL backend
2. ✅ **Preciso** con filtrado por `datetime_insert`
3. ✅ **Timezone correcto** GMT+2 España
4. ✅ **Métricas detalladas** completas
5. ✅ **Sin duplicados** garantizado
6. ✅ **Mismo HTML** y matching de etiquetas
7. ✅ **Environment detection** automático
8. ✅ **Observabilidad** completa

**Este plan asegura una transición robusta y controlada hacia la nueva lógica de newsletter.**

---

## 🧪 PRÓXIMOS PASOS - TESTING Y VALIDACIÓN

### **🎯 FASE DE TESTING INMEDIATA**

#### **✅ IMPLEMENTACIÓN COMPLETADA**
- [x] **Nuevas funciones agregadas**: getLastNewsletterRun, getDocumentsByDatetimeInsert, determineEnvironment, createNewsletterLog
- [x] **Lógica principal modificada**: Reemplazada lógica de anio/mes/dia por datetime_insert
- [x] **Dependencias instaladas**: moment-timezone agregado
- [x] **Nueva colección**: logs_newsletter configurada
- [x] **Timezone configurado**: GMT+2 España implementado

#### **🔍 PASO 1: VALIDACIÓN DE CAMPO `datetime_insert`**

**Objetivo**: Confirmar que todas las colecciones tienen el campo `datetime_insert`

**Ejecutar**:
```javascript
// Agregar esta función temporal al newsletter.js para testing
async function validateDatetimeInsertFields(db) {
  const collections = ['BOE', 'BOCM', 'BORM', 'CNMV', 'MIN_INDUSTRIAYTURISMO_NOTICIAS'];
  
  for (const collName of collections) {
    try {
      const coll = db.collection(collName);
      
      // Verificar existencia del campo
      const withField = await coll.countDocuments({"datetime_insert": {$exists: true}});
      const total = await coll.countDocuments({});
      
      // Verificar formato de los últimos documentos
      const sampleDocs = await coll.find({"datetime_insert": {$exists: true}}).sort({_id: -1}).limit(3).toArray();
      
      console.log(`📊 ${collName}:`);
      console.log(`   - Documentos con datetime_insert: ${withField}/${total} (${(withField/total*100).toFixed(1)}%)`);
      
      if (sampleDocs.length > 0) {
        const sample = sampleDocs[0];
        console.log(`   - Formato: ${typeof sample.datetime_insert}`);
        console.log(`   - Ejemplo: ${sample.datetime_insert}`);
        console.log(`   - Timezone: ${moment(sample.datetime_insert).format('YYYY-MM-DD HH:mm:ss Z')}`);
      }
      console.log('');
    } catch (err) {
      console.error(`❌ Error checking ${collName}:`, err);
    }
  }
}

// Llamar desde la función principal temporalmente
await validateDatetimeInsertFields(db);
```

**Criterio de éxito**: Todas las colecciones principales deben tener >95% de documentos con `datetime_insert`

#### **🔍 PASO 2: TESTING CON USUARIO DE PRUEBA**

**Objetivo**: Probar la nueva lógica solo con tomas@reversa.ai

**Configuración actual en línea 2336**:
```javascript
const filteredUsers = allUsers.filter(u => u.email && u.email.toLowerCase() === 'tomas@reversa.ai');
```

**✅ Ya configurado correctamente para testing**

**Ejecutar**: `node newsletter.js`

**Verificaciones esperadas**:
1. ✅ **Environment detection**: Should be 'test' (solo un usuario)
2. ✅ **Datetime filtering**: Documentos desde última ejecución
3. ✅ **New log creation**: Entrada en `logs_newsletter` collection
4. ✅ **Timezone correct**: GMT+2 timestamps
5. ✅ **Statistics accurate**: Conteos correctos

#### **🔍 PASO 3: VERIFICAR LOGS CREADOS**

**Después del test, verificar en MongoDB**:
```javascript
// Verificar log creado
db.logs_newsletter.find().sort({datetime_run_newsletter: -1}).limit(1)

// Verificar estructura
{
  "datetime_run_newsletter": "2025-08-15T12:30:00.000+02:00",
  "run_info": {
    "environment": "test",
    "documents_analyzed_count": 150,
    "documents_match_count": 25,
    "users_match_count": 1,
    "documents_analyzed_detail": {
      "BOE": 50,
      "BOCM": 30,
      // ...
    },
    "users_match": {
      "tomas@reversa.ai": {
        "etiquetas_personalizadas": {
          "Compliance Financiero": {
            "CNMV": ["doc1", "doc2"],
            "BOE": ["doc3"]
          }
        }
      }
    }
  }
}
```

#### **🔍 PASO 4: TESTING DE MÚLTIPLES EJECUCIONES**

**Objetivo**: Verificar que no haya duplicados en ejecuciones consecutivas

**Proceso**:
1. **Primera ejecución**: `node newsletter.js`
2. **Esperar 2 minutos**
3. **Segunda ejecución**: `node newsletter.js`

**Resultado esperado**: 
- Primera ejecución: Procesa documentos, envía emails
- Segunda ejecución: "📭 No new documents found since last newsletter run. Exiting..."

#### **🔍 PASO 5: TESTING CON MÚLTIPLES USUARIOS**

**Solo después de validar pasos 1-4**:

**Modificar línea 2336**:
```javascript
// Cambiar de:
const filteredUsers = allUsers.filter(u => u.email && u.email.toLowerCase() === 'tomas@reversa.ai');

// A usuarios de testing específicos:
const testUsers = ['tomas@reversa.ai', 'mamartinez@maz.es', 'pruebagap@gmail.com'];
const filteredUsers = allUsers.filter(u => u.email && testUsers.includes(u.email.toLowerCase()));
```

**Verificar**:
- Environment = 'production' (múltiples usuarios)
- Logs con estructura completa de users_match
- Email generation correcto

#### **🔍 PASO 6: TESTING DE ROLLBACK (SI ES NECESARIO)**

**Si hay problemas**:

1. **Restaurar newsletter.js original**:
   ```bash
   cp newsletter_backup.js newsletter.js
   ```

2. **Limpiar logs de testing**:
   ```javascript
   db.logs_newsletter.deleteMany({
     "run_info.environment": "test"
   })
   ```

### **⚠️ CRITERIOS DE VALIDACIÓN**

#### **🟢 CRITERIOS DE ÉXITO**:
- [ ] Campo `datetime_insert` existe en >95% documentos
- [ ] Testing con usuario único funciona correctamente
- [ ] Environment detection funciona (test/production)
- [ ] Logs se crean en `logs_newsletter` con estructura correcta
- [ ] Timezone GMT+2 correcto en todos los timestamps
- [ ] Sin duplicados en ejecuciones consecutivas
- [ ] Estadísticas precisas y detalladas
- [ ] HTML generation sin cambios

#### **🔴 CRITERIOS DE FALLO**:
- Campo `datetime_insert` falta en >5% documentos → **ROLLBACK**
- Errores en timezone → **ROLLBACK**
- Logs mal estructurados → **ROLLBACK**
- Emails duplicados → **ROLLBACK**
- Performance >5x más lenta → **ROLLBACK**

### **📋 CHECKLIST DE TESTING**

#### **Pre-Testing**
- [ ] Backup del newsletter.js original creado
- [ ] moment-timezone instalado correctamente
- [ ] MongoDB accesible

#### **Testing Básico**
- [ ] Ejecutar validación de `datetime_insert`
- [ ] Testing con usuario único (tomas@reversa.ai)
- [ ] Verificar logs en `logs_newsletter`
- [ ] Verificar environment = 'test'
- [ ] Verificar timezone GMT+2

#### **Testing Avanzado**
- [ ] Testing de múltiples ejecuciones (sin duplicados)
- [ ] Testing con múltiples usuarios
- [ ] Verificar environment = 'production'
- [ ] Verificar estructura users_match completa

#### **Testing de Performance**
- [ ] Comparar tiempo de ejecución vs lógica anterior
- [ ] Verificar memory usage
- [ ] Verificar database queries count

#### **Testing de Funcionalidad**
- [ ] Emails generados correctamente
- [ ] Matching de etiquetas sin cambios
- [ ] HTML structure preserved
- [ ] Reports enviados correctamente

### **🚀 RESULTADO ESPERADO POST-TESTING**

Una vez completados todos los tests exitosamente:

1. **Sistema newsletter independiente** de logs ETL backend
2. **Filtrado preciso** por `datetime_insert`
3. **Logs detallados** en `logs_newsletter`
4. **Environment detection** automático
5. **Timezone GMT+2** consistente
6. **Sin duplicados** garantizado
7. **Performance** mantenida o mejorada
8. **Funcionalidad** preservada completamente

**¡Lista para deploy en producción con usuarios reales!** 🎯
