# 🎨 Estándar UI Reversa - Guía Completa

## 📋 RESUMEN EJECUTIVO

**Estándar UI Reversa** es el sistema de diseño oficial para Reversa AI Platform. Define componentes, patrones de interacción y directrices visuales para mantener una experiencia de usuario consistente y profesional en toda la aplicación.

### 🎯 **Principios Fundamentales:**
- **Consistencia**: Todos los elementos siguen el mismo sistema visual
- **Accesibilidad**: Componentes usables para todos los usuarios
- **Profesionalidad**: Diseño corporativo moderno y minimal
- **Eficiencia**: Patrones que optimizan la productividad del usuario

### ⚠️ **REGLA CRÍTICA - Sistema de Confirmaciones**

**SIEMPRE usar modales estándar para confirmaciones de usuario. NUNCA usar `alert()`, `confirm()` o `prompt()` del navegador.**

```javascript
// ❌ PROHIBIDO
if (confirm('¿Eliminar lista?')) {
    deleteList();
}

// ✅ OBLIGATORIO
showConfirmationModal({
    title: 'Eliminar Lista',
    message: '¿Estás seguro de que quieres eliminar esta lista? Esta acción no se puede deshacer.',
    confirmText: 'Eliminar',
    cancelText: 'Cancelar',
    onConfirm: () => deleteList(),
    onCancel: () => hideModal(),
    type: 'danger' // Para acciones destructivas
});
```

---

## 🎨 PALETA DE COLORES

### **Colores Brand**
```css
:root {
    --reversa-green: #04db8d;    /* Verde Reversa - Solo highlight y detalles */
    --reversa-blue: #0b2431;     /* Azul Reversa - Color principal */
    --reversa-slate: #455862;    /* Slate - Color secundario */
    --gradient-reversa: linear-gradient(135deg, #04db8d 0%, #0b2431 100%);
}
```

### **Colores Neutrales**
```css
:root {
    --neutral-50: #fafafa;      /* Fondo principal */
    --neutral-100: #f8f9fa;     /* Fondo secundario */
    --neutral-200: #f1f1f1;     /* Bordes suaves */
    --neutral-300: #e9ecef;     /* Bordes estándar */
    --neutral-350: #e8ecf0;     /* Bordes cards */
    --neutral-400: #dee2e6;     /* Bordes inputs */
    --neutral-500: #adb5bd;     /* Texto secundario */
    --neutral-600: #6c757d;     /* Texto de apoyo */
    --neutral-700: #495057;     /* Texto principal */
}
```

### **Colores de Estado**
```css
:root {
    --error: #d32f2f;           /* Errores y acciones destructivas */
    --warning-bg: #fff3cd;      /* Fondo warnings */
    --warning-fg: #856404;      /* Texto warnings */
}
```

### **Uso de Colores**
- **Verde Reversa**: Solo como highlight, nunca para botones estándar
- **Azul Reversa**: Color principal para texto y botones
- **Gradiente**: Exclusivamente para botones de IA y headers importantes
- **Neutrales**: Sistema base para toda la interfaz

---

## 🔤 TIPOGRAFÍA

### **Fuente: Satoshi**
```css
@import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap');

body {
    font-family: 'Satoshi', sans-serif;
}
```

### **Jerarquía Tipográfica**
```css
/* Headings */
h1 { font-size: 32px; font-weight: 700; } /* Títulos principales */
h2 { font-size: 24px; font-weight: 600; } /* Títulos de sección */
h3 { font-size: 20px; font-weight: 600; } /* Subtítulos */

/* Cuerpo de texto */
p { font-size: 16px; font-weight: 400; }  /* Texto principal */
.small { font-size: 14px; }               /* Texto secundario */
.caption { font-size: 12px; }             /* Metadatos y labels */
```

---

## 🔘 BOTONES

### **Tipos de Botones**

