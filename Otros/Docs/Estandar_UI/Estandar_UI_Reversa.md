## Estandar de UI y Diseño - Reversa

### Objetivo
Guía de diseño consistente, minimalista y corporativa para toda la app. Sirve de contexto para la IA y para implementación rápida y coherente.

## Paleta de colores (tokens)
- **Brand**
  - Verde Reversa (`--reversa-green`): `#04db8d`  → Usar como acento/detalle, chips, estados OK, aros de foco, gráficos, pequeñas superficies.
  - Azul Reversa (`--reversa-blue`): `#0b2431`  → Color principal de fondo en botones filled, títulos y énfasis de texto.
  - Slate (`--reversa-slate`): `#455862`  → Soporte para textos secundarios, ítems laterales, separadores.
- **Neutrales**
  - `--neutral-50`: `#fafafa`
  - `--neutral-100`: `#f8f9fa`
  - `--neutral-200`: `#f1f1f1`
  - `--neutral-300`: `#e9ecef`
  - `--neutral-350`: `#e8ecf0`
  - `--neutral-400`: `#dee2e6`
  - `--neutral-500`: `#adb5bd`
  - `--neutral-600`: `#6c757d`
  - `--neutral-700`: `#495057`
- **Estado**
  - Error (`--error`): `#d32f2f`
  - Warning (`--warning-bg`): `#fff3cd`, (`--warning-fg`): `#856404`
  - Success (tinte verde): usar `rgba(4,219,141,.1)` sobre texto `#04db8d`
- **Gradientes**
  - `--gradient-reversa`: `linear-gradient(135deg, #04db8d 0%, #0b2431 100%)` (verde→azul)

```css
:root{
  --reversa-green:#04db8d; --reversa-blue:#0b2431; --reversa-slate:#455862;
  --neutral-50:#fafafa; --neutral-100:#f8f9fa; --neutral-200:#f1f1f1;
  --neutral-300:#e9ecef; --neutral-350:#e8ecf0; --neutral-400:#dee2e6;
  --neutral-500:#adb5bd; --neutral-600:#6c757d; --neutral-700:#495057;
  --error:#d32f2f; --warning-bg:#fff3cd; --warning-fg:#856404;
  --gradient-reversa: linear-gradient(135deg, #04db8d 0%, #0b2431 100%);
}
```

## Tipografía
- Primaria: Satoshi (400/500/600/700). Títulos y cuerpo.
- Alterna: Heebo opcional en piezas de marketing.
- Jerarquía recomendada (desktop):
  - H1: 28–32px / 700
  - H2: 22–24px / 600
  - H3: 18–20px / 600
  - Body: 14–16px / 400–500, line-height 1.5–1.7
- Accesibilidad: contraste >= 4.5:1, tamaños táctiles >= 44px.

## Botones
- Filosofía: minimalistas, dos familias principales. No usar verde sólido como estándar. Verde solo como acento o en gradiente para IA generativa.
- Forma: radio 20px, borde 1px.
- Estados: hover (ligero cambio de color/elevación), active (presión), disabled (opacidad 0.6, sin sombra), focus (aro 0 0 0 3px `rgba(11,36,49,.15)` o `rgba(4,219,141,.25)` si destaca).
- Tipos:
  - Outline (por defecto): fondo transparente, borde y texto `--reversa-blue`.
  - Filled (alternativo): fondo `--reversa-blue`, texto blanco.
  - IA Generativa: fondo `--gradient-reversa`, texto blanco. Usar solo para acciones que lanzan llamada a modelo.
  - Danger: fondo `--error`, texto blanco (acciones destructivas).
- Tamaños: sm (28–32px alto), md (36–40px), lg (44–48px).

```css
.btn{border-radius:20px;border:1px solid transparent;padding:.5rem 1rem;font-weight:600;transition:all .2s ease;display:inline-flex;align-items:center;gap:.5rem}
.btn:focus{outline:none;box-shadow:0 0 0 3px rgba(11,36,49,.15)}
.btn-outline{background:transparent;border-color:var(--reversa-blue);color:var(--reversa-blue)}
.btn-outline:hover{background:rgba(11,36,49,.04)}
.btn-filled{background:var(--reversa-blue);border-color:var(--reversa-blue);color:#fff}
.btn-filled:hover{filter:brightness(.95)}
.btn-ai{background:var(--gradient-reversa);border:0;color:#fff;box-shadow:0 4px 15px rgba(4,219,141,.25)}
.btn-ai:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(4,219,141,.35)}
.btn-danger{background:var(--error);border-color:var(--error);color:#fff}
.btn[disabled]{opacity:.6;pointer-events:none}
.btn-icon{padding:.4rem .6rem;border-radius:8px}
```

## Inputs y formularios
- Borde: 1px `--neutral-400`, radio 4px. Fondo blanco.
- Focus: borde `--reversa-green` y halo `rgba(4,219,141,.2)`.
- Placeholders `--neutral-600`. Checkbox y radio con `accent-color: var(--reversa-green)`.

## Contenedores y tarjetas (cards)
- Fondo: blanco. Borde 1px `--neutral-350`. Radio 12–16px.
- Sombra por defecto: `shadow-sm`. En hover: `shadow-md` y borde con tinte verde sutil.

```css
.card{background:#fff;border:1px solid var(--neutral-350);border-radius:16px;box-shadow:var(--shadow-sm)}
.card:hover{box-shadow:var(--shadow-md);border-color:rgba(4,219,141,.2)}
```

