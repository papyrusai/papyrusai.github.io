## Dashboard Interno (Seguimiento Etiquetado + Feedback)

Esta documentación describe la arquitectura, rutas, lógica de negocio y UI/UX del Dashboard Interno, para poder mantenerlo y extenderlo con seguridad.

### 1) Visión General
- Vista principal: `public/views/internal/dashboard_interno.html`
- Lógica de UI: `public/views/internal/dashboard_interno.js`
- Rutas backend: `routes/internal.routes.js`
- Sección Feedback: lógica UI en `public/views/internal/feedback.js` y backend en `routes/internal.review.feedback.js`
- Gating de acceso: Solo disponible para `tomas@reversa.ai` (autorización estricta en cada endpoint `/api/internal/*`).
- Caso de uso: seguimiento y revisión de documentos etiquetados por usuario/empresa, ranking de “Hot Accounts”, analítica diaria y por impacto.

### 2) UI/UX y Estándares (Seguimiento Etiquetado)
- Subnavegación estilo “ambito-tabs” (inspirada en `busqueda_estadisticas`):
  - Activo con subrayado azul (3px), sin verde, sin animaciones largas.
  - Código: `.internal-subnav` con `.tab` (activo: underline azul).
- Título “Hot Accounts”: visible encima de los chips de cuentas seleccionadas; estilo Reversa (azul, peso 700, mayor tamaño).
- Filtros:
  - Grid 4 columnas: Usuario, Agentes, Fuente Oficial, Rango, Fecha de publicación.
  - Usuario: label con icono de usuario y tipografía enfatizada; `select#fUsuario` más marcado.
  - Agentes: dropdown múltiple “Todos / N seleccionados” (`#btnEtiquetasInternal`), por defecto todos los agentes del usuario; se envía como `etiquetas=et1||et2`.
  - Fuente Oficial y Rango: dropdowns Reversa (botón con borde sutil y hover con sombra/fondo ligeramente más oscuro; sin verde ni animaciones).
  - Fecha de publicación: inputs con borde sutil.
- Fecha por defecto: últimos 3 días (desde hoy-3 hasta hoy).
- Botón Buscar: estilo Reversa con loading-state; el backend devuelve documentos + analítica.
- Analytics (compact): gráfico de serie diaria + KPIs (total alertas, media diaria) y resumen impacto (alto/medio/bajo). Se ha reducido la altura del gráfico al 50% y se asegura que no se solape con documentos. Estilos de la columna derecha (impacto/KPIs) replican el diseño del tracker.

### 3) Flujo Frontend (Seguimiento Etiquetado)
Archivo: `public/views/internal/dashboard_interno.js`

- Inicialización (`window.initializeInternalDashboard`):
  1) Carga selección guardada (chips), renderiza selector de usuario.
  2) Carga rangos de usuario vía `/api/internal/user-rangos`. Si no hay rangos → no se filtra por rango.
  3) Carga agentes del usuario (etiquetas seleccionadas o disponibles) para el filtro múltiple.
  4) Carga fuentes vía `/api/internal/user-boletines` (ver lógica enterprise abajo).
  5) Setea fechas por defecto (últimos 3 días).
  6) Espera a “Buscar”.

- Búsqueda (`fetchInternalData`):
  - Construye `URLSearchParams` con `userId`, `etiquetas` (||), `collections` (fuentes), `rango` (||) y fechas.
  - Loading-state en botón, loaders en documentos/gráfico.
  - Render de html de documentos (`documentsHtml`) + gráficas (`dailyLabels`/`dailyCounts`) + KPIs/impacto.

- Dropdowns:
  - `renderBoletinDropdownInternal` y `renderRangoDropdownInternal` guardan en `STATE.filtros` y muestran “Todos / 1 nombre / N seleccionados”.
  - Si el usuario elige “Todos”, se envían los valores reales (no una cadena “Todos”).

- Selector de usuario:
  - Chips de “Hot Accounts”: añade/quita ids seleccionados.
  - `#fUsuario` controla el `userId` objetivo de la búsqueda y refresca el filtro de Agentes.

### 4) Rutas Backend Internas (Seguimiento Etiquetado)
Archivo: `routes/internal.routes.js`

Todas las rutas internas están protegidas y requieren `req.user.email === 'tomas@reversa.ai'`.