#### **1. Botón Outline (Estándar)**
```css
.btn-outline {
    background: transparent;
    border: 1px solid var(--reversa-blue);
    color: var(--reversa-blue);
    border-radius: 20px;
    padding: 8px 16px;
    font-weight: 600;
}
```

#### **2. Botón Filled (Primario)**
```css
.btn-filled {
    background: var(--reversa-blue);
    border: 1px solid var(--reversa-blue);
    color: white;
    border-radius: 20px;
    padding: 8px 16px;
    font-weight: 600;
}
```

#### **3. Botón IA (Acciones Generativas)**
```css
.btn-ai {
    background: var(--gradient-reversa);
    border: 0;
    color: white;
    border-radius: 20px;
    padding: 8px 16px;
    font-weight: 600;
    box-shadow: 0 4px 15px rgba(4,219,141,.25);
}
```

#### **4. Botón Danger (Acciones Destructivas)**
```css
.btn-danger {
    background: var(--error);
    border: 1px solid var(--error);
    color: white;
    border-radius: 20px;
    padding: 8px 16px;
    font-weight: 600;
}
```

### **Tamaños**
- **Small**: `padding: 6px 12px; font-size: 12px;`
- **Medium**: `padding: 8px 16px; font-size: 14px;` (Estándar)
- **Large**: `padding: 12px 20px; font-size: 16px;`

### **Estados**
- **Hover**: Cambio sutil de color/sombra
- **Focus**: Ring de enfoque azul
- **Disabled**: `opacity: 0.6; pointer-events: none;`
- **Loading**: Spinner interno + texto "Cargando..."

---

## 📝 FORMULARIOS

### **Inputs**
```css
.input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--neutral-400);
    border-radius: 4px;
    font-size: 14px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.input:focus {
    outline: none;
    border-color: var(--reversa-green);
    box-shadow: 0 0 0 2px rgba(4,219,141,.2);
}
```

### **Labels**
```css
.input-label {
    display: block;
    font-weight: 500;
    margin-bottom: 4px;
    color: var(--reversa-blue);
}
```

### **Checkboxes y Radios**
```css
.checkbox, .radio {
    accent-color: var(--reversa-green);
    width: 16px;
    height: 16px;
}
```

---

## 🃏 CARDS Y CONTENEDORES

### **Card Estándar**
```css
.card {
    background: white;
    border: 1px solid var(--neutral-350);
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(11,36,49,.08);
    transition: all 0.3s ease;
}

.card:hover {
    box-shadow: 0 4px 12px rgba(11,36,49,.12);
    border-color: rgba(4,219,141,.2);
    transform: translateY(-1px);
}
```

### **Estructura de Card**
```html
<div class="card">
    <h3 class="card-title">Título de la Card</h3>
    <p class="card-content">Contenido descriptivo</p>
    <div class="card-actions">
        <button class="btn btn-outline btn-sm">Acción</button>
    </div>
</div>
```

---

## 🏷️ CHIPS Y BADGES

### **Etiquetas de Estado**
```css
.chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 500;
    margin: 2px;
}

.chip-green { background: rgba(4,219,141,.1); color: var(--reversa-green); }
.chip-warning { background: var(--warning-bg); color: var(--warning-fg); }
.chip-error { background: rgba(211,47,47,.1); color: var(--error); }
.chip-neutral { background: var(--neutral-200); color: var(--neutral-700); }
```

### **Uso de Chips**
- **Verde**: Estados positivos, etiquetas personalizadas
- **Warning**: Estados de proceso, pendientes
- **Error**: Estados de error, rechazado
- **Neutral**: Estados neutros, información

---

## 📢 BANNERS Y AVISOS

### **Banner Informativo**
```css
.banner-info {
    background: white;
    border: 1px solid var(--reversa-slate);
    border-left: 4px solid var(--reversa-slate);
    padding: 16px 20px;
    border-radius: 8px;
    color: var(--reversa-slate);
}
```

