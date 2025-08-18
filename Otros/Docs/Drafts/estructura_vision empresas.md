# ESTRUCTURA VISIÓN COLABORATIVA DE EMPRESAS - PLAN COMPLETO

## Contexto Global

Implementar funcionalidad colaborativa empresarial que permita:
1. **Conexión de usuarios por dominio empresarial** con variables comunes
2. **Etiquetas/agentes colaborativos** con fuente de verdad compartida
3. **Sistema de permisos** (admin/edición/lectura) y solicitudes
4. **Carpetas organizacionales** con drag & drop para agentes
5. **Selección personalizada** de agentes por usuario respetando estructura
6. **Historial de versiones** para auditoría de cambios
7. **Compatibilidad** con cuentas individuales existentes

---

## MODELO DE DATOS ACTUALIZADO

### Estructura en colección `users`:

#### 1. Usuarios normales (individual/empresa):
```javascript
{
  // === VARIABLES EXISTENTES A MANTENER ===
  email, password, subscription_plan, limit_agentes, limit_fuentes, etc.
  
  // === NUEVAS VARIABLES EMPRESARIALES ===
  tipo_cuenta: "individual" | "empresa",
  empresa: "dominio.com", // Solo si tipo_cuenta="empresa"
  permiso: "admin" | "edicion" | "lectura", // Solo si tipo_cuenta="empresa"
  admin_empresa_id: ObjectId, // Referencia al admin de la empresa
  estructura_empresa_id: ObjectId, // Referencia al documento estructura_empresa
  
  // === GESTIÓN DE AGENTES PERSONALIZADA ===
  etiquetas_personalizadas_seleccionadas: ["agente1", "agente2"], // Agentes que usuario quiere ver
  
  // === PARA CUENTAS INDIVIDUALES (mantener retrocompatibilidad) ===
  etiquetas_personalizadas: { "agente": "definicion" }, // Solo si tipo_cuenta="individual"
  estructura_carpetas_user: { // Solo si tipo_cuenta="individual"
    folders: { [folderId]: { id, nombre, parentId, orden, createdAt } },
    asignaciones: { [agenteNombre]: folderId|null }
  },
  
  // === SOLICITUDES DE PERMISOS ===
  solicitudes_permiso: [{
    tipo_permiso_solicitado: "edicion" | "admin",
    fecha_solicitud: Date,
    estado: "pendiente" | "aprobada" | "denegada",
    admin_revisor_id: ObjectId
  }]
}
```

#### 2. Documento especial estructura_empresa:
```javascript
{
  tipo_cuenta: "estructura_empresa", // Identificador especial
  empresa: "dominio.com", // Índice único
  
  // === VARIABLES COMUNES DE LA EMPRESA ===
  // Todas las variables que normalmente están en usuario individual:
  industry_tags: [],
  sub_industria_map: {},
  rama_juridicas: [],
  sub_rama_map: {},
  cobertura_legal: { fuentes: [], reguladores: [] },
  rangos: [],
  subscription_plan: "plan4",
  limit_agentes: null, // unlimited para empresas
  limit_fuentes: null,
  impact_analysis_limit: -1,
  profile_type: "empresa",
  company_name: "",
  web: "",
  detalle_empresa: {},
  interes: "",
  tamaño_empresa: "",
  perfil_regulatorio: "",
  website_extraction_status: {},
  
  // === AGENTES COLABORATIVOS (FUENTE DE VERDAD) ===
  etiquetas_personalizadas: { 
    "agente1": "definicion1",
    "agente2": "definicion2"
  },
  
  // === ESTRUCTURA DE CARPETAS COLABORATIVA ===
  estructura_carpetas: {
    folders: { 
      [folderId]: { 
        id: String,
        nombre: String,
        parentId: String|null,
        orden: Number,
        createdAt: Date,
        createdBy: ObjectId,
        updatedAt: Date,
        updatedBy: ObjectId
      }
    },
    asignaciones: { 
      [agenteNombre]: folderId|null // null = raíz
    },
    version: Number // Control optimista de cambios
  },
  
  // === BLOQUEOS DE EDICIÓN CONCURRENTE ===
  bloqueos_edicion: {
    agentes: { 
      [agenteNombre]: { 
        en_edicion_por: ObjectId|null,
        desde: Date
      }
    },
    carpetas: {
      [folderId]: {
        en_edicion_por: ObjectId|null,
        desde: Date
      }
    }
  },
  
  // === HISTORIAL DE VERSIONES ===
  historial_agentes: [{
    agente_nombre: String,
    version_anterior: { nombre: String, definicion: String },
    version_nueva: { nombre: String, definicion: String },
    modificado_por: ObjectId,
    fecha: Date,
    tipo_cambio: "creacion" | "edicion" | "eliminacion",
    nombre_version: "HH:mm_DD-MM-YYYY"
  }],
  
  historial_carpetas: [{
    accion: "crear" | "renombrar" | "mover" | "eliminar",
    carpeta_id: String,
    datos_anteriores: Object,
    datos_nuevos: Object,
    modificado_por: ObjectId,
    fecha: Date
  }],
  
  // === METADATOS ===
  created_at: Date,
  updated_at: Date,
  admin_principal_id: ObjectId
}
```

