# Estándar de Gráficas Reversa

## 1) Nitidez en Chart.js (HiDPI)

- Objetivo: eliminar pixelado en líneas, ejes y tipografías en todos los gráficos.
- Implementación (JS):
```javascript
// Plugin HiDPI
const ReversaHiDpiPlugin = {
  id: 'reversaHiDpi',
  beforeInit(chart){
    const dpr = Math.max(2, (window.devicePixelRatio || 1));
    if (!chart.options.devicePixelRatio) chart.options.devicePixelRatio = dpr;
  },
  beforeDatasetsDraw(chart){
    const ctx = chart && chart.ctx;
    if (ctx) {
      try { ctx.imageSmoothingEnabled = true; } catch(_e){}
      try { ctx.imageSmoothingQuality = 'high'; } catch(_e){}
    }
  }
};

// Registro recomendado al cargar Chart.js
if (window.Chart) {
  try {
    Chart.register(ReversaHiDpiPlugin);
    Chart.defaults.devicePixelRatio = Math.max(2, (window.devicePixelRatio || 1));
  } catch(_e){}
}
```

- Opciones base para cada gráfico (con configuración temporal inteligente):
```javascript
function baseOptions(type, periodo){
  const gridColor = 'rgba(108,117,125,0.12)';
  
  // Calcular número de días para configurar las referencias del eje X
  const numDays = calculatePeriodDays(periodo);
  
  return {
    responsive: true,
    maintainAspectRatio: false,
    devicePixelRatio: Math.max(2, (window.devicePixelRatio || 1)),
    plugins: {
      legend: { display: type !== 'line' || true, labels: { color: '#455862' } },
      tooltip: {
        backgroundColor: '#0b2431',
        borderColor: '#04db8d',
        borderWidth: 2,
        titleColor: '#fff',
        bodyColor: '#fff',
        cornerRadius: 8,
        padding: 10
      }
    },
    scales: {
      x: { 
        grid: { color: gridColor, drawBorder: false }, 
        ticks: { 
          color: '#455862',
          autoSkip: false,
          callback: function(value, index) {
            const label = this.getLabelForValue(value);
            return formatXAxisLabel(label, index, numDays);
          }
        }
      },
      y: { grid: { color: gridColor, drawBorder: false }, ticks: { color: '#455862' }, beginAtZero: true }
    },
    layout: { padding: { left: 8, right: 8, top: 8, bottom: 8 } }
  };
}

function calculatePeriodDays(periodo) {
  if (!periodo) return 90; // Default
  
  switch(periodo.preset) {
    case '30': return 30;
    case '90': return 90;
    case '365': return 365;
    case 'ytd': 
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return Math.ceil((now - start) / (1000 * 60 * 60 * 24));
    case 'custom':
      if (periodo.start && periodo.end) {
        const startDate = new Date(periodo.start);
        const endDate = new Date(periodo.end);
        return Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      }
      return 90;
    default: return 90;
  }
}

function formatXAxisLabel(label, index, numDays) {
  if (!label) return '';
  
  // 30 días: referencias cada 2 días (mostrar MM/DD)
  if (numDays <= 30) {
    return index % 2 === 0 ? label.slice(5).replace('-', '/') : '';
  }
  
  // 90 días: referencias cada 7 días (mostrar MM/DD)
  if (numDays <= 92) {
    return index % 7 === 0 ? label.slice(5).replace('-', '/') : '';
  }
  
  // 365 días y YTD: referencias mensuales (solo primero de mes, mostrar YYYY-MM)
  return label && label.endsWith('-01') ? label.slice(0, 7) : '';
}
```

- Recomendaciones CSS:
```css
/* Asegurar que el canvas no escala borroso por CSS */
.chart-wrap { width: 100%; height: 320px; }
canvas { display:block; width:100%; height:100%; }
```

## 2) Gráficas de Evolución Temporal (Referencias Inteligentes)

