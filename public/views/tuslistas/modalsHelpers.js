/**
 * Helpers para modales estándar Reversa
 * Funciones auxiliares para manejar modales según el estándar UI Reversa
 */

// Función genérica para mostrar modales estándar Reversa
function showReversaModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    // Aplicar transición de entrada
    setTimeout(() => {
      modal.style.opacity = '1';
      modal.style.visibility = 'visible';
    }, 10);
  }
}

// Función genérica para ocultar modales estándar Reversa
function hideReversaModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.opacity = '0';
    modal.style.visibility = 'hidden';
    
    setTimeout(() => {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }, 300);
  }
}

// Función para crear modales dinámicos según estándar Reversa
function createReversaModal(config) {
  const {
    id,
    title,
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    type = 'info', // 'info', 'warning', 'danger', 'success'
    onConfirm = null,
    onCancel = null
  } = config;

  // Crear overlay del modal
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.className = 'modal-overlay';
  overlay.style.display = 'none';

  // Crear contenido del modal
  const content = document.createElement('div');
  content.className = 'modal-content reversa-modal';

  // Añadir título
  const titleElement = document.createElement('h3');
  titleElement.textContent = title;
  content.appendChild(titleElement);

  // Añadir mensaje
  const messageElement = document.createElement('p');
  messageElement.textContent = message;
  content.appendChild(messageElement);

  // Crear botones
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'modal-buttons';

  // Botón cancelar
  if (cancelText) {
    const cancelButton = document.createElement('button');
    cancelButton.className = 'btn btn-outline';
    cancelButton.textContent = cancelText;
    cancelButton.onclick = () => {
      hideReversaModal(id);
      if (onCancel) onCancel();
    };
    buttonsContainer.appendChild(cancelButton);
  }

  // Botón confirmar
  const confirmButton = document.createElement('button');
  let buttonClass = 'btn ';
  switch (type) {
    case 'danger':
      buttonClass += 'btn-danger';
      break;
    case 'success':
      buttonClass += 'btn-filled';
      break;
    default:
      buttonClass += 'btn-filled';
  }
  confirmButton.className = buttonClass;
  confirmButton.textContent = confirmText;
  confirmButton.onclick = () => {
    hideReversaModal(id);
    if (onConfirm) onConfirm();
  };
  buttonsContainer.appendChild(confirmButton);

  content.appendChild(buttonsContainer);
  overlay.appendChild(content);

  // Añadir al DOM
  document.body.appendChild(overlay);

  // Cerrar con ESC
  const escapeHandler = (event) => {
    if (event.key === 'Escape') {
      hideReversaModal(id);
      document.removeEventListener('keydown', escapeHandler);
    }
  };

  // Cerrar al hacer clic en el overlay
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      hideReversaModal(id);
    }
  });

  return {
    show: () => {
      document.addEventListener('keydown', escapeHandler);
      showReversaModal(id);
    },
    hide: () => {
      document.removeEventListener('keydown', escapeHandler);
      hideReversaModal(id);
    },
    destroy: () => {
      document.removeEventListener('keydown', escapeHandler);
      overlay.remove();
    }
  };
}

// Funciones de conveniencia para diferentes tipos de modales
function showInfoModal(title, message, onConfirm = null) {
  const modal = createReversaModal({
    id: `info-modal-${Date.now()}`,
    title,
    message,
    confirmText: 'Entendido',
    cancelText: null,
    type: 'info',
    onConfirm
  });
  modal.show();
  return modal;
}

function showConfirmModal(title, message, onConfirm = null, onCancel = null) {
  const modal = createReversaModal({
    id: `confirm-modal-${Date.now()}`,
    title,
    message,
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    type: 'info',
    onConfirm,
    onCancel
  });
  modal.show();
  return modal;
}

function showDangerModal(title, message, onConfirm = null, onCancel = null) {
  const modal = createReversaModal({
    id: `danger-modal-${Date.now()}`,
    title,
    message,
    confirmText: 'Eliminar',
    cancelText: 'Cancelar',
    type: 'danger',
    onConfirm,
    onCancel
  });
  modal.show();
  return modal;
}

// Hacer funciones globales
window.showReversaModal = showReversaModal;
window.hideReversaModal = hideReversaModal;
window.createReversaModal = createReversaModal;
window.showInfoModal = showInfoModal;
window.showConfirmModal = showConfirmModal;
window.showDangerModal = showDangerModal;
