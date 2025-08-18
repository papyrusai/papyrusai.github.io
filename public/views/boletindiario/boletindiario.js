// ==================== BOLETIN DIARIO - JAVASCRIPT ====================

// Variables globales para el boletín diario
let boletinDiarioData = { // Para almacenar los datos actuales
    date: null,
    documents: [],
    availableBoletines: [],
    availableRangos: []
};
let boletinDiarioLoaded = false; // Para cargar solo una vez al activar la sección

// Función para obtener los datos del Boletín Diario desde la API
window.fetchBoletinDiario = async function() {
    const loadingIcon = document.getElementById('boletin-loading-icon');
    const container = document.getElementById('boletin-documentos-container');
    const fechaContainer = document.getElementById('boletin-fecha');

    if (!loadingIcon || !container || !fechaContainer) return; // Salir si los elementos no existen

    loadingIcon.style.display = 'block';
    container.innerHTML = ''; // Limpiar contenedor
    fechaContainer.textContent = 'Cargando fecha...';

    // Obtener filtros seleccionados
    const selectedBoletines = getSelectedCheckboxes('boletinDiarioDropdown');
    const selectedRangos = getSelectedCheckboxes('rangoDiarioDropdown');

    // Construir URL con parámetros
    const params = new URLSearchParams();
    // Solo añadir el parámetro si no se seleccionó 'Todos' (o si el array no está vacío)
    if (selectedBoletines.length > 0) {
        params.append('boletines', JSON.stringify(selectedBoletines));
    }
    if (selectedRangos.length > 0) {
        params.append('rangos', JSON.stringify(selectedRangos));
    }

    try {
        console.log(`Fetching /api/boletin-diario?${params.toString()}`);
        const response = await fetch(`/api/boletin-diario?${params.toString()}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        boletinDiarioData = await response.json();
        console.log('Boletin Diario Data Received:', boletinDiarioData);

        // Actualizar fecha
        if (boletinDiarioData.date) {
            fechaContainer.textContent = `Documentos del ${String(boletinDiarioData.date.dia).padStart(2, '0')}/${String(boletinDiarioData.date.mes).padStart(2, '0')}/${boletinDiarioData.date.anio}`;
        } else {
            fechaContainer.textContent = 'No se encontraron documentos para la fecha más reciente.';
        }

        // Renderizar documentos
        renderBoletinDocumentos(boletinDiarioData.documents);

        // Poblar filtros (solo la primera vez que se cargan los datos)
        if (!boletinDiarioLoaded) {
            // Usar los datos devueltos por la API para asegurar consistencia
            await window.populateBoletinDiarioFilters(boletinDiarioData.availableBoletines || [], boletinDiarioData.availableRangos || []);
            boletinDiarioLoaded = true;
        }

    } catch (error) {
        console.error('Error fetching Boletin Diario:', error);
        container.innerHTML = `<p style="color: red;">Error al cargar los documentos del boletín diario. Detalles: ${error.message}</p>`;
        fechaContainer.textContent = 'Error al cargar la fecha.';
    } finally {
        if (loadingIcon) loadingIcon.style.display = 'none';
        
        // Ocultar overlay principal después de cargar el boletín (éxito o error)
        if (typeof window.hidePageLoaderOverlay === 'function') {
            window.hidePageLoaderOverlay();
        }
    }
}

// Función para renderizar los documentos del boletín
function renderBoletinDocumentos(documents) {
    const container = document.getElementById('boletin-documentos-container');
    if (!container) return;

    if (!documents || documents.length === 0) {
        // Limpiar contenedor y mostrar mensaje inicial
        container.innerHTML = '';
        const initialMessage = document.getElementById('boletin-initial-message');
        if (initialMessage) {
            initialMessage.style.display = 'block';
            initialMessage.textContent = 'No hay documentos para mostrar correspondientes a la fecha y filtros seleccionados.';
        }
        return;
    }

    // Ocultar mensaje inicial si existe
    const initialMessage = document.getElementById('boletin-initial-message');
    if (initialMessage) {
        initialMessage.style.display = 'none';
    }

    const documentsHtml = documents.map(doc => {
        const rangoToShow = doc.rango_titulo || "Indefinido";
        const collectionName = doc.collectionName || "Fuente Desconocida";

        // Generar HTML para ramas_juridicas como tags
        const ramasHtml = (doc.ramas_juridicas && doc.ramas_juridicas.length > 0)
            ? `<span class="boletin-tags"> ${doc.ramas_juridicas.map(rama => `<span class="tag-rama">${rama}</span>`).join(' ')}</span>`
            : '';

        // Generar HTML para divisiones_cnae como tags (asumiendo que es un array)
        // Asegurarse que doc.divisiones_cnae existe y es un array
        const divisionesArray = Array.isArray(doc.divisiones) ? doc.divisiones : [];
        const divisionesHtml = (divisionesArray.length > 0)
            ? `<span class="boletin-tags">${divisionesArray.map(div => `<span class="tag-division">${div}</span>`).join(' ')}</span>`
            : '';

        // Reutilizar la estructura de .data-item
        return `
          <div class="data-item">
            <div class="header-row">
              <div class="id-values">${doc.short_name || 'Título no disponible'}</div>
              <span class="date"><em>${doc.dia}/${doc.mes}/${doc.anio}</em></span>
            </div>
            <div style="color: gray; font-size: 1.1em; margin-bottom: 6px;">
              ${rangoToShow} | ${collectionName}
            </div>
            ${ramasHtml}
            ${divisionesHtml}
            <div class="resumen-label">Resumen</div>
            <div class="resumen-content">${doc.resumen || 'Resumen no disponible.'}</div>
            <div class="margin-impacto">
              <a class="button-impacto"
                 href="/views/analisis/norma.html?documentId=${doc._id}&collectionName=${collectionName}">
                 Analizar documento
              </a>
            </div>
            ${doc.url_pdf || doc.url_html ? 
              `<a class="leer-mas" href="${doc.url_pdf || doc.url_html}" target="_blank" style="margin-right: 15px;">
                Leer más: ${doc._id}
              </a>` : 
              `<span class="leer-mas" style="margin-right: 15px; color: #ccc;">
                Leer más: ${doc._id} (No disponible)
              </span>`
            }
            
            <!-- Botón de Guardar -->
            <div class="guardar-button">
              <button class="save-btn" onclick="toggleListsDropdown(this, '${doc._id}', '${collectionName}')">
                <i class="fas fa-bookmark"></i>
                Guardar
              </button>
              <div class="lists-dropdown">
                <div class="lists-dropdown-header">
                  <span>Guardar en...</span>
                  <button class="save-ok-btn" onclick="saveToSelectedLists(this)">OK</button>
                </div>
                <div class="lists-content">
                  <div class="lists-container">
                    <!-- Las listas se cargarán dinámicamente -->
                  </div>
                  <div class="add-new-list" onclick="showNewListForm(this)">
                    <i class="fas fa-plus"></i>
                    Añadir nueva
                  </div>
                  <div class="new-list-form">
                    <input type="text" class="new-list-input" placeholder="Nombre de la nueva lista" maxlength="50">
                    <div class="new-list-buttons">
                      <button class="new-list-btn cancel" onclick="hideNewListForm(this)">Cancelar</button>
                      <button class="new-list-btn save" onclick="createNewList(this, '${doc._id}', '${collectionName}')">OK</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
    }).join('');

    container.innerHTML = documentsHtml;
}

