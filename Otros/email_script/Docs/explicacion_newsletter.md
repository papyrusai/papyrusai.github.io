# NEWSLETTER.JS - EXPLICACIÓN COMPLETA (Versión datetime_insert)

## 0. Intervalo temporal analizado por ejecución (resumen práctico)

- **Variables clave**
  - **`datetime_insert` (en cada documento)**: marca temporal usada para filtrar los documentos que se analizan en cada ejecución.
  - **`logs_newsletter`**: colección de logs del newsletter de usuarios.
    - **`datetime_run_newsletter`**: fecha/hora (Date) del último envío del newsletter.
    - **`run_info.environment`**: entorno del envío (`"test"`/`"production"`).
  - **`lastRunTime` (Date)**: límite inferior del intervalo; es el valor de `logs_newsletter.datetime_run_newsletter` de la última ejecución con `run_info.environment = "production"`. Si no existe, se usa el valor por defecto indicado abajo.
  - **`currentTime` (Date)**: límite superior del intervalo; es el momento actual cuando se ejecuta el proceso.
  - **Filtro aplicado**: los documentos analizados cumplen `datetime_insert ∈ (lastRunTime, currentTime]` (exclusivo por abajo, inclusivo por arriba).
  - **Colecciones excluidas**: `['logs', 'logs_newsletter', 'Feedback', 'Ramas boja', 'Ramas UE', 'users', 'embedding_alerts', 'embedding_filter_metrics', 'tag_change_log', 'tag_embeddings']`.
  - **Zona horaria**: las marcas de tiempo se guardan y comparan en **UTC**. La visualización en horario de Madrid (`Europe/Madrid`) no altera el criterio del filtro.
  - **Relación con `logs.datetime_run` (ETL)**: esta marca temporal pertenece a los logs del proceso ETL y **no** determina el intervalo de documentos del newsletter; se usa para reportes y avisos (p.ej., advertir si no hubo webscraping o si hubo runs sin documentos).

- **Escenarios y su intervalo**

| Escenario | Condición | Desde (`lastRunTime`) | Hasta (`currentTime`) | Flags/Notas |
|----------|-----------|-----------------------|-----------------------|-------------|
| Primera ejecución (sin logs previos de `production`) | No existe entrada previa en `logs_newsletter` con `run_info.environment = "production"` | Ayer a las 10:00 (UTC) | Ahora | `isExtraVersion = false` |
| Nueva ejecución el mismo día | Existe un `datetime_run_newsletter` hoy (mismo día en UTC) | Último `datetime_run_newsletter` | Ahora | `isExtraVersion = true` (Versión Extra) |
| Día siguiente | El último `datetime_run_newsletter` es de un día anterior | Último `datetime_run_newsletter` | Ahora | `isExtraVersion = false` |
| Sin documentos nuevos | El filtro devuelve 0 documentos (`totalCount === 0`) | — | — | No se crea nueva entrada en `logs_newsletter`. La próxima ejecución volverá a usar el mismo `lastRunTime` anterior |
| Ejecución en modo `test` | Se envía solo a cuentas de prueba; el cálculo de `lastRunTime` se sigue haciendo sobre `logs_newsletter` de `production` | Último `datetime_run_newsletter` (de `production`) | Ahora | Solo cambia el `environment` del envío/log, no el intervalo |

- **Propiedades del intervalo**
  - No hay duplicados: al usar `(lastRunTime, currentTime]`, cada documento se procesa como máximo una vez.
  - Si hay múltiples ejecuciones en el mismo día, el `Desde` avanza a la última `datetime_run_newsletter`, y el `Hasta` es el instante actual.
  - Si en una ejecución no se encuentran documentos (`totalCount === 0`), no se crea log y el `Desde` no cambia para la siguiente ejecución.

## 1. NUEVA ARQUITECTURA Y LÓGICA DE FUNCIONAMIENTO

### 1.1 Cambio Fundamental: De anio/mes/dia a datetime_insert

**ANTES (Lógica antigua):**
- Filtrado por campos `anio`, `mes`, `dia`
- Dependía de logs ETL del backend
- Sin control granular de timing

**AHORA (Nueva lógica):**
- Filtrado por campo `datetime_insert` (timestamp preciso)
- Sistema independiente con colección `logs_newsletter`
- Control timezone GMT+2 España
- Detección automática de versión extra

