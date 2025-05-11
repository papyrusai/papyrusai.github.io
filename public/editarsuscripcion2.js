// Variables globales
let currentUserPlan = 'plan1'; // Valor por defecto, se actualizará con el plan real del usuario

//---------- funciones Gestionar Cambios --------------------
function getPlanLimits(planType, extraAgentes = 0, extraFuentes = 0) {
  // Límites base por plan
  const baseLimits = {
    plan1: { fuentes: 0, agentes: 0 }, // Plan Free
    plan2: { fuentes: 1, agentes: 5 }, // Plan Starter
    plan3: { fuentes: 5, agentes: 12 }, // Plan Pro (asumiendo 10 agentes para plan3)
    plan4: { fuentes: Infinity, agentes: Infinity } // Plan Enterprise (sin límites)
  };
  
  // Obtener límites base según el plan
  const baseLimit = baseLimits[planType] || baseLimits.plan1;
  
  // Calcular límites finales considerando extras
  const finalLimits = {
    // Cada unidad de extra_fuentes añade 1 fuente
    fuentes: baseLimit.fuentes === Infinity ? Infinity : baseLimit.fuentes + extraFuentes,
    
    // Cada unidad de extra_agentes añade 15 agentes
    agentes: baseLimit.agentes === Infinity ? Infinity : baseLimit.agentes + (extraAgentes * 12)
  };
  
  return finalLimits;
}

function checkFuentesLimit(tipo) {
  // Obtener el plan actual del usuario
  const currentPlan = window.userData?.subscription_plan || 'plan1';
  
  // Obtener los extras del usuario
  const extraFuentes = parseInt(window.userData?.extra_fuentes || 0);
  const extraAgentes = parseInt(window.userData?.extra_agentes || 0);
  
  // Obtener los límites del plan considerando extras
  const planLimits = getPlanLimits(currentPlan, extraAgentes, extraFuentes);
  
  // Obtener la cobertura legal actual
  let coberturaLegal = {};
  try {
    const userCoberturaElement = document.getElementById('userCoberturaLegal');
    if (userCoberturaElement) {
      coberturaLegal = JSON.parse(userCoberturaElement.textContent || '{}');
    }
  } catch (error) {
    console.error('Error al obtener cobertura legal:', error);
    coberturaLegal = { 'fuentes-gobierno': [], 'fuentes-reguladores': [] };
  }
  
  // Asegurar que coberturaLegal tiene la estructura correcta
  if (!coberturaLegal['fuentes-gobierno']) coberturaLegal['fuentes-gobierno'] = [];
  if (!coberturaLegal['fuentes-reguladores']) coberturaLegal['fuentes-reguladores'] = [];
  
  // Calcular el total de fuentes (suma de fuentes-gobierno y fuentes-reguladores)
  const totalFuentes = coberturaLegal['fuentes-gobierno'].length + coberturaLegal['fuentes-reguladores'].length;
  
  // Comprobar si se ha alcanzado el límite
  if (totalFuentes >= planLimits.fuentes) {
    // Mostrar modal de actualización
    showUpgradePlanModal('fuentes', planLimits.fuentes, currentPlan, extraFuentes);
    return false; // No permitir añadir más fuentes
  }
  
  return true; // Permitir añadir más fuentes
}
function checkAgentesLimit() {
  // Obtener el plan actual del usuario
  const currentPlan = window.userData?.subscription_plan || 'plan1';
  
  // Obtener los extras del usuario
  const extraFuentes = parseInt(window.userData?.extra_fuentes || 0);
  const extraAgentes = parseInt(window.userData?.extra_agentes || 0);
  
  // Obtener los límites del plan considerando extras
  const planLimits = getPlanLimits(currentPlan, extraAgentes, extraFuentes);
  
  // Obtener las etiquetas personalizadas actuales
  let etiquetasPersonalizadas = {};
  try {
    const userEtiquetasElement = document.getElementById('userEtiquetasPersonalizadas');
    if (userEtiquetasElement) {
      etiquetasPersonalizadas = JSON.parse(userEtiquetasElement.textContent || '{}');
    }
  } catch (error) {
    console.error('Error al obtener etiquetas personalizadas:', error);
    etiquetasPersonalizadas = {};
  }
  
  // Calcular el total de agentes
  const totalAgentes = Object.keys(etiquetasPersonalizadas).length;
  
  // Comprobar si se ha alcanzado el límite
  if (totalAgentes >= planLimits.agentes) {
    // Mostrar modal de actualización
    showUpgradePlanModal('agentes', planLimits.agentes, currentPlan, extraAgentes);
    return false; // No permitir añadir más agentes
  }
  
  return true; // Permitir añadir más agentes
}

//---------------- Fx ofrecer otros planes si pasas limite --------------------
function showUpgradePlanModal(tipo, limite, currentPlan, extraActual) {
  // Crear el elemento del modal
  const upgradeModal = document.createElement('div');
  upgradeModal.className = 'upgrade-modal';
  
  // Determinar el siguiente plan recomendado
  let nextPlan = '';
  let nextPlanName = '';
  let upgradeOptions = '';
  
  if (currentPlan === 'plan1') {
    nextPlan = 'plan2';
    nextPlanName = 'Starter';
    upgradeOptions = `
      <button class="upgrade-button" data-plan="plan2">Actualizar a Starter</button>
    `;
  } else if (currentPlan === 'plan2') {
    nextPlan = 'plan3';
    nextPlanName = 'Pro';
    upgradeOptions = `
      <button class="upgrade-button" data-plan="plan3">Actualizar a Pro</button>
    `;
  } else if (currentPlan === 'plan3') {
    nextPlan = 'plan4';
    nextPlanName = 'Enterprise';
    upgradeOptions = `
      <button class="upgrade-button" data-plan="plan4">Actualizar a Enterprise</button>
    `;
  }
  
  // Opción para añadir extras
  /*
  const extraType = tipo === 'fuentes' ? 'extra_fuentes' : 'extra_agentes';
  const extraName = tipo === 'fuentes' ? 'fuentes adicionales' : 'agentes adicionales';
  const extraIncrement = tipo === 'fuentes' ? 1 : 15;
  const extraCost = tipo === 'fuentes' ? '15€/mes' : '50€/mes';
  
  upgradeOptions += `
    <button class="add-extra-button" data-extra-type="${extraType}" data-current="${extraActual}">
      Añadir ${extraName} (+${extraIncrement}) por ${extraCost}
    </button>
  `;
  */

  // Crear el contenido del modal
  upgradeModal.innerHTML = `
    <div class="upgrade-content">
      <div class="upgrade-header">
        <h3>Límite alcanzado</h3>
        <span class="close-upgrade-modal">&times;</span>
      </div>
      <div class="upgrade-message">
        <p>Has alcanzado el límite de ${tipo === 'fuentes' ? 'fuentes oficiales' : 'agentes personalizados'} para tu plan actual.</p>
        <p>Tu plan actual permite un máximo de ${limite} ${tipo === 'fuentes' ? 'fuentes oficiales' : 'agentes personalizados'}.</p>
        <p>Para añadir más ${tipo === 'fuentes' ? 'fuentes oficiales' : 'agentes personalizados'}, tienes estas opciones:</p>
      </div>
      <div class="upgrade-actions">
        ${upgradeOptions}
        <button class="cancel-upgrade-button">Cancelar</button>
      </div>
    </div>
  `;
  
  // Añadir estilos CSS para el modal
  if (!document.getElementById('upgrade-modal-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'upgrade-modal-styles';
    styleElement.textContent = `
      .upgrade-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10001;
      }
      
      .upgrade-content {
        background-color: white;
        border-radius: 8px;
        padding: 0;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      }
      
      .upgrade-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px 20px;
        border-bottom: 1px solid #e0e0e0;
      }
      
      .upgrade-header h3 {
        margin: 0;
        color: #0b2431;
        font-size: 18px;
      }
      
      .close-upgrade-modal {
        font-size: 24px;
        cursor: pointer;
        color: #666;
      }
      
      .upgrade-message {
        padding: 20px;
        color: #0b2431;
      }
      
      .upgrade-message p {
        margin: 10px 0;
      }
      
      .upgrade-actions {
        display: flex;
        flex-direction: column;
        padding: 15px 20px;
        border-top: 1px solid #e0e0e0;
        gap: 10px;
      }
      
      .upgrade-button, .add-extra-button {
        background-color: #04db8d;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 10px 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.3s ease;
      }
      
      .upgrade-button:hover, .add-extra-button:hover {
        background-color: #03c07d;
      }
      
      .add-extra-button {
        background-color: #455862;
      }
      
      .add-extra-button:hover {
        background-color: #364650;
      }
      
      .cancel-upgrade-button {
        background-color: #f8f8f8;
        color: #0b2431;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        padding: 10px 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.3s ease;
      }
      
      .cancel-upgrade-button:hover {
        background-color: #eaeaea;
      }
    `;
    document.head.appendChild(styleElement);
  }
  
  // Añadir el modal al DOM
  document.body.appendChild(upgradeModal);
  
  // Añadir event listeners
  const closeButton = upgradeModal.querySelector('.close-upgrade-modal');
  const upgradeButton = upgradeModal.querySelector('.upgrade-button');
  const addExtraButton = upgradeModal.querySelector('.add-extra-button');
  const cancelButton = upgradeModal.querySelector('.cancel-upgrade-button');
  
  // Función para cerrar el modal
  const closeModal = () => {
    document.body.removeChild(upgradeModal);
  };
  
  // Event listener para el botón de cerrar
  closeButton.addEventListener('click', closeModal);
  
  // Event listener para el botón de actualizar
  if (upgradeButton) {
    upgradeButton.addEventListener('click', (e) => {
      const planToUpgrade = e.target.getAttribute('data-plan');
      closeModal();
      handlePlanUpgrade({ target: { textContent: nextPlanName }, preventDefault: () => {} });
    });
  }
  
  // Event listener para el botón de añadir extras
  if (addExtraButton) {
    addExtraButton.addEventListener('click', (e) => {
      const extraType = e.target.getAttribute('data-extra-type');
      const currentExtra = parseInt(e.target.getAttribute('data-current') || '0');
      const newExtra = currentExtra + 1;
      
      closeModal();
      handleAddExtra(extraType, newExtra);
    });
  }
  
  // Event listener para el botón de cancelar
  cancelButton.addEventListener('click', closeModal);
  
  // También cerrar al hacer clic fuera del contenido
  upgradeModal.addEventListener('click', (e) => {
    if (e.target === upgradeModal) {
      closeModal();
    }
  });
}

//--------------- Ofrecer Extras -----------------------
async function handleAddExtra(extraType, newValue) {
  // Mostrar loader mientras se procesa
  mostrarLoader();
  
  try {
    // Crear el objeto con los datos a actualizar
    const dataToUpdate = {
      [extraType]: newValue
    };
    
    // Guardar en el backend
    await saveUserDataToBackend(dataToUpdate);
    
    // Actualizar los datos del usuario en memoria
    if (window.userData) {
      window.userData[extraType] = newValue;
    }
    
    // Actualizar la interfaz
    if (extraType === 'extra_fuentes') {
      createSourcesSection();
    } else if (extraType === 'extra_agentes') {
      createAgentsSection();
    }
    
    // Notificar al usuario
    const extraName = extraType === 'extra_fuentes' ? 'fuentes adicionales' : 'agentes adicionales';
    alert_personalizada(`Has añadido ${extraName} a tu plan. Tu límite ha sido actualizado.`);
  } catch (error) {
    console.error(`Error al añadir ${extraType}:`, error);
    alert_personalizada(`Ha ocurrido un error al añadir ${extraType === 'extra_fuentes' ? 'fuentes adicionales' : 'agentes adicionales'}. Por favor, inténtalo de nuevo.`);
  } finally {
    ocultarLoader();
  }
}

function alert_personalizada(mensaje) {
  // Crear el elemento del modal de alerta
  const alertModal = document.createElement('div');
  alertModal.className = 'alert-modal';
  
  // Crear el contenido del modal
  alertModal.innerHTML = `
    <div class="alert-content">
      <div class="alert-message">${mensaje}</div>
      <button class="alert-button">Aceptar</button>
    </div>
  `;
  
  // Añadir estilos CSS para el modal de alerta
  if (!document.getElementById('alert-modal-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'alert-modal-styles';
    styleElement.textContent = `
      .alert-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
      }
      
      .alert-content {
        background-color: white;
        border-radius: 8px;
        padding: 20px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        text-align: center;
      }
      
      .alert-message {
        margin-bottom: 20px;
        color: #0b2431;
        font-size: 16px;
      }
      
      .alert-button {
        background-color: #04db8d;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 10px 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.3s ease;
      }
      
      .alert-button:hover {
        background-color: #03c07d;
      }
    `;
    document.head.appendChild(styleElement);
  }
  
  // Añadir el modal al DOM
  document.body.appendChild(alertModal);
  
  // Añadir event listener para cerrar el modal
  const alertButton = alertModal.querySelector('.alert-button');
  alertButton.addEventListener('click', () => {
    document.body.removeChild(alertModal);
  });
  
  // También cerrar al hacer clic fuera del contenido
  alertModal.addEventListener('click', (e) => {
    if (e.target === alertModal) {
      document.body.removeChild(alertModal);
    }
  });
}
function confirm_personalizada(mensaje, onConfirm, onCancel) {
  // Crear el elemento del modal de confirmación
  const confirmModal = document.createElement('div');
  confirmModal.className = 'confirm-modal';
  
  // Crear el contenido del modal
  confirmModal.innerHTML = `
    <div class="confirm-content">
      <div class="confirm-message">${mensaje}</div>
      <div class="confirm-buttons">
        <button class="confirm-button confirm-yes">Aceptar</button>
        <button class="confirm-button confirm-no">Cancelar</button>
      </div>
    </div>
  `;
  
  // Añadir estilos CSS para el modal de confirmación
  if (!document.getElementById('confirm-modal-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'confirm-modal-styles';
    styleElement.textContent = `
      .confirm-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
      }
      
      .confirm-content {
        background-color: white;
        border-radius: 8px;
        padding: 20px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        text-align: center;
      }
      
      .confirm-message {
        margin-bottom: 20px;
        color: #0b2431;
        font-size: 16px;
      }
      
      .confirm-buttons {
        display: flex;
        justify-content: center;
        gap: 15px;
      }
      
      .confirm-button {
        border: none;
        border-radius: 4px;
        padding: 10px 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.3s ease;
      }
      
      .confirm-yes {
        background-color: #04db8d;
        color: white;
      }
      
      .confirm-yes:hover {
        background-color: #03c07d;
      }
      
      .confirm-no {
        background-color: #f8f8f8;
        color: #0b2431;
        border: 1px solid #e0e0e0;
      }
      
      .confirm-no:hover {
        background-color: #eaeaea;
      }
    `;
    document.head.appendChild(styleElement);
  }
  
  // Añadir el modal al DOM
  document.body.appendChild(confirmModal);
  
  // Añadir event listeners para los botones
  const confirmYesButton = confirmModal.querySelector('.confirm-yes');
  const confirmNoButton = confirmModal.querySelector('.confirm-no');
  
  // Función para cerrar el modal
  const closeModal = () => {
    document.body.removeChild(confirmModal);
  };
  
  // Event listener para el botón Aceptar
  confirmYesButton.addEventListener('click', () => {
    closeModal();
    if (typeof onConfirm === 'function') {
      onConfirm();
    }
  });
  
  // Event listener para el botón Cancelar
  confirmNoButton.addEventListener('click', () => {
    closeModal();
    if (typeof onCancel === 'function') {
      onCancel();
    }
  });
  
  // También cerrar al hacer clic fuera del contenido
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
      closeModal();
      if (typeof onCancel === 'function') {
        onCancel();
      }
    }
  });
}
function mostrarLoader() {
  // Crear el elemento del loader si no existe
  if (!document.getElementById('loader-overlay')) {
    const loaderOverlay = document.createElement('div');
    loaderOverlay.id = 'loader-overlay';
    loaderOverlay.className = 'loader-overlay';
    
    // Crear el contenido del loader
    loaderOverlay.innerHTML = `
      <div class="loader-spinner">
        <div class="spinner"></div>
        <p>Cargando...</p>
      </div>
    `;
    
    // Añadir estilos CSS para el loader
    if (!document.getElementById('loader-styles')) {
      const styleElement = document.createElement('style');
      styleElement.id = 'loader-styles';
      styleElement.textContent = `
        .loader-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(255, 255, 255, 0.8);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999;
        }
        
        .loader-spinner {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        
        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(4, 219, 141, 0.3);
          border-radius: 50%;
          border-top-color: #04db8d;
          animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .loader-spinner p {
          margin-top: 10px;
          color: #0b2431;
          font-size: 14px;
          font-weight: 500;
        }
      `;
      document.head.appendChild(styleElement);
    }
    
    // Añadir el loader al DOM
    document.body.appendChild(loaderOverlay);
  } else {
    // Mostrar el loader si ya existe
    document.getElementById('loader-overlay').style.display = 'flex';
  }
}

