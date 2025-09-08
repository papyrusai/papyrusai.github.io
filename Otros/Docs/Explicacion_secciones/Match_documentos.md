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

- Se usa `buildEtiquetasQueryForIds(selectedEtiquetas, userIds)` que soporta ambas estructuras (objeto/array) y múltiples IDs.
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

## Exclusión de documentos eliminados (Feedback)

- Cada eliminación se guarda como un documento en la colección `Feedback` con:
  - `content_evaluated: 'doc_eliminado'`
  - `created_at`, `updated_at`, `fecha` (DD-MM-YYYY)
  - `user_id`, `user_email` (quién registra el evento)
  - `deleted_from` (ID del usuario/empresa para quien se elimina el documento)
  - `coleccion`, `doc_id`
  - `reason_delete`, `etiquetas_personalizadas_match`
- En `/profile` y `/data` se consulta `Feedback` para construir un set de claves `${coleccion}|${doc_id}` a excluir:
  - Alcance individual: `[ user._id ]`
  - Alcance empresa: incluye `estructura_empresa_id` (y legacy si corresponde)
- La exclusión por Feedback convive con la histórica `users.documentos_eliminados` (si existe), aplicándose ambas.

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
   - `dateFilter` soporta campos desnormalizados `anio/mes/dia` y, si faltan, usa fechas Date: `fecha_publicacion`, `fecha` o `datetime_insert`.
5. Por cada colección:
   - Verificar existencia.
   - `find(query).project(...).sort({ anio:-1, mes:-1, dia:-1 }).limit(500)`.
   - Anotar `collectionName` en cada doc.
6. Unir y ordenar resultados; excluir “documentos eliminados” por `users.documentos_eliminados` y por registros en `Feedback` (`doc_eliminado` con `deleted_from` en el alcance del usuario).
7. Paginación SSR y renderizado con impacto/agentes.

---

## Endpoint `/data` (JSON)

### Entrada
- Query:
  - `collections`: `||`-joined
  - `rango`: `||`-joined
  - `desde` / `hasta`: `YYYY-MM-DD`.
  - `etiquetas`: `||`-joined
  - `page` / `pageSize`.
- Usuario autenticado.

### Proceso
1. Colecciones finales: como en `/profile`.
2. Selección de etiquetas: como en `/profile`.
3. `targetUserIds`: individual vs empresa (incluyendo `estructura_empresa_id` y legacy si aplica).
4. `etiquetasQuery = buildEtiquetasQueryForIds(...)`.
5. Filtros de fecha/rango.
6. `find().project().sort().limit()` por colección existente.
7. Ordenar por fecha.
8. Excluir “documentos eliminados” (Feedback + users.documentos_eliminados).
9. Post-filtrado por etiquetas y derivación de métricas.

---

## Guía de replicación (paso a paso)

1. Determinar colecciones base y excluir `_test`.
2. Resolver `targetUserIds` (individual/empresa + legacy).
3. Seleccionar etiquetas.
4. Construir `etiquetasQuery`.
5. Filtrar por fecha/rango.
6. Consultar por colección existente.
7. Ordenar por fecha.
8. Excluir por Feedback (`doc_eliminado`) y por `users.documentos_eliminados`.
9. Post-filtrado por etiquetas y métricas.

---

## Consideraciones adicionales

- Comparación de etiquetas en minúsculas para robustez.
- Límite por colección: `/profile` 500, `/data` 300.
- Paginación máxima 100.
- Verificación de colección existente previa.
- Exclusión `_test` aplicada en múltiples rutas.
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
  
### Filtros temporales (detalle técnico)
- Normalización UTC de rangos: el inicio se fija a 00:00:00.000Z y el fin a 23:59:59.999Z.
- Campos admitidos por prioridad para filtrar y completar fecha efectiva:
  1. `anio/mes/dia` (cuando existen)
  2. `fecha_publicacion`
  3. `fecha`
  4. `datetime_insert`
- Cuando el documento carece de `anio/mes/dia`, el backend calcula y adjunta `anio`, `mes`, `dia` a partir de la fecha efectiva para garantizar:
  - Ordenación consistente
  - Visualización dd/mm/yyyy sin “-”
  - Agregaciones diarias correctas

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
