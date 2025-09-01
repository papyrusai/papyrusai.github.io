function populateFuentes(cobertura_legal) {
  const container = document.getElementById('fuentes-container');
  if (!container) return;

  // Check if user has etiquetas_personalizadas and show/hide banner accordingly
  checkAndShowAgentesRegulatoryBanner();

  // Inject minimal styles for filters and chips (scoped to configuracion)
  if (!document.getElementById('fuentesFiltersStyles')) {
    const style = document.createElement('style');
    style.id = 'fuentesFiltersStyles';
    style.textContent = `
    /* Filters card */
    #configuracion-iframe-container .fuentes-filters-card { position: sticky; top: 0; z-index: 5; background: #fff; border: 1px solid var(--neutral-350, #e8ecf0); border-radius: 12px; padding: 12px 12px 12px 12px; box-shadow: 0 2px 8px rgba(11,36,49,.06); margin-bottom: 16px; }
    #configuracion-iframe-container .fuentes-filters-card .filters-reset { position:absolute; top:8px; right:8px; padding:4px 10px; font-size:12px; border-radius:14px; }
    #configuracion-iframe-container .fuentes-filters-card .filters-row { display:grid; grid-template-columns: 260px 260px 1fr; column-gap:20px; row-gap:16px; align-items:end; }
    #configuracion-iframe-container .fuentes-filters-card .filters-row + .filters-row { margin-top: 14px; }
    #configuracion-iframe-container .filter-block { display:flex; flex-direction:column; gap:4px; min-width: 220px; flex:1; position: relative; }
    #configuracion-iframe-container .filter-actions { margin-left:auto; }
    #configuracion-iframe-container .filter-label { font-weight:600; color: var(--text-color, #455862); font-size: 14px; }
    /* Chips */
    #configuracion-iframe-container .chip-select { display:flex; align-items:center; justify-content:space-between; gap:8px; border:1.5px solid #e9ecef; border-radius:12px; padding:6px 10px; min-height:44px; max-height:44px; overflow:hidden; background:#fff; box-shadow: 0 2px 8px rgba(11,36,49,.04); cursor:text; transition: box-shadow .2s ease, border-color .2s ease; }
    #configuracion-iframe-container .chip-select.fixed { width: 260px; }
    #configuracion-iframe-container .chip-select.active { border-color:#04db8d; box-shadow: 0 0 0 3px rgba(4,219,141,.15); }
    #configuracion-iframe-container .chips { display:flex; gap:6px; flex-wrap:nowrap; overflow:hidden; }
    #configuracion-iframe-container .chip-bubble { display:inline-flex; align-items:center; gap:8px; background: rgba(4,219,141,.08); color:#04db8d; padding:6px 10px; border-radius:9999px; font-size:12px; font-weight:600; cursor:default; white-space:nowrap; }
    #configuracion-iframe-container .chip-bubble .chip-x { cursor:pointer; opacity:.7; }
    #configuracion-iframe-container .chip-bubble .chip-x:hover { opacity:1; }
    #configuracion-iframe-container .btn-reset { background: transparent; border:1px solid var(--text-color, #455862); color: var(--text-color, #455862); border-radius:20px; padding:8px 16px; font-weight:600; cursor:pointer; }
    #configuracion-iframe-container .select-icons { display:flex; align-items:center; gap:10px; color:#455862; }
    #configuracion-iframe-container .clear-icon { cursor:pointer; opacity:.7; }
    #configuracion-iframe-container .clear-icon:hover { opacity:1; }
    #configuracion-iframe-container .caret { font-size:12px; }
    #configuracion-iframe-container .chip-dropdown { display:none; position:absolute; background:#fff; border:1px solid #e9ecef; border-radius:12px; box-shadow:0 8px 24px rgba(11,36,49,.12); padding:8px; max-height:260px; overflow:auto; min-width:240px; z-index:100; overscroll-behavior: contain; }
    #configuracion-iframe-container .chip-dropdown.open { display:block; }
    #configuracion-iframe-container .dropdown-item { padding:8px 10px; border-radius:8px; cursor:pointer; font-size:14px; }
    #configuracion-iframe-container .dropdown-item:hover { background:#f8f9fa; }
    #configuracion-iframe-container .selected-tag { width: max-content; max-width: 100%; }
    /* Subsection underline */
    #configuracion-iframe-container .fuentes-subsection { border-bottom: 1px solid #e9ecef; padding-bottom: 25px; margin-bottom: 20px; }
    /* Selected tags 2-row horizontal scroll */
    #configuracion-iframe-container .selected-tags-container { overflow-x: auto; overflow-y: hidden; max-height: 60px; padding-bottom: 32px; -webkit-overflow-scrolling: touch; scrollbar-gutter: stable both-edges; scrollbar-width: thin; scrollbar-color: #c1c9d0 transparent; }
    #configuracion-iframe-container .selected-tags-container::-webkit-scrollbar { height: 10px; }
    #configuracion-iframe-container .selected-tags-container::-webkit-scrollbar-track { background: transparent; }
    #configuracion-iframe-container .selected-tags-container::-webkit-scrollbar-thumb { background: #c1c9d0; border-radius: 8px; }
    #configuracion-iframe-container .selected-tags-track { display: inline-flex; flex-direction: column; gap: 5px; }
    #configuracion-iframe-container .selected-tags-row { display: inline-flex; gap: 5px; align-items: center; }
    /* Toast */
    #fuentesToast { position: fixed; top: 20px; right: 20px; z-index: 4000; display: none; background: #fff; color: var(--dark-color, #0b2431); border-left: 4px solid #04db8d; border: 1px solid var(--neutral-350, #e8ecf0); padding: 10px 12px; border-radius: 10px; box-shadow: 0 6px 16px rgba(0,0,0,0.1); font-weight: 600; font-size: 14px; min-width: 280px; }
    #fuentesToast.error { border-left-color: #d32f2f; }
    #fuentesToast.info { border-left-color: #455862; }
    `;
    document.head.appendChild(style);
  }

  // Toast helper
  function showToast(type, text, ms = 2600) {
    let el = document.getElementById('fuentesToast');
    if (!el) { el = document.createElement('div'); el.id = 'fuentesToast'; document.body.appendChild(el); }
    el.className = type ? type : '';
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(showToast.__t);
    showToast.__t = setTimeout(() => { el.style.display = 'none'; }, ms);
  }

  // Plan limits (instant UX)
  const fuentesLimits = { limitFuentes: null };
  function getDefaultFuentesLimits(plan) {
    switch (plan) {
      case 'plan1': return { limit_fuentes: 4 };
      case 'plan2': return { limit_fuentes: 10 };
      case 'plan3': return { limit_fuentes: 10 };
      case 'plan4': return { limit_fuentes: null }; // ilimitado
      default: return { limit_fuentes: 0 };
    }
  }
  try {
    const initialPlan = (window.userPlan || 'plan1');
    const defaults = getDefaultFuentesLimits(initialPlan);
    fuentesLimits.limitFuentes = defaults.limit_fuentes;
  } catch (e) {}
  fetch('/api/get-user-data')
    .then(res => res.json())
    .then(userData => {
      const defaults = getDefaultFuentesLimits(userData.subscription_plan || 'plan1');
      fuentesLimits.limitFuentes = (userData.limit_fuentes !== undefined ? userData.limit_fuentes : defaults.limit_fuentes);
    })
    .catch(err => console.error('Error preloading fuentes limits:', err));

  // Selection state
  const selectedSiglas = new Set();
  const siglaToTipo = new Map(); // SIGLA -> tipo_fuente
  const siglaToMeta = new Map(); // SIGLA -> full meta

  // Preselect from cobertura_legal (normalize to UPPERCASE)
  const selectedFuentes = (cobertura_legal?.fuentes_gobierno || cobertura_legal?.['fuentes-gobierno'] || cobertura_legal?.fuentes || []).map(f => (f||'').toUpperCase());
  const selectedReguladores = (cobertura_legal?.fuentes_reguladores || cobertura_legal?.['fuentes-reguladores'] || cobertura_legal?.['fuentes-regulador'] || cobertura_legal?.reguladores || []).map(f => (f||'').toUpperCase());
  [...selectedFuentes, ...selectedReguladores].forEach(s => s && selectedSiglas.add(s));

  // Filters state
  const state = { nivel_geografico: 'Todos', pais: 'Todos', region: 'Todos', tipo_fuente: 'Todos' };
  let facetsCache = null;

  // Build filters UI
  const filtersCard = document.createElement('div');
  filtersCard.className = 'fuentes-filters-card';
  filtersCard.style.position = 'relative';
  filtersCard.innerHTML = `
    <button id="btnResetFuentesFiltros" class="btn-reset filters-reset">Reset</button>
    <div class="filters-row">
      <div class="filter-block">
        <label class="filter-label">Nivel geográfico</label>
        <div class="chip-select fixed" id="nivelSelect">
          <div class="chips" id="nivelChips"><span class="chip-bubble" data-value="Todos">Todos <span class="chip-x">×</span></span></div>
          <div class="select-icons"><span class="clear-icon" id="nivelClear">×</span><span class="caret">▾</span></div>
        </div>
        <div class="chip-dropdown" id="nivelDropdown"></div>
      </div>
      <div class="filter-block">
        <label class="filter-label">Tipo de fuente</label>
        <div class="chip-select fixed" id="tipoSelect">
          <div class="chips" id="tipoChips"><span class="chip-bubble" data-value="Todos">Todos <span class="chip-x">×</span></span></div>
          <div class="select-icons"><span class="clear-icon" id="tipoClear">×</span><span class="caret">▾</span></div>
        </div>
        <div class="chip-dropdown" id="tipoDropdown"></div>
      </div>
    </div>
    <div class="filters-row" id="extraFilters" style="display:none;">
      <div class="filter-block" id="blockPais" style="display:none;">
        <label class="filter-label">País</label>
        <div class="chip-select fixed" id="paisSelect">
          <div class="chips" id="paisChips"><span class="chip-bubble" data-value="Todos">Todos <span class="chip-x">×</span></span></div>
          <div class="select-icons"><span class="clear-icon" id="paisClear">×</span><span class="caret">▾</span></div>
        </div>
        <div class="chip-dropdown" id="paisDropdown"></div>
      </div>
      <div class="filter-block" id="blockRegion" style="display:none;">
        <label class="filter-label">Región</label>
        <div class="chip-select fixed" id="regionSelect">
          <div class="chips" id="regionChips"><span class="chip-bubble" data-value="Todos">Todos <span class="chip-x">×</span></span></div>
          <div class="select-icons"><span class="clear-icon" id="regionClear">×</span><span class="caret">▾</span></div>
        </div>
        <div class="chip-dropdown" id="regionDropdown"></div>
      </div>
    </div>`;
  // Insert filters above container
  container.parentElement.insertBefore(filtersCard, container);

  // Helpers to render chip groups
  function renderChips(elId, values, current, onSelect) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '';
    const v = Array.isArray(values) ? values[0] : values;
    const label = (!v || String(v) === 'Todos') ? 'Todos' : v;
    const span = document.createElement('span');
    span.className = 'chip-bubble';
    span.dataset.value = label;
    span.innerHTML = `${label} <span class="chip-x">×</span>`;
    span.querySelector('.chip-x').addEventListener('click', (e) => { e.stopPropagation(); onSelect && onSelect('Todos'); });
    el.appendChild(span);
  }

  function updateExtraFiltersVisibility() {
    const extra = document.getElementById('extraFilters');
    const blockPais = document.getElementById('blockPais');
    const blockRegion = document.getElementById('blockRegion');
    const showPais = (state.nivel_geografico === 'Nacional' || state.nivel_geografico === 'Regional');
    const showRegion = (state.nivel_geografico === 'Regional');
    extra.style.display = (showPais || showRegion) ? 'flex' : 'none';
    blockPais.style.display = showPais ? 'flex' : 'none';
    blockRegion.style.display = showRegion ? 'flex' : 'none';
  }

  function bindSingleSelect({ selectId, chipsId, dropdownId, clearId, values, getValue, setValue, onChange }) {
    const selectEl = document.getElementById(selectId);
    const chipsEl = document.getElementById(chipsId);
    const dropdownEl = document.getElementById(dropdownId);
    const clearEl = document.getElementById(clearId);
    if (!selectEl || !chipsEl || !dropdownEl) return;

    function close() { dropdownEl.classList.remove('open'); selectEl.classList.remove('active'); }
    function open() {
      // position dropdown under select (2px gap), aligned to left, within filter-block
      const parentBlock = selectEl.closest('.filter-block');
      const parentRect = parentBlock.getBoundingClientRect();
      const rect = selectEl.getBoundingClientRect();
      const left = rect.left - parentRect.left;
      const top = rect.top - parentRect.top + rect.height + 2;
      dropdownEl.style.left = left + 'px';
      dropdownEl.style.top = top + 'px';
      dropdownEl.style.minWidth = rect.width + 'px';
      dropdownEl.classList.add('open');
      selectEl.classList.add('active');
    }

    // Populate dropdown
    dropdownEl.innerHTML = '';
    (values || []).forEach(v => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.textContent = v;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        setValue(v);
        renderChips(chipsId, v, v, (nv) => { setValue(nv); onChange && onChange(); });
        close();
        onChange && onChange();
      });
      dropdownEl.appendChild(item);
    });

    // Initial chips render (hide when Todos)
    renderChips(chipsId, getValue(), getValue(), (nv) => { setValue(nv); onChange && onChange(); });

    selectEl.addEventListener('click', (e) => { e.stopPropagation(); const isOpen = dropdownEl.classList.contains('open'); if (!isOpen) open(); else close(); });
    clearEl && clearEl.addEventListener('click', (e) => { e.stopPropagation(); setValue('Todos'); renderChips(chipsId, 'Todos', 'Todos', (nv)=>{ setValue(nv); onChange && onChange(); }); onChange && onChange(); });
    document.addEventListener('click', (e) => { if (!selectEl.contains(e.target) && !dropdownEl.contains(e.target)) close(); });
  }

  async function loadFacets() {
    if (facetsCache) return facetsCache;
    const r = await fetch('/api/info-fuentes/facets');
    const j = await r.json();
    facetsCache = (j && j.facets) || {};
    return facetsCache;
  }

  async function renderFilters() {
    const facets = await loadFacets();
    const niveles = ['Todos', ...((facets.nivel_geografico || []).filter(Boolean))];
    const tipos = ['Todos', ...((facets.tipo_fuente || []).filter(Boolean))];

    bindSingleSelect({
      selectId: 'nivelSelect', chipsId: 'nivelChips', dropdownId: 'nivelDropdown', clearId: 'nivelClear',
      values: niveles,
      getValue: () => state.nivel_geografico,
      setValue: (v) => { state.nivel_geografico = v; state.pais = 'Todos'; state.region = 'Todos'; updateExtraFiltersVisibility(); renderPaisRegionControls(); },
      onChange: () => { loadAndRender(); }
    });

    bindSingleSelect({
      selectId: 'tipoSelect', chipsId: 'tipoChips', dropdownId: 'tipoDropdown', clearId: 'tipoClear',
      values: tipos,
      getValue: () => state.tipo_fuente,
      setValue: (v) => { state.tipo_fuente = v; },
      onChange: () => { loadAndRender(); }
    });

    updateExtraFiltersVisibility();
    renderPaisRegionControls();
  }

  function renderPaisRegionControls() {
    const facets = facetsCache || {};
    if (state.nivel_geografico === 'Nacional') {
      const paises = ['Todos', ...((facets.pais_nacional || []).filter(Boolean))];
      bindSingleSelect({
        selectId: 'paisSelect', chipsId: 'paisChips', dropdownId: 'paisDropdown', clearId: 'paisClear',
        values: paises,
        getValue: () => state.pais,
        setValue: (v) => { state.pais = v; },
        onChange: () => { loadAndRender(); }
      });
    } else if (state.nivel_geografico === 'Regional') {
      const paises = ['Todos', ...((facets.pais_regional || []).filter(Boolean))];
      const regiones = ['Todos', ...((facets.regiones_regional || []).filter(Boolean))];
      bindSingleSelect({
        selectId: 'paisSelect', chipsId: 'paisChips', dropdownId: 'paisDropdown', clearId: 'paisClear',
        values: paises,
        getValue: () => state.pais,
        setValue: (v) => { state.pais = v; },
        onChange: () => { loadAndRender(); }
      });
      bindSingleSelect({
        selectId: 'regionSelect', chipsId: 'regionChips', dropdownId: 'regionDropdown', clearId: 'regionClear',
        values: regiones,
        getValue: () => state.region,
        setValue: (v) => { state.region = v; },
        onChange: () => { loadAndRender(); }
      });
    }
  }

  document.getElementById('btnResetFuentesFiltros').addEventListener('click', () => {
    state.nivel_geografico = 'Todos';
    state.tipo_fuente = 'Todos';
    state.pais = 'Todos';
    state.region = 'Todos';
    renderFilters();
    loadAndRender();
  });

  // Pagination config
  const itemsPerPage = 4;
  const createGrid = (items, sectionKey) => {
    let gridHtml = `<div class="fuentes-grid-container" data-section="${sectionKey}"><div class="fuentes-grid">`;
    items.forEach(fuente => {
      const isReg = (fuente.tipo_fuente === 'Reguladores');
      const tipoCobertura = isReg ? 'fuentes-reguladores' : 'fuentes-gobierno';
      const isSelected = selectedSiglas.has((fuente.sigla||'').toUpperCase());
      gridHtml += `<div class="fuente-box${isSelected ? ' selected': ''}" data-sigla="${fuente.sigla}" data-tipo="${tipoCobertura}" data-section="${sectionKey}"><strong data-full="${fuente.sigla} - ${fuente.nombre}">${fuente.sigla}</strong><span>${fuente.nombre}</span><div class=\"tick-badge\">✓</div></div>`;
    });
    gridHtml += `</div>`;
    if (items.length > itemsPerPage) {
      gridHtml += `<div class="grid-nav-arrow prev" style="display: none;"><i class="fas fa-chevron-left"></i></div><div class="grid-nav-arrow next"><i class="fas fa-chevron-right"></i></div>`;
    }
    gridHtml += `</div>`;
    return gridHtml;
  };

  function bindGridPagination(root) {
    root.querySelectorAll('.fuentes-grid-container').forEach(gridContainer => {
      const grid = gridContainer.querySelector('.fuentes-grid');
      const items = Array.from(grid.querySelectorAll('.fuente-box'));
      const prevArrow = gridContainer.querySelector('.prev');
      const nextArrow = gridContainer.querySelector('.next');
      let currentPage = 0;
      const totalItems = items.length;
      const totalPages = Math.ceil(totalItems / itemsPerPage);
      function showPage(page) {
        items.forEach((item, index) => {
          const isVisible = index >= page * itemsPerPage && index < (page + 1) * itemsPerPage;
          item.style.display = isVisible ? 'flex' : 'none';
        });
        if (prevArrow) prevArrow.style.display = page > 0 ? 'flex' : 'none';
        if (nextArrow) nextArrow.style.display = page < totalPages - 1 ? 'flex' : 'none';
      }
      if (totalItems > 0) showPage(0);
      if (nextArrow) nextArrow.addEventListener('click', () => { if (currentPage < totalPages - 1) { currentPage++; showPage(currentPage); } });
      if (prevArrow) prevArrow.addEventListener('click', () => { if (currentPage > 0) { currentPage--; showPage(currentPage); } });
    });
  }

  function updateSelectedTags() {
    // Clear all tag containers
    document.querySelectorAll('.selected-tags-container').forEach(c => { c.innerHTML = ''; });
    // Build map type -> selected siglas present in that type
    const byType = {};
    selectedSiglas.forEach(sig => {
      const tipo = siglaToTipo.get(sig) || 'Otros';
      if (!byType[tipo]) byType[tipo] = [];
      byType[tipo].push(sig);
    });
    Object.keys(byType).forEach(tipo => {
      const sectionKey = tipo.toLowerCase().replace(/\s+/g, '-');
      const containerTags = document.getElementById(`selected-tags-${sectionKey}`);
      if (containerTags) {
        const track = document.createElement('div');
        track.className = 'selected-tags-track';
        const rowTop = document.createElement('div');
        rowTop.className = 'selected-tags-row';
        const rowBottom = document.createElement('div');
        rowBottom.className = 'selected-tags-row';
        (byType[tipo] || []).forEach((sigla, index) => {
          const tag = document.createElement('span');
          tag.className = 'selected-tag';
          tag.textContent = sigla;
          if ((index % 2) === 0) rowTop.appendChild(tag); else rowBottom.appendChild(tag);
        });
        track.appendChild(rowTop);
        track.appendChild(rowBottom);
        containerTags.appendChild(track);
      }
    });
  }

  function bindSelectionHandlers(root) {
    root.querySelectorAll('.fuente-box').forEach(box => {
      box.addEventListener('click', () => {
        const sigla = (box.dataset.sigla || '').toUpperCase();
        const isSelecting = !selectedSiglas.has(sigla);
        if (isSelecting) {
          const limit = fuentesLimits.limitFuentes;
          if (limit !== null) {
            const currentCount = selectedSiglas.size;
            if (currentCount >= limit) {
              showToast('error', `Has alcanzado el límite de ${limit} fuentes para tu plan actual. Para seleccionar más fuentes, actualiza tu suscripción.`);
              return;
            }
          }
          selectedSiglas.add(sigla);
          box.classList.add('selected');
        } else {
          selectedSiglas.delete(sigla);
          box.classList.remove('selected');
        }
        updateSelectedTags();
      });
    });
  }

  async function loadAndRender() {
    // Build query
    const params = new URLSearchParams();
    if (state.nivel_geografico && state.nivel_geografico !== 'Todos') params.append('nivel_geografico', state.nivel_geografico);
    if (state.pais && state.pais !== 'Todos') params.append('pais', state.pais);
    if (state.region && state.region !== 'Todos') params.append('region', state.region);
    if (state.tipo_fuente && state.tipo_fuente !== 'Todos') params.append('tipo_fuente', state.tipo_fuente);

    const r = await fetch(`/api/info-fuentes?${params.toString()}`);
    const j = await r.json();
    const data = (j && j.data) || [];

    // Rebuild maps (include all fetched docs for tag classification)
    siglaToTipo.clear();
    siglaToMeta.clear();
    data.forEach(d => {
      const key = (d.sigla||'').toUpperCase();
      siglaToTipo.set(key, d.tipo_fuente);
      siglaToMeta.set(key, d);
    });

    // Group by tipo_fuente
    const grouped = {};
    data.forEach(d => { (grouped[d.tipo_fuente] = grouped[d.tipo_fuente] || []).push(d); });

    // Build HTML (header with Guardar + sections)
    let html = '';
    html += `<div class="section-header">`;
    html += `<h3 class="summary-title" style="margin-right:auto;">Fuentes</h3>`;
    html += `<button id="saveFuentesBtn" class="save-fuentes-btn-inline">Guardar</button>`;
    html += `<div id="saveStatus" class="save-status"></div>`;
    html += `</div>`;

    // Ordered sections
    const tipoOrder = ['Boletines Oficiales','Reguladores','Actividad Parlamentaria','Organismos Gubernamentales','Comunicados y prensa'];
    const keys = Object.keys(grouped).sort((a,b)=> tipoOrder.indexOf(a) - tipoOrder.indexOf(b));
    keys.forEach(tipo => {
      const sectionKey = tipo.toLowerCase().replace(/\s+/g, '-');
      html += `<div class="fuentes-subsection">`;
      html += `<div class="section-header" style="margin-bottom:6px;">`;
      html += `<h4 class="fuentes-subsection-title">${tipo}</h4>`;
      html += `</div>`;
      html += `<div class="selected-tags-container" id="selected-tags-${sectionKey}" style="margin-bottom:10px;"></div>`;
      html += createGrid(grouped[tipo], sectionKey);
      html += `</div>`;
    });

    container.innerHTML = html;

    // Attach grid pagination and selection handlers
    bindGridPagination(container);
    bindSelectionHandlers(container);

    // Render selected tags
    updateSelectedTags();

    // Bind save
    const saveBtnEl = document.getElementById('saveFuentesBtn');
    if (saveBtnEl) saveBtnEl.addEventListener('click', onSave);
  }

  async function onSave() {
    const saveBtn = document.getElementById('saveFuentesBtn');
    const saveStatus = document.getElementById('saveStatus');

    saveStatus.textContent = '';
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<div class="button-spinner"></div>';
    saveBtn.classList.add('loading');

    try {
      // Build cobertura_legal from selectedSiglas using tipo_fuente mapping
      const newCobertura = { 'fuentes-gobierno': [], 'fuentes-reguladores': [], 'fuentes-tramitacion': [] };
      selectedSiglas.forEach(sig => {
        const meta = siglaToMeta.get(sig) || {};
        const tipo = (meta.tipo_fuente === 'Reguladores') ? 'fuentes-reguladores' : 'fuentes-gobierno';
        if (!newCobertura[tipo].includes(sig)) newCobertura[tipo].push(sig);
      });

      const cobertura_legal = {
        fuentes_gobierno: newCobertura['fuentes-gobierno'],
        fuentes_reguladores: newCobertura['fuentes-reguladores']
      };

      const rangos = ["Acuerdos Internacionales","Normativa Europea","Legislacion Nacional","Normativa Reglamentaria","Decisiones Judiciales","Doctrina Administrativa","Comunicados, Guias y Opiniones Consultivas","Consultas Publicas","Normativa en tramitación","Otras"];

      let result;
      if (typeof window.EtiquetasResolver !== 'undefined') {
        result = await window.EtiquetasResolver.updateCoberturaLegal(cobertura_legal, rangos);
        if (!result.success) {
          if (result.conflict) { window.EtiquetasResolver.handleVersionConflict(result); return; }
          if (result.permission_error) {
            saveStatus.textContent = result.error || 'Sin permisos para editar fuentes empresariales';
            saveBtn.classList.remove('loading');
            saveBtn.innerHTML = 'Guardar';
            saveBtn.disabled = false;
            return;
          }
          throw new Error(result.error || 'Error actualizando fuentes');
        }
      } else {
        const response = await fetch('/api/update-user-data', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ cobertura_legal, rangos })
        });
        if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Error actualizando fuentes'); }
        result = await response.json();
      }

      if (result.success) {
        saveBtn.classList.remove('loading');
        saveBtn.innerHTML = '✓ Guardado';
        saveBtn.classList.add('success');
        showToast('success', 'Fuentes guardadas correctamente');
        try {
          const response = await fetch('/api/get-user-data');
          const userData = await response.json();
          if (typeof updateUsageTrackers === 'function') { updateUsageTrackers(userData); }
        } catch (err) { console.error('Error updating tracker:', err); }
        setTimeout(() => { saveBtn.innerHTML = 'Guardar'; saveBtn.classList.remove('success'); saveBtn.disabled = false; }, 2000);
      } else {
        saveBtn.classList.remove('loading');
        saveBtn.innerHTML = 'Guardar';
        saveStatus.textContent = 'Error, pruebe de nuevo';
        saveBtn.disabled = false;
      }
    } catch (err) {
      console.error('Error saving fuentes:', err);
      saveBtn.classList.remove('loading');
      saveBtn.innerHTML = 'Guardar';
      saveStatus.textContent = err.message || 'Error, pruebe de nuevo';
      saveBtn.disabled = false;
    }
  }

  // Initial render
  renderFilters();
  loadAndRender();
}

// Expose globally
window.populateFuentes = populateFuentes;

