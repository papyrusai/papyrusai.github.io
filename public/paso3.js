// Global variables
let catalogoEtiquetas = null;
let currentStep = 0; // 0: Industrias, 1: Ramas, 2: Fuentes, 3: Rangos

document.addEventListener('DOMContentLoaded', async function() {
  
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
  
  // The existing code for hiding dropdowns when clicking outside remains the same
  document.addEventListener('click', function(e) {
    const target = e.target;
    const filtroInd = document.getElementById('filtro-industrias');
    const dropdownInd = document.getElementById('dropdown-industrias');
    if (dropdownInd && !dropdownInd.contains(target) && target !== filtroInd) {
      dropdownInd.innerHTML = "";
    }
    const filtroRam = document.getElementById('filtro-ramas');
    const dropdownRam = document.getElementById('dropdown-ramas');
    if (dropdownRam && !dropdownRam.contains(target) && target !== filtroRam) {
      dropdownRam.innerHTML = "";
    }
    const filtroFuentesGob = document.getElementById('filtro-fuentes-gobierno');
    const dropdownFuentesGob = document.getElementById('dropdown-fuentes-gobierno');
    if (dropdownFuentesGob && !dropdownFuentesGob.contains(target) && target !== filtroFuentesGob) {
      dropdownFuentesGob.innerHTML = "";
    }
    const filtroFuentesReg = document.getElementById('filtro-fuentes-reguladores');
    const dropdownFuentesReg = document.getElementById('dropdown-fuentes-reguladores');
    if (dropdownFuentesReg && !dropdownFuentesReg.contains(target) && target !== filtroFuentesReg) {
      dropdownFuentesReg.innerHTML = "";
    }
    const filtroRangos = document.getElementById('filtro-rangos');
    const dropdownRangos = document.getElementById('dropdown-rangos');
    if (dropdownRangos && !dropdownRangos.contains(target) && target !== filtroRangos) {
      dropdownRangos.innerHTML = "";
    }
    // ... rest of your click handler code for other dropdowns
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
  // Industries filter
  const filtroIndustrias = document.getElementById('filtro-industrias');
  if (filtroIndustrias) {
    filtroIndustrias.addEventListener('click', function(e) {
      e.stopPropagation();
      hideAllDropdownsExcept('dropdown-industrias');
      showAllIndustriesOptions();
    });
  }

  // Ramas filter
  const filtroRamas = document.getElementById('filtro-ramas');
  if (filtroRamas) {
    filtroRamas.addEventListener('click', function(e) {
      e.stopPropagation();
      hideAllDropdownsExcept('dropdown-ramas');
      showAllRamasOptions();
    });
  }

  // Fuentes gobierno filter
  const filtroFuentesGob = document.getElementById('filtro-fuentes-gobierno');
  if (filtroFuentesGob) {
    filtroFuentesGob.addEventListener('click', function(e) {
      e.stopPropagation();
      hideAllDropdownsExcept('dropdown-fuentes-gobierno');
      showAllFuentesGobiernoOptions();
    });
  }

  // Fuentes reguladores filter
  const filtroFuentesReg = document.getElementById('filtro-fuentes-reguladores');
  if (filtroFuentesReg) {
    filtroFuentesReg.addEventListener('click', function(e) {
      e.stopPropagation();
      hideAllDropdownsExcept('dropdown-fuentes-reguladores');
      showAllFuentesReguladoresOptions();
    });
  }

  // Rangos filter
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
    'dropdown-industrias',
    'dropdown-ramas',
    'dropdown-fuentes-gobierno',
    'dropdown-fuentes-reguladores',
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
}

// Functions to show all options in each dropdown
function showAllIndustriesOptions() {
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

function showAllFuentesGobiernoOptions() {
  const dropdown = document.getElementById('dropdown-fuentes-gobierno');
  dropdown.innerHTML = "";
  const fuentesStatic = ["BOE", "DOUE", "BOCG", "BOA","BOCM", "BOCYL","BOJA","BOPV","DOG","DOGC" ];
  fuentesStatic.forEach(match => {
    const option = document.createElement('div');
    option.className = "dropdown-item";
    option.textContent = match;
    option.onclick = function() {
      seleccionarFuenteGobierno(match);
    };
    dropdown.appendChild(option);
  });
}

function showAllFuentesReguladoresOptions() {
  const dropdown = document.getElementById('dropdown-fuentes-reguladores');
  dropdown.innerHTML = "";
  const fuentesStatic = ["CNMV","AEPD"];
  fuentesStatic.forEach(match => {
    const option = document.createElement('div');
    option.className = "dropdown-item";
    option.textContent = match;
    option.onclick = function() {
      seleccionarFuenteReguladores(match);
    };
    dropdown.appendChild(option);
  });
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
    catalogoEtiquetas = { industrias: [], ramas_juridicas: [], subramas_juridicas: {}, rangos_normativos:{} };
  }
}

function cargarSecciones(etiquetas) {
  cargarIndustrias(etiquetas.industrias || etiquetas.sub_industrias || {});
  cargarRamasJuridicas(etiquetas.ramas_juridicas || [], etiquetas.subramas_juridicas || {});
  cargarFuentesOficiales(etiquetas);
  cargarRangosPredefinidos();
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

/* ------------------ Section "Industrias" ------------------ */
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
        <button class="toggle-detail" onclick="toggleDetalleRama(this)">Ver detalle ▼</button>
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
      //subindustriasContainer.className = 'subramas-container';
      
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


/* ------------------ Section "Ramas Jurídicas" ------------------ */
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
        <button class="toggle-detail" onclick="toggleDetalleRama(this)">Ver detalle ▼</button>
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

/* ------------------ Section "Fuentes Oficiales" ------------------ */
function cargarFuentesOficiales(etiquetas) {
  const userData = JSON.parse(sessionStorage.getItem('userData'));
  if (!userData) return;
  const fuentesGobierno = userData.fuentes || [];
  cargarFuentesGobierno(fuentesGobierno);
  const fuentesReguladores = userData.reguladores || [];
  cargarFuentesReguladores(fuentesReguladores);
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
  rangos.forEach(rango => {
    const tagElement = document.createElement("div");
    tagElement.className = "tag rango-tag";
    tagElement.innerHTML = `
      ${rango}
      <span class="tag-remove" onclick="eliminarRango('${rango}')">×</span>
    `;
    container.appendChild(tagElement);
  });
  // Remove any existing add-tag block if present
  const existingAddDiv = document.querySelector("#section-rangos .add-tag");
  if (existingAddDiv) existingAddDiv.remove();
  // Add a filtering input for rangos on a separate line
  const addDiv = document.createElement("div");
  addDiv.className = "add-tag";
  addDiv.innerHTML = `
    <input type="text" id="filtro-rangos" placeholder="Filtrar rangos..." oninput="filtrarRangos()">
    <div id="dropdown-rangos" class="dropdown-container"></div>
    <p class="feedback-msg">Si no encuentras un filtro que estabas buscando, indícanoslo para seguir mejorando el producto</p>
    <input type="text" id="feedback-rangos" placeholder="Escribe aquí...">
  `;
  document.getElementById("section-rangos").appendChild(addDiv);
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
  });}

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

function eliminarFuente(containerId, fuente) {
  const userData = JSON.parse(sessionStorage.getItem('userData')) || {};
  if (containerId === 'fuentes-gobierno-container') {
    if (userData.fuentes) {
      userData.fuentes = userData.fuentes.filter(f => f !== fuente);
    }
  } else if (containerId === 'fuentes-reguladores-container') {
    if (userData.reguladores) {
      userData.reguladores = userData.reguladores.filter(f => f !== fuente);
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


/* ------------------ Finalize Onboarding ------------------ */
function finalizarOnboarding() {
  const etiquetasFinales = JSON.parse(sessionStorage.getItem("etiquetasRecomendadas"));
  
  // Store the sub_rama_map in the format needed for the next step
  const sub_rama_map = {};
  if (etiquetasFinales.subramas_juridicas) {
    for (const rama in etiquetasFinales.subramas_juridicas) {
      if (etiquetasFinales.subramas_juridicas[rama].length > 0) {
        sub_rama_map[rama] = etiquetasFinales.subramas_juridicas[rama];
      }
    }
  }
  
  // Store the sub_industria_map in the format needed for the next step
  const sub_industria_map = {};
  if (etiquetasFinales.sub_industrias) {
    for (const industria in etiquetasFinales.sub_industrias) {
      if (etiquetasFinales.sub_industrias[industria].length > 0) {
        sub_industria_map[industria] = etiquetasFinales.sub_industrias[industria];
      }
    }
  }
  
  // Store the feedback from any feedback inputs
  const feedback = {
    industrias: document.getElementById('feedback-industria')?.value || '',
    ramas: document.getElementById('feedback-ramas')?.value || '',
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
  
  // Store these in sessionStorage for paso4
  sessionStorage.setItem('industry_tags', JSON.stringify(etiquetasFinales.industrias || []));
  sessionStorage.setItem('sub_industria_map', JSON.stringify(sub_industria_map));
  sessionStorage.setItem('rama_juridicas', JSON.stringify(etiquetasFinales.ramas_juridicas || []));
  sessionStorage.setItem('sub_rama_map', JSON.stringify(sub_rama_map));
  sessionStorage.setItem('rangos', JSON.stringify(etiquetasFinales.rangos_normativos || []));
  sessionStorage.setItem('cobertura_legal', JSON.stringify(cobertura_legal));
  sessionStorage.setItem('feedback', JSON.stringify(feedback));
  
  // Store in hidden inputs for easier access in paso4
  document.getElementById('fuentesGobiernoInput').value = JSON.stringify(userData.fuentes || []);
  document.getElementById('fuentesReguladoresInput').value = JSON.stringify(userData.reguladores || []);
  
  // If we're in edit mode, set a flag for paso4
  if (sessionStorage.getItem('isEditing') === 'true') {
    sessionStorage.setItem('isEditingPlan', 'true');
  }
  
  console.log("Redirecting to paso4.html with data:", {
    industry_tags: etiquetasFinales.industrias,
    sub_industria_map: sub_industria_map,
    rama_juridicas: etiquetasFinales.ramas_juridicas,
    sub_rama_map: sub_rama_map,
    rangos: etiquetasFinales.rangos_normativos,
    cobertura_legal: cobertura_legal,
    feedback: feedback
  });
  
  // Redirect to paso4 instead of showing alert
  window.location.href = 'paso4.html';
}



/* ------------------ Toggle Detail for Ramas ------------------ */
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
    button.textContent = 'Ver detalle ▼';
  }
}

/* --- Expose deletion functions to global scope --- */
window.eliminarFuente = eliminarFuente;
window.eliminarRango = eliminarRango;
window.eliminarEtiqueta = eliminarEtiqueta;
window.eliminarRamaJuridica = eliminarRamaJuridica;
window.eliminarSubrama = eliminarSubrama;
// Expose functions to global scope
window.eliminarIndustria = eliminarIndustria;
window.eliminarSubindustria = eliminarSubindustria;
window.agregarIndustria = agregarIndustria;
window.agregarSubindustria = agregarSubindustria;

