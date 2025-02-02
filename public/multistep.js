/************************************************************
 * 1) GLOBAL VARIABLES
 ************************************************************/
// Steps
let currentStep = 0;

// Plan from Step 2
let selectedPlanGlobal = null;

// Industries => stored in a Set
const selectedItems = new Set();

// Ramas jurídicas => array
const selectedRamaJuridicas = [];

// Sub-rama checks => subRamaCheckMap[ramaName][subName] = bool
const subRamaCheckMap = {};

// Sub-ramas pagination
let subRamasPages = [];
let currentSubRamasPage = 0;

// For easier reference to current user plan
let currentUserPlan = 'plan1';

// [CHANGED] New toggle for free plan2 on the front-end
let isPlan2Free = "yes"; // can be set to "yes" or "no"


/************************************************************
 * 2) The subRamasMap (Rama -> array of sub-ramas)
 ************************************************************/
const subRamasMap = { 
  "Derecho Civil": [
    "genérico", "familia", "sucesiones", "divorcios", "arrendamientos",
    "responsabilidad civil", "contratos", "obligaciones", "propiedad", 
    "derechos reales", "hipotecas", "servidumbres", "donaciones"
  ],
  "Derecho Mercantil": [
    "genérico", "M&A", "financiero", "inmobiliario", "mercados de capital",
    "societario", "gobierno corporativo", "seguros", "propiedad industrial",
    "contratos mercantiles", "banca y seguros", "franquicias", 
    "marcas y patentes", "quiebras y reestructuración empresarial"
  ],
  "Derecho Administrativo": [
    "genérico", "energía", "medio ambiente", "urbanismo", "sectores regulados",
    "bancario", "contratación pública", "contencioso-administrativo",
    "subvenciones", "expropiaciones", "licencias y permisos", 
    "responsabilidad patrimonial", "transparencia y buen gobierno"
  ],
  "Derecho Fiscal": [
    "genérico", "tributación internacional", "IVA", "IS", "IRNR",
    "planificación fiscal", "impuestos locales", "procedimientos tributarios",
    "impuestos indirectos", "impuestos directos", "fiscalidad empresarial", 
    "fiscalidad de personas físicas", "precios de transferencia"
  ],
  "Derecho Laboral": [
    "genérico", "contratación", "despidos", "negociación colectiva", 
    "reclamaciones salariales", "prevención de riesgos laborales", 
    "seguridad social", "expatriados", "acoso laboral", "movilidad geográfica",
    "conflictos colectivos", "externalización"
  ],
  "Derecho Procesal-Civil": [
    "genérico", "pleitos masa (cláusulas suelo, cárteles)", 
    "impugnación acuerdos societarios", "desahucio", 
    "ejecución de sentencias", "medidas cautelares", 
    "responsabilidad civil", "arbitraje", "mediación", 
    "procesos monitorios"
  ],
  "Derecho Procesal-Penal": [
    "genérico", "delitos medioambientales", "delitos económicos",
    "delitos de sangre", "delitos informáticos", "blanqueo de capitales",
    "violencia de género", "delitos contra la propiedad", 
    "delitos contra la seguridad vial", "delitos de corrupción", 
    "delitos societarios", "delitos fiscales"
  ],
  "Derecho Constitucional": [
    "genérico", "derechos fundamentales", "control de constitucionalidad", 
    "reparto de competencias", "procedimientos constitucionales", 
    "amparo constitucional", "estado de derecho", 
    "sistemas electorales", "reformas constitucionales"
  ],
  "Derecho de la UE": [
    "genérico", "mercado interior", "competencia", 
    "protección de datos (GDPR)", "ayudas de Estado", 
    "derechos fundamentales de la UE", "normativa comunitaria", 
    "política agraria común", "libre circulación de bienes y personas"
  ],
  "Derecho Internacional Privado": [
    "genérico", "conflictos de leyes", "contratos internacionales",
    "reconocimiento de sentencias extranjeras", "matrimonios internacionales", 
    "adopciones internacionales", "arbitraje internacional", 
    "comercio internacional"
  ],
  "Derecho Internacional Público": [
    "genérico", "tratados internacionales", "derecho diplomático", 
    "derecho humanitario", "organismos internacionales", 
    "derechos humanos", "derecho del mar", "derecho penal internacional", 
    "conflictos armados", "resolución de disputas internacionales"
  ],
  "Derecho Penal Económico": [
    "genérico", "fraudes", "insolvencias punibles", "blanqueo de capitales",
    "delitos societarios", "delitos fiscales", "corrupción", "cárteles"
  ],
  "Derecho Informático": [
    "genérico", "protección de datos", "ciberseguridad", 
    "contratos tecnológicos", "blockchain y criptomonedas", 
    "propiedad intelectual digital", "regulación de IA", 
    "delitos informáticos"
  ],
  "Derecho Ambiental": [
    "genérico", "cambio climático", "protección de la biodiversidad", 
    "gestión de residuos", "energías renovables", "impacto ambiental", 
    "contaminación", "legislación sobre agua", "legislación forestal"
  ]
};

/************************************************************
 * 3) Utility
 ************************************************************/
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

