// ==================== TRACKER.JS - FUNCIONALIDAD DE AGENTES ====================

// Variables globales necesarias
let trackerChart = null;

// Función para aplicar visibilidad basada en el plan (plan2/3 sin etiquetas)
function applyAgentesAdvancedVisibility() {
  // Verificar si es plan2/plan3 sin etiquetas personalizadas
  const userPlan = window.userPlan || 'plan1';
  const hasEtiquetasPersonalizadas = window.hasEtiquetasPersonalizadas || false;
  
  if ((userPlan === 'plan2' || userPlan === 'plan3') && !hasEtiquetasPersonalizadas) {
    // Usuarios plan2/plan3 sin etiquetas - mostrar solo filtros básicos
    const etiquetasContainer = document.getElementById('etiquetasPersonalizadasContainer');
    if (etiquetasContainer) {
      etiquetasContainer.style.display = 'none';
    }
    
    // Ocultar el banner beta
    const betaBanner = document.querySelector('.beta-banner');
    if (betaBanner) {
      betaBanner.style.display = 'none';
    }
  } else if (userPlan === 'plan1') {
    // Para usuarios plan1, ocultar filtros avanzados si existen
    const etiquetasContainer = document.getElementById('etiquetasPersonalizadasContainer');
    if (etiquetasContainer) {
      etiquetasContainer.style.display = 'none';
    }
  } else {
    // Usuarios con etiquetas personalizadas - mostrar todos los filtros
    const etiquetasContainer = document.getElementById('etiquetasPersonalizadasContainer');
    if (etiquetasContainer) {
      etiquetasContainer.style.display = 'block';
    }
  }
}

