## Guía de Tablas Reversa: Estándar de UI/UX para Listados con Filtros Avanzados

Esta guía define el estándar de diseño, UX y patrones de implementación para tablas de datos tipo “Iniciativas” (Parlamentarias y Legales). El objetivo es poder crear nuevas tablas desde cero con la misma experiencia consistente: filtros por columna con dropdown, búsqueda global, filtros por fecha, ordenación integrada, skeleton loaders, paginación, exportación a CSV/Excel y mensajes de feedback.

La guía cubre: estructura HTML, estilos, comportamiento UX, patrón de módulo JS, accesibilidad, rendimiento y plantillas de referencia (HTML/JS).

### Principios clave
- Consistencia visual y funcional entre módulos.
- Interacciones claras y predecibles (estado visible de filtros/orden).
- Respuesta inmediata en UI (skeleton y render incremental), sin bloquear.
- Mínimo acoplamiento: cada tabla en su propio módulo JS namespaced.
- Sin alert(), confirm() o prompt(). Usar el sistema de modales estándar Reversa.

## Estructura de la vista

Cada vista de tabla debe contener:
- Encabezado con título, badge “Beta” si aplica y subtítulo.
- Controles superiores: búsqueda global, filtros de fecha (desde/hasta con botón limpiar), botón Exportar.
- Tabla con cabecera, cuerpo, y pie de paginación.

IDs y namespacing:
- Para evitar colisiones, usar sufijos por módulo. Ej.: `search-iniciativas`, `search-iniciativas-legales`.
- Tabla: `#tabla-<modulo>` y `#tbody-<modulo>`.
- Paginación: `#prev-page-<modulo>`, `#next-page-<modulo>`, `#showing-start-<modulo>`, `#showing-end-<modulo>`, `#total-records-<modulo>`, `#current-page-<modulo>`, `#total-pages-<modulo>`.
- Export: `#export-excel-<modulo>` y modal `#exportModal<Modulo>`.

Ejemplo mínimo de HTML (adaptar <modulo>):
```html
<div class="page-header">
  <div style="display:flex;align-items:center;gap:12px;">
    <h2 class="page-title">Título Tabla</h2>
    <span class="beta-badge">Versión Beta</span>
  </div>
  <div class="page-subtitle">Descripción de la tabla</div>
  </div>

<div class="table-controls">
  <div class="filter-controls">
    <div class="filter-group">
      <label class="filter-label">Filtros</label>
      <input type="text" id="search-<modulo>" class="search-input" placeholder="Filtrar por palabras clave" />
    </div>
    <div class="date-filter-group">
      <label class="filter-label">Fecha</label>
      <input type="date" id="fecha-desde-<modulo>" class="date-input" />
      <span class="date-separator">—</span>
      <input type="date" id="fecha-hasta-<modulo>" class="date-input" />
      <button id="clear-dates-<modulo>" class="clear-dates-btn" title="Limpiar fechas">×</button>
    </div>
  </div>
  <button id="export-excel-<modulo>" class="btn-export">Exportar Excel</button>
</div>

<div class="table-container">
  <table id="tabla-<modulo>" class="reversa-table">
    <thead>
      <tr>
        <th class="sortable" data-column="id">ID</th>
        <th class="sortable" data-column="sector">Sector</th>
        <th class="sortable" data-column="tema">Tema</th>
        <th class="sortable" data-column="marco">Marco</th>
        <th class="sortable" data-column="titulo">Título</th>
        <th class="sortable" data-column="fuente">Fuente</th>
        <th class="sortable" data-column="proponente">Proponente</th>
        <th class="sortable" data-column="tipo">Tipo</th>
        <th class="sortable" data-column="fecha">Fecha</th>
        <th>Link</th>
      </tr>
    </thead>
    <tbody id="tbody-<modulo>"></tbody>
  </table>
</div>

<div class="pagination-container">
  <div class="pagination-info">
    Mostrando <span id="showing-start-<modulo>">0</span>-<span id="showing-end-<modulo>">0</span> de <span id="total-records-<modulo>">0</span>
  </div>
  <div class="pagination-controls">
    <button id="prev-page-<modulo>" class="pagination-btn" disabled>◀</button>
    <span class="page-info">Página <span id="current-page-<modulo>">1</span> de <span id="total-pages-<modulo>">1</span></span>
    <button id="next-page-<modulo>" class="pagination-btn">▶</button>
  </div>
</div>
```

## Estilos y diseño

Usar la misma base que las tablas existentes:
- Contenedor `.table-container` con borde suave, radio 12px, fondo blanco y sombra ligera.
- Tabla `.reversa-table` con `table-layout: fixed;` para truncar campos largos y evitar saltos.
- Cabecera `thead` con fondo `#f8f9fa`, borde inferior y `th.sortable` con cursor pointer.
- Fila hover con `background: #f8f9fa`.
- Celda de título `.titulo-cell` con `ellipsis` y expansión al hover (revertir a multi-línea al pasar el ratón).
- Burbuja de sector `.sector-bubble` con fondo translúcido.

