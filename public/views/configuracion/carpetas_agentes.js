// carpetas_agentes.js - COMPLETE REWRITE - UI de carpetas y movimiento de agentes
// Funcionalidad: movimiento optimista con revert, drag & drop, UX fluida
(function(){
	let estructura = { folders: {}, asignaciones: {}, version: 1 };
	let counts = {};
	let seleccion = [];
	let isEmpresa = false;
	let canEditEmpresa = false;
	let favoritos = new Set();
	let etiquetasDisponiblesCache = null;
	let currentFolderId = null;
	let isDragInProgress = false; // Prevent concurrent drag operations
	let isAdmin = false; // Solo los admins pueden crear carpetas

	function $(sel, root=document){ return root.querySelector(sel); }
	function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

	function attachBlackTooltip(el, text){
		let tip;
		el.addEventListener('mouseenter', ()=>{
			if (tip) return;
			tip = document.createElement('div');
			tip.textContent = text;
			Object.assign(tip.style, { position:'fixed', background:'#0b2431', color:'#fff', padding:'6px 10px', borderRadius:'6px', fontSize:'12px', zIndex:'5000', boxShadow:'0 4px 12px rgba(0,0,0,.25)' });
			document.body.appendChild(tip);
			const r = el.getBoundingClientRect();
			tip.style.top = (r.top - 32) + 'px';
			tip.style.left = Math.min(window.innerWidth - 220, Math.max(8, r.left - 10)) + 'px';
		});
		el.addEventListener('mouseleave', ()=>{ if (tip){ tip.remove(); tip=null; } });
	}

	function getMountContainer(){
		return document.getElementById('foldersAgentsContainer')
			|| document.getElementById('agentesContainer')
			|| document.getElementById('agentes-content')
			|| null;
	}

	async function fetchJSON(url, options={}){
		const res = await fetch(url, { credentials:'same-origin', headers:{'Content-Type':'application/json'}, ...options });
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}

	function showToast(message, type='success'){
		const msg = document.createElement('div');
		Object.assign(msg.style, { 
			position:'fixed', top:'20px', right:'20px', 
			background: type==='error' ? '#fff9e6' : '#e8f5e8', 
			color:'#0b2431', border:'1px solid #0b2431', 
			padding:'10px 14px', borderRadius:'10px', 
			zIndex:'4500', fontWeight:'600' 
		});
		msg.textContent = message;
		document.body.appendChild(msg);
		setTimeout(()=> msg.remove(), 2500);
	}

	// ===== Modales estándar Reversa =====
	function showModal(contentHTML){
		let overlay = document.getElementById('carpetas-modal-overlay');
		if (!overlay){
			overlay = document.createElement('div');
			overlay.id = 'carpetas-modal-overlay';
			Object.assign(overlay.style, { position:'fixed', inset:'0', background:'rgba(11,36,49,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:'4000' });
			document.body.appendChild(overlay);
		}
		const modal = document.createElement('div');
		Object.assign(modal.style, { width:'min(520px, 92%)', background:'#fff', borderRadius:'14px', boxShadow:'0 16px 40px rgba(0,0,0,0.25)', overflow:'hidden' });
		modal.innerHTML = contentHTML;
		overlay.innerHTML='';
		overlay.appendChild(modal);
		overlay.style.display='flex';
		return { overlay, modal, close: ()=> { overlay.style.display='none'; overlay.innerHTML=''; } };
	}

	function showConfirmModal({ title='Confirmar', message='¿Estás seguro?', confirmText='Confirmar', onConfirm }){
		const html = `
			<div style="padding:14px 16px; border-bottom:1px solid #f0f0f0; display:flex; align-items:center; justify-content:space-between;">
				<h3 style="margin:0; font-size:18px; color:#0b2431;">${title}</h3>
				<button id="carp-modal-close" style="background:transparent;border:none;color:#999;width:32px;height:32px;border-radius:50%">×</button>
			</div>
			<div style="padding:16px; color:#455862; font-size:14px;">${message}</div>
			<div style="padding:12px 16px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:8px;">
				<button id="carp-cancel" class="modal-btn" style="background:#fff; color:#0b2431; border:1px solid #0b2431; border-radius:20px; padding:8px 14px;">Cancelar</button>
				<button id="carp-confirm" class="modal-btn" style="background:#0b2431; color:#fff; border:1px solid #0b2431; border-radius:20px; padding:8px 14px;">${confirmText}</button>
			</div>`;
		const { overlay, close } = showModal(html);
		$('#carp-modal-close', overlay)?.addEventListener('click', close);
		$('#carp-cancel', overlay)?.addEventListener('click', close);
		$('#carp-confirm', overlay)?.addEventListener('click', ()=>{ onConfirm && onConfirm(close); });
	}

	// Modal system for folder operations following Reversa UI standards
	function showInputModal({ title, message, placeholder, defaultValue = '', confirmText = 'Confirmar', onConfirm }) {
		// Remove existing modal if any
		const existingModal = document.getElementById('folder-input-modal');
		if (existingModal) existingModal.remove();
		
		// Create modal overlay
		const overlay = document.createElement('div');
		overlay.id = 'folder-input-modal';
		overlay.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background: rgba(0,0,0,.45);
			display: flex;
			justify-content: center;
			align-items: center;
			z-index: 10000;
			opacity: 0;
			visibility: hidden;
			transition: all 0.3s ease;
		`;
		
		// Create modal content
		const modal = document.createElement('div');
		modal.style.cssText = `
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
		
		// Create title
		const titleEl = document.createElement('h3');
		titleEl.textContent = title;
		titleEl.style.cssText = `
			font-size: 20px;
			font-weight: 600;
			margin-bottom: 12px;
			color: #0b2431;
		`;
		
		// Create message
		const messageEl = document.createElement('p');
		messageEl.textContent = message;
		messageEl.style.cssText = `
			color: #495057;
			margin-bottom: 24px;
			font-size: 14px;
		`;
		
		// Create input
		const input = document.createElement('input');
		input.type = 'text';
		input.placeholder = placeholder;
		input.value = defaultValue;
		input.style.cssText = `
			width: 100%;
			padding: 10px 12px;
			border: 1px solid #dee2e6;
			border-radius: 4px;
			font-size: 14px;
			font-family: inherit;
			margin-bottom: 24px;
			transition: border-color 0.2s ease, box-shadow 0.2s ease;
		`;
		
		// Focus effect for input
		input.addEventListener('focus', () => {
			input.style.borderColor = '#04db8d';
			input.style.boxShadow = '0 0 0 2px rgba(4,219,141,.2)';
		});
		
		input.addEventListener('blur', () => {
			input.style.borderColor = '#dee2e6';
			input.style.boxShadow = 'none';
		});
		
		// Create buttons container
		const buttonsContainer = document.createElement('div');
		buttonsContainer.style.cssText = `
			display: flex;
			gap: 12px;
			justify-content: center;
		`;
		
		// Create cancel button
		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = 'Cancelar';
		cancelBtn.style.cssText = `
			border-radius: 20px;
			border: 1px solid #0b2431;
			padding: 8px 16px;
			font-weight: 600;
			background: transparent;
			color: #0b2431;
			cursor: pointer;
			font-size: 14px;
			transition: all 0.2s ease;
		`;
		
		// Create confirm button
		const confirmBtn = document.createElement('button');
		confirmBtn.textContent = confirmText;
		confirmBtn.style.cssText = `
			background: #0b2431;
			border: 1px solid #0b2431;
			color: white;
			border-radius: 20px;
			padding: 8px 16px;
			font-weight: 600;
			cursor: pointer;
			font-size: 14px;
			transition: all 0.2s ease;
		`;
		
		// Button events
		cancelBtn.addEventListener('click', () => {
			overlay.classList.remove('show');
			overlay.style.opacity = '0';
			overlay.style.visibility = 'hidden';
			setTimeout(() => overlay.remove(), 300);
		});
		
		confirmBtn.addEventListener('click', async () => {
			const name = (input.value || '').trim();
			if (!name) return;
			await onConfirm(name, () => {
				overlay.classList.remove('show');
				overlay.style.opacity = '0';
				overlay.style.visibility = 'hidden';
				setTimeout(() => overlay.remove(), 300);
			});
		});
		
		// Assemble modal
		modal.appendChild(titleEl);
		modal.appendChild(messageEl);
		modal.appendChild(input);
		modal.appendChild(buttonsContainer);
		
		buttonsContainer.appendChild(cancelBtn);
		buttonsContainer.appendChild(confirmBtn);
		
		overlay.appendChild(modal);
		document.body.appendChild(overlay);
		
		// Show modal with animation
		setTimeout(() => {
			overlay.style.opacity = '1';
			overlay.style.visibility = 'visible';
			modal.style.transform = 'scale(1)';
			input.focus();
			input.select();
		}, 10);
		
		document.body.style.overflow = 'hidden';
	}

	async function loadContext(){
		try{
			const ctx = await fetchJSON('/api/user-context');
			isEmpresa = ctx?.context?.tipo_cuenta === 'empresa';
			canEditEmpresa = !!ctx?.context?.can_edit_empresa;
			isAdmin = !!ctx?.context?.is_admin;
		}catch(e){ isEmpresa=false; canEditEmpresa=false; isAdmin=false; }
	}

	async function loadData(){
		try {
			// Load all data in parallel for better performance
			const [carpetasRes, seleccionRes, etiquetasRes] = await Promise.allSettled([
				fetchJSON('/api/carpetas-context'),
				fetchJSON('/api/agentes-seleccion-personalizada'),
				fetchJSON('/api/etiquetas-context')
			]);
			
			// Process carpetas data
			if (carpetasRes.status === 'fulfilled') {
				estructura = carpetasRes.value.data || { folders:{}, asignaciones:{}, version:1 };
				counts = carpetasRes.value.counts || {};
			} else {
				console.error('Error loading carpetas:', carpetasRes.reason);
				estructura = { folders:{}, asignaciones:{}, version:1 };
				counts = {};
			}
			
			// Process seleccion data
			if (seleccionRes.status === 'fulfilled') {
				seleccion = Array.isArray(seleccionRes.value.seleccion) ? seleccionRes.value.seleccion : [];
				favoritos = new Set(seleccion);
			} else {
				console.error('Error loading seleccion:', seleccionRes.reason);
				seleccion = [];
				favoritos = new Set();
			}
			
			// Process etiquetas data
			if (etiquetasRes.status === 'fulfilled') {
				etiquetasDisponiblesCache = etiquetasRes.value?.data || {};
				let el = document.getElementById('userEtiquetasPersonalizadas');
				if (!el){ 
					el = document.createElement('script'); 
					el.id = 'userEtiquetasPersonalizadas'; 
					el.type = 'application/json'; 
					document.body.appendChild(el); 
				}
				el.textContent = JSON.stringify(etiquetasDisponiblesCache);
			} else {
				console.error('Error loading etiquetas:', etiquetasRes.reason);
				etiquetasDisponiblesCache = {};
			}
			
			// Auto-mark folders as favorites if ALL their agents are favorites
			autoMarkFolderFavorites();
			
		} catch(error) {
			console.error('Critical error in loadData:', error);
			// Set fallback values
			estructura = { folders:{}, asignaciones:{}, version:1 };
			counts = {};
			seleccion = [];
			favoritos = new Set();
			etiquetasDisponiblesCache = {};
		}
	}

	// Auto-mark folders as favorites if ALL their agents are favorites
	function autoMarkFolderFavorites() {
		const folders = estructura.folders || {};
		
		Object.values(folders).forEach(folder => {
			const folderId = String(folder.id);
			const agentsInFolder = getAllAgentsInFolder(folderId);
			
			// If folder has agents and ALL of them are in favorites, mark folder as favorite
			if (agentsInFolder.length > 0) {
				const allAgentsAreFavorites = agentsInFolder.every(agentName => favoritos.has(agentName));
				const folderKey = 'folder:' + folderId;
				
				if (allAgentsAreFavorites && !favoritos.has(folderKey)) {
					favoritos.add(folderKey);
					console.log('📁⭐ Auto-marked folder as favorite:', folder.nombre, 'because all agents are favorites');
				} else if (!allAgentsAreFavorites && favoritos.has(folderKey)) {
					favoritos.delete(folderKey);
					console.log('📁☆ Auto-unmarked folder favorite:', folder.nombre, 'because not all agents are favorites');
				}
			}
		});
	}

	function buildTree(){
		const folders = estructura.folders || {};
		const children = {};
		Object.values(folders).forEach(f=>{ const pid = f.parentId || 'root'; if(!children[pid]) children[pid]=[]; children[pid].push(f); });
		Object.keys(children).forEach(k=> children[k].sort((a,b)=> (a.nombre||'').localeCompare(b.nombre||'')));
		return children;
	}

	function computeCounts(){
		const folders = estructura.folders || {};
		const asign = estructura.asignaciones || {};
		const c = {};
		Object.keys(folders).forEach(fid => c[fid] = 0);
		c.root = 0;
		Object.entries(asign).forEach(([ag, fid])=>{ const key = fid || 'root'; c[key] = (c[key]||0) + 1; });
		const children = (function(){ const m={}; Object.values(folders).forEach(f=>{ const pid = f.parentId || 'root'; (m[pid]||(m[pid]=[])).push(f); }); return m; })();
		function dfs(fid){ let sum = (c[fid]||0); (children[fid]||[]).forEach(k=> sum += dfs(String(k.id))); c[fid]=sum; return sum; }
		(children.root||[]).forEach(rootF => dfs(String(rootF.id)));
		c.root_total = (c.root||0) + (children.root||[]).reduce((acc,f)=> acc + (c[String(f.id)]||0), 0);
		counts = c;
	}

	// Get all agents in a folder and its subfolders
	function getAllAgentsInFolder(folderId) {
		const agents = [];
		const asignaciones = estructura.asignaciones || {};
		
		// Get all subfolders of this folder
		const allSubfolders = new Set([folderId]);
		const folders = estructura.folders || {};
		
		// Recursive function to get all descendant folders
		function addDescendants(parentId) {
			Object.values(folders).forEach(folder => {
				if (String(folder.parentId) === String(parentId)) {
					allSubfolders.add(String(folder.id));
					addDescendants(String(folder.id));
				}
			});
		}
		
		addDescendants(folderId);
		
		// Find all agents assigned to any of these folders
		Object.entries(asignaciones).forEach(([agentName, assignedFolderId]) => {
			if (assignedFolderId && allSubfolders.has(String(assignedFolderId))) {
				agents.push(agentName);
			}
		});
		
		return agents;
	}

	function getAgentesDisponibles(){
		try{
			if (etiquetasDisponiblesCache) return etiquetasDisponiblesCache;
			const el = document.getElementById('userEtiquetasPersonalizadas');
			if(!el) return {};
			const data = JSON.parse(el.textContent||'{}');
			return data||{};
		}catch(_){return {};} 
	}

	function ensureFavoritesToggle(){
		if (document.getElementById('vista-favoritos-toggle')) return;
		const actionsBar = document.getElementById('agents-actions');
		const usage = document.getElementById('agentes-usage-tracker');
		const mainTitle = usage ? usage.parentElement : null;
		const attachTarget = actionsBar || mainTitle;
		if (!attachTarget) return;
		
		// Check if user has selected favorites to determine default state
		const userHasFavorites = seleccion && seleccion.length > 0;
		const totalAgents = Object.keys(getAgentesDisponibles()).length;
		// selectedCount is computed dynamically inside updateToggleLabel to avoid stale values
		
		const holder = document.createElement('label'); 
		holder.style.cssText='display:inline-flex;align-items:center;gap:8px;margin-left:10px;cursor:pointer;height:32px;margin-top:19px;';
		
		// Create toggle container (the track)
		const toggleContainer = document.createElement('div');
		toggleContainer.style.cssText = `
			position: relative;
			width: 42px;
			height: 24px;
			background: #f1f1f1;
			border-radius: 20px;
			border: 1px solid #e0e0e0;
			transition: all 0.2s ease;
			cursor: pointer;
		`;
		
		// Create the hidden checkbox
		const input = document.createElement('input'); 
		input.type='checkbox'; 
		input.id='vista-favoritos-toggle'; 
		input.style.cssText='position:absolute;opacity:0;width:0;height:0;';
		
		// Set default state based on whether user has favorites
		input.checked = userHasFavorites;
		
		// Create the white circle (knob) with gray border
		const knob = document.createElement('div');
		knob.style.cssText = `
			position: absolute;
			top: 1px;
			left: 1px;
			width: 20px;
			height: 20px;
			background: #fff;
			border: 1px solid #d0d0d0;
			border-radius: 50%;
			transition: transform 0.2s ease;
			box-shadow: 0 2px 4px rgba(0,0,0,0.1);
			transform: ${input.checked ? 'translateX(18px)' : 'translateX(0px)'};
		`;
		
		// Create label text
		const span = document.createElement('span'); 
		span.id='toggle-label'; 
		span.style.cssText='font-size:14px;color:#455862;-webkit-text-fill-color:initial;display:flex;align-items:center;gap:6px;font-weight:600;'; 
		
		// Create counter element
		const counter = document.createElement('span');
		counter.id='favorites-counter';
		counter.style.cssText='font-size:12px;color:#04db8d;font-weight:600;background:rgba(4,219,141,0.1);padding:2px 6px;border-radius:10px;';
		
		// Function to update toggle visual state
		function updateToggleState() {
			if (input.checked) {
				toggleContainer.style.background = 'linear-gradient(135deg, #04db8d 0%, #0b2431 100%)';
				toggleContainer.style.borderColor = '#04db8d';
				knob.style.transform = 'translateX(18px)';
				knob.style.borderColor = '#04db8d';
			} else {
				toggleContainer.style.background = '#f1f1f1';
				toggleContainer.style.borderColor = '#e0e0e0';
				knob.style.transform = 'translateX(0px)';
				knob.style.borderColor = '#d0d0d0';
			}
		}
		
		// Function to update label text
		function updateToggleLabel() {
			if (input.checked) {
				span.innerHTML = '';
				span.appendChild(document.createTextNode('Favoritos'));
				// Recompute count from current favoritos set (exclude folders)
				let currentCount = 0;
				try {
					if (window.CarpetasAgentes && typeof window.CarpetasAgentes.getFavoritos === 'function') {
						const set = window.CarpetasAgentes.getFavoritos();
						currentCount = Array.from(set).filter(k => !k.startsWith('folder:')).length;
					} else if (Array.isArray(seleccion)) {
						currentCount = seleccion.filter(k => typeof k === 'string' && !k.startsWith('folder:')).length;
					}
				} catch(_) { currentCount = 0; }
				if (currentCount > 0) {
					span.appendChild(counter);
					counter.textContent = `${currentCount}/${totalAgents} seleccionados`;
				}
			} else {
				span.textContent = 'Vista completa';
			}
		}

		// Expose a reactive updater for the counter
		window.updateFavoritesCounter = function(newCount){
			try{
				// Exclude folder favorites from count (only agent keys, no 'folder:')
				let count = newCount;
				if (window.CarpetasAgentes && typeof window.CarpetasAgentes.getFavoritos==='function'){
					const set = window.CarpetasAgentes.getFavoritos();
					count = Array.from(set).filter(k => !k.startsWith('folder:')).length;
				}
				const el = document.getElementById('favorites-counter');
				if (el){
					el.textContent = `${count}/${totalAgents} seleccionados`;
				}
			} catch(_){ }
		};
		
		// Assemble the toggle
		toggleContainer.appendChild(knob);
		holder.appendChild(input);
		holder.appendChild(toggleContainer);
		holder.appendChild(span);
		attachTarget.appendChild(holder);
		
		// Set initial states
		updateToggleState();
		updateToggleLabel();
		
		// Add click handler to toggle container
		toggleContainer.addEventListener('click', async () => {
			// Prevent switching if a favorites save is in-flight
			if (window.__favoritos_saving__) {
				return; // brief guard to avoid race
			}
			input.checked = !input.checked;
			showNavigationLoader(); // Show loader immediately
			updateToggleState();
			updateToggleLabel();
			const tree = document.getElementById('carpetas-tree'); 
			if (tree) renderTree(tree); 
			await refreshAgentsGrid();
		});
		
		// Add click handler to label (for accessibility)
		holder.addEventListener('click', (e) => {
			if (e.target === toggleContainer || e.target === knob) return; // Prevent double triggering
			toggleContainer.click();
		});
		
		console.log('✅ Toggle created with knob positioned at:', knob.style.transform);
	}

	function renderUI(){
		const mount = getMountContainer(); 
		if(!mount) return;
		
		let container = document.getElementById('foldersAgentsContainer');
		if (!container) { 
			container = document.createElement('div'); 
			container.id = 'foldersAgentsContainer'; 
			container.style.margin = '10px 0 16px'; 
			mount.insertBefore(container, mount.firstChild); 
		}
		container.innerHTML = '';
		ensureFavoritesToggle();
		
		const newFolderBtn = document.getElementById('btn-nueva-carpeta');
		if (newFolderBtn) {
			// Solo admin: bloquear a roles "edición" y "lectura"
			if (isAdmin) {
				newFolderBtn.onclick = onNuevaCarpeta;
				newFolderBtn.style.opacity = '';
				newFolderBtn.style.cursor = '';
				newFolderBtn.removeAttribute('data-disabled');
			} else {
				newFolderBtn.onclick = null;
				newFolderBtn.setAttribute('data-disabled', 'true');
				newFolderBtn.style.opacity = '.6';
				newFolderBtn.style.cursor = 'not-allowed';
				attachBlackTooltip(newFolderBtn, 'No tienes permiso para crear carpetas. Habla con tu admin para que te lo conceda o la cree él');
			}
		}
		
		const treeContainer = document.createElement('div'); 
		treeContainer.id='carpetas-tree'; 
		treeContainer.addEventListener('dragover', e=>{ e.preventDefault(); }); 
		treeContainer.addEventListener('drop', e=> onDropIntoRoot(e)); 
		container.appendChild(treeContainer);
		
		renderTree(treeContainer);
	}

	function renderTree(rootEl){
		rootEl.innerHTML='';
		const children = buildTree();
		const agentes = getAgentesDisponibles();
		const vistaFavoritos = !!document.getElementById('vista-favoritos-toggle')?.checked;

		function folderHasFavorite(folderId){
			const key = 'folder:'+folderId; 
			if (favoritos.has(key)) return true;
			const allDesc = new Set([String(folderId)]);
			(function collect(fid){ (children[String(fid)]||[]).forEach(k => { allDesc.add(String(k.id)); collect(String(k.id)); }); })(String(folderId));
			for (const fav of favoritos){ 
				if (fav.startsWith('folder:')) continue; 
				const assigned = (estructura.asignaciones||{})[fav] || null; 
				if (assigned && allDesc.has(String(assigned))) return true; 
			}
			return false;
		}

		const bc = document.createElement('div'); 
		bc.style.cssText='display:flex;align-items:center;gap:12px;margin:8px 0;color:#7a8a93;font-size:16px;';
		const home = document.createElement('span'); 
		home.textContent='General'; 
		home.style.cssText='cursor:pointer;color:#0b2431;font-weight:700;font-size:16px;'; 
		home.onclick = async ()=>{ 
			showNavigationLoader();
			currentFolderId = null; 
			renderTree(rootEl); 
			await refreshAgentsGrid();
		};
		bc.appendChild(home);
		
		if (currentFolderId && estructura.folders[currentFolderId]){ 
			const sep = document.createElement('span'); sep.textContent='/'; sep.style.cssText='font-size:16px;'; bc.appendChild(sep); 
			const cur = document.createElement('span'); 
			cur.textContent = estructura.folders[currentFolderId].nombre || ''; 
			cur.style.cssText='color:#0b2431;font-size:16px;font-weight:600;'; bc.appendChild(cur); 
		}
		rootEl.appendChild(bc);

		if (!currentFolderId){
			(Object.values(children.root||[])).forEach(f => { 
				if (vistaFavoritos && !folderHasFavorite(String(f.id))) return; 
				rootEl.appendChild(renderFolderNode(f, children, agentes, vistaFavoritos)); 
			});
			return;
		}

		const folder = estructura.folders[currentFolderId]; 
		if (!folder){ currentFolderId = null; renderTree(rootEl); return; }
		(children[String(folder.id)]||[]).forEach(k => { 
			if (vistaFavoritos && !folderHasFavorite(String(k.id))) return; 
			rootEl.appendChild(renderFolderNode(k, children, agentes, vistaFavoritos)); 
		});
	}

	function renderFolderNode(folder, children, agentes, vistaFavoritos){
		const wrap = document.createElement('div'); 
		wrap.className='carpeta-node'; 
		wrap.style.cssText='border:1px solid #e0e0e0;border-radius:10px;padding:14px 16px;margin:8px 0'; 
		wrap.dataset.folderId = folder.id;
		
		// Drag & Drop setup
		wrap.addEventListener('dragover', e=>{ e.preventDefault(); e.currentTarget.style.background='rgba(4,219,141,0.05)'; }); 
		wrap.addEventListener('dragleave', e=>{ e.currentTarget.style.background=''; }); 
		wrap.addEventListener('drop', onDropIntoFolder); 
		wrap.draggable = canEditEmpresa || !isEmpresa; 
		wrap.addEventListener('dragstart', e=>{ 
			if (!(canEditEmpresa || !isEmpresa)) return; 
			e.dataTransfer.setData('text/plain', JSON.stringify({ type:'folder', folderId: String(folder.id) })); 
		});
		
		const header = document.createElement('div'); 
		header.style.cssText='display:flex;align-items:center;justify-content:space-between'; 
		header.innerHTML = `
			<div class="folder-left" style="display:flex;align-items:center;gap:12px;cursor:pointer;">
				<i class="fas fa-folder" style="color:#0b2431;"></i>
				<span style="font-weight:700;color:#0b2431;">${folder.nombre}</span>
				<span style="color:#7a8a93; font-size:12px;">${counts[String(folder.id)]||0} agentes</span>
			</div>
			<div style="display:flex;align-items:center;gap:10px;margin-left:10px;position:relative;">
				<i class="${favoritos.has('folder:'+folder.id) ? 'fas fa-star' : 'far fa-star'}" title="" data-fav-folder="${folder.id}" style="color:${favoritos.has('folder:'+folder.id) ? '#04db8d' : '#adb5bd'};cursor:pointer"></i>
				${(canEditEmpresa || !isEmpresa) ? `<i class="folder-menu-btn fas fa-ellipsis-h" aria-label="Más opciones" style="font-size:16px;color:#455862;cursor:pointer"></i>
				<div class="folder-menu" style="position:absolute;top:36px;right:0;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 8px 24px rgba(11,36,49,.12);display:none;min-width:160px;z-index:10">
					<div class="folder-menu-item" data-action="rename" style="padding:10px 12px;cursor:pointer;font-size:13px;color:#0b2431">Renombrar</div>
					<div class="folder-menu-item" data-action="delete" style="padding:10px 12px;cursor:pointer;font-size:13px;color:#b00020">Eliminar</div>
				</div>` : ''}
			</div>`;
		wrap.appendChild(header);
		
		const favIcon = header.querySelector('[data-fav-folder]');
		favIcon?.addEventListener('click', async ()=>{ 
			const key = 'folder:'+folder.id; 
			const wasFav = favoritos.has(key);
			
			// Get all agents in this folder (including subfolders)
			const agentsInFolder = getAllAgentsInFolder(String(folder.id));
			
			// Update UI immediately
			if (wasFav){ 
				favoritos.delete(key);
				// Remove all agents in this folder from favorites
				agentsInFolder.forEach(agentName => favoritos.delete(agentName));
			} else { 
				favoritos.add(key);
				// Add all agents in this folder to favorites
				agentsInFolder.forEach(agentName => favoritos.add(agentName));
			}
			
			favIcon.className = favoritos.has(key) ? 'fas fa-star' : 'far fa-star';
			favIcon.style.color = favoritos.has(key) ? '#04db8d' : '#adb5bd';
			
			try{ 
				await persistFavoritos(); 
				// Refresh the agents grid to show updated favorites
				await refreshAgentsGrid();
			}catch(err){ 
				// Revert on error
				if (wasFav){ 
					favoritos.add(key);
					agentsInFolder.forEach(agentName => favoritos.add(agentName));
				} else { 
					favoritos.delete(key);
					agentsInFolder.forEach(agentName => favoritos.delete(agentName));
				} 
				favIcon.className = favoritos.has(key) ? 'fas fa-star' : 'far fa-star'; 
				favIcon.style.color = favoritos.has(key) ? '#04db8d' : '#adb5bd'; 
				showToast('No se pudo actualizar favoritos', 'error'); 
			}
		});
		
		if (favIcon){ attachBlackTooltip(favIcon, 'Selecciona para añadir a favoritos'); }
		
		const menuBtn = header.querySelector('.folder-menu-btn'); 
		const menu = header.querySelector('.folder-menu'); 
		if (menuBtn && menu){ 
			menuBtn.addEventListener('click', (e)=>{ 
				e.stopPropagation(); 
				menu.style.display = menu.style.display==='block' ? 'none' : 'block'; 
			}); 
			document.addEventListener('click', ()=>{ menu.style.display='none'; }, { once:true }); 
			$all('.folder-menu-item', menu).forEach(item=>{ 
				item.addEventListener('click', async ()=>{ 
					menu.style.display='none'; 
					await onFolderAction(folder, item.dataset.action); 
				}); 
			}); 
		}
		
		const left = header.querySelector('.folder-left'); 
		left?.addEventListener('click', async ()=>{ 
			showNavigationLoader();
			currentFolderId = String(folder.id); 
			const tree = document.getElementById('carpetas-tree'); 
			if (tree) renderTree(tree);
			// Update agents grid to show only agents in this folder
			await refreshAgentsGrid();
		});
		
		(children[String(folder.id)] || []).forEach(k => wrap.appendChild(renderFolderNode(k, children, agentes, vistaFavoritos)));
		return wrap;
	}

	function showNavigationLoader() {
		const grid = document.getElementById('agentsGrid');
		if (grid) {
			console.log('🔄 NAVIGATION LOADER SHOWN');
			grid.innerHTML = `
				<div id="navigation-loader" style="display:flex;align-items:center;justify-content:center;padding:40px;min-height:200px;">
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
		}
	}

	async function refreshAgentsGrid(){
		try{
			const grid = document.getElementById('agentsGrid');
			if (grid && typeof window.renderAgentsGrid === 'function'){
				if (window.EtiquetasResolver && typeof window.EtiquetasResolver.getEtiquetasPersonalizadas==='function'){
					const res = await window.EtiquetasResolver.getEtiquetasPersonalizadas();
					window.renderAgentsGrid(res?.etiquetas_personalizadas || {});
				} else {
					const resp = await fetch('/api/etiquetas-context');
					const j = await resp.json();
					window.renderAgentsGrid(j?.data || {});
				}
			}
		}catch(e){ console.error('Error refreshing agents grid:', e); }
	}

	// ===== CORE MOVEMENT LOGIC - OPTIMISTIC UI WITH REVERT =====
	
	async function moveAgentTo(agentName, targetFolderId = null){
		console.log('Moving agent:', agentName, 'to folder:', targetFolderId);
		
		// Prevent concurrent operations
		if (isDragInProgress) {
			console.log('Drag operation already in progress, ignoring');
			return { success: false, reason: 'concurrent_operation' };
		}
		
		isDragInProgress = true;
		
		try {
			// Store previous state for revert
			const previousFolder = estructura.asignaciones[agentName] || null;
			
			// IMMEDIATE UI UPDATE (optimistic) - Hide agent from current view immediately
			estructura.asignaciones[agentName] = targetFolderId;
			computeCounts();
			
			// Immediately remove the agent from the current UI to prevent flickering
			const agentBoxes = document.querySelectorAll(`[data-key="${CSS.escape(agentName)}"]`);
			agentBoxes.forEach(box => {
				box.style.opacity = '0.3';
				box.style.pointerEvents = 'none';
				// Add a subtle fade out effect
				box.style.transition = 'opacity 0.2s ease';
				setTimeout(() => {
					if (box.parentNode) {
						box.remove();
					}
				}, 200);
			});
			
			// Update tree and grid
			renderTree(document.getElementById('carpetas-tree'));
			await refreshAgentsGrid();
			
			// Backend call
			await fetchJSON('/api/carpetas/assign', { 
				method:'POST', 
				body: JSON.stringify({ 
					agenteName: agentName, 
					folderId: targetFolderId, 
					expectedVersion: estructura.version 
				}) 
			});
			
			// Success - sync with server
			const car = await fetchJSON('/api/carpetas-context'); 
			estructura = car.data; 
			counts = car.counts; 
			renderTree(document.getElementById('carpetas-tree')); 
			await refreshAgentsGrid();
			
			showToast('Se ha movido el agente correctamente');
			return { success: true };
			
		} catch(err) {
			console.error('Backend move failed:', err);
			
			// REVERT UI (rollback)
			estructura.asignaciones[agentName] = previousFolder;
			computeCounts();
			renderTree(document.getElementById('carpetas-tree'));
			await refreshAgentsGrid();
			
			// Parse error for better user feedback
			let errorMessage = 'Ha surgido un error al mover el agente';
			try {
				const errorData = JSON.parse(err.message);
				if (errorData.conflict) {
					errorMessage = 'Conflicto de versión. La página se actualizará automáticamente.';
					setTimeout(() => window.location.reload(), 2000);
				}
			} catch(parseErr) {
				// Ignore parsing errors, use default message
			}
			
			showToast(errorMessage, 'error');
			return { success: false, error: String(err) };
		} finally {
			isDragInProgress = false;
		}
	}

	// Drag and drop handlers with optimistic updates
	async function onDropIntoFolder(e){
		e.preventDefault();
		e.stopPropagation(); // Prevent event bubbling
		e.currentTarget.style.background=''; // Remove drop indicator
		
		// Check if operation is already in progress
		if (isDragInProgress) {
			console.log('Drop ignored - operation in progress');
			return;
		}
		
		const folderId = e.currentTarget.dataset.folderId;
		if (!folderId) return;
		
		try{
			const data = JSON.parse(e.dataTransfer.getData('text/plain')||'{}');
			
			if (data.type === 'agente' && data.agente){
				// Move agent to folder
				await moveAgentTo(data.agente, folderId);
			}
			else if (data.type === 'folder' && data.folderId){ 
				// Move folder (existing logic)
				if (!(canEditEmpresa || !isEmpresa)) return; 
				await fetchJSON(`/api/carpetas/${encodeURIComponent(data.folderId)}/move`, { 
					method:'PUT', 
					body: JSON.stringify({ newParentId: folderId, expectedVersion: estructura.version }) 
				}); 
				await reload(); 
			}
		}catch(err){ 
			console.error('Drop failed:', err); 
			showToast('No se pudo completar la operación', 'error');
		}
	}

	async function onDropIntoRoot(e){
		e.preventDefault();
		e.stopPropagation(); // Prevent event bubbling
		
		// Check if operation is already in progress
		if (isDragInProgress) {
			console.log('Root drop ignored - operation in progress');
			return;
		}
		
		try{
			const data = JSON.parse(e.dataTransfer.getData('text/plain')||'{}');
			
			if (data.type === 'agente' && data.agente){
				// Move agent to General (root)
				await moveAgentTo(data.agente, null);
			}
			else if (data.type === 'folder' && data.folderId){
				// Move folder to root (existing logic)
				if (!(canEditEmpresa || !isEmpresa)) return;
				await fetchJSON(`/api/carpetas/${encodeURIComponent(data.folderId)}/move`, { 
					method:'PUT', 
					body: JSON.stringify({ newParentId: null, expectedVersion: estructura.version }) 
				});
				await reload();
			}
		}catch(err){ 
			console.error('Root drop failed:', err); 
			showToast('No se pudo completar la operación', 'error');
		}
	}

	// Move agent modal for menu option
	function showMoveAgentModal(agentName){
		const estructura_local = getEstructura();
		const folders = Object.values(estructura_local.folders || {});
		const currentAssignment = estructura_local.asignaciones[agentName] || null;
		
		let optionsHTML = '';
		
		// Add "General" option if not currently assigned there
		if (currentAssignment !== null) {
			optionsHTML += `<div class="move-option" data-dest="__root__" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid #f0f0f0;">General</div>`;
		}
		
		// Add folder options
		folders.forEach(folder => {
			if (String(folder.id) !== String(currentAssignment)) {
				optionsHTML += `<div class="move-option" data-dest="${folder.id}" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid #f0f0f0;">${folder.nombre}</div>`;
			}
		});
		
		if (!optionsHTML) {
			showToast('No hay carpetas disponibles para mover el agente');
			return;
		}
		
		const html = `
			<div style="padding:14px 16px; border-bottom:1px solid #f0f0f0;">
				<h3 style="margin:0; font-size:18px; color:#0b2431;">Mover agente: ${agentName}</h3>
			</div>
			<div style="max-height:300px; overflow-y:auto;">
				${optionsHTML}
			</div>`;
			
		const { overlay, close } = showModal(html);
		
		// Handle option clicks
		$all('.move-option', overlay).forEach(option => {
			option.addEventListener('click', async () => {
				const dest = option.dataset.dest;
				const targetFolderId = dest === '__root__' ? null : dest;
				
				close();
				await moveAgentTo(agentName, targetFolderId);
			});
			
			option.addEventListener('mouseenter', () => {
				option.style.background = '#f5f5f5';
			});
			
			option.addEventListener('mouseleave', () => {
				option.style.background = '';
			});
		});
	}

	// Delete agent with confirmation
	async function deleteAgent(agentName){
		showConfirmModal({
			title: 'Eliminar agente',
			message: `¿Estás seguro de que quieres eliminar el agente "${agentName}"? Esta acción no se puede deshacer.`,
			confirmText: 'Eliminar',
			onConfirm: async (close) => {
				close();
				try{
					// Remove from assignments first (optimistic)
					delete estructura.asignaciones[agentName];
					computeCounts();
					renderTree(document.getElementById('carpetas-tree'));
					await refreshAgentsGrid();
					
					// Remove from etiquetas_personalizadas
					const r = await fetchJSON('/api/get-user-data');
					const etiquetas = r?.etiquetas_personalizadas || {};
					if (!etiquetas[agentName]) {
						showToast('Agente no encontrado', 'error');
						return;
					}
					delete etiquetas[agentName];
					
					if (window.EtiquetasResolver && typeof window.EtiquetasResolver.updateEtiquetasPersonalizadas==='function'){
						const res = await window.EtiquetasResolver.updateEtiquetasPersonalizadas(etiquetas);
						if (!res.success){ 
							showToast('No se pudo eliminar agente', 'error'); 
							return; 
						}
					}else{
						await fetchJSON('/api/update-user-data', { 
							method:'POST', 
							body: JSON.stringify({ etiquetas_personalizadas: etiquetas }) 
						});
					}
					
					showToast('Agente eliminado');
				}catch(err){ 
					console.error(err); 
					showToast('No se pudo eliminar', 'error'); 
					// Reload to revert any optimistic changes
					await reload();
				}
			}
		});
	}

	// Folder management with modals instead of prompts
	async function onNuevaCarpeta(){
		showInputModal({
			title: 'Nueva Carpeta',
			message: 'Introduce el nombre para la nueva carpeta:',
			placeholder: 'Nombre de la carpeta',
			confirmText: 'Crear',
			onConfirm: async (nombre, closeModal) => {
				try{
					await fetchJSON('/api/carpetas', { 
						method:'POST', 
						body: JSON.stringify({ 
							nombre: nombre.trim(), 
							parentId: currentFolderId || null, 
							expectedVersion: estructura.version 
						}) 
					});
					closeModal();
					await reload();
					showToast('Carpeta creada correctamente', 'success');
				}catch(e){ 
					console.error(e); 
					closeModal();
					showToast('No se pudo crear la carpeta', 'error'); 
				}
			}
		});
	}

	async function onFolderAction(folder, action){
		if (action === 'rename'){
			showInputModal({
				title: 'Renombrar Carpeta',
				message: 'Introduce el nuevo nombre para la carpeta:',
				placeholder: 'Nuevo nombre',
				defaultValue: folder.nombre,
				confirmText: 'Renombrar',
				onConfirm: async (newName, closeModal) => {
					if (newName.trim() === folder.nombre) {
						closeModal();
						return;
					}
					
					try{
						await fetchJSON(`/api/carpetas/${encodeURIComponent(folder.id)}/rename`, { 
							method:'PUT', 
							body: JSON.stringify({ newName: newName.trim(), expectedVersion: estructura.version }) 
						});
						closeModal();
						await reload();
						showToast('Carpeta renombrada correctamente', 'success');
					}catch(err){ 
						console.error(err); 
						closeModal();
						showToast('No se pudo renombrar la carpeta', 'error'); 
					}
				}
			});
		}
		
		if (action === 'delete'){
			showConfirmModal({ 
				title:'Eliminar carpeta', 
				message:'¿Seguro que quieres eliminar esta carpeta? Debe estar vacía.', 
				confirmText:'Eliminar', 
				onConfirm: async (close)=>{
					close();
					try{
						await fetchJSON(`/api/carpetas/${encodeURIComponent(folder.id)}`, { 
							method:'DELETE', 
							body: JSON.stringify({ expectedVersion: estructura.version }) 
						});
						await reload();
					}catch(err){ 
						console.error(err); 
						showToast('No se pudo eliminar', 'error'); 
					}
				}
			});
		}
	}

	async function persistFavoritos(){
		try{
			const agentsOnly = Array.from(favoritos).filter(k=> !k.startsWith('folder:'));
			await fetchJSON('/api/agentes-seleccion-personalizada', { 
				method:'POST', 
				body: JSON.stringify({ seleccion: agentsOnly }) 
			});
			const folderFav = Array.from(favoritos).filter(k=> k.startsWith('folder:'));
			try { localStorage.setItem('papyrus_folder_fav', JSON.stringify(folderFav)); } catch(_){ }
			
			// After persisting, re-check folder favorites auto-marking
			autoMarkFolderFavorites();
		}catch(e){ console.error(e); }
	}

	async function reload(){ 
		await loadData(); 
		renderUI(); 
	}

	// Optimistic update for a single agent favorite
	function setAgentFavoriteOptimistic(agentName, isFavorite) {
		if (isFavorite) {
			favoritos.add(agentName);
		} else {
			favoritos.delete(agentName);
		}
	}

	// Public API
	function getEstructura(){
		return { 
			folders: estructura.folders, 
			asignaciones: estructura.asignaciones, 
			version: estructura.version 
		};
	}

	function getFavoritos(){
		return new Set(favoritos);
	}

	// Initialize and expose functions
	window.CarpetasAgentes = { 
		init: async function(){ 
			await loadContext(); 
			await loadData(); 
			try{ 
				const saved = JSON.parse(localStorage.getItem('papyrus_folder_fav')||'[]'); 
				if (Array.isArray(saved)) saved.forEach(k=> favoritos.add(k)); 
			}catch(_){ } 
			// Don't render UI immediately - wait for coordinated rendering
		},
		
		// Separate function to render UI when everything is ready
		renderUI: function() {
			renderUI();
		},
		
		moveAgentTo,
		showMoveAgentModal,
		deleteAgent,
		getEstructura,
		getFavoritos,
		getCurrentFolderId: function() { return currentFolderId; },
		reload,
		setAgentFavoriteOptimistic
	};
})();