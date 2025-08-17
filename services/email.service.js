/*
Email Service: Centralized email functionality using SendGrid
Functions:
- sendPasswordResetEmail: Send password reset email with secure token
- sendSubscriptionEmail: Send subscription confirmation email with user details
*/
const sgMail = require('@sendgrid/mail');
const path = require('path');

// Initialize SendGrid with API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Helper function to format string to uppercase (used in subscription email)
function toUpperCase(str) {
  return str ? str.toUpperCase() : str;
}

/**
 * Send password reset email with secure token
 * @param {string} email - User's email address
 * @param {string} resetToken - Secure reset token
 */
async function sendPasswordResetEmail(email, resetToken) {
  const resetUrl = `https://app.reversa.ai/reset-password.html?token=${resetToken}`;
  
  const emailHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperación de Contraseña - Reversa</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f8f8f8;
      margin: 0;
      padding: 20px;
      color: #0b2431;
    }
    
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .header {
      background-color: #0b2431;
      padding: 24px;
      text-align: center;
    }
    
    .header h2 {
      color: #ffffff;
      margin: 0;
      font-size: 24px;
    }
    
    .content {
      padding: 32px;
    }
    
    h1 {
      color: #04db8d;
      font-size: 24px;
      margin-bottom: 16px;
    }
    
    p {
      line-height: 1.6;
      margin-bottom: 16px;
      color: #0b2431;
    }
    
    .btn {
      display: inline-block;
      background-color: #04db8d;
      color: white;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 4px;
      font-weight: 500;
      text-align: center;
      margin: 20px 0;
    }
    
    .btn:hover {
      background-color: #03c57f;
    }
    
    .footer {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      font-size: 14px;
      color: #455862;
    }
    
    .footer a {
      color: #04db8d;
      text-decoration: none;
    }
    
    .warning {
      background-color: #fff3cd;
      border: 1px solid #ffeaa7;
      border-radius: 4px;
      padding: 12px;
      margin: 16px 0;
      color: #856404;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Reversa</h2>
    </div>
    
    <div class="content">
      <h1>Recuperación de Contraseña</h1>
      
      <p>Has solicitado restablecer tu contraseña de Reversa. Para crear una nueva contraseña, haz clic en el siguiente botón:</p>
      
      <div style="text-align: center;">
        <a href="${resetUrl}" class="btn">Restablecer Contraseña</a>
      </div>
      
      <div class="warning">
        <strong>Importante:</strong> Este enlace expirará en 1 hora por motivos de seguridad.
      </div>
      
      <p>Si no solicitaste este cambio de contraseña, puedes ignorar este correo de forma segura. Tu contraseña actual seguirá siendo válida.</p>
      
      <p>Por tu seguridad, nunca compartas este enlace con nadie.</p>
      
      <div class="footer">
        <p>© Reversa Legal, ${new Date().getFullYear()}. Todos los derechos reservados.</p>
        <p>
          Si tienes alguna pregunta, puedes contactarnos en
          <a href="mailto:info@reversa.ai">info@reversa.ai</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
  
  const msg = {
    to: email,
    from: 'info@reversa.ai',
    subject: 'Recuperación de Contraseña - Reversa',
    html: emailHtml
  };
  
  try {
    await sgMail.send(msg);
    console.log(`Password reset email sent successfully to ${email}`);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    if (error.response && error.response.body && error.response.body.errors) {
      console.error('SendGrid error details:', JSON.stringify(error.response.body.errors, null, 2));
    }
    throw error;
  }
}

/**
 * Send subscription confirmation email with user details
 * @param {Object} user - User object with email
 * @param {Object} userData - User data with subscription details
 */
