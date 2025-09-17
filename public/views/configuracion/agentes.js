// Use a function that can be called when content is loaded dynamically
function initializeConfigurationMenu() {
  const container = document.getElementById('configuracion-iframe-container');
  if (!container) return;
  
  const menuItems = container.querySelectorAll('.config-menu-item');
  const contents = container.querySelectorAll('.config-content');
  
  // Remove any existing event listeners to avoid duplicates
  menuItems.forEach(item => {
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);
  });
  
  // Get the updated menu items after cloning
  const newMenuItems = container.querySelectorAll('.config-menu-item');
  
  // IMPORTANT: Check if user has etiquetas_personalizadas to determine default tab
  async function setDefaultTab() {
    try {
      let shouldShowAgentes = false;
      
      // Check user's own etiquetas_personalizadas
      const response = await fetch('/api/get-user-data');
      if (response.ok) {
        const userData = await response.json();
        const userEtiquetas = userData.etiquetas_personalizadas || {};
        if (Object.keys(userEtiquetas).length > 0) {
          shouldShowAgentes = true;
          console.log('🎯 User has personal etiquetas, setting Agentes as default tab');
        }
      }
      
      // If user doesn't have personal etiquetas, check estructura_empresa
      if (!shouldShowAgentes) {
        try {
          const contextResponse = await fetch('/api/etiquetas-context');
          if (contextResponse.ok) {
            const contextData = await contextResponse.json();
            const empresaEtiquetas = contextData.data || {};
            if (Object.keys(empresaEtiquetas).length > 0) {
              shouldShowAgentes = true;
              console.log('🎯 User has empresa etiquetas, setting Agentes as default tab');
            }
          }
        } catch (e) {
          console.log('No empresa etiquetas found');
        }
      }
      
      // Remove active from all items first
        newMenuItems.forEach(menuItem => menuItem.classList.remove('active'));
        contents.forEach(content => content.classList.remove('active'));
        
      if (shouldShowAgentes) {
        // Set Agentes as active immediately
        const agentesMenuItem = container.querySelector('[data-content="agentes"]');
        const agentesContent = container.querySelector('#agentes-content');
        
        if (agentesMenuItem && agentesContent) {
          agentesMenuItem.classList.add('active');
          agentesContent.classList.add('active');
          
          // Show stable loader immediately
          showStableLoader();
          
          // Start initialization immediately 
          setTimeout(() => {
            console.log('🚀 Starting initializeAgentsAndFolders for default tab...');
            initializeAgentsAndFolders();
          }, 100);
        }
      } else {
        // Set Contexto as active if no agentes
        const contextoMenuItem = container.querySelector('[data-content="contexto"]');
        const contextoContent = container.querySelector('#contexto-content');
        
        if (contextoMenuItem && contextoContent) {
          contextoMenuItem.classList.add('active');
          contextoContent.classList.add('active');
        }
      }
    } catch (error) {
      console.error('Error determining default tab:', error);
      // Fall back to contexto as default
      const contextoMenuItem = container.querySelector('[data-content="contexto"]');
      const contextoContent = container.querySelector('#contexto-content');
      
      if (contextoMenuItem && contextoContent) {
        contextoMenuItem.classList.add('active');
        contextoContent.classList.add('active');
      }
    }
  }
  
  // Set the default tab based on user's etiquetas
  setDefaultTab();
  
  newMenuItems.forEach(item => {
    item.addEventListener('click', function() {
      const targetContent = this.getAttribute('data-content');
      
      // Remove active class from all menu items and contents
      newMenuItems.forEach(menuItem => menuItem.classList.remove('active'));
      contents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked menu item and corresponding content
      this.classList.add('active');
      const targetElement = container.querySelector('#' + targetContent + '-content');
      if (targetElement) {
        targetElement.classList.add('active');
        
        // If switching to fuentes content, check for banner display
        if (targetContent === 'fuentes') {
          setTimeout(() => checkAndShowAgentesRegulatoryBanner(), 100);
        }
        
        // If switching to agentes content, initialize empresa context
        if (targetContent === 'agentes') {
          // Show stable loader immediately
          showStableLoader();
          
          // Start initialization
          setTimeout(() => {
            console.log('🚀 Starting initializeAgentsAndFolders...');
            initializeAgentsAndFolders();
          }, 100);
        }
      }
    });
  });
}

// Centralized loader management to prevent flickering
function showStableLoader() {
          const agentsGrid = document.getElementById('agentsGrid');
  if (!agentsGrid) return;
  
  // If loader already exists, don't recreate it
  if (agentsGrid.querySelector('#stable-agents-loader')) {
    console.log('✅ Stable loader already exists, not recreating');
    return;
  }
  
  console.log('🔄 SHOWING STABLE LOADER');
            agentsGrid.innerHTML = `
    <div id="stable-agents-loader" style="
                display: flex !important;
                align-items: center;
                justify-content: center;
                padding: 40px;
                min-height: 200px;
      position: relative;
              ">
      <div class="stable-loader-spinner" style="
                  width: 24px;
                  height: 24px;
                  border: 2px solid #f1f1f1;
                  border-top: 2px solid #6c757d;
                  border-radius: 50%;
        animation: stable-spin 0.8s linear infinite;
                "></div>
              </div>
              <style>
      @keyframes stable-spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              </style>
            `;
            
  // If coordinated render already completed, do not re-show stable loader
  if (agentsGrid.dataset.coordinatedRendered === 'true') {
    console.log('✅ Coordinated render already completed, skipping loader');
    return;
  }
  // Mark as stable loading to prevent other functions from overriding
  agentsGrid.dataset.stableLoading = 'true';
            agentsGrid.style.opacity = '1';
            agentsGrid.style.visibility = 'visible';
            agentsGrid.style.display = 'block';
            
  // Force redraw to ensure immediate visibility
            agentsGrid.offsetHeight;
}

function clearStableLoader() {
  const agentsGrid = document.getElementById('agentsGrid');
  if (agentsGrid && agentsGrid.dataset.stableLoading === 'true') {
    console.log('🔄 CLEARING STABLE LOADER');
    delete agentsGrid.dataset.stableLoading;
    delete agentsGrid.dataset.coordinatedLoading;
  }
}

// Helper function to save etiquetas using the resolver
async function saveEtiquetasWithResolver(etiquetas) {
  try {
    // Check if EtiquetasResolver is available
    if (typeof window.EtiquetasResolver === 'undefined') {
      console.warn('EtiquetasResolver not available, using legacy method');
      // Fallback to legacy method
      const response = await fetch('/api/update-user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etiquetas_personalizadas: etiquetas })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error actualizando etiquetas');
      }
      
      return { success: true, source: 'legacy' };
    }
    
    // Use resolver
    const result = await window.EtiquetasResolver.updateEtiquetasPersonalizadas(etiquetas);
    
    if (!result.success) {
      if (result.conflict) {
        // Handle version conflict
        window.EtiquetasResolver.handleVersionConflict(result);
        return result;
      }
      
      if (result.permission_error) {
        // Show permission error using modal
        showErrorModal({
          title: 'Sin Permisos',
          message: result.error || 'Sin permisos para editar etiquetas empresariales',
          confirmText: 'Entendido'
        });
        return result;
      }
      
      throw new Error(result.error || 'Error actualizando etiquetas');
    }
    
    return result;
  } catch (error) {
    console.error('Error en saveEtiquetasWithResolver:', error);
    throw error;
  }
}

// Initialize empresa context UI when agentes tab is active
async function initializeEmpresaContext() {
  try {
    if (typeof window.EtiquetasResolver === 'undefined') return;
    
    const context = await window.EtiquetasResolver.getUserContext();
    
    // Setup readonly buttons for empresa users without edit permissions
    if (context.tipo_cuenta === 'empresa' && !context.can_edit_empresa) {
      if (typeof window.EtiquetasResolver.setupReadonlyButtons === 'function') {
        setTimeout(() => window.EtiquetasResolver.setupReadonlyButtons(), 200);
      }
    }
  } catch (error) {
    console.error('Error inicializando contexto empresa:', error);
  }
}

// Initialize agents and folders in parallel for optimal performance  
async function initializeAgentsAndFolders() {
  const agentsGrid = document.getElementById('agentsGrid');
  
  try {
    console.log('🔄 Starting coordinated initialization...');
    
    // Ensure stable loader is shown if not already present
    if (!agentsGrid || !agentsGrid.querySelector('#stable-agents-loader')) {
      console.log('⚠️ No stable loader found, showing fallback...');
      showStableLoader();
    } else {
      console.log('✅ Stable loader already present, proceeding...');
    }
    
    // STEP 1: Load all data in parallel (NO RENDERING YET)
    console.log('📡 Loading all data in parallel...');
    const [foldersInitResult, agentsDataResult, contextResult] = await Promise.allSettled([
      // Initialize folders system (load data only, don't render)
      (async () => {
        if (window.CarpetasAgentes && typeof window.CarpetasAgentes.init === 'function') {
          await window.CarpetasAgentes.init();
          return true;
        }
        return false;
      })(),
      
      // Load agents data without rendering (prefer clean display when available)
      (async () => {
        if (typeof window.EtiquetasResolver !== 'undefined' && 
            typeof window.EtiquetasResolver.getEtiquetasPersonalizadas === 'function') {
          const result = await window.EtiquetasResolver.getEtiquetasPersonalizadas();
          const limpio = result.etiquetas_personalizadas_limpio || null;
          if (limpio && Object.keys(limpio).length > 0) return limpio;
          return result.etiquetas_personalizadas || {};
        } else {
          const response = await fetch('/api/get-user-data');
          const userData = await response.json();
          return userData.etiquetas_personalizadas || {};
        }
      })(),
      
      // Load context data (enterprise full context for limits)
      (async () => {
        if (typeof window.EtiquetasResolver !== 'undefined' && typeof window.EtiquetasResolver.getContextData === 'function') {
          return await window.EtiquetasResolver.getContextData();
        }
        // Fallback to user-context if resolver lacks full context
        if (typeof window.EtiquetasResolver !== 'undefined') {
          return await window.EtiquetasResolver.getUserContext();
        }
        return null;
      })()
    ]);

    // Process results
    let etiquetasData = {};
    let foldersReady = false;
    let contextData = null;

    if (foldersInitResult.status === 'fulfilled') {
      foldersReady = foldersInitResult.value;
      console.log('✅ Folders data loaded');
    } else {
      console.error('❌ Error initializing folders:', foldersInitResult.reason);
    }

    if (agentsDataResult.status === 'fulfilled') {
      etiquetasData = agentsDataResult.value;
      console.log('✅ Agents data loaded, count:', Object.keys(etiquetasData).length);
    } else {
      console.error('❌ Error loading agents:', agentsDataResult.reason);
    }

    if (contextResult.status === 'fulfilled') {
      contextData = contextResult.value;
      console.log('✅ Context data loaded');
    }

    // STEP 2: Setup context but still don't render
    if (contextData && contextData.tipo_cuenta === 'empresa' && !contextData.can_edit_empresa) {
      if (typeof window.EtiquetasResolver.setupReadonlyButtons === 'function') {
        // We'll do this after rendering is complete
      }
    }

    // Update usage trackers with loaded data (but don't render yet)
    if (contextData) {
      try {
        const userData = {
          subscription_plan: contextData.subscription_plan || 'plan1',
          limit_agentes: contextData.limit_agentes,
          limit_fuentes: contextData.limit_fuentes,
          etiquetas_personalizadas: etiquetasData,
          cobertura_legal: contextData.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] }
        };
        updateUsageTrackers(userData);
        console.log('✅ Usage trackers updated');
      } catch (e) {
        console.warn('⚠️ Could not update usage trackers:', e);
      }
    }

    // STEP 3: Wait a moment to ensure all data is fully processed
    await new Promise(resolve => setTimeout(resolve, 100));

    // STEP 4: Now render everything AT ONCE
    console.log('🎨 Rendering all UI components...');
    
    // First, render the folder tree structure
    if (foldersReady && window.CarpetasAgentes && typeof window.CarpetasAgentes.renderUI === 'function') {
      window.CarpetasAgentes.renderUI();
      console.log('✅ Folders UI rendered');
    }
    
    // Wait for folders to be completely rendered
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Finally, render agents grid with all assignments ready
    console.log('🎯 Rendering agents grid with folder assignments...');
    console.log('🔄 ABOUT TO CALL renderAgentsGridCoordinated - this should clear the loader');
    renderAgentsGridCoordinated(etiquetasData);
    console.log('✅ renderAgentsGridCoordinated completed');
    
    // Setup readonly buttons after everything is rendered
    if (contextData && contextData.tipo_cuenta === 'empresa' && !contextData.can_edit_empresa) {
      if (typeof window.EtiquetasResolver.setupReadonlyButtons === 'function') {
        setTimeout(() => window.EtiquetasResolver.setupReadonlyButtons(), 200);
      }
    }
    
    console.log('🎉 Coordinated initialization complete!');

  } catch (error) {
    console.error('💥 Error in coordinated initialization:', error);
    // Show error state
    if (agentsGrid) {
      agentsGrid.innerHTML = `
        <div style="color:var(--error);font-size:14px;text-align:center;padding:20px;">
          <i class="fas fa-exclamation-triangle" style="margin-right:8px;"></i>
          Error cargando configuración. <a href="#" onclick="location.reload()" style="color:var(--reversa-blue);text-decoration:underline;">Recargar página</a>
        </div>
      `;
    }
  }
}

