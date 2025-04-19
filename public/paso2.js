document.addEventListener('DOMContentLoaded', function() {
    // Recuperar datos del usuario
    const userData = JSON.parse(sessionStorage.getItem('userData'));
    
    if (!userData) {
      window.location.href = 'paso1.html';
      return;
    }
    
    // Llamar a la API real
    conectarConPerplexity(userData);
  });
  
  async function getApiKey() {
    const response = await fetch('/api-key');
    const data = await response.json();
    return data.apiKey;
  }
 
  async function conectarConPerplexity(userData) {
    const API_KEY = await getApiKey();
    const API_URL = 'https://api.perplexity.ai/chat/completions';
  
    console.log("🔄 Iniciando conexión con API Perplexity");
    console.log(API_KEY);
  
    try {
      // Construir el prompt con el contexto enriquecido del usuario
      const prompt = await construirPromptEnriquecido(userData);
      console.log("📤 Enviando datos a la API:", userData);
  
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            {
              role: 'system',
              content: 'Eres un asistente especializado en derecho y cumplimiento normativo que ayuda a recomendar etiquetas relevantes para profesionales legales.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 1000
        })
      });
  
      if (!response.ok) {
        throw new Error(`Error en la API: ${response.status}`);
      }
  
      const data = await response.json();
      console.log("📥 Respuesta recibida:", data);
  
      // Procesar la respuesta para extraer las etiquetas recomendadas
      const etiquetas = procesarRespuestaIA(data);
      console.log("✅ Etiquetas extraídas:", etiquetas);
  
      // Guardar las etiquetas en sessionStorage para el paso 3
      sessionStorage.setItem('etiquetasRecomendadas', JSON.stringify(etiquetas));
  
      // Redirigir directamente al paso3 sin mostrar la respuesta en pantalla
      window.location.href = 'paso3.html';
  
    } catch (error) {
      console.error("❌ Error detallado:", error);
      document.querySelector('.procesando-info').textContent = 
        'Ha ocurrido un error. Intentando de nuevo...';
  
      const etiquetasDefault = {
        industrias: ["Tecnología", "Financiero"],
        ramas_juridicas: ["Mercantil", "Administrativo"],
        subramas_juridicas: ["General"],
        rangos_normativos: ["Leyes", "Reglamentos"]
      };
  
      sessionStorage.setItem('etiquetasRecomendadas', JSON.stringify(etiquetasDefault));
  
      // En caso de error, se muestra un botón para continuar manualmente
      const btnContinuar = document.getElementById('btn-continuar');
      btnContinuar.style.display = 'block';
      btnContinuar.addEventListener('click', function() {
        window.location.href = 'paso3.html';
      });
    }
  }
  
 
  // Cargar el contexto desde un archivo JSON
  async function cargarContexto() {
    try {
      const respuesta = await fetch('contexto_clientes.json');
      return await respuesta.json();
    } catch (error) {
      console.error('Error al cargar el contexto:', error);
      return { entrevistas: [], ejemplos: [] };
    }
  }
  async function construirPromptEnriquecido(userData) {
    // 1. Cargar el contexto adicional (que incluye ejemplos y entrevistas)
    const contexto = await cargarContexto();
  
    // 2. Cargar el catálogo de etiquetas predefinidas (rangos e industrias)
    let catalogoEtiquetas;
    try {
      const respuestaCatalogo = await fetch('catalogo_etiquetas.json');
      catalogoEtiquetas = await respuestaCatalogo.json();
    } catch (error) {
      console.error('Error al cargar el catálogo de etiquetas:', error);
      catalogoEtiquetas = {
        industrias: [],
        sub_industrias: {},
        ramas_juridicas: [],
        subramas_juridicas: {},
        rangos_normativos: []
      };
    }
  
    // 3. Cargar la plantilla de ejemplos personalizados (etiquetas jurídicas de ejemplo según perfil)
    let ejemplosPersonalizados;
    try {
      const respuestaEjemplos = await fetch('ejemplos_personalizadas.json');
      ejemplosPersonalizados = await respuestaEjemplos.json();
    } catch (error) {
      console.error('Error al cargar ejemplos personalizados:', error);
      ejemplosPersonalizados = {};
    }
  
    // 4. Encontrar ejemplos relevantes basados en el perfil del usuario (si tienes funciones auxiliares, aplícalas)
    const ejemplosRelevantes = seleccionarEjemplosRelevantes(contexto.ejemplos, userData);
    const entrevistasRelevantes = seleccionarEntrevistasRelevantes(contexto.entrevistas, userData);
  
    // 5. Preparar los rangos normativos en un texto que la IA use como lista cerrada
    const rangosNormativosCatalogo = catalogoEtiquetas.rangos_normativos.join("\n- ");
  
    // 6. Buscar dentro de “ejemplosPersonalizados” la sección que coincida con el perfil del usuario
    //    Suponiendo que “ejemplosPersonalizados” tiene un objeto con claves por perfil, e.g. "abogado_empresa", "empresa_regulada", etc.
    let ejemploPerfil = "";
    if (userData.perfil && userData.perfil.length > 0) {
      // Tomar el primer perfil como referencia o combinar lógicas si hay varios
      const perfilPrincipal = userData.perfil[0];
      if (ejemplosPersonalizados[perfilPrincipal]) {
        ejemploPerfil = JSON.stringify(ejemplosPersonalizados[perfilPrincipal], null, 2);
      }
    }
  
    // 7. Construir el prompt con la nueva sección que muestra el ejemplo personalizado
    return `
   INSTRUCCIÓN PRINCIPAL: Generar un listado de etiquetas jurídicas junto a sus definiciones para clasificar documentos legales según los intereses de “userData”Eres un experto jurídico en derecho español, tu respuestas serán especificas para legislación nacional española y europea.

TAREAS:
1. ETIQUETAS PERSONALIZADAS:
   - Basándote en la información de userData (perfil, especialización, áreas de interés) y en la siguiente plantilla de ejemplos para su perfil:
     ${ejemploPerfil || "No se encontraron ejemplos personalizados para el perfil indicado."}
   - Genera hasta 15 etiquetas que ayuden a clasificar documentos legales y cumplan TODAS estas reglas:
     • En los casos en que la etiqueta sea muy general, ajusta al área jurídica al sector o actividad del usuario, pero asegurate que en la definicion se incluyen tanto disposiciones generales como específicas que afecten al usuario.  
       Ej.: «Riesgos legales para un fondo de inversión» (no genérico «Riesgos Legales»).  
     • No incluyas referencias a fuentes, boletines ni jurisdicciones (BOE, DOUE, UE, etc.).   

2. RANGOS (CATÁLOGO CERRADO):
   - Selecciona únicamente de la lista oficial:
     - ${rangosNormativosCatalogo}
   - Máximo 5 rangos. No inventes ni modifiques.

INFORMACIÓN DEL USUARIO:
Nombre: ${userData.nombre || 'N/D'}
Perfiles profesionales: ${userData.perfil ? userData.perfil.join(', ') : 'No especificado'}
${userData.especializacion ? `Especialización: ${userData.especializacion}` : ''}
${userData.otro_perfil ? `Otro perfil: ${userData.otro_perfil}` : ''}
Área de interés: ${userData.area_interes || 'No especificada'}
Fuentes legales: ${userData.fuentes ? userData.fuentes.join(', ') : 'Ninguna seleccionada'}
Reguladores: ${userData.reguladores ? userData.reguladores.join(', ') : 'Ninguno seleccionado'}

 Ten en cuenta:
    - Para las “etiquetas_personalizadas”, inspírate en la plantilla de ejemplos (más la información del usuario) sin limitarte al catálogo.
    - Para los “rangos_normativos”, no se puede salir del catálogo ni proponer nuevas entradas.
    - Ajusta la definición de cada etiqueta personalizada al ámbito o áreas de interés del usuario.

OBJETIVO DE SALIDA:
Devolver SOLO un objeto JSON con la siguiente estructura exacta (sin explicaciones):
{
  "etiquetas_personalizadas": {
    "etiqueta1": "definicion1",
    "etiqueta2": "definicion2",
    ...
  },
  "rangos_normativos": ["Rango1", "Rango2", ...]
}

LÍMITES:
- Hasta 15 etiquetas personalizadas
- Hasta 5 rangos normativos

No incluyas texto adicional fuera del objeto JSON.
    `;
  }
   
  
  // Reemplazar la función procesarRespuestaIA actual (aproximadamente línea 150) con:
function procesarRespuestaIA(data) {
  try {
    // Extraer el contenido de la respuesta
    const respuestaTexto = data.choices[0].message.content;
    
    // Buscar el JSON en la respuesta
    const jsonMatch = respuestaTexto.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      // Parsear el JSON encontrado
      const etiquetas = JSON.parse(jsonMatch[0]);
      
      // Asegurarse de que la estructura tenga los campos necesarios
      if (!etiquetas.rangos_normativos) {
        etiquetas.rangos_normativos = [];
      }
      
      if (!etiquetas.etiquetas_personalizadas) {
        etiquetas.etiquetas_personalizadas = {};
      }
      
      return etiquetas;
    } else {
      // Si no se encuentra un JSON válido, crear una estructura por defecto
      console.warn('No se pudo extraer JSON de la respuesta. Usando valores por defecto.');
      return {
        etiquetas_personalizadas: {
          "Error, foco legal no encontrada": "Intenta de nuevo o contacta con nuestro equipo de soporte para solucionarlo"
        },
        rangos_normativos: ["Error, intente de nuevo"],
      };
    }
  } catch (error) {
    console.error('Error al procesar la respuesta:', error);
    // Devolver estructura por defecto en caso de error
    return {
      etiquetas_personalizadas: {
        "Error, foco legal no encontrado": "Intenta de nuevo o contacta con nuestro equipo de soporte para solucionarlo"
      },
      rangos_normativos: ["Error, intente de nuevo"]
    };
  }
}

  
// Seleccionar ejemplos relevantes para el usuario
function seleccionarEjemplosRelevantes(ejemplos, userData) {
  return ejemplos.filter(ejemplo => {
    // Filtrar por perfil profesional
    if (userData.perfil && userData.perfil.includes(ejemplo.perfil)) return true;
    
    // Filtrar por especialización si existe
    if (userData.especializacion && 
        ejemplo.especializacion && 
        userData.especializacion.toLowerCase().includes(ejemplo.especializacion.toLowerCase())) {
      return true;
    }
    
    return false;
  }).slice(0, 3); // Limitar a 3 ejemplos para no sobrecargar el prompt
}

// Función para entrevistas
function seleccionarEntrevistasRelevantes(entrevistas, userData) {
  return entrevistas.filter(entrevista => {
    // Filtrar por perfil profesional
    if (userData.perfil && userData.perfil.includes(entrevista.perfil)) return true;

    // Filtrar por industria (manejar cadenas, arreglos o valores ausentes)
    if (entrevista.industria) {
      if (typeof entrevista.industria === 'string') {
        // Si es una cadena, comparar con el nombre de la empresa del usuario
        if (userData.webEmpresa && userData.webEmpresa.toLowerCase().includes(entrevista.industria.toLowerCase())) {
          return true;
        }
      } else if (Array.isArray(entrevista.industria)) {
        // Si es un arreglo, verificar si alguna industria coincide
        return entrevista.industria.some(industria =>
          userData.webEmpresa && userData.webEmpresa.toLowerCase().includes(industria.toLowerCase())
        );
      }
    }

    return false;
  }).slice(0, 3); // Limitar a las 3 entrevistas más relevantes
}


  