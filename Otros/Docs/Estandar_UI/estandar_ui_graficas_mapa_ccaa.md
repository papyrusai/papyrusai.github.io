## Estándar UI Reversa — Mapa de calor CCAA (Choropleth)

### Objetivo
- Definir la guía para implementar un mapa de calor de Comunidades Autónomas (CCAA) en España con estilo Reversa (D3 SVG como renderer principal y Leaflet como fallback).
- Facilitar su reutilización en nuevas vistas con un comportamiento y estilo consistentes.

### Paleta de color (Reversa tri‑stop)
- Gradiente: light‑green → green → dark‑blue.
- Stops recomendados:
  - Start (light green): rgb(217,248,238)
  - Mid (Reversa green): #04db8d
  - End (Reversa dark blue): #0b2431

Implementación JS de escala (0..1):
```javascript
function triStopColor(t){
  const clamp = (x)=> Math.max(0, Math.min(1, x));
  t = clamp(t);
  const s = { r: 217, g: 248, b: 238 };
  const g = { r: 4,   g: 219, b: 141 };
  const b = { r: 11,  g: 36,  b: 49  };
  let rr, gg, bb;
  if (t <= 0.5) {
    const tt = t / 0.5;
    rr = Math.round(s.r + (g.r - s.r) * tt);
    gg = Math.round(s.g + (g.g - s.g) * tt);
    bb = Math.round(s.b + (g.b - s.b) * tt);
  } else {
    const tt = (t - 0.5) / 0.5;
    rr = Math.round(g.r + (b.r - g.r) * tt);
    gg = Math.round(g.g + (b.g - g.g) * tt);
    bb = Math.round(g.b + (b.b - g.b) * tt);
  }
  return `rgb(${rr},${gg},${bb})`;
}
```

### Librerías y datos
- Dependencias primarias: `d3` (v7), `topojson-client` (v3). Opcional: `d3-composite-projections` para `geoConicConformalSpain` si está disponible.
- Fallback: `leaflet` (v1.9.x) + GeoJSON de CCAA.
- Datos TopoJSON preferidos: `es-atlas@0.6.0 es/autonomous_regions.json` (local o CDN).

### Accesibilidad y UX
- Tooltip flotante sobre hover con nombre de CCAA y valor.
- Resalte en hover: aumentar `stroke-width`, `brightness(1.06)` y traer al frente (D3). En Leaflet: `bringToFront()`, `weight: 2.5`, `fillOpacity: 1`.
- Click en región: filtra la CCAA en la vista (si aplica) y re-renderiza.
- Leyenda con barra de gradiente y labels “Menos | Más”.
- Estados vacíos/mensajes: “No se pudo cargar el mapa (dependencias/datos/error runtime)”.

### Estructura DOM mínima
```html
<div class="card-block grid-span-2 map-card">
  <div class="card-title-row">
    <h3>Mapa de calor CCAA</h3>
    <span class="card-subtitle">Volumen normativo por CCAA</span>
  </div>
  <div id="esHeatmap" class="heatmap-wrap"></div>
  <div id="esLeafletMap" class="heatmap-wrap" style="display:none;"></div>
  <div class="heatmap-legend" id="esLegend"></div>
</div>
```

### Estilos (extracto)
```css
.heatmap-wrap { width:100%; height:420px; border-radius:12px; }
.heatmap-legend { display:flex; align-items:center; gap:8px; margin-top:10px; }
.legend-bar { height:10px; width:200px; border-radius:8px;
  background: linear-gradient(90deg, rgb(217,248,238) 0%, #04db8d 50%, #0b2431 100%);
}
.legend-label { font-size:12px; color:#6c757d; }
```

### Proyección y ajuste (D3)
- Intentar `geoConicConformalSpain()`. Si no existe, usar `geoMercator()`.
- Ajuste seguro a contenedor via `fitSize/fitExtent` o cálculo de bounds manual (ver implementación en `busqueda_estadisticas.js`).

### Render D3 (resumen)
```javascript
const features = topojson.feature(topo, topo.objects.autonomous_regions).features;
const valuesByIso = {/* ES-AN: 0..100, ... */};
const vmax = Math.max(100, ...Object.values(valuesByIso));
const vmin = 0;

const svg = d3.select(svgEl);
const g = svg.append('g');

features.forEach(d => {
  const name = d.properties.name || d.properties.NAME || '';
  const iso = NAME_TO_ISO[name] || null;
  const v = iso ? valuesByIso[iso] : 0;
  const pathData = pathGen(d);
  const color = triStopColor((v - vmin) / (vmax - vmin || 1));
  const p = document.createElementNS('http://www.w3.org/2000/svg','path');
  p.setAttribute('d', pathData);
  p.setAttribute('fill', color);
  p.setAttribute('stroke', '#ffffff');
  p.setAttribute('stroke-width', '1.2');
  p.style.cursor = 'pointer';
  // hover highlight
  p.addEventListener('mouseenter', ()=>{ try { p.parentNode.appendChild(p); } catch(_){} p.setAttribute('stroke-width','2.2'); p.style.filter='brightness(1.06)'; });
  p.addEventListener('mouseleave', ()=>{ p.setAttribute('stroke-width','1.2'); p.style.filter=''; });
  g.node().appendChild(p);
});
```

### Render Leaflet (fallback)
- Estilo por `style(feature)` usando `triStopColor` mapeando 0..100 a 0..1.
- Eventos: `mouseover` → `bringToFront`, `weight: 2.5`, `fillOpacity: 1`; `mouseout` → `resetStyle`.

### Leyenda
```javascript
const legend = document.getElementById('esLegend');
legend.innerHTML = '';
legend.appendChild(Object.assign(document.createElement('span'),{className:'legend-label',textContent:'Menos'}));
legend.appendChild(Object.assign(document.createElement('div'),{className:'legend-bar'}));
legend.appendChild(Object.assign(document.createElement('span'),{className:'legend-label',textContent:'Más'}));
```

### Requisitos UI Reversa
- Tipografía Satoshi; uso de paleta corporativa.
- Modales estandarizados para confirmaciones; no usar `alert()/confirm()/prompt()`.
- Feedback: toasts/banners para acciones; loaders si hay procesamiento.

### Checklist de implementación
- [ ] Tri‑stop aplicado en D3 y Leaflet
- [ ] Hover resaltado (stroke, brightness/bringToFront)
- [ ] Tooltip consistente (nombre + valor)
- [ ] Leyenda con degradado tri‑stop
- [ ] Mensajes de fallback claros
- [ ] Título: “Volumen normativo por CCAA”
- [ ] Click filtra CCAA si aplica

### Referencias en repo
- `public/views/busqueda_estadisticas/busqueda_estadisticas.js` (implementación completa)
- `Otros/Docs/Estandar_UI/estandar.html` y `estandar_ui.md` (tokens, botones, modales, loaders) 