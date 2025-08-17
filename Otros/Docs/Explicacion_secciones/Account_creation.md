### User account creation and login workflow (Reversa)

Esta guía describe, en el orden en que lo experimenta el usuario, el flujo de alta, selección de plan, pago (o alternativas free/promoción), límites por plan/extras y cómo se persisten los datos. Incluye referencias directas a rutas y archivos del proyecto para facilitar el mantenimiento.

---

### 1) Registro y Login

- Registro manual (email/contraseña)
  - Endpoint: `POST /register` en `app.js`.
  - Validaciones: contraseñas coinciden, longitud mínima 7 y al menos un carácter especial.
  - Persistencia: crea usuario en `papyrus.users` con `email`, `password` hasheado (`bcrypt`), `first_date_registration`.
  - Sesión/Cookie: login automático tras registro y cookie `userEmail` (no httpOnly) para acceso desde frontend.

- Inicio de sesión (local)
  - Endpoint: `POST /login` en `app.js` (Passport Local Strategy).
  - Respuestas por tipo de dominio (auto aprovisionamiento):
    - `@cuatrecasas.com` → `processSpecialDomainUser` con defaults de plan y etiquetas de la firma.
    - Dirección especial A&O (`SPECIAL_ADDRESS`, placeholder en `app.js`) → `processAODomainUser`.
  - Redirecciones tras login:
    - Usuarios Cuatrecasas: `/profile_cuatrecasas`
    - Usuarios A&O: `/profile_a&o`
    - Usuario con plan activo: `/profile`
    - Usuario sin plan: `/onboarding/paso0.html`
  - Cookie `userEmail` para UI y gating de frontend (leída en `paso0.html`/`paso4.html`).

- Autenticación requerida en vistas
  - Middleware: `ensureAuthenticated` (`middleware/ensureAuthenticated.js` y helper en `app.js`).
  - Gating en frontend: scripts en `public/onboarding/paso0.html` y `public/onboarding/paso4.html` verifican `sessionStorage`/cookie `userEmail`; si no, redirigen a `index.html`.

---

### 2) Onboarding Paso 0: Selección de plan y promoción

- Archivo UI: `public/onboarding/paso0.html`.
- Funcionalidad clave:
  - Toggle mensual/anual (actualiza precios y forma del plan seleccionado).
  - Selección de plan: `plan1` (Free), `plan2` (Starter), `plan3` (Pro), `plan4` (Enterprise/Contacto).
  - Código promocional: `ReversaTrial1620`. Si válido, se guarda `promotion_code = yes` en `sessionStorage` y se activa flujo sin Stripe para `plan2/plan3`.
  - Botón Siguiente ejecuta:
    - `plan4` → redirección directa a agenda (`cal.com`).
    - `plan1` → `POST /save-free-plan`.
    - `plan2/plan3`:
      - Con promo válida → `POST /save-free-plan` (activa plan sin pasar por Stripe, `payment_status = promotion_approved`).
      - Sin promo → `POST /create-checkout-session` (Stripe Checkout).

---

### 3) Precios y límites por plan y extras

- Lógica de límites (backend canonical): `services/users.service.js#getUserLimits`.
  - `plan1` (Free): `limit_agentes: 0`, `limit_fuentes: 0`.
  - `plan2` (Starter): `limit_agentes: 5`, `limit_fuentes: 3`.
  - `plan3` (Pro): `limit_agentes: 10`, `limit_fuentes: 10`.
  - `plan4` (Enterprise): `limit_agentes: null`, `limit_fuentes: null` (ilimitado).
- Precios Stripe (en céntimos) y extras: `routes/billing.routes.js` → `POST /create-checkout-session`.
  - Base:
    - `plan2`: mensual 5600 (56€), anual 54000 (540€).
    - `plan3`: mensual 7000 (70€), anual 67200 (672€).
  - Extras recurrentes:
    - Agentes: mensual 2000 (20€) por paquete “Extra de 12 agentes personalizados”.
    - Fuentes: mensual 1500 (15€) por fuente (se multiplica por `numExtraFuentes`).
  - `plan4` devuelve `redirectUrl` a contacto (no Checkout).
