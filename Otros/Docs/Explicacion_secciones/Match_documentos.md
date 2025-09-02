## Match de documentos por `etiquetas_personalizadas`

Objetivo: documentar cómo se realiza el match entre agentes (`etiquetas_personalizadas`) y documentos de colecciones, diferenciando usuarios individuales y de empresa, y describir el comportamiento en los endpoints `/profile` y `/data`. Esta guía permite replicar el proceso end-to-end.

---

## Conceptos y estructuras de datos

- **Campo en documento: `etiquetas_personalizadas`**
  - **Estructura nueva (objeto)**: por usuario/empresa, objeto donde cada clave es una etiqueta y su valor puede ser:
    - string (explicación), o
    - objeto con `{ explicacion, nivel_impacto }`.
  - **Estructura antigua (array)**: por usuario/empresa, array de strings con etiquetas.
  - El acceso se hace por ID de usuario/empresa: `etiquetas_personalizadas[<userId>]`.

- **Usuarios**
  - **Individual**: `tipo_cuenta = "individual"`.
  - **Empresa**: `tipo_cuenta = "empresa"`. Se consulta por el ID de la estructura de empresa (`estructura_empresa_id`) y puede incluir `legacy_user_ids` para compatibilidad histórica.

- **Colecciones consultadas**
  - Se toman de la cobertura del usuario (fuentes de gobierno y reguladores). Si no hay, se usa `['BOE']`.
  - Se excluyen siempre las colecciones que terminan en `_test`.

- **Filtros de fecha**
  - Los documentos almacenan fecha desnormalizada: `anio`, `mes`, `dia`.
  - Se construyen condiciones tipo “rango inclusivo” con `$or` para límites de inicio/fin.

- **Filtros de rango**
  - Campo: `rango_titulo` (p. ej. 'Normativa Europea', 'Decisiones Judiciales', etc.).

---

## Exclusión de colecciones `_test`

- En todas las consultas relevantes se filtran las colecciones finales a consultar para excluir nombres que terminen en `_test`.
- Patrón aplicado:
```js
const expanded = expandCollectionsWithTest(inputCollections)
  .filter(n => !String(n).toLowerCase().endsWith('_test'));
```
- Además, antes de consultar, se verifica que la colección exista.

---

## Determinación de IDs objetivo (scope de matching)

- **Individual**
  - `targetUserIds = [ user._id ]`.

- **Empresa**
  - `/profile` (SSR) y `/data` (JSON) resuelven el ID base de empresa y extienden con `legacy_user_ids` si existen.
  - Resultado típico: `targetUserIds = [ estructura_empresa_id, ...legacy_user_ids ]`.

---

## Selección de etiquetas a usar

- Se obtienen definiciones con el adaptador: `getEtiquetasPersonalizadasAdapter(req.user)`.
- Si el usuario es de empresa, se intenta usar `getEtiquetasSeleccionadasAdapter(req.user)` como conjunto por defecto (si no hay selección, se usan todas las disponibles).
- Los endpoints aceptan etiquetas por querystring (se detallan abajo); si vienen en la petición, tienen prioridad.

---

## Construcción de la query de etiquetas (multi-ID)

- Se usa `buildEtiquetasQueryForIds(selectedEtiquetas, targetUserIds)` que soporta ambas estructuras (objeto/array) y múltiples IDs.
```1511:1529:services/enterprise.service.js
function buildEtiquetasQueryForIds(selectedEtiquetas, userIds) {
    if (!selectedEtiquetas || selectedEtiquetas.length === 0 || !Array.isArray(userIds) || userIds.length === 0) {
        return {};
    }
    const userIdStrings = userIds.map(id => String(id));
    const orBlocks = [];
    userIdStrings.forEach(id => {
        // Estructura nueva (objeto por etiqueta)
        orBlocks.push({
            $or: selectedEtiquetas.map(etiqueta => ({
                [`etiquetas_personalizadas.${id}.${etiqueta}`]: { $exists: true }
            }))
        });
        // Estructura antigua (array de etiquetas)
        orBlocks.push({
            [`etiquetas_personalizadas.${id}`]: { $in: selectedEtiquetas }
        });
    });
    return { $or: orBlocks };
}
```

---

## Endpoint `/profile` (SSR)

### Entrada
- Query opcional:
  - `etiquetas`: JSON array de etiquetas (override del default).
  - `boletines`: JSON array de colecciones (override del default).
  - `rangos`: JSON array de rangos (opcional).
  - `startDate` / `endDate`: fecha ISO `YYYY-MM-DD` (opcional).
  - `page` / `pageSize`: paginación SSR.