function ocultarLoader() {
  // Ocultar el loader si existe
  const loaderOverlay = document.getElementById('loader-overlay');
  if (loaderOverlay) {
    loaderOverlay.style.display = 'none';
  }
}

// 2. Implementación de la funcionalidad de logout
function handleLogout() {
  // Mostrar confirmación antes de cerrar sesión
  confirm_personalizada('¿Estás seguro de que deseas cerrar sesión?', async () => {
    // Mostrar loader mientras se procesa el logout
    mostrarLoader();
    
    try {
      // Realizar la petición de logout al servidor
      const response = await fetch('/logout', {
        method: 'GET',
        credentials: 'include' // Para incluir cookies de sesión
      });
      
      if (!response.ok) {
        throw new Error(`Error al cerrar sesión: ${response.status}`);
      }
      
      // Redirigir a la página de login
      window.location.href = '/index.html';
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      alert_personalizada('Ha ocurrido un error al cerrar sesión. Por favor, inténtalo de nuevo.');
      ocultarLoader();
    }
  });
}

// 3. Implementación de la cancelación de suscripción
async function handleCancelSubscription() {
  // Mostrar confirmación antes de cancelar la suscripción
  confirm_personalizada('¿Estás seguro de que deseas cancelar tu suscripción? Perderás acceso a todas las funcionalidades de tu plan.', async () => {
    // Mostrar loader mientras se procesa la cancelación
    mostrarLoader();
    
    try {
      // Obtener los datos del usuario para mantener algunas variables
      const userData = window.userData || {};
      
      // Crear el objeto con los datos a actualizar
      const dataToUpdate = {
        // Cancelar la suscripción de Stripe
        cancel_stripe_subscription: true,
        // Establecer el billing_interval a "suscripción cancelada"
        billing_interval: 'suscripción cancelada',
        // Vaciar las variables de rangos, fuentes y etiquetas personalizadas
        rangos: [],
        cobertura_legal: {
          'fuentes-gobierno': [],
          'fuentes-reguladores': []
        },
        etiquetas_personalizadas: {}
      };
      
      // Realizar la petición para cancelar la suscripción
      const response = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToUpdate),
        credentials: 'include' // Para incluir cookies de sesión
      });
      
      if (!response.ok) {
        throw new Error(`Error al cancelar suscripción: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Cerrar el modal de suscripción
      const modal = document.getElementById('subscriptionModal');
      if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      }
      
      // Mostrar mensaje de éxito
      alert_personalizada('Tu suscripción ha sido cancelada correctamente. Serás redirigido a la página de inicio.');
      
      // Redirigir a la página de inicio después de un breve retraso
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (error) {
      console.error('Error al cancelar suscripción:', error);
      alert_personalizada('Ha ocurrido un error al cancelar tu suscripción. Por favor, inténtalo de nuevo o contacta con soporte.');
      ocultarLoader();
    }
  });
}

// 4. Implementación de la actualización de planes
async function handlePlanUpgrade(event) {
  // Prevenir comportamiento por defecto del botón
  event.preventDefault();
  
  // Obtener el plan seleccionado del botón
  const button = event.target;
  const planText = button.textContent.trim().toLowerCase();
  
  // Determinar el plan basado en el texto del botón
  let planType = '';
  if (planText.includes('starter')) {
    planType = 'plan2';
  } else if (planText.includes('pro')) {
    planType = 'plan3';
  } else if (planText.includes('enterprise') || planText.includes('ventas')) {
    planType = 'plan4';
    window.location.href = 'https://calendar.google.com/calendar/appointments/schedules/AcZssZ1WN1IhU22dyAFucB4mXPHcgF-5WKU57UAVbkMGuiAVfDRvLcKyLY14oKB8Il6siszUXya8T4Jt';
    return;
  } else {
    alert_personalizada('No se pudo determinar el plan seleccionado. Por favor, inténtalo de nuevo.');
    return;
  }
  
  // Mostrar confirmación antes de actualizar el plan
  confirm_personalizada(`¿Estás seguro de que deseas actualizar a ${button.textContent.trim()}?`, async () => {
    // Mostrar loader mientras se procesa la actualización
    mostrarLoader();
    
    try {
      // Obtener los datos del usuario actual
      const userData = window.userData || {};
      
      // Crear el payload para la actualización del plan
      const payload = {
        plan: planType,
        billingInterval: 'monthly', // Por defecto mensual, se podría añadir opción para elegir
        isTrial: true, // Período de prueba de 15 días

        // Añadir los campos que faltaban y causaban el error
        extra_agentes: userData.extra_agentes || 0, // Valor por defecto: 1
        extra_fuentes: userData.extra_fuentes || 0, // Valor por defecto: 3
        impact_analysis_limit:userData.impact_analysis_limit, // Función para determinar el límite según el plan
        
        // Datos del usuario desde MongoDB (ya existentes)
        industry_tags: userData.industry_tags || [],
        sub_industria_map: userData.sub_industria_map || {},
        rama_juridicas: userData.rama_juridicas || [],
        sub_rama_map: userData.sub_rama_map || {},
        rangos: userData.rangos || [],
        cobertura_legal: userData.cobertura_legal || {
          'fuentes-gobierno': [],
          'fuentes-reguladores': []
        },
        
        // Información del perfil
        name: userData.name || '',
        web: userData.web || '',
        linkedin: userData.linkedin || '',
        perfil_profesional: userData.perfil_profesional || '',
        company_name: userData.company_name || '',
        profile_type: userData.profile_type || '',
        feedback: userData.feedback || '',
        etiquetas_personalizadas: userData.etiquetas_personalizadas || {}
        
      };
      
      console.log('Enviando payload para actualización de plan:', payload);
      
      // Realizar la petición para crear la sesión de checkout
      const response = await fetch('/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'include' // Para incluir cookies de sesión
      });
      
      if (!response.ok) {
        throw new Error(`Error al crear sesión de checkout: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Redirigir a la página de checkout de Stripe
      if (result.sessionId) {
        const stripe = Stripe('pk_live_51REzuGDXdzt0y1c97cWOhKbTvduvuVI4w1fQsKM672HypXhGT0EtiLhjVTl3Hxyi7rW7RBbZ4xd4bhL7arcPljKt00Qrz892wG');
        await stripe.redirectToCheckout({ sessionId: result.sessionId });
      } else if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
      } else {
        throw new Error('No se recibió información de redirección del servidor');
      }
    } catch (error) {
      console.error('Error al actualizar plan:', error);
      alert_personalizada('Ha ocurrido un error al procesar tu solicitud. Por favor, inténtalo de nuevo o contacta con soporte.');
      ocultarLoader();
    }
  });
}


    // ---------------------- GET USER DATA ----------------------------
// 9. Modificación de la función principal para cargar los datos del usuario
document.addEventListener('DOMContentLoaded', async function() {
  // Cargar los datos del usuario
  await loadUserData();
  
  // Crear e inicializar el modal de suscripción
  createSubscriptionModal();
  initSubscriptionModal();
  
  // Añadir event listener para el botón de editar suscripción
  const editSuscriptionButtons = document.querySelectorAll('#editSuscription, #editSuscription2, #editSuscription3');
  editSuscriptionButtons.forEach(button => {
    // Remove any existing event listeners
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    
    // Add new event listener to show the subscription modal directly
    newButton.addEventListener('click', function(e) {
      e.preventDefault();
      // Show subscription container instead of redirecting
      if (typeof showSubscriptionModal === 'function') {
        showSubscriptionModal();
      } else {
        // Fallback if the function isn't available
        const modal = document.getElementById('subscription-container');
        if (modal) {
          modal.style.display = 'block';
        } else {
          console.error('Subscription container not found');
          alert('La funcionalidad de editar suscripción estará disponible próximamente.');
        }
      }
    });
  });
});


