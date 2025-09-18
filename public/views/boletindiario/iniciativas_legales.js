// iniciativas_legales.js - Gestión de la vista de Iniciativas Legales (dummy data por ahora)

(function() {
    // Estado del módulo (namespace "legales")
    let iniciativasLegalesData = [];
    let filteredLegales = [];
    let currentPageLegales = 1;
    const itemsPerPageLegales = 25;
    let currentSortLegales = { column: 'fecha', direction: 'desc' };
    const columnFiltersLegales = {};
    let isLoadingLegales = false;
    let refetchLegalesDebounce = null;
    let activeToastLegales = null;
    let activeToastLegalesTimer = null;

    // Fuentes catálogo y dropdown helpers (cargadas dinámicamente; fallback a base legal)
    const LEGAL_BASE_RAW = [
        'BOE','DOUE','BOA','BOCA','BOC','BOCM','BOCYL','BOIB','BON','BOPA','BOR','BORM','BOJA','BOPV','DOCM','DOG','DOGC','DOGV','DOE','BOCCE','BOME','BOPA_andorra'
    ];
    // Asegurar que no hay duplicados en la base
    const LEGAL_BASE = [...new Set(LEGAL_BASE_RAW)];
    let FUENTES_ALL = LEGAL_BASE.slice();

    async function fetchAvailableFuentes() {
        try {
            const resp = await fetch('/api/available-collections', { credentials: 'include' });
            if (!resp.ok) throw new Error('bad status');
            const data = await resp.json();
            const list = Array.isArray(data?.collections) ? data.collections.map(String) : [];
            // Filtrar a los boletines legales soportados para esta vista
            const legalSet = new Set(LEGAL_BASE.map(s => s.toLowerCase()));
            const filtered = list.filter(n => legalSet.has(String(n).toLowerCase()));
            
            // Eliminar duplicados con normalización estricta (trim + uppercase)
            const uniqueFiltered = [...new Set(filtered.map(n => String(n).trim().toUpperCase()))];
            console.log('🔍 Fuentes del servidor:', list.length);
            console.log('✅ Fuentes filtradas:', uniqueFiltered);
            
            return uniqueFiltered.length ? uniqueFiltered : [...new Set(LEGAL_BASE)];
        } catch (error) {
            console.warn('⚠️ Error obteniendo fuentes del servidor:', error.message);
            return [...new Set(LEGAL_BASE)];
        }
    }

    async function initFuenteDropdown() {
        console.log('🔧 Inicializando dropdown de fuentes...');
        const box = document.getElementById('fuente-filter');
        const dd = document.getElementById('fuente-dropdown');
        const list = document.getElementById('fuente-list');
        const label = document.getElementById('fuente-selected-label');
        const btnAll = document.getElementById('fuente-select-all');
        const btnClear = document.getElementById('fuente-clear-all');
        
        console.log('📋 Elementos encontrados:', {
            box: !!box,
            dropdown: !!dd,
            list: !!list,
            label: !!label,
            btnAll: !!btnAll,
            btnClear: !!btnClear
        });
        
        if (!box || !dd || !list || !label || !btnAll || !btnClear) {
            console.error('❌ Elementos del dropdown de fuentes no encontrados');
            return;
        }
        
        list.innerHTML = '';
        FUENTES_ALL = await fetchAvailableFuentes();
        
        // Normalizar y eliminar duplicados (trim + uppercase)
        FUENTES_ALL = [...new Set(FUENTES_ALL.map(v => String(v).trim().toUpperCase()))];
        console.log('📚 Fuentes disponibles (sin duplicados):', FUENTES_ALL);
        
        // Por defecto, seleccionar solo BOE (sin duplicados)
        const defaultSelected = ['BOE'];
        
        const seen = new Set();
        FUENTES_ALL.forEach((f, index) => {
            const key = String(f).trim().toUpperCase();
            if (seen.has(key)) { return; }
            seen.add(key);
            console.log(`📝 Creando item ${index + 1}: ${f}`);
            const item = document.createElement('div');
            const isSelected = defaultSelected.includes(f);
            item.className = 'item' + (isSelected ? ' selected' : '');
            item.dataset.value = f;
            item.innerHTML = `<input type="checkbox" ${isSelected ? 'checked' : ''}/> <span>${f}</span>`;
                const cb = item.querySelector('input');
            cb.addEventListener('change', () => {
                item.classList.toggle('selected', cb.checked);
                updateFuenteLabel();
                console.log('✅ Fuente cambiada:', f, 'checked:', cb.checked);
            });
            item.addEventListener('click', (e) => {
                if (e.target && (e.target.tagName === 'INPUT' || e.target.closest('input'))) return;
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change'));
            });
            list.appendChild(item);
        });
        // Re-verificar y depurar DOM por si hay duplicados residuales
        const seenDom = new Set();
        Array.from(list.children).forEach(child => {
            const v = String(child.dataset.value || '').trim().toUpperCase();
            if (seenDom.has(v)) {
                child.remove();
            } else {
                seenDom.add(v);
            }
        });
        console.log('🎯 Items de dropdown final:', list.children.length, 'valores:', Array.from(seenDom));
        
        const updateFuenteLabel = () => {
            const sel = Array.from(list.querySelectorAll('.item input:checked')).map(cb => cb.closest('.item').dataset.value);
            if (sel.length === 0) {
                label.textContent = 'Ninguno seleccionado';
            } else if (sel.length === 1) {
                label.textContent = sel[0];
            } else if (sel.length === FUENTES_ALL.length) {
                label.textContent = 'Todos';
            } else {
                // Mostrar "Seleccionados (n)" para múltiples selecciones
                label.textContent = `Seleccionados (${sel.length})`;
            }
            
            // Solo actualizar estado visual, no refrescar datos automáticamente
            updateFilterIconStatesLegales();
        };
        btnAll.addEventListener('click', () => {
            list.querySelectorAll('.item').forEach(it => { it.classList.add('selected'); it.querySelector('input').checked = true; });
            updateFuenteLabel();
        });
        btnClear.addEventListener('click', () => {
            list.querySelectorAll('.item').forEach(it => { it.classList.remove('selected'); it.querySelector('input').checked = false; });
            updateFuenteLabel();
        });
        // Abrir dropdown al click en el box
        let isToggling = false;
        box.addEventListener('click', (e) => {
            console.log('🖱️ Click en fuente-filter detectado');
            e.preventDefault();
            e.stopPropagation();
            
            if (isToggling) {
                console.log('⏸️ Toggle ya en progreso, ignorando click');
                return;
            }
            
            isToggling = true;
            
            const wasOpen = dd.classList.contains('show');
            console.log('📋 Estado del dropdown antes:', { wasOpen, display: dd.style.display });
            
            // Cerrar todos los dropdowns
            document.querySelectorAll('.fuente-dropdown').forEach(el => {
                el.classList.remove('show');
                el.style.display = 'none';
            });
            
            if (!wasOpen) {
                console.log('📂 Abriendo dropdown...');
                
                // Usar setTimeout para evitar conflictos con el event listener de cierre
                setTimeout(() => {
                    dd.classList.add('show');
                    dd.style.display = 'block';
                    dd.style.visibility = 'visible';
                    
                    // Posicionar el dropdown
            const rect = box.getBoundingClientRect();
                    dd.style.position = 'absolute';
            dd.style.top = (rect.bottom + window.scrollY + 6) + 'px';
            dd.style.left = (rect.left + window.scrollX) + 'px';
                    dd.style.minWidth = Math.max(rect.width, 260) + 'px';
                    dd.style.zIndex = '10000';
                    dd.style.backgroundColor = '#fff';
                    dd.style.border = '1px solid #e9ecef';
                    dd.style.borderRadius = '10px';
                    dd.style.boxShadow = '0 8px 24px rgba(11,36,49,.15)';
                    
                    console.log('📍 Dropdown posicionado en:', {
                        top: dd.style.top,
                        left: dd.style.left,
                        display: dd.style.display,
                        visibility: dd.style.visibility
                    });
                    
                    isToggling = false;
                }, 10);
            } else {
                console.log('📁 Cerrando dropdown...');
                dd.classList.remove('show');
                dd.style.display = 'none';
                isToggling = false;
            }
        });
        
        // Evitar que clicks dentro del dropdown lo cierren
        dd.addEventListener('click', (e) => { 
            console.log('🔒 Click dentro del dropdown - evitando cierre');
            e.stopPropagation(); 
        });
        
        // Cerrar dropdown al hacer click fuera (con delay para evitar conflictos)
        const closeDropdownHandler = (e) => {
            // Solo cerrar si el click no es en el box ni en el dropdown
            if (!box.contains(e.target) && !dd.contains(e.target)) {
                console.log('🚪 Click fuera detectado - cerrando dropdown');
                dd.classList.remove('show');
                dd.style.display = 'none';
            } else {
                console.log('🛡️ Click en elemento protegido - manteniendo dropdown abierto');
            }
        };
        
        // Añadir el listener con un pequeño delay para evitar conflictos
        setTimeout(() => {
            document.addEventListener('click', closeDropdownHandler);
        }, 100);
        updateFuenteLabel();
    }
    function getSelectedFuentes() {
        const list = document.getElementById('fuente-list');
        if (!list) {
            console.warn('⚠️ Lista de fuentes no encontrada, usando BOE por defecto');
            return ['BOE'];
        }
        const sel = Array.from(list.querySelectorAll('.item input:checked')).map(cb => cb.closest('.item').dataset.value);
        // Eliminar duplicados usando Set
        const uniqueSel = [...new Set(sel)];
        console.log('📋 Fuentes seleccionadas (sin duplicados):', uniqueSel);
        return uniqueSel.length ? uniqueSel : ['BOE'];
    }

    // Cargar datos reales desde backend (con test=yes por defecto)
    async function fetchIniciativasLegales() {
        try {
            const fuentes = getSelectedFuentes();
            console.log('🔄 Iniciando fetch con fuentes:', fuentes);
            
            const dateInput = document.getElementById('fecha-desde-legales');
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const selectedDate = (dateInput && dateInput.value) ? dateInput.value : `${yyyy}-${mm}-${dd}`;
            
            const url = new URL('/api/iniciativas-legales', window.location.origin);
            url.searchParams.set('test', 'yes');
            
            // Enviar fuentes sin duplicados
            const fuentesToSend = (Array.isArray(fuentes) && fuentes.length > 0) ? [...new Set(fuentes)] : ['BOE'];
            url.searchParams.set('fuentes', JSON.stringify(fuentesToSend));
            
            if (selectedDate) { url.searchParams.set('desde_insert', selectedDate); }
            
            console.log('📡 URL de fetch:', url.toString());
            console.log('📅 Fecha seleccionada:', selectedDate);
            console.log('🏷️ Fuentes a enviar:', fuentesToSend);
            
            const response = await fetch(url.toString(), { credentials: 'include' });
            console.log('📨 Respuesta del servidor:', response.status, response.statusText);
            
            if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);
            
            const data = await response.json();
            console.log('📋 Datos recibidos:', { iniciativas: data?.iniciativas?.length || 0 });
            
            return Array.isArray(data?.iniciativas) ? data.iniciativas.map(mapForDisplayLegales) : [];
        } catch (err) {
            console.error('❌ Error en fetchIniciativasLegales:', err);
            showToastLegales('No se pudieron cargar las iniciativas legales: ' + err.message, 'error');
            return [];
        }
    }

    function mapForDisplayLegales(item) {
        // item.sector y item.subsector pueden ser array; mantener arrays para pintar bubbles
        const normalizeArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);
        return {
            id: item.id || '',
            sector: normalizeArray(item.sector),
            subsector: normalizeArray(item.subsector),
            tema: item.tema || 'No especificado',
            marco: item.marco || 'No especificado',
            titulo: item.titulo || item.tema || 'Sin título',
            fuente: String(item.fuente || '').replace(/_test$/i, ''),
            proponente: item.proponente || 'No especificado',
            rango: item.rango || 'No especificado',
            subgrupo: item.subgrupo || 'No especificado',
            fecha: item.fecha || '',
            link: item.link || '#',
            doc_id: item.doc_id || ''
        };
    }

    // Inicialización con datos dummy (más adelante: backend iniciativas_legales)
    async function initIniciativasLegales() {
        // Primero inicializar el dropdown de fuentes
        await initFuenteDropdown();
        
        showSkeletonRowsLegales();
        isLoadingLegales = true;
        // Simular carga asíncrona
        iniciativasLegalesData = await fetchIniciativasLegales();
        isLoadingLegales = false;

        // Filtro por defecto: excluir "No especificado" en rango
        try {
            const allRangos = Array.from(new Set(iniciativasLegalesData.map(i => String(i.rango || '').trim()).filter(v => v)));
            const defaultRangos = allRangos.filter(v => v.toLowerCase() !== 'no especificado');
            if (defaultRangos.length > 0) {
                columnFiltersLegales['rango'] = defaultRangos;
            }
        } catch (_) {}

        // Filtro de fecha: por defecto hoy en el input (cutoff inicial)
        const dateInput = document.getElementById('fecha-desde-legales');
        if (dateInput && !dateInput.value) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            dateInput.value = `${yyyy}-${mm}-${dd}`;
        }

        filteredLegales = [...iniciativasLegalesData];

        setupEventListenersLegales();
        setupHeaderFiltersLegales();
        // applyAllFiltersLegales ya ordena y renderiza
        applyAllFiltersLegales();
        updateFilterIconStatesLegales();
    }

    function sortDataLegales() {
        if (!currentSortLegales.column) return;
        filteredLegales.sort((a, b) => {
            let aVal = a[currentSortLegales.column];
            let bVal = b[currentSortLegales.column];
            if (currentSortLegales.column === 'fecha') {
                const parseDisplayDate = (str) => {
                    if (!str || typeof str !== 'string') return new Date(0);
                    const m = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
                    if (m) {
                        const d = parseInt(m[1], 10);
                        const mo = parseInt(m[2], 10) - 1;
                        const y = parseInt(m[3], 10);
                        return new Date(y, mo, d);
                    }
                    const dt = new Date(str);
                    return isNaN(dt.getTime()) ? new Date(0) : dt;
                };
                aVal = parseDisplayDate(aVal);
                bVal = parseDisplayDate(bVal);
            }
            if (aVal < bVal) return currentSortLegales.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return currentSortLegales.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    function setupEventListenersLegales() {
        // keyword search removed

        const fechaDesde = document.getElementById('fecha-desde-legales');
        const fechaHasta = document.getElementById('fecha-hasta-legales');

        const clearDatesBtn = document.getElementById('clear-dates-legales');
        if (clearDatesBtn) clearDatesBtn.addEventListener('click', () => {
            if (fechaDesde) fechaDesde.value = '';
            if (fechaHasta) fechaHasta.value = '';
            scheduleRefetchDataLegales();
        });

        document.querySelectorAll('#tabla-iniciativas-legales thead th.sortable').forEach(th => {
            th.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const col = th.getAttribute('data-column');
                openFilterDropdownLegales(col, th);
            });
        });

        const prevBtn = document.getElementById('prev-page-legales');
        const nextBtn = document.getElementById('next-page-legales');
        if (prevBtn) prevBtn.addEventListener('click', () => changePageLegales(-1));
        if (nextBtn) nextBtn.addEventListener('click', () => changePageLegales(1));

        const exportBtn = document.getElementById('export-excel-legales');
        if (exportBtn) exportBtn.addEventListener('click', openExportModalLegales);

        // Botón Buscar - aplicar filtros de fuente y fecha
        const buscarBtn = document.getElementById('buscar-legales');
        if (buscarBtn) buscarBtn.addEventListener('click', () => {
            // Actualizar fuentes seleccionadas antes de buscar
            refetchDataLegales();
        });
        if (fechaDesde) fechaDesde.addEventListener('change', scheduleRefetchDataLegales);
        if (fechaHasta) fechaHasta.addEventListener('change', scheduleRefetchDataLegales);

        // Sincronizar select superior si filtro de columna 'fuente' es único
        const syncTopFuenteWithColumn = () => {
            const values = columnFiltersLegales['fuente'];
            if (!Array.isArray(values) || values.length !== 1) return;
            const list = document.getElementById('fuente-list');
            if (!list) return;
            list.querySelectorAll('.item').forEach(it => {
                const v = it.dataset.value;
                const checked = v === values[0];
                it.classList.toggle('selected', checked);
                it.querySelector('input').checked = checked;
            });
            const label = document.getElementById('fuente-selected-label');
            if (label) label.textContent = values[0];
        };
        const origApplyAll = applyAllFiltersLegales;
        applyAllFiltersLegales = function() { origApplyAll(); syncTopFuenteWithColumn(); };
    }

    function setupTabNavigationLegales() {
        const tabs = document.querySelectorAll('.ambito-tabs .tab-link');
        tabs.forEach(tab => {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                tabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                const tabId = this.getAttribute('data-tab');
                const vistaBoletin = document.getElementById('vista-boletin-diario');
                const vistaParlamentarias = document.getElementById('vista-iniciativas');
                const vistaLegales = document.getElementById('vista-iniciativas-legales');
                if (tabId === 'boletin-diario') {
                    if (vistaBoletin) vistaBoletin.style.display = 'block';
                    if (vistaParlamentarias) vistaParlamentarias.style.display = 'none';
                    if (vistaLegales) vistaLegales.style.display = 'none';
                } else if (tabId === 'iniciativas') {
                    if (vistaBoletin) vistaBoletin.style.display = 'none';
                    if (vistaParlamentarias) vistaParlamentarias.style.display = 'block';
                    if (vistaLegales) vistaLegales.style.display = 'none';
                } else if (tabId === 'iniciativas-legales') {
                    if (vistaBoletin) vistaBoletin.style.display = 'none';
                    if (vistaParlamentarias) vistaParlamentarias.style.display = 'none';
                    if (vistaLegales) vistaLegales.style.display = 'block';
                    if (iniciativasLegalesData.length === 0) { initIniciativasLegales(); }
                }
            });
        });
    }

    // Refetch compartido para esta vista
    async function refetchDataLegales() {
        console.log('🔄 Iniciando refetch de datos legales...');
        if (isLoadingLegales) {
            console.log('⏸️ Refetch cancelado - ya hay una carga en progreso');
            return;
        }
        
        showSkeletonRowsLegales();
        isLoadingLegales = true;
        
        try {
            console.log('📡 Llamando a fetchIniciativasLegales...');
            iniciativasLegalesData = await fetchIniciativasLegales();
            console.log('✅ Datos obtenidos:', iniciativasLegalesData.length, 'registros');
            
            // Establecer isLoadingLegales a false ANTES de renderizar
            isLoadingLegales = false;
            
            applyAllFiltersLegales();
            updateFilterIconStatesLegales();
            renderTableLegales();
            
            // Solo mostrar toast si realmente no hay datos después del filtro
            if (!iniciativasLegalesData || iniciativasLegalesData.length === 0) {
                const di = document.getElementById('fecha-desde-legales');
                const val = di && di.value ? di.value : '';
                let ddmmyyyy = val;
                if (/^\d{4}-\d{2}-\d{2}$/.test(val)) { const [y, m, d] = val.split('-'); ddmmyyyy = `${d}-${m}-${y}`; }
                showToastLegales(`Sin resultados con el criterio seleccionado "${ddmmyyyy || '—'}"`, 'info');
            }
            
            console.log('🏁 Refetch completado');
        } catch (error) {
            console.error('❌ Error en refetch:', error);
            showToastLegales('Error al cargar datos: ' + error.message, 'error');
            isLoadingLegales = false;
        }
    }

    function scheduleRefetchDataLegales() {
        if (refetchLegalesDebounce) clearTimeout(refetchLegalesDebounce);
        refetchLegalesDebounce = setTimeout(() => { refetchDataLegales(); }, 500);
    }

    function handleSearchLegales() { /* keyword search removed per UX */ }
    function handleDateFilterLegales() { applyAllFiltersLegales(); }

    function applyAllFiltersLegales() {
        console.log('🔍 Aplicando filtros legales...');
        console.log('📊 Datos antes del filtro:', iniciativasLegalesData.length);
        
        const searchTerm = '';
        const fechaDesde = '';
        const fechaHasta = '';

        filteredLegales = iniciativasLegalesData.filter(item => {
            let matchesSearch = true;
            if (searchTerm) {
                matchesSearch = Object.values(item).some(value => String(value).toLowerCase().includes(searchTerm));
            }

            let matchesDateFrom = true; // backend aplica cutoff
            let matchesDateTo = true;   // backend aplica cutoff

            let matchesColumnFilters = true;
            for (const [col, values] of Object.entries(columnFiltersLegales)) {
                if (Array.isArray(values) && values.length > 0) {
                    const target = item[col];
                    if (Array.isArray(target)) {
                        const hasAny = target.some(v => values.includes(String(v)));
                        if (!hasAny) { matchesColumnFilters = false; break; }
                    } else {
                        if (!values.includes(String(target ?? ''))) { matchesColumnFilters = false; break; }
                    }
                }
            }

            return matchesSearch && matchesDateFrom && matchesDateTo && matchesColumnFilters;
        });

        console.log('📊 Datos después del filtro:', filteredLegales.length);
        console.log('📋 Filtros activos:', columnFiltersLegales);

        currentPageLegales = 1;
        sortDataLegales();
        renderTableLegales();
    }

    function changePageLegales(direction) {
        const totalPages = Math.ceil(filteredLegales.length / itemsPerPageLegales);
        const newPage = currentPageLegales + direction;
        if (newPage >= 1 && newPage <= totalPages) {
            currentPageLegales = newPage;
            renderTableLegales();
        }
    }

    function renderTableLegales() {
        console.log('🎨 Renderizando tabla legales...');
        const tbody = document.getElementById('tbody-iniciativas-legales');
        if (!tbody) {
            console.error('❌ tbody-iniciativas-legales no encontrado');
            return;
        }
        
        console.log('📊 Estado de renderizado:', {
            isLoading: isLoadingLegales,
            filteredData: filteredLegales.length,
            totalData: iniciativasLegalesData.length
        });

        const totalPages = Math.ceil(filteredLegales.length / itemsPerPageLegales);
        const start = (currentPageLegales - 1) * itemsPerPageLegales;
        const end = Math.min(start + itemsPerPageLegales, filteredLegales.length);
        const pageData = filteredLegales.slice(start, end);
        
        console.log('📄 Datos de página:', {
            start,
            end,
            pageData: pageData.length,
            totalPages
        });

        tbody.innerHTML = '';
        // Función helper para truncar texto con tooltip
        const truncateText = (text, maxLength = 15) => {
            if (!text || text.length <= maxLength) return text;
            const truncated = text.substring(0, maxLength) + '...';
            console.log(`✂️ Fuente legales truncada: "${text}" → "${truncated}"`);
            return truncated;
        };

        console.log('🧹 Tabla limpiada, añadiendo filas...');
        pageData.forEach(item => {
            const row = document.createElement('tr');
            const sectorBubbles = (item.sector || []).map(v => `<span class="sector-bubble sector-bubble--primary">${v}</span>`).join(' ');
            const subsectorBubbles = (item.subsector || []).map(v => `<span class="sector-bubble sector-bubble--subtle">${v}</span>`).join(' ');
            const truncatedFuente = truncateText(item.fuente, 15);
            
            row.innerHTML = `
                <td>${item.id}</td>
                <td>${sectorBubbles}</td>
                <td>${subsectorBubbles}</td>
                <td class="tema-cell" title="${String(item.tema || '').replace(/\"/g, '&quot;')}">${item.tema}</td>
                <td>${item.marco}</td>
                <td class="titulo-cell" data-titulo="${item.titulo.replace(/\"/g, '&quot;')}">${item.titulo}</td>
                <td class="fuente-cell" title="${item.fuente}">${truncatedFuente}</td>
                <td>${item.proponente}</td>
                <td>${item.rango}</td>
                <td>${item.subgrupo}</td>
                <td>${item.fecha}</td>
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
        
        console.log('✅ Tabla renderizada con', pageData.length, 'filas');
        console.log('🎯 Filas en tbody:', tbody.children.length);

        setupTooltipsLegales();
        updatePaginationInfoLegales(start + 1, end, filteredLegales.length, currentPageLegales, totalPages);
    }

    function showSkeletonRowsLegales() {
        const tbody = document.getElementById('tbody-iniciativas-legales');
        if (!tbody) return;
        tbody.innerHTML = '';
        for (let i = 0; i < 25; i++) {
            const tr = document.createElement('tr');
            tr.className = 'skeleton-row';
            tr.innerHTML = `
                <td><span class="skeleton w-30 small"></span></td>
                <td><span class="skeleton w-40 small"></span></td>
                <td><span class="skeleton w-60 small"></span></td>
                <td><span class="skeleton w-40 small"></span></td>
                <td><span class="skeleton w-80"></span></td>
                <td><span class="skeleton w-30 small"></span></td>
                <td><span class="skeleton w-50 small"></span></td>
                <td><span class="skeleton w-40 small"></span></td>
                <td><span class="skeleton w-30 small"></span></td>
                <td><span class="skeleton w-20 small"></span></td>
                <td><span class="skeleton w-20 small"></span></td>
                <td><span class="skeleton w-20 small"></span></td>
            `;
            tbody.appendChild(tr);
        }
    }

    function setupHeaderFiltersLegales() {
        const theadCells = document.querySelectorAll('#tabla-iniciativas-legales thead th.sortable');
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
            trigger.addEventListener('click', (ev) => {
                ev.stopPropagation();
                openFilterDropdownLegales(col, th);
            });
            th.appendChild(trigger);
        });
        updateFilterIconStatesLegales();
        document.addEventListener('click', () => closeFilterDropdownLegales());
    }

    function updateFilterIconStatesLegales() {
        document.querySelectorAll('#tabla-iniciativas-legales thead th.sortable').forEach(th => {
            const col = th.getAttribute('data-column');
            const icon = th.querySelector('.filter-trigger');
            if (!icon) return;
            const hasFilter = Array.isArray(columnFiltersLegales[col]) && columnFiltersLegales[col].length > 0;
            const isSorted = currentSortLegales.column === col;
            icon.style.color = (hasFilter || isSorted) ? '#04db8d' : '#6c757d';
        });
    }

    let currentDropdownLegales = null;
    let currentDropdownColumnLegales = null;
    function closeFilterDropdownLegales() {
        if (currentDropdownLegales && currentDropdownLegales.parentNode) {
            currentDropdownLegales.parentNode.removeChild(currentDropdownLegales);
        }
        currentDropdownLegales = null;
        currentDropdownColumnLegales = null;
    }

    function openFilterDropdownLegales(column, thEl) {
        if (currentDropdownLegales && currentDropdownColumnLegales === column) {
            closeFilterDropdownLegales();
            return;
        }
        closeFilterDropdownLegales();
        const dropdown = document.createElement('div');
        currentDropdownColumnLegales = column;
        dropdown.className = 'column-filter-dropdown';
        dropdown.addEventListener('click', (e) => e.stopPropagation());

        const collectValues = (row, col) => {
            const v = row[col];
            if (Array.isArray(v)) return v.map(x => String(x ?? ''));
            if (col === 'link') return [String(row.doc_id || '').trim()];
            return [String(v ?? '')];
        };
        const uniqueValues = Array.from(new Set(
            iniciativasLegalesData.flatMap(r => collectValues(r, column))
        )).filter(v => v !== '').sort((a, b) => a.localeCompare(b));

        const titleMap = {
            id: 'ID_iniciativa',
            sector: 'Sector',
            subsector: 'Subsector',
            tema: 'Tema',
            marco: 'Marco Geográfico',
            titulo: 'Título Iniciativa',
            fuente: 'Fuente',
            proponente: 'Proponente',
            rango: 'Rango',
            subgrupo: 'Subgrupo',
            fecha: 'Fecha',
            link: 'Link (ID documento)'
        };

        const selected = columnFiltersLegales[column] ? new Set(columnFiltersLegales[column]) : new Set();

        dropdown.innerHTML = `
            <div class="header">
                <div class="title">${titleMap[column] || column}</div>
                <div class="actions">
                    <button class="btn" data-sort-toggle="${currentSortLegales.column === column ? currentSortLegales.direction : 'asc'}" title="Ordenar A-Z/Z-A">
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

        const updateSortToggleVisual = () => {
            const dir = sortToggleBtn.getAttribute('data-sort-toggle');
            const icon = sortToggleBtn.querySelector('.sort-az-icon');
            icon.style.transform = (dir === 'desc') ? 'rotate(180deg)' : 'rotate(0deg)';
        };
        updateSortToggleVisual();

        const updateSelectAllChecked = () => {
            if (!selectAllCb) return;
            if (lastVisibleValues.length === 0) {
                selectAllCb.checked = false;
                return;
            }
            selectAllCb.checked = lastVisibleValues.every(v => selected.has(v));
        };

        const renderList = (filterText = '') => {
            list.innerHTML = '';
            const lower = filterText.toLowerCase();
            lastVisibleValues = uniqueValues.filter(v => !lower || v.toLowerCase().includes(lower));
            lastVisibleValues.forEach(v => {
                const item = document.createElement('label');
                item.className = 'item';
                const id = `flt_leg_${column}_${v.replace(/[^a-z0-9]/gi, '')}`;
                item.innerHTML = `<input type=\"checkbox\" id=\"${id}\" ${selected.has(v) ? 'checked' : ''}/> <span class=\"val\">${v}</span>`;
                const span = item.querySelector('.val');
                span.style.display = 'inline-block';
                span.style.maxWidth = '180px';
                span.style.whiteSpace = 'nowrap';
                span.style.overflow = 'hidden';
                span.style.textOverflow = 'ellipsis';
                const cb = item.querySelector('input');
                cb.style.accentColor = '#0b2431';
                cb.addEventListener('change', (ev) => {
                    if (ev.target.checked) selected.add(v); else selected.delete(v);
                    if (selected.size > 0) columnFiltersLegales[column] = Array.from(selected); else delete columnFiltersLegales[column];
                    applyAllFiltersLegales();
                    updateFilterIconStatesLegales();
                    setClearState();
                    updateSelectAllChecked();
                });
                list.appendChild(item);
            });
            updateSelectAllChecked();
        };
        renderList();

        searchEl.addEventListener('input', (e) => {
            renderList(e.target.value || '');
        });

        function setClearState() {
            const hasFilter = Array.isArray(columnFiltersLegales[column]) && columnFiltersLegales[column].length > 0;
            const isSorted = currentSortLegales.column === column;
            const enabled = hasFilter || isSorted;
            clearBtn.style.opacity = enabled ? '1' : '.5';
            clearBtn.style.pointerEvents = enabled ? 'auto' : 'none';
        }
        setClearState();

        sortToggleBtn.addEventListener('click', () => {
            const currentDir = sortToggleBtn.getAttribute('data-sort-toggle');
            const nextDir = currentDir === 'asc' ? 'desc' : 'asc';
            sortToggleBtn.setAttribute('data-sort-toggle', nextDir);
            currentSortLegales = { column, direction: nextDir };
            updateSortToggleVisual();
            sortDataLegales();
            renderTableLegales();
            updateFilterIconStatesLegales();
            setClearState();
        });

        if (selectAllCb) {
            selectAllCb.addEventListener('change', (e) => {
                const filterText = searchEl.value || '';
                if (e.target.checked) lastVisibleValues.forEach(v => selected.add(v));
                else lastVisibleValues.forEach(v => selected.delete(v));
                if (selected.size > 0) columnFiltersLegales[column] = Array.from(selected); else delete columnFiltersLegales[column];
                renderList(filterText);
                applyAllFiltersLegales();
                updateFilterIconStatesLegales();
                setClearState();
            });
        }

        clearBtn.addEventListener('click', () => {
            delete columnFiltersLegales[column];
            if (currentSortLegales.column === column) currentSortLegales = { column: 'fecha', direction: 'desc' };
            selected.clear();
            applyAllFiltersLegales();
            sortDataLegales();
            renderTableLegales();
            updateFilterIconStatesLegales();
            setClearState();
            updateSelectAllChecked();
        });

        const rect = thEl.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + window.scrollY + 6) + 'px';
        dropdown.style.left = (rect.left + window.scrollX) + 'px';

        document.body.appendChild(dropdown);
        currentDropdownLegales = dropdown;
    }

    function updatePaginationInfoLegales(start, end, total, page, totalPages) {
        const s = document.getElementById('showing-start-legales');
        const e = document.getElementById('showing-end-legales');
        const t = document.getElementById('total-records-legales');
        const p = document.getElementById('current-page-legales');
        const tp = document.getElementById('total-pages-legales');
        if (s) s.textContent = total > 0 ? start : 0;
        if (e) e.textContent = end;
        if (t) t.textContent = total;
        if (p) p.textContent = page;
        if (tp) tp.textContent = totalPages || 1;
        const prev = document.getElementById('prev-page-legales');
        const next = document.getElementById('next-page-legales');
        if (prev) prev.disabled = page === 1;
        if (next) next.disabled = page === totalPages || totalPages === 0;
    }

    function exportToExcelWithDataLegales(data) {
        // Función helper para escapar correctamente los campos CSV
        const escapeCsvField = (value) => {
            if (value == null) return '""';
            const str = String(value);
            // Si contiene comas, comillas dobles, saltos de línea o espacios al inicio/final, necesita ser escapado
            if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') || str.trim() !== str) {
                // Escapar comillas dobles duplicándolas y envolver en comillas
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        // Función helper para procesar arrays (sector, subsector)
        const processArrayField = (value) => {
            if (Array.isArray(value)) {
                return value.join(' | ');
            }
            return value || '';
        };

        const headers = ['ID', 'Sector', 'Subsector', 'Tema', 'Marco Geográfico', 'Título Iniciativa', 'Fuente', 'Proponente', 'Rango', 'Subgrupo', 'Fecha', 'Link'];
        const csvContent = [
            headers.join(','),
            ...data.map(item => [
                escapeCsvField(item.id),
                escapeCsvField(processArrayField(item.sector)),
                escapeCsvField(processArrayField(item.subsector)),
                escapeCsvField(item.tema),
                escapeCsvField(item.marco),
                escapeCsvField(item.titulo),
                escapeCsvField(item.fuente),
                escapeCsvField(item.proponente),
                escapeCsvField(item.rango),
                escapeCsvField(item.subgrupo),
                escapeCsvField(item.fecha),
                escapeCsvField(item.link)
            ].join(','))
        ].join('\n');
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `iniciativas_legales_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToastLegales('Archivo exportado correctamente', 'success');
    }

    function ensureExportModalStylesLegales() {
        if (document.getElementById('export-modal-styles')) return; // reutilizamos estilos si ya existen
        const style = document.createElement('style');
        style.id = 'export-modal-styles';
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

    function openExportModalLegales() {
        ensureExportModalStylesLegales();
        let modal = document.getElementById('exportModalLegales');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'exportModalLegales';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content">
                    <h3 class="modal-title">Exportar Excel</h3>
                    <div class="modal-text">Aplica filtros antes de exportar. Por defecto, puedes acotar por fecha.</div>
                    <div class="filters-grid">
                        <div>
                            <label class="small">Fecha desde</label>
                            <input id="exportStartDateLegales" type="date" class="input" />
                        </div>
                        <div>
                            <label class="small">Fecha hasta</label>
                            <input id="exportEndDateLegales" type="date" class="input" />
                        </div>
                    </div>
                    <div style="margin-top:12px; font-weight:600; color:#0b2431;">Filtros adicionales</div>
                    <div id="exportFiltersLegales" class="filters-grid" style="margin-top:8px;"></div>
                    <div><button id="addExportFilterLegales" class="btn" style="margin-top:8px;">Añadir filtro</button></div>
                    <div class="modal-buttons">
                        <button class="btn" id="cancelExportLegales">Cancelar</button>
                        <button class="btn btn-primary" id="confirmExportLegales">Exportar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const filtersContainer = modal.querySelector('#exportFiltersLegales');
        const addBtn = modal.querySelector('#addExportFilterLegales');
        filtersContainer.innerHTML = '';

        const addFilterRow = () => {
            const row = document.createElement('div');
            row.className = 'filter-row';
            row.innerHTML = `
                <select class="select export-col">
                    <option value="id">ID</option>
                    <option value="sector">Sector</option>
                    <option value="subsector">Subsector</option>
                    <option value="tema">Tema</option>
                    <option value="marco">Marco Geográfico</option>
                    <option value="titulo">Título Iniciativa</option>
                    <option value="fuente">Fuente</option>
                    <option value="proponente">Proponente</option>
                    <option value="rango">Rango</option>
                    <option value="subgrupo">Subgrupo</option>
                </select>
                <input type="text" class="input export-val" placeholder="Valor contiene..." />
                <button class="btn remove">Eliminar</button>
            `;
            row.querySelector('.remove').addEventListener('click', () => {
                filtersContainer.removeChild(row);
            });
            filtersContainer.appendChild(row);
        };

        addBtn.onclick = addFilterRow;
        addFilterRow();

        modal.classList.add('show');
        document.body.style.overflow = 'hidden';

        modal.addEventListener('click', (e) => { if (e.target === modal) closeExportModalLegales(); });
        modal.querySelector('#cancelExportLegales').onclick = () => closeExportModalLegales();
        modal.querySelector('#confirmExportLegales').onclick = () => {
            const startVal = modal.querySelector('#exportStartDateLegales').value;
            const endVal = modal.querySelector('#exportEndDateLegales').value;
            const rows = Array.from(filtersContainer.querySelectorAll('.filter-row'));
            let data = [...iniciativasLegalesData];
            
            // Filtrar por fecha desde (usando lógica normalizada)
            if (startVal) {
                console.log('📅 Exportación Legales: Filtrando por fecha desde:', startVal);
                data = data.filter(item => {
                    if (!item.fecha) return false;
                    try {
                        const dateParts = item.fecha.split('-');
                        if (dateParts.length === 3) {
                            const [d, m, y] = dateParts;
                            const itemDate = new Date(parseInt(y,10), parseInt(m,10)-1, parseInt(d,10));
                            const filterDate = new Date(startVal);
                            
                            // Normalizar ambas fechas a medianoche
                            const itemDateNormalized = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
                            const filterDateNormalized = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
                            
                            return itemDateNormalized >= filterDateNormalized;
                        }
                        return false;
                    } catch (error) {
                        console.error('❌ Error procesando fecha desde en exportación legales:', error, item.fecha);
                        return false;
                    }
                });
                console.log('📊 Datos legales después de filtro fecha desde:', data.length);
            }
            
            // Filtrar por fecha hasta (usando lógica normalizada)
            if (endVal) {
                console.log('📅 Exportación Legales: Filtrando por fecha hasta:', endVal);
                data = data.filter(item => {
                    if (!item.fecha) return false;
                    try {
                        const dateParts = item.fecha.split('-');
                        if (dateParts.length === 3) {
                            const [d, m, y] = dateParts;
                            const itemDate = new Date(parseInt(y,10), parseInt(m,10)-1, parseInt(d,10));
                            const filterDate = new Date(endVal);
                            
                            // Normalizar ambas fechas a medianoche
                            const itemDateNormalized = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
                            const filterDateNormalized = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
                            
                            return itemDateNormalized <= filterDateNormalized;
                        }
                        return false;
                    } catch (error) {
                        console.error('❌ Error procesando fecha hasta en exportación legales:', error, item.fecha);
                        return false;
                    }
                });
                console.log('📊 Datos legales después de filtro fecha hasta:', data.length);
            }
            rows.forEach(r => {
                const col = r.querySelector('.export-col').value;
                const val = (r.querySelector('.export-val').value || '').toLowerCase();
                if (!val) return;
                data = data.filter(item => {
                    const target = item[col];
                    if (Array.isArray(target)) {
                        return target.some(v => String(v).toLowerCase().includes(val));
                    }
                    return String(target ?? '').toLowerCase().includes(val);
                });
            });
            console.log('📊 Exportando', data.length, 'registros de iniciativas legales');
            
            // Log de muestra para verificar escape de comas
            if (data.length > 0) {
                const sampleTitles = data.slice(0, 3).map(item => item.titulo).filter(t => t && t.includes(','));
                if (sampleTitles.length > 0) {
                    console.log('📝 Títulos con comas encontrados (muestra):', sampleTitles);
                }
            }
            
            exportToExcelWithDataLegales(data);
            closeExportModalLegales();
        };
    }

    function closeExportModalLegales() {
        const modal = document.getElementById('exportModalLegales');
        if (!modal) return;
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }

    function showToastLegales(message, type = 'info') {
        // Si ya hay un toast activo, cancelar su timer y removerlo
        if (activeToastLegalesTimer) {
            clearTimeout(activeToastLegalesTimer);
            activeToastLegalesTimer = null;
        }
        if (activeToastLegales && activeToastLegales.parentNode) {
            activeToastLegales.parentNode.removeChild(activeToastLegales);
            activeToastLegales = null;
        }
        
        // Crear nuevo toast
        const toast = document.createElement('div');
        toast.className = `toast-message ${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#04db8d' : '#455862'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(toast);
        activeToastLegales = toast;
        
        // Programar cierre
        activeToastLegalesTimer = setTimeout(() => {
            if (activeToastLegales) {
                activeToastLegales.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
                    if (activeToastLegales && activeToastLegales.parentNode) {
                        activeToastLegales.parentNode.removeChild(activeToastLegales);
                    }
                    activeToastLegales = null;
                    activeToastLegalesTimer = null;
                }, 300);
            }
        }, 3000);
    }

    function setupTooltipsLegales() { /* no-op; comportamiento con CSS */ }

    // Asegurar animaciones CSS (reutiliza si existen)
    if (!document.getElementById('iniciativas-animations')) {
        const style = document.createElement('style');
        style.id = 'iniciativas-animations';
        style.textContent = `
            @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
        `;
        document.head.appendChild(style);
    }

    // Exponer API mínima
    window.iniciativasLegalesModule = {
        init: initIniciativasLegales,
        refresh: renderTableLegales
    };

    // Inicializar navegación si DOM listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupTabNavigationLegales);
    } else {
        setupTabNavigationLegales();
    }
})();


