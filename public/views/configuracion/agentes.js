// Use a function that can be called when content is loaded dynamically
function initializeConfigurationMenu() {
  const container = document.getElementById('configuracion-iframe-container');
  if (!container) return;
  
  const menuItems = container.querySelectorAll('.config-menu-item');
  const contents = container.querySelectorAll('.config-content');
  
  // Remove any existing event listeners to avoid duplicates
  menuItems.forEach(item => {
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);
  });
  
  // Get the updated menu items after cloning
  const newMenuItems = container.querySelectorAll('.config-menu-item');
  
  newMenuItems.forEach(item => {
    item.addEventListener('click', function() {
      const targetContent = this.getAttribute('data-content');
      
      // Remove active class from all menu items and contents
      newMenuItems.forEach(menuItem => menuItem.classList.remove('active'));
      contents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked menu item and corresponding content
      this.classList.add('active');
      const targetElement = container.querySelector('#' + targetContent + '-content');
      if (targetElement) {
        targetElement.classList.add('active');
        
        // If switching to fuentes content, check for banner display
        if (targetContent === 'fuentes') {
          setTimeout(() => checkAndShowAgentesRegulatoryBanner(), 100);
        }
      }
    });
  });
}

function checkAndShowAgentesRegulatoryBanner() {
  let hasEtiquetasPersonalizadas = false;
  
  try {
    // Try to get etiquetas personalizadas from parent window
    if (window.parent && window.parent.document) {
      const etiquetasElement = window.parent.document.getElementById('userEtiquetasPersonalizadas');
      if (etiquetasElement) {
        const etiquetas = JSON.parse(etiquetasElement.textContent || '{}');
        hasEtiquetasPersonalizadas = Object.keys(etiquetas).length > 0;
      }
    }
  } catch (error) {
    console.log('Could not access parent window data:', error);
  }
  
  const agentesBtn = document.getElementById('configuraAgentesBtn');
  if (agentesBtn) {
    if (!hasEtiquetasPersonalizadas) {
      agentesBtn.style.display = 'block';
      agentesBtn.onclick = () => {
        // Switch to "Agentes" tab
        const menuItems = document.querySelectorAll('.config-menu-item');
        menuItems.forEach(item => {
          if (item.dataset.content === 'agentes') {
            item.click();
          }
        });
      };
    } else {
      agentesBtn.style.display = 'none';
    }
  }
}

// Agent management functions (moved outside to be globally accessible)

// Function to load existing agents from database
const AGENTS_STATE = { currentAgentKey: null, originalXml: '', originalVars: null, isEditing: false, isDirty: false };

function extractTag(xmlString, tagName){
  if(!xmlString) return '';
  try{
    const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = xmlString.match(regex);
    return match ? match[1].trim() : '';
  } catch(e){
    return '';
  }
}

function parseEtiquetaDefinition(xmlString){
  return {
    NombreEtiqueta: extractTag(xmlString, 'NombreEtiqueta'),
    tipo: extractTag(xmlString, 'tipo'),
    Contexto: extractTag(xmlString, 'Contexto'),
    Objetivo: extractTag(xmlString, 'Objetivo'),
    Contenido: extractTag(xmlString, 'Contenido'),
    DocumentosNoIncluidos: extractTag(xmlString, 'DocumentosNoIncluidos')
  };
}

function buildEtiquetaXml(vars){
  const s = v => (v ?? '').toString().trim();
  return `<Etiqueta>\n<NombreEtiqueta>${s(vars.NombreEtiqueta)}</NombreEtiqueta>\n<tipo>${s(vars.tipo)}</tipo>\n<Contexto>${s(vars.Contexto)}</Contexto>\n<Objetivo>${s(vars.Objetivo)}</Objetivo>\n<Contenido>\n${s(vars.Contenido)}\n</Contenido>\n<DocumentosNoIncluidos>\n${s(vars.DocumentosNoIncluidos)}\n</DocumentosNoIncluidos>\n</Etiqueta>`;
}

function renderAgentsGrid(etiquetas){
  const grid = document.getElementById('agentsGrid');
  if(!grid) return;
  // Show 6 skeletons while loading
  grid.innerHTML = '<div class="agent-skeleton"></div>'.repeat(6);
  const entries = Object.entries(etiquetas || {});
  if(entries.length===0){
    grid.innerHTML = '<div style="color:#7a8a93; font-size:14px;">No tienes agentes aún. Crea tu primer agente.</div>';
    return;
  }
  // Build HTML first, then attach events to reduce reflow
  let html = '';
  const data = [];
  entries.reverse().forEach(([key, xml])=>{
    const parsed = parseEtiquetaDefinition(xml);
    const name = parsed.NombreEtiqueta || key;
    const obj = parsed.Objetivo || '';
    data.push({key, xml});
    html += `\n      <div class="agent-box" data-key="${encodeURIComponent(key)}">\n        <div class="agent-header">\n          <h3>${name}</h3>\n          <div class="agent-status"><i class="fas fa-circle"></i><span>Activo</span></div>\n        </div>\n        <p class="agent-objective">${obj}</p>\n      </div>`;
  });
  grid.innerHTML = html;
  grid.querySelectorAll('.agent-box').forEach(box=>{
    const key = decodeURIComponent(box.getAttribute('data-key'));
    const xml = etiquetas[key];
    box.addEventListener('click', ()=> window.openAgentDetail && window.openAgentDetail(key, xml));
  });
}

async function loadExistingAgents(){
  try{
    const response = await fetch('/api/get-user-data');
    const userData = await response.json();
    updateUsageTrackers(userData);
    renderAgentsGrid(userData.etiquetas_personalizadas || {});
  }catch(error){
    console.error('Error loading existing agents:', error);
  }
}

// Function to display existing agents
function displayExistingAgents(etiquetas) {
  const agentesContainer = document.querySelector('#agentes-content');
  const crearAgenteBtn = document.getElementById('crearAgenteBtn');
  
  // Get current agent names to avoid duplicates
  const existingBoxes = agentesContainer.querySelectorAll('.generated-agent-box');
  const currentAgentNames = new Set();
  existingBoxes.forEach(box => {
    const nameElement = box.querySelector('.agent-name');
    if (nameElement) {
      currentAgentNames.add(nameElement.textContent);
    }
  });
  
  // Only create boxes for agents that don't already exist in the UI
  const etiquetasArray = Object.entries(etiquetas).reverse();
  etiquetasArray.forEach(([etiquetaName, etiquetaDefinition]) => {
    if (!currentAgentNames.has(etiquetaName)) {
      createAgentBox(etiquetaName, etiquetaDefinition, crearAgenteBtn);
    }
  });
  
  // Remove any agent boxes that no longer exist in the data
  existingBoxes.forEach(box => {
    const nameElement = box.querySelector('.agent-name');
    if (nameElement && !etiquetas[nameElement.textContent]) {
      box.remove();
    }
  });
}