async function sendSubscriptionEmail(user, userData) {
  try {
    if (!user || !user.email) {
      console.error('No se puede enviar correo: usuario o email no definido');
      return false;
    }
    
    // Determinar el nombre y precio del plan
    let planName = 'Indeterminado';
    let planPrice = '-';
    
    switch (userData.subscription_plan) {
      case 'plan1':
        planName = 'Starter';
        planPrice = '66€';
        break;
      case 'plan2':
        planName = 'Pro';
        planPrice = '120€';
        break;
      case 'plan3':
        planName = 'Enterprise';
        planPrice = 'Custom';
        break;
      case 'plan4':
      planName = 'Free';
      planPrice = '0€';
      break;
    }
    
    // Preparar las etiquetas personalizadas
    const etiquetasList = [];
    if (userData.etiquetas_personalizadas && typeof userData.etiquetas_personalizadas === 'object') {
      Object.keys(userData.etiquetas_personalizadas).forEach(key => {
        etiquetasList.push(key);
      });
    }
    
    // Si no hay etiquetas, añadir un mensaje predeterminado
    if (etiquetasList.length === 0) {
      etiquetasList.push('No especificadas');
    }
    
    // Preparar la cobertura legal con manejo seguro de valores nulos y compatibilidad con múltiples formatos
    let coberturaLegal = 'No especificada';
    if (userData.cobertura_legal && typeof userData.cobertura_legal === 'object') {
      const fuentes = [];
      
      // Fuentes gobierno - compatible con múltiples formatos
      const fuentesGobierno = userData.cobertura_legal['fuentes-gobierno'] || 
                             userData.cobertura_legal.fuentes_gobierno || 
                             userData.cobertura_legal.fuentes || [];
      if (Array.isArray(fuentesGobierno) && fuentesGobierno.length > 0) {
        fuentes.push(...fuentesGobierno);
      }
      
      // Fuentes reguladores - compatible con múltiples formatos
      const fuentesReguladores = userData.cobertura_legal['fuentes-reguladores'] || 
                                userData.cobertura_legal.fuentes_reguladores ||
                                userData.cobertura_legal['fuentes-regulador'] ||  // Para usuarios muy antiguos
                                userData.cobertura_legal.reguladores || [];
      if (Array.isArray(fuentesReguladores) && fuentesReguladores.length > 0) {
        fuentes.push(...fuentesReguladores);
      }
      
      if (fuentes.length > 0) {
        coberturaLegal = fuentes.join(', ');
      }
    }
    coberturaLegal = toUpperCase(coberturaLegal);
    
    // Preparar los rangos con manejo seguro de valores nulos
    const rangosList = Array.isArray(userData.rangos) && userData.rangos.length > 0 
                      ? userData.rangos 
                      : ['No especificados'];
    
    // Análisis de impacto (puedes ajustar esto según tu lógica de negocio)
    const analisisImpacto = userData.subscription_plan === 'plan1' ? '50 llamadas/mes' : 
                          (userData.subscription_plan === 'plan2' ? '500 llamadas/mes' : 
                            userData.subscription_plan === 'plan3' ? '500 llamadas/mes/usuario' :'No incluido'
                          );
    
    // Obtener el año actual para el footer
    const currentYear = new Date().getFullYear();
    
    // Construir el HTML del correo electrónico
    const emailHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmación de Suscripción a Reversa</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f8f8f8;
      margin: 0;
      padding: 20px;
      color: #0b2431;
    }
    
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .header {
      background-color: #0b2431;
      padding: 24px;
      text-align: center;
    }
    
    .header img {
      height: 48px;
    }
    
    .content {
      padding: 32px;
      font-family: Georgia, serif;
    }
    
    h1 {
      color: #04db8d;
      font-size: 24px;
      margin-bottom: 16px;
      font-family: Georgia, serif;
    }
    
    p {
      line-height: 1.6;
      margin-bottom: 16px;
      color: #0b2431;
    }
    
    .subscription-details {
      background-color: #f8f8f8;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
    }
    
    .subscription-details h2 {
      font-size: 20px;
      color: #455862;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e0e0e0;
      font-family: Georgia, serif;
    }
    
    .details-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
    }
    
    @media (min-width: 500px) {
      .details-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
    
    .details-label {
      font-size: 14px;
      color: #455862;
      margin-bottom: 4px;
    }
    
    .details-value {
      font-weight: 500;
      margin-bottom: 12px;
      color: #0b2431;
    }
    
    ul {
      margin: 0;
      padding-left: 20px;
    }
    
    .btn {
      display: inline-block;
      background-color: #04db8d;
      color: white;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 4px;
      font-weight: 500;
      text-align: center;
      transition: background-color 0.3s;
    }
    
    .btn:hover {
      background-color: #03c57f;
    }
    
    .text-center {
      text-align: center;
    }
    
    .footer {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      font-size: 14px;
      color: #455862;
    }
    
    .footer a {
      color: #04db8d;
      text-decoration: none;
    }
    
    .footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="cid:reversaLogo" alt="Reversa Logo">
    </div>
    
    <div class="content">
      <h1>Confirmación de Suscripción</h1>
      
      <p id="greeting">Estimado/a ${userData.name || 'Usuario'},</p>
      
      <p>
         Como bien sabría decir un viejo jurista, en el complejo tablero de la ley, quien domina la información, 
        domina el juego. Y ahora, con Reversa, tienes las mejores cartas en la mano.
      </p>
      
      <p>
        No se trata simplemente de un servicio. Al contratar Reversa eliges tranquilidad: estarás siempre al día 
        y contarás con una guía clara sobre riesgos jurídicos y novedades regulatorias.
      </p>
      
      <div class="subscription-details">
        <h2>Detalles de tu suscripción</h2>
        
        <div class="details-grid">
          <div>
            <p class="details-label">Nombre del Plan</p>
            <p class="details-value" id="plan-name">${planName}</p>
            
            <p class="details-label">Precio</p>
            <p class="details-value" id="plan-price">${planPrice}</p>
            
            <p class="details-label">Cobertura Legal</p>
            <p class="details-value" id="cobertura-legal">${coberturaLegal}</p>
            
            <p class="details-label">Etiquetas Personalizadas</p>
            <ul class="details-value" id="etiquetas-list">
              ${etiquetasList.map(etiqueta => `<li>${etiqueta}</li>`).join('')}
            </ul>
          </div>
          
          <div>
            <p class="details-label">Rangos</p>
            <ul class="details-value" id="rangos-list">
              ${rangosList.map(rango => `<li>${rango}</li>`).join('')}
            </ul>
            
            <p class="details-label">Análisis de Impacto</p>
            <p class="details-value" id="analisis-impacto">${analisisImpacto}</p>
          </div>
        </div>
      </div>
      
      <p>
        Recuerda que recibirás el resultado de tu scanner normativo de manera diaria, pudiendo consultar en todo momento el análisis del impacto a través de la app
      </p>
      
      <div class="text-center" style="margin-bottom: 24px;">
        <a href="https://reversa.ai" class="btn">Acceder a mi cuenta</a>
      </div>
      
      <p><em>La inteligencia es la capacidad de adaptarse al cambio.</em></p>
<p style="text-align: right;"><strong>— Stephen Hawking</strong></p>


      <p>
        Atentamente,
      </p>
      
      <p style="font-weight: 500;">
        El equipo de Reversa
      </p>
      
      <div class="footer">
        <p style="margin-bottom: 8px;">© Reversa Legal, ${currentYear}. Todos los derechos reservados.</p>
        <p>
          Si tiene alguna pregunta, puede contactarnos en
          <a href="mailto:info@reversa.ai">info@reversa.ai</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
    
    // Configurar el mensaje de correo electrónico
    const msg = {
      to: user.email,
      from: 'info@reversa.ai', // Ajusta esto a tu dirección de correo verificada en SendGrid
      subject: 'Confirmación de Suscripción a Reversa',
      html: emailHtml,
       attachments: [
                {
                  filename: 'reversa_white.png',
                  path: path.join(__dirname, '..', 'assets', 'reversa_white.png'),
                  cid: 'papyrusLogo'
                }
              ]
    };
    
    // Enviar el correo electrónico
    await sgMail.send(msg);
    console.log(`Correo de confirmación enviado a ${user.email}`);
    return true;
  } catch (error) {
    console.error('Error al enviar el correo de confirmación:', error);
    // No lanzamos el error para que no interrumpa el flujo principal
    return false;
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendSubscriptionEmail
}; 