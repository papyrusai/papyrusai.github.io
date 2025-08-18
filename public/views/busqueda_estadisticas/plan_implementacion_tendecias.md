## Plan de implementación — Dashboard de tendencias regulatorias (Reversa)

### 1) Objetivo y alcance
- **Meta**: entregar un dashboard escalable y eficiente que muestre tendencias de normativa con dos pestañas: **Normativa publicada** y **Normativa en tramitación**. Sin personalización por usuario en esta vista (los impactos personalizados van en otra sección de la app).
- **Filtros globales**: Ámbito (Global | UE | Nacional | Autonómico con multiselección CCAA), Periodo (30/90/365 días | YTD | rango personalizado), Unidad (Normas ↔ Páginas), Granularidad (Mensual por defecto | Semanal), Rango normativo (multi), Divisiones (multi), Ramas jurídicas (multi), Outliers toggle (excluir “Administración Pública” y “Derecho Administrativo”).
- **Nota de cobertura**: Las fuentes/colecciones se han ido incorporando progresivamente durante 2025; debe indicarse cobertura por fuente y manejar periodos sin datos con mensaje: “No hay documentos en la base de datos para esa franja temporal”.

---

### 2) Variables y colecciones de MongoDB (confirmadas y previstas)
- Colecciones de ejemplo confirmadas (papyrus): `BOE`, `DOUE`, `BOPV`, `DOGC`, `DOG`, `BOC`, `BORM`, `BOA`, `BOCM`, `DOE`, `BOCYL`, `BOJA`, `BOIB`, `BOPA`, `DOGV`, `BOCA`, `BOCG` (y variantes `*_test` que se deben excluir por defecto). Reguladores y noticias: `CNMV`, `AEPD`, `CNMC`, `NIST`, `EDPB`, `EBA`, `ESMA`, `INCIBE`, etc.; prensa: `CEPC`, `CE_ALL_NOTICIAS`, `EIOPA_news`, `NIST_NEWS`, `EUROPARL_NOTICIAS`, etc.
- Colección de usuarios: `users` (campos útiles):
  - `cobertura_legal.fuentes_gobierno: string[]`, `cobertura_legal.fuentes_reguladores: string[]` (para preseleccionar filtros de fuentes/ámbito si se desea)
  - `subscription_plan` (no bloqueante para esta vista)
- Campos documentales típicos en colecciones de boletines (p.ej. `BOE`):
  - Identificación/origen: `source_name`, `source_type`, `diario`, `origen_legislativo` (p.ej. “Estatal”, “Autonómico”) 
  - Fechas: `fecha_publicacion (Date)`, `fecha_disposicion (Date)`, `anio (Number)`, `mes (Number)`, `dia (Number)`
  - Metadatos: `rango (String)`, `titulo (String)`, `url_pdf (String)`, `resumen (String)`, `materias (String[])`
  - Clasificación prevista (si existe en colecciones): `divisiones (String[])`, `ramas_juridicas (String[])`
  - Métrica de volumen (si existe): `num_paginas (Number)`
- Consideraciones:
  - `num_paginas` puede faltar en algunas colecciones. Debe soportarse “Unidad = Normas” aunque no haya páginas.
  - `divisiones` y `ramas_juridicas` pueden no estar en todas las fuentes. Si no existen, mostrar “No identificado” o esconder gráfico con aviso.
  - Excluir por defecto colecciones con sufijo `*_test`.

---