### **Banner de Éxito**
```css
.banner-success {
    background: rgba(4,219,141,.05);
    border-left: 4px solid var(--reversa-green);
    padding: 16px 20px;
    border-radius: 8px;
    color: var(--reversa-blue);
}
```

### **Banner de Warning**
```css
.banner-warning {
    background: var(--warning-bg);
    border-left: 4px solid var(--warning-fg);
    padding: 16px 20px;
    border-radius: 8px;
    color: var(--warning-fg);
}
```

### **Banner de Error**
```css
.banner-error {
    background: rgba(211,47,47,.05);
    border-left: 4px solid var(--error);
    padding: 16px 20px;
    border-radius: 8px;
    color: var(--error);
}
```

---

## 🪟 SISTEMA DE MODALES (CRÍTICO)

### **Modal de Confirmación Estándar**

```html
<div class="modal-overlay" id="confirmModal">
    <div class="modal-content">
        <h3 class="modal-title">Título de Confirmación</h3>
        <p class="modal-text">Mensaje explicativo de la acción</p>
        <div class="modal-buttons">
            <button class="btn btn-outline" onclick="hideModal()">Cancelar</button>
            <button class="btn btn-danger" onclick="confirmAction()">Confirmar</button>
        </div>
    </div>
</div>
```

### **CSS del Modal**
```css
.modal-overlay {
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: rgba(0,0,0,.45);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s ease;
}

.modal-overlay.show {
    opacity: 1;
    visibility: visible;
}

.modal-content {
    background: white;
    padding: 32px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(11,36,49,.16);
    width: 90%;
    max-width: 480px;
    text-align: center;
    transform: scale(0.9);
    transition: transform 0.3s ease;
}

.modal-overlay.show .modal-content {
    transform: scale(1);
}
```

### **JavaScript del Modal**
```javascript
function showConfirmationModal(options) {
    const modal = document.getElementById('confirmModal');
    const title = modal.querySelector('.modal-title');
    const text = modal.querySelector('.modal-text');
    const confirmBtn = modal.querySelector('.btn-danger');
    const cancelBtn = modal.querySelector('.btn-outline');
    
    title.textContent = options.title;
    text.textContent = options.message;
    confirmBtn.textContent = options.confirmText || 'Confirmar';
    cancelBtn.textContent = options.cancelText || 'Cancelar';
    
    // Aplicar tipo de botón según acción
    confirmBtn.className = `btn ${options.type === 'danger' ? 'btn-danger' : 'btn-filled'}`;
    
    confirmBtn.onclick = () => {
        hideModal();
        if (options.onConfirm) options.onConfirm();
    };
    
    cancelBtn.onclick = () => {
        hideModal();
        if (options.onCancel) options.onCancel();
    };
    
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function hideModal() {
    const modal = document.getElementById('confirmModal');
    modal.classList.remove('show');
    document.body.style.overflow = '';
}
```

### **Casos de Uso del Modal**
- **Eliminar elementos**: listas, documentos, usuarios
- **Cancelar procesos**: suscripciones, operaciones en curso
- **Confirmar cambios**: actualizaciones importantes
- **Salir sin guardar**: formularios con cambios

---

## ⚡ LOADERS Y ESTADOS DE CARGA

### **Spinner Estándar**
```css
.loader {
    border: 4px solid var(--reversa-blue);
    border-top: 4px solid var(--reversa-green);
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
```

### **Tamaños de Loaders**
- **XS**: `16px` - Para botones pequeños
- **SM**: `20px` - Para botones estándar
- **MD**: `40px` - Para contenido
- **LG**: `60px` - Para páginas completas

### **Loader Inline**
```html
<div class="loader-inline">
    <div class="loader loader-sm"></div>
    <span>Cargando datos...</span>
</div>
```

### **Skeleton Loading**
```css
.skeleton {
    background: linear-gradient(90deg, var(--neutral-200) 25%, var(--neutral-300) 50%, var(--neutral-200) 75%);
    background-size: 200% 100%;
    animation: skeleton-loading 1.5s infinite;
    border-radius: 4px;
}

@keyframes skeleton-loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}
```