// Function to create an agent box
function createAgentBox(name, definition, insertAfter) {
  const agentBox = document.createElement('div');
  agentBox.className = 'generated-agent-box';
  
  // Create content elements safely without innerHTML
  const agentContent = document.createElement('div');
  agentContent.className = 'generated-agent-content';
  
  const agentName = document.createElement('h4');
  agentName.className = 'agent-name';
  agentName.textContent = name;
  
  const agentDefinition = document.createElement('p');
  agentDefinition.className = 'agent-definition';
  agentDefinition.textContent = definition;
  
  agentContent.appendChild(agentName);
  agentContent.appendChild(agentDefinition);
  
  // Create edit controls
  const editControls = document.createElement('div');
  editControls.className = 'agent-edit-controls';
  
  const editBtn = document.createElement('button');
  editBtn.className = 'edit-agent-btn';
  editBtn.innerHTML = '<i class="fas fa-edit"></i> Editar';
  editBtn.addEventListener('click', () => editAgent(editBtn, name));
  
  editControls.appendChild(editBtn);
  
  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-agent-box';
  closeBtn.innerHTML = '<i class="fas fa-trash"></i>';
  closeBtn.addEventListener('click', () => deleteAgent(closeBtn, name));
  
  // Assemble the agent box
  agentBox.appendChild(agentContent);
  agentBox.appendChild(editControls);
  agentBox.appendChild(closeBtn);
  
  // Insert after the "Crear agente" button
  insertAfter.parentNode.insertBefore(agentBox, insertAfter.nextSibling);
}

// Function to edit an agent
function editAgent(button, originalName) {
  const agentBox = button.closest('.generated-agent-box');
  const agentName = agentBox.querySelector('.agent-name');
  const agentDefinition = agentBox.querySelector('.agent-definition');
  const editControls = agentBox.querySelector('.agent-edit-controls');
  
  // Add editing class to expand the box
  agentBox.classList.add('editing');
  
  // Store original values
  const originalDefinition = agentDefinition.textContent;
  
  // Replace content with editable inputs
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'agent-name-edit';
  nameInput.value = originalName;
  agentName.innerHTML = '';
  agentName.appendChild(nameInput);
  
  const definitionTextarea = document.createElement('textarea');
  definitionTextarea.className = 'agent-definition-edit';
  definitionTextarea.value = originalDefinition;
  definitionTextarea.maxLength = 2000;
  agentDefinition.innerHTML = '';
  agentDefinition.appendChild(definitionTextarea);

  // Add character counter
  const counterContainer = document.createElement('div');
  counterContainer.className = 'character-counter-container';
  
  const errorMessage = document.createElement('span');
  errorMessage.className = 'character-error-message';
  errorMessage.style.display = 'none';
  
  const counter = document.createElement('span');
  counter.className = 'character-counter';
  
  function updateCounter() {
    const length = definitionTextarea.value.length;
    counter.textContent = `${length} /1000`;
    
    if (length > 1000) {
      counter.classList.add('over-limit');
      errorMessage.textContent = 'Número máximo de carácteres superado';
      errorMessage.style.display = 'inline';
    } else {
      counter.classList.remove('over-limit');
      errorMessage.style.display = 'none';
    }
  }
  
  definitionTextarea.addEventListener('input', updateCounter);
  
  counterContainer.appendChild(errorMessage);
  counterContainer.appendChild(counter);
  agentDefinition.appendChild(counterContainer);
  
  // Initial counter update
  updateCounter();
  
  // Replace edit button with save and cancel buttons
  editControls.innerHTML = '';
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-agent-btn';
  saveBtn.innerHTML = '<i class="fas fa-save"></i> Guardar';
  saveBtn.addEventListener('click', () => saveAgent(saveBtn, originalName));
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'cancel-agent-btn';
  cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancelar';
  cancelBtn.addEventListener('click', () => cancelEdit(cancelBtn, originalName, originalDefinition));
  
  editControls.appendChild(saveBtn);
  editControls.appendChild(cancelBtn);
}

// Function to save agent changes
async function saveAgent(button, originalName) {
  const agentBox = button.closest('.generated-agent-box');
  const nameInput = agentBox.querySelector('.agent-name-edit');
  const definitionInput = agentBox.querySelector('.agent-definition-edit');
  
  const newName = nameInput.value.trim();
  const newDefinition = definitionInput.value.trim();
  
  if (!newName || !newDefinition) {
    alert('Por favor, completa todos los campos.');
    return;
  }
  
  if (newDefinition.length > 1000) {
    // Show error message if not already visible
    const errorMessage = agentBox.querySelector('.character-error-message');
    const counter = agentBox.querySelector('.character-counter');
    if (errorMessage && counter) {
      errorMessage.textContent = 'Número máximo de carácteres superado';
      errorMessage.style.display = 'inline';
      counter.classList.add('over-limit');
    }
    return;
  }
  
  // Show loading state
  const originalButtonContent = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
  
  try {
    // Get current user data
    const response = await fetch('/api/get-user-data');
    const userData = await response.json();
    
    // Update etiquetas_personalizadas
    const etiquetas = userData.etiquetas_personalizadas || {};
    
    // Remove old key if name changed
    if (originalName !== newName) {
      delete etiquetas[originalName];
    }
    
    // Add/update with new values
    etiquetas[newName] = newDefinition;
    
    // Save to database
    const updateResponse = await fetch('/api/update-user-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        etiquetas_personalizadas: etiquetas
      })
    });
    
    if (updateResponse.ok) {
      // Update UI first
      agentBox.querySelector('.agent-name').textContent = newName;
      agentBox.querySelector('.agent-definition').textContent = newDefinition;
      
      // Restore edit controls
      const editControls = agentBox.querySelector('.agent-edit-controls');
      editControls.innerHTML = '';
      
      const editBtn = document.createElement('button');
      editBtn.className = 'edit-agent-btn';
      editBtn.innerHTML = '<i class="fas fa-edit"></i> Editar';
      editBtn.addEventListener('click', () => editAgent(editBtn, newName));
      
      editControls.appendChild(editBtn);
      
      // Remove editing class with slight delay for smoother transition
      setTimeout(() => {
        agentBox.classList.remove('editing');
      }, 100);
      
      // Refresh usage tracker
      loadExistingAgents();
    } else {
      // Restore button state on error
      button.disabled = false;
      button.innerHTML = originalButtonContent;
      alert('Error al guardar los cambios. Por favor, inténtalo de nuevo.');
    }
  } catch (error) {
    console.error('Error saving agent:', error);
    // Restore button state on error
    button.disabled = false;
    button.innerHTML = originalButtonContent;
    alert('Error al guardar los cambios. Por favor, inténtalo de nuevo.');
  }
}

