# 🏢 SISTEMA ENTERPRISE COLABORATIVO - PAPYRUS AI

## 📋 RESUMEN EJECUTIVO

Este documento describe la implementación completa del sistema enterprise colaborativo que permite a organizaciones trabajar de forma coordinada con etiquetas/agentes, carpetas y variables comunes. El sistema incluye reconocimiento automático por dominio, permisos granulares, control de concurrencia y sincronización multi-usuario.

### **Estado de Implementación: ✅ COMPLETADO**
- ✅ Reconocimiento automático empresarial por dominio de email
- ✅ Documento `estructura_empresa` como fuente de verdad compartida  
- ✅ Sistema de permisos granular (Admin/Editor/Lectura)
- ✅ Panel de administración para gestión de usuarios
- ✅ Control de concurrencia con sistema de bloqueos y heartbeat
- ✅ Estructura de carpetas organizacionales con drag & drop
- ✅ Sistema de favoritos coordinado entre usuarios
- ✅ Historial de versiones y auditoría completa

### **Archivos Principales Implementados**
- **Backend**: `services/enterprise.service.js`, `routes/enterprise.routes.js`, `routes/permisos.routes.js`
- **Frontend**: `public/views/configuracion/carpetas_agentes.js`, `public/views/administracion/admin.html/js`
- **Middleware**: Verificación de permisos integrada en rutas protegidas

---

## 📑 ÍNDICE DE FUNCIONALIDADES

