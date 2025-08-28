/**
 * Panel de Administración - Reversa
 * Gestión de solicitudes de permisos y usuarios empresa
 */

// Prevent duplicate class declaration
if (typeof window.AdminPanel !== 'undefined') {
    console.log('AdminPanel already defined, skipping redefinition');
} else {

window.AdminPanel = class AdminPanel {
    constructor() {
        this.solicitudes = [];
        this.usuarios = [];
        this.currentEmpresa = '';
        
        this.init();
    }

    async init() {
        try {
            console.log('Initializing admin panel...');
            
            // Debug: Test basic connectivity first
            try {
                const debugResponse = await fetch('/api/permisos/debug');
                console.log('Debug endpoint status:', debugResponse.status);
                if (debugResponse.ok) {
                    const debugData = await debugResponse.json();
                    console.log('Debug data:', debugData);
                }
            } catch (debugError) {
                console.warn('Debug endpoint failed:', debugError);
            }
            
            // Cargar información de contexto y empresa
            const contextOk = await this.loadContextInfo();
            if (!contextOk) {
                console.warn('Context not OK, aborting data load');
                return;
            }
            
            // Cargar datos iniciales con reintentos
            await this.loadDataWithRetry();
            
        } catch (error) {
            console.error('Error inicializando panel admin:', error);
            this.showNotification('Error cargando panel de administración', 'error');
        }
    }

    async loadDataWithRetry(maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Loading data, attempt ${attempt}/${maxRetries}`);
                
                // Cargar ambos conjuntos de datos
                await Promise.all([
                    this.loadSolicitudes(),
                    this.loadUsuarios()
                ]);
                
                console.log('Data loaded successfully');
                return; // Success, exit retry loop
                
            } catch (error) {
                console.error(`Attempt ${attempt} failed:`, error);
                
                if (attempt === maxRetries) {
                    // Last attempt failed
                    this.showNotification('Error cargando datos. Verifique su conexión.', 'error');
                    this.renderSolicitudesError('Error de conexión. Haga clic para reintentar.');
                    this.renderUsuariosError('Error de conexión. Haga clic para reintentar.');
                } else {
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }
    }

    // NEW: refresh method to re-fetch and render when instance already exists
    async refresh() {
        try {
            console.log('Refreshing admin panel data...');
            console.log('About to call loadContextInfo...');
            const contextOk = await this.loadContextInfo();
            console.log('loadContextInfo returned:', contextOk);
            if (!contextOk) {
                console.warn('Context not OK, aborting refresh');
                return;
            }
            console.log('About to call loadDataWithRetry...');
            await this.loadDataWithRetry();
            console.log('loadDataWithRetry completed successfully');
        } catch (error) {
            console.error('Error refreshing admin panel:', error);
        }
    }

    async loadContextInfo() {
        try {
            console.log('Loading context info...');
            const response = await fetch('/api/user-context');
            
            console.log('Context response status:', response.status);
            console.log('Context response ok:', response.ok);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Context request failed:', response.status, response.statusText, errorText);
                
                // Check if it's an authentication issue
                if (response.status === 401) {
                    console.error('Authentication failed - user not logged in');
                    this.renderSolicitudesError('Sesión expirada. Por favor, recarga la página.');
                    this.renderUsuariosError('Sesión expirada. Por favor, recarga la página.');
                } else {
                    this.renderSolicitudesError('No se pudo cargar el contexto de usuario');
                    this.renderUsuariosError('No se pudo cargar el contexto de usuario');
                }
                return false;
            }
            
            const data = await response.json();
            console.log('Context response:', data);
            
            if (data.success && data.context) {
                this.currentEmpresa = data.context.empresa || '';
                console.log('Current empresa:', this.currentEmpresa);
                
                // Verificar permisos de administrador
                if (data.context.tipo_cuenta !== 'empresa' || !data.context.is_admin) {
                    console.error('User is not an empresa admin:', data.context);
                    this.renderSolicitudesError('Solo los administradores de empresa pueden ver las solicitudes.');
                    this.renderUsuariosError('Solo los administradores de empresa pueden ver los usuarios.');
                    return false;
                }
                
                // Actualizar badge de empresa
                const empresaBadge = document.getElementById('empresaBadge');
                if (empresaBadge && this.currentEmpresa) {
                    // Formatear empresa: primera parte antes del punto, primera letra mayúscula
                    const formattedEmpresa = this.formatEmpresaName(this.currentEmpresa);
                    empresaBadge.textContent = formattedEmpresa;
                    console.log('Updated empresa badge:', formattedEmpresa);
                }
                return true;
            } else {
                console.error('Invalid context response:', data);
                this.renderSolicitudesError('No se pudo cargar el contexto del usuario');
                this.renderUsuariosError('No se pudo cargar el contexto del usuario');
                return false;
            }
        } catch (error) {
            console.error('Error cargando contexto:', error);
            this.showNotification('Error cargando contexto de usuario: ' + error.message, 'error');
            this.renderSolicitudesError('Error de conexión. Verifica tu conexión a internet.');
            this.renderUsuariosError('Error de conexión. Verifica tu conexión a internet.');
            return false;
        }
    }

    async loadSolicitudes() {
        try {
            console.log('Loading solicitudes...');
            const response = await fetch('/api/permisos/solicitudes');
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Solicitudes request failed:', response.status, response.statusText, errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }
            
            const data = await response.json();
            console.log('Solicitudes response:', data);
            
            if (data.success) {
                this.solicitudes = data.solicitudes || [];
                console.log('Loaded solicitudes:', this.solicitudes.length);
                this.renderSolicitudes();
            } else {
                console.error('Solicitudes request unsuccessful:', data);
                throw new Error(data.error || 'Error cargando solicitudes');
            }
        } catch (error) {
            console.error('Error cargando solicitudes:', error);
            this.renderSolicitudesError('Error cargando solicitudes: ' + error.message);
        }
    }

    async loadUsuarios() {
        try {
            console.log('Loading usuarios...');
            const response = await fetch('/api/permisos/usuarios');
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Usuarios request failed:', response.status, response.statusText, errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }
            
            const data = await response.json();
            console.log('Usuarios response:', data);
            
            if (data.success) {
                this.usuarios = data.usuarios || [];
                console.log('Loaded usuarios:', this.usuarios.length);
                this.renderUsuarios();
            } else {
                console.error('Usuarios request unsuccessful:', data);
                throw new Error(data.error || 'Error cargando usuarios');
            }
        } catch (error) {
            console.error('Error cargando usuarios:', error);
            this.renderUsuariosError('Error cargando usuarios: ' + error.message);
        }
    }

    renderSolicitudes() {
        const container = document.getElementById('solicitudesContainer');
        console.log('renderSolicitudes: container exists?', !!container, 'solicitudes length:', Array.isArray(this.solicitudes) ? this.solicitudes.length : 'not-array');
        
        if (!container) {
            console.error('renderSolicitudes: container not found');
            return;
        }
        
        if (!Array.isArray(this.solicitudes)) {
            console.error('renderSolicitudes: solicitudes is not an array', this.solicitudes);
            this.solicitudes = [];
        }
        
        if (this.solicitudes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    No hay solicitudes pendientes
                </div>
            `;
            return;
        }

        const html = this.solicitudes.map(solicitud => this.createSolicitudBox(solicitud)).join('');
        container.innerHTML = html;
    }

    renderSolicitudesError(message) {
        const container = document.getElementById('solicitudesContainer');
        container.innerHTML = `
            <div class="empty-state" style="color: #dc3545;">
                ${message}
                <br><br>
                <button onclick="adminPanel.loadSolicitudes()" style="background: var(--reversa-blue); color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer;">
                    Reintentar
                </button>
            </div>
        `;
    }

    renderUsuarios() {
        const container = document.getElementById('usuariosContainer');
        console.log('renderUsuarios: container exists?', !!container, 'usuarios length:', Array.isArray(this.usuarios) ? this.usuarios.length : 'not-array');
        
        if (!container) {
            console.error('renderUsuarios: container not found');
            return;
        }
        
        if (!Array.isArray(this.usuarios)) {
            console.error('renderUsuarios: usuarios is not an array', this.usuarios);
            this.usuarios = [];
        }
        
        if (this.usuarios.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    No hay usuarios en esta empresa
                </div>
            `;
            return;
        }

        // Ordenar usuarios por tipo de permiso: admin > edición > lectura
        const usuariosOrdenados = [...this.usuarios].sort((a, b) => {
            const permisoOrder = { 'admin': 3, 'edicion': 2, 'lectura': 1 };
            const permisoA = (a.permiso || 'lectura').toString().toLowerCase();
            const permisoB = (b.permiso || 'lectura').toString().toLowerCase();
            return (permisoOrder[permisoB] || 0) - (permisoOrder[permisoA] || 0);
        });

        const html = usuariosOrdenados.map(usuario => this.createUsuarioBox(usuario)).join('');
        container.innerHTML = html;

        // Actualizar contador de usuarios
        this.updateUsuariosCounter();
    }

    renderUsuariosError(message) {
        const container = document.getElementById('usuariosContainer');
        container.innerHTML = `
            <div class="empty-state" style="color: #dc3545;">
                ${message}
                <br><br>
                <button onclick="adminPanel.loadUsuarios()" style="background: var(--reversa-blue); color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer;">
                    Reintentar
                </button>
            </div>
        `;
    }

    createSolicitudBox(solicitud) {
        const fecha = new Date(solicitud.fecha_solicitud);
        const fechaFormatted = fecha.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Determinar el tipo de cambio basado en el permiso actual del usuario
        const currentUser = this.usuarios.find(u => String(u._id) === String(solicitud.user_id));
        const currentPermission = currentUser ? currentUser.permiso : 'lectura';
        
        let targetPermission = 'edicion';
        if (currentPermission === 'edicion') {
            targetPermission = 'admin';
        }

        // Sección de comentario solo si existe
        const comentarioSection = solicitud.reason && solicitud.reason.trim() 
            ? `
                <div class="request-comment-section">
                    <div class="request-comment-subtitle">Comentario sobre la solicitud:</div>
                    <div class="request-comment-content">${this.escapeHtml(solicitud.reason)}</div>
                </div>
            `
            : '';

        return `
            <div class="request-box" data-request-id="${solicitud.user_id}">
                <div class="request-header">
                    <div class="request-user">${this.escapeHtml(solicitud.user_email)}</div>
                    <div class="request-date">${fechaFormatted}</div>
                </div>
                
                <div class="request-permission-section">
                    <div class="request-permission-subtitle">Permiso solicitado:</div>
                    <div class="request-permission-banners">
                        <span class="permission-banner current">${this.capitalizePermission(currentPermission)}</span>
                        <i class="fas fa-arrow-right permission-arrow"></i>
                        <span class="permission-banner target">${this.capitalizePermission(targetPermission)}</span>
                    </div>
                </div>
                
                ${comentarioSection}
                
                <div class="request-actions">
                    <button class="btn-reject" onclick="adminPanel.rechazarSolicitud('${solicitud.user_id}')">
                        <i class="fas fa-times"></i> Rechazar
                    </button>
                    <button class="btn-approve" onclick="adminPanel.aprobarSolicitud('${solicitud.user_id}')">
                        <i class="fas fa-check"></i> Aceptar
                    </button>
                </div>
            </div>
        `;
    }

    capitalizePermission(permission) {
        const permissionMap = {
            'lectura': 'Lectura',
            'edicion': 'Edición',
            'admin': 'Admin'
        };
        return permissionMap[permission] || permission;
    }

    createUsuarioBox(usuario) {
        // Normalize permission to lowercase for consistent comparison
        const permisoNormalized = (usuario.permiso || 'lectura').toString().toLowerCase();
        const permisoClass = permisoNormalized;
        const permisoDisplay = this.getPermisoDisplay(permisoNormalized);
        const isMainAdmin = usuario.admin_empresa_id === usuario._id;
        const isAdmin = permisoNormalized === 'admin';
        
        // Create dropdown HTML based on admin status
        let dropdownHtml;
        if (isMainAdmin) {
            // Main admin - no dropdown icon, always shows Admin 
            dropdownHtml = `
                <div class="permission-badge admin-principal">
                    <i class="fas fa-user-shield"></i>
                    <span>Admin</span>
                </div>
            `;
        } else if (isAdmin) {
            // Regular admin - no dropdown icon, solid gradient
            dropdownHtml = `
                <div class="permission-badge admin-regular">
                    <i class="fas fa-user-cog"></i>
                    <span>Admin</span>
                </div>
            `;
        } else {
            // Regular user (lectura/edicion) - fully functional dropdown with icon
            dropdownHtml = `
                <select class="permission-dropdown ${permisoClass}" 
                        onchange="adminPanel.changePermission('${usuario._id}', this.value)">
                    <option value="lectura" ${permisoNormalized === 'lectura' ? 'selected' : ''}>Lectura</option>
                    <option value="edicion" ${permisoNormalized === 'edicion' ? 'selected' : ''}>Edición</option>
                    <option value="admin" ${permisoNormalized === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
            `;
        }
        
        return `
            <div class="user-box" data-user-id="${usuario._id}">
                <div class="user-info">
                    <i class="fas fa-user user-icon"></i>
                    <div class="user-details">
                        <div class="user-name">${this.escapeHtml(usuario.email)}</div>
                        <div class="user-email">
                            ${isMainAdmin ? '(Admin Principal)' : ''}
                        </div>
                    </div>
                </div>
                <div class="permission-control">
                    ${dropdownHtml}
                </div>
            </div>
        `;
    }

    getPermisoDisplay(permiso) {
        const permisos = {
            'admin': 'Admin',
            'edicion': 'Edición',
            'lectura': 'Lectura'
        };
        return permisos[permiso] || permiso;
    }

    async aprobarSolicitud(userId) {
        try {
            const button = event.target;
            this.setButtonLoading(button, true);

            const response = await fetch('/api/permisos/aprobar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ user_id: userId })
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('Solicitud aprobada correctamente', 'success');
                await this.loadSolicitudes(); // Recargar solicitudes
                await this.loadUsuarios(); // Recargar usuarios para reflejar cambios
                
                // Actualizar contador de notificaciones en sidebar
                if (typeof window.updateAdminNotificationCount === 'function') {
                    window.updateAdminNotificationCount();
                }
                
                // Actualizar permission-control del usuario correspondiente en tiempo real
                this.updateUserPermissionControl(userId, 'edicion');
            } else {
                throw new Error(data.error || 'Error aprobando solicitud');
            }

        } catch (error) {
            console.error('Error aprobando solicitud:', error);
            this.showNotification('Error aprobando solicitud', 'error');
        } finally {
            const button = event.target;
            this.setButtonLoading(button, false);
        }
    }

    async rechazarSolicitud(userId) {
        try {
            const button = event.target;
            this.setButtonLoading(button, true);

            const response = await fetch('/api/permisos/rechazar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ user_id: userId })
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('Solicitud rechazada', 'success');
                await this.loadSolicitudes(); // Recargar solicitudes
                
                // Actualizar contador de notificaciones en sidebar
                if (typeof window.updateAdminNotificationCount === 'function') {
                    window.updateAdminNotificationCount();
                }
            } else {
                throw new Error(data.error || 'Error rechazando solicitud');
            }

        } catch (error) {
            console.error('Error rechazando solicitud:', error);
            this.showNotification('Error rechazando solicitud', 'error');
        } finally {
            const button = event.target;
            this.setButtonLoading(button, false);
        }
    }

    async changePermission(userId, newPermission) {
        try {
            const dropdown = event.target;
            const originalValue = dropdown.dataset.original || dropdown.value;
            
            // Guardar valor original
            dropdown.dataset.original = originalValue;
            
            // Deshabilitar dropdown durante la actualización
            dropdown.disabled = true;

            const response = await fetch('/api/permisos/cambiar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    user_id: userId, 
                    new_permission: newPermission 
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('Permiso actualizado correctamente', 'success');
                
                // Actualizar clases CSS del dropdown
                dropdown.className = `permission-dropdown ${newPermission}`;
                dropdown.dataset.original = newPermission;
                
            } else {
                // Revertir al valor anterior si hay error
                dropdown.value = originalValue;
                throw new Error(data.error || 'Error cambiando permiso');
            }

        } catch (error) {
            console.error('Error cambiando permiso:', error);
            this.showNotification('Error cambiando permiso', 'error');
            
            // Revertir dropdown al valor original
            const dropdown = event.target;
            dropdown.value = dropdown.dataset.original || 'lectura';
            
        } finally {
            // Rehabilitar dropdown
            const dropdown = event.target;
            dropdown.disabled = false;
        }
    }

    setButtonLoading(button, isLoading) {
        if (isLoading) {
            button.classList.add('btn-loading');
            button.innerHTML = '<div class="loading-spinner"></div> Procesando...';
        } else {
            button.classList.remove('btn-loading');
            // Restaurar texto original basado en la clase
            if (button.classList.contains('btn-approve')) {
                button.innerHTML = '✓ Aprobar';
            } else if (button.classList.contains('btn-reject')) {
                button.innerHTML = '✗ Rechazar';
            }
        }
    }

    showNotification(message, type = 'success') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        
        // Mostrar notificación
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // Ocultar después de 3 segundos
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatEmpresaName(empresa) {
        if (!empresa) return '';
        
        // Obtener la parte antes del punto
        const baseName = empresa.split('.')[0];
        
        // Capitalizar primera letra
        return baseName.charAt(0).toUpperCase() + baseName.slice(1).toLowerCase();
    }

    updateUsuariosCounter() {
        const counterElement = document.getElementById('usuariosCounter');
        if (counterElement && Array.isArray(this.usuarios)) {
            counterElement.textContent = `Total usuarios: ${this.usuarios.length}`;
        }
    }

    updateUserPermissionControl(userId, newPermission) {
        // Encontrar y actualizar el dropdown del usuario en la UI
        const userBox = document.querySelector(`[data-user-id="${userId}"]`);
        if (userBox) {
            const dropdown = userBox.querySelector('.permission-dropdown');
            if (dropdown) {
                // Actualizar el valor y las clases del dropdown
                dropdown.value = newPermission;
                dropdown.className = `permission-dropdown ${newPermission}`;
                dropdown.dataset.original = newPermission;
            }
        }
        
        // También actualizar en la lista interna de usuarios
        const userIndex = this.usuarios.findIndex(u => String(u._id) === String(userId));
        if (userIndex !== -1) {
            this.usuarios[userIndex].permiso = newPermission;
        }
    }
}; // End of AdminPanel class

} // End of if block

// Emergency force reload function - can be called from console
window.forceReloadAdminPanel = function() {
    console.log('=== FORCE RELOAD ADMIN PANEL ===');
    
    // Clear everything
    if (window.adminPanel) {
        console.log('Clearing adminPanel instance...');
        delete window.adminPanel;
    }
    if (window.AdminPanel) {
        console.log('Clearing AdminPanel class...');
        delete window.AdminPanel;
    }
    if (window.initializeAdminPanel) {
        console.log('Clearing initializeAdminPanel function...');
        delete window.initializeAdminPanel;
    }
    
    // Remove script tags
    const scripts = document.querySelectorAll('script[src*="admin.js"]');
    scripts.forEach(script => {
        console.log('Removing script tag:', script.src);
        script.remove();
    });
    
    // Load fresh script
    const script = document.createElement('script');
    script.src = '/views/administracion/admin.js?force=' + Date.now();
    script.onload = () => {
        console.log('Fresh admin script loaded');
        setTimeout(() => {
            if (window.initializeAdminPanel) {
                console.log('Calling fresh initializeAdminPanel...');
                window.initializeAdminPanel();
            } else {
                console.error('initializeAdminPanel not found in fresh script');
            }
        }, 100);
    };
    script.onerror = () => {
        console.error('Failed to load fresh admin script');
    };
    document.head.appendChild(script);
};

// Función de inicialización global
window.initializeAdminPanel = function() {
    console.log('Initializing AdminPanel...');
    
    if (window.adminPanel) {
        console.log('AdminPanel already initialized');
        // Debug: check what methods are available
        console.log('Available methods on adminPanel:', Object.getOwnPropertyNames(window.adminPanel));
        console.log('adminPanel prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(window.adminPanel)));
        
        // Force recreate if methods are missing
        if (typeof window.adminPanel.refresh !== 'function' && typeof window.adminPanel.loadDataWithRetry !== 'function') {
            console.warn('AdminPanel instance missing required methods, recreating...');
            window.adminPanel = null; // Clear the old instance
        } else {
            // Ensure data is fetched and new DOM is rendered even if instance exists
            try {
                console.log('Calling refresh on existing AdminPanel instance...');
                if (typeof window.adminPanel.refresh === 'function') {
                    window.adminPanel.refresh();
                    console.log('Refresh method called successfully');
                } else if (typeof window.adminPanel.loadDataWithRetry === 'function') {
                    console.log('Refresh method not found, calling loadDataWithRetry...');
                    window.adminPanel.loadDataWithRetry();
                } else {
                    console.error('Neither refresh nor loadDataWithRetry methods found on AdminPanel instance');
                }
            } catch (e) {
                console.error('Error refreshing existing AdminPanel instance:', e);
            }
            return window.adminPanel;
        }
    }
    
    if (window.AdminPanel) {
        try {
            console.log('Creating new AdminPanel instance...');
            window.adminPanel = new window.AdminPanel();
            console.log('AdminPanel initialized successfully');
            // Verify methods are available
            console.log('New instance has refresh:', typeof window.adminPanel.refresh === 'function');
            console.log('New instance has loadDataWithRetry:', typeof window.adminPanel.loadDataWithRetry === 'function');
            return window.adminPanel;
        } catch (error) {
            console.error('Error initializing AdminPanel:', error);
            return null;
        }
    } else {
        console.error('AdminPanel class not available');
        return null;
    }
}

// Global error handlers for debugging
window.addEventListener('error', (event) => {
    console.error('[Global Error] message:', event.message, 'filename:', event.filename, 'lineno:', event.lineno, 'colno:', event.colno, 'error:', event.error);
});
window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Rejection] reason:', event.reason);
});

// Auto-initialize if DOM is ready and we're not already initialized
if (document.readyState !== 'loading' && !window.adminPanel) {
    setTimeout(() => {
        window.initializeAdminPanel();
    }, 50);
} 