function resetSubmitButton() {
  const submitButton = document.getElementById('nextBtn');
  if (!submitButton) return;
  if (submitButton.innerHTML.includes('loader')) {
    submitButton.innerHTML = 'Siguiente';
    submitButton.disabled = false;
  }
}

/************************************************************
 * 4) DOMContentLoaded => Main Setup
 ************************************************************/
window.addEventListener('DOMContentLoaded', async () => {

  // [CHANGED] Optionally set isPlan2Free = "yes" here or read from some hidden input
  const possibleFreeVal = document.getElementById('isPlan2FreeInput');
  if (possibleFreeVal && possibleFreeVal.value === 'yes') {
    isPlan2Free = 'yes';
  }

  const formContainer = document.getElementById('multiStepForm');
  const formLoader = document.getElementById('pageLoaderOverlay');

  const urlParams = new URLSearchParams(window.location.search);
  const stepParam = urlParams.get('step');

  if (stepParam === '2') {
    currentStep = 1; 
  }

  showStep(currentStep);
  formLoader.style.display = 'none';
  formContainer.style.display = 'block';

  // Setup industry search
  const industrySearchInput = document.getElementById('industrySearchInput');
  const industryListContainer = document.getElementById('industry-list-container');
  if (industrySearchInput && industryListContainer) {
    industrySearchInput.addEventListener('focus', () => {
      if (!industrySearchInput.value.trim()) {
        resetIndustryListAI(); 
      }
      industryListContainer.style.display = 'block';
    });
    industrySearchInput.addEventListener('input', () => {
      performIndustryFilter(); 
      industryListContainer.style.display = 'block';
    });
    document.addEventListener('click', (event) => {
      if (
        !industrySearchInput.contains(event.target) &&
        !industryListContainer.contains(event.target)
      ) {
        industryListContainer.style.display = 'none';
      }
    });
  }

  // Setup Ramas search
  const ramaSearchInput = document.getElementById('ramaJuridicaSearchInput');
  const ramaListContainer = document.getElementById('ramaJuridicaListContainer');
  if (ramaSearchInput && ramaListContainer) {
    ramaSearchInput.addEventListener('focus', () => {
      if (!ramaSearchInput.value.trim()) {
        resetRamaJuridicaList(selectedRamaJuridicas);
      }
      ramaListContainer.style.display = 'block';
    });
    ramaSearchInput.addEventListener('input', () => {
      filterRamasJuridicas();
      ramaListContainer.style.display = 'block';
    });
    document.addEventListener('click', (event) => {
      if (
        !ramaSearchInput.contains(event.target) &&
        !ramaListContainer.contains(event.target)
      ) {
        ramaListContainer.style.display = 'none';
      }
    });
  }

  // Fetch user data => restore
  try {
    const response = await fetch('/api/current-user-details');
    if (!response.ok) throw new Error('Error loading user details');
    const userData = await response.json();

    currentUserPlan = userData.subscription_plan || 'plan1';

    if (userData.industry_tags) {
      userData.industry_tags.forEach(tag => selectedItems.add(tag));
    }
    if (userData.rama_juridicas) {
      userData.rama_juridicas.forEach(r => selectedRamaJuridicas.push(r));
    }
    if (userData.sub_rama_map) {
      for (const ramaName in userData.sub_rama_map) {
        const subArr = userData.sub_rama_map[ramaName];
        if (!subRamaCheckMap[ramaName]) {
          subRamaCheckMap[ramaName] = {};
        }
        subArr.forEach(subName => {
          subRamaCheckMap[ramaName][subName] = true;
        });
      }
    }
  } catch (err) {
    console.error('Error retrieving user data:', err);
  }

  showStep(currentStep);
  updateSelectedIndustries();
  updateSelectedRamaJuridica();
});

window.addEventListener('pageshow', () => {
  resetSubmitButton();
});

/************************************************************
 * 5) Show/Hide Steps
 ************************************************************/
function showStep(step) {
  const steps = document.querySelectorAll('.form-step');
  const progressSteps = document.querySelectorAll('.progress-indicator .step');
  const progressBars = document.querySelectorAll('.form-step .progress');
  const nextBtn = document.getElementById('nextBtn');
  const prevBtn = document.getElementById('prevBtn');

  steps.forEach((el, i) => {
    el.style.display = i === step ? 'block' : 'none';
  });
  progressSteps.forEach((el, i) => {
    el.classList.toggle('active', i <= step);
  });

  const stepWidth = (100 / steps.length) * (step + 1);
  if (progressBars[step]) {
    progressBars[step].style.width = `${stepWidth}%`;
  }

  prevBtn.style.display = step === 0 ? 'none' : 'inline';
  nextBtn.innerHTML = step === steps.length - 1 ? 'Finalizar' : 'Siguiente';

  if (prevBtn.style.display === 'inline') {
    nextBtn.style.marginLeft = '0';
    nextBtn.style.marginRight = '35%';
  } else {
    nextBtn.style.marginLeft = 'auto';
    nextBtn.style.marginRight = 'auto';
  }
}

