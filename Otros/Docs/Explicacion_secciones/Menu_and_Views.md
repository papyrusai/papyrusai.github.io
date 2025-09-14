# Documentación: Sistema de Navegación SPA - Menu y Vistas

## Resumen General

La aplicación Papyrus utiliza un sistema de navegación Single Page Application (SPA) que permite cambiar entre diferentes vistas sin recargar la página completa. El sistema está basado en un sidebar menu que controla el contenido del área principal (`main-content`).

## Arquitectura del Sistema

### Estructura Principal

```
profile.html
├── sidebar (menu lateral fijo)
│   ├── sidebar-novedades (contexto normativas)
│   └── sidebar-consultas (contexto consultas públicas)
└── main-content (área de contenido dinámico)
    ├── content-agentes (.vision-section)
    ├── content-boletin (.vision-section)
    ├── content-busqueda (.vision-section)
    ├── content-listas (.vision-section)
    ├── content-configuracion (.vision-section)
    ├── content-admin (.vision-section)
    ├── content-internal (.vision-section)
    └── content-radar-consultas (.vision-section)
```

### Componentes Clave

1. **Sidebar Menu**: Navegación fija que permanece constante
2. **Vision Sections**: Contenedores de contenido que se muestran/ocultan dinámicamente
3. **Content Loaders**: Funciones que cargan contenido HTML externo
4. **State Management**: Sistema de estados para evitar recargas innecesarias

## Sistema de Vistas

### 1. Vista de Agentes (content-agentes)

**Archivos involucrados:**
- `views/tracker/tracker.html` (modo normal)
- `views/analisis/norma.html` (modo análisis)

**Función de carga:** `loadTrackerContent(callback, forceReload)`

**Características especiales:**
- Dual mode: tracker normal vs análisis de documentos
- URL parameters: `?view=analisis&documentId=X&collectionName=Y`
- Background: blanco para tracker, degradado verde para análisis

**Estados:**
```javascript
window.trackerContentLoaded = false;
window.trackerContentLoading = false;
window.trackerInitialized = false;
window.analisisContentLoaded = false;
window.analisisContentLoading = false;
```

### 2. Vista de Boletín Diario (content-boletin)

**Archivo:** `views/boletindiario/boletindiario.html`
**Función de carga:** `loadBoletinDiarioContent(callback)`
**URL parameter:** `?view=boletin`

### 3. Vista de Búsqueda/Estadísticas (content-busqueda)

**Archivo:** `views/busqueda_estadisticas/busqueda_estadisticas.html`
**Función de carga:** `loadBusquedaContent(callback)`

### 4. Vista de Configuración (content-configuracion)

**Archivo:** `views/configuracion/configuracion_cuenta.html`
**Función de carga:** `loadConfiguracionContent()`
**URL parameter:** `?view=configuracion&tab=X`

### 5. Vista de Listas (content-listas)

**Archivo:** `views/tuslistas/tuslistas.html`
**Función de carga:** `loadTusListasContent(callback)`

## Flujo de Navegación

### 1. Navegación Normal (Sidebar)

```javascript
// En profile.html - handleSectionChange()
function handleSectionChange(targetId) {
    // 1. Ocultar todas las secciones
    document.querySelectorAll('.vision-section').forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });
    
    // 2. Mostrar sección objetivo
    const targetSection = document.getElementById(targetId);
    targetSection.style.display = 'block';
    targetSection.classList.add('active');
    
    // 3. Cargar contenido específico
    if (targetId === 'content-agentes') {
        loadTrackerContent();
    } else if (targetId === 'content-boletin') {
        loadBoletinDiarioContent();
    }
    // ... etc
}
```

### 2. Navegación con URL Parameters

```javascript
// Detección de parámetros al cargar
const urlParams = new URLSearchParams(window.location.search);
const viewParam = urlParams.get('view');

if (viewParam === 'analisis') {
    // Modo análisis especial
    showAnalysisView();
} else if (viewParam === 'boletin') {
    // Mostrar boletín
    showBoletinView();
}
```

### 3. Navegación SPA desde Enlaces

```javascript
// Interceptación de enlaces "Analizar documento"
document.body.addEventListener('click', function(e) {
    const impactoLink = e.target.closest('.button-impacto');
    if (impactoLink && href.includes('/profile?view=analisis')) {
        e.preventDefault();
        // Navegación SPA sin reload
        updateURL();
        switchToAnalysisView();
        loadAnalisisContent();
    }
});
```

## Sistema de Carga de Contenido

### Patrón de Carga Estándar

Todas las funciones de carga siguen este patrón:

```javascript
function loadXContent(callback, forceReload = false) {
    // 1. Verificar si ya está cargado
    if (contentLoaded && !forceReload) {
        if (callback) callback();
        return;
    }
    
    // 2. Evitar cargas duplicadas
    if (contentLoading) return;
    contentLoading = true;
    
    // 3. Fetch del HTML
    fetch('views/x/x.html')
        .then(response => response.text())
        .then(html => {
            // 4. Parse y extracción
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // 5. Inyección de estilos
            doc.querySelectorAll('style, link').forEach(styleEl => {
                document.head.appendChild(styleEl.cloneNode(true));
            });
            
            // 6. Inyección de contenido
            container.innerHTML = doc.body.innerHTML;
            
            // 7. Ejecución de scripts
            executeScripts(doc.querySelectorAll('script'));
            
            // 8. Actualizar estados
            contentLoaded = true;
            contentLoading = false;
            
            // 9. Callback
            if (callback) callback();
        });
}
```

### Manejo de Scripts

Los scripts externos se cargan dinámicamente con resolución de rutas:

```javascript
const loadScript = (index) => {
    const script = scripts[index];
    const newScript = document.createElement('script');
    
    if (script.src) {
        // Resolver rutas relativas
        let resolvedSrc = script.getAttribute('src');
        if (!resolvedSrc.startsWith('http') && !resolvedSrc.startsWith('/')) {
            resolvedSrc = '/views/folder/' + resolvedSrc;
        }
        newScript.src = resolvedSrc;
        newScript.onload = () => loadScript(index + 1);
    } else {
        newScript.textContent = script.textContent;
        document.body.appendChild(newScript);
        loadScript(index + 1);
    }
};
```

## Gestión de Fondos y Estilos

### Sistema de Fondos Dinámicos

```javascript
// Fondo por defecto (CSS)
.vision-section {
    background-color: white;
    min-height: 100vh;
}

// Aplicación dinámica de degradado (análisis)
const mainContent = document.getElementById('main-content');
mainContent.style.background = 'radial-gradient(circle at 50% 0, rgba(4, 219, 141, 0.25) 0%, #ffffff 70%)';

// Limpieza de fondos (otras vistas)
mainContent.style.background = 'white';
```

### Reglas de Fondos

- **Por defecto**: Todas las vistas tienen fondo blanco
- **Vista de análisis**: Degradado verde en todo `main-content`
- **Transiciones**: Limpieza automática al cambiar de vista

## Casos Especiales

### 1. Vista de Análisis (Norma.html)

**Características únicas:**
- Se carga dentro de `content-agentes`
- Utiliza parámetros URL: `documentId` y `collectionName`
- Skeleton loaders para `normaShortName` y `normaExtraDetails`
- Degradado de fondo específico
- Navegación de vuelta con `backToAgentes`

**Flujo de carga:**
1. Click en "Analizar documento"
2. Interceptación del enlace
3. Actualización de URL sin reload
4. Mostrar loader en `content-agentes`
5. Cargar `norma.html` con `loadAnalisisContent()`
6. Aplicar degradado a `main-content`
7. Ejecutar `initializeNormaAnalysis()`

**Navegación de vuelta:**
```javascript
// backToAgentes en norma.html
backToAgentesBtn.addEventListener('click', (e) => {
    e.preventDefault();
    
    // Limpiar degradado
    mainContent.style.background = 'white';
    
    // Resetear estados
    window.analisisContentLoaded = false;
    window.trackerInitialized = false;
    
    // Cargar tracker con forceReload
    window.loadTrackerContent(callback, true);
});
```

### 2. Contexto Dual (Novedades vs Consultas)

La aplicación maneja dos contextos diferentes:
- **Novedades Normativas**: Sidebar principal
- **Consultas Públicas**: Sidebar alternativo

```javascript
// Cambio de contexto
window.currentContentType = 'novedades' | 'consultas';

// Mostrar sidebar correcto
document.getElementById('sidebar-novedades').style.display = 'block';
document.getElementById('sidebar-consultas').style.display = 'none';
```

## Estados y Variables Globales

### Estados de Carga

```javascript
// Tracker/Agentes
window.trackerContentLoaded = false;
window.trackerContentLoading = false;
window.trackerInitialized = false;

// Análisis
window.analisisContentLoaded = false;
window.analisisContentLoading = false;

// Otras vistas
let boletinDiarioContentLoaded = false;
let busquedaContentLoaded = false;
let tusListasLoaded = false;
// etc...
```

### Funciones Globales Clave

```javascript
window.loadTrackerContent(callback, forceReload)
window.loadAnalisisContent(callback)
window.initializeTracker()
window.initializeNormaAnalysis()
window.hidePageLoaderOverlay()
```

## Mejores Prácticas

### 1. Carga de Contenido
- Siempre verificar si el contenido ya está cargado
- Usar flags de loading para evitar cargas duplicadas
- Implementar callbacks para acciones post-carga
- Manejar errores gracefully con fallbacks

### 2. Gestión de Estados
- Resetear estados cuando sea necesario (forceReload)
- Exponer variables críticas globalmente cuando sea necesario
- Usar timeouts de seguridad para operaciones críticas

### 3. Navegación SPA
- Interceptar enlaces relevantes con `preventDefault()`
- Actualizar URL con `history.pushState()` sin reload
- Mantener sidebar states consistentes
- Limpiar estilos residuales entre vistas

### 4. Performance
- Usar límites en consultas de documentos (25-100 por página)
- Implementar paginación para grandes datasets
- Cache inteligente con sessionStorage
- Lazy loading de contenido no crítico

## Debugging y Troubleshooting

### Logs Útiles
```javascript
console.log('[loadXContent] Function called.');
console.log('[loadXContent] Content already loaded.');
console.log('[loadXContent] All scripts loaded.');
```

### Problemas Comunes

1. **Contenido no se carga**: Verificar estados de loading y flags
2. **Scripts no funcionan**: Verificar resolución de rutas relativas
3. **Estilos residuales**: Asegurar limpieza en transiciones
4. **Navegación rota**: Verificar interceptación de enlaces y URL updates

### Herramientas de Debug
- `window.trackerInitialized` - Estado del tracker
- `window.analisisContentLoaded` - Estado del análisis
- Network tab - Verificar cargas de recursos
- Console - Seguir logs de carga y navegación

## Conclusión

Este sistema SPA proporciona una experiencia de usuario fluida manteniendo el sidebar constante mientras cambia dinámicamente el contenido principal. La clave está en la gestión cuidadosa de estados, la carga inteligente de contenido y la limpieza apropiada de estilos y scripts entre transiciones.