### Configuración del Eje X según Periodo

Las gráficas temporales deben ajustar automáticamente la densidad de referencias en el eje X según el periodo seleccionado:

- **30 días**: Referencias cada 2 días (formato MM/DD)
- **90 días**: Referencias cada 7 días (formato MM/DD)  
- **365 días y YTD**: Referencias mensuales (formato YYYY-MM, solo primer día del mes)
- **Personalizado**: Según duración calculada

### Implementación

```javascript
// Crear gráfica temporal con periodo
const chart = new Chart(ctx, {
  type: 'line',
  data: { labels: dailyLabels, datasets: [seriesData] },
  options: baseOptions('line', periodObject) // ← Pasar objeto periodo
});

// El periodo debe incluir: { preset: '30'|'90'|'365'|'ytd'|'custom', start?, end? }
```

### Ejemplo de Uso

```javascript
// Datos diarios: ['2025-08-11', '2025-08-12', '2025-08-13', ...]
const periodo = { preset: '90' };
const options = baseOptions('line', periodo);

// Para 90 días → Referencias cada 7 días: 08/11, 08/18, 08/25, etc.
// Para 30 días → Referencias cada 2 días: 08/11, 08/13, 08/15, etc.
// Para 365 días → Referencias mensuales: 2025-08, 2025-09, 2025-10, etc.
```

## 3) Aplicación en nuevas vistas (ej. tracker)

- Incluir plugin y defaults de HiDPI tras cargar Chart.js (o antes de crear la instancia).
- Usar `baseOptions('line'|'bar', periodo)` como punto de partida y extender si procede.
- Para gráficas temporales, siempre pasar el objeto periodo como segundo parámetro.

## 4) Mapa de Calor CCAA (D3 + TopoJSON)

- Objetivo: mapa de coropletas de Comunidades Autónomas con proyección de España, acoplado al contenedor (sin tiles).
- Dependencias:
  - D3 v7 (`d3.v7.min.js`)
  - TopoJSON client (`topojson-client.min.js`)
  - (Opcional) `d3-composite-projections` para `geoConicConformalSpain`
- Carga robusta (fallback CDN):
```javascript
function loadScript(src){
  return new Promise((res, rej)=>{ const s=document.createElement('script'); s.src=src; s.async=true; s.onload=res; s.onerror=()=>rej(new Error('load failed '+src)); document.body.appendChild(s); });
}
async function ensureGeoLibs(){
  if (!window.d3) { try{ await loadScript('/assets/other_files/d3.v7.min.js'); } catch{ await loadScript('https://d3js.org/d3.v7.min.js'); } }
  if (!window.topojson && !window.topojsonClient) {
    try{ await loadScript('/assets/other_files/topojson-client.min.js'); }
    catch{ try{ await loadScript('https://d3js.org/topojson.v3.min.js'); } catch{ await loadScript('https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js'); } }
  }
  if (window.d3 && typeof window.d3.geoConicConformalSpain !== 'function') {
    try{ await loadScript('https://cdnjs.cloudflare.com/ajax/libs/d3-composite-projections/1.0.2/d3-composite-projections.min.js'); }
    catch{ try{ await loadScript('https://unpkg.com/d3-composite-projections@1.2.0'); } catch{} }
  }
}
```

- Datos TopoJSON (orden de fallback: local → CDN):
```javascript
async function fetchSpainTopo(){
  const urls = [
    '/assets/other_files/es-autonomous-regions.json',
    'https://unpkg.com/es-atlas@0.6.0/es/autonomous_regions.json',
    'https://cdn.jsdelivr.net/npm/es-atlas@0.6.0/es/autonomous_regions.json'
  ];
  for (const u of urls){ try { const r = await fetch(u); if (r.ok) return await r.json(); } catch(_){} }
  return null;
}
```