function nextPrev(n) {
  const steps = document.querySelectorAll('.form-step');

  // If going forward, do validations
  if (n > 0) {
    // Step 0 => user type
    if (currentStep === 0) {
      const profileType = document.getElementById('selectedProfileType').value.trim();
      if (!profileType) {
        alert('Selecciona el tipo de usuario o ingresa un valor personalizado');
        return;
      }
    }
    // Step 1 => plan
    if (currentStep === 1) {
      const plan = document.getElementById('selectedPlan').value;
      if (!plan) {
        alert('Selecciona un plan para pasar al siguiente paso');
        return;
      }
    }
  }

  // If we are at step 2 => final submission
  if (currentStep === 2 && n > 0) {
    // Must have at least 1 industry
    if (selectedItems.size === 0) {
      alert('Selecciona al menos una industria antes de continuar');
      return;
    }
    const plan = document.getElementById('selectedPlan').value;
    if (!plan) {
      alert('Error: no se detectó plan seleccionado');
      return;
    }
    const profileType = document.getElementById('selectedProfileType').value.trim();

    // [CHANGED] If plan2 is free => handleFreePlanSubmission with no limit
    if (plan === 'plan2' && isPlan2Free === 'yes') {
      handleFreePlanSubmission(plan, profileType);
      return;
    }

    // If user already has plan2 and reselects plan2
    if (plan === 'plan2' && currentUserPlan === 'plan2') {
      handleSamePlan2Submission(plan, profileType);
      return;
    }

    if (plan === 'plan2' || plan === 'plan3') {
      handleStripeCheckout(plan, profileType);
      return;
    } 

    // if plan1 + user was on plan2 => cancel plan2
    if (plan === 'plan1' && currentUserPlan === 'plan2') {
      // enforce free plan limit => 1 sector, 2 ramas
      if (selectedItems.size > 1) {
        showPlanLimitWarning();
        return;
      }
      const ramaJList = document.querySelectorAll('#selectedRamaJuridicaList span');
      if (ramaJList.length > 2) {
        showPlanLimitWarning();
        return;
      }
      handleChangePlan2toPlan1Submission(plan, profileType);
      return;
    }
    // If plan1 => free
    else if (plan === 'plan1') {
      if (selectedItems.size > 1) {
        showPlanLimitWarning();
        return;
      }
      const ramaJList = document.querySelectorAll('#selectedRamaJuridicaList span');
      if (ramaJList.length > 2) {
        showPlanLimitWarning();
        return;
      }
      handleFreePlanSubmission(plan, profileType);
      return;
    }
  }

  // Normal step navigation
  steps[currentStep].style.display = 'none';
  currentStep += n;
  if (currentStep >= steps.length) {
    return false;
  }
  showStep(currentStep);
}

/************************************************************
 * 6) Step 1 => Profile Option
 ************************************************************/
function selectProfileOption(element, type) {
  document.querySelectorAll('.profile-option').forEach(opt => {
    opt.classList.remove('active');
  });
  element.classList.add('active');

  const otherInput = document.getElementById('otherProfileInput');
  if (type === 'Other') {
    otherInput.style.display = 'block';
    otherInput.focus();
    document.getElementById('selectedProfileType').value = '';
  } else {
    document.getElementById('selectedProfileType').value = type;
  }
}

function updateOtherProfile(input) {
  const val = input.value.trim();
  document.getElementById('selectedProfileType').value = val;
}

/************************************************************
 * 7) Step 2 => Select Plan
 ************************************************************/
document.addEventListener('DOMContentLoaded', () => {
  const planBoxes = document.querySelectorAll('.plan-box');
  const selectedPlanInput = document.getElementById('selectedPlan');

  planBoxes.forEach(plan => {
    plan.addEventListener('click', () => {
      const isDisabled = plan.getAttribute('data-disabled') === 'true';
      if (isDisabled) {
        const badge = plan.querySelector('.coming-soon');
        if (badge) {
          badge.classList.remove('highlighted');
          void badge.offsetWidth; 
          badge.classList.add('highlighted');
        }
        return;
      }
      planBoxes.forEach(b => b.classList.remove('selected'));
      plan.classList.add('selected');
      const planValue = plan.getAttribute('data-value');
      selectedPlanGlobal = planValue;
      if (selectedPlanInput) {
        selectedPlanInput.value = planValue;
      }
      console.log('Selected Plan:', planValue);
    });
  });
});

/************************************************************
 * 8) Step 3 => Industries + Ramas + sub-ramas
 ************************************************************/
function showPlanLimitWarning() {
  const warning = document.getElementById('planLimitWarning');
  if (warning) warning.style.display = 'block';
}
function closePlanLimitWarning() {
  const warning = document.getElementById('planLimitWarning');
  if (warning) warning.style.display = 'none';
}

function updateSelectedIndustries() {
  const list = document.getElementById('selectedIndustriesList');
  if (!list) return;

  list.innerHTML = '';
  selectedItems.forEach(item => {
    const span = document.createElement('span');
    span.className = 'selected-industry-item';
    span.textContent = item;

    const closeBtn = document.createElement('span');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '×';
    closeBtn.onclick = () => {
      selectedItems.delete(item);
      document.querySelectorAll('.industry-item').forEach(el => {
        if (el.getAttribute('data-value') === item) {
          el.classList.remove('selected');
        }
      });
      updateSelectedIndustries();
    };
    span.appendChild(closeBtn);

    list.appendChild(span);
  });

  const sectorsCounter = document.getElementById('sectorsCounter');
  if (sectorsCounter) {
    sectorsCounter.innerHTML = `<i>Sectores de interés: ${selectedItems.size}</i>`;
  }
}

