# REPORTE ETL - DOCUMENTACIÓN COMPLETA

## 1. OVERVIEW DEL SISTEMA ETL REPORT

### 1.1 ¿Qué es el ETL Report?

El **ETL Report** es un informe automatizado que se genera después de cada ejecución del newsletter y proporciona estadísticas detalladas sobre el procesamiento de documentos por parte del sistema de webscraping (ETL).

### 1.2 Función Principal

```javascript
sendCollectionsReportEmail(db, lastEtlLogId = null)
```

**Ubicación**: `email_script/newsletter.js` (líneas ~1854-2283)
**Frecuencia**: Se ejecuta al final de cada run del newsletter
**Destinatario**: `info@reversa.ai`

## 2. NUEVA LÓGICA DE SINCRONIZACIÓN

### 2.1 Sincronización con Newsletter

**ANTES (sin sincronización):**
- ETL report procesaba siempre logs del día completo
- Podía duplicar o saltarse períodos

**AHORA (con sincronización):**
- ETL report procesa solo logs desde el último `last_etl_log` hasta el más reciente
- Sincronizado perfectamente con intervalos de newsletter

### 2.2 Algoritmo de Sincronización

```javascript
// 1. Obtener referencia del último newsletter
const lastEtlLogId = lastNewsletterRun.lastEtlLogId;

// 2. Construir query basado en sincronización
if (lastEtlLogId) {
  // Buscar logs ETL desde (exclusivo) el log de referencia
  queryFilter.datetime_run.$gt = referenceLog.datetime_run;
} else {
  // Fallback: rango diario tradicional
  queryFilter.datetime_run.$gte = startOfDay;
  queryFilter.datetime_run.$lte = endOfDay;
}

// 3. Procesar todos los logs del intervalo
const syncedLogEntries = await logsCollection.find(queryFilter).toArray();
```

### 2.3 Casos de Uso de Sincronización

**Caso 1: Primera ejecución del día**
- `lastEtlLogId = null`
- ETL report usa rango diario completo
- Guarda ID del último log ETL para próximo run

**Caso 2: Segunda ejecución (Versión Extra)**
- `lastEtlLogId = "ObjectId(...)"`
- ETL report procesa solo logs nuevos desde último run
- Actualiza ID del último log ETL

**Caso 3: Sin documentos nuevos en newsletter**
- Newsletter no ejecuta → No hay sincronización
- ETL report usa rango diario tradicional

## 3. FUENTES DE DATOS

### 3.1 Colección de Logs ETL

**Colección**: `logs` (ETL del webscraping)
**Estructura básica**:
```json
{
  "_id": "ObjectId(...)",
  "datetime_run": "2025-08-15T16:30:00.000Z",
  "run_info": {
    "environment": "production"
  },
  "etl_detailed_stats": {
    "BOE": {
      "docs_scraped": 150,
      "docs_new": 45,
      "docs_processed": 40,
      "docs_uploaded": 38,
      "etiquetas_found": 125,
      "input_tokens": 1250000,
      "output_tokens": 450000,
      "error_count": 2,
      "duration": "00:12:45",
      "errors": [
        { "error": "Timeout connecting to BOE server" }
      ]
    },
    "CNMV": {
      // ... similar structure
    }
  }
}
```

### 3.2 Métricas por Colección

| Campo | Descripción |
|-------|-------------|
| `docs_scraped` | Total documentos encontrados en la fuente |
| `docs_new` | Documentos nuevos (no existían en BD) |
| `docs_processed` | Documentos procesados por IA |
| `docs_uploaded` | Documentos guardados exitosamente en BD |
| `etiquetas_found` | Total etiquetas encontradas por IA |
| `input_tokens` | Tokens enviados a la API de IA |
| `output_tokens` | Tokens recibidos de la API de IA |
| `error_count` | Número de errores |
| `duration` | Tiempo de procesamiento |
| `errors` | Array de errores detallados |

## 4. CÁLCULO DE COSTES API

### 4.1 Pricing Model

```javascript
// Precios por millón de tokens (USD)
const INPUT_TOKEN_COST_USD = 1.100;   // $1.10 por 1M tokens input
const OUTPUT_TOKEN_COST_USD = 4.400;  // $4.40 por 1M tokens output
const USD_TO_EUR_RATE = 0.92;         // Conversión USD → EUR
```

### 4.2 Fórmula de Cálculo

