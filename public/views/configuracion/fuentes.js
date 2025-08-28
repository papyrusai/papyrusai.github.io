function populateFuentes(cobertura_legal) {
  const container = document.getElementById('fuentes-container');
  if (!container) return;

  // Check if user has etiquetas_personalizadas and show/hide banner accordingly
  checkAndShowAgentesRegulatoryBanner();

  const fuentesData = {
    "Boletines Oficiales": {
        "A) Europeos y Nacionales": [
            { sigla: "DOUE", nombre: "Diario Oficial de la Unión Europea", tipo: "fuentes-gobierno" },
            { sigla: "BOE", nombre: "Boletín Oficial del Estado", tipo: "fuentes-gobierno" },
            { sigla: "BOPA_ANDORRA", nombre: "BOPA Andorra", tipo: "fuentes-gobierno" },
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
            { sigla: "BOR", nombre: "Boletín Oficial de La Rioja", tipo: "fuentes-gobierno" },
            { sigla: "BON", nombre: "Boletín Oficial de Navarra", tipo: "fuentes-gobierno" },
            { sigla: "DOCM", nombre: "Diario Oficial de Castilla-La Mancha", tipo: "fuentes-gobierno" },
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
    "Actividad Parlamentaria": [
      { sigla: "BOCG", nombre: "Boletín Oficial de las Cortes Generales", tipo: "fuentes-gobierno" },
      { sigla: "EUROPARL_WEEKLY_AGENDA", nombre: "Agenda semanal del Parlamento Europeo", tipo: "fuentes-gobierno" },
      { sigla: "EUROPARL_LATEST_DOCS", nombre: "Últimos documentos del Parlamento Europeo", tipo: "fuentes-gobierno" },
      { sigla: "EUROPARL_EVENTS", nombre: "Eventos del Parlamento Europeo", tipo: "fuentes-gobierno" },
      { sigla: "EUROPARL_MEETINGS", nombre: "Reuniones del Parlamento Europeo", tipo: "fuentes-gobierno" },
      { sigla: "DANISH_PRESIDENCY_MEETINGS", nombre: "Reuniones Presidencia Danesa del Consejo de la UE", tipo: "fuentes-gobierno" },
      { sigla: "SENADO_AGENDA", nombre: "Agenda del Senado", tipo: "fuentes-gobierno" },
      { sigla: "SENADO_LEYES_EN_TRAMITACION", nombre: "Leyes en tramitación del Senado", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_ECONOMIA_CONSULTAS", nombre: "Participación Economía Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_DEFENSA_AUDIENCIAS", nombre: "Participación Defensa Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_DEFENSA_CONSULTAS", nombre: "Participación Defensa Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_DERECHOS_SOCIALES_AUDIENCIAS", nombre: "Participación Derechos Sociales Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_HACIENDA_AUDIENCIAS", nombre: "Participación Hacienda Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_EXTERIORES_AUDIENCIAS", nombre: "Participación Exteriores Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_IGUALDAD_AUDIENCIAS", nombre: "Participación Igualdad Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_EXTERIORES_CONSULTAS", nombre: "Participación Exteriores Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_TRANSICION_ECOLOGICA_PROYECTOS_NORMATIVOS", nombre: "Participación Transición Ecológica Proyectos Normativos", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_TRANSFORMACION_DIGITAL_CONSULTAS", nombre: "Participación Transformación Digital Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_POLITICA_TERRITORIAL_CONSULTAS", nombre: "Participación Política Territorial Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_AGRICULTURA_PARTICIPACION_PUBLICA_OTROS_DOCUMENTOS", nombre: "Participación Agricultura Participación Pública Otros Documentos", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_AGRICULTURA_PARTICIPACION_PUBLICA_PROYECTOS_NORMATIVOS", nombre: "Participación Agricultura Participación Pública Proyectos Normativos", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_SANIDAD_AUDIENCIAS", nombre: "Participación Sanidad Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_EDUCACION_CONSULTAS", nombre: "Participación Educación Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_PRESIDENCIA_JUSTICIA", nombre: "Participación Presidencia Justicia", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_IGUALDAD_CONSULTAS", nombre: "Participación Igualdad Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_TRANSICION_ECOLOGICA_OTROS_DOCUMENTOS", nombre: "Participación Transición Ecológica Otros Documentos", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_ECONOMIA_AUDIENCIAS", nombre: "Participación Economía Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_POLITICA_TERRITORIAL_AUDIENCIAS", nombre: "Participación Política Territorial Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_INDUSTRIA_Y_PYME", nombre: "Participación Industria y PYME", tipo: "fuentes-gobierno" },
      { sigla: "OEIL", nombre: "OEIL - European Parliament Legislative Observatory", tipo: "fuentes-gobierno" },
      { sigla: "EUROPARL_PLENARY_AGENDA", nombre: "Agenda del Pleno del Parlamento Europeo", tipo: "fuentes-gobierno" },
      { sigla: "CONSILIUM_MEETINGS", nombre: "Reuniones del Consejo de la UE", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_CIENCIA_AUDIENCIAS", nombre: "Participación Ciencia Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_CIENCIA_CONSULTAS", nombre: "Participación Ciencia Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_CULTURA_AUDIENCIAS", nombre: "Participación Cultura Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_CULTURA_CONSULTAS", nombre: "Participación Cultura Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_DERECHOS_SOCIALES_CONSULTAS", nombre: "Participación Derechos Sociales Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_EDUCACION_AUDIENCIAS", nombre: "Participación Educación Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_HACIENDA_CONSULTAS", nombre: "Participación Hacienda Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_INCLUSION_AUDIENCIAS", nombre: "Participación Inclusión Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_INCLUSION_CONSULTAS", nombre: "Participación Inclusión Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_INDUSTRIA_SUBSECRETARIA", nombre: "Participación Industria Subsecretaría", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_INTERIOR_AUDIENCIAS", nombre: "Participación Interior Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_INTERIOR_CONSULTAS", nombre: "Participación Interior Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_JUVENTUD_AUDIENCIAS", nombre: "Participación Juventud Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_JUVENTUD_CONSULTAS", nombre: "Participación Juventud Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_PRESIDENCIA_AUDIENCIAS", nombre: "Participación Presidencia Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_PRESIDENCIA_CONSULTAS", nombre: "Participación Presidencia Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_SANIDAD_CONSULTAS", nombre: "Participación Sanidad Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_TRABAJO_AUDIENCIAS", nombre: "Participación Trabajo Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_TRABAJO_CONSULTAS", nombre: "Participación Trabajo Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_TRANSFORMACION_DIGITAL_AUDIENCIAS", nombre: "Participación Transformación Digital Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_TRANSICION_ECOLOGICA_PARTICIPACION_PUBLICA_OTROS_DOCUMENTOS", nombre: "Participación Transición Ecológica Participación Pública Otros Documentos", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_TRANSICION_ECOLOGICA_PARTICIPACION_PUBLICA_PROYECTOS_NORMATIVOS", nombre: "Participación Transición Ecológica Participación Pública Proyectos Normativos", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_TRANSPORTES_AUDIENCIAS", nombre: "Participación Transportes Audiencias", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_TRANSPORTES_CONSULTAS", nombre: "Participación Transportes Consultas", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_TURISMO", nombre: "Participación Turismo", tipo: "fuentes-gobierno" },
      { sigla: "PARTICIPACION_VIVIENDA_TODO", nombre: "Participación Vivienda Todo", tipo: "fuentes-gobierno" },
    ],
    "Comunicados y prensa":[
    { sigla: "CEPC", nombre: "Comisión Europea Press Corner", tipo: "fuentes-gobierno" },
    { sigla: "NIST_NEWS", nombre: "National Institute of Standards and Technology News", tipo: "fuentes-reguladores" },
    { sigla: "EIOPA_news", nombre: "European Insurance and Occupational Pensions Authority News", tipo: "fuentes-reguladores" },
    { "sigla": "EUROPARL_NOTICIAS", "nombre": "Sala de prensa del Parlamento Europeo", "tipo": "fuentes-gobierno" },
    { "sigla": "CEPC", "nombre": "Sala de prensa de la Comisión Europea", "tipo": "fuentes-gobierno" },
    { "sigla": "CE_ALL_NOTICIAS", "nombre": "Noticias de la Comisión Europea", "tipo": "fuentes-gobierno" },
    { "sigla": "DANISH_PRESIDENCY_NOTICIAS", "nombre": "Web de la Presidencia danesa del Consejo de la UE", "tipo": "fuentes-gobierno" },
    { "sigla": "CONSEJO_ESTADO_NOTICIAS", "nombre": "Consejo de Estado - Noticias", "tipo": "fuentes-gobierno" },
    { "sigla": "COMUNIDAD_VALENCIANA_NOTICIAS", "nombre": "Comunitat Valenciana - Noticias", "tipo": "fuentes-gobierno" },
    { "sigla": "COMUNIDAD_MADRID_NOTICIAS", "nombre": "Comunidad de Madrid - Noticias", "tipo": "fuentes-gobierno" },
    { "sigla": "CONGRESO_NOTICIAS", "nombre": "Congreso de los Diputados - Noticias", "tipo": "fuentes-gobierno" },
    { "sigla": "ASTURIAS_NOTICIAS", "nombre": "Principado de Asturias - Noticias", "tipo": "fuentes-gobierno" },
    { "sigla": "CANARIAS_NOTICIAS", "nombre": "Gobierno de Canarias - Noticias", "tipo": "fuentes-gobierno" },
    { "sigla": "EXTREMADURA_NOTICIAS", "nombre": "Junta de Extremadura - Noticias", "tipo": "fuentes-gobierno" },
    { "sigla": "ANDALUCIA_NOTICIAS", "nombre": "Junta de Andalucía - Noticias", "tipo": "fuentes-gobierno" },
    { "sigla": "ANDORRA_NOTICIAS", "nombre": "Gobierno de Andorra - Noticias", "tipo": "fuentes-gobierno" },
    ],
    "Organismos Gubernamentales": [
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
    { "sigla": "MIN_TRANSPORTES_NOTICIAS", "nombre": "Ministerio de Transportes", "tipo": "fuentes-gobierno" },
    { "sigla": "MONCLOA_NOTICIAS", "nombre": "Moncloa - Noticias", "tipo": "fuentes-gobierno" },
    { "sigla": "MONCLOA_REFERENCIAS", "nombre": "Moncloa - Referencias", "tipo": "fuentes-gobierno" },
    { "sigla": "MONCLOA_AGENDA", "nombre": "Moncloa - Agenda", "tipo": "fuentes-gobierno" },
    { "sigla": "CONGRESO_AGENDA", "nombre": "Congreso de los Diputados - Agenda", "tipo": "fuentes-gobierno" },
    { "sigla": "ASTURIAS_CONSEJO_GOBIERNO_NOTICIAS", "nombre": "Principado de Asturias - Consejo de Gobierno", "tipo": "fuentes-gobierno" },
    { "sigla": "EXTREMADURA_CONSEJO_GOBIERNO", "nombre": "Junta de Extremadura - Consejo de Gobierno", "tipo": "fuentes-gobierno" },
    { "sigla": "COMUNIDAD_VALENCIANA_ACTOS", "nombre": "Generalitat Valenciana - Actos", "tipo": "fuentes-gobierno" },
    { "sigla": "ANDALUCIA_ULTIMA_SESION_CONSEJO_GOBIERNO", "nombre": "Junta de Andalucía - Última sesión del Consejo de Gobierno", "tipo": "fuentes-gobierno" }
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
      if (sectionTitle === "Boletines Oficiales") {
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
  const saveBtnEl = document.getElementById('saveFuentesBtn');
  if (saveBtnEl) saveBtnEl.addEventListener('click', async () => {
      const saveBtn = document.getElementById('saveFuentesBtn');
      const saveStatus = document.getElementById('saveStatus');
      
      // Clear any previous status and show loader
      saveStatus.textContent = '';
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<div class="button-spinner"></div>';
      saveBtn.classList.add('loading');
      
      try {
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
          
          const cobertura_legal = {
              fuentes_gobierno: newCobertura['fuentes-gobierno'],
              fuentes_reguladores: newCobertura['fuentes-reguladores']
          };
          
          const rangos = ["Acuerdos Internacionales","Normativa Europea","Legislacion Nacional","Normativa Reglamentaria","Decisiones Judiciales","Doctrina Administrativa","Comunicados, Guias y Opiniones Consultivas","Consultas Publicas","Normativa en tramitación","Otras"];

          // Use resolver if available, otherwise fallback to legacy method
          let result;
          if (typeof window.EtiquetasResolver !== 'undefined') {
              result = await window.EtiquetasResolver.updateCoberturaLegal(cobertura_legal, rangos);
              
              if (!result.success) {
                  if (result.conflict) {
                      // Handle version conflict
                      window.EtiquetasResolver.handleVersionConflict(result);
                      return;
                  }
                  
                  if (result.permission_error) {
                      // Show permission error
                      saveStatus.textContent = result.error || 'Sin permisos para editar fuentes empresariales';
                      saveBtn.classList.remove('loading');
                      saveBtn.innerHTML = 'Guardar';
                      saveBtn.disabled = false;
                      return;
                  }
                  
                  throw new Error(result.error || 'Error actualizando fuentes');
              }
          } else {
              // Fallback to legacy method
              console.warn('EtiquetasResolver not available, using legacy method');
              const response = await fetch('/api/update-user-data', {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({ cobertura_legal, rangos })
              });
              
              if (!response.ok) {
                  const error = await response.json();
                  throw new Error(error.error || 'Error actualizando fuentes');
              }
              
              result = await response.json();
          }

          if (result.success) {
              // Show success state
              saveBtn.classList.remove('loading');
              saveBtn.innerHTML = '✓ Guardado';
              saveBtn.classList.add('success');
              
              // Refresh usage tracker after successful save
              try {
                  const response = await fetch('/api/get-user-data');
                  const userData = await response.json();
                  if (typeof updateUsageTrackers === 'function') {
                      updateUsageTrackers(userData);
                  }
              } catch (err) {
                  console.error('Error updating tracker:', err);
              }
              
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

      } catch (err) {
          console.error('Error saving fuentes:', err);
          saveBtn.classList.remove('loading');
          saveBtn.innerHTML = 'Guardar';
          saveStatus.textContent = err.message || 'Error, pruebe de nuevo';
          saveBtn.disabled = false;
      }
  });
}

// Expose globally
window.populateFuentes = populateFuentes;

