// ****** INICIO: OBTENER PLAN SELECCIONADO DE PASO 0 ******
const selectedPlan = sessionStorage.getItem('selectedPlan');
if (selectedPlan) {
    console.log('Plan recuperado de sessionStorage:', selectedPlan);
    // Puedes usar la variable 'selectedPlan' más adelante si es necesario
    // Por ejemplo, para mostrar información diferente en este paso
    // o para añadirla a los datos que se guardan al final.
}
// ****** FIN: OBTENER PLAN SELECCIONADO DE PASO 0 ******




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
  const perfilAbogadoDespacho = document.getElementById('perfil_abogado_despacho');
  const perfilEmpresasReguladas = document.getElementById('perfil_empresas_reguladas');
  const perfilOtro = document.getElementById('perfil_otro');
  
  const especializacionField = document.getElementById('especializacion_field');
  const otroPerfilField = document.getElementById('otro_perfil_field');
  
  // Button for showing examples
  const verEjemploBtn = document.getElementById('verEjemploBtn');
  
  // Store example placeholders for different profiles
  const examplePlaceholders = {
    abogado_despacho: `Ej: Abogado especializado en mercados de valores, con especial interés en:
     - Ofertas Públicas de Adquisición (OPAs)
     - Titulización de activos
     - Procedimientos sancionadores de la CNMV...`,
    abogado_empresa: `Ej: Empresa energética regulada, con especial interés en:
- Legislación sobre energías renovables
- Mercado eléctrico mayorista
- Subvenciones y ayudas estatales
- Límites de emisiones de CO₂...`,
    default: `Ej: Asesoría enfocada en subvenciones agrarias, con especial interés en:
- Normativa de la PAC (Política Agraria Común)
- Gestión y tramitación de ayudas estatales
- Reglamentos de producción ecológica...`
  };

  // ****** INICIO: NUEVOS ELEMENTOS PARA POLÍTICA DE PRIVACIDAD ******
  const privacyCheckbox = document.getElementById('privacyPolicy');
  const privacyPolicyLink = document.getElementById('privacyPolicyLink');
  const privacyModal = document.getElementById('privacyModal');
  const warningModal = document.getElementById('warningModal');
  const closePrivacyModal = document.getElementById('closePrivacyModal');
  const closeWarningModal = document.getElementById('closeWarningModal');
  // ****** FIN: NUEVOS ELEMENTOS PARA POLÍTICA DE PRIVACIDAD ******

  // Add event listener for the "Ver un ejemplo" button
  if (verEjemploBtn) {
    verEjemploBtn.addEventListener('click', function() {
      const area_interes = document.getElementById('area_interes');
      if (area_interes) {
        // Get the appropriate placeholder based on selected profile
        let placeholder = "";
        if (document.getElementById('perfil_abogado_despacho')?.checked) {
          placeholder = examplePlaceholders.abogado_despacho;
        } else if (document.getElementById('perfil_empresas_reguladas')?.checked) {
          placeholder = examplePlaceholders.abogado_empresa;
        } else {
          placeholder = examplePlaceholders.default;
        }
        // Set the placeholder
        area_interes.placeholder = placeholder;
      }
    });
  }

  // Mostrar/ocultar campos condicionales
  // Define toggleConditionalFields in the global scope
  window.toggleConditionalFields = function() {
      console.log("toggleConditionalFields called");
      // Log the status of the checkboxes
      console.log("Abogado despacho checked:", document.getElementById('perfil_abogado_despacho')?.checked);
      console.log("Abogado empresa checked:", document.getElementById('perfil_empresas_reguladas')?.checked);
      console.log("Otro checked:", perfilOtro?.checked);
      
      // Mostrar campo de especialización para perfiles que lo requieren
      if (especializacionField) {
        especializacionField.style.display = 
            (document.getElementById('perfil_abogado_despacho')?.checked || 
             document.getElementById('perfil_empresas_reguladas')?.checked || 
             perfilOtro?.checked) ? 'block' : 'none';
      }
      
      // Mostrar campo de otro perfil cuando se selecciona "Otro"
      if (otroPerfilField) {
        otroPerfilField.style.display = perfilOtro?.checked ? 'block' : 'none';
      }

      // Actualizar el placeholder según el perfil seleccionado
      const especializacionInput = document.getElementById('especializacion');
      if (especializacionInput) {
        if (document.getElementById('perfil_abogado_despacho')?.checked) {
          console.log("Setting placeholder for abogado despacho");
          especializacionInput.placeholder = "Indica tu área de especialización legal";
        } else if (document.getElementById('perfil_empresas_reguladas')?.checked) {
          console.log("Setting placeholder for abogado empresa");
          especializacionInput.placeholder = "Indica a qué tipo de empresa perteneces";
        } else {
          console.log("Setting default placeholder");
          especializacionInput.placeholder = "Indica el perfil que aplique (empresario, opositor, notario...)";
        }
      }

      // We don't set the area_interes placeholder here anymore
      // It will remain empty until the user clicks "Ver un ejemplo"
  };

  // Call toggleConditionalFields once at the beginning
  toggleConditionalFields();

  // Agregar event listeners para todos los perfiles with toggleConditionalFields
  if (document.getElementById('perfil_abogado_despacho')) {
    document.getElementById('perfil_abogado_despacho').addEventListener('change', toggleConditionalFields);
  }
  if (document.getElementById('perfil_empresas_reguladas')) {
    document.getElementById('perfil_empresas_reguladas').addEventListener('change', toggleConditionalFields);
  }
  if (perfilOtro) {
    perfilOtro.addEventListener('change', toggleConditionalFields);
  }

  // ****** INICIO: LÓGICA PARA MODALES ******
  // Abrir modal de política de privacidad
  if (privacyPolicyLink) {
    privacyPolicyLink.addEventListener('click', function() {
        if (privacyModal) privacyModal.style.display = 'block';
    });
  }

  // Cerrar modal de política de privacidad
  if (closePrivacyModal) {
    closePrivacyModal.addEventListener('click', function() {
        if (privacyModal) privacyModal.style.display = 'none';
    });
  }

  // Cerrar modal de advertencia
  if (closeWarningModal) {
    closeWarningModal.addEventListener('click', function() {
        if (warningModal) warningModal.style.display = 'none';
    });
  }

  // Cerrar modales si se hace clic fuera del contenido
  window.addEventListener('click', function(event) {
    if (event.target == privacyModal) {
        if (privacyModal) privacyModal.style.display = 'none';
    }
    if (event.target == warningModal) {
        if (warningModal) warningModal.style.display = 'none';
    }
  });
  // ****** FIN: LÓGICA PARA MODALES ******

  // Manejo del envío del formulario (modificado)
