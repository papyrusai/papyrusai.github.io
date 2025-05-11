// Global variables
let catalogoEtiquetas = null;
let currentStep = 0; // 0: Industrias, 1: Ramas, 2: Fuentes, 3: Rangos

// Function to read cookie by name
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// Function to check if user is authorized
function checkUserAuthorization() {
  console.log('Checking user authorization...');
  
  const userEmailFromSession = sessionStorage.getItem('userEmail');
  console.log('userEmail from sessionStorage:', userEmailFromSession);
  
  const userEmailFromCookie = getCookie('userEmail');
  console.log('userEmail from cookie:', userEmailFromCookie);
  
  const userEmail = userEmailFromSession || userEmailFromCookie;
  
  if (!userEmail) {
    console.log('No user email found, redirecting to login');
    window.location.href = 'index.html';
    return false;
  }
  
  // If we found a cookie but not in sessionStorage, save it
  if (!userEmailFromSession && userEmailFromCookie) {
    console.log('Saving email from cookie to sessionStorage');
    sessionStorage.setItem('userEmail', userEmailFromCookie);
  }
  
  console.log('User is authorized with email:', userEmail);
  return true;
}

document.addEventListener('DOMContentLoaded', async function() {
  
  // Check user authorization first
  if (!checkUserAuthorization()) {
    return; // Stop execution if not authorized
  }
  
  // Debug logging for plan info
  const selectedPlan = sessionStorage.getItem('selectedPlan');
 /*
  console.log('=== PLAN DEBUG INFO ===');
  console.log('selectedPlan from paso0:', selectedPlan);
  console.log('getCurrentPlan() result:', getCurrentPlan());
  console.log('Plan limits:', window.PLAN_LIMITS);
  if (selectedPlan) {
    console.log(`Limits for selectedPlan (${selectedPlan}):`, window.PLAN_LIMITS[selectedPlan]);
  }
  console.log('=====================');
  */
  
  // Handle return from Stripe checkout
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('stripe_session') || urlParams.has('session_id') || urlParams.has('canceled')) {
    const confirmBtn = document.getElementById('confirmar-btn');
    if (confirmBtn) {
      // Restore the original button state
      const originalButtonText = sessionStorage.getItem('originalButtonText') || 'Confirmar';
      confirmBtn.innerHTML = originalButtonText;
      confirmBtn.style.display = '';
      confirmBtn.disabled = false;
      
      if (urlParams.has('canceled')) {
        // User canceled the checkout
        alert('Has cancelado el proceso de pago. Puedes continuar personalizando tu plan.');
      }
    }
  }
  
  const skeletonLoader = document.getElementById('skeleton-loader');
  const formContent = document.getElementById('form-content');
  
  // Mostrar el skeleton loader y ocultar el contenido real
  if (skeletonLoader && formContent) {
    skeletonLoader.style.display = 'block';
    formContent.style.display = 'none';
  }
  
  // Check if we're in editing mode
  const isEditing = sessionStorage.getItem('isEditing') === 'true';
  await cargarCatalogoEtiquetas();

  const etiquetas = JSON.parse(sessionStorage.getItem('etiquetasRecomendadas'));
  if (!etiquetas) {
    window.location.href = 'paso2.html';
    return;
  }
  cargarSecciones(etiquetas);
  cargarRangosPredefinidos();
  inicializarSubmenu();
  updateButtonLayout();
  // Add this line to setup the new click handlers
  setupFilterClickHandlers();
  actualizarContadorEtiquetas();
  actualizarContadorFuentes();

   // Add title to indicate editing mode if needed
   if (isEditing) {
    const title = document.querySelector('h2');
    if (title) {
      title.textContent = 'Editar Mi Avatar Jurídico';
    }
    const subtitle = document.querySelector('p');
    if (subtitle) {
      subtitle.textContent = 'Actualiza tus preferencias y filtros según sea necesario.';
    }
  }

  // Ocultar el skeleton loader y mostrar el contenido real cuando todo esté cargado
  setTimeout(function() {
    if (skeletonLoader && formContent) {
      skeletonLoader.style.display = 'none';
      formContent.style.display = 'block';
    }
  }, 800);
  
  // Handle clicks outside dropdowns to close them
  document.addEventListener('click', function(e) {
    const target = e.target;
    
    // Get references to dropdown toggles and dropdown containers
    const fuentesGobToggle = document.querySelector('.dropdown-toggle[onclick*="dropdown-fuentes-gobierno"]');
    const fuentesRegToggle = document.querySelector('.dropdown-toggle[onclick*="dropdown-fuentes-reguladores"]');
    
    const dropdownFuentesGob = document.getElementById('dropdown-fuentes-gobierno');
    const dropdownFuentesReg = document.getElementById('dropdown-fuentes-reguladores');

    // Only close dropdown if it's open and click is outside of both the dropdown and its toggle
    if (dropdownFuentesGob && dropdownFuentesGob.classList.contains('show')) {
      if (!dropdownFuentesGob.contains(target) && 
          fuentesGobToggle && !fuentesGobToggle.contains(target)) {
        dropdownFuentesGob.classList.remove('show');
      }
    }
    
    if (dropdownFuentesReg && dropdownFuentesReg.classList.contains('show')) {
      if (!dropdownFuentesReg.contains(target) && 
          fuentesRegToggle && !fuentesRegToggle.contains(target)) {
        dropdownFuentesReg.classList.remove('show');
      }
    }
    
    // Handle rangos dropdown
    const filtroRangos = document.getElementById('filtro-rangos');
    const dropdownRangos = document.getElementById('dropdown-rangos');
    if (dropdownRangos && !dropdownRangos.contains(target) && target !== filtroRangos) {
      dropdownRangos.innerHTML = "";
    }
  });
});

function updateButtonLayout() {
  const buttonContainer = document.querySelector('.button-container');
  const anteriorBtn = document.getElementById('anterior-btn');
  
  if (anteriorBtn.style.display === 'none') {
    buttonContainer.classList.add('single-button');
  } else {
    buttonContainer.classList.remove('single-button');
  }
}

// Add this function to your paso3.js file
function setupFilterClickHandlers() {
  // Fuentes gobierno filter - now using dropdown toggle instead of input
  const fuentesGobToggle = document.querySelector('.dropdown-toggle[onclick*="dropdown-fuentes-gobierno"]');
  if (fuentesGobToggle) {
    // This button already has an onclick attribute, so we don't need to add another event listener
    // The onclick attribute directly calls toggleDropdown and updateFuentesGobiernoCheckboxes
  }

  // Fuentes reguladores filter - now using dropdown toggle instead of input
  const fuentesRegToggle = document.querySelector('.dropdown-toggle[onclick*="dropdown-fuentes-reguladores"]');
  if (fuentesRegToggle) {
    // This button already has an onclick attribute, so we don't need to add another event listener
    // The onclick attribute directly calls toggleDropdown and updateFuentesReguladoresCheckboxes
  }

  // Rangos filter - still using input
  const filtroRangos = document.getElementById('filtro-rangos');
  if (filtroRangos) {
    filtroRangos.addEventListener('click', function(e) {
      e.stopPropagation();
      hideAllDropdownsExcept('dropdown-rangos');
      showAllRangosOptions();
    });
  }
}

// Helper function to hide all dropdowns except the specified one
function hideAllDropdownsExcept(exceptId) {
  const allDropdowns = [
    'dropdown-rangos'
  ];
  
  allDropdowns.forEach(id => {
    if (id !== exceptId) {
      const dropdown = document.getElementById(id);
      if (dropdown) {
        dropdown.innerHTML = "";
      }
    }
  });
  
  // Also close the fuentes dropdowns if they're not the excepted one
  if (exceptId !== 'dropdown-fuentes-gobierno') {
    const dropdownFuentesGob = document.getElementById('dropdown-fuentes-gobierno');
    if (dropdownFuentesGob) {
      dropdownFuentesGob.classList.remove('show');
    }
  }
  
  if (exceptId !== 'dropdown-fuentes-reguladores') {
    const dropdownFuentesReg = document.getElementById('dropdown-fuentes-reguladores');
    if (dropdownFuentesReg) {
      dropdownFuentesReg.classList.remove('show');
    }
  }
}

// Functions to show all options in each dropdown