function updateSelectedRamaJuridica() {
  const list = document.getElementById('selectedRamaJuridicaList');
  if (!list) return;

  list.innerHTML = '';
  const ramaList = document.getElementById('ramaJuridicaList'); 

  selectedRamaJuridicas.forEach(value => {
    const span = document.createElement('span');
    span.className = 'selected-industry-item';
    span.textContent = value;

    const closeBtn = document.createElement('span');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '×';
    closeBtn.onclick = () => {
      const idx = selectedRamaJuridicas.indexOf(value);
      if (idx > -1) selectedRamaJuridicas.splice(idx, 1);
      if (ramaList) {
        const itemDiv = Array.from(ramaList.children)
          .find(el => el.getAttribute('data-value') === value);
        if (itemDiv) itemDiv.classList.remove('selected');
      }
      updateSelectedRamaJuridica();
    };
    span.appendChild(closeBtn);

    list.appendChild(span);
  });

  const ramasCounter = document.getElementById('ramasCounter');
  if (ramasCounter) {
    ramasCounter.innerHTML = `<i>Ramas de interés: ${selectedRamaJuridicas.length}</i>`;
  }

  const subRamasContainer = document.getElementById('subRamasContainer');
  if (subRamasContainer) {
    if (selectedRamaJuridicas.length > 0) {
      subRamasContainer.style.display = 'block';
    } else {
      subRamasContainer.style.display = 'none';
      return;
    }
  }

  subRamasPages = chunkArray(selectedRamaJuridicas, 3);
  currentSubRamasPage = 0;
  showSubRamasPage(currentSubRamasPage);
  updateSubRamasPaginationUI();
}

/************************************************************
 * 9) Sub-Ramas Pagination
 ************************************************************/
function showSubRamasPage(pageIndex) {
  const subRamasColumns = document.getElementById('subRamasColumns');
  if (!subRamasColumns) return;

  subRamasColumns.innerHTML = '';
  const ramasOnThisPage = subRamasPages[pageIndex] || [];

  ramasOnThisPage.forEach(ramaName => {
    const colDiv = document.createElement('div');
    colDiv.className = 'sub-rama-column';

    const titleElem = document.createElement('div');
    titleElem.className = 'sub-rama-title';
    titleElem.innerHTML = `
      <span class="rama-name">${ramaName}</span>
      <span class="sub-rama-arrow" style="float:right; cursor:pointer;">
        <i class="fas fa-chevron-down"></i>
      </span>
    `;
    colDiv.appendChild(titleElem);

    const itemsWrapper = document.createElement('div');
    itemsWrapper.className = 'sub-rama-items-wrapper';
    itemsWrapper.style.display = 'none'; 
    colDiv.appendChild(itemsWrapper);

    const subList = subRamasMap[ramaName] || [];
    if (!subRamaCheckMap[ramaName]) {
      subRamaCheckMap[ramaName] = {};
    }

    subList.forEach(subName => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'sub-rama-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = subName;

      const prevVal = subRamaCheckMap[ramaName][subName];
      if (prevVal === undefined) {
        checkbox.checked = true;
        subRamaCheckMap[ramaName][subName] = true;
      } else {
        checkbox.checked = !!prevVal;
      }
      checkbox.addEventListener('change', () => {
        subRamaCheckMap[ramaName][subName] = checkbox.checked;
      });

      const label = document.createElement('label');
      label.textContent = subName;

      itemDiv.appendChild(checkbox);
      itemDiv.appendChild(label);
      itemsWrapper.appendChild(itemDiv);
    });

    const arrowSpan = titleElem.querySelector('.sub-rama-arrow');
    arrowSpan.addEventListener('click', e => {
      e.stopPropagation();
      if (itemsWrapper.style.display === 'none') {
        itemsWrapper.style.display = 'block';
        arrowSpan.innerHTML = '<i class="fas fa-chevron-up"></i>';
      } else {
        itemsWrapper.style.display = 'none';
        arrowSpan.innerHTML = '<i class="fas fa-chevron-down"></i>';
      }
    });

    subRamasColumns.appendChild(colDiv);
  });
}

function updateSubRamasPaginationUI() {
  const paginationContainer = document.getElementById('subRamasPagination');
  if (!paginationContainer) return;

  const paginationText = document.getElementById('paginationText');
  const prevBtn = document.getElementById('prevSubRamasBtn');
  const nextBtn = document.getElementById('nextSubRamasBtn');
  const totalPages = subRamasPages.length;

  if (totalPages <= 1) {
    paginationContainer.style.display = 'none';
    return;
  }
  paginationContainer.style.display = 'flex';

  const currentPage = currentSubRamasPage + 1;
  paginationText.textContent = `(${currentPage}/${totalPages})`;

  if (currentSubRamasPage === 0) {
    prevBtn.style.display = 'none';
  } else {
    prevBtn.style.display = 'inline-block';
  }
  if (currentSubRamasPage === totalPages - 1) {
    nextBtn.style.display = 'none';
  } else {
    nextBtn.style.display = 'inline-block';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const prevBtn = document.getElementById('prevSubRamasBtn');
  const nextBtn = document.getElementById('nextSubRamasBtn');
  if (prevBtn && nextBtn) {
    prevBtn.addEventListener('click', e => {
      e.preventDefault();
      if (currentSubRamasPage > 0) {
        currentSubRamasPage--;
        showSubRamasPage(currentSubRamasPage);
        updateSubRamasPaginationUI();
      }
    });
    nextBtn.addEventListener('click', e => {
      e.preventDefault();
      if (currentSubRamasPage < subRamasPages.length - 1) {
        currentSubRamasPage++;
        showSubRamasPage(currentSubRamasPage);
        updateSubRamasPaginationUI();
      }
    });
  }
});