---

## 📋 TABLAS

### **Tabla Estándar**
```css
.table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid var(--neutral-400);
    border-radius: 8px;
    overflow: hidden;
}

.table th,
.table td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid var(--neutral-400);
}

.table th {
    background: var(--neutral-100);
    font-weight: 600;
    color: var(--reversa-blue);
}

.table tr:hover {
    background: var(--neutral-50);
}

.table tr.selected {
    background: rgba(4,219,141,.05);
}
```

---

## 📱 RESPONSIVE DESIGN

### **Breakpoints**
```css
/* Mobile */
@media (max-width: 768px) {
    .grid-2, .grid-3, .grid-4 {
        grid-template-columns: 1fr;
    }
    
    .section {
        padding: 20px;
    }
    
    .modal-content {
        width: 95%;
        padding: 24px;
    }
}
```

### **Adaptabilidad**
- **Grids**: Colapsan a una columna en móvil
- **Botones**: Mantienen tamaño mínimo táctil (44px)
- **Modales**: Se adaptan al ancho de pantalla
- **Texto**: Escalas proporcionalmente

---

## 🎯 PATRONES DE INTERACCIÓN

### **1. Confirmación de Acciones Destructivas**
```javascript
// Para eliminar listas
deleteListHandler(listId) {
    showConfirmationModal({
        title: 'Eliminar Lista',
        message: '¿Estás seguro de que quieres eliminar esta lista? Esta acción no se puede deshacer.',
        confirmText: 'Eliminar',
        type: 'danger',
        onConfirm: () => this.deleteList(listId)
    });
}
```

### **2. Feedback de Operaciones**
```javascript
// Después de operaciones exitosas
showSuccessBanner('Lista eliminada correctamente');

// Para errores
showErrorBanner('Error al eliminar la lista. Inténtalo de nuevo.');
```

### **3. Estados de Carga**
```javascript
// Durante procesamiento IA
button.innerHTML = '<div class="loader loader-xs"></div> Generando...';
button.disabled = true;

// Al completar
button.innerHTML = 'Generar Contenido';
button.disabled = false;
```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### **Antes de Implementar Componentes:**
- [ ] ¿Usa la paleta de colores Reversa?
- [ ] ¿Sigue las medidas de espaciado estándar?
- [ ] ¿Incluye estados hover/focus/disabled?
- [ ] ¿Es responsive para móvil?
- [ ] ¿Usa la tipografía Satoshi?

### **Para Acciones de Usuario:**
- [ ] ¿Las confirmaciones usan modal estándar?
- [ ] ¿Los errores muestran banners informativos?
- [ ] ¿Los procesos largos tienen loaders?
- [ ] ¿Los estados de éxito son visibles?

### **Para Accesibilidad:**
- [ ] ¿Los botones tienen contraste suficiente?
- [ ] ¿Los focus states son visibles?
- [ ] ¿Los modales pueden cerrarse con ESC?
- [ ] ¿El contenido es navegable por teclado?

---

## 🚫 QUÉ NO HACER

### **Prohibido Totalmente:**
- ❌ Usar `alert()`, `confirm()` o `prompt()`
- ❌ Botones verdes como estándar
- ❌ Colores fuera de la paleta definida
- ❌ Sombras excesivas o efectos llamativos
- ❌ Tipografías diferentes a Satoshi
- ❌ Border-radius inconsistentes

### **Evitar:**
- ⚠️ Animaciones largas (>300ms)
- ⚠️ Colores saturados para texto
- ⚠️ Espaciados no múltiplos de 4px
- ⚠️ Componentes sin estados hover
- ⚠️ Feedback visual insuficiente

---

Este estándar debe seguirse estrictamente para mantener la consistencia visual y de experiencia de usuario en toda la plataforma Papyrus AI. 