function checkAndShowAgentesRegulatoryBanner() {
  let hasEtiquetasPersonalizadas = false;
  
  try {
    // Try to get etiquetas personalizadas from parent window
    if (window.parent && window.parent.document) {
      const etiquetasElement = window.parent.document.getElementById('userEtiquetasPersonalizadas');
      if (etiquetasElement) {
        const etiquetas = JSON.parse(etiquetasElement.textContent || '{}');
        hasEtiquetasPersonalizadas = Object.keys(etiquetas).length > 0;
      }
    }
  } catch (error) {
    console.log('Could not access parent window data:', error);
  }
  
  const agentesBtn = document.getElementById('configuraAgentesBtn');
  if (agentesBtn) {
    if (!hasEtiquetasPersonalizadas) {
      agentesBtn.style.display = 'block';
      agentesBtn.onclick = () => {
        // Switch to "Agentes" tab
        const menuItems = document.querySelectorAll('.config-menu-item');
        menuItems.forEach(item => {
          if (item.dataset.content === 'agentes') {
            item.click();
          }
        });
      };
    } else {
      agentesBtn.style.display = 'none';
    }
  }
}

// Agent management functions (moved outside to be globally accessible)

// Function to load existing agents from database
window.AGENTS_STATE = window.AGENTS_STATE || { currentAgentKey: null, originalXml: '', originalVars: null, isEditing: false, isDirty: false };
const AGENTS_STATE = window.AGENTS_STATE;

function extractTag(xmlString, tagName){
  if(!xmlString) return '';
  try{
    const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = xmlString.match(regex);
    return match ? match[1].trim() : '';
  } catch(e){
    return '';
  }
}

function parseEtiquetaDefinition(xmlString){
  return {
    NombreEtiqueta: extractTag(xmlString, 'NombreEtiqueta'),
    tipo: extractTag(xmlString, 'tipo'),
    Contexto: extractTag(xmlString, 'Contexto'),
    Objetivo: extractTag(xmlString, 'Objetivo'),
    Contenido: extractTag(xmlString, 'Contenido'),
    DocumentosNoIncluidos: extractTag(xmlString, 'DocumentosNoIncluidos')
  };
}