/*function showAllIndustriesOptions() {
  if (!catalogoEtiquetas || !catalogoEtiquetas.industrias) return;
  const dropdown = document.getElementById('dropdown-industrias');
  dropdown.innerHTML = "";
  catalogoEtiquetas.industrias.forEach(match => {
    const option = document.createElement('div');
    option.className = "dropdown-item";
    option.textContent = match;
    option.onclick = function() {
      seleccionarIndustria(match);
    };
    dropdown.appendChild(option);
  });
}
  */
/*
function showAllRamasOptions() {
  if (!catalogoEtiquetas || !catalogoEtiquetas.ramas_juridicas) return;
  const dropdown = document.getElementById('dropdown-ramas');
  dropdown.innerHTML = "";
  catalogoEtiquetas.ramas_juridicas.forEach(match => {
    const option = document.createElement('div');
    option.className = "dropdown-item";
    option.textContent = match;
    option.onclick = function() {
      seleccionarRama(match);
    };
    dropdown.appendChild(option);
  });
}
  */

function showAllFuentesGobiernoOptions() {
  // Don't clear the dropdown since we're now using static HTML for the checkboxes
  const dropdown = document.getElementById('dropdown-fuentes-gobierno');
  
  // Just show the dropdown instead of modifying its content
  dropdown.classList.add('show');
  
  // Update checkboxes based on current selections
  updateFuentesGobiernoCheckboxes();
}

function showAllFuentesReguladoresOptions() {
  // Don't clear the dropdown since we're now using static HTML for the checkboxes
  const dropdown = document.getElementById('dropdown-fuentes-reguladores');
  
  // Just show the dropdown instead of modifying its content
  dropdown.classList.add('show');
  
  // Update checkboxes based on current selections
  updateFuentesReguladoresCheckboxes();
}

function showAllRangosOptions() {
  const dropdown = document.getElementById('dropdown-rangos');
  if (!catalogoEtiquetas || !catalogoEtiquetas.rangos_normativos) return;
  catalogoEtiquetas.rangos_normativos.forEach(match => {
    const option = document.createElement('div');
    option.className = "dropdown-item";
    option.textContent = match;
    option.onclick = function() {
      seleccionarRango(match);
    };
    dropdown.appendChild(option);
  });
}

async function cargarCatalogoEtiquetas() {
  try {
    const respuesta = await fetch('catalogo_etiquetas.json');
    catalogoEtiquetas = await respuesta.json();
    console.log("Catálogo de etiquetas cargado:", catalogoEtiquetas);
  } catch (error) {
    console.error('Error al cargar el catálogo de etiquetas:', error);
    catalogoEtiquetas = {rangos_normativos:{} }; //industrias: [], ramas_juridicas: [], subramas_juridicas: {}, 
  }
}

function cargarSecciones(etiquetas) {
  console.log("Cargando secciones con etiquetas:", etiquetas);
  
  // Cargar etiquetas personalizadas primero (ahora es la primera sección - section-agentes)
  cargarEtiquetasPersonalizadas(etiquetas.etiquetas_personalizadas || {});
  actualizarContadorEtiquetas();
  
  // Luego cargar fuentes (ahora es la segunda sección - section-fuentes)
  cargarFuentesOficiales(etiquetas);
  
  // Finalmente cargar rangos (ahora es la tercera sección - section-rangos)
  cargarRangosPredefinidos();
}


/*------------------- Etiquetas Personalizadas ------------*/

function cargarEtiquetasPersonalizadas(etiquetas) {
  // Cargar etiquetas como tags
  /*const tagsContainer = document.querySelector('.etiquetas-tags-scroll');
  tagsContainer.innerHTML = '';
  */
  // Cargar etiquetas con definiciones
  const container = document.getElementById('etiquetas-personalizadas-container');
  container.innerHTML = '';
  
  Object.keys(etiquetas).forEach(etiqueta => {
    // Crear tag para la vista de tags
    const etiquetaTag = document.createElement('div');
    etiquetaTag.className = 'etiqueta-tag';
    etiquetaTag.innerHTML = `
      <span>${etiqueta}</span>
      <span class="tag-remove" onclick="eliminarEtiquetaPersonalizada('${etiqueta}')">×</span>
    `;
    //tagsContainer.appendChild(etiquetaTag);
    
    // Crear caja para la vista detallada
    const ramaBox = document.createElement('div');
    ramaBox.className = 'rama-box';
    ramaBox.style.width = "100%";
    ramaBox.setAttribute('data-etiqueta', etiqueta);
    
    const ramaHeader = document.createElement('div');
    ramaHeader.className = 'rama-header';
    ramaHeader.innerHTML = `
      <h4>${etiqueta}</h4>
      <div>
        <button class="edit-button" onclick="habilitarEdicionEtiqueta('${etiqueta}')">
              <span class="edit-text">Editar</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <span class="tag-remove" onclick="eliminarEtiquetaPersonalizada('${etiqueta}') ">×</span>
      </div>
    `;
    
    ramaBox.appendChild(ramaHeader);
    
    // Crear el contenedor para la descripción (visible por defecto)
    const detailDiv = document.createElement('div');
    detailDiv.className = 'rama-detail';
    detailDiv.style.display = 'block'; // Visible por defecto
    
    // Añadir la descripción de la etiqueta
    const descripcion = document.createElement('p');
    descripcion.className = 'etiqueta-descripcion';
    descripcion.textContent = etiquetas[etiqueta];
    detailDiv.appendChild(descripcion);
    
    ramaBox.appendChild(detailDiv);
    container.appendChild(ramaBox);
     
  // Actualizar el contador
  actualizarContadorEtiquetas();
  });
}

// Función para habilitar la edición de una etiqueta
function habilitarEdicionEtiqueta(etiqueta) {
  const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
  if (!etiquetas || !etiquetas.etiquetas_personalizadas || !etiquetas.etiquetas_personalizadas[etiqueta]) return;
  
  const descripcion = etiquetas.etiquetas_personalizadas[etiqueta];
  const ramaBox = document.querySelector(`.rama-box[data-etiqueta="${etiqueta}"]`);
  if (!ramaBox) return;
  
  // Obtener elementos
  const ramaHeader = ramaBox.querySelector('.rama-header');
  const ramaDetail = ramaBox.querySelector('.rama-detail');
  
  // Guardar el contenido original
  const originalHeader = ramaHeader.innerHTML;
  const originalDetail = ramaDetail.innerHTML;
  
  // Reemplazar con formulario de edición
  ramaHeader.innerHTML = `
    <input type="text" class="edit-etiqueta-nombre" value="${etiqueta}" placeholder="Nombre de la etiqueta">
    <button class="save-button" onclick="guardarEdicionEtiqueta('${etiqueta}')">Guardar</button>
  `;
  
  ramaDetail.innerHTML = `
    <textarea class="edit-etiqueta-descripcion" placeholder="Descripción de la etiqueta">${descripcion}</textarea>
  `;
  
  // Añadir botón para cancelar edición
  const cancelButton = document.createElement('button');
  cancelButton.className = 'cancel-button';
  cancelButton.textContent = 'Cancelar';
  cancelButton.onclick = function() {
    ramaHeader.innerHTML = originalHeader;
    ramaDetail.innerHTML = originalDetail;
  };
  
  ramaHeader.appendChild(cancelButton);
}

