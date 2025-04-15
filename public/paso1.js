async function cargarYGuardarCatalogo() {
  try {
    const respuesta = await fetch('catalogo_etiquetas.json');
    const catalogo = await respuesta.json();
    sessionStorage.setItem('catalogoEtiquetas', JSON.stringify(catalogo));
  } catch (error) {
    console.error('Error al cargar el catálogo:', error);
  }
}

document.addEventListener('DOMContentLoaded', cargarYGuardarCatalogo);
document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('onboardingForm');
  const perfilRegulatorio = document.getElementById('perfil_regulatorio');
  const perfilEmpresasReguladas = document.getElementById('perfil_empresas_reguladas');
  const perfilAbogadoEmpresa = document.getElementById('perfil_abogado_empresa');
  const perfilAbogado = document.getElementById('perfil_abogado');
  const perfilOtro = document.getElementById('perfil_otro');
  
  const especializacionField = document.getElementById('especializacion_field');
  const otroPerfilField = document.getElementById('otro_perfil_field');

  // Mostrar/ocultar campos condicionales
  function toggleConditionalFields() {
      // Mostrar campo de especialización para perfiles que lo requieren
      especializacionField.style.display = 
          (perfilRegulatorio.checked || 
           perfilEmpresasReguladas.checked || 
           perfilAbogadoEmpresa.checked || 
           perfilAbogado.checked) ? 'block' : 'none';
      
      // Mostrar campo de otro perfil cuando se selecciona "Otro"
      otroPerfilField.style.display = perfilOtro.checked ? 'block' : 'none';

      // Actualizar el placeholder según el perfil seleccionado
const especializacionInput = document.getElementById('especializacion');
if (especializacionInput) {
  if (perfilRegulatorio.checked) {
    especializacionInput.placeholder = "Indica tu tipo de entidad (Agencia de Valores, Entidad de Crédito...)";
  } else if (perfilEmpresasReguladas.checked) {
    especializacionInput.placeholder = "Indica tu sector regulado (farmaceútico, energía, construcción...)";
  } else if (perfilAbogadoEmpresa.checked) {
    especializacionInput.placeholder = "Indica si tu despacho está especializado en un sector o cubre diversos servicios";
  } else if (perfilAbogado.checked) {
    especializacionInput.placeholder = "Indica tu especialización jurídica (urbanismo, fiscal, M&A...)";
  } else {
    especializacionInput.placeholder = "Indica el perfil que aplique (empresario,opositor, notario...)";
  }
}

const area_interes = document.getElementById('area_interes');
if (area_interes) {
  if (perfilRegulatorio.checked) {
    area_interes.placeholder = `Ej: Fondo de inversión especializado en Non-Performing Loans (NPL), con especial interés en:
- Crédito Hipotecario
- Morosidad
- Consumidor vulnerable...`;
  } else if (perfilEmpresasReguladas.checked) {
    area_interes.placeholder = `Ej: Empresa energética regulada, con especial interés en:
- Legislación sobre energías renovables
- Mercado eléctrico mayorista
- Subvenciones y ayudas estatales
- Límites de emisiones de CO₂...`;
  } else if (perfilAbogadoEmpresa.checked) {
    area_interes.placeholder =`Ej: Clasificación normativa en base a departamentos:
- Aribitraje y Litigación Internacional
- Digital, Tecnología y Telecomunicaciones
- Financiero y Bancario
- Inmobiliario y Urbanismo...`;
  } else if (perfilAbogado.checked) {
    area_interes.placeholder = `Ej: Abogado especializado en mercados de valores, con especial interés en:
     - Ofertas Públicas de Adquisición (OPAs)
     - Titulización de activos
     - Procedimientos sancionadores de la CNMV...`;
  } else {
    area_interes.placeholder = `Ej: Asesoría enfocada en subvenciones agrarias, con especial interés en:
- Normativa de la PAC (Política Agraria Común)
- Gestión y tramitación de ayudas estatales
- Reglamentos de producción ecológica...`;
  }
}

  }


  // Agregar event listeners para todos los perfiles
  perfilRegulatorio.addEventListener('change', toggleConditionalFields);
  perfilEmpresasReguladas.addEventListener('change', toggleConditionalFields);
  perfilAbogadoEmpresa.addEventListener('change', toggleConditionalFields);
  perfilAbogado.addEventListener('change', toggleConditionalFields);
  perfilOtro.addEventListener('change', toggleConditionalFields);

  // Inicializar estado de campos condicionales
  toggleConditionalFields();

  // Manejo del envío del formulario
  form.addEventListener('submit', function(event) {
      event.preventDefault();
      
      // Validación adicional para perfiles que requieren especialización
      if ((perfilRegulatorio.checked || 
           perfilEmpresasReguladas.checked || 
           perfilAbogadoEmpresa.checked || 
           perfilAbogado.checked) && 
          document.getElementById('especializacion').value.trim() === '') {
          alert('Por favor, indica los ámbitos en los que trabajas');
          document.getElementById('especializacion').focus();
          return;
      }
      
      // Validación para otro perfil
      if (perfilOtro.checked && document.getElementById('otro_perfil').value.trim() === '') {
          alert('Por favor, especifica tu perfil');
          document.getElementById('otro_perfil').focus();
          return;
      }

      const formData = new FormData(form);
      const userData = {};
      
      // Convertir FormData a objeto
      for (let [key, value] of formData.entries()) {
          if (key.endsWith('[]')) {
              // Manejar arrays (checkboxes múltiples)
              const arrayKey = key.slice(0, -2);
              if (!userData[arrayKey]) {
                  userData[arrayKey] = [];
              }
              userData[arrayKey].push(value);
          } else {
              userData[key] = value;
          }
      }

      // Asegurar que los campos condicionales se incluyan en userData
      if ((perfilRegulatorio.checked || 
           perfilEmpresasReguladas.checked || 
           perfilAbogadoEmpresa.checked || 
           perfilAbogado.checked) && 
          document.getElementById('especializacion')) {
          userData.especializacion = document.getElementById('especializacion').value.trim();
      }
      
      if (perfilOtro.checked && document.getElementById('otro_perfil')) {
          userData.otro_perfil = document.getElementById('otro_perfil').value.trim();
      }
      
      console.log('Datos del usuario:', userData);
      // Guardar datos en sessionStorage
      sessionStorage.setItem('userData', JSON.stringify(userData));
      // Redirigir a paso2.html
      window.location.href = 'paso2.html';
          
      
  });
});