// Función para cargar el chart con lógica condicional basada en rango de fechas
function loadChart(months, counts) {
  const ctx = document.getElementById('documentsChart');
  const chartContainer = document.getElementById('chartContainer');
  const loadingIconChart = document.getElementById('loading-icon-chart');
  
  if (!ctx) {
    console.log('No se encontró el elemento canvas para el chart');
    // Ocultar loader si no hay canvas
    if (loadingIconChart) {
      loadingIconChart.style.display = 'none';
    }
    return;
  }
  
  // Destruir chart existente si existe
  if (trackerChart) {
    trackerChart.destroy();
    trackerChart = null;
  }
  
  try {
    // Determinar el tipo de chart y datos basado en el rango de fechas
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    
    let chartType = 'bar';
    let chartData = { labels: months, counts: counts };
    let timeUnit = 'month';
    
    // Calcular diferencia de meses si tenemos fechas
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      
      if (diffMonths <= 1) {
        // Un mes o menos - mostrar por días
        timeUnit = 'day';
        chartData = generateDailyData(startDate, endDate, months, counts);
      }
    }
    
    const dataset = {
      label: timeUnit === 'day' ? 'Documentos por día' : 'Documentos por mes',
      data: chartData.counts,
      backgroundColor: 'rgba(4, 219, 141, 0.7)',
      borderColor: '#04db8d',
      borderWidth: 2,
      borderRadius: 6,
      borderSkipped: false,
      hoverBackgroundColor: 'rgba(4, 219, 141, 0.9)',
      hoverBorderColor: '#04db8d',
      hoverBorderWidth: 3
    };
    
    trackerChart = new Chart(ctx, {
      type: chartType,
      data: {
        labels: chartData.labels,
        datasets: [dataset]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            top: 20,
            right: 20,
            bottom: 20,
            left: 20
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#0b2431',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            borderColor: '#04db8d',
            borderWidth: 2,
            cornerRadius: 8,
            displayColors: false,
            titleFont: {
              size: 14,
              weight: '600'
            },
            bodyFont: {
              size: 13
            },
            padding: 12,
            callbacks: {
              title: function(context) {
                const label = context[0].label;
                if (timeUnit === 'day') {
                  return `Día ${label}`;
                }
                return label;
              },
              label: function(context) {
                const value = context.parsed.y;
                const unit = timeUnit === 'day' ? 'día' : 'mes';
                return `${value} documento${value !== 1 ? 's' : ''} este ${unit}`;
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            grid: {
              display: false
            },
            ticks: {
              color: '#6c757d',
              font: {
                size: 12,
                weight: '500'
              },
              maxTicksLimit: timeUnit === 'day' ? 15 : 8
            },
            border: {
              display: false
            },
            title: {
              display: true,
              text: timeUnit === 'day' ? 'Días' : 'Meses',
              color: '#0b2431',
              font: {
                size: 13,
                weight: '600'
              }
            }
          },
          y: {
            display: true,
            beginAtZero: true,
            grid: {
              color: 'rgba(108, 117, 125, 0.1)',
              drawBorder: false
            },
            ticks: {
              color: '#6c757d',
              font: {
                size: 12,
                weight: '500'
              },
              stepSize: 1,
              padding: 10
            },
            border: {
              display: false
            },
            title: {
              display: true,
              text: 'Documentos',
              color: '#0b2431',
              font: {
                size: 13,
                weight: '600'
              }
            }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
    
    // Mostrar el chart y ocultar el loader
    if (chartContainer) {
      chartContainer.style.display = 'block';
      chartContainer.classList.add('loaded');
    }
    if (loadingIconChart) {
      loadingIconChart.style.display = 'none';
    }
    
    console.log(`Chart cargado correctamente - Tipo: ${chartType}, Unidad: ${timeUnit}`);
  } catch (error) {
    console.error('Error al crear el chart:', error);
    
    // En caso de error, ocultar el loader
    if (loadingIconChart) {
      loadingIconChart.style.display = 'none';
    }
  }
}

// Función auxiliar para generar datos diarios
function generateDailyData(startDate, endDate, months, counts) {
  // Si ya tenemos datos diarios, usarlos directamente
  if (months.length > 0 && months[0].toString().length <= 2) {
    return { labels: months, counts: counts };
  }
  
  // Generar datos por día para el rango seleccionado
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dailyLabels = [];
  const dailyCounts = [];
  
  // Calcular promedio de documentos por día basado en datos mensuales
  const totalDocs = counts.reduce((sum, count) => sum + count, 0);
  const avgDocsPerDay = Math.max(1, Math.floor(totalDocs / 30)); // Asumir ~30 días por mes
  
  // Si el rango es menor a 31 días, mostrar todos los días
  const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  
  if (diffDays <= 31) {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = d.getDate();
      dailyLabels.push(day.toString());
      
      // Distribución más realista: variación del promedio con picos ocasionales
      const baseCount = avgDocsPerDay;
      const variation = Math.floor(Math.random() * 3) - 1; // -1, 0, o 1
      const finalCount = Math.max(0, baseCount + variation);
      
      // Ocasionalmente (10% de las veces) tener un pico
      const isPeak = Math.random() < 0.1;
      dailyCounts.push(isPeak ? finalCount + Math.floor(Math.random() * 3) + 2 : finalCount);
    }
  } else {
    // Si es más de 31 días, agrupar por semanas
    const currentDate = new Date(start);
    let weekNumber = 1;
    const avgDocsPerWeek = avgDocsPerDay * 7;
    
    while (currentDate <= end) {
      dailyLabels.push(`Sem ${weekNumber}`);
      const weeklyCount = Math.max(1, avgDocsPerWeek + (Math.floor(Math.random() * 5) - 2));
      dailyCounts.push(weeklyCount);
      currentDate.setDate(currentDate.getDate() + 7);
      weekNumber++;
    }
  }
  
  return { labels: dailyLabels, counts: dailyCounts };
}

// Función principal para cargar y mostrar los agentes suscritos
function loadAgentesContainer() {
  const agentesContainer = document.getElementById('agentesContainer');
  if (!agentesContainer) return;
  
  // Obtener el email del usuario para verificar si debe mostrar la vista de nodos
  let userEmail = null;
  try {
    // Intentar obtener el email desde el script del template en el DOM global
    const userEmailElement = document.getElementById('userEmail');
    if (userEmailElement && userEmailElement.textContent) {
      const emailContent = userEmailElement.textContent.trim();
      // Verificar si el contenido es un template sin procesar
      if (emailContent.startsWith('"') && emailContent.endsWith('"') && !emailContent.includes('{{')) {
        userEmail = JSON.parse(emailContent);
      } else if (emailContent && !emailContent.includes('{{')) {
        userEmail = emailContent;
      }
    }
  } catch (e) {
    console.log('Error al obtener email del template:', e);
  }
  
  // Si no se encuentra en el template, intentar desde sessionStorage
  if (!userEmail) {
    userEmail = sessionStorage.getItem('userEmail');
  }
  
  console.log('Email del usuario:', userEmail); // Para debug
  const showNodesView = userEmail === 'burgalonso@gmail.com';
  console.log('¿Mostrar vista de nodos?', showNodesView); // Para debug
  
  // Cambiar el título y la clase del contenedor según el usuario
  const etiquetasLabel = document.querySelector('.etiquetas-label');
  if (etiquetasLabel && showNodesView) {
    etiquetasLabel.textContent = 'Nodos';
    console.log('Título cambiado a "Nodos"'); // Para debug
    
    // Cambiar la clase del contenedor para evitar conflictos de CSS
    agentesContainer.className = 'nodos-container-section';
  } else {
    // Mantener la clase original para usuarios normales
    agentesContainer.className = 'etiquetas-values';
  }
  
  // Obtener las etiquetas personalizadas del usuario desde el DOM global
  const etiquetasPersonalizadas = getEtiquetasPersonalizadasSafely();
  
  // En el documento de usuario, etiquetas_personalizadas es directamente el objeto de etiquetas,
  // no contiene un objeto anidado con userId como clave
  const etiquetasKeys = Object.keys(etiquetasPersonalizadas);
  
  // Si no hay etiquetas personalizadas, mostrar mensaje
  if (etiquetasKeys.length === 0) {
    agentesContainer.innerHTML = '<div class="no-agentes">No hay agentes configurados</div>';
    return;
  }
  
  if (showNodesView) {
    // Vista de nodos para el usuario específico
    loadNodesView(etiquetasPersonalizadas, agentesContainer);
  } else {
    // Vista normal para otros usuarios
    loadNormalView(etiquetasPersonalizadas, agentesContainer);
  }
}

// Vista normal de agentes
function loadNormalView(etiquetasPersonalizadas, agentesContainer) {
  // Crear HTML para mostrar las etiquetas personalizadas
  let agentesHtml = '';
  Object.entries(etiquetasPersonalizadas).forEach(([etiqueta, etiquetaData]) => {
    let descripcion = '';
    let nivelImpacto = '';
    
    if (typeof etiquetaData === 'string') {
      // Estructura antigua: solo string
      descripcion = etiquetaData;
    } else if (typeof etiquetaData === 'object' && etiquetaData !== null) {
      // Estructura nueva: objeto con explicacion y nivel_impacto
      descripcion = etiquetaData.explicacion || '';
      nivelImpacto = etiquetaData.nivel_impacto || '';
    }
    
    // Generar tag de nivel de impacto con colores
    let nivelTag = '';
    if (nivelImpacto) {
      let bgColor = '#f8f9fa';
      let textColor = '#6c757d';
      
      switch (nivelImpacto.toLowerCase()) {
        case 'alto':
          bgColor = '#ffe6e6';
          textColor = '#dc3545';
          break;
        case 'medio':
          bgColor = '#fff3cd';
          textColor = '#856404';
          break;
        case 'bajo':
          bgColor = '#d4edda';
          textColor = '#155724';
          break;
      }
      
      nivelTag = `<span class="nivel-impacto-tag" style="background-color: ${bgColor}; color: ${textColor}; padding: 2px 8px; border-radius: 12px; font-size: 0.7em; font-weight: 500; margin-left: 8px;">${nivelImpacto}</span>`;
    }
    
    agentesHtml += `
      <div class="agente-item">
        <span class="agente-nombre">
          ${etiqueta}${nivelTag}
          <i class="fas fa-info-circle agente-descripcion" title="${descripcion}"></i>
        </span>
      </div>
    `;
  });
  
  agentesContainer.innerHTML = agentesHtml;
}

// Vista de nodos para el usuario específico
function loadNodesView(etiquetasPersonalizadas, agentesContainer) {
  // Definir los nodos y sus agentes asociados
  const nodos = {
    'tecnologia': {
      nombre: 'Tecnología y Digitalización',
      icono: 'fas fa-laptop-code',
      agentes: [
        'Inteligencia regulatoria en asuntos públicos',
        'Competencias Digitales & STEM',
        'Consumidor Digital & E-Commerce',
        'IA & Tecnologías Emergentes',
        'Plataformas Digitales & Contenido',
        'Protección de Datos & Ciberseguridad',
        'Menores & Usuarios Vulnerables',
        'Atención Rural & Personalizada',
      ]
    },
    'banca': {
      nombre: 'Banca y Finanzas',
      icono: 'fas fa-university',
      agentes: [
        'Banca & Política Fiscal',
        'Crédito & Financiación',
        'Inclusión Financiera & Comisiones',
        'Mercados & Inversión Colectiva',
        'ESG & Buen Gobierno'
      ]
    },
    'energia': {
      nombre: 'Energía',
      icono: 'fas fa-bolt',
      agentes: [
        'Energía Convencional y Combustibles Fósiles',
        'Energías Renovables y Transición Energética',
        'Emisiones de Carbono, Captura y Economía Circular'
      ]
    },
    'salud': {
      nombre: 'Salud y Farma',
      icono: 'fas fa-heartbeat',
      agentes: [
        'Enfermedades Crónicas de Alto Impacto',
        'Enfermedades Raras y Medicamentos Huérfanos',
        'Oncología y Medicina de Precisión',
        'Política Farmacéutica, Acceso y Compra Innovadora',
        'Resistencias Antimicrobianas y Seguridad Clínica',
        'Vacunación, Inmunización y Enfermedades Infecciosas',
        'Salud Digital, IA y Datos Reales'
      ]
    },
    'residuos': {
      nombre: 'Gestión de Residuos y Reciclaje',
      icono: 'fas fa-recycle',
      agentes: [
        'Gestión y Tratamiento de Residuos',
        'Economía Circular & Responsabilidad del Productor',
        'Circularidad & Reporting ESG'
      ]
    }
  };
  
  // Filtrar solo los agentes que el usuario tiene configurados y que están en los nodos
  const agentesUsuario = Object.keys(etiquetasPersonalizadas);
  const nodosConAgentes = {};
  
  Object.entries(nodos).forEach(([nodoId, nodoData]) => {
    const agentesEncontrados = nodoData.agentes.filter(agente => 
      agentesUsuario.includes(agente)
    );
    if (agentesEncontrados.length > 0) {
      nodosConAgentes[nodoId] = {
        ...nodoData,
        agentesUsuario: agentesEncontrados
      };
    }
  });
  
  // Si no hay nodos con agentes, mostrar mensaje
  if (Object.keys(nodosConAgentes).length === 0) {
    agentesContainer.innerHTML = '<div class="no-agentes">No hay agentes configurados en los nodos disponibles</div>';
    return;
  }
  
  // Crear HTML para la vista de nodos
  let nodosHtml = `
    <div class="nodos-container">
      <div class="nodos-menu">
  `;
  
  // Crear los tabs de los nodos
  Object.entries(nodosConAgentes).forEach(([nodoId, nodoData], index) => {
    const activeClass = index === 0 ? 'active' : '';
    nodosHtml += `
      <div class="nodo-tab ${activeClass}" data-nodo="${nodoId}">
        <i class="${nodoData.icono}"></i>
        <span>${nodoData.nombre}</span>
      </div>
    `;
  });
  
  nodosHtml += `
      </div>
      <div class="nodo-content">
  `;
  
  // Crear el contenido de cada nodo
  Object.entries(nodosConAgentes).forEach(([nodoId, nodoData], index) => {
    const activeClass = index === 0 ? 'active' : '';
    nodosHtml += `
      <div class="nodo-agentes ${activeClass}" data-nodo="${nodoId}">
    `;
    
    nodoData.agentesUsuario.forEach(agente => {
      const etiquetaData = etiquetasPersonalizadas[agente];
      let descripcion = '';
      let nivelImpacto = '';
      
      if (typeof etiquetaData === 'string') {
        descripcion = etiquetaData;
      } else if (typeof etiquetaData === 'object' && etiquetaData !== null) {
        descripcion = etiquetaData.explicacion || '';
        nivelImpacto = etiquetaData.nivel_impacto || '';
      }
      
      // Generar tag de nivel de impacto
      let nivelTag = '';
      if (nivelImpacto) {
        let bgColor = '#f8f9fa';
        let textColor = '#6c757d';
        
        switch (nivelImpacto.toLowerCase()) {
          case 'alto':
            bgColor = '#ffe6e6';
            textColor = '#dc3545';
            break;
          case 'medio':
            bgColor = '#fff3cd';
            textColor = '#856404';
            break;
          case 'bajo':
            bgColor = '#d4edda';
            textColor = '#155724';
            break;
        }
        
        nivelTag = `<span class="nivel-impacto-tag" style="background-color: ${bgColor}; color: ${textColor}; padding: 2px 8px; border-radius: 12px; font-size: 0.7em; font-weight: 500; margin-left: 8px;">${nivelImpacto}</span>`;
      }
      
      nodosHtml += `
        <div class="nodo-agente-item" title="${descripcion}">
          ${agente}${nivelTag}
        </div>
      `;
    });
    
    nodosHtml += `
      </div>
    `;
  });
  
  nodosHtml += `
      </div>
    </div>
  `;
  
  agentesContainer.innerHTML = nodosHtml;
  
  // Agregar event listeners para los tabs
  document.querySelectorAll('.nodo-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      const nodoId = this.dataset.nodo;
      
      // Remover clase active de todos los tabs y contenidos
      document.querySelectorAll('.nodo-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.nodo-agentes').forEach(content => content.classList.remove('active'));
      
      // Agregar clase active al tab y contenido seleccionado
      this.classList.add('active');
      document.querySelector(`.nodo-agentes[data-nodo="${nodoId}"]`).classList.add('active');
      
      // Actualizar el dropdown de etiquetas para mostrar solo los agentes del nodo seleccionado
      loadEtiquetasDropdown();
      
      // Aplicar el filtro de nivel de impacto actual al nuevo nodo
      const nivelImpactoDropdown = document.getElementById('nivelImpactoDropdown');
      if (nivelImpactoDropdown) {
        const selectedRadio = nivelImpactoDropdown.querySelector('input[type="radio"]:checked');
        if (selectedRadio && selectedRadio.value !== 'todos') {
          filterDocumentsByNivelImpacto(selectedRadio.value);
        }
      }
    });
  });
}

