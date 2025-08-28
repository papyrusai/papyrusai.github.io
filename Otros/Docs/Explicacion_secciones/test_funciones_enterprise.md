# 🧪 CHECKLIST DE TESTING - SISTEMA ENTERPRISE COLABORATIVO

## 📋 RESUMEN DE TESTING

Este checklist cubre todas las funcionalidades enterprise implementadas para asegurar el correcto funcionamiento del sistema colaborativo. Se recomienda usar **MongoDB Compass** para verificar cambios en la base de datos en tiempo real.

### **🔧 Preparación del Entorno de Testing**

**Requisitos:**
- Aplicación corriendo en `localhost:3000`
- MongoDB Compass abierto conectado a la BD
- Al menos 2 dispositivos/navegadores para pruebas de concurrencia
- Emails de prueba con el mismo dominio (ej: `admin@testempresa.com`, `user1@testempresa.com`)

---

## 🏢 SECCIÓN 1: RECONOCIMIENTO AUTOMÁTICO EMPRESARIAL

### **Test 1.1: Creación de Nueva Empresa**

**Objetivo:** Verificar que se crea correctamente una nueva estructura empresarial

**Pasos:**
1. **Navegar a** `localhost:3000/register`
2. **Rellenar formulario con:**
   - Email: `admin@testempresa.com`
   - Contraseña: `TestPassword123!`
   - Código: `ReversaEnterprise1620`
   - Nombre empresa: `Test Empresa S.L.`
3. **Enviar registro**

**✅ Verificaciones:**
- [ ] Registro exitoso sin errores
- [ ] Redirección automática al dashboard
- [ ] **En MongoDB:** Documento `estructura_empresa` creado con:
  - `tipo_cuenta: "empresa"`
  - `empresa_domain: "testempresa.com"`
  - `empresa_name: "Test Empresa S.L."`
  - `empresa_users` contiene admin con `role: "admin"`
  - `etiquetas_personalizadas: {}`
  - `estructura_carpetas` inicializada
- [ ] Usuario individual creado con `estructura_empresa_id` referenciando la empresa

---

### **Test 1.2: Auto-Conexión por Dominio**

**Objetivo:** Verificar que usuarios del mismo dominio se conectan automáticamente

**Pasos:**
1. **Crear segundo usuario:**
   - Email: `user1@testempresa.com`
   - Contraseña: `User1Password123!`
   - **SIN código enterprise** (registro normal)
2. **Hacer login con user1**

**✅ Verificaciones:**
- [ ] Login exitoso
- [ ] **En MongoDB:** Usuario actualizado con:
  - `tipo_cuenta: "empresa"`
  - `estructura_empresa_id` apuntando a la empresa
- [ ] **En estructura_empresa:** `empresa_users` contiene user1 con `role: "lectura"`
- [ ] User1 puede ver etiquetas compartidas (aunque esté vacío inicialmente)

---

### **Test 1.3: Aislamiento por Dominio**

**Objetivo:** Verificar que dominios diferentes no se mezclan

**Pasos:**
1. **Crear usuario de diferente dominio:**
   - Email: `external@otraempresa.com`
   - Registro normal (sin código enterprise)
2. **Verificar aislamiento**

**✅ Verificaciones:**
- [ ] Usuario externo mantiene `tipo_cuenta: "individual"`
- [ ] No tiene acceso a etiquetas de testempresa.com
- [ ] **En MongoDB:** No aparece en `empresa_users` de Test Empresa S.L.

---

## 🔄 SECCIÓN 2: ADAPTADOR ENTERPRISE PARA ETIQUETAS

### **Test 2.1: Endpoint Unificado /api/etiquetas-context**

**Objetivo:** Verificar que el nuevo endpoint funciona para ambos tipos de cuenta

**Pasos - Usuario Individual:**
1. **Login como usuario individual** (`test@individual.com`)
2. **Hacer GET a** `/api/etiquetas-context`
3. **Verificar respuesta**

**✅ Verificaciones Usuario Individual:**
- [ ] Response 200 con `success: true`
- [ ] `source: "individual"`
- [ ] `isEnterprise: false`
- [ ] `data` contiene etiquetas del usuario individual
- [ ] `permissions: null` (no aplica para individuales)

**Pasos - Usuario Empresa:**
1. **Login como admin empresa** (`admin@testempresa.com`)
2. **Hacer GET a** `/api/etiquetas-context`
3. **Verificar respuesta**

**✅ Verificaciones Usuario Empresa:**
- [ ] Response 200 con `success: true`
- [ ] `source: "empresa"`
- [ ] `isEnterprise: true`
- [ ] `data` contiene etiquetas de `estructura_empresa.etiquetas_personalizadas`
- [ ] `permissions` contiene permisos del usuario en empresa   
- [ ] `estructura_id` referencia correcta a estructura empresa