- Proyección y ajuste al contenedor:
```javascript
function fitProjectionToSize(projection, featureCollection, width, height, d3Ref){
  try { if (projection.fitSize) { projection.fitSize([width, height], featureCollection); return; } } catch{}
  try { if (projection.fitExtent) { projection.fitExtent([[0,0],[width,height]], featureCollection); return; } } catch{}
  // Fitting manual inspirado en d3-geo
  try { projection.clipExtent && projection.clipExtent(null); } catch{}
  try { projection.scale && projection.scale(150); } catch{}
  try { projection.translate && projection.translate([0,0]); } catch{}
  const path = d3Ref.geoPath(projection);
  const b = path.bounds(featureCollection);
  const k = Math.min(width/(b[1][0]-b[0][0]), height/(b[1][1]-b[0][1]));
  const x = (width - k*(b[1][0]+b[0][0]))/2;
  const y = (height - k*(b[1][1]+b[0][1]))/2;
  try { projection.scale && projection.scale(k*150); } catch{}
  try { projection.translate && projection.translate([x,y]); } catch{}
}
```

- Escala de color Reversa (tres paradas):
```javascript
function colorScale(val, min, max){
  const t = Math.max(0, Math.min(1, (val-min)/(max-min || 1)));
  const s = { r:217,g:248,b:238 }, g = { r:4,g:219,b:141 }, b={ r:11,g:36,b:49 };
  const lerp=(a,b,t)=> Math.round(a+(b-a)*t);
  if (t<=0.5){ const tt=t/0.5; return `rgb(${lerp(s.r,g.r,tt)},${lerp(s.g,g.g,tt)},${lerp(s.b,g.b,tt)})`; }
  const tt=(t-0.5)/0.5; return `rgb(${lerp(g.r,b.r,tt)},${lerp(g.g,b.g,tt)},${lerp(g.b,b.b,tt)})`;
}
```

- Render básico:
```javascript
async function renderSpainHeatmap(containerId){
  await ensureGeoLibs();
  const topo = await fetchSpainTopo();
  if (!topo || !window.d3) return;
  const d3Ref = window.d3;
  const topojsonRef = window.topojson || window.topojsonClient;
  const fc = topojsonRef.feature(topo, topo.objects.autonomous_regions);
  const features = fc.features;

  const container = document.getElementById(containerId);
  container.innerHTML='';
  const size = container.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','100%'); svg.setAttribute('height','100%');
  svg.setAttribute('viewBox', `0 0 ${Math.max(300,size.width)} ${Math.max(260,size.height||420)}`);
  svg.style.background = '#ffffff';
  container.appendChild(svg);

  const projection = (d3Ref.geoConicConformalSpain && typeof d3Ref.geoConicConformalSpain==='function') ? d3Ref.geoConicConformalSpain() : d3Ref.geoMercator();
  fitProjectionToSize(projection, fc, Math.max(300,size.width), Math.max(260,size.height||420), d3Ref);
  const path = d3Ref.geoPath(projection);

  // Valores demo 0..100 (sustituir por datos reales por ISO)
  const valuesByIso = Object.create(null);
  const vmax = 100, vmin = 0;

  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  svg.appendChild(g);
  features.forEach(f => {
    const dAttr = path(f); if (!dAttr) return;
    const isoName = (f.properties && (f.properties.name || f.properties.NAME)) || '';
    const v = valuesByIso[isoName] || Math.round(Math.random()*100);
    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d', dAttr);
    p.setAttribute('fill', colorScale(v, vmin, vmax));
    p.setAttribute('stroke', '#ffffff');
    p.setAttribute('stroke-width', '1.2');
    g.appendChild(p);
  });
}
```