- Límite de análisis de impacto (UI base; persistido según plan):
  - `plan2`: 50/mes; `plan3`: 500/mes; `plan4`: ilimitado (-1).

---

### 4) Pago con Stripe (Checkout) y metadatos

- Endpoint: `POST /create-checkout-session` en `routes/billing.routes.js`.
- Entradas relevantes (desde `paso0.html`/`paso4.html`): `plan`, `billingInterval`, `extra_agentes`, `extra_fuentes`, `impact_analysis_limit`, `industry_tags`, `sub_industria_map`, `rama_juridicas`, `profile_type`, `sub_rama_map`, `cobertura_legal`, `company_name`, `name`, `web`, `linkedin`, `perfil_profesional`, `rangos`, `feedback`, `etiquetas_personalizadas`, `isTrial`.
- Persistencia vía metadatos de Stripe:
  - Los objetos grandes se trocean en chunks `<key>_0..n` + `<key>_chunks` para esquivar límites de tamaño de metadata.
  - `metadata.user_id` se guarda siempre para vincular la sesión de pago con el usuario en DB.
- URLs de Checkout:
  - `success_url`: `${BASE_URL}/save-user?session_id={CHECKOUT_SESSION_ID}`.
  - `cancel_url`: `${BASE_URL}/views/onboarding/paso0.html`.

---

### 5) Guardado post-Stripe: consolidación de usuario

- Endpoint: `GET /save-user` en `routes/user.routes.js`.
  - Importante: existe una versión más antigua duplicada en `app.js`. Considerar mantener la versión de `routes/user.routes.js` como fuente de verdad y retirar la duplicada para evitar inconsistencias.
- Flujo:
  1) Recupera la `checkout.session` (expande `subscription` y `line_items`).
  2) Verifica `session.payment_status === 'paid'`.
  3) Resuelve el `user`:
     - `req.user` si existe; si no, recupera por `metadata.user_id` (y, fallback, por `session.customer_details.email`).
  4) Reconstruye objetos desde metadatos chunked y compone `reconstructedData`:
     - Campos: `industry_tags`, `sub_industria_map`, `rama_juridicas`, `sub_rama_map`, `cobertura_legal`, `rangos`, `feedback_login`, `etiquetas_personalizadas`, `subscription_plan`, `profile_type`, `company_name`, `name`, `web`, `linkedin`, `perfil_profesional`, `billing_interval`, `extra_agentes`, `extra_fuentes`, `impact_analysis_limit`, `limit_agentes`, `limit_fuentes`, `registration_date(_obj)`, `stripe_customer_id`, `stripe_subscription_id`, `payment_status`, `purchased_items`.
  5) Actualiza `papyrus.users` vía `updateOne({ _id }, { $set: reconstructedData }, { upsert: true })`.
  6) Envía email de confirmación (SendGrid) reutilizando `sendSubscriptionEmail`.
  7) Revalida sesión de usuario y setea cookie `userEmail`.
  8) Redirige a `/profile?view=configuracion`.

---

### 6) Alternativa Free y Promoción (sin Stripe)

- Endpoint: `POST /save-free-plan` en `routes/billing.routes.js`.
  - Se usa para `plan1` (siempre) y para `plan2/plan3` cuando hay promo válida en `paso0.html`.
  - Persiste:
    - Perfil/contexto (tags, ramas, cobertura, empresa, etc.)
    - `subscription_plan`, `registration_date(_obj)`, `etiquetas_personalizadas`, `promotion_code` (`yes|no`), `impact_analysis_limit`, `extra_agentes`, `extra_fuentes`, `payment_status` (`promotion_approved` si promo válida; si no, `free_plan`), `limit_agentes`, `limit_fuentes`.
  - Email de confirmación: sí (SendGrid).
  - Redirección: `/profile?view=configuracion`.

---

### 7) Edición / cambio / cancelación de suscripción

- Actualización de suscripción (sin Stripe)
  - Endpoint: `POST /update-subscription` en `routes/billing.routes.js`.
  - Actualiza los campos de perfil y recalcula límites con `getUserLimits(plan)`.

- Permanecer en plan2 con cambios de datos
  - Endpoint: `POST /save-same-plan2` en `routes/billing.routes.js`.

