(function(){
  // State
  const STATE = {
    seleccion: [], // array of userIds
    ranking: { page: 1, totalPages: 1, items: [] },
    usersMap: new Map(), // userId -> { userId, email, displayName, isEmpresa }
    filtros: { userId: null, boletines: [], rangos: [], desde: null, hasta: null, etiquetas: [] },
    chart: null
  };

  function q(id){ return document.getElementById(id); }

  // Gate: only allow execution for tomas@reversa.ai
  try {
    var __userEmailEl = window.document.getElementById('userEmail');
    var __userEmailTxt = __userEmailEl && __userEmailEl.textContent ? __userEmailEl.textContent.trim() : '';
    var __userEmail = (__userEmailTxt && __userEmailTxt.startsWith('"') && __userEmailTxt.endsWith('"')) ? JSON.parse(__userEmailTxt) : __userEmailTxt;
    if (__userEmail !== 'tomas@reversa.ai') {
      var container = document.querySelector('#content-internal') || document.body;
      if (container) container.innerHTML = '<div class="banner-error" style="margin:16px;">No tienes permisos para acceder al Dashboard Interno.</div>';
      return;
    }
  } catch(_) {}

  function yesterdayISO(){ const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }

  function renderChips(){
    const wrap = q('chipsSeleccion');
    wrap.innerHTML = '';
    STATE.seleccion.forEach(uid => {
      const info = STATE.usersMap.get(uid) || { displayName: uid };
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${escapeHtml(info.displayName)} <span class="x" data-id="${uid}">×</span>`;
      chip.querySelector('.x').onclick = () => { removeSeleccion(uid); };
      wrap.appendChild(chip);
    });
  }

  function removeSeleccion(uid){
    STATE.seleccion = STATE.seleccion.filter(x => x !== uid);
    renderChips();
    populateUsuarioFilter();
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }

  async function loadSeleccionFromBackend(){
    const res = await fetch('/api/internal/seguimiento-users', { headers:{ 'Accept':'application/json' }, credentials: 'same-origin' });
    if (!res.ok) { console.error('GET seguimiento-users failed', res.status); return; }
    const data = await res.json().catch(()=>({success:false}));
    if (data && data.success){
      STATE.seleccion = (data.items || []).map(it => it.userId);
      (data.items || []).forEach(it => STATE.usersMap.set(it.userId, it));
    }
  }

  async function saveSeleccionToBackend(){
    const body = { selectedUserIds: STATE.seleccion };
    const res = await fetch('/api/internal/seguimiento-users', { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) });
    const data = await res.json().catch(()=>({success:false}));
    return !!data.success;
  }

  async function loadRanking(page=1){
    q('rankingLoader').style.display = 'block';
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '15');
      const res = await fetch('/api/internal/ranking?' + params.toString(), { headers:{ 'Accept':'application/json' }, credentials:'same-origin' });
      if (!res.ok) { console.error('GET ranking failed', res.status); return; }
      const data = await res.json().catch(()=>({success:false}));
      if (data.success){
        STATE.ranking.page = data.page;
        STATE.ranking.totalPages = data.totalPages;
        STATE.ranking.items = data.items || [];
        data.items.forEach(it => STATE.usersMap.set(it.userId, it));
        renderRankingGrid();
      }
    } finally {
      q('rankingLoader').style.display = 'none';
    }
  }

  function renderRankingGrid(){
    const grid = q('gridRanking');
    grid.innerHTML = '';
    STATE.ranking.items.forEach(it => {
      const card = document.createElement('div');
      card.className = 'user-card';
      const isEmpresa = !!it.isEmpresa;
      const secondary = isEmpresa ? (it.empresa ? escapeHtml(it.empresa) : 'Empresa') : (it.email ? escapeHtml(it.email) : '');
      card.innerHTML = `
        <div class="user-meta">
          <i class="${isEmpresa ? 'fas fa-building' : 'fas fa-user'}" style="color:#0b2431;"></i>
          <div>
            <div style="font-weight:600; color:#0b2431;">${escapeHtml(it.displayName)}</div>
            <div style="font-size:12px; color:#6c757d;">${secondary}</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="color:#0b2431; font-weight:700;">${it.matches}</span>
          <input class="user-select" type="checkbox" data-id="${it.userId}" ${STATE.seleccion.includes(it.userId)?'checked':''} />
        </div>`;
      grid.appendChild(card);
    });
    q('rankPageInfo').textContent = `Página ${STATE.ranking.page} de ${STATE.ranking.totalPages}`;
    q('rankPrev').disabled = STATE.ranking.page <= 1;
    q('rankNext').disabled = STATE.ranking.page >= STATE.ranking.totalPages;

    grid.querySelectorAll('.user-select').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = e.target.getAttribute('data-id');
        if (e.target.checked) {
          if (!STATE.seleccion.includes(id)) STATE.seleccion.push(id);
        } else {
          STATE.seleccion = STATE.seleccion.filter(x => x !== id);
        }
        renderChips();
        populateUsuarioFilter();
      });
    });
  }

  function toggleSeleccionPanel(show){
    q('panelSeleccion').style.display = show ? 'block' : 'none';
  }

  function populateUsuarioFilter(){
    const sel = q('fUsuario');
    sel.innerHTML = '';
    STATE.seleccion.forEach(uid => {
      const it = STATE.usersMap.get(uid) || { displayName: uid };
      const opt = document.createElement('option');
      opt.value = uid; opt.textContent = it.displayName;
      sel.appendChild(opt);
    });
    if (STATE.seleccion.length > 0) {
      sel.value = STATE.filtros.userId || STATE.seleccion[0];
      STATE.filtros.userId = sel.value;
    }
  }

  // ETIQUETAS (Agentes del usuario seleccionado)
  async function populateEtiquetas(){
    const uid = STATE.filtros.userId || (STATE.seleccion[0] || null);
    let etiquetas = [];
    if (uid){
      try {
        const res = await fetch('/api/internal/user-etiquetas?userId=' + encodeURIComponent(uid), { headers:{ 'Accept':'application/json' }, credentials:'same-origin' });
        const data = await res.json().catch(()=>({success:false}));
        if (data && data.success && Array.isArray(data.etiquetas)) etiquetas = data.etiquetas;
      } catch(_){ }
    }
    renderEtiquetasDropdownInternal(etiquetas);
  }
  function renderEtiquetasDropdownInternal(etiquetas){
    const dropdown = q('etiquetasDropdownInternal');
    if (!dropdown) return;
    if (!Array.isArray(etiquetas)) etiquetas = [];
    let html = `<label><input type="checkbox" id="chkAllEtiquetasInternal" checked> Todos</label>`;
    etiquetas.forEach(e => { html += `<label><input type="checkbox" value="${e}" checked> ${e}</label>`; });
    dropdown.innerHTML = html;

    const chkAll = q('chkAllEtiquetasInternal');
    const boxes = dropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllEtiquetasInternal)');
    if (chkAll){
      chkAll.addEventListener('change', (e)=>{
        boxes.forEach(cb => cb.checked = e.target.checked);
        STATE.filtros.etiquetas = e.target.checked ? etiquetas.slice() : [];
        updateSelectedEtiquetasInternalText();
      });
    }
    boxes.forEach(cb => {
      cb.addEventListener('change', ()=>{
        const selected = Array.from(boxes).filter(x=>x.checked).map(x=>x.value);
        STATE.filtros.etiquetas = selected;
        if (chkAll){
          const allChecked = selected.length === boxes.length;
          const noneChecked = selected.length === 0;
          chkAll.checked = allChecked;
          chkAll.indeterminate = !allChecked && !noneChecked;
        }
        updateSelectedEtiquetasInternalText();
      });
    });
    STATE.filtros.etiquetas = etiquetas.slice();
    updateSelectedEtiquetasInternalText();
  }
  function updateSelectedEtiquetasInternalText(){
    const boxes = q('etiquetasDropdownInternal')?.querySelectorAll('input[type="checkbox"]:not(#chkAllEtiquetasInternal)') || [];
    const selected = Array.from(boxes).filter(x=>x.checked).map(x=>x.value);
    const span = q('selectedEtiquetasInternal');
    if (!span) return;
    if (boxes.length === 0) { span.textContent = 'Todos'; return; }
    if (selected.length === 0 || selected.length === boxes.length) { span.textContent = 'Todos'; return; }
    if (selected.length === 1) { span.textContent = selected[0]; return; }
    span.textContent = `${selected.length} seleccionados`;
  }
  window.toggleEtiquetasDropdownInternal = function(){
    const dd = q('etiquetasDropdownInternal'); if (!dd) return;
    dd.classList.toggle('open');
    q('boletinDropdownInternal')?.classList.remove('open');
    q('rangoDropdownInternal')?.classList.remove('open');
  };

  // RANGOS (dropdown estilo Reversa)
  function renderRangoDropdownInternal(rangos){
    const dropdown = q('rangoDropdownInternal');
    if (!dropdown) return;
    if (!Array.isArray(rangos)) rangos = [];
    let html = `<label><input type="checkbox" id="chkAllRangoInternal" checked> Todos</label>`;
    rangos.forEach(r => { html += `<label><input type="checkbox" value="${r}" checked> ${r}</label>`; });
    dropdown.innerHTML = html;

    const chkAll = q('chkAllRangoInternal');
    const boxes = dropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllRangoInternal)');
    if (chkAll){
      chkAll.addEventListener('change', (e)=>{
        boxes.forEach(cb => cb.checked = e.target.checked);
        STATE.filtros.rangos = e.target.checked ? rangos.slice() : [];
        updateSelectedRangoInternalText();
      });
    }
    boxes.forEach(cb => {
      cb.addEventListener('change', ()=>{
        const selected = Array.from(boxes).filter(x=>x.checked).map(x=>x.value);
        STATE.filtros.rangos = selected;
        if (chkAll){
          const allChecked = selected.length === boxes.length;
          const noneChecked = selected.length === 0;
          chkAll.checked = allChecked;
          chkAll.indeterminate = !allChecked && !noneChecked;
        }
        updateSelectedRangoInternalText();
      });
    });
    STATE.filtros.rangos = rangos.slice();
    STATE.allRangosInternal = rangos.slice();
    updateSelectedRangoInternalText();
    console.log('[internal] allRangosInternal=', STATE.allRangosInternal, 'filtros.rangos=', STATE.filtros.rangos);
  }
  function updateSelectedRangoInternalText(){
    const boxes = q('rangoDropdownInternal')?.querySelectorAll('input[type="checkbox"]:not(#chkAllRangoInternal)') || [];
    const selected = Array.from(boxes).filter(x=>x.checked).map(x=>x.value);
    const span = q('selectedRangoInternal');
    if (!span) return;
    if (boxes.length === 0) { span.textContent = 'Todos'; return; }
    if (selected.length === 0 || selected.length === boxes.length) { span.textContent = 'Todos'; return; }
    if (selected.length === 1) { span.textContent = selected[0]; return; }
    span.textContent = `${selected.length} seleccionados`;
  }
  window.toggleRangoDropdownInternal = function(){
    const dd = q('rangoDropdownInternal'); if (!dd) return;
    dd.classList.toggle('open');
    q('boletinDropdownInternal')?.classList.remove('open');
  };

  // BOLETINES (dropdown estilo Reversa)
  async function populateBoletines(){
    const sel = q('fUsuario');
    const uid = STATE.filtros.userId || (STATE.seleccion[0] || null);
    console.log('[internal] populateBoletines for userId=', uid);
    let boletines = [];
    if (uid){
      try {
        const res = await fetch('/api/internal/user-boletines?userId=' + encodeURIComponent(uid), { headers:{ 'Accept':'application/json' }, credentials:'same-origin' });
        const data = await res.json().catch(()=>({success:false}));
        if (data && data.success && Array.isArray(data.boletines)) boletines = data.boletines;
      } catch(e){ console.error('[internal] populateBoletines error', e); }
    }
    if (!boletines.length) boletines = ['BOE'];
    STATE.allBoletinesInternal = boletines.slice();
    renderBoletinDropdownInternal(boletines);
  }
  function renderBoletinDropdownInternal(boletines){
    const dropdown = q('boletinDropdownInternal');
    if (!dropdown) return;
    let html = `<label><input type="checkbox" id="chkAllBoletinInternal" checked> Todos</label>`;
    boletines.forEach(b => { html += `<label><input type="checkbox" value="${b}" checked> ${b}</label>`; });
    dropdown.innerHTML = html;

    const chkAll = q('chkAllBoletinInternal');
    const boxes = dropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllBoletinInternal)');
    if (chkAll){
      chkAll.addEventListener('change', (e)=>{
        boxes.forEach(cb => cb.checked = e.target.checked);
        STATE.filtros.boletines = e.target.checked ? boletines.slice() : [];
        updateSelectedBoletinesInternalText();
      });
    }
    boxes.forEach(cb => {
      cb.addEventListener('change', ()=>{
        const selected = Array.from(boxes).filter(x=>x.checked).map(x=>x.value);
        STATE.filtros.boletines = selected;
        if (chkAll){
          const allChecked = selected.length === boxes.length;
          const noneChecked = selected.length === 0;
          chkAll.checked = allChecked;
          chkAll.indeterminate = !allChecked && !noneChecked;
        }
        updateSelectedBoletinesInternalText();
      });
    });
    STATE.filtros.boletines = boletines.slice();
    updateSelectedBoletinesInternalText();
    console.log('[internal] allBoletinesInternal=', STATE.allBoletinesInternal, 'filtros.boletines=', STATE.filtros.boletines);
  }
  function updateSelectedBoletinesInternalText(){
    const boxes = q('boletinDropdownInternal')?.querySelectorAll('input[type="checkbox"]:not(#chkAllBoletinInternal)') || [];
    const selected = Array.from(boxes).filter(x=>x.checked).map(x=>x.value);
    const span = q('selectedBoletinesInternal');
    if (!span) return;
    if (selected.length === 0 || selected.length === boxes.length) { span.textContent = 'Todos'; return; }
    if (selected.length === 1) { span.textContent = selected[0]; return; }
    span.textContent = `${selected.length} seleccionados`;
  }
  window.toggleBoletinDropdownInternal = function(){
    const dd = q('boletinDropdownInternal'); if (!dd) return;
    dd.classList.toggle('open');
    q('rangoDropdownInternal')?.classList.remove('open');
  };

  // Cerrar dropdowns al hacer click fuera
  document.addEventListener('click', (e)=>{
    const insideBoletin = e.target && e.target.closest && e.target.closest('#boletinDropdownInternal');
    const triggerBoletin = e.target && e.target.closest && e.target.closest('#btnBoletinInternal');
    if (!insideBoletin && !triggerBoletin) q('boletinDropdownInternal')?.classList.remove('open');
    const insideRango = e.target && e.target.closest && e.target.closest('#rangoDropdownInternal');
    const triggerRango = e.target && e.target.closest && e.target.closest('#btnRangoInternal');
    if (!insideRango && !triggerRango) q('rangoDropdownInternal')?.classList.remove('open');
    const insideEtiq = e.target && e.target.closest && e.target.closest('#etiquetasDropdownInternal');
    const triggerEtiq = e.target && e.target.closest && e.target.closest('#btnEtiquetasInternal');
    if (!insideEtiq && !triggerEtiq) q('etiquetasDropdownInternal')?.classList.remove('open');
  });

  let currentFetchController = null;
  async function fetchInternalData(){
    if (!STATE.filtros.userId && STATE.seleccion.length>0) STATE.filtros.userId = STATE.seleccion[0];
    if (!STATE.filtros.userId) return;

    // Cancel any previous pending request to avoid stuck state
    if (currentFetchController) { try { currentFetchController.abort(); } catch(_){} }
    currentFetchController = new AbortController();

    const btnBuscar = q('btnBuscar');
    const originalBtnHTML = btnBuscar ? btnBuscar.innerHTML : null;
    if (btnBuscar){
      btnBuscar.disabled = true;
      btnBuscar.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(11,36,49,.2);border-top-color:#0b2431;border-radius:50%;vertical-align:-3px;animation:spin 1s linear infinite;"></span> Buscando...';
    }
    q('loading-icon').style.display = 'block';
    q('loading-icon-chart').style.display = 'block';
    q('chartContainer').style.display = 'none';

    const params = new URLSearchParams();
    params.set('userId', STATE.filtros.userId);
    if (STATE.filtros.etiquetas && STATE.filtros.etiquetas.length) params.set('etiquetas', STATE.filtros.etiquetas.join('||'));
    // Si no hay selección, usar todos los valores actuales
    const rngs = (STATE.filtros.rangos && STATE.filtros.rangos.length) ? STATE.filtros.rangos : (STATE.allRangosInternal || []);
    const bols = (STATE.filtros.boletines && STATE.filtros.boletines.length) ? STATE.filtros.boletines : (STATE.allBoletinesInternal || []);
    if (STATE.filtros.boletines.length) params.set('collections', STATE.filtros.boletines.join('||'));
    if (STATE.filtros.rangos.length) params.set('rango', STATE.filtros.rangos.join('||'));
    // Si el usuario ha dejado ambos arrays vacíos (ninguna selección), enviar todos
    if (!params.has('collections') && bols.length) params.set('collections', bols.join('||'));
    if (!params.has('rango') && rngs.length) params.set('rango', rngs.join('||'));
    if (STATE.filtros.desde) params.set('desde', STATE.filtros.desde);
    if (STATE.filtros.hasta) params.set('hasta', STATE.filtros.hasta);
    console.log('[internal] fetchInternalData params=', params.toString());
    const res = await fetch('/api/internal/data?' + params.toString(), { headers:{ 'Accept':'application/json' }, credentials:'same-origin', signal: currentFetchController.signal });
    const data = await res.json().catch(()=>({success:false}));
    console.log('[internal] fetchInternalData response.success=', data && data.success, 'documents length=', data && data.documentsHtml ? (data.documentsHtml.length) : 0);

    if (data.success){
      q('internal-docs-container').innerHTML = data.documentsHtml || '';
      renderChart(data.dailyLabels||[], data.dailyCounts||[]);
      q('alerts-total').textContent = (data.totalAlerts ?? '-')
      const avg = data.avgAlertsPerDay ?? null;
      q('alerts-avg').textContent = avg != null ? (typeof avg === 'number' ? avg.toFixed(2) : String(avg)) : '-';
      const ic = data.impactCounts || { alto:0, medio:0, bajo:0 };
      q('impact-alto').textContent = ic.alto || 0;
      q('impact-medio').textContent = ic.medio || 0;
      q('impact-bajo').textContent = ic.bajo || 0;
      q('chartContainer').style.display = 'block';
    } else {
      q('internal-docs-container').innerHTML = `<div class="no-results" style="color:#0b2431; font-weight:bold; padding:20px; text-align:center; font-size:16px; background-color:#f8f9fa; border-radius:8px; margin:12px 0;">No hay resultados.</div>`;
    }

    q('loading-icon').style.display = 'none';
    q('loading-icon-chart').style.display = 'none';
    if (btnBuscar){ btnBuscar.disabled = false; if (originalBtnHTML != null) btnBuscar.innerHTML = originalBtnHTML; }
  }

  function renderChart(labels, counts){
    try {
      if (!window.Chart) return;
      const canvas = q('documentsChart');
      if (!canvas) return;
      const chartContainer = q('chartContainer');
      const loadingIconChart = q('loading-icon-chart');
      // Ensure container visible before measuring/creating chart
      if (chartContainer) {
        chartContainer.style.display = 'block';
      }
      if (loadingIconChart) {
        loadingIconChart.style.display = 'none';
      }
      const ctx = canvas.getContext('2d');

      // Destroy previous chart
      if (STATE.chart) { try { STATE.chart.destroy(); } catch(_){} STATE.chart = null; }

      // Build daily map from backend arrays
      const dailyMap = {};
      if (Array.isArray(labels) && Array.isArray(counts)) {
        for (let i = 0; i < labels.length; i++) {
          dailyMap[String(labels[i])] = Number(counts[i] || 0);
        }
      }

      // Build continuous daily series between selected dates if possible
      const startStr = q('fDesde')?.value || '';
      const endStr = q('fHasta')?.value || '';
      let finalLabels = [];
      let finalSeries = [];
      let numDays = 0;

      if (startStr && endStr) {
        const start = new Date(startStr);
        const end = new Date(endStr);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const da = String(d.getDate()).padStart(2, '0');
            const key = `${y}-${m}-${da}`;
            finalLabels.push(key);
            finalSeries.push((key in dailyMap) ? Number(dailyMap[key]) || 0 : 0);
          }
        }
      }

      // Fallback: use provided labels if no valid range
      if (finalLabels.length === 0) {
        const keys = Object.keys(dailyMap).sort();
        finalLabels = keys;
        finalSeries = keys.map(k => Number(dailyMap[k]) || 0);
      }
      numDays = finalLabels.length;

      // Create chart
      STATE.chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: finalLabels,
          datasets: [{
            label: 'Documentos por día',
            data: finalSeries,
            borderColor: '#0b2431',
            backgroundColor: 'rgba(11,36,49,.1)',
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: false,
            spanGaps: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          layout: { padding: { top: 8, right: 12, bottom: 8, left: 12 } },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#0b2431',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              borderColor: '#04db8d',
              borderWidth: 2,
              cornerRadius: 8,
              displayColors: false,
              padding: 10
            }
          },
          scales: {
            x: {
              type: 'category',
              grid: { display: false },
              ticks: {
                color: '#6c757d',
                font: { size: 12, weight: '500' },
                autoSkip: false,
                callback: function(value, index) {
                  const label = this.getLabelForValue(value);
                  if (numDays <= 35) return index % 3 === 0 ? (label?.slice(5)?.replace('-', '/') || '') : '';
                  if (numDays <= 92) return index % 7 === 0 ? (label?.slice(5)?.replace('-', '/') || '') : '';
                  return label && label.endsWith('-01') ? label.slice(0, 7) : '';
                }
              },
              border: { display: false },
              title: { display: true, text: 'Fecha', color: '#0b2431', font: { size: 13, weight: '600' } }
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(108,117,125,0.1)', drawBorder: false },
              ticks: { color: '#6c757d', font: { size: 12, weight: '500' }, stepSize: 1, padding: 8 },
              title: { display: true, text: 'Alertas', color: '#0b2431', font: { size: 13, weight: '600' } }
            }
          },
          interaction: { intersect: false, mode: 'index' }
        }
      });
    } catch(_){ }
  }

  function bindUI(){
    // Tabs
    document.querySelectorAll('.internal-subnav .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.internal-subnav .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const name = tab.getAttribute('data-tab');
        document.querySelectorAll('.tab-panel').forEach(p => p.style.display='none');
        q('tab-' + name).style.display = 'block';
      });
    });

    // Editar selección panel
    q('btnEditarSeleccion').addEventListener('click', async () => {
      q('btnEditarLoader').style.display = 'inline-block';
      toggleSeleccionPanel(true);
      await loadRanking(1);
      q('btnEditarLoader').style.display = 'none';
    });
    q('btnCerrarSeleccion').addEventListener('click', () => toggleSeleccionPanel(false));
    q('btnGuardarSeleccion').addEventListener('click', async () => {
      q('btnGuardarSeleccion').disabled = true;
      const ok = await saveSeleccionToBackend();
      q('btnGuardarSeleccion').disabled = false;
      if (ok){
        renderChips();
        populateUsuarioFilter();
        showSuccessBanner('Selección guardada correctamente');
      } else {
        showErrorBanner('Error al guardar la selección');
      }
      toggleSeleccionPanel(false);
    });

    // Ranking pagination
    q('rankPrev').addEventListener('click', async () => { if (STATE.ranking.page>1) await loadRanking(STATE.ranking.page-1); });
    q('rankNext').addEventListener('click', async () => { if (STATE.ranking.page<STATE.ranking.totalPages) await loadRanking(STATE.ranking.page+1); });

    // Filters
    q('fUsuario').addEventListener('change', async e => { 
      STATE.filtros.userId = e.target.value; 
      await populateEtiquetas();
      await populateBoletines(); // reload coverage for selected user
    });
    q('fDesde').addEventListener('change', e => STATE.filtros.desde = e.target.value);
    q('fHasta').addEventListener('change', e => STATE.filtros.hasta = e.target.value);
    q('btnBuscar').addEventListener('click', () => fetchInternalData());

    // Modal eliminar
    const modal = document.getElementById('modalEliminarInterno');
    const motivoInput = document.getElementById('motivoEliminarInput');
    const btnCancel = document.getElementById('btnCancelarEliminar');
    const btnConfirm = document.getElementById('btnConfirmarEliminar');
    const hDoc = document.getElementById('eliminarDocId');
    const hColl = document.getElementById('eliminarCollection');
    const hMatched = document.getElementById('eliminarMatched');

    function openDeleteModal(docId, collection, matched){
      if (!modal) return;
      hDoc.value = String(docId || '');
      hColl.value = String(collection || '');
      hMatched.value = Array.isArray(matched) ? matched.join('|') : String(matched || '');
      motivoInput.value = '';
      modal.style.display = 'block';
    }
    function closeDeleteModal(){ if (modal) modal.style.display = 'none'; }
    if (btnCancel) btnCancel.addEventListener('click', closeDeleteModal);
    if (modal) modal.addEventListener('click', (e)=>{ if (e.target === modal) closeDeleteModal(); });
    if (btnConfirm) btnConfirm.addEventListener('click', async ()=>{
      const reason = (motivoInput.value || '').trim();
      const docId = hDoc.value; const coll = hColl.value;
      const matched = (hMatched.value || '').split('|').filter(Boolean);
      const deletedFrom = STATE.filtros.userId || (STATE.seleccion[0] || '');
      if (!docId || !coll){ showErrorBanner('Faltan datos del documento'); return; }
      try {
        btnConfirm.disabled = true;
        const body = {
          coleccion: coll,
          doc_id: docId,
          reason_delete: reason,
          etiquetas_personalizadas_match: matched,
          deleted_from: deletedFrom
        };
        const res = await fetch('/api/internal/delete-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body)
        });
        const data = await res.json().catch(()=>({ success:false }));
        if (data && data.success){
          closeDeleteModal();
          showSuccessBanner('Documento eliminado para seguimiento');
          // quitar la tarjeta del DOM inmediatamente
          try {
            const sel = `.data-item[data-doc-id="${CSS.escape(docId)}"][data-collection="${CSS.escape(coll)}"]`;
            const el = document.querySelector(sel);
            if (el && el.parentNode) el.parentNode.removeChild(el);
          } catch(_){ }
        } else {
          showErrorBanner('No se pudo eliminar el documento');
        }
      } catch (e){
        showErrorBanner('Error al eliminar: ' + (e && e.message ? e.message : ''));
      } finally {
        btnConfirm.disabled = false;
      }
    });

    // Delegation: click en icono papelera
    const docsContainer = document.getElementById('internal-docs-container');
    if (docsContainer){
      docsContainer.addEventListener('click', (e)=>{
        const btn = e.target && e.target.closest && e.target.closest('.internal-trash');
        if (!btn) return;
        const card = btn.closest('.data-item');
        if (!card) return;
        const docId = card.getAttribute('data-doc-id');
        const coll = card.getAttribute('data-collection');
        const matchedStr = card.getAttribute('data-matched') || '';
        const matched = matchedStr ? matchedStr.split('|').filter(Boolean) : [];
        openDeleteModal(docId, coll, matched);
      });
    }
  }

  function setDefaultDates(){
    const fmt = (d)=>{ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; };
    const today = new Date();
    const start = new Date(today); start.setDate(start.getDate()-3);
    const startStr = fmt(start);
    const endStr = fmt(today);
    q('fDesde').value = startStr; q('fHasta').value = endStr;
    STATE.filtros.desde = startStr; STATE.filtros.hasta = endStr;
  }

  async function init(){
    await loadSeleccionFromBackend();
    renderChips();
    populateUsuarioFilter();
    await populateEtiquetas();
    // Rangos del usuario (igual que profile). Si no hay, no filtrar por rango
    try {
      const uid = STATE.filtros.userId || (STATE.seleccion[0] || null);
      let rangos = [];
      if (uid){
        const rr = await fetch('/api/internal/user-rangos?userId=' + encodeURIComponent(uid), { headers:{ 'Accept':'application/json' }, credentials:'same-origin' });
        const data = await rr.json().catch(()=>({success:false}));
        if (data && data.success && Array.isArray(data.rangos)) rangos = data.rangos;
      }
      renderRangoDropdownInternal(Array.isArray(rangos) ? rangos : []);
    } catch(e){ console.error('[internal] load rangos error', e); renderRangoDropdownInternal([]); }
    // Boletines dropdown (desde backend del usuario seleccionado)
    await populateBoletines();
    setDefaultDates();
    // No auto-buscar: solo cuando el usuario pulsa Buscar
  }

  function showSuccessBanner(msg){
    const c = document.getElementById('internalBannerContainer'); if (!c) return;
    const el = document.createElement('div'); el.className = 'banner-success'; el.textContent = msg; c.appendChild(el);
    setTimeout(()=>{ el.remove(); }, 2200);
  }
  function showErrorBanner(msg){
    const c = document.getElementById('internalBannerContainer'); if (!c) return;
    const el = document.createElement('div'); el.className = 'banner-error'; el.textContent = msg; c.appendChild(el);
    setTimeout(()=>{ el.remove(); }, 2800);
  }

  window.initializeInternalDashboard = async function(){
    bindUI();
    await init();
  };
})(); 