- Usuario autenticado.

### Proceso
1. Construir listas:
   - Colecciones final: cobertura del usuario → mayúsculas → excluir `_test` y colecciones inexistentes (se hace por verificación).
   - `selectedEtiquetas`: query o por defecto (empresa: seleccionadas si existen; individual: todas las disponibles).
   - `selectedRangos`: array o vacío.
   - Fecha: construir filtros con `buildDateFilter`.
2. Derivar `targetUserIds`:
   - Individual: `[ user._id ]`.
   - Empresa: `[ estructura_empresa_id, ...legacy_user_ids ]`.
3. Construir `etiquetasQuery` con `buildEtiquetasQueryForIds`.
4. Query final:
   - `$and: [ ...dateFilter, (rangos si hay), (etiquetasQuery si hay) ]`.
5. Por cada colección:
   - Verificar existencia.
   - `find(query).project(...).sort({ anio:-1, mes:-1, dia:-1 }).limit(500)`.
   - Anotar `collectionName` en cada doc.
6. Unir y ordenar resultados; excluir “documentos eliminados” por el usuario (`users.documentos_eliminados`).
7. Paginación SSR (por defecto 25).
8. Render SSR:
   - Sección “Etiquetas personalizadas”: renderiza lista de etiquetas del primer `targetUserId` con datos.
   - Sección “Impacto en agentes”: usa el objeto por etiqueta para mostrar `explicacion` y `nivel_impacto`, con botones de feedback.

### Salida
- HTML renderizado con:
  - Lista de documentos de la página.
  - Etiquetas/impacto por documento.
  - Paginación.
  - Gráfico mensual (conteo de documentos por mes sobre el set completo).
- Si no hay resultados, mensaje de tranquilidad y ocultación de labels de analytics.

---

## Endpoint `/data` (JSON)

### Entrada
- Query:
  - `collections`: string separada por `||` (override de colecciones).
  - `rango`: string separada por `||`.
  - `desde` / `hasta`: `YYYY-MM-DD`.
  - `etiquetas`: string separada por `||` (override).
  - `page` / `pageSize`.
- Usuario autenticado.

### Proceso
1. Colecciones finales:
   - Igual que en `/profile` (cobertura → mayúsculas) y excluir `_test`.
2. `selectedEtiquetas`:
   - Si viene por query → usar.
   - Si no:
     - Empresa: `getEtiquetasSeleccionadasAdapter` y si está vacío, todas las disponibles.
     - Individual: todas las disponibles.
3. Derivar `targetUserIds`:
   - Individual: `[ user._id ]`.
   - Empresa: `[ estructura_empresa_id, ...legacy_user_ids ]` (resuelto desde BD si hace falta).
4. `etiquetasQuery = buildEtiquetasQueryForIds(selectedEtiquetas, targetUserIds)`.
5. Construir `query`:
   - Rango de fechas con `desde`/`hasta` usando comparaciones `anio/mes/dia`.
   - `rango_titulo` si llega `rango`.
   - Añadir `etiquetasQuery` si no está vacío.
6. Por cada colección:
   - Verificar existencia.
   - `find(query).project(...).sort(...).limit(300)`.
   - Anotar `collectionName`.
7. Ordenar por fecha.
8. Excluir “documentos eliminados” del usuario.
9. Post-filtro por etiquetas:
   - Para cada doc, buscar match bajo cualquiera de los `targetUserIds`.
   - Soportar estructura array u objeto.
   - Guardar `doc.matched_etiquetas` si aplica.
10. Paginación sobre los documentos filtrados (por defecto 25).
11. Analítica:
   - Agregación diaria por colección (sin límite) para construir `dailyLabels`/`dailyCounts`.
   - Derivar serie mensual (`monthsForChart`/`countsForChart`).
   - Calcular `impactCounts` (`alto/medio/bajo`) en base a `nivel_impacto` de las etiquetas (si no hay, se considera `bajo`).
   - Calcular `totalAlerts` y `avgAlertsPerDay`.

### Salida
- JSON con:
  - `documentsHtml`: HTML de los documentos paginados con `matched_etiquetas` destacados y sección “Impacto en agentes”.
  - `hideAnalyticsLabels`: boolean para UI.
  - Series de gráfico: `monthsForChart`, `countsForChart`, `dailyLabels`, `dailyCounts`.
  - `impactCounts`, `totalAlerts`, `avgAlertsPerDay`.
  - `pagination`: `{ page, pageSize, total, totalPages }`.