// Función para procesar los datos del formulario y enviarlos a la API
async function procesarDatosUsuario(userData) {
    // Mostrar indicador de carga
    const btnSiguiente = document.querySelector('.btn-siguiente');
    btnSiguiente.disabled = true;
    btnSiguiente.textContent = 'Procesando...';
    
    try {
      // Preparar el contexto para el modelo
      const contexto = prepararContexto(userData);
      
      // Llamada a la API de Perplexity
      const respuesta = await fetch('https://api.perplexity.ai/sonar/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer TU_API_KEY'
        },
        body: JSON.stringify({
          model: 'sonar-medium-online',
          input: contexto,
          options: {
            etiquetas_disponibles: CATALOGO_ETIQUETAS,
            perfil_usuario: userData
          }
        })
      });
      
      if (!respuesta.ok) {
        throw new Error('Error en la llamada a la API');
      }
      
      const resultado = await respuesta.json();
      
      // Guardar las etiquetas recomendadas en localStorage o sessionStorage
      guardarEtiquetasRecomendadas(resultado.etiquetas);
      
      // Redirigir al paso 3
      window.location.href = 'paso3.html';
      
    } catch (error) {
      console.error('Error:', error);
      alert('Ha ocurrido un error al procesar tus datos. Por favor, inténtalo de nuevo.');
      
      btnSiguiente.disabled = false;
      btnSiguiente.textContent = 'Siguiente';
    }
  }
  
  // Función para preparar el contexto para el modelo
  function prepararContexto(userData) {
    // Construir un prompt detallado para el modelo
    return `
      Eres un asistente especializado en derecho y cumplimiento normativo.
      
      Información del usuario:
      - Nombre: ${userData.nombre}
      - Cargo: ${userData.cargo}
      - Web de empresa: ${userData.webEmpresa}
      - LinkedIn: ${userData.linkedin || 'No proporcionado'}
      - Perfiles profesionales: ${userData.perfil.join(', ')}
      ${userData.especializacion ? `- Especialización: ${userData.especializacion}` : ''}
      ${userData.otro_perfil ? `- Otro perfil: ${userData.otro_perfil}` : ''}
      
      Fuentes legales seleccionadas:
      ${userData.fuentes ? userData.fuentes.join(', ') : 'Ninguna seleccionada'}
      
      Reguladores seleccionados:
      ${userData.reguladores ? userData.reguladores.join(', ') : 'Ninguno seleccionado'}
      
      Basándote en esta información, selecciona las etiquetas más relevantes para este usuario de las siguientes categorías:
      1. Industrias relevantes
      2. Sub industrias específicas
      3. Ramas jurídicas principales
      4. Subramas jurídicas específicas
      5. Rangos normativos de interés
      
      Proporciona solo las etiquetas más relevantes, máximo 15
    `;
  }
  
  // Catálogo de etiquetas disponibles (ejemplo simplificado)
  /*
  const CATALOGO_ETIQUETAS = {
    industrias: [
      "Tecnología", "Financiero", "Energía", "Salud", "Telecomunicaciones",
      "Transporte", "Construcción", "Alimentación", "Retail", "Seguros"
      // ... más industrias
    ],
    ramas_juridicas: [
      "Fiscal", "Laboral", "Mercantil", "Administrativo", "Civil",
      "Penal", "Tecnológico", "Medioambiental", "Propiedad Intelectual"
      // ... más ramas
    ],
    subramas_juridicas: {
      "Fiscal": ["IVA", "IS", "IRNR", "Tributación internacional", "Precios de transferencia"],
      "Laboral": ["Contratación", "Despidos", "Seguridad Social", "Negociación colectiva"],
      // ... más subramas para cada rama
    },
    rangos_normativos: [
      "Leyes", "Reglamentos", "Directivas UE", "Reglamentos UE", "Decisiones",
      "Jurisprudencia", "Consultas vinculantes", "Subvenciones"
    ]
  };
  */
  // Función para guardar las etiquetas recomendadas
  function guardarEtiquetasRecomendadas(etiquetas) {
    sessionStorage.setItem('etiquetasRecomendadas', JSON.stringify(etiquetas));
  }