//Save data to backends
async function saveUserDataToBackend(dataToUpdate) {
  // Mostrar loader
  mostrarLoader();
  
  try {
    const response = await fetch('/api/update-user-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataToUpdate),
      credentials: 'include' // Para incluir cookies de sesión
    });
    
    if (!response.ok) {
      throw new Error(`Error al guardar datos: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error al guardar datos en el backend:', error);
    alert_personalizada('Ha ocurrido un error al guardar los cambios. Por favor, inténtalo de nuevo.');
    throw error;
  } finally {
    // Ocultar loader
    ocultarLoader();
  }
}


// Modificación 3: Implementar la sección de gestión de agentes
function createAgentsSection() {
    // Obtener la sección de agentes
    const agentsSection = document.getElementById('agents');
    if (!agentsSection) return;

    // Obtener el plan actual del usuario
  const currentPlan = window.userData?.subscription_plan || 'plan1';
  
  // Obtener los extras del usuario
  const extraFuentes = parseInt(window.userData?.extra_fuentes || 0);
  const extraAgentes = parseInt(window.userData?.extra_agentes || 0);
  
  // Obtener los límites del plan considerando extras
  const planLimits = getPlanLimits(currentPlan, extraAgentes, extraFuentes);
    // Obtener las etiquetas personalizadas del usuario
    let etiquetasPersonalizadas = {};
    try {
      const userEtiquetasElement = document.getElementById('userEtiquetasPersonalizadas');
      if (userEtiquetasElement) {
        etiquetasPersonalizadas = JSON.parse(userEtiquetasElement.textContent || '{}');
      }
    } catch (error) {
      console.error('Error al obtener etiquetas personalizadas:', error);
      etiquetasPersonalizadas = {};
    }
    
    // Crear el contenido de la sección
    let agentsContent = `
      <h2>Gestión de Agentes</h2>
      <p>Configura los agentes para que analicen los cambios normativos de tu interés.</p>
    `;
    
    // Verificar si hay etiquetas personalizadas
    if (Object.keys(etiquetasPersonalizadas).length === 0) {
      // Mostrar mensaje si no hay agentes
      agentsContent += `
        <div class="no-agents-message">
          <p>Hemos actualizado nuestro sistema de agentes. Aún no tienes agentes personalizados configurados.</p>
          <button class="redirect-button" onclick="window.location.href='https://app.reversa.ai/paso1.html'">
            Configurar Agentes
          </button>
        </div>
      `;
    } else {
      
      // Mostrar contador de etiquetas actualizado
    const totalAgentes = Object.keys(etiquetasPersonalizadas).length;
    const maxAgentes = planLimits.agentes === Infinity ? '∞' : planLimits.agentes;
    
    // Mostrar información sobre extras si hay extras de agentes
    let extrasInfo = '';
    if (extraAgentes > 0) {
      extrasInfo = `<span class="extras-info">(Incluye ${extraAgentes * 15} agentes adicionales)</span>`;
    }
    agentsContent += `
    <div class="etiquetas-contador">
      <span class="contador-etiquetas">${totalAgentes}/${maxAgentes}</span> agentes seleccionados ${extrasInfo}
    </div>
    
    <div class="agents-container" id="etiquetas-personalizadas-container">
  `;
  // Añadir botón desplegable para añadir nuevo agente
  agentsContent += `
  <div class="add-agent-dropdown">
    <button class="add-agent-button" onclick="toggleAddAgentForm()">
      <i class="fas fa-plus-circle"></i> Añadir nuevo agente
      <i class="fas fa-chevron-down dropdown-icon"></i>
    </button>
    <div id="add-agent-form" class="add-agent-form" style="display: none;">
      <form class="etiqueta-form" onsubmit="event.preventDefault(); agregarEtiquetaPersonalizada();">
        <div class="form-group">
          <label for="nombre-etiqueta">Nombre del agente:</label>
          <input type="text" id="nombre-etiqueta" placeholder="Ej: Protección de datos" required>
        </div>
        <div class="form-group">
          <label for="descripcion-etiqueta">Descripción:</label>
          <textarea id="descripcion-etiqueta" placeholder="Describe la función de este agente..." required></textarea>
        </div>
        <button type="submit" class="btn-add-etiqueta">Añadir Agente</button>
      </form>
    </div>
  </div>
`;
      
      // Crear una caja para cada etiqueta
      Object.keys(etiquetasPersonalizadas).forEach(etiqueta => {
        const descripcion = etiquetasPersonalizadas[etiqueta];
        
        agentsContent += `
          <div class="rama-box" data-etiqueta="${etiqueta}">
            <div class="rama-header">
              <h4>${etiqueta}</h4>
              <div>
                <button class="edit-button" onclick="habilitarEdicionEtiqueta('${etiqueta}')">
                  <span class="edit-text">Editar</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </button>
                <span class="tag-remove" onclick="eliminarEtiquetaPersonalizada('${etiqueta}')">×</span>
              </div>
            </div>
            <div class="rama-detail" style="display: block;">
              <p class="etiqueta-descripcion">${descripcion}</p>
            </div>
          </div>
        `;
      });
      
      // Cerrar el contenedor de agentes
      agentsContent += `
        </div>
      `;
    }
    
    // Actualizar el contenido de la sección
    agentsSection.innerHTML = agentsContent;
    
    // Añadir estilos CSS para el botón desplegable
    if (!document.getElementById('add-agent-dropdown-styles')) {
      const styleElement = document.createElement('style');
      styleElement.id = 'add-agent-dropdown-styles';
      styleElement.textContent = `
        .add-agent-dropdown {
          margin-bottom: 20px;
        }
        
        .add-agent-button {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 12px 15px;
          background-color: #f8f8f8;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          color: #0b2431;
          transition: background-color 0.3s ease;
        }
        
        .add-agent-button:hover {
          background-color: #eaeaea;
        }
        
        .add-agent-button i {
          margin-right: 5px;
          color: #04db8d;
        }
        
        .dropdown-icon {
          margin-left: auto;
          margin-right: 0;
          transition: transform 0.3s ease;
        }
        
        .dropdown-icon.open {
          transform: rotate(180deg);
        }
        
        .add-agent-form {
          margin-top: 10px;
          padding: 15px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background-color: #f9f9f9;
        }
      `;
      document.head.appendChild(styleElement);
    }
  }

  // Función para mostrar/ocultar el formulario de añadir agente
  function toggleAddAgentForm() {
    const addAgentForm = document.getElementById('add-agent-form');
    const dropdownIcon = document.querySelector('.dropdown-icon');
    
    if (addAgentForm.style.display === 'none') {
      addAgentForm.style.display = 'block';
      dropdownIcon.classList.add('open');
    } else {
      addAgentForm.style.display = 'none';
      dropdownIcon.classList.remove('open');
    }
  }
  
  // Función para habilitar la edición de una etiqueta
  function habilitarEdicionEtiqueta(etiqueta) {
    // Obtener las etiquetas personalizadas del usuario
    let etiquetasPersonalizadas = {};
    try {
      const userEtiquetasElement = document.getElementById('userEtiquetasPersonalizadas');
      if (userEtiquetasElement) {
        etiquetasPersonalizadas = JSON.parse(userEtiquetasElement.textContent || '{}');
      }
    } catch (error) {
      console.error('Error al obtener etiquetas personalizadas:', error);
      return;
    }
    
    if (!etiquetasPersonalizadas[etiqueta]) return;
    
    const descripcion = etiquetasPersonalizadas[etiqueta];
    const ramaBox = document.querySelector(`.rama-box[data-etiqueta="${etiqueta}"]`);
    if (!ramaBox) return;
    
    // Obtener elementos
    const ramaHeader = ramaBox.querySelector('.rama-header');
    const ramaDetail = ramaBox.querySelector('.rama-detail');
    
    // Guardar el contenido original para poder restaurarlo si se cancela
    ramaBox.setAttribute('data-original-header', ramaHeader.innerHTML);
    ramaBox.setAttribute('data-original-detail', ramaDetail.innerHTML);
    
    // Reemplazar el encabezado con un campo de entrada para el nombre
    ramaHeader.innerHTML = `
      <input type="text" class="edit-etiqueta-nombre" value="${etiqueta}" placeholder="Nombre del agente">
      <div>
        <button class="save-button" onclick="guardarEdicionEtiqueta('${etiqueta}')">Guardar</button>
        <button class="cancel-button" onclick="cancelarEdicionEtiqueta('${etiqueta}')">Cancelar</button>
      </div>
    `;
    
    // Reemplazar el detalle con un área de texto para la descripción
    ramaDetail.innerHTML = `
      <textarea class="edit-etiqueta-descripcion" placeholder="Descripción del agente">${descripcion}</textarea>
    `;
  }
  
  // Función para cancelar la edición de una etiqueta
  async function guardarEdicionEtiqueta(etiquetaOriginal) {
    // Mostrar loader
    mostrarLoader();
    
    // Obtener las etiquetas personalizadas del usuario
    let etiquetasPersonalizadas = {};
    try {
      const userEtiquetasElement = document.getElementById('userEtiquetasPersonalizadas');
      if (userEtiquetasElement) {
        etiquetasPersonalizadas = JSON.parse(userEtiquetasElement.textContent || '{}');
      }
    } catch (error) {
      console.error('Error al obtener etiquetas personalizadas:', error);
      ocultarLoader();
      return;
    }
    
    const ramaBox = document.querySelector(`.rama-box[data-etiqueta="${etiquetaOriginal}"]`);
    if (!ramaBox) {
      ocultarLoader();
      return;
    }
    
    const nuevoNombre = ramaBox.querySelector('.edit-etiqueta-nombre').value.trim();
    const nuevaDescripcion = ramaBox.querySelector('.edit-etiqueta-descripcion').value.trim();
    
    if (!nuevoNombre || !nuevaDescripcion) {
      ocultarLoader();
      alert_personalizada('Por favor, completa tanto el nombre como la descripción del agente.');
      return;
    }
    
    // Si el nombre ha cambiado y ya existe una etiqueta con ese nombre
    if (nuevoNombre !== etiquetaOriginal && etiquetasPersonalizadas[nuevoNombre]) {
      ocultarLoader();
      if (!confirm('Ya existe un agente con ese nombre. ¿Deseas sobrescribirlo?')) {
        return;
      }
      mostrarLoader();
    }
    
    // Crear un objeto temporal para mantener el orden
    const etiquetasOrdenadas = {};
    
    // Recorrer las etiquetas actuales y construir el nuevo objeto
    Object.keys(etiquetasPersonalizadas).forEach(key => {
      if (key === etiquetaOriginal) {
        // Reemplazar la etiqueta original con la nueva
        etiquetasOrdenadas[nuevoNombre] = nuevaDescripcion;
      } else if (key !== nuevoNombre) { // Evitar duplicados si el nombre nuevo ya existía
        etiquetasOrdenadas[key] = etiquetasPersonalizadas[key];
      }
    });
    
    // Actualizar el objeto de etiquetas
    etiquetasPersonalizadas = etiquetasOrdenadas;
    
    try {
      // Guardar en el backend
      await saveUserDataToBackend({
        etiquetas_personalizadas: etiquetasPersonalizadas
      });
      
      // Actualizar el elemento en el DOM
      const userEtiquetasElement = document.getElementById('userEtiquetasPersonalizadas');
      if (userEtiquetasElement) {
        userEtiquetasElement.textContent = JSON.stringify(etiquetasPersonalizadas);
      }
      
      // Actualizar la interfaz
      createAgentsSection();
      
      // Notificar al usuario
      alert_personalizada('Agente actualizado correctamente.');
    } catch (error) {
      console.error('Error al guardar la edición del agente:', error);
    } finally {
      ocultarLoader();
    }
  }
  
  async function eliminarEtiquetaPersonalizada(etiqueta) {
    confirm_personalizada(`¿Estás seguro de que deseas eliminar el agente "${etiqueta}"?`, async () => {
      // Mostrar loader
      mostrarLoader();
      
      // Obtener las etiquetas personalizadas del usuario
      let etiquetasPersonalizadas = {};
      try {
        const userEtiquetasElement = document.getElementById('userEtiquetasPersonalizadas');
        if (userEtiquetasElement) {
          etiquetasPersonalizadas = JSON.parse(userEtiquetasElement.textContent || '{}');
        }
      } catch (error) {
        console.error('Error al obtener etiquetas personalizadas:', error);
        ocultarLoader();
        return;
      }
      
      // Eliminar la etiqueta
      if (etiquetasPersonalizadas[etiqueta]) {
        delete etiquetasPersonalizadas[etiqueta];
        
        try {
          // Guardar en el backend
          await saveUserDataToBackend({
            etiquetas_personalizadas: etiquetasPersonalizadas
          });
          
          // Actualizar el elemento en el DOM
          const userEtiquetasElement = document.getElementById('userEtiquetasPersonalizadas');
          if (userEtiquetasElement) {
            userEtiquetasElement.textContent = JSON.stringify(etiquetasPersonalizadas);
          }
          
          // Actualizar la interfaz
          createAgentsSection();
          
          // Notificar al usuario
          alert_personalizada('Agente eliminado correctamente.');
        } catch (error) {
          console.error('Error al eliminar el agente:', error);
        } finally {
          ocultarLoader();
        }
      } else {
        ocultarLoader();
      }
    });
  }
  
  async function agregarEtiquetaPersonalizada() {
    // Comprobar si se ha alcanzado el límite de agentes
    if (!checkAgentesLimit()) {
      return; // No permitir añadir más agentes
    }
    
    const nombreInput = document.getElementById('nombre-etiqueta');
    const descripcionInput = document.getElementById('descripcion-etiqueta');
    
    const nombre = nombreInput.value.trim();
    const descripcion = descripcionInput.value.trim();
    
    if (!nombre || !descripcion) {
      alert_personalizada('Por favor, completa tanto el nombre como la descripción del agente.');
      return;
    }
    
    // Mostrar loader
    mostrarLoader();
    
    // Obtener las etiquetas personalizadas del usuario
    let etiquetasPersonalizadas = {};
    try {
      const userEtiquetasElement = document.getElementById('userEtiquetasPersonalizadas');
      if (userEtiquetasElement) {
        etiquetasPersonalizadas = JSON.parse(userEtiquetasElement.textContent || '{}');
      }
    } catch (error) {
      console.error('Error al obtener etiquetas personalizadas:', error);
      etiquetasPersonalizadas = {};
    }
    
    // Verificar si ya existe una etiqueta con ese nombre
    if (etiquetasPersonalizadas[nombre]) {
      ocultarLoader();
      if (!confirm('Ya existe un agente con ese nombre. ¿Deseas sobrescribirlo?')) {
        return;
      }
      mostrarLoader();
    }
    
    // Añadir la nueva etiqueta
    etiquetasPersonalizadas[nombre] = descripcion;
    
    try {
      // Guardar en el backend
      await saveUserDataToBackend({
        etiquetas_personalizadas: etiquetasPersonalizadas
      });
      
      // Actualizar el elemento en el DOM
      const userEtiquetasElement = document.getElementById('userEtiquetasPersonalizadas');
      if (userEtiquetasElement) {
        userEtiquetasElement.textContent = JSON.stringify(etiquetasPersonalizadas);
      }
      
      // Limpiar los campos del formulario
      nombreInput.value = '';
      descripcionInput.value = '';
      
      // Ocultar el formulario después de añadir
      const addAgentForm = document.getElementById('add-agent-form');
      const dropdownIcon = document.querySelector('.dropdown-icon');
      if (addAgentForm) {
        addAgentForm.style.display = 'none';
        dropdownIcon.classList.remove('open');
      }
      
      // Actualizar la interfaz
      createAgentsSection();
      
      // Notificar al usuario
      alert_personalizada('Agente añadido correctamente.');
    } catch (error) {
      console.error('Error al añadir el agente:', error);
    } finally {
      ocultarLoader();
    }
  }
// 3. Implementación de la sección de Fuentes
/*
function createSourcesSection() {
  // Obtener la sección de fuentes
  const sourcesSection = document.getElementById('sources');
  if (!sourcesSection) return;
  
  // Obtener la cobertura legal del usuario
  let coberturaLegal = {};
  try {
    const userCoberturaElement = document.getElementById('userCoberturaLegal');
    if (userCoberturaElement) {
      coberturaLegal = JSON.parse(userCoberturaElement.textContent || '{}');
    }
  } catch (error) {
    console.error('Error al obtener cobertura legal:', error);
    coberturaLegal = {};
  }
  
  // Asegurar que coberturaLegal tiene la estructura correcta
  // Usamos notación de corchetes para acceder a propiedades con guiones
  if (!coberturaLegal['fuentes-gobierno']) coberturaLegal['fuentes-gobierno'] = [];
  if (!coberturaLegal['fuentes-reguladores']) coberturaLegal['fuentes-reguladores'] = [];
  
  // Crear el contenido de la sección
  let sourcesContent = `
    <h2>Fuentes</h2>
    <p>Configura las fuentes oficiales y reguladores que deseas monitorizar.</p>
    
    <div class="sources-container">
      <!-- Fuentes Oficiales -->
      <div class="sources-section">
        <h3>Fuentes Oficiales</h3>
        <div class="sources-list" id="fuentes-oficiales-container">
  `;
  
  // Verificar si hay fuentes oficiales
  if (coberturaLegal['fuentes-gobierno'].length === 0) {
    sourcesContent += `
      <p class="no-sources-message">No tienes fuentes oficiales configuradas.</p>
    `;
  } else {
    // Mostrar las fuentes oficiales
    coberturaLegal['fuentes-gobierno'].forEach(fuente => {
      sourcesContent += `
        <div class="source-tag">
          <span>${fuente.toUpperCase()}</span>
          <span class="tag-remove" onclick="eliminarFuente('${fuente}', 'fuentes-gobierno')">×</span>
        </div>
      `;
    });
  }
  
  // Añadir selector para agregar nuevas fuentes oficiales
  sourcesContent += `
        </div>
        <div class="add-source">
          <button class="add-source-button" onclick="toggleSourceDropdown('fuentes-dropdown')">
            <i class="fas fa-plus-circle"></i> Añadir fuente oficial
            <i class="fas fa-chevron-down dropdown-icon"></i>
          </button>
          <div id="fuentes-dropdown" class="source-dropdown" style="display: none;">
            <div class="source-dropdown-content">
  `;
  
  // Lista de fuentes oficiales disponibles
  const fuentesDisponibles = [
    { value: "boe", label: "Boletín Oficial del Estado (BOE)" },
    { value: "doue", label: "Diario Oficial de la Unión Europea (DOUE)" },
    { value: "bocg", label: "Boletín Oficial de las Cortes Generales (BOCG)" },
    { value: "boa", label: "Boletín Oficial de Aragón (BOA)" },
    { value: "bocyl", label: "Boletín Oficial de Castilla y León (BOCyL)" },
    { value: "bocm", label: "Boletín Oficial de la Comunidad de Madrid (BOCM)" },
    { value: "dogc", label: "Diario Oficial de la Generalitat Catalana (DOGC)" },
    { value: "dog", label: "Diario Oficial de Galicia (DOG)" },
    { value: "boja", label: "Boletín Oficial de la Junta de Andalucía (BOJA)" },
    { value: "bopv", label: "Boletín Oficial del País Vasco (BOPV)" }
  ];
  
  // Filtrar las fuentes que no están ya seleccionadas
  const fuentesNoSeleccionadas = fuentesDisponibles.filter(fuente => 
    !coberturaLegal['fuentes-gobierno'].includes(fuente.value)
  );
  
  // Mostrar las fuentes disponibles
  fuentesNoSeleccionadas.forEach(fuente => {
    sourcesContent += `
      <div class="source-option" onclick="agregarFuente('${fuente.value}', 'fuentes-gobierno')">
        ${fuente.label}
      </div>
    `;
  });
  
  // Reguladores
  sourcesContent += `
            </div>
          </div>
        </div>
      </div>
      
      <!-- Reguladores -->
      <div class="sources-section">
        <h3>Reguladores</h3>
        <div class="sources-list" id="reguladores-container">
  `;
  
  // Verificar si hay reguladores
  if (coberturaLegal['fuentes-reguladores'].length === 0) {
    sourcesContent += `
      <p class="no-sources-message">No tienes reguladores configurados.</p>
    `;
  } else {
    // Mostrar los reguladores
    coberturaLegal['fuentes-reguladores'].forEach(regulador => {
      sourcesContent += `
        <div class="source-tag">
          <span>${regulador.toUpperCase()}</span>
          <span class="tag-remove" onclick="eliminarFuente('${regulador}', 'fuentes-reguladores')">×</span>
        </div>
      `;
    });
  }
  
  // Añadir selector para agregar nuevos reguladores
  sourcesContent += `
        </div>
        <div class="add-source">
          <button class="add-source-button" onclick="toggleSourceDropdown('reguladores-dropdown')">
            <i class="fas fa-plus-circle"></i> Añadir regulador
            <i class="fas fa-chevron-down dropdown-icon"></i>
          </button>
          <div id="reguladores-dropdown" class="source-dropdown" style="display: none;">
            <div class="source-dropdown-content">
  `;
  
  // Lista de reguladores disponibles
  const reguladoresDisponibles = [
    { value: "aepd", label: "Agencia Española de Protección de Datos (AEPD)" },
    { value: "cnmv", label: "Comisión Nacional del Mercado de Valores (CNMV)" },
    { value: "cnmc", label: "Comisión Nacional de los Mercados y la Competencia (CNMC)" }
  ];
  
  // Filtrar los reguladores que no están ya seleccionados
  const reguladoresNoSeleccionados = reguladoresDisponibles.filter(regulador => 
    !coberturaLegal['fuentes-reguladores'].includes(regulador.value)
  );
  
  // Mostrar los reguladores disponibles
  reguladoresNoSeleccionados.forEach(regulador => {
    sourcesContent += `
      <div class="source-option" onclick="agregarFuente('${regulador.value}', 'fuentes-reguladores')">
        ${regulador.label}
      </div>
    `;
  });
  
  // Cerrar la sección
  sourcesContent += `
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Actualizar el contenido de la sección
  sourcesSection.innerHTML = sourcesContent;
  
  // Añadir estilos CSS para la sección de fuentes si no existen
  if (!document.getElementById('sources-section-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'sources-section-styles';
    styleElement.textContent = `
      .sources-container {
        margin-top: 20px;
      }
      
      .sources-section {
        margin-bottom: 30px;
      }
      
      .sources-section h3 {
        font-size: 18px;
        margin-bottom: 15px;
        color: #0b2431;
      }
      
      .sources-list {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 15px;
      }
      
      .source-tag {
        display: flex;
        align-items: center;
        background-color: #f8f8f8;
        border: 1px solid #e0e0e0;
        border-radius: 20px;
        padding: 5px 15px;
        font-size: 14px;
      }
      
      .source-tag span {
        font-weight: 500;
      }
      
      .no-sources-message {
        color: #666;
        font-style: italic;
      }
      
      .add-source {
        margin-top: 10px;
      }
      
      .add-source-button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 10px 15px;
        background-color: #f8f8f8;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 500;
        color: #0b2431;
        transition: background-color 0.3s ease;
      }
      
      .add-source-button:hover {
        background-color: #eaeaea;
      }
      
      .add-source-button i {
        margin-right: 5px;
        color: #04db8d;
      }
      
      .dropdown-icon {
        margin-left: auto;
        margin-right: 0;
        transition: transform 0.3s ease;
      }
      
      .dropdown-icon.open {
        transform: rotate(180deg);
      }
      
      .source-dropdown {
        margin-top: 10px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        background-color: white;
        max-height: 200px;
        overflow-y: auto;
      }
      
      .source-dropdown-content {
        padding: 10px;
      }
      
      .source-option {
        padding: 8px 10px;
        cursor: pointer;
        border-radius: 4px;
        transition: background-color 0.3s ease;
      }
      
      .source-option:hover {
        background-color: #f0f0f0;
      }
    `;
    document.head.appendChild(styleElement);
  }
}
  */

function createSourcesSection() {
  // Obtener la sección de fuentes
  const sourcesSection = document.getElementById('sources');
  if (!sourcesSection) return;
  
  // Obtener el plan actual del usuario
  const currentPlan = window.userData?.subscription_plan || 'plan1';
  
  // Obtener los extras del usuario
  const extraFuentes = parseInt(window.userData?.extra_fuentes || 0);
  const extraAgentes = parseInt(window.userData?.extra_agentes || 0);
  
  // Obtener los límites del plan considerando extras
  const planLimits = getPlanLimits(currentPlan, extraAgentes, extraFuentes);
  
  // Obtener la cobertura legal del usuario
  let coberturaLegal = {};
  try {
    const userCoberturaElement = document.getElementById('userCoberturaLegal');
    if (userCoberturaElement) {
      coberturaLegal = JSON.parse(userCoberturaElement.textContent || '{}');
    }
  } catch (error) {
    console.error('Error al obtener cobertura legal:', error);
    coberturaLegal = {};
  }
  
  // Asegurar que coberturaLegal tiene la estructura correcta
  if (!coberturaLegal['fuentes-gobierno']) coberturaLegal['fuentes-gobierno'] = [];
  if (!coberturaLegal['fuentes-reguladores']) coberturaLegal['fuentes-reguladores'] = [];
  
  // Calcular el total de fuentes
  const totalFuentes = coberturaLegal['fuentes-gobierno'].length + coberturaLegal['fuentes-reguladores'].length;
  const maxFuentes = planLimits.fuentes === Infinity ? '∞' : planLimits.fuentes;
  
  // Crear el contenido de la sección
  let sourcesContent = `
    <h2>Fuentes</h2>
    <p>Configura las fuentes oficiales y reguladores que deseas monitorizar.</p>
  `;
  
  // Mostrar información sobre extras si hay extras de fuentes
  let extrasInfo = '';
  if (extraFuentes > 0) {
    extrasInfo = `<span class="extras-info">(Incluye ${extraFuentes} fuentes adicionales)</span>`;
  }
  
  sourcesContent += `
    <div class="fuentes-contador">
      <span class="contador-fuentes">${totalFuentes}/${maxFuentes}</span> fuentes seleccionadas ${extrasInfo}
    </div>
    
    <div class="sources-container">
      <!-- Fuentes Oficiales -->
      <div class="sources-section">
        <h3>Fuentes Oficiales</h3>
        <div class="sources-list" id="fuentes-oficiales-container">
  `;
  
  // Verificar si hay fuentes oficiales
  if (coberturaLegal['fuentes-gobierno'].length === 0) {
    sourcesContent += `
      <p class="no-sources-message">No tienes fuentes oficiales configuradas.</p>
    `;
  } else {
    // Mostrar las fuentes oficiales
    coberturaLegal['fuentes-gobierno'].forEach(fuente => {
      sourcesContent += `
        <div class="source-tag">
          <span>${fuente.toUpperCase()}</span>
          <span class="tag-remove" onclick="eliminarFuente('${fuente}', 'fuentes-gobierno')">×</span>
        </div>
      `;
    });
  }
  
  // Añadir selector para agregar nuevas fuentes oficiales
  sourcesContent += `
        </div>
        <div class="add-source">
          <button class="add-source-button" onclick="toggleSourceDropdown('fuentes-dropdown')">
            <i class="fas fa-plus-circle"></i> Añadir fuente oficial
            <i class="fas fa-chevron-down dropdown-icon"></i>
          </button>
          <div id="fuentes-dropdown" class="source-dropdown" style="display: none;">
            <div class="source-dropdown-content">
  `;
  
  // Lista de fuentes oficiales disponibles
  const fuentesDisponibles = [
    { value: "boe", label: "Boletín Oficial del Estado (BOE)" },
    { value: "doue", label: "Diario Oficial de la Unión Europea (DOUE)" },
    { value: "bocg", label: "Boletín Oficial de las Cortes Generales (BOCG)" },
    { value: "boa", label: "Boletín Oficial de Aragón (BOA)" },
    { value: "bocyl", label: "Boletín Oficial de Castilla y León (BOCyL)" },
    { value: "bocm", label: "Boletín Oficial de la Comunidad de Madrid (BOCM)" },
    { value: "dogc", label: "Diario Oficial de la Generalitat Catalana (DOGC)" },
    { value: "dog", label: "Diario Oficial de Galicia (DOG)" },
    { value: "boja", label: "Boletín Oficial de la Junta de Andalucía (BOJA)" },
    { value: "bopv", label: "Boletín Oficial del País Vasco (BOPV)" }
  ];
  
  // Filtrar las fuentes que no están ya seleccionadas
  const fuentesNoSeleccionadas = fuentesDisponibles.filter(fuente => 
    !coberturaLegal['fuentes-gobierno'].includes(fuente.value)
  );
  
  // Mostrar las fuentes disponibles
  fuentesNoSeleccionadas.forEach(fuente => {
    sourcesContent += `
      <div class="source-option" onclick="agregarFuente('${fuente.value}', 'fuentes-gobierno')">
        ${fuente.label}
      </div>
    `;
  });
  
  // Reguladores
  sourcesContent += `
            </div>
          </div>
        </div>
      </div>
      
      <!-- Reguladores -->
      <div class="sources-section">
        <h3>Reguladores</h3>
        <div class="sources-list" id="reguladores-container">
  `;
  
  // Verificar si hay reguladores
  if (coberturaLegal['fuentes-reguladores'].length === 0) {
    sourcesContent += `
      <p class="no-sources-message">No tienes reguladores configurados.</p>
    `;
  } else {
    // Mostrar los reguladores
    coberturaLegal['fuentes-reguladores'].forEach(regulador => {
      sourcesContent += `
        <div class="source-tag">
          <span>${regulador.toUpperCase()}</span>
          <span class="tag-remove" onclick="eliminarFuente('${regulador}', 'fuentes-reguladores')">×</span>
        </div>
      `;
    });
  }
  
  // Añadir selector para agregar nuevos reguladores
  sourcesContent += `
        </div>
        <div class="add-source">
          <button class="add-source-button" onclick="toggleSourceDropdown('reguladores-dropdown')">
            <i class="fas fa-plus-circle"></i> Añadir regulador
            <i class="fas fa-chevron-down dropdown-icon"></i>
          </button>
          <div id="reguladores-dropdown" class="source-dropdown" style="display: none;">
            <div class="source-dropdown-content">
  `;
  
  // Lista de reguladores disponibles
  const reguladoresDisponibles = [
    { value: "cnmv", label: "Comisión Nacional del Mercado de Valores (CNMV)" },
    { value: "aepd", label: "Agencia Española de Protección de Datos (AEPD)" }
  ];
  
  // Filtrar los reguladores que no están ya seleccionados
  const reguladoresNoSeleccionados = reguladoresDisponibles.filter(regulador => 
    !coberturaLegal['fuentes-reguladores'].includes(regulador.value)
  );
  
  // Mostrar los reguladores disponibles
  reguladoresNoSeleccionados.forEach(regulador => {
    sourcesContent += `
      <div class="source-option" onclick="agregarFuente('${regulador.value}', 'fuentes-reguladores')">
        ${regulador.label}
      </div>
    `;
  });
  
  // Cerrar la sección
  sourcesContent += `
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Actualizar el contenido de la sección
  sourcesSection.innerHTML = sourcesContent;
  
  // Añadir estilos CSS para el contador de fuentes
  if (!document.getElementById('fuentes-contador-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'fuentes-contador-styles';
    styleElement.textContent = `
   .sources-container {
        margin-top: 20px;
      }
      
      .sources-section {
        margin-bottom: 30px;
      }
      
      .sources-section h3 {
        font-size: 18px;
        margin-bottom: 15px;
        color: #0b2431;
      }
      
      .sources-list {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 15px;
      }
      .fuentes-contador {
       margin-bottom: 15px;
      font-size: 17px;
      color: #0b2431;
      font-weight: 500;
      font-style: italic;
      }
      
      .contador-fuentes {
        font-weight: bold;
        color: #04db8d;
      }
      .source-tag {
        display: flex;
        align-items: center;
        background-color: #f8f8f8;
        border: 1px solid #e0e0e0;
        border-radius: 20px;
        padding: 5px 15px;
        font-size: 14px;
      }
      
      .source-tag span {
        font-weight: 500;
      }
      
      .no-sources-message {
        color: #666;
        font-style: italic;
      }
      
      .add-source {
        margin-top: 10px;
      }
      
      .add-source-button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 10px 15px;
        background-color: #f8f8f8;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 500;
        color: #0b2431;
        transition: background-color 0.3s ease;
      }
      
      .add-source-button:hover {
        background-color: #eaeaea;
      }
      
      .add-source-button i {
        margin-right: 5px;
        color: #04db8d;
      }
      
      .dropdown-icon {
        margin-left: auto;
        margin-right: 0;
        transition: transform 0.3s ease;
      }
      
      .dropdown-icon.open {
        transform: rotate(180deg);
      }
      
      .source-dropdown {
        margin-top: 10px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        background-color: white;
        max-height: 200px;
        overflow-y: auto;
      }
      
      .source-dropdown-content {
        padding: 10px;
      }
      
      .source-option {
        padding: 8px 10px;
        cursor: pointer;
        border-radius: 4px;
        transition: background-color 0.3s ease;
      }
      
      .source-option:hover {
        background-color: #f0f0f0;
      }
    `;
    document.head.appendChild(styleElement);
  }
}

// Funciones para gestionar fuentes
function toggleSourceDropdown(dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  const button = dropdown.previousElementSibling;
  const dropdownIcon = button.querySelector('.dropdown-icon');
  
  if (dropdown.style.display === 'none') {
    dropdown.style.display = 'block';
    dropdownIcon.classList.add('open');
  } else {
    dropdown.style.display = 'none';
    dropdownIcon.classList.remove('open');
  }
}

async function agregarFuente(fuente, tipo) {
  // Comprobar si se ha alcanzado el límite de fuentes
  if (!checkFuentesLimit(tipo)) {
    return; // No permitir añadir más fuentes
  }
  
  // Mostrar loader
  mostrarLoader();
  
  // Obtener la cobertura legal del usuario
  let coberturaLegal = {};
  try {
    const userCoberturaElement = document.getElementById('userCoberturaLegal');
    if (userCoberturaElement) {
      coberturaLegal = JSON.parse(userCoberturaElement.textContent || '{}');
    }
  } catch (error) {
    console.error('Error al obtener cobertura legal:', error);
    coberturaLegal = {};
  }
  
  // Asegurar que coberturaLegal tiene la estructura correcta
  if (!coberturaLegal[tipo]) coberturaLegal[tipo] = [];
  
  // Verificar si la fuente ya está en la lista
  if (coberturaLegal[tipo].includes(fuente)) {
    ocultarLoader();
    alert_personalizada(`Esta fuente ya está en tu lista de ${tipo === 'fuentes-gobierno' ? 'fuentes oficiales' : 'reguladores'}.`);
    return;
  }
  
  // Añadir la fuente
  coberturaLegal[tipo].push(fuente);
  
  try {
    // Guardar en el backend
    await saveUserDataToBackend({
      cobertura_legal: coberturaLegal
    });
    
    // Actualizar el elemento en el DOM
    const userCoberturaElement = document.getElementById('userCoberturaLegal');
    if (userCoberturaElement) {
      userCoberturaElement.textContent = JSON.stringify(coberturaLegal);
    }
    
    // Ocultar el dropdown
    const dropdownId = tipo === 'fuentes-gobierno' ? 'fuentes-dropdown' : 'reguladores-dropdown';
    const dropdown = document.getElementById(dropdownId);
    const dropdownIcon = dropdown.previousElementSibling.querySelector('.dropdown-icon');
    dropdown.style.display = 'none';
    dropdownIcon.classList.remove('open');
    
    // Actualizar la interfaz
    createSourcesSection();
    
    // Notificar al usuario
    alert_personalizada(`${tipo === 'fuentes-gobierno' ? 'Fuente oficial' : 'Regulador'} añadido correctamente.`);
  } catch (error) {
    console.error(`Error al añadir ${tipo}:`, error);
    alert_personalizada(`Ha ocurrido un error al añadir ${tipo === 'fuentes-gobierno' ? 'la fuente oficial' : 'el regulador'}.`);
  } finally {
    ocultarLoader();
  }
}

async function eliminarFuente(fuente, tipo) {
  const tipoTexto = tipo === 'fuentes-gobierno' ? 'fuentes oficiales' : 'reguladores';
  
  confirm_personalizada(`¿Estás seguro de que deseas eliminar esta fuente de tu lista de ${tipoTexto}?`, async () => {
    // Mostrar loader
    mostrarLoader();
    
    // Obtener la cobertura legal del usuario
    let coberturaLegal = {};
    try {
      const userCoberturaElement = document.getElementById('userCoberturaLegal');
      if (userCoberturaElement) {
        coberturaLegal = JSON.parse(userCoberturaElement.textContent || '{}');
      }
    } catch (error) {
      console.error('Error al obtener cobertura legal:', error);
      ocultarLoader();
      return;
    }
    
    // Asegurar que coberturaLegal tiene la estructura correcta
    if (!coberturaLegal[tipo]) coberturaLegal[tipo] = [];
    
    // Eliminar la fuente
    coberturaLegal[tipo] = coberturaLegal[tipo].filter(item => item !== fuente);
    
    try {
      // Guardar en el backend
      await saveUserDataToBackend({
        cobertura_legal: coberturaLegal
      });
      
      // Actualizar el elemento en el DOM
      const userCoberturaElement = document.getElementById('userCoberturaLegal');
      if (userCoberturaElement) {
        userCoberturaElement.textContent = JSON.stringify(coberturaLegal);
      }
      
      // Actualizar la interfaz
      createSourcesSection();
      
      // Notificar al usuario
      alert_personalizada(`${tipo === 'fuentes-gobierno' ? 'Fuente oficial' : 'Regulador'} eliminado correctamente.`);
    } catch (error) {
      console.error(`Error al eliminar ${tipo}:`, error);
      alert_personalizada(`Ha ocurrido un error al eliminar ${tipo === 'fuentes-gobierno' ? 'la fuente oficial' : 'el regulador'}.`);
    } finally {
      ocultarLoader();
    }
  });
}

// 4. Implementación de la sección de Rangos
function createRangeSection() {
  // Obtener la sección de rangos
  const rangeSection = document.getElementById('range');
  if (!rangeSection) return;
  
  // Obtener los rangos del usuario
  let rangosUsuario = [];
  try {
    const userRangosElement = document.getElementById('userRangos');
    if (userRangosElement) {
      rangosUsuario = JSON.parse(userRangosElement.textContent || '[]');
    }
  } catch (error) {
    console.error('Error al obtener rangos del usuario:', error);
    rangosUsuario = [];
  }
  
  // Crear el contenido de la sección
  let rangeContent = `
    <h2>Rango</h2>
    <p>Configura los rangos normativos que deseas monitorizar.</p>
    
    <div class="range-container">
      <div class="ranges-list" id="rangos-container">
  `;
  
  // Verificar si hay rangos
  if (rangosUsuario.length === 0) {
    rangeContent += `
      <p class="no-ranges-message">No tienes rangos normativos configurados.</p>
    `;
  } else {
    // Mostrar los rangos
    rangosUsuario.forEach(rango => {
      rangeContent += `
        <div class="range-tag">
          <span>${rango}</span>
          <span class="tag-remove" onclick="eliminarRango('${rango}')">×</span>
        </div>
      `;
    });
  }
  
  // Añadir selector para agregar nuevos rangos
  rangeContent += `
      </div>
      <div class="add-range">
        <button class="add-range-button" onclick="toggleRangeDropdown()">
          <i class="fas fa-plus-circle"></i> Añadir rango normativo
          <i class="fas fa-chevron-down dropdown-icon"></i>
        </button>
        <div id="rangos-dropdown" class="range-dropdown" style="display: none;">
          <div class="range-dropdown-content">
  `;
  
  // Lista de rangos normativos disponibles
  const rangosDisponibles = [
    "Acuerdos Internacionales",
    "Normativa Europea",
    "Legislacion Nacional",
    "Normativa Reglamentaria",
    "Decisiones Judiciales",
    "Doctrina Administrativa",
    "Comunicados, Guias y Opiniones Consultivas",
    "Consultas Publicas",
    "Normativa en tramitación",
    "Otras"
  ];
  
  // Filtrar los rangos que no están ya seleccionados
  const rangosNoSeleccionados = rangosDisponibles.filter(rango => 
    !rangosUsuario.includes(rango)
  );
  
  // Mostrar los rangos disponibles
  rangosNoSeleccionados.forEach(rango => {
    rangeContent += `
      <div class="range-option" onclick="agregarRango('${rango}')">
        ${rango}
      </div>
    `;
  });
  
  // Cerrar la sección
  rangeContent += `
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Actualizar el contenido de la sección
  rangeSection.innerHTML = rangeContent;
  
  // Añadir estilos CSS para la sección de rangos
  if (!document.getElementById('range-section-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'range-section-styles';
    styleElement.textContent = `
      .range-container {
        margin-top: 20px;
      }
      
      .ranges-list {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 20px;
      }
      
      .range-tag {
        display: flex;
        align-items: center;
        background-color: #f8f8f8;
        border: 1px solid #e0e0e0;
        border-radius: 20px;
        padding: 5px 15px;
        font-size: 14px;
      }
      
      .range-tag span {
        font-weight: 500;
      }
      
      .no-ranges-message {
        color: #666;
        font-style: italic;
      }
      
      .add-range {
        margin-top: 10px;
      }
      
      .add-range-button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 10px 15px;
        background-color: #f8f8f8;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 500;
        color: #0b2431;
        transition: background-color 0.3s ease;
      }
      
      .add-range-button:hover {
        background-color: #eaeaea;
      }
      
      .add-range-button i {
        margin-right: 5px;
        color: #04db8d;
      }
      
      .range-dropdown {
        margin-top: 10px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        background-color: white;
        max-height: 200px;
        overflow-y: auto;
      }
      
      .range-dropdown-content {
        padding: 10px;
      }
      
      .range-option {
        padding: 8px 10px;
        cursor: pointer;
        border-radius: 4px;
        transition: background-color 0.3s ease;
      }
      
      .range-option:hover {
        background-color: #f0f0f0;
      }
    `;
    document.head.appendChild(styleElement);
  }
}

// Funciones para gestionar rangos
function toggleRangeDropdown() {
  const dropdown = document.getElementById('rangos-dropdown');
  const button = dropdown.previousElementSibling;
  const dropdownIcon = button.querySelector('.dropdown-icon');
  
  if (dropdown.style.display === 'none') {
    dropdown.style.display = 'block';
    dropdownIcon.classList.add('open');
  } else {
    dropdown.style.display = 'none';
    dropdownIcon.classList.remove('open');
  }
}

async function agregarRango(rango) {
  // Mostrar loader
  mostrarLoader();
  
  // Obtener los rangos del usuario
  let rangosUsuario = [];
  try {
    const userRangosElement = document.getElementById('userRangos');
    if (userRangosElement) {
      rangosUsuario = JSON.parse(userRangosElement.textContent || '[]');
    }
  } catch (error) {
    console.error('Error al obtener rangos del usuario:', error);
    rangosUsuario = [];
  }
  
  // Verificar si el rango ya está en la lista
  if (rangosUsuario.includes(rango)) {
    ocultarLoader();
    alert_personalizada('Este rango normativo ya está en tu lista.');
    return;
  }
  
  // Añadir el rango
  rangosUsuario.push(rango);
  
  try {
    // Guardar en el backend
    await saveUserDataToBackend({
      rangos: rangosUsuario
    });
    
    // Actualizar el elemento en el DOM
    const userRangosElement = document.getElementById('userRangos');
    if (userRangosElement) {
      userRangosElement.textContent = JSON.stringify(rangosUsuario);
    }
    
    // Ocultar el dropdown
    const dropdown = document.getElementById('rangos-dropdown');
    const dropdownIcon = dropdown.previousElementSibling.querySelector('.dropdown-icon');
    dropdown.style.display = 'none';
    dropdownIcon.classList.remove('open');
    
    // Actualizar la interfaz
    createRangeSection();
    
    // Notificar al usuario
    alert_personalizada('Rango normativo añadido correctamente.');
  } catch (error) {
    console.error('Error al añadir rango:', error);
  } finally {
    ocultarLoader();
  }
}

async function eliminarRango(rango) {
  confirm_personalizada('¿Estás seguro de que deseas eliminar este rango normativo?', async () => {
    // Mostrar loader
    mostrarLoader();
    
    // Obtener los rangos del usuario
    let rangosUsuario = [];
    try {
      const userRangosElement = document.getElementById('userRangos');
      if (userRangosElement) {
        rangosUsuario = JSON.parse(userRangosElement.textContent || '[]');
      }
    } catch (error) {
      console.error('Error al obtener rangos del usuario:', error);
      ocultarLoader();
      return;
    }
    
    // Eliminar el rango
    rangosUsuario = rangosUsuario.filter(item => item !== rango);
    
    try {
      // Guardar en el backend
      await saveUserDataToBackend({
        rangos: rangosUsuario
      });
      
      // Actualizar el elemento en el DOM
      const userRangosElement = document.getElementById('userRangos');
      if (userRangosElement) {
        userRangosElement.textContent = JSON.stringify(rangosUsuario);
      }
      
      // Actualizar la interfaz
      createRangeSection();
      
      // Notificar al usuario
      alert_personalizada('Rango normativo eliminado correctamente.');
    } catch (error) {
      console.error('Error al eliminar rango:', error);
    } finally {
      ocultarLoader();
    }
  });
}

// 5. Implementación de la sección de Análisis
function createAnalysisSection() {
  // Obtener la sección de análisis
  const analysisSection = document.getElementById('analysis');
  if (!analysisSection) return;
  
  // Obtener el límite de análisis de impacto del usuario
  let impactAnalysisLimit = 0;
  try {
    const userAnalysisElement = document.getElementById('userImpactAnalysisLimit');
    if (userAnalysisElement) {
      impactAnalysisLimit = parseInt(userAnalysisElement.textContent || '0');
    }
  } catch (error) {
    console.error('Error al obtener límite de análisis de impacto:', error);
    impactAnalysisLimit = 0;
  }
  
  // Crear el contenido de la sección
  let analysisContent = `
    <h2>Análisis</h2>
    <p>Información sobre tu límite de análisis de impacto.</p>
    
    <div class="analysis-container">
      <div class="analysis-card">
        <div class="analysis-icon">
          <i class="fas fa-chart-line"></i>
        </div>
        <div class="analysis-info">
          <h3>Análisis de Impacto</h3>
          <p>Tu plan actual te permite realizar hasta <span class="analysis-limit">${impactAnalysisLimit}</span> análisis de impacto por mes.</p>
          <p class="analysis-note">Para aumentar este límite, considera actualizar tu plan de suscripción.</p>
        </div>
      </div>
    </div>
  `;
  
  // Actualizar el contenido de la sección
  analysisSection.innerHTML = analysisContent;
  
  // Añadir estilos CSS para la sección de análisis
  if (!document.getElementById('analysis-section-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'analysis-section-styles';
    styleElement.textContent = `
      .analysis-container {
        margin-top: 20px;
      }
      
      .analysis-card {
        display: flex;
        align-items: center;
        background-color: #f8f8f8;
        border-radius: 10px;
        padding: 20px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      }
      
      .analysis-icon {
        width: 60px;
        height: 60px;
        background-color: #04db8d;
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        margin-right: 20px;
      }
      
      .analysis-icon i {
        color: white;
        font-size: 24px;
      }
      
      .analysis-info {
        flex: 1;
      }
      
      .analysis-info h3 {
        margin: 0 0 10px 0;
        font-size: 18px;
        color: #0b2431;
      }
      
      .analysis-info p {
        margin: 0 0 5px 0;
        color: #455862;
      }
      
      .analysis-limit {
        font-weight: 700;
        color: #04db8d;
        font-size: 18px;
      }
      
      .analysis-note {
        font-style: italic;
        font-size: 14px;
        margin-top: 10px !important;
      }
    `;
    document.head.appendChild(styleElement);
  }
}

// 7. Modificación de la función createSubscriptionModal para incluir elementos ocultos con datos del usuario

function createSubscriptionModal() {
  // Obtener el plan actual del usuario
  getCurrentUserPlan();
  
  // Crear el elemento del modal
  const modalHTML = `
    <div id="subscriptionModal" class="subscription-modal">
      <div class="modal-content">
        <!-- Botón para cerrar el modal -->
        <div class="close-button">
          <i class="fas fa-times"></i>
        </div>
        
        <!-- Elementos ocultos para almacenar datos del usuario -->
        <div style="display: none;">
          <div id="userEtiquetasPersonalizadas">${JSON.stringify(window.userData?.etiquetas_personalizadas || {})}</div>
          <div id="userCoberturaLegal">${JSON.stringify(window.userData?.cobertura_legal || { fuentes: [], reguladores: [] })}</div>
          <div id="userRangos">${JSON.stringify(window.userData?.rangos || [])}</div>
          <div id="userImpactAnalysisLimit">${window.userData?.impact_analysis_limit || 0}</div>
        </div>
        
        <!-- Contenedor principal del menú de suscripción -->
        <div class="subscription-container">
          <!-- Menú lateral (20% del ancho) -->
          <div class="sidebar-menu">
            <ul>
              <li class="active" data-section="plan-info">
                <i class="fas fa-star"></i>
                <span id="current-plan-name">Plan Actual</span>
              </li>
              <li data-section="agents">
                <i class="fas fa-robot"></i>
                <span>Gestión Agentes</span>
              </li>
              <li data-section="sources">
                <i class="fas fa-database"></i>
                <span>Fuentes</span>
              </li>
              <li data-section="range">
                <i class="fas fa-ruler-horizontal"></i>
                <span>Rango</span>
              </li>
              <li data-section="analysis">
                <i class="fas fa-chart-bar"></i>
                <span>Análisis</span>
              </li>
              <li data-section="logout">
                <i class="fas fa-sign-out-alt"></i>
                <span>Cerrar sesión</span>
              </li>
              <li data-section="cancel">
                <i class="fas fa-ban"></i>
                <span>Cancelar suscripción</span>
              </li>
            </ul>
          </div>
          
          <!-- Área de contenido (80% del ancho) -->
          <div class="content-area">
            <!-- Sección: Plan Actual -->
            <div id="plan-info" class="content-section active">
              <h2>Tu Plan Actual</h2>
              <div class="current-plan-details">
                <div class="plan-header">
                  <div class="plan-icon">
                    <i class="fas fa-crown"></i>
                  </div>
                  <div class="plan-title">
                    <h3 id="plan-title">Plan Starter</h3>
                    <p class="plan-description">Tu suscripción actual</p>
                  </div>
                </div>
                
                <div class="plan-features">
                  <ul>
                    <li><i class="fas fa-check"></i> Usuarios: 1 usuario</li>
                    <li><i class="fas fa-check"></i> Acceso a una fuente oficial</li>
                    <li><i class="fas fa-check"></i> Resúmenes y estadísticas</li>
                    <li><i class="fas fa-check"></i> Agentes Personalizados</li>
                  </ul>
                </div>
              </div>
              
              <div class="upgrade-section">
                <h3>Mejora tu plan</h3>
                <p>Descubre las ventajas de nuestros planes superiores</p>
                
                <div class="upgrade-plans">
                  <!-- Plan Starter (visible si el usuario tiene Plan Free) -->
                  <div class="upgrade-plan-card" id="plan-starter">
                    <div class="plan-header">
                      <h4>Plan Starter</h4>
                      <p class="price">66€<span>/mes</span></p>
                    </div>
                    <div class="plan-features">
                      <ul>
                        <li><i class="fas fa-check"></i> Usuarios: 1 usuario</li>
                        <li><i class="fas fa-check"></i> Acceso a 1 fuente oficial</li>
                        <li><i class="fas fa-check"></i> Resúmenes y estadísticas</li>
                        <li><i class="fas fa-check"></i> 5 Agentes Personalizados</li>
                        <li><i class="fas fa-check"></i> Alertas y notificaciones</li>
                        <li><i class="fas fa-check"></i> 50 Análisis de impacto/mes</li>
                      </ul>
                    </div>
                    <button class="upgrade-button">Actualizar a Starter</button>
                  </div>
                  
                  <!-- Plan Pro (visible si el usuario tiene Plan Free o Starter) -->
                  <div class="upgrade-plan-card" id="plan-pro">
                    <div class="plan-header">
                      <h4>Plan Pro</h4>
                      <p class="price">120€<span>/mes</span></p>
                    </div>
                    <div class="plan-features">
                      <ul>
                        <li><i class="fas fa-check"></i> Usuarios: 1 usuario</li>
                        <li><i class="fas fa-check"></i> Acceso a 3 fuentes oficiales</li>
                        <li><i class="fas fa-check"></i> Resúmenes y estadísticas</li>
                        <li><i class="fas fa-check"></i> 12 Agentes Personalizados</li>
                        <li><i class="fas fa-check"></i> Alertas y notificaciones</li>
                        <li><i class="fas fa-check"></i> 500 Análisis de impacto/mes</li>
                      </ul>
                    </div>
                    <button class="upgrade-button">Actualizar a Pro</button>
                  </div>
                  
                  <!-- Plan Enterprise (visible si el usuario tiene Plan Free, Starter o Pro) -->
                  <div class="upgrade-plan-card" id="plan-enterprise">
                    <div class="plan-header">
                      <h4>Plan Enterprise</h4>
                      <p class="price">Personalizado</p>
                    </div>
                    <div class="plan-features">
                      <ul>
                        <li><i class="fas fa-check"></i> Usuarios: según empresa</li>
                        <li><i class="fas fa-check"></i> Acceso ilimitado a fuentes</li>
                        <li><i class="fas fa-check"></i> Resúmenes y estadísticas</li>
                        <li><i class="fas fa-check"></i> Agentes Personalizados según necesidades</li>
                        <li><i class="fas fa-check"></i> Alertas y notificaciones</li>
                        <li><i class="fas fa-check"></i> Análisis de impacto ilimitado</li>
                      </ul>
                    </div>
                    <button class="upgrade-button">Contactar ventas</button>
                  </div>
                  
                  <!-- Plan Free (visible si el usuario tiene Plan Pro o Enterprise) -->
                  <div class="upgrade-plan-card" id="plan-free">
                    <div class="plan-header">
                      <h4>Plan Free</h4>
                      <p class="price">Gratis</p>
                    </div>
                    <div class="plan-features">
                      <ul>
                        <li><i class="fas fa-check"></i> Usuarios: 1 usuario</li>
                        <li><i class="fas fa-check"></i> Acceso al BOE</li>
                        <li><i class="fas fa-check"></i> Resúmenes y estadísticas</li>
                      </ul>
                    </div>
                    <button class="downgrade-button">Cambiar a Free</button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Sección: Gestión de Agentes -->
            <div id="agents" class="content-section">
              <!-- Esta sección se llenará dinámicamente con createAgentsSection() -->
            </div>
            
            <!-- Sección: Fuentes -->
            <div id="sources" class="content-section">
              <!-- Esta sección se llenará dinámicamente con createSourcesSection() -->
            </div>
            
            <!-- Sección: Rango -->
            <div id="range" class="content-section">
              <!-- Esta sección se llenará dinámicamente con createRangeSection() -->
            </div>
            
            <!-- Sección: Análisis -->
            <div id="analysis" class="content-section">
              <!-- Esta sección se llenará dinámicamente con createAnalysisSection() -->
            </div>
            
            <!-- Sección: Cerrar Sesión -->
            <div id="logout" class="content-section">
              <h2>Cerrar Sesión</h2>
              <p>¿Estás seguro de que deseas cerrar sesión?</p>
              <button class="action-button">Cerrar Sesión</button>
            </div>
            
            <!-- Sección: Cancelar Suscripción -->
            <div id="cancel" class="content-section">
              <h2>Cancelar Suscripción</h2>
              <p>¿Estás seguro de que deseas cancelar tu suscripción?</p>
              <p>Al cancelar tu suscripción perderás acceso a todas las funcionalidades premium.</p>
              <button class="action-button danger">Cancelar Suscripción</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Insertar el modal en el DOM
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Insertar los estilos CSS
  insertSubscriptionModalStyles();
}

// 8. Función para cargar los datos del usuario
async function loadUserData() {
  // Mostrar loader
 // mostrarLoader();
  
  try {
    const response = await fetch('/api/get-user-data', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include' // Para incluir cookies de sesión
    });
    
    if (!response.ok) {
      throw new Error(`Error al cargar datos: ${response.status}`);
    }
    
    const userData = await response.json();
    
    // Guardar los datos del usuario en una variable global
    window.userData = userData;
    
    // Actualizar los elementos ocultos con los datos del usuario
    const userEtiquetasElement = document.getElementById('userEtiquetasPersonalizadas');
    if (userEtiquetasElement) {
      userEtiquetasElement.textContent = JSON.stringify(userData.etiquetas_personalizadas || {});
    }
    
    const userCoberturaElement = document.getElementById('userCoberturaLegal');
    if (userCoberturaElement) {
      userCoberturaElement.textContent = JSON.stringify(userData.cobertura_legal || {
        'fuentes-gobierno': [],
        'fuentes-reguladores': []
      });
    }
    
    const userRangosElement = document.getElementById('userRangos');
    if (userRangosElement) {
      userRangosElement.textContent = JSON.stringify(userData.rangos || []);
    }
    
    const userAnalysisElement = document.getElementById('userImpactAnalysisLimit');
    if (userAnalysisElement) {
      userAnalysisElement.textContent = userData.impact_analysis_limit || 0;
    }
    
    // Actualizar el plan actual
    currentUserPlan = userData.subscription_plan || 'plan1';
    
    return userData;
  } catch (error) {
    console.error('Error al cargar datos del usuario:', error);
    alert_personalizada('Ha ocurrido un error al cargar tus datos. Por favor, recarga la página.');
    return null;
  } finally {
    // Ocultar loader
    ocultarLoader();
  }
}

// Función para insertar los estilos CSS del modal
function insertSubscriptionModalStyles() {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      /* Estilos para el modal de suscripción */
      .subscription-modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        backdrop-filter: blur(5px);
      }
      
      .subscription-modal.active {
        display: flex;
        justify-content: center;
        align-items: center;
      }
      
      .modal-content {
        position: relative;
        background-color: white;
        width: 90%;
        max-width: 1000px;
        height: 80%;
        max-height: 700px;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
        overflow: hidden;
      }
      
      /* Botón para cerrar el modal */
      .close-button {
        position: absolute;
        top: 15px;
        right: 15px;
        width: 30px;
        height: 30px;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: #455862;
        color: white;
        border-radius: 50%;
        cursor: pointer;
        z-index: 10;
        transition: background-color 0.3s ease;
      }
      
      .close-button:hover {
        background-color: #0b2431;
      }
      
      /* Contenedor principal del menú de suscripción */
      .subscription-container {
        display: flex;
        width: 100%;
        height: 100%;
      }
      
      /* Menú lateral (20% del ancho) */
      .sidebar-menu {
        width: 20%;
        background-color: #f8f8f8;
        border-right: 1px solid #e0e0e0;
        padding: 20px 0;
        overflow-y: auto;
      }
      
      .sidebar-menu ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      
      .sidebar-menu li {
        padding: 15px 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        transition: background-color 0.3s ease;
      }
      
      .sidebar-menu li:hover {
        background-color: #eaeaea;
      }
      
      .sidebar-menu li.active {
        background-color: #bffce6fc;
        border-left: 3px solid #04db8d;
      }
      
      .sidebar-menu li i {
        margin-right: 10px;
        width: 20px;
        text-align: center;
        color: #455862;
      }
      
      .sidebar-menu li.active i {
        color: #04db8d;
      }
      
      .sidebar-menu li span {
        font-size: 14px;
        font-weight: 500;
      }
      
      /* Área de contenido (80% del ancho) */
      .content-area {
        width: 80%;
        padding: 30px;
        overflow-y: auto;
      }
      
      /* Estilos para las secciones de contenido */
      .content-section {
        display: none;
      }
      
      .content-section.active {
        display: block;
      }
      
      .content-section h2 {
        margin-top: 0;
        margin-bottom: 20px;
        font-size: 24px;
        color: #0b2431;
      }
      
      /* Estilos para la sección del plan actual */
      .current-plan-details {
        background-color: #f8f8f8;
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 30px;
      }
      
      .plan-header {
        display: flex;
        align-items: center;
        margin-bottom: 15px;
      }
      
      .plan-icon {
        width: 50px;
        height: 50px;
        background-color: #04db8d;
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        margin-right: 15px;
      }
      
      .plan-icon i {
        color: white;
        font-size: 24px;
      }
      
      .plan-title h3 {
        margin: 0;
        font-size: 20px;
        color: #0b2431;
      }
      
      .plan-description {
        margin: 5px 0 0;
        color: #455862;
        font-size: 14px;
      }
      
      .plan-features ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      
      .plan-features li {
        margin-bottom: 10px;
        display: flex;
        align-items: center;
      }
      
      .plan-features li i {
        color: #04db8d;
        margin-right: 10px;
        width: 16px;
        text-align: center;
      }
      
      /* Estilos para la sección de mejora de plan */
      .upgrade-section {
        margin-top: 30px;
      }
      
      .upgrade-section h3 {
        font-size: 20px;
        margin-bottom: 5px;
      }
      
      .upgrade-section p {
        color: #455862;
        margin-top: 0;
        margin-bottom: 20px;
      }
      
      .upgrade-plans {
        display: flex;
        gap: 20px;
        flex-wrap: wrap;
      }
      
      .upgrade-plan-card {
        flex: 1;
        min-width: 250px;
        border: 1px solid #e0e0e0;
        border-radius: 10px;
        padding: 20px;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
      }
      
      .upgrade-plan-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
      }
      
      .upgrade-plan-card .plan-header {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .upgrade-plan-card h4 {
        margin: 0;
        font-size: 18px;
        color: #0b2431;
      }
      
      .upgrade-plan-card .price {
        font-size: 24px;
        font-weight: 700;
        margin: 10px 0;
        color: #0b2431;
      }
      
      .upgrade-plan-card .price span {
        font-size: 14px;
        font-weight: 400;
        color: #455862;
      }
      
      .upgrade-plan-card .plan-features {
        margin-bottom: 20px;
      }
      
      .upgrade-plan-card .plan-features li {
        font-size: 14px;
      }
      
      .upgrade-button, .downgrade-button, .action-button {
        width: 100%;
        padding: 10px;
        border: none;
        border-radius: 5px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.3s ease;
      }
      
      .upgrade-button {
        background-color: #04db8d;
        color: white;
      }
      
      .upgrade-button:hover {
        background-color: #03c57f;
      }
      
      .downgrade-button {
        background-color: #455862;
        color: white;
      }
      
      .downgrade-button:hover {
        background-color: #3a4a52;
      }
      
      .action-button {
        background-color: #455862;
        color: white;
        margin-top: 20px;
      }
      
      .action-button:hover {
        background-color: #3a4a52;
      }
      
      .action-button.danger {
        background-color: #d32f2f;
      }
      
      .action-button.danger:hover {
        background-color: #b71c1c;
      }
      
      /* Estilos para la sección de agentes */
      .agents-container {
        margin-top: 20px;
      }
      
      .etiquetas-contador {
        margin-bottom: 15px;
        font-size: 17px;
        color: #0b2431;
        font-weight: 500;
        font-style: italic;
      }
      
      .contador-etiquetas {
        color: #04db8d;
      }
      
      .rama-box {
        width: 100%;
        display: block;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        background-color: #f8f8f8;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        overflow: hidden;
        margin-bottom: 10px;
      }
      
      .rama-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        cursor: pointer;
      }
      
      .rama-header h4 {
        margin: 0;
        color: #0b2431;
      }
      
      .rama-detail {
        padding: 10px;
        background-color: #f9f9f9;
        border-top: 1px solid #eee;
      }
      
      .etiqueta-descripcion {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
      }
      
      .edit-button {
        gap: 5px;
        background: none;
        border: none;
        cursor: pointer;
        color: #04db8d;
        padding: 5px;
        margin-right: 5px;
      }
      
      .tag-remove {
        cursor: pointer;
        color:var(--secondary-color)
        font-weight: bold;
        font-size: 18px;
        margin-left: 5px;
      }
      
      .add-etiqueta-personalizada {
        margin-top: 20px;
        margin-bottom: 20px;
        padding: 15px;
        border-radius: 8px;
        border: 1px solid #e0e0e0;
      }
      
      .add-etiqueta-personalizada h4 {
        margin-bottom: 10px;
        color: #0b2431;
      }
      
      .etiqueta-form .form-group {
        margin-bottom: 10px;
      }
      
      .etiqueta-form label {
        display: block;
        margin-bottom: 5px;
      }
      
      .etiqueta-form input,
      .etiqueta-form textarea {
        width: 100%;
        padding: 8px;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
      }
      
      .etiqueta-form textarea {
        min-height: 80px;
        resize: vertical;
      }
      
      .btn-add-etiqueta {
        background-color: #04db8d;
        color: white;
        border: none;
        padding: 8px 15px;
        border-radius: 20px;
        cursor: pointer;
        margin-top: 5px;
      }
      
      .btn-add-etiqueta:hover {
        background-color: #03c57f;
      }
      
      .no-agents-message {
        text-align: center;
        padding: 20px;
        background-color: #f8f8f8;
        border-radius: 8px;
        margin-top: 20px;
      }

      .save-button, .cancel-button {
    background-color: var(--primary-color);
    color: white;
    border: none;
    border-radius: 4px;
    padding: 5px 10px;
    margin-left: 5px;
    cursor: pointer;
    font-size: 14px;
}
    .cancel-button {
    background-color: #ccc;
}
    .edit-etiqueta-descripcion {
    width: 100%;
    min-height: 80px;
    padding: 8px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    resize: vertical;
    margin-top: 5px;
}
    .edit-etiqueta-nombre {
    width: 60%;
    padding: 5px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
}
      
      .redirect-button {
        background-color: #04db8d;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 20px;
        cursor: pointer;
        margin-top: 15px;
        font-weight: 600;
      }
      
      .redirect-button:hover {
        background-color: #03c57f;
      }
      
      /* Estilos responsivos */
      @media (max-width: 768px) {
        .subscription-container {
          flex-direction: column;
        }
        
        .sidebar-menu {
          width: 100%;
          border-right: none;
          border-bottom: 1px solid #e0e0e0;
          padding: 10px 0;
          max-height: 80px; /* Altura fija para el menú en móvil */
          overflow-y: hidden; /* Evitar scroll vertical */
        }
        
        .sidebar-menu ul {
          display: flex;
          overflow-x: auto;
          white-space: nowrap;
          padding-bottom: 5px;
          -webkit-overflow-scrolling: touch; /* Mejorar scroll en iOS */
        }
        
        .sidebar-menu li {
          padding: 10px 15px;
          flex-direction: column;
          text-align: center;
          flex: 0 0 auto; /* Evitar que los elementos se estiren */
        }
        
        .sidebar-menu li i {
          margin-right: 0;
          margin-bottom: 5px;
        }
        
        .content-area {
          width: 100%;
          padding: 20px;
          margin-top: 0; /* Eliminar margen superior */
          height: calc(100% - 80px); /* Ajustar altura restando la altura del menú */
        }
        
        .upgrade-plans {
          flex-direction: column;
        }
        
        .upgrade-plan-card {
          margin-bottom: 15px;
          min-width: 100%; /* Asegurar que ocupe todo el ancho */
        }
        
        .modal-content {
          width: 95%;
          height: 90%;
        }
        
        /* Ajustes específicos para la sección de agentes en móvil */
        .edit-text {
          display: none; /* Ocultar texto "Editar" en móvil */
        }
        
        .rama-header {
          padding: 10px; /* Aumentar área táctil */
        }
        
        .rama-header h4 {
          font-size: 16px; /* Texto más grande para mejor legibilidad */
        }
      }
    `;
    
    document.head.appendChild(styleElement);
  }

// 6. Modificación de la función initSubscriptionModal para inicializar todas las secciones
function initSubscriptionModal() {
  // Referencias a elementos del DOM
  const openModalButtons = document.querySelectorAll('#editSuscription, #editSuscription2, #editSuscription3');
  const modal = document.getElementById('subscriptionModal');
  const closeButton = document.querySelector('.close-button');
  const menuItems = document.querySelectorAll('.sidebar-menu li');
  
  // Actualizar el nombre del plan actual en el menú lateral
  updateCurrentPlanDisplay();
  
  // Mostrar/ocultar planes de mejora según el plan actual del usuario
  updateUpgradePlansVisibility();
  
  // Inicializar todas las secciones
  createAgentsSection();
  createSourcesSection();
  createRangeSection();
  createAnalysisSection();
  
  // Event listeners para abrir el modal
  openModalButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      modal.classList.add('active');
      document.body.style.overflow = 'hidden'; // Evitar scroll en el body
    });
  });
  
  // Event listener para cerrar el modal
  closeButton.addEventListener('click', () => {
    modal.classList.remove('active');
    document.body.style.overflow = ''; // Restaurar scroll en el body
  });
  
  // Event listener para cerrar el modal al hacer clic fuera del contenido
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
  
  // Event listeners para los elementos del menú lateral
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      // Remover clase active de todos los elementos del menú
      menuItems.forEach(menuItem => menuItem.classList.remove('active'));
      
      // Añadir clase active al elemento clicado
      item.classList.add('active');
      
      // Obtener la sección a mostrar
      const sectionId = item.getAttribute('data-section');
      
      // Ocultar todas las secciones
      const sections = document.querySelectorAll('.content-section');
      sections.forEach(section => section.classList.remove('active'));
      
      // Mostrar la sección seleccionada
      document.getElementById(sectionId).classList.add('active');
      
      // Actualizar la sección correspondiente si es necesario
      if (sectionId === 'agents') {
        createAgentsSection();
      } else if (sectionId === 'sources') {
        createSourcesSection();
      } else if (sectionId === 'range') {
        createRangeSection();
      } else if (sectionId === 'analysis') {
        createAnalysisSection();
      }
    });
  });
  
  // Event listeners para los botones de actualización de plan
  const upgradeButtons = document.querySelectorAll('.upgrade-button');
  upgradeButtons.forEach(button => {
    button.addEventListener('click', handlePlanUpgrade);
  });
  
  // Event listener para el botón de downgrade
  const downgradeButton = document.querySelector('.downgrade-button');
  if (downgradeButton) {
    downgradeButton.addEventListener('click', handlePlanDowngrade);
  }
  
  // Event listener para el botón de cerrar sesión
  const logoutButton = document.querySelector('#logout .action-button');
  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }
  
  // Event listener para el botón de cancelar suscripción
  const cancelButton = document.querySelector('#cancel .action-button');
  if (cancelButton) {
    cancelButton.addEventListener('click', handleCancelSubscription);
  }
}

