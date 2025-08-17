function populateFuentes(cobertura_legal) {
  const container = document.getElementById('fuentes-container');
  if (!container) return;

  // Check if user has etiquetas_personalizadas and show/hide banner accordingly
  checkAndShowAgentesRegulatoryBanner();

  const fuentesData = {
    "Boletines Europeos, Nacionales y Regionales": {
        "A) Europeos y Nacionales": [
            { sigla: "DOUE", nombre: "Diario Oficial de la Unión Europea", tipo: "fuentes-gobierno" },
            { sigla: "BOE", nombre: "Boletín Oficial del Estado", tipo: "fuentes-gobierno" },
            
        ],
        "B) Regionales": [
            { sigla: "BOPV", nombre: "Boletín Oficial del País Vasco", tipo: "fuentes-gobierno" },
            { sigla: "CGCC", nombre: "Consejo de Gobierno Comunidad de Catalunya", tipo: "fuentes-gobierno" },
            { sigla: "DOGC", nombre: "Diari Oficial de la Generalitat de Catalunya", tipo: "fuentes-gobierno" },
            { sigla: "DOG", nombre: "Diario Oficial de Galicia", tipo: "fuentes-gobierno" },
            { sigla: "BOC", nombre: "Boletín Oficial de Cantabria", tipo: "fuentes-gobierno" },
            { sigla: "BORM", nombre: "Boletín Oficial de la Región de Murcia", tipo: "fuentes-gobierno" },
            { sigla: "BOA", nombre: "Boletín Oficial de Aragón", tipo: "fuentes-gobierno" },
            { sigla: "BOCM", nombre: "Boletín Oficial de la Comunidad de Madrid", tipo: "fuentes-gobierno" },
            { sigla: "DOE", nombre: "Diario Oficial de Extremadura", tipo: "fuentes-gobierno" },
            { sigla: "BOCYL", nombre: "Boletín Oficial de Castilla y León", tipo: "fuentes-gobierno" },
            { sigla: "BOJA", nombre: "Boletín Oficial de la Junta de Andalucía", tipo: "fuentes-gobierno" },
            { sigla: "BOIB", nombre: "Boletín Oficial de las Islas Baleares", tipo: "fuentes-gobierno" },
            { sigla: "BOPA", nombre: "Boletín Oficial del Principado de Asturias", tipo: "fuentes-gobierno" },
            { sigla: "DOGV", nombre: "Diario Oficial de la Generalitat Valenciana", tipo: "fuentes-gobierno" },
            { sigla: "BOCA", nombre: "Boletín Oficial de Canarias", tipo: "fuentes-gobierno" },
        ]
    },
    "Reguladores": [
        { sigla: "EBA", nombre: "European Banking Authority", tipo: "fuentes-reguladores" },
        { sigla: "EBA_QA", nombre: "European Banking Authority (QA)", tipo: "fuentes-reguladores" },
        { sigla: "ESMA", nombre: "European Securities and Markets Authority", tipo: "fuentes-reguladores" },
        { sigla: "ESMA_QA", nombre: "European Securities and Markets Authority (QA)", tipo: "fuentes-reguladores" },
        { sigla: "CNMV", nombre: "Comisión Nacional del Mercado de Valores", tipo: "fuentes-reguladores" },
        { sigla: "INCIBE", nombre: "Instituto Nacional de Ciberseguridad", tipo: "fuentes-reguladores" },
        { sigla: "CNMC", nombre: "Comisión Nacional de los Mercados y la Competencia", tipo: "fuentes-reguladores" },
        { sigla: "AEPD", nombre: "Agencia Española de Protección de Datos", tipo: "fuentes-reguladores" },
        { sigla: "NIST", nombre: "National Institute of Standards and Technology", tipo: "fuentes-reguladores" },
        { sigla: "EDPB", nombre: "European Data Protection Board", tipo: "fuentes-reguladores" },
        { sigla: "SEPBLAC", nombre: "Servicio Ejecutivo de la Comisión de Prevención del Blanqueo de Capitales e Infracciones Monetarias", tipo: "fuentes-reguladores" },
        { sigla: "AEPD_guias", nombre: "Agencia Española de Protección de Datos - Guías", tipo: "fuentes-reguladores" },

    ],
    "Normativa en tramitación": [
      { sigla: "BOCG", nombre: "Boletín Oficial de las Cortes Generales", tipo: "fuentes-gobierno" },
    ],
    "Comunicados y prensa":[
    { sigla: "CEPC", nombre: "Comisión Europea Press Corner", tipo: "fuentes-gobierno" },
    { sigla: "NIST_NEWS", nombre: "National Institute of Standards and Technology News", tipo: "fuentes-reguladores" },
    { sigla: "EIOPA_news", nombre: "European Insurance and Occupational Pensions Authority News", tipo: "fuentes-reguladores" },
    { "sigla": "EUROPARL_NOTICIAS", "nombre": "Sala de prensa del Parlamento Europeo", "tipo": "fuentes-gobierno" },
    { "sigla": "CEPC", "nombre": "Sala de prensa de la Comisión Europea", "tipo": "fuentes-gobierno" },
    { "sigla": "CE_ALL_NOTICIAS", "nombre": "Noticias de la Comisión Europea", "tipo": "fuentes-gobierno" },
    { "sigla": "DANISH_PRESIDENCY_NOTICIAS", "nombre": "Web de la Presidencia danesa del Consejo de la UE", "tipo": "fuentes-gobierno" },
    ],
    "Ministerios": [
    { "sigla": "MITES_NOTICIAS", "nombre": "Ministerio de Trabajo", "tipo": "fuentes-gobierno" },
    { "sigla": "MITECO_NOTICIAS", "nombre": "Ministerio de Transición Ecológica", "tipo": "fuentes-gobierno" },
    { "sigla": "MAPA_NOTICIAS", "nombre": "Ministerio de Agricultura, Pesca y Alimentación", "tipo": "fuentes-gobierno" },
    { "sigla": "EXTERIORES_NOTICIAS", "nombre": "Ministerio de Asuntos Exteriores", "tipo": "fuentes-gobierno" },
    { "sigla": "MICIU_NOTICIAS", "nombre": "Ministerio de Ciencia, Innovación y Universidades", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_CULTURA_NOTICIAS", "nombre": "Ministerio de Cultura", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_DEFENSA_NOTICIAS", "nombre": "Ministerio de Defensa", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_DCSA_NOTICIAS", "nombre": "Ministerio de Derechos Sociales, Consumo y Agenda 2030", "tipo": "fuentes-gobierno" },
    { "sigla": "MINECO_NOTICIAS", "nombre": "Ministerio de Economía, Comercio y Empresa", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_EDUCACIONFPYDEPORTES_NOTICIAS", "nombre": "Ministerio de Educación", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_HACIENDA_NOTICIAS", "nombre": "Ministerio de Hacienda", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_INDUSTRIAYTURISMO_NOTICIAS", "nombre": "Ministerio de Industria y Turismo", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_INTERIOR_NOTICIAS", "nombre": "Ministerio del Interior", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_JUSTICIA_NOTICIAS", "nombre": "Ministerio de Justicia", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_MPT_NOTICIAS", "nombre": "Ministerio de Política Territorial", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_SANIDAD_NOTICIAS", "nombre": "Ministerio de Sanidad", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_DIGITAL_NOTICIAS", "nombre": "Ministerio de Transformación Digital", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_MIVAU_NOTICIAS", "nombre": "Ministerio de Vivienda", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_INCLUSION_NOTICIAS", "nombre": "Ministerio de Inclusión", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_JUVENTUDEINFANCIA_NOTICIAS", "nombre": "Ministerio de Juventud e Infancia", "tipo": "fuentes-gobierno" },
    { "sigla": "MIN_TRANSPORTES_NOTICIAS", "nombre": "Ministerio de Transportes", "tipo": "fuentes-gobierno" }
  ]
  };
  
  let html = '';
  const itemsPerPage = 4;

  const createGrid = (items, sectionKey) => {
      let gridHtml = `<div class="fuentes-grid-container" data-section="${sectionKey}"><div class="fuentes-grid">`;
      items.forEach(fuente => {
          gridHtml += `<div class="fuente-box" data-sigla="${fuente.sigla}" data-tipo="${fuente.tipo}" data-section="${sectionKey}"><strong>${fuente.sigla}</strong><span>${fuente.nombre}</span><div class=\"tick-badge\">✓</div></div>`;
      });
      gridHtml += `</div>`;
      // Always add navigation arrows for sections with more than 4 items
      if (items.length > itemsPerPage) {
          gridHtml += `<div class="grid-nav-arrow prev" style="display: none;"><i class="fas fa-chevron-left"></i></div><div class="grid-nav-arrow next"><i class="fas fa-chevron-right"></i></div>`;
      }
      gridHtml += `</div>`;
      return gridHtml;
  };

  for (const sectionTitle in fuentesData) {
      const sectionKey = sectionTitle.toLowerCase().replace(/\s+/g, '-');
      html += `<div class="section-header">`;
      html += `<h3 class="summary-title">${sectionTitle}</h3>`;
      html += `<div class="selected-tags-container" id="selected-tags-${sectionKey}"></div>`;
      // Add save button only for the first section (Boletines)
      if (sectionTitle === "Boletines Europeos, Nacionales y Regionales") {
          html += `<button id="saveFuentesBtn" class="save-fuentes-btn-inline">Guardar</button>`;
          html += `<div id="saveStatus" class="save-status"></div>`;
      }
      html += `</div>`;
      const sectionContent = fuentesData[sectionTitle];

      if (Array.isArray(sectionContent)) { // For Reguladores, Normativa
          html += createGrid(sectionContent, sectionKey);
      } else { // For Boletines with subsections
          for (const subsectionTitle in sectionContent) {
              html += `<div class="fuentes-subsection">`;
              const subsectionKey = subsectionTitle.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, '-');
              html += `<div class="section-header">`;
              html += `<h4 class="fuentes-subsection-title">${subsectionTitle}</h4>`;
              html += `<div class="selected-tags-container" id="selected-tags-${subsectionKey}"></div>`;
              html += `</div>`;
              html += createGrid(sectionContent[subsectionTitle], subsectionKey);
              html += `</div>`;
          }
      }
  }
  container.innerHTML = html;
 
  // Preload plan limits once for instant UX on click (no per-click fetch)
  const fuentesLimits = { limitFuentes: null };
  function getDefaultFuentesLimits(plan) {
      switch (plan) {
          case 'plan1': return { limit_fuentes: 4 };
          case 'plan2': return { limit_fuentes: 10 };
          case 'plan3': return { limit_fuentes: 10 };
          case 'plan4': return { limit_fuentes: null }; // unlimited
          default: return { limit_fuentes: 0 };
      }
  }
  try {
      const initialPlan = (window.userPlan || 'plan1');
      const defaults = getDefaultFuentesLimits(initialPlan);
      fuentesLimits.limitFuentes = defaults.limit_fuentes;
  } catch (e) {}
  fetch('/api/get-user-data')
      .then(res => res.json())
      .then(userData => {
          const defaults = getDefaultFuentesLimits(userData.subscription_plan || 'plan1');
          fuentesLimits.limitFuentes = (userData.limit_fuentes !== undefined ? userData.limit_fuentes : defaults.limit_fuentes);
      })
      .catch(err => console.error('Error preloading fuentes limits:', err));
  
  // Pagination logic - Apply to all grid containers
  document.querySelectorAll('.fuentes-grid-container').forEach(gridContainer => {
      const grid = gridContainer.querySelector('.fuentes-grid');
      const items = Array.from(grid.querySelectorAll('.fuente-box'));
      const prevArrow = gridContainer.querySelector('.prev');
      const nextArrow = gridContainer.querySelector('.next');
      let currentPage = 0;
      const totalItems = items.length;
      const totalPages = Math.ceil(totalItems / itemsPerPage);

      function showPage(page) {
          items.forEach((item, index) => {
              const isVisible = index >= page * itemsPerPage && index < (page + 1) * itemsPerPage;
              item.style.display = isVisible ? 'flex' : 'none';
          });

          // Show/hide arrows based on current page and total pages
          if (prevArrow) prevArrow.style.display = page > 0 ? 'flex' : 'none';
          if (nextArrow) nextArrow.style.display = page < totalPages - 1 ? 'flex' : 'none';
      }

      // Initialize first page display
      if (totalItems > 0) {
          showPage(0);
      }

      // Add event listeners for navigation
      if (nextArrow) {
          nextArrow.addEventListener('click', () => {
              if (currentPage < totalPages - 1) {
                  currentPage++;
                  showPage(currentPage);
              }
          });
      }
      if (prevArrow) {
          prevArrow.addEventListener('click', () => {
              if (currentPage > 0) {
                  currentPage--;
                  showPage(currentPage);
              }
          });
      }
  });

  // Function to update selected tags display
  function updateSelectedTags() {
      // Clear all tag containers
      document.querySelectorAll('.selected-tags-container').forEach(container => {
          container.innerHTML = '';
      });

      // Get all selected boxes and group by section
      const selectedBySection = {};
      document.querySelectorAll('.fuente-box.selected').forEach(box => {
          const sigla = box.dataset.sigla;
          const sectionKey = box.dataset.section;
          
          if (!selectedBySection[sectionKey]) {
              selectedBySection[sectionKey] = [];
          }
          selectedBySection[sectionKey].push(sigla);
      });

      // Update each section's tags
      Object.keys(selectedBySection).forEach(sectionKey => {
          const container = document.getElementById(`selected-tags-${sectionKey}`);
          if (container) {
              selectedBySection[sectionKey].forEach(sigla => {
                  const tag = document.createElement('span');
                  tag.className = 'selected-tag';
                  tag.textContent = sigla;
                  container.appendChild(tag);
              });
          }
      });
  }

  // Add click listeners and pre-select
  // Normalizar las fuentes existentes (convertir todo a mayúsculas para comparación)
  const selectedFuentes = (cobertura_legal?.fuentes_gobierno || 
                         cobertura_legal?.['fuentes-gobierno'] || 
                         cobertura_legal?.fuentes || []).map(f => f.toUpperCase());
  const selectedReguladores = (cobertura_legal?.fuentes_reguladores || 
                             cobertura_legal?.['fuentes-reguladores'] || 
                             cobertura_legal?.['fuentes-regulador'] ||  // Para usuarios muy antiguos
                             cobertura_legal?.reguladores || []).map(f => f.toUpperCase());
  const allSelections = [...selectedFuentes, ...selectedReguladores];

  document.querySelectorAll('.fuente-box').forEach(box => {
      // Comparar en mayúsculas para evitar problemas de case sensitivity
      if (allSelections.includes(box.dataset.sigla.toUpperCase())) {
          box.classList.add('selected');
      }
      box.addEventListener('click', () => {
          const isSelecting = !box.classList.contains('selected');
          if (isSelecting) {
              const limit = fuentesLimits.limitFuentes;
              if (limit !== null) {
                  const currentCount = document.querySelectorAll('.fuente-box.selected').length;
                  if (currentCount >= limit) {
                      alert(`Has alcanzado el límite de ${limit} fuentes para tu plan actual. Para seleccionar más fuentes, actualiza tu suscripción.`);
                      return;
                  }
              }
          }
          // Instant UI feedback
          box.classList.toggle('selected');
          updateSelectedTags();
      });
  });

  // Initial tags update
  updateSelectedTags();

  // Save button logic
  document.getElementById('saveFuentesBtn').addEventListener('click', () => {
      const saveBtn = document.getElementById('saveFuentesBtn');
      const saveStatus = document.getElementById('saveStatus');
      
      // Clear any previous status and show loader
      saveStatus.textContent = '';
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<div class="button-spinner"></div>';
      saveBtn.classList.add('loading');
      
      const newCobertura = {
          'fuentes-gobierno': [],
          'fuentes-reguladores': [],
          'fuentes-tramitacion': [] // This key exists but isn't part of the final payload
      };
      document.querySelectorAll('.fuente-box.selected').forEach(box => {
          const tipo = box.dataset.tipo;
          const sigla = box.dataset.sigla;
          if (newCobertura[tipo]) {
              newCobertura[tipo].push(sigla);
          }
      });
      
      const finalPayload = {
          cobertura_legal: {
              fuentes_gobierno: newCobertura['fuentes-gobierno'],
              fuentes_reguladores: newCobertura['fuentes-reguladores']
          },
          rangos: ["Acuerdos Internacionales","Normativa Europea","Legislacion Nacional","Normativa Reglamentaria","Decisiones Judiciales","Doctrina Administrativa","Comunicados, Guias y Opiniones Consultivas","Consultas Publicas","Normativa en tramitación","Otras"]
      };

      fetch('/api/update-user-data', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(finalPayload)
      })
      .then(res => res.json())
      .then(data => {
          if (data.success) {
              // Show success state
              saveBtn.classList.remove('loading');
              saveBtn.innerHTML = '✓ Guardado';
              saveBtn.classList.add('success');
              
              // Refresh usage tracker after successful save
              fetch('/api/get-user-data')
                  .then(res => res.json())
                  .then(userData => updateUsageTrackers(userData))
                  .catch(err => console.error('Error updating tracker:', err));
              
              // Reset after 2 seconds
              setTimeout(() => {
                  saveBtn.innerHTML = 'Guardar';
                  saveBtn.classList.remove('success');
                  saveBtn.disabled = false;
              }, 2000);
          } else {
              // Show error
              saveBtn.classList.remove('loading');
              saveBtn.innerHTML = 'Guardar';
              saveStatus.textContent = 'Error, pruebe de nuevo';
              saveBtn.disabled = false;
          }
      })
      .catch(err => {
          console.error('Error saving fuentes:', err);
          saveBtn.classList.remove('loading');
          saveBtn.innerHTML = 'Guardar';
          saveStatus.textContent = 'Error, pruebe de nuevo';
          saveBtn.disabled = false;
      });
  });
}

// Expose globally
window.populateFuentes = populateFuentes;