### 3) Clasificación de fuentes (versión provisional basada en frontend configuración)
- Normativa publicada (boletines): `DOUE`, `BOE`, `BOPV`, `CGCC`, `DOGC`, `DOG`, `BOC`, `BORM`, `BOA`, `BOCM`, `DOE`, `BOCYL`, `BOJA`, `BOIB`, `BOPA`, `DOGV`, `BOCA`.
- Normativa en tramitación: `BOCG` (más adelante se integrarán `PARTICIPACION_*` cuando esté lista la colección de referencia).
- Excluir del cómputo de normativa (por ahora): Reguladores (`EBA`, `ESMA`, `CNMV`, `AEPD`, `CNMC`, `NIST`, `EDPB`, `INCIBE`, etc.) y prensa/noticias (`CEPC`, `CE_ALL_NOTICIAS`, `EIOPA_news`, `NIST_NEWS`, `EUROPARL_NOTICIAS`, etc.).
- Ambito sugerido (para agregación y filtros):
  - `DOUE` → `ambito.pais = "UE"`, `ambito.region_code = "EU"`
  - `BOE` → `ambito.pais = "ES"`, `ambito.region_code = "ES-ESTADO"`
  - Autonómicos (ejemplos): `BOJA→ES-AN`, `BOA→ES-AR`, `BOPA→ES-AS`, `BOIB→ES-IB`, `BOC→ES-CB`, `BOCYL→ES-CL`, `DOCM/DOGV/DOGC/DOG/...` mapear a ISO 3166-2 correspondiente; `BOCM→ES-MD`, `BORM→ES-MC`, `BOCA→ES-CN`, `BOPV→ES-PV`.
  - `BOCG` (tramitación) → `ambito.pais = "ES"`, `ambito.region_code = "ES-ESTADO"`.

---

### 4) Modelo de datos agregado (Fase 1)
- Colecciones agregadas a crear:
  - `agg_publicada`
  - `agg_tramitacion`
- Documento agregado (por combinación de dimensiones):
  - `periodo`: `YYYY-MM` (mensual) y/o `ISO-YYYY-WW` (semanal)
  - `ambito`: `{ pais: "UE"|"ES"|..., region_code: "EU"|"ES-ESTADO"|"ES-AN"|... }`
  - `fuente`: sigla (p.ej. `BOE`, `DOUE`, ...)
  - `rango`: string (p.ej. “Ley”, “Real Decreto”, “Orden”, “Resolución”, ...)
  - `division`: string (o "No identificado" si falta)
  - `rama_juridica`: string (o "No identificado" si falta)
  - `count_normas`: number
  - `sum_paginas`: number | null (si no hay `num_paginas`)
  - `avg_paginas_por_norma`, `mediana_paginas`, `p95_paginas` (opcional; si hay `num_paginas` suficiente)
  - `last_updated`: Date
- Índices recomendados:
  - Por consulta: `{ periodo: 1, "ambito.pais": 1, "ambito.region_code": 1 }`
  - Por filtros: `{ rango: 1 }`, `{ division: 1 }`, `{ rama_juridica: 1 }`, `{ fuente: 1 }`
- Metadatos de cobertura por colección (nueva colección `agg_coverage`):
  - `{ fuente, first_doc_date, last_doc_date, total_docs, last_updated }`

---

### 5) Endpoints backend (Fase 1)
- Base: `/api/tendencias/:tab` donde `tab ∈ {publicada, tramitacion}`
- Parámetros comunes: `ambito_pais`, `ambito_region[]`, `periodo_desde`, `periodo_hasta`, `granularidad (mensual|semanal)`, `unidad (normas|paginas)`, `rangos[]`, `divisiones[]`, `ramas[]`, `excluir_outliers (bool)`
- Respuestas: siempre incluir `{ metadata: { filtros_aplicados, generated_at, coverage_notes[] }, data: ... }`. Si no hay datos: `{ data: [], message: "No hay documentos en la base de datos para esa franja temporal" }`.
- Endpoints:
  1) `GET /kpis` → totales período: `count_normas`, `sum_paginas`, `avg/mediana/p95` (si aplica), `delta_vs_periodo_anterior`, `top_rango`, `top_division`, `top_rama`.
  2) `GET /serie` → serie temporal (líneas): `{ periodo, valor }` (+modo apilado por `rango` opcional: top 4 + “Resto”).
  3) `GET /geografia` → choropleth CCAA + ranking: `{ region_code, valor }`; solo cuando ámbito España/autonómico.
  4) `GET /rangos` → barras: top rangos por período seleccionado (absoluto y %).
  5) `GET /divisiones` → barras: top divisiones (si existen; si no, retornar `not_available: true`).
  6) `GET /ramas` → barras: top ramas (si existen; si no, `not_available: true`).
  7) `GET /detalle` → tabla paginada con documentos (enlazando a `titulo`, `url_pdf`, `rango`, fechas, `fuente`).