// Función para actualizar el nombre del plan actual en el menú lateral
function updateCurrentPlanDisplay() {
  const currentPlanName = document.getElementById('current-plan-name');
  const planTitle = document.getElementById('plan-title');
  
  // Mapeo de IDs de plan a nombres legibles
  const planNames = {
    'plan1': 'Plan Free',
    'plan2': 'Plan Starter',
    'plan3': 'Plan Pro',
    'plan4': 'Plan Enterprise'
  };
  
  // Actualizar el texto con el nombre del plan
  const planDisplayName = planNames[currentUserPlan] || 'Plan Actual';
  currentPlanName.textContent = planDisplayName;
  planTitle.textContent = planDisplayName;
  
  // Actualizar las características del plan actual
  updateCurrentPlanFeatures(currentUserPlan);
}

// Función para actualizar las características mostradas del plan actual
function updateCurrentPlanFeatures(plan) {
  const planFeaturesList = document.querySelector('.current-plan-details .plan-features ul');
  
  // Limpiar la lista actual
  planFeaturesList.innerHTML = '';
  
  // Características comunes a todos los planes
  planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> Resúmenes y estadísticas</li>`;
  
  // Características específicas según el plan
  switch (plan) {
    case 'plan1': // Free
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> Usuarios: 1 usuario</li>`;
      break;
    case 'plan2': // Starter
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> Usuarios: 1 usuario</li>`;
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> Acceso a 1 fuente oficial</li>`;
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> 5 Agentes Personalizados</li>`;
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> Alertas y notificaciones</li>`;
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> Análisis de impacto 50/mes</li>`;
      break;
    case 'plan3': // Pro
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> Usuarios: 1 usuario</li>`;
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> Acceso a 3 fuentes oficiales</li>`;
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> 12 Agentes Personalizados</li>`;
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> Alertas y notificaciones</li>`;
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> Análisis de impacto 500/mes</li>`;
      break;
    case 'plan4': // Enterprise
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> Usuarios: según empresa</li>`;
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> Agentes Personalizados adaptados a necesidad</li>`;
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> Alertas y notificaciones</li>`;
      planFeaturesList.innerHTML += `<li><i class="fas fa-check"></i> Análisis de impacto</li>`;
      break;
  }
}

// Función para mostrar/ocultar planes de mejora según el plan actual
// Modificación 1: Actualizar la función updateUpgradePlansVisibility para mostrar planes de manera reactiva
function updateUpgradePlansVisibility() {
    // Obtener referencias a los contenedores de planes
    const planFree = document.getElementById('plan-free');
    const planStarter = document.getElementById('plan-starter');
    const planPro = document.getElementById('plan-pro');
    const planEnterprise = document.getElementById('plan-enterprise');
    
    // Ocultar todos los planes inicialmente
    if (planFree) planFree.style.display = 'none';
    if (planStarter) planStarter.style.display = 'none';
    if (planPro) planPro.style.display = 'none';
    if (planEnterprise) planEnterprise.style.display = 'none';
    
    // Mostrar planes según el plan actual del usuario
    switch (currentUserPlan) {
      case 'plan1': // Free
        if (planStarter) planStarter.style.display = 'block';
        if (planPro) planPro.style.display = 'block';
        if (planEnterprise) planEnterprise.style.display = 'block';
        break;
      case 'plan2': // Starter
        if (planPro) planPro.style.display = 'block';
        if (planEnterprise) planEnterprise.style.display = 'block';
        break;
      case 'plan3': // Pro
        if (planEnterprise) planEnterprise.style.display = 'block';
        break;
      case 'plan4': // Enterprise
        // No mostrar ningún plan de mejora
        break;
    }
  }
  

// Función para manejar el downgrade de plan
function handlePlanDowngrade(event) {
  // Prevenir comportamiento por defecto del botón
  event.preventDefault();
  
  // Mostrar confirmación antes de hacer downgrade
  confirm_personalizada('¿Estás seguro de que deseas cambiar a un plan gratuito? Perderás acceso a funcionalidades premium.', async () => {
    // Mostrar loader mientras se procesa el downgrade
    mostrarLoader();
    
    try {
      // Obtener los datos del usuario actual
      const userData = window.userData || {};
      
      // Crear el payload para el downgrade
      const payload = {
        plan: 'plan1', // Plan gratuito
        billingInterval: 'monthly',
        
        // Mantener los datos del usuario
        industry_tags: userData.industry_tags || [],
        sub_industria_map: userData.sub_industria_map || {},
        rama_juridicas: userData.rama_juridicas || [],
        sub_rama_map: userData.sub_rama_map || {},
        rangos: userData.rangos || [],
        cobertura_legal: userData.cobertura_legal || {
          'fuentes-gobierno': [],
          'fuentes-reguladores': []
        },
        
        // Información del perfil
        name: userData.name || '',
        web: userData.web || '',
        linkedin: userData.linkedin || '',
        perfil_profesional: userData.perfil_profesional || '',
        company_name: userData.company_name || '',
        profile_type: userData.profile_type || '',
        etiquetas_personalizadas: userData.etiquetas_personalizadas || {}
      };
      
      // Realizar la petición para hacer downgrade
      const response = await fetch('/downgrade-to-free', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'include' // Para incluir cookies de sesión
      });
      
      if (!response.ok) {
        throw new Error(`Error al hacer downgrade: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Cerrar el modal de suscripción
      const modal = document.getElementById('subscriptionModal');
      if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      }
      
      // Mostrar mensaje de éxito
      alert_personalizada('Tu plan ha sido actualizado a Free correctamente. La página se recargará para aplicar los cambios.');
      
      // Recargar la página después de un breve retraso
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error('Error al hacer downgrade:', error);
      alert_personalizada('Ha ocurrido un error al cambiar tu plan. Por favor, inténtalo de nuevo o contacta con soporte.');
      ocultarLoader();
    }
  });
}