/************************************************************
 * 10) Searching Industries => performIndustryFilter() using Fuse
 ************************************************************/
// [CHANGED] We rename the function to "performIndustryFilter" 
// and do a local Fuse-based search on the fullIndustries array.

function performIndustryFilter() {
  const input = document.getElementById('industrySearchInput');
  if (!input) return;
  const query = input.value.trim();

  const industryList = document.getElementById('industryList');
  if (!industryList) return;

  // If no query => show full list
  if (!query) {
    resetIndustryListAI();
    return;
  }

  // [CHANGED] Full local list:
  const fullIndustries = [
    "Agricultura, ganadería, caza y servicios relacionados",
    "Silvicultura y explotación forestal",
    "Pesca y acuicultura",
    "Extracción de antracita, hulla y lignito",
    "Extracción de crudo de petróleo y gas natural",
    "Extracción de minerales metálicos",
    "Otras industrias extractivas",
    "Actividades de apoyo a las industrias extractivas",
    "Industria de la alimentación",
    "Fabricación de bebidas",
    "Industria del tabaco",
    "Industria textil",
    "Confección de prendas de vestir",
    "Industria del cuero y del calzado",
    "Industria de la madera y del corcho",
    "Industria del papel",
    "Artes gráficas y reproducción de soportes grabados",
    "Coquerías y refino de petróleo",
    "Industria química",
    "Fabricación de productos farmacéuticos",
    "Fabricación de productos de caucho y plásticos",
    "Fabricación de otros productos minerales no metálicos",
    "Metalurgia; fabricación de productos de hierro y acero",
    "Fabricación de productos metálicos, excepto maquinaria",
    "Fabricación de productos informáticos, electrónicos y ópticos",
    "Fabricación de material y equipo eléctrico",
    "Fabricación de maquinaria y equipo n.c.o.p",
    "Fabricación de vehículos de motor, remolques y semirremolques",
    "Fabricación de otro material de transporte",
    "Fabricación de muebles",
    "Otras industrias manufactureras",
    "Reparación e instalación de maquinaria y equipo",
    "Suministro de energía eléctrica, gas, vapor y aire acondicionado",
    "Captación, depuración y distribución de agua",
    "Recogida y tratamiento de aguas residuales",
    "Gestión de residuos",
    "Actividades de descontaminación",
    "Construcción de edificios",
    "Ingeniería civil",
    "Actividades de construcción especializada",
    "Venta y reparación de vehículos de motor",
    "Comercio al por mayor",
    "Comercio al por menor",
    "Transporte terrestre y por tubería",
    "Transporte marítimo y por vías navegables interiores",
    "Transporte aéreo",
    "Almacenamiento y actividades anexas al transporte",
    "Actividades postales y de correos",
    "Servicios de alojamiento",
    "Servicios de comidas y bebidas",
    "Edición",
    "Actividades cinematográficas y de vídeo",
    "Actividades de programación y emisión",
    "Telecomunicaciones",
    "Programación, consultoría y otras actividades informáticas",
    "Servicios de información",
    "Servicios financieros, excepto seguros y fondos de pensiones",
    "Seguros, reaseguros y fondos de pensiones",
    "Actividades auxiliares a los servicios financieros y seguros",
    "Actividades inmobiliarias",
    "Actividades jurídicas y de contabilidad",
    "Consultoría de gestión empresarial",
    "Servicios técnicos de arquitectura e ingeniería",
    "Investigación y desarrollo",
    "Publicidad y estudios de mercado",
    "Otras actividades profesionales, científicas y técnicas",
    "Actividades veterinarias",
    "Actividades de alquiler",
    "Actividades relacionadas con el empleo",
    "Agencias de viajes, operadores turísticos",
    "Actividades de seguridad e investigación",
    "Servicios a edificios y actividades de jardinería",
    "Actividades administrativas de oficina",
    "Administración pública y defensa",
    "Educación",
    "Actividades sanitarias",
    "Asistencia en establecimientos residenciales",
    "Actividades de servicios sociales sin alojamiento",
    "Actividades de creación, artísticas y espectáculos",
    "Bibliotecas, archivos, museos y otras actividades culturales",
    "Actividades de juegos de azar y apuestas",
    "Actividades deportivas, recreativas y de entretenimiento",
    "Actividades de organizaciones asociativas",
    "Reparación de ordenadores y artículos personales",
    "Otros servicios personales",
    "Actividades de los hogares como empleadores",
    "Actividades de los hogares como productores",
    "Actividades de organizaciones y organismos extraterritoriales"
  ];

  // [CHANGED] Use Fuse to filter
  const fuse = new Fuse(fullIndustries, {
    includeScore: true,
    threshold: 0.3,
    ignoreLocation: true,
    minMatchCharLength: 2,
    distance: 100
  });

  const fuseResults = fuse.search(query);
  const filtered = fuseResults.map(r => r.item);

  // Now show the filtered results
  industryList.innerHTML = '';

  filtered.forEach(item => {
    const div = document.createElement('div');
    div.className = 'industry-item';
    div.textContent = item;
    div.setAttribute('data-value', item);

    if (selectedItems.has(item)) {
      div.classList.add('selected');
    }
    div.addEventListener('click', () => {
      if (selectedPlanGlobal === 'plan1') {
        if (!selectedItems.has(item) && selectedItems.size >= 1) {
          showPlanLimitWarning();
          return;
        }
      }
      if (selectedItems.has(item)) {
        selectedItems.delete(item);
        div.classList.remove('selected');
      } else {
        selectedItems.add(item);
        div.classList.add('selected');
      }
      updateSelectedIndustries();
    });
    industryList.appendChild(div);
  });
}