---

### 6) UX y visualizaciones (Fase 1)
- Estilo general (corporate y minimal):
  - Botones: sin bordes o con fondo sólido y texto blanco (radio 20px, borde 1px). Botones que disparan IA (export PDF, link) con gradiente “Reverse Green ↔ Blue”. Uso de "Reverse Green" solo como acento.
  - Colores daltón-friendly, tipografías legibles, labels claros en ejes y tooltips.
- Filtros (barra superior fija): Ámbito, Periodo, Unidad, Granularidad, Rangos, Divisiones, Ramas, Outliers + “Reset filtros” y etiqueta “Última actualización: dd/mm hh:mm”.
- Orden de visualizaciones (top-down, MECE):
  1) **KPIs de periodo** (tarjetas): `#Normas`, `#Páginas`, `Páginas/Norma (mediana)`, `Δ% vs periodo anterior`, `Top Rango`, `Top División/Rama`.
  2) **Evolución temporal** (líneas): total y toggle “apilado por rango (Top 4 + Resto)”. Brush/zoom, leyenda clicable.
  3) **Geografía** (choropleth CCAA + ranking): aplicable a España/autonómico; tooltip con valores y Δ% vs periodo anterior. Click → filtra CCAA.
  4) **Distribución por rangos** (barras apiladas o barras simples): composición % y absolutos en tooltip.
  5) **Top divisiones** (barras horizontales): mostrar si existen; toggle “Comparar hasta 3” (líneas mini) y chip de outliers.
  6) **Top ramas jurídicas** (barras horizontales): igual a divisiones.
  7) **Tabla de detalle** (colapsable/modal): lista de normas filtradas con `fecha_publicacion`, `rango`, `titulo`, `fuente`, `url_pdf`.
- Mensajería vacíos: “No hay documentos en la base de datos para esa franja temporal”.

---

### 7) Tareas batch y scheduling (Fase 1)
- Diarias: actualizar semana y mes en curso para `agg_publicada` y `agg_tramitacion` (corte a 00:00 UTC). 
- Semanales: consolidar semanas cerradas; recalcular medianas/p95 si procede.
- Mensuales: consolidar mes, refrescar Top-N anuales.
- `agg_coverage`: mantener `first_doc_date`/`last_doc_date` por colección para mostrar notas de cobertura.

---

### 8) Prompts ejecutables (Fase 1)