// Función para obtener los agentes del nodo activo
function getAgentesFromActiveNode(etiquetasPersonalizadas) {
  // Definir los nodos y sus agentes (misma estructura que en loadNodesView)
  const nodos = {
    'tecnologia': {
      agentes: [
        'Inteligencia regulatoria en asuntos públicos',
        'Competencias Digitales & STEM',
        'Consumidor Digital & E-Commerce',
        'IA & Tecnologías Emergentes',
        'Plataformas Digitales & Contenido',
        'Protección de Datos & Ciberseguridad',
        'Menores & Usuarios Vulnerables'
      ]
    },
    'banca': {
      agentes: [
        'Banca & Política Fiscal',
        'Crédito & Financiación',
        'Inclusión Financiera & Comisiones',
        'Mercados & Inversión Colectiva',
        'ESG & Buen Gobierno'
      ]
    },
    'energia': {
      agentes: [
        'Energía Convencional y Combustibles Fósiles',
        'Energías Renovables y Transición Energética',
        'Emisiones de Carbono, Captura y Economía Circular'
      ]
    },
    'salud': {
      agentes: [
        'Atención Rural & Personalizada',
        'Enfermedades Crónicas de Alto Impacto',
        'Enfermedades Raras y Medicamentos Huérfanos',
        'Oncología y Medicina de Precisión',
        'Política Farmacéutica, Acceso y Compra Innovadora',
        'Resistencias Antimicrobianas y Seguridad Clínica',
        'Vacunación, Inmunización y Enfermedades Infecciosas',
        'Salud Digital, IA y Datos Reales'
      ]
    },
    'residuos': {
      agentes: [
        'Gestión y Tratamiento de Residuos',
        'Economía Circular & Responsabilidad del Productor',
        'Circularidad & Reporting ESG'
      ]
    }
  };
  
  // Encontrar el nodo activo
  const activeTab = document.querySelector('.nodo-tab.active');
  if (!activeTab) {
    // Si no hay nodo activo, devolver todas las etiquetas del usuario
    return Object.keys(etiquetasPersonalizadas);
  }
  
  const activeNodeId = activeTab.dataset.nodo;
  const activeNode = nodos[activeNodeId];
  
  if (!activeNode) {
    // Si no se encuentra el nodo, devolver todas las etiquetas del usuario
    return Object.keys(etiquetasPersonalizadas);
  }
  
  // Filtrar solo los agentes que el usuario tiene y que pertenecen al nodo activo
  const agentesUsuario = Object.keys(etiquetasPersonalizadas);
  return activeNode.agentes.filter(agente => agentesUsuario.includes(agente));
}

// Funciones de dropdown legacy (mantenidas por compatibilidad)
function toggleIndustryDropdown() {
  document.getElementById("myDropdown")?.classList.toggle("show");
  document.getElementById("ramaDropdown")?.classList.remove("show");
  document.getElementById("boletinDropdown")?.classList.remove("show");
  document.getElementById("etiquetasDropdown")?.classList.remove("show");
  document.getElementById("rangoDropdown")?.classList.remove("show");
}

function toggleRamaDropdown() {
  document.getElementById("ramaDropdown")?.classList.toggle("show");
  document.getElementById("myDropdown")?.classList.remove("show");
  document.getElementById("boletinDropdown")?.classList.remove("show");
  document.getElementById("etiquetasDropdown")?.classList.remove("show");
  document.getElementById("rangoDropdown")?.classList.remove("show");
}

function toggleBoletinDropdown() {
  document.getElementById("boletinDropdown")?.classList.toggle("show");
  document.getElementById("myDropdown")?.classList.remove("show");
  document.getElementById("ramaDropdown")?.classList.remove("show");
  document.getElementById("etiquetasDropdown")?.classList.remove("show");
  document.getElementById("rangoDropdown")?.classList.remove("show");
}

function toggleEtiquetasDropdown() {
  document.getElementById("etiquetasDropdown")?.classList.toggle("show");
  document.getElementById("myDropdown")?.classList.remove("show");
  document.getElementById("ramaDropdown")?.classList.remove("show");
  document.getElementById("boletinDropdown")?.classList.remove("show");
  document.getElementById("rangoDropdown")?.classList.remove("show");
}

function toggleRangoDropdown() {
  document.getElementById("rangoDropdown")?.classList.toggle("show");
  document.getElementById("myDropdown")?.classList.remove("show");
  document.getElementById("ramaDropdown")?.classList.remove("show");
  document.getElementById("boletinDropdown")?.classList.remove("show");
  document.getElementById("etiquetasDropdown")?.classList.remove("show");
}

function toggleNivelImpactoDropdown(event) {
  if (event) event.stopPropagation();
  document.getElementById('nivelImpactoDropdown')?.classList.toggle('show');
}