/** If query is empty => show full list */
function resetIndustryListAI() {
  const industryList = document.getElementById('industryList');
  if (!industryList) return;

  industryList.innerHTML = '';
  const fullIndustries = [
    "Agricultura, ganadería, caza y servicios relacionados",
    "Silvicultura y explotación forestal",
    "Pesca y acuicultura",
    "Extracción de antracita, hulla y lignito",
    "Extracción de crudo de petróleo y gas natural",
    "Extracción de minerales metálicos",
    "Otras industrias extractivas",
    "Actividades de apoyo a las industrias extractivas",
    "Industria de la alimentación",
    "Fabricación de bebidas",
    "Industria del tabaco",
    "Industria textil",
    "Confección de prendas de vestir",
    "Industria del cuero y del calzado",
    "Industria de la madera y del corcho",
    "Industria del papel",
    "Artes gráficas y reproducción de soportes grabados",
    "Coquerías y refino de petróleo",
    "Industria química",
    "Fabricación de productos farmacéuticos",
    "Fabricación de productos de caucho y plásticos",
    "Fabricación de otros productos minerales no metálicos",
    "Metalurgia; fabricación de productos de hierro y acero",
    "Fabricación de productos metálicos, excepto maquinaria",
    "Fabricación de productos informáticos, electrónicos y ópticos",
    "Fabricación de material y equipo eléctrico",
    "Fabricación de maquinaria y equipo n.c.o.p",
    "Fabricación de vehículos de motor, remolques y semirremolques",
    "Fabricación de otro material de transporte",
    "Fabricación de muebles",
    "Otras industrias manufactureras",
    "Reparación e instalación de maquinaria y equipo",
    "Suministro de energía eléctrica, gas, vapor y aire acondicionado",
    "Captación, depuración y distribución de agua",
    "Recogida y tratamiento de aguas residuales",
    "Gestión de residuos",
    "Actividades de descontaminación",
    "Construcción de edificios",
    "Ingeniería civil",
    "Actividades de construcción especializada",
    "Venta y reparación de vehículos de motor",
    "Comercio al por mayor",
    "Comercio al por menor",
    "Transporte terrestre y por tubería",
    "Transporte marítimo y por vías navegables interiores",
    "Transporte aéreo",
    "Almacenamiento y actividades anexas al transporte",
    "Actividades postales y de correos",
    "Servicios de alojamiento",
    "Servicios de comidas y bebidas",
    "Edición",
    "Actividades cinematográficas y de vídeo",
    "Actividades de programación y emisión",
    "Telecomunicaciones",
    "Programación, consultoría y otras actividades informáticas",
    "Servicios de información",
    "Servicios financieros, excepto seguros y fondos de pensiones",
    "Seguros, reaseguros y fondos de pensiones",
    "Actividades auxiliares a los servicios financieros y seguros",
    "Actividades inmobiliarias",
    "Actividades jurídicas y de contabilidad",
    "Consultoría de gestión empresarial",
    "Servicios técnicos de arquitectura e ingeniería",
    "Investigación y desarrollo",
    "Publicidad y estudios de mercado",
    "Otras actividades profesionales, científicas y técnicas",
    "Actividades veterinarias",
    "Actividades de alquiler",
    "Actividades relacionadas con el empleo",
    "Agencias de viajes, operadores turísticos",
    "Actividades de seguridad e investigación",
    "Servicios a edificios y actividades de jardinería",
    "Actividades administrativas de oficina",
    "Administración pública y defensa",
    "Educación",
    "Actividades sanitarias",
    "Asistencia en establecimientos residenciales",
    "Actividades de servicios sociales sin alojamiento",
    "Actividades de creación, artísticas y espectáculos",
    "Bibliotecas, archivos, museos y otras actividades culturales",
    "Actividades de juegos de azar y apuestas",
    "Actividades deportivas, recreativas y de entretenimiento",
    "Actividades de organizaciones asociativas",
    "Reparación de ordenadores y artículos personales",
    "Otros servicios personales",
    "Actividades de los hogares como empleadores",
    "Actividades de los hogares como productores",
    "Actividades de organizaciones y organismos extraterritoriales"
  ];

  fullIndustries.forEach(ind => {
    const div = document.createElement('div');
    div.className = 'industry-item';
    div.textContent = ind;
    div.setAttribute('data-value', ind);

    if (selectedItems.has(ind)) {
      div.classList.add('selected');
    }
    // On click => toggle
    div.addEventListener('click', (event) => {
      event.stopPropagation();

      if (selectedPlanGlobal === 'plan1') {
        if (!selectedItems.has(ind) && selectedItems.size >= 1) {
          showPlanLimitWarning();
          return;
        }
      }
      if (selectedItems.has(ind)) {
        selectedItems.delete(ind);
        div.classList.remove('selected');
      } else {
        selectedItems.add(ind);
        div.classList.add('selected');
      }
      updateSelectedIndustries();
    });
    industryList.appendChild(div);
  });
}