// Función para poblar los dropdowns de filtros del Boletín Diario
window.populateBoletinDiarioFilters = async function(boletines, rangos) {
    const boletinDropdown = document.getElementById('boletinDiarioDropdown');
    const rangoDropdown = document.getElementById('rangoDiarioDropdown');

    if (!boletinDropdown || !rangoDropdown) return;

    // Poblar Boletines
    let boletinHtml = '<label><input type="checkbox" value="Todos" checked onchange="handleCheckboxChange(this, \'boletinDiarioDropdown\', \'selectedBoletinesDiario\')"> Todos</label>';
    
    // Para el boletín diario, obtener TODAS las fuentes disponibles dinámicamente (similar a newsletter.js)
    try {
        console.log('Fetching available collections from /api/available-collections...');
        const response = await fetch('/api/available-collections');
        if (response.ok) {
            const data = await response.json();
            const allBoletines = data.collections || [];
            console.log('Available collections loaded:', allBoletines);
            
            allBoletines.forEach(b => {
                boletinHtml += `<label><input type="checkbox" value="${b}" checked onchange="handleCheckboxChange(this, \'boletinDiarioDropdown\', \'selectedBoletinesDiario\')"> ${b}</label>`;
            });
        } else {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (error) {
        console.warn('Error fetching available collections, using fallback list:', error);
        // Fallback: Lista completa de todas las fuentes conocidas
        const fallbackBoletines = [
            // Fuentes Oficiales Europeas y Nacionales
            "DOUE", "BOE", "BOCG",
            // Fuentes Oficiales Regionales
            "BOPV", "CGCC", "DOGC", "DOG", "BOC", "BORM", "BOA", "BOCM", "DOE", "BOCYL", "BOJA",
            "BOIB", "BOPA", "DOGV",
            // Reguladores
            "EBA", "EBA_QA", "ESMA", "ESMA_QA", "CNMV", "INCIBE", "CNMC", "AEPD", "NIST",
            // Comunicados y prensa
            "CEPC", "NIST_NEWS"
        ];
        
        fallbackBoletines.forEach(b => {
            boletinHtml += `<label><input type="checkbox" value="${b}" checked onchange="handleCheckboxChange(this, \'boletinDiarioDropdown\', \'selectedBoletinesDiario\')"> ${b}</label>`;
        });
    }
    
    boletinDropdown.innerHTML = boletinHtml;
    updateSelectedText('boletinDiarioDropdown', 'selectedBoletinesDiario'); // Actualizar texto inicial

    // Poblar Rangos
    let rangoHtml = '<label><input type="checkbox" value="Todos" checked onchange="handleCheckboxChange(this, \'rangoDiarioDropdown\', \'selectedRangoDiario\')"> Todos</label>';

    // Determinar la lista de rangos a mostrar
    let rangosParaMostrar = [];

    if (!rangos || !Array.isArray(rangos) || rangos.length === 0) {
        // Intentar obtener el listado completo desde la etiqueta <script id="allRangosData">
        try {
            const allRangosElement = document.getElementById('allRangosData');
            if (allRangosElement) {
                rangosParaMostrar = JSON.parse(allRangosElement.textContent || '[]');
            }
        } catch (e) {
            console.warn('No se pudo parsear allRangosData, usando lista por defecto.', e);
        }

        // Si sigue vacío, usar un fallback hard-coded (catalogo_etiquetas.json > rangos_normativos)
        if (!Array.isArray(rangosParaMostrar) || rangosParaMostrar.length === 0) {
            rangosParaMostrar = [
                "Acuerdos Internacionales",
                "Normativa Europea",
                "Legislacion Nacional",
                "Normativa Reglamentaria",
                "Decisiones Judiciales",
                "Doctrina Administrativa",
                "Comunicados, Guias y Opiniones Consultivas",
                "Consultas Publicas",
                "Normativa en tramitación",
                "Otras"
            ];
        }
    } else {
        rangosParaMostrar = rangos;
    }

    // Generar los checkboxes
    rangosParaMostrar.forEach(r => {
        rangoHtml += `<label><input type="checkbox" value="${r}" checked onchange="handleCheckboxChange(this, \'rangoDiarioDropdown\', \'selectedRangoDiario\')"> ${r}</label>`;
    });
    
    rangoDropdown.innerHTML = rangoHtml;
    updateSelectedText('rangoDiarioDropdown', 'selectedRangoDiario'); // Actualizar texto inicial
}

// Funciones auxiliares para manejar dropdowns
window.toggleBoletinDiarioDropdown = function() {
    closeOtherDropdowns('boletinDiarioDropdown');
    document.getElementById("boletinDiarioDropdown").classList.toggle("show");
}

window.toggleRangoDiarioDropdown = function() {
    closeOtherDropdowns('rangoDiarioDropdown');
    document.getElementById("rangoDiarioDropdown").classList.toggle("show");
}

function closeOtherDropdowns(excludeId) {
    const dropdowns = document.getElementsByClassName("dropdown-content");
    for (let i = 0; i < dropdowns.length; i++) {
        if (dropdowns[i].id !== excludeId && dropdowns[i].classList.contains('show')) {
            dropdowns[i].classList.remove('show');
        }
    }
}

// Función para manejar cambios en checkboxes
window.handleCheckboxChange = function(checkbox, dropdownId, selectedSpanId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
    const todosCheckbox = checkboxes[0]; // Asume que "Todos" es el primero

    if (checkbox.value === "Todos") {
        checkboxes.forEach(cb => cb.checked = checkbox.checked);
    } else {
        if (!checkbox.checked) {
            todosCheckbox.checked = false;
        }
        let allOthersChecked = true;
        for (let i = 1; i < checkboxes.length; i++) {
            if (!checkboxes[i].checked) {
                allOthersChecked = false;
                break;
            }
        }
        // Solo marcar 'Todos' si *todos* los demás están marcados
        todosCheckbox.checked = allOthersChecked;
    }
    updateSelectedText(dropdownId, selectedSpanId);
}

// Función para actualizar el texto seleccionado
function updateSelectedText(dropdownId, selectedSpanId) {
    const dropdown = document.getElementById(dropdownId);
    const selectedSpan = document.getElementById(selectedSpanId);
    if (!dropdown || !selectedSpan) return;

    const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]:checked');
    const todosCheckbox = dropdown.querySelector('input[value="Todos"]');
    let count = 0;
    let firstSelectedValue = '';

    checkboxes.forEach(cb => {
        if (cb.value !== 'Todos') {
            count++;
            if (count === 1) firstSelectedValue = cb.value;
        }
    });

    if (todosCheckbox.checked || count === 0) {
        selectedSpan.textContent = 'Todos';
    } else if (count === 1) {
        selectedSpan.textContent = firstSelectedValue;
    } else {
        selectedSpan.textContent = `${count} seleccionados`;
    }
}

// Función auxiliar para obtener valores seleccionados (excluyendo "Todos" si otros están marcados)
function getSelectedCheckboxes(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return [];
    const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]:checked');
    const selectedValues = [];
    let todosSelected = false;

    checkboxes.forEach(cb => {
        if (cb.value === 'Todos') {
            todosSelected = true;
        } else {
            selectedValues.push(cb.value);
        }
    });

    // Si 'Todos' está seleccionado O no hay ninguna otra selección, el backend debe interpretar como 'todos'.
    // Devolvemos un array vacío en ese caso para que el backend aplique su lógica por defecto (usar todos los disponibles).
    if (todosSelected || selectedValues.length === 0) {
        return [];
    }
    // Si hay selecciones específicas (y 'Todos' no está marcado, o lo está pero hay otras selecciones), devolvemos esas selecciones.
    return selectedValues;
}