form.addEventListener('submit', function(event) {
  event.preventDefault(); // Prevenir siempre el envío por defecto para validar

  // ****** INICIO: VALIDACIÓN DE POLÍTICA DE PRIVACIDAD ******
  if (!privacyCheckbox || !privacyCheckbox.checked) {
      if (warningModal) warningModal.style.display = 'block'; // Mostrar modal de advertencia
      return; // Detener el proceso si no está aceptada
  }
  // ****** FIN: VALIDACIÓN DE POLÍTICA DE PRIVACIDAD ******
  
  // Validación adicional para perfiles (lógica existente)
 /* if ((document.getElementById('perfil_abogado_despacho').checked || 
       document.getElementById('perfil_empresas_reguladas').checked) && 
      document.getElementById('especializacion').value.trim() === '') {
      alert('Por favor, completa el campo de especialización');
      document.getElementById('especializacion').focus();
      return;
  }
  
  if (perfilOtro.checked && document.getElementById('otro_perfil').value.trim() === '') {
      alert('Por favor, especifica tu perfil');
      document.getElementById('otro_perfil').focus();
      return;
  }*/

  // Si todas las validaciones pasan, proceder con la lógica original
  const formData = new FormData(form);
  const userData = {};
  
  for (let [key, value] of formData.entries()) {
      if (key.endsWith('[]')) {
          const arrayKey = key.slice(0, -2);
          if (!userData[arrayKey]) {
              userData[arrayKey] = [];
          }
          userData[arrayKey].push(value);
      } else {
          // No incluir el checkbox de privacidad en los datos a guardar/enviar
          if (key !== 'privacyPolicy') {
             userData[key] = value;
          }
      }
  }

  if ((document.getElementById('perfil_abogado_despacho').checked || 
       document.getElementById('perfil_empresas_reguladas').checked) && 
      document.getElementById('especializacion')) {
      userData.especializacion = document.getElementById('especializacion').value.trim();
  }
  
  if (perfilOtro.checked && document.getElementById('otro_perfil')) {
      userData.otro_perfil = document.getElementById('otro_perfil').value.trim();
  }

    // ****** INICIO: AÑADIR PLAN A USERDATA ******
  if (selectedPlan) {
    userData.plan = selectedPlan; // Añade el plan al objeto de datos
  }
  // ****** FIN: AÑADIR PLAN A USERDATA ******

  
  console.log('Datos del usuario (sin política de privacidad):', userData);
  sessionStorage.setItem('userData', JSON.stringify(userData));
  window.location.href = 'paso2.html'; // Redirigir al siguiente paso
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