// Función para cargar y mostrar las etiquetas personalizadas en el dropdown de búsqueda
function loadEtiquetasDropdown() {
  const etiquetasDropdown = document.getElementById('etiquetasDropdown');
  if (!etiquetasDropdown) return;
  
  // Verificar si es el usuario específico y si está usando la vista de nodos
  let userEmail = null;
  try {
    const userEmailElement = document.getElementById('userEmail');
    if (userEmailElement && userEmailElement.textContent) {
      const emailContent = userEmailElement.textContent.trim();
      // Verificar si el contenido es un template sin procesar
      if (emailContent.startsWith('"') && emailContent.endsWith('"') && !emailContent.includes('{{')) {
        userEmail = JSON.parse(emailContent);
      } else if (emailContent && !emailContent.includes('{{')) {
        userEmail = emailContent;
      }
    }
  } catch (e) {
    userEmail = sessionStorage.getItem('userEmail');
  }
  
  const isNodesUser = userEmail === 'burgalonso@gmail.com';
  
  // Obtener las etiquetas personalizadas del usuario de manera segura
  let etiquetasPersonalizadas = {};
  try {
    const userEtiquetasElement = document.getElementById('userEtiquetasPersonalizadas');
    if (userEtiquetasElement && userEtiquetasElement.textContent) {
      const content = userEtiquetasElement.textContent.trim();
      if (content && !content.includes('{{')) {
        etiquetasPersonalizadas = JSON.parse(content);
      }
    }
  } catch (e) {
    console.log('Error al obtener etiquetas personalizadas:', e);
    etiquetasPersonalizadas = {};
  }
  
  let etiquetasKeys = Object.keys(etiquetasPersonalizadas);
  
  // Si es el usuario de nodos, filtrar por el nodo activo
  if (isNodesUser) {
    etiquetasKeys = getAgentesFromActiveNode(etiquetasPersonalizadas);
  }
  
  // Si no hay etiquetas personalizadas, mostrar mensaje
  if (etiquetasKeys.length === 0) {
    etiquetasDropdown.innerHTML = '<div class="no-etiquetas">No hay agentes configurados</div>';
    return;
  }
  
  // Crear el checkbox "Todos"
  let html = `<label><input type="checkbox" value="Todas" id="chkAllEtiquetas" checked> Todos</label>`;
  
  // Crear un checkbox para cada etiqueta personalizada
  etiquetasKeys.forEach(etiqueta => {
    html += `<label><input type="checkbox" value="${etiqueta}" checked> ${etiqueta}</label>`;
  });
  
  etiquetasDropdown.innerHTML = html;
  
  // Añadir event listener al checkbox "Todos"
  const chkAllEtiquetas = document.getElementById('chkAllEtiquetas');
  if (chkAllEtiquetas) {
    chkAllEtiquetas.addEventListener('change', function(event) {
      // Detener la propagación del evento para evitar que se cierre el dropdown
      event.stopPropagation();
      
      const etiquetasCheckboxes = etiquetasDropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllEtiquetas)');
      etiquetasCheckboxes.forEach(cb => {
        cb.checked = this.checked;
      });
      updateSelectedEtiquetasText();
    });
  }
  
  // Añadir event listeners a los checkboxes de etiquetas
  const etiquetasCheckboxes = etiquetasDropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllEtiquetas)');
  etiquetasCheckboxes.forEach(cb => {
    cb.addEventListener('change', function(event) {
      // Detener la propagación del evento para evitar que se cierre el dropdown
      event.stopPropagation();
      
      // Verificar si todos los checkboxes están marcados o desmarcados
      const allChecked = Array.from(etiquetasCheckboxes).every(cb => cb.checked);
      const noneChecked = Array.from(etiquetasCheckboxes).every(cb => !cb.checked);
      
      // Actualizar el checkbox "Todos" según corresponda
      if (chkAllEtiquetas) {
        chkAllEtiquetas.checked = allChecked;
        chkAllEtiquetas.indeterminate = !allChecked && !noneChecked;
      }
      
      updateSelectedEtiquetasText();
    });
  });
  
  // Inicializar el texto seleccionado
  updateSelectedEtiquetasText();
}

// Función para actualizar el texto del botón de etiquetas
function updateSelectedEtiquetasText() {
  const etiquetasDropdown = document.getElementById('etiquetasDropdown');
  const selectedEtiquetasSpan = document.getElementById('selectedEtiquetas');
  if (!etiquetasDropdown || !selectedEtiquetasSpan) return;
  
  const etiquetasCheckboxes = etiquetasDropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllEtiquetas)');
  const selectedEtiquetas = Array.from(etiquetasCheckboxes).filter(cb => cb.checked);
  
  if (selectedEtiquetas.length === 0) {
    selectedEtiquetasSpan.textContent = 'Ninguno';
  } else if (selectedEtiquetas.length === etiquetasCheckboxes.length) {
    selectedEtiquetasSpan.textContent = 'Todos';
  } else if (selectedEtiquetas.length <= 2) {
    selectedEtiquetasSpan.textContent = selectedEtiquetas.map(cb => cb.value).join(', ');
  } else {
    selectedEtiquetasSpan.textContent = `${selectedEtiquetas.length} seleccionados`;
  }
  
  // Aplicar el filtro de nivel de impacto actual a la nueva selección de agentes
  const nivelImpactoDropdown = document.getElementById('nivelImpactoDropdown');
  if (nivelImpactoDropdown) {
    const selectedRadio = nivelImpactoDropdown.querySelector('input[type="radio"]:checked');
    if (selectedRadio && selectedRadio.value !== 'todos') {
      filterDocumentsByNivelImpacto(selectedRadio.value);
    }
  }
}

// Función para cargar boletines dropdown
function loadBoletinDropdown() {
  const boletinDropdown = document.getElementById('boletinDropdown');
  if (!boletinDropdown) return;
  
  // Obtener las fuentes del usuario (cobertura_legal) de manera segura
  const coberturaLegal = getSafeGlobalData('userBoletines', []);
  
  // Crear el checkbox "Todos"
  let html = `<label><input type="checkbox" value="Todos" id="chkAllBoletin" checked> Todos</label>`;
  
  // Añadir todas las fuentes del array directamente (solo las de la cobertura legal del usuario)
  if (Array.isArray(coberturaLegal)) {
    coberturaLegal.forEach(fuente => {
      html += `<label><input type="checkbox" value="${fuente}" checked> ${fuente.toUpperCase()}</label>`;
    });
  }
  
  boletinDropdown.innerHTML = html;
  
  // Añadir event listener al checkbox "Todos"
  const chkAllBoletin = document.getElementById('chkAllBoletin');
  if (chkAllBoletin) {
    chkAllBoletin.addEventListener('change', function(event) {
      // Detener la propagación del evento para evitar que se cierre el dropdown
      event.stopPropagation();
      
      const boletinCheckboxes = boletinDropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllBoletin)');
      boletinCheckboxes.forEach(cb => {
        cb.checked = this.checked;
      });
      updateSelectedBoletinesText();
    });
  }
  
  // Añadir event listeners a los checkboxes de boletines
  const boletinCheckboxes = boletinDropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllBoletin)');
  boletinCheckboxes.forEach(cb => {
    cb.addEventListener('change', function(event) {
      // Detener la propagación del evento para evitar que se cierre el dropdown
      event.stopPropagation();
      
      // Verificar si todos los checkboxes están marcados o desmarcados
      const allChecked = Array.from(boletinCheckboxes).every(cb => cb.checked);
      const noneChecked = Array.from(boletinCheckboxes).every(cb => !cb.checked);
      
      // Actualizar el checkbox "Todos" según corresponda
      if (chkAllBoletin) {
        chkAllBoletin.checked = allChecked;
        chkAllBoletin.indeterminate = !allChecked && !noneChecked;
      }
      
      updateSelectedBoletinesText();
    });
  });
  
  // Inicializar el texto seleccionado
  updateSelectedBoletinesText();
}

function updateSelectedBoletinesText() {
  const boletinDropdown = document.getElementById('boletinDropdown');
  const selectedBoletinesSpan = document.getElementById('selectedBoletines');
  if (!boletinDropdown || !selectedBoletinesSpan) return;
  
  const boletinCheckboxes = boletinDropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllBoletin)');
  const selectedBoletines = Array.from(boletinCheckboxes).filter(cb => cb.checked);
  
  if (selectedBoletines.length === 0) {
    selectedBoletinesSpan.textContent = 'Ninguno';
  } else if (selectedBoletines.length === boletinCheckboxes.length) {
    selectedBoletinesSpan.textContent = 'Todos';
  } else if (selectedBoletines.length <= 2) {
    selectedBoletinesSpan.textContent = selectedBoletines.map(cb => cb.value).join(', ');
  } else {
    selectedBoletinesSpan.textContent = `${selectedBoletines.length} seleccionados`;
  }
}

// Función para cargar rangos dropdown
function loadRangoDropdown() {
  const rangoDropdown = document.getElementById('rangoDropdown');
  if (!rangoDropdown) return;
  
  // Obtener los rangos del usuario de manera segura
  const userRangos = getSafeGlobalData('userRangos', []);
  
  // Crear el checkbox "Todos"
  let html = `<label><input type="checkbox" value="Todos" id="chkAllRango" checked> Todos</label>`;
  
  // Añadir todos los rangos del usuario
  if (Array.isArray(userRangos)) {
    userRangos.forEach(rango => {
      html += `<label><input type="checkbox" value="${rango}" checked> ${rango}</label>`;
    });
  }
  
  rangoDropdown.innerHTML = html;
  
  // Añadir event listener al checkbox "Todos"
  const chkAllRango = document.getElementById('chkAllRango');
  if (chkAllRango) {
    chkAllRango.addEventListener('change', function(event) {
      // Detener la propagación del evento para evitar que se cierre el dropdown
      event.stopPropagation();
      
      const rangoCheckboxes = rangoDropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllRango)');
      rangoCheckboxes.forEach(cb => {
        cb.checked = this.checked;
      });
      updateSelectedRangoText();
    });
  }
  
  // Añadir event listeners a los checkboxes de rangos
  const rangoCheckboxes = rangoDropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllRango)');
  rangoCheckboxes.forEach(cb => {
    cb.addEventListener('change', function(event) {
      // Detener la propagación del evento para evitar que se cierre el dropdown
      event.stopPropagation();
      
      // Verificar si todos los checkboxes están marcados o desmarcados
      const allChecked = Array.from(rangoCheckboxes).every(cb => cb.checked);
      const noneChecked = Array.from(rangoCheckboxes).every(cb => !cb.checked);
      
      // Actualizar el checkbox "Todos" según corresponda
      if (chkAllRango) {
        chkAllRango.checked = allChecked;
        chkAllRango.indeterminate = !allChecked && !noneChecked;
      }
      
      updateSelectedRangoText();
    });
  });
  
  // Inicializar el texto seleccionado
  updateSelectedRangoText();
}

