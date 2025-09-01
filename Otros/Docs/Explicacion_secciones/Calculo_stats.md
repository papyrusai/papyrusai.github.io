### Cálculo de estadísticas - Tendencias Normativas (Backend + Frontend)

## 📊 **RESUMEN EJECUTIVO**

El sistema de estadísticas proporciona datos agregados en tiempo real sobre la actividad normativa española y europea. Los cálculos son reactivos a filtros aplicados por el usuario y utilizan un sistema de cache inteligente para optimizar el rendimiento.

## 🗂️ **FUENTES DE DATOS**

### **Criterios de Inclusión**
Las estadísticas se calculan sobre documentos de colecciones que cumplen los siguientes criterios en `info_fuentes`:

```javascript
// Consulta para obtener fuentes válidas
{
  $or: [
    { pais: 'España', nivel_geografico: { $in: ['Nacional', 'Regional'] } },
    { nivel_geografico: 'Europeo' }
  ]
}
```

### **Tipos de Fuentes Incluidas**
- **Nacionales**: BOE, ministerios, organismos públicos españoles
- **Regionales**: Boletines oficiales de comunidades autónomas (BOJA, BOA, DOGC, etc.)
- **Europeas**: DOUE, Parlamento Europeo, Comisión Europea

### **Filtrado Temporal**
- **Fecha mínima**: Solo documentos con `createdAt ≥ 2025-08-11` (configurable vía `STATS_MIN_DATE`)
- **Volumen**: Número de documentos (no páginas) salvo KPI específico de páginas
- **Aviso en UI**: "Datos disponibles desde 11/08/2025"

> Nota: `createdAt` se obtiene por coalescencia segura de múltiples campos de fecha (ver sección Lógica de fechas) para garantizar consistencia con el heatmap CCAA y scripts de verificación.

## 🔧 **ARQUITECTURA TÉCNICA**

### **Cache Multinivel**
1. **Cache en memoria** (fuentes españolas): TTL 10 minutos
2. **Cache en MongoDB** (resultados): TTL 10 minutos (colección `stats`)
3. **Cache frontend**: Invalidación explícita al cambiar filtros

### **Optimizaciones de Rendimiento**
- Ejecución en paralelo sobre todas las colecciones (`Promise.all`)
- Índices MongoDB automáticos en colección `stats`
- Proyecciones limitadas para reducir transferencia de datos
- `allowDiskUse: true` en agregaciones complejas

## 🕒 **LÓGICA DE FECHAS (COALESCENCIA ROBUSTA)**
Para evitar pérdidas de documentos por variaciones de esquema, todas las consultas calculan un campo `createdAt` en tiempo de ejecución con coalescencia y conversión segura:

```javascript
const CANDIDATE_DATE_FIELDS = [
  'date_time_insert','datetime_insert','fecha_disposicion','fecha_publicacion',
  'publication_date','publishedAt','published_at','pubDate','pub_date',
  'fecha','date','fechaPublicacion','fecha_publicado','createdAt','created_at',
  'updatedAt','updated_at'
];

// createdAt := primer campo candidato que exista convertido a Date
const createdAt = {
  $let: {
    vars: {
      arr: {
        $filter: {
          input: CANDIDATE_DATE_FIELDS.map(f => ({
            $cond: [
              { $eq: [{ $type: `$${f}` }, 'date'] }, `$${f}`,
              { $convert: { input: `$${f}`, to: 'date', onError: null, onNull: null } }
            ]
          })),
          as: 'd',
          cond: { $ne: ['$$d', null] }
        }
      }
    },
    in: { $arrayElemAt: ['$$arr', 0] }
  }
};
```

Todas las agregaciones filtran por `{ createdAt: { $gte: start, $lte: end } }` tras construir `createdAt`. Esto alinea los conteos con el script `scripts/count_boletines_since.js`.

## 📡 **ENDPOINTS API**

### **GET `/api/stats/facets`** (autenticado)
**Propósito**: Devuelve valores únicos para filtros dinámicos

**Proceso**:
1. Obtiene fuentes españolas desde cache/DB
2. Ejecuta agregación sobre todas las colecciones en paralelo
3. Unifica resultados eliminando duplicados
4. Devuelve arrays ordenados de: `rangos`, `divisiones`, `ramas`

**Respuesta**:
```json
{
  "success": true,
  "facets": {
    "rangos": ["Ley", "Real Decreto", "Orden", ...],
    "divisiones": ["Servicios financieros", "Energía", ...],
    "ramas": ["Derecho mercantil", "Derecho fiscal", ...]
  }
}
```

