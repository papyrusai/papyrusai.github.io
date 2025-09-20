// agendas_parlamentarias.js - Gestión de la vista de Agendas Parlamentarias

(function() {
	// Estado del módulo (namespace "agendas")
	let agendasData = [];
	let filteredAgendas = [];
	let currentPageAgendas = 1;
	const itemsPerPageAgendas = 25;
	let currentSortAgendas = { column: 'fechaHora', direction: 'asc' };
	const columnFiltersAgendas = {};
	let isLoadingAgendas = false;
	let refetchAgendasDebounce = null;
	let activeToastAgendas = null;
	let activeToastAgendasTimer = null;

	// Catálogo de Agendas disponibles (multi-select con dropdown estilo Reversa)
	const AGENDA_BASE = ['CONGRESO_AGENDA', 'SENADO_AGENDA'];

	function getMonday(date) {
		const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const day = d.getDay(); // 0=Dom..6=Sab
		const diff = (day === 0 ? -6 : 1) - day; // mover a lunes
		d.setDate(d.getDate() + diff);
		return new Date(d.getFullYear(), d.getMonth(), d.getDate());
	}

	async function initAgendaDropdown() {
		const box = document.getElementById('agenda-filter');
		const dd = document.getElementById('agenda-dropdown');
		const list = document.getElementById('agenda-list');
		const label = document.getElementById('agenda-selected-label');
		const btnAll = document.getElementById('agenda-select-all');
		const btnClear = document.getElementById('agenda-clear-all');
		if (!box || !dd || !list || !label || !btnAll || !btnClear) return;

		list.innerHTML = '';
		const defaultSelected = ['CONGRESO_AGENDA'];
		const seen = new Set();
		AGENDA_BASE.forEach((f) => {
			const key = String(f).trim().toUpperCase();
			if (seen.has(key)) return; seen.add(key);
			const item = document.createElement('div');
			const isSelected = defaultSelected.includes(f);
			item.className = 'item' + (isSelected ? ' selected' : '');
			item.dataset.value = f;
			item.innerHTML = `<input type="checkbox" ${isSelected ? 'checked' : ''}/> <span>${f}</span>`;
			const cb = item.querySelector('input');
			cb.addEventListener('change', () => { item.classList.toggle('selected', cb.checked); updateAgendaLabel(); });
			item.addEventListener('click', (e) => { if (e.target && (e.target.tagName === 'INPUT' || e.target.closest('input'))) return; cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); });
			list.appendChild(item);
		});

		const updateAgendaLabel = () => {
			const sel = Array.from(list.querySelectorAll('.item input:checked')).map(cb => cb.closest('.item').dataset.value);
			if (sel.length === 0) label.textContent = 'Ninguno seleccionado';
			else if (sel.length === 1) label.textContent = sel[0];
			else if (sel.length === AGENDA_BASE.length) label.textContent = 'Todos';
			else label.textContent = `Seleccionados (${sel.length})`;
			updateFilterIconStatesAgendas();
		};
		btnAll.onclick = () => { list.querySelectorAll('.item').forEach(it => { it.classList.add('selected'); it.querySelector('input').checked = true; }); updateAgendaLabel(); };
		btnClear.onclick = () => { list.querySelectorAll('.item').forEach(it => { it.classList.remove('selected'); it.querySelector('input').checked = false; }); updateAgendaLabel(); };

		let isToggling = false;
		box.addEventListener('click', (e) => {
			e.preventDefault(); e.stopPropagation();
			if (isToggling) return;
			isToggling = true;
			const wasOpen = dd.classList.contains('show');
			// Cerrar otros dropdowns (mismo patrón que legales)
			document.querySelectorAll('.fuente-dropdown').forEach(el => { el.classList.remove('show'); el.style.display = 'none'; });
			setTimeout(() => {
				if (!wasOpen) {
					dd.classList.add('show');
					dd.style.display = 'block';
					const rect = box.getBoundingClientRect();
					dd.style.position = 'absolute';
					dd.style.top = (rect.bottom + window.scrollY + 6) + 'px';
					dd.style.left = (rect.left + window.scrollX) + 'px';
					dd.style.minWidth = Math.max(rect.width, 260) + 'px';
					dd.style.zIndex = '10000';
				} else {
					dd.classList.remove('show');
					dd.style.display = 'none';
				}
				isToggling = false;
			}, 10);
		});
		dd.addEventListener('click', (e) => e.stopPropagation());
		setTimeout(() => {
			document.addEventListener('click', (e) => {
				if (!box.contains(e.target) && !dd.contains(e.target)) {
					dd.classList.remove('show');
					dd.style.display = 'none';
				}
			});
		}, 100);
		updateAgendaLabel();
	}

	function getSelectedAgendas() {
		const list = document.getElementById('agenda-list');
		if (!list) return ['CONGRESO_AGENDA'];
		const sel = Array.from(list.querySelectorAll('.item input:checked')).map(cb => cb.closest('.item').dataset.value);
		const uniqueSel = [...new Set(sel)];
		return uniqueSel.length ? uniqueSel : ['CONGRESO_AGENDA'];
	}

	async function fetchAgendas() {
		try {
			const agendas = getSelectedAgendas();
			const url = new URL('/api/agendas-parlamentarias', window.location.origin);
			url.searchParams.set('agendas', JSON.stringify(agendas));
			console.log('📡 URL de fetch (agendas):', url.toString());
			const desde = document.getElementById('fecha-desde-agendas')?.value || '';
			const hasta = document.getElementById('fecha-hasta-agendas')?.value || '';
			if (desde) url.searchParams.set('desde_insert', desde);
			if (hasta) url.searchParams.set('hasta_insert', hasta);
			console.log('📅 Filtros agendas -> desde:', desde, 'hasta:', hasta, 'agendas:', agendas);
			const resp = await fetch(url.toString(), { credentials: 'include' });
			if (!resp.ok) throw new Error(`Error ${resp.status}`);
			const data = await resp.json();
			const arr = Array.isArray(data?.agendas) ? data.agendas : [];
			console.log('📋 Datos agendas recibidos:', arr.length);
			return arr.map(mapForDisplayAgendas);
		} catch (err) {
			console.error('❌ Error en fetchAgendas:', err);
			showToastAgendas('No se pudieron cargar las agendas: ' + err.message, 'error');
			return [];
		}
	}

	function mapForDisplayAgendas(item) {
		const displayFuente = item.fuenteDisplay || (String(item.fuente || '').toUpperCase() === 'SENADO_AGENDA' ? 'Senado Agenda' : 'Congreso Agenda');
		return {
			fuente: item.fuente || '',
			fuenteDisplay: displayFuente,
			fechaHora: item.fechaHora || '',
			concepto: item.concepto || '',
			temas: item.temas || '',
			link: item.link || '#',
			doc_id: item.doc_id || ''
		};
	}

	function parseFechaHora(str) {
		// esperado: YYYY-MM-DD HH:mm
		if (typeof str !== 'string') return new Date(0);
		const m = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
		if (m) {
			const y = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1, d = parseInt(m[3], 10), hh = parseInt(m[4], 10), mm = parseInt(m[5], 10);
			const dt = new Date(y, mo, d, hh, mm);
			return isNaN(dt.getTime()) ? new Date(0) : dt;
		}
		const dt = new Date(str);
		return isNaN(dt.getTime()) ? new Date(0) : dt;
	}

	async function initAgendas() {
		console.log('🚀 Inicializando Agendas Parlamentarias');
		await initAgendaDropdown();
		// Reubicar la vista si quedó anidada dentro de #vista-boletin-diario por error
		const vista = document.getElementById('vista-agendas');
		const vistaBoletin = document.getElementById('vista-boletin-diario');
		if (vista && vistaBoletin && vistaBoletin.contains(vista)) {
			try {
				vistaBoletin.parentNode.insertBefore(vista, vistaBoletin.nextSibling);
				console.log('🔧 Vista agendas movida fuera de #vista-boletin-diario');
			} catch (e) { console.warn('No se pudo reubicar vista-agendas:', e); }
		}
		// Forzar visibilidad de la vista de agendas
		if (vista) {
			vista.style.display = 'block';
			vista.style.visibility = 'visible';
			vista.style.opacity = '1';
			console.log('👁️ Vista agendas forzada a visible');
		} else {
			console.error('❌ #vista-agendas no encontrado');
		}
		
		// Verificar que la tabla existe
		const tabla = document.getElementById('tabla-agendas');
		const tbody = document.getElementById('tbody-agendas');
		console.log('🔍 Elementos encontrados:', {
			vista: !!vista,
			tabla: !!tabla,
			tbody: !!tbody
		});
		// Pre-set Monday-of-week on fecha-desde-agendas si está vacío
		const fechaDesde = document.getElementById('fecha-desde-agendas');
		if (fechaDesde && !fechaDesde.value) {
			const mon = getMonday(new Date());
			const yyyy = mon.getFullYear();
			const mm = String(mon.getMonth() + 1).padStart(2, '0');
			const dd = String(mon.getDate()).padStart(2, '0');
			fechaDesde.value = `${yyyy}-${mm}-${dd}`;
		}

		showSkeletonRowsAgendas();
		isLoadingAgendas = true;
		agendasData = await fetchAgendas();
		isLoadingAgendas = false;

		filteredAgendas = [...agendasData];
		setupEventListenersAgendas();
		setupHeaderFiltersAgendas();
		applyAllFiltersAgendas();
		updateFilterIconStatesAgendas();
		renderTableAgendas();
	}

	function sortDataAgendas() {
		if (!currentSortAgendas.column) return;
		filteredAgendas.sort((a, b) => {
			let aVal = a[currentSortAgendas.column];
			let bVal = b[currentSortAgendas.column];
			if (currentSortAgendas.column === 'fechaHora') {
				aVal = parseFechaHora(aVal); bVal = parseFechaHora(bVal);
			}
			if (aVal < bVal) return currentSortAgendas.direction === 'asc' ? -1 : 1;
			if (aVal > bVal) return currentSortAgendas.direction === 'asc' ? 1 : -1;
			return 0;
		});
	}

	function setupEventListenersAgendas() {
		const fechaDesde = document.getElementById('fecha-desde-agendas');
		const fechaHasta = document.getElementById('fecha-hasta-agendas');
		const clearBtn = document.getElementById('clear-dates-agendas');
		if (clearBtn) clearBtn.addEventListener('click', () => { if (fechaDesde) fechaDesde.value = ''; if (fechaHasta) fechaHasta.value = ''; scheduleRefetchDataAgendas(); });
		if (fechaDesde) fechaDesde.addEventListener('change', scheduleRefetchDataAgendas);
		if (fechaHasta) fechaHasta.addEventListener('change', scheduleRefetchDataAgendas);

		document.querySelectorAll('#tabla-agendas thead th.sortable').forEach(th => {
			th.addEventListener('click', (ev) => { ev.stopPropagation(); const col = th.getAttribute('data-column'); openFilterDropdownAgendas(col, th); });
		});

		const prevBtn = document.getElementById('prev-page-agendas');
		const nextBtn = document.getElementById('next-page-agendas');
		if (prevBtn) prevBtn.addEventListener('click', () => changePageAgendas(-1));
		if (nextBtn) nextBtn.addEventListener('click', () => changePageAgendas(1));

		const exportBtn = document.getElementById('export-excel-agendas');
		if (exportBtn) exportBtn.addEventListener('click', openExportModalAgendas);

		const buscarBtn = document.getElementById('buscar-agendas');
		if (buscarBtn) buscarBtn.addEventListener('click', () => { refetchDataAgendas(); });
	}

	async function refetchDataAgendas() {
		if (isLoadingAgendas) return;
		showSkeletonRowsAgendas();
		isLoadingAgendas = true;
		try {
			agendasData = await fetchAgendas();
			isLoadingAgendas = false;
			applyAllFiltersAgendas();
			updateFilterIconStatesAgendas();
			renderTableAgendas();
			if (!agendasData || agendasData.length === 0) {
				const di = document.getElementById('fecha-desde-agendas');
				const val = di && di.value ? di.value : '';
				showToastAgendas(`Sin resultados con el criterio seleccionado "${val || '—'}"`, 'info');
			}
		} catch (err) {
			console.error('❌ Error en refetch agendas:', err);
			showToastAgendas('Error al cargar datos: ' + err.message, 'error');
			isLoadingAgendas = false;
		}
	}

	function scheduleRefetchDataAgendas() {
		if (refetchAgendasDebounce) clearTimeout(refetchAgendasDebounce);
		refetchAgendasDebounce = setTimeout(() => { refetchDataAgendas(); }, 500);
	}

	function applyAllFiltersAgendas() {
		filteredAgendas = agendasData.filter(item => {
			let matchesColumnFilters = true;
			for (const [col, values] of Object.entries(columnFiltersAgendas)) {
				if (Array.isArray(values) && values.length > 0) {
					let target = item[col];
					if (col === 'link') target = String(item.doc_id || '').trim();
					if (!Array.isArray(target)) target = [String(target ?? '')];
					const hasAny = target.some(v => values.includes(String(v)));
					if (!hasAny) { matchesColumnFilters = false; break; }
				}
			}
			return matchesColumnFilters;
		});
		currentPageAgendas = 1;
		sortDataAgendas();
		renderTableAgendas();
	}

	function changePageAgendas(direction) {
		const totalPages = Math.ceil(filteredAgendas.length / itemsPerPageAgendas);
		const newPage = currentPageAgendas + direction;
		if (newPage >= 1 && newPage <= totalPages) { currentPageAgendas = newPage; renderTableAgendas(); }
	}

	function renderTableAgendas() {
		const tbody = document.getElementById('tbody-agendas');
		if (!tbody) { console.warn('❌ tbody-agendas no encontrado'); return; }
		const totalPages = Math.ceil(filteredAgendas.length / itemsPerPageAgendas);
		const start = (currentPageAgendas - 1) * itemsPerPageAgendas;
		const end = Math.min(start + itemsPerPageAgendas, filteredAgendas.length);
		const pageData = filteredAgendas.slice(start, end);

		tbody.innerHTML = '';
		console.log('🧮 Render agendas -> pageData:', pageData.length, 'total:', filteredAgendas.length);
		if (pageData.length === 0) {
			const tr = document.createElement('tr');
			const td = document.createElement('td');
			td.colSpan = 5;
			td.style.color = '#6c757d';
			td.style.padding = '16px';
			td.textContent = 'No hay registros para los filtros seleccionados';
			tr.appendChild(td);
			tbody.appendChild(tr);
			updatePaginationInfoAgendas(0, 0, 0, 1, 1);
			return;
		}
		pageData.forEach(item => {
			const row = document.createElement('tr');
			row.innerHTML = `
				<td>${item.fuenteDisplay}</td>
				<td>${item.fechaHora}</td>
				<td class="tema-cell" title="${String(item.concepto || '').replace(/\"/g, '&quot;')}">${item.concepto}</td>
				<td class="tema-cell" title="${String(item.temas || '').replace(/\"/g, '&quot;')}">${item.temas}</td>
				<td>
					<a href="${item.link}" target="_blank" class="link-btn">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
							<polyline points="15 3 21 3 21 9"></polyline>
							<line x1="10" y1="14" x2="21" y2="3"></line>
						</svg>
						<span style="margin-left:6px; font-weight:600; color:#04db8d;">${item.doc_id || ''}</span>
					</a>
				</td>
			`;
			tbody.appendChild(row);
		});
		console.log('✅ Filas agendas en tbody:', tbody.children.length);

		setupTooltipsAgendas();
		updatePaginationInfoAgendas(start + 1, end, filteredAgendas.length, currentPageAgendas, totalPages);
	}

	function showSkeletonRowsAgendas() {
		const tbody = document.getElementById('tbody-agendas');
		if (!tbody) return;
		tbody.innerHTML = '';
		for (let i = 0; i < 25; i++) {
			const tr = document.createElement('tr');
			tr.className = 'skeleton-row';
			tr.innerHTML = `
				<td><span class="skeleton w-40 small"></span></td>
				<td><span class="skeleton w-40 small"></span></td>
				<td><span class="skeleton w-60 small"></span></td>
				<td><span class="skeleton w-80"></span></td>
				<td><span class="skeleton w-30 small"></span></td>
			`;
			tbody.appendChild(tr);
		}
	}

	function setupHeaderFiltersAgendas() {
		const theadCells = document.querySelectorAll('#tabla-agendas thead th.sortable');
		theadCells.forEach(th => {
			if (th.querySelector('.filter-trigger')) return;
			const col = th.getAttribute('data-column');
			const trigger = document.createElement('span');
			trigger.className = 'filter-trigger';
			trigger.innerHTML = `
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="4" y1="6" x2="20" y2="6"></line>
					<line x1="7" y1="12" x2="17" y2="12"></line>
					<line x1="10" y1="18" x2="14" y2="18"></line>
				</svg>
			`;
			trigger.addEventListener('click', (ev) => { ev.stopPropagation(); openFilterDropdownAgendas(col, th); });
			th.appendChild(trigger);
		});
		updateFilterIconStatesAgendas();
		document.addEventListener('click', () => closeFilterDropdownAgendas());
	}

	function updateFilterIconStatesAgendas() {
		document.querySelectorAll('#tabla-agendas thead th.sortable').forEach(th => {
			const col = th.getAttribute('data-column');
			const icon = th.querySelector('.filter-trigger');
			if (!icon) return;
			const hasFilter = Array.isArray(columnFiltersAgendas[col]) && columnFiltersAgendas[col].length > 0;
			const isSorted = currentSortAgendas.column === col;
			icon.style.color = (hasFilter || isSorted) ? '#04db8d' : '#6c757d';
		});
	}

	let currentDropdownAgendas = null;
	let currentDropdownColumnAgendas = null;
	function closeFilterDropdownAgendas() {
		if (currentDropdownAgendas && currentDropdownAgendas.parentNode) { currentDropdownAgendas.parentNode.removeChild(currentDropdownAgendas); }
		currentDropdownAgendas = null; currentDropdownColumnAgendas = null;
	}

	function openFilterDropdownAgendas(column, thEl) {
		if (currentDropdownAgendas && currentDropdownColumnAgendas === column) { closeFilterDropdownAgendas(); return; }
		closeFilterDropdownAgendas();
		const dropdown = document.createElement('div');
		currentDropdownColumnAgendas = column;
		dropdown.className = 'column-filter-dropdown';
		dropdown.addEventListener('click', (e) => e.stopPropagation());

		const collectValues = (row, col) => {
			let v = row[col];
			if (col === 'link') return [String(row.doc_id || '').trim()];
			return [String(v ?? '')];
		};
		const uniqueValues = Array.from(new Set(agendasData.flatMap(r => collectValues(r, column)))).filter(v => v !== '').sort((a, b) => a.localeCompare(b));

		const titleMap = { fuenteDisplay: 'Fuente', fechaHora: 'Fecha Hora', concepto: 'Concepto', temas: 'Temas a tratar', link: 'Link (ID documento)' };
		const selected = columnFiltersAgendas[column] ? new Set(columnFiltersAgendas[column]) : new Set();

		dropdown.innerHTML = `
			<div class="header">
				<div class="title">${titleMap[column] || column}</div>
				<div class="actions">
					<button class="btn" data-sort-toggle="${currentSortAgendas.column === column ? currentSortAgendas.direction : 'asc'}" title="Ordenar A-Z/Z-A">
						<svg class="sort-az-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform .15s ease; vertical-align: middle;">
							<polyline points="10 16 10 8"></polyline>
							<polyline points="8 10 10 8 12 10"></polyline>
							<line x1="14" y1="9" x2="20" y2="9"></line>
							<line x1="14" y1="12" x2="20" y2="12"></line>
							<line x1="14" y1="15" x2="20" y2="15"></line>
						</svg>
					</button>
					<button class="btn" data-clear>Limpiar</button>
				</div>
			</div>
			<input class="search" type="text" placeholder="Buscar valor" />
			<div class="select-all-row"><label class="item"><input type="checkbox" class="select-all-cb"/> <span class="val">Seleccionar todo</span></label></div>
			<div class="list"></div>
		`;

		const list = dropdown.querySelector('.list');
		const searchEl = dropdown.querySelector('.search');
		const clearBtn = dropdown.querySelector('[data-clear]');
		const sortToggleBtn = dropdown.querySelector('[data-sort-toggle]');
		const selectAllCb = dropdown.querySelector('.select-all-cb');
		let lastVisibleValues = [];

		const updateSortToggleVisual = () => { const dir = sortToggleBtn.getAttribute('data-sort-toggle'); const icon = sortToggleBtn.querySelector('.sort-az-icon'); icon.style.transform = (dir === 'desc') ? 'rotate(180deg)' : 'rotate(0deg)'; };
		updateSortToggleVisual();
		const updateSelectAllChecked = () => { if (!selectAllCb) return; if (lastVisibleValues.length === 0) { selectAllCb.checked = false; return; } selectAllCb.checked = lastVisibleValues.every(v => selected.has(v)); };

		const renderList = (filterText = '') => {
			list.innerHTML = '';
			const lower = filterText.toLowerCase();
			lastVisibleValues = uniqueValues.filter(v => !lower || v.toLowerCase().includes(lower));
			lastVisibleValues.forEach(v => {
				const item = document.createElement('label');
				item.className = 'item';
				const id = `flt_ag_${column}_${v.replace(/[^a-z0-9]/gi, '')}`;
			item.innerHTML = `<input type="checkbox" id="${id}" ${selected.has(v) ? 'checked' : ''}/> <span class="val">${v}</span>`;
			item.innerHTML = `<input type="checkbox" id="${id}" ${selected.has(v) ? 'checked' : ''}/> <span class="val">${v}</span>`;
			item.innerHTML = `<input type="checkbox" id="${id}" ${selected.has(v) ? 'checked' : ''}/> <span class="val">${v}</span>`;
				const span = item.querySelector('.val');
				span.style.display = 'inline-block'; span.style.maxWidth = '180px'; span.style.whiteSpace = 'nowrap'; span.style.overflow = 'hidden'; span.style.textOverflow = 'ellipsis';
				const cb = item.querySelector('input'); cb.style.accentColor = '#0b2431';
				cb.addEventListener('change', (ev) => { if (ev.target.checked) selected.add(v); else selected.delete(v); if (selected.size > 0) columnFiltersAgendas[column] = Array.from(selected); else delete columnFiltersAgendas[column]; applyAllFiltersAgendas(); updateFilterIconStatesAgendas(); setClearState(); updateSelectAllChecked(); });
				list.appendChild(item);
			});
			updateSelectAllChecked();
		};
		renderList();

		searchEl.addEventListener('input', (e) => { renderList(e.target.value || ''); });

		function setClearState() {
			const hasFilter = Array.isArray(columnFiltersAgendas[column]) && columnFiltersAgendas[column].length > 0;
			const isSorted = currentSortAgendas.column === column;
			const enabled = hasFilter || isSorted;
			clearBtn.style.opacity = enabled ? '1' : '.5';
			clearBtn.style.pointerEvents = enabled ? 'auto' : 'none';
		}
		setClearState();

		sortToggleBtn.addEventListener('click', () => {
			const currentDir = sortToggleBtn.getAttribute('data-sort-toggle');
			const nextDir = currentDir === 'asc' ? 'desc' : 'asc';
			sortToggleBtn.setAttribute('data-sort-toggle', nextDir);
			currentSortAgendas = { column, direction: nextDir };
			updateSortToggleVisual();
			sortDataAgendas();
			renderTableAgendas();
			updateFilterIconStatesAgendas();
			setClearState();
		});

		if (selectAllCb) {
			selectAllCb.addEventListener('change', (e) => {
				const filterText = searchEl.value || '';
				if (e.target.checked) lastVisibleValues.forEach(v => selected.add(v)); else lastVisibleValues.forEach(v => selected.delete(v));
				if (selected.size > 0) columnFiltersAgendas[column] = Array.from(selected); else delete columnFiltersAgendas[column];
				renderList(filterText);
				applyAllFiltersAgendas();
				updateFilterIconStatesAgendas();
				setClearState();
			});
		}

		clearBtn.addEventListener('click', () => {
			delete columnFiltersAgendas[column];
			if (currentSortAgendas.column === column) currentSortAgendas = { column: 'fechaHora', direction: 'asc' };
			selected.clear();
			applyAllFiltersAgendas();
			sortDataAgendas();
			renderTableAgendas();
			updateFilterIconStatesAgendas();
			setClearState();
			updateSelectAllChecked();
		});

		const rect = thEl.getBoundingClientRect();
		dropdown.style.top = (rect.bottom + window.scrollY + 6) + 'px';
		dropdown.style.left = (rect.left + window.scrollX) + 'px';
		document.body.appendChild(dropdown);
		currentDropdownAgendas = dropdown;
	}

	function updatePaginationInfoAgendas(start, end, total, page, totalPages) {
		const s = document.getElementById('showing-start-agendas');
		const e = document.getElementById('showing-end-agendas');
		const t = document.getElementById('total-records-agendas');
		const p = document.getElementById('current-page-agendas');
		const tp = document.getElementById('total-pages-agendas');
		if (s) s.textContent = total > 0 ? start : 0;
		if (e) e.textContent = end;
		if (t) t.textContent = total;
		if (p) p.textContent = page;
		if (tp) tp.textContent = totalPages || 1;
		const prev = document.getElementById('prev-page-agendas');
		const next = document.getElementById('next-page-agendas');
		if (prev) prev.disabled = page === 1;
		if (next) next.disabled = page === totalPages || totalPages === 0;
	}

	function exportToExcelWithDataAgendas(data) {
		try {
			const rows = data.map(item => ({
				Fuente: item.fuenteDisplay,
				'Fecha Hora': item.fechaHora,
				Concepto: item.concepto,
				'Temas a tratar': item.temas,
				Link: item.link
			}));
			const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
			const wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, 'Agendas');
			XLSX.writeFile(wb, `agendas_parlamentarias_${new Date().toISOString().split('T')[0]}.xlsx`, { compression: true });
			showToastAgendas('Archivo XLSX exportado correctamente', 'success');
		} catch (e) {
			console.error('Error exportando XLSX agendas:', e);
			showToastAgendas('Error exportando XLSX', 'error');
		}
	}

	function ensureExportModalStylesAgendas() {
		if (document.getElementById('export-modal-styles-agendas')) return;
		const style = document.createElement('style');
		style.id = 'export-modal-styles-agendas';
		style.textContent = `
			.modal-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,.45); display:flex; justify-content:center; align-items:center; z-index:10000; opacity:0; visibility:hidden; transition: all .3s ease; }
			.modal-overlay.show { opacity:1; visibility:visible; }
			.modal-content { background:white; padding:24px; border-radius:12px; box-shadow:0 8px 32px rgba(11,36,49,.16); width:90%; max-width:560px; text-align:left; }
			.modal-title { margin:0 0 8px 0; font-size:18px; font-weight:600; color:#0b2431; text-align:left; }
			.modal-text { color:#455862; font-size:14px; margin-bottom:12px; text-align:left; }
			.modal-buttons { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }
			.btn { padding:8px 12px; border-radius:8px; border:1px solid #e9ecef; background:white; cursor:pointer; }
			.btn-primary { background:#0b2431; border-color:#0b2431; color:#fff; }
			.filters-grid { display:grid; gap:10px; }
			.filter-row { display:grid; grid-template-columns: 1fr 1fr auto; gap:8px; align-items:center; }
			.input, .select { border:1px solid #e9ecef; border-radius:8px; padding:8px 10px; font-size:13px; }
			.small-note { font-size:12px; color:#6c757d; }
		`;
		document.head.appendChild(style);
	}

	function openExportModalAgendas() {
		ensureExportModalStylesAgendas();
		let modal = document.getElementById('exportModalAgendas');
		if (!modal) {
			modal = document.createElement('div');
			modal.id = 'exportModalAgendas';
			modal.className = 'modal-overlay';
			modal.innerHTML = `
				<div class="modal-content">
					<h3 class="modal-title">Exportar Excel</h3>
					<div class="modal-text">Aplica filtros antes de exportar. Por defecto, puedes acotar por fecha.</div>
					<div class="filters-grid">
						<div>
							<label class="small">Fecha desde</label>
							<input id="exportStartDateAgendas" type="date" class="input" />
						</div>
						<div>
							<label class="small">Fecha hasta</label>
							<input id="exportEndDateAgendas" type="date" class="input" />
						</div>
					</div>
					<div style="margin-top:12px; font-weight:600; color:#0b2431;">Filtros adicionales</div>
					<div id="exportFiltersAgendas" class="filters-grid" style="margin-top:8px;"></div>
					<div><button id="addExportFilterAgendas" class="btn" style="margin-top:8px;">Añadir filtro</button></div>
					<div class="modal-buttons">
						<button class="btn" id="cancelExportAgendas">Cancelar</button>
						<button class="btn btn-primary" id="confirmExportAgendas">Exportar</button>
					</div>
				</div>
			`;
			document.body.appendChild(modal);
		}

		const filtersContainer = modal.querySelector('#exportFiltersAgendas');
		const addBtn = modal.querySelector('#addExportFilterAgendas');
		filtersContainer.innerHTML = '';

		const addFilterRow = () => {
			const row = document.createElement('div');
			row.className = 'filter-row';
			row.innerHTML = `
				<select class="select export-col">
					<option value="fuenteDisplay">Fuente</option>
					<option value="fechaHora">Fecha Hora</option>
					<option value="concepto">Concepto</option>
					<option value="temas">Temas a tratar</option>
				</select>
				<input type="text" class="input export-val" placeholder="Valor contiene..." />
				<button class="btn remove">Eliminar</button>
			`;
			row.querySelector('.remove').addEventListener('click', () => { filtersContainer.removeChild(row); });
			filtersContainer.appendChild(row);
		};

		addBtn.onclick = addFilterRow;
		addFilterRow();

		modal.classList.add('show');
		document.body.style.overflow = 'hidden';

		modal.addEventListener('click', (e) => { if (e.target === modal) closeExportModalAgendas(); });
		modal.querySelector('#cancelExportAgendas').onclick = () => closeExportModalAgendas();
		modal.querySelector('#confirmExportAgendas').onclick = () => {
			const startVal = modal.querySelector('#exportStartDateAgendas').value;
			const endVal = modal.querySelector('#exportEndDateAgendas').value;
			const rows = Array.from(filtersContainer.querySelectorAll('.filter-row'));
			let data = [...agendasData];

			// Filtrar por fecha desde/hasta (parseando YYYY-MM-DD HH:mm)
			if (startVal) {
				data = data.filter(item => {
					const dt = parseFechaHora(item.fechaHora);
					const f = new Date(startVal);
					const start = new Date(f.getFullYear(), f.getMonth(), f.getDate());
					const dtn = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
					return dtn >= start;
				});
			}
			if (endVal) {
				data = data.filter(item => {
					const dt = parseFechaHora(item.fechaHora);
					const f = new Date(endVal);
					const end = new Date(f.getFullYear(), f.getMonth(), f.getDate());
					const dtn = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
					return dtn <= end;
				});
			}

			rows.forEach(r => {
				const col = r.querySelector('.export-col').value;
				const val = (r.querySelector('.export-val').value || '').toLowerCase();
				if (!val) return;
				data = data.filter(item => String(item[col] ?? '').toLowerCase().includes(val));
			});

			exportToExcelWithDataAgendas(data);
			closeExportModalAgendas();
		};
	}

	function closeExportModalAgendas() {
		const modal = document.getElementById('exportModalAgendas');
		if (!modal) return;
		modal.classList.remove('show');
		document.body.style.overflow = '';
	}

	function showToastAgendas(message, type = 'info') {
		if (activeToastAgendasTimer) { clearTimeout(activeToastAgendasTimer); activeToastAgendasTimer = null; }
		if (activeToastAgendas && activeToastAgendas.parentNode) { activeToastAgendas.parentNode.removeChild(activeToastAgendas); activeToastAgendas = null; }
		const toast = document.createElement('div');
		toast.className = `toast-message ${type}`;
		toast.textContent = message;
		toast.style.cssText = `position: fixed; top: 20px; right: 20px; background: ${type === 'success' ? '#04db8d' : '#455862'}; color: white; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000; animation: slideIn 0.3s ease;`;
		document.body.appendChild(toast);
		activeToastAgendas = toast;
		activeToastAgendasTimer = setTimeout(() => { if (activeToastAgendas) { activeToastAgendas.style.animation = 'slideOut 0.3s ease'; setTimeout(() => { if (activeToastAgendas && activeToastAgendas.parentNode) { activeToastAgendas.parentNode.removeChild(activeToastAgendas); } activeToastAgendas = null; activeToastAgendasTimer = null; }, 300); } }, 3000);
	}

	function setupTooltipsAgendas() { /* no-op */ }

	if (!document.getElementById('iniciativas-animations')) {
		const style = document.createElement('style');
		style.id = 'iniciativas-animations';
		style.textContent = `@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }`;
		document.head.appendChild(style);
	}

	// Exponer API mínima
	window.agendasModule = { init: initAgendas, refresh: renderTableAgendas };
})();

