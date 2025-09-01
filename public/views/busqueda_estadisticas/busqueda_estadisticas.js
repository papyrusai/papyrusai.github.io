(function(){
  // Ensure Chart.js is available (loaded elsewhere like profile.html)
  // Dummy data generator and state management for the tendencias dashboard

  const ReversaUI = window.ReversaUI || (window.ReversaUI = {});
  ReversaUI.openNativeDatePicker = function(input){ if (!input) return; try { input.showPicker && input.showPicker(); } catch(_e) { /* no-op */ } };
  ReversaUI.isClickable = function(el){ return !!el && (el.tagName === 'A' || el.tagName === 'BUTTON' || el.classList.contains('chip') || el.classList.contains('dropdown-item')); };

  // HiDPI Chart.js plugin and defaults to increase canvas resolution
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

  const state = {
    tab: 'resumen', // 'resumen' | 'publicada' | 'tramitacion' | 'sanciones'
    ambito: 'resumen', // 'resumen' | 'nacional' | 'europeo' | 'regional'
    ccaa: ['Todos'],
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

  function showSkeletonLoaders(){
    // Show chart skeleton loaders
    const chartSkeletons = ['serieSkeleton', 'rangosSkeleton', 'divisionesSkeleton', 'ramasSkeleton'];
    chartSkeletons.forEach(id => {
      const skeleton = $(id);
      if (skeleton) skeleton.style.display = 'flex';
    });
    
    // Show heatmap skeleton loader
    const heatmapSkeleton = $('heatmapSkeleton');
    if (heatmapSkeleton) heatmapSkeleton.style.display = 'flex';
    
    // Hide canvas elements
    const canvases = ['serieChart', 'rangosChart', 'divisionesChart', 'ramasChart'];
    canvases.forEach(id => {
      const canvas = $(id);
      if (canvas) canvas.classList.remove('loaded');
    });
  }

  function hideHeatmapSkeleton(){
    const heatmapSkeleton = $('heatmapSkeleton');
    if (heatmapSkeleton) heatmapSkeleton.style.display = 'none';
  }

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
    console.log('[renderCharts] Called with state:', { 
      tab: state.tab, 
      ambito: state.ambito, 
      periodo: state.periodo,
      rangos: state.rangos,
      divisiones: state.divisiones,
      ramas: state.ramas,
      excluirOutliers: state.excluirOutliers
    });
    
    // Show skeleton loaders while loading
    showSkeletonLoaders();
    
    const isResumenView = (state.tab === 'resumen' && state.ambito === 'resumen');
    const dash = document.getElementById('dashContent');
    const soon = document.getElementById('comingSoonBlock');
    const filters = document.querySelector('.tendencias-filters');
    if (dash && soon){
      if (isResumenView){
        if (filters) filters.style.display = 'block';
        dash.style.display = 'block';
        soon.style.display = 'none';
      } else {
        if (filters) filters.style.display = 'none';
        dash.style.display = 'none';
        soon.style.display = 'block';
        updateComingSoonText();
        return;
      }
    }

    // Fetch and render real data
    fetchTendencias().then(data => {
      console.log('[renderCharts] Data received from fetchTendencias:', data);
      
      if (!data){
        console.log('[renderCharts] No data received, using fallback dummy data');
        // fallback to previous dummy behavior if needed
        const labels = generateMonthlyLabels(12);
        const datasets = [buildDataset('Total', randomSeries(labels.length, 30), 0)];
        upsertLineChart('serieChart', 'serie', labels, datasets, state.periodo);
        upsertBarChart('rangosChart', 'rangos', ['Ley','Real Decreto','Orden','Resolución','Reglamento'], [{ label: '#', data: [10,20,30,15,12], backgroundColor: 'rgba(11,36,49,0.85)' }]);
        upsertBarChart('divisionesChart', 'divisiones', ['Tecnología','Energía','Finanzas','Sanidad'], [{ label: '#', data: [12,25,10,18], backgroundColor: 'rgba(11,36,49,0.85)' }], 'horizontal');
        upsertBarChart('ramasChart', 'ramas', ['Laboral','Fiscal','Mercantil','Administrativo'], [{ label: '#', data: [5,9,12,7], backgroundColor: 'rgba(69,88,98,0.9)' }], 'horizontal');
        return;
      }

      console.log('[renderCharts] Rendering charts with real data');
      const labels = data.labels || [];
      const serieData = (data.series && data.series[0] && data.series[0].data) || [];
      console.log('[renderCharts] Series data:', { labels, serieData });
      upsertLineChart('serieChart', 'serie', labels, [buildDataset('Total', serieData, 0)], state.periodo);

      const rangosLabels = (data.rangos || []).map(x=>x.label);
      const rangosValues = (data.rangos || []).map(x=>x.value);
      console.log('[renderCharts] Rangos data:', { labels: rangosLabels, values: rangosValues });
      upsertBarChart('rangosChart', 'rangos', rangosLabels, [{ label: '#', data: rangosValues, backgroundColor: 'rgba(11,36,49,0.85)' }]);

      const divLabels = (data.divisiones || []).map(x=>x.label);
      const divValues = (data.divisiones || []).map(x=>x.value);
      console.log('[renderCharts] Divisiones data:', { labels: divLabels, values: divValues });
      upsertBarChart('divisionesChart', 'divisiones', divLabels, [{ label: '#', data: divValues, backgroundColor: 'rgba(11,36,49,0.85)' }], 'horizontal');

      const ramasLabels = (data.ramas || []).map(x=>x.label);
      const ramasValues = (data.ramas || []).map(x=>x.value);
      console.log('[renderCharts] Ramas data:', { labels: ramasLabels, values: ramasValues });
      upsertBarChart('ramasChart', 'ramas', ramasLabels, [{ label: '#', data: ramasValues, backgroundColor: 'rgba(69,88,98,0.9)' }], 'horizontal');

      const k = data.kpis || {};
      console.log('[renderCharts] KPIs data:', k);
      $('kpiNormas').textContent = fmtNumber(k.total || 0);
      $('kpiDelta').textContent = (k.delta_pct == null) ? 'N/A' : `${k.delta_pct.toFixed(1)}%`;
      $('kpiTopRango').textContent = k.top_rango || '—';
      $('kpiTopDivision').textContent = k.top_division || '—';

      console.log('[tendencias] payload', { periodo: state.periodo, rangos: state.rangos, divisiones: state.divisiones, ramas: state.ramas, excluirOutliers: state.excluirOutliers });
      console.log('[tendencias] response', { total: k.total, labels: (data.labels||[]).length, rangos: (data.rangos||[]).slice(0,5), divisiones: (data.divisiones||[]).slice(0,5) });

      setHeatmapData(data.heatmap || null);
      renderSpainHeatmap();

      const nowStr = new Date().toLocaleString();
      $('lastUpdated').textContent = `Última actualización: ${nowStr}`;
      const startDate = computeStartDateLabel(state.periodo);
      const geoSub = document.getElementById('geoHeatmapSubtitle');
      if (geoSub) geoSub.textContent = `Datos desde: ${startDate}`;
    }).catch(err => {
      console.error('[renderCharts] Error in fetchTendencias:', err);
    });
  }

  function upsertLineChart(canvasId, key, labels, datasets, periodo){
    const ctx = $(canvasId);
    if (!ctx) return;
    if (charts[key]) { charts[key].destroy(); charts[key]=null; }
    
    // Hide skeleton loader for this chart
    const skeletonId = canvasId.replace('Chart', 'Skeleton');
    const skeleton = $(skeletonId);
    if (skeleton) skeleton.style.display = 'none';
    
    // Solo aplicar configuración temporal del eje X a la gráfica de "Evolución temporal" (serieChart)
    const isTemporalChart = canvasId === 'serieChart';
    charts[key] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: baseOptions('line', isTemporalChart ? periodo : null)
    });
    
    // Show canvas with fade-in effect
    ctx.classList.add('loaded');
  }

  function upsertBarChart(canvasId, key, labels, datasets, orientation){
    const ctx = $(canvasId);
    if (!ctx) return;
    if (charts[key]) { charts[key].destroy(); charts[key]=null; }
    
    // Hide skeleton loader for this chart
    const skeletonId = canvasId.replace('Chart', 'Skeleton');
    const skeleton = $(skeletonId);
    if (skeleton) skeleton.style.display = 'none';
    
    const opts = baseOptions('bar');
    if (orientation === 'horizontal'){
      opts.indexAxis = 'y';
    }
    charts[key] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: opts
    });
    
    // Show canvas with fade-in effect
    ctx.classList.add('loaded');
  }

  function baseOptions(type, periodo){
    const gridColor = 'rgba(108,117,125,0.12)';
    
    // Solo configurar eje temporal si se pasa un periodo (para gráficas temporales)
    const isTemporalChart = periodo !== null && periodo !== undefined;
    const numDays = isTemporalChart ? calculatePeriodDays(periodo) : null;
    
    const xAxisConfig = { 
      grid: { color: gridColor, drawBorder: false }, 
      ticks: { 
        color: colors.slate
      }
    };

    // Solo aplicar configuración temporal del eje X si es una gráfica temporal
    if (isTemporalChart) {
      xAxisConfig.ticks.autoSkip = false;
      xAxisConfig.ticks.callback = function(value, index) {
        const label = this.getLabelForValue(value);
        return formatXAxisLabel(label, index, numDays);
      };
    }
    
    return {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: Math.max(2, (window.devicePixelRatio || 1)),
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
        x: xAxisConfig,
        y: { grid: { color: gridColor, drawBorder: false }, ticks: { color: colors.slate }, beginAtZero: true }
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
    // Reversa tri-stop gradient with extended mid range emphasis
    const s = { r: 217, g: 248, b: 238 };
    const g = { r: 4,   g: 219, b: 141 };
    const b = { r: 11,  g: 36,  b: 49  };
    const mid = 0.7; // widen mid (green) region for better discrimination
    let rr, gg, bb;
    if (t <= mid) {
      const tt = t / mid;
      rr = Math.round(s.r + (g.r - s.r) * tt);
      gg = Math.round(s.g + (g.g - s.g) * tt);
      bb = Math.round(s.b + (g.b - s.b) * tt);
    } else {
      const tt = (t - mid) / (1 - mid);
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
    
    // Hide heatmap skeleton loader
    hideHeatmapSkeleton();
    
    container.innerHTML = '';

    const isES = (state.ambito === 'nacional' || state.ambito === 'regional' || state.ambito === 'resumen');
    if (!isES){
      const placeholder = document.createElement('div');
      placeholder.className = 'map-placeholder';
      placeholder.textContent = 'Mapa CCAA no aplicable para este ámbito';
      container.appendChild(placeholder);
      const legend = document.getElementById('esLegend');
      if (legend) legend.innerHTML = '';
      return;
    }

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

        // Prefer server byIso mapping; fallback to byRegionName
        const valuesByIso = {};
        if (__tendenciasHeatmap && __tendenciasHeatmap.byIso){
          Object.assign(valuesByIso, __tendenciasHeatmap.byIso);
        } else if (__tendenciasHeatmap && __tendenciasHeatmap.byRegionName){
          features.forEach(f => {
            const name = (f.properties && (f.properties.name || f.properties.NAME)) || '';
            const iso = CCAA_NAME_TO_ISO[name] || null;
            if (iso) {
              const variants = [name, name.replace('Comunidad de ', ''), name.replace('Comunitat ', 'Comunidad ').replace('Valenciana', 'Valenciana')];
              let v = 0;
              for (const vv of variants){ if (__tendenciasHeatmap.byRegionName[vv] != null){ v = __tendenciasHeatmap.byRegionName[vv]; break; } }
              valuesByIso[iso] = v;
            }
          });
        } else {
          features.forEach(f => {
            const name = (f.properties && (f.properties.name || f.properties.NAME)) || '';
            const iso = CCAA_NAME_TO_ISO[name] || null;
            if (iso) valuesByIso[iso] = Math.round(Math.random()*100);
          });
        }

        const vals = Object.values(valuesByIso);
        const vmax = Math.max(100, ...vals);
        const vmin = 0;

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

        const tip = document.createElement('div');
        tip.style.position='absolute'; tip.style.pointerEvents='none'; tip.style.transform='translate(-50%, -120%)';
        tip.style.background='white'; tip.style.border='1px solid #e9ecef'; tip.style.boxShadow='0 8px 24px rgba(11,36,49,.15)';
        tip.style.borderRadius='10px'; tip.style.padding='10px 12px'; tip.style.fontSize='12px'; tip.style.display='none';
        tip.style.color = '#0b2431'; tip.style.minWidth='160px';

        container.appendChild(wrap);
        wrap.appendChild(tip);

        const projection = (d3Ref.geoConicConformalSpain && typeof d3Ref.geoConicConformalSpain === 'function') ? d3Ref.geoConicConformalSpain() : d3Ref.geoMercator();
        const featureCollection = topojsonRef.feature(topo, topo.objects.autonomous_regions);
        fitProjectionToSize(projection, featureCollection, size.width, size.height, d3Ref);
        const pathGen = d3Ref.geoPath(projection);

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
          pathNode.addEventListener('mouseenter', ()=>{ try { if (pathNode.parentNode) pathNode.parentNode.appendChild(pathNode); } catch(_e){}; pathNode.setAttribute('stroke-width','2.2'); pathNode.style.filter='brightness(1.06)'; });
          pathNode.addEventListener('mousemove', (event)=>{
            const rect = svgEl.getBoundingClientRect();
            const x = event.clientX - rect.left; const y = event.clientY - rect.top;
            const displayName = (iso === 'ES-PV') ? 'País Vasco' : (iso === 'ES-CT' ? 'Cataluña' : name);
            const extra = (iso === 'ES-CT') ? 'Todas las secciones integradas desde: 30/08/2025' : (iso === 'ES-PV' ? 'Solo computa disposiciones generales' : '');
            tip.innerHTML = `<div style="font-weight:700;margin-bottom:4px;">${displayName}</div><div style="display:flex;align-items:center;gap:8px;"><span style="font-size:12px;color:#6c757d;">Volumen:</span><span style="font-weight:700;">${v}</span></div>${extra ? `<div style="margin-top:4px;font-size:12px;color:#6c757d;">${extra}</div>` : ''}`;
            tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.style.display='block';
          });
          pathNode.addEventListener('mouseleave', ()=>{ tip.style.display='none'; pathNode.setAttribute('stroke-width','1.2'); pathNode.style.filter=''; });
          pathNode.addEventListener('click', ()=>{ if (!iso) return; if (!state.ccaa.includes(iso)) state.ccaa = [iso]; if ($('selectCCAA')) Array.from($('selectCCAA').options).forEach(o=> o.selected = state.ccaa.includes(o.value)); invalidateStatsCache(); renderCharts(); });
          gEl.appendChild(pathNode);
        });

        if (typeof projection.getCompositionBorders === 'function'){
          const borderPath = document.createElementNS('http://www.w3.org/2000/svg','path');
          borderPath.setAttribute('d', projection.getCompositionBorders());
          borderPath.setAttribute('fill','none'); borderPath.setAttribute('stroke','#e9ecef'); borderPath.setAttribute('stroke-width','1');
          svgEl.appendChild(borderPath);
        }

        const legend = document.getElementById('esLegend');
        if (legend){ legend.innerHTML=''; const minL=document.createElement('span'); minL.className='legend-label'; minL.textContent='Menos'; const bar=document.createElement('div'); bar.className='legend-bar'; const maxL=document.createElement('span'); maxL.className='legend-label'; maxL.textContent='Más'; legend.appendChild(minL); legend.appendChild(bar); legend.appendChild(maxL); }
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

    const isES = (state.ambito === 'nacional' || state.ambito === 'regional' || state.ambito === 'resumen');
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
        const t = Math.max(0, Math.min(1, (v||0)/100));
        const s = { r: 217, g: 248, b: 238 };
        const g = { r: 4,   g: 219, b: 141 };
        const b = { r: 11,  g: 36,  b: 49  };
        const mid = 0.7;
        let rr, gg, bb;
        if (t <= mid) {
          const tt = t / mid;
          rr = Math.round(s.r + (g.r - s.r) * tt);
          gg = Math.round(s.g + (g.g - s.g) * tt);
          bb = Math.round(s.b + (g.b - s.b) * tt);
        } else {
          const tt = (t - mid) / (1 - mid);
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
        const iso = CCAA_NAME_TO_ISO[name] || null;
        const displayName = (iso === 'ES-PV') ? 'País Vasco' : (iso === 'ES-CT' ? 'Cataluña' : name);
        const extra = (iso === 'ES-CT') ? 'Todas las secciones integradas desde: 30/08/2025' : (iso === 'ES-PV' ? 'Solo computa disposiciones generales' : '');
        layer.on({
          mouseover: (e)=>{ e.target.setStyle({ weight: 2.5, color: '#e9ecef', fillOpacity: 1 }); try { e.target.bringToFront && e.target.bringToFront(); } catch(_e){} },
          mouseout: (e)=>{ gj.resetStyle(e.target); },
          click: ()=>{
            if (iso){ state.ccaa = [iso]; if ($('selectCCAA')) Array.from($('selectCCAA').options).forEach(o=> o.selected = state.ccaa.includes(o.value)); }
            renderCharts();
          }
        });
        const extraHtml = extra ? `<div style="margin-top:4px;font-size:12px;color:#6c757d;">${extra}</div>` : '';
        layer.bindTooltip(`<div style="font-weight:700;margin-bottom:4px;">${displayName}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:12px;color:#6c757d;">Volumen:</span>
            <span style="font-weight:700;">${v}</span>
          </div>${extraHtml}`, { sticky: true, direction: 'top', opacity: 0.95 });
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

  // --- Facets for dynamic region/country dropdown ---
  let __facets = null;
  function loadFacets(){
    if (__facets) return Promise.resolve(__facets);
    return fetch('/api/info-fuentes/facets')
      .then(r=> r.ok ? r.json() : Promise.reject(new Error('facets error')))
      .then(j=> { __facets = (j && j.facets) || (j && j.data && j.data.facets) || null; return __facets; })
      .catch(()=> { __facets = { pais_nacional: [], regiones_regional: [] }; return __facets; });
  }

  function fetchStatsFacets(){
    return fetch('/api/stats/facets').then(r=> r.ok ? r.json() : Promise.reject()).then(j=> j.facets || { rangos: [], divisiones: [], ramas: [] }).catch(()=> ({ rangos: [], divisiones: [], ramas: [] }));
  }

  function updateStatsDropdown(dropdownId, values){
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    dropdown.innerHTML = '';
    const todos = document.createElement('div'); todos.className='dropdown-item'; todos.dataset.value='Todos'; todos.textContent='Todos'; dropdown.appendChild(todos);
    values.forEach(v => { const d = document.createElement('div'); d.className='dropdown-item'; d.dataset.value = v; d.textContent = v; dropdown.appendChild(d); });
  }

  // Simple in-memory cache to avoid duplicate server calls while adjusting filters
  const __statsCache = new Map();
  function buildCacheKey(){
    const payload = {
      periodo: state.periodo,
      rangos: state.rangos,
      divisiones: state.divisiones,
      ramas: state.ramas,
      excluirOutliers: state.excluirOutliers
    };
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }

  function invalidateStatsCache(){ __statsCache.clear(); }

  function fetchTendencias(){
    const key = buildCacheKey();
    console.log('[fetchTendencias] Cache key:', key);
    console.log('[fetchTendencias] Cache has key:', __statsCache.has(key));
    
    if (__statsCache.has(key)) {
      console.log('[fetchTendencias] Using cached data');
      return Promise.resolve(__statsCache.get(key));
    }
    
    console.log('[fetchTendencias] Sending request with payload:', {
      periodo: state.periodo,
      rangos: state.rangos,
      divisiones: state.divisiones,
      ramas: state.ramas,
      excluirOutliers: state.excluirOutliers
    });
    
    return fetch('/api/stats/tendencias', { 
      method:'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({
        periodo: state.periodo,
        rangos: state.rangos,
        divisiones: state.divisiones,
        ramas: state.ramas,
        excluirOutliers: state.excluirOutliers
      }) 
    }).then(r=> {
      if (!r.ok) {
        console.error('[fetchTendencias] HTTP error:', r.status, r.statusText);
        return Promise.reject(new Error(`HTTP ${r.status}: ${r.statusText}`));
      }
      return r.json();
    }).then(j=>{
      console.log('[fetchTendencias] Response received:', j);
      const data = j && j.data ? j.data : null;
      if (data) {
        __statsCache.set(key, data);
        console.log('[fetchTendencias] Data cached successfully');
      } else {
        console.warn('[fetchTendencias] No data in response:', j);
      }
      return data;
    }).catch((err)=> {
      console.error('[fetchTendencias] Request failed:', err);
      return null;
    });
  }

  // Injected heatmap data for D3/Leaflet renderers
  let __tendenciasHeatmap = null;
  function setHeatmapData(h){ __tendenciasHeatmap = h; }

  function setRegionalLabel(){
    const lbl = document.querySelector('#regionalSelector .filter-label');
    if (!lbl) return;
    if (state.ambito === 'nacional') lbl.textContent = 'País';
    else if (state.ambito === 'regional') lbl.textContent = 'Región';
    else lbl.textContent = 'Región';
  }

  function updateRegionesDropdown(){
    const dropdown = document.getElementById('regionesDropdown');
    if (!dropdown) return Promise.resolve();
    return loadFacets().then(facets => {
      const values = state.ambito === 'nacional' ? (facets.pais_nacional || []) : (state.ambito === 'regional' ? (facets.regiones_regional || []) : []);
      const unique = Array.from(new Set(values.filter(Boolean)));
      // Rebuild
      dropdown.innerHTML = '';
      const todos = document.createElement('div'); todos.className='dropdown-item'; todos.dataset.value='Todos'; todos.textContent='Todos';
      dropdown.appendChild(todos);
      unique.forEach(v => { const d = document.createElement('div'); d.className='dropdown-item'; d.dataset.value = v; d.textContent = v; dropdown.appendChild(d); });
    });
  }

  function bindChipSelect({boxId, chipsId, dropdownId, clearId, stateArray, beforeOpen}){
    const box = document.getElementById(boxId);
    const chipsContainer = document.getElementById(chipsId);
    const dropdown = document.getElementById(dropdownId);
    const clearBtn = document.getElementById(clearId);

    function open(){
      box.classList.add('active');
      const rect = box.getBoundingClientRect();
      dropdown.style.minWidth = rect.width + 'px';
      if (typeof beforeOpen === 'function') beforeOpen({ dropdown, addValue });
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
      console.log('[chipSelect] addValue called with:', { target: stateArray, value, currentState: state[stateArray] });
      
      if (value === 'Todos') {
        state[stateArray] = ['Todos'];
      } else {
        let current = state[stateArray].filter(v => v !== 'Todos');
        if (!current.includes(value)) current.push(value);
        state[stateArray] = current;
      }
      
      console.log('[chipSelect] add', { target: stateArray, value, newState: state[stateArray] });
      renderChips();
      console.log('[chipSelect] about to invalidate cache and render charts');
      invalidateStatsCache();
      renderCharts();
    }

    function removeValue(value){
      console.log('[chipSelect] removeValue called with:', { target: stateArray, value, currentState: state[stateArray] });
      
      let current = state[stateArray].slice();
      current = current.filter(v => v !== value);
      if (current.length === 0) current = ['Todos'];
      state[stateArray] = current;
      
      console.log('[chipSelect] remove', { target: stateArray, value, newState: state[stateArray] });
      renderChips();
      console.log('[chipSelect] about to invalidate cache and render charts');
      invalidateStatsCache();
      renderCharts();
    }

    box.addEventListener('click', (e)=>{ e.stopPropagation(); open(); });
    clearBtn.addEventListener('click', (e)=>{ e.stopPropagation(); state[stateArray] = ['Todos']; renderChips(); invalidateStatsCache(); renderCharts(); });
    dropdown.addEventListener('click', (e)=>{
      const target = e.target.closest('.dropdown-item');
      if (!target) return;
      e.stopPropagation();
      const val = target.dataset.value;
      addValue(val);
    });
    document.addEventListener('click', ()=> close());

    renderChips();
  }

  function bindEvents(){
    // Tabs (top menu only)
    document.querySelectorAll('.tendencias-tabs .tab-link').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tendencias-tabs .tab-link').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        state.tab = btn.dataset.tab;
        renderCharts();
      });
    });

    // Ambito submenu (disable non-resumen interactions)
    document.querySelectorAll('.ambito-link')?.forEach(a => {
      a.addEventListener('click', (ev)=>{
        const value = a.dataset.ambito;
        if (value !== 'resumen') {
          // disabled: show coming soon text only, do not change state
          updateComingSoonText();
          renderCharts();
          return;
        }
        document.querySelectorAll('.ambito-link').forEach(x=> x.classList.remove('active'));
        a.classList.add('active');
        state.ambito = value;
        const regSel = document.getElementById('regionalSelector');
        if (regSel) regSel.style.display = 'none';
        setRegionalLabel();
        renderCharts();
      });
    });

    // Chip-selects
    bindChipSelect({ boxId:'rangosSelect', chipsId:'rangosChips', dropdownId:'rangosDropdown', clearId:'rangosClear', stateArray:'rangos' });
    bindChipSelect({ boxId:'divisionesSelect', chipsId:'divisionesChips', dropdownId:'divisionesDropdown', clearId:'divisionesClear', stateArray:'divisiones' });
    bindChipSelect({ boxId:'ramasSelect', chipsId:'ramasChips', dropdownId:'ramasDropdown', clearId:'ramasClear', stateArray:'ramas' });
    // Regional chip-select (dynamic)
    bindChipSelect({ boxId:'regionesSelect', chipsId:'regionesChips', dropdownId:'regionesDropdown', clearId:'regionesClear', stateArray:'ccaa', beforeOpen: ()=>{ updateRegionesDropdown(); } });

    // Period chips
    document.querySelectorAll('#periodoChips .chip').forEach(chip => {
      chip.addEventListener('click', ()=>{
        document.querySelectorAll('#periodoChips .chip').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        const preset = chip.dataset.range;
        state.periodo = { preset, start: null, end: null };
        const custom = $('customRange');
        if (custom) custom.style.display = preset === 'custom' ? 'flex' : 'none';
        invalidateStatsCache();
        renderCharts();
      });
    });

    // Native date picker open on click/focus for better UX
    const startInput = $('inputStartDate');
    const endInput = $('inputEndDate');
    if (startInput){
      ['click','focus'].forEach(evt => startInput.addEventListener(evt, ()=> ReversaUI.openNativeDatePicker(startInput)));
    }
    if (endInput){
      ['click','focus'].forEach(evt => endInput.addEventListener(evt, ()=> ReversaUI.openNativeDatePicker(endInput)));
    }

    $('inputStartDate')?.addEventListener('change', (e)=>{ state.periodo.start = e.target.value; invalidateStatsCache(); renderCharts(); });
    $('inputEndDate')?.addEventListener('change', (e)=>{ state.periodo.end = e.target.value; invalidateStatsCache(); renderCharts(); });

    // Outliers
    $('chkOutliers')?.addEventListener('change', (e)=>{ state.excluirOutliers = e.target.checked; invalidateStatsCache(); renderCharts(); });

    // Reset
    $('btnResetFiltros')?.addEventListener('click', ()=>{
      state.ambito = 'resumen';
      state.ccaa = ['Todos'];
      state.periodo = { preset: '90', start: null, end: null };
      state.rangos = ['Todos'];
      state.divisiones = ['Todos'];
      state.ramas = ['Todos'];
      state.excluirOutliers = true;
      // UI
      document.querySelectorAll('.ambito-link').forEach(x=> x.classList.remove('active'));
      const ambRes = document.querySelector('.ambito-link[data-ambito="resumen"]');
      if (ambRes) ambRes.classList.add('active');
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
        bindChipSelect({ boxId:'regionesSelect', chipsId:'regionesChips', dropdownId:'regionesDropdown', clearId:'regionesClear', stateArray:'ccaa', beforeOpen: ()=>{ updateRegionesDropdown(); } });
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

  function updateComingSoonText(){
    const el = document.getElementById('comingSoonText');
    if (!el) return;
    // Prefer top-level selection if not resumen; otherwise use ambito
    let section = '';
    if (state.tab !== 'resumen') {
      const activeTop = document.querySelector('.tendencias-tabs .tab-link.active');
      section = (activeTop && activeTop.textContent) || 'esta sección';
    } else if (state.ambito !== 'resumen') {
      const activeAmb = document.querySelector('.ambito-tabs .ambito-link.active');
      section = (activeAmb && activeAmb.textContent) || 'esta sección';
    } else {
      section = 'esta sección';
    }
    el.textContent = `Estamos trabajando en crear una visión detallada sobre ${section}.`;
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
    // Tabs (top)
    document.querySelectorAll('.tendencias-tabs .tab-link').forEach(b=>{
      b.classList.toggle('active', b.dataset.tab === state.tab);
    });

    // Ambito submenu
    document.querySelectorAll('.ambito-link').forEach(a=> a.classList.toggle('active', a.dataset.ambito === state.ambito));
    const regSel = document.getElementById('regionalSelector'); if (regSel) regSel.style.display = (state.ambito === 'nacional' || state.ambito === 'regional') ? 'flex' : 'none';
    setRegionalLabel();

    // Periodo - Safe access to customRange and ensure 90d is selected by default
    document.querySelectorAll('#periodoChips .chip').forEach(c=> c.classList.toggle('active', c.dataset.range === state.periodo.preset));
    const customRange = $('customRange');
    if (customRange) customRange.style.display = state.periodo.preset === 'custom' ? 'flex' : 'none';
    
    const inputStartDate = $('inputStartDate');
    const inputEndDate = $('inputEndDate');
    if (state.periodo.start && inputStartDate) inputStartDate.value = state.periodo.start;
    if (state.periodo.end && inputEndDate) inputEndDate.value = state.periodo.end;

    const chkOutliers = $('chkOutliers');
    if (chkOutliers) chkOutliers.checked = state.excluirOutliers;
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
      s.onload = ()=>{ try { Chart.register(ReversaHiDpiPlugin); Chart.defaults.devicePixelRatio = Math.max(2, (window.devicePixelRatio || 1)); } catch(_e){}; init(); };
      document.body.appendChild(s);
    } else {
      try { Chart.register(ReversaHiDpiPlugin); Chart.defaults.devicePixelRatio = Math.max(2, (window.devicePixelRatio || 1)); } catch(_e){}
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
    const MIN = new Date('2025-08-11T00:00:00.000Z');
    if (start < MIN) start = MIN;
    return `${String(start.getDate()).padStart(2,'0')}-${String(start.getMonth()+1).padStart(2,'0')}-${start.getFullYear()}`;
  }

  function init(){
    // Re-apply gate to ensure UI state (badge/visibility) then continue or exit
    if (!applyBetaGate()) return;
    bindEvents();
    restoreStateFromHash();
    syncUIFromState();
    // Warm facets and prepare dropdowns
    Promise.all([
      loadFacets(),
      fetchStatsFacets()
    ]).then(([_, statsFacets])=>{
      updateRegionesDropdown();
      updateStatsDropdown('rangosDropdown', statsFacets.rangos || []);
      updateStatsDropdown('divisionesDropdown', statsFacets.divisiones || []);
      updateStatsDropdown('ramasDropdown', statsFacets.ramas || []);
      renderCharts();
    }).catch(()=>{ updateRegionesDropdown(); renderCharts(); });
  }

  // Kickoff on DOM ready when this view is injected
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureChartLibs);
  } else {
    ensureChartLibs();
  }
})(); 