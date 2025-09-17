// iniciativas_parlamentarias.js - Gestión de la vista de Iniciativas Parlamentarias

(function() {
    // Variables globales del módulo
    let iniciativasData = [];
    let filteredData = [];
    let currentPage = 1;
    const itemsPerPage = 25;
    let currentSort = { column: 'fecha', direction: 'desc' };
    const columnFilters = {};
    let isLoading = false;

    // Cargar datos reales desde backend
    async function fetchIniciativasData() {
        try {
            console.log('🔄 Cargando iniciativas parlamentarias...');
            const response = await fetch('/api/iniciativas-parlamentarias', { credentials: 'include' });
            if (!response.ok) throw new Error('Error al cargar iniciativas');
            const data = await response.json();
            
            console.log('📊 Datos recibidos del backend:', {
                iniciativas: data?.iniciativas?.length || 0,
                fuentes: data?.fuentes || [],
                sample: data?.iniciativas?.slice(0, 3)
            });
            
            // data.iniciativas ya viene en formato consumible por la tabla
            const mapped = Array.isArray(data?.iniciativas) ? data.iniciativas.map(mapForDisplay) : [];
            console.log('✅ Iniciativas mapeadas:', mapped.length);
            
            return mapped;
        } catch (err) {
            console.error('❌ Error cargando iniciativas parlamentarias:', err);
            showToast('No se pudieron cargar las iniciativas', 'error');
            return [];
        }
    }

    function mapForDisplay(item) {
        const formatTipo = (v) => {
            if (!v || typeof v !== 'string') return 'No especificado';
            const normalized = v.replace(/_/g, ' ').toLowerCase();
            return normalized.charAt(0).toUpperCase() + normalized.slice(1);
        };
        return {
            id: item.id || '',
            sector: item.sector || 'No especificado',
            tema: item.tema || 'No especificado',
            marco: item.marco || 'No especificado',
            titulo: item.titulo || 'Sin título',
            fuente: String(item.fuente || '').replace(/_test$/i, ''),
            proponente: item.proponente || 'No especificado',
            tipo: formatTipo(item.tipo || ''),
            fecha: item.fecha || '',
            link: item.link || '#',
            doc_id: item.doc_id || ''
        };
    }

    // Inicializar la vista
    async function initIniciativas() {
        // Mostrar skeleton mientras carga
        showSkeletonRows();
        isLoading = true;
        iniciativasData = await fetchIniciativasData();
        isLoading = false;

        // Filtro por defecto: incluir todos los tipos excepto "No especificado"
        try {
            const allTipos = Array.from(new Set(iniciativasData.map(i => String(i.tipo || '').trim()).filter(v => v)));
            const defaultTipos = allTipos.filter(v => v.toLowerCase() !== 'no especificado');
            if (defaultTipos.length > 0) {
                columnFilters['tipo'] = defaultTipos;
            }
        } catch (_) {}

        filteredData = [...iniciativasData];

        // Configurar event listeners
        setupEventListeners();
        setupHeaderFilters();

        // Aplicar filtros iniciales y ordenar por defecto
        applyAllFilters();
        updateFilterIconStates();

        // Renderizar tabla inicial
        renderTable();
    }

    function sortData() {
        if (!currentSort.column) return;
        filteredData.sort((a, b) => {
            let aVal = a[currentSort.column];
            let bVal = b[currentSort.column];
            if (currentSort.column === 'fecha') {
                const parseDisplayDate = (str) => {
                    if (!str || typeof str !== 'string') return new Date(0);
                    // dd-mm-yyyy
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
            if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // Configurar event listeners
    function setupEventListeners() {
        // Búsqueda
        const searchInput = document.getElementById('search-iniciativas');
        if (searchInput) {
            searchInput.addEventListener('input', handleSearch);
        }

        // Filtros de fecha
        const fechaDesde = document.getElementById('fecha-desde');
        const fechaHasta = document.getElementById('fecha-hasta');
        if (fechaDesde) fechaDesde.addEventListener('change', handleDateFilter);
        if (fechaHasta) fechaHasta.addEventListener('change', handleDateFilter);
        
        // Botón limpiar fechas
        const clearDatesBtn = document.getElementById('clear-dates');
        if (clearDatesBtn) {
            clearDatesBtn.addEventListener('click', () => {
                if (fechaDesde) fechaDesde.value = '';
                if (fechaHasta) fechaHasta.value = '';
                handleDateFilter();
            });
        }

        // Apertura de filtros por columna al clicar el th (no ordenar aquí)
        document.querySelectorAll('#tabla-iniciativas thead th.sortable').forEach(th => {
            th.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const col = th.getAttribute('data-column');
                openFilterDropdown(col, th);
            });
        });

        // Paginación
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        if (prevBtn) prevBtn.addEventListener('click', () => changePage(-1));
        if (nextBtn) nextBtn.addEventListener('click', () => changePage(1));

        // Exportar a Excel con modal de filtros
        const exportBtn = document.getElementById('export-excel');
        if (exportBtn) {
            exportBtn.addEventListener('click', openExportModal);
        }

        // Tabs navigation
        setupTabNavigation();
    }

    // Configurar navegación de tabs
    function setupTabNavigation() {
        const tabs = document.querySelectorAll('.ambito-tabs .tab-link');
        tabs.forEach(tab => {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                
                // Remover active de todos los tabs
                tabs.forEach(t => t.classList.remove('active'));
                // Añadir active al tab clickeado
                this.classList.add('active');
                
                // Mostrar/ocultar vistas
                const tabId = this.getAttribute('data-tab');
                if (tabId === 'boletin-diario') {
                    document.getElementById('vista-boletin-diario').style.display = 'block';
                    document.getElementById('vista-iniciativas').style.display = 'none';
                } else if (tabId === 'iniciativas') {
                    document.getElementById('vista-boletin-diario').style.display = 'none';
                    document.getElementById('vista-iniciativas').style.display = 'block';
                    // Inicializar datos si es primera vez
                    if (iniciativasData.length === 0) {
                        initIniciativas();
                    }
                }
            });
        });
    }

    // Manejar búsqueda
    function handleSearch() {
        applyAllFilters();
    }
    
    // Manejar filtro de fechas
    function handleDateFilter() {
        applyAllFilters();
    }
    
    // Aplicar todos los filtros combinados
    function applyAllFilters() {
        const searchTerm = document.getElementById('search-iniciativas')?.value.toLowerCase() || '';
        const fechaDesde = document.getElementById('fecha-desde')?.value || '';
        const fechaHasta = document.getElementById('fecha-hasta')?.value || '';
        
        console.log('🔍 Aplicando filtros:', {
            searchTerm,
            fechaDesde,
            fechaHasta,
            totalItems: iniciativasData.length
        });
        
        // Log específico para debugging del filtro de fecha
        if (fechaDesde) {
            console.log('📅 Filtro fecha desde activo:', fechaDesde);
            const sampleDates = iniciativasData.slice(0, 5).map(item => ({
                fecha: item.fecha,
                titulo: item.titulo?.substring(0, 50) + '...'
            }));
            console.log('📋 Muestra de fechas en datos:', sampleDates);
        }
        
        filteredData = iniciativasData.filter(item => {
            // Filtro de texto
            let matchesSearch = true;
            if (searchTerm) {
                matchesSearch = Object.values(item).some(value => 
                    String(value).toLowerCase().includes(searchTerm)
                );
            }
            
            // Filtro de fecha desde
            let matchesDateFrom = true;
            if (fechaDesde && item.fecha) {
                try {
                    // Parsear fecha del item (formato dd-mm-yyyy)
                    const dateParts = item.fecha.split('-');
                    if (dateParts.length === 3) {
                        const [d, m, y] = dateParts;
                        const itemDate = new Date(parseInt(y,10), parseInt(m,10)-1, parseInt(d,10));
                        
                        // Parsear fecha del filtro (formato yyyy-mm-dd del input date)
                        const filterDate = new Date(fechaDesde);
                        
                        // Validar que las fechas son válidas
                        if (!isNaN(itemDate.getTime()) && !isNaN(filterDate.getTime())) {
                            // Normalizar ambas fechas a medianoche para comparación exacta
                            const itemDateNormalized = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
                            const filterDateNormalized = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
                            
                            console.log('🔍 Comparando fechas (normalizado):', {
                                itemFecha: item.fecha,
                                itemDate: itemDateNormalized.toDateString(),
                                filterFecha: fechaDesde,
                                filterDate: filterDateNormalized.toDateString(),
                                itemTime: itemDateNormalized.getTime(),
                                filterTime: filterDateNormalized.getTime(),
                                comparison: itemDateNormalized >= filterDateNormalized
                            });
                            
                            matchesDateFrom = itemDateNormalized >= filterDateNormalized;
                        } else {
                            console.warn('⚠️ Fecha inválida detectada:', {
                                itemFecha: item.fecha,
                                filterFecha: fechaDesde
                            });
                            // Si hay fechas inválidas, incluir el item por defecto
                            matchesDateFrom = true;
                        }
                    } else {
                        console.warn('⚠️ Formato de fecha incorrecto:', item.fecha);
                        matchesDateFrom = true;
                    }
                } catch (error) {
                    console.error('❌ Error procesando fecha:', error, item.fecha);
                    matchesDateFrom = true;
                }
            }
            
            // Filtro de fecha hasta
            let matchesDateTo = true;
            if (fechaHasta && item.fecha) {
                try {
                    // Parsear fecha del item (formato dd-mm-yyyy)
                    const dateParts = item.fecha.split('-');
                    if (dateParts.length === 3) {
                        const [d, m, y] = dateParts;
                        const itemDate = new Date(parseInt(y,10), parseInt(m,10)-1, parseInt(d,10));
                        
                        // Parsear fecha del filtro (formato yyyy-mm-dd del input date)
                        const filterDate = new Date(fechaHasta);
                        
                        // Validar que las fechas son válidas
                        if (!isNaN(itemDate.getTime()) && !isNaN(filterDate.getTime())) {
                            // Normalizar ambas fechas a medianoche para comparación exacta
                            const itemDateNormalized = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
                            const filterDateNormalized = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
                            
                            matchesDateTo = itemDateNormalized <= filterDateNormalized;
                        } else {
                            // Si hay fechas inválidas, incluir el item por defecto
                            matchesDateTo = true;
                        }
                    } else {
                        matchesDateTo = true;
                    }
                } catch (error) {
                    console.error('❌ Error procesando fecha hasta:', error, item.fecha);
                    matchesDateTo = true;
                }
            }

            // Filtros por columna
            let matchesColumnFilters = true;
            for (const [col, values] of Object.entries(columnFilters)) {
                if (Array.isArray(values) && values.length > 0) {
                    let itemValue;
                    if (col === 'link') {
                        itemValue = String(item.doc_id || '').trim();
                    } else {
                        itemValue = String(item[col] ?? '');
                    }
                    
                    if (!values.includes(itemValue)) {
                        matchesColumnFilters = false;
                        break;
                    }
                }
            }
            
            return matchesSearch && matchesDateFrom && matchesDateTo && matchesColumnFilters;
        });
        
        console.log('📊 Resultado del filtro:', {
            filteredItems: filteredData.length,
            originalItems: iniciativasData.length
        });
        
        // Log adicional para debugging de fechas
        if (fechaDesde && filteredData.length > 0) {
            const fechasEncontradas = filteredData.map(item => item.fecha).slice(0, 10);
            console.log('📅 Fechas en resultados filtrados (primeras 10):', fechasEncontradas);
        }
        
        currentPage = 1;
        sortData();
        renderTable();
    }

    // Manejar ordenamiento
    function handleSort(e) {
        const column = e.currentTarget.getAttribute('data-column');
        
        // Determinar dirección
        if (currentSort.column === column) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.column = column;
            currentSort.direction = 'asc';
        }
        
        // Actualizar clases visuales
        document.querySelectorAll('.sortable').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
        });
        e.currentTarget.classList.add(currentSort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
        
        // Ordenar datos
        sortData();
        
        renderTable();
    }

    // Cambiar página
    function changePage(direction) {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        const newPage = currentPage + direction;
        
        if (newPage >= 1 && newPage <= totalPages) {
            currentPage = newPage;
            renderTable();
        }
    }

    // Renderizar tabla
    function renderTable() {
        const tbody = document.getElementById('tbody-iniciativas');
        if (!tbody) return;
        if (isLoading) return;
        
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        const start = (currentPage - 1) * itemsPerPage;
        const end = Math.min(start + itemsPerPage, filteredData.length);
        const pageData = filteredData.slice(start, end);
        
        // Limpiar tabla
        tbody.innerHTML = '';
        
        // Función helper para truncar texto con tooltip
        const truncateText = (text, maxLength = 15) => {
            if (!text || text.length <= maxLength) return text;
            const truncated = text.substring(0, maxLength) + '...';
            console.log(`✂️ Fuente truncada: "${text}" → "${truncated}"`);
            return truncated;
        };

        // Renderizar filas
        pageData.forEach(item => {
            const row = document.createElement('tr');
            const truncatedFuente = truncateText(item.fuente, 15);
            
            row.innerHTML = `
                <td>${item.id}</td>
                <td><span class="sector-bubble">${item.sector}</span></td>
                <td>${item.tema}</td>
                <td>${item.marco}</td>
                <td class="titulo-cell" data-titulo="${item.titulo.replace(/\"/g, '&quot;')}">${item.titulo}</td>
                <td class="fuente-cell" title="${item.fuente}">${truncatedFuente}</td>
                <td>${item.proponente}</td>
                <td>${item.tipo}</td>
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
        
        // Configurar tooltips después de añadir todas las filas (no-op ahora)
        setupTooltips();
        
        // Actualizar información de paginación
        updatePaginationInfo(start + 1, end, filteredData.length, currentPage, totalPages);
    }

    // Skeleton de 25 filas
    function showSkeletonRows() {
        const tbody = document.getElementById('tbody-iniciativas');
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
            `;
            tbody.appendChild(tr);
        }
    }

    // Filtros por columna (dropdown)
    function setupHeaderFilters() {
        const theadCells = document.querySelectorAll('#tabla-iniciativas thead th.sortable');
        theadCells.forEach(th => {
            // Evitar duplicados
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
                openFilterDropdown(col, th);
            });
            th.appendChild(trigger);
        });
        
        // Pintar estado activo (verde) en columnas con filtro/sort
        updateFilterIconStates();

        // Cerrar dropdown al hacer click fuera
        document.addEventListener('click', () => closeFilterDropdown());
    }

    function updateFilterIconStates() {
        document.querySelectorAll('#tabla-iniciativas thead th.sortable').forEach(th => {
            const col = th.getAttribute('data-column');
            const icon = th.querySelector('.filter-trigger');
            if (!icon) return;
            const hasFilter = Array.isArray(columnFilters[col]) && columnFilters[col].length > 0;
            const isSorted = currentSort.column === col;
            icon.style.color = (hasFilter || isSorted) ? '#04db8d' : '#6c757d';
        });
    }

    let currentDropdown = null;
    let currentDropdownColumn = null;
    function closeFilterDropdown() {
        if (currentDropdown && currentDropdown.parentNode) {
            currentDropdown.parentNode.removeChild(currentDropdown);
        }
        currentDropdown = null;
        currentDropdownColumn = null;
    }

    function openFilterDropdown(column, thEl) {
        // Si ya está abierto para esta columna, cerrar y salir (toggle)
        if (currentDropdown && currentDropdownColumn === column) {
            closeFilterDropdown();
            return;
        }
        // Cerrar cualquier otro dropdown
        closeFilterDropdown();
        const dropdown = document.createElement('div');
        currentDropdownColumn = column;
        dropdown.className = 'column-filter-dropdown';
        // Evitar que clics internos cierren el dropdown
        dropdown.addEventListener('click', (e) => e.stopPropagation());

        // Obtener valores únicos de la columna
        const uniqueValues = Array.from(new Set(iniciativasData.map(i => {
            if (column === 'link') {
                return String(i.doc_id || '').trim();
            }
            return String(i[column] ?? '');
        })))
            .filter(v => v !== '')
            .sort((a, b) => a.localeCompare(b));

        const titleMap = {
            id: 'ID_iniciativa', sector: 'Sector', tema: 'Tema', marco: 'Marco Geográfico', titulo: 'Título Iniciativa', fuente: 'Fuente', proponente: 'Proponente', tipo: 'Tipo Iniciativa', fecha: 'Fecha', link: 'Link (ID documento)'
        };

        const selected = columnFilters[column] ? new Set(columnFilters[column]) : new Set();

        dropdown.innerHTML = `
            <div class="header">
                <div class="title">${titleMap[column] || column}</div>
                <div class="actions">
                    <button class="btn" data-sort-toggle="${currentSort.column === column ? currentSort.direction : 'asc'}" title="Ordenar A-Z/Z-A">
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
                const id = `flt_${column}_${v.replace(/[^a-z0-9]/gi, '')}`;
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
                    if (selected.size > 0) columnFilters[column] = Array.from(selected); else delete columnFilters[column];
                    applyAllFilters();
                    updateFilterIconStates();
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
            const hasFilter = Array.isArray(columnFilters[column]) && columnFilters[column].length > 0;
            const isSorted = currentSort.column === column;
            const enabled = hasFilter || isSorted;
            clearBtn.style.opacity = enabled ? '1' : '.5';
            clearBtn.style.pointerEvents = enabled ? 'auto' : 'none';
        }
        setClearState();

        sortToggleBtn.addEventListener('click', () => {
            const currentDir = sortToggleBtn.getAttribute('data-sort-toggle');
            const nextDir = currentDir === 'asc' ? 'desc' : 'asc';
            sortToggleBtn.setAttribute('data-sort-toggle', nextDir);
            currentSort = { column, direction: nextDir };
            updateSortToggleVisual();
            sortData();
            renderTable();
            updateFilterIconStates();
            setClearState();
        });

        if (selectAllCb) {
            selectAllCb.addEventListener('change', (e) => {
                const filterText = searchEl.value || '';
                if (e.target.checked) {
                    lastVisibleValues.forEach(v => selected.add(v));
                } else {
                    lastVisibleValues.forEach(v => selected.delete(v));
                }
                if (selected.size > 0) columnFilters[column] = Array.from(selected); else delete columnFilters[column];
                renderList(filterText);
                applyAllFilters();
                updateFilterIconStates();
                setClearState();
            });
        }

        clearBtn.addEventListener('click', () => {
            // Reset filtros y sort de esta columna
            delete columnFilters[column];
            if (currentSort.column === column) currentSort = { column: 'fecha', direction: 'desc' };
            selected.clear();
            applyAllFilters();
            sortData();
            renderTable();
            updateFilterIconStates();
            setClearState();
            updateSelectAllChecked();
        });

        // Posicionar bajo el th
        const rect = thEl.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + window.scrollY + 6) + 'px';
        dropdown.style.left = (rect.left + window.scrollX) + 'px';

        document.body.appendChild(dropdown);
        currentDropdown = dropdown;
    }

    // Renderizar tabla y actualizar paginación ya implementados más abajo

    // Actualizar información de paginación
    function updatePaginationInfo(start, end, total, page, totalPages) {
        document.getElementById('showing-start').textContent = total > 0 ? start : 0;
        document.getElementById('showing-end').textContent = end;
        document.getElementById('total-records').textContent = total;
        document.getElementById('current-page').textContent = page;
        document.getElementById('total-pages').textContent = totalPages || 1;
        
        // Habilitar/deshabilitar botones
        document.getElementById('prev-page').disabled = page === 1;
        document.getElementById('next-page').disabled = page === totalPages || totalPages === 0;
    }

    // Exportar a Excel (datos proporcionados)
    function exportToExcelWithData(data) {
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

        const headers = ['ID', 'Sector', 'Tema', 'Marco Geográfico', 'Título Iniciativa', 'Fuente', 'Proponente', 'Tipo Iniciativa', 'Fecha', 'Link'];
        const csvContent = [
            headers.join(','),
            ...data.map(item => [
                escapeCsvField(item.id),
                escapeCsvField(item.sector),
                escapeCsvField(item.tema),
                escapeCsvField(item.marco),
                escapeCsvField(item.titulo),
                escapeCsvField(item.fuente),
                escapeCsvField(item.proponente),
                escapeCsvField(item.tipo),
                escapeCsvField(item.fecha),
                escapeCsvField(item.link)
            ].join(','))
        ].join('\n');
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `iniciativas_parlamentarias_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Archivo exportado correctamente', 'success');
    }

    // Modal de exportación con filtros
    function ensureExportModalStyles() {
        if (document.getElementById('export-modal-styles')) return;
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

    function openExportModal() {
        ensureExportModalStyles();
        let modal = document.getElementById('exportModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'exportModal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content">
                    <h3 class="modal-title">Exportar Excel</h3>
                    <div class="modal-text">Aplica filtros antes de exportar. Por defecto, puedes acotar por fecha.</div>
                    <div class="filters-grid">
                        <div>
                            <label class="small">Fecha desde</label>
                            <input id="exportStartDate" type="date" class="input" />
                        </div>
                        <div>
                            <label class="small">Fecha hasta</label>
                            <input id="exportEndDate" type="date" class="input" />
                        </div>
                    </div>
                    <div style="margin-top:12px; font-weight:600; color:#0b2431;">Filtros adicionales</div>
                    <div id="exportFilters" class="filters-grid" style="margin-top:8px;"></div>
                    <div><button id="addExportFilter" class="btn" style="margin-top:8px;">Añadir filtro</button></div>
                    <div class="modal-buttons">
                        <button class="btn" id="cancelExport">Cancelar</button>
                        <button class="btn btn-primary" id="confirmExport">Exportar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const filtersContainer = modal.querySelector('#exportFilters');
        const addBtn = modal.querySelector('#addExportFilter');
        filtersContainer.innerHTML = '';

        const addFilterRow = () => {
            const row = document.createElement('div');
            row.className = 'filter-row';
            row.innerHTML = `
                <select class="select export-col">
                    <option value="id">ID</option>
                    <option value="sector">Sector</option>
                    <option value="tema">Tema</option>
                    <option value="marco">Marco Geográfico</option>
                    <option value="titulo">Título Iniciativa</option>
                    <option value="fuente">Fuente</option>
                    <option value="proponente">Proponente</option>
                    <option value="tipo">Tipo Iniciativa</option>
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
        // Una fila por defecto
        addFilterRow();

        modal.classList.add('show');
        document.body.style.overflow = 'hidden';

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeExportModal();
        });

        modal.querySelector('#cancelExport').onclick = () => closeExportModal();
        modal.querySelector('#confirmExport').onclick = () => {
            // Construir dataset filtrado
            const startVal = modal.querySelector('#exportStartDate').value;
            const endVal = modal.querySelector('#exportEndDate').value;
            const rows = Array.from(filtersContainer.querySelectorAll('.filter-row'));
            let data = [...iniciativasData];

            // Filtrar por fecha si procede (usando lógica normalizada)
            if (startVal) {
                console.log('📅 Exportación: Filtrando por fecha desde:', startVal);
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
                        console.error('❌ Error procesando fecha en exportación:', error, item.fecha);
                        return false;
                    }
                });
                console.log('📊 Datos después de filtro fecha desde:', data.length);
            }
            if (endVal) {
                console.log('📅 Exportación: Filtrando por fecha hasta:', endVal);
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
                        console.error('❌ Error procesando fecha hasta en exportación:', error, item.fecha);
                        return false;
                    }
                });
                console.log('📊 Datos después de filtro fecha hasta:', data.length);
            }

            // Filtros adicionales (contains, case-insensitive)
            rows.forEach(r => {
                const col = r.querySelector('.export-col').value;
                const val = (r.querySelector('.export-val').value || '').toLowerCase();
                if (!val) return;
                data = data.filter(item => String(item[col] ?? '').toLowerCase().includes(val));
            });

        console.log('📊 Exportando', data.length, 'registros de iniciativas parlamentarias');
        
        // Log de muestra para verificar escape de comas
        if (data.length > 0) {
            const sampleTitles = data.slice(0, 3).map(item => item.titulo).filter(t => t && t.includes(','));
            if (sampleTitles.length > 0) {
                console.log('📝 Títulos con comas encontrados (muestra):', sampleTitles);
            }
        }
        
        exportToExcelWithData(data);
            closeExportModal();
        };
    }

    function closeExportModal() {
        const modal = document.getElementById('exportModal');
        if (!modal) return;
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }

    // Mostrar mensaje toast
    function showToast(message, type = 'info') {
        // Crear elemento toast
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
        
        // Remover después de 3 segundos
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }
    
    // Eliminamos la lógica de tooltip; ya expandimos con CSS en hover
    function setupTooltips() {
        // Sin-op para mantener llamadas existentes sin romper
    }

    // Añadir animaciones CSS si no existen
    if (!document.getElementById('iniciativas-animations')) {
        const style = document.createElement('style');
        style.id = 'iniciativas-animations';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // Inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupTabNavigation);
    } else {
        setupTabNavigation();
    }

    // Exportar funciones públicas al scope global si es necesario
    window.iniciativasModule = {
        init: initIniciativas,
        refresh: renderTable
    };
})();