Skeleton loader:
- Clase `.skeleton-row` en `<tr>`.
- Placeholders `.skeleton` con animación shimmer (gradiente en 90°) en varios anchos (`w-20`, `w-30`, ... `w-80`) y tamaños (`.small`).
- Mostrar skeleton mientras `isLoading=true` y ocultar render real hasta completar.

Icono de filtro por columna:
- Un `<span.filter-trigger>` se inyecta en cada `th.sortable`.
- Color por defecto `#6c757d`. Cuando hay un filtro activo en esa columna o está siendo la columna de orden actual, colorear en verde `#04db8d`.
- Hover con fondo suave `#eef2f4`.

Dropdown de filtros por columna (`.column-filter-dropdown`):
- Posicionado absolutamente bajo el `th` clicado; borde 1px, radio 10px, sombra suave.
- Estructura interna: header con título de columna, botón de orden (A-Z/Z-A) y botón “Limpiar”; input de búsqueda; fila “Seleccionar todo”; lista de checkboxes con truncado de texto y `accent-color` corporativo.
- Botón de orden alterna `asc/desc` con icono girando 180° cuando es `desc`.

Paginación:
- Controles prev/next con estados `:disabled` claros; info “Página X de Y” y “Mostrando A-B de N”.

Toasts y modales:
- Los toasts aparecen arriba-derecha, fondo `#04db8d` para éxito o `#455862` para info/error.
- Exportar siempre con el modal estándar (overlay + contenido), sin `alert/confirm/prompt`.

## Comportamiento UX

Carga inicial:
- Mostrar 25 filas skeleton al iniciar mientras cargan datos.
- Tras traer datos, preparar filtros por defecto: en columnas como `tipo`, excluir “No especificado” si procede.

Búsqueda global:
- Input `#search-<modulo>` filtra en tiempo real por “contains” sobre todos los valores mostrados, case-insensitive.

Filtros de fecha:
- Inputs `#fecha-desde-<modulo>` y `#fecha-hasta-<modulo>` aceptan `yyyy-mm-dd` del `<input type="date">`.
- El dato `fecha` se maneja en formato de visualización `dd-mm-yyyy`. Parsear robustamente: si no coincide, intentar `new Date(str)`; fallback a `new Date(0)`.
- Botón “Limpiar fechas” vacía ambos inputs y reaplica filtros.

Dropdown de filtros por columna:
- Abrir al click en el `th.sortable` (no ordenar al click del `th`; el ordenado se hace dentro del dropdown con su botón dedicado).
- El dropdown incluye:
  - Título de columna.
  - Botón de orden A-Z/Z-A (actualiza `currentSort`).
  - Botón “Limpiar” que resetea filtros de esa columna y, si esta columna era la ordenada, vuelve a `fecha desc` por defecto.
  - Input de búsqueda local para filtrar valores únicos de la columna.
  - Checkbox “Seleccionar todo” que actúa solo sobre los valores actualmente visibles por la búsqueda local.
  - Lista de valores con checkboxes multi-select; actualizar inmediatamente el dataset filtrado al cambiar.
- Cerrar dropdown al click fuera.
- Cuando hay filtros aplicados o la columna está ordenada, el ícono de filtro de esa columna se pinta en verde.

Ordenación:
- La ordenación se activa desde el botón dentro del dropdown de cada columna. Estado alterna `asc/desc` y re-renderiza inmediatamente.
- Orden especial de `fecha`: parsear `dd-mm-yyyy` para comparar fechas reales (no texto).

Paginación:
- Tamaño de página por defecto: 25 elementos.
- Botones prev/next deshabilitados en límites. La info de paginación se recalcula tras cualquier filtrado/ordenado.

Exportar a Excel/CSV (modal de filtros):
- Botón “Exportar Excel” abre un modal con:
  - Fecha desde/hasta para acotar.
  - Sección “Filtros adicionales”: filas dinámicas con `<select>` de columna y `<input>` de texto (contains, case-insensitive).
- Tras confirmar, se filtra una copia de los datos (sin depender del estado de la tabla en pantalla) y se genera CSV con BOM `\ufeff` para Excel.
- Escapado: valores entre comillas; duplicar comillas internas. Nombre de archivo: `nombre_modulo_YYYY-MM-DD.csv`.
- Mostrar toast de éxito y cerrar modal. Clic fuera del modal lo cierra.

Mensajería y feedback:
- Usar toasts para errores de carga, confirmaciones de export y acciones relevantes.
- Nunca usar `alert/confirm/prompt`; siempre el modal estándar de Reversa.

## Patrón de módulo JS

Cada tabla se implementa como un módulo IIFE namespaced y expone una API mínima:
- `window.<Modulo>Module = { init, refresh }`.
- Variables internas: `data`, `filteredData`, `currentPage`, `itemsPerPage`, `currentSort`, `columnFilters`, `isLoading`, y estado del dropdown (`currentDropdown`, `currentDropdownColumn`).