// Function to cancel editing
function cancelEdit(button, originalName, originalDefinition) {
  const agentBox = button.closest('.generated-agent-box');
  
  // Restore original content first
  agentBox.querySelector('.agent-name').textContent = originalName;
  agentBox.querySelector('.agent-definition').textContent = originalDefinition;
  
  // Restore edit controls
  const editControls = agentBox.querySelector('.agent-edit-controls');
  editControls.innerHTML = '';
  
  const editBtn = document.createElement('button');
  editBtn.className = 'edit-agent-btn';
  editBtn.innerHTML = '<i class="fas fa-edit"></i> Editar';
  editBtn.addEventListener('click', () => editAgent(editBtn, originalName));
  
  editControls.appendChild(editBtn);
  
  // Remove editing class with slight delay for smoother transition
  setTimeout(() => {
    agentBox.classList.remove('editing');
  }, 100);
}

// Function to delete an agent
async function deleteAgent(button, agentName) {
  if (!confirm(`¿Estás seguro de que quieres eliminar el agente "${agentName}"?`)) {
    return;
  }
  
  try {
    // Get current user data
    const response = await fetch('/api/get-user-data');
    const userData = await response.json();
    
    // Remove from etiquetas_personalizadas
    const etiquetas = userData.etiquetas_personalizadas || {};
    delete etiquetas[agentName];
    
    // Save to database
    const updateResponse = await fetch('/api/update-user-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        etiquetas_personalizadas: etiquetas
      })
    });
    
    if (updateResponse.ok) {
      // Remove from UI
      button.closest('.generated-agent-box').remove();
      
      // Refresh usage tracker
      loadExistingAgents();
    } else {
      alert('Error al eliminar el agente. Por favor, inténtalo de nuevo.');
    }
  } catch (error) {
    console.error('Error deleting agent:', error);
    alert('Error al eliminar el agente. Por favor, inténtalo de nuevo.');
  }
}