- GET `/api/internal/seguimiento-users`
  - Devuelve la lista guardada de usuarios/empresas en seguimiento (almacenada en doc `users` del owner `tomas@reversa.ai`).
  - Para cada id devuelve: `userId, email, tipo_cuenta, isEmpresa, displayName`.
  - Regla empresa: un doc sin email y `tipo_cuenta in ['empresa','estructura_empresa']` se muestra como compañía y `displayName` usa `empresa`→`empresa_name`→`empresa_domain`.

- POST `/api/internal/seguimiento-users`
  - Actualiza la lista de ids en seguimiento; también guarda backup `usuarios_en_seguimiento_old` (política de backup).

- GET `/api/internal/ranking`
  - Ranking por número de matches de etiquetas (agregación por colección y fecha, excluyendo `_test`).
  - Agrupa por `(id,label)` (id = clave en `etiquetas_personalizadas` del documento); suma por id.
  - Enriquecimiento:
    - Excluye ids huérfanos (sin doc en `users`).
    - Para empresas: añade empleados (con email) asociando matches de la empresa y filtrando por `etiquetas_personalizadas_seleccionadas` si existen.
    - Añade usuarios recientes con 0 matches (hasta ~200, por `registration_date_obj/updated_at`) para que aparezcan en el selector.
  - Orden: desc por `matches`; paginación controlada por `page/pageSize`.

- GET `/api/internal/user-boletines`
  - Devuelve fuentes oficiales para el usuario del selector.
  - Lógica enterprise:
    - Si el usuario tiene `estructura_empresa_id` → usar cobertura del doc `estructura_empresa` asociado.
    - Si el id es doc de empresa (`tipo_cuenta: 'empresa'`) → usar su propia cobertura.
    - Fallback: buscar doc empresa por `empresa`/`empresa_name`.
  - Normaliza a mayúsculas; si no hay, `['BOE']`.

- GET `/api/internal/user-rangos`
  - Devuelve `rangos` del usuario (array en `users.rangos`) y se amplía con todos los `rango_titulo` distintos presentes en las colecciones de cobertura del usuario (excluyendo `_test`). Se garantiza incluir “Otras”. Si no hay datos → `[]`.

- GET `/api/internal/data`
  - Parámetros: `userId`, `collections` (||), `rango` (||), `desde`/`hasta` (YYYY-MM-DD), `etiquetas` (|| opcional), `page/pageSize`.
  - Lógica target IDs (igual que `/data` de perfil):
    - Empleado con `estructura_empresa_id`: targetUserIds = `[empresaId, ...legacy]`.
    - Doc de empresa (sin email): targetUserIds = `[empresaId, ...legacy]`.
    - Fallback por nombre `empresa`/`empresa_name`.
  - Selección de etiquetas (orden de preferencia):
    1) `etiquetas` explícitas en query.
    2) Empleado: `etiquetas_personalizadas_seleccionadas` si existen; si no, etiquetas del doc empresa.
    3) Doc de empresa: sus etiquetas.
    4) Fallback: etiquetas del `targetUserIds[0]`.
  - Query de Mongo:
    - Filtros de fecha (`anio/mes/dia`) y `rango_titulo` si aplica.
    - `etiquetasQuery = buildEtiquetasQueryForIds(selectedEtiquetas, targetUserIds)` (multi-ID + soporta obj/array) — no se aceptan docs sin match real.
    - Proyección usual (`short_name, resumen, anio/mes/dia, rango_titulo, etiquetas_personalizadas, url_pdf/html`).
    - Colecciones: expandida y filtrada para excluir `_test`; se verifica existencia (`collectionExists`). Límite 500.
  - Post-filtro: match real de etiquetas contra cualquiera de los `targetUserIds` (array u objeto), y excluye documentos eliminados por el usuario seleccionado.
  - Estadísticos: `dailyLabels/dailyCounts`, `monthsForChart/countsForChart`, `impactCounts`, `totalAlerts`, `avgAlertsPerDay`.
  - Paginación json: `{ page, pageSize, total, totalPages }`.

