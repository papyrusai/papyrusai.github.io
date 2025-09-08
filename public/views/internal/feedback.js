(function(){
  // Simple helpers
  function q(id){ return document.getElementById(id); }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }

  // Gate: only allow execution for tomas@reversa.ai (same policy as dashboard_interno.js)
  function hasAccess(){
    try {
      var __userEmailEl = window.document.getElementById('userEmail');
      var __userEmailTxt = __userEmailEl && __userEmailEl.textContent ? __userEmailEl.textContent.trim() : '';
      var __userEmail = (__userEmailTxt && __userEmailTxt.startsWith('"') && __userEmailTxt.endsWith('"')) ? JSON.parse(__userEmailTxt) : __userEmailTxt;
      return (__userEmail === 'tomas@reversa.ai');
    } catch(_) { return false; }
  }

  const STATE = {
    users: [], // [{ email, userId, displayName }]
    selectedEmail: null,
    selectedType: 'all', // 'all' | 'like' | 'dislike' | 'eliminados'
    incorporado: 'all', // 'all' | 'si' | 'no'
    desde: null,
    hasta: null,
    pagination: { page: 1, totalPages: 1, pageSize: 25, total: 0 },
    isLoading: false,
    chart: null
  };

  async function loadFeedbackUsers(){
    try {
      const res = await fetch('/api/internal/review/feedback/users', { headers:{ 'Accept':'application/json' }, credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json().catch(()=>({ success:false }));
      if (data && data.success && Array.isArray(data.items)) {
        STATE.users = data.items;
      } else {
        STATE.users = [];
      }
    } catch(e){
      console.error('[feedback] loadFeedbackUsers error', e);
      STATE.users = [];
    }
  }

  function populateUserFilter(){
    const sel = q('fbUsuario'); if (!sel) return;
    sel.innerHTML = '';
    // Add 'Todos' option
    const allOpt = document.createElement('option');
    allOpt.value = 'ALL'; allOpt.textContent = 'Todos';
    sel.appendChild(allOpt);
    STATE.users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.email; opt.textContent = u.displayName || u.email || u.userId || '(usuario)';
      sel.appendChild(opt);
    });
    sel.value = STATE.selectedEmail || 'ALL';
    STATE.selectedEmail = sel.value;
  }

  function setLoading(loading){
    STATE.isLoading = !!loading;
    const sectionLoader = q('fbSectionLoader'); if (sectionLoader) sectionLoader.style.display = loading ? 'block' : 'none';
    const btn = q('fbBtnBuscar'); if (btn) {
      btn.disabled = !!loading;
      if (loading) btn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(11,36,49,.2);border-top-color:#0b2431;border-radius:50%;vertical-align:-3px;animation:spin 1s linear infinite;"></span> Buscando...';
      else btn.innerHTML = 'Buscar';
    }
  }

  async function fetchFeedback(page){
    if (!STATE.selectedEmail) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('userEmail', STATE.selectedEmail);
      params.set('type', STATE.selectedType);
      if (STATE.incorporado) params.set('incorporado', STATE.incorporado);
      if (STATE.desde) params.set('desde', STATE.desde);
      if (STATE.hasta) params.set('hasta', STATE.hasta);
      params.set('page', String(page || 1));
      params.set('pageSize', String(STATE.pagination.pageSize));
      const res = await fetch('/api/internal/review/feedback/data?' + params.toString(), { headers:{ 'Accept':'application/json' }, credentials:'same-origin' });
      const data = await res.json().catch(()=>({ success:false }));
      if (data && data.success){
        q('feedback-docs-container').innerHTML = data.documentsHtml || '';
        bindIncorporadoControls();
        const p = data.pagination || { page:1, totalPages:1, total:0, pageSize: STATE.pagination.pageSize };
        STATE.pagination.page = p.page || 1;
        STATE.pagination.totalPages = p.totalPages || 1;
        STATE.pagination.total = p.total || 0;
        renderPagination();
        await fetchStatsAndRenderChart();
      } else {
        q('feedback-docs-container').innerHTML = `<div class="no-results" style="color:#0b2431; font-weight:bold; padding:20px; text-align:center; font-size:16px; background-color:#f8f9fa; border-radius:8px; margin:12px 0;">No hay resultados.</div>`;
        STATE.pagination.page = 1; STATE.pagination.totalPages = 1; STATE.pagination.total = 0; renderPagination();
        await fetchStatsAndRenderChart();
      }
    } catch(e){
      console.error('[feedback] fetchFeedback error', e);
      q('feedback-docs-container').innerHTML = `<div class="no-results" style="color:#0b2431; font-weight:bold; padding:20px; text-align:center; font-size:16px; background-color:#f8f9fa; border-radius:8px; margin:12px 0;">Error cargando feedback.</div>`;
    } finally {
      setLoading(false);
    }
  }

  function bindIncorporadoControls(){
    const selects = document.querySelectorAll('.incorp-select');
    selects.forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const el = e.target;
        const email = el.getAttribute('data-email');
        const coll = el.getAttribute('data-coll');
        const doc = el.getAttribute('data-doc');
        const status = el.parentElement.querySelector('.incorp-status');
        if (status) { status.textContent = 'Guardando...'; }
        try {
          const res = await fetch('/api/internal/review/feedback/incorporado', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ userEmail: email, coleccion: coll, docId: doc, value: el.value })
          });
          const data = await res.json().catch(()=>({ success:false }));
          if (status) { status.textContent = data && data.success ? 'Guardado' : 'Error'; }
        } catch(_) {
          if (status) { status.textContent = 'Error'; }
        } finally {
          setTimeout(()=>{ if (status) status.textContent = ''; }, 1500);
        }
      });
    });
  }

  async function fetchStatsAndRenderChart(){
    const cont = q('fbChartContainer'); const loader = q('fbStatsLoader');
    if (!cont) return;
    cont.style.display = 'none';
    try {
      const params = new URLSearchParams();
      params.set('type', STATE.selectedType);
      if (STATE.selectedEmail) params.set('userEmail', STATE.selectedEmail);
      if (STATE.incorporado) params.set('incorporado', STATE.incorporado);
      if (STATE.desde) params.set('desde', STATE.desde);
      if (STATE.hasta) params.set('hasta', STATE.hasta);
      const res = await fetch('/api/internal/review/feedback/stats?' + params.toString(), { headers:{ 'Accept':'application/json' }, credentials:'same-origin' });
      const data = await res.json().catch(()=>({ success:false }));
      const items = (data && data.success && Array.isArray(data.items)) ? data.items : [];
      if (!items.length){ cont.style.display = 'none'; return; }
      // Order by total desc
      items.sort((a,b)=> (b.total||0) - (a.total||0));
      const labels = items.map(it => it.displayName || it.email || '');
      const likesAbs = items.map(it => it.like || 0);
      const dislikesAbs = items.map(it => it.dislike || 0);
      const deletedAbs = items.map(it => it.deleted || 0);
      const noFeedbackAbs = items.map(it => it.noFeedback || 0);
      // Normalize to percentages per user
      const likes = []; const dislikes = []; const deleted = []; const noFeedback = [];
      items.forEach((it, idx) => {
        const tot = Math.max(1, (it.total || 0));
        likes.push(((likesAbs[idx] || 0) / tot) * 100);
        dislikes.push(((dislikesAbs[idx] || 0) / tot) * 100);
        deleted.push(((deletedAbs[idx] || 0) / tot) * 100);
        noFeedback.push(((noFeedbackAbs[idx] || 0) / tot) * 100);
      });
      renderStackedBar(labels, likes, dislikes, deleted, noFeedbackAbs);
      cont.style.display = 'block';
    } catch(e){
      console.error('[feedback] fetchStats error', e);
    } finally { }
  }

  function renderStackedBar(labels, likes, dislikes, deleted, totals){
    try {
      if (!window.Chart) return;
      const ctx = q('feedbackChart')?.getContext('2d'); if (!ctx) return;
      if (STATE.chart) { try { STATE.chart.destroy(); } catch(_){} }
      STATE.chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Dislikes', data: dislikes, backgroundColor: 'rgba(211,47,47,0.35)', borderColor: '#d32f2f', borderWidth: 1, stack: 'feedback' },
            { label: 'Likes', data: likes, backgroundColor: 'rgba(4,219,141,0.35)', borderColor: '#04db8d', borderWidth: 1, stack: 'feedback' },
            { label: 'Eliminados', data: deleted, backgroundColor: 'rgba(255,152,0,0.35)', borderColor: '#ff9800', borderWidth: 1, stack: 'feedback' },
            { label: 'Sin feedback', data: labels.map((_,i)=> Math.max(0, 100 - (Number(likes[i]||0) + Number(dislikes[i]||0) + Number(deleted[i]||0)))), backgroundColor: 'rgba(108,117,125,0.25)', borderColor: '#6c757d', borderWidth: 1, stack: 'feedback' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { color: '#455862' } },
            tooltip: {
              callbacks: {
                afterTitle: (items) => {
                  if (!items || !items.length) return '';
                  const idx = items[0].dataIndex;
                  return `Total: ${totals && totals[idx] != null ? totals[idx] : '-'}`;
                },
                label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.parsed.y || 0).toFixed(1)}%`
              }
            },
            datalabels: {
              display: true,
              formatter: (value, context) => {
                try { if (context.datasetIndex === 2) { const idx = context.dataIndex; return `Total: ${totals && totals[idx] != null ? totals[idx] : '-'}`; } } catch(_){}
                return '';
              },
              color: '#0b2431',
              anchor: 'end',
              align: 'start',
            }
          },
          scales: {
            x: { stacked: true, ticks: { color: '#455862' } },
            y: { stacked: true, ticks: { color: '#455862', callback: (v)=> v + '%' }, beginAtZero: true, max: 100 }
          }
        }
      });
    } catch(_){}
  }

  function renderPagination(){
    const info = q('fbPageInfo'); if (info) info.textContent = `Página ${STATE.pagination.page} de ${STATE.pagination.totalPages}`;
    const prev = q('fbPrev'); if (prev) prev.disabled = STATE.pagination.page <= 1;
    const next = q('fbNext'); if (next) next.disabled = STATE.pagination.page >= STATE.pagination.totalPages;
    const cont = q('feedback-pagination'); if (cont) cont.style.display = (STATE.pagination.totalPages > 1) ? 'block' : 'none';
  }

  function bindUI(){
    const sel = q('fbUsuario');
    if (sel){ sel.addEventListener('change', () => { STATE.selectedEmail = sel.value; }); }
    const tipo = q('fbTipo');
    if (tipo){ tipo.addEventListener('change', () => { STATE.selectedType = tipo.value; }); }
    const inc = q('fbIncorporado');
    if (inc){ inc.addEventListener('change', () => { STATE.incorporado = inc.value; }); }
    const d = q('fbDesde'); if (d){ d.addEventListener('change', () => { STATE.desde = d.value; }); }
    const h = q('fbHasta'); if (h){ h.addEventListener('change', () => { STATE.hasta = h.value; }); }
    const btn = q('fbBtnBuscar');
    if (btn){ btn.addEventListener('click', () => fetchFeedback(1)); }
    const prev = q('fbPrev');
    if (prev){ prev.addEventListener('click', () => { if (STATE.pagination.page > 1) fetchFeedback(STATE.pagination.page - 1); }); }
    const next = q('fbNext');
    if (next){ next.addEventListener('click', () => { if (STATE.pagination.page < STATE.pagination.totalPages) fetchFeedback(STATE.pagination.page + 1); }); }

    // Removed old buttons; dropdown is the new control
  }

  function updateTypeButtonsUI(){
    const tipo = q('fbTipo'); if (tipo) tipo.value = STATE.selectedType;
  }

  async function init(){
    if (!hasAccess()) {
      const container = document.querySelector('#content-internal') || document.body;
      if (container) container.innerHTML = '<div class="banner-error" style="margin:16px;">No tienes permisos para acceder al Dashboard Interno.</div>';
      return;
    }
    await loadFeedbackUsers();
    populateUserFilter();
    updateTypeButtonsUI();
    // Default dates: desde = first day of current month; hasta = today
    try {
      const today = new Date();
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const fmt = (d)=>{ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; };
      const desdeStr = fmt(first); const hastaStr = fmt(today);
      const desdeEl = q('fbDesde'); const hastaEl = q('fbHasta');
      if (desdeEl) desdeEl.value = desdeStr; STATE.desde = desdeStr;
      if (hastaEl) hastaEl.value = hastaStr; STATE.hasta = hastaStr;
    } catch(_){}
  }

  window.initializeInternalFeedback = async function(){
    bindUI();
    await init();
  };

  // Auto-init when DOM ready (best-effort):
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    try { window.initializeInternalFeedback(); } catch(_){ }
  } else {
    document.addEventListener('DOMContentLoaded', () => { try { window.initializeInternalFeedback(); } catch(_){ } });
  }
})();