- Downgrade plan2 → plan1 y cancelación en Stripe
  - Endpoint: `POST /cancel-plan2` en `routes/billing.routes.js`.
  - Cancela `stripe_subscription_id` si está presente y baja a plan1 recalculando límites.

- Cancelación genérica de suscripción (y downgrade a plan1)
  - Endpoint: `POST /api/cancel-subscription` en `routes/billing.routes.js`.
  - Soporta prorrateo en Stripe, persiste `cancellation_date(_obj)`, `payment_status = canceled`, resetea extras y límites.

---

### 8) Lectura y actualización de datos de usuario (API de perfil)

- Mínimo usuario actual: `GET /api/current-user` en `routes/user.routes.js`.
- Perfil completo: `GET /api/get-user-data` en `routes/user.routes.js`.
  - Devuelve todos los campos utilizados por Configuración, incluyendo límites, estado de pago, `perfil_regulatorio`, etc.
- Actualización de campos permitidos: `POST /api/update-user-data` en `routes/user.routes.js`.
  - `allowedFields`: `etiquetas_personalizadas`, `cobertura_legal`, `rangos`, `accepted_email`, `limit_agentes`, `limit_fuentes`, `tipo_empresa`, `detalle_empresa`, `interes`, `tamaño_empresa`, `web`, `perfil_regulatorio`, `website_extraction_status`.

---

### 9) Métodos de pago y pruebas

- Método de pago: Stripe Checkout con tarjeta.
- Impuestos: `automatic_tax.enabled = true`, `tax_id_collection.enabled = true`.
- Trials: `isTrial` activa `subscription_data.trial_period_days = 15` (actualmente usado para `plan2`).
- Enterprise (`plan4`): no pasa por Stripe; se redirige a agenda.

---

### 10) Recuperación de contraseña (complementario al alta)

- Solicitud de reset: `POST /forgot-password` en `app.js`.
  - Genera `resetPasswordToken` + `resetPasswordExpires` (+1h) y envía email (SendGrid) con enlace a `features/reset-password.html`.
- Reset de contraseña: `POST /reset-password` en `app.js` (valida longitud y carácter especial, hashea y limpia el token).

---

### 11) Archivos y rutas clave

- Backend
  - `routes/billing.routes.js`: creación de Checkout, actualización de suscripción, free/promo, cancelación, etc.
  - `routes/user.routes.js`: consolidación post-Stripe (`/save-user`), lectura/actualización de perfil.
  - `services/users.service.js`: `getUserLimits`, provisionamiento especial (Cuatrecasas/A&O).
  - `app.js`: registro/login local, cookies, rutas estáticas, duplicados legacy de `/save-user` y `/save-free-plan`, endpoints de feedback y utilidades.
- Frontend (Onboarding)
  - `public/onboarding/paso0.html`: selección de plan, promo, gating por cookie, llamada a `/save-free-plan` o `/create-checkout-session`.
  - `public/onboarding/paso4.html`: confirmación de suscripción, envío de payload completo a backend y redirección a Checkout si aplica.

---

### 12) Notas de implementación y recomendaciones

- Duplicidades legacy:
  - `GET /save-user` y `POST /save-free-plan` existen tanto en `app.js` como en rutas modulares. Usar y mantener la versión de `routes/*.routes.js` y retirar las duplicadas en `app.js` para evitar rutas conflictivas.
- Límites por plan:
  - Centralizar en `services/users.service.js#getUserLimits` (ya referenciado desde rutas) para coherencia.
- Cookies y seguridad:
  - `userEmail` se establece con `httpOnly: false` para uso frontend; mantener `secure` y `sameSite` condicionados a `NODE_ENV` como en el código actual.

---

### 13) Resumen del recorrido del usuario

1) Se registra o inicia sesión (`/register` o `/login`).
2) Si no tiene plan, va a `paso0` y elige plan y periodo; opcionalmente aplica promoción.
3) Si el plan requiere pago sin promo → Stripe Checkout (`/create-checkout-session`).
4) Al volver de Stripe (`/save-user`), se persiste todo el perfil y compra; se envía email de confirmación.
5) Si eligió Free o promo → se guarda inmediatamente con `/save-free-plan` y se envía email.
6) Accede al panel `/profile?view=configuracion`; puede consultar y actualizar datos vía APIs de perfil. 