### 1.2 Compatibilidad Enterprise (etiquetas y cobertura)

- Para cuentas con `tipo_cuenta = 'empresa'` y `estructura_empresa_id`:
  - Las coincidencias de etiquetas de documentos se evalúan contra las etiquetas de la estructura empresa, leyendo `doc.etiquetas_personalizadas[empresaId]`.
  - La cobertura legal usada para filtrar colecciones proviene de `estructura_empresa.cobertura_legal`. Si no existe, se usa la cobertura del usuario individual como fallback.
  - Selección por usuario dentro de empresa:
    - Si el usuario tiene `etiquetas_personalizadas_seleccionadas`, se envían solo los matches de esas etiquetas seleccionadas (sobre las etiquetas de la estructura empresa).
    - Si no tiene selección, se envían todos los matches de las `etiquetas_personalizadas` de la estructura empresa.
- Para cuentas individuales, se mantiene el comportamiento anterior (coincidencias con sus propias etiquetas y cobertura del propio usuario).

## 2. ESCENARIOS POSIBLES Y OUTCOMES

### 2.1 Primera Ejecución del Sistema (Sin logs newsletter previos)

**🕙 10:00 AM - Primera Ejecución**
```javascript
getLastNewsletterRun() → { exists: false, lastRunTime: "ayer 10:00 AM GMT+2" }
```
- **Documentos analizados**: Desde ayer 10:00 AM hasta ahora
- **Environment**: `test` (solo tomas@reversa.ai) o `production` (múltiples usuarios)
- **isExtraVersion**: `false`
- **Log creado**: ✅ En `logs_newsletter` con environment correspondiente
- **Emails enviados**: ✅ A usuarios filtrados según sus matches

### 2.2 Segunda Ejecución del Mismo Día (Con logs newsletter previos)

**🕙 14:00 PM - Segunda Ejecución**
```javascript
getLastNewsletterRun() → { exists: true, lastRunTime: "hoy 10:00 AM", isExtraVersion: true }
```
- **Documentos analizados**: Desde 10:00 AM hasta 14:00 PM (solo nuevos documentos)
- **Environment**: Mismo criterio (test/production)
- **isExtraVersion**: `true` (mismo día)
- **Subject email**: `"Reversa Alertas Normativas - Versión Extra — 2025-08-15"`
- **HTML message**: Incluye "Versión Extra: para cubrir boletines emitidos con retraso"
- **Log creado**: ✅ En `logs_newsletter`
- **Emails enviados**: ✅ Solo si hay documentos nuevos con matches

### 2.3 Sin Documentos Nuevos

**🕙 16:00 PM - Tercera Ejecución**
```javascript
documentsData.totalCount === 0
```
- **Mensaje**: "📭 No new documents found since last newsletter run. Exiting..."
- **Log creado**: ❌ NO se crea log (no hay actividad)
- **Emails enviados**: ❌ NO se envían emails
- **Reports**: ✅ Solo se envía collections ETL report

### 2.4 Día Siguiente (Reset de versión extra)

**🕙 10:00 AM - Nuevo Día**
```javascript
lastRunDate.isSame(currentDate, 'day') → false
```
- **isExtraVersion**: `false` (nuevo día)
- **Environment**: Según usuarios procesados
- **Log creado**: ✅ En `logs_newsletter`
- **Emails enviados**: ✅ Newsletter normal

## 3. SISTEMA DE LOGS NEWSLETTER

### 3.1 Estructura de logs_newsletter