### **POST `/api/stats/tendencias`** (autenticado)
**Propósito**: Calcula estadísticas agregadas según filtros aplicados

**Body de solicitud**:
```json
{
  "periodo": {
    "preset": "30|90|365|ytd|custom",
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD"
  },
  "rangos": ["Ley", "Real Decreto"] | ["Todos"],
  "divisiones": ["Energía", "Sanidad"] | ["Todos"],
  "ramas": ["Derecho fiscal"] | ["Todos"],
  "excluirOutliers": true|false
}
```

## 🎯 **LÓGICA DE FILTROS Y OUTLIERS**

### **Filtros Base vs Filtros de Outliers**
El sistema aplica dos tipos de filtros de manera inteligente:

#### **1. Filtros Base** (aplicados a TODAS las agregaciones)
```javascript
const baseFilterStages = [
  { $match: { createdAt: { $gte: start, $lte: end } } },
  // Filtros de usuario (rangos, divisiones, ramas)
  // NO incluye filtros de outliers
];
```

#### **2. Filtros de Outliers** (aplicados SOLO a gráficas específicas)
```javascript
// Solo para gráfica de rangos
const rangoOutlierFilter = excluirOutliers ? 
  { $match: { rangoLC: { $ne: 'otras' } } } : null;

// Solo para gráfica de divisiones
const divisionOutlierFilter = excluirOutliers ? 
  { $match: { divisionesArray: { $nin: ['Administración pública', ...] } } } : null;

// Solo para gráfica de ramas
const ramaOutlierFilter = excluirOutliers ? 
  { $match: { ramasArray: { $nin: ['Derecho público sectorial', ...] } } } : null;
```

### **Comportamiento de Exclusión de Outliers**
- ✅ **Series temporales**: NO afectadas por filtros de outliers
- ✅ **Conteo total**: NO afectado por filtros de outliers  
- ✅ **KPIs generales**: NO afectados por filtros de outliers
- 🎯 **Gráfica rangos**: SÍ afectada (excluye "Otras")
- 🎯 **Gráfica divisiones**: SÍ afectada (excluye "Administración pública")
- 🎯 **Gráfica ramas**: SÍ afectada (excluye "Derecho público sectorial")

**Resultado**: Los documentos con etiquetas outliers se mantienen en estadísticas generales, solo se ocultan las etiquetas específicas de las gráficas correspondientes.

## 🗺️ **CÁLCULO DEL HEATMAP GEOGRÁFICO**
- El heatmap usa los mismos `createdAt` coalescidos para asegurar consistencia con los conteos por colección.
- Tooltips personalizados: `Cataluña` → "Todas las secciones integradas desde: 30/08/2025"; `País Vasco` → "Solo computa disposiciones generales".
- Escala de color con énfasis medio (mid=0.7) para discriminar regiones cercanas.

### **Identificación de Fuentes Regionales**
```javascript
// Solo boletines oficiales regionales con región definida
const regionalBulletins = fuentes.filter(x => 
  x.nivel_geografico === 'Regional' && 
  x.tipo_fuente === 'Boletines Oficiales' && 
  x.region && 
  x.sigla
);
```

### **Mapeo Sigla → Región**
```javascript
const siglaToRegion = new Map([
  ['BOJA', 'Andalucía'],
  ['BOA', 'Aragón'], 
  ['DOGC', 'Cataluña'],
  ['BOCM', 'Comunidad de Madrid'],
  ['DOGV', 'Comunidad Valenciana'],
  // ... más mappings
]);
```

### **Cálculo de Volumen por CCAA**
```javascript
perColl.forEach((resultado, idx) => {
  const n = resultado.total[0].n; // Documentos en esta colección
  const sigla = allSiglas[idx];   // Sigla de la colección
  const region = siglaToRegion.get(sigla); // Región asociada
  
  if (region) {
    heatmapByRegionName[region] = (heatmapByRegionName[region] || 0) + n;
  }
});
```

### **Fuentes Analizadas por Región**
- **Andalucía**: BOJA (Boletín Oficial de la Junta de Andalucía)
- **Aragón**: BOA (Boletín Oficial de Aragón)
- **Cataluña**: DOGC (Diari Oficial de la Generalitat de Catalunya)
- **Madrid**: BOCM (Boletín Oficial de la Comunidad de Madrid)
- **Valencia**: DOGV (Diari Oficial de la Generalitat Valenciana)
- **[...más regiones]**

