(function(){
  /* ------------------ DATA ------------------ */
  let onboardingStructure = null;
  const onboardingContainer = document.getElementById('onboarding-container');
  const profileView = document.getElementById('profile-summary-view');
  const configLoader = document.getElementById('config-loader');
  
  // Check for existing profile data on load
  fetch('/api/get-user-data')
      .then(res => res.json())
      .then(userData => {
          // Update usage trackers with user data
          updateUsageTrackers(userData);
          
          // Always populate fuentes when user data is loaded
          populateFuentes(userData.cobertura_legal);
          
          if (userData && userData.perfil_regulatorio) {
              // If profile exists, display it directly
              renderFinalView(userData);
              if (onboardingContainer) onboardingContainer.style.display = 'none';
              if (profileView) profileView.style.display = 'block';
          } else {
              // If not, fetch the form structure and start onboarding
              return fetch('/views/configuracion/estructura_onboarding.json')
                .then(res=>res.json())
                .then(json=>{
                  onboardingStructure=json;
                  startOnboarding();
                })
          }
      })
      .catch(err => {
          console.error('Error fetching initial data:', err);
          // On error, try to show the form as a fallback
          if(onboardingContainer) onboardingContainer.style.display = 'block';
          // Still try to populate fuentes even on error
          populateFuentes(null);
      })
      .finally(() => {
          if (configLoader) configLoader.style.display = 'none';
      });

  /* -------------- HELPERS -------------- */
  const onboardingForm = document.getElementById('onboarding-form');
  const summaryContainer = document.getElementById('summary-tags');
  const completionMessage = document.getElementById('completion-message');
  const answers = [];
  const answerByKey = {};
  window.onboardingAnswers = answerByKey;

  function toTitle(str){
    if (!str) return '';
    const lower=str.replace(/^pregunta[_ ]?/i,'').replace(/_/g,' ').trim().toLowerCase();
    const titled=lower.replace(/(^|[\s\|])\p{L}/gu, match=>match.toUpperCase());
    return titled.replace(/\b(De|Del|Y)\b/g, m=>m.toLowerCase()).replace(/M&a/i,'M&A').replace(/Esg/i,'ESG').replace(/Tmt/i,'TMT');
  }

  function renderSummary(){
    summaryContainer.innerHTML='';
    answers.forEach(({question,answer}, idx)=>{
      const tag=document.createElement('span');
      tag.className='summary-tag';
      tag.innerHTML=`<strong>${toTitle(question)}:</strong> ${answer} <span class="tick">✓</span>`;
      tag.addEventListener('click', ()=> goToStep(idx) );
      summaryContainer.appendChild(tag);
    });
  }

  // Store original data for edit functionality
  let originalContextData = {};

  function renderFinalView(data) {
      const tableBody = document.querySelector('#profile-summary-view .summary-table tbody');
      const profileContent = document.getElementById('regulatory-profile-content');
      const coberturaBtn = document.getElementById('configuraCoberturaBtn');

      if (!tableBody || !profileContent || !coberturaBtn) return;
      
      // Store original data for editing
      originalContextData = {
          tipo_empresa: data.tipo_empresa || '',
          sector: data.detalle_empresa?.sector || '',
          actividad: data.detalle_empresa?.actividad || '',
          interes: data.interes || '',
          tamaño_empresa: data.tamaño_empresa || '',
          web: data.web || '',
          perfil_regulatorio: data.perfil_regulatorio || ''
      };
      
      // Siempre mostrar el botón de cobertura
      coberturaBtn.style.display = 'block';
      coberturaBtn.onclick = () => {
          // Switch to "Fuentes" tab
          const menuItems = document.querySelectorAll('.config-menu-item');
          menuItems.forEach(item => {
              if (item.dataset.content === 'fuentes') {
                  item.click();
              }
          });
      };

      tableBody.innerHTML = '';
      profileContent.innerHTML = '';

      const createRow = (variable, valor, fieldKey) => {
          if (!valor || valor.trim() === '') return '';
          let displayValue = fieldKey === 'web' ? `<a href="${valor}" target="_blank">${valor}</a>` : valor;
          
          // ✅ MEJORA 2: Agregar warning icon para web si hay errores de extracción
          if (fieldKey === 'web' && data.website_extraction_status && !data.website_extraction_status.success) {
              // ✅ Agregar warning icon solo si hubo error de extracción
              const warningIcon = `<span class="web-warning-icon">&#9888;</span>`; /* ⚠️ */
              displayValue += ` ${warningIcon}`;
          } else if (fieldKey === 'web') {
              // ✅ No warning icon needed for web field (successful extraction or no status)
              console.log('✅ No warning icon needed for web field');
          }
          
          return `<tr data-field="${fieldKey}"><td>${variable}</td><td class="field-value">${displayValue}</td></tr>`;
      };

      let tableHtml = '';
      tableHtml += createRow('Tipo de Empresa', data.tipo_empresa, 'tipo_empresa');
      if (data.detalle_empresa) {
          tableHtml += createRow('Sector', data.detalle_empresa.sector, 'sector');
          tableHtml += createRow('Actividad', data.detalle_empresa.actividad, 'actividad');
      }
      tableHtml += createRow('Interés', data.interes, 'interes');
      tableHtml += createRow('Tamaño Empresa', data.tamaño_empresa, 'tamaño_empresa');
      tableHtml += createRow('Web', data.web, 'web');
      tableBody.innerHTML = tableHtml;

      profileContent.innerHTML = data.perfil_regulatorio || '<p>No se ha generado un perfil regulatorio.</p>';
      
      // Initialize edit functionality
      initializeContextEdit();
  }

  function initializeContextEdit() {
      const editBtn = document.getElementById('editContextBtn');
      const editControls = document.getElementById('editContextControls');
      const cancelBtn = document.getElementById('cancelEditBtn');
      const saveBtn = document.getElementById('saveEditBtn');
      const contextTable = document.getElementById('contextTable');
      const profileContent = document.getElementById('regulatory-profile-content');

      if (!editBtn || !editControls || !cancelBtn || !saveBtn || !contextTable || !profileContent) return;

      editBtn.addEventListener('click', () => enterEditMode());
      cancelBtn.addEventListener('click', () => exitEditMode());
      saveBtn.addEventListener('click', () => saveContextChanges());

      function enterEditMode() {
          editBtn.style.display = 'none';
          editControls.style.display = 'flex';
          contextTable.classList.add('editing');
          profileContent.classList.add('editing');

          // Convert table cells to inputs
          const tableRows = contextTable.querySelectorAll('tbody tr');
          tableRows.forEach(row => {
              const fieldKey = row.dataset.field;
              const valueCell = row.querySelector('.field-value');
              if (valueCell && fieldKey) {
                  const currentValue = getPlainTextValue(originalContextData[fieldKey] || '');
                  
                  // Create text input for all fields
                  const inputElement = document.createElement('input');
                  inputElement.type = 'text';
                  inputElement.className = 'editable-field';
                  inputElement.value = currentValue;
                  
                  // Add placeholder text for guidance
                  if (fieldKey === 'tipo_empresa') {
                      inputElement.placeholder = 'Ej: Consultora, Despacho, Empresa Regulada, etc.';
                  } else if (fieldKey === 'interes') {
                      inputElement.placeholder = 'Ej: Energía, Construcción, Agrícola, Financiero, etc.';
                  } else if (fieldKey === 'tamaño_empresa') {
                      inputElement.placeholder = 'Ej: 0-20 empleados, 20-100 empleados, etc.';
                  } else if (fieldKey === 'web') {
                      inputElement.placeholder = 'Ej: https://www.ejemplo.com';
                  } else if (fieldKey === 'sector') {
                      inputElement.placeholder = 'Ej: Tecnología, Consultoría, etc.';
                  } else if (fieldKey === 'actividad') {
                      inputElement.placeholder = 'Ej: Desarrollo de software, Asesoría legal, etc.';
                  }
                  
                  valueCell.innerHTML = '';
                  valueCell.appendChild(inputElement);
              }
          });

          // Convert profile content to textarea
          const currentProfileContent = profileContent.innerHTML;
          profileContent.innerHTML = `<textarea class="editable-profile">${getPlainTextValue(originalContextData.perfil_regulatorio)}</textarea>`;
      }

      function exitEditMode() {
          editBtn.style.display = 'flex';
          editControls.style.display = 'none';
          contextTable.classList.remove('editing');
          profileContent.classList.remove('editing');

          // Restore original values
          const tableRows = contextTable.querySelectorAll('tbody tr');
          tableRows.forEach(row => {
              const fieldKey = row.dataset.field;
              const valueCell = row.querySelector('.field-value');
              if (valueCell && fieldKey) {
                  const originalValue = originalContextData[fieldKey] || '';
                  let displayValue = fieldKey === 'web' && originalValue ? 
                      `<a href="${originalValue}" target="_blank">${originalValue}</a>` : originalValue;
                  
                  // ✅ Restaurar warning icon si había error de extracción web
                  if (fieldKey === 'web' && originalContextData.website_extraction_status && !originalContextData.website_extraction_status.success) {
                      const warningIcon = `<span class="web-warning-icon">&#9888;</span>`;
                      displayValue += ` ${warningIcon}`;
                  }
                  
                  valueCell.innerHTML = displayValue;
              }
          });

          // Restore profile content
          profileContent.innerHTML = originalContextData.perfil_regulatorio || '<p>No se ha generado un perfil regulatorio.</p>';
      }

      async function saveContextChanges() {
          try {
              saveBtn.disabled = true;
              saveBtn.innerHTML = '<div class="button-spinner"></div>';
              saveBtn.style.width = saveBtn.offsetWidth + 'px'; // Prevent button resize

             // Collect updated data
             const updatedData = {};
             const detalleEmpresa = {};
             
             const tableRows = contextTable.querySelectorAll('tbody tr');
             tableRows.forEach(row => {
                 const fieldKey = row.dataset.field;
                 const input = row.querySelector('.editable-field');
                 if (input && fieldKey) {
                     const value = input.value.trim();
                     if (fieldKey === 'sector' || fieldKey === 'actividad') {
                         detalleEmpresa[fieldKey] = value;
                     } else {
                         updatedData[fieldKey] = value;
                     }
                 }
             });

             // Add detalle_empresa if it has content
             if (Object.keys(detalleEmpresa).length > 0) {
                 updatedData.detalle_empresa = detalleEmpresa;
             }

             // Get updated profile content
             const profileTextarea = profileContent.querySelector('.editable-profile');
             if (profileTextarea) {
                 updatedData.perfil_regulatorio = profileTextarea.value.trim();
             }

             // Send to server
             const response = await fetch('/api/update-user-data', {
                 method: 'POST',
                 headers: {
                     'Content-Type': 'application/json'
                 },
                 body: JSON.stringify(updatedData)
             });

             if (!response.ok) {
                 throw new Error('Failed to save changes');
             }

             const result = await response.json();
             
             if (result.success) {
                 // Update original data
                 Object.assign(originalContextData, {
                     ...updatedData,
                     sector: detalleEmpresa.sector || originalContextData.sector,
                     actividad: detalleEmpresa.actividad || originalContextData.actividad
                 });

                 // Exit edit mode and refresh display
                 exitEditMode();
                 
                 // Show success message briefly
                 saveBtn.innerHTML = '✓ Guardado';
                 setTimeout(() => {
                     saveBtn.innerHTML = 'Guardar';
                     saveBtn.disabled = false;
                     saveBtn.style.width = 'auto'; // Reset button width
                 }, 2000);
             } else {
                 throw new Error(result.error || 'Failed to save changes');
             }

          } catch (error) {
              console.error('Error saving context changes:', error);
              alert('Error al guardar los cambios. Por favor, inténtalo de nuevo.');
              
              saveBtn.innerHTML = 'Guardar';
              saveBtn.disabled = false;
              saveBtn.style.width = 'auto'; // Reset button width
          }
      }

      function getPlainTextValue(htmlContent) {
          if (!htmlContent) return '';
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = htmlContent;
          return tempDiv.textContent || tempDiv.innerText || '';
      }
  }

  /* --------- STEP MANAGEMENT --------- */
  const steps = [];
  function clearStepsFrom(index){
    while(steps.length > index){
      const s = steps.pop();
      const removedKey = s.element.dataset.key;
      if(removedKey) delete answerByKey[removedKey];
      s.element.remove();
      answers.splice(index,1);
    }
    // Reset flags based on remaining steps
    motivacionAsked = steps.some(st => st.element.dataset.key === 'motivacion_principal');
    extraInfoAsked = steps.some(st => st.element.dataset.key === 'num_empleados');
    renderSummary();
    updateTrackers();
  }

  function goToStep(idx){
    steps.forEach((st,i)=> st.element.classList.toggle('active', i===idx));
  }

  function createStepElement(questionText){
    const section=document.createElement('section');
    section.className='form-step';
    section.innerHTML=`<div class="step-header"><p class="question-text">${questionText}</p><span class="step-tracker"></span></div>`;
    onboardingForm.appendChild(section);
    steps.push({element:section});
    return section;
  }

  function updateTrackers(){
    // Calculate total steps dynamically based on flow
    const hasOtroEmpresa = steps.some(st => st.element.dataset.key === 'empresa_otro_detalle');
    const TOTAL_STEPS = hasOtroEmpresa ? 6 : 5;
    
    const getStepNumber = (key)=>{
      if(key==='tipo_empresa') return 1;
      if(key==='empresa_otro_detalle') return 2;
      if(key==='motivacion_principal') return hasOtroEmpresa ? 3 : 3;
      if(key==='num_empleados') return hasOtroEmpresa ? 4 : 4;
      if(key==='web_empresa') return hasOtroEmpresa ? 5 : 5;
      return hasOtroEmpresa ? 3 : 2; // Default for other second-level questions
    };
    steps.forEach((s)=>{
      const tracker=s.element.querySelector('.step-tracker');
      if(tracker){
        const num = getStepNumber(s.element.dataset.key);
        tracker.textContent=`${num} de ${TOTAL_STEPS}`;
      }
    });
  }

  function showCustomInput(section, questionText, questionKey, proceedCallback) {
    // Remove existing custom input if any
    const existingCustomInput = section.querySelector('.custom-input-container');
    if (existingCustomInput) {
      existingCustomInput.remove();
    }
    
    // Create custom input container
    const customContainer = document.createElement('div');
    customContainer.className = 'custom-input-container';
    
    // Create input field
    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.className = 'input-field';
    customInput.placeholder = 'Especifica tu respuesta...';
    customInput.style.marginBottom = '12px';
    
    // Create confirm button
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'next-btn';
    confirmBtn.textContent = 'Confirmar';
    confirmBtn.addEventListener('click', () => {
      const customValue = customInput.value.trim();
      if (!customValue) {
        alert('Por favor, introduce una respuesta.');
        return;
      }
      
      // Handle the custom answer
      handleAnswer(section, questionText, customValue);
      proceedCallback(customValue);
    });
    
    // Handle Enter key
    customInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        confirmBtn.click();
      }
    });
    
    // Append to container
    customContainer.appendChild(customInput);
    customContainer.appendChild(confirmBtn);
    
    // Add to section
    section.appendChild(customContainer);
    
    // Focus on input
    setTimeout(() => customInput.focus(), 100);
  }

  function showCustomInputMultiSelect(section, questionText, questionKey, selectedValues, proceedCallback) {
    // Remove existing custom input if any
    const existingCustomInput = section.querySelector('.custom-input-container');
    if (existingCustomInput) {
      existingCustomInput.remove();
    }
    
    // Create custom input container
    const customContainer = document.createElement('div');
    customContainer.className = 'custom-input-container';
    
    // Show selected values (excluding "Otro")
    const otherValues = selectedValues.filter(val => val.toLowerCase() !== 'otro');
    if (otherValues.length > 0) {
      const selectedText = document.createElement('p');
      selectedText.style.fontSize = '14px';
      selectedText.style.color = '#7a8a93';
      selectedText.style.marginBottom = '12px';
      selectedText.textContent = `Seleccionado: ${otherValues.map(val => toTitle(val)).join(', ')}`;
      customContainer.appendChild(selectedText);
    }
    
    // Create input field for custom value
    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.className = 'input-field';
    customInput.placeholder = 'Especifica la opción "Otro"...';
    customInput.style.marginBottom = '12px';
    
    // Create confirm button
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'next-btn';
    confirmBtn.textContent = 'Confirmar';
    confirmBtn.addEventListener('click', () => {
      const customValue = customInput.value.trim();
      if (!customValue) {
        alert('Por favor, especifica la opción "Otro".');
        return;
      }
      
      // Combine other selected values with custom value
      const finalValues = [...otherValues.map(val => toTitle(val)), customValue];
      const answerText = finalValues.join(', ');
      
      // Handle the combined answer
      handleAnswer(section, questionText, answerText);
      proceedCallback(null);
    });
    
    // Handle Enter key
    customInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        confirmBtn.click();
      }
    });
    
    // Append to container
    customContainer.appendChild(customInput);
    customContainer.appendChild(confirmBtn);
    
    // Add to section
    section.appendChild(customContainer);
    
    // Focus on input
    setTimeout(() => customInput.focus(), 100);
  }

  function addOptionsStep(questionKey, questionText, optionsArray, currentNode, subtreeMap){
    const section=createStepElement(questionText);
    section.dataset.type='select';
    section.dataset.key=questionKey;

    const userTipo = (answerByKey['tipo_empresa']||'').toLowerCase();
    const previousAnswerDepartamentos = answerByKey['pregunta_origen_interes']||'';
    
    // Define which questions should allow multiple selection
    const isDespachoAreaMulti = userTipo==='despacho' && questionKey==='pregunta_area_practica';
    // For empresa_regulada, both sector and activity questions should be multiselect
    const isEmpresaReguladaSector = userTipo==='empresa_regulada' && questionKey==='pregunta_sector';
    const isEmpresaReguladaActividad = userTipo==='empresa_regulada' && questionKey==='pregunta_actividad';
    const isMotivacionMulti = questionKey==='motivacion_principal';
    const multiSelect = isDespachoAreaMulti || isEmpresaReguladaSector || isEmpresaReguladaActividad || isMotivacionMulti;
    
    // Debug log to verify multiselect detection
    console.log(`Question: ${questionKey}, UserTipo: ${userTipo}, MultiSelect: ${multiSelect}`);

    const optionsWrap=document.createElement('div');
    optionsWrap.className='options';

    if(userTipo==='consultora' && questionKey==='pregunta_especializacion'){
      section.insertAdjacentHTML('beforeend', '<p style="font-size:14px;color:#7a8a93;margin-bottom:18px;">¿En qué tipo de consultoría estás especializado?</p>');
    }
    if(userTipo==='despacho' && questionKey==='pregunta_origen_interes'){
      questionText='Departamentos interesados';
      section.querySelector('.question-text').textContent=questionText;
      section.insertAdjacentHTML('beforeend', '<p style="font-size:14px;color:#7a8a93;margin-bottom:18px;">Selecciona los departamentos interesados del despacho.</p>');
      optionsArray=['Departamento del conocimiento | Varios departamentos','Área práctica concreta'];
    }
    if(questionKey==='motivacion_principal'){
      section.insertAdjacentHTML('beforeend', '<p style="font-size:14px;color:#7a8a93;margin-bottom:18px;">Selecciona uno o más de uno</p>');
    }
    if(questionKey==='pregunta_area_practica'){
      section.insertAdjacentHTML('beforeend', '<p style="font-size:14px;color:#7a8a93;margin-bottom:18px;">Selecciona una o más áreas de práctica</p>');
    }
    if(questionKey==='pregunta_sector'){
      section.insertAdjacentHTML('beforeend', '<p style="font-size:14px;color:#7a8a93;margin-bottom:18px;">Selecciona uno o más sectores</p>');
    }
    if(questionKey==='pregunta_actividad' && userTipo==='empresa_regulada'){
      section.insertAdjacentHTML('beforeend', '<p style="font-size:14px;color:#7a8a93;margin-bottom:18px;">Selecciona una o más actividades</p>');
    }

    // Add "Select All" checkbox for multiselect questions
    if(multiSelect){
      const selectAllContainer = document.createElement('div');
      selectAllContainer.style.marginBottom = '15px';
      selectAllContainer.style.padding = '10px';
      selectAllContainer.style.backgroundColor = '#f8f9fa';
      selectAllContainer.style.borderRadius = '8px';
      selectAllContainer.style.border = '1px solid #e9ecef';
      
      const selectAllCheckbox = document.createElement('input');
      selectAllCheckbox.type = 'checkbox';
      selectAllCheckbox.id = `selectAll_${questionKey}`;
      selectAllCheckbox.style.marginRight = '8px';
      
      const selectAllLabel = document.createElement('label');
      selectAllLabel.htmlFor = `selectAll_${questionKey}`;
      selectAllLabel.textContent = 'Seleccionar todos';
      selectAllLabel.style.fontSize = '14px';
      selectAllLabel.style.fontWeight = '500';
      selectAllLabel.style.cursor = 'pointer';
      selectAllLabel.style.color = 'var(--text-color)';
      
      selectAllContainer.appendChild(selectAllCheckbox);
      selectAllContainer.appendChild(selectAllLabel);
      section.appendChild(selectAllContainer);
      
      // Handle select all functionality
      selectAllCheckbox.addEventListener('change', ()=>{
        const allOptions = section.querySelectorAll('.option-box');
        if(selectAllCheckbox.checked){
          allOptions.forEach(opt => opt.classList.add('selected'));
        } else {
          allOptions.forEach(opt => opt.classList.remove('selected'));
        }
      });
    }

    optionsArray.forEach(opt=>{
      const box=document.createElement('div');
      box.className='option-box';
      let displayText=toTitle(opt);
      if(questionKey==='num_empleados') displayText+= ' empleados';
      box.textContent=displayText;
      box.dataset.value=opt;
      box.addEventListener('click',()=>{
        if(multiSelect){
          box.classList.toggle('selected');
          
          // Update "Select All" checkbox state
          const selectAllCheckbox = section.querySelector(`#selectAll_${questionKey}`);
          if(selectAllCheckbox){
            const allOptions = section.querySelectorAll('.option-box');
            const selectedOptions = section.querySelectorAll('.option-box.selected');
            selectAllCheckbox.checked = allOptions.length === selectedOptions.length;
          }
        } else {
          section.querySelectorAll('.option-box').forEach(o=>o.classList.remove('selected'));
          box.classList.add('selected');
          
          // Check if "Otro" was selected and show custom input
          if(opt.toLowerCase() === 'otro'){
            showCustomInput(section, questionText, questionKey, proceedAfterSelection);
          } else {
            handleAnswer(section, questionText, toTitle(opt));
            proceedAfterSelection(opt);
          }
        }
      });
      optionsWrap.appendChild(box);
    });
    section.appendChild(optionsWrap);

    if(multiSelect){
      const nextBtn=document.createElement('button');
      nextBtn.className='next-btn';
      nextBtn.textContent='Siguiente';
      nextBtn.style.marginTop='18px';
      nextBtn.addEventListener('click',()=>{
        const selectedBoxes=[...section.querySelectorAll('.option-box.selected')];
        if(!selectedBoxes.length) {
          alert('Por favor, selecciona al menos una opción.');
          return;
        }
        
        const selectedValues = selectedBoxes.map(b=>b.dataset.value);
        const hasOtro = selectedValues.some(val => val.toLowerCase() === 'otro');
        
        if(hasOtro){
          showCustomInputMultiSelect(section, questionText, questionKey, selectedValues, proceedAfterSelection);
        } else {
          const answerText = selectedBoxes.map(b=>toTitle(b.dataset.value)).join(', ');
          handleAnswer(section, questionText, answerText);
          
          // For empresa_regulada multiselect, we need special handling
          if(userTipo==='empresa_regulada' && questionKey==='pregunta_sector'){
            // Pass all selected sectors to continue the flow
            proceedAfterSelection(selectedValues);
          } else {
            proceedAfterSelection(null);
          }
        }
      });
      section.appendChild(nextBtn);
    }
    showOnly(section);
    updateTrackers();

    function proceedAfterSelection(optChosen){
      // Helper function to deep clone objects to avoid mutating the original structure
      const cloneDeep = (obj) => obj ? JSON.parse(JSON.stringify(obj)) : null;
      
      if(questionKey==='tipo_empresa'){
        // Special case for "otro" - go directly to custom input
        if(optChosen && optChosen.toLowerCase() === 'otro'){
          addInputStep('empresa_otro_detalle','Indicanos a que se dedica tu empresa','Describe brevemente la actividad de tu empresa');
          return;
        }
        
        const freshBranch = subtreeMap ? cloneDeep(subtreeMap[optChosen]) : null;
        generateFromNode(freshBranch);
        return;
      }
      if(questionKey==='num_empleados'){
        addInputStep('web_empresa','¿Cuál es la página web de tu empresa?','');
        return;
      }
      
      // Special handling for empresa_regulada multiselect
      if(userTipo==='empresa_regulada' && questionKey==='pregunta_sector' && Array.isArray(optChosen)){
        // Combine activities from all selected sectors
        const combinedActivities = new Set();
        optChosen.forEach(sector => {
          if(subtreeMap && subtreeMap[sector] && subtreeMap[sector].pregunta_actividad){
            subtreeMap[sector].pregunta_actividad.forEach(activity => {
              combinedActivities.add(activity);
            });
          }
        });
        
        if(combinedActivities.size > 0){
          // Create a synthetic node with combined activities
          const syntheticNode = {
            pregunta_actividad: Array.from(combinedActivities).sort()
          };
          generateFromNode(syntheticNode);
          return;
        }
      }
      
      // Get the next branch data without mutating the original
      const nextData = subtreeMap ? cloneDeep(subtreeMap[(optChosen||'')]) : null;
      
      // Clone current node and remove the current question to avoid repeating it
      const currentNodeClone = cloneDeep(currentNode);
      if(currentNodeClone && questionKey in currentNodeClone) {
        delete currentNodeClone[questionKey];
      }
      
      generateFromNode(nextData || currentNodeClone);
    }
  }

  function addInputStep(questionKey, questionText, placeholder){
    const section=createStepElement(questionText);
    section.dataset.type='input';
    section.dataset.key=questionKey;
    
    if(questionKey === 'web_empresa'){
      // Create a container for the URL input with fixed prefix
      const urlContainer = document.createElement('div');
      urlContainer.style.display = 'flex';
      urlContainer.style.alignItems = 'center';
      urlContainer.style.maxWidth = '420px';
      urlContainer.style.margin = '0 auto';
      urlContainer.style.border = '2px solid #e0e0e0';
      urlContainer.style.borderRadius = '10px';
      urlContainer.style.transition = 'border-color 0.2s ease';
      
      // Create the fixed prefix
      const prefix = document.createElement('span');
      prefix.textContent = 'https://';
      prefix.style.padding = '12px 8px 12px 16px';
      prefix.style.fontSize = '15px';
      prefix.style.color = '#7a8a93';
      prefix.style.borderRight = '1px solid #e0e0e0';
      prefix.style.whiteSpace = 'nowrap';
      
      // Create the input field
      const input = document.createElement('input');
      input.type = 'text';
      input.style.flex = '1';
      input.style.padding = '12px 16px 12px 8px';
      input.style.fontSize = '15px';
      input.style.border = 'none';
      input.style.outline = 'none';
      input.style.borderRadius = '0 8px 8px 0';
      input.placeholder = placeholder || 'www.ejemplo.com';
      
      // Focus/blur events for container border
      input.addEventListener('focus', () => {
        urlContainer.style.borderColor = 'var(--primary-color)';
        urlContainer.style.boxShadow = '0 0 0 2px rgba(4,219,141,0.15)';
      });
      input.addEventListener('blur', () => {
        urlContainer.style.borderColor = '#e0e0e0';
        urlContainer.style.boxShadow = 'none';
      });
      
      urlContainer.appendChild(prefix);
      urlContainer.appendChild(input);
      section.appendChild(urlContainer);
    } else {
      section.insertAdjacentHTML('beforeend', `<input type="text" class="input-field" placeholder="${placeholder || ''}">`);
    }
    
    const saveBtn=document.createElement('button');
    if(questionKey === 'web_empresa'){
      saveBtn.className='save-btn web-empresa-btn';
      saveBtn.textContent='Generar perfil';
    } else if(questionKey === 'empresa_otro_detalle'){
      saveBtn.className='save-btn';
      saveBtn.textContent='Siguiente';
    } else {
      saveBtn.className='save-btn';
      saveBtn.textContent='Siguiente';
    }
    const input = section.querySelector('input');
    saveBtn.addEventListener('click',()=>{
      let val=input.value.trim();
      if(!val) return;
      if(questionKey==='web_empresa') {
        // ✅ MEJORA 1: Solo agregar https:// si no está presente
        if (!val.match(/^https?:\/\//i)) {
          val = 'https://' + val;
        }
      }
      handleAnswer(section, questionText, val);
      
      // Special handling for "empresa_otro_detalle" - continue to motivacion_principal
      if(questionKey==='empresa_otro_detalle'){
        if(!motivacionAsked){
          motivacionAsked=true;
          addOptionsStep('motivacion_principal','¿Qué te interesa?', onboardingStructure.motivacion_principal, null);
        } else if(!extraInfoAsked){
          extraInfoAsked=true;
          addOptionsStep('num_empleados','¿Cuál es el tamaño de tu empresa?', ['0-20','20-100','100-1000','+1000'], null);
        } else {
          finalizeOnboarding();
        }
      } else {
        finalizeOnboarding();
      }
    });
    input.addEventListener('keypress',e=> e.key==='Enter' && saveBtn.click() );
    section.appendChild(saveBtn);
    showOnly(section);
    updateTrackers();
  }

  function showOnly(section){
    steps.forEach(st=>st.element.classList.remove('active'));
    section.classList.add('active');
  }

  function handleAnswer(section, questionText, answerText){
    const idx = steps.findIndex(s=>s.element===section);
    answers[idx] = {question:section.dataset.key, answer:answerText};
    answerByKey[section.dataset.key]=answerText;
    
    // Reset progression flags when going back to certain key steps
    if(section.dataset.key === 'tipo_empresa' || section.dataset.key === 'empresa_otro_detalle'){
      motivacionAsked = false;
      extraInfoAsked  = false;
    }
    
    renderSummary();
    clearStepsFrom(idx+1);
  }

  /* --------- GENERATION LOGIC --------- */
  let motivacionAsked=false;
  let extraInfoAsked=false;

  function generateFirstArrayInNode(node){
    if(!node) return false;
    for(const [k,v] of Object.entries(node)){
      if(Array.isArray(v)){
        addOptionsStep(k,toTitle(k),v,node,null);
        return true;
      }
    }
    return false;
  }

  function generateFromNode(node){
    if(node && Object.keys(node).length===0) node=null;
    if(!node){
      if(!motivacionAsked){
        motivacionAsked=true;
        addOptionsStep('motivacion_principal','¿Qué te interesa?', onboardingStructure.motivacion_principal, null);
      } else if(!extraInfoAsked){
        extraInfoAsked=true;
        addOptionsStep('num_empleados','¿Cuál es el tamaño de tu empresa?', ['0-20','20-100','100-1000','+1000'], null);
      } else {
        finalizeOnboarding();
      }
      return;
    }
    
    // First try to find and generate the first array in the current node
    if(generateFirstArrayInNode(node)){ 
      return; 
    }
    
    // Then look for nested objects to continue the flow
    for(const [k,v] of Object.entries(node)){
      if(typeof v==='object' && !Array.isArray(v)){
        // Pass a clean clone to avoid mutations affecting subsequent flows
        const cleanClone = JSON.parse(JSON.stringify(node));
        addOptionsStep(k,toTitle(k),Object.keys(v),cleanClone,v);
        return;
      }
    }
  }

  function finalizeOnboarding(){
    if (onboardingForm) onboardingForm.style.display = 'none';
    if (summaryContainer) summaryContainer.classList.add('fading-out');
    
    if(completionMessage){
      completionMessage.innerHTML = '<div class="spinner" style="margin:20px auto;"></div><p style="margin-top:12px;font-weight:500;color:var(--text-color);">Creando perfil regulatorio…</p>';
      completionMessage.style.display = 'block';
    }

    const answersPayload = window.onboardingAnswers || {};
    const knownKeys = ['tipo_empresa', 'motivacion_principal', 'num_empleados', 'web_empresa'];
    const detailKeys = Object.keys(answersPayload).filter(k => !knownKeys.includes(k));
    const detalle_empresa = {};
    if (detailKeys.length > 0 && answersPayload[detailKeys[0]]) detalle_empresa.sector = answersPayload[detailKeys[0]];
    if (detailKeys.length > 1 && answersPayload[detailKeys[1]]) detalle_empresa.actividad = answersPayload[detailKeys[1]];

    const onboardingDataToSave = {
      tipo_empresa: answersPayload['tipo_empresa'],
      interes: answersPayload['motivacion_principal'],
      tamaño_empresa: answersPayload['num_empleados'],
      web: answersPayload['web_empresa'],
      detalle_empresa: detalle_empresa
    };

    fetch('/api/save-onboarding-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(onboardingDataToSave)
    }).catch(err => console.error('Could not save onboarding data:', err));

    fetch('/api/regulatory-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: answersPayload })
    })
    .then(res => res.json())
    .then(data => {
      // ✅ DEBUG: Log received data
      console.log('📥 Received regulatory profile data:', {
        has_html_response: !!data.html_response,
        website_extraction_status: data.website_extraction_status
      });
      
      if(data && data.html_response){
        // ✅ MEJORA 2: Incluir estado de extracción web en finalData
        const finalData = { 
          ...onboardingDataToSave, 
          perfil_regulatorio: data.html_response,
          website_extraction_status: data.website_extraction_status || { success: true, error: null }
        };
        
        // ✅ DEBUG: Log finalData being sent to renderFinalView
        console.log('🔄 Calling renderFinalView with finalData:', {
          has_website_extraction_status: !!finalData.website_extraction_status,
          extraction_success: finalData.website_extraction_status?.success,
          extraction_error: finalData.website_extraction_status?.error
        });
        
        fetch('/api/save-regulatory-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            perfil_regulatorio: data.html_response,
            website_extraction_status: data.website_extraction_status
          })
        }).catch(err => console.error('Could not save regulatory profile:', err));
        
        setTimeout(() => {
            if (completionMessage) completionMessage.style.display = 'none';
            if (summaryContainer) summaryContainer.style.display = 'none';
            renderFinalView(finalData);
            if (profileView) profileView.style.display = 'block';
        }, 400);

      } else {
        completionMessage.innerHTML = '<p style="color:red;">No se pudo generar el perfil regulatorio.</p>';
      }
    })
    .catch(err => {
      console.error('Error generando perfil regulatorio:', err);
      completionMessage.innerHTML = '<p style="color:red;">Ocurrió un error generando el perfil regulatorio.</p>';
    });
  }

  /* --------- BOOTSTRAP --------- */
  function startOnboarding(){
    if (onboardingStructure && onboardingStructure.tipo_empresa) {
      generateFromNode({tipo_empresa:onboardingStructure.tipo_empresa});
    }
  }

  // Expose functions used elsewhere
  window.renderFinalView = renderFinalView;
})();