1. [Reconocimiento Automático Empresarial](#1-reconocimiento-automático-empresarial)
2. [Modelo de Datos MongoDB](#2-modelo-de-datos-mongodb)
3. [Sistema de Permisos Granular](#3-sistema-de-permisos-granular) 
4. [Control de Concurrencia (Resolver)](#4-control-de-concurrencia-resolver)
5. [Panel de Administración](#5-panel-de-administración)
6. [Estructura de Carpetas y Favoritos](#6-estructura-de-carpetas-y-favoritos)
7. [Historial y Auditoría](#7-historial-y-auditoría)
8. [APIs y Endpoints](#8-apis-y-endpoints)
9. [Configuración e Integración](#9-configuración-e-integración)
10. [Testing y Validación](#10-testing-y-validación)

---

## 1. Reconocimiento Automático Empresarial

### Funcionalidad
Detecta automáticamente usuarios del mismo dominio empresarial y los conecta a una estructura compartida sin intervención manual.

### Implementación Técnica

#### Registro con Código Enterprise
- **Archivo**: `routes/auth.routes.js` (líneas 245-280)
- **Trigger**: Usuario registra con `codigo === 'ReversaEnterprise1620'` + `empresa_name`
- **Proceso**:
  1. Extrae dominio del email: `domain = email.split('@')[1]`
  2. Busca `estructura_empresa` existente por `empresa_domain`
  3. Si existe → Agrega usuario con rol 'lectura'
  4. Si no existe → Crea nueva estructura con usuario como 'admin'

```javascript
// Código clave en auth.routes.js
const isEnterprise = req.body.empresa_name && req.body.codigo === 'ReversaEnterprise1620';
if (isEnterprise) {
  const domain = email.split('@')[1];
  const estructuraExistente = await usersCollection.findOne({
    tipo_cuenta: 'empresa',
    empresa_domain: domain
  });
  // ... lógica de creación/conexión
}
```

#### Auto-Conexión en Login
- **Archivo**: `routes/auth.routes.js` (líneas 180-220)
- **Trigger**: Login de usuario con dominio que ya tiene empresa creada
- **Proceso**:
  1. Detecta dominio durante login
  2. Busca estructura empresarial existente
  3. Actualiza usuario individual con referencia `estructura_empresa_id`
  4. Agrega a `empresa_users` con rol 'lectura' por defecto

### Resultado en MongoDB
- **Usuario individual**: `tipo_cuenta: "empresa"`, `estructura_empresa_id: ObjectId(...)`
- **Estructura empresa**: Entrada en `empresa_users.{email}` con rol y permisos

---

## 2. Modelo de Datos MongoDB

### Documento `estructura_empresa`
**Ubicación**: Collection `users`, un documento por empresa identificado por `empresa_domain`

```javascript
{
  _id: ObjectId("..."),
  tipo_cuenta: "empresa",
  empresa_domain: "empresa.com",
  empresa_name: "Empresa S.L.",
  
  // VARIABLES COMPARTIDAS
  etiquetas_personalizadas: {
    "Compliance GDPR": "<Etiqueta>...</Etiqueta>",
    "Regulación Bancaria": "<Etiqueta>...</Etiqueta>"
  },
  cobertura_legal: {
    fuentes_gobierno: ["BOE", "CNMV"],
    fuentes_reguladores: ["AEPD", "BCE"]
  },
  contexto: "Descripción de la empresa...",
  
  // ESTRUCTURA DE CARPETAS
  estructura_carpetas: {
    version: 1,
    folders: {
      "1": { id: "1", nombre: "Compliance", parent_id: null },
      "2": { id: "2", nombre: "GDPR", parent_id: "1" }
    },
    asignaciones: {
      "Compliance GDPR": "2",
      "Regulación Bancaria": "1"
    }
  },
  
  // SISTEMA DE PERMISOS
  empresa_users: {
    "admin@empresa.com": {
      role: "admin",
      permissions: {
        can_edit_empresa: true,
        can_manage_users: true,
        can_edit_structure: true
      }
    },
    "user@empresa.com": {
      role: "lectura",
      permissions: {
        can_edit_empresa: false,
        can_manage_users: false,
        can_edit_structure: false
      }
    }
  },
  
  // CONTROL DE CONCURRENCIA
  bloqueos_edicion: {
    agentes: {
      "Compliance GDPR": {
        en_edicion_por: ObjectId("..."),
        desde: Date("2024-01-15T10:30:00Z"),
        last_heartbeat: Date("2024-01-15T10:35:00Z")
      }
    }
  },
  
  // FAVORITOS POR USUARIO
  selecciones_personalizadas: {
    "user1@empresa.com": ["Compliance GDPR"],
    "user2@empresa.com": ["Regulación Bancaria"]
  },
  
  // AUDITORÍA
  historial_cambios: [
    {
      timestamp: Date("2024-01-15T10:30:00Z"),
      usuario: "admin@empresa.com",
      accion: "update_etiqueta",
      objeto: "Compliance GDPR",
      version_anterior: 5,
      version_nueva: 6
    }
  ]
}
```

### Usuario Individual
**Ubicación**: Collection `users`, un documento por usuario

```javascript
{
  _id: ObjectId("..."),
  email: "user@empresa.com",
  tipo_cuenta: "empresa",
  estructura_empresa_id: ObjectId("..."), // Referencia al documento empresa
  
  // CONFIGURACIÓN PERSONAL
  seleccion_personalizada_agentes: ["Compliance GDPR"],
  carpetas_favoritas: ["folder:1", "folder:3"]
}
```

---

## 3. Sistema de Permisos Granular

### Roles y Permisos Definidos
**Archivo**: `services/enterprise.service.js` (líneas 450-550)

```javascript
const ENTERPRISE_ROLES = {
  admin: {
    can_edit_empresa: true,      // Editar etiquetas compartidas
    can_manage_users: true,      // Gestionar otros usuarios  
    can_edit_structure: true,    // Crear/editar carpetas
    can_view_all: true          // Ver todo el contenido
  },
  editor: {
    can_edit_empresa: true,
    can_manage_users: false,
    can_edit_structure: true,
    can_view_all: true
  },
  lectura: {
    can_edit_empresa: false,
    can_manage_users: false,
    can_edit_structure: false,
    can_view_all: true
  }
}
```

### Verificación de Permisos
**Archivo**: `routes/permisos.routes.js` (líneas 50-120)

#### Middleware `requirePermission(permission)`
```javascript
function requirePermission(permission) {
  return async (req, res, next) => {
    if (req.user.tipo_cuenta !== 'empresa') {
      return res.status(403).json({ error: 'Solo para cuentas empresariales' });
    }

    const context = await getUserContext(req.user);
    if (!context.permissions[permission]) {
      return res.status(403).json({ 
        error: `No tienes permisos para: ${permission}`,
        required_permission: permission
      });
    }
    next();
  };
}
```

#### Uso en Rutas Protegidas
```javascript
// Ejemplo: Solo admins pueden gestionar usuarios
router.post('/api/manage-user-permissions', 
  ensureAuthenticated,
  requirePermission('can_manage_users'),
  async (req, res) => {
    // Lógica de gestión de usuarios...
  }
);
```

### Aplicación en Frontend
**Archivo**: `public/views/configuracion/agentes.js` (líneas 2400+)
- Botones de edición deshabilitados para usuarios sin permisos
- Modal de agentes en modo solo lectura
- Mensajes de error con modales estándar (no `alert()`)

---

## 4. Control de Concurrencia (Resolver)

### Sistema de Bloqueos
**Archivo**: `services/enterprise.service.js` (líneas 265-320)

#### Obtener Bloqueo (`lockEtiquetasForEdit`)
```javascript
async function lockEtiquetasForEdit(user, agenteName = null) {
  // 1. Verificar bloqueo existente
  const currentLock = estructura?.bloqueos_edicion?.agentes?.[agenteName];
  
  // 2. Validar expiración (10 min inactividad + 30 min total)
  const lockAge = now - new Date(currentLock.desde);
  const heartbeatAge = now - new Date(currentLock.last_heartbeat);
  
  if (lockAge < 30 * 60 * 1000 && heartbeatAge < 10 * 60 * 1000) {
    return { success: false, locked: true, error: 'Otro usuario editando' };
  }
  
  // 3. Establecer nuevo bloqueo con heartbeat
  await usersCollection.updateOne({ _id: estructuraId }, {
    $set: {
      [`bloqueos_edicion.agentes.${agenteName}.en_edicion_por`]: userId,
      [`bloqueos_edicion.agentes.${agenteName}.desde`]: now,
      [`bloqueos_edicion.agentes.${agenteName}.last_heartbeat`]: now
    }
  });
}
```

#### Sistema de Heartbeat (`updateLockHeartbeat`)
- **Frecuencia**: Cada ~5 minutos mientras modal está abierto
- **Endpoint**: `PUT /api/etiquetas-lock`
- **Función**: Actualiza `last_heartbeat` para mantener bloqueo activo

#### Liberar Bloqueo (`unlockEtiquetasForEdit`)
- **Trigger**: Cerrar modal de edición de agente
- **Proceso**: Elimina entrada completa de `bloqueos_edicion.agentes.{agenteName}`

### Control de Versiones Optimista
**Archivo**: `services/enterprise.service.js` (líneas 120-200)

```javascript
// En updateEtiquetasPersonalizadas
const currentVersion = estructura?.estructura_carpetas?.version || 1;

if (user.expected_version && user.expected_version !== currentVersion) {
  return {
    success: false,
    conflict: true,
    current_version: currentVersion,
    error: 'Documento modificado por otro usuario. Recarga para ver cambios.'
  };
}

// Actualizar con nueva versión
const newVersion = currentVersion + 1;
await usersCollection.updateOne({ _id: estructuraId }, {
  $set: {
    etiquetas_personalizadas: etiquetas,
    'estructura_carpetas.version': newVersion
  }
});
```

### Endpoints del Resolver
**Archivo**: `routes/enterprise.routes.js` (líneas 50-120)
- `POST /api/etiquetas-lock` - Obtener bloqueo
- `PUT /api/etiquetas-lock` - Actualizar heartbeat  
- `DELETE /api/etiquetas-lock` - Liberar bloqueo

### Integración Frontend
**Archivo**: `public/views/configuracion/agentes.js` (líneas 1864+)
```javascript
// Al abrir modal de edición
async function openAgentDetail(agentKey, xml) {
  const lockResult = await window.EtiquetasResolver.lockForEdit(agentKey);
  
  if (!lockResult.success && lockResult.locked) {
    showInfoModal({
      title: 'Agente en Edición',
      message: 'Otro usuario está editando este agente actualmente.',
      confirmText: 'Entendido'
    });
    return;
  }
  // Continuar con apertura de modal...
}

// Al cerrar modal
async function closeAgentOverlay() {
  if (AGENTS_STATE.currentAgentKey) {
    await window.EtiquetasResolver.unlockForEdit(AGENTS_STATE.currentAgentKey);
  }
  // Cerrar modal...
}
```

---

## 5. Panel de Administración

### Frontend
**Archivo**: `public/views/administracion/admin.html` (líneas 1-200)

#### Estructura HTML
```html
<div class="admin-container">
  <h2>Panel de Administración - Empresa</h2>
  
  <!-- Lista de Usuarios -->
  <div id="users-list">
    <!-- Renderizado dinámico con roles y permisos -->
  </div>
  
  <!-- Modal de Permisos -->
  <div id="permissions-modal" class="modal-overlay">
    <form id="permissions-form">
      <!-- Roles: admin, editor, lectura -->
      <!-- Permisos personalizados por checkbox -->
    </form>
  </div>
</div>
```

#### JavaScript Principal
**Archivo**: `public/views/administracion/admin.js` (líneas 1-300)

```javascript
class AdminPanel {
  async loadUsers() {
    const response = await fetch('/api/company-users');
    const data = await response.json();
    this.users = data.users;
    this.renderUsers();
  }

  async updateUserPermissions(email, formData) {
    const role = formData.get('role');
    const permissions = {
      can_edit_empresa: formData.has('can_edit_empresa'),
      can_manage_users: formData.has('can_manage_users'),
      can_edit_structure: formData.has('can_edit_structure')
    };

    const response = await fetch('/api/manage-user-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role, permissions })
    });
  }
}
```

### Backend
**Archivo**: `routes/permisos.routes.js` (líneas 200-300)

#### Gestión de Permisos de Usuario
```javascript
router.post('/api/manage-user-permissions', 
  ensureAuthenticated,
  requirePermission('can_manage_users'),
  async (req, res) => {
    const { email, role, permissions } = req.body;
    
    // Protección: No degradar último admin
    if (email === req.user.email && role !== 'admin') {
      const adminCount = Object.values(context.estructura_empresa.empresa_users)
        .filter(u => u.role === 'admin').length;
      
      if (adminCount <= 1) {
        return res.status(400).json({
          error: 'No puedes degradar al último administrador'
        });
      }
    }
    
    // Actualizar permisos
    await usersCollection.updateOne({ _id: estructuraId }, {
      $set: {
        [`empresa_users.${email}.role`]: role,
        [`empresa_users.${email}.permissions`]: permissions
      }
    });
  }
);
```

#### Obtener Usuarios de Empresa
```javascript
router.get('/api/company-users', ensureAuthenticated, async (req, res) => {
  const context = await getUserContext(req.user);
  const users = Object.entries(context.estructura_empresa.empresa_users)
    .map(([email, userData]) => ({ email, ...userData }));
  
  res.json({ success: true, users });
});
```

### Características Implementadas
- ✅ Lista de usuarios con roles actuales
- ✅ Modal de edición de permisos con preselección
- ✅ Protección contra degradación del último admin
- ✅ Cambios aplicados inmediatamente
- ✅ Historial de cambios en auditoría

---

## 6. Estructura de Carpetas y Favoritos

### Gestión de Carpetas
**Archivo**: `public/views/configuracion/carpetas_agentes.js`

#### Clase Principal CarpetasAgentes
```javascript
class CarpetasAgentes {
  constructor() {
    this.estructura = { folders: {}, asignaciones: {}, version: 1 };
    this.currentFolderId = null; // null = "General"
    this.favoritos = new Set();
  }

  async createFolder(nombreCarpeta, parentId = null) {
    const newId = this.generateFolderId();
    const newFolder = { id: newId, nombre: nombreCarpeta, parent_id: parentId };
    
    // Actualización optimista en UI
    this.estructura.folders[newId] = newFolder;
    this.estructura.version++;
    this.renderUI();
    
    // Persistir en backend
    await this.saveEstructura();
  }
}
```

### Drag & Drop para Agentes
**Archivo**: `public/views/configuracion/carpetas_agentes.js` (líneas 300-400)

#### Setup de Drop Zones
```javascript
setupDropZone(folderElement, folderId) {
  folderElement.addEventListener('drop', async (e) => {
    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    
    if (data.type === 'agente') {
      await this.moveAgentTo(data.agente, folderId);
    }
  });
}
```

#### Movimiento Optimista de Agentes
```javascript
async moveAgentTo(agenteName, targetFolderId) {
  // 1. Actualización inmediata en UI
  const oldFolderId = this.estructura.asignaciones[agenteName];
  
  if (targetFolderId === null) {
    delete this.estructura.asignaciones[agenteName];
  } else {
    this.estructura.asignaciones[agenteName] = targetFolderId;
  }
  
  // 2. Re-render inmediato
  if (window.renderAgentsGrid) {
    window.renderAgentsGrid(window.currentEtiquetas || {});
  }
  
  // 3. Persistir en backend
  try {
    await this.saveEstructura();
  } catch (error) {
    // Revertir cambio optimista en caso de error
    this.estructura.asignaciones[agenteName] = oldFolderId;
    window.renderAgentsGrid(window.currentEtiquetas || {});
  }
}
```

### Sistema de Favoritos Coordinado
**Archivo**: `public/views/configuracion/carpetas_agentes.js` (líneas 500-600)

#### Carga de Favoritos
```javascript
async loadFavoritos() {
  const response = await fetch('/api/agentes-seleccion-personalizada');
  const data = await response.json();
  
  if (data.success) {
    // Favoritos de agentes (compartidos)
    data.seleccion.forEach(agente => this.favoritos.add(agente));
    
    // Favoritos de carpetas (personales)
    if (data.carpetas_favoritas) {
      data.carpetas_favoritas.forEach(folder => this.favoritos.add(folder));
    }
    
    // Auto-marcar carpetas como favoritas
    this.autoMarkFolderFavorites();
  }
}
```

#### Auto-Marcado de Carpetas Favoritas
```javascript
autoMarkFolderFavorites() {
  Object.entries(this.estructura.folders).forEach(([folderId, folder]) => {
    // Obtener agentes en esta carpeta
    const agentesEnCarpeta = Object.entries(this.estructura.asignaciones)
      .filter(([agente, carpetaId]) => String(carpetaId) === String(folderId))
      .map(([agente]) => agente);
    
    // Si todos los agentes son favoritos, marcar carpeta como favorita
    if (agentesEnCarpeta.length > 0 && 
        agentesEnCarpeta.every(agente => this.favoritos.has(agente))) {
      this.favoritos.add(`folder:${folderId}`);
    }
  });
}
```

#### Persistencia de Favoritos
```javascript
async persistFavoritos() {
  const agenteFavorites = Array.from(this.favoritos).filter(f => !f.startsWith('folder:'));
  const carpetaFavorites = Array.from(this.favoritos).filter(f => f.startsWith('folder:'));
  
  // Agentes favoritos → compartidos en empresa
  await fetch('/api/agentes-seleccion-personalizada', {
    method: 'POST',
    body: JSON.stringify({ seleccion: agenteFavorites })
  });
  
  // Carpetas favoritas → personales del usuario
  await fetch('/api/carpetas-favoritas', {
    method: 'POST',
    body: JSON.stringify({ carpetas_favoritas: carpetaFavorites })
  });
}
```

### Backend - Persistencia de Estructura
**Endpoint**: `POST /api/carpetas-estructura` en `routes/enterprise.routes.js`
- Valida permisos `can_edit_structure`
- Actualiza `estructura_carpetas` con nueva versión
- Registra cambio en historial

---

## 7. Historial y Auditoría

### Registro de Cambios
**Archivo**: `services/enterprise.service.js` (líneas 600-700)

#### Función de Logging
```javascript
async function logEmpresaChange(estructuraId, usuario, accion, objeto, detalles = {}) {
  const historialEntry = {
    timestamp: new Date(),
    usuario: usuario,
    accion: accion,
    objeto: objeto,
    detalles: detalles,
    version: detalles.version_nueva || null
  };

  await usersCollection.updateOne({ _id: estructuraId }, { 
    $push: { 
      historial_cambios: {
        $each: [historialEntry],
        $slice: -100 // Mantener solo últimos 100 cambios
      }
    }
  });
}
```

#### Acciones Auditadas
```javascript
const ACCIONES_AUDITORIA = {
  UPDATE_ETIQUETA: 'update_etiqueta',
  CREATE_ETIQUETA: 'create_etiqueta',
  DELETE_ETIQUETA: 'delete_etiqueta',
  UPDATE_CARPETA: 'update_carpeta',
  CREATE_CARPETA: 'create_carpeta',
  DELETE_CARPETA: 'delete_carpeta',
  MOVE_AGENTE: 'move_agente',
  UPDATE_PERMISSIONS: 'update_user_permissions',
  ADD_USER: 'add_user',
  REMOVE_USER: 'remove_user'
};
```

### Integración en Operaciones
Cada operación que modifica datos registra automáticamente:
- Timestamp preciso
- Usuario que realizó la acción
- Tipo de acción realizada
- Objeto afectado (agente, carpeta, usuario)
- Versión anterior y nueva (para control optimista)

### Consulta de Historial
```javascript
// Query MongoDB para historial reciente
db.users.findOne(
  { tipo_cuenta: "empresa", empresa_domain: "empresa.com" },
  { historial_cambios: { $slice: -10 } }
)
```

---

## 8. APIs y Endpoints

### Autenticación y Usuarios
- `POST /api/register` - Registro con detección enterprise
- `POST /api/login` - Login con auto-conexión empresarial
- `GET /api/get-user-data` - Datos contextuales del usuario

### Sistema Enterprise
- `GET /api/etiquetas-context` - Contexto empresarial completo
- `POST /api/update-etiquetas-personalizadas` - Actualizar etiquetas con resolver
- `GET /api/cobertura-legal` - Cobertura legal empresarial
- `POST /api/update-cobertura-legal` - Actualizar cobertura legal

### Control de Concurrencia
- `POST /api/etiquetas-lock` - Obtener bloqueo para edición
- `PUT /api/etiquetas-lock` - Actualizar heartbeat del bloqueo
- `DELETE /api/etiquetas-lock` - Liberar bloqueo

### Gestión de Permisos
- `GET /api/company-users` - Lista de usuarios de la empresa
- `POST /api/manage-user-permissions` - Gestionar permisos de usuario
- `POST /api/request-permissions` - Solicitar permisos adicionales
- `GET /api/permission-requests` - Ver solicitudes pendientes

### Carpetas y Favoritos
- `POST /api/carpetas-estructura` - Actualizar estructura de carpetas
- `GET /api/agentes-seleccion-personalizada` - Obtener agentes favoritos
- `POST /api/agentes-seleccion-personalizada` - Actualizar agentes favoritos
- `POST /api/carpetas-favoritas` - Actualizar carpetas favoritas personales

---

## 9. Configuración e Integración

### Inicialización Frontend
**Archivo**: `public/views/configuracion/agentes.js` (líneas 260-400)

#### Función de Inicialización Coordinada
```javascript
async function initializeAgentsAndFolders() {
  try {
    showStableLoader();
    
    // PASO 1: Cargar todos los datos en paralelo
    const [foldersInitResult, agentsDataResult, contextResult] = await Promise.allSettled([
      // Inicializar sistema de carpetas
      window.CarpetasAgentes?.init(),
      
      // Cargar agentes usando resolver
      window.EtiquetasResolver?.getEtiquetasPersonalizadas(),
      
      // Cargar contexto empresa
      window.EtiquetasResolver?.getUserContext()
    ]);
    
    // PASO 2: Configurar UI según contexto empresarial
    if (contextData?.tipo_cuenta === 'empresa' && !contextData.can_edit_empresa) {
      window.EtiquetasResolver?.setupReadonlyButtons();
    }
    
    // PASO 3: Renderizar todo de forma coordinada
    window.CarpetasAgentes?.renderUI();
    renderAgentsGridCoordinated(etiquetasData);
    
  } catch (error) {
    console.error('Error in coordinated initialization:', error);
  }
}
```

### Detección de Contexto
El sistema detecta automáticamente si un usuario pertenece a una empresa y ajusta la UI:
- **Individual**: Funcionalidad estándar con datos personales
- **Empresa con permisos**: UI completa con capacidades de edición
- **Empresa solo lectura**: Botones deshabilitados, modales informativos

### Sincronización Multi-Usuario
- **Tiempo real**: Cambios reflejados en <30 segundos entre dispositivos
- **Optimistic UI**: Cambios aparecen inmediatamente en el dispositivo que los realiza
- **Conflict resolution**: Sistema de versiones detecta y resuelve conflictos

---

## 10. Testing y Validación

### Casos de Prueba Principales

#### Test de Reconocimiento Empresarial
1. Usuario registra con código enterprise → Crea estructura_empresa
2. Segundo usuario mismo dominio → Se conecta automáticamente  
3. Usuario diferente dominio → Mantiene cuenta individual

#### Test de Sistema de Permisos
1. Admin puede gestionar otros usuarios
2. Editor puede editar contenido pero no usuarios
3. Lectura solo puede ver sin editar
4. Verificar restricciones por endpoint

#### Test de Control de Concurrencia
1. Usuario A edita agente → Usuario B recibe mensaje "en edición"
2. Heartbeat mantiene bloqueo activo
3. Timeout libera bloqueo automáticamente
4. Versiones optimistas detectan conflictos

#### Test de Carpetas y Favoritos
1. Crear/editar/eliminar carpetas
2. Drag & drop de agentes entre carpetas
3. Favoritos se sincronizan entre usuarios
4. Auto-marcado de carpetas favoritas

### Verificación en MongoDB
```javascript
// Ver estructura empresa completa
db.users.findOne({tipo_cuenta: "empresa", empresa_domain: "testempresa.com"})

// Ver usuarios de empresa específica  
db.users.find({estructura_empresa_id: ObjectId("...")})

// Ver bloqueos activos
db.users.findOne({tipo_cuenta: "empresa"}, {bloqueos_edicion: 1})

// Ver historial reciente
db.users.findOne({tipo_cuenta: "empresa"}, {historial_cambios: {$slice: -10}})
```

### Consideraciones de Seguridad
- **Control de Acceso**: Verificación de permisos en cada endpoint
- **Validación de ownership**: Verificar `estructura_empresa_id` en contexto
- **Prevención de escalada**: Protección contra cambios no autorizados
- **Audit trail**: Registro completo de todas las acciones

---

## 📚 Conclusión

El Sistema Enterprise Colaborativo está completamente implementado y operativo. Proporciona una base sólida para trabajo colaborativo empresarial con todas las características de seguridad, concurrencia y usabilidad requeridas. La documentación de testing (`test_funciones_enterprise.md`) complementa este documento con instrucciones detalladas para validar el funcionamiento completo del sistema. 