// Función para guardar la edición de una etiqueta
function guardarEdicionEtiqueta(etiquetaOriginal) {
  const ramaBox = document.querySelector(`.rama-box[data-etiqueta="${etiquetaOriginal}"]`);
  if (!ramaBox) return;
  
  const nuevoNombre = ramaBox.querySelector('.edit-etiqueta-nombre').value.trim();
  const nuevaDescripcion = ramaBox.querySelector('.edit-etiqueta-descripcion').value.trim();
  
 /* if (!nuevoNombre || !nuevaDescripcion) {
    alert('Por favor, completa tanto el nombre como la descripción de la etiqueta.');
    return;
  }
    */
  
  const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
  
  // Si el nombre ha cambiado y ya existe una etiqueta con ese nombre
  if (nuevoNombre !== etiquetaOriginal && etiquetas.etiquetas_personalizadas[nuevoNombre]) {
    if (!confirm('Ya existe una etiqueta con ese nombre. ¿Deseas sobrescribirla?')) {
      return;
    }
  }
  
  // Crear un objeto temporal para mantener el orden
  const etiquetasOrdenadas = {};
  
  // Recorrer las etiquetas actuales y construir el nuevo objeto
  Object.keys(etiquetas.etiquetas_personalizadas).forEach(key => {
    if (key === etiquetaOriginal) {
      // Reemplazar la etiqueta original con la nueva
      etiquetasOrdenadas[nuevoNombre] = nuevaDescripcion;
    } else if (key !== nuevoNombre) { // Evitar duplicados si el nombre nuevo ya existía
      etiquetasOrdenadas[key] = etiquetas.etiquetas_personalizadas[key];
    }
  });
  
  // Actualizar el objeto de etiquetas
  etiquetas.etiquetas_personalizadas = etiquetasOrdenadas;
  
  // Guardar en sessionStorage
  sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
  
  // Actualizar la interfaz
  actualizarContadorEtiquetas();
  
  // Recargar las etiquetas manteniendo el orden
  cargarEtiquetasPersonalizadas(etiquetas.etiquetas_personalizadas);
}


// Añadir función para eliminar etiqueta personalizada:
function eliminarEtiquetaPersonalizada(etiqueta) {
  const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
  if (etiquetas.etiquetas_personalizadas && etiquetas.etiquetas_personalizadas[etiqueta]) {
    delete etiquetas.etiquetas_personalizadas[etiqueta];
  }
  sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
   
  // Actualizar el contador
  actualizarContadorEtiquetas();
  cargarSecciones(etiquetas);
}
// Función para actualizar el contador de etiquetas
function actualizarContadorEtiquetas() {
  const etiquetasContainer = document.getElementById('etiquetas-personalizadas-container');
  const contador = document.getElementById('contador-etiquetas');
  const limiteSpan = document.getElementById('limite-etiquetas');
  
  if (contador) {
    const etiquetasSeleccionadas = etiquetasContainer.querySelectorAll('.rama-box').length;
    contador.textContent = etiquetasSeleccionadas;
    
    const userPlan = sessionStorage.getItem('selectedPlan');
    
    const planLimits = window.PLAN_LIMITS[userPlan] || { agentes: 5 };
    
    const extraAgentes = parseInt(sessionStorage.getItem('extra_agentes') || '0');
    const totalLimit = planLimits.agentes + extraAgentes;
    
    if (limiteSpan) {
      limiteSpan.textContent = `/${totalLimit} incluidos`;
          } else if (contador.parentNode) {
      const newLimiteSpan = document.createElement('span');
      newLimiteSpan.id = 'limite-etiquetas';
      newLimiteSpan.className = 'limite-etiquetas';
      newLimiteSpan.textContent = `/${totalLimit} incluidos`;
      contador.parentNode.appendChild(newLimiteSpan);
         }
  }
}

/* ------------------ Submenu Navigation ------------------ */
function inicializarSubmenu() {
  const submenuItems = document.querySelectorAll('.submenu-item');
  submenuItems.forEach(item => {
    item.addEventListener('click', function() {
      const step = parseInt(this.getAttribute('data-step'));
      if (step <= currentStep) {
        currentStep = step;
        actualizarSubmenu();
        mostrarSeccion(currentStep);
      }
    });
  });
}

function actualizarSubmenu() {
  const submenuItems = document.querySelectorAll('.submenu-item');
  submenuItems.forEach((item, index) => {
    item.classList.remove('active');
    if (index < currentStep) {
      item.classList.add('done');
    } else {
      item.classList.remove('done');
    }
  });
  submenuItems[currentStep].classList.add('active');
 // Update the anterior button visibility
 document.getElementById('anterior-btn').style.display = currentStep > 0 ? 'inline-block' : 'none';
  
 // Add this line to update the button layout
 updateButtonLayout();
}

function mostrarSeccion(step) {
  const sections = document.querySelectorAll('.section-content');
  sections.forEach((section, index) => {
    section.classList.toggle('active', index === step);
  });
}

function confirmarSeccion() {
  const submenuItems = document.querySelectorAll('.submenu-item');
  submenuItems[currentStep].classList.add('done');
  submenuItems[currentStep].classList.remove('active');
 
   /* ── validaciones contextuales ── */
   if (currentStep === 0 && !validateAgentes())  return; // sección "Agentes Personalizados"
   if (currentStep === 1 && !validateFuentes())  return; // sección "Fuentes"

   currentStep++;

  if (currentStep >= submenuItems.length) {
    finalizarOnboarding();
    return;
  }
  actualizarSubmenu();
  mostrarSeccion(currentStep);
}

function anteriorSeccion() {
  if (currentStep > 0) {
    currentStep--;
    actualizarSubmenu();
    mostrarSeccion(currentStep);
  }
}

/* ------------------ Section "Fuentes Oficiales" ------------------ */
function cargarFuentesOficiales(etiquetas) {
  const userData = JSON.parse(sessionStorage.getItem('userData'));
  if (!userData) return;
  const fuentesGobierno = userData.fuentes || [];
  cargarFuentesGobierno(fuentesGobierno);
  const fuentesReguladores = userData.reguladores || [];
  cargarFuentesReguladores(fuentesReguladores);
  
  // Update checkboxes based on current selections
  updateFuentesGobiernoCheckboxes();
  updateFuentesReguladoresCheckboxes();
  
  // Update the fuentes counter
  actualizarContadorFuentes();
}

function cargarFuentesGobierno(selected) {
  const container = document.getElementById('fuentes-gobierno-container');
  container.innerHTML = "";
  selected.forEach(fuente => {
    const tagElement = document.createElement('div');
    tagElement.className = "tag";
    tagElement.innerHTML = `
      ${fuente}
      <span class="tag-remove" onclick="eliminarFuente('fuentes-gobierno-container', '${fuente}')">×</span>
    `;
    container.appendChild(tagElement);
  });
}

function cargarFuentesReguladores(selected) {
  const container = document.getElementById('fuentes-reguladores-container');
  container.innerHTML = "";
  selected.forEach(fuente => {
    const tagElement = document.createElement('div');
    tagElement.className = "tag";
    tagElement.innerHTML = `
      ${fuente}
      <span class="tag-remove" onclick="eliminarFuente('fuentes-reguladores-container', '${fuente}')">×</span>
    `;
    container.appendChild(tagElement);
  });
}

function filtrarFuentesGobierno() {
  const filtro = document.getElementById('filtro-fuentes-gobierno').value.toUpperCase();
  const dropdown = document.getElementById('dropdown-fuentes-gobierno');
  dropdown.innerHTML = "";
  const fuentesStatic = ["BOE", "DOUE", "BOCM", "BOJA", "BOA", "BOCYL"];
  const matches = fuentesStatic.filter(f => f.includes(filtro));
  matches.forEach(match => {
    const option = document.createElement('div');
    option.className = "dropdown-item";
    option.textContent = match;
    option.onclick = function() {
      seleccionarFuenteGobierno(match);
    };
    dropdown.appendChild(option);
  });
}

function seleccionarFuenteGobierno(value) {
  const normalizedValue = value.toUpperCase();
  const userData = JSON.parse(sessionStorage.getItem('userData')) || {};
  if (!userData.fuentes) userData.fuentes = [];
  // Convert all stored values to uppercase for comparison
  const normalizedFuentes = userData.fuentes.map(f => f.toUpperCase());
  if (!normalizedFuentes.includes(normalizedValue)) {
    userData.fuentes.push(normalizedValue);
    sessionStorage.setItem('userData', JSON.stringify(userData));
    cargarFuentesOficiales(JSON.parse(sessionStorage.getItem('etiquetasRecomendadas')));
  }
  document.getElementById('filtro-fuentes-gobierno').value = "";
  document.getElementById('dropdown-fuentes-gobierno').innerHTML = "";
}


function seleccionarFuenteReguladores(value) {
  const normalizedValue = value.toUpperCase();
  const userData = JSON.parse(sessionStorage.getItem('userData')) || {};
  if (!userData.reguladores) userData.reguladores = [];
  // Normalize stored values for duplicate checking
  const normalizedReguladores = userData.reguladores.map(r => r.toUpperCase());
  if (!normalizedReguladores.includes(normalizedValue)) {
    userData.reguladores.push(normalizedValue);
    sessionStorage.setItem('userData', JSON.stringify(userData));
    cargarFuentesOficiales(JSON.parse(sessionStorage.getItem('etiquetasRecomendadas')));
  }
  document.getElementById('filtro-fuentes-reguladores').value = "";
  document.getElementById('dropdown-fuentes-reguladores').innerHTML = "";
}