```json
{
  "_id": "ObjectId",
  "datetime_run_newsletter": "2025-08-15T18:34:49.427+00:00", // Date object GMT+2
  "run_info": {
    "environment": "test",  // o "production"
    "documents_analyzed_count": 1184,
    "unique_documents_match_count": 85,  // Documentos únicos con matches
    "documents_match_count": 148,        // Total de matches (incluye múltiples por doc)
    "users_match_count": 1,
    "documents_analyzed_detail": {
      "BOE": 633,
      "BOCM": 70,
      "DOG": 12
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

### 3.2 Cuándo se Guarda un Log en logs_newsletter

**✅ SE GUARDA LOG cuando:**
- Hay documentos nuevos desde la última ejecución (`documentsData.totalCount > 0`)
- Se procesan usuarios y se generan estadísticas
- Al final del procesamiento exitoso

**❌ NO SE GUARDA LOG cuando:**
- No hay documentos nuevos (`documentsData.totalCount === 0`)
- Error fatal que interrumpe el procesamiento

### 3.3 Environment Detection

**`test` environment:**
```javascript
usersWithMatches.length === 1 && usersWithMatches[0].email === 'tomas@reversa.ai'
```

**`production` environment:**
```javascript
usersWithMatches.length > 1 || (usersWithMatches.length === 1 && email !== 'tomas@reversa.ai')
```

## 4. DETALLE DE FUNCIONES CLAVE

### 4.1 getLastNewsletterRun()

```javascript
// Busca último log de production en logs_newsletter
const lastRun = await logsCollection.findOne({
  "datetime_run_newsletter": { $exists: true },
  "run_info.environment": "production"
}, { sort: { "datetime_run_newsletter": -1 } });

// Detección de versión extra (mismo día GMT+2)
if (lastRunMadrid.isSame(currentDate, 'day')) {
  isExtraVersion = true;
}
```

**Returns:**
- `{ exists: false, lastRunTime: yesterdayDate, isExtraVersion: false }` (primera vez)
- `{ exists: true, lastRunTime: lastRunDate, isExtraVersion: false }` (día diferente)
- `{ exists: true, lastRunTime: lastRunDate, isExtraVersion: true }` (mismo día)

### 4.2 getDocumentsByDatetimeInsert()

```javascript
const query = {
  datetime_insert: {
    $gt: fromDateTime,      // Desde última ejecución
    $lte: toDateTime        // Hasta ahora
  }
};
```

**Colecciones excluidas:**
- `['logs', 'logs_newsletter', 'Feedback', 'Ramas boja', 'Ramas UE', 'users', 'embedding_alerts', 'embedding_filter_metrics', 'tag_change_log', 'tag_embeddings']`

**Returns:**
```javascript
{
  allDocuments: [...],                    // Array de { collectionName, doc }
  documentsAnalyzedDetail: {...},         // Conteos por colección
  totalCount: number                      // Total documentos encontrados
}
```

### 4.3 determineEnvironment()

```javascript
function determineEnvironment(usersWithMatches) {
  if (usersWithMatches.length === 1 && 
      usersWithMatches[0].email.toLowerCase() === 'tomas@reversa.ai') {
    return 'test';
  }
  return 'production';
}
```

### 4.4 createNewsletterLog()

```javascript
// Timestamp GMT+2 como Date object (compatible con logs anteriores)
const currentTimeMadrid = moment().tz('Europe/Madrid');
const currentTime = currentTimeMadrid.toDate();

// Métricas calculadas
const uniqueDocsMatch = userStats.withMatches.reduce((sum, user) => sum + user.totalDocs, 0);
const totalMatchesCount = userStats.withMatches.reduce((sum, user) => sum + user.totalMatches, 0);
```

### 4.5 Enterprise helpers y matching

```javascript
// Obtener documento empresa (cache) por estructura_empresa_id
async function getEmpresaDoc(db, estructuraEmpresaId) {
  return await db.collection('users').findOne({ _id: new ObjectId(estructuraEmpresaId), tipo_cuenta: 'estructura_empresa' });
}

// Extraer cobertura de la empresa o del usuario
function extractCoverageCollections(coverageObj) {
  const fuentesGobierno = coverageObj['fuentes-gobierno'] || coverageObj.fuentes_gobierno || coverageObj.fuentes || [];
  const fuentesReg = coverageObj['fuentes-reguladores'] || coverageObj.fuentes_reguladores || coverageObj['fuentes-regulador'] || coverageObj.reguladores || [];
  const cols = [];
  if (Array.isArray(fuentesGobierno)) cols.push(...fuentesGobierno);
  if (Array.isArray(fuentesReg)) cols.push(...fuentesReg);
  return cols.map(c => String(c).toUpperCase());
}

// Etiquetas seleccionadas por el usuario dentro de empresa (opcional)
function getSelectedEtiquetasFromUser(user) {
  const sel = user.etiquetas_personalizadas_seleccionadas || user.etiquetas_seleccionadas;
  if (!sel) return [];
  if (Array.isArray(sel)) return sel;
  if (typeof sel === 'object') return Object.keys(sel);
  if (typeof sel === 'string') return [sel];
  return [];
}