### **Conversión a Códigos ISO**
```javascript
const REGION_TO_ISO = {
  'Andalucía': 'ES-AN',
  'Cataluña': 'ES-CT',
  'Comunidad de Madrid': 'ES-MD',
  // ... mappings completos
};
```

## 📈 **CÁLCULO DE KPIs**

### **KPI: Δ% vs Periodo Anterior**

#### **Lógica de Cálculo**
```javascript
function resolvePeriod(periodo) {
  // 1. Calcular periodo actual
  const start = /* fecha inicio según preset */;
  const end = new Date(); // ahora
  
  // 2. Calcular periodo anterior (misma duración)
  const ms = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime());
  const prevStart = new Date(prevEnd.getTime() - ms);
  
  // 3. CRÍTICO: Aplicar fecha mínima
  return {
    start: clampToMinDate(start),
    end,
    prevStart: clampToMinDate(prevStart), // ⚠️ Limitado a MIN_DATE
    prevEnd: clampToMinDate(prevEnd)      // ⚠️ Limitado a MIN_DATE
  };
}

const deltaPct = (sumPrev > 0) ? 
  (((sumCurrent - sumPrev) / sumPrev) * 100) : 
  null; // ✅ Devuelve null si no hay datos previos válidos
```

#### **Casos Especiales**
- ✅ **Sin datos previos**: `deltaPct = null` → UI muestra "—"
- ✅ **Periodo anterior < MIN_DATE**: Se recorta al MIN_DATE, puede resultar en `null`
- ✅ **Datos insuficientes**: `deltaPct = null` en lugar de porcentajes incorrectos

#### **Ejemplos**
```javascript
// Escenario 1: Periodo 30d desde hoy
// start: 2025-08-20, end: 2025-08-30
// prevStart: 2025-08-11 (clampedToMinDate), prevEnd: 2025-08-11 (clampedToMinDate)
// Resultado: Muy pocos datos previos, probablemente null

// Escenario 2: Periodo 90d desde hoy  
// start: 2025-08-11 (clampedToMinDate), end: 2025-08-30
// prevStart: 2025-08-11 (clampedToMinDate), prevEnd: 2025-08-11 (clampedToMinDate)  
// Resultado: Sin datos previos válidos, deltaPct = null
```

### **Otros KPIs**
- **Total documentos**: Suma de `total.n` de todas las colecciones
- **Total páginas**: Suma de `pagesSumCount.sum` donde `num_paginas` existe
- **Mediana páginas**: Calculada desde distribución de `num_paginas`
- **Top rango**: Primer elemento en `rangos` ordenado por count desc
- **Top división**: Primer elemento en `divisiones` ordenado por count desc

## 🔄 **REACTIVIDAD Y CACHE**

### **Invalidación Automática**
```javascript
// Frontend: Al cambiar cualquier filtro
function addValue(value) {
  state[stateArray] = newValue;
  invalidateStatsCache(); // ⚠️ Limpia cache inmediatamente
  renderCharts();         // 🚀 Nueva consulta al servidor
}
```

### **Cache Key Generation**
```javascript
const key = 'tendencias:' + hashParams({
  periodo: { start, end, preset },
  filters: { rangos, divisiones, ramas, excluirOutliers },
  scope: 'espanha'
});
```

### **Flujo de Datos**
1. **Cambio de filtro** → Invalidación cache frontend
2. **Nueva consulta** → Check cache MongoDB (10min TTL)
3. **Cache miss** → Ejecución paralela sobre todas las colecciones
4. **Agregación** → Cálculo con filtros específicos por tipo
5. **Respuesta** → Cache en MongoDB + devolución al frontend
6. **Render** → Actualización gráficas sin reload de página

## 🎛️ **CONFIGURACIÓN**

### **Variables de Entorno**
```bash
STATS_MIN_DATE=2025-08-11        # Fecha mínima de datos
STATS_TTL_SECONDS=600            # TTL cache MongoDB (10min)
```

### **Constantes Internas**
```javascript
const SPANISH_SOURCES_TTL_MS = 10 * 60 * 1000; // Cache fuentes (10min)
const DEFAULT_TTL_SECONDS = 600;                // Cache resultados
const INFO_FUENTES = 'info_fuentes';            // Colección metadatos
const STATS_COLLECTION = 'stats';               // Colección cache
```