function seleccionarFuenteReguladores(value) {
  const userData = JSON.parse(sessionStorage.getItem('userData')) || {};
  if (!userData.reguladores) userData.reguladores = [];
  if (!userData.reguladores.includes(value)) {
    userData.reguladores.push(value);
    sessionStorage.setItem('userData', JSON.stringify(userData));
    cargarFuentesOficiales(JSON.parse(sessionStorage.getItem('etiquetasRecomendadas')));
  }
  document.getElementById('filtro-fuentes-reguladores').value = "";
  document.getElementById('dropdown-fuentes-reguladores').innerHTML = "";
}

/* ------------------ Section "Rangos" ------------------ */
function cargarRangosPredefinidos() {
  const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas")) || {};
  const rangos = etiquetas.rangos_normativos || [];
  const container = document.getElementById("rangos-container");
  container.innerHTML = "";
  
  // Display existing ranges
  rangos.forEach(rango => {
    const tagElement = document.createElement("div");
    tagElement.className = "tag rango-tag";
    tagElement.innerHTML = `
      ${rango}
      <span class="tag-remove" onclick="eliminarRango('${rango}')">×</span>
    `;
    container.appendChild(tagElement);
  });
  
  // Remove any existing add-tag div if present
  const existingAddDiv = document.querySelector("#section-rangos .add-tag");
  if (existingAddDiv) {
    existingAddDiv.remove();
  }
  
  // Create a new add-tag div
  const addDiv = document.createElement("div");
  addDiv.className = "add-tag";
  addDiv.innerHTML = `
    <input type="text" id="filtro-rangos" placeholder="Filtrar rangos..." oninput="filtrarRangos()">
    <div id="dropdown-rangos" class="dropdown-container"></div>
    <p class="feedback-msg">Si no encuentras un filtro que estabas buscando, indícanoslo para seguir mejorando el producto</p>
    <input type="text" id="feedback-rangos" placeholder="Escribe aquí...">
  `;
  
  // Append the add-tag div to the section-rangos element
  const rangosSection = document.getElementById("section-rangos");
  if (rangosSection) {
    rangosSection.appendChild(addDiv);
  }
}

function filtrarRangos() {
  const filtro = document.getElementById('filtro-rangos').value.toLowerCase();
  const dropdown = document.getElementById('dropdown-rangos');
  dropdown.innerHTML = "";
  if (!catalogoEtiquetas || !catalogoEtiquetas.rangos_normativos) return;
  const matches = catalogoEtiquetas.rangos_normativos.filter(rango => rango.toLowerCase().includes(filtro));
  matches.forEach(match => {
    const option = document.createElement('div');
    option.className = "dropdown-item";
    option.textContent = match;
    option.onclick = function() {
      seleccionarRango(match);
    };
    dropdown.appendChild(option);
  });
}

  function seleccionarRango(value) {
    // Get current etiquetas from sessionStorage
    const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas")) || {};
    
    // Initialize rangos_normativos array if it doesn't exist
    if (!etiquetas.rangos_normativos) etiquetas.rangos_normativos = [];
    
    // Check if the value already exists in the array to avoid duplicates
    if (!etiquetas.rangos_normativos.includes(value)) {
      // Add the value as is, without any numbering
      etiquetas.rangos_normativos.push(value);
      
      // Save updated etiquetas back to sessionStorage
      sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
      
      // Reload the UI to show the updated list
      cargarRangosPredefinidos();
    }
    
    // Clear the filter input and dropdown
    document.getElementById('filtro-rangos').value = "";
    document.getElementById('dropdown-rangos').innerHTML = "";
  }
  

/* ------------------ Utility Functions ------------------ */


function eliminarRango(rango) {
  // Retrieve the etiquetas object or use an empty object if not set
  let etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas")) || {};
  // If the rangos_normativos array doesn't exist, there's nothing to delete
  if (!etiquetas.rangos_normativos) return;
  // Filter out the specified rango (after trimming whitespace)
  etiquetas.rangos_normativos = etiquetas.rangos_normativos.filter(r => r.trim() !== rango.trim());
  // Update sessionStorage with the modified etiquetas object
  sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
  // Refresh the Rangos section UI
  cargarRangosPredefinidos();
}

function eliminarFuente(containerId, fuente) {
  const userData = JSON.parse(sessionStorage.getItem('userData')) || {};
  
  if (containerId === 'fuentes-gobierno-container') {
    if (userData.fuentes) {
      userData.fuentes = userData.fuentes.filter(f => f !== fuente);
    }
    // Update checkbox if it exists
    const checkbox = document.querySelector(`input[name="fuentes[]"][value="${fuente}"]`);
    if (checkbox) {
      checkbox.checked = false;
    }
  } else if (containerId === 'fuentes-reguladores-container') {
    if (userData.reguladores) {
      userData.reguladores = userData.reguladores.filter(f => f !== fuente);
    }
    // Update checkbox if it exists
    const checkbox = document.querySelector(`input[name="reguladores[]"][value="${fuente}"]`);
    if (checkbox) {
      checkbox.checked = false;
    }
  }
  
  sessionStorage.setItem('userData', JSON.stringify(userData));
  cargarFuentesOficiales(JSON.parse(sessionStorage.getItem('etiquetasRecomendadas')));
}

function agregarEtiqueta(categoria) {
  let inputId, arrayKey;
  if (categoria === "industrias") {
    inputId = "nueva-industria";
    arrayKey = "industrias";
  } else if (categoria === "fuentes-ue") {
    inputId = "nueva-fuente-ue";
    arrayKey = "rangos_normativos";
  } else if (categoria === "fuentes-estatal") {
    inputId = "nueva-fuente-estatal";
    arrayKey = "rangos_normativos";
  } else if (categoria === "fuentes-autonomica") {
    inputId = "nueva-fuente-autonomica";
    arrayKey = "rangos_normativos";
  } else if (categoria === "fuentes-reguladores") {
    inputId = "nueva-fuente-reguladores";
    arrayKey = "rangos_normativos";
  }
  const input = document.getElementById(inputId);
  const nuevoValor = input.value.trim();
  if (nuevoValor) {
    const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
    if (!etiquetas[arrayKey]) {
      etiquetas[arrayKey] = [];
    }
    if (!etiquetas[arrayKey].includes(nuevoValor)) {
      etiquetas[arrayKey].push(nuevoValor);
      sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
      cargarSecciones(etiquetas);
      input.value = "";
    }
  }
}

/*----------Añadir etiquetas personalziadas extras-----------*/ 
// Función para agregar una nueva etiqueta personalizada
function agregarEtiquetaPersonalizada() {
  const nombreEtiqueta = document.getElementById('nueva-etiqueta').value.trim();
  const descripcionEtiqueta = document.getElementById('nueva-descripcion').value.trim();
  
 /* if (!nombreEtiqueta || !descripcionEtiqueta) {
    alert('Por favor, completa tanto el nombre como la descripción de la etiqueta.');
    return;
  }
  */
  const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
  
  if (!etiquetas.etiquetas_personalizadas) {
    etiquetas.etiquetas_personalizadas = {};
  }
  
  // Verificar si la etiqueta ya existe
  if (etiquetas.etiquetas_personalizadas[nombreEtiqueta]) {
    if (!confirm('Esta etiqueta ya existe. ¿Deseas sobrescribirla?')) {
      return;
    }
  }
  
  // Crear un objeto temporal para añadir la nueva etiqueta al principio
  const etiquetasOrdenadas = {};
  
  // Añadir la nueva etiqueta primero
  etiquetasOrdenadas[nombreEtiqueta] = descripcionEtiqueta;
  
  // Añadir el resto de etiquetas
  Object.keys(etiquetas.etiquetas_personalizadas).forEach(key => {
    if (key !== nombreEtiqueta) { // Evitar duplicados
      etiquetasOrdenadas[key] = etiquetas.etiquetas_personalizadas[key];
    }
  });
  
  // Actualizar el objeto de etiquetas
  etiquetas.etiquetas_personalizadas = etiquetasOrdenadas;
  
  // Guardar en sessionStorage
  sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
  
  // Limpiar el formulario
  document.getElementById('nueva-etiqueta').value = '';
  document.getElementById('nueva-descripcion').value = '';
  
  // Actualizar el contador
  actualizarContadorEtiquetas();
  
  // Recargar las etiquetas
  cargarEtiquetasPersonalizadas(etiquetas.etiquetas_personalizadas);
}