## Chips/Tags/Badges
- Chips de etiqueta personalizada: fondo `rgba(4,219,141,.1)`, texto `#04db8d`, radio total (9999px), padding compacto.
- Badges de nivel/estado: usar gamas suaves (warning/success) ya presentes.

## Banners y avisos
- Estilos: pill o barra con fondo blanco y borde 1px (slate) para info; barra con borde izquierdo de color para estados.
- Variantes: info (slate), success (tinte verde), warning (amarillo), error (rojo).
- Newsletter/upgrade: priorizar minimalismo, botón outline o filled azul.

## Modals
- Overlay: `rgba(0,0,0,.45)`. Contenedor 420–560px, radio 8–12px, sombra `shadow-lg`.
- Cerrar siempre disponible, teclado (Esc), foco contenido inicial, bloqueo de scroll, trap de foco.
- Botones: por defecto outline/filled azul. Solo usar verde en aros o detalles.

## Loaders y skeletons
- Tipos:
  - Página/Sección: overlay con spinner circular (50–80px), máximo 9999 z-index.
  - Inline: spinner 16px (icono FontAwesome o CSS), junto a acción.
  - Checkbox/acciones rápidas: spinner pequeño 12–16px en lugar del control.
  - Skeletons: listas/tablas con placeholders para cargas >600ms.
- Cuándo mostrarlos: si la operación puede exceder 300–500ms; para acciones instantáneas no mostrar.

```css
.loader{border:4px solid var(--reversa-blue);border-top:4px solid var(--reversa-green);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
```

## Navegación (sidebar y headers)
- Sidebar: fondo `--reversa-slate`, texto claro. Hover con tinte blanco.
- Activo: preferible resaltar con borde izquierdo y texto más claro; si se usa fondo, evitar llenar en verde salvo casos puntuales.
- Headers de secciones importantes: se puede usar `--gradient-reversa` en la franja/título con moderación.

## Tablas
- Bordes `--neutral-400`, header con peso 600, zebra opcional `--neutral-100`, estados de selección con tinte verde muy leve.

## Sombras y elevación
- Tokens:
```css
:root{
  --shadow-xs: 0 1px 2px rgba(0,0,0,.06);
  --shadow-sm: 0 2px 8px rgba(11,36,49,.08);
  --shadow-md: 0 4px 12px rgba(11,36,49,.12);
  --shadow-lg: 0 8px 32px rgba(11,36,49,.16);
}
```
- Usos: botones hover (`sm`), cards (`sm→md`), modals (`lg`), banners (`sm`).

## Motion y transiciones
- Duraciones: fast 150–200ms, normal 200–250ms, slow 300–350ms. Curva: `ease` o `cubic-bezier(.4,0,.2,1)`.
- Usar `transform/opacity`, evitar reflow. Respetar `prefers-reduced-motion`.

## Espaciado y grid
- Sistema 8px: 4/8/12/16/24/32.
- Contenido: padding secciones 16–32px; entre componentes 8–24px.

## Z-index
- Dropdown/menus: 1000–1100
- Sidebar: 900
- Headers fijos: 950
- Modals/overlays: 10000 (9999–10010 rango reservado)

## Accesibilidad
- Focus visible en todos los controles.
- Contrastes > 4.5:1; revisar combinaciones verde sobre blanco y azul sobre blanco.
- Targets táctiles >= 44px. Navegación por teclado completa.

## Patrones recomendados
- Listas/colecciones: usar skeletons, acciones inline con botones outline.
- Formularios: agrupación clara, títulos 18px/600, inputs con ayudas (placeholder/tooltip discreto).
- Acciones IA: botón `.btn-ai` (gradiente verde→azul), feedback de estado con loader inline y mensaje sutil.

## Ejemplos de uso
```html
<button class="btn btn-outline">Acción secundaria</button>
<button class="btn btn-filled">Acción principal</button>
<button class="btn btn-ai">Generar con IA</button>
```

---

## Desviaciones detectadas (no cambiar ahora)
- `public/styles/sidebar_styles.css` → `.sidebar-item.active` usa fondo verde (`var(--primary-color)`), contrario a “verde no como fill estándar”; sugerido: borde izq y texto claro, o filled azul.
- `public/styles/styles.css` → `#buscarBtn` usa fondo verde (`--primary-color`), preferible `.btn-filled` azul.
- `public/styles/tuslistas.css` → `.save-ok-btn`, `.new-list-btn.save`, `.export-btn`, `.modal-ok-btn` usan verde como fondo; preferible outline/filled azul (verde solo acento o gradiente IA).
- `public/styles/tuslistas.css` → `.generar-contenido-btn` usa gradiente azul→slate, para acción generativa se recomienda gradiente verde→azul.
- `public/styles/styles.css` → tipografía global mezcla Satoshi y Candara (body); estandarizar en Satoshi.
- `public/styles/styles.css` vs `sidebar_styles.css` → `body { margin:2% }` vs `body { margin:0 }` inconsistente; consolidar en layout shell.
- Sombras variadas sin tokens (`0 2px 4px`, `0 4px 12px`, `0 8px 32px`); migrar a `--shadow-*`.
- Radios heterogéneos (4/8/10/12/15/16/20); mantener: inputs 4/6px, cards 12–16px, botones 20px.

Notas: estos puntos son guía para converger; no se modifican automáticamente. Esta guía prioriza consistencia, minimalismo y el uso del verde como acento y en gradiente para IA.