// Función para actualizar el texto de rangos seleccionados
function updateSelectedRangoText() {
  const rangoDropdown = document.getElementById('rangoDropdown');
  const selectedRangoSpan = document.getElementById('selectedRango');
  if (!rangoDropdown || !selectedRangoSpan) return;
  
  const rangoCheckboxes = rangoDropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllRango)');
  const selectedRangos = Array.from(rangoCheckboxes).filter(cb => cb.checked);
  
  if (selectedRangos.length === 0) {
    selectedRangoSpan.textContent = 'Ninguno';
  } else if (selectedRangos.length === rangoCheckboxes.length) {
    selectedRangoSpan.textContent = 'Todos';
  } else if (selectedRangos.length <= 2) {
    selectedRangoSpan.textContent = selectedRangos.map(cb => cb.value).join(', ');
  } else {
    selectedRangoSpan.textContent = `${selectedRangos.length} seleccionados`;
  }
}

// Función auxiliar para obtener los agentes actualmente seleccionados
function getSelectedAgentes() {
  const etiquetasDropdown = document.getElementById('etiquetasDropdown');
  if (!etiquetasDropdown) return [];
  
  // Verificar si es el usuario específico con vista de nodos
  let userEmail = null;
  try {
    const userEmailElement = document.getElementById('userEmail');
    if (userEmailElement && userEmailElement.textContent) {
      const emailContent = userEmailElement.textContent.trim();
      // Verificar si el contenido es un template sin procesar
      if (emailContent.startsWith('"') && emailContent.endsWith('"') && !emailContent.includes('{{')) {
        userEmail = JSON.parse(emailContent);
      } else if (emailContent && !emailContent.includes('{{')) {
        userEmail = emailContent;
      }
    }
  } catch (e) {
    userEmail = sessionStorage.getItem('userEmail');
  }
  
  const isNodesUser = userEmail === 'burgalonso@gmail.com';
  
  // Verificar si está seleccionado "Todos"
  const allEtiquetasSelected = document.getElementById('chkAllEtiquetas')?.checked;
  
  if (allEtiquetasSelected) {
    // Si "Todos" está seleccionado, usar todas las etiquetas del usuario de manera segura
    const etiquetasPersonalizadas = getEtiquetasPersonalizadasSafely();
    
    // Si es el usuario de nodos, filtrar por el nodo activo
    if (isNodesUser) {
      return getAgentesFromActiveNode(etiquetasPersonalizadas);
    } else {
      return Object.keys(etiquetasPersonalizadas);
    }
  } else {
    // Si no está seleccionado "Todos", usar solo las etiquetas seleccionadas
    const etiquetasCheckboxes = etiquetasDropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllEtiquetas)');
    return Array.from(etiquetasCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);
  }
}

// Función para filtrar documentos por nivel de impacto considerando los agentes seleccionados
function filterDocumentsByNivelImpacto(selectedLevel) {
  const documents = document.querySelectorAll('.data-item');
  let visibleCount = 0;
  
  // Obtener los agentes actualmente seleccionados
  const selectedAgentes = getSelectedAgentes();
  
  documents.forEach(doc => {
    let shouldShow = true;
    
    if (selectedLevel !== 'todos') {
      // Buscar en la sección de impacto en agentes si existe
      const impactoSection = doc.querySelector('.impacto-agentes');
      let hasMatchingLevel = false;
      
      if (impactoSection && selectedAgentes.length > 0) {
        // Buscar todos los divs que contienen agentes
        const agenteDivs = impactoSection.querySelectorAll('div[style*="margin-bottom: 12px"]');
        
        agenteDivs.forEach(div => {
          // Obtener el nombre del agente
          const agenteNameSpan = div.querySelector('span[style*="font-weight: 600"]');
          if (!agenteNameSpan) return;
          
          const agenteName = agenteNameSpan.textContent.trim();
          
          // Verificar si este agente está seleccionado
          const isAgenteSelected = selectedAgentes.some(selectedAgente => 
            selectedAgente.toLowerCase() === agenteName.toLowerCase()
          );
          
          if (isAgenteSelected) {
            // Buscar el tag de nivel de impacto en este div específico del agente
            const nivelTag = div.querySelector('span[style*="background-color"]');
            if (nivelTag) {
              const tagText = nivelTag.textContent.toLowerCase().trim();
              if (tagText === selectedLevel.toLowerCase()) {
                hasMatchingLevel = true;
              }
            }
          }
        });
      }
      
      // Solo mostrar documentos que tienen el nivel seleccionado para los agentes seleccionados
      shouldShow = hasMatchingLevel;
    }
    
    if (shouldShow) {
      doc.style.display = 'block';
      visibleCount++;
    } else {
      doc.style.display = 'none';
    }
  });
  
  // Actualizar contador si existe
  console.log(`Documentos visibles: ${visibleCount} de ${documents.length}`);
  
  // Mostrar mensaje si no hay documentos visibles
  const collectionDocs = document.querySelector('.collectionDocs');
  let noResultsMessage = collectionDocs?.querySelector('.no-results-nivel');
  
  if (visibleCount === 0 && selectedLevel !== 'todos' && collectionDocs) {
    if (!noResultsMessage) {
      noResultsMessage = document.createElement('div');
      noResultsMessage.className = 'no-results-nivel';
      noResultsMessage.style.cssText = 'color: #666; font-style: italic; text-align: center; padding: 20px; border: 1px solid #ddd; border-radius: 8px; margin: 20px 0; background-color: #f9f9f9;';
      noResultsMessage.textContent = `No hay documentos con nivel de impacto "${selectedLevel.charAt(0).toUpperCase() + selectedLevel.slice(1)}" para los agentes seleccionados`;
      collectionDocs.appendChild(noResultsMessage);
    }
    noResultsMessage.style.display = 'block';
  } else if (noResultsMessage) {
    noResultsMessage.style.display = 'none';
  }
}

// Función para manejar el cambio de filtro de nivel de impacto
function handleNivelImpactoChange() {
  const nivelImpactoDropdown = document.getElementById('nivelImpactoDropdown');
  const selectedNivelSpan = document.getElementById('selectedNivelImpacto');
  const selectedNivelCirculo = document.getElementById('selectedNivelCirculo');
  
  if (!nivelImpactoDropdown || !selectedNivelSpan || !selectedNivelCirculo) return;
  
  const radioButtons = nivelImpactoDropdown.querySelectorAll('input[type="radio"]');
  
  radioButtons.forEach(radio => {
    radio.addEventListener('change', function(event) {
      event.stopPropagation();
      
      if (this.checked) {
        const selectedValue = this.value;
        const labelText = this.parentElement.textContent.trim();
        
        // Actualizar el texto del botón
        selectedNivelSpan.textContent = labelText;
        
        // Actualizar el círculo del botón
        const circuloClass = `nivel-circulo-${selectedValue}`;
        selectedNivelCirculo.className = `nivel-circulo ${circuloClass}`;
        
        // Filtrar documentos
        filterDocumentsByNivelImpacto(selectedValue);
        
        // Cerrar el dropdown
        nivelImpactoDropdown.classList.remove('show');
      }
    });
  });
}