- Si no hay `selectedEtiquetas`, respuesta corta pidiendo seleccionar al menos un agente.

---

## Guía de replicación (paso a paso)

1. Determinar colecciones base (cobertura del usuario) y normalizarlas a mayúsculas.
2. Expandir si procede y EXCLUIR `_test`:
   - `expanded = expandCollectionsWithTest(base).filter(n => !String(n).toLowerCase().endsWith('_test'))`.
3. Resolver `targetUserIds`:
   - Individual: `[ user._id ]`.
   - Empresa: `estructura_empresa_id` y `legacy_user_ids` (cuando existan).
4. Seleccionar etiquetas:
   - Si hay en la petición → usar.
   - Si no:
     - Empresa: seleccionadas; si vacío, todas las definidas.
     - Individual: todas las definidas.
5. Construir `etiquetasQuery` con `buildEtiquetasQueryForIds`.
6. Construir filtros de fecha y filtros de `rango_titulo` (si aplica).
7. Combinar en `query` (`$and`).
8. Para cada colección existente:
   - Ejecutar `find(query).project(...).sort(...).limit(N)`.
   - Anotar `collectionName`.
9. Unir resultados, ordenar por fecha y excluir “documentos eliminados”.
10. Si necesitas destacar etiquetas coincidentes o estadísticos:
   - Hacer post-filtro por etiquetas a nivel de documento (array/objeto).
   - Construir métricas (diarias/mensuales) y agregados de impacto.

---

## Consideraciones adicionales

- La comparación de etiquetas para “matched” se hace en minúsculas para robustez; respeta mayúsculas en render.
- Límites: `/profile` usa límite por colección de 500; `/data` 300 (tunable).
- Paginación máxima 100 por página.
- Siempre verificar existencia de la colección antes de consultar.
- El campo `documentos_eliminados` del usuario es un array de `{ coleccion, id }` y se respeta en ambos endpoints.
- Endpoints internos:
  - Ranking/analítica interna ya excluyen `_test`.
- `boletin` (diario):
  - No usa `etiquetas_personalizadas`; su listado de colecciones para filtros excluye `_test` y las consultas del endpoint diario también excluyen `_test`.
- `normativa` (detalle/análisis):
  - Se rechaza explícitamente cualquier `collectionName` que termine en `_test` en `/api/norma-details` y en `/api/analyze-norma` (código 400), para evitar acceso frontal a colecciones de test aun si se manipulan los parámetros.

---

## Exclusión de `_test` aplicada en código

- `/profile` (SSR):
```js
const expandedBoletines = expandCollectionsWithTest(selectedBoletines)
  .filter(n => !String(n).toLowerCase().endsWith('_test'));
```

- `/data` (JSON):
```js
const expandedCollections = expandCollectionsWithTest(collections)
  .filter(n => !String(n).toLowerCase().endsWith('_test'));
```

- `boletin` (diario):
```js
const expandedBoletines = expandCollectionsWithTest(selectedBoletines)
  .filter(n => !String(n).toLowerCase().endsWith('_test'));
```

- `normativa` (detalle/análisis):
```js
if (String(collectionName).toLowerCase().endsWith('_test')) {
  return res.status(400).json({ error: 'Colección no permitida' });
}
```

---

## Ejemplo de `etiquetasQuery` (multi-ID)

- `selectedEtiquetas = ["privacidad", "IA"]`
- `targetUserIds = ["64f...abc", "64f...def"]`

El bloque final equivale a:
```json
{
  "$or": [
    { "$or": [
      { "etiquetas_personalizadas.64f...abc.privacidad": { "$exists": true } },
      { "etiquetas_personalizadas.64f...abc.IA": { "$exists": true } }
    ]},
    { "etiquetas_personalizadas.64f...abc": { "$in": ["privacidad", "IA"] } },
    { "$or": [
      { "etiquetas_personalizadas.64f...def.privacidad": { "$exists": true } },
      { "etiquetas_personalizadas.64f...def.IA": { "$exists": true } }
    ]},
    { "etiquetas_personalizadas.64f...def": { "$in": ["privacidad", "IA"] } }
  ]
}
```
Esto cubre tanto documentos con estructura nueva (objeto) como con estructura antigua (array), para cualquiera de los IDs objetivo.

---
