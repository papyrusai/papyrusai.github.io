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
  const perfilEspecializado = document.getElementById('perfil_especializado');
  const perfilEspecializadoDespacho = document.getElementById('perfil_especializado');
  const especializacionField = document.getElementById('especializacion_field');
  const perfilOtro = document.getElementById('perfil_otro');
  const otroPerfilField = document.getElementById('otro_perfil_field');

  // Mostrar/ocultar campos condicionales
  function toggleConditionalFields() {
      especializacionField.style.display = perfilEspecializado.checked ? 'block' : 'none';
      especializacionField.style.display = perfilEspecializadoDespacho.checked ? 'block' : 'none';
      otroPerfilField.style.display = perfilOtro.checked ? 'block' : 'none';
  }

  perfilEspecializado.addEventListener('change', toggleConditionalFields);
  perfilOtro.addEventListener('change', toggleConditionalFields);

  // Inicializar estado de campos condicionales
  toggleConditionalFields();

  // Manejo del envío del formulario
  form.addEventListener('submit', function(event) {
      event.preventDefault();
      
      // Validación adicional
      if (perfilEspecializado.checked && document.getElementById('especializacion').value.trim() === '') {
          alert('Por favor, indica los ámbitos en los que trabajas');
          document.getElementById('especializacion').focus();
          return;
      }
      if (perfilEspecializadoDespacho.checked && document.getElementById('especializacion').value.trim() === '') {
        alert('Por favor, indica los ámbitos en los que trabajas');
        document.getElementById('especializacion').focus();
        return;
    }
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

          // Make sure these fields are included
      if (perfilEspecializado.checked && document.getElementById('especializacion')) {
        userData.especializacion = document.getElementById('especializacion').value.trim();
      }
      if (perfilEspecializadoDespacho.checked && document.getElementById('especializacion')) {
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
      
      Proporciona solo las etiquetas más relevantes, máximo 5 por categoría.
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