"""
PROMPT 1 — Mapeo de fuentes y ámbitos
Objetivo: Definir la lista de colecciones incluidas por tab y su mapeo de ámbito para agregación/filtros.
Entradas:
- Clasificación provisional (frontend):
  - Publicada: [DOUE, BOE, BOPV, CGCC, DOGC, DOG, BOC, BORM, BOA, BOCM, DOE, BOCYL, BOJA, BOIB, BOPA, DOGV, BOCA]
  - Tramitación: [BOCG]
- Exclusiones: cualquier colección con sufijo *_test; reguladores y prensa/noticias (no incluir).
Acciones:
1) Crear un diccionario { fuente → { pais, region_code } } con:
   - DOUE→{UE, EU}; BOE→{ES, ES-ESTADO}
   - BOJA→ES-AN; BOA→ES-AR; BOPA→ES-AS; BOIB→ES-IB; BOC→ES-CB; BOCYL→ES-CL; BOCM→ES-MD; BORM→ES-MC; BOCA→ES-CN; BOPV→ES-PV; DOGC→ES-CT; DOGV→ES-VC; DOG→ES-GA; DOE→ES-EX; BOC→ES-CB; etc.
   - BOCG→{ES, ES-ESTADO}.
2) Persistir este diccionario en configuración de backend.
Salidas:
- Mapa de fuentes y ámbitos listo para usar por el agregador y endpoints.

PROMPT 2 — Agregadores y colecciones `agg_publicada` y `agg_tramitacion`
Objetivo: Construir y poblar colecciones agregadas mensuales/semanales.
Entradas:
- Colecciones origen (por tab) definidas en PROMPT 1.
- Campos: `fecha_publicacion`, `rango`, `anio`, `mes`, `dia`, `titulo`, `url_pdf`, `origen_legislativo`, `materias`, [opcional] `divisiones`, [opcional] `ramas_juridicas`, [opcional] `num_paginas`.
Acciones:
1) Para cada colección origen y rango temporal a actualizar:
   - Filtrar por `fecha_publicacion` en el periodo objetivo.
   - Derivar `periodo` mensual (`YYYY-MM`) y semanal (`ISO-YYYY-WW`).
   - Mapear `ambito` con el diccionario de PROMPT 1.
   - Agregar por combinaciones (al menos):
     a) periodo × ambito
     b) periodo × ambito × rango
     c) [si existen] periodo × ambito × division
     d) [si existen] periodo × ambito × rama_juridica
   - Métricas: `count_normas`; `sum_paginas = sum(num_paginas)` si el campo existe; si no, `sum_paginas = null`.
2) Escribir en `agg_publicada` (o `agg_tramitacion`) documentos con: {periodo, ambito, fuente, rango, division, rama_juridica, count_normas, sum_paginas, last_updated}.
3) Actualizar `agg_coverage` por fuente: {fuente, first_doc_date, last_doc_date, total_docs, last_updated}.
4) Índices según sección 4.
Salidas:
- `agg_publicada`, `agg_tramitacion`, `agg_coverage` pobladas y actualizadas.

PROMPT 3 — Endpoints REST `GET /api/tendencias/:tab/*`
Objetivo: Exponer datos agregados de forma rápida y consistente.
Entradas: Parámetros comunes (ambito_pais, ambito_region[], periodo_desde, periodo_hasta, granularidad, unidad, rangos[], divisiones[], ramas[], excluir_outliers).
Acciones:
1) `/kpis`: leer agregados en el rango; devolver totales y Δ% vs periodo anterior; si `unidad=paginas` y no hay `sum_paginas`, devolver sólo `count_normas` y avisar en `metadata.coverage_notes`.
2) `/serie`: devolver serie temporal por `periodo`; opcional `apilado=rango` (Top 4 + Resto).
3) `/geografia`: devolver por `region_code` cuando `ambito_pais=ES` y (sin selección de región o con multi-CCAA); si no aplica, responder `{not_applicable: true}`.
4) `/rangos`: ranking de rangos; porcentajes y absolutos.
5) `/divisiones` y `/ramas`: si los campos no están en agregados, responder `{not_available: true}` con `coverage_notes`.
6) `/detalle`: listar documentos crudos filtrados (usar paginación server-side, ordenar por `fecha_publicacion desc`).
7) Si la query no encuentra datos: HTTP 200 con `data: []` y `message` estándar.
Salidas: Respuestas JSON con `metadata` + `data` listas para UI.

PROMPT 4 — UI/UX del dashboard (2 tabs)
Objetivo: Implementar dos pestañas (“Publicada” y “En tramitación”) consumiendo los endpoints.
Entradas: Endpoints PROMPT 3; estilo UI corporativo minimal.
Acciones:
1) Barra de filtros (sticky): Ámbito (incluye multiselección CCAA), Periodo, Unidad, Granularidad, Rangos, Divisiones, Ramas, Outliers.
2) Render en orden (top-down): KPIs → Serie (líneas) → Geografía (mapa + ranking) → Rangos (barras) → Divisiones (barras) → Ramas (barras) → Tabla detalle.
3) Micro-UX: leyenda clicable, brush/zoom, tooltips con valores exactos y Δ%, chips de exclusión outliers, estado vacío con mensaje.
4) Export: botón “Exportar PDF” y “Copiar enlace compartible” (URL con filtros serializados). Botones con gradiente Reverse Green↔Blue.
Salidas: Dos vistas coherentes, rápidas y con estados vacíos claros.

PROMPT 5 — Jobs y cobertura
Objetivo: Programar actualizaciones de agregados y cobertura.
Acciones:
1) Job diario (00:15 UTC) para refrescar semana/mes en curso de ambas colecciones agregadas.
2) Job semanal para consolidar semanas cerradas; mensual para meses cerrados.
3) Actualizar `agg_coverage` y mostrar en UI (tooltip/nota) la cobertura por fuente y periodo.
Salidas: Datos frescos y notas de cobertura visibles en el dashboard.
"""

