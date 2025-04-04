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
    // Cargar el contexto adicional
    const contexto = await cargarContexto();
    // Cargar el catálogo de etiquetas predefinidas
    let catalogoEtiquetas;
    try {
      const respuestaCatalogo = await fetch('catalogo_etiquetas.json');
      catalogoEtiquetas = await respuestaCatalogo.json();
    } catch (error) {
      console.error('Error al cargar el catálogo de etiquetas:', error);
      catalogoEtiquetas = { industrias: [], sub_industrias: {}, ramas_juridicas: [], subramas_juridicas: {} };
    }
  
    // Encontrar ejemplos relevantes basados en el perfil del usuario
    const ejemplosRelevantes = seleccionarEjemplosRelevantes(contexto.ejemplos, userData);
    const entrevistasRelevantes = seleccionarEntrevistasRelevantes(contexto.entrevistas, userData);
  
    // Convertir los catálogos a texto para incluirlos en el prompt
    const industriasCatalogo = catalogoEtiquetas.industrias.join("\n- ");
    
    // Crear un texto con las subindustrias disponibles para cada industria
    let subindustriasPorIndustria = "";
    for (const industria in catalogoEtiquetas.sub_industrias) {
      subindustriasPorIndustria += `${industria}:\n- ${catalogoEtiquetas.sub_industrias[industria].join("\n- ")}\n\n`;
    }
    
    const ramasJuridicasCatalogo = catalogoEtiquetas.ramas_juridicas.join("\n- ");
    const rangosNormativosCatalogo = catalogoEtiquetas.rangos_normativos.join("\n- ");
  
    // Crear un texto con las subramas disponibles para cada rama
    let subramasPorRama = "";
    for (const rama in catalogoEtiquetas.subramas_juridicas) {
      subramasPorRama += `${rama}:\n- ${catalogoEtiquetas.subramas_juridicas[rama].join("\n- ")}\n\n`;
    }
  
    return `
  INSTRUCCIÓN PRINCIPAL: DEBES USAR EXCLUSIVAMENTE LAS ETIQUETAS LISTADAS EN ESTE PROMPT.... Eres un asistente especializado en derecho y cumplimiento normativo con acceso a un catálogo cerrado de etiquetas.
  
  REGLAS OBLIGATORIAS:
  1. SOLO puedes recomendar etiquetas que aparezcan EXACTAMENTE en las listas proporcionadas.
  2. NO puedes inventar, modificar o sugerir etiquetas que no estén en estas listas.
  3. Debes mantener la ortografía y capitalización exactas de las etiquetas proporcionadas.
  4. Si no encuentras etiquetas relevantes, elige las más cercanas del catálogo, pero NUNCA inventes nuevas.
  
  INFORMACIÓN DEL USUARIO:
  Nombre: ${userData.nombre}
  Cargo: ${userData.cargo}
  Web de empresa: ${userData.webEmpresa}
  LinkedIn: ${userData.linkedin || 'No proporcionado'}
  Perfiles profesionales: ${userData.perfil ? userData.perfil.join(', ') : 'No especificado'}
  ${userData.especializacion ? `Especialización: ${userData.especializacion}` : ''}
  ${userData.otro_perfil ? `Otro perfil: ${userData.otro_perfil}` : ''}
  Fuentes legales: ${userData.fuentes ? userData.fuentes.join(', ') : 'Ninguna seleccionada'}
  Reguladores: ${userData.reguladores ? userData.reguladores.join(', ') : 'Ninguno seleccionado'}
  
  CONTEXTO ADICIONAL:
  ${entrevistasRelevantes.map(e => `- ${e.resumen}`).join('\n')}
  ${ejemplosRelevantes.map(e => `- ${e.descripcion}`).join('\n')}
  
  CATÁLOGO CERRADO DE ETIQUETAS PERMITIDAS:
  
  INDUSTRIAS PERMITIDAS (selecciona SOLO de esta lista):
  - ${industriasCatalogo}
  
  SUBINDUSTRIAS PERMITIDAS POR INDUSTRIA (selecciona SOLO de estas listas):
  ${subindustriasPorIndustria}
  
  RAMAS JURÍDICAS PERMITIDAS (selecciona SOLO de esta lista):
  - ${ramasJuridicasCatalogo}
  
  SUBRAMAS JURÍDICAS PERMITIDAS POR RAMA (selecciona SOLO de estas listas):
  ${subramasPorRama}
  
  RANGOS NORMATIVOS PERMITIDOS (selecciona SOLO de esta lista):
  - ${rangosNormativosCatalogo}
  
  INSTRUCCIÓN FINAL:
  Basándote en la información del usuario, selecciona ÚNICAMENTE etiquetas de los catálogos proporcionados y devuelve un objeto JSON con la siguiente estructura exacta:
  
  {
  "industrias": ["Industria1", "Industria2", ...],
  "sub_industrias": {
    "Industria1": ["Subindustria1", "Subindustria2", ...],
    "Industria2": ["Subindustria3", "Subindustria4", ...]
  },
  "ramas_juridicas": ["Rama1", "Rama2", ...],
  "subramas_juridicas": {
    "Rama1": ["Subrama1", "Subrama2", ...],
    "Rama2": ["Subrama3", "Subrama4", ...]
  },
  "rangos_normativos": ["Rango1", "Rango2", ...]
  }
  
  LÍMITES:
  - Industrias: Máximo 5 de la lista proporcionada
  - Subindustrias: Máximo 3 por industria, solo de las listas proporcionadas para cada industria
  - Ramas jurídicas: Máximo 5 de la lista proporcionada
  - Subramas: Máximo 8 por rama, solo de las listas proporcionadas para cada rama
  - Rangos normativos: Máximo 5 de la lista proporcionada
  
  OBSERVACIONES:
  - Si el usuario es compliance officer o abogado en empresa, probablemente estará unicamente interesado en la industria correspondiente a su empresa, con un enfoque legal más transversal, incluyendo varias ramas jurídicas.
  - Si el usuario es abogado en despacho, es posible que maneje múltiples industrias de sus clientes y que esté más especializado en una o pocas ramas jurídicas.
  
  IMPORTANTE: Tu respuesta debe contener SOLO el objeto JSON, sin explicaciones adicionales.
  `;
  }  
  
  function procesarRespuestaIA(data) {
    try {
      // Cargar el catálogo de etiquetas
      let catalogoEtiquetas;
      try {
        // Intentar obtener el catálogo desde sessionStorage
        const catalogoString = sessionStorage.getItem('catalogoEtiquetas');
        if (catalogoString) {
          catalogoEtiquetas = JSON.parse(catalogoString);
        } else {
          // Si no está en sessionStorage, intentar cargarlo de manera asíncrona
          fetch('catalogo_etiquetas.json')
            .then(response => response.json())
            .then(catalogo => {
              sessionStorage.setItem('catalogoEtiquetas', JSON.stringify(catalogo));
              return catalogo;
            })
            .catch(error => {
              console.error('Error al cargar el catálogo:', error);
              return { industrias: [], sub_industrias: {}, ramas_juridicas: [], subramas_juridicas: {} };
            });
        }
      } catch (error) {
        console.error('Error al recuperar el catálogo:', error);
        // Valor por defecto si no se puede cargar
        catalogoEtiquetas = {
          industrias: [],
          sub_industrias: {},
          ramas_juridicas: [],
          subramas_juridicas: {}
        };
      }
  
      // Extraer el contenido de la respuesta
      const respuestaTexto = data.choices[0].message.content;
      
      // Buscar el JSON en la respuesta
      const jsonMatch = respuestaTexto.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        // Parsear el JSON encontrado
        const etiquetas = JSON.parse(jsonMatch[0]);
        
        // Filtrar industrias para que solo incluya las del catálogo
        if (etiquetas.industrias && catalogoEtiquetas.industrias) {
          etiquetas.industrias = etiquetas.industrias.filter(industria =>
            catalogoEtiquetas.industrias.includes(industria)
          );
        }
        
        // Filtrar subindustrias para cada industria
        if (!etiquetas.sub_industrias) {
          etiquetas.sub_industrias = {};
        }
        
        for (const industria in etiquetas.sub_industrias) {
          if (catalogoEtiquetas.sub_industrias && catalogoEtiquetas.sub_industrias[industria]) {
            etiquetas.sub_industrias[industria] = etiquetas.sub_industrias[industria].filter(
              subindustria => catalogoEtiquetas.sub_industrias[industria].includes(subindustria)
            );
          } else {
            // Si la industria no existe en el catálogo, eliminarla
            delete etiquetas.sub_industrias[industria];
          }
        }
  
        // Filtrar ramas jurídicas
        if (etiquetas.ramas_juridicas && catalogoEtiquetas.ramas_juridicas) {
          etiquetas.ramas_juridicas = etiquetas.ramas_juridicas.filter(rama =>
            catalogoEtiquetas.ramas_juridicas.includes(rama)
          );
        }
  
        // Asegurarse de que subramas_juridicas sea un objeto
        if (!etiquetas.subramas_juridicas) {
          etiquetas.subramas_juridicas = {};
        } else if (Array.isArray(etiquetas.subramas_juridicas)) {
          // Convertir de array a objeto si viene como array
          const subramasObj = {};
          etiquetas.ramas_juridicas.forEach(rama => {
            subramasObj[rama] = [];
          });
          etiquetas.subramas_juridicas = subramasObj;
        }
  
        // Filtrar subramas para cada rama
        for (const rama in etiquetas.subramas_juridicas) {
          if (catalogoEtiquetas.subramas_juridicas && catalogoEtiquetas.subramas_juridicas[rama]) {
            etiquetas.subramas_juridicas[rama] = etiquetas.subramas_juridicas[rama].filter(
              subrama => catalogoEtiquetas.subramas_juridicas[rama].includes(subrama)
            );
          } else {
            // Si la rama no existe en el catálogo, eliminarla
            delete etiquetas.subramas_juridicas[rama];
          }
        }
  
        return etiquetas;
      } else {
        // Si no se encuentra un JSON válido, crear una estructura por defecto
        console.warn('No se pudo extraer JSON de la respuesta. Usando valores por defecto.');
        return {
          industrias: ["General"],
          sub_industrias: {
            "General": ["General"]
          },
          ramas_juridicas: ["Derecho Mercantil", "Derecho Administrativo"],
          subramas_juridicas: {
            "Derecho Mercantil": ["genérico", "societario"],
            "Derecho Administrativo": ["genérico", "contratación pública"]
          },
          rangos_normativos: ["Legislativa", "Normativa Reglamentaria"],
        };
      }
    } catch (error) {
      console.error('Error al procesar la respuesta:', error);
      // Devolver estructura por defecto en caso de error
      return {
        industrias: ["General"],
        sub_industrias: {
          "General": ["General"]
        },
        ramas_juridicas: ["Derecho Mercantil"],
        subramas_juridicas: {"Derecho Mercantil": ["genérico"]},
        rangos_normativos: ["Legislativa"]
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


  