// Matching (resumen):
// - Individual → doc.etiquetas_personalizadas[userId] intersect etiquetas del usuario
// - Empresa → doc.etiquetas_personalizadas[empresaId];
//     si el usuario tiene seleccionadas → filtrar a esas; si no, incluir todas las de empresa
// - Rangos enterprise: usar empresa.rangos si existen; si no, usar user.rangos; si ambos vacíos → no filtrar por rango
```

## 5. MÉTRICAS DE MATCHES

### 5.1 Diferencia entre Métricas

**unique_documents_match_count:**
- Cuenta documentos únicos que tienen al menos un match
- Ejemplo: 1 documento con 3 etiquetas = **1**

**documents_match_count:**
- Cuenta total de matches individuales
- Ejemplo: 1 documento con 3 etiquetas = **3**

### 5.2 Cálculo por Usuario

```javascript
// Por cada usuario se calcula:
user.totalDocs = userMatchingDocsFiltered.length;  // Documentos únicos
user.totalMatches = userMatchingDocsFiltered.reduce((sum, docObj) => {
  return sum + (docObj.doc.matched_etiquetas_personalizadas || []).length;
}, 0);  // Total matches
```

## 6. CONTROL DE USUARIOS Y FILTRADO

### 6.1 Configuración de Usuarios de Prueba

```javascript
// Configuración actual para testing
const filteredUsers = allUsers.filter(u => 
  u.email && u.email.toLowerCase() === 'tomas@reversa.ai'
);

// Para testing con múltiples usuarios
const testUsers = ['tomas@reversa.ai', 'pruebagap@gmail.com'];
const filteredUsers = allUsers.filter(u => 
  u.email && testUsers.includes(u.email.toLowerCase())
);

// Para producción completa
const filteredUsers = filterUniqueEmails(allUsers);
```

### 6.2 Procesamiento por Usuario

**Filtros aplicados:**
1. **Cobertura legal**: Solo colecciones suscritas por el usuario/empresa
2. **Rangos**: Solo documentos con `rango_titulo` en `user.rangos`
3. **Etiquetas personalizadas**: Coincidencias según tipo de cuenta (individual/empresa)

**Estadísticas por usuario:**
```javascript
// Usuarios con matches
userStats.withMatches.push({
  email: user.email,
  totalDocs: uniqueDocuments,     // Documentos únicos
  totalMatches: totalMatches,     // Total matches
  uniqueEtiquetas: etiquetasCount,
  detailedMatches: [...]          // Detalles para reports
});