// Safely render bold markers: escape HTML, then allow <b>...</b> as <strong>...</strong>
function escapeHtmlForDisplay(text){
  try{
    return (text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }catch(_){ return (text||''); }
}
function renderWithBoldMarkers(text){
  const esc = escapeHtmlForDisplay(text);
  return esc
    .replace(/&lt;b&gt;/g, '<strong>')
    .replace(/&lt;\/b&gt;/g, '</strong>');
}

function renderMultilineWithBold(text){
  try{
    return renderWithBoldMarkers(text || '').replace(/\n/g, '<br>');
  }catch(_){ return renderWithBoldMarkers(text||''); }
}

function buildEtiquetaXml(vars){
  const s = v => (v ?? '').toString().trim();
  return `<Etiqueta>\n<NombreEtiqueta>${s(vars.NombreEtiqueta)}</NombreEtiqueta>\n<tipo>${s(vars.tipo)}</tipo>\n<Contexto>${s(vars.Contexto)}</Contexto>\n<Objetivo>${s(vars.Objetivo)}</Objetivo>\n<Contenido>\n${s(vars.Contenido)}\n</Contenido>\n<DocumentosNoIncluidos>\n${s(vars.DocumentosNoIncluidos)}\n</DocumentosNoIncluidos>\n</Etiqueta>`;
}

function renderAgentsGrid(etiquetas){
  const grid = document.getElementById('agentsGrid');
  if(!grid) return;
  
  // If in stable loading mode, don't render - let the coordinated function handle it
  if (grid.dataset.stableLoading === 'true') {
    console.log('🔒 Skipping renderAgentsGrid - stable loading in progress');
    return;
  }
  
  // Check if CarpetasAgentes is available 
  const isCarpetasReady = window.CarpetasAgentes && 
    typeof window.CarpetasAgentes.getEstructura === 'function' &&
    typeof window.CarpetasAgentes.getCurrentFolderId === 'function';
  
  // If called during coordinated loading, CarpetasAgentes should be ready
  // Only show loader if it's truly not ready (fallback case)
  if (!isCarpetasReady) {
    console.log('🔄 FALLBACK LOADER SHOWN - CarpetasAgentes not ready');
    grid.innerHTML = `
      <div id="fallback-loader" style="display:flex;align-items:center;justify-content:center;padding:40px;min-height:200px;">
        <div class="loader-minimal"></div>
      </div>
      <style>
        .loader-minimal {
          width: 24px;
          height: 24px;
          border: 2px solid #f1f1f1;
          border-top: 2px solid #6c757d;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
    // Shorter retry time since we expect this to be ready quickly
    setTimeout(() => renderAgentsGrid(etiquetas), 50);
    return;
  }
  
  const entries = Object.entries(etiquetas || {});
  if(entries.length===0){
    grid.innerHTML = '<div style="color:#7a8a93; font-size:14px;">No tienes agentes aún. Crea tu primer agente.</div>';
    return;
  }
  
  function attachBlackTooltip(el, text){
    let tip;
    el.addEventListener('mouseenter', ()=>{
      if (tip) return;
      tip = document.createElement('div');
      tip.textContent = text;
      Object.assign(tip.style, { position:'fixed', background:'#0b2431', color:'#fff', padding:'6px 10px', borderRadius:'6px', fontSize:'12px', zIndex:'5000', boxShadow:'0 4px 12px rgba(0,0,0,.25)' });
      document.body.appendChild(tip);
      const r = el.getBoundingClientRect();
      tip.style.top = (r.top + 18) + 'px';
      tip.style.left = Math.min(window.innerWidth - 220, Math.max(8, r.left + 12)) + 'px';
    });
    el.addEventListener('mouseleave', ()=>{ if (tip){ tip.remove(); tip=null; } });
  }
  
  // Get folder context and assignment filtering (now we know it's available)
  const estructura = window.CarpetasAgentes.getEstructura();
  const currentFolderId = window.CarpetasAgentes.getCurrentFolderId();
  
  const favToggle = document.getElementById('vista-favoritos-toggle');
  const onlyFavs = !!favToggle?.checked;
  const favSet = window.CarpetasAgentes.getFavoritos();
  
  // Build HTML first, then attach events to reduce reflow
  let html = '';
  const data = [];
  let filteredCount = 0;
  
  entries.reverse().forEach(([key, xml])=>{
    // Get agent assignment
    const agentAssignment = estructura.asignaciones[key] || null;
    
    // Filter based on current context
    let shouldShow = false;
    
    if (currentFolderId === null) {
      // We're in "General" view - only show agents with no assignment
      shouldShow = (agentAssignment === null);
    } else {
      // We're in a specific folder view - only show agents assigned to this folder
      shouldShow = (String(agentAssignment) === String(currentFolderId));
    }
    
    // Additional favorites filtering
    if (onlyFavs && !favSet.has(key)) {
      shouldShow = false;
    }
    
    if (!shouldShow) return;
    
    filteredCount++;
    const parsed = parseEtiquetaDefinition(xml);
    const name = parsed.NombreEtiqueta || key;
    const obj = parsed.Objetivo || '';
    data.push({key, xml});
    html += `
      <div class="agent-box" data-key="${encodeURIComponent(key)}" draggable="true" title="Arrastra a una carpeta para asignarlo" style="position:relative;">
        <div class="agent-header">
          <h3>${name}</h3>
        </div>
        <p class="agent-objective">${renderWithBoldMarkers(obj)}</p>
        <i class="far fa-star agent-fav" data-fav="${encodeURIComponent(key)}" title="" style="position:absolute;top:8px;right:36px;color:#adb5bd;cursor:pointer"></i>
        <i class="fas fa-ellipsis-h agent-menu-btn" title="Más opciones" style="position:absolute;top:8px;right:10px;color:#455862;cursor:pointer"></i>
        <div class="agent-menu" style="position:absolute;top:32px;right:10px;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 8px 24px rgba(11,36,49,.12);display:none;min-width:190px;z-index:20">
          <div class="agent-menu-item" data-action="move" style="padding:10px 12px;cursor:pointer;font-size:13px;color:#0b2431;display:flex;align-items:center;justify-content:space-between;">
            <span>Mover a…</span>
            <i class="fas fa-caret-right"></i>
            <div class="agent-submenu" style="display:none;position:absolute;top:0;left:100%;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 8px 24px rgba(11,36,49,.12);min-width:180px;z-index:30;padding:6px 0;"></div>
          </div>
          <div class="agent-menu-item" data-action="delete" style="padding:10px 12px;cursor:pointer;font-size:13px;color:#b00020">Eliminar</div>
        </div>
      </div>`;
  });
  
  // Show appropriate message if no agents to display
  if (filteredCount === 0) {
    if (onlyFavs) {
      // Check if there are ANY favorite agents at all (not just in current location)
      const allFavorites = Array.from(favSet).filter(k => !k.startsWith('folder:'));
      if (allFavorites.length === 0) {
        html = '<div style="color:#7a8a93; font-size:14px;">No hay agentes suscritos. Suscríbete a agentes para tener una visión personalizada haciendo clic en la estrella ⭐</div>';
      } else {
        // If there are favorites but none in current location, show nothing to keep UI clean
        html = '';
      }
    } else if (currentFolderId === null) {
      // Check if there are any folders at all
      const hasFolders = estructura && Object.keys(estructura.folders || {}).length > 0;
      
      if (!hasFolders) {
        html = '<div style="color:#7a8a93; font-size:14px;">Crea carpetas para asignar y estructurar tus agentes por departamentos, sectores, clientes...</div>';
      } else {
        html = ''; // Don't show any message in General when there are folders
      }
    } else {
      html = '<div style="color:#7a8a93; font-size:14px;">No hay agentes en esta carpeta. Usa "Mover a..." para asignar agentes aquí.</div>';
    }
  }
  
  grid.innerHTML = html;
  grid.querySelectorAll('.agent-box').forEach(box=>{
    const key = decodeURIComponent(box.getAttribute('data-key'));
    const xml = etiquetas[key];
    box.addEventListener('click', (e)=>{
      // prevent click when clicking favorite star or menu
      if ((e.target && e.target.classList && (e.target.classList.contains('agent-fav') || e.target.closest('.agent-fav') || e.target.classList.contains('agent-menu-btn') || e.target.closest('.agent-menu')))) return;
      window.openAgentDetail && window.openAgentDetail(key, xml);
    });
    // Drag support → assign into folders UI
    box.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('text/plain', JSON.stringify({ type:'agente', agente: key }));
    });
    // Menu wiring
    const menuBtn = box.querySelector('.agent-menu-btn');
    const menu = box.querySelector('.agent-menu');
    if (menuBtn && menu){
      menuBtn.addEventListener('click', (e)=>{ e.stopPropagation(); menu.style.display = menu.style.display==='block' ? 'none' : 'block'; });
      document.addEventListener('click', ()=>{ menu.style.display='none'; }, { once:true });
      // Build hover submenu for Move to…
      const moveItem = menu.querySelector('.agent-menu-item[data-action="move"]');
      const submenu = moveItem?.querySelector('.agent-submenu');
      if (moveItem && submenu){
        moveItem.addEventListener('mouseenter', ()=>{
          // Populate submenu on hover
          submenu.innerHTML = '';
          
          // Get current folder assignment for this agent
          const currentAssignment = estructura.asignaciones[key] || null;
          
          // Add "General" option if not currently in General
          if (currentAssignment !== null) {
            const optGeneral = document.createElement('div'); 
            optGeneral.textContent = 'General'; 
            optGeneral.dataset.dest = '__root__'; 
            optGeneral.style.cssText='padding:8px 12px;cursor:pointer;font-size:13px;color:#0b2431;'; 
            submenu.appendChild(optGeneral);
          }
          
          // Add folder options (excluding current folder)
          try{
            const folders = Object.values(estructura.folders);
            folders.forEach(f=>{ 
              if (String(f.id) !== String(currentAssignment)) {
                const d=document.createElement('div'); 
                d.textContent=f.nombre; 
                d.dataset.dest=String(f.id); 
                d.style.cssText='padding:8px 12px;cursor:pointer;font-size:13px;color:#0b2431;'; 
                submenu.appendChild(d); 
              }
            });
          }catch(_){ /* ignore */ }
          submenu.style.display='block';
        });
        moveItem.addEventListener('mouseleave', ()=>{ submenu.style.display='none'; });
        submenu.addEventListener('click', async (ev)=>{
          ev.stopPropagation();
          const dest = ev.target && ev.target.dataset ? (ev.target.dataset.dest === '__root__' ? null : ev.target.dataset.dest) : null;
          
          menu.style.display='none';
          
          // Use the optimistic moveAgentTo function - agents disappear immediately on click
          await window.CarpetasAgentes.moveAgentTo(key, dest);
        });
      }
      // Delete wiring - use the new delete function with modal confirmation
      const deleteItem = menu.querySelector('.agent-menu-item[data-action="delete"]');
      if (deleteItem){
        deleteItem.addEventListener('click', async ()=>{
          menu.style.display='none';
          await window.CarpetasAgentes.deleteAgent(key);
        });
      }
    }
  });
  // Favorite stars behavior with tooltip and persistence
  grid.querySelectorAll('.agent-fav').forEach(star=>{
    const agent = decodeURIComponent(star.getAttribute('data-fav'));
    const isFavorite = favSet.has(agent);
    
    // Set initial state correctly
    if (isFavorite) {
      star.classList.remove('far'); 
      star.classList.add('fas'); 
      star.style.color = '#04db8d';
    } else {
      star.classList.remove('fas'); 
      star.classList.add('far'); 
      star.style.color = '#adb5bd';
    }
    
    // Ensure tooltip cleanup on mouseleave
    star.addEventListener('mouseleave', () => {
      const blackTips = document.querySelectorAll('body > div');
      blackTips.forEach(el => {
        if (el && el.textContent === 'Selecciona para suscribirte a este agente') el.remove();
      });
    });
    
    attachBlackTooltip(star, 'Selecciona para suscribirte a este agente');
    star.addEventListener('click', async ()=>{
      try{
        // toggle UI instantly
        const isActive = star.classList.contains('fas');
        if (isActive){
          star.classList.remove('fas'); star.classList.add('far'); star.style.color = '#adb5bd';
        } else {
          star.classList.remove('far'); star.classList.add('fas'); star.style.color = '#04db8d';
        }
        
        // Update through CarpetasAgentes which handles persistence correctly
        if (window.CarpetasAgentes && typeof window.CarpetasAgentes.getFavoritos === 'function') {
          const favoritosSet = window.CarpetasAgentes.getFavoritos();
          if (isActive) {
            favoritosSet.delete(agent);
          } else {
            favoritosSet.add(agent);
          }
          
          // Optimistically update underlying favorites for immediate UI filtering
          if (window.CarpetasAgentes && typeof window.CarpetasAgentes.setAgentFavoriteOptimistic === 'function') {
            window.CarpetasAgentes.setAgentFavoriteOptimistic(agent, !isActive);
          }
          // Update favorites counter reactively if available, using dynamic recompute
          if (typeof window.updateFavoritesCounter === 'function') {
            const set = (window.CarpetasAgentes && typeof window.CarpetasAgentes.getFavoritos === 'function')
              ? window.CarpetasAgentes.getFavoritos()
              : favoritosSet;
            const dynamicCount = Array.from(set).filter(k => typeof k === 'string' && !k.startsWith('folder:')).length;
            window.updateFavoritesCounter(dynamicCount);
          }
          
          // Persist through the carpetas system with saving guard
          try {
            window.__favoritos_saving__ = true;
            await persistFavoritosCoordinated(favoritosSet);
          } finally {
            window.__favoritos_saving__ = false;
          }
          // Immediately refresh tracker sections to avoid lag
          try { if (typeof window.refreshFavoritesDependentUI === 'function') window.refreshFavoritesDependentUI(); } catch(_){}
          // If 'favoritos' view is active, re-render immediately to reflect change
          const favToggle = document.getElementById('vista-favoritos-toggle');
          if (favToggle && favToggle.checked && typeof window.renderAgentsGridCoordinated === 'function') {
            setTimeout(() => window.renderAgentsGridCoordinated(etiquetas), 10);
          }
        }

      }catch(err){ 
        console.error('Error toggling favorito:', err);
        // Revert UI on error
        if (star.classList.contains('fas')){
          star.classList.remove('fas'); star.classList.add('far'); star.style.color = '#adb5bd';
        } else {
          star.classList.remove('far'); star.classList.add('fas'); star.style.color = '#04db8d';
        }
      }
    });
  });
}

async function loadExistingAgents(){
  try{
    const grid = document.getElementById('agentsGrid');
    
    // Don't interfere if stable loading is in progress
    if (grid && grid.dataset.stableLoading === 'true') {
      console.log('🔒 Skipping loadExistingAgents - stable loading in progress');
      return;
    }
    
      // Only show loader if no stable loader exists and coordinated render not done
  if (grid && !grid.querySelector('#stable-agents-loader') && grid.dataset.coordinatedRendered !== 'true') {
    console.log('🔄 SHOWING STABLE LOADER for existing agents');
    showStableLoader();
  }
    
    // Wait for CarpetasAgentes to be initialized if it's not ready yet
    if (!window.CarpetasAgentes || typeof window.CarpetasAgentes.getEstructura !== 'function') {
      // Wait up to 3 seconds for CarpetasAgentes to initialize
      let attempts = 0;
      while (attempts < 30 && (!window.CarpetasAgentes || typeof window.CarpetasAgentes.getEstructura !== 'function')) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
    }
    
    // Use resolver if available, otherwise fallback to legacy method
    if (typeof window.EtiquetasResolver !== 'undefined') {
      const result = await window.EtiquetasResolver.getEtiquetasPersonalizadas();
      
      // Setup readonly buttons for empresa users without edit permissions
      if (result.is_empresa && !result.can_edit) {
        if (typeof window.EtiquetasResolver.setupReadonlyButtons === 'function') {
          setTimeout(() => window.EtiquetasResolver.setupReadonlyButtons(), 200);
        }
        
        // Setup readonly buttons for users without edit permissions
        if (typeof window.EtiquetasResolver.setupReadonlyButtons === 'function') {
          setTimeout(() => window.EtiquetasResolver.setupReadonlyButtons(), 300);
        }
      }
      
      // Get context data for usage trackers (includes limits from estructura_empresa for empresa users)
      try {
        const contextData = await window.EtiquetasResolver.getContextData();
        
        // Create userData object with correct limits and usage data
        const userData = {
          subscription_plan: contextData.subscription_plan || 'plan1',
          limit_agentes: contextData.limit_agentes,
          limit_fuentes: contextData.limit_fuentes,
          etiquetas_personalizadas: result.etiquetas_personalizadas || {},
          cobertura_legal: contextData.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] }
        };
        
        updateUsageTrackers(userData);
      } catch (e) {
        console.warn('Could not load context data for usage trackers:', e);
        // Fallback to legacy method
        try {
          const response = await fetch('/api/get-user-data');
          const userData = await response.json();
          updateUsageTrackers(userData);
        } catch (fallbackError) {
          console.warn('Could not load user data for usage trackers:', fallbackError);
        }
      }
      
      {
        const limpio = result.etiquetas_personalizadas_limpio || null;
        const uiEtiquetas = (limpio && Object.keys(limpio).length > 0)
          ? limpio
          : (result.etiquetas_personalizadas || {});
        renderAgentsGrid(uiEtiquetas);
      }
    } else {
      // Fallback to legacy method
      const response = await fetch('/api/get-user-data');
      const userData = await response.json();
      updateUsageTrackers(userData);
      renderAgentsGrid(userData.etiquetas_personalizadas || {});
    }
  }catch(error){
    console.error('Error loading existing agents:', error);
    // Show error state in grid
    const grid = document.getElementById('agentsGrid');
    if (grid) {
      grid.innerHTML = '<div style="color:#d32f2f; font-size:14px; text-align:center; padding:20px;">Error cargando agentes. Intenta recargar la página.</div>';
    }
  }
}

// Function to display existing agents
function displayExistingAgents(etiquetas) {
  const agentesContainer = document.querySelector('#agentes-content');
  const crearAgenteBtn = document.getElementById('crearAgenteBtn');
  
  // Get current agent names to avoid duplicates
  const existingBoxes = agentesContainer.querySelectorAll('.generated-agent-box');
  const currentAgentNames = new Set();
  existingBoxes.forEach(box => {
    const nameElement = box.querySelector('.agent-name');
    if (nameElement) {
      currentAgentNames.add(nameElement.textContent);
    }
  });
  
  // Only create boxes for agents that don't already exist in the UI
  const etiquetasArray = Object.entries(etiquetas).reverse();
  etiquetasArray.forEach(([etiquetaName, etiquetaDefinition]) => {
    if (!currentAgentNames.has(etiquetaName)) {
      createAgentBox(etiquetaName, etiquetaDefinition, crearAgenteBtn);
    }
  });
  
  // Remove any agent boxes that no longer exist in the data
  existingBoxes.forEach(box => {
    const nameElement = box.querySelector('.agent-name');
    if (nameElement && !etiquetas[nameElement.textContent]) {
      box.remove();
    }
  });
}

// Function to create an agent box
function createAgentBox(name, definition, insertAfter) {
  const agentBox = document.createElement('div');
  agentBox.className = 'generated-agent-box';
  
  // Create content elements safely without innerHTML
  const agentContent = document.createElement('div');
  agentContent.className = 'generated-agent-content';
  
  const agentName = document.createElement('h4');
  agentName.className = 'agent-name';
  agentName.textContent = name;
  
  const agentDefinition = document.createElement('p');
  agentDefinition.className = 'agent-definition';
  agentDefinition.textContent = definition;
  
  agentContent.appendChild(agentName);
  agentContent.appendChild(agentDefinition);
  
  // Create edit controls
  const editControls = document.createElement('div');
  editControls.className = 'agent-edit-controls';
  
  const editBtn = document.createElement('button');
  editBtn.className = 'edit-agent-btn';
  editBtn.innerHTML = '<i class="fas fa-edit"></i> Editar';
  editBtn.addEventListener('click', () => editAgent(editBtn, name));
  
  editControls.appendChild(editBtn);
  
  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-agent-box';
  closeBtn.innerHTML = '<i class="fas fa-trash"></i>';
  closeBtn.addEventListener('click', () => deleteAgent(closeBtn, name));
  
  // Assemble the agent box
  agentBox.appendChild(agentContent);
  agentBox.appendChild(editControls);
  agentBox.appendChild(closeBtn);
  
  // Insert after the "Crear agente" button
  insertAfter.parentNode.insertBefore(agentBox, insertAfter.nextSibling);
}

// Function to edit an agent
function editAgent(button, originalName) {
  const agentBox = button.closest('.generated-agent-box');
  const agentName = agentBox.querySelector('.agent-name');
  const agentDefinition = agentBox.querySelector('.agent-definition');
  const editControls = agentBox.querySelector('.agent-edit-controls');
  
  // Add editing class to expand the box
  agentBox.classList.add('editing');
  
  // Store original values
  const originalDefinition = agentDefinition.textContent;
  
  // Replace content with editable inputs
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'agent-name-edit';
  nameInput.value = originalName;
  agentName.innerHTML = '';
  agentName.appendChild(nameInput);
  
  const definitionTextarea = document.createElement('textarea');
  definitionTextarea.className = 'agent-definition-edit';
  definitionTextarea.value = originalDefinition;
  definitionTextarea.maxLength = 2000;
  agentDefinition.innerHTML = '';
  agentDefinition.appendChild(definitionTextarea);

  // Add character counter
  const counterContainer = document.createElement('div');
  counterContainer.className = 'character-counter-container';
  
  const errorMessage = document.createElement('span');
  errorMessage.className = 'character-error-message';
  errorMessage.style.display = 'none';
  
  const counter = document.createElement('span');
  counter.className = 'character-counter';
  
  function updateCounter() {
    const length = definitionTextarea.value.length;
    counter.textContent = `${length} /1000`;
    
    if (length > 1000) {
      counter.classList.add('over-limit');
      errorMessage.textContent = 'Número máximo de carácteres superado';
      errorMessage.style.display = 'inline';
    } else {
      counter.classList.remove('over-limit');
      errorMessage.style.display = 'none';
    }
  }
  
  definitionTextarea.addEventListener('input', updateCounter);
  
  counterContainer.appendChild(errorMessage);
  counterContainer.appendChild(counter);
  agentDefinition.appendChild(counterContainer);
  
  // Initial counter update
  updateCounter();
  
  // Replace edit button with save and cancel buttons
  editControls.innerHTML = '';
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-agent-btn';
  saveBtn.innerHTML = '<i class="fas fa-save"></i> Guardar';
  saveBtn.addEventListener('click', () => saveAgent(saveBtn, originalName));
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'cancel-agent-btn';
  cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancelar';
  cancelBtn.addEventListener('click', () => cancelEdit(cancelBtn, originalName, originalDefinition));
  
  editControls.appendChild(saveBtn);
  editControls.appendChild(cancelBtn);
}

// Function to save agent changes
async function saveAgent(button, originalName) {
  const agentBox = button.closest('.generated-agent-box');
  const nameInput = agentBox.querySelector('.agent-name-edit');
  const definitionInput = agentBox.querySelector('.agent-definition-edit');
  
  const newName = nameInput.value.trim();
  const newDefinition = definitionInput.value.trim();
  
  if (!newName || !newDefinition) {
    showErrorModal({
      title: 'Campos Requeridos',
      message: 'Por favor, completa todos los campos antes de guardar.',
      confirmText: 'Entendido'
    });
    return;
  }
  
  if (newDefinition.length > 1000) {
    // Show error message if not already visible
    const errorMessage = agentBox.querySelector('.character-error-message');
    const counter = agentBox.querySelector('.character-counter');
    if (errorMessage && counter) {
      errorMessage.textContent = 'Número máximo de carácteres superado';
      errorMessage.style.display = 'inline';
      counter.classList.add('over-limit');
    }
    return;
  }
  
  // Show loading state
  const originalButtonContent = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
  
  try {
    // Get current etiquetas from the resolver (enterprise-aware)
    let etiquetas = {};
    if (typeof window.EtiquetasResolver !== 'undefined' && typeof window.EtiquetasResolver.getEtiquetasPersonalizadas === 'function') {
      const current = await window.EtiquetasResolver.getEtiquetasPersonalizadas();
      etiquetas = current.etiquetas_personalizadas || {};
    } else {
      const response = await fetch('/api/get-user-data');
      const userData = await response.json();
      etiquetas = userData.etiquetas_personalizadas || {};
    }
    
    // Remove old key if name changed
    if (originalName !== newName) {
      delete etiquetas[originalName];
    }
    
    // Add/update with new values
    etiquetas[newName] = newDefinition;
    
    // Save to database using resolver
    const updateResult = await saveEtiquetasWithResolver(etiquetas);
    
    if (updateResult.success) {
      // Update UI first
      agentBox.querySelector('.agent-name').textContent = newName;
      agentBox.querySelector('.agent-definition').textContent = newDefinition;
      
      // Restore edit controls
      const editControls = agentBox.querySelector('.agent-edit-controls');
      editControls.innerHTML = '';
      
      const editBtn = document.createElement('button');
      editBtn.className = 'edit-agent-btn';
      editBtn.innerHTML = '<i class="fas fa-edit"></i> Editar';
      editBtn.addEventListener('click', () => editAgent(editBtn, newName));
      
      editControls.appendChild(editBtn);
      
      // Remove editing class with slight delay for smoother transition
      setTimeout(() => {
        agentBox.classList.remove('editing');
      }, 100);
      
      // Refresh usage tracker
      loadExistingAgents();
    } else {
      // Restore button state on error
      button.disabled = false;
      button.innerHTML = originalButtonContent;
      showErrorModal({
        title: 'Error al Guardar',
        message: 'No se pudieron guardar los cambios. Por favor, inténtalo de nuevo.',
        confirmText: 'Entendido'
      });
    }
  } catch (error) {
    console.error('Error saving agent:', error);
    // Restore button state on error
    button.disabled = false;
    button.innerHTML = originalButtonContent;
    showErrorModal({
      title: 'Error al Guardar',
      message: 'No se pudieron guardar los cambios. Por favor, inténtalo de nuevo.',
      confirmText: 'Entendido'
    });
  }
}

// Function to cancel editing
function cancelEdit(button, originalName, originalDefinition) {
  const agentBox = button.closest('.generated-agent-box');
  
  // Restore original content first
  agentBox.querySelector('.agent-name').textContent = originalName;
  agentBox.querySelector('.agent-definition').textContent = originalDefinition;
  
  // Restore edit controls
  const editControls = agentBox.querySelector('.agent-edit-controls');
  editControls.innerHTML = '';
  
  const editBtn = document.createElement('button');
  editBtn.className = 'edit-agent-btn';
  editBtn.innerHTML = '<i class="fas fa-edit"></i> Editar';
  editBtn.addEventListener('click', () => editAgent(editBtn, originalName));
  
  editControls.appendChild(editBtn);
  
  // Remove editing class with slight delay for smoother transition
  setTimeout(() => {
    agentBox.classList.remove('editing');
  }, 100);
}

// Function to delete an agent
async function deleteAgent(button, agentName) {
  if (!confirm(`¿Estás seguro de que quieres eliminar el agente "${agentName}"?`)) {
    return;
  }
  
  try {
    // Get current etiquetas using enterprise-aware resolver
    let etiquetas = {};
    if (typeof window.EtiquetasResolver !== 'undefined' && typeof window.EtiquetasResolver.getEtiquetasPersonalizadas === 'function') {
      const current = await window.EtiquetasResolver.getEtiquetasPersonalizadas();
      etiquetas = current.etiquetas_personalizadas || {};
    } else {
      const response = await fetch('/api/get-user-data');
      const userData = await response.json();
      etiquetas = userData.etiquetas_personalizadas || {};
    }
    
    // Remove from etiquetas_personalizadas
    delete etiquetas[agentName];
    
    // Save to database using resolver
    const updateResult = await saveEtiquetasWithResolver(etiquetas);
    
    if (updateResult.success) {
      // Remove from UI
      button.closest('.generated-agent-box').remove();
      
      // Refresh usage tracker
      loadExistingAgents();
    } else {
      showErrorModal({
        title: 'Error al Eliminar',
        message: 'No se pudo eliminar el agente. Por favor, inténtalo de nuevo.',
        confirmText: 'Entendido'
      });
    }
  } catch (error) {
    console.error('Error deleting agent:', error);
    showErrorModal({
      title: 'Error al Eliminar',
      message: 'Error al eliminar el agente. Por favor, inténtalo de nuevo.',
      confirmText: 'Entendido'
    });
  }
}

// Function to show generated agent (first definition)
function showGeneratedAgent(agentData) {
  const crearAgenteBtn = document.getElementById('crearAgenteBtn');
  
  if (agentData.etiqueta_personalizada && crearAgenteBtn) {
    // Show the agent immediately by creating it directly in the UI
    const agentName = Object.keys(agentData.etiqueta_personalizada)[0];
    const agentDefinition = agentData.etiqueta_personalizada[agentName];
    
    // Create the agent box immediately
    createAgentBox(agentName, agentDefinition, crearAgenteBtn);
    
    // Update usage trackers in background
    setTimeout(() => {
      loadExistingAgents();
    }, 100);
    
    // Scroll to top smoothly
    setTimeout(() => {
      const configMenu = document.querySelector('.config-menu');
      if (configMenu) {
        configMenu.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 200);
  }
}

// Initialize agent template functionality
function initializeAgentTemplates() {
  const crearAgenteBtn = document.getElementById('crearAgenteBtn');
  const agentTemplateBox = document.getElementById('agentTemplateBox');
  const closeTemplateBox = document.getElementById('closeTemplateBox');
  const productDetailsForm = document.getElementById('productDetailsForm');
  const closeProductForm = document.getElementById('closeProductForm');
  const clientDetailsForm = document.getElementById('clientDetailsForm');
  const closeClientForm = document.getElementById('closeClientForm');
  const sectorDetailsForm = document.getElementById('sectorDetailsForm');
  const closeSectorForm = document.getElementById('closeSectorForm');
  const customDetailsForm = document.getElementById('customDetailsForm');
  const closeCustomForm = document.getElementById('closeCustomForm');
  const generateAgentBtn = document.getElementById('generateAgentBtn');
  const generateClientAgentBtn = document.getElementById('generateClientAgentBtn');
  const generateSectorAgentBtn = document.getElementById('generateSectorAgentBtn');
  const generateCustomAgentBtn = document.getElementById('generateCustomAgentBtn');
  
  // Load existing agents on initialization
  loadExistingAgents();
  
  if (crearAgenteBtn && agentTemplateBox) {
    // Function to show template box
    function showTemplateBox() {
      agentTemplateBox.style.display = 'block';
      crearAgenteBtn.style.display = 'none';
      if (productDetailsForm) productDetailsForm.style.display = 'none';
      if (clientDetailsForm) clientDetailsForm.style.display = 'none';
      if (sectorDetailsForm) sectorDetailsForm.style.display = 'none';
      if (customDetailsForm) customDetailsForm.style.display = 'none';
      
      // Hide agents grid while creating from template
      const agentsGrid = document.getElementById('agentsGrid');
      if (agentsGrid) agentsGrid.style.display = 'none';
      
      // Scroll to the box smoothly
      setTimeout(() => {
        agentTemplateBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }

    // Function to hide template box
    function hideTemplateBox() {
      agentTemplateBox.style.display = 'none';
      crearAgenteBtn.style.display = 'flex';
      if (productDetailsForm) productDetailsForm.style.display = 'none';
      if (clientDetailsForm) clientDetailsForm.style.display = 'none';
      if (sectorDetailsForm) sectorDetailsForm.style.display = 'none';
      if (customDetailsForm) customDetailsForm.style.display = 'none';
      
      // Show agents grid again
      const agentsGrid = document.getElementById('agentsGrid');
      if (agentsGrid) agentsGrid.style.display = 'grid';
    }

    // Function to show product details form
    function showProductForm() {
      agentTemplateBox.style.display = 'none';
      if (productDetailsForm) {
        // Reset form fields
        const productDescription = document.getElementById('productDescription');
        const productPhase = document.getElementById('productPhase');
        const productCharacteristics = document.getElementById('productCharacteristics');
        const customPhase = document.getElementById('customPhase');
        const customPhaseContainer = document.getElementById('customPhaseContainer');
        const generateBtn = document.getElementById('generateAgentBtn');
        
        if (productDescription) productDescription.value = '';
        if (productPhase) productPhase.value = '';
        if (productCharacteristics) productCharacteristics.value = '';
        if (customPhase) customPhase.value = '';
        if (customPhaseContainer) customPhaseContainer.style.display = 'none';
        if (generateBtn) {
          generateBtn.disabled = false;
          generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
        
        productDetailsForm.style.display = 'block';
        // Scroll to the form smoothly
        setTimeout(() => {
          productDetailsForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    }

    // Function to show client form
    function showClientForm() {
      agentTemplateBox.style.display = 'none';
      if (clientDetailsForm) {
        // Reset form fields
        const clientDescription = document.getElementById('clientDescription');
        const clientWebsite = document.getElementById('clientWebsite');
        const clientScope = document.getElementById('clientScope');
        const generateBtn = document.getElementById('generateClientAgentBtn');
        
        if (clientDescription) clientDescription.value = '';
        if (clientWebsite) clientWebsite.value = '';
        if (clientScope) clientScope.value = '';
        if (generateBtn) {
          generateBtn.disabled = false;
          generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
        
        clientDetailsForm.style.display = 'block';
        // Scroll to the form smoothly
        setTimeout(() => {
          clientDetailsForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    }

    // Function to show sector form
    function showSectorForm() {
      agentTemplateBox.style.display = 'none';
      if (sectorDetailsForm) {
        // Reset form fields
        const sectorDescription = document.getElementById('sectorDescription');
        const sectorGeographicScope = document.getElementById('sectorGeographicScope');
        const sectorSubtopics = document.getElementById('sectorSubtopics');
        const generateBtn = document.getElementById('generateSectorAgentBtn');
        
        if (sectorDescription) sectorDescription.value = '';
        if (sectorGeographicScope) sectorGeographicScope.value = '';
        if (sectorSubtopics) sectorSubtopics.value = '';
        if (generateBtn) {
          generateBtn.disabled = false;
          generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
        
        sectorDetailsForm.style.display = 'block';
        // Scroll to the form smoothly
        setTimeout(() => {
          sectorDetailsForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    }

    // Function to show custom form
    function showCustomForm() {
      agentTemplateBox.style.display = 'none';
      if (customDetailsForm) {
        // Reset form fields
        const customDescription = document.getElementById('customDescription');
        const generateBtn = document.getElementById('generateCustomAgentBtn');
        
        if (customDescription) customDescription.value = '';
        if (generateBtn) {
          generateBtn.disabled = false;
          generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
        
        customDetailsForm.style.display = 'block';
        // Scroll to the form smoothly
        setTimeout(() => {
          customDetailsForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    }

    // Function to hide product details form
    function hideProductForm() {
      if (productDetailsForm) productDetailsForm.style.display = 'none';
      crearAgenteBtn.style.display = 'flex';
      
      // Show agents grid again
      const agentsGrid = document.getElementById('agentsGrid');
      if (agentsGrid) agentsGrid.style.display = 'grid';
    }

    // Function to hide client details form
    function hideClientForm() {
      if (clientDetailsForm) clientDetailsForm.style.display = 'none';
      crearAgenteBtn.style.display = 'flex';
      
      // Show agents grid again
      const agentsGrid = document.getElementById('agentsGrid');
      if (agentsGrid) agentsGrid.style.display = 'grid';
    }

    // Function to hide sector details form
    function hideSectorForm() {
      if (sectorDetailsForm) sectorDetailsForm.style.display = 'none';
      crearAgenteBtn.style.display = 'flex';
      
      // Show agents grid again
      const agentsGrid = document.getElementById('agentsGrid');
      if (agentsGrid) agentsGrid.style.display = 'grid';
    }

    // Function to hide custom details form
    function hideCustomForm() {
      if (customDetailsForm) customDetailsForm.style.display = 'none';
      crearAgenteBtn.style.display = 'flex';
      
      // Show agents grid again
      const agentsGrid = document.getElementById('agentsGrid');
      if (agentsGrid) agentsGrid.style.display = 'grid';
    }

    // Note: Agent boxes are now managed dynamically with individual delete buttons

    // Show template box when "Crear agente" is clicked
    crearAgenteBtn.addEventListener('click', async () => {
      // Check if user can create more agents
      try {
        const response = await fetch('/api/get-user-data');
        const userData = await response.json();
        
        const defaultLimits = getDefaultLimits(userData.subscription_plan || 'plan1');
        const limitAgentes = userData.limit_agentes !== undefined ? userData.limit_agentes : defaultLimits.limit_agentes;
        const currentAgentes = Object.keys(userData.etiquetas_personalizadas || {}).length;
        
        if (limitAgentes !== null && currentAgentes >= limitAgentes) {
          showInfoModal({
            title: 'Límite de Agentes Alcanzado',
            message: `Has alcanzado el límite de ${limitAgentes} agentes para tu plan actual. Para crear más agentes, actualiza tu suscripción.`,
            confirmText: 'Entendido'
          });
          return;
        }
        
        openNewAgentModal();
      } catch (error) {
        console.error('Error checking agent limits:', error);
        openNewAgentModal(); // Show anyway if there's an error
      }
    });

    // Hide template box when close button is clicked
    if (closeTemplateBox) {
      closeTemplateBox.addEventListener('click', hideTemplateBox);
    }

    // Hide product form when close button is clicked
    if (closeProductForm) {
      closeProductForm.addEventListener('click', hideProductForm);
    }

    // Hide client form when close button is clicked
    if (closeClientForm) {
      closeClientForm.addEventListener('click', hideClientForm);
    }

    // Hide sector form when close button is clicked
    if (closeSectorForm) {
      closeSectorForm.addEventListener('click', hideSectorForm);
    }

    // Hide custom form when close button is clicked
    if (closeCustomForm) {
      closeCustomForm.addEventListener('click', hideCustomForm);
    }

    // Note: Agent boxes are now managed dynamically with individual delete buttons

    // Add click handlers for template buttons
    const templateBtns = agentTemplateBox.querySelectorAll('.template-btn');
    templateBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const agentType = btn.dataset.type;
        console.log('Selected agent type:', agentType);
        
        if (agentType === 'producto') {
          showProductForm();
        } else if (agentType === 'cliente') {
          showClientForm();
        } else if (agentType === 'sector') {
          showSectorForm();
        } else if (agentType === 'personalizado') {
          showCustomForm();
        } else {
          // For other agent types, just hide template box for now
          hideTemplateBox();
        }
      });
    });

    // Handle custom phase input toggle
    const productPhaseSelect = document.getElementById('productPhase');
    const customPhaseContainer = document.getElementById('customPhaseContainer');
    
    if (productPhaseSelect && customPhaseContainer) {
      productPhaseSelect.addEventListener('change', (e) => {
        if (e.target.value === 'otro') {
          customPhaseContainer.style.display = 'block';
        } else {
          customPhaseContainer.style.display = 'none';
          // Clear custom input when hiding
          const customPhaseInput = document.getElementById('customPhase');
          if (customPhaseInput) customPhaseInput.value = '';
        }
      });
    }

    // Handle generate agent button click
    if (generateAgentBtn) {
      generateAgentBtn.addEventListener('click', async () => {
        // Get form values
        const productDescription = document.getElementById('productDescription')?.value || '';
        let productPhase = document.getElementById('productPhase')?.value || '';
        const productCharacteristics = document.getElementById('productCharacteristics')?.value || '';
        
        // If "Otro" is selected, use the custom input value
        if (productPhase === 'otro') {
          const customPhase = document.getElementById('customPhase')?.value || '';
          productPhase = customPhase;
        }

        // Validate required fields
        if (!productDescription.trim()) {
          showErrorModal({
            title: 'Campo Requerido',
            message: 'Por favor, proporciona una descripción del producto para continuar.',
            confirmText: 'Entendido'
          });
          return;
        }

        // Show loading state
        generateAgentBtn.disabled = true;
        generateAgentBtn.innerHTML = '<div class="button-spinner"></div> Generando...';
        
        try {
          // Make API call to generate agent (server handles prompt creation)
          const response = await fetch('/api/generate-agent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              productData: {
                description: productDescription,
                phase: productPhase,
                characteristics: productCharacteristics
              }
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          
          if (result.success && result.agent) {
            // Show generated agent first (this will handle the delay and reload)
            showGeneratedAgent(result.agent);
            
            // Close forms and reset button immediately
            setTimeout(() => {
              hideProductForm();
              hideTemplateBox();
              generateAgentBtn.disabled = false;
              generateAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
            }, 300); // Quick transition
            
            return; // Don't execute the catch block
          } else {
            throw new Error(result.error || 'Error generating agent');
          }

        } catch (error) {
          console.error('Error generating agent:', error);
          alert('Error al generar el agente. Por favor, inténtalo de nuevo.');
          
          // Reset button state
          generateAgentBtn.disabled = false;
          generateAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
      });
    }

    // Handle generate client agent button click
    if (generateClientAgentBtn) {
      generateClientAgentBtn.addEventListener('click', async () => {
        // Get form values
        const clientDescription = document.getElementById('clientDescription')?.value || '';
        const clientWebsite = document.getElementById('clientWebsite')?.value || '';
        const clientScope = document.getElementById('clientScope')?.value || '';

        // Validate required fields
        if (!clientDescription.trim()) {
          alert('Por favor, proporciona una descripción del cliente.');
          return;
        }

        // Show loading state
        generateClientAgentBtn.disabled = true;
        generateClientAgentBtn.innerHTML = '<div class="button-spinner"></div> Generando...';
        
        try {
          // Make API call to generate client agent
          const response = await fetch('/api/generate-client-agent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              clientData: {
                description: clientDescription,
                website: clientWebsite,
                scope: clientScope
              }
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          
          if (result.success && result.agent) {
            // Show generated agent first (this will handle the delay and reload)
            showGeneratedAgent(result.agent);
            
            // Close forms and reset button immediately
            setTimeout(() => {
              hideClientForm();
              hideTemplateBox();
              generateClientAgentBtn.disabled = false;
              generateClientAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
            }, 300); // Quick transition
            
            return; // Don't execute the catch block
          } else {
            throw new Error(result.error || 'Error generating client agent');
          }

        } catch (error) {
          console.error('Error generating client agent:', error);
          alert('Error al generar el agente. Por favor, inténtalo de nuevo.');
          
          // Reset button state
          generateClientAgentBtn.disabled = false;
          generateClientAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
      });
    }

    // Handle generate sector agent button click
    if (generateSectorAgentBtn) {
      generateSectorAgentBtn.addEventListener('click', async () => {
        // Get form values
        const sectorDescription = document.getElementById('sectorDescription')?.value || '';
        const sectorGeographicScope = document.getElementById('sectorGeographicScope')?.value || '';
        const sectorSubtopics = document.getElementById('sectorSubtopics')?.value || '';

        // Validate required fields
        if (!sectorDescription.trim()) {
          alert('Por favor, proporciona una descripción del sector.');
          return;
        }

        // Show loading state
        generateSectorAgentBtn.disabled = true;
        generateSectorAgentBtn.innerHTML = '<div class="button-spinner"></div> Generando...';
        
        try {
          // Make API call to generate sector agent
          const response = await fetch('/api/generate-sector-agent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sectorData: {
                description: sectorDescription,
                geographicScope: sectorGeographicScope,
                subtopics: sectorSubtopics
              }
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          
          if (result.success && result.agent) {
            // Show generated agent first (this will handle the delay and reload)
            showGeneratedAgent(result.agent);
            
            // Close forms and reset button immediately
            setTimeout(() => {
              hideSectorForm();
              hideTemplateBox();
              generateSectorAgentBtn.disabled = false;
              generateSectorAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
            }, 300); // Quick transition
            
            return; // Don't execute the catch block
          } else {
            throw new Error(result.error || 'Error generating sector agent');
          }

        } catch (error) {
          console.error('Error generating sector agent:', error);
          alert('Error al generar el agente. Por favor, inténtalo de nuevo.');
          
          // Reset button state
          generateSectorAgentBtn.disabled = false;
          generateSectorAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
      });
    }

    // Handle generate custom agent button click
    if (generateCustomAgentBtn) {
      generateCustomAgentBtn.addEventListener('click', async () => {
        // Get form values
        const customDescription = document.getElementById('customDescription')?.value || '';

        // Validate required fields
        if (!customDescription.trim()) {
          alert('Por favor, describe qué contenido quieres que el agente rastree.');
          return;
        }

        // Show loading state
        generateCustomAgentBtn.disabled = true;
        generateCustomAgentBtn.innerHTML = '<div class="button-spinner"></div> Generando...';
        
        try {
          // Make API call to generate custom agent
          const response = await fetch('/api/generate-custom-agent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              customData: {
                description: customDescription
              }
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          
          if (result.success && result.agent) {
            // Show generated agent first (this will handle the delay and reload)
            showGeneratedAgent(result.agent);
            
            // Close forms and reset button immediately
            setTimeout(() => {
              hideCustomForm();
              hideTemplateBox();
              generateCustomAgentBtn.disabled = false;
              generateCustomAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
            }, 300); // Quick transition
            
            return; // Don't execute the catch block
          } else {
            throw new Error(result.error || 'Error generating custom agent');
          }

        } catch (error) {
          console.error('Error generating custom agent:', error);
          alert('Error al generar el agente. Por favor, inténtalo de nuevo.');
          
          // Reset button state
          generateCustomAgentBtn.disabled = false;
          generateCustomAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
      });
    }
  }
}

// Initialize immediately if DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeConfigurationMenu();
    initializeAgentTemplates();
    // Initialize folders UI on initial load if agentes tab is active by default
    setTimeout(() => {
      const agentesTabActive = document.querySelector('#agentes-content.config-content.active');
      if (agentesTabActive && window.CarpetasAgentes && typeof window.CarpetasAgentes.init === 'function') {
        window.CarpetasAgentes.init();
      }
    }, 200);
  });
} else {
  // If content is loaded dynamically, initialize immediately
  setTimeout(() => {
    initializeConfigurationMenu();
    initializeAgentTemplates();
    // Initialize folders UI on initial load if agentes tab is active by default
    const agentesTabActive = document.querySelector('#agentes-content.config-content.active');
    if (agentesTabActive && window.CarpetasAgentes && typeof window.CarpetasAgentes.init === 'function') {
      window.CarpetasAgentes.init();
    }
  }, 100);
}

// Function to get default limits based on plan
function getDefaultLimits(plan) {
  switch (plan) {
    case 'plan1':
      return { limit_agentes: 0, limit_fuentes: 0 };
    case 'plan2':
      return { limit_agentes: 5, limit_fuentes: 3 };
    case 'plan3':
      return { limit_agentes: 10, limit_fuentes: 10 };
    case 'plan4':
      return { limit_agentes: null, limit_fuentes: null }; // unlimited
    default:
      return { limit_agentes: 0, limit_fuentes: 0 };
  }
}

// Function to update usage trackers
function updateUsageTrackers(userData) {
  const agentesTracker = document.getElementById('agentes-usage-tracker');
  const fuentesTracker = document.getElementById('fuentes-usage-tracker');
  
  if (!userData) return;
  
  // Get default limits if not defined
  const defaultLimits = getDefaultLimits(userData.subscription_plan || 'plan1');
  // Prefer enterprise limits from estructura_empresa when available
  const limitAgentes = (userData.limit_agentes !== undefined && userData.limit_agentes !== null) ? userData.limit_agentes : defaultLimits.limit_agentes;
  const limitFuentes = (userData.limit_fuentes !== undefined && userData.limit_fuentes !== null) ? userData.limit_fuentes : defaultLimits.limit_fuentes;
  
  // Count current usage
  const currentAgentes = Object.keys(userData.etiquetas_personalizadas || {}).length;
  const currentFuentes = (userData.cobertura_legal?.fuentes_gobierno || []).length + 
                        (userData.cobertura_legal?.fuentes_reguladores || []).length;
  
  // Update agentes tracker
  if (agentesTracker) {
    if (limitAgentes === null) {
      // Unlimited
      agentesTracker.textContent = 'Número de agentes ilimitado';
      agentesTracker.className = 'usage-tracker unlimited';
    } else {
      agentesTracker.textContent = `${currentAgentes}/${limitAgentes} disponibles`;
      agentesTracker.className = 'usage-tracker';
      
      // Add warning classes
      if (currentAgentes >= limitAgentes) {
        agentesTracker.classList.add('at-limit');
      } else if (currentAgentes >= limitAgentes * 0.8) {
        agentesTracker.classList.add('near-limit');
      }
    }
  }
  
  // Update fuentes tracker
  if (fuentesTracker) {
    if (limitFuentes === null) {
      // Unlimited
      fuentesTracker.textContent = 'Número de fuentes ilimitado';
      fuentesTracker.className = 'usage-tracker unlimited';
    } else {
      fuentesTracker.textContent = `${currentFuentes}/${limitFuentes} disponibles`;
      fuentesTracker.className = 'usage-tracker';
      
      // Add warning classes
      if (currentFuentes >= limitFuentes) {
        fuentesTracker.classList.add('at-limit');
      } else if (currentFuentes >= limitFuentes * 0.8) {
        fuentesTracker.classList.add('near-limit');
      }
    }
  }
}

// Expose functions globally so they can be called from dynamic HTML
window.initializeConfigurationMenu = initializeConfigurationMenu;
window.loadExistingAgents = loadExistingAgents;
window.renderAgentsGrid = renderAgentsGrid;
window.showGeneratedAgent = showGeneratedAgent;
window.updateUsageTrackers = updateUsageTrackers;

function hideLoader(){
  const l=document.getElementById('config-loader');
  if(l) l.style.display='none';
}

// ========== Agent detail and editing functions (moved from inline IIFE) ==========
async function openAgentDetail(agentKey, xml){
  // Read-only mode: no locking needed
  
  const overlay = document.getElementById('agentDetailOverlay');
  const title = document.getElementById('agentModalTitle');
  const titleText = document.getElementById('agentTitleText');
  const editNameBtn = document.getElementById('editAgentNameBtn');
  const ctxInput = document.getElementById('agentContexto');
  const objInput = document.getElementById('agentObjetivo');
  const contInput = document.getElementById('agentContenido');
  const noInclInput = document.getElementById('agentNoIncluidos');
  const saveBtn = document.getElementById('saveAgentChangesBtn');
  const closeBtn = document.getElementById('closeAgentModal');

  const vars = parseEtiquetaDefinition(xml);
  titleText.textContent = vars.NombreEtiqueta || agentKey;
  ctxInput.value = (vars.Contexto || '').replace(/<\/?b>/gi, '');
  objInput.value = (vars.Objetivo || '').replace(/<\/?b>/gi, '');
  contInput.value = (vars.Contenido || '').replace(/<\/?b>/gi, '');
  noInclInput.value = (vars.DocumentosNoIncluidos || '').replace(/<\/?b>/gi, '');

  // Force read-only: replace inputs with HTML-rendered view supporting <b> → <strong>
  try {
    const replaceWithHtml = (container, html) => {
      if (!container) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'agent-field-html';
      wrapper.style.cssText = 'border:1px solid #e9ecef; border-radius:8px; padding:12px; background:#fff; color:#0b2431; line-height:1.5; font-size:14px; white-space:normal;';
      wrapper.innerHTML = html;
      const parent = container.parentNode;
      if (parent) parent.replaceChild(wrapper, container);
      return wrapper;
    };
    replaceWithHtml(ctxInput, renderMultilineWithBold(vars.Contexto||''));
    replaceWithHtml(objInput, renderMultilineWithBold(vars.Objetivo||''));
    replaceWithHtml(contInput, renderMultilineWithBold(vars.Contenido||''));
    replaceWithHtml(noInclInput, renderMultilineWithBold(vars.DocumentosNoIncluidos||''));
  } catch(_){}
  
  // Solo deshabilitar saveBtn si existe (puede haber sido convertido a readonly)
  if (saveBtn) {
    saveBtn.disabled = true;
  }

  AGENTS_STATE.currentAgentKey = agentKey;
  AGENTS_STATE.originalXml = xml;
  AGENTS_STATE.originalVars = vars;
  AGENTS_STATE.isDirty = false;
  AGENTS_STATE.isEditing = false; // lectura únicamente
  // Remove any previous input handlers
  [ctxInput, objInput, contInput, noInclInput].forEach(el=>{ try{ el.oninput = null; }catch(_){ } });

  // Edición de nombre en el título
  if (editNameBtn){
    // Desactivar edición de nombre y ocultar botón
    editNameBtn.style.display = 'none';
    const spanNow = document.getElementById('agentTitleText');
    if (spanNow) {
      spanNow.style.marginLeft = '16px';
    }
  }

  if (saveBtn) {
    // Repurpose button to "Sugerir cambios"
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-comment-alt"></i> Sugerir cambios';
    // Mark as suggestion action so resolver won't intercept it for read-only users
    try { saveBtn.setAttribute('data-allow-suggest', 'true'); } catch(_){}
    // If any readonly wrapper/styles were applied, remove/restore them to ensure clickability
    try {
      const wrapper = saveBtn.parentElement;
      if (wrapper && wrapper.classList && wrapper.classList.contains('readonly-button-wrapper')) {
        const parent = wrapper.parentNode;
        if (parent) {
          parent.insertBefore(saveBtn, wrapper);
          wrapper.remove();
        }
      }
      saveBtn.style.opacity = '';
      saveBtn.style.cursor = 'pointer';
      saveBtn.style.pointerEvents = 'auto';
      saveBtn.style.filter = '';
      saveBtn.style.background = '';
      saveBtn.style.border = '';
      saveBtn.style.color = '';
    } catch(_){}
    saveBtn.onclick = ()=> {
      showSuggestChangesModal({
        agente: titleText.textContent || agentKey
      });
    };
  }
  closeBtn.onclick = ()=> attemptCloseAgentModal();

  overlay.style.display = 'flex';
}

// Modal para sugerir cambios y envío a backend
function showSuggestChangesModal({ agente }){
  const overlay = createModalOverlay();
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(11,36,49,.16);
    width: 90%;
    max-width: 560px;
    text-align: left;
    transform: scale(0.9);
    transition: transform 0.3s ease;`;

  const title = document.createElement('h3');
  title.textContent = 'Sugerir cambios para el agente';
  title.style.cssText = 'font-size:20px;margin:0 0 12px 0;color:#0b2431;font-weight:700;';

  const subtitle = document.createElement('div');
  subtitle.textContent = agente || '';
  subtitle.style.cssText = 'font-size:14px;color:#7a8a93;margin-bottom:12px;font-weight:600;';

  const textarea = document.createElement('textarea');
  textarea.className = 'product-input';
  textarea.rows = 6;
  textarea.placeholder = 'Ejemplo: Quiero que el agente incluya normativa de IA a parte de protección de datos.\nAdemás, me gustaría que dejara de detectar como relevante novedades sobre convenios interadminsitrativos';
  textarea.style.width = '100%';
  textarea.style.padding = '12px 16px';
  textarea.style.border = '1px solid #dee2e6';
  textarea.style.borderRadius = '8px';
  textarea.style.boxSizing = 'border-box';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px;';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'cancel-edit-btn';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.style.cursor = 'pointer';
  cancelBtn.style.background = 'transparent';
  cancelBtn.style.border = '1px solid #0b2431';
  cancelBtn.style.color = '#0b2431';
  cancelBtn.style.borderRadius = '16px';
  cancelBtn.style.padding = '8px 16px';
  cancelBtn.style.fontSize = '14px';
  cancelBtn.style.fontWeight = '500';
  cancelBtn.onclick = ()=> hideModal(overlay);

  const sendBtn = document.createElement('button');
  sendBtn.className = 'generate-agent-btn';
  sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar sugerencia';
  sendBtn.style.cursor = 'pointer';
  sendBtn.style.background = '#0b2431';
  sendBtn.style.border = '1px solid #0b2431';
  sendBtn.style.color = 'white';
  sendBtn.style.borderRadius = '16px';
  sendBtn.style.padding = '8px 16px';
  sendBtn.style.fontSize = '14px';
  sendBtn.style.fontWeight = '600';
  sendBtn.onclick = async ()=>{
    const text = (textarea.value||'').trim();
    if (!text){
      showErrorModal({ title:'Sugerencia vacía', message:'Introduce una sugerencia antes de enviar.', confirmText:'Entendido' });
      return;
    }
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<div class="button-spinner"></div> Enviando...';
    try{
      const res = await fetch('/api/sugerencia_edicion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          doc_url: '',
          feedback_detalle: text,
          agente: agente
        })
      });
      if (!res.ok) throw new Error(await res.text());
      hideModal(overlay);
      showAgentsToast('Gracias por tu sugerencia', 'success');
    }catch(e){
      console.error('Error enviando feedback:', e);
      showAgentsToast('No se pudo enviar la sugerencia', 'error');
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar sugerencia';
    }
  };

  actions.appendChild(cancelBtn);
  actions.appendChild(sendBtn);
  content.appendChild(title);
  content.appendChild(subtitle);
  content.appendChild(textarea);
  content.appendChild(actions);
  overlay.appendChild(content);
  document.body.appendChild(overlay);
  setTimeout(()=> overlay.classList.add('show'), 10);
}