---

### **Test 2.2: Redirección Automática de Consultas**

**Objetivo:** Verificar que las consultas se redirigen correctamente según tipo de cuenta

**Setup:**
- Empresa con 3 agentes: "Compliance GDPR", "Regulación Bancaria", "Fintech"
- Usuario individual con 2 agentes propios: "Mi Agente", "Otro Agente"

**Pasos:**
1. **Como usuario empresa, ir a Configuración > Agentes**
2. **Verificar que ve agentes de empresa, no individuales**
3. **Como usuario individual, ir a Configuración > Agentes**
4. **Verificar que ve sus agentes individuales**

**✅ Verificaciones:**
- [ ] Usuario empresa ve agentes de `estructura_empresa.etiquetas_personalizadas`
- [ ] Usuario individual ve agentes de `users.etiquetas_personalizadas`
- [ ] No hay mezcla entre fuentes de datos
- [ ] **En MongoDB:** Consultas van a documentos correctos

---

## ⭐ SECCIÓN 3: SISTEMA DE ETIQUETAS SELECCIONADAS

### **Test 3.1: Endpoint /api/etiquetas-seleccionadas**

**Objetivo:** Verificar funcionamiento del nuevo endpoint de etiquetas seleccionadas

**Setup:**
- Usuario empresa con 5 agentes disponibles en estructura
- Usuario tiene 3 agentes en `etiquetas_personalizadas_seleccionadas`

**Pasos:**
1. **Hacer GET a** `/api/etiquetas-seleccionadas`
2. **Verificar respuesta y metadatos**

**✅ Verificaciones:**
- [ ] Response 200 con `success: true`
- [ ] `etiquetas_seleccionadas` contiene solo los 3 agentes seleccionados
- [ ] `etiquetas_mapping` contiene definiciones de los 3 agentes
- [ ] `metadata.total_disponibles: 5`
- [ ] `metadata.total_seleccionadas: 3`
- [ ] `metadata.etiquetas_filtradas: 0` (todos existen)

---

### **Test 3.2: Degradación Elegante**

**Objetivo:** Verificar comportamiento cuando etiquetas seleccionadas ya no existen

**Setup:**
1. **Usuario tiene 3 agentes seleccionados:** ["A", "B", "C"]
2. **Admin elimina agente "B" de estructura empresa**
3. **Usuario hace nueva consulta**

**Pasos:**
1. **Admin elimina agente "B" de Configuración > Agentes**
2. **Usuario hace GET a** `/api/etiquetas-seleccionadas`
3. **Verificar degradación elegante**

**✅ Verificaciones:**
- [ ] Response 200 sin errores
- [ ] `etiquetas_seleccionadas` contiene solo ["A", "C"]
- [ ] `metadata.etiquetas_filtradas: 1` (agente "B" filtrado)
- [ ] `metadata.total_seleccionadas: 2` (después del filtrado)
- [ ] Log en servidor menciona 1 etiqueta filtrada
- [ ] Sistema continúa funcionando sin romperse

---

### **Test 3.3: Tracker Dropdown Actualizado**

**Objetivo:** Verificar que tracker solo muestra agentes seleccionados

**Setup:**
- Usuario empresa con 10 agentes disponibles
- Usuario tiene 3 agentes seleccionados

**Pasos:**
1. **Ir a tracker:** `/views/tracker/tracker.html`
2. **Abrir dropdown "Agentes"**
3. **Verificar contenido**

**✅ Verificaciones:**
- [ ] Dropdown muestra solo 3 agentes seleccionados (no los 10 disponibles)
- [ ] Checkbox "Todos" presente
- [ ] Cada agente seleccionado tiene su checkbox
- [ ] **Si 0 seleccionados:** Mensaje "No tienes agentes seleccionados. Ve a Configuración..."
- [ ] **Si 0 disponibles:** Mensaje "No hay agentes configurados"

---

### **Test 3.4: Selección Vacía con Guía**

**Objetivo:** Verificar mensaje guía cuando usuario no tiene agentes seleccionados

**Setup:**
- Usuario empresa con agentes disponibles
- Usuario sin agentes en `etiquetas_personalizadas_seleccionadas`

**Pasos:**
1. **Ir a tracker dropdown**
2. **Verificar mensaje guía**

**✅ Verificaciones:**
- [ ] Mensaje: "No tienes agentes seleccionados. Ve a Configuración > Agentes para seleccionar."
- [ ] No aparece checkbox "Todos"
- [ ] Dropdown no está vacío, muestra mensaje explicativo
- [ ] Usuario puede entender cómo resolver la situación

---

## 🔐 SECCIÓN 4: SISTEMA DE PERMISOS (ACTUALIZADO)

### **Test 4.1: Jerarquía de Permisos con Adaptador**