### 5) Sección Feedback (Resumen)
- UI: pestaña “Feedback” en `dashboard_interno.html`; lógica en `public/views/internal/feedback.js`.
- Filtros: Usuario (con opción “Todos”), Tipo Feedback (Todos/likes/dislikes), Feedback incorporado (Todos/Sí/No), Fecha de publicación (por defecto desde 1 de mes actual), paginación.
- Gráfica: barras apiladas 100% (Likes, Dislikes, Sin feedback) con altura aumentada; orden por total descendente. Muestra “Total: N” por usuario (documentos con match).
- Documentos: solo eventos con feedback, ordenados por fecha descendente; muestra usuario, feedback y detalle, resumen, impacto por agentes y selector “Feedback incorporado al agente (Sí/No)” persistido en `Feedback.feedback_incorporado`.
- Endpoints (`routes/internal.review.feedback.js`):
  - GET `/api/internal/review/feedback/users`: lista de usuarios con feedback etiquetado.
  - GET `/api/internal/review/feedback/data`: lista de documentos con feedback. Filtros: `userEmail` (ALL o email), `type` (all|like|dislike), `incorporado` (all|si|no), `desde`/`hasta` (YYYY-MM-DD), con HTML de documentos.
  - GET `/api/internal/review/feedback/stats`: devuelve agregados por usuario: `like`, `dislike`, `noFeedback`, `total` (para ordenar), respetando filtros superiores.
  - POST `/api/internal/review/feedback/incorporado`: actualiza `feedback_incorporado` (si/no) para un evento de feedback (solo `tomas@reversa.ai`).

### 6) Reglas de Matching (Resumen)
- Se replica `/profile` y `/data` (ver `Otros/Docs/Explicacion_secciones/Match_documentos.md`).
- `buildEtiquetasQueryForIds(etiquetas, ids)` construye `$or` compatible con estructuras arr/obj por cada id.
- Post-filtro garantiza `hasEtiquetasMatch` real (coincidencias por nombre, case-insensitive) y setea `doc.matched_etiquetas`.

### 7) Exclusiones y Consistencia de Datos
- Colecciones `_test`: excluidas en ranking y data.
- Ids huérfanos (sin doc en `users`): no aparecen en el ranking.
- Documentos eliminados por usuario: excluidos en `/api/internal/data`.

### 8) Estilos clave de la vista
- Subnav tabs: azul Reversa, borde inferior 1px, active underline 3px azul.
- “Hot Accounts”: titulo grande, 16-24px según diseño (actual 24px) y peso 700.
- Filtros: usuario con icono, dropdowns con hover sutil (sombra/fondo más oscuro), sin verde.
- Botón Buscar: azul Reversa con estado de carga.
 - Analytics derecha replica estilos del tracker (cajas de impacto y KPIs).

### 9) Parámetros y ejemplos
- `/api/internal/data` ejemplo de params:
```
userId=64f...abc&collections=BOE||CNMV||AEPD&rango=Ley||Real%20Decreto&desde=2025-09-01&hasta=2025-09-04&page=1&pageSize=25
```
- `/api/internal/ranking` paginación:
```
page=1&pageSize=15&desde=2025-09-01&hasta=2025-09-04
```

### 10) Tareas habituales de mantenimiento
- Añadir nuevas fuentes al dropdown: ajustar `/api/internal/user-boletines` si cambia la estructura de `cobertura_legal`.
- Cambiar layout de filtros: editar `public/views/internal/dashboard_interno.html` (grid de `.filters-row`).
- Ajustar fecha por defecto: función `setDefaultDates()` en `dashboard_interno.js`.
- Modificar criterio de “recientes sin match” del ranking: bloque “recentUsers” en `/api/internal/ranking` (límite y sort).

### 11) Solución de problemas
- Veo docs sin match: comprobar que `etiquetas` llega y `buildEtiquetasQueryForIds` se añade al `$and`. Ver logs `[internal/data] params` y `filtered by etiquetas`.
- Salen colecciones `_test`: verificar filtro `expandCollectionsWithTest(...).filter(n => !endsWith('_test'))` en ranking y data.
- Empresa sin fuentes: confirmar `estructura_empresa_id` o fallback por `empresa/empresa_name` en `/api/internal/user-boletines`.
- Ids raros en ranking: si no existen en `users`, ahora se excluyen; revisar claves en `etiquetas_personalizadas` de colecciones.

### 12) Seguridad
- Cada endpoint `/api/internal/*` verifica `req.user.email === 'tomas@reversa.ai'` y rechaza 403 si no cumple.

---
Esta guía recoge el comportamiento actual del Dashboard Interno y sus decisiones de diseño para que futuras extensiones mantengan la coherencia con `/profile` y `/data` y con el estándar de UI Reversa.


