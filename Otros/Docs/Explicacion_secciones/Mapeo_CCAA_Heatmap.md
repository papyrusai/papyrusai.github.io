# Mapeo CCAA - Sistema de Mapa de Calor

## 📊 **RESUMEN EJECUTIVO**

El mapa de calor por Comunidades Autónomas (CCAA) muestra el volumen de documentos normativos publicados por cada región española. Este documento detalla cómo se obtienen, procesan y mapean los datos desde las colecciones de MongoDB hasta la visualización final.

## 🔍 **PROCESO COMPLETO DE CÁLCULO**

### **1. OBTENCIÓN DE FUENTES DESDE `info_fuentes`**

El sistema consulta la colección `info_fuentes` con estos criterios:

```javascript
{
  $or: [
    { pais: 'España', nivel_geografico: { $in: ['Nacional', 'Regional'] } },
    { nivel_geografico: 'Europeo' }
  ]
}
```

**Fuentes incluidas:**
- **Nacionales**: BOE, ministerios, organismos públicos españoles
- **Regionales**: Boletines oficiales de comunidades autónomas (BOJA, BOA, DOGC, etc.)
- **Europeas**: DOUE, Parlamento Europeo, Comisión Europea

### **2. FILTRADO PARA MAPA DE CALOR**

Del total de fuentes, solo se usan para el heatmap CCAA las que cumplen:

```javascript
nivel_geografico === 'Regional' && 
	tipo_fuente === 'Boletines Oficiales' && 
	region && 
	sigla
```

**Criterios específicos:**
- ✅ Debe ser nivel geográfico "Regional"
- ✅ Debe ser tipo "Boletines Oficiales" (no otras fuentes regionales)
- ✅ Debe tener campo `region` definido
- ✅ Debe tener campo `sigla` definido

### **3. MAPEO SIGLA → REGIÓN**

Cada colección (sigla) se mapea a su región correspondiente:

| **Sigla** | **Región** | **Nombre Completo** |
|-----------|------------|---------------------|
| BOJA | Andalucía | Boletín Oficial de la Junta de Andalucía |
| BOA | Aragón | Boletín Oficial de Aragón |
| BOPA | Principado de Asturias | Boletín Oficial del Principado de Asturias |
| BOIB | Illes Balears | Butlletí Oficial de les Illes Balears |
| BOC | Canarias | Boletín Oficial de Canarias |
| BOC_cantabria | Cantabria | Boletín Oficial de Cantabria |
| BOCYL | Castilla y León | Boletín Oficial de Castilla y León |
| DOCM | Castilla-La Mancha | Diario Oficial de Castilla-La Mancha |
| DOGC | Cataluña | Diari Oficial de la Generalitat de Catalunya |
| DOGV | Comunidad Valenciana | Diari Oficial de la Generalitat Valenciana |
| DOE | Extremadura | Diario Oficial de Extremadura |
| DOG | Galicia | Diario Oficial de Galicia |
| BOR | La Rioja | Boletín Oficial de La Rioja |
| BOCM | Comunidad de Madrid | Boletín Oficial de la Comunidad de Madrid |
| BORM | Región de Murcia | Boletín Oficial de la Región de Murcia |
| BON | Comunidad Foral de Navarra | Boletín Oficial de Navarra |
| BOPV | País Vasco | Boletín Oficial del País Vasco |
| BOCCE | Ceuta | Boletín Oficial de la Ciudad de Ceuta |
| BOCME | Melilla | Boletín Oficial de la Ciudad de Melilla |

### **4. CÁLCULO DE VOLUMEN POR CCAA**

Para cada colección (sigla), el sistema:

1. **Ejecuta agregación MongoDB** con filtros aplicados (fechas coalescidas, rangos, divisiones, ramas)
2. **Cuenta documentos** que cumplen los criterios: `{ $count: 'n' }`
3. **Mapea resultado** a la región correspondiente:

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

### **5. CONSISTENCIA TEMPORAL (COALESCENCIA DE FECHAS)**

El heatmap utiliza el mismo `createdAt` coalescido que el resto de estadísticas para evitar pérdidas por variaciones de esquema. El `createdAt` se construye con:

```javascript
const CANDIDATE_DATE_FIELDS = [
  'date_time_insert','datetime_insert','fecha_disposicion','fecha_publicacion',
  'publication_date','publishedAt','published_at','pubDate','pub_date',
  'fecha','date','fechaPublicacion','fecha_publicado','createdAt','created_at',
  'updatedAt','updated_at'
];
// Primer valor no nulo convertido a Date
```

### **6. CONVERSIÓN A CÓDIGOS ISO 3166-2**

Para compatibilidad con librerías de mapas, se convierte nombre de región a código ISO:

```javascript
const REGION_TO_ISO = {
  'Andalucía': 'ES-AN', 'Aragón': 'ES-AR', 'Principado de Asturias': 'ES-AS',
  'Illes Balears': 'ES-IB', 'Canarias': 'ES-CN', 'Cantabria': 'ES-CB',
  'Castilla y León': 'ES-CL', 'Castilla-La Mancha': 'ES-CM',
  'Cataluña': 'ES-CT', 'Comunidad Valenciana': 'ES-VC', 'Extremadura': 'ES-EX',
  'Galicia': 'ES-GA', 'La Rioja': 'ES-RI', 'Comunidad de Madrid': 'ES-MD',
  'Región de Murcia': 'ES-MC', 'Comunidad Foral de Navarra': 'ES-NC',
  'País Vasco': 'ES-PV', 'Ceuta': 'ES-CE', 'Melilla': 'ES-ML'
};
```

## 🎨 **ESTILO Y UX DEL MAPA**

### **Tooltips**
- Nombre normalizado: `Cataluña`, `País Vasco` (independientemente de la fuente TopoJSON)
- Mensajes específicos:
  - Cataluña: "Todas las secciones integradas desde: 30/08/2025"
  - País Vasco: "Solo computa disposiciones generales"

### **Escala de color**
- Degradado tri-stop (verde claro → verde → azul oscuro) con énfasis medio para discriminar mejor valores intermedios:
  - Parámetro `mid = 0.7` para ampliar el rango medio (verde)

## 🔧 **CONFIGURACIÓN Y FILTROS**

### **Filtros Aplicados**
- ✅ **Fechas (coalescidas)**: Solo documentos con `createdAt ≥ MIN_DATE` (11/08/2025)
- ✅ **Rangos normativos**: Si se seleccionan filtros específicos
- ✅ **Sectores económicos**: Si se seleccionan filtros específicos  
- ✅ **Ramas jurídicas**: Si se seleccionan filtros específicos
- ✅ **Outliers**: Exclusión opcional de categorías frecuentes

## 🚨 **POSIBLES DISCREPANCIAS**
- Colecciones sin mapeo regional
- Nombres de región inconsistentes
- Filtros temporales
- Cache de 10 minutos

## 🔍 **DEBUGGING Y LOGS**
Incluye reportes de configuración de fuentes, resultados parciales por colección y acumulado final por región con su mapeo a ISO.

## 📋 **CHECKLIST DE VERIFICACIÓN**
- Verificar fuentes regionales presentes en `info_fuentes`
- Confirmar `region` y `sigla`
- Revisar mapeo colección→región y región→ISO
- Confirmar que los conteos coinciden con `scripts/count_boletines_since.js`
- Validar que la escala cromática discrimina bien el rango medio 