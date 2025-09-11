// iniciativas_parlamentarias.js - Gestión de la vista de Iniciativas Parlamentarias

(function() {
    // Variables globales del módulo
    let iniciativasData = [];
    let filteredData = [];
    let currentPage = 1;
    const itemsPerPage = 25;
    let currentSort = { column: null, direction: 'asc' };

    // Generar datos dummy para demostración
    function generateDummyData() {
        const sectores = ['Energía', 'Sanidad', 'Tecnología', 'Transporte', 'Educación', 'Medio ambiente', 'Industria', 'Comercio'];
        const temas = ['Sostenibilidad', 'Digitalización', 'Empleo', 'Inversión pública', 'Regulación', 'Innovación', 'Competitividad', 'Transparencia'];
        const marcos = ['Nacional', 'Autonómico', 'Europeo', 'Provincial', 'Municipal'];
        const fuentes = ['Congreso', 'Senado', 'Parlamento Europeo', 'Parlamento Autonómico'];
        const proponentes = ['PSOE', 'PP', 'VOX', 'Sumar', 'ERC', 'PNV', 'Bildu', 'Ciudadanos', 'Compromís'];
        const tipos = ['Proposición de Ley', 'Proposición no de Ley', 'Moción', 'Interpelación', 'Pregunta oral', 'Pregunta escrita', 'Comparecencia'];
        
        const data = [];
        for (let i = 1; i <= 150; i++) {
            data.push({
                id: `INI-${String(i).padStart(4, '0')}`,
                sector: sectores[Math.floor(Math.random() * sectores.length)],
                tema: temas[Math.floor(Math.random() * temas.length)],
                marco: marcos[Math.floor(Math.random() * marcos.length)],
                titulo: `Iniciativa sobre ${temas[Math.floor(Math.random() * temas.length)].toLowerCase()} en el sector ${sectores[Math.floor(Math.random() * sectores.length)].toLowerCase()}`,
                fuente: fuentes[Math.floor(Math.random() * fuentes.length)],
                proponente: proponentes[Math.floor(Math.random() * proponentes.length)],
                tipo: tipos[Math.floor(Math.random() * tipos.length)],
                fecha: generateRandomDate(),
                link: `https://ejemplo.congreso.es/iniciativa/${i}`
            });
        }
        return data;
    }

    function generateRandomDate() {
        const start = new Date(2024, 0, 1);
        const end = new Date();
        const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
        return date.toISOString().split('T')[0];
    }

    // Inicializar la vista
    function initIniciativas() {
        // Cargar datos dummy
        iniciativasData = generateDummyData();
        filteredData = [...iniciativasData];
        
        // Configurar event listeners
        setupEventListeners();
        
        // Renderizar tabla inicial
        renderTable();
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

        // Ordenamiento de columnas
        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', handleSort);
        });

        // Paginación
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        if (prevBtn) prevBtn.addEventListener('click', () => changePage(-1));
        if (nextBtn) nextBtn.addEventListener('click', () => changePage(1));

        // Exportar a Excel
        const exportBtn = document.getElementById('export-excel');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportToExcel);
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
            if (fechaDesde) {
                matchesDateFrom = item.fecha >= fechaDesde;
            }
            
            // Filtro de fecha hasta
            let matchesDateTo = true;
            if (fechaHasta) {
                matchesDateTo = item.fecha <= fechaHasta;
            }
            
            return matchesSearch && matchesDateFrom && matchesDateTo;
        });
        
        currentPage = 1;
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
        filteredData.sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];
            
            // Manejar fechas
            if (column === 'fecha') {
                aVal = new Date(aVal);
                bVal = new Date(bVal);
            }
            
            if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
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
        
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        const start = (currentPage - 1) * itemsPerPage;
        const end = Math.min(start + itemsPerPage, filteredData.length);
        const pageData = filteredData.slice(start, end);
        
        // Limpiar tabla
        tbody.innerHTML = '';
        
        // Renderizar filas
        pageData.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.id}</td>
                <td><span class="sector-bubble">${item.sector}</span></td>
                <td>${item.tema}</td>
                <td>${item.marco}</td>
                <td class="titulo-cell" data-titulo="${item.titulo.replace(/"/g, '&quot;')}">${item.titulo}</td>
                <td>${item.fuente}</td>
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
                    </a>
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
        // Configurar tooltips después de añadir todas las filas
        setupTooltips();
        
        // Actualizar información de paginación
        updatePaginationInfo(start + 1, end, filteredData.length, currentPage, totalPages);
    }

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

    // Exportar a Excel
    function exportToExcel() {
        // Preparar datos para CSV
        const headers = ['ID', 'Sector', 'Tema', 'Marco Geográfico', 'Título Iniciativa', 'Fuente', 'Proponente', 'Tipo Iniciativa', 'Fecha', 'Link'];
        const csvContent = [
            headers.join(','),
            ...filteredData.map(item => [
                item.id,
                `"${item.sector}"`,
                `"${item.tema}"`,
                `"${item.marco}"`,
                `"${item.titulo.replace(/"/g, '""')}"`,
                `"${item.fuente}"`,
                `"${item.proponente}"`,
                `"${item.tipo}"`,
                item.fecha,
                item.link
            ].join(','))
        ].join('\n');
        
        // Crear blob y descargar
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `iniciativas_parlamentarias_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Mostrar mensaje de éxito
        showToast('Archivo exportado correctamente', 'success');
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
    
    // Variables para el tooltip
    let currentTooltip = null;
    
    // Mostrar tooltip
    function showTooltip(element, text) {
        // Remover tooltip anterior si existe
        hideTooltip();
        
        // Crear nuevo tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'titulo-tooltip';
        tooltip.textContent = text;
        
        // Estilos inline para asegurar que funcione
        tooltip.style.cssText = `
            position: fixed;
            z-index: 1000;
            background: white;
            border: 1px solid #e9ecef;
            border-radius: 12px;
            padding: 12px 16px;
            box-shadow: 0 8px 24px rgba(11,36,49,.15);
            font-size: 14px;
            line-height: 1.5;
            color: #455862;
            max-width: 400px;
            white-space: normal;
            word-wrap: break-word;
            pointer-events: none;
            opacity: 0;
            transform: translateY(-5px);
            transition: all 0.2s ease;
        `;
        
        // Posicionar tooltip
        const rect = element.getBoundingClientRect();
        tooltip.style.left = rect.left + 'px';
        tooltip.style.top = (rect.top - 60) + 'px';
        
        document.body.appendChild(tooltip);
        
        // Ajustar posición si se sale de la pantalla
        setTimeout(() => {
            const tooltipRect = tooltip.getBoundingClientRect();
            
            // Ajustar si se sale por la derecha
            if (tooltipRect.right > window.innerWidth - 20) {
                tooltip.style.left = (window.innerWidth - tooltipRect.width - 20) + 'px';
            }
            
            // Ajustar si se sale por la izquierda
            if (tooltipRect.left < 20) {
                tooltip.style.left = '20px';
            }
            
            // Ajustar si se sale por arriba
            if (tooltipRect.top < 10) {
                tooltip.style.top = (rect.bottom + 10) + 'px';
            }
            
            // Mostrar con animación
            tooltip.style.opacity = '1';
            tooltip.style.transform = 'translateY(0)';
            
        }, 10);
        
        currentTooltip = tooltip;
    }
    
    // Ocultar tooltip
    function hideTooltip() {
        if (currentTooltip) {
            currentTooltip.classList.remove('show');
            setTimeout(() => {
                if (currentTooltip && currentTooltip.parentNode) {
                    currentTooltip.parentNode.removeChild(currentTooltip);
                }
                currentTooltip = null;
            }, 200);
        }
    }
    
    // Configurar tooltips para las celdas de título
    function setupTooltips() {
        const tituloCells = document.querySelectorAll('.titulo-cell');
        
        tituloCells.forEach(cell => {
            // Remover listeners anteriores si existen
            cell.onmouseenter = null;
            cell.onmouseleave = null;
            
            cell.addEventListener('mouseenter', function(e) {
                // Esperar un frame para que el elemento esté completamente renderizado
                setTimeout(() => {
                    // Verificar si el texto está truncado
                    if (e.target.scrollWidth > e.target.clientWidth) {
                        const titulo = e.target.getAttribute('data-titulo') || e.target.textContent;
                        showTooltip(e.target, titulo);
                    }
                }, 10);
            });
            
            cell.addEventListener('mouseleave', function() {
                hideTooltip();
            });
        });
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