/************************************************************
 * 11) Searching Ramas => filterRamasJuridicas()
 ************************************************************/
async function filterRamasJuridicas() {
  const input = document.getElementById('ramaJuridicaSearchInput');
  if (!input) return;
  const query = input.value.trim();

  const ramaJuridicaList = document.getElementById('ramaJuridicaList');
  if (!ramaJuridicaList) return;

  if (!query) {
    resetRamaJuridicaList(selectedRamaJuridicas);
    return;
  }
  try {
    const response = await fetch(`/search-ramas-juridicas?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Error fetching Ramas');
    const filteredRamas = await response.json();

    ramaJuridicaList.innerHTML = '';

    filteredRamas.forEach(rama => {
      const div = document.createElement('div');
      div.className = 'rama-item';
      div.textContent = rama;
      div.setAttribute('data-value', rama);

      if (selectedRamaJuridicas.includes(rama)) {
        div.classList.add('selected');
      }
      div.addEventListener('click', (event) => {
        event.stopPropagation();
        if (selectedPlanGlobal === 'plan1') {
          const isAlready = selectedRamaJuridicas.includes(rama);
          if (!isAlready && selectedRamaJuridicas.length >= 1) {
            showPlanLimitWarning();
            return;
          }
        }
        if (selectedRamaJuridicas.includes(rama)) {
          const idx = selectedRamaJuridicas.indexOf(rama);
          if (idx > -1) selectedRamaJuridicas.splice(idx, 1);
          div.classList.remove('selected');
        } else {
          selectedRamaJuridicas.push(rama);
          div.classList.add('selected');
        }
        updateSelectedRamaJuridica();
      });

      ramaJuridicaList.appendChild(div);
    });
  } catch (err) {
    console.error('Error filtering Ramas:', err);
  }
}

function resetRamaJuridicaList(selectedValues=[]) {
  const ramaJuridicaList = document.getElementById('ramaJuridicaList');
  if (!ramaJuridicaList) return;

  ramaJuridicaList.innerHTML = '';
  const fullRamas = [
    "Derecho Civil",
    "Derecho Mercantil",
    "Derecho Administrativo",
    "Derecho Fiscal",
    "Derecho Laboral",
    "Derecho Procesal-Civil",
    "Derecho Procesal-Penal",
    "Derecho Constitucional",
    "Derecho de la UE",
    "Derecho Internacional Público",
    "Derecho Internacional Privado",
    "Derecho Penal Económico",
    "Derecho Informático",
    "Derecho Ambiental"
    ];

  fullRamas.forEach(rama => {
    const div = document.createElement('div');
    div.className = 'rama-item';
    div.textContent = rama;
    div.setAttribute('data-value', rama);

    if (selectedValues.includes(rama)) {
      div.classList.add('selected');
    }
    div.addEventListener('click', (event) => {
      event.stopPropagation();
      if (selectedPlanGlobal === 'plan1') {
        const isAlready = selectedRamaJuridicas.includes(rama);
        if (!isAlready && selectedRamaJuridicas.length >= 1) {
          showPlanLimitWarning();
          return;
        }
      }
      if (selectedRamaJuridicas.includes(rama)) {
        const idx = selectedRamaJuridicas.indexOf(rama);
        if (idx > -1) selectedRamaJuridicas.splice(idx, 1);
        div.classList.remove('selected');
      } else {
        selectedRamaJuridicas.push(rama);
        div.classList.add('selected');
      }
      updateSelectedRamaJuridica();
    });
    ramaJuridicaList.appendChild(div);
  });

  ramaJuridicaList.style.display = 'block';
}

/************************************************************
 * 12) Free Plan or Stripe Plan Submission
 ************************************************************/
function buildSubRamaMap() {
  const sub_rama_map = {};
  for (const ramaName in subRamaCheckMap) {
    const subObj = subRamaCheckMap[ramaName];
    const checkedSubs = Object.keys(subObj).filter(k => subObj[k]);
    if (checkedSubs.length > 0) {
      sub_rama_map[ramaName] = checkedSubs;
    }
  }
  return sub_rama_map;
}

async function handleFreePlanSubmission(plan, profileType) {
  const industries = Array.from(document.querySelectorAll('#selectedIndustriesList span'))
    .map(el => el.textContent.replace('×','').trim())
    .filter(s => s);

  const ramas = Array.from(document.querySelectorAll('#selectedRamaJuridicaList span'))
    .map(el => el.textContent.replace('×','').trim())
    .filter(s => s);

  const submitButton = document.getElementById('nextBtn');
  submitButton.innerHTML = '<div class="loader"></div>';
  submitButton.disabled = true;

  const sub_rama_map = buildSubRamaMap();
  try {
    const resp = await fetch('/save-free-plan', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        plan,
        industry_tags: industries,
        rama_juridicas: ramas,
        profile_type: profileType,
        sub_rama_map
      }),
    });
    if (!resp.ok) throw new Error('Failed to save free plan data');
    const result = await resp.json();
    if (result.redirectUrl) {
      window.location.href = result.redirectUrl;
    } else {
      throw new Error('No redirectUrl from server');
    }
  } catch (err) {
    console.error('Error saving free plan:', err);
    alert('Failed to process your request. Please try again.');
    submitButton.innerHTML = 'Finalizar';
    submitButton.disabled = false;
  }
}

async function handleStripeCheckout(plan, profileType) {
  const industries = Array.from(document.querySelectorAll('#selectedIndustriesList span'))
    .map(el => el.textContent.replace('×','').trim())
    .filter(s => s);

  const ramas = Array.from(document.querySelectorAll('#selectedRamaJuridicaList span'))
    .map(el => el.textContent.replace('×','').trim())
    .filter(s => s);

  const sub_rama_map = buildSubRamaMap();
  const submitButton = document.getElementById('nextBtn');
  submitButton.innerHTML = '<div class="loader"></div>';
  submitButton.disabled = true;

  let isTrial = false;
  if (plan === 'plan2') {
    isTrial = true;
  }

  try {
    const resp = await fetch('/create-checkout-session', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        plan,
        industry_tags: industries,
        rama_juridicas: ramas,
        profile_type: profileType,
        sub_rama_map,
        isTrial
      }),
    });
    if (!resp.ok) throw new Error('Failed to create Checkout Session');
    const { sessionId } = await resp.json();
    const stripe = Stripe('pk_live_51QOlLCEpe9srfTKE4ymTYWhMSWs7qDvRQvmnzgoh0FmOWQ9cYTlOawWNiWQReOQeDx7Uslw7cbj9ClBGFas8heQq00wKegaiJg'); //live
    await stripe.redirectToCheckout({ sessionId });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    alert('Failed to redirect to payment page. Please try again.');
    submitButton.innerHTML = 'Submit';
    submitButton.disabled = false;
  }
}

async function handleSamePlan2Submission(plan, profileType) {
  const industries = Array.from(document.querySelectorAll('#selectedIndustriesList span'))
    .map(el => el.textContent.replace('×','').trim())
    .filter(s => s);

  const ramas = Array.from(document.querySelectorAll('#selectedRamaJuridicaList span'))
    .map(el => el.textContent.replace('×','').trim())
    .filter(s => s);

  const submitButton = document.getElementById('nextBtn');
  submitButton.innerHTML = '<div class="loader"></div>';
  submitButton.disabled = true;

  const sub_rama_map = buildSubRamaMap();
  try {
    const resp = await fetch('/save-same-plan2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan,  // plan2
        industry_tags: industries,
        rama_juridicas: ramas,
        profile_type: profileType,
        sub_rama_map
      }),
    });
    if (!resp.ok) throw new Error('Failed to update user plan2 data');
    const result = await resp.json();
    if (result.redirectUrl) {
      window.location.href = result.redirectUrl;
    } else {
      throw new Error('No redirectUrl from server');
    }
  } catch (err) {
    console.error('Error updating same plan2 data:', err);
    alert('Failed to process your request. Please try again.');
    submitButton.innerHTML = 'Finalizar';
    submitButton.disabled = false;
  }
}

async function handleChangePlan2toPlan1Submission(plan, profileType) {
  const industries = Array.from(document.querySelectorAll('#selectedIndustriesList span'))
    .map(el => el.textContent.replace('×','').trim())
    .filter(s => s);

  const ramas = Array.from(document.querySelectorAll('#selectedRamaJuridicaList span'))
    .map(el => el.textContent.replace('×','').trim())
    .filter(s => s);

  const submitButton = document.getElementById('nextBtn');
  submitButton.innerHTML = '<div class="loader"></div>';
  submitButton.disabled = true;

  const sub_rama_map = buildSubRamaMap();

  try {
    const resp = await fetch('/cancel-plan2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan,  // plan1
        industry_tags: industries,
        rama_juridicas: ramas,
        sub_rama_map
      }),
    });
    if (!resp.ok) throw new Error('Failed to cancel plan2 / switch to plan1');

    const result = await resp.json();
    if (result.redirectUrl) {
      window.location.href = result.redirectUrl;
    } else {
      throw new Error('No redirectUrl from /cancel-plan2');
    }
  } catch (err) {
    console.error('Error switching plan2->plan1:', err);
    alert('Failed to process your request. Please try again.');
    submitButton.innerHTML = 'Finalizar';
    submitButton.disabled = false;
  }
}