// Función para verificar si el boletín diario ya fue cargado
window.isBoletinDiarioLoaded = function() {
    return boletinDiarioLoaded;
}

// Función para marcar el boletín diario como cargado
window.setBoletinDiarioLoaded = function(loaded) {
    boletinDiarioLoaded = loaded;
}

// Función para obtener los datos del boletín diario
window.getBoletinDiarioData = function() {
    return boletinDiarioData;
}

// Función de inicialización que se ejecuta cuando se carga el archivo
document.addEventListener('DOMContentLoaded', function() {
    console.log('Boletín Diario JS loaded');
    
    // Si existen las funciones globales de manejo de listas, no hay problema
    // Si no, las funciones del botón "Guardar" simplemente no funcionarán hasta que se carguen
    
    // Configurar event listeners para el newsletter banner
    setTimeout(() => {
        if (typeof window.saveEmailPreference === 'function') {
            const acceptBtn = document.getElementById('accept-newsletter');
            const rejectBtn = document.getElementById('reject-newsletter');
            
            if (acceptBtn) {
                acceptBtn.addEventListener('click', function() {
                    window.saveEmailPreference(true);
                });
            }
            
            if (rejectBtn) {
                rejectBtn.addEventListener('click', function() {
                    window.saveEmailPreference(false);
                });
            }
        }
    }, 500); // Esperar un poco para que se carguen las funciones globales
});