function attemptCloseAgentModal(){
  if(AGENTS_STATE.isEditing && AGENTS_STATE.isDirty){
    const confirmOverlay = document.getElementById('unsavedConfirmOverlay');
    const discardBtn = document.getElementById('discardChangesBtn');
    const saveAndCloseBtn = document.getElementById('saveAndCloseBtn');
    const closeConfirmBtn = document.getElementById('closeUnsavedConfirm');
    confirmOverlay.style.display = 'flex';
    discardBtn.onclick = ()=>{ confirmOverlay.style.display='none'; closeAgentOverlay(); };
    saveAndCloseBtn.textContent = 'Guardar';
    saveAndCloseBtn.style.background = '#0b2431';
    saveAndCloseBtn.onclick = async ()=>{
      // Cambio inmediato del botón ANTES de cualquier await
      saveAndCloseBtn.disabled = true;
      saveAndCloseBtn.innerHTML = '<div class="button-spinner"></div> Guardando...';
      try {
        await saveAgentChanges(true, saveAndCloseBtn);
        // Mostrar tick por 1 segundo antes de cerrar
        saveAndCloseBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
          confirmOverlay.style.display='none';
          // Mostrar toast tras cerrar el modal de confirmación
          showAgentsToast('Agente actualizado correctamente', 'success');
          // NO cerrar el modal principal, mantenerlo abierto para seguir editando
        }, 1000);
      } catch(err) {
        console.error('Error saving from confirm modal:', err);
        saveAndCloseBtn.innerHTML = '<i class="fas fa-save"></i> Guardar';
        // Mostrar toast de error tras 1s
        setTimeout(() => {
          showAgentsToast('Problema actualizando el agente, pruebe de nuevo por favor', 'error');
        }, 1000);
      }
      saveAndCloseBtn.disabled = false;
    };
    closeConfirmBtn.onclick = ()=>{ confirmOverlay.style.display='none'; };
  } else {
    closeAgentOverlay();
  }
}