// Añadir esta función para manejar el toggle de los detalles de la etiqueta
function toggleDetalleRama(button) {
  const ramaBox = button.closest('.rama-box');
  const ramaDetail = ramaBox.querySelector('.rama-detail');
  
  if (ramaBox.classList.contains('collapsed')) {
    ramaBox.classList.remove('collapsed');
    ramaDetail.style.display = 'block';
    button.textContent = button.textContent.replace('▼', '▲');
  } else {
    ramaBox.classList.add('collapsed');
    ramaDetail.style.display = 'none';
    button.textContent = button.textContent.replace('▲', '▼');
  }
}


/* ------------------ Finalize Onboarding ------------------ */
function finalizarOnboarding() {
  const etiquetasFinales = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
  
  // Store the sub_rama_map in the format needed for the next step
  const sub_rama_map = {};
 /* if (etiquetasFinales.subramas_juridicas) {
    for (const rama in etiquetasFinales.subramas_juridicas) {
      if (etiquetasFinales.subramas_juridicas[rama].length > 0) {
        sub_rama_map[rama] = etiquetasFinales.subramas_juridicas[rama];
      }
    }
  }
    */
  
  // Store the sub_industria_map in the format needed for the next step
  const sub_industria_map = {};
 /* if (etiquetasFinales.sub_industrias) {
    for (const industria in etiquetasFinales.sub_industrias) {
      if (etiquetasFinales.sub_industrias[industria].length > 0) {
        sub_industria_map[industria] = etiquetasFinales.sub_industrias[industria];
      }
    }
  }
    */
  
  // Store the feedback from any feedback inputs
  const feedback = {
   /* industrias: document.getElementById('feedback-industria')?.value || '',
    ramas: document.getElementById('feedback-ramas')?.value || '',
    */
    fuentes_reguladores: document.getElementById('feedback-fuentes-reguladores')?.value || '',
    rangos: document.getElementById('feedback-rangos')?.value || ''
  };
  
  // Get user data
  const userData = JSON.parse(sessionStorage.getItem('userData')) || {};
  
  // Store the cobertura_legal structure using the new simpler categories
  const cobertura_legal = {
    "fuentes-gobierno": userData.fuentes || [],
    "fuentes-reguladores": userData.reguladores || []
  };
  
  
  // Store these in sessionStorage for later reference
  sessionStorage.setItem('industry_tags', JSON.stringify(etiquetasFinales.industrias || []));
  sessionStorage.setItem('sub_industria_map', JSON.stringify(sub_industria_map));
  sessionStorage.setItem('rama_juridicas', JSON.stringify(etiquetasFinales.ramas_juridicas || []));
  sessionStorage.setItem('sub_rama_map', JSON.stringify(sub_rama_map));
  sessionStorage.setItem('rangos', JSON.stringify(etiquetasFinales.rangos_normativos || []));
  sessionStorage.setItem('cobertura_legal', JSON.stringify(cobertura_legal));
  sessionStorage.setItem('feedback', JSON.stringify(feedback));
  sessionStorage.setItem('etiquetas_personalizadas', JSON.stringify(etiquetasFinales.etiquetas_personalizadas));
  
  // Save return URL to ensure we come back to paso3.html
  sessionStorage.setItem('returnUrl', 'paso3.html');
  
  // Store in hidden inputs for easier access
  document.getElementById('fuentesGobiernoInput').value = JSON.stringify(userData.fuentes || []);
  document.getElementById('fuentesReguladoresInput').value = JSON.stringify(userData.reguladores || []);
  
  // Instead of redirecting to paso4.html, redirect directly to Stripe checkout
  redirectToStripeCheckout();

  // If we're in edit mode, set a flag
  if (sessionStorage.getItem('isEditing') === 'true') {
    sessionStorage.setItem('isEditingPlan', 'true');
  }
}