---

## FUNCIONALIDADES PRINCIPALES

### 1. **Detección y Creación de Cuenta Empresa**
- Usuario registra con código "ReversaEnterprise1620" → `tipo_cuenta: "empresa"`
- Crear automáticamente documento `estructura_empresa` con todas las variables comunes
- Primer usuario = admin automático, siguientes = lectura por defecto
- Plan 4 automático para todas las cuentas empresa

### 2. **Auto-conexión por Dominio**
- Al registrarse, buscar documento `estructura_empresa` por dominio email
- Si existe: copiar variables comunes, asignar `estructura_empresa_id`, saltar onboarding
- Redirigir a configuración de agentes para selección personalizada

### 3. **Sistema de Permisos**
- **Admin**: crear/editar agentes, gestionar permisos, ver panel control
- **Edición**: crear/editar agentes, gestionar carpetas
- **Lectura**: solo visualizar y seleccionar agentes
- Panel control admin: usuarios, solicitudes pendientes, estadísticas

### 4. **Carpetas Organizacionales con Drag & Drop**
- Crear/renombrar/eliminar/mover carpetas (solo admin/edición)
- Arrastrar agentes entre carpetas y raíz
- UX: hover highlights, ghost preview, autoscroll, confirmaciones
- Estructura jerárquica con validación de ciclos
- Misma funcionalidad para cuentas individuales

### 5. **Selección Personalizada de Agentes**
- Selección individual o por carpeta completa
- "Seleccionar todos" global con respeto a límites
- Vista "Personalizada" vs "Total empresa" con dropdown
- Contadores: "seleccionados/total" por carpeta
- Filtros en tracker respetan selección personalizada

### 6. **Historial de Versiones**
- Registro de cambios en agentes y carpetas
- Vista detalle agente: tabs "Actual" / "Versiones"
- Metadatos: usuario, fecha, tipo cambio
- Disponible también para cuentas individuales

### 7. **Edición Colaborativa con Bloqueos**
- Bloqueo suave durante edición para evitar conflictos
- Control optimista por versión en estructura
- Propagación inmediata a todos usuarios empresa

---

## PLAN DE IMPLEMENTACIÓN (10 STEPS)

### **STEP 1: Detección y registro empresarial**
Implementar detección del código "ReversaEnterprise1620" y creación automática del documento `estructura_empresa`.

**Cambios a realizar:**
- Modificar `/routes/auth.routes.js` y `/routes/billing.routes.js` para detectar código empresarial
- Añadir función `createEstructuraEmpresa()` que crea documento con `tipo_cuenta="estructura_empresa"`
- Actualizar frontend onboarding para manejar redirección empresarial
- Crear índice único en MongoDB: `{ empresa: 1, tipo_cuenta: 1 }`

**Variables MongoDB a introducir:**
- En usuarios: `tipo_cuenta`, `empresa`, `permiso`, `admin_empresa_id`, `estructura_empresa_id`
- Documento estructura_empresa con todas las variables comunes de empresa

### **STEP 2: Auto-conexión por dominio**
Implementar lógica de auto-detección de empresa existente durante registro.

**Cambios a realizar:**
- Modificar registro para buscar `estructura_empresa` por dominio
- Copiar variables comunes desde estructura_empresa al nuevo usuario
- Saltar onboarding para usuarios empresa subsecuentes
- Crear función `connectUserToEmpresa(user, estructuraEmpresa)`

**Variables MongoDB a añadir:**
- `etiquetas_personalizadas_seleccionadas: []` por defecto
- Lógica de asignación automática de `estructura_empresa_id`

### **STEP 3: Resolver de contexto para etiquetas**
Crear servicio backend que abstrae la lectura/escritura de etiquetas según contexto (empresa/individual).

**Cambios a realizar:**
- Crear `/services/etiquetas.service.js` con funciones:
  - `getEtiquetasPersonalizadas(user)`
  - `updateEtiquetasPersonalizadas(user, cambios)`
  - `getEstructuraCarpetas(user)`
- Mantener compatibilidad con código existente
- Actualizar rutas que leen etiquetas para usar el resolver

**Variables MongoDB a utilizar:**
- Lectura desde `estructura_empresa.etiquetas_personalizadas` si tipo_cuenta="empresa"
- Lectura desde `users.etiquetas_personalizadas` si tipo_cuenta="individual"

### **STEP 4: Sistema de permisos y solicitudes**
Implementar gestión de permisos y panel de control para administradores.