// Function to show generated agent (first definition)
function showGeneratedAgent(agentData) {
  const crearAgenteBtn = document.getElementById('crearAgenteBtn');
  
  if (agentData.etiqueta_personalizada && crearAgenteBtn) {
    // Show the agent immediately by creating it directly in the UI
    const agentName = Object.keys(agentData.etiqueta_personalizada)[0];
    const agentDefinition = agentData.etiqueta_personalizada[agentName];
    
    // Create the agent box immediately
    createAgentBox(agentName, agentDefinition, crearAgenteBtn);
    
    // Update usage trackers in background
    setTimeout(() => {
      loadExistingAgents();
    }, 100);
    
    // Scroll to top smoothly
    setTimeout(() => {
      const configMenu = document.querySelector('.config-menu');
      if (configMenu) {
        configMenu.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 200);
  }
}

// Initialize agent template functionality
function initializeAgentTemplates() {
  const crearAgenteBtn = document.getElementById('crearAgenteBtn');
  const agentTemplateBox = document.getElementById('agentTemplateBox');
  const closeTemplateBox = document.getElementById('closeTemplateBox');
  const productDetailsForm = document.getElementById('productDetailsForm');
  const closeProductForm = document.getElementById('closeProductForm');
  const clientDetailsForm = document.getElementById('clientDetailsForm');
  const closeClientForm = document.getElementById('closeClientForm');
  const sectorDetailsForm = document.getElementById('sectorDetailsForm');
  const closeSectorForm = document.getElementById('closeSectorForm');
  const customDetailsForm = document.getElementById('customDetailsForm');
  const closeCustomForm = document.getElementById('closeCustomForm');
  const generateAgentBtn = document.getElementById('generateAgentBtn');
  const generateClientAgentBtn = document.getElementById('generateClientAgentBtn');
  const generateSectorAgentBtn = document.getElementById('generateSectorAgentBtn');
  const generateCustomAgentBtn = document.getElementById('generateCustomAgentBtn');
  
  // Load existing agents on initialization
  loadExistingAgents();
  
  if (crearAgenteBtn && agentTemplateBox) {
    // Function to show template box
    function showTemplateBox() {
      agentTemplateBox.style.display = 'block';
      crearAgenteBtn.style.display = 'none';
      if (productDetailsForm) productDetailsForm.style.display = 'none';
      if (clientDetailsForm) clientDetailsForm.style.display = 'none';
      if (sectorDetailsForm) sectorDetailsForm.style.display = 'none';
      if (customDetailsForm) customDetailsForm.style.display = 'none';
      
      // Hide agents grid while creating from template
      const agentsGrid = document.getElementById('agentsGrid');
      if (agentsGrid) agentsGrid.style.display = 'none';
      
      // Scroll to the box smoothly
      setTimeout(() => {
        agentTemplateBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }

    // Function to hide template box
    function hideTemplateBox() {
      agentTemplateBox.style.display = 'none';
      crearAgenteBtn.style.display = 'flex';
      if (productDetailsForm) productDetailsForm.style.display = 'none';
      if (clientDetailsForm) clientDetailsForm.style.display = 'none';
      if (sectorDetailsForm) sectorDetailsForm.style.display = 'none';
      if (customDetailsForm) customDetailsForm.style.display = 'none';
      
      // Show agents grid again
      const agentsGrid = document.getElementById('agentsGrid');
      if (agentsGrid) agentsGrid.style.display = 'grid';
    }

    // Function to show product details form
    function showProductForm() {
      agentTemplateBox.style.display = 'none';
      if (productDetailsForm) {
        // Reset form fields
        const productDescription = document.getElementById('productDescription');
        const productPhase = document.getElementById('productPhase');
        const productCharacteristics = document.getElementById('productCharacteristics');
        const customPhase = document.getElementById('customPhase');
        const customPhaseContainer = document.getElementById('customPhaseContainer');
        const generateBtn = document.getElementById('generateAgentBtn');
        
        if (productDescription) productDescription.value = '';
        if (productPhase) productPhase.value = '';
        if (productCharacteristics) productCharacteristics.value = '';
        if (customPhase) customPhase.value = '';
        if (customPhaseContainer) customPhaseContainer.style.display = 'none';
        if (generateBtn) {
          generateBtn.disabled = false;
          generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
        
        productDetailsForm.style.display = 'block';
        // Scroll to the form smoothly
        setTimeout(() => {
          productDetailsForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    }

    // Function to show client form
    function showClientForm() {
      agentTemplateBox.style.display = 'none';
      if (clientDetailsForm) {
        // Reset form fields
        const clientDescription = document.getElementById('clientDescription');
        const clientWebsite = document.getElementById('clientWebsite');
        const clientScope = document.getElementById('clientScope');
        const generateBtn = document.getElementById('generateClientAgentBtn');
        
        if (clientDescription) clientDescription.value = '';
        if (clientWebsite) clientWebsite.value = '';
        if (clientScope) clientScope.value = '';
        if (generateBtn) {
          generateBtn.disabled = false;
          generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
        
        clientDetailsForm.style.display = 'block';
        // Scroll to the form smoothly
        setTimeout(() => {
          clientDetailsForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    }

    // Function to show sector form
    function showSectorForm() {
      agentTemplateBox.style.display = 'none';
      if (sectorDetailsForm) {
        // Reset form fields
        const sectorDescription = document.getElementById('sectorDescription');
        const sectorGeographicScope = document.getElementById('sectorGeographicScope');
        const sectorSubtopics = document.getElementById('sectorSubtopics');
        const generateBtn = document.getElementById('generateSectorAgentBtn');
        
        if (sectorDescription) sectorDescription.value = '';
        if (sectorGeographicScope) sectorGeographicScope.value = '';
        if (sectorSubtopics) sectorSubtopics.value = '';
        if (generateBtn) {
          generateBtn.disabled = false;
          generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
        
        sectorDetailsForm.style.display = 'block';
        // Scroll to the form smoothly
        setTimeout(() => {
          sectorDetailsForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    }

    // Function to show custom form
    function showCustomForm() {
      agentTemplateBox.style.display = 'none';
      if (customDetailsForm) {
        // Reset form fields
        const customDescription = document.getElementById('customDescription');
        const generateBtn = document.getElementById('generateCustomAgentBtn');
        
        if (customDescription) customDescription.value = '';
        if (generateBtn) {
          generateBtn.disabled = false;
          generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
        
        customDetailsForm.style.display = 'block';
        // Scroll to the form smoothly
        setTimeout(() => {
          customDetailsForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    }

    // Function to hide product details form
    function hideProductForm() {
      if (productDetailsForm) productDetailsForm.style.display = 'none';
      crearAgenteBtn.style.display = 'flex';
      
      // Show agents grid again
      const agentsGrid = document.getElementById('agentsGrid');
      if (agentsGrid) agentsGrid.style.display = 'grid';
    }

    // Function to hide client details form
    function hideClientForm() {
      if (clientDetailsForm) clientDetailsForm.style.display = 'none';
      crearAgenteBtn.style.display = 'flex';
      
      // Show agents grid again
      const agentsGrid = document.getElementById('agentsGrid');
      if (agentsGrid) agentsGrid.style.display = 'grid';
    }

    // Function to hide sector details form
    function hideSectorForm() {
      if (sectorDetailsForm) sectorDetailsForm.style.display = 'none';
      crearAgenteBtn.style.display = 'flex';
      
      // Show agents grid again
      const agentsGrid = document.getElementById('agentsGrid');
      if (agentsGrid) agentsGrid.style.display = 'grid';
    }

    // Function to hide custom details form
    function hideCustomForm() {
      if (customDetailsForm) customDetailsForm.style.display = 'none';
      crearAgenteBtn.style.display = 'flex';
      
      // Show agents grid again
      const agentsGrid = document.getElementById('agentsGrid');
      if (agentsGrid) agentsGrid.style.display = 'grid';
    }

    // Note: Agent boxes are now managed dynamically with individual delete buttons

    // Show template box when "Crear agente" is clicked
    crearAgenteBtn.addEventListener('click', async () => {
      // Check if user can create more agents
      try {
        const response = await fetch('/api/get-user-data');
        const userData = await response.json();
        
        const defaultLimits = getDefaultLimits(userData.subscription_plan || 'plan1');
        const limitAgentes = userData.limit_agentes !== undefined ? userData.limit_agentes : defaultLimits.limit_agentes;
        const currentAgentes = Object.keys(userData.etiquetas_personalizadas || {}).length;
        
        if (limitAgentes !== null && currentAgentes >= limitAgentes) {
          alert(`Has alcanzado el límite de ${limitAgentes} agentes para tu plan actual. Para crear más agentes, actualiza tu suscripción.`);
          return;
        }
        
        openNewAgentModal();
      } catch (error) {
        console.error('Error checking agent limits:', error);
        openNewAgentModal(); // Show anyway if there's an error
      }
    });

    // Hide template box when close button is clicked
    if (closeTemplateBox) {
      closeTemplateBox.addEventListener('click', hideTemplateBox);
    }

    // Hide product form when close button is clicked
    if (closeProductForm) {
      closeProductForm.addEventListener('click', hideProductForm);
    }

    // Hide client form when close button is clicked
    if (closeClientForm) {
      closeClientForm.addEventListener('click', hideClientForm);
    }

    // Hide sector form when close button is clicked
    if (closeSectorForm) {
      closeSectorForm.addEventListener('click', hideSectorForm);
    }

    // Hide custom form when close button is clicked
    if (closeCustomForm) {
      closeCustomForm.addEventListener('click', hideCustomForm);
    }

    // Note: Agent boxes are now managed dynamically with individual delete buttons

    // Add click handlers for template buttons
    const templateBtns = agentTemplateBox.querySelectorAll('.template-btn');
    templateBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const agentType = btn.dataset.type;
        console.log('Selected agent type:', agentType);
        
        if (agentType === 'producto') {
          showProductForm();
        } else if (agentType === 'cliente') {
          showClientForm();
        } else if (agentType === 'sector') {
          showSectorForm();
        } else if (agentType === 'personalizado') {
          showCustomForm();
        } else {
          // For other agent types, just hide template box for now
          hideTemplateBox();
        }
      });
    });

    // Handle custom phase input toggle
    const productPhaseSelect = document.getElementById('productPhase');
    const customPhaseContainer = document.getElementById('customPhaseContainer');
    
    if (productPhaseSelect && customPhaseContainer) {
      productPhaseSelect.addEventListener('change', (e) => {
        if (e.target.value === 'otro') {
          customPhaseContainer.style.display = 'block';
        } else {
          customPhaseContainer.style.display = 'none';
          // Clear custom input when hiding
          const customPhaseInput = document.getElementById('customPhase');
          if (customPhaseInput) customPhaseInput.value = '';
        }
      });
    }

    // Handle generate agent button click
    if (generateAgentBtn) {
      generateAgentBtn.addEventListener('click', async () => {
        // Get form values
        const productDescription = document.getElementById('productDescription')?.value || '';
        let productPhase = document.getElementById('productPhase')?.value || '';
        const productCharacteristics = document.getElementById('productCharacteristics')?.value || '';
        
        // If "Otro" is selected, use the custom input value
        if (productPhase === 'otro') {
          const customPhase = document.getElementById('customPhase')?.value || '';
          productPhase = customPhase;
        }

        // Validate required fields
        if (!productDescription.trim()) {
          alert('Por favor, proporciona una descripción del producto.');
          return;
        }

        // Show loading state
        generateAgentBtn.disabled = true;
        generateAgentBtn.innerHTML = '<div class="button-spinner"></div> Generando...';
        
        try {
          // Make API call to generate agent (server handles prompt creation)
          const response = await fetch('/api/generate-agent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              productData: {
                description: productDescription,
                phase: productPhase,
                characteristics: productCharacteristics
              }
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          
          if (result.success && result.agent) {
            // Show generated agent first (this will handle the delay and reload)
            showGeneratedAgent(result.agent);
            
            // Close forms and reset button immediately
            setTimeout(() => {
              hideProductForm();
              hideTemplateBox();
              generateAgentBtn.disabled = false;
              generateAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
            }, 300); // Quick transition
            
            return; // Don't execute the catch block
          } else {
            throw new Error(result.error || 'Error generating agent');
          }

        } catch (error) {
          console.error('Error generating agent:', error);
          alert('Error al generar el agente. Por favor, inténtalo de nuevo.');
          
          // Reset button state
          generateAgentBtn.disabled = false;
          generateAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
      });
    }

    // Handle generate client agent button click
    if (generateClientAgentBtn) {
      generateClientAgentBtn.addEventListener('click', async () => {
        // Get form values
        const clientDescription = document.getElementById('clientDescription')?.value || '';
        const clientWebsite = document.getElementById('clientWebsite')?.value || '';
        const clientScope = document.getElementById('clientScope')?.value || '';

        // Validate required fields
        if (!clientDescription.trim()) {
          alert('Por favor, proporciona una descripción del cliente.');
          return;
        }

        // Show loading state
        generateClientAgentBtn.disabled = true;
        generateClientAgentBtn.innerHTML = '<div class="button-spinner"></div> Generando...';
        
        try {
          // Make API call to generate client agent
          const response = await fetch('/api/generate-client-agent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              clientData: {
                description: clientDescription,
                website: clientWebsite,
                scope: clientScope
              }
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          
          if (result.success && result.agent) {
            // Show generated agent first (this will handle the delay and reload)
            showGeneratedAgent(result.agent);
            
            // Close forms and reset button immediately
            setTimeout(() => {
              hideClientForm();
              hideTemplateBox();
              generateClientAgentBtn.disabled = false;
              generateClientAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
            }, 300); // Quick transition
            
            return; // Don't execute the catch block
          } else {
            throw new Error(result.error || 'Error generating client agent');
          }

        } catch (error) {
          console.error('Error generating client agent:', error);
          alert('Error al generar el agente. Por favor, inténtalo de nuevo.');
          
          // Reset button state
          generateClientAgentBtn.disabled = false;
          generateClientAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
      });
    }

    // Handle generate sector agent button click
    if (generateSectorAgentBtn) {
      generateSectorAgentBtn.addEventListener('click', async () => {
        // Get form values
        const sectorDescription = document.getElementById('sectorDescription')?.value || '';
        const sectorGeographicScope = document.getElementById('sectorGeographicScope')?.value || '';
        const sectorSubtopics = document.getElementById('sectorSubtopics')?.value || '';

        // Validate required fields
        if (!sectorDescription.trim()) {
          alert('Por favor, proporciona una descripción del sector.');
          return;
        }

        // Show loading state
        generateSectorAgentBtn.disabled = true;
        generateSectorAgentBtn.innerHTML = '<div class="button-spinner"></div> Generando...';
        
        try {
          // Make API call to generate sector agent
          const response = await fetch('/api/generate-sector-agent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sectorData: {
                description: sectorDescription,
                geographicScope: sectorGeographicScope,
                subtopics: sectorSubtopics
              }
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          
          if (result.success && result.agent) {
            // Show generated agent first (this will handle the delay and reload)
            showGeneratedAgent(result.agent);
            
            // Close forms and reset button immediately
            setTimeout(() => {
              hideSectorForm();
              hideTemplateBox();
              generateSectorAgentBtn.disabled = false;
              generateSectorAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
            }, 300); // Quick transition
            
            return; // Don't execute the catch block
          } else {
            throw new Error(result.error || 'Error generating sector agent');
          }

        } catch (error) {
          console.error('Error generating sector agent:', error);
          alert('Error al generar el agente. Por favor, inténtalo de nuevo.');
          
          // Reset button state
          generateSectorAgentBtn.disabled = false;
          generateSectorAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
      });
    }

    // Handle generate custom agent button click
    if (generateCustomAgentBtn) {
      generateCustomAgentBtn.addEventListener('click', async () => {
        // Get form values
        const customDescription = document.getElementById('customDescription')?.value || '';

        // Validate required fields
        if (!customDescription.trim()) {
          alert('Por favor, describe qué contenido quieres que el agente rastree.');
          return;
        }

        // Show loading state
        generateCustomAgentBtn.disabled = true;
        generateCustomAgentBtn.innerHTML = '<div class="button-spinner"></div> Generando...';
        
        try {
          // Make API call to generate custom agent
          const response = await fetch('/api/generate-custom-agent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              customData: {
                description: customDescription
              }
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          
          if (result.success && result.agent) {
            // Show generated agent first (this will handle the delay and reload)
            showGeneratedAgent(result.agent);
            
            // Close forms and reset button immediately
            setTimeout(() => {
              hideCustomForm();
              hideTemplateBox();
              generateCustomAgentBtn.disabled = false;
              generateCustomAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
            }, 300); // Quick transition
            
            return; // Don't execute the catch block
          } else {
            throw new Error(result.error || 'Error generating custom agent');
          }

        } catch (error) {
          console.error('Error generating custom agent:', error);
          alert('Error al generar el agente. Por favor, inténtalo de nuevo.');
          
          // Reset button state
          generateCustomAgentBtn.disabled = false;
          generateCustomAgentBtn.innerHTML = '<i class="fas fa-magic"></i> Generar Agente';
        }
      });
    }
  }
}

// Initialize immediately if DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeConfigurationMenu();
    initializeAgentTemplates();
  });
} else {
  // If content is loaded dynamically, initialize immediately
  setTimeout(() => {
    initializeConfigurationMenu();
    initializeAgentTemplates();
  }, 100);
}

// Function to get default limits based on plan
function getDefaultLimits(plan) {
  switch (plan) {
    case 'plan1':
      return { limit_agentes: 0, limit_fuentes: 0 };
    case 'plan2':
      return { limit_agentes: 5, limit_fuentes: 3 };
    case 'plan3':
      return { limit_agentes: 10, limit_fuentes: 10 };
    case 'plan4':
      return { limit_agentes: null, limit_fuentes: null }; // unlimited
    default:
      return { limit_agentes: 0, limit_fuentes: 0 };
  }
}

// Function to update usage trackers
function updateUsageTrackers(userData) {
  const agentesTracker = document.getElementById('agentes-usage-tracker');
  const fuentesTracker = document.getElementById('fuentes-usage-tracker');
  
  if (!userData) return;
  
  // Get default limits if not defined
  const defaultLimits = getDefaultLimits(userData.subscription_plan || 'plan1');
  const limitAgentes = userData.limit_agentes !== undefined ? userData.limit_agentes : defaultLimits.limit_agentes;
  const limitFuentes = userData.limit_fuentes !== undefined ? userData.limit_fuentes : defaultLimits.limit_fuentes;
  
  // Count current usage
  const currentAgentes = Object.keys(userData.etiquetas_personalizadas || {}).length;
  const currentFuentes = (userData.cobertura_legal?.fuentes_gobierno || []).length + 
                        (userData.cobertura_legal?.fuentes_reguladores || []).length;
  
  // Update agentes tracker
  if (agentesTracker) {
    if (limitAgentes === null) {
      // Unlimited
      agentesTracker.textContent = 'Número de agentes ilimitado';
      agentesTracker.className = 'usage-tracker unlimited';
    } else {
      agentesTracker.textContent = `${currentAgentes}/${limitAgentes} disponibles`;
      agentesTracker.className = 'usage-tracker';
      
      // Add warning classes
      if (currentAgentes >= limitAgentes) {
        agentesTracker.classList.add('at-limit');
      } else if (currentAgentes >= limitAgentes * 0.8) {
        agentesTracker.classList.add('near-limit');
      }
    }
  }
  
  // Update fuentes tracker
  if (fuentesTracker) {
    if (limitFuentes === null) {
      // Unlimited
      fuentesTracker.textContent = 'Número de fuentes ilimitado';
      fuentesTracker.className = 'usage-tracker unlimited';
    } else {
      fuentesTracker.textContent = `${currentFuentes}/${limitFuentes} disponibles`;
      fuentesTracker.className = 'usage-tracker';
      
      // Add warning classes
      if (currentFuentes >= limitFuentes) {
        fuentesTracker.classList.add('at-limit');
      } else if (currentFuentes >= limitFuentes * 0.8) {
        fuentesTracker.classList.add('near-limit');
      }
    }
  }
}

// Expose functions globally so they can be called from dynamic HTML
window.initializeConfigurationMenu = initializeConfigurationMenu;
window.loadExistingAgents = loadExistingAgents;
window.renderAgentsGrid = renderAgentsGrid;
window.showGeneratedAgent = showGeneratedAgent;
window.updateUsageTrackers = updateUsageTrackers;

function hideLoader(){
  const l=document.getElementById('config-loader');
  if(l) l.style.display='none';
}

// ========== Agent detail and editing functions (moved from inline IIFE) ==========
function openAgentDetail(agentKey, xml){
  const overlay = document.getElementById('agentDetailOverlay');
  const title = document.getElementById('agentModalTitle');
  const titleText = document.getElementById('agentTitleText');
  const editNameBtn = document.getElementById('editAgentNameBtn');
  const ctxInput = document.getElementById('agentContexto');
  const objInput = document.getElementById('agentObjetivo');
  const contInput = document.getElementById('agentContenido');
  const noInclInput = document.getElementById('agentNoIncluidos');
  const saveBtn = document.getElementById('saveAgentChangesBtn');
  const closeBtn = document.getElementById('closeAgentModal');

  const vars = parseEtiquetaDefinition(xml);
  titleText.textContent = vars.NombreEtiqueta || agentKey;
  ctxInput.value = vars.Contexto || '';
  objInput.value = vars.Objetivo || '';
  contInput.value = vars.Contenido || '';
  noInclInput.value = vars.DocumentosNoIncluidos || '';

  // Inputs editables por defecto
  const setDisabled = (disabled)=>{
    [ctxInput, objInput, contInput, noInclInput].forEach(el=>{
      el.disabled = disabled;
      if(el.tagName === 'TEXTAREA') el.readOnly = disabled;
    });
  };
  setDisabled(false);
  saveBtn.disabled = true;

  AGENTS_STATE.currentAgentKey = agentKey;
  AGENTS_STATE.originalXml = xml;
  AGENTS_STATE.originalVars = vars;
  AGENTS_STATE.isDirty = false;
  AGENTS_STATE.isEditing = true; // siempre en modo edición

  const markDirty = ()=>{
    AGENTS_STATE.isDirty = true;
    saveBtn.disabled = false;
  };
  [ctxInput, objInput, contInput, noInclInput].forEach(el=>{ el.oninput = markDirty; });

  // Edición de nombre en el título
  if (editNameBtn){
    editNameBtn.onclick = ()=>{
      // Cambiar a modo edición inline del título (usar span actual para evitar referencias obsoletas)
      const spanNow = document.getElementById('agentTitleText');
      const current = (spanNow?.textContent) || '';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'product-input';
      input.style.height = '32px';
      input.style.fontSize = '16px';
      input.style.padding = '6px 10px';
      input.style.marginLeft = '0';
      // Reemplazar el span por el input temporalmente
      (spanNow || titleText).replaceWith(input);
      input.focus();
      const commit = ()=>{
        const trimmed = (input.value || '').trim();
        const newSpan = document.createElement('span');
        newSpan.id = 'agentTitleText';
        newSpan.textContent = trimmed || current;
        input.replaceWith(newSpan);
        // Actualizar referencia local y marcar dirty si cambió
        if ((trimmed || current) !== current) {
          AGENTS_STATE.isDirty = true;
          const saveBtn = document.getElementById('saveAgentChangesBtn');
          if (saveBtn) saveBtn.disabled = false;
        }
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter'){ e.preventDefault(); input.blur(); }
        if(e.key === 'Escape'){ input.value = current; input.blur(); }
      });
    };
  }

  saveBtn.onclick = ()=> {
    // Cambio inmediato del botón ANTES de cualquier await
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<div class="button-spinner"></div> Guardando...';
    saveAgentChanges(false, saveBtn);
  };
  closeBtn.onclick = ()=> attemptCloseAgentModal();

  overlay.style.display = 'flex';
}

function attemptCloseAgentModal(){
  if(AGENTS_STATE.isEditing && AGENTS_STATE.isDirty){
    const confirmOverlay = document.getElementById('unsavedConfirmOverlay');
    const discardBtn = document.getElementById('discardChangesBtn');
    const saveAndCloseBtn = document.getElementById('saveAndCloseBtn');
    const closeConfirmBtn = document.getElementById('closeUnsavedConfirm');
    confirmOverlay.style.display = 'flex';
    discardBtn.onclick = ()=>{ confirmOverlay.style.display='none'; closeAgentOverlay(); };
    saveAndCloseBtn.textContent = 'Guardar';
    saveAndCloseBtn.style.background = '#0b2431';
    saveAndCloseBtn.onclick = async ()=>{
      // Cambio inmediato del botón ANTES de cualquier await
      saveAndCloseBtn.disabled = true;
      saveAndCloseBtn.innerHTML = '<div class="button-spinner"></div> Guardando...';
      try {
        await saveAgentChanges(true, saveAndCloseBtn);
        // Mostrar tick por 1 segundo antes de cerrar
        saveAndCloseBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
          confirmOverlay.style.display='none';
          // Mostrar toast tras cerrar el modal de confirmación
          showAgentsToast('Agente actualizado correctamente', 'success');
          // NO cerrar el modal principal, mantenerlo abierto para seguir editando
        }, 1000);
      } catch(err) {
        console.error('Error saving from confirm modal:', err);
        saveAndCloseBtn.innerHTML = '<i class="fas fa-save"></i> Guardar';
        // Mostrar toast de error tras 1s
        setTimeout(() => {
          showAgentsToast('Problema actualizando el agente, pruebe de nuevo por favor', 'error');
        }, 1000);
      }
      saveAndCloseBtn.disabled = false;
    };
    closeConfirmBtn.onclick = ()=>{ confirmOverlay.style.display='none'; };
  } else {
    closeAgentOverlay();
  }
}

function closeAgentOverlay(){
  const overlay = document.getElementById('agentDetailOverlay');
  const saveBtn = document.getElementById('saveAgentChangesBtn');
  AGENTS_STATE.currentAgentKey = null;
  AGENTS_STATE.originalXml = '';
  AGENTS_STATE.originalVars = null;
  AGENTS_STATE.isDirty = false;
  AGENTS_STATE.isEditing = false;
  if(saveBtn) saveBtn.disabled = true;
  overlay.style.display = 'none';
}

function showAgentsToast(message, type){
  const el = document.getElementById('agentsToast');
  if(!el) return;
  // reset base styles
  el.style.display = 'flex';
  el.style.background = type === 'error' ? '#fff9e6' : '#e8f5e8';
  el.style.border = type === 'error' ? '1px solid #ff9800' : '1px solid var(--primary-color)';
  el.style.color = 'var(--dark-color)';
  el.innerHTML = type === 'error' ? '⚠️ ' + message : '✓ ' + message;
  setTimeout(()=>{ el.style.display = 'none'; }, 2000);
}

async function saveAgentChanges(closeAfterSave, triggerBtn){
  try{
    if (AGENTS_STATE.isSaving) return; // prevent duplicate saves
    AGENTS_STATE.isSaving = true;
    const titleText = document.getElementById('agentTitleText');
    const ctxInput = document.getElementById('agentContexto');
    const objInput = document.getElementById('agentObjetivo');
    const contInput = document.getElementById('agentContenido');
    const noInclInput = document.getElementById('agentNoIncluidos');

    const newVars = {
      NombreEtiqueta: (titleText.textContent||'').trim(),
      tipo: '',
      Contexto: (ctxInput.value||'').trim(),
      Objetivo: (objInput.value||'').trim(),
      Contenido: (contInput.value||'').trim(),
      DocumentosNoIncluidos: (noInclInput.value||'').trim()
    };

    if(!newVars.NombreEtiqueta){
      alert('El nombre del agente es obligatorio.');
      AGENTS_STATE.isSaving = false;
      const btn = triggerBtn || document.getElementById('saveAgentChangesBtn');
      if(btn){ btn.innerHTML = '<i class="fas fa-save"></i> Guardar'; btn.disabled = false; }
      return;
    }

    const newXml = buildEtiquetaXml(newVars);
    const response = await fetch('/api/get-user-data');
    const userData = await response.json();
    const etiquetas = userData.etiquetas_personalizadas || {};

    const oldKey = AGENTS_STATE.currentAgentKey;
    const newKey = newVars.NombreEtiqueta;
    if(oldKey !== newKey){ delete etiquetas[oldKey]; }
    etiquetas[newKey] = newXml;

    const updateResponse = await fetch('/api/update-user-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etiquetas_personalizadas: etiquetas })
    });
    if(!updateResponse.ok) throw new Error('HTTP '+updateResponse.status);

    AGENTS_STATE.isDirty = false;
    // Mantener isEditing = true para que los campos sigan editables
    // AGENTS_STATE.isEditing = false;
    AGENTS_STATE.currentAgentKey = newKey;
    AGENTS_STATE.originalXml = newXml;
    AGENTS_STATE.originalVars = newVars;

    await loadExistingAgents();

    const titleSpan = document.getElementById('agentTitleText'); if (titleSpan) { titleSpan.textContent = newVars.NombreEtiqueta; }

    const btn = triggerBtn || document.getElementById('saveAgentChangesBtn');
    if (btn){
      btn.innerHTML = '<i class="fas fa-check"></i>';
    }
    // Mostrar toast 1s después
    if (!closeAfterSave) {
      // Solo mostrar toast si NO viene del modal de confirmación
      setTimeout(()=>{
        showAgentsToast('Agente actualizado correctamente', 'success');
        // Revertir botón a Guardar tras ocultar toast (2s)
        setTimeout(()=>{
          if (btn){ btn.innerHTML = '<i class="fas fa-save"></i> Guardar'; btn.disabled = true; }
          // Mantener estado de edición activo tras guardar
          AGENTS_STATE.isEditing = true;
          AGENTS_STATE.isDirty = false;
        }, 2000);
      }, 1000);
    } else {
      // Para el modal de confirmación, solo mantener estado activo
      AGENTS_STATE.isEditing = true;
      AGENTS_STATE.isDirty = false;
    }

    // No cerrar el modal automáticamente
    AGENTS_STATE.isSaving = false;
  }catch(err){
    console.error('Error al guardar el agente:', err);
    const btn = triggerBtn || document.getElementById('saveAgentChangesBtn');
    if(btn){ btn.innerHTML = '<i class="fas fa-save"></i> Guardar'; btn.disabled = false; }
    // Mostrar toast 1s después
    setTimeout(()=>{
      showAgentsToast('Problema actualizando el agente, pruebe de nuevo por favor', 'error');
      // No deshabilitamos el botón en error
    }, 1000);
    AGENTS_STATE.isSaving = false;
  }
}

// Override showGeneratedAgent with the later definition from the IIFE
function showGeneratedAgent(agentData){
  if(agentData && agentData.etiqueta_personalizada){
    setTimeout(()=> loadExistingAgents(), 100);
    setTimeout(()=>{
      const configMenu = document.querySelector('.config-menu');
      if(configMenu) configMenu.scrollIntoView({behavior:'smooth', block:'start'});
    }, 200);
  }
}
// Expose agents functions globally
window.openAgentDetail = openAgentDetail;
window.saveAgentChanges = saveAgentChanges;
window.attemptCloseAgentModal = attemptCloseAgentModal;
window.closeAgentOverlay = closeAgentOverlay;

function openNewAgentModal(){
  const overlay = document.getElementById('agentDetailOverlay');
  const title = document.getElementById('agentModalTitle');
  const titleText = document.getElementById('agentTitleText');
  const editNameBtn = document.getElementById('editAgentNameBtn');
  const ctxInput = document.getElementById('agentContexto');
  const objInput = document.getElementById('agentObjetivo');
  const contInput = document.getElementById('agentContenido');
  const noInclInput = document.getElementById('agentNoIncluidos');
  const saveBtn = document.getElementById('saveAgentChangesBtn');
  const closeBtn = document.getElementById('closeAgentModal');

  // Set placeholders based on Protección de Datos example
  titleText.textContent = 'Protección de Datos';
  ctxInput.value = '';
  ctxInput.placeholder = 'Ejemplo: Es una empresa del sector sanitario que presta servicios médicos y asistenciales.';
  objInput.value = '';
  objInput.placeholder = 'Ejemplo: Detectar novedades normativas relevantes en protección de datos e IA';
  contInput.value = '';
  contInput.placeholder = `Ejemplo:  Se debe etiquetar el <DOCUMENTO> si cumple al menos uno de los siguientes supuestos:
a) Impone nuevas obligaciones, prohibiciones o medidas que obliguen a empresas a adaptar su operativa o sistemas.
b) Establece sanciones económicas o decisiones judiciales en materia de protección de datos.
c) Es una ley general u orgánica relevante para la etiqueta
d) Establece novedades normativas en materia de datos sanitarios.
e) Establece una recomendación o guía de mejores prácticas relevantes para protección de datos o aplicación de la IA.`;
  noInclInput.value = '';
  noInclInput.placeholder = `Ejemplo: EL <DOCUMENTO> No DEBE SER ETIQUETADO por esta etiqueta SI CUMPLE ALGUNO DE LOS SIGUIENTES SUPUESTOS:
Lista exhaustiva (no ampliar):
a) Nombramientos o ceses individuales de Delegados de Protección de Datos (DPO).
b) Convenios o resoluciones no sancionadoras que afectan a particulares concretos, empresas concretas o interadministrativos sin efectos jurídicos generales
c) Subvenciones sin impacto en la regulación del tratamiento de datos.
d) Documentos de otra materia cuya "inclusión" derive solo de menciones tangenciales al RGPD/LOPDGDD.`;

  // Enable all inputs for creation
  [ctxInput, objInput, contInput, noInclInput].forEach(el=>{
    el.disabled = false;
    if(el.tagName === 'TEXTAREA') el.readOnly = false;
  });
  saveBtn.disabled = false;

  // Set state for new agent creation
  AGENTS_STATE.currentAgentKey = null; // null indicates new agent
  AGENTS_STATE.originalXml = '';
  AGENTS_STATE.originalVars = null;
  AGENTS_STATE.isDirty = false;
  AGENTS_STATE.isEditing = true;

  const markDirty = ()=>{
    AGENTS_STATE.isDirty = true;
    saveBtn.disabled = false;
  };
  [ctxInput, objInput, contInput, noInclInput].forEach(el=>{ el.oninput = markDirty; });

  // Edición de nombre en el título
  if (editNameBtn){
    editNameBtn.onclick = ()=>{
      const spanNow = document.getElementById('agentTitleText');
      const current = (spanNow?.textContent) || '';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'product-input';
      input.style.height = '32px';
      input.style.fontSize = '16px';
      input.style.padding = '6px 10px';
      input.style.marginLeft = '0';
      (spanNow || titleText).replaceWith(input);
      input.focus();
      const commit = ()=>{
        const trimmed = (input.value || '').trim();
        const newSpan = document.createElement('span');
        newSpan.id = 'agentTitleText';
        newSpan.textContent = trimmed || current;
        input.replaceWith(newSpan);
        if ((trimmed || current) !== current) {
          AGENTS_STATE.isDirty = true;
          const saveBtn = document.getElementById('saveAgentChangesBtn');
          if (saveBtn) saveBtn.disabled = false;
        }
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter'){ e.preventDefault(); input.blur(); }
        if(e.key === 'Escape'){ input.value = current; input.blur(); }
      });
    };
  }

  saveBtn.onclick = ()=> {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<div class="button-spinner"></div> Guardando...';
    saveNewAgent(saveBtn);
  };
  closeBtn.onclick = ()=> attemptCloseAgentModal();

  overlay.style.display = 'flex';
}

async function saveNewAgent(triggerBtn){
  try{
    if (AGENTS_STATE.isSaving) return;
    AGENTS_STATE.isSaving = true;
    const titleText = document.getElementById('agentTitleText');
    const ctxInput = document.getElementById('agentContexto');
    const objInput = document.getElementById('agentObjetivo');
    const contInput = document.getElementById('agentContenido');
    const noInclInput = document.getElementById('agentNoIncluidos');

    const newVars = {
      NombreEtiqueta: (titleText.textContent||'').trim(),
      tipo: '',
      Contexto: (ctxInput.value||'').trim(),
      Objetivo: (objInput.value||'').trim(),
      Contenido: (contInput.value||'').trim(),
      DocumentosNoIncluidos: (noInclInput.value||'').trim()
    };

    if(!newVars.NombreEtiqueta){
      alert('El nombre del agente es obligatorio.');
      AGENTS_STATE.isSaving = false;
      const btn = triggerBtn || document.getElementById('saveAgentChangesBtn');
      if(btn){ btn.innerHTML = '<i class="fas fa-save"></i> Guardar'; btn.disabled = false; }
      return;
    }

    const newXml = buildEtiquetaXml(newVars);
    const response = await fetch('/api/get-user-data');
    const userData = await response.json();
    const etiquetas = userData.etiquetas_personalizadas || {};

    const newKey = newVars.NombreEtiqueta;
    etiquetas[newKey] = newXml;

    const updateResponse = await fetch('/api/update-user-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etiquetas_personalizadas: etiquetas })
    });
    if(!updateResponse.ok) throw new Error('HTTP '+updateResponse.status);

    AGENTS_STATE.isDirty = false;
    AGENTS_STATE.currentAgentKey = newKey;
    AGENTS_STATE.originalXml = newXml;
    AGENTS_STATE.originalVars = newVars;

    await loadExistingAgents();

    const btn = triggerBtn || document.getElementById('saveAgentChangesBtn');
    if (btn){
      btn.innerHTML = '<i class="fas fa-check"></i>';
    }
    setTimeout(()=>{
      showAgentsToast('Agente creado correctamente', 'success');
      setTimeout(()=>{
        if (btn){ btn.innerHTML = '<i class="fas fa-save"></i> Guardar'; btn.disabled = true; }
        closeAgentOverlay(); // Cerrar modal tras crear
      }, 2000);
    }, 1000);

    AGENTS_STATE.isSaving = false;
  }catch(err){
    console.error('Error al crear el agente:', err);
    const btn = triggerBtn || document.getElementById('saveAgentChangesBtn');
    if(btn){ btn.innerHTML = '<i class="fas fa-save"></i> Guardar'; btn.disabled = false; }
    setTimeout(()=>{
      showAgentsToast('Problema creando el agente, pruebe de nuevo por favor', 'error');
    }, 1000);
    AGENTS_STATE.isSaving = false;
  }
}

// Expose new agent creation functions globally
window.openNewAgentModal = openNewAgentModal;
window.saveNewAgent = saveNewAgent;