// Función para obtener el plan actual del usuario desde el servidor
function getCurrentUserPlan() {
  // En una implementación real, esto se obtendría del servidor
  // Por ahora, simulamos la obtención del plan desde un elemento del DOM
  try {
    const userPlanElement = document.getElementById('userPlan');
    if (userPlanElement) {
      currentUserPlan = JSON.parse(userPlanElement.textContent);
    }
  } catch (error) {
    console.error('Error al obtener el plan del usuario:', error);
  }
}

// Inicializar cuando el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', () => {
  // Crear e insertar el modal en el DOM
  createSubscriptionModal();
  
  // Inicializar el modal
  initSubscriptionModal();
});

// Function to show the subscription modal
async function showSubscriptionModal() {
  try {
    // Reload user data before showing the modal
    await loadUserData();
    
    // Update all sections
    updateCurrentPlanDisplay();
    updateUpgradePlansVisibility();
    createAgentsSection();
    createSourcesSection();
    createRangeSection();
    createAnalysisSection();
    
    // Show the modal
    const modal = document.getElementById('subscriptionModal');
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    } else {
      console.error('Subscription modal not found');
      alert('La funcionalidad de editar suscripción estará disponible próximamente.');
    }
  } catch (error) {
    console.error('Error showing subscription modal:', error);
    alert('Hubo un error al cargar la información de suscripción. Por favor, inténtalo de nuevo más tarde.');
  }
}