// Usuarios sin matches
userStats.withoutMatches.push({
  email: user.email,
  etiquetasCount: userEtiquetasCount,
  etiquetas_personalizadas: etiquetasFuente, // empresa o individual
  etiquetas_demo: user.etiquetas_demo
});
```

### 6.3 Modo Empresa: cobertura y matching de etiquetas

- Detección: `isEnterprise = (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id)`
- Identificador objetivo para matching: `targetUserId = empresa._id` (no el `user._id`)
- Cobertura de colecciones:
  - Primero se intenta `empresa.cobertura_legal` → `extractCoverageCollections()`
  - Fallback: `user.cobertura_legal`
- Matching de etiquetas:
  - Se usa `doc.etiquetas_personalizadas[targetUserId]`.
  - Si el usuario tiene `etiquetas_personalizadas_seleccionadas` → filtrar a esas etiquetas.
  - Si no, incluir todas las etiquetas de la empresa presentes en el documento.
- El conteo y detalle de estadísticas usan el catálogo de etiquetas de la empresa para usuarios enterprise.

```javascript
// Pseudocódigo
const empresa = await getEmpresaDoc(db, user.estructura_empresa_id);
const targetId = empresa._id.toString();
const docEtiq = doc.etiquetas_personalizadas?.[targetId];
const selected = getSelectedEtiquetasFromUser(user);
let keys = Object.keys(docEtiq || {});
if (selected.length) keys = keys.filter(k => selected.includes(k));
if (keys.length) { /* match */ }
```

## 7. ENVÍO DE EMAILS

### 7.1 Cuándo se Envían Emails

**✅ SE ENVÍAN EMAILS cuando:**
- `documentsData.totalCount > 0` (hay documentos nuevos)
- Usuario está en `filteredUsers`
- Usuario pasa filtros de cobertura y rangos
- Hay matches de etiquetas (individual o empresa según corresponda)

**❌ NO SE ENVÍAN EMAILS cuando:**
- No hay documentos nuevos desde última ejecución
- `SEND_EMAILS_TO_USERS_WITHOUT_MATCHES = false` y usuario sin matches
- Usuario especial `eaz@ayuelajimenez.es` sin matches (skip completo)

### 7.2 Tipos de Email

**Newsletter con matches:**
```javascript
htmlBody = buildNewsletterHTML(
  user.name,
  user._id.toString(),
  moment().format('YYYY-MM-DD'),
  finalGroups,
  isExtraVersion  // Afecta template y subject
);
```

**Newsletter sin matches (BOE fallback):**
```javascript
htmlBody = buildNewsletterHTMLNoMatches(
  user.name,
  user._id.toString(),
  moment().format('YYYY-MM-DD'),
  boeDocsWithCollection
);
```

**Subject personalizado:**
- Normal: `"Reversa Alertas Normativas — 2025-08-15"`
- Extra: `"Reversa Alertas Normativas - Versión Extra — 2025-08-15"`

## 8. REPORTS Y MONITORING

### 8.1 Reports Generados

**Daily Report Email (sendReportEmail):**
- Usuarios con/sin matches
- Cuentas calientes (hot accounts)
- Estadísticas detalladas por etiqueta
- Enviado a: `info@reversa.ai`

**Collections ETL Report (sendCollectionsReportEmail):**
- Estadísticas de procesamiento ETL
- Errores y warnings
- Costes de API
- Enviado a: `info@reversa.ai`

### 8.2 Logging en Console

```
📊 NEWSLETTER EXECUTION STARTED
⏰ Current time (GMT+2): 2025-08-15T18:06:15+02:00
📅 Last run: 2025-08-15T10:00:00+02:00
📧 Extra version: YES - Versión Extra
📈 Found 85 documents to analyze from 12 collections
📊 Final Statistics:
   - Documents analyzed: 1184
   - Unique documents with matches: 85
   - Total matches count: 148
   - Users with matches: 1
   - Users without matches: 0
✅ Newsletter log created successfully
```

## 9. VARIABLES DE CONTROL PRINCIPALES

| Variable | Descripción | Valores |
|----------|-------------|---------|
| `isExtraVersion` | Si es ejecución del mismo día | `true`/`false` |
| `environment` | Entorno detectado | `"test"`/`"production"` |
| `documentsData.totalCount` | Total documentos nuevos | `number` |
| `userStats.withMatches.length` | Usuarios con matches | `number` |
| `filteredUsers` | Usuarios a procesar | `Array` |
| `SEND_EMAILS_TO_USERS_WITHOUT_MATCHES` | Enviar a usuarios sin matches | `true`/`false` |
| `isEnterpriseUser` | Si el usuario pertenece a empresa | `true`/`false` |
| `estructura_empresa_id` | ID empresa asociada (MongoDB) | `ObjectId` |
| `selectedEnterpriseEtiquetas` | Selección por usuario en empresa | `Array<string>` |

## 10. FLUJO COMPLETO DE EJECUCIÓN

```
1. Conectar a MongoDB
2. getLastNewsletterRun() → Obtener última ejecución y detectar versión extra
3. getDocumentsByDatetimeInsert() → Filtrar documentos por timestamp
4. Si no hay documentos → Enviar solo ETL report y salir
5. Procesar usuarios filtrados:
   - Detectar si es usuario enterprise
   - Cobertura: usar empresa.cobertura_legal (fallback a usuario)
   - Matching etiquetas: empresa (con selección) o individual
   - Calcular matches únicos y totales
   - Generar HTML y enviar emails
6. Calcular estadísticas finales
7. createNewsletterLog() → Guardar log en logs_newsletter
8. Enviar reports (Daily + ETL)
9. Cerrar conexión
```

**Este sistema asegura:**
- ✅ Control preciso de timing con datetime_insert
- ✅ Independencia de logs ETL backend  
- ✅ Timezone GMT+2 correcto
- ✅ Sin duplicados garantizado
- ✅ Métricas detalladas y precisas
- ✅ Detección automática de versión extra
- ✅ Observabilidad completa
- ✅ Compatibilidad enterprise (cobertura y etiquetas de empresa, y selección por usuario)
