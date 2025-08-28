(function(){
  // Ensure Chart.js is available (loaded elsewhere like profile.html)
  // Dummy data generator and state management for the tendencias dashboard

  const state = {
    tab: 'publicada', // 'publicada' | 'tramitacion' | 'sanciones'
    ambito: 'nacional', // 'nacional' | 'europeo' | 'regional'
    ccaa: [],
    periodo: { preset: '90', start: null, end: null },
    rangos: ['Todos'],
    divisiones: ['Todos'],
    ramas: ['Todos'],
    excluirOutliers: true
  };

  let charts = {
    serie: null,
    ranking: null,
    rangos: null,
    divisiones: null,
    ramas: null
  };

  // Colors
  const colors = {
    primary: '#0b2431',
    accent: '#04db8d',
    slate: '#455862',
    palette: ['#0b2431', '#04db8d', '#6c757d', '#17a2b8', '#6610f2', '#fd7e14', '#20c997', '#e83e8c']
  };

  // --- Beta gate (easy toggle to remove later) ---
  const BETA_GUARD_ENABLED = true; // Set to false to show to everyone
  const BETA_ALLOWED_EMAILS = ['tomas@reversa.ai'];

  function getCookie(name){
    const m = document.cookie.split('; ').find(row => row.startsWith(name + '='));
    return m ? m.split('=')[1] : null;
  }

  function getCurrentUserEmail(){
    let email = '';
    const el = document.getElementById('userEmail');
    if (el && el.textContent) {
      try {
        email = JSON.parse(el.textContent.trim());
      } catch(_e) {
        email = (el.textContent || '').trim().replace(/^"|"$/g, '');
      }
    }
    if (!email) {
      const c = getCookie('userEmail');
      if (c) { try { email = decodeURIComponent(c); } catch(_e) { email = c; } }
    }
    if (!email) {
      email = sessionStorage.getItem('userEmail') || '';
    }
    return (email || '').toLowerCase();
  }

  function isBetaAllowed(){
    if (!BETA_GUARD_ENABLED) return true;
    const email = getCurrentUserEmail();
    return BETA_ALLOWED_EMAILS.includes(email);
  }

  function applyBetaGate(){
    const allowed = isBetaAllowed();
    const container = document.querySelector('.tendencias-container');
    const badge = document.getElementById('betaGateBadge');

    if (!BETA_GUARD_ENABLED) {
      if (container) container.classList.add('beta-allowed');
      if (badge) badge.style.display = 'none';
      return true;
    }

    if (container) {
      if (allowed) container.classList.add('beta-allowed');
      else container.classList.remove('beta-allowed');
    }
    if (badge) badge.style.display = (BETA_GUARD_ENABLED && allowed) ? 'inline-block' : 'none';
    return allowed;
  }

  function $(id){ return document.getElementById(id); }

  function fmtNumber(n){
    if (n == null) return '—';
    if (n >= 1000000) return (n/1000000).toFixed(1)+'M';
    if (n >= 1000) return (n/1000).toFixed(1)+'k';
    return String(n);
  }

  // Dummy data synthesis
  function generateMonthlyLabels(monthsBack){
    const labels = [];
    const now = new Date();
    for (let i = monthsBack - 1; i >= 0; i--){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
    return labels;
  }

  function randomSeries(len, base){
    let v = base;
    return Array.from({length: len}, () => {
      v = Math.max(0, v + Math.round((Math.random()-0.5)*base*0.2));
      return v;
    });
  }

  function computeKPIs(series){
    const total = series.reduce((a,b)=>a+b,0);
    const paginas = Math.round(total * (6 + Math.random()*10));
    const sorted = [...series].sort((a,b)=>a-b);
    const mid = Math.floor(sorted.length/2);
    const mediana = sorted.length % 2 === 0 ? Math.round((sorted[mid-1]+sorted[mid])/2) : sorted[mid];
    const delta = (Math.random()*40 - 20).toFixed(1);
    const topRango = ['Resolución','Orden','Real Decreto','Ley','Reglamento'][Math.floor(Math.random()*5)];
    const topDivision = ['Tecnología','Energía','Servicios financieros','Sanidad'][Math.floor(Math.random()*4)];
    return { total, paginas, mediana, delta, topRango, topDivision };
  }

  function buildDataset(label, data, idx){
    const color = colors.palette[idx % colors.palette.length];
    return {
      label,
      data,
      fill: false,
      backgroundColor: color,
      borderColor: color,
      tension: 0.25,
      borderWidth: 2,
      pointRadius: 0
    };
  }

  function renderCharts(){
    // Coming soon tabs
    const comingSoon = (state.tab === 'tramitacion' || state.tab === 'sanciones');
    const dash = document.getElementById('dashContent');
    const soon = document.getElementById('comingSoonBlock');
    if (dash && soon){
      dash.style.display = comingSoon ? 'none' : 'block';
      soon.style.display = comingSoon ? 'block' : 'none';
      if (comingSoon) return;
    }

    // labels (monthly only)
    const labels = generateMonthlyLabels(12);

    // Serie temporal (sin apilado)
    const datasets = [buildDataset('Total', randomSeries(labels.length, 30), 0)];

    upsertLineChart('serieChart', 'serie', labels, datasets);

    // Ranking CCAA
    const ccaa = ['ES-AN','ES-AR','ES-AS','ES-CT','ES-GA','ES-MD','ES-PV','ES-VC'];
    const values = ccaa.map(()=> Math.round(50 + Math.random()*300));
    upsertBarChart('rankingChart', 'ranking', ccaa, [{ label: 'Volumen', data: values, backgroundColor: values.map(()=> 'rgba(11,36,49,0.85)') }], 'horizontal');

    // Rangos (barras azul oscuro como resto)
    const rangos = ['Ley','Real Decreto','Orden','Resolución','Reglamento'];
    const datosRangos = rangos.map(()=> Math.round(10+Math.random()*60));
    upsertBarChart('rangosChart', 'rangos', rangos, [{ label: '#', data: datosRangos, backgroundColor: 'rgba(11,36,49,0.85)' }]);

    // Sectores económicos
    const divisiones = ['Tecnología','Energía','Finanzas','Sanidad','Transporte','Industria','Administración pública'];
    const datosDiv = divisiones.map(()=> Math.round(10+Math.random()*80));
    upsertBarChart('divisionesChart', 'divisiones', divisiones, [{ label: '#', data: datosDiv, backgroundColor: 'rgba(11,36,49,0.85)' }], 'horizontal');

    // Ramas
    const ramas = ['Laboral','Fiscal','Mercantil','Administrativo','Digital','Consumo'];
    const datosRamas = ramas.map(()=> Math.round(5+Math.random()*50));
    upsertBarChart('ramasChart', 'ramas', ramas, [{ label: '#', data: datosRamas, backgroundColor: 'rgba(69,88,98,0.9)' }], 'horizontal');

    // KPIs
    const totalSeries = datasets.length === 1 ? datasets[0].data : datasets.reduce((acc, ds) => acc.map((v,i)=> v + ds.data[i]), new Array(labels.length).fill(0));
    const k = computeKPIs(totalSeries);
    $('kpiNormas').textContent = fmtNumber(k.total);
    $('kpiPaginas').textContent = fmtNumber(k.paginas);
    $('kpiMediana').textContent = fmtNumber(k.mediana);
    $('kpiDelta').textContent = `${k.delta}%`;
    $('kpiTopRango').textContent = k.topRango;
    $('kpiTopDivision').textContent = k.topDivision;

    // Meta
    const nowStr = new Date().toLocaleString();
    $('lastUpdated').textContent = `Última actualización: ${nowStr}`;

    // Geo subtitle (dynamic start date)
    const startDate = computeStartDateLabel(state.periodo);
    const geoSub = document.getElementById('geoHeatmapSubtitle');
    if (geoSub) geoSub.textContent = `Datos desde: ${startDate}`;

    // Heatmap: prefer static D3 choropleth (minimalista, sin tiles); Leaflet queda como fallback
    renderSpainHeatmap();
  }

  function upsertLineChart(canvasId, key, labels, datasets){
    const ctx = $(canvasId);
    if (!ctx) return;
    if (charts[key]) { charts[key].destroy(); charts[key]=null; }
    charts[key] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: baseOptions('line')
    });
  }

  function upsertBarChart(canvasId, key, labels, datasets, orientation){
    const ctx = $(canvasId);
    if (!ctx) return;
    if (charts[key]) { charts[key].destroy(); charts[key]=null; }
    const opts = baseOptions('bar');
    if (orientation === 'horizontal'){
      opts.indexAxis = 'y';
    }
    charts[key] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: opts
    });
  }

  function baseOptions(type){
    const gridColor = 'rgba(108,117,125,0.12)';
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: type !== 'line' || true, labels: { color: colors.slate } },
        tooltip: {
          backgroundColor: colors.primary,
          borderColor: colors.accent,
          borderWidth: 2,
          titleColor: '#fff',
          bodyColor: '#fff',
          cornerRadius: 8,
          padding: 10
        },
        zoom: undefined
      },
      scales: {
        x: { grid: { color: gridColor, drawBorder: false }, ticks: { color: colors.slate } },
        y: { grid: { color: gridColor, drawBorder: false }, ticks: { color: colors.slate }, beginAtZero: true }
      },
      layout: { padding: { left: 8, right: 8, top: 8, bottom: 8 } }
    };
  }

  // --- Spain heatmap (TopoJSON + D3 composite projection) ---
  // Cache & loaders
  let __geoLibsLoaded = false;
  let __geoLibsLoading = null;
  let __spainTopo = null; // TopoJSON

  // Name → ISO 3166-2 mapping for CCAA (dataset uses Spanish names)
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

  function loadScript(src){
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load '+src));
      document.body.appendChild(s);
    });
  }

  function ensureGeoLibs(){
    if (__geoLibsLoaded) return Promise.resolve();
    if (__geoLibsLoading) return __geoLibsLoading;
    // Load D3, then TopoJSON, then (optional) Spain composite projection
    __geoLibsLoading = (typeof window.d3 === 'undefined' ? loadScript('/assets/other_files/d3.v7.min.js') : Promise.resolve())
      .catch(()=> loadScript('https://d3js.org/d3.v7.min.js'))
      .then(() => {
        if (typeof window.topojson === 'undefined' && typeof window.topojsonClient === 'undefined'){
          return loadScript('/assets/other_files/topojson-client.min.js')
            .catch(()=> loadScript('https://d3js.org/topojson.v3.min.js'))
            .catch(()=> loadScript('https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js'));
        }
      })
      .then(() => {
        // Try to load a safe build of d3-composite-projections that does not overwrite window.d3
        if (!window.d3 || typeof window.d3.geoConicConformalSpain === 'function') return;
        return loadScript('https://cdnjs.cloudflare.com/ajax/libs/d3-composite-projections/1.0.2/d3-composite-projections.min.js')
          .catch(()=> loadScript('https://unpkg.com/d3-composite-projections@1.2.0'))
          .catch(()=> Promise.resolve());
      })
      .then(() => { __geoLibsLoaded = true; });
    return __geoLibsLoading;
  }

  function fetchSpainTopo(){
    if (__spainTopo) return Promise.resolve(__spainTopo);
    // Try local first, then pinned unpkg, then jsdelivr
    const urls = [
      '/assets/other_files/es-autonomous-regions.json',
      'https://unpkg.com/es-atlas@0.6.0/es/autonomous_regions.json',
      'https://cdn.jsdelivr.net/npm/es-atlas@0.6.0/es/autonomous_regions.json'
    ];
    let idx = 0;
    function tryNext(){
      if (idx >= urls.length) return Promise.resolve(null);
      const url = urls[idx++];
      return fetch(url).then(r => r.ok ? r.json() : Promise.reject()).then(json => { __spainTopo = json; return __spainTopo; }).catch(()=> tryNext());
    }
    return tryNext();
  }

  function colorScale(val, min, max){
    const tRaw = (val - min) / (max - min || 1);
    const t = Math.max(0, Math.min(1, tRaw));
    // Reversa tri-stop gradient: light-green -> green -> dark-blue
    const s = { r: 217, g: 248, b: 238 }; // light Reversa green
    const g = { r: 4,   g: 219, b: 141 }; // Reversa green
    const b = { r: 11,  g: 36,  b: 49  }; // Reversa dark blue
    let rr, gg, bb;
    if (t <= 0.5) {
      const tt = t / 0.5; // 0..1 from start to mid
      rr = Math.round(s.r + (g.r - s.r) * tt);
      gg = Math.round(s.g + (g.g - s.g) * tt);
      bb = Math.round(s.b + (g.b - s.b) * tt);
    } else {
      const tt = (t - 0.5) / 0.5; // 0..1 from mid to end
      rr = Math.round(g.r + (b.r - g.r) * tt);
      gg = Math.round(g.g + (b.g - g.g) * tt);
      bb = Math.round(g.b + (b.b - g.b) * tt);
    }
    return `rgb(${rr},${gg},${bb})`;
  }

  // Fit any d3 projection to a FeatureCollection and size (safe for builds without fitSize)
  function fitProjectionToSize(projection, featureCollection, width, height, d3Ref){
    try {
      if (typeof projection.fitSize === 'function') {
        projection.fitSize([width, height], featureCollection);
        return;
      }
      if (typeof projection.fitExtent === 'function') {
        projection.fitExtent([[0,0],[width,height]], featureCollection);
        return;
      }
    } catch(_e) {/* ignore */}

    // Manual fit (mirrors d3-geo implementation)
    let clip = null;
    try { if (typeof projection.clipExtent === 'function') clip = projection.clipExtent(); } catch(_e){}
    try { if (typeof projection.clipExtent === 'function') projection.clipExtent(null); } catch(_e){}
    try { if (typeof projection.scale === 'function') projection.scale(150); } catch(_e){}
    try { if (typeof projection.translate === 'function') projection.translate([0,0]); } catch(_e){}
    const pathForBounds = d3Ref.geoPath(projection);
    const b = pathForBounds.bounds(featureCollection);
    const k = Math.min(width / (b[1][0] - b[0][0]), height / (b[1][1] - b[0][1]));
    const x = (width - k * (b[1][0] + b[0][0])) / 2;
    const y = (height - k * (b[1][1] + b[0][1])) / 2;
    try { if (typeof projection.scale === 'function') projection.scale(k * 150); } catch(_e){}
    try { if (typeof projection.translate === 'function') projection.translate([x, y]); } catch(_e){}
    try { if (clip && typeof projection.clipExtent === 'function') projection.clipExtent(clip); } catch(_e){}
  }

  function getWrapperSize(el){
    const rect = el.getBoundingClientRect();
    return { width: Math.max(300, rect.width), height: Math.max(260, rect.height || 420) };
  }

  function renderSpainHeatmap(){
    const container = document.getElementById('esHeatmap');
    if (!container) return;
    container.innerHTML = '';

    // If ámbito not ES-related, show placeholder quietly
    const isES = (state.ambito === 'autonomico' || state.ambito === 'nacional');
    if (!isES){
      const placeholder = document.createElement('div');
      placeholder.className = 'map-placeholder';
      placeholder.textContent = 'Mapa CCAA no aplicable para este ámbito';
      container.appendChild(placeholder);
      const legend = document.getElementById('esLegend');
      if (legend) legend.innerHTML = '';
      return;
    }

    // Load libs and data, then draw
    ensureGeoLibs().then(() => fetchSpainTopo()).then((topo) => {
      if (!topo || !window.d3) {
        const fallback = document.createElement('div');
        fallback.className = 'map-placeholder';
        fallback.textContent = 'No se pudo cargar el mapa (dependencias)';
        container.appendChild(fallback);
        return;
      }

      try {
        const topojsonRef = window.topojson || window.topojsonClient;
        if (!topojsonRef || !topo.objects || !topo.objects.autonomous_regions) {
          console.error('TopoJSON no disponible o formato inesperado', { topojsonRef, topo });
          const fallback = document.createElement('div');
          fallback.className = 'map-placeholder';
          fallback.textContent = 'No se pudo cargar el mapa (datos)';
          container.appendChild(fallback);
          return;
        }

        const features = topojsonRef.feature(topo, topo.objects.autonomous_regions).features;

        // Build dummy values (0..100) per ISO code
        const valuesByIso = {};
        features.forEach(f => {
          const name = (f.properties && (f.properties.name || f.properties.NAME)) || '';
          const iso = CCAA_NAME_TO_ISO[name] || null;
          if (iso) valuesByIso[iso] = Math.round(Math.random()*100);
        });
        const vals = Object.values(valuesByIso);
        const vmax = Math.max(100, ...vals);
        const vmin = 0;

        // Prepare SVG
        const wrap = document.createElement('div');
        wrap.style.position='relative'; wrap.style.width='100%'; wrap.style.height='100%';
        const size = getWrapperSize(container);

        const d3Ref = window.d3;
        const svgEl = document.createElementNS('http://www.w3.org/2000/svg','svg');
        svgEl.setAttribute('width','100%');
        svgEl.setAttribute('height','100%');
        svgEl.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
        svgEl.style.background = '#ffffff';
        wrap.appendChild(svgEl);

        // Tooltip (custom)
        const tip = document.createElement('div');
        tip.style.position='absolute'; tip.style.pointerEvents='none'; tip.style.transform='translate(-50%, -120%)';
        tip.style.background='white'; tip.style.border='1px solid #e9ecef'; tip.style.boxShadow='0 8px 24px rgba(11,36,49,.15)';
        tip.style.borderRadius='10px'; tip.style.padding='10px 12px'; tip.style.fontSize='12px'; tip.style.display='none';
        tip.style.color = '#0b2431'; tip.style.minWidth='160px';

        container.appendChild(wrap);
        wrap.appendChild(tip);

        // Projection and path
        const projection = (d3Ref.geoConicConformalSpain && typeof d3Ref.geoConicConformalSpain === 'function') ? d3Ref.geoConicConformalSpain() : d3Ref.geoMercator();
        // Fit projection accurately to the FC size
        const featureCollection = topojsonRef.feature(topo, topo.objects.autonomous_regions);
        fitProjectionToSize(projection, featureCollection, size.width, size.height, d3Ref);
        const pathGen = d3Ref.geoPath(projection);

        // Draw regions
        const gEl = document.createElementNS('http://www.w3.org/2000/svg','g');
        svgEl.appendChild(gEl);
        features.forEach(d => {
          const name = (d.properties && (d.properties.name || d.properties.NAME)) || '';
          const iso = CCAA_NAME_TO_ISO[name] || null;
          const v = (iso && valuesByIso[iso] != null) ? valuesByIso[iso] : 0;
          const pathNode = document.createElementNS('http://www.w3.org/2000/svg','path');
          pathNode.setAttribute('class','region');
          const dAttr = pathGen(d);
          if (!dAttr) { return; }
          pathNode.setAttribute('d', dAttr);
          pathNode.setAttribute('fill', colorScale(v, vmin, vmax));
          pathNode.setAttribute('stroke', '#ffffff');
          pathNode.setAttribute('stroke-width', '1.2');
          pathNode.style.cursor = 'pointer';
          // Highlight on hover (bring to front + subtle emphasis)
          pathNode.addEventListener('mouseenter', ()=>{
            try { if (pathNode.parentNode) pathNode.parentNode.appendChild(pathNode); } catch(_e){}
            pathNode.setAttribute('stroke-width', '2.2');
            pathNode.style.filter = 'brightness(1.06)';
          });
          pathNode.addEventListener('mousemove', (event)=>{
            const rect = svgEl.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            tip.innerHTML = `<div style=\"font-weight:700;margin-bottom:4px;\">${name}</div>
              <div style=\"display:flex;align-items:center;gap:8px;\">\n                <span style=\"font-size:12px;color:#6c757d;\">Volumen:</span>\n                <span style=\"font-weight:700;\">${v}</span>\n              </div>`;
            tip.style.left = x + 'px';
            tip.style.top = y + 'px';
            tip.style.display = 'block';
          });
          pathNode.addEventListener('mouseleave', ()=>{
            tip.style.display='none';
            pathNode.setAttribute('stroke-width', '1.2');
            pathNode.style.filter = '';
          });
          pathNode.addEventListener('click', ()=>{
            if (!iso) return;
            if (!state.ccaa.includes(iso)) state.ccaa = [iso];
            if ($('selectCCAA')) Array.from($('selectCCAA').options).forEach(o=> o.selected = state.ccaa.includes(o.value));
            renderCharts();
          });
          gEl.appendChild(pathNode);
        });

        // Composition borders (projection zones)
        if (typeof projection.getCompositionBorders === 'function'){
          const borderPath = document.createElementNS('http://www.w3.org/2000/svg','path');
          borderPath.setAttribute('d', projection.getCompositionBorders());
          borderPath.setAttribute('fill','none');
          borderPath.setAttribute('stroke','#e9ecef');
          borderPath.setAttribute('stroke-width','1');
          svgEl.appendChild(borderPath);
        }

        // Legend
        const legend = document.getElementById('esLegend');
        if (legend){
          legend.innerHTML = '';
          const minL = document.createElement('span'); minL.className='legend-label'; minL.textContent='Menos';
          const bar = document.createElement('div'); bar.className='legend-bar';
          const maxL = document.createElement('span'); maxL.className='legend-label'; maxL.textContent='Más';
          legend.appendChild(minL); legend.appendChild(bar); legend.appendChild(maxL);
        }
      } catch (err) {
        console.error('Error renderizando mapa', err);
        const fallback = document.createElement('div');
        fallback.className = 'map-placeholder';
        fallback.textContent = 'No se pudo cargar el mapa (error runtime)';
        container.appendChild(fallback);
      }
    }).catch((err)=>{
      console.error('Fallo al cargar dependencias o datos del mapa', err);
      const fallback = document.createElement('div');
      fallback.className = 'map-placeholder';
      fallback.textContent = 'No se pudo cargar el mapa';
      container.appendChild(fallback);
    });
  }

  let __leafletLoaded = false;
  let __leafletLoading = null;

  function loadCss(href){
    return new Promise((resolve, reject)=>{
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href; l.onload = resolve; l.onerror = ()=>reject(new Error('Failed css '+href));
      document.head.appendChild(l);
    });
  }

  function ensureLeaflet(){
    if (__leafletLoaded) return Promise.resolve();
    if (__leafletLoading) return __leafletLoading;
    const cssLocal = loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css').catch(()=> loadCss('/assets/other_files/leaflet.css'));
    const jsLocal = (typeof window.L === 'undefined') ? loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js').catch(()=> loadScript('/assets/other_files/leaflet.js')) : Promise.resolve();
    __leafletLoading = cssLocal.then(()=> jsLocal).then(()=>{ __leafletLoaded = true; });
    return __leafletLoading;
  }

  function fetchSpainGeoJSON(){
    const urls = [
      '/assets/other_files/spain-ccaa.geojson',
      'https://public.opendatasoft.com/api/records/1.0/search/?dataset=georef-spain-comunidad-autonoma&rows=100&format=geojson'
    ];
    let i=0;
    function next(){ if (i>=urls.length) return Promise.resolve(null); const u = urls[i++]; return fetch(u).then(r=> r.ok ? r.json(): Promise.reject()).catch(next); }
    return next();
  }

  function renderSpainHeatmapLeaflet(){
    const mapEl = document.getElementById('esLeafletMap');
    const svgEl = document.getElementById('esHeatmap');
    if (!mapEl) return;

    const isES = (state.ambito === 'autonomico' || state.ambito === 'nacional');
    if (!isES){ mapEl.style.display='none'; if (svgEl) svgEl.style.display='none'; return; }

    ensureLeaflet().then(()=> fetchSpainGeoJSON()).then(geo =>{
      if (!geo || !window.L){
        // fallback to D3 renderer
        mapEl.style.display='none'; if (svgEl){ svgEl.style.display='block'; }
        renderSpainHeatmap();
        return;
      }

      // Hide D3 block, use Leaflet
      if (svgEl){ svgEl.style.display='none'; svgEl.innerHTML=''; }
      mapEl.style.display='block'; mapEl.innerHTML='';
      mapEl.style.background = '#ffffff';

      // Create map
      const map = L.map(mapEl, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false,
        touchZoom: false
      });
      // Fit to Spain bounds from geojson
      const gjLayer = L.geoJSON(geo);
      const bounds = gjLayer.getBounds();
      map.fitBounds(bounds, { padding: [10,10] });

      // Dummy values per CCAA (0..100) keyed by ISO (code not always present, use properties.ccaa_name / name)
      const valuesByName = {};
      (geo.features || []).forEach(f => {
        const name = (f.properties && (f.properties.name || f.properties.ccaa_name || f.properties.nom_comunidad)) || '';
        if (name) valuesByName[name] = Math.round(Math.random()*100);
      });

      function getColor(v){
        // Reversa tri-stop gradient (light-green -> green -> dark-blue)
        const t = Math.max(0, Math.min(1, (v||0)/100));
        const s = { r: 217, g: 248, b: 238 }; // light Reversa green
        const g = { r: 4,   g: 219, b: 141 }; // Reversa green
        const b = { r: 11,  g: 36,  b: 49  }; // Reversa dark blue
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

      function style(feature){
        const name = (feature.properties && (feature.properties.name || feature.properties.ccaa_name || feature.properties.nom_comunidad)) || '';
        const v = valuesByName[name] || 0;
        return {
          fillColor: getColor(v),
          weight: 1,
          opacity: 1,
          color: '#ffffff',
          fillOpacity: 0.9
        };
      }

      function onEach(feature, layer){
        const name = (feature.properties && (feature.properties.name || feature.properties.ccaa_name || feature.properties.nom_comunidad)) || '';
        const v = valuesByName[name] || 0;
        layer.on({
          mouseover: (e)=>{ e.target.setStyle({ weight: 2.5, color: '#e9ecef', fillOpacity: 1 }); try { e.target.bringToFront && e.target.bringToFront(); } catch(_e){} },
          mouseout: (e)=>{ gj.resetStyle(e.target); },
          click: ()=>{
            // Map name to ISO known mapping used elsewhere if possible
            const iso = CCAA_NAME_TO_ISO[name] || null;
            if (iso){ state.ccaa = [iso]; if ($('selectCCAA')) Array.from($('selectCCAA').options).forEach(o=> o.selected = state.ccaa.includes(o.value)); }
            renderCharts();
          }
        });
        layer.bindTooltip(`<div style="font-weight:700;margin-bottom:4px;">${name}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:12px;color:#6c757d;">Volumen:</span>
            <span style="font-weight:700;">${v}</span>
          </div>`, { sticky: true, direction: 'top', opacity: 0.95 });
      }

      const gj = L.geoJSON(geo, { style, onEachFeature: onEach }).addTo(map);

      // Legend stays as-is
      const legend = document.getElementById('esLegend');
      if (legend){ legend.innerHTML=''; const minL=document.createElement('span'); minL.className='legend-label'; minL.textContent='Menos'; const bar=document.createElement('div'); bar.className='legend-bar'; const maxL=document.createElement('span'); maxL.className='legend-label'; maxL.textContent='Más'; legend.appendChild(minL); legend.appendChild(bar); legend.appendChild(maxL); }
    }).catch(err=>{
      console.error('Leaflet render failed, fallback to D3', err);
      if (document.getElementById('esHeatmap')){ document.getElementById('esHeatmap').style.display='block'; }
      renderSpainHeatmap();
    });
  }

  function bindChipSelect({boxId, chipsId, dropdownId, clearId, stateArray}){
    const box = document.getElementById(boxId);
    const chipsContainer = document.getElementById(chipsId);
    const dropdown = document.getElementById(dropdownId);
    const clearBtn = document.getElementById(clearId);

    function open(){
      box.classList.add('active');
      const rect = box.getBoundingClientRect();
      dropdown.style.minWidth = rect.width + 'px';
      dropdown.classList.add('open');
    }
    function close(){ dropdown.classList.remove('open'); box.classList.remove('active'); }

    function renderChips(){
      chipsContainer.innerHTML = '';
      const values = state[stateArray];
      values.forEach(v => {
        const span = document.createElement('span');
        span.className = 'chip-bubble selected';
        span.dataset.value = v;
        span.innerHTML = `${v} <span class="chip-x">×</span>`;
        span.querySelector('.chip-x').addEventListener('click', (e)=>{
          e.stopPropagation();
          removeValue(v);
        });
        chipsContainer.appendChild(span);
      });
    }

    function addValue(value){
      if (value === 'Todos') {
        state[stateArray] = ['Todos'];
      } else {
        let current = state[stateArray].filter(v => v !== 'Todos');
        if (!current.includes(value)) current.push(value);
        state[stateArray] = current;
      }
      renderChips();
      renderCharts();
    }

    function removeValue(value){
      let current = state[stateArray].slice();
      current = current.filter(v => v !== value);
      if (current.length === 0) current = ['Todos'];
      state[stateArray] = current;
      renderChips();
      renderCharts();
    }

    box.addEventListener('click', (e)=>{ e.stopPropagation(); open(); });
    clearBtn.addEventListener('click', (e)=>{ e.stopPropagation(); state[stateArray] = ['Todos']; renderChips(); renderCharts(); });
    dropdown.querySelectorAll('.dropdown-item').forEach(item => item.addEventListener('click', (e)=>{
      e.stopPropagation();
      const val = item.dataset.value;
      addValue(val);
    }));
    document.addEventListener('click', ()=> close());

    renderChips();
  }

  function bindEvents(){
    // Tabs
    document.querySelectorAll('.tab-link').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-link').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        state.tab = btn.dataset.tab;
        renderCharts();
      });
    });

    // Ambito submenu
    document.querySelectorAll('.ambito-link')?.forEach(a => {
      a.addEventListener('click', ()=>{
        document.querySelectorAll('.ambito-link').forEach(x=> x.classList.remove('active'));
        a.classList.add('active');
        const value = a.dataset.ambito;
        state.ambito = value;
        const showRegional = value === 'regional';
        const regSel = document.getElementById('regionalSelector');
        if (regSel) regSel.style.display = showRegional ? 'flex' : 'none';
        renderCharts();
      });
    });

    // Chip-selects
    bindChipSelect({ boxId:'rangosSelect', chipsId:'rangosChips', dropdownId:'rangosDropdown', clearId:'rangosClear', stateArray:'rangos' });
    bindChipSelect({ boxId:'divisionesSelect', chipsId:'divisionesChips', dropdownId:'divisionesDropdown', clearId:'divisionesClear', stateArray:'divisiones' });
    bindChipSelect({ boxId:'ramasSelect', chipsId:'ramasChips', dropdownId:'ramasDropdown', clearId:'ramasClear', stateArray:'ramas' });
    // Regional chip-select
    bindChipSelect({ boxId:'regionesSelect', chipsId:'regionesChips', dropdownId:'regionesDropdown', clearId:'regionesClear', stateArray:'ccaa' });

    // Period chips
    document.querySelectorAll('#periodoChips .chip').forEach(chip => {
      chip.addEventListener('click', ()=>{
        document.querySelectorAll('#periodoChips .chip').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        const preset = chip.dataset.range;
        state.periodo = { preset, start: null, end: null };
        const custom = $('customRange');
        if (custom) custom.style.display = preset === 'custom' ? 'flex' : 'none';
        renderCharts();
      });
    });

    $('inputStartDate')?.addEventListener('change', (e)=>{ state.periodo.start = e.target.value; renderCharts(); });
    $('inputEndDate')?.addEventListener('change', (e)=>{ state.periodo.end = e.target.value; renderCharts(); });

    // Outliers
    $('chkOutliers')?.addEventListener('change', (e)=>{ state.excluirOutliers = e.target.checked; renderCharts(); });

    // Reset
    $('btnResetFiltros')?.addEventListener('click', ()=>{
      state.ambito = 'nacional';
      state.ccaa = [];
      state.periodo = { preset: '90', start: null, end: null };
      state.rangos = ['Todos'];
      state.divisiones = ['Todos'];
      state.ramas = ['Todos'];
      state.excluirOutliers = true;
      // UI
      document.querySelectorAll('.ambito-link').forEach(x=> x.classList.remove('active'));
      const ambNat = document.querySelector('.ambito-link[data-ambito="nacional"]');
      if (ambNat) ambNat.classList.add('active');
      const regSel = document.getElementById('regionalSelector');
      if (regSel) regSel.style.display = 'none';
      document.querySelectorAll('#periodoChips .chip').forEach(c=>c.classList.remove('active'));
      const chip90 = document.querySelector('#periodoChips .chip[data-range="90"]');
      if (chip90) chip90.classList.add('active');
      $('customRange').style.display = 'none';
      // Chip-select re-render handled by bindChipSelect state update
      document.getElementById('rangosChips').innerHTML = '';
      document.getElementById('divisionesChips').innerHTML = '';
      document.getElementById('ramasChips').innerHTML = '';
      const regChips = document.getElementById('regionesChips'); if (regChips) regChips.innerHTML = '';
      // Re-render chips
      setTimeout(()=>{
        // Simple re-init: rebuild once
        bindChipSelect({ boxId:'rangosSelect', chipsId:'rangosChips', dropdownId:'rangosDropdown', clearId:'rangosClear', stateArray:'rangos' });
        bindChipSelect({ boxId:'divisionesSelect', chipsId:'divisionesChips', dropdownId:'divisionesDropdown', clearId:'divisionesClear', stateArray:'divisiones' });
        bindChipSelect({ boxId:'ramasSelect', chipsId:'ramasChips', dropdownId:'ramasDropdown', clearId:'ramasClear', stateArray:'ramas' });
        bindChipSelect({ boxId:'regionesSelect', chipsId:'regionesChips', dropdownId:'regionesDropdown', clearId:'regionesClear', stateArray:'ccaa' });
        renderCharts();
      }, 0);
    });

    // Export & Share (dummy)
    $('btnExportPdf')?.addEventListener('click', ()=>{
      showToast('info', 'Exportar PDF en desarrollo.');
    });
    $('btnCopyLink')?.addEventListener('click', ()=>{
      const url = new URL(window.location.href);
      url.hash = serializeState();
      navigator.clipboard.writeText(url.toString());
      showToast('success', 'Enlace copiado.');
    });
  }

  function serializeState(){
    // Minimal serialization to URL hash for shareable links
    const payload = {
      t: state.tab, a: state.ambito, c: state.ccaa, p: state.periodo,
      r: state.rangos, d: state.divisiones, j: state.ramas, o: state.excluirOutliers
    };
    return 'tendencias=' + encodeURIComponent(btoa(JSON.stringify(payload)));
  }

  function restoreStateFromHash(){
    const hash = window.location.hash || '';
    const m = hash.match(/tendencias=([^&]+)/);
    if (!m) return;
    try {
      const decoded = JSON.parse(atob(decodeURIComponent(m[1])));
      Object.assign(state, {
        tab: decoded.t || state.tab,
        ambito: decoded.a || state.ambito,
        ccaa: decoded.c || state.ccaa,
        periodo: decoded.p || state.periodo,
        rangos: decoded.r || state.rangos,
        divisiones: decoded.d || state.divisiones,
        ramas: decoded.j || state.ramas,
        excluirOutliers: typeof decoded.o === 'boolean' ? decoded.o : state.excluirOutliers
      });
    } catch(e){ /* ignore */ }
  }

  function syncUIFromState(){
    // Tabs
    document.querySelectorAll('.tab-link').forEach(b=>{
      b.classList.toggle('active', b.dataset.tab === state.tab);
    });

    // Ambito submenu
    document.querySelectorAll('.ambito-link').forEach(a=> a.classList.toggle('active', a.dataset.ambito === state.ambito));
    const regSel = document.getElementById('regionalSelector'); if (regSel) regSel.style.display = state.ambito === 'regional' ? 'flex' : 'none';

    // CCAA chips handled via bindChipSelect re-render

    // Periodo
    document.querySelectorAll('#periodoChips .chip').forEach(c=> c.classList.toggle('active', c.dataset.range === state.periodo.preset));
    $('customRange').style.display = state.periodo.preset === 'custom' ? 'flex' : 'none';
    if (state.periodo.start) $('inputStartDate').value = state.periodo.start;
    if (state.periodo.end) $('inputEndDate').value = state.periodo.end;

    $('chkOutliers').checked = state.excluirOutliers;
  }

  function ensureChartLibs(){
    // Beta gate: block init for non-allowed users
    if (!applyBetaGate()) {
      return;
    }
    // If Chart.js not present, load from CDN
    if (typeof Chart === 'undefined'){
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      s.onload = init;
      document.body.appendChild(s);
    } else {
      init();
    }
  }

  function computeStartDateLabel(periodo){
    // Returns dd-mm-yyyy string based on preset or custom
    if (periodo.preset === 'custom' && periodo.start) {
      try { const d = new Date(periodo.start); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; } catch(_e){}
    }
    const now = new Date();
    let start;
    switch(periodo.preset){
      case '30': start = new Date(now); start.setDate(start.getDate()-30); break;
      case '90': start = new Date(now); start.setDate(start.getDate()-90); break;
      case '365': start = new Date(now); start.setDate(start.getDate()-365); break;
      case 'ytd': start = new Date(now.getFullYear(), 0, 1); break;
      default: start = new Date(now); start.setDate(start.getDate()-90);
    }
    return `${String(start.getDate()).padStart(2,'0')}-${String(start.getMonth()+1).padStart(2,'0')}-${start.getFullYear()}`;
  }

  function init(){
    // Re-apply gate to ensure UI state (badge/visibility) then continue or exit
    if (!applyBetaGate()) return;
    bindEvents();
    restoreStateFromHash();
    syncUIFromState();
    renderCharts();
  }

  // Kickoff on DOM ready when this view is injected
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureChartLibs);
  } else {
    ensureChartLibs();
  }
})(); 