// New function to prepare and redirect to Stripe checkout
async function redirectToStripeCheckout() {
  // Show loading state on confirm button
  const confirmBtn = document.getElementById('confirmar-btn');
  const originalButtonText = confirmBtn.textContent;
  
  // Save the original button state to restore if user comes back
  sessionStorage.setItem('originalButtonText', originalButtonText);
  
  confirmBtn.innerHTML = '<div class="loader"></div><span>Procesando...</span>';
  confirmBtn.style.display = 'flex';
  confirmBtn.style.alignItems = 'center';
  confirmBtn.style.justifyContent = 'center';
  confirmBtn.style.gap = '8px';
  confirmBtn.disabled = true;

  // Get user plan and extras data
  const userPlan = sessionStorage.getItem('selectedPlan'); 
  const extraAgentes = parseInt(sessionStorage.getItem('extra_agentes') || '0');
  const extraFuentes = parseInt(sessionStorage.getItem('extra_fuentes') || '0');
  
  // Get billing period from sessionStorage (default to monthly if not set)
  const billingPeriod = sessionStorage.getItem('billingPeriod') || 'monthly';
  
  // Determine impact analysis limits based on plan
  let impactAnalysisLimit = 0;
  if (userPlan === 'plan2') {
    impactAnalysisLimit = 50;
  } else if (userPlan === 'plan3') {
    impactAnalysisLimit = 500;
  } else if (userPlan === 'plan4') {
    impactAnalysisLimit = -1; // -1 means unlimited
  }

  // Retrieve data from sessionStorage
  const userData = JSON.parse(sessionStorage.getItem('userData') || '{}');
  const etiquetasRecomendadas = JSON.parse(sessionStorage.getItem('etiquetasRecomendadas') || '{}');
  
  // Get current user's email if available
  const currentUserEmail = userData.email || sessionStorage.getItem('userEmail');
  
  // Prepare the checkout payload (same structure as paso4)
  const payload = {
    plan: userPlan,
    billingInterval: billingPeriod, // Use the billing period from sessionStorage
    extra_agentes: extraAgentes,
    extra_fuentes: extraFuentes,
    impact_analysis_limit: impactAnalysisLimit,
    industry_tags: etiquetasRecomendadas.industrias || [],
    sub_industria_map: {},
    rama_juridicas: etiquetasRecomendadas.ramas_juridicas || [],
    sub_rama_map: {},
    rangos: etiquetasRecomendadas.rangos_normativos || [],
    cobertura_legal: {
      "fuentes-gobierno": userData.fuentes || [],
      "fuentes-reguladores": userData.reguladores || []
    },
    feedback: {
      industrias: '',
      ramas: '',
      fuentes_reguladores: document.getElementById('feedback-fuentes-reguladores')?.value || '',
      rangos: document.getElementById('feedback-rangos')?.value || ''
    },
    // User profile data
    name: userData.nombre || '',
    web: userData.webEmpresa || '',
    linkedin: userData.linkedin || '',
    perfil_profesional: Array.isArray(userData.perfil) ? userData.perfil.join(',') : '',
    company_name: userData.webEmpresa || '',
    profile_type: userData.otro_perfil || (Array.isArray(userData.perfil) ? userData.perfil[0] : ''),
    especializacion: userData.especializacion || '',
    otro_perfil: userData.otro_perfil || '',
    etiquetas_personalizadas: etiquetasRecomendadas.etiquetas_personalizadas || {},
    isTrial: true,
    returnUrl: 'paso3.html', // Add return URL for Stripe to redirect back here
    email: currentUserEmail // Include user email to help identify the user when returning from Stripe
  };

  try {
    // Determine if we're in editing mode
    const isEditing = sessionStorage.getItem('isEditing') === 'true';
    
    // Use the appropriate endpoint
    const endpoint = isEditing ? '/update-subscription-checkout' : '/create-checkout-session';
    
    // Send request to create checkout session
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Error creating checkout session: ${response.status}`);
    }
    
    const result = await response.json();
    const { sessionId } = result;
    
    // Load Stripe.js if not already loaded
    if (!window.Stripe) {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.onload = function() {
        completeStripeRedirect(sessionId);
      };
      document.head.appendChild(script);
    } else {
      completeStripeRedirect(sessionId);
    }
  } catch (error) {
    console.error('Error creating checkout session:', error);
    confirmBtn.innerHTML = originalButtonText;
    confirmBtn.disabled = false;
    alert('Hubo un error al procesar tu solicitud. Por favor, inténtalo de nuevo.');
  }
}

// Function to complete the redirect to Stripe Checkout
function completeStripeRedirect(sessionId) {
  const stripe = Stripe('pk_live_51REzuGDXdzt0y1c97cWOhKbTvduvuVI4w1fQsKM672HypXhGT0EtiLhjVTl3Hxyi7rW7RBbZ4xd4bhL7arcPljKt00Qrz892wG');
  
  // Store the return URL to ensure we come back to paso3.html
  sessionStorage.setItem('returnUrl', 'paso3.html');
  
  // Redirect to Stripe checkout
  stripe.redirectToCheckout({ sessionId });
}

/* ------------------ Toggle Detail for Etiquetas personalizadas------------------ */
function toggleDetalleRama(button) {
  const ramaBox = button.closest('.rama-box');
  const detailDiv = ramaBox.querySelector('.rama-detail');
  if (!detailDiv) return;
  if (detailDiv.style.display === 'none' || detailDiv.style.display === '') {
    detailDiv.style.display = 'block';
    ramaBox.classList.add('expanded');
    ramaBox.classList.remove('collapsed');
    button.textContent = 'Ocultar detalle ▲';
  } else {
    detailDiv.style.display = 'none';
    ramaBox.classList.remove('expanded');
    ramaBox.classList.add('collapsed');
    button.textContent = 'Ver definición ▼';
  }
}


  /*-----Skeleton loader--------*/

// Función para ocultar el skeleton loader cuando la página esté completamente cargada
document.addEventListener('DOMContentLoaded', function() {
  // Mostrar el skeleton loader
  const skeletonLoader = document.getElementById('skeleton-loader');
  if (skeletonLoader) {
    skeletonLoader.classList.remove('hidden');
  }
  
  // Ocultar el skeleton loader después de que todo el contenido esté cargado
  window.addEventListener('load', function() {
    setTimeout(function() {
      if (skeletonLoader) {
        skeletonLoader.classList.add('hidden');
      }
    }, 500); // Pequeño retraso para asegurar que todo esté renderizado
  });
});


/* --- Expose deletion functions to global scope --- */
window.eliminarFuente = eliminarFuente;
window.eliminarRango = eliminarRango;
window.toggleDropdown = toggleDropdown;
window.toggleFuenteGobierno = toggleFuenteGobierno;
window.toggleFuenteReguladores = toggleFuenteReguladores;
window.actualizarContadorFuentes = actualizarContadorFuentes;
/*window.eliminarEtiqueta = eliminarEtiqueta;
window.eliminarRamaJuridica = eliminarRamaJuridica;

window.eliminarSubrama = eliminarSubrama;
// Expose functions to global scope
window.eliminarIndustria = eliminarIndustria;
window.eliminarSubindustria = eliminarSubindustria;
window.agregarIndustria = agregarIndustria;
window.agregarSubindustria = agregarSubindustria;
*/
/* ------------------ Section "Industrias" ------------------ */
/*
function cargarIndustrias(industrias) {
  const container = document.getElementById('industrias-container');
  container.innerHTML = '';
  
  // Obtener las subindustrias del sessionStorage
  const etiquetas = JSON.parse(sessionStorage.getItem('etiquetasRecomendadas'));
  const subIndustrias = etiquetas.sub_industrias || {};
  
  industrias.forEach(industria => {
    const ramaBox = document.createElement('div');
    // Force each industria box to be full width (one per line)
    ramaBox.className = 'rama-box collapsed';
    ramaBox.style.width = "100%";
    
    const ramaHeader = document.createElement('div');
    ramaHeader.className = 'rama-header';
    ramaHeader.innerHTML = `
      <h4>${industria}</h4>
      <div>
        <button class="toggle-detail" onclick="toggleDetalleRama(this)">Ver definición ▼</button>
        <span class="tag-remove" onclick="eliminarIndustria('${industria}')">×</span>
      </div>
    `;
    
    ramaBox.appendChild(ramaHeader);
    
    // Crear el contenedor de detalle para las subindustrias
    const detailDiv = document.createElement('div');
    detailDiv.className = 'rama-detail';
   // detailDiv.style.display = 'none';
    
    // Añadir las subindustrias si existen
    if (subIndustrias[industria] && subIndustrias[industria].length > 0) {
   //   console.log(subIndustrias)
     // const subindustriasContainer = document.createElement('div');
      
      subIndustrias[industria].forEach(subindustria => {
        const subramaTag = document.createElement('div');
        subramaTag.className = 'tag subrama-tag';
        subramaTag.innerHTML = `${subindustria} <span class="eliminar" onclick="eliminarSubindustria('${industria}', '${subindustria}')">×</span>`;
        detailDiv.appendChild(subramaTag);
      });
      
    //  detailDiv.appendChild(subindustriasContainer);
    }
    
    // Añadir selector para agregar nuevas subindustrias
    if (catalogoEtiquetas && catalogoEtiquetas.sub_industrias && catalogoEtiquetas.sub_industrias[industria]) {
      const selectorSubindustria = document.createElement('select');
      selectorSubindustria.className = 'selector-subramas';
      
      // Crear las opciones del selector
      let optionsHTML = '<option value="">-- Seleccionar subindustria --</option>';
      const existingSubindustrias = subIndustrias[industria] || [];
      
      catalogoEtiquetas.sub_industrias[industria].forEach(sub => {
        const isDisabled = existingSubindustrias.includes(sub) ? 'disabled' : '';
        optionsHTML += `<option value="${sub}" ${isDisabled}>${sub}</option>`;
      });
      
      selectorSubindustria.innerHTML = optionsHTML;
      
      selectorSubindustria.onchange = function() {
        if (this.value) {
          agregarSubindustria(industria, this.value);
          this.value = "";
        }
      };
      
      const selectorContainer = document.createElement('div');
      selectorContainer.className = 'selector-container';
      selectorContainer.appendChild(selectorSubindustria);
      detailDiv.appendChild(selectorContainer);
    }
    
    ramaBox.appendChild(detailDiv);
    container.appendChild(ramaBox);
  });
}


function filtrarIndustrias() {
  const filtro = document.getElementById('filtro-industrias').value.toLowerCase();
  const dropdown = document.getElementById('dropdown-industrias');
  dropdown.innerHTML = "";
  if (!catalogoEtiquetas || !catalogoEtiquetas.industrias) return;
  const matches = catalogoEtiquetas.industrias.filter(ind => ind.toLowerCase().includes(filtro));
  matches.forEach(match => {
    const option = document.createElement('div');
    option.className = "dropdown-item";
    option.textContent = match;
    option.onclick = function() {
      seleccionarIndustria(match);
    };
    dropdown.appendChild(option);
  });
}
function eliminarIndustria(industria) {
  const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
  etiquetas.industrias = etiquetas.industrias.filter(i => i !== industria);
  if (etiquetas.sub_industrias && etiquetas.sub_industrias[industria]) {
    delete etiquetas.sub_industrias[industria];
  }
  sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
  cargarSecciones(etiquetas);
}

function eliminarSubindustria(industria, subindustria) {
  const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
  if (etiquetas.sub_industrias && etiquetas.sub_industrias[industria]) {
    etiquetas.sub_industrias[industria] = etiquetas.sub_industrias[industria].filter(s => s !== subindustria);
  }
  sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
  cargarSecciones(etiquetas);
}

function agregarIndustria() {
  const input = document.getElementById("nueva-industria");
  const nuevaIndustria = input.value.trim();
  if (nuevaIndustria) {
    const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
    if (!etiquetas.industrias) {
      etiquetas.industrias = [];
    }
    if (!etiquetas.industrias.includes(nuevaIndustria)) {
      etiquetas.industrias.push(nuevaIndustria);
      if (!etiquetas.sub_industrias) {
        etiquetas.sub_industrias = {};
      }
      etiquetas.sub_industrias[nuevaIndustria] = [];
      sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
      cargarSecciones(etiquetas);
      input.value = "";
    }
  }
}

function agregarSubindustria(industria, subindustria) {
  subindustria = subindustria.trim();
  if (subindustria) {
    const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
    if (!etiquetas.sub_industrias) {
      etiquetas.sub_industrias = {};
    }
    if (!etiquetas.sub_industrias[industria]) {
      etiquetas.sub_industrias[industria] = [];
    }
    if (!etiquetas.sub_industrias[industria].includes(subindustria)) {
      etiquetas.sub_industrias[industria].push(subindustria);
      sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
      cargarSecciones(etiquetas);
    }
  }
}
function seleccionarIndustria(value) {
  const etiquetas = JSON.parse(sessionStorage.getItem('etiquetasRecomendadas'));
  if (!etiquetas.industrias) etiquetas.industrias = [];
  if (!etiquetas.sub_industrias) etiquetas.sub_industrias = {};
  
  if (!etiquetas.industrias.includes(value)) {
    etiquetas.industrias.push(value);
    // Inicializar el array de subindustrias para esta industria
    if (!etiquetas.sub_industrias[value]) {
      etiquetas.sub_industrias[value] = [];
    }
    
    sessionStorage.setItem('etiquetasRecomendadas', JSON.stringify(etiquetas));
    cargarIndustrias(etiquetas.industrias);
  }
  
  document.getElementById('filtro-industrias').value = "";
  document.getElementById('dropdown-industrias').innerHTML = "";
}
*/

/* ------------------ Section "Ramas Jurídicas" ------------------ */
/*
function cargarRamasJuridicas(ramas, subramas) {
  const container = document.getElementById('ramas-container');
  container.innerHTML = '';
  ramas.forEach(rama => {
    const ramaBox = document.createElement('div');
    // Force each rama box to be full width (one per line)
    ramaBox.className = 'rama-box collapsed';
    ramaBox.style.width = "100%";
    const ramaHeader = document.createElement('div');
    ramaHeader.className = 'rama-header';
    ramaHeader.innerHTML = `
      <h4>${rama}</h4>
      <div>
        <button class="toggle-detail" onclick="toggleDetalleRama(this)">Ver definición ▼</button>
        <span class="tag-remove" onclick="eliminarRamaJuridica('${rama}')">×</span>
      </div>
    `;
    ramaBox.appendChild(ramaHeader);
    const detailDiv = document.createElement('div');
    detailDiv.className = 'rama-detail';
    const ramaSubramas = subramas[rama] || [];
    ramaSubramas.forEach(subrama => {
      const subramaElement = document.createElement('div');
      subramaElement.className = 'tag subrama-tag';
      subramaElement.innerHTML = `
        ${subrama}
        <span class="tag-remove" onclick="eliminarSubrama('${rama}', '${subrama}')">×</span>
      `;
      detailDiv.appendChild(subramaElement);
    });
    if (catalogoEtiquetas && catalogoEtiquetas.subramas_juridicas && catalogoEtiquetas.subramas_juridicas[rama]) {
      const selectorSubrama = document.createElement('select');
      selectorSubrama.className = 'selector-subramas';
      selectorSubrama.innerHTML = `
        <option value="">-- Seleccionar subrama --</option>
        ${catalogoEtiquetas.subramas_juridicas[rama].map(sub => 
          `<option value="${sub}" ${ramaSubramas.includes(sub) ? 'disabled' : ''}>${sub}</option>`
        ).join('')}
      `;
      selectorSubrama.onchange = function() {
        if (this.value) {
          agregarSubrama(rama, this.value);
          this.value = "";
        }
      };
      const selectorContainer = document.createElement('div');
      selectorContainer.className = 'selector-container';
      selectorContainer.appendChild(selectorSubrama);
      detailDiv.appendChild(selectorContainer);
    }
    ramaBox.appendChild(detailDiv);
    container.appendChild(ramaBox);
  });
}

function filtrarRamas() {
  const filtro = document.getElementById('filtro-ramas').value.toLowerCase();
  const dropdown = document.getElementById('dropdown-ramas');
  dropdown.innerHTML = "";
  if (!catalogoEtiquetas || !catalogoEtiquetas.ramas_juridicas) return;
  const matches = catalogoEtiquetas.ramas_juridicas.filter(rama => rama.toLowerCase().includes(filtro));
  matches.forEach(match => {
    const option = document.createElement('div');
    option.className = "dropdown-item";
    option.textContent = match;
    option.onclick = function() {
      seleccionarRama(match);
    };
    dropdown.appendChild(option);
  });
}

function seleccionarRama(value) {
  const etiquetas = JSON.parse(sessionStorage.getItem('etiquetasRecomendadas'));
  if (!etiquetas.ramas_juridicas) etiquetas.ramas_juridicas = [];
  if (!etiquetas.ramas_juridicas.includes(value)) {
    etiquetas.ramas_juridicas.push(value);
    if (!etiquetas.subramas_juridicas) etiquetas.subramas_juridicas = {};
    etiquetas.subramas_juridicas[value] = [];
    sessionStorage.setItem('etiquetasRecomendadas', JSON.stringify(etiquetas));
    cargarRamasJuridicas(etiquetas.ramas_juridicas, etiquetas.subramas_juridicas);
  }
  document.getElementById('filtro-ramas').value = "";
  document.getElementById('dropdown-ramas').innerHTML = "";
}
  */
 /*
function agregarRamaJuridica() {
  const input = document.getElementById("nueva-rama");
  const nuevaRama = input.value.trim();
  if (nuevaRama) {
    const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
    if (!etiquetas.ramas_juridicas) {
      etiquetas.ramas_juridicas = [];
    }
    if (!etiquetas.ramas_juridicas.includes(nuevaRama)) {
      etiquetas.ramas_juridicas.push(nuevaRama);
      if (!etiquetas.subramas_juridicas) {
        etiquetas.subramas_juridicas = {};
      }
      etiquetas.subramas_juridicas[nuevaRama] = [];
      sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
      cargarSecciones(etiquetas);
      input.value = "";
    }
  }
}

function agregarSubrama(rama, subrama) {
  subrama = subrama.trim();
  if (subrama) {
    const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
    if (!etiquetas.subramas_juridicas) {
      etiquetas.subramas_juridicas = {};
    }
    if (!etiquetas.subramas_juridicas[rama]) {
      etiquetas.subramas_juridicas[rama] = [];
    }
    if (!etiquetas.subramas_juridicas[rama].includes(subrama)) {
      etiquetas.subramas_juridicas[rama].push(subrama);
      sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
      cargarSecciones(etiquetas);
    }
  }
}
  */

/*funciones eliminar etiquetas*/

/*
function eliminarRamaJuridica(rama) {
  const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
  etiquetas.ramas_juridicas = etiquetas.ramas_juridicas.filter(r => r !== rama);
  if (etiquetas.subramas_juridicas && etiquetas.subramas_juridicas[rama]) {
    delete etiquetas.subramas_juridicas[rama];
  }
  sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
  cargarSecciones(etiquetas);
}

function eliminarSubrama(rama, subrama) {
  const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
  if (etiquetas.subramas_juridicas && etiquetas.subramas_juridicas[rama]) {
    etiquetas.subramas_juridicas[rama] = etiquetas.subramas_juridicas[rama].filter(s => s !== subrama);
  }
  sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
  cargarSecciones(etiquetas);
}
*/
/*
function eliminarEtiqueta(categoria, etiqueta) {
  const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
  if (categoria === "industrias") {
    etiquetas.industrias = etiquetas.industrias.filter(e => e !== etiqueta);
  } else if (categoria.startsWith("fuentes-")) {
    etiquetas.rangos_normativos = etiquetas.rangos_normativos.filter(e => e !== etiqueta);
  }
  sessionStorage.setItem("etiquetasRecomendadas", JSON.stringify(etiquetas));
  cargarSecciones(etiquetas);
}
  */

/* ------------------ Validation Functions ------------------ */
function validateAgentes() {
  const etiquetas = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
  if (!etiquetas || !etiquetas.etiquetas_personalizadas || Object.keys(etiquetas.etiquetas_personalizadas).length === 0) {
    alert("Por favor, añade al menos un agente personalizado antes de continuar.");
    return false;
  }
  
  // Get user plan limits
  const userPlan = sessionStorage.getItem('selectedPlan');
  console.log('[validateAgentes] Using selectedPlan:', userPlan);
  
  const planLimits = window.PLAN_LIMITS[userPlan] || { agentes: 5 }; // Default to plan2 if not specified
  
  // Get extras from sessionStorage if any
  const extraAgentes = parseInt(sessionStorage.getItem('extra_agentes') || '0');
  const totalLimit = planLimits.agentes + extraAgentes;
  
  const numAgentes = Object.keys(etiquetas.etiquetas_personalizadas).length;
  
  // Check if user exceeds plan limits
  if (numAgentes > totalLimit) {
    // Show banner for agent limit
    bannerMode = 'agentes';
    currentDeficit = numAgentes - totalLimit;
    deficitSpan.textContent = currentDeficit;
    document.getElementById('extra-title').textContent = "Añadir agente personalizado";
    document.getElementById('extra-desc').textContent = "+10€/agente";
    
    // Show the banner
    banner.classList.remove('hidden');
    document.getElementById('backdrop').classList.remove('hidden');
    return false;
  }
  
  return true;
}

function validateFuentes() {
  const userData = JSON.parse(sessionStorage.getItem("userData"));
  if (!userData) return true; // No userData yet, let user continue
  
  const fuentes = (userData.fuentes || []).length;
  const reguladores = (userData.reguladores || []).length;
  const totalFuentes = fuentes + reguladores;
  
  if (totalFuentes === 0) {
    alert("Por favor, añade al menos una fuente antes de continuar.");
    return false;
  }
  
  // Get user plan limits
  const userPlan = sessionStorage.getItem('selectedPlan');
  console.log('[validateFuentes] Using selectedPlan:', userPlan);
  
  const planLimits = window.PLAN_LIMITS[userPlan] || { fuentes: 1 }; // Default to plan2 if not specified
  
  // Get extras from sessionStorage if any
  const extraFuentes = parseInt(sessionStorage.getItem('extra_fuentes') || '0');
  const totalLimit = planLimits.fuentes + extraFuentes;
  
  // Check if user exceeds plan limits
  if (totalFuentes > totalLimit) {
    // Show banner for source limit
    bannerMode = 'fuentes';
    currentDeficit = totalFuentes - totalLimit;
    deficitSpan.textContent = currentDeficit;
    document.getElementById('extra-title').textContent = "Añadir fuente oficial";
    document.getElementById('extra-desc').textContent = "+15€/fuente";
    
    // Show the banner
    banner.classList.remove('hidden');
    document.getElementById('backdrop').classList.remove('hidden');
    return false;
  }
  
  return true;
}

/* ------------------ Utility Functions ------------------ */

// Function to toggle dropdown visibility
function toggleDropdown(dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  
  // Close all other dropdowns first
  const allDropdowns = document.querySelectorAll('.dropdown-options');
  allDropdowns.forEach(dd => {
    if (dd.id !== dropdownId) {
      dd.classList.remove('show');
    }
  });
  
  // Toggle this dropdown
  dropdown.classList.toggle('show');
  
  // Check current selections to update checkboxes
  if (dropdownId === 'dropdown-fuentes-gobierno') {
    updateFuentesGobiernoCheckboxes();
  } else if (dropdownId === 'dropdown-fuentes-reguladores') {
    updateFuentesReguladoresCheckboxes();
  }
}

// Function to update checkboxes based on current selections (fuentes gobierno)
function updateFuentesGobiernoCheckboxes() {
  const userData = JSON.parse(sessionStorage.getItem('userData')) || {};
  const fuentes = userData.fuentes || [];
  
  // Reset all checkboxes first
  document.querySelectorAll('input[name="fuentes[]"]').forEach(checkbox => {
    checkbox.checked = false;
  });
  
  // Check the ones in the current selection
  fuentes.forEach(fuente => {
    const checkbox = document.querySelector(`input[name="fuentes[]"][value="${fuente}"]`);
    if (checkbox) {
      checkbox.checked = true;
    }
  });
}

// Function to update checkboxes based on current selections (fuentes reguladores)
function updateFuentesReguladoresCheckboxes() {
  const userData = JSON.parse(sessionStorage.getItem('userData')) || {};
  const reguladores = userData.reguladores || [];
  
  // Reset all checkboxes first
  document.querySelectorAll('input[name="reguladores[]"]').forEach(checkbox => {
    checkbox.checked = false;
  });
  
  // Check the ones in the current selection
  reguladores.forEach(regulador => {
    const checkbox = document.querySelector(`input[name="reguladores[]"][value="${regulador}"]`);
    if (checkbox) {
      checkbox.checked = true;
    }
  });
}

// Function to handle toggling a fuente gobierno checkbox
function toggleFuenteGobierno(checkbox) {
  const value = checkbox.value;
  const userData = JSON.parse(sessionStorage.getItem('userData')) || {};
  if (!userData.fuentes) userData.fuentes = [];
  
  if (checkbox.checked) {
    // Add if not already in the array
    if (!userData.fuentes.includes(value)) {
      userData.fuentes.push(value);
    }
  } else {
    // Remove from the array
    userData.fuentes = userData.fuentes.filter(f => f !== value);
  }
  
  // Save back to sessionStorage
  sessionStorage.setItem('userData', JSON.stringify(userData));
  
  // Refresh the display
  cargarFuentesOficiales(JSON.parse(sessionStorage.getItem('etiquetasRecomendadas')));
}

// Function to handle toggling a fuente reguladores checkbox
function toggleFuenteReguladores(checkbox) {
  const value = checkbox.value;
  const userData = JSON.parse(sessionStorage.getItem('userData')) || {};
  if (!userData.reguladores) userData.reguladores = [];
  
  if (checkbox.checked) {
    // Add if not already in the array
    if (!userData.reguladores.includes(value)) {
      userData.reguladores.push(value);
    }
  } else {
    // Remove from the array
    userData.reguladores = userData.reguladores.filter(r => r !== value);
  }
  
  // Save back to sessionStorage
  sessionStorage.setItem('userData', JSON.stringify(userData));
  
  // Refresh the display
  cargarFuentesOficiales(JSON.parse(sessionStorage.getItem('etiquetasRecomendadas')));
}

// Función para actualizar el contador de fuentes
function actualizarContadorFuentes() {
  const userData = JSON.parse(sessionStorage.getItem('userData')) || {};
  const contador = document.getElementById('contador-fuentes');
  const limiteSpan = document.getElementById('limite-fuentes');
  
  if (contador) {
    const fuentesGobierno = userData.fuentes || [];
    const fuentesReguladores = userData.reguladores || [];
    const numFuentes = fuentesGobierno.length + fuentesReguladores.length;
    contador.textContent = numFuentes;
    
    // Get current plan limit
    const userPlan = sessionStorage.getItem('selectedPlan');
    
    const planLimits = window.PLAN_LIMITS[userPlan] || { fuentes: 1 }; // Default to plan2 if not specified
    
    // Get extras from sessionStorage if any
    const extraFuentes = parseInt(sessionStorage.getItem('extra_fuentes') || '0');
    const totalLimit = planLimits.fuentes + extraFuentes;
    
    // Update or create the limit span
    if (limiteSpan) {
      limiteSpan.textContent = `/${totalLimit} incluidas`;
      
    } else if (contador.parentNode) {
      const newLimiteSpan = document.createElement('span');
      newLimiteSpan.id = 'limite-fuentes';
      newLimiteSpan.className = 'limite-etiquetas';
      newLimiteSpan.textContent = `/${totalLimit} incluidas`;
      contador.parentNode.appendChild(newLimiteSpan);
    
    }
  }
}

/* ─── límites por plan ───────────────────────────────────────── */
window.PLAN_LIMITS = {
  plan2 : { fuentes: 1 , agentes: 5  },   // Start
  plan3 : { fuentes: 5 , agentes: 12 }    // Pro
};

// Log plan limits for debugging
console.log('[paso3.js] PLAN_LIMITS defined:', window.PLAN_LIMITS);
console.log('[paso3.js] Selected plan from sessionStorage:', sessionStorage.getItem('selectedPlan'));