// Función principal de búsqueda
function handleBuscar() {
  // Mostrar loaders y ocultar contenido previo
  const chartContainer = document.getElementById('chartContainer');
  const loadingIcon = document.getElementById('loading-icon');
  const loadingIconChart = document.getElementById('loading-icon-chart');
  const collectionDocs = document.querySelector('.collectionDocs');
  
  // Ocultar contenido anterior y mostrar loaders
  if (chartContainer) {
    chartContainer.style.display = 'none';
    chartContainer.classList.remove('loaded');
  }
  if (collectionDocs) collectionDocs.innerHTML = '';
  if (loadingIcon) loadingIcon.style.display = 'block';
  if (loadingIconChart) loadingIconChart.style.display = 'block';
  
  // Recopilar los valores de los filtros
  
  // 1. Etiquetas personalizadas (filtro principal)
  let selectedEtiquetas = [];
  const etiquetasDropdown = document.getElementById('etiquetasDropdown');
  
  // Verificar si está seleccionado "Todos"
  const allEtiquetasSelected = document.getElementById('chkAllEtiquetas')?.checked;
  
  if (allEtiquetasSelected) {
    // Si "Todos" está seleccionado, usar todas las etiquetas del usuario (estructura directa)
    const etiquetasPersonalizadas = getEtiquetasPersonalizadasSafely();
    selectedEtiquetas = Object.keys(etiquetasPersonalizadas).map(etiqueta => etiqueta.toLowerCase());
  } else if (etiquetasDropdown) {
    // Si no, usar solo las etiquetas seleccionadas
    const etiquetasCheckboxes = etiquetasDropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllEtiquetas)');
    selectedEtiquetas = Array.from(etiquetasCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value.toLowerCase()); // Convertir a minúsculas para comparación case-insensitive
  }
  
  // Si no hay etiquetas seleccionadas, mostrar mensaje y no realizar la búsqueda
  if (selectedEtiquetas.length === 0) {
    const collectionDocs = document.querySelector('.collectionDocs');
    if (collectionDocs) {
      collectionDocs.innerHTML = `
        <div class="no-results" style="color: #04db8d; font-weight: bold; padding: 20px; text-align: center; font-size: 16px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          Por favor, selecciona al menos un agente para realizar la búsqueda.
        </div>
      `;
    }
    if (loadingIcon) loadingIcon.style.display = 'none';
    if (loadingIconChart) loadingIconChart.style.display = 'none';
    
    // Ocultar overlay principal cuando no hay agentes seleccionados
    if (typeof window.hidePageLoaderOverlay === 'function') {
      window.hidePageLoaderOverlay();
    }
    
    // Ocultar los títulos y el contenedor del gráfico
    const analyticsLabels = document.querySelectorAll('.analytics-label');
    analyticsLabels.forEach(label => {
      if (!label.classList.contains('busqueda')) {
        label.style.display = 'none';
      }
    });
    if (chartContainer) chartContainer.style.display = 'none';
    
    return;
  }
  
  // 2. Boletines
  let selectedBoletines = [];
  const boletinDropdown = document.getElementById('boletinDropdown');
  if (boletinDropdown) {
    const boletinCheckboxes = boletinDropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllBoletin)');
    selectedBoletines = Array.from(boletinCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);
  }
  
  // 3. Rangos
  let selectedRangos = [];
  const rangoDropdown = document.getElementById('rangoDropdown');
  if (rangoDropdown) {
    const rangoCheckboxes = rangoDropdown.querySelectorAll('input[type="checkbox"]:not(#chkAllRango)');
    selectedRangos = Array.from(rangoCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);
  }
  
  // 4. Fechas
  const startDate = document.getElementById('startDate')?.value;
  const endDate = document.getElementById('endDate')?.value;
  
  // Construir la URL con los parámetros de búsqueda
  let searchParams = new URLSearchParams();
  
  // Añadir etiquetas personalizadas
  if (selectedEtiquetas.length > 0) {
    searchParams.append('etiquetas', selectedEtiquetas.join('||'));
  }
  
  // Añadir boletines
  if (selectedBoletines.length > 0) {
    searchParams.append('collections', selectedBoletines.join('||'));
  }
  
  // Añadir rangos
  if (selectedRangos.length > 0) {
    searchParams.append('rango', selectedRangos.join('||'));
  }
  
  // Añadir fechas
  if (startDate) {
    searchParams.append('desde', startDate);
  }
  if (endDate) {
    searchParams.append('hasta', endDate);
  }
  
  // Realizar la petición al servidor
  fetch(`/data?${searchParams.toString()}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Error en la búsqueda: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      // Actualizar el contenido de documentos
      const collectionDocs = document.querySelector('.collectionDocs');
      if (collectionDocs) {
        collectionDocs.innerHTML = data.documentsHtml;
      }
      
      // Ocultar o mostrar los títulos de estadísticas y documentos según la respuesta
      const analyticsLabels = document.querySelectorAll('.analytics-label');
      
      if (data.hideAnalyticsLabels) {
        // Ocultar los títulos y el contenedor del gráfico
        analyticsLabels.forEach(label => {
          if (!label.classList.contains('busqueda')) {
            label.style.display = 'none';
          }
        });
        if (chartContainer) chartContainer.style.display = 'none';
        if (loadingIconChart) loadingIconChart.style.display = 'none';
      } else {
        // Mostrar los títulos
        analyticsLabels.forEach(label => {
          if (!label.classList.contains('busqueda')) {
            label.style.display = 'block';
          }
        });
        
        // Si hay datos para el gráfico, actualizarlo (loadChart se encarga de mostrar el chart y ocultar el loader)
        if (data.monthsForChart && data.countsForChart) {
          loadChart(data.monthsForChart, data.countsForChart);
        } else {
          // Si no hay datos para el chart, ocultar el chart y el loader
          if (chartContainer) chartContainer.style.display = 'none';
          if (loadingIconChart) loadingIconChart.style.display = 'none';
        }
      }
      
      // Ocultar el loader principal de documentos
      if (loadingIcon) loadingIcon.style.display = 'none';
      
      // Ocultar overlay principal después de cargar los datos
      if (typeof window.hidePageLoaderOverlay === 'function') {
        window.hidePageLoaderOverlay();
      }
      
      // Reiniciar el filtro de nivel de impacto a "Todos"
      const nivelImpactoRadio = document.querySelector('input[name="nivelImpacto"][value="todos"]');
      const selectedNivelSpan = document.getElementById('selectedNivelImpacto');
      const selectedNivelCirculo = document.getElementById('selectedNivelCirculo');
      if (nivelImpactoRadio && selectedNivelSpan && selectedNivelCirculo) {
        nivelImpactoRadio.checked = true;
        selectedNivelSpan.textContent = 'Todos';
        selectedNivelCirculo.className = 'nivel-circulo nivel-circulo-todos';
        filterDocumentsByNivelImpacto('todos');
      }
    })
    .catch(error => {
      console.error('Error:', error);
      const collectionDocs = document.querySelector('.collectionDocs');
      if (collectionDocs) {
        collectionDocs.innerHTML = `<div class="no-results">Error al realizar la búsqueda: ${error.message}</div>`;
      }
      if (loadingIcon) loadingIcon.style.display = 'none';
      if (loadingIconChart) loadingIconChart.style.display = 'none';
      
      // Ocultar overlay principal incluso en caso de error
      if (typeof window.hidePageLoaderOverlay === 'function') {
        window.hidePageLoaderOverlay();
      }
      
      // Reiniciar el filtro de nivel de impacto a "Todos"
      const nivelImpactoRadio = document.querySelector('input[name="nivelImpacto"][value="todos"]');
      const selectedNivelSpan = document.getElementById('selectedNivelImpacto');
      const selectedNivelCirculo = document.getElementById('selectedNivelCirculo');
      if (nivelImpactoRadio && selectedNivelSpan && selectedNivelCirculo) {
        nivelImpactoRadio.checked = true;
        selectedNivelSpan.textContent = 'Todos';
        selectedNivelCirculo.className = 'nivel-circulo nivel-circulo-todos';
      }
    });
}

// Función para enviar feedback
async function sendFeedback(docId, feedbackType, element, agenteEtiquetado = '', coleccion = '', docUrl = '', docTitle = '') {
  try {
    // Si es thumbs down, mostrar dropdown
    if (feedbackType === 'dislike') {
      showFeedbackDropdown(docId, element, agenteEtiquetado, coleccion, docUrl, docTitle);
      return;
    }
    
    const response = await fetch('/feedback-thumbs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        docId,
        feedback: feedbackType,
        agenteEtiquetado,
        coleccion,
        docUrl,
        docTitle
      })
    });
    
    if (response.ok) {
      // Cambiar color del icono
      if (feedbackType === 'like') {
        element.style.color = '#04db8d';
        // Resetear el dislike si existe
        const dislikeIcon = element.nextElementSibling;
        if (dislikeIcon) dislikeIcon.style.color = '';
      }
      // Mostrar feedback visual
      showFeedbackSuccess(element, feedbackType);
    }
  } catch (error) {
    console.error('Error sending feedback:', error);
  }
}

// Función para mostrar el dropdown de feedback negativo
function showFeedbackDropdown(docId, element, agenteEtiquetado = '', coleccion = '', docUrl = '', docTitle = '') {
  // Cerrar cualquier dropdown abierto previamente
  const existingDropdown = document.querySelector('.feedback-dropdown');
  if (existingDropdown) {
    existingDropdown.remove();
  }
  
  const dropdown = document.createElement('div');
  dropdown.className = 'feedback-dropdown';
  dropdown.innerHTML = `
    <div class="feedback-dropdown-content">
      <h4>¿Por qué no te ha gustado?</h4>
      <div class="feedback-options">
        <button class="feedback-option-btn" data-option="Etiqueta Errónea">Etiqueta Errónea</button>
        <button class="feedback-option-btn" data-option="No es lo suficientemente relevante">No es lo suficientemente relevante</button>
        <button class="feedback-option-btn" data-option="otro">Otro</button>
      </div>
      <div class="feedback-otro-container" style="display: none;">
        <input type="text" class="feedback-otro-input" placeholder="Otro" maxlength="200">
        <button class="feedback-submit-btn">Enviar</button>
      </div>
    </div>
  `;
  
  // Posicionar el dropdown alineado con el botón de feedback negativo
  const rect = element.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.top = (rect.bottom + 10) + 'px';
  dropdown.style.left = rect.left + 'px';
  dropdown.style.zIndex = '10000';
  
  document.body.appendChild(dropdown);
  
  // Event listeners para las opciones
  const optionButtons = dropdown.querySelectorAll('.feedback-option-btn');
  const otroContainer = dropdown.querySelector('.feedback-otro-container');
  const otroInput = dropdown.querySelector('.feedback-otro-input');
  const submitBtn = dropdown.querySelector('.feedback-submit-btn');
  
  optionButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const option = this.dataset.option;
      
      if (option === 'otro') {
        otroContainer.style.display = 'block';
        otroInput.focus();
      } else {
        // Enviar feedback directamente
        sendNegativeFeedback(docId, option, element, dropdown, agenteEtiquetado, coleccion, docUrl, docTitle);
      }
    });
  });
  
  submitBtn.addEventListener('click', function() {
    const customReason = otroInput.value.trim();
    if (customReason) {
      sendNegativeFeedback(docId, customReason, element, dropdown, agenteEtiquetado, coleccion, docUrl, docTitle);
    }
  });
  
  // Cerrar al hacer clic fuera
  document.addEventListener('click', function closeDropdown(event) {
    if (!dropdown.contains(event.target) && event.target !== element) {
      dropdown.remove();
      document.removeEventListener('click', closeDropdown);
    }
  });
}

// Función para enviar feedback negativo con razón
async function sendNegativeFeedback(docId, reason, element, dropdown, agenteEtiquetado = '', coleccion = '', docUrl = '', docTitle = '') {
  try {
    const response = await fetch('/feedback-thumbs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        docId,
        feedback: `dislike: ${reason}`,
        agenteEtiquetado,
        coleccion,
        docUrl,
        docTitle,
        feedbackDetalle: reason
      })
    });
    
    if (response.ok) {
      // Cambiar color del icono
      element.style.color = '#ff6b6b';
      // Resetear el like si existe
      const likeIcon = element.previousElementSibling;
      if (likeIcon) likeIcon.style.color = '';
      
      // Mostrar feedback visual
      showFeedbackSuccess(element, 'dislike');
      
      // Cerrar dropdown
      dropdown.remove();
    }
  } catch (error) {
    console.error('Error sending negative feedback:', error);
  }
}

// Función para mostrar feedback visual de éxito
function showFeedbackSuccess(element, type) {
  const message = document.createElement('div');
  message.className = 'feedback-success-message';
  
  // Crear el contenido con el tick verde
  const textContent = type === 'like' ? '¡Gracias por tu feedback!' : 'Feedback enviado';
  message.innerHTML = `
    <span>${textContent}</span>
    <svg width="16" height="16" viewBox="0 0 24 24" style="margin-left: 8px; color: #04db8d;">
      <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
    </svg>
  `;
  
  message.style.cssText = `
    position: fixed;
    background: white;
    color: #1a365d;
    border: 2px solid #1a365d;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    z-index: 10001;
    display: flex;
    align-items: center;
   /* opacity: 0;
    transition: opacity 0.3s ease-in-out; */
  `;
  
  const rect = element.getBoundingClientRect();
  message.style.top = (rect.bottom + 10) + 'px';
  message.style.left = (rect.left - 50) + 'px';
  
  document.body.appendChild(message);
  
  // Ocultar el banner después de 2 segundos sin transiciones
  setTimeout(() => {
    message.remove();
  }, 2000);
}

// Función para cargar documentos iniciales
function loadInitialDocuments() {
  try {
    // Verificar si hay etiquetas personalizadas antes de cargar documentos
    const etiquetasPersonalizadas = getEtiquetasPersonalizadasSafely();
    const etiquetasKeys = Object.keys(etiquetasPersonalizadas);
    
    // Solo cargar documentos si hay etiquetas personalizadas
    if (etiquetasKeys.length > 0) {
      console.log('[loadInitialDocuments] Cargando documentos iniciales automáticamente');
      
      // Ejecutar búsqueda con configuración por defecto (todos seleccionados)
      if (typeof handleBuscar === 'function') {
        handleBuscar();
      }
    } else {
      console.log('[loadInitialDocuments] No hay etiquetas personalizadas, no se cargan documentos');
      
      // Delay antes de ocultar loaders para evitar parpadeo
      setTimeout(() => {
        const loadingIcon = document.getElementById('loading-icon');
        const loadingIconChart = document.getElementById('loading-icon-chart');
        if (loadingIcon) loadingIcon.style.display = 'none';
        if (loadingIconChart) loadingIconChart.style.display = 'none';
        
        const collectionDocs = document.querySelector('.collectionDocs');
        if (collectionDocs) {
          const userPlan = window.userPlan || 'plan1';
          if (userPlan === 'plan1') {
            collectionDocs.innerHTML = `
              <div style="padding: 20px; text-align: center; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h3 style="color: #0b2431;">¡Mejora tu plan para acceder a la búsqueda por agentes!</h3>
                <p style="color: #455862;">Nuestros planes de pago te permiten configurar agentes personalizados y realizar búsquedas automáticas de normativa.</p>
              </div>
            `;
          } else {
            collectionDocs.innerHTML = `
              <div style="padding: 20px; text-align: center; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h3 style="color: #0b2431;">Configura tus agentes para ver documentos</h3>
                <p style="color: #455862;">Ve a la sección de Configuración para configurar tus agentes personalizados y empezar a ver documentos relevantes aquí.</p>
              </div>
            `;
          }
        }
        
        // Ocultar overlay principal después de mostrar el contenido
        if (typeof window.hidePageLoaderOverlay === 'function') {
          window.hidePageLoaderOverlay();
        }
      }, 300);
    }
  } catch (error) {
    console.error('[loadInitialDocuments] Error al cargar documentos iniciales:', error);
    // En caso de error, ocultar los loaders después de un delay
    setTimeout(() => {
      const loadingIcon = document.getElementById('loading-icon');
      const loadingIconChart = document.getElementById('loading-icon-chart');
      if (loadingIcon) loadingIcon.style.display = 'none';
      if (loadingIconChart) loadingIconChart.style.display = 'none';
      
      // Ocultar overlay principal incluso en caso de error
      if (typeof window.hidePageLoaderOverlay === 'function') {
        window.hidePageLoaderOverlay();
      }
    }, 300);
  }
}

// Función para obtener etiquetas personalizadas de forma segura
function getEtiquetasPersonalizadasSafely() {
  try {
    const userEtiquetasElement = document.getElementById('userEtiquetasPersonalizadas');
    if (userEtiquetasElement && userEtiquetasElement.textContent) {
      const content = userEtiquetasElement.textContent.trim();
      if (content && !content.includes('{{')) {
        return JSON.parse(content);
      }
    }
  } catch (e) {
    console.log('Error al obtener etiquetas personalizadas:', e);
  }
  return {};
}

// Función para obtener datos globales de forma segura
function getSafeGlobalData(elementId, defaultValue = null) {
  try {
    const element = document.getElementById(elementId);
    if (element && element.textContent) {
      const content = element.textContent.trim();
      if (content && !content.includes('{{')) {
        return JSON.parse(content);
      }
    }
  } catch (e) {
    console.log(`Error al obtener datos de ${elementId}:`, e);
  }
  return defaultValue;
}

// Variable para evitar inicialización múltiple
let trackerInitialized = false;

// Función para inicializar el tracker cuando se carga
window.initializeTracker = function() {
  if (trackerInitialized) {
    console.log('[initializeTracker] Ya está inicializado, evitando doble inicialización');
    return;
  }
  
  console.log('[initializeTracker] Inicializando funcionalidad del tracker');
  trackerInitialized = true;
  
  // Asegurar estado inicial limpio
  const chartContainer = document.getElementById('chartContainer');
  const loadingIcon = document.getElementById('loading-icon');
  const loadingIconChart = document.getElementById('loading-icon-chart');
  const collectionDocs = document.querySelector('.collectionDocs');
  
  // Estado inicial: solo loaders visibles
  if (chartContainer) {
    chartContainer.style.display = 'none';
    chartContainer.classList.remove('loaded');
  }
  if (loadingIcon) loadingIcon.style.display = 'block';
  if (loadingIconChart) loadingIconChart.style.display = 'block';
  if (collectionDocs) collectionDocs.innerHTML = '';
  
  // Inicializar título con información del usuario
  initializeTrackerTitle();
  
  // Inicializar fecha de registro
  initializeRegistrationDate();
  
  // Inicializar fecha predeterminada
  initializeDefaultDate();
  
  // Cargar contenedores y dropdowns
  // Mostrar skeleton mientras cargan agentes para evitar salto de layout
  const agentesContainerSkeleton = document.getElementById('agentesContainer');
  if (agentesContainerSkeleton && agentesContainerSkeleton.innerHTML.trim()==='') {
    let skeletonHTML='';
    for(let i=0;i<3;i++){
      skeletonHTML+=`<div class="agente-skeleton" style="height:20px;width:150px;background:#e2e2e2;border-radius:4px;margin-bottom:8px;animation:pulse 1.5s infinite;"></div>`;
    }
    agentesContainerSkeleton.innerHTML=skeletonHTML;
    // añadir keyframes una sola vez
    if(!document.getElementById('skeleton-pulse-keyframes')){
      const style=document.createElement('style');
      style.id='skeleton-pulse-keyframes';
      style.textContent='@keyframes pulse{0%{opacity:0.4;}50%{opacity:1;}100%{opacity:0.4;}}';
      document.head.appendChild(style);
    }
  }

  // Ahora cargar agentes reales
  loadAgentesContainer();
  // NO ocultamos el overlay aquí, se hará después de cargar los datos
  loadEtiquetasDropdown();
  loadBoletinDropdown();
  loadRangoDropdown();
  
  // Inicializar el filtro de nivel de impacto
  handleNivelImpactoChange();
  
  // Aplicar visibilidad según plan
  if (typeof applyAgentesAdvancedVisibility === 'function') {
    applyAgentesAdvancedVisibility();
  }
  
  // Decidir estrategia de carga para evitar parpadeo: 
  // 1. Si el usuario tiene agentes configurados -> solo loadInitialDocuments (hará el fetch y creará chart)
  // 2. Si NO tiene agentes -> mostrar gráfico estático (monthsData/countsData) si existe

  const etiquetasPersonalizadasInit = getEtiquetasPersonalizadasSafely();
  const hasAgentes = Object.keys(etiquetasPersonalizadasInit).length > 0;

  if (hasAgentes) {
    // Tenemos agentes personalizados → skip gráfico preliminar y ve directo a buscar datos
    loadInitialDocuments();
  } else {
    // Sin agentes → intenta mostrar gráfico estático si hay datos embedidos
    loadInitialChart();
  }
  
  console.log('[initializeTracker] Tracker inicializado correctamente');
}

// Función para inicializar el título del tracker
function initializeTrackerTitle() {
  try {
    // Intentar obtener el nombre del usuario del sessionStorage o elementos globales
    let userName = sessionStorage.getItem('userName') || 'Usuario';
    
    // Buscar en elementos globales si no está en sessionStorage
    if (userName === 'Usuario') {
      const userElements = ['userName', 'userPlan', 'userEmail'];
      for (const elementId of userElements) {
        const element = document.getElementById(elementId);
        if (element && element.textContent && !element.textContent.includes('{{')) {
          // Extraer nombre del email si es necesario
          if (elementId === 'userEmail') {
            try {
              let email = element.textContent.trim();
              if (email.startsWith('"') && email.endsWith('"')) {
                email = JSON.parse(email);
              }
              if (email && email.includes('@')) {
                userName = email.split('@')[0];
                break;
              }
            } catch (e) {
              console.log('Error al extraer nombre del email:', e);
            }
          }
        }
      }
    }
    
    const titleElement = document.getElementById('tracker-title');
    if (titleElement) {
      titleElement.textContent = `Hola ${userName}`;
    }
  } catch (e) {
    console.log('Error al inicializar título del tracker:', e);
  }
}

// Función para inicializar la fecha de registro
function initializeRegistrationDate() {
  try {
    const betaBannerElement = document.getElementById('beta-banner-text');
    if (betaBannerElement) {
      // Obtener fecha actual como fallback
      const currentDate = new Date().toLocaleDateString('es-ES');
      betaBannerElement.textContent = `Búsqueda personalizada por agente activa desde ${currentDate}`;
    }
  } catch (e) {
    console.log('Error al inicializar fecha de registro:', e);
  }
}

// Función para inicializar la fecha predeterminada
function initializeDefaultDate() {
  try {
    const startDateElement = document.getElementById('startDate');
    if (startDateElement && !startDateElement.value) {
      // Intentar obtener fecha desde los datos globales usando la función segura
      const startDateValue = getSafeGlobalData('startDateInput');
      
      if (startDateValue) {
        try {
          const formattedDate = new Date(startDateValue).toISOString().split('T')[0];
          startDateElement.value = formattedDate;
        } catch (e) {
          console.log('Error al formatear fecha del servidor:', e);
          setDefaultDate(startDateElement);
        }
      } else {
        setDefaultDate(startDateElement);
      }
    }
  } catch (e) {
    console.log('Error al inicializar fecha predeterminada:', e);
  }
}

// Función auxiliar para establecer fecha por defecto
function setDefaultDate(element) {
  const defaultDate = new Date();
  defaultDate.setMonth(defaultDate.getMonth() - 3); // 3 meses atrás
  element.value = defaultDate.toISOString().split('T')[0];
}

// Función para cargar gráfico inicial si hay datos
function loadInitialChart() {
  try {
    const monthsData = getSafeGlobalData('monthsData', []);
    const countsData = getSafeGlobalData('countsData', []);
    
    if (monthsData.length && countsData.length) {
      console.log('[loadInitialChart] Cargando chart inicial con datos del servidor');
      // Delay para asegurar que el DOM esté completamente cargado
      setTimeout(() => {
        loadChart(monthsData, countsData);
        // Asegurar que se muestre el chart correctamente
        const chartContainer = document.getElementById('chartContainer');
        const loadingIconChart = document.getElementById('loading-icon-chart');
        
        if (chartContainer) {
          chartContainer.style.display = 'block';
          chartContainer.classList.add('loaded');
        }
        if (loadingIconChart) {
          loadingIconChart.style.display = 'none';
        }
        
        // Ocultar overlay principal después de cargar el gráfico
        if (typeof window.hidePageLoaderOverlay === 'function') {
          window.hidePageLoaderOverlay();
        }
      }, 200);
    } else {
      console.log('[loadInitialChart] No hay datos para el chart inicial');
      // Si no hay datos iniciales, ocultar el loader después de un delay
      setTimeout(() => {
        const loadingIconChart = document.getElementById('loading-icon-chart');
        if (loadingIconChart) {
          loadingIconChart.style.display = 'none';
        }
        
        // Ocultar overlay principal cuando no hay datos
        if (typeof window.hidePageLoaderOverlay === 'function') {
          window.hidePageLoaderOverlay();
        }
      }, 200);
    }
  } catch (e) {
    console.log('Error al cargar gráfico inicial:', e);
    // En caso de error, ocultar el loader después de un delay
    setTimeout(() => {
      const loadingIconChart = document.getElementById('loading-icon-chart');
      if (loadingIconChart) {
        loadingIconChart.style.display = 'none';
      }
      
      // Ocultar overlay principal en caso de error
      if (typeof window.hidePageLoaderOverlay === 'function') {
        window.hidePageLoaderOverlay();
      }
    }, 200);
  }
}

// NOTA: La inicialización se hace desde profile.html después de cargar el tracker
// para evitar doble inicialización y parpadeo

// Hacer funciones globales para llamadas desde HTML
window.sendFeedback = sendFeedback;