**Objetivo:** Verificar que los roles Admin/Editor/Lectura funcionan con el nuevo sistema

**Setup inicial:**
- Logueado como `admin@testempresa.com`
- Crear algunos agentes de prueba en Configuración > Agentes

**Pasos:**
1. **Como Admin, ir a:** `/views/administracion/admin.html`
2. **Verificar panel de administración visible**
3. **Cambiar permisos de user1:**
   - Asignar role: `editor`
   - Permisos: `can_edit_empresa: true`, otros false
4. **Logout y login como `user1@testempresa.com`**
5. **Intentar editar agentes usando nuevo sistema**

**✅ Verificaciones Admin:**
- [ ] Panel administración accesible
- [ ] Puede ver lista de usuarios empresa
- [ ] Puede cambiar roles y permisos
- [ ] **En MongoDB:** Cambios reflejados en `empresa_users.user1@testempresa.com`

**✅ Verificaciones Editor (user1) con Adaptador:**
- [ ] **NO** puede acceder a `/views/administracion/admin.html`
- [ ] **SÍ** puede editar agentes usando `/api/etiquetas-context POST`
- [ ] **SÍ** puede crear/modificar carpetas
- [ ] Endpoint responde 403 para acciones no permitidas (sin `can_manage_users`)

---

### **Test 4.2: Usuarios Solo Lectura con Adaptador**

**Pasos:**
1. **Como admin, cambiar user1 a role:** `lectura`
2. **Como user1, intentar editar agentes via `/api/etiquetas-context POST`**

**✅ Verificaciones:**
- [ ] Endpoint responde 403 con mensaje claro: "Sin permisos para editar etiquetas empresariales"
- [ ] `required_permission: "can_edit_empresa"` en respuesta
- [ ] Frontend muestra botones deshabilitados/ocultos
- [ ] Modal de agentes en modo solo lectura
- [ ] **En MongoDB:** No hay cambios en `etiquetas_personalizadas`

---

## 🎨 SECCIÓN 5: COMPATIBILIDAD FRONTEND

### **Test 5.1: Etiquetas Resolver Actualizado**

**Objetivo:** Verificar que el frontend resolver usa nuevos endpoints

**Pasos:**
1. **Abrir DevTools > Network**
2. **Ir a Configuración > Agentes**
3. **Verificar llamadas de red**

**✅ Verificaciones:**
- [ ] Llamada GET a `/api/etiquetas-context` (no a `/api/get-user-data`)
- [ ] Respuesta incluye `source`, `isEnterprise`, `permissions`
- [ ] Frontend detecta correctamente tipo de cuenta
- [ ] UI se adapta según permisos (botones habilitados/deshabilitados)

---

### **Test 5.2: Profile y Data Endpoints**

**Objetivo:** Verificar que endpoints de profile usan adaptador

**Pasos:**
1. **Ir a dashboard principal** (`/profile`)
2. **Verificar carga de documentos filtrados**
3. **Verificar endpoint `/data`**

**✅ Verificaciones:**
- [ ] Profile carga etiquetas usando `getEtiquetasPersonalizadasAdapter`
- [ ] Consultas MongoDB usan `buildEtiquetasQuery`
- [ ] Filtrado funciona igual para empresa e individual
- [ ] **En logs servidor:** Consultas van a fuente correcta (empresa/individual)

---

## 📊 SECCIÓN 6: INTEGRACIÓN COMPLETA

### **Test 6.1: Flujo Completo Usuario Empresa**

**Objetivo:** Test end-to-end del flujo empresa completo

**Escenario:**
1. **Admin crea 5 agentes** en estructura empresa
2. **User1 selecciona 3 agentes** como favoritos
3. **User1 usa tracker** para filtrar documentos
4. **Admin modifica 1 agente**
5. **User1 ve cambios** reflejados

**✅ Verificaciones:**
- [ ] Paso 1: Agentes aparecen en `estructura_empresa.etiquetas_personalizadas`
- [ ] Paso 2: Selección aparece en `users.etiquetas_personalizadas_seleccionadas`
- [ ] Paso 3: Tracker dropdown muestra solo 3 agentes seleccionados
- [ ] Paso 4: Cambios en estructura empresa visibles inmediatamente
- [ ] Paso 5: User1 ve agente modificado (fuente de verdad empresarial)

---

### **Test 6.2: Flujo Completo Usuario Individual**

**Objetivo:** Verificar que usuarios individuales siguen funcionando

**Escenario:**
1. **Usuario individual crea agentes**
2. **Usuario usa tracker y profile**
3. **Usuario modifica agentes**

**✅ Verificaciones:**
- [ ] Agentes se guardan en `users.etiquetas_personalizadas`
- [ ] Tracker muestra todos los agentes (sin filtro por selección)
- [ ] Profile y análisis funcionan normalmente
- [ ] No hay interferencia con sistema enterprise

