
/*Índice del archivo:
1. Funciones para el manejo de listas
2. Funciones para la sección "Tus Listas"
*/
// ==================== FUNCIONES PARA MANEJO DE LISTAS (parcial, depende de profile.html) ====================
    
    // NOTA: La variable 'userLists' y las funciones como 'loadUserListsFromBackend'
    // se asume que ya existen en el scope global, cargadas por profile.html.

    // Función para extraer información del documento desde el DOM
    function extractDocumentData(dataItem) {
      const documentData = {};
      
      try {
        // Extraer información básica
        documentData.short_name = dataItem.querySelector('.id-values')?.textContent?.trim() || null;
        documentData.resumen = dataItem.querySelector('.resumen-content')?.textContent?.trim() || null;
        
        // Extraer fecha
        const dateElement = dataItem.querySelector('.date em');
        if (dateElement) {
          const dateText = dateElement.textContent.trim();
          const dateParts = dateText.split('/');
          if (dateParts.length === 3) {
            documentData.dia = parseInt(dateParts[0]) || null;
            documentData.mes = parseInt(dateParts[1]) || null;
            documentData.anio = parseInt(dateParts[2]) || null;
          }
        }
        
        // Extraer rango_titulo - buscar en diferentes posibles ubicaciones
        let rangoTitulo = null;
        
        // Buscar en el elemento con estilo de color gris
        const rangoElement = dataItem.querySelector('div[style*="color: gray"], div[style*="color:gray"]');
        if (rangoElement) {
          const rangoText = rangoElement.textContent.trim();
          const rangoParts = rangoText.split('|');
          if (rangoParts.length > 0) {
            rangoTitulo = rangoParts[0].trim();
          }
        }
        
        // Si no se encontró, buscar en otros elementos posibles
        if (!rangoTitulo) {
          const possibleRangoElements = dataItem.querySelectorAll('div');
          for (const element of possibleRangoElements) {
            const text = element.textContent.trim();
            if (text.includes('|') && (text.includes('BOE') || text.includes('DOUE') || text.includes('BOCG'))) {
              const parts = text.split('|');
              if (parts.length > 0) {
                rangoTitulo = parts[0].trim();
                break;
              }
            }
          }
        }
        
        documentData.rango_titulo = rangoTitulo;
        
        // Extraer URL del PDF
        const pdfLink = dataItem.querySelector('.leer-mas, a[href*=".pdf"], a[target="_blank"]');
        if (pdfLink) {
          documentData.url_pdf = pdfLink.getAttribute('href');
        }
        
        // Extraer etiquetas personalizadas de múltiples fuentes
        const etiquetas = [];
        
        // 1. Obtener etiquetas de ramas jurídicas
        const ramaTags = dataItem.querySelectorAll('.tag-rama');
        ramaTags.forEach(tag => {
          const tagText = tag.textContent.trim();
          if (tagText) etiquetas.push(tagText);
        });
        
        // 2. Obtener etiquetas de divisiones
        const divisionTags = dataItem.querySelectorAll('.tag-division');
        divisionTags.forEach(tag => {
          const tagText = tag.textContent.trim();
          if (tagText) etiquetas.push(tagText);
        });
        
        // 3. Buscar en elementos con clases de etiquetas
        const etiquetaTags = dataItem.querySelectorAll('.etiqueta-personalizada-value, .tag, [class*="tag-"], [class*="etiqueta"]');
        etiquetaTags.forEach(tag => {
          const tagText = tag.textContent.trim();
          if (tagText && !etiquetas.includes(tagText)) {
            etiquetas.push(tagText);
          }
        });
        
        // 4. Buscar en spans con estilos específicos (como los que tienen colores de etiquetas)
        const styledSpans = dataItem.querySelectorAll('span[style*="background"], span[class*="badge"], span[class*="chip"]');
        styledSpans.forEach(span => {
          const spanText = span.textContent.trim();
          if (spanText && !etiquetas.includes(spanText)) {
            etiquetas.push(spanText);
          }
        });
        
        documentData.etiquetas_personalizadas = etiquetas;
        
        console.log('Datos extraídos del documento:', documentData);
        
      } catch (error) {
        console.error('Error extracting document data:', error);
      }
      
      return documentData;
    }
    
    // Función para mostrar/ocultar el desplegable de listas
    async function toggleListsDropdown(buttonElement, documentId, collectionName) {
      // Cerrar otros desplegables abiertos
      document.querySelectorAll('.lists-dropdown.show').forEach(dropdown => {
        if (dropdown !== buttonElement.nextElementSibling) {
          dropdown.classList.remove('show');
        }
      });
      
      const dropdown = buttonElement.nextElementSibling;
      const isShowing = dropdown.classList.contains('show');
      
      if (!isShowing) {
        // Mostrar loader en el botón mientras carga
        const originalButtonContent = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
        buttonElement.disabled = true;
        
        try {
          // CRÍTICO: Forzar refresh de datos para asegurar estado actual
          console.log(`[toggleListsDropdown] Abriendo dropdown para documento ${documentId}`);
          await loadUserListsFromBackend(true);
          
          // Cargar las listas del usuario antes de mostrar
          loadUserLists(dropdown);
          
          // Ocultar el botón OK permanentemente (ya no se usa)
          const saveButton = dropdown.querySelector('.save-ok-btn');
          saveButton.style.display = 'none';
          
          // No desmarcar checkboxes - ahora se marcan automáticamente según el estado real
          
          dropdown.classList.add('show');
        } finally {
          // Restaurar botón original
          buttonElement.innerHTML = originalButtonContent;
          buttonElement.disabled = false;
        }
      } else {
        dropdown.classList.remove('show');
      }
      
      // Prevenir que el evento se propague
      event.stopPropagation();
    }
    
    // Función para cargar las listas del usuario en el desplegable
    function loadUserLists(dropdown) {
      const listsContainer = dropdown.querySelector('.lists-container');
      
      if (userLists.length === 0) {
        listsContainer.innerHTML = '<div class="no-lists-message">No tienes listas creadas</div>';
      } else {
        // Obtener información del documento actual
        const saveButton = dropdown.closest('.guardar-button');
        const mainButton = saveButton.querySelector('.save-btn');
        const onclickAttr = mainButton.getAttribute('onclick');
        const matches = onclickAttr.match(/toggleListsDropdown\(this, '([^']+)', '([^']+)'\)/);
        const documentId = matches ? matches[1] : null;
        
        console.log(`[loadUserLists] Cargando listas para documento ${documentId}`);
        console.log(`[loadUserLists] Datos de userListsData:`, userListsData);
        
        listsContainer.innerHTML = userLists.map(list => {
          // Verificar si el documento ya está guardado en esta lista
          const isDocumentSaved = checkIfDocumentSaved(list.name, documentId);
          const checkedAttribute = isDocumentSaved ? 'checked' : '';
          
          console.log(`[loadUserLists] Lista "${list.name}" (${list.id}): documento ${isDocumentSaved ? 'SÍ' : 'NO'} guardado`);
          
          return `<div class="list-item">
            <div class="checkbox-container">
              <input type="checkbox" id="list_${list.id}" value="${list.id}" ${checkedAttribute} onchange="handleListCheckboxChange(this, '${documentId}')">
              <div class="checkbox-loader" style="display: none;">
                <i class="fas fa-spinner fa-spin"></i>
              </div>
            </div>
            <label for="list_${list.id}" class="list-label">
              <span class="list-name">${list.name}</span>
            </label>
          </div>`;
        }).join('');
      }
    }
    
    // Función para verificar si un documento está guardado en una lista específica
    function checkIfDocumentSaved(listName, documentId) {
      if (!documentId || !userListsData || !userListsData.guardados) {
        console.log(`[checkIfDocumentSaved] Missing data - documentId: ${documentId}, userListsData: ${!!userListsData}, guardados: ${!!userListsData?.guardados}`);
        return false;
      }
      
      const listData = userListsData.guardados[listName];
      if (!listData) {
        console.log(`[checkIfDocumentSaved] Lista "${listName}" no encontrada`);
        return false;
      }
      
      // Verificar si el documento existe en esta lista
      const isDocumentInList = listData.hasOwnProperty(documentId);
      console.log(`[checkIfDocumentSaved] Documento ${documentId} en lista "${listName}": ${isDocumentInList}`);
      return isDocumentInList;
    }
    
    // Función para manejar el cambio de checkbox de lista (acción directa)
    async function handleListCheckboxChange(checkbox, documentId) {
      const dropdown = checkbox.closest('.lists-dropdown');
      const saveButton = dropdown.closest('.guardar-button');
      const dataItem = saveButton.closest('.data-item');
      const listId = checkbox.value;
      
      // Obtener información del documento y lista
      const mainButton = saveButton.querySelector('.save-btn');
      const onclickAttr = mainButton.getAttribute('onclick');
      const matches = onclickAttr.match(/toggleListsDropdown\(this, '([^']+)', '([^']+)'\)/);
      const collectionName = matches ? matches[2] : null;
      
      if (!collectionName) {
        alert('Error: No se pudo obtener la información del documento');
        checkbox.checked = !checkbox.checked; // Revertir cambio
        return;
      }
      
      const listName = userLists.find(list => list.id === listId)?.name;
      if (!listName) {
        alert('Error: No se pudo encontrar la lista');
        checkbox.checked = !checkbox.checked; // Revertir cambio
        return;
      }
      
      // Aplicar feedback visual inmediato - sustituir checkbox por loader
      const checkboxContainer = checkbox.closest('.checkbox-container');
      const loader = checkboxContainer.querySelector('.checkbox-loader');
      
      // Ocultar checkbox y mostrar loader en su lugar
      checkbox.style.display = 'none';
      loader.style.display = 'inline-block';
      
      if (checkbox.checked) {
        // Agregar a la lista
        const documentData = extractDocumentData(dataItem);
        await saveDocumentToList(documentId, collectionName, listId, documentData, checkbox, loader);
      } else {
        // Quitar de la lista
        await removeDocumentFromList(documentId, listId, listName, checkbox, loader);
      }
    }
    
    // Función para guardar un documento en una lista específica
    async function saveDocumentToList(documentId, collectionName, listId, documentData, checkbox, loader) {
      try {
        const response = await fetch('/api/save-document-to-lists', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            documentId: documentId,
            collectionName: collectionName,
            listIds: [listId],
            documentData: documentData
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('Documento guardado exitosamente:', result);
          
          // CRÍTICO: Forzar refresh del cache desde el servidor
          await loadUserListsFromBackend(true);
          
          // Actualizar cache local inmediatamente para reflejar el cambio
          const listName = userLists.find(list => list.id === listId)?.name;
          if (listName && userListsData.guardados) {
            if (!userListsData.guardados[listName]) {
              userListsData.guardados[listName] = {};
            }
            userListsData.guardados[listName][documentId] = {
              documentId: documentId,
              collectionName: collectionName,
              savedAt: new Date(),
              ...documentData
            };
            
            // Actualizar sessionStorage con los nuevos datos
            sessionStorage.setItem('userListsData', JSON.stringify(userListsData));
          }
          
          // Estado final exitoso: mostrar checkbox marcado y ocultar loader
          checkbox.checked = true;
          checkbox.style.accentColor = '#04db8d';
          checkbox.style.display = 'inline-block';
          loader.style.display = 'none';
        } else {
          const error = await response.json();
          alert('Error al guardar el documento: ' + (error.message || 'Error desconocido'));
          // Revertir estado en caso de error
          checkbox.checked = false;
          checkbox.style.accentColor = '';
          checkbox.style.display = 'inline-block';
          loader.style.display = 'none';
        }
      } catch (error) {
        console.error('Error saving document:', error);
        alert('Error al guardar el documento. Por favor, inténtalo de nuevo.');
        // Revertir estado en caso de error
        checkbox.checked = false;
        checkbox.style.accentColor = '';
        checkbox.style.display = 'inline-block';
        loader.style.display = 'none';
      }
    }
    
    // Función para quitar un documento de una lista específica
    async function removeDocumentFromList(documentId, listId, listName, checkbox, loader) {
      try {
        const response = await fetch('/api/remove-document-from-list', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            documentId: documentId,
            listId: listId,
            listName: listName
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('Documento removido exitosamente:', result);
          
          // CRÍTICO: Forzar refresh del cache desde el servidor
          await loadUserListsFromBackend(true);
          
          // Actualizar cache local inmediatamente para reflejar el cambio
          if (listName && userListsData.guardados && userListsData.guardados[listName]) {
            delete userListsData.guardados[listName][documentId];
            
            // Actualizar sessionStorage con los nuevos datos
            sessionStorage.setItem('userListsData', JSON.stringify(userListsData));
          }
          
          // Estado final exitoso: mostrar checkbox desmarcado y ocultar loader
          checkbox.checked = false;
          checkbox.style.accentColor = '';
          checkbox.style.display = 'inline-block';
          loader.style.display = 'none';
        } else {
          const error = await response.json();
          alert('Error al eliminar el documento: ' + (error.message || 'Error desconocido'));
          // Revertir estado en caso de error
          checkbox.checked = true;
          checkbox.style.accentColor = '#04db8d';
          checkbox.style.display = 'inline-block';
          loader.style.display = 'none';
        }
      } catch (error) {
        console.error('Error removing document:', error);
        alert('Error al eliminar el documento. Por favor, inténtalo de nuevo.');
        // Revertir estado en caso de error
        checkbox.checked = true;
        checkbox.style.accentColor = '#04db8d';
        checkbox.style.display = 'inline-block';
        loader.style.display = 'none';
      }
    }
    
    // Función para mostrar feedback visual (DEPRECATED - eliminada)
    // Esta función ya no se usa con el nuevo sistema de feedback visual inmediato
    
    // Función para actualizar la visibilidad del botón OK (mantenida para compatibilidad)
    function updateSaveButton(checkbox) {
      // Esta función ya no se usa con el nuevo comportamiento directo
      // Mantenida solo para compatibilidad con código existente
    }
    
    // Función para guardar en las listas seleccionadas
    async function saveToSelectedLists(okButton) {
      const dropdown = okButton.closest('.lists-dropdown');
      const checkedBoxes = dropdown.querySelectorAll('.lists-container input[type="checkbox"]:checked');
      
      if (checkedBoxes.length === 0) {
        alert('Por favor, selecciona al menos una lista');
        return;
      }
      
      // Obtener información del documento
      const saveButton = dropdown.closest('.guardar-button');
      const dataItem = saveButton.closest('.data-item');
      
      // Obtener el documentId y collectionName desde el botón
      const mainButton = saveButton.querySelector('.save-btn');
      const onclickAttr = mainButton.getAttribute('onclick');
      const matches = onclickAttr.match(/toggleListsDropdown\(this, '([^']+)', '([^']+)'\)/);
      const documentId = matches ? matches[1] : null;
      const collectionName = matches ? matches[2] : null;
      
      if (!documentId || !collectionName) {
        alert('Error: No se pudo obtener la información del documento');
        return;
      }
      
      // Extraer información completa del documento
      const documentData = extractDocumentData(dataItem);
      
      // Obtener las listas seleccionadas
      const selectedListIds = Array.from(checkedBoxes).map(cb => cb.value);
      
      try {
        // Guardar el documento en las listas seleccionadas
        const response = await fetch('/api/save-document-to-lists', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin', // Incluir cookies de autenticación
          body: JSON.stringify({
            documentId: documentId,
            collectionName: collectionName,
            listIds: selectedListIds,
            documentData: documentData
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('Documento guardado exitosamente:', result);
          
          // Mostrar feedback visual en el botón principal
          const mainSaveBtn = saveButton.querySelector('.save-btn');
          const originalText = mainSaveBtn.innerHTML;
          mainSaveBtn.innerHTML = '<i class="fas fa-check"></i> Guardado';
          mainSaveBtn.style.backgroundColor = '#04db8d';
          mainSaveBtn.style.color = 'white';
          
          // Cerrar el desplegable inmediatamente
          dropdown.classList.remove('show');
          
          // Resetear checkboxes y botón OK
          checkedBoxes.forEach(cb => cb.checked = false);
          okButton.classList.remove('show');
          
          setTimeout(() => {
            mainSaveBtn.innerHTML = originalText;
            mainSaveBtn.style.backgroundColor = '';
            mainSaveBtn.style.color = '';
          }, 2000);
        } else {
          const error = await response.json();
          alert('Error al guardar el documento: ' + (error.message || 'Error desconocido'));
        }
      } catch (error) {
        console.error('Error saving document:', error);
        alert('Error al guardar el documento. Por favor, inténtalo de nuevo.');
      }
    }
    
    // Función para guardar un documento en una lista existente (DEPRECATED - mantenida por compatibilidad)
    function saveToList(listId, listName, element) {
      // Esta función ya no se usa con la nueva lógica de checkboxes
      console.log('saveToList is deprecated, use saveToSelectedLists instead');
    }
    
    // Función para mostrar el formulario de nueva lista
    function showNewListForm(element) {
      const dropdown = element.closest('.lists-dropdown');
      const newListForm = dropdown.querySelector('.new-list-form');
      const addNewButton = dropdown.querySelector('.add-new-list');
      
      addNewButton.style.display = 'none';
      newListForm.classList.add('show');
      
      // Enfocar el input
      const input = newListForm.querySelector('.new-list-input');
      input.focus();
      input.value = '';
    }
    
    // Función para ocultar el formulario de nueva lista
    function hideNewListForm(element) {
      const dropdown = element.closest('.lists-dropdown');
      const newListForm = dropdown.querySelector('.new-list-form');
      const addNewButton = dropdown.querySelector('.add-new-list');
      
      newListForm.classList.remove('show');
      addNewButton.style.display = 'flex';
    }
    
    // Función para crear una nueva lista
    async function createNewList(element, documentId, collectionName) {
      const dropdown = element.closest('.lists-dropdown');
      const input = dropdown.querySelector('.new-list-input');
      const listName = input.value.trim();
      
      if (!listName) {
        alert('Por favor, introduce un nombre para la lista');
        input.focus();
        return;
      }
      
      // Verificar que no existe una lista con el mismo nombre
      if (userLists.some(list => list.name.toLowerCase() === listName.toLowerCase())) {
        alert('Ya existe una lista con ese nombre');
        input.focus();
        return;
      }
      
      try {
        // Debug: Imprimir datos que se van a enviar
        console.log('Enviando datos a la API:', { listName: listName });
        
        // Crear nueva lista en el backend
        const response = await fetch('/api/create-user-list', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin', // Incluir cookies de autenticación
          body: JSON.stringify({
            listName: listName
          })
        });
        
        console.log('Respuesta de la API:', response.status, response.statusText);
        
        if (response.ok) {
          const result = await response.json();
          console.log('Lista creada exitosamente:', result);
          
          // Añadir la nueva lista al array local y sessionStorage
          const newList = {
            id: result.listId,
            name: listName
          };
          addListToStorage(newList);
          
          // Recargar las listas en el desplegable
          loadUserLists(dropdown);
          
          // Seleccionar automáticamente la nueva lista
          const newCheckbox = dropdown.querySelector(`input[value="${newList.id}"]`);
          if (newCheckbox) {
            newCheckbox.checked = true;
            updateSaveButton(newCheckbox);
          }
          
          // Ocultar el formulario
          hideNewListForm(element);
        } else {
          let errorMessage = `Error ${response.status}: ${response.statusText}`;
          try {
            const error = await response.json();
            console.log('Error detallado de la API:', error);
            errorMessage = error.error || error.message || errorMessage;
          } catch (e) {
            console.log('No se pudo parsear el error JSON');
          }
          alert('Error al crear la lista: ' + errorMessage);
          console.error('Error completo:', { status: response.status, statusText: response.statusText });
        }
      } catch (error) {
        console.error('Error creating list:', error);
        alert('Error al crear la lista. Por favor, inténtalo de nuevo.');
      }
    }
    
    // Cerrar desplegables al hacer clic fuera
    document.addEventListener('click', function(event) {
      if (event.target && !event.target.closest('.guardar-button')) {
        document.querySelectorAll('.lists-dropdown.show').forEach(dropdown => {
          dropdown.classList.remove('show');
        });
      }
    });
    
    // Manejar Enter en el input de nueva lista
    document.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' && event.target.classList.contains('new-list-input')) {
        const saveButton = event.target.closest('.new-list-form').querySelector('.new-list-btn.save');
        saveButton.click();
      }
    });
    
    // ==================== FUNCIONES PARA LA SECCIÓN "TUS LISTAS" ====================
    
    // Función para cargar las listas detalladas desde el backend
    async function loadDetailedUserLists() {
      const loadingElement = document.getElementById('listas-loading');
      const containerElement = document.getElementById('listas-container');
      const noListasMessage = document.getElementById('no-listas-message');
      
      if (!loadingElement || !containerElement || !noListasMessage) return;
      
      try {
        console.log('[TusListas] Cargando las listas detalladas del usuario.');
        loadingElement.style.display = 'block';
        containerElement.innerHTML = '';
        noListasMessage.style.display = 'none';
        
        const response = await fetch('/api/get-user-lists', {
          credentials: 'same-origin'
        });
        if (!response.ok) {
          throw new Error('Error al cargar las listas');
        }
        
        const data = await response.json();
        const lists = data.lists || [];
        
        if (lists.length === 0) {
          noListasMessage.style.display = 'block';
        } else {
          renderListCards(lists, data.guardados || {});
        }
        
      } catch (error) {
        console.error('Error loading detailed lists:', error);
        containerElement.innerHTML = '<div style="color: red; text-align: center; padding: 20px;">Error al cargar las listas</div>';
      } finally {
        loadingElement.style.display = 'none';
      }
    }
    
    // Función para renderizar las tarjetas de listas
    function renderListCards(lists, guardadosData) {
      const container = document.getElementById('listas-container');
      if (!container) return;
      
      console.log(`[TusListas] Renderizando ${lists.length} tarjetas de lista.`);
      const cardsHtml = lists.map(list => {
        const listData = guardadosData[list.name] || {};
        const documents = Object.values(listData);
        const documentCount = documents.length;
        
        // Encontrar el último documento añadido
        let lastAddedDate = 'Nunca';
        if (documentCount > 0) {
          const sortedDocs = documents.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
          const lastDoc = sortedDocs[0];
          if (lastDoc && lastDoc.savedAt) {
            const date = new Date(lastDoc.savedAt);
            lastAddedDate = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
          }
        }
        
        return `
          <div class="lista-card">
            <div class="lista-card-header">
              <h3 class="lista-title">${list.name}</h3>
            </div>
            <div class="lista-stats">
              <div class="lista-stat">
                <span class="lista-stat-label">Número de documentos:</span>
                <span class="lista-stat-value">${documentCount}</span>
              </div>
              <div class="lista-stat">
                <span class="lista-stat-label">Último documento añadido:</span>
                <span class="lista-stat-value">${lastAddedDate}</span>
              </div>
            </div>
            <div class="lista-card-footer">
              <button class="generar-contenido-btn" onclick="generarContenido('${list.name}')" ${documentCount === 0 ? 'disabled' : ''}>
                Generar contenido
              </button>
              <button class="delete-lista-btn" onclick="deleteUserList('${list.name}')" title="Eliminar lista">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
      
      container.innerHTML = cardsHtml;
    }
    
    // Función para eliminar una lista
    async function deleteUserList(listName) {
      if (!confirm(`¿Estás seguro de que quieres eliminar la lista "${listName}"? Esta acción no se puede deshacer.`)) {
        return;
      }
      
      try {
        console.log(`[TusListas] Eliminando la lista: "${listName}"`);
        const response = await fetch('/api/delete-user-list', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin', // Incluir cookies de autenticación
          body: JSON.stringify({
            listName: listName
          })
        });
        
        if (response.ok) {
          // Actualizar el cache local
          userLists = userLists.filter(list => list.name !== listName);
          updateUserListsInStorage(userLists);
          
          // Recargar la vista de listas
          loadDetailedUserLists();
          
          console.log('Lista eliminada exitosamente:', listName);
        } else {
          const error = await response.json();
          alert('Error al eliminar la lista: ' + (error.message || 'Error desconocido'));
        }
      } catch (error) {
        console.error('Error deleting list:', error);
        alert('Error al eliminar la lista. Por favor, inténtalo de nuevo.');
      }
    }
    
    // Función placeholder para generar contenido
    function generarContenido(listName) {
      console.log(`[TusListas] 'Generar contenido' presionado para la lista: "${listName}"`);
      // Cambiar a la vista de generación de contenido
      showGenerarContenidoPage(listName);
    }
