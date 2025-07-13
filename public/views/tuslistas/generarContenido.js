   /*Índice del archivo:
   1. Funciones para la página de generación de contenido
   2. Funciones para la selección de documentos
   */
   
   
   // ==================== FUNCIONES PARA LA PÁGINA DE GENERACIÓN DE CONTENIDO ====================
    
   let currentListName = '';
    
   // Función para mostrar la página de generación de contenido
   function showGenerarContenidoPage(listName) {
     console.log(`[TusListas] Mostrando página de generación de contenido para: "${listName}"`);
     currentListName = listName;
     
     // Ocultar la sección de listas
     const listasSection = document.getElementById('tus-listas-main-view');
     if (listasSection) {
       listasSection.style.display = 'none';
       console.log('[TusListas] Sección de listas ocultada.');
     } else {
       console.error('[TusListas] No se encontró la sección de listas #tus-listas-main-view.');
     }
     
     // Mostrar la sección de generación de contenido
     const generarSection = document.getElementById('content-generar-contenido');
     if (generarSection) {
       generarSection.classList.add('active');
       generarSection.style.display = 'block';
       console.log('[TusListas] Sección de generación de contenido mostrada.');
     } else {
       console.error('[TusListas] No se encontró la sección de generación de contenido #content-generar-contenido.');
     }
     
     // Actualizar el título
     const titleElement = document.getElementById('generar-lista-title');
     if (titleElement) {
       titleElement.textContent = `Generar contenido - ${listName}`;
     }
     
     // Cargar los documentos de la lista
     loadDocumentosForGeneration(listName);
     
     // Cargar configuraciones guardadas
     loadSavedSettings(listName);
   }
   
   // Función para volver a la vista de listas
   function backToListas() {
     console.log('[TusListas] Volviendo a la vista de listas.');
     // Ocultar la sección de generación de contenido
     const generarSection = document.getElementById('content-generar-contenido');
     if (generarSection) {
       generarSection.classList.remove('active');
       generarSection.style.display = 'none';
     }
     
     // Mostrar la sección de listas
     const listasSection = document.getElementById('tus-listas-main-view');
     if (listasSection) {
       listasSection.style.display = 'block';
     }
     
     currentListName = '';
   }
   
   // Función para cargar los documentos de una lista específica
   async function loadDocumentosForGeneration(listName) {
     const documentosContainer = document.getElementById('documentos-list');
     if (!documentosContainer) return;
     
     try {
       console.log(`[TusListas] Cargando documentos para la lista: "${listName}"`);
       documentosContainer.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="loader"></div></div>';
       
       const response = await fetch('/api/get-user-lists');
       if (!response.ok) {
         throw new Error('Error al cargar los documentos');
       }
       
       const data = await response.json();
       const guardados = data.guardados || {};
       const listData = guardados[listName] || {};
       const documents = Object.values(listData);
       
       if (documents.length === 0) {
         documentosContainer.innerHTML = '<div class="no-documentos">No hay documentos en esta lista</div>';
         // Ocultar controles si no hay documentos
         const controls = document.querySelector('.documentos-controls');
         if (controls) controls.style.display = 'none';
         return;
       }
       
       // Mostrar controles si hay documentos
       const controls = document.querySelector('.documentos-controls');
       if (controls) controls.style.display = 'flex';
       
       // Renderizar los documentos
       const documentsHtml = documents.map((doc, index) => {
         const fecha = doc.dia && doc.mes && doc.anio ? 
           `${doc.dia}/${doc.mes}/${doc.anio}` : 
           (doc.savedAt ? new Date(doc.savedAt).toLocaleDateString('es-ES') : 'Fecha no disponible');
         
         const etiquetasHtml = doc.etiquetas_personalizadas && doc.etiquetas_personalizadas.length > 0 ?
           doc.etiquetas_personalizadas.map(tag => `<span class="documento-tag">${tag}</span>`).join('') :
           '';
         
         return `
           <div class="documento-item" data-doc-index="${index}" onclick="toggleDocumentSelection(${index}, false)">
             <div class="documento-header">
               <h4 class="documento-title">${doc.short_name || doc.documentId || 'Título no disponible'}</h4>
               <button class="delete-documento-btn" onclick="event.stopPropagation(); showDeleteConfirmation('${doc.documentId || doc.short_name}', ${index})" title="Eliminar documento">
                 <i class="fas fa-trash"></i>
               </button>
             </div>
             <div class="documento-meta">
               ${doc.rango_titulo || 'Rango no especificado'} | ${doc.collectionName || 'Fuente desconocida'} | ${fecha}
             </div>
             ${doc.resumen ? `<div class="documento-resumen">${doc.resumen}</div>` : ''}
             ${etiquetasHtml ? `<div class="documento-tags">${etiquetasHtml}</div>` : ''}
             ${doc.url_pdf ? `<a href="${doc.url_pdf}" class="leer-mas" style="display: none;" target="_blank">PDF</a>` : ''}
             <input type="checkbox" class="documento-checkbox" data-doc-index="${index}" onclick="event.stopPropagation(); toggleDocumentSelection(${index}, true)">
           </div>
         `;
       }).join('');
       
       documentosContainer.innerHTML = documentsHtml;
       
       // Resetear contador
       updateSelectedCount();
       
     } catch (error) {
       console.error('Error loading documents for generation:', error);
       documentosContainer.innerHTML = '<div style="color: red; text-align: center; padding: 20px;">Error al cargar los documentos</div>';
     }
   }
   
   // Función para cargar configuraciones guardadas
   function loadSavedSettings(listName) {
     // Cargar desde MongoDB primero, luego localStorage como fallback
     console.log(`[TusListas] Cargando configuraciones para la lista: "${listName}"`);
     loadSettingsFromMongoDB(listName).then(settings => {
       if (settings) {
         // Cargar instrucciones
         const instructionsInput = document.getElementById('instrucciones-input');
         if (instructionsInput) {
           if (settings.instrucciones_generales && settings.instrucciones_generales.trim()) {
             instructionsInput.value = settings.instrucciones_generales;
           } else {
             // Asegurar que el campo esté completamente vacío para mostrar el placeholder
             instructionsInput.value = '';
           }
         }
         
         // Cargar paleta de colores
         if (settings.color_palette) {
           if (settings.color_palette.primary) {
             document.getElementById('primary-color').value = settings.color_palette.primary;
             document.getElementById('primary-color-hex').value = settings.color_palette.primary;
           }
           if (settings.color_palette.secondary) {
             document.getElementById('secondary-color').value = settings.color_palette.secondary;
             document.getElementById('secondary-color-hex').value = settings.color_palette.secondary;
           }
           if (settings.color_palette.tertiary) {
             document.getElementById('tertiary-color').value = settings.color_palette.tertiary;
             document.getElementById('tertiary-color-hex').value = settings.color_palette.tertiary;
           }
         }
         
         // Cargar información del logo
         if (settings.logo) {
           const fileText = document.getElementById('logo-file-text');
           if (fileText) {
             fileText.textContent = 'Logo guardado';
             fileText.style.color = '#0b2431';
           }
           // Guardar el logo en la variable global para uso posterior
           window.currentLogoBase64 = settings.logo;
         }
       } else {
         // Fallback a localStorage
         loadSettingsFromLocalStorage(listName);
       }
     }).catch(error => {
       console.error('Error loading settings from MongoDB:', error);
       // Fallback a localStorage
       loadSettingsFromLocalStorage(listName);
     });
     
     // Cargar configuraciones de contenido (estas siguen en localStorage por ahora)
     const savedLanguage = localStorage.getItem(`language_${listName}`);
     if (savedLanguage) {
       const languageSelect = document.getElementById('lenguaje-select');
       if (languageSelect) {
         languageSelect.value = savedLanguage;
       }
     }
     
     const savedDocType = localStorage.getItem(`doctype_${listName}`);
     if (savedDocType) {
       const docTypeSelect = document.getElementById('tipo-documento-select');
       if (docTypeSelect) {
         docTypeSelect.value = savedDocType;
       }
     }

     const savedIdioma = localStorage.getItem(`idioma_${listName}`);
     if (savedIdioma) {
       const idiomaSelect = document.getElementById('idioma-select');
       if (idiomaSelect) {
         idiomaSelect.value = savedIdioma;
       }
     }
   }
   
   // Función para cargar configuraciones desde localStorage (fallback)
   function loadSettingsFromLocalStorage(listName) {
     const savedInstructions = localStorage.getItem(`instructions_${listName}`);
     const instructionsInput = document.getElementById('instrucciones-input');
     if (instructionsInput) {
       if (savedInstructions && savedInstructions.trim()) {
         instructionsInput.value = savedInstructions;
       } else {
         // Asegurar que el campo esté completamente vacío para mostrar el placeholder
         instructionsInput.value = '';
       }
     }
   }
   
   // Función para cargar configuraciones desde MongoDB
   async function loadSettingsFromMongoDB(listName) {
     try {
       const response = await fetch('/api/get-generation-settings', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({ listName: listName })
       });
       
       if (response.ok) {
         const data = await response.json();
         return data.settings;
       }
       return null;
     } catch (error) {
       console.error('Error fetching settings from MongoDB:', error);
       return null;
     }
   }
   
   // Función para sincronizar color picker con input hex (mejorada)
   function updateColorFromHex(colorType) {
     const hexInput = document.getElementById(`${colorType}-color-hex`);
     const colorInput = document.getElementById(`${colorType}-color`);
     
     if (hexInput && colorInput) {
       let hexValue = hexInput.value.trim();
       
       // Validar formato hex
       if (hexValue.match(/^#[0-9A-Fa-f]{6}$/)) {
         colorInput.value = hexValue;
       } else if (hexValue.match(/^[0-9A-Fa-f]{6}$/)) {
         // Añadir # si no lo tiene
         hexValue = '#' + hexValue;
         hexInput.value = hexValue;
         colorInput.value = hexValue;
       } else if (hexValue.match(/^#[0-9A-Fa-f]{3}$/)) {
         // Convertir formato corto #abc a #aabbcc
         const shortHex = hexValue.substring(1);
         const longHex = '#' + shortHex.split('').map(char => char + char).join('');
         hexInput.value = longHex;
         colorInput.value = longHex;
       }
     }
   }
   
   // Función para sincronizar hex input con color picker
   function updateHexFromColor(colorType) {
     const hexInput = document.getElementById(`${colorType}-color-hex`);
     const colorInput = document.getElementById(`${colorType}-color`);
     
     if (hexInput && colorInput) {
       hexInput.value = colorInput.value;
     }
   }
   
   // Event listeners para sincronizar color picker con hex input (mejorados)
   document.addEventListener('DOMContentLoaded', function() {
     ['primary', 'secondary', 'tertiary'].forEach(colorType => {
       const colorInput = document.getElementById(`${colorType}-color`);
       const hexInput = document.getElementById(`${colorType}-color-hex`);
       
       if (colorInput && hexInput) {
         // Sincronizar cuando cambia el color picker
         colorInput.addEventListener('input', function() {
           updateHexFromColor(colorType);
           showSaveButton();
         });
         
         colorInput.addEventListener('change', function() {
           updateHexFromColor(colorType);
           showSaveButton();
         });
         
         // Sincronizar cuando cambia el input hex (con validación en tiempo real)
         hexInput.addEventListener('input', function() {
           updateColorFromHex(colorType);
         });
         
         hexInput.addEventListener('change', function() {
           updateColorFromHex(colorType);
           showSaveButton();
         });
       }
     });
     
     // Asegurar que el placeholder del textarea se muestre correctamente
     const instructionsInput = document.getElementById('instrucciones-input');
     if (instructionsInput) {
       // Forzar verificación del placeholder después de que se carguen todas las configuraciones
       setTimeout(() => {
         if (!instructionsInput.value || !instructionsInput.value.trim()) {
           instructionsInput.value = '';
           instructionsInput.removeAttribute('value');
         }
       }, 500);
     }
   });
   
   // Función para manejar la subida de logo (actualizada para mostrar nombre del archivo)
   function handleLogoUpload(input) {
     const fileText = document.getElementById('logo-file-text');
     
     if (input.files && input.files[0]) {
       const file = input.files[0];
       console.log('Logo seleccionado:', file.name);
       
       // Validar tipo de archivo
       if (!file.type.startsWith('image/')) {
         alert('Por favor, selecciona un archivo de imagen válido.');
         input.value = '';
         if (fileText) fileText.textContent = 'Ningún archivo seleccionado';
         return;
       }
       
       // Validar tamaño (máximo 5MB)
       if (file.size > 5 * 1024 * 1024) {
         alert('El archivo es demasiado grande. Por favor, selecciona una imagen menor a 5MB.');
         input.value = '';
         if (fileText) fileText.textContent = 'Ningún archivo seleccionado';
         return;
       }
       
       // Actualizar el texto mostrado
       if (fileText) {
         fileText.textContent = file.name;
         fileText.style.color = '#0b2431';
       }
       
       // Convertir a base64 para guardar
       const reader = new FileReader();
       reader.onload = function(e) {
         // Guardar el logo en base64 en una variable global para usar en saveAllSettings
         window.currentLogoBase64 = e.target.result.split(',')[1]; // Remover el prefijo data:image/...;base64,
         console.log('Logo convertido a base64');
       };
       reader.readAsDataURL(file);
       
       console.log('Logo válido seleccionado:', file.name);
     } else {
       // No hay archivo seleccionado
       if (fileText) {
         fileText.textContent = 'Ningún archivo seleccionado';
         fileText.style.color = '#6c757d';
       }
       window.currentLogoBase64 = null;
     }
   }
   
   // Función para guardar todas las configuraciones (actualizada para MongoDB)
   async function saveAllSettings() {
     if (!currentListName) return;
     
     console.log(`[TusListas] Guardando todas las configuraciones para la lista: "${currentListName}"`);
     // Recopilar todas las configuraciones
     const settings = {
       listName: currentListName,
       instrucciones_generales: document.getElementById('instrucciones-input')?.value?.trim() || '',
       color_palette: {
         primary: document.getElementById('primary-color-hex')?.value || '#04db8d',
         secondary: document.getElementById('secondary-color-hex')?.value || '#0b2431',
         text: document.getElementById('tertiary-color-hex')?.value || '#455862'
       },
       language: document.getElementById('lenguaje-select')?.value || 'juridico',
       documentType: document.getElementById('tipo-documento-select')?.value || 'whatsapp',
       idioma: document.getElementById('idioma-select')?.value || 'español'
     };
     
     // Añadir logo si existe
     if (window.currentLogoBase64) {
       settings.logo = window.currentLogoBase64;
     }
     
     try {
       // Guardar en MongoDB
       const response = await fetch('/api/save-generation-settings', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
         },
         body: JSON.stringify(settings)
       });
       
       if (response.ok) {
         // También guardar en localStorage como backup
         localStorage.setItem(`instructions_${currentListName}`, settings.instrucciones_generales);
         localStorage.setItem(`language_${currentListName}`, settings.language);
         localStorage.setItem(`doctype_${currentListName}`, settings.documentType);
         localStorage.setItem(`idioma_${currentListName}`, settings.idioma);
         
         // Mostrar feedback
         const button = document.getElementById('save-all-btn');
         const originalText = button.innerHTML;
         button.innerHTML = '<i class="fas fa-check"></i> Guardado';
         button.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
         
         setTimeout(() => {
           button.innerHTML = originalText;
           button.style.background = '';
           button.classList.remove('show');
         }, 2000);
         
         console.log('Configuraciones guardadas en MongoDB:', settings);
       } else {
         throw new Error('Error al guardar en el servidor');
       }
     } catch (error) {
       console.error('Error saving settings:', error);
       alert('Error al guardar las configuraciones. Por favor, inténtalo de nuevo.');
     }
   }
   
   // Función para generar contenido final
   function generarContenidoFinal() {
     if (!currentListName) {
       alert('Error: No se ha seleccionado una lista');
       return;
     }
     
     console.log('Starting content generation for list:', currentListName);
     
     // Verificar que hay documentos seleccionados
     const selectedDocuments = getSelectedDocumentsData();
     if (selectedDocuments.length === 0) {
       console.log('No documents selected, showing modal');
       // Mostrar modal de validación
       showNoDocumentosModal();
       return;
     }
     
     console.log(`${selectedDocuments.length} documents selected for content generation`);
     
     // Recopilar todas las configuraciones
     const settings = {
       listName: currentListName,
       selectedDocuments: selectedDocuments,
       instructions: document.getElementById('instrucciones-input')?.value?.trim() || '',
       language: document.getElementById('lenguaje-select')?.value || 'juridico',
       documentType: document.getElementById('tipo-documento-select')?.value || 'whatsapp',
       idioma: document.getElementById('idioma-select')?.value || 'español',
       colorPalette: {
         primary: document.getElementById('primary-color-hex')?.value || '#04db8d',
         secondary: document.getElementById('secondary-color-hex')?.value || '#0b2431',
         text: document.getElementById('tertiary-color-hex')?.value || '#455862'
       }
     };
     
     // Añadir logo si existe
     if (window.currentLogoBase64) {
       settings.logo = window.currentLogoBase64;
     }
     
     console.log('Generation settings:', settings);
     
     // Validar que hay instrucciones
     if (!settings.instructions) {
       alert('Por favor, introduce algunas instrucciones antes de generar el contenido.');
       document.getElementById('instrucciones-input')?.focus();
       return;
     }
     
     // Validar que los documentos tienen información mínima
     const validDocuments = selectedDocuments.filter(doc => 
       doc.short_name && doc.short_name.trim() !== ''
     );
     
     if (validDocuments.length === 0) {
       alert('Los documentos seleccionados no tienen información suficiente para generar contenido.');
       return;
     }
     
     if (validDocuments.length < selectedDocuments.length) {
       console.warn(`${selectedDocuments.length - validDocuments.length} documents have insufficient data`);
     }
     
     // Actualizar la configuración con documentos válidos
     settings.selectedDocuments = validDocuments;
     
     // Mostrar loader en el botón
     const button = event.target;
     const originalText = button.innerHTML;
     button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i> Generando...';
     button.disabled = true;
     
     console.log('Calling AI generation with final settings:', settings);
     
     // Llamar al backend para generar contenido
     generateContentWithAI(settings)
       .then(result => {
         console.log('AI generation result:', result);
         if (result.success) {
           console.log('Content generated successfully, displaying result');
           // Mostrar el contenido generado
           displayGeneratedContent(result.content, settings.colorPalette);
         } else {
           console.error('AI generation failed:', result.error);
           alert('Error al generar contenido: ' + (result.error || 'Error desconocido'));
         }
       })
       .catch(error => {
         console.error('Error generating content:', error);
         alert('Error al generar contenido. Por favor, inténtalo de nuevo.\n\nDetalles: ' + error.message);
       })
       .finally(() => {
         // Restaurar el botón
         button.innerHTML = originalText;
         button.disabled = false;
       });
   }

   // Función para mostrar el modal de validación
   function showNoDocumentosModal() {
     const modal = document.getElementById('modal-no-documentos');
     if (modal) {
       modal.style.display = 'flex';
     }
   }

   // Función para cerrar el modal de validación
   function closeNoDocumentosModal() {
     const modal = document.getElementById('modal-no-documentos');
     if (modal) {
       modal.style.display = 'none';
     }
   }

   // Función para obtener los datos completos de los documentos seleccionados
   function getSelectedDocumentsData() {
     const selectedCheckboxes = document.querySelectorAll('.documento-checkbox:checked');
     const selectedDocuments = [];
     
     console.log(`Getting data for ${selectedCheckboxes.length} selected documents`);
     
     selectedCheckboxes.forEach((checkbox, index) => {
       const docIndex = parseInt(checkbox.dataset.docIndex);
       const documentItem = document.querySelector(`[data-doc-index="${docIndex}"]`);
       
       if (documentItem) {
         const documentData = {
           short_name: documentItem.querySelector('.documento-title')?.textContent?.trim() || '',
           collectionName: extractCollectionFromMeta(documentItem),
           resumen: documentItem.querySelector('.documento-resumen')?.textContent?.trim() || '',
           fecha: extractDateFromDocument(documentItem),
           rango: extractRangoFromDocument(documentItem),
           etiquetas: extractEtiquetasFromDocument(documentItem),
           url_pdf: extractUrlFromDocument(documentItem)
         };
         
         console.log(`Document ${index + 1} data:`, documentData);
         selectedDocuments.push(documentData);
       } else {
         console.warn(`Document item not found for index ${docIndex}`);
       }
     });
     
     console.log('Final selected documents data:', selectedDocuments);
     return selectedDocuments;
   }

   // Funciones auxiliares para extraer datos de los documentos
   function extractCollectionFromMeta(documentItem) {
     const metaElement = documentItem.querySelector('.documento-meta');
     if (metaElement) {
       const metaText = metaElement.textContent;
       const parts = metaText.split('|');
       if (parts.length > 1) {
         return parts[1].trim();
       }
     }
     return 'Fuente desconocida';
   }

   function extractDateFromDocument(documentItem) {
     const dateElement = documentItem.querySelector('.documento-date');
     if (dateElement) {
       return dateElement.textContent.trim();
     }
     return '';
   }

   function extractRangoFromDocument(documentItem) {
     const metaElement = documentItem.querySelector('.documento-meta');
     if (metaElement) {
       const metaText = metaElement.textContent;
       const parts = metaText.split('|');
       if (parts.length > 0) {
         return parts[0].trim();
       }
     }
     return '';
   }

   function extractEtiquetasFromDocument(documentItem) {
     const etiquetas = [];
     const tagElements = documentItem.querySelectorAll('.documento-tag');
     tagElements.forEach(tag => {
       const tagText = tag.textContent.trim();
       if (tagText) {
         etiquetas.push(tagText);
       }
     });
     return etiquetas;
   }

   function extractUrlFromDocument(documentItem) {
     const urlElement = documentItem.querySelector('.leer-mas, a[href*=".pdf"], a[target="_blank"]');
     if (urlElement) {
       return urlElement.getAttribute('href');
     }
     return '';
   }

   // Función para llamar al backend y generar contenido con IA
   async function generateContentWithAI(settings) {
     try {
       console.log('Sending data to backend:', settings);
       
       const response = await fetch('/api/generate-marketing-content', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
         },
         body: JSON.stringify(settings)
       });

       console.log('Response status:', response.status);
       
       if (!response.ok) {
         const errorText = await response.text();
         console.error('HTTP error response:', errorText);
         throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
       }

       const result = await response.json();
       console.log('Backend response:', result);
       return result;
     } catch (error) {
       console.error('Error calling AI generation API:', error);
       throw error;
     }
   }

   // Función para mostrar el contenido generado
   function displayGeneratedContent(htmlContent, colorPalette) {
     const documentosSection = document.querySelector('.documentos-section');
     const documentosTitle = document.querySelector('.documentos-title');
     const documentosControls = document.querySelector('.documentos-controls');
     const documentosList = document.getElementById('documentos-list');
     const contenidoContainer = document.getElementById('contenido-generado');
     const contenidoHtml = document.getElementById('contenido-html');
     
     if (!documentosSection || !documentosTitle || !contenidoContainer || !contenidoHtml) return;
     
     // Cambiar el título de la sección con botón de copiar
     documentosTitle.innerHTML = `
       <div style="display: flex; align-items: center; width: 100%;">
         <button class="back-to-documents-btn" onclick="backToDocumentSelection()" title="Volver a selección de documentos">
           <i class="fas fa-arrow-left"></i>
         </button>
         <span style="flex: 1;">Contenido Generado</span>
         <div style="display: flex; gap: 10px; align-items: center;">
           <button class="edit-content-btn" onclick="toggleEditing()" title="Editar contenido" style="background: none; border: none; color: #0b2431; font-size: 16px; cursor: pointer; padding: 5px; border-radius: 4px; transition: all 0.2s ease;">
             <i class="fas fa-edit"></i> Editar
           </button>
           <div class="export-dropdown">
             <button class="export-btn" onclick="toggleExportDropdown()" title="Exportar contenido">
               <i class="fas fa-download"></i> Exportar
             </button>
             <div class="export-dropdown-content" id="export-dropdown-content">
               <button class="export-option" onclick="copyGeneratedContent(); hideExportDropdown()">
                 <i class="fas fa-copy"></i> Copiar
               </button>
               <button class="export-option" onclick="downloadAsPDF(); hideExportDropdown()">
                 <i class="fas fa-file-pdf"></i> PDF
               </button>
             </div>
           </div>
         </div>
       </div>
     `;
     
     // Ocultar controles de documentos y lista de documentos
     if (documentosControls) documentosControls.style.display = 'none';
     if (documentosList) documentosList.style.display = 'none';
     
     // Crear o encontrar la toolbar y posicionarla después del título
     let toolbar = document.querySelector('.editor-toolbar');
     if (!toolbar) {
       // Crear la toolbar si no existe
       toolbar = document.createElement('div');
       toolbar.className = 'editor-toolbar';
       toolbar.style.display = 'none';
       toolbar.innerHTML = `
         <div class="toolbar-group">
           <button class="toolbar-btn" onclick="formatText('bold')" title="Negrita">
             <i class="fas fa-bold"></i>
           </button>
           <button class="toolbar-btn" onclick="formatText('italic')" title="Cursiva">
             <i class="fas fa-italic"></i>
           </button>
           <button class="toolbar-btn" onclick="formatText('underline')" title="Subrayado">
             <i class="fas fa-underline"></i>
           </button>
         </div>
         
         <div class="toolbar-group">
           <select class="toolbar-select" onchange="changeFontSize(this.value)" title="Tamaño de fuente">
             <option value="">Tamaño</option>
             <option value="1">Muy pequeño</option>
             <option value="2">Pequeño</option>
             <option value="3">Normal</option>
             <option value="4">Grande</option>
             <option value="5">Muy grande</option>
             <option value="6">Extra grande</option>
             <option value="7">Máximo</option>
           </select>
         </div>
         
         <div class="toolbar-group">
           <button class="toolbar-btn" onclick="formatText('insertUnorderedList')" title="Lista con viñetas">
             <i class="fas fa-list-ul"></i>
           </button>
           <button class="toolbar-btn" onclick="formatText('insertOrderedList')" title="Lista numerada">
             <i class="fas fa-list-ol"></i>
           </button>
         </div>
         
         <div class="toolbar-group">
           <button class="toolbar-btn" onclick="formatText('justifyLeft')" title="Alinear izquierda">
             <i class="fas fa-align-left"></i>
           </button>
           <button class="toolbar-btn" onclick="formatText('justifyCenter')" title="Centrar">
             <i class="fas fa-align-center"></i>
           </button>
           <button class="toolbar-btn" onclick="formatText('justifyRight')" title="Alinear derecha">
             <i class="fas fa-align-right"></i>
           </button>
         </div>
       `;
     }
     
     // Insertar la toolbar después del título si no está ya ahí
     if (!toolbar.parentNode || toolbar.parentNode !== documentosSection) {
       documentosSection.insertBefore(toolbar, contenidoContainer);
     }
     
     // Preparar el contenido con logo si existe
     prepareContentWithLogo(htmlContent).then(finalContent => {
       // Insertar el contenido HTML
       contenidoHtml.innerHTML = finalContent;
       
       // Aplicar la paleta de colores solo al contenido generado
       applyColorPaletteToContent(contenidoHtml, colorPalette);
       
       // Mostrar el contenedor de contenido generado
       contenidoContainer.style.display = 'block';
       
       // Hacer scroll hacia el contenido generado
       documentosSection.scrollIntoView({ behavior: 'smooth' });
     });
   }

   // Función para preparar el contenido con logo si existe
   async function prepareContentWithLogo(htmlContent) {
     try {
       // Primero verificar si hay un logo en memoria (subido recientemente)
       if (window.currentLogoBase64) {
         const logoHtml = `<div class="content-logo logo-container" style="text-align: center; margin-bottom: 20px;"><img src="data:image/png;base64,${window.currentLogoBase64}" alt="Logo" style="max-width: 200px; max-height: 80px; object-fit: contain;" /></div>`;
         return logoHtml + htmlContent;
       }
       
       // Si no hay logo en memoria, intentar obtenerlo de las configuraciones guardadas en la BD
       const response = await fetch('/api/get-generation-settings', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ listName: currentListName })
       });
       
       if (response.ok) {
         const data = await response.json();
         const settings = data.settings;
         
         if (settings && settings.logo) {
           // Si hay un logo guardado, añadirlo al inicio del contenido
           const logoHtml = `<div class="content-logo logo-container" style="text-align: center; margin-bottom: 20px;"><img src="data:image/png;base64,${settings.logo}" alt="Logo" style="max-width: 200px; max-height: 80px; object-fit: contain;" /></div>`;
           return logoHtml + htmlContent;
         }
       }
     } catch (error) {
       console.log('No logo found or error loading logo:', error);
     }
     
     // Si no hay logo en ningún lado, devolver el contenido original
     return htmlContent;
   }

   // Función para aplicar la paleta de colores solo al contenido generado
   function applyColorPaletteToContent(container, colorPalette) {
     // Aplicar colores a headings (primary color) - solo si no tienen color personalizado
     const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
     headings.forEach(heading => {
       // Solo aplicar si no tiene un color personalizado (inline style)
       if (!heading.style.color || heading.style.color === '') {
         heading.style.color = colorPalette.primary;
       }
     });
     
     // Aplicar colores a texto principal (text color) - solo si no tienen color personalizado
     const textElements = container.querySelectorAll('p, li, span:not(.detail):not(.meta)');
     textElements.forEach(element => {
       // Solo aplicar si no tiene un color personalizado (inline style)
       if (!element.style.color || element.style.color === '') {
         element.style.color = colorPalette.text;
       }
     });
     
     // Aplicar colores a elementos de detalle (secondary color) - solo si no tienen color personalizado
     const detailElements = container.querySelectorAll('b, strong, .detail, .meta, small');
     detailElements.forEach(element => {
       // Solo aplicar si no tiene un color personalizado (inline style)
       if (!element.style.color || element.style.color === '') {
         element.style.color = colorPalette.secondary;
       }
     });
     
     // Aplicar colores a bordes y elementos especiales
     const blockquotes = container.querySelectorAll('blockquote');
     blockquotes.forEach(blockquote => {
       blockquote.style.borderLeftColor = colorPalette.primary;
       // Solo aplicar color de texto si no tiene uno personalizado
       if (!blockquote.style.color || blockquote.style.color === '') {
         blockquote.style.color = colorPalette.text;
       }
     });
     
     // Aplicar colores a tablas
     const tableHeaders = container.querySelectorAll('th');
     tableHeaders.forEach(th => {
       th.style.backgroundColor = `${colorPalette.primary}1a`; // 10% opacity
       // Solo aplicar color de texto si no tiene uno personalizado
       if (!th.style.color || th.style.color === '') {
         th.style.color = colorPalette.secondary;
       }
     });
     
     const tableCells = container.querySelectorAll('td');
     tableCells.forEach(td => {
       // Solo aplicar color de texto si no tiene uno personalizado
       if (!td.style.color || td.style.color === '') {
         td.style.color = colorPalette.text;
       }
     });
   }

   // Función para volver a la selección de documentos
   function backToDocumentSelection() {
     const documentosTitle = document.querySelector('.documentos-title');
     const documentosControls = document.querySelector('.documentos-controls');
     const documentosList = document.getElementById('documentos-list');
     const contenidoContainer = document.getElementById('contenido-generado');
     const toolbar = document.querySelector('.editor-toolbar');
     const contenidoHtml = document.getElementById('contenido-html');
     
     // Restaurar el título original
     if (documentosTitle) {
       documentosTitle.innerHTML = 'Documentos';
     }
     
     // Ocultar y resetear la toolbar
     if (toolbar) {
       toolbar.style.display = 'none';
     }
     
     // Resetear el estado de edición del contenido
     if (contenidoHtml) {
       contenidoHtml.contentEditable = 'false';
       contenidoHtml.style.marginTop = '';
     }
     
     // Mostrar controles de documentos y lista de documentos
     if (documentosControls) documentosControls.style.display = 'flex';
     if (documentosList) documentosList.style.display = 'flex';
     
     // Ocultar el contenedor de contenido generado
     if (contenidoContainer) contenidoContainer.style.display = 'none';
     
     // Hacer scroll hacia la sección de documentos
     const documentosSection = document.querySelector('.documentos-section');
     if (documentosSection) {
       documentosSection.scrollIntoView({ behavior: 'smooth' });
     }
   }

   // ==================== FUNCIONES PARA SELECCIÓN DE DOCUMENTOS ====================
    
   // Función para alternar la selección de un documento específico
   function toggleDocumentSelection(index, fromCheckbox = false) {
     const documentItem = document.querySelector(`[data-doc-index="${index}"]`);
     const checkbox = document.querySelector(`input[data-doc-index="${index}"]`);
     
     if (!documentItem || !checkbox) return;
     
     // Si no se llama desde el checkbox, alternar el estado
     if (!fromCheckbox) {
       checkbox.checked = !checkbox.checked;
     }
     
     // Actualizar la apariencia visual del documento basándose en el estado actual del checkbox
     if (checkbox.checked) {
       documentItem.classList.add('selected');
     } else {
       documentItem.classList.remove('selected');
     }
     
     // Actualizar el contador y el estado del "seleccionar todos"
     updateSelectedCount();
     updateSelectAllState();
   }
   
   // Función para seleccionar/deseleccionar todos los documentos
   function toggleSelectAllDocuments(selectAllCheckbox) {
     const documentCheckboxes = document.querySelectorAll('.documento-checkbox');
     const documentItems = document.querySelectorAll('.documento-item');
     
     documentCheckboxes.forEach((checkbox, index) => {
       checkbox.checked = selectAllCheckbox.checked;
       
       const documentItem = documentItems[index];
       if (selectAllCheckbox.checked) {
         documentItem.classList.add('selected');
       } else {
         documentItem.classList.remove('selected');
       }
     });
     
     updateSelectedCount();
   }
   
   // Función para actualizar el contador de documentos seleccionados
   function updateSelectedCount() {
     const selectedCheckboxes = document.querySelectorAll('.documento-checkbox:checked');
     const countElement = document.getElementById('selected-count');
     
     if (countElement) {
       countElement.textContent = `Documentos seleccionados: ${selectedCheckboxes.length}`;
     }
   }
   
   // Función para actualizar el estado del checkbox "seleccionar todos"
   function updateSelectAllState() {
     const selectAllCheckbox = document.getElementById('select-all-docs');
     const documentCheckboxes = document.querySelectorAll('.documento-checkbox');
     const selectedCheckboxes = document.querySelectorAll('.documento-checkbox:checked');
     
     if (!selectAllCheckbox || documentCheckboxes.length === 0) return;
     
     if (selectedCheckboxes.length === 0) {
       // Ninguno seleccionado
       selectAllCheckbox.checked = false;
       selectAllCheckbox.indeterminate = false;
     } else if (selectedCheckboxes.length === documentCheckboxes.length) {
       // Todos seleccionados
       selectAllCheckbox.checked = true;
       selectAllCheckbox.indeterminate = false;
     } else {
       // Algunos seleccionados
       selectAllCheckbox.checked = false;
       selectAllCheckbox.indeterminate = true;
     }
   }
   
   // Función para obtener los documentos seleccionados (versión simple para compatibilidad)
   function getSelectedDocuments() {
     const selectedCheckboxes = document.querySelectorAll('.documento-checkbox:checked');
     const selectedIndices = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.docIndex));
     return selectedIndices;
   }

   // Función para mostrar el botón de guardar cuando se edita algo
   function showSaveButton() {
     const saveButton = document.getElementById('save-all-btn');
     if (saveButton) {
       saveButton.classList.add('show');
     }
   }

   // Función para guardar instrucciones (mantenida por compatibilidad)
   function saveInstrucciones() {
     // Redirigir a la nueva función
     saveAllSettings();
   }

   // Función para guardar formato (mantenida por compatibilidad)
   function saveFormato() {
     // Redirigir a la nueva función
     saveAllSettings();
   }

   // Función para copiar el contenido generado
   async function copyGeneratedContent() {
     const contenidoHtml = document.getElementById('contenido-html');
     const exportButton = document.querySelector('.export-btn');
     
     if (!contenidoHtml) {
       alert('No hay contenido para copiar');
       return;
     }
     
     try {
       // Crear una versión del contenido con estilos inline para mantener el formato
       const styledContent = createStyledContentForCopy(contenidoHtml);
       
       // Intentar copiar usando la API moderna primero
       if (navigator.clipboard && window.isSecureContext) {
         // Crear elementos para clipboard
         const clipboardItem = new ClipboardItem({
           'text/html': new Blob([styledContent], { type: 'text/html' }),
           'text/plain': new Blob([contenidoHtml.textContent || contenidoHtml.innerText], { type: 'text/plain' })
         });
         
         await navigator.clipboard.write([clipboardItem]);
       } else {
         // Fallback para navegadores más antiguos
         const tempTextArea = document.createElement('textarea');
         tempTextArea.value = contenidoHtml.textContent || contenidoHtml.innerText;
         tempTextArea.style.position = 'fixed';
         tempTextArea.style.left = '-9999px';
         document.body.appendChild(tempTextArea);
         tempTextArea.select();
         document.execCommand('copy');
         document.body.removeChild(tempTextArea);
       }
       
       // Mostrar feedback visual
       showCopyFeedback(exportButton);
       
     } catch (error) {
       console.error('Error copying content:', error);
       
       // Fallback: copiar solo texto plano
       try {
         const textContent = contenidoHtml.textContent || contenidoHtml.innerText;
         await navigator.clipboard.writeText(textContent);
         showCopyFeedback(exportButton);
       } catch (textError) {
         console.error('Error copying text:', textError);
         alert('Error al copiar el contenido. Por favor, selecciona y copia manualmente.');
       }
     }
   }

   // Función para crear contenido con estilos inline para copiar
   function createStyledContentForCopy(container) {
     const clone = container.cloneNode(true);
     
     // Aplicar estilos inline para mantener el formato al pegar
     const headings = clone.querySelectorAll('h1, h2, h3, h4, h5, h6');
     headings.forEach(heading => {
       const currentColor = heading.style.color || '#04db8d';
       heading.style.cssText = `color: ${currentColor}; font-weight: 600; margin: 20px 0 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`;
     });
     
     const paragraphs = clone.querySelectorAll('p');
     paragraphs.forEach(p => {
       const currentColor = p.style.color || '#455862';
       p.style.cssText = `color: ${currentColor}; line-height: 1.6; margin: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`;
     });
     
     const lists = clone.querySelectorAll('ul, ol');
     lists.forEach(list => {
       list.style.cssText = `padding-left: 20px; margin: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`;
     });
     
     const listItems = clone.querySelectorAll('li');
     listItems.forEach(li => {
       const currentColor = li.style.color || '#455862';
       li.style.cssText = `color: ${currentColor}; line-height: 1.6; margin: 5px 0;`;
     });
     
     const boldElements = clone.querySelectorAll('b, strong');
     boldElements.forEach(bold => {
       const currentColor = bold.style.color || '#0b2431';
       bold.style.cssText = `color: ${currentColor}; font-weight: 600;`;
     });
     
     const tables = clone.querySelectorAll('table');
     tables.forEach(table => {
       table.style.cssText = `width: 100%; border-collapse: collapse; margin: 15px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`;
     });
     
     const tableCells = clone.querySelectorAll('th, td');
     tableCells.forEach(cell => {
       cell.style.cssText = `border: 1px solid #dee2e6; padding: 8px 12px; text-align: left;`;
     });
     
     const tableHeaders = clone.querySelectorAll('th');
     tableHeaders.forEach(th => {
       th.style.cssText += `background-color: rgba(4, 219, 141, 0.1); font-weight: 600;`;
     });
     
     // Añadir estilos generales al contenedor
     clone.style.cssText = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #455862;`;
     
     return clone.outerHTML;
   }

   // Función para mostrar feedback visual del copiado
   function showCopyFeedback(button) {
     const originalIcon = button.innerHTML;
     button.innerHTML = '<i class="fas fa-check"></i>';
     button.classList.add('copied');
     
     setTimeout(() => {
       button.innerHTML = originalIcon;
       button.classList.remove('copied');
     }, 2000);
   }

   // Variables para el modal de eliminación
   let documentToDelete = null;
   let documentIndexToDelete = null;

   // Función para mostrar el modal de confirmación de eliminación
   function showDeleteConfirmation(documentId, index) {
     const modal = document.getElementById('modal-delete-documento');
     const message = document.getElementById('delete-documento-message');
     
     documentToDelete = documentId;
     documentIndexToDelete = index;
     
     message.textContent = `¿Estás seguro de que quieres eliminar "${documentId}" de esta lista?`;
     modal.style.display = 'flex';
   }

   // Función para cerrar el modal de confirmación
   function closeDeleteConfirmation() {
     const modal = document.getElementById('modal-delete-documento');
     const siButton = document.querySelector('.modal-btn-si');
     const noButton = document.querySelector('.modal-btn-no');
     
     // Restaurar estado original de los botones
     if (siButton) {
       siButton.innerHTML = 'Sí';
       siButton.disabled = false;
     }
     if (noButton) {
       noButton.disabled = false;
     }
     
     modal.style.display = 'none';
     documentToDelete = null;
     documentIndexToDelete = null;
   }

   // Función para confirmar la eliminación del documento
   async function confirmDeleteDocument() {
     if (!documentToDelete || documentIndexToDelete === null) {
       closeDeleteConfirmation();
       return;
     }

     // Obtener el botón "Sí" y mostrar loader
     const siButton = document.querySelector('.modal-btn-si');
     const noButton = document.querySelector('.modal-btn-no');
     const originalSiContent = siButton.innerHTML;
     
     // Mostrar loader y deshabilitar botones
     siButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Eliminando...';
     siButton.disabled = true;
     noButton.disabled = true;

     try {
       const response = await fetch('/api/remove-document-from-list', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
         },
         credentials: 'same-origin',
         body: JSON.stringify({
           documentId: documentToDelete,
           listName: currentListName
         })
       });

       if (response.ok) {
         // Mostrar éxito antes de continuar
         siButton.innerHTML = '<i class="fas fa-check"></i> Eliminado';
         
         // Eliminar el documento de la vista
         const documentItem = document.querySelector(`[data-doc-index="${documentIndexToDelete}"]`);
         if (documentItem) {
           documentItem.remove();
         }

         // Reindexar todos los documentos después de la eliminación
         const remainingDocuments = document.querySelectorAll('.documento-item');
         remainingDocuments.forEach((doc, newIndex) => {
           doc.setAttribute('data-doc-index', newIndex);
           doc.onclick = function() { toggleDocumentSelection(newIndex, false); };
           
           const checkbox = doc.querySelector('.documento-checkbox');
           if (checkbox) {
             checkbox.setAttribute('data-doc-index', newIndex);
             checkbox.onclick = function(event) { 
               event.stopPropagation(); 
               toggleDocumentSelection(newIndex, true); 
             };
           }
           
           const deleteBtn = doc.querySelector('.delete-documento-btn');
           if (deleteBtn) {
             const docId = deleteBtn.getAttribute('onclick').match(/'([^']+)'/)[1];
             deleteBtn.onclick = function(event) { 
               event.stopPropagation(); 
               showDeleteConfirmation(docId, newIndex); 
             };
           }
         });

         // Actualizar contadores
         updateSelectedCount();
         updateSelectAllState();
         
         console.log('Documento eliminado exitosamente:', documentToDelete);
         
         // Esperar un momento para mostrar el éxito antes de cerrar
         setTimeout(() => {
           closeDeleteConfirmation();
         }, 1000);
       } else {
         const error = await response.json();
         alert('Error al eliminar el documento: ' + (error.message || 'Error desconocido'));
         
         // Restaurar botón en caso de error
         siButton.innerHTML = originalSiContent;
         siButton.disabled = false;
         noButton.disabled = false;
       }
     } catch (error) {
       console.error('Error deleting document:', error);
       alert('Error al eliminar el documento. Por favor, inténtalo de nuevo.');
       
       // Restaurar botón en caso de error
       siButton.innerHTML = originalSiContent;
       siButton.disabled = false;
       noButton.disabled = false;
     }

     // Solo cerrar inmediatamente si hay error, si no se cierra después del timeout
     if (siButton.innerHTML === originalSiContent) {
       closeDeleteConfirmation();
     }
   }

   // Event listener para cerrar el modal al hacer clic fuera
   document.addEventListener('click', function(event) {
     const modal = document.getElementById('modal-delete-documento');
     if (event.target === modal) {
       closeDeleteConfirmation();
     }
   });

   // Event listener para cerrar el modal con la tecla Escape
   document.addEventListener('keydown', function(event) {
     if (event.key === 'Escape') {
       const modal = document.getElementById('modal-delete-documento');
       if (modal && modal.style.display === 'flex') {
         closeDeleteConfirmation();
       }
     }
   });

   // Hacer las funciones globales para que puedan ser llamadas desde el HTML
   window.showDeleteConfirmation = showDeleteConfirmation;
   window.closeDeleteConfirmation = closeDeleteConfirmation;
   window.confirmDeleteDocument = confirmDeleteDocument;