async function closeAgentOverlay(){
  // Release lock before closing
  if (AGENTS_STATE.currentAgentKey && typeof window.EtiquetasResolver !== 'undefined') {
    await window.EtiquetasResolver.unlockForEdit(AGENTS_STATE.currentAgentKey);
  }
  
  const overlay = document.getElementById('agentDetailOverlay');
  const saveBtn = document.getElementById('saveAgentChangesBtn');
  AGENTS_STATE.currentAgentKey = null;
  AGENTS_STATE.originalXml = '';
  AGENTS_STATE.originalVars = null;
  AGENTS_STATE.isDirty = false;
  AGENTS_STATE.isEditing = false;
  if(saveBtn) saveBtn.disabled = true;
  overlay.style.display = 'none';
}

function showAgentsToast(message, type){
  const el = document.getElementById('agentsToast');
  if(!el) return;
  // reset base styles
  el.style.display = 'flex';
  el.style.background = type === 'error' ? '#fff9e6' : '#e8f5e8';
  el.style.border = type === 'error' ? '1px solid #ff9800' : '1px solid var(--primary-color)';
  el.style.color = 'var(--dark-color)';
  el.innerHTML = type === 'error' ? '⚠️ ' + message : '✓ ' + message;
  setTimeout(()=>{ el.style.display = 'none'; }, 2000);
}