---

### 9) Fase 2 — NLP (trending topics) y predicciones
- Trending topics (NLP):
  - Proceso offline (Python) mensual/semanal sobre `contenido`/texto completo; limpiar (minúsculas, lematización/stemming), eliminar stopwords comunes y “stopwords jurídicas” (p.ej., ley, norma, artículo, sanción, disposición, etc.).
  - Calcular frecuencias y TF‑IDF por periodo; variación vs periodo anterior y vs mismo periodo año anterior; umbral mínimo de apariciones.
  - Nueva colección: `tendencias_texto` con `{periodo, ambito, top_terminos: [{termino, freq, tfidf, delta_vs_prev, delta_vs_yoy}]}`.
  - Endpoints: `/api/tendencias/:tab/trending` (Top 10; filtros de ámbito/periodo).
  - Visualización: lista Top 10 con barras de variación; opcional mini word cloud.
- Predicciones (volumen):
  - Series `count_normas` y (si existe) `sum_paginas`; métodos simples: tendencia lineal y/o media móvil (SMA); horizonte 1–3 meses.
  - Guardar en `agg_forecast`: `{serie: normas|paginas, ambito, horizonte, valores: [{periodo, pred}]}`. Mostrar línea punteada y etiqueta de disclaimer (“estimación simple”).
- Extensión tramitación: integrar colecciones `PARTICIPACION_*` (consultas públicas, audiencias) cuando esté la base de referencia de fuentes; reutilizar mismos agregadores/endpoints.

---

### 10) Criterios de aceptación (Fase 1)
- Las dos pestañas cargan en <1.5s utilizando sólo colecciones agregadas.
- Vistas sin datos muestran el mensaje estándar sin errores.
- Filtros se sincronizan entre gráficas; la URL serializa el estado.
- Mapa CCAA aparece sólo cuando aplica; ranking y mapa coherentes.
- Export a PDF y enlace compartible operativos.
- Cobertura por fuente visible (tooltip/nota) incluyendo primeras fechas disponibles.

### 11) Riesgos y mitigación
- Campos faltantes (`num_paginas`, `divisiones`, `ramas_juridicas`): manejar con `not_available`, ocultar gráficos o mostrar “No identificado”.
- Heterogeneidad de fuentes: normalizar `rango` y `ambito` vía diccionarios.
- Escalabilidad: índices adecuados; limitar series simultáneas (Top 4 + Resto); usar agregados precomputados.

### 12) Resumen para el agente
- Implementar Fase 1 con los PROMPTS 1–5, creando `agg_publicada`, `agg_tramitacion`, `agg_coverage` y los endpoints `/api/tendencias/:tab/*`.
- UI minimal con filtros globales, orden de gráficas top‑down y export.
- Preparar Fase 2 para trending y forecast sin bloquear Fase 1.