- Notas UX:
  - Tooltip ligero sobre hover con nombre y valor.
  - Leyenda con barra degradada “Menos ↔ Más”.
  - Mantener fondo blanco y bordes sutiles (#e9ecef).

## 5) Checklist de calidad
- Canvas con `devicePixelRatio ≥ 2` y `imageSmoothing` alto.
- Sin escalados CSS no uniformes del canvas.
- Tipografías/colores alineados con Reversa UI.
- Heatmap sin tiles, responsivo, con tooltips y leyenda.

<!-- NUEVO: Guía rápida, mapping ISO y fallback opcional -->

## 0) Guía rápida (crear gráficas nítidas a la primera)

- Carga Chart.js (lazy-load si no está presente).
- Registra `ReversaHiDpiPlugin` y fuerza `Chart.defaults.devicePixelRatio` ≥ 2.
- Usa `baseOptions(type)` como base y evita escalar el canvas por CSS fuera de su contenedor.
- Verifica nitidez: texto de ejes definido y líneas sin pixelado al 100% de zoom.

```html
<!-- Contenedor -->
<div class="chart-wrap"><canvas id="myChart"></canvas></div>

<script>
(function(){
  function init(){
    try { Chart.register(ReversaHiDpiPlugin); Chart.defaults.devicePixelRatio = Math.max(2, (window.devicePixelRatio||1)); } catch(_){}
    const ctx = document.getElementById('myChart');
    const data = { labels: ['Ene','Feb','Mar'], datasets: [{ label:'Total', data:[10,18,12], borderColor:'#0b2431', backgroundColor:'#0b2431', tension:0.25, pointRadius:0 }] };
    new Chart(ctx, { type:'line', data, options: baseOptions('line') });
  }
  if (typeof Chart === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    s.onload = init;
    document.body.appendChild(s);
  } else { init(); }
})();
</script>
```

### CSS mínimo
```css
.chart-wrap { width:100%; height:320px; }
#myChart { display:block; width:100%; height:100%; }
```

## 4.1) Mapeo nombre → ISO 3166-2 (CCAA España)

Usa este diccionario para unificar nombres del TopoJSON/GeoJSON a códigos ISO consistentes en tus datos:
```javascript
const CCAA_NAME_TO_ISO = {
  'Andalucía': 'ES-AN',
  'Aragón': 'ES-AR',
  'Principado de Asturias': 'ES-AS',
  'Illes Balears': 'ES-IB', 'Islas Baleares': 'ES-IB',
  'Canarias': 'ES-CN',
  'Cantabria': 'ES-CB',
  'Castilla y León': 'ES-CL',
  'Castilla-La Mancha': 'ES-CM',
  'Cataluña': 'ES-CT', 'Catalunya': 'ES-CT', 'Cataluña/Catalunya': 'ES-CT',
  'Comunidad Valenciana': 'ES-VC', 'C. Valenciana': 'ES-VC', 'Comunitat Valenciana': 'ES-VC',
  'Extremadura': 'ES-EX',
  'Galicia': 'ES-GA',
  'La Rioja': 'ES-RI',
  'Comunidad de Madrid': 'ES-MD', 'Madrid': 'ES-MD',
  'Región de Murcia': 'ES-MC', 'Murcia': 'ES-MC',
  'Comunidad Foral de Navarra': 'ES-NC', 'Navarra': 'ES-NC',
  'País Vasco': 'ES-PV', 'Euskadi': 'ES-PV', 'País Vasco/Euskadi': 'ES-PV',
  'Ceuta': 'ES-CE', 'Ciudad Autónoma de Ceuta': 'ES-CE',
  'Melilla': 'ES-ML', 'Ciudad Autónoma de Melilla': 'ES-ML'
};
```

Cómo usarlo al pintar:
```javascript
const name = (feature.properties && (feature.properties.name || feature.properties.NAME)) || '';
const iso = CCAA_NAME_TO_ISO[name] || null;
const value = iso ? valuesByIso[iso] : 0;
```

## 4.2) Fallback vectorial con Leaflet (opcional)

Si prefieres un renderizador vectorial con auto-fit y tooltips, puedes usar Leaflet sin tiles.

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<div id="esLeafletMap" style="width:100%;height:420px;border-radius:12px;background:#fff;"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(async function(){
  const resp = await fetch('/assets/other_files/spain-ccaa.geojson').catch(()=>null);
  const geo = resp && resp.ok ? await resp.json() : null;
  if (!geo || !window.L) return;
  const map = L.map('esLeafletMap', { zoomControl:false, attributionControl:false, dragging:false, scrollWheelZoom:false, doubleClickZoom:false, boxZoom:false, keyboard:false, tap:false, touchZoom:false });
  const gjLayer = L.geoJSON(geo);
  map.fitBounds(gjLayer.getBounds(), { padding:[10,10] });
  function triStopColor(v){
    const t = Math.max(0, Math.min(1, (v||0)/100));
    const s={r:217,g:248,b:238}, g={r:4,g:219,b:141}, b={r:11,g:36,b:49};
    const mix=(a,b,t)=>Math.round(a+(b-a)*t);
    if (t<=.5){ const tt=t/.5; return `rgb(${mix(s.r,g.r,tt)},${mix(s.g,g.g,tt)},${mix(s.b,g.b,tt)})`; }
    const tt=(t-.5)/.5; return `rgb(${mix(g.r,b.r,tt)},${mix(g.g,b.g,tt)},${mix(g.b,b.b,tt)})`;
  }
  const valuesByName = {};
  (geo.features||[]).forEach(f=>{ const n=(f.properties&&(f.properties.name||f.properties.ccaa_name||f.properties.nom_comunidad))||''; valuesByName[n]=Math.round(Math.random()*100); });
  function style(f){
    const n=(f.properties&&(f.properties.name||f.properties.ccaa_name||f.properties.nom_comunidad))||'';
    const v=valuesByName[n]||0;
    return { fillColor: triStopColor(v), weight:1, opacity:1, color:'#ffffff', fillOpacity:.9 };
  }
  function onEach(f, layer){
    const n=(f.properties&&(f.properties.name||f.properties.ccaa_name||f.properties.nom_comunidad))||'';
    const v=valuesByName[n]||0;
    layer.on({ mouseover:(e)=>{ e.target.setStyle({ weight:2.5, color:'#e9ecef', fillOpacity:1 }); try{ e.target.bringToFront(); }catch(_){} }, mouseout:(e)=>{ gj.resetStyle(e.target); } });
    layer.bindTooltip(`<strong>${n}</strong><div style="font-size:12px;color:#6c757d;">Volumen: <b>${v}</b></div>`, { sticky:true, direction:'top', opacity:.95 });
  }
  const gj = L.geoJSON(geo, { style, onEachFeature:onEach }).addTo(map);
})();
</script>
```

## 6) Errores frecuentes y verificación

- Doble escalado del canvas: evita fijar `width/height` en CSS que no respeten el contenedor; usa `.chart-wrap` + `canvas { width:100%; height:100%; }`.
- Registro tardío del plugin: registra `ReversaHiDpiPlugin` antes de crear instancias de `Chart`.
- DPR bajo en pantallas retina: fuerza `Chart.defaults.devicePixelRatio = Math.max(2, window.devicePixelRatio||1)`.
- Reutilizar el mismo `canvas` sin `destroy()`: destruye la instancia previa antes de crear otra.
- Fuentes borrosas por `transform: scale(...)` en contenedores: evita transformaciones que afecten al canvas.
- Dependencias del mapa: si falla D3/TopoJSON, usa los fallbacks CDN o el fallback Leaflet.
- Nombres CCAA no unificados: normaliza con `CCAA_NAME_TO_ISO` antes de cruzar datos.

### Checklist de verificación rápida
- El texto de ejes y ticks se ve nítido al 100% de zoom y a DPR>1.
- Líneas y bordes no muestran aliasing notable.
- Cambiar de tamaño del contenedor mantiene nitidez (no estira un bitmap ya rasterizado).
- En el mapa, el relleno usa el degradado Reversa y los tooltips muestran nombre + valor.