Funciones clave:
- `fetchData()` (si aplica): traer datos del backend y mapearlos al modelo de visualización.
- `mapForDisplay(item)`: asegurar campos: `id`, `sector`, `tema`, `marco`, `titulo`, `fuente` (sin sufijos como `_test`), `proponente`, `tipo` (normalizado), `fecha` (`dd-mm-yyyy`), `link`, `doc_id`.
- `init()`: skeleton -> carga -> preparar filtros -> listeners -> render inicial.
- `setupEventListeners()`: wirear búsqueda global, fechas, limpiar fechas, apertura de dropdowns, paginación, export.
- `setupHeaderFilters()`: inyectar íconos y listeners por columna; cerrar al clic fuera.
- `openFilterDropdown(column, thElement)`: construir y posicionar el dropdown; gestionar búsqueda local, select-all visible, botón limpiar, alternar orden.
- `applyAllFilters()`: combinar búsqueda global, fechas y filtros por columna; resetear página a 1; luego `sortData()` y `renderTable()`.
- `sortData()`: comparar por columna activa; para `fecha`, parsear.
- `renderTable()`: paginar, pintar filas, llamar a `updatePaginationInfo()`.
- `updateFilterIconStates()`: pintar en verde cuando aplica.
- `exportToExcelWithData(data)`: generar y descargar CSV (con BOM y escapado correcto).
- `openExportModal()` / `closeExportModal()`.

Buenas prácticas de implementación:
- Namespacing de IDs y variables para evitar colisiones cuando coexisten varias tablas.
- Reutilizar estilos inyectados por ID (p.ej. `#export-modal-styles` o `#iniciativas-animations`) para no duplicar CSS.
- Evitar duplicar listeners (si se reabre la vista, no volver a añadir eventos idénticos).
- Cerrar dropdowns existentes antes de abrir uno nuevo.
- Respetar el layout fixed: truncar textos en celdas y revelar al hover donde aplique (`.titulo-cell`).
- Manejar valores faltantes con defaults (“No especificado”, `''`, `#` para link) y escape de comillas cuando se insertan en `innerHTML`.

## Accesibilidad y rendimiento

Accesibilidad:
- Asegurar contraste de colores (icono verde #04db8d sobre fondo claro; texto legible).
- Añadir `title` o `aria-label` a botones (exportar, limpiar, ordenar) y a iconos de filtro.
- Modal: foco en primer campo al abrir; cerrar con clic de overlay; opcional: escuchar Escape.

Rendimiento:
- Para datasets medianos (≤5k filas) el enfoque actual es suficiente con paginado en cliente.
- Para datasets grandes, considerar: paginado en servidor, virtualización de filas o `IntersectionObserver` para carga perezosa.
- Evitar recalcular valores únicos en cada pulsación si el dataset es muy grande (cachear por columna y recalcular solo al cambiar datos base).

## Plantillas de referencia

Inicializador de módulo (JS) simplificado:
```javascript
(function() {
  let data = [], filtered = [];
  let currentPage = 1;
  const itemsPerPage = 25;
  let currentSort = { column: 'fecha', direction: 'desc' };
  const columnFilters = {};
  let isLoading = false;

  function mapForDisplay(item) {
    return {
      id: item.id || '',
      sector: item.sector || 'No especificado',
      tema: item.tema || 'No especificado',
      marco: item.marco || 'No especificado',
      titulo: item.titulo || 'Sin título',
      fuente: String(item.fuente || '').replace(/_test$/i, ''),
      proponente: item.proponente || 'No especificado',
      tipo: formatTipo(item.tipo),
      fecha: item.fecha || '',
      link: item.link || '#',
      doc_id: item.doc_id || ''
    };
  }

  function formatTipo(v) {
    if (!v || typeof v !== 'string') return 'No especificado';
    const n = v.replace(/_/g, ' ').toLowerCase();
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  // ... implementar: init, setupEventListeners, setupHeaderFilters,
  // openFilterDropdown, applyAllFilters, sortData, renderTable, export, etc.

  window.miModuloTabla = { init: init, refresh: renderTable };
})();
```

## Checklist de implementación
- [ ] Estructura HTML y IDs namespaced creados.
- [ ] Estilos base `.reversa-table`, skeleton y dropdowns presentes (o inyectados una sola vez por ID).
- [ ] Búsqueda global y filtros de fecha operativos (con botón limpiar).
- [ ] Íconos de filtro inyectados en cada `th.sortable`.
- [ ] Dropdowns por columna con búsqueda local, select-all visible, botón limpiar y toggle de orden.
- [ ] Resaltado en verde del ícono de filtro cuando aplique (filtro activo o columna ordenada).
- [ ] Orden por `fecha` con parse correcto `dd-mm-yyyy`.
- [ ] Paginación con info y estados de botones.
- [ ] Export modal con filtros adicionales y CSV con BOM y escapado correcto.
- [ ] Toasts para feedback.
- [ ] Módulo JS namespaced con `{ init, refresh }` expuesto.

Con este estándar podrás replicar tablas idénticas a “Iniciativas Parlamentarias” y “Iniciativas Legales”, garantizando una experiencia coherente, limpia y mantenible en toda la aplicación.