```javascript
// Por cada colección
const inputCostUSD = (input_tokens / 1000000) * INPUT_TOKEN_COST_USD;
const outputCostUSD = (output_tokens / 1000000) * OUTPUT_TOKEN_COST_USD;
const totalCostUSD = inputCostUSD + outputCostUSD;
const totalCostCollectionEUR = totalCostUSD * USD_TO_EUR_RATE;
```

### 4.3 Ejemplo de Cálculo

**Colección BOE**:
- Input tokens: 1,250,000
- Output tokens: 450,000

**Cálculo**:
```
Input cost:  (1,250,000 / 1,000,000) × $1.10 = $1.375
Output cost: (450,000 / 1,000,000) × $4.40 = $1.980
Total USD:   $1.375 + $1.980 = $3.355
Total EUR:   $3.355 × 0.92 = €3.09
```

## 5. AGREGACIÓN Y COMBINACIÓN DE ESTADÍSTICAS

### 5.1 Lógica de Combinación Multi-Run

Cuando hay múltiples runs de webscraping en el intervalo sincronizado:

```javascript
// Para docs_scraped: tomar el MÁXIMO (último snapshot completo)
combinedStats[collectionName].docs_scraped = Math.max(
  combinedStats[collectionName].docs_scraped, 
  stats.docs_scraped || 0
);

// Para el resto: SUMAR todos los runs
combinedStats[collectionName].docs_new += stats.docs_new || 0;
combinedStats[collectionName].docs_processed += stats.docs_processed || 0;
combinedStats[collectionName].docs_uploaded += stats.docs_uploaded || 0;
combinedStats[collectionName].input_tokens += stats.input_tokens || 0;
combinedStats[collectionName].output_tokens += stats.output_tokens || 0;
```

### 5.2 Manejo de Errores

```javascript
// Agregar errores de todos los runs
if (stats.errors && Array.isArray(stats.errors)) {
  combinedStats[collectionName].errors.push(...stats.errors);
}

// Separar BOCG errors como warnings
if (collectionName.toUpperCase() === 'BOCG') {
  warningsHTML += `<li><strong>${collectionName}:</strong> ${errorObj.error}</li>`;
} else {
  errorsHTML += `<li><strong>${collectionName}:</strong> ${errorObj.error}</li>`;
}
```

## 6. ESTRUCTURA DEL REPORTE HTML

### 6.1 Secciones del Reporte

**1. Resumen General**
```html
<h2>1. Resumen General</h2>
<p><strong>Fecha/Hora de Ejecución:</strong> 2025-08-15T16:30:00Z</p>
<p><strong>Otros runs incluidos:</strong> 14:20:15, 12:45:30</p>
<p><strong>Colecciones Procesadas:</strong> 25</p>
<p><strong>Colecciones con Actividad:</strong> 12</p>
<ul>
  <li><strong>Total Documentos Scrapeados:</strong> 1,245</li>
  <li><strong>Total Documentos Nuevos:</strong> 156</li>
  <li><strong>Total Documentos Procesados:</strong> 145</li>
  <li><strong>Total Documentos Subidos:</strong> 140</li>
  <li><strong>Total Etiquetas Encontradas:</strong> 1,890</li>
  <li><strong>Total Coste API:</strong> €45.67</li>
  <li><strong>Total Errores:</strong> 3</li>
</ul>
```

**2. Tabla Detallada por Colección**
```html
<table>
  <thead>
    <tr>
      <th>Colección</th>
      <th>Docs Scraped</th>
      <th>Docs New</th>
      <th>Docs Processed</th>
      <th>Docs Uploaded</th>
      <th>Etiquetas Found</th>
      <th>Coste (€)</th>
      <th>Duration</th>
      <th>Errors</th>
    </tr>
  </thead>
  <tbody>
    <tr style="background-color: #e8f5e8;"> <!-- Verde: exitoso -->
      <td>BOE</td>
      <td>150</td>
      <td>45</td>
      <td>40</td>
      <td>38</td>
      <td>125</td>
      <td>€3.09</td>
      <td>00:12:45</td>
      <td>0</td>
    </tr>
    <tr style="background-color: #ffebee;"> <!-- Rojo: errores -->
      <td>CNMV</td>
      <td>25</td>
      <td>5</td>
      <td>3</td>
      <td>3</td>
      <td>45</td>
      <td>€1.24</td>
      <td>00:03:20</td>
      <td>2</td>
    </tr>
  </tbody>
</table>
```

### 6.2 Códigos de Color