---

## 📝 CHECKLIST FINAL DE VALIDACIÓN (ACTUALIZADO)

### **Funcionalidades Core ✅**
- [ ] Reconocimiento automático empresarial
- [ ] Sistema de permisos granular
- [ ] Control de concurrencia con bloqueos
- [ ] **NUEVO:** Adaptador enterprise unificado
- [ ] **NUEVO:** Sistema de etiquetas seleccionadas
- [ ] **NUEVO:** Tracker con filtrado por selección
- [ ] **NUEVO:** Degradación elegante de etiquetas
- [ ] Estructura de carpetas con drag & drop
- [ ] Sistema de favoritos coordinado
- [ ] Panel de administración completo
- [ ] Sincronización multi-usuario
- [ ] Historial de auditoría
- [ ] Aislamiento de seguridad

### **Endpoints Nuevos ✅**
- [ ] `GET /api/etiquetas-context` - Obtener etiquetas unificado
- [ ] `POST /api/etiquetas-context` - Actualizar etiquetas unificado
- [ ] `GET /api/etiquetas-seleccionadas` - Solo etiquetas seleccionadas
- [ ] `GET /api/user-context` - Contexto usuario (compatibilidad)

### **Adaptadores Enterprise ✅**
- [ ] `getEtiquetasPersonalizadasAdapter()` - Lectura unificada
- [ ] `updateEtiquetasPersonalizadasAdapter()` - Escritura unificada
- [ ] `getEtiquetasSeleccionadasAdapter()` - Filtrado por selección
- [ ] `buildEtiquetasQuery()` - Consultas MongoDB adaptadas

### **Frontend Actualizado ✅**
- [ ] `etiquetas-resolver.js` usa nuevos endpoints
- [ ] `tracker.js` carga solo etiquetas seleccionadas
- [ ] `profile.routes.js` usa adaptadores enterprise
- [ ] `normativa.routes.js` usa adaptadores enterprise
- [ ] `generacioncontenido.routes.js` usa adaptadores enterprise

### **Degradación Elegante ✅**
- [ ] Etiquetas seleccionadas inexistentes filtradas automáticamente
- [ ] Mensajes guía cuando no hay selecciones
- [ ] Fallback a método individual en caso de error
- [ ] Logging de etiquetas filtradas para debugging

### **UX/UI ✅**
- [ ] Modales estándar Reversa (sin alerts)
- [ ] Loaders estables sin parpadeo
- [ ] Feedback visual inmediato
- [ ] Mensajes de error claros con nueva estructura
- [ ] Navegación intuitiva con guías contextuales

### **Datos en MongoDB ✅**
- [ ] Estructura `estructura_empresa` correcta
- [ ] Referencias `estructura_empresa_id` válidas
- [ ] Campo `etiquetas_personalizadas_seleccionadas` en usuarios
- [ ] Versionado y historial funcionando
- [ ] Bloqueos y heartbeats operativos
- [ ] Permisos y roles actualizados

### **Seguridad ✅**
- [ ] Validación de permisos en nuevos endpoints
- [ ] Aislamiento por dominio empresarial
- [ ] Protección contra escalada de privilegios
- [ ] Audit trail completo con nuevas acciones
- [ ] Verificación de ownership en adaptadores

---

## 💡 NOTAS PARA TESTING ACTUALIZADO

**MongoDB Queries Útiles:**
```javascript
// Ver estructura empresa completa
db.users.findOne({tipo_cuenta: "empresa", empresa_domain: "testempresa.com"})

// Ver etiquetas seleccionadas de usuario específico
db.users.findOne({email: "user1@testempresa.com"}, {etiquetas_personalizadas_seleccionadas: 1})

// Ver usuarios de empresa específica
db.users.find({estructura_empresa_id: ObjectId("...")})

// Ver bloqueos activos
db.users.findOne({tipo_cuenta: "empresa"}, {bloqueos_edicion: 1})

// Ver historial reciente
db.users.findOne({tipo_cuenta: "empresa"}, {historial_cambios: {$slice: -10}})
```

**Debugging Tips Actualizados:**
- Usar console.log en navegador para ver llamadas API nuevas
- Verificar Network tab para endpoints `/api/etiquetas-*`
- Comprobar logs servidor para filtrado de etiquetas
- Validar que versiones incrementan tras cada cambio
- Verificar metadatos en respuestas de endpoints

**Casos Edge Adicionales a Validar:**
- Usuario con `etiquetas_personalizadas_seleccionadas: null`
- Usuario con array vacío `[]` en selecciones
- Empresa sin agentes pero usuario con selecciones
- Cambio de empresa_domain de usuario existente
- Eliminación masiva de agentes con usuarios conectados
- Degradación cuando estructura_empresa se corrompe 