async function saveAgentChanges(closeAfterSave, triggerBtn){
  try{
    if (AGENTS_STATE.isSaving) return; // prevent duplicate saves
    AGENTS_STATE.isSaving = true;
    const titleText = document.getElementById('agentTitleText');
    const ctxInput = document.getElementById('agentContexto');
    const objInput = document.getElementById('agentObjetivo');
    const contInput = document.getElementById('agentContenido');
    const noInclInput = document.getElementById('agentNoIncluidos');

    const newVars = {
      NombreEtiqueta: (titleText.textContent||'').trim(),
      tipo: '',
      Contexto: (ctxInput.value||'').trim(),
      Objetivo: (objInput.value||'').trim(),
      Contenido: (contInput.value||'').trim(),
      DocumentosNoIncluidos: (noInclInput.value||'').trim()
    };

    if(!newVars.NombreEtiqueta){
      showErrorModal({
        title: 'Campo Requerido',
        message: 'El nombre del agente es obligatorio para poder guardarlo.',
        confirmText: 'Entendido'
      });
      AGENTS_STATE.isSaving = false;
      const btn = triggerBtn || document.getElementById('saveAgentChangesBtn');
      if(btn){ btn.innerHTML = '<i class="fas fa-save"></i> Guardar'; btn.disabled = false; }
      return;
    }

    const newXml = buildEtiquetaXml(newVars);
    // Fetch current etiquetas using enterprise-aware resolver
    let etiquetas = {};
    if (typeof window.EtiquetasResolver !== 'undefined' && typeof window.EtiquetasResolver.getEtiquetasPersonalizadas === 'function') {
      const current = await window.EtiquetasResolver.getEtiquetasPersonalizadas();
      etiquetas = current.etiquetas_personalizadas || {};
    } else {
      const response = await fetch('/api/get-user-data');
      const userData = await response.json();
      etiquetas = userData.etiquetas_personalizadas || {};
    }

    const oldKey = AGENTS_STATE.currentAgentKey;
    const newKey = newVars.NombreEtiqueta;
    if(oldKey !== newKey){ delete etiquetas[oldKey]; }
    etiquetas[newKey] = newXml;

    const updateResponse = await saveEtiquetasWithResolver(etiquetas);

    AGENTS_STATE.isDirty = false;
    // Mantener isEditing = true para que los campos sigan editables
    // AGENTS_STATE.isEditing = false;
    AGENTS_STATE.currentAgentKey = newKey;
    AGENTS_STATE.originalXml = newXml;
    AGENTS_STATE.originalVars = newVars;

    await loadExistingAgents();

    const titleSpan = document.getElementById('agentTitleText'); if (titleSpan) { titleSpan.textContent = newVars.NombreEtiqueta; }

    const btn = triggerBtn || document.getElementById('saveAgentChangesBtn');
    if (btn){
      btn.innerHTML = '<i class="fas fa-check"></i>';
    }
    // Mostrar toast 1s después
    if (!closeAfterSave) {
      // Solo mostrar toast si NO viene del modal de confirmación
      setTimeout(()=>{
        showAgentsToast('Agente actualizado correctamente', 'success');
        // Revertir botón a Guardar tras ocultar toast (2s)
        setTimeout(()=>{
          if (btn){ btn.innerHTML = '<i class="fas fa-save"></i> Guardar'; btn.disabled = true; }
          // Mantener estado de edición activo tras guardar
          AGENTS_STATE.isEditing = true;
          AGENTS_STATE.isDirty = false;
        }, 2000);
      }, 1000);
    } else {
      // Para el modal de confirmación, solo mantener estado activo
      AGENTS_STATE.isEditing = true;
      AGENTS_STATE.isDirty = false;
    }

    // No cerrar el modal automáticamente
    AGENTS_STATE.isSaving = false;
  }catch(err){
    console.error('Error al guardar el agente:', err);
    const btn = triggerBtn || document.getElementById('saveAgentChangesBtn');
    if(btn){ btn.innerHTML = '<i class="fas fa-save"></i> Guardar'; btn.disabled = false; }
    // Mostrar toast 1s después
    setTimeout(()=>{
      showAgentsToast('Problema actualizando el agente, pruebe de nuevo por favor', 'error');
      // No deshabilitamos el botón en error
    }, 1000);
    AGENTS_STATE.isSaving = false;
  }
}

// Override showGeneratedAgent with the later definition from the IIFE
function showGeneratedAgent(agentData){
  if(agentData && agentData.etiqueta_personalizada){
    setTimeout(()=> loadExistingAgents(), 100);
    setTimeout(()=>{
      const configMenu = document.querySelector('.config-menu');
      if(configMenu) configMenu.scrollIntoView({behavior:'smooth', block:'start'});
    }, 200);
  }
}
// ========== Modal Functions (Reversa UI Standard) ==========

/**
 * Sistema de modales estándar Reversa - NUNCA usar alert(), confirm() o prompt()
 */
