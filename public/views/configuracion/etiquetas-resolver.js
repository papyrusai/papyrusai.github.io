/*
Frontend resolver para etiquetas personalizadas - abstrae contexto empresa/individual
Proporciona interfaz unificada para operaciones CRUD de etiquetas sin importar el tipo de cuenta del usuario.
- Usuarios individuales: opera sobre endpoint legacy /api/update-user-data
- Usuarios empresa: usa nuevo resolver /api/etiquetas-context con control de conflictos
- Manejo automático de bloqueos de edición concurrente
- Detección de permisos y mostrar UI apropiada
*/

window.EtiquetasResolver = (function() {
    
    let currentContext = null;
    let currentVersion = null;
    let isLoadingContext = false;
    
    /**
     * Obtiene el contexto del usuario (empresa/individual, permisos, etc.)
     */
    async function getUserContext() {
        if (currentContext && !isLoadingContext) {
            return currentContext;
        }
        
        if (isLoadingContext) {
            // Esperar a que termine la carga en curso
            return new Promise((resolve) => {
                const checkContext = () => {
                    if (!isLoadingContext && currentContext) {
                        resolve(currentContext);
                    } else {
                        setTimeout(checkContext, 50);
                    }
                };
                checkContext();
            });
        }
        
        isLoadingContext = true;
        try {
            // ENTERPRISE ADAPTER: Usar endpoint unificado
            const response = await fetch('/api/etiquetas-context');
            if (!response.ok) {
                throw new Error('Error obteniendo contexto de usuario');
            }
            
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Error en respuesta del servidor');
            }
            
            // Adaptar estructura de respuesta del nuevo endpoint
            currentContext = {
                tipo_cuenta: data.source === 'empresa' ? 'empresa' : 'individual',
                isEnterprise: data.source === 'empresa',
                can_edit_empresa: data.source === 'individual' || (data.permissions?.can_edit_empresa ?? false),
                permissions: data.permissions || {},
                estructura_empresa_id: data.estructura_id || null,
                version: data.version || 1,
                is_admin: false
            };
            
            // Enriquecer con /api/user-context cuando sea empresa para obtener flags fiables
            if (currentContext.tipo_cuenta === 'empresa') {
                try {
                    const ucResp = await fetch('/api/user-context');
                    if (ucResp.ok) {
                        const ucData = await ucResp.json();
                        const uc = ucData?.context || {};
                        // Sobrescribir con valores fiables del backend
                        currentContext.can_edit_empresa = !!uc.can_edit_empresa;
                        currentContext.is_admin = !!uc.is_admin;
                        currentContext.empresa = uc.empresa || currentContext.empresa;
                    }
                } catch (e) {
                    // Ignorar errores de enriquecimiento; mantener valores previos
                }
            }
            
            currentVersion = data.version || 1;
            return currentContext;
        } catch (error) {
            console.error('Error obteniendo contexto:', error);
            // Fallback a contexto individual
            currentContext = { 
                tipo_cuenta: 'individual', 
                can_edit_empresa: false, 
                is_admin: false,
                isEnterprise: false 
            };
            return currentContext;
        } finally {
            isLoadingContext = false;
        }
    }
    
    /**
     * Obtiene las etiquetas personalizadas según el contexto del usuario
     * ENTERPRISE ADAPTER: Usa endpoint unificado que maneja empresa/individual automáticamente
     */
    async function getEtiquetasPersonalizadas() {
        try {
            // ENTERPRISE ADAPTER: Usar endpoint unificado para ambos tipos de cuenta
            const response = await fetch('/api/etiquetas-context');
            if (!response.ok) {
                throw new Error('Error obteniendo etiquetas personalizadas');
            }
            
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Error en respuesta del servidor');
            }
            
            currentVersion = data.version || 1;
            
            const result = {
                etiquetas_personalizadas: data.data || {},
                source: data.source,
                version: data.version || 1,
                can_edit: data.source === 'individual' || data.permissions?.can_edit_empresa || false,
                is_empresa: data.source === 'empresa',
                isEnterprise: data.source === 'empresa',
                permissions: data.permissions || {},
                estructura_id: data.estructura_id,
                user_id: data.user_id
            };
            return result;
            
        } catch (error) {
            console.error('Error obteniendo etiquetas:', error);
            // Fallback para compatibilidad
            try {
                const response = await fetch('/api/get-user-data');
                if (response.ok) {
                    const userData = await response.json();
                    return {
                        etiquetas_personalizadas: userData.etiquetas_personalizadas || {},
                        source: 'individual',
                        can_edit: true,
                        is_empresa: false,
                        isEnterprise: false
                    };
                }
            } catch (fallbackError) {
                console.error('Error en fallback:', fallbackError);
            }
            
            return {
                etiquetas_personalizadas: {},
                source: 'individual',
                can_edit: true,
                is_empresa: false,
                error: error.message
            };
        }
    }
    
    /**
     * Actualiza las etiquetas personalizadas con resolución de conflictos
     */
    async function updateEtiquetasPersonalizadas(etiquetas) {
        try {
            const context = await getUserContext();
            
            if (context.tipo_cuenta === 'empresa') {
                // Verificar permisos
                if (!context.can_edit_empresa) {
                    return {
                        success: false,
                        error: 'Sin permisos para editar etiquetas empresariales',
                        permission_error: true
                    };
                }
                
                // Usar resolver con control de versión
                const response = await fetch('/api/etiquetas-context', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        etiquetas_personalizadas: etiquetas,
                        expectedVersion: currentVersion
                    })
                });
                
                const result = await response.json();
                
                if (response.status === 409) {
                    // Conflicto de versión
                    return {
                        success: false,
                        conflict: true,
                        error: result.error || 'Conflicto de versión detectado',
                        currentVersion: result.currentVersion
                    };
                }
                
                if (response.status === 403) {
                    // Sin permisos
                    return {
                        success: false,
                        permission_error: true,
                        error: result.error || 'Sin permisos para editar'
                    };
                }
                
                if (!response.ok) {
                    throw new Error(result.error || 'Error actualizando etiquetas');
                }
                
                // Actualizar versión local
                currentVersion = result.newVersion;
                
                return {
                    success: true,
                    source: 'empresa',
                    version: result.newVersion,
                    message: result.message
                };
                
            } else {
                // Usuario individual - usar método legacy
                const response = await fetch('/api/update-user-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        etiquetas_personalizadas: etiquetas
                    })
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Error actualizando etiquetas');
                }
                
                return {
                    success: true,
                    source: 'individual',
                    message: 'Etiquetas actualizadas correctamente'
                };
            }
        } catch (error) {
            console.error('Error actualizando etiquetas:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Solicita bloqueo de edición (solo para empresas)
     */
    async function lockForEdit(agenteName = null) {
        try {
            const context = await getUserContext();
            
            if (context.tipo_cuenta !== 'empresa') {
                return { success: true }; // No necesario para individuales
            }
            
            const response = await fetch('/api/etiquetas-lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agenteName })
            });
            
            const result = await response.json();
            
            if (response.status === 423) {
                // Bloqueado por otro usuario
                return {
                    success: false,
                    locked: true,
                    error: result.error,
                    locked_by: result.locked_by,
                    locked_since: result.locked_since
                };
            }
            
            return result;
        } catch (error) {
            console.error('Error bloqueando edición:', error);
            return { success: true }; // Fallar silenciosamente para no bloquear la UX
        }
    }
    
    /**
     * Libera bloqueo de edición (solo para empresas)
     */
    async function unlockForEdit(agenteName = null) {
        try {
            const context = await getUserContext();
            
            if (context.tipo_cuenta !== 'empresa') {
                return { success: true };
            }
            
            const response = await fetch('/api/etiquetas-lock', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agenteName })
            });
            
            return await response.json();
        } catch (error) {
            console.error('Error liberando bloqueo:', error);
            return { success: true };
        }
    }
    
    /**
     * Muestra UI de contexto empresarial (banner informativo) - DEPRECATED
     * Esta función ya no se usa, los banners han sido eliminados
     */
    function showEmpresaContextUI(context, container) {
        // No longer used - banners removed per user request
        return;
    }
    
    /**
     * Maneja errores de conflicto de versión
     */
    function handleVersionConflict(conflictResult) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        modal.innerHTML = `
            <div style="background: white; padding: 30px; border-radius: 12px; max-width: 500px; text-align: center;">
                <h3 style="color: #d32f2f; margin-bottom: 15px;">⚠️ Conflicto Detectado</h3>
                <p style="margin-bottom: 25px; line-height: 1.5;">
                    Otro usuario ha modificado los agentes mientras editabas. 
                    Para evitar perder cambios, la página se recargará para obtener la versión más reciente.
                </p>
                <button onclick="window.location.reload()" style="
                    background: #04db8d;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                ">
                    Recargar Página
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    /**
     * Obtiene la cobertura legal según el contexto del usuario
     */
    async function getCoberturaLegal() {
        try {
            const context = await getUserContext();
            
            if (context.tipo_cuenta === 'empresa') {
                // Usar nuevo resolver para empresas
                const response = await fetch('/api/cobertura-context');
                if (!response.ok) {
                    throw new Error('Error obteniendo cobertura legal empresarial');
                }
                
                const data = await response.json();
                currentVersion = data.version;
                
                return {
                    cobertura_legal: data.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] },
                    rangos: data.rangos || [],
                    source: data.source,
                    version: data.version,
                    can_edit: context.can_edit_empresa,
                    is_empresa: true,
                    empresa_name: context.empresa
                };
            } else {
                // Fallback a método legacy para individuales
                const response = await fetch('/api/get-user-data');
                if (!response.ok) {
                    throw new Error('Error obteniendo datos de usuario');
                }
                
                const userData = await response.json();
                return {
                    cobertura_legal: userData.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] },
                    rangos: userData.rangos || [],
                    source: 'individual',
                    can_edit: true,
                    is_empresa: false
                };
            }
        } catch (error) {
            console.error('Error obteniendo cobertura legal:', error);
            return {
                cobertura_legal: { fuentes_gobierno: [], fuentes_reguladores: [] },
                rangos: [],
                source: 'individual',
                can_edit: true,
                is_empresa: false,
                error: error.message
            };
        }
    }
    
    /**
     * Actualiza la cobertura legal con resolución de conflictos
     */
    async function updateCoberturaLegal(cobertura_legal, rangos) {
        try {
            const context = await getUserContext();
            
            if (context.tipo_cuenta === 'empresa') {
                // Verificar permisos
                if (!context.can_edit_empresa) {
                    return {
                        success: false,
                        error: 'Sin permisos para editar fuentes empresariales',
                        permission_error: true
                    };
                }
                
                // Usar resolver con control de versión
                const response = await fetch('/api/cobertura-context', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cobertura_legal,
                        rangos,
                        expectedVersion: currentVersion
                    })
                });
                
                const result = await response.json();
                
                if (response.status === 409) {
                    // Conflicto de versión
                    return {
                        success: false,
                        conflict: true,
                        error: result.error || 'Conflicto de versión detectado',
                        currentVersion: result.currentVersion
                    };
                }
                
                if (response.status === 403) {
                    // Sin permisos
                    return {
                        success: false,
                        permission_error: true,
                        error: result.error || 'Sin permisos para editar'
                    };
                }
                
                if (!response.ok) {
                    throw new Error(result.error || 'Error actualizando cobertura legal');
                }
                
                // Actualizar versión local
                currentVersion = result.newVersion;
                
                return {
                    success: true,
                    source: 'empresa',
                    version: result.newVersion,
                    message: result.message
                };
                
            } else {
                // Usuario individual - usar método legacy
                const response = await fetch('/api/update-user-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cobertura_legal,
                        rangos
                    })
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Error actualizando cobertura legal');
                }
                
                return {
                    success: true,
                    source: 'individual',
                    message: 'Fuentes actualizadas correctamente'
                };
            }
        } catch (error) {
            console.error('Error actualizando cobertura legal:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Obtiene todos los datos de contexto según el contexto del usuario
     */
    async function getContextData() { window.__favoritos_saving__ = window.__favoritos_saving__ || false;
        try {
            const context = await getUserContext();
            
            if (context.tipo_cuenta === 'empresa') {
                // Usar nuevo resolver para empresas
                const response = await fetch('/api/context-data');
                if (!response.ok) {
                    throw new Error('Error obteniendo datos de contexto empresarial');
                }
                
                const result = await response.json();
                currentVersion = result.version;
                
                return {
                    ...result.data,
                    can_edit: context.can_edit_empresa,
                    is_empresa: true,
                    empresa_name: context.empresa
                };
            } else {
                // Fallback a método legacy para individuales
                const response = await fetch('/api/get-user-data');
                if (!response.ok) {
                    throw new Error('Error obteniendo datos de usuario');
                }
                
                const userData = await response.json();
                return {
                    ...userData,
                    source: 'individual',
                    can_edit: true,
                    is_empresa: false
                };
            }
        } catch (error) {
            console.error('Error obteniendo datos de contexto:', error);
            return {
                source: 'individual',
                can_edit: true,
                is_empresa: false,
                error: error.message
            };
        }
    }
    
    /**
     * Actualiza los datos de contexto con resolución de conflictos
     */
    async function updateContextData(contextData) {
        try {
            const context = await getUserContext();
            
            if (context.tipo_cuenta === 'empresa') {
                // Verificar permisos
                if (!context.can_edit_empresa) {
                    return {
                        success: false,
                        error: 'Sin permisos para editar datos empresariales',
                        permission_error: true
                    };
                }
                
                // Usar resolver con control de versión
                const response = await fetch('/api/context-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contextData,
                        expectedVersion: currentVersion
                    })
                });
                
                const result = await response.json();
                
                if (response.status === 409) {
                    // Conflicto de versión
                    return {
                        success: false,
                        conflict: true,
                        error: result.error || 'Conflicto de versión detectado',
                        currentVersion: result.currentVersion
                    };
                }
                
                if (response.status === 403) {
                    // Sin permisos
                    return {
                        success: false,
                        permission_error: true,
                        error: result.error || 'Sin permisos para editar'
                    };
                }
                
                if (!response.ok) {
                    throw new Error(result.error || 'Error actualizando datos de contexto');
                }
                
                // Actualizar versión local
                currentVersion = result.newVersion;
                
                return {
                    success: true,
                    source: 'empresa',
                    version: result.newVersion,
                    message: result.message
                };
                
            } else {
                // Usuario individual - usar método legacy
                const response = await fetch('/api/update-user-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(contextData)
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Error actualizando datos de contexto');
                }
                
                return {
                    success: true,
                    source: 'individual',
                    message: 'Datos actualizados correctamente'
                };
            }
        } catch (error) {
            console.error('Error actualizando datos de contexto:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Convierte botones de edición en botones de lectura para usuarios sin permisos
     */
    function setupReadonlyButtons() {
        getUserContext().then(context => {
            if (context.tipo_cuenta === 'empresa' && !context.can_edit_empresa) {
                // Usuario empresa sin permisos de edición
                convertToReadonlyButtons();
                
                // Forzar conversión inmediata de botones existentes en modales
                setTimeout(() => {
                    forceConvertExistingButtons();
                }, 100);
            }
        }).catch(err => {
            console.warn('No se pudo verificar permisos de usuario:', err);
        });
    }
    
    /**
     * Fuerza la interceptación de botones existentes que puedan haberse perdido
     */
    function forceConvertExistingButtons() {
        // Simplemente llamar a interceptButtonClicks que ya maneja todos los botones
        interceptButtonClicks();
    }
    
    /**
     * Intercepta clicks en botones para usuarios de solo lectura
     */
    function convertToReadonlyButtons() {
        // En lugar de convertir botones, interceptar clicks
        interceptButtonClicks();
        observeNewButtons();
    }
    
    /**
     * Esta función ya no se usa - los botones originales se mantienen con interceptación
     */
    function createReadonlyButton(text, section) {
        // Esta función es obsoleta, mantenida por compatibilidad
        return '';
    }
    
    /**
     * Intercepta clicks en botones e inputs específicos para usuarios de solo lectura
     */
    function interceptButtonClicks() {
        const buttonSelectors = [
            '#editContextBtn',
            '#saveFuentesBtn', 
            '.edit-agent-btn',
            '.save-agent-btn',
            '#saveAgentChangesBtn',
            '#saveAgentBtn'
        ];
        
        const inputSelectors = [
            '#agentContexto',
            '#agentObjetivo', 
            '#agentContenido',
            '#agentNoIncluidos'
        ];
        
        // Interceptar botones
        buttonSelectors.forEach(selector => {
            const buttons = document.querySelectorAll(selector);
            buttons.forEach(btn => {
                if (!btn.hasAttribute('data-readonly-intercepted')) {
                    btn.setAttribute('data-readonly-intercepted', 'true');
                    
                    // Aplicar estilos de desactivado con tono gris
                    btn.style.opacity = '0.7';
                    btn.style.cursor = 'not-allowed';
                    btn.style.pointerEvents = 'none';
                    btn.style.filter = 'grayscale(0.3)';
                    btn.style.backgroundColor = '#f8f9fa';
                    btn.style.border = '1px solid #dee2e6';
                    btn.style.color = '#6c757d';
                    
                    // Añadir wrapper para tooltip
                    if (!btn.parentElement.classList.contains('readonly-button-wrapper')) {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'readonly-button-wrapper';
                        wrapper.style.cssText = 'position: relative; display: inline-block;';
                        
                        btn.parentNode.insertBefore(wrapper, btn);
                        wrapper.appendChild(btn);
                        
                        // Añadir evento hover al wrapper
                        wrapper.addEventListener('mouseenter', showButtonTooltip);
                        wrapper.addEventListener('mouseleave', hideButtonTooltip);
                    }
                }
            });
        });
        
        // Interceptar inputs de agentes
        inputSelectors.forEach(selector => {
            const inputs = document.querySelectorAll(selector);
            inputs.forEach(input => {
                if (!input.hasAttribute('data-readonly-intercepted')) {
                    input.setAttribute('data-readonly-intercepted', 'true');
                    
                    // Deshabilitar input
                    input.disabled = true;
                    input.style.backgroundColor = '#f8f9fa';
                    input.style.cursor = 'not-allowed';
                    input.style.opacity = '0.7';
                }
            });
        });
    }
    
    /**
     * Observa la creación de nuevos botones para interceptarlos
     */
    function observeNewButtons() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        // Interceptar nuevos botones
                        setTimeout(() => interceptButtonClicks(), 100);
                    }
                });
            });
        });
        
        // Observar el body para nuevos botones
        observer.observe(document.body, { childList: true, subtree: true });
    }
    
    /**
     * Muestra tooltip al hacer hover sobre botón desactivado
     */
    function showButtonTooltip(e) {
        const wrapper = e.currentTarget;
        const button = wrapper.querySelector('button');
        
        if (!button) return;
        
        // Determinar mensaje según el botón
        let message = 'Solicita permiso de edición para poder editar agentes';
        if (button.id === 'editContextBtn') {
            message = 'Solicita permiso de edición para poder editar contexto';
        } else if (button.id === 'saveFuentesBtn') {
            message = 'Solicita permiso de edición para poder editar fuentes';
        }
        
        const tooltip = document.createElement('div');
        tooltip.className = 'readonly-button-tooltip';
        tooltip.textContent = message;
        
        // Determinar posición según el botón
        let tooltipPosition = '';
        if (button.id === 'saveAgentChangesBtn') {
            // Para el botón guardar agentes, posicionar a la izquierda con dimensiones específicas
            tooltipPosition = `
                position: absolute;
                top: 50%;
                right: calc(100% + 12px);
                transform: translateY(-50%);
                width: 200px;
                height: 36px;
                display: flex;
                align-items: center;
                padding: 0 12px;
                white-space: nowrap;
                text-align: left;
                font-size: 13px;
                line-height: 1.2;
            `;
            
            // Flecha apuntando hacia la derecha
            const arrow = document.createElement('div');
            arrow.style.cssText = `
                position: absolute;
                top: 50%;
                left: 100%;
                transform: translateY(-50%);
                width: 0;
                height: 0;
                border-top: 6px solid transparent;
                border-bottom: 6px solid transparent;
                border-left: 6px solid rgba(11, 36, 49, 0.95);
            `;
            tooltip.appendChild(arrow);
        } else {
            // Para otros botones, posición arriba centrada
            tooltipPosition = `
                position: absolute;
                bottom: calc(100% + 8px);
                left: 50%;
                transform: translateX(-50%);
                white-space: nowrap;
            `;
            
            // Flecha apuntando hacia abajo
            const arrow = document.createElement('div');
            arrow.style.cssText = `
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%);
                width: 0;
                height: 0;
                border-left: 5px solid transparent;
                border-right: 5px solid transparent;
                border-top: 5px solid rgba(11, 36, 49, 0.95);
            `;
            tooltip.appendChild(arrow);
        }
        
        tooltip.style.cssText = `
            ${tooltipPosition}
            background: rgba(11, 36, 49, 0.95);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            z-index: 10001;
            box-shadow: 0 4px 12px rgba(11, 36, 49, 0.3);
            pointer-events: none;
            line-height: 1.3;
        `;
        
        wrapper.appendChild(tooltip);
    }
    
    /**
     * Oculta tooltip al salir del hover
     */
    function hideButtonTooltip(e) {
        const wrapper = e.currentTarget;
        const tooltip = wrapper.querySelector('.readonly-button-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }
    
    /**
     * Muestra mensaje de permiso requerido (función obsoleta mantenida por compatibilidad)
     */
    function showPermissionRequiredMessage() {
        // Esta función ya no se usa pero se mantiene por compatibilidad
        return;
    }
    
    /**
     * Muestra el modal de solicitud de permisos con UI estándar Reversa
     */
    function showPermissionModal(section) {
        // Crear el modal dinámicamente con UI estándar
        const modalHTML = `
            <div id="permissionModal" class="permission-modal-overlay">
                <div class="permission-modal-content">
                    <div class="permission-modal-header">
                        <h3>Solicitar permisos de edición</h3>
                        <button class="permission-modal-close" onclick="closePermissionModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="permission-modal-body">
                        <p>
                            Explica por qué necesitas solicitar permisos de edición para <strong>${section}</strong>:
                        </p>
                        <input type="text" id="permissionReason" class="permission-modal-input" 
                               placeholder="Explica por qué quieres solicitar el permiso de edición" 
                               maxlength="200">
                    </div>
                    <div class="permission-modal-footer">
                        <button class="permission-modal-btn btn-outline" onclick="closePermissionModal()">Cancelar</button>
                        <button id="submitPermissionBtn" class="permission-modal-btn btn-filled" onclick="submitPermissionRequest('${section}')">Enviar</button>
                    </div>
                </div>
            </div>
        `;
        
        // Añadir al DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Animar entrada y focus
        setTimeout(() => {
            const modal = document.getElementById('permissionModal');
            if (modal) {
                modal.classList.add('active');
            }
            
            const input = document.getElementById('permissionReason');
            if (input) {
                input.focus();
                // Permitir submit con Enter
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        document.getElementById('submitPermissionBtn').click();
                    }
                });
            }
        }, 10);
        
        // Cerrar con Esc
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closePermissionModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // Cerrar al hacer clic fuera
        const modal = document.getElementById('permissionModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closePermissionModal();
                }
            });
        }
    }
    
    // Funciones globales para el dropdown y modal (necesarias para onclick)
    window.toggleReadonlyDropdown = function(dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        const button = dropdown ? dropdown.previousElementSibling : null;
        
        if (!dropdown) return;
        
        // Cerrar otros dropdowns abiertos
        document.querySelectorAll('.readonly-dropdown-menu.active').forEach(menu => {
            if (menu.id !== dropdownId) {
                menu.classList.remove('active');
                const parentBtn = menu.parentElement.querySelector('.readonly-dropdown-btn');
                if (parentBtn) parentBtn.classList.remove('active');
            }
        });
        
        // Toggle del dropdown actual
        const isActive = dropdown.classList.contains('active');
        dropdown.classList.toggle('active');
        
        // Toggle del botón
        const currentBtn = dropdown.parentElement.querySelector('.readonly-dropdown-btn');
        if (currentBtn) {
            currentBtn.classList.toggle('active');
        }
        
        // Si se está abriendo el dropdown, cargar contenido dinámico
        if (!isActive) {
            loadDropdownContent(dropdown);
            
            // Cerrar dropdown al hacer clic fuera
            const closeOnOutsideClick = (e) => {
                if (!dropdown.contains(e.target) && !currentBtn.contains(e.target)) {
                    dropdown.classList.remove('active');
                    if (currentBtn) currentBtn.classList.remove('active');
                    document.removeEventListener('click', closeOnOutsideClick);
                }
            };
            
            // Añadir listener con delay para evitar cierre inmediato
            setTimeout(() => {
                document.addEventListener('click', closeOnOutsideClick);
            }, 10);
        }
    };
    
    /**
     * Carga el contenido del dropdown según si hay solicitudes pendientes
     */
    async function loadDropdownContent(dropdown) {
        const section = dropdown.dataset.section;
        if (!section) return;
        
        try {
            // Verificar si hay solicitudes pendientes
            const response = await fetch('/api/permisos/check-pending', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ section })
            });
            
            const data = await response.json();
            
            if (data.hasPending) {
                // Hay solicitud pendiente
                dropdown.innerHTML = `
                    <div class="readonly-dropdown-item readonly-dropdown-item-pending">
                        <i class="fas fa-clock" style="color: #6c757d;"></i>
                        <span>Solicitud edición en revisión</span>
                    </div>
                `;
            } else {
                // No hay solicitud pendiente, mostrar opción normal
                dropdown.innerHTML = `
                    <div class="readonly-dropdown-item" onclick="window.EtiquetasResolver.showPermissionModal('${section}')">
                        <i class="fas fa-edit" style="color: #000;"></i>
                        <span>Solicitar edición</span>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error verificando solicitudes pendientes:', error);
            // Fallback: mostrar opción normal
            dropdown.innerHTML = `
                <div class="readonly-dropdown-item" onclick="window.EtiquetasResolver.showPermissionModal('${section}')">
                    <i class="fas fa-edit" style="color: #000;"></i>
                    <span>Solicitar edición</span>
                </div>
            `;
        }
    }
    
    window.closePermissionModal = function() {
        const modal = document.getElementById('permissionModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    };
    
    window.submitPermissionRequest = function(section) {
        const reasonInput = document.getElementById('permissionReason');
        const reason = reasonInput ? reasonInput.value.trim() : '';
        
        if (!reason) {
            // Usar estilo estándar en lugar de alert
            reasonInput.focus();
            reasonInput.style.borderColor = 'var(--error, #d32f2f)';
            reasonInput.placeholder = 'Campo requerido - explica por qué necesitas permisos';
            return;
        }
        
        const submitBtn = document.getElementById('submitPermissionBtn');
        if (!submitBtn) return;
        
        // Mostrar loader siguiendo estándar UI Reversa
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="btn-spinner"></div>';
        
        // Enviar solicitud al backend
        fetch('/api/permisos/solicitar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                section: section,
                reason: reason
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Estado de éxito con tick
                submitBtn.classList.remove('btn-filled');
                submitBtn.classList.add('success');
                submitBtn.innerHTML = '<i class="fas fa-check"></i> Enviado';
                
                // Refrescar dropdown de permisos después del envío exitoso
                if (typeof refreshPermissionDropdown === 'function') {
                    refreshPermissionDropdown();
                }
                
                // Esperar 1.5s y cerrar modal
                setTimeout(() => {
                    window.closePermissionModal();
                }, 1500);
            } else {
                throw new Error(data.error || 'Error desconocido');
            }
        })
        .catch(error => {
            console.error('Error enviando solicitud:', error);
            
            // Restaurar botón en caso de error
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            
            // Mostrar error en el input
            reasonInput.style.borderColor = 'var(--error, #d32f2f)';
            reasonInput.value = '';
            reasonInput.placeholder = 'Error al enviar - inténtalo de nuevo';
            reasonInput.focus();
        });
    };
    
    // Interfaz pública
    return {
        getUserContext,
        getEtiquetasPersonalizadas,
        updateEtiquetasPersonalizadas,
        lockForEdit,
        unlockForEdit,
        showEmpresaContextUI,
        handleVersionConflict,
        getCoberturaLegal,
        updateCoberturaLegal,
        getContextData,
        updateContextData,
        setupReadonlyButtons, // Expose the new function
        showPermissionModal, // Expose the new function
        refreshPermissionDropdown, // Export new function to refresh dropdown
        // Expose currentContext for debugging and guards
        get currentContext() { return currentContext; }
    };
    
    // Function to refresh permission dropdown in configuration
    async function refreshPermissionDropdown() {
        try {
            if (typeof window.loadPermissionDropdownContent === 'function') {
                const dropdown = document.getElementById('permission-dropdown');
                if (dropdown) {
                    await window.loadPermissionDropdownContent(dropdown);
                }
            }
        } catch (error) {
            console.error('Error refreshing permission dropdown:', error);
        }
    }
})(); 