| Color | Significado | Condición |
|-------|-------------|-----------|
| 🟢 Verde claro (`#e8f5e8`) | Procesamiento exitoso | `docsUploaded > 0 && errorCount === 0` |
| 🔴 Rojo claro (`#ffebee`) | Errores encontrados | `errorCount > 0` |
| ⚪ Gris claro (`#f5f5f5`) | Sin actividad | `docsScraped === 0 && docsNew === 0` |

**3. Detalle de Errores**
```html
<h2>3. Detalle de errores</h2>
<ul>
  <li><strong>CNMV:</strong> Timeout connecting to CNMV server</li>
  <li><strong>ESMA:</strong> Invalid SSL certificate</li>
</ul>
```

**4. Warnings (BOCG)**
```html
<h2>4. Warnings</h2>
<ul>
  <li><strong>BOCG:</strong> Connection timeout - non-critical</li>
</ul>
```

## 7. CÁLCULO DE PRECIO POR BOLETÍN

### 7.1 Metodología

**Precio por boletín** = Coste total ÷ Total documentos procesados exitosamente

```javascript
const totalCostEUR = 45.67;           // Coste total del período
const totalDocsUploaded = 140;        // Documentos exitosos
const costPerDocument = totalCostEUR / totalDocsUploaded;  // €0.326 por documento
```

### 7.2 Ejemplo Detallado

**Datos del reporte**:
- BOE: 38 docs, €3.09
- CNMV: 15 docs, €2.45
- BOCM: 25 docs, €1.87
- **Total**: 78 docs, €7.41

**Cálculo**:
```
Precio por boletín = €7.41 ÷ 78 docs = €0.095 por documento
```

### 7.3 Desglose por Fuente

| Fuente | Documentos | Coste Total | Coste por Doc |
|--------|------------|-------------|---------------|
| BOE | 38 | €3.09 | €0.081 |
| CNMV | 15 | €2.45 | €0.163 |
| BOCM | 25 | €1.87 | €0.075 |
| **TOTAL** | **78** | **€7.41** | **€0.095** |

### 7.4 Factores que Afectan el Precio

**Más caro**:
- Documentos largos (más tokens input)
- Muchas etiquetas generadas (más tokens output)
- Fuentes con documentos complejos

**Más barato**:
- Documentos cortos
- Pocas etiquetas generadas
- Procesamiento en lote eficiente

## 8. CUÁNDO SE ENVÍA EL REPORTE

### 8.1 Triggers de Envío

**✅ SIEMPRE se envía cuando**:
1. Newsletter ejecuta exitosamente (con documentos)
2. Newsletter ejecuta sin documentos nuevos
3. Al final de cada run del newsletter

**❌ NO se envía cuando**:
- Error fatal interrumpe newsletter antes de reports
- Deshabilitado manualmente

### 8.2 Integración con Newsletter

```javascript
// 1. Newsletter procesa documentos
await createNewsletterLog(db, userStats, ...);

// 2. Envía reporte de usuarios
await sendReportEmail(db, userStats);

// 3. Envía reporte ETL sincronizado
await sendCollectionsReportEmail(db, lastNewsletterRun.lastEtlLogId);
```

## 9. CONFIGURACIÓN Y PERSONALIZACIÓN

### 9.1 Parámetros Configurables

```javascript
// Precios API (actualizar según cambios de OpenAI)
const INPUT_TOKEN_COST_USD = 1.100;
const OUTPUT_TOKEN_COST_USD = 4.400;
const USD_TO_EUR_RATE = 0.92;

// Email configuración
const RECIPIENT = 'info@reversa.ai';
const SUBJECT_PREFIX = 'Reporte Colecciones ETL';
```

### 9.2 Personalización de Colores

```javascript
// Colores por estado
const COLORS = {
  success: '#e8f5e8',    // Verde claro
  error: '#ffebee',      // Rojo claro  
  inactive: '#f5f5f5'    // Gris claro
};
```

## 10. EJEMPLO COMPLETO DE REPORTE

### 10.1 Subject Line
```
Reporte Colecciones ETL - 2025-08-15
```

### 10.2 Resumen Ejecutivo
```
📊 ETL SYNC: Found 3 logs in synchronized interval
Other runs included: 14:20:15, 12:45:30

RESUMEN:
- 15 colecciones procesadas
- 8 colecciones con actividad
- 1,245 documentos scrapeados
- 156 documentos nuevos
- 140 documentos subidos exitosamente
- €12.34 coste total API
- €0.088 precio por boletín
- 2 errores, 1 warning
```

**Este sistema proporciona visibilidad completa del pipeline ETL, costes precisos por documento y correlación perfecta con los intervalos de newsletter.**
