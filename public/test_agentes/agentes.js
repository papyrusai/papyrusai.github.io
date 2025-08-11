// DOM Elements
const modalOverlay = document.getElementById('modalOverlay');
const agentModal = document.getElementById('agentModal');
const modalTitle = document.getElementById('modalTitle');
const closeModal = document.getElementById('closeModal');
const agentBoxes = document.querySelectorAll('.agent-box:not(.new-agent)');
const newAgentBox = document.getElementById('newAgentBox');
const tooltip = document.getElementById('tooltip');

// Toggle elements
const contenidoToggle = document.getElementById('contenidoToggle');
const toggleLabel = document.getElementById('toggleLabel');
const contenidoInfo = document.getElementById('contenidoInfo');
const contenidoText = document.getElementById('contenidoText');

// Custom checkboxes
const personalizadoGeo = document.getElementById('personalizadoGeo');
const customGeoInput = document.getElementById('customGeoInput');
const personalizadoSujetos = document.getElementById('personalizadoSujetos');
const customSujetosInput = document.getElementById('customSujetosInput');

// Agent data simulation
const agentData = {
    'proteccion-datos': {
        title: 'Protección de Datos MAZ',
        objective: 'Notificar novedades normativas materialmente relevantes para MAZ sobre protección de datos',
        content: 'Incluye Reglamentos, leyes u órdenes que modifiquen la LOPDGDD, el RGPD o su desarrollo sectorial. Resoluciones, guías y circulares de la AEPD, EDPB o CEPD con alcance general.',
        geography: 'españa',
        isExhaustive: false,
        focusLevel: 65, // Percentage for focus bar
        activityLevel: 75, // Percentage for activity bar
        normativaExcluir: 'Medidas restrictivas temporales, convenios específicos con terceros países'
    },
    'sostenibilidad': {
        title: 'Sostenibilidad Ambiental MAZ',
        objective: 'Detectar regulaciones ambientales para sector industrial',
        content: 'Leyes, decretos y directivas sobre sostenibilidad ambiental, emisiones, residuos y economía circular aplicables al sector industrial.',
        geography: 'españa',
        isExhaustive: true,
        focusLevel: 85,
        activityLevel: 45,
        normativaExcluir: 'Reglamentos reglados de aplicación municipal, medidas excepcionales'
    },
    'fintech': {
        title: 'Fintech & Pagos MAZ',
        objective: 'Seguimiento regulatorio para servicios financieros digitales',
        content: 'Normativa sobre servicios de pago, dinero electrónico, criptoactivos y prestación de servicios financieros digitales.',
        geography: 'españa',
        isExhaustive: false,
        focusLevel: 40,
        activityLevel: 90,
        normativaExcluir: 'Convenios bilaterales específicos, medidas restrictivas sancionadoras'
    }
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    initializeTooltips();
    initializeToggleFeatures();
    initializeCustomCheckboxes();
});

// Initialize event listeners
function initializeEventListeners() {
    // Agent box click handlers
    agentBoxes.forEach(box => {
        box.addEventListener('click', () => {
            const agentId = box.getAttribute('data-agent');
            openAgentModal(agentId);
        });
    });

    // New agent box handler
    newAgentBox.addEventListener('click', () => {
        openNewAgentModal();
    });

    // Close modal handlers
    closeModal.addEventListener('click', closeAgentModal);
    
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeAgentModal();
        }
    });

    // Escape key handler
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
            closeAgentModal();
        }
    });
}

// Initialize tooltips
function initializeTooltips() {
    const infoIcons = document.querySelectorAll('.info-icon');
    
    infoIcons.forEach(icon => {
        icon.addEventListener('mouseenter', (e) => {
            showTooltip(e, getTooltipText(icon));
        });
        
        icon.addEventListener('mouseleave', () => {
            hideTooltip();
        });
        
        icon.addEventListener('mousemove', (e) => {
            updateTooltipPosition(e);
        });
    });
}

// Get tooltip text based on icon context
function getTooltipText(icon) {
    const tooltipText = icon.getAttribute('data-tooltip');
    if (tooltipText) return tooltipText;
    
    // Default tooltips for specific elements
    if (icon.id === 'contenidoInfo') {
        const isExhaustive = contenidoToggle.checked;
        if (isExhaustive) {
            return 'El agente solo detectará los textos normativos, rangos o fuentes indicadas. Ideal para búsquedas muy específicas y eliminar ruido, pero debe usarse con precaución dado que novedades relevantes no incluidas en la definición pueden quedarse fuera';
        } else {
            return 'Los textos normativos, rangos y fuentes indicados como contenido del agente son ejemplos illustrativos, que dan indicaciones a la IA sobre que información buscar';
        }
    }
    
    return 'Información adicional sobre este campo';
}

// Show tooltip
function showTooltip(event, text) {
    tooltip.textContent = text;
    tooltip.classList.add('show');
    updateTooltipPosition(event);
}

// Hide tooltip
function hideTooltip() {
    tooltip.classList.remove('show');
}

// Update tooltip position
function updateTooltipPosition(event) {
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = event.clientX + 15;
    let top = event.clientY - tooltipRect.height / 2;
    
    // Adjust if tooltip goes off screen
    if (left + tooltipRect.width > viewportWidth) {
        left = event.clientX - tooltipRect.width - 15;
    }
    
    if (top < 10) {
        top = 10;
    } else if (top + tooltipRect.height > viewportHeight - 10) {
        top = viewportHeight - tooltipRect.height - 10;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

// Initialize toggle features
function initializeToggleFeatures() {
    contenidoToggle.addEventListener('change', () => {
        const isExhaustive = contenidoToggle.checked;
        toggleLabel.textContent = isExhaustive ? 'Exhaustivo' : 'Ilustrativo';
        
        // Update placeholder text based on toggle state
        if (isExhaustive) {
            contenidoText.placeholder = 'El agente solo detectará los textos normativos, rangos o fuentes indicadas. Ideal para búsquedas muy específicas y eliminar ruido, pero debe usarse con precaución dado que novedades relevantes no incluidas en la definición pueden quedarse fuera';
        } else {
            contenidoText.placeholder = 'Incluye Reglamentos, leyes u órdenes que modifiquen la LOPDGDD, el RGPD o su desarrollo sectorial. Resoluciones, guías y circulares de la AEPD, EDPB o CEPD con alcance general.';
        }
        
        // Add visual feedback
        toggleLabel.style.transform = 'scale(1.05)';
        setTimeout(() => {
            toggleLabel.style.transform = 'scale(1)';
        }, 150);
    });
}

// Initialize custom checkboxes
function initializeCustomCheckboxes() {
    // Personalizado Geography checkbox
    personalizadoGeo.addEventListener('change', () => {
        if (personalizadoGeo.checked) {
            customGeoInput.style.display = 'block';
            customGeoInput.style.animation = 'fadeInUp 0.3s ease-out';
            customGeoInput.querySelector('input').focus();
        } else {
            customGeoInput.style.display = 'none';
            customGeoInput.querySelector('input').value = '';
        }
    });

    // Personalizado Sujetos checkbox
    personalizadoSujetos.addEventListener('change', () => {
        if (personalizadoSujetos.checked) {
            customSujetosInput.style.display = 'block';
            customSujetosInput.style.animation = 'fadeInUp 0.3s ease-out';
            customSujetosInput.querySelector('input').focus();
        } else {
            customSujetosInput.style.display = 'none';
            customSujetosInput.querySelector('input').value = '';
        }
    });
}

// Open agent modal
function openAgentModal(agentId) {
    const agent = agentData[agentId];
    if (!agent) return;
    
    // Populate modal with agent data
    modalTitle.textContent = agent.title;
    document.getElementById('agentObjective').value = agent.objective;
    contenidoText.value = agent.content;
    document.getElementById('geographySelect').value = agent.geography;
    document.getElementById('normativaExcluir').value = agent.normativaExcluir || '';
    
    // Set toggle state
    contenidoToggle.checked = agent.isExhaustive;
    toggleLabel.textContent = agent.isExhaustive ? 'Exhaustivo' : 'Ilustrativo';
    
    // Update placeholder based on toggle state
    if (agent.isExhaustive) {
        contenidoText.placeholder = 'El agente solo detectará los textos normativos, rangos o fuentes indicadas. Ideal para búsquedas muy específicas y eliminar ruido, pero debe usarse con precaución dado que novedades relevantes no incluidas en la definición pueden quedarse fuera';
    } else {
        contenidoText.placeholder = 'Incluye Reglamentos, leyes u órdenes que modifiquen la LOPDGDD, el RGPD o su desarrollo sectorial. Resoluciones, guías y circulares de la AEPD, EDPB o CEPD con alcance general.';
    }
    
    // Set focus bar values
    const scoreFill = document.querySelector('.score-fill');
    const scoreThumb = document.querySelector('.score-thumb');
    if (scoreFill && scoreThumb) {
        scoreFill.style.width = agent.focusLevel + '%';
        scoreThumb.style.left = agent.focusLevel + '%';
    }
    
    // Set activity bar values
    const activityFill = document.querySelector('.activity-fill');
    const activityThumb = document.querySelector('.activity-thumb');
    if (activityFill && activityThumb) {
        activityFill.style.width = agent.activityLevel + '%';
        activityThumb.style.left = agent.activityLevel + '%';
    }
    
    // Show modal with animation
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Add subtle animation to the grid boxes
    animateGridBoxes(true);
}

// Open new agent modal (could be extended with different content)
function openNewAgentModal() {
    // For now, open with default empty values
    modalTitle.textContent = 'Nuevo Agente';
    document.getElementById('agentObjective').value = '';
    contenidoText.value = '';
    document.getElementById('geographySelect').value = 'españa';
    document.getElementById('normativaExcluir').value = '';
    
    // Reset toggle to default
    contenidoToggle.checked = false;
    toggleLabel.textContent = 'Ilustrativo';
    contenidoText.placeholder = 'Incluye Reglamentos, leyes u órdenes que modifiquen la LOPDGDD, el RGPD o su desarrollo sectorial. Resoluciones, guías y circulares de la AEPD, EDPB o CEPD con alcance general.';
    
    // Reset custom inputs
    personalizadoGeo.checked = false;
    personalizadoSujetos.checked = false;
    customGeoInput.style.display = 'none';
    customSujetosInput.style.display = 'none';
    
    // Reset both bars to default values (50%)
    const scoreFill = document.querySelector('.score-fill');
    const scoreThumb = document.querySelector('.score-thumb');
    if (scoreFill && scoreThumb) {
        scoreFill.style.width = '50%';
        scoreThumb.style.left = '50%';
    }
    
    const activityFill = document.querySelector('.activity-fill');
    const activityThumb = document.querySelector('.activity-thumb');
    if (activityFill && activityThumb) {
        activityFill.style.width = '50%';
        activityThumb.style.left = '50%';
    }
    
    // Show modal
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    animateGridBoxes(true);
}

// Close agent modal
function closeAgentModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = 'auto';
    
    // Reset custom inputs
    customGeoInput.style.display = 'none';
    customSujetosInput.style.display = 'none';
    personalizadoGeo.checked = false;
    personalizadoSujetos.checked = false;
    
    // Animate grid boxes back
    animateGridBoxes(false);
    
    // Hide tooltip
    hideTooltip();
}

// Animate grid boxes for modal open/close effect
function animateGridBoxes(isOpening) {
    const allBoxes = document.querySelectorAll('.agent-box');
    
    allBoxes.forEach((box, index) => {
        if (isOpening) {
            // Slight scale down and opacity change when modal opens
            setTimeout(() => {
                box.style.transform = 'scale(0.95)';
                box.style.opacity = '0.7';
                box.style.transition = 'all 0.3s ease';
            }, index * 50);
        } else {
            // Reset to normal when modal closes
            setTimeout(() => {
                box.style.transform = 'scale(1)';
                box.style.opacity = '1';
                box.style.transition = 'all 0.3s ease';
            }, index * 30);
        }
    });
}

// Simplified interactive scoring bar (no problematic transitions)
document.addEventListener('DOMContentLoaded', () => {
    const scoreTrack = document.querySelector('.score-track');
    const scoreFill = document.querySelector('.score-fill');
    const scoreThumb = document.querySelector('.score-thumb');
    
    if (scoreTrack && scoreFill && scoreThumb) {
        scoreTrack.addEventListener('click', (e) => {
            const rect = scoreTrack.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percentage = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
            
            scoreFill.style.width = percentage + '%';
            scoreThumb.style.left = percentage + '%';
            
            // Simple visual feedback without problematic transitions
            scoreThumb.style.transform = 'translateX(-50%) scale(1.1)';
            setTimeout(() => {
                scoreThumb.style.transform = 'translateX(-50%) scale(1)';
            }, 100);
        });
    }
});

// Add minimal interactive feedback to form elements (no problematic transitions)
document.addEventListener('DOMContentLoaded', () => {
    // Add simple checkbox interaction feedback
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            // Simple visual feedback without transitions
            const checkmark = checkbox.nextElementSibling;
            if (checkmark && checkmark.classList.contains('checkmark')) {
                checkmark.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    checkmark.style.transform = 'scale(1)';
                }, 100);
            }
        });
    });
    
    // Add activity bar interaction (similar to scoring bar)
    const activityTrack = document.querySelector('.activity-track');
    const activityFill = document.querySelector('.activity-fill');
    const activityThumb = document.querySelector('.activity-thumb');
    
    if (activityTrack && activityFill && activityThumb) {
        activityTrack.addEventListener('click', (e) => {
            const rect = activityTrack.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percentage = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
            
            activityFill.style.width = percentage + '%';
            activityThumb.style.left = percentage + '%';
            
            // Simple visual feedback
            activityThumb.style.transform = 'translateX(-50%) scale(1.1)';
            setTimeout(() => {
                activityThumb.style.transform = 'translateX(-50%) scale(1)';
            }, 100);
        });
    }
});

// Initialize activity level interaction (removed old progress bar animation)
// The activity levels now use simple text-based scale: Baja, Media, Alta

// Removed problematic section hover effects that were causing display bugs

// Console log for debugging/demo purposes
console.log('🤖 Prototipo de Agentes Regulatorios inicializado (versión optimizada)');
console.log('📋 Funcionalidades disponibles:');
console.log('   • Click en boxes para abrir modal');
console.log('   • Toggle Ilustrativo/Exhaustivo');
console.log('   • Tooltips informativos');
console.log('   • Checkboxes personalizados');
console.log('   • Foco del agente (barra interactiva)');
console.log('   • Actividad normativa (barra interactiva: Baja/Media/Alta)');
console.log('   • Ambas barras clickeables y personalizables');
console.log('   • Transiciones internas eliminadas para mejor rendimiento');