**Cambios a realizar:**
- Crear endpoints `/api/permisos/*` para gestión de permisos
- Añadir middleware de autorización por nivel de permiso
- Crear componente frontend para panel admin
- Implementar notificaciones de solicitudes pendientes

**Variables MongoDB a usar:**
- `permiso`, `solicitudes_permiso` en usuarios
- `admin_principal_id` en estructura_empresa

### **STEP 5: Estructura de carpetas base**
Implementar CRUD de carpetas sin drag & drop aún.

**Cambios a realizar:**
- Crear endpoints `/api/carpetas/*` para gestión de carpetas
- Implementar validaciones (nombres únicos, evitar ciclos)
- Crear componente frontend para vista de carpetas
- Añadir campo `estructura_carpetas` en estructura_empresa y usuarios individuales

**Variables MongoDB a introducir:**
- `estructura_carpetas.folders`, `estructura_carpetas.asignaciones`, `estructura_carpetas.version`
- `estructura_carpetas_user` para cuentas individuales

### **STEP 6: Drag & Drop de agentes**
Implementar interfaz drag & drop para mover agentes entre carpetas.

**Cambios a realizar:**
- Añadir librería drag & drop (react-beautiful-dnd o similar)
- Implementar handlers de drag/drop con validaciones
- Crear endpoints para actualizar asignaciones
- UX: indicadores visuales, confirmaciones, undo

**Variables MongoDB a actualizar:**
- `estructura_carpetas.asignaciones` con nuevas asignaciones
- Control de versión optimista

### **STEP 7: Selección personalizada de agentes**
Implementar selección individual y masiva de agentes con vistas personalizadas.

**Cambios a realizar:**
- Crear componente de selección con checkboxes tri-state
- Implementar "Seleccionar todos" global y por carpeta
- Añadir dropdown "Vista personalizada" vs "Vista total"
- Mostrar contadores de agentes seleccionados/total

**Variables MongoDB a usar:**
- `etiquetas_personalizadas_seleccionadas` para guardar selección usuario
- Validación contra `limit_agentes` según plan

### **STEP 8: Bloqueo concurrente y historial**
Implementar bloqueos de edición y sistema de versionado.

**Cambios a realizar:**
- Crear sistema de bloqueo suave con timeout automático
- Implementar historial de cambios en agentes y carpetas
- Crear vista detalle agente con tabs "Actual"/"Versiones"
- Añadir metadatos de auditoría

**Variables MongoDB a introducir:**
- `bloqueos_edicion.agentes`, `bloqueos_edicion.carpetas`
- `historial_agentes`, `historial_carpetas` con metadatos completos

### **STEP 9: Migración de datos existentes**
Migrar usuarios existentes y empresas detectadas al nuevo modelo.

**Cambios a realizar:**
- Script de migración para añadir `tipo_cuenta="individual"` a usuarios existentes
- Detectar y migrar empresas existentes (Cuatrecasas, A&O) a nueva estructura
- Crear documentos `estructura_empresa` para empresas detectadas
- Actualizar referencias de etiquetas en cuentas migradas

**Variables MongoDB a migrar:**
- Backfill de nuevos campos en usuarios existentes
- Creación de documentos estructura_empresa para empresas detectadas

### **STEP 10: Actualización de referencias legacy**
Actualizar todo el código que referencia etiquetas para usar el resolver de contexto.

**Cambios a realizar:**
- Actualizar `/routes/generacioncontenido.routes.js`
- Actualizar `/public/views/tracker/tracker.js`
- Actualizar filtros en dashboard principal
- Actualizar `/python/marketing.py` para resolver contexto
- Testing exhaustivo de compatibilidad

**Variables MongoDB afectadas:**
- Todas las lecturas de `etiquetas_personalizadas` deben usar resolver
- Mantener estructura original para cuentas individuales

---

## CONSIDERACIONES TÉCNICAS

### Índices MongoDB requeridos:
```javascript
// Índices únicos
db.users.createIndex({ "empresa": 1, "tipo_cuenta": 1 }, { unique: true, partialFilterExpression: { "tipo_cuenta": "estructura_empresa" } })

// Índices de búsqueda
db.users.createIndex({ "empresa": 1 })
db.users.createIndex({ "tipo_cuenta": 1 })
db.users.createIndex({ "estructura_empresa_id": 1 })
```

### Validaciones importantes:
- Nombres de carpetas únicos por nivel
- Prevención de ciclos en jerarquía
- Límites de agentes según plan
- Timeouts en bloqueos de edición
- Validación de permisos en todas las operaciones

### UX/UI considerations:
- Loading states durante drag & drop
- Confirmaciones para acciones destructivas
- Indicadores visuales de bloqueo/edición
- Contadores en tiempo real
- Responsive design para móviles

---

Listo para ejecutar. Cada STEP incluye contexto global, cambios específicos y variables MongoDB involucradas.