function showErrorModal(options = {}) {
  const overlay = createModalOverlay();
  const modal = createModalContent({
    title: options.title || 'Error',
    message: options.message || 'Ha ocurrido un error.',
    confirmText: options.confirmText || 'Entendido',
    type: 'error',
    onConfirm: () => {
      hideModal(overlay);
      if (options.onConfirm) options.onConfirm();
    }
  });
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Show with animation
  setTimeout(() => overlay.classList.add('show'), 10);
}

function showConfirmModal(options = {}) {
  const overlay = createModalOverlay();
  const modal = createModalContent({
    title: options.title || 'Confirmar Acción',
    message: options.message || '¿Estás seguro?',
    confirmText: options.confirmText || 'Confirmar',
    cancelText: options.cancelText || 'Cancelar',
    type: options.type || 'confirm',
    onConfirm: () => {
      hideModal(overlay);
      if (options.onConfirm) options.onConfirm();
    },
    onCancel: () => {
      hideModal(overlay);
      if (options.onCancel) options.onCancel();
    }
  });
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Show with animation
  setTimeout(() => overlay.classList.add('show'), 10);
}

function showInfoModal(options = {}) {
  const overlay = createModalOverlay();
  const modal = createModalContent({
    title: options.title || 'Información',
    message: options.message || '',
    confirmText: options.confirmText || 'Entendido',
    type: 'info',
    onConfirm: () => {
      hideModal(overlay);
      if (options.onConfirm) options.onConfirm();
    }
  });
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Show with animation
  setTimeout(() => overlay.classList.add('show'), 10);
}

function createModalOverlay() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: rgba(0,0,0,.45);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s ease;
    font-family: 'Satoshi', sans-serif;
  `;
  
  overlay.className = 'reversa-modal-overlay';
  
  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideModal(overlay);
    }
  });
  
  // Close on ESC key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      hideModal(overlay);
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
  
  return overlay;
}

function createModalContent(options) {
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 32px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(11,36,49,.16);
    width: 90%;
    max-width: 480px;
    text-align: center;
    transform: scale(0.9);
    transition: transform 0.3s ease;
  `;
  
  // Title
  const title = document.createElement('h3');
  title.textContent = options.title;
  title.style.cssText = `
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 12px;
    color: #0b2431;
  `;
  
  // Message
  const message = document.createElement('p');
  message.textContent = options.message;
  message.style.cssText = `
    color: #495057;
    margin-bottom: 24px;
    line-height: 1.6;
  `;
  
  // Buttons container
  const buttons = document.createElement('div');
  buttons.style.cssText = `
    display: flex;
    gap: 12px;
    justify-content: center;
  `;
  
  // Cancel button (if needed)
  if (options.onCancel) {
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = options.cancelText;
    cancelBtn.style.cssText = `
      background: transparent;
      border: 1px solid #0b2431;
      color: #0b2431;
      border-radius: 20px;
      padding: 8px 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
    `;
    
    cancelBtn.addEventListener('click', options.onCancel);
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = 'rgba(11,36,49,.04)';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = 'transparent';
    });
    
    buttons.appendChild(cancelBtn);
  }
  
  // Confirm button
  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = options.confirmText;
  
  let buttonStyle = '';
  switch (options.type) {
    case 'error':
    case 'danger':
      buttonStyle = `
        background: #d32f2f;
        border: 1px solid #d32f2f;
        color: white;
      `;
      break;
    default:
      buttonStyle = `
        background: #0b2431;
        border: 1px solid #0b2431;
        color: white;
      `;
  }
  
  confirmBtn.style.cssText = `
    ${buttonStyle}
    border-radius: 20px;
    padding: 8px 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: inherit;
  `;
  
  confirmBtn.addEventListener('click', options.onConfirm);
  confirmBtn.addEventListener('mouseenter', () => {
    confirmBtn.style.filter = 'brightness(.95)';
  });
  confirmBtn.addEventListener('mouseleave', () => {
    confirmBtn.style.filter = 'brightness(1)';
  });
  
  buttons.appendChild(confirmBtn);
  
  content.appendChild(title);
  content.appendChild(message);
  content.appendChild(buttons);
  
  return content;
}

function hideModal(overlay) {
  overlay.classList.remove('show');
  overlay.style.opacity = '0';
  overlay.style.visibility = 'hidden';
  
  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    document.body.style.overflow = '';
  }, 300);
}

// CSS for modal show state
const modalCSS = document.createElement('style');
modalCSS.textContent = `
  .reversa-modal-overlay.show {
    opacity: 1 !important;
    visibility: visible !important;
  }
  
  .reversa-modal-overlay.show > div {
    transform: scale(1) !important;
  }
`;
document.head.appendChild(modalCSS);

// Expose agents functions globally
window.openAgentDetail = openAgentDetail;
window.saveAgentChanges = saveAgentChanges;
window.attemptCloseAgentModal = attemptCloseAgentModal;
window.closeAgentOverlay = closeAgentOverlay;

function openNewAgentModal(){
  const overlay = document.getElementById('agentDetailOverlay');
  const title = document.getElementById('agentModalTitle');
  const titleText = document.getElementById('agentTitleText');
  const editNameBtn = document.getElementById('editAgentNameBtn');
  const ctxInput = document.getElementById('agentContexto');
  const objInput = document.getElementById('agentObjetivo');
  const contInput = document.getElementById('agentContenido');
  const noInclInput = document.getElementById('agentNoIncluidos');
  const saveBtn = document.getElementById('saveAgentChangesBtn');
  const closeBtn = document.getElementById('closeAgentModal');

  // Set placeholders based on Protección de Datos example
  titleText.textContent = 'Protección de Datos';
  ctxInput.value = '';
  ctxInput.placeholder = 'Ejemplo: Es una empresa del sector sanitario que presta servicios médicos y asistenciales.';
  objInput.value = '';
  objInput.placeholder = 'Ejemplo: Detectar novedades normativas relevantes en protección de datos e IA';
  contInput.value = '';
  contInput.placeholder = `Ejemplo:  Se debe etiquetar el <DOCUMENTO> si cumple al menos uno de los siguientes supuestos:
a) Impone nuevas obligaciones, prohibiciones o medidas que obliguen a empresas a adaptar su operativa o sistemas.
b) Establece sanciones económicas o decisiones judiciales en materia de protección de datos.
c) Es una ley general u orgánica relevante para la etiqueta
d) Establece novedades normativas en materia de datos sanitarios.
e) Establece una recomendación o guía de mejores prácticas relevantes para protección de datos o aplicación de la IA.`;
  noInclInput.value = '';
  noInclInput.placeholder = `Ejemplo: EL <DOCUMENTO> No DEBE SER ETIQUETADO por esta etiqueta SI CUMPLE ALGUNO DE LOS SIGUIENTES SUPUESTOS:
Lista exhaustiva (no ampliar):
a) Nombramientos o ceses individuales de Delegados de Protección de Datos (DPO).
b) Convenios o resoluciones no sancionadoras que afectan a particulares concretos, empresas concretas o interadministrativos sin efectos jurídicos generales
c) Subvenciones sin impacto en la regulación del tratamiento de datos.
d) Documentos de otra materia cuya "inclusión" derive solo de menciones tangenciales al RGPD/LOPDGDD.`;

  // Enable all inputs for creation
  [ctxInput, objInput, contInput, noInclInput].forEach(el=>{
    el.disabled = false;
    if(el.tagName === 'TEXTAREA') el.readOnly = false;
  });
  if (saveBtn) saveBtn.disabled = false;

  // Set state for new agent creation
  AGENTS_STATE.currentAgentKey = null; // null indicates new agent
  AGENTS_STATE.originalXml = '';
  AGENTS_STATE.originalVars = null;
  AGENTS_STATE.isDirty = false;
  AGENTS_STATE.isEditing = true;

  const markDirty = ()=>{
    AGENTS_STATE.isDirty = true;
    if (saveBtn) saveBtn.disabled = false;
  };
  [ctxInput, objInput, contInput, noInclInput].forEach(el=>{ el.oninput = markDirty; });

  // Edición de nombre en el título
  if (editNameBtn){
    editNameBtn.onclick = ()=>{
      const spanNow = document.getElementById('agentTitleText');
      const current = (spanNow?.textContent) || '';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'product-input';
      input.style.height = '32px';
      input.style.fontSize = '16px';
      input.style.padding = '6px 10px';
      input.style.marginLeft = '0';
      (spanNow || titleText).replaceWith(input);
      input.focus();
      const commit = ()=>{
        const trimmed = (input.value || '').trim();
        const newSpan = document.createElement('span');
        newSpan.id = 'agentTitleText';
        newSpan.textContent = trimmed || current;
        input.replaceWith(newSpan);
        if ((trimmed || current) !== current) {
          AGENTS_STATE.isDirty = true;
          const saveBtn = document.getElementById('saveAgentChangesBtn');
          if (saveBtn) saveBtn.disabled = false;
        }
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter'){ e.preventDefault(); input.blur(); }
        if(e.key === 'Escape'){ input.value = current; input.blur(); }
      });
    };
  }

  if (saveBtn) {
    saveBtn.onclick = ()=> {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<div class="button-spinner"></div> Guardando...';
      saveNewAgent(saveBtn);
    };
  }
  closeBtn.onclick = ()=> attemptCloseAgentModal();

  overlay.style.display = 'flex';
}

async function saveNewAgent(triggerBtn){
  try{
    if (AGENTS_STATE.isSaving) return;
    AGENTS_STATE.isSaving = true;
    const titleText = document.getElementById('agentTitleText');
    const ctxInput = document.getElementById('agentContexto');
    const objInput = document.getElementById('agentObjetivo');
    const contInput = document.getElementById('agentContenido');
    const noInclInput = document.getElementById('agentNoIncluidos');

    const newVars = {
      NombreEtiqueta: (titleText.textContent||'').trim(),
      tipo: '',
      Contexto: (ctxInput.value||'').trim(),
      Objetivo: (objInput.value||'').trim(),
      Contenido: (contInput.value||'').trim(),
      DocumentosNoIncluidos: (noInclInput.value||'').trim()
    };

    if(!newVars.NombreEtiqueta){
      showErrorModal({
        title: 'Campo Requerido', 
        message: 'El nombre del agente es obligatorio para poder crearlo.',
        confirmText: 'Entendido'
      });
      AGENTS_STATE.isSaving = false;
      const btn = triggerBtn || document.getElementById('saveAgentChangesBtn');
      if(btn){ btn.innerHTML = '<i class="fas fa-save"></i> Guardar'; btn.disabled = false; }
      return;
    }

    const newXml = buildEtiquetaXml(newVars);
    // Fetch current etiquetas using enterprise-aware resolver
    let etiquetas = {};
    if (typeof window.EtiquetasResolver !== 'undefined' && typeof window.EtiquetasResolver.getEtiquetasPersonalizadas === 'function') {
      const current = await window.EtiquetasResolver.getEtiquetasPersonalizadas();
      etiquetas = current.etiquetas_personalizadas || {};
    } else {
      const response = await fetch('/api/get-user-data');
      const userData = await response.json();
      etiquetas = userData.etiquetas_personalizadas || {};
    }

    const newKey = newVars.NombreEtiqueta;
    etiquetas[newKey] = newXml;

    const updateResponse = await saveEtiquetasWithResolver(etiquetas);

    AGENTS_STATE.isDirty = false;
    AGENTS_STATE.currentAgentKey = newKey;
    AGENTS_STATE.originalXml = newXml;
    AGENTS_STATE.originalVars = newVars;

    await loadExistingAgents();

    const btn = triggerBtn || document.getElementById('saveAgentChangesBtn');
    if (btn){
      btn.innerHTML = '<i class="fas fa-check"></i>';
    }
    setTimeout(()=>{
      showAgentsToast('Agente creado correctamente', 'success');
      setTimeout(()=>{
        if (btn){ btn.innerHTML = '<i class="fas fa-save"></i> Guardar'; btn.disabled = true; }
        closeAgentOverlay(); // Cerrar modal tras crear
      }, 2000);
    }, 1000);

    AGENTS_STATE.isSaving = false;
  }catch(err){
    console.error('Error al crear el agente:', err);
    const btn = triggerBtn || document.getElementById('saveAgentChangesBtn');
    if(btn){ btn.innerHTML = '<i class="fas fa-save"></i> Guardar'; btn.disabled = false; }
    setTimeout(()=>{
      showAgentsToast('Problema creando el agente, pruebe de nuevo por favor', 'error');
    }, 1000);
    AGENTS_STATE.isSaving = false;
  }
}

// Expose new agent creation functions globally
window.openNewAgentModal = openNewAgentModal;
window.saveNewAgent = saveNewAgent;

// Coordinated rendering function that ensures folders are ready before rendering
function renderAgentsGridCoordinated(etiquetas) {
  console.log('🎯 STARTING renderAgentsGridCoordinated');
  const grid = document.getElementById('agentsGrid');
  if (!grid) return;
  
  // Clear stable loading flag - this will allow the final render
  clearStableLoader();
  console.log('🔓 Cleared stable loading flag');
  // Mark coordinated rendering done to avoid re-showing loaders
  grid.dataset.coordinatedRendered = 'true';
  // Also clear any stable loader node if present
  const stableNode = grid.querySelector('#stable-agents-loader');
  if (stableNode) { stableNode.remove(); }
  
  // Ensure CarpetasAgentes is completely ready - this should always be true in coordinated mode
  const isCarpetasReady = window.CarpetasAgentes && 
    typeof window.CarpetasAgentes.getEstructura === 'function' &&
    typeof window.CarpetasAgentes.getCurrentFolderId === 'function';
  
  if (!isCarpetasReady) {
    console.error('🚨 CarpetasAgentes not ready during coordinated rendering!');
    // Fallback to regular renderAgentsGrid
    return renderAgentsGrid(etiquetas);
  }
  
  const entries = Object.entries(etiquetas || {});
  if (entries.length === 0) {
    console.log('📭 No agents to display, showing empty message');
    grid.innerHTML = '<div style="color:#7a8a93; font-size:14px;">No tienes agentes aún. Crea tu primer agente.</div>';
    return;
  }
  
  console.log('🎯 Rendering', entries.length, 'agents with folder assignments...');
  
  // Get folder context and assignment filtering (we know it's available)
  const estructura = window.CarpetasAgentes.getEstructura();
  const currentFolderId = window.CarpetasAgentes.getCurrentFolderId();
  
  const favToggle = document.getElementById('vista-favoritos-toggle');
  const onlyFavs = !!favToggle?.checked;
  const favSet = window.CarpetasAgentes.getFavoritos();
  
  console.log('⭐ Loaded favorites from BD:', Array.from(favSet));
  
  // Use the same rendering logic as renderAgentsGrid but skip the loader checks
  function attachBlackTooltip(el, text){
    let tip;
    el.addEventListener('mouseenter', ()=>{
      if (tip) return;
      tip = document.createElement('div');
      tip.textContent = text;
      Object.assign(tip.style, { position:'fixed', background:'#0b2431', color:'#fff', padding:'6px 10px', borderRadius:'6px', fontSize:'12px', zIndex:'5000', boxShadow:'0 4px 12px rgba(0,0,0,.25)' });
      document.body.appendChild(tip);
      const r = el.getBoundingClientRect();
      tip.style.top = (r.top + 18) + 'px';
      tip.style.left = Math.min(window.innerWidth - 220, Math.max(8, r.left + 12)) + 'px';
    });
    el.addEventListener('mouseleave', ()=>{ if (tip){ tip.remove(); tip=null; } });
  }
  
  // Build HTML first, then attach events to reduce reflow
  let html = '';
  const data = [];
  let filteredCount = 0;
  
  entries.reverse().forEach(([key, xml])=>{
    // Get agent assignment
    const agentAssignment = estructura.asignaciones[key] || null;
    
    // Filter based on current context
    let shouldShow = false;
    
    if (currentFolderId === null) {
      // We're in "General" view - only show agents with no assignment
      shouldShow = (agentAssignment === null);
    } else {
      // We're in a specific folder view - only show agents assigned to this folder
      shouldShow = (String(agentAssignment) === String(currentFolderId));
    }
    
    // Additional favorites filtering
    if (onlyFavs && !favSet.has(key)) {
      shouldShow = false;
    }
    
    if (!shouldShow) return;
    
    filteredCount++;
    const parsed = parseEtiquetaDefinition(xml);
    const name = parsed.NombreEtiqueta || key;
    const obj = parsed.Objetivo || '';
    data.push({key, xml});
    html += `
      <div class="agent-box" data-key="${encodeURIComponent(key)}" draggable="true" title="Arrastra a una carpeta para asignarlo" style="position:relative;">
        <div class="agent-header">
          <h3>${name}</h3>
        </div>
        <p class="agent-objective">${renderWithBoldMarkers(obj)}</p>
        <i class="far fa-star agent-fav" data-fav="${encodeURIComponent(key)}" title="" style="position:absolute;top:8px;right:36px;color:#adb5bd;cursor:pointer"></i>
        <i class="fas fa-ellipsis-h agent-menu-btn" title="Más opciones" style="position:absolute;top:8px;right:10px;color:#455862;cursor:pointer"></i>
        <div class="agent-menu" style="position:absolute;top:32px;right:10px;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 8px 24px rgba(11,36,49,.12);display:none;min-width:190px;z-index:20">
          <div class="agent-menu-item" data-action="move" style="padding:10px 12px;cursor:pointer;font-size:13px;color:#0b2431;display:flex;align-items:center;justify-content:space-between;">
            <span>Mover a…</span>
            <i class="fas fa-caret-right"></i>
            <div class="agent-submenu" style="display:none;position:absolute;top:0;left:100%;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 8px 24px rgba(11,36,49,.12);min-width:180px;z-index:30;padding:6px 0;"></div>
          </div>
          <div class="agent-menu-item" data-action="delete" style="padding:10px 12px;cursor:pointer;font-size:13px;color:#b00020">Eliminar</div>
        </div>
      </div>`;
  });
  
  // Show appropriate message if no agents to display
  if (filteredCount === 0) {
    if (onlyFavs) {
      // Check if there are ANY favorite agents at all (not just in current location)
      const allFavorites = Array.from(favSet).filter(k => !k.startsWith('folder:'));
      if (allFavorites.length === 0) {
        html = '<div style="color:#7a8a93; font-size:14px;">No hay agentes suscritos. Suscríbete a agentes para tener una visión personalizada haciendo clic en la estrella ⭐</div>';
      } else {
        // If there are favorites but none in current location, show nothing to keep UI clean
        html = '';
      }
    } else if (currentFolderId === null) {
      // Check if there are any folders at all
      const hasFolders = estructura && Object.keys(estructura.folders || {}).length > 0;
      
      if (!hasFolders) {
        html = '<div style="color:#7a8a93; font-size:14px;">Crea carpetas para asignar y estructurar tus agentes por departamentos, sectores, clientes...</div>';
      } else {
        html = ''; // Don't show any message in General when there are folders
      }
    } else {
      html = '<div style="color:#7a8a93; font-size:14px;">No hay agentes en esta carpeta. Usa "Mover a..." para asignar agentes aquí.</div>';
    }
  }
  
  grid.innerHTML = html;
  
  // Attach event handlers for each agent box
  grid.querySelectorAll('.agent-box').forEach(box=>{
    const key = decodeURIComponent(box.getAttribute('data-key'));
    const xml = etiquetas[key];
    
    box.addEventListener('click', (e)=>{
      // prevent click when clicking favorite star or menu
      if ((e.target && e.target.classList && (e.target.classList.contains('agent-fav') || e.target.closest('.agent-fav') || e.target.classList.contains('agent-menu-btn') || e.target.closest('.agent-menu')))) return;
      window.openAgentDetail && window.openAgentDetail(key, xml);
    });
    
    // Drag support → assign into folders UI
    box.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('text/plain', JSON.stringify({ type:'agente', agente: key }));
    });
    
    // Menu wiring
    const menuBtn = box.querySelector('.agent-menu-btn');
    const menu = box.querySelector('.agent-menu');
    if (menuBtn && menu){
      menuBtn.addEventListener('click', (e)=>{ e.stopPropagation(); menu.style.display = menu.style.display==='block' ? 'none' : 'block'; });
      document.addEventListener('click', ()=>{ menu.style.display='none'; }, { once:true });
      
      // Build hover submenu for Move to…
      const moveItem = menu.querySelector('.agent-menu-item[data-action="move"]');
      const submenu = moveItem?.querySelector('.agent-submenu');
      if (moveItem && submenu){
        moveItem.addEventListener('mouseenter', ()=>{
          // Populate submenu on hover
          submenu.innerHTML = '';
          
          // Get current folder assignment for this agent
          const currentAssignment = estructura.asignaciones[key] || null;
          
          // Add "General" option if not currently in General
          if (currentAssignment !== null) {
            const optGeneral = document.createElement('div'); 
            optGeneral.textContent = 'General'; 
            optGeneral.dataset.dest = '__root__'; 
            optGeneral.style.cssText='padding:8px 12px;cursor:pointer;font-size:13px;color:#0b2431;'; 
            submenu.appendChild(optGeneral);
          }
          
          // Add folder options (excluding current folder)
          try{
            const folders = Object.values(estructura.folders);
            folders.forEach(f=>{ 
              if (String(f.id) !== String(currentAssignment)) {
                const d=document.createElement('div'); 
                d.textContent=f.nombre; 
                d.dataset.dest=String(f.id); 
                d.style.cssText='padding:8px 12px;cursor:pointer;font-size:13px;color:#0b2431;'; 
                submenu.appendChild(d); 
              }
            });
          }catch(_){ /* ignore */ }
          submenu.style.display='block';
        });
        moveItem.addEventListener('mouseleave', ()=>{ submenu.style.display='none'; });
        
        // Handle submenu clicks
        submenu.addEventListener('click', async (e)=>{
          if (e.target.dataset.dest){
            const dest = e.target.dataset.dest;
            const targetFolderId = dest === '__root__' ? null : dest;
            menu.style.display='none';
            if (window.CarpetasAgentes && typeof window.CarpetasAgentes.moveAgentTo === 'function'){
              await window.CarpetasAgentes.moveAgentTo(key, targetFolderId);
            }
          }
        });
      }
      
      // Handle delete action
      const deleteItem = menu.querySelector('.agent-menu-item[data-action="delete"]');
      deleteItem?.addEventListener('click', ()=>{
        menu.style.display='none';
        if (window.CarpetasAgentes && typeof window.CarpetasAgentes.deleteAgent === 'function'){
          window.CarpetasAgentes.deleteAgent(key);
        }
      });
    }
  });
  
  // Favorite stars behavior with tooltip and persistence
  grid.querySelectorAll('.agent-fav').forEach(star=>{
    const agent = decodeURIComponent(star.getAttribute('data-fav'));
    const isFavorite = favSet.has(agent);
    
    // Set initial state correctly
    if (isFavorite) {
      star.classList.remove('far'); 
      star.classList.add('fas'); 
      star.style.color = '#04db8d';
    } else {
      star.classList.remove('fas'); 
      star.classList.add('far'); 
      star.style.color = '#adb5bd';
    }
    
    // Ensure tooltip cleanup on mouseleave
    star.addEventListener('mouseleave', () => {
      const blackTips = document.querySelectorAll('body > div');
      blackTips.forEach(el => {
        if (el && el.textContent === 'Selecciona para suscribirte a este agente') el.remove();
      });
    });
    
    attachBlackTooltip(star, 'Selecciona para suscribirte a este agente');
    star.addEventListener('click', async ()=>{
      try{
        // toggle UI instantly
        const isActive = star.classList.contains('fas');
        if (isActive){
          star.classList.remove('fas'); star.classList.add('far'); star.style.color = '#adb5bd';
        } else {
          star.classList.remove('far'); star.classList.add('fas'); star.style.color = '#04db8d';
        }
        
        // Update through CarpetasAgentes which handles persistence correctly
        if (window.CarpetasAgentes && typeof window.CarpetasAgentes.getFavoritos === 'function') {
          const favoritosSet = window.CarpetasAgentes.getFavoritos();
          if (isActive) {
            favoritosSet.delete(agent);
          } else {
            favoritosSet.add(agent);
          }
          
          // Optimistically update underlying favorites for immediate UI filtering
          if (window.CarpetasAgentes && typeof window.CarpetasAgentes.setAgentFavoriteOptimistic === 'function') {
            window.CarpetasAgentes.setAgentFavoriteOptimistic(agent, !isActive);
          }
          // Update favorites counter reactively if available, using dynamic recompute
          if (typeof window.updateFavoritesCounter === 'function') {
            const set = (window.CarpetasAgentes && typeof window.CarpetasAgentes.getFavoritos === 'function')
              ? window.CarpetasAgentes.getFavoritos()
              : favoritosSet;
            const dynamicCount = Array.from(set).filter(k => typeof k === 'string' && !k.startsWith('folder:')).length;
            window.updateFavoritesCounter(dynamicCount);
          }
          
          // Persist through the carpetas system with saving guard
          try {
            window.__favoritos_saving__ = true;
            await persistFavoritosCoordinated(favoritosSet);
          } finally {
            window.__favoritos_saving__ = false;
          }
          // Immediately refresh tracker sections to avoid lag
          try { if (typeof window.refreshFavoritesDependentUI === 'function') window.refreshFavoritesDependentUI(); } catch(_){}
          // If 'favoritos' view is active, re-render immediately to reflect change
          const favToggle = document.getElementById('vista-favoritos-toggle');
          if (favToggle && favToggle.checked && typeof window.renderAgentsGridCoordinated === 'function') {
            setTimeout(() => window.renderAgentsGridCoordinated(etiquetas), 10);
          }
        }

      }catch(err){ 
        console.error('Error toggling favorito:', err);
        // Revert UI on error
        if (star.classList.contains('fas')){
          star.classList.remove('fas'); star.classList.add('far'); star.style.color = '#adb5bd';
        } else {
          star.classList.remove('far'); star.classList.add('fas'); star.style.color = '#04db8d';
        }
      }
    });
  });
  
  console.log('✅ Agents grid rendered with', filteredCount, 'visible agents');
}

// Helper function for coordinated favorites persistence
async function persistFavoritosCoordinated(favoritosSet) {
  try {
    const agentsOnly = Array.from(favoritosSet).filter(k => !k.startsWith('folder:'));
    await fetch('/api/agentes-seleccion-personalizada', { 
      method:'POST', 
      headers:{'Content-Type':'application/json'}, 
      body: JSON.stringify({ seleccion: agentsOnly }) 
    });
    console.log('✅ Favoritos persisted:', agentsOnly);
    
    // Trigger auto-folder favorites update in the carpetas system
    if (window.CarpetasAgentes && typeof window.CarpetasAgentes.reload === 'function') {
      // Reload will trigger autoMarkFolderFavorites
      setTimeout(() => {
        window.CarpetasAgentes.reload();
      }, 100);
    }
  } catch (error) {
    console.error('❌ Error persisting favoritos:', error);
    throw error;
  }
}


