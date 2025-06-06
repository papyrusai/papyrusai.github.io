/************************************************
 * new_users.js
 *
 * To run:
 *   node new_users.js
 *
 * Envía un reporte semanal con información de usuarios nuevos
 * y usuarios que iniciaron registro pero no completaron onboarding
 ************************************************/
const { MongoClient, ObjectId } = require('mongodb');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const moment = require('moment');
const path = require('path');

require('dotenv').config();

// 1) Configuration
const MONGODB_URI = process.env.DB_URI;
const DB_NAME = 'papyrus';

// Calculate date range for last 7 days
const TODAY = moment().utc();
const SEVEN_DAYS_AGO = TODAY.clone().subtract(7, 'days');

// Format dates for the report
const todayString = TODAY.format('YYYY-MM-DD');
const sevenDaysAgoString = SEVEN_DAYS_AGO.format('YYYY-MM-DD');

console.log(`Generating report for dates: ${sevenDaysAgoString} to ${todayString}`);

// 2) Setup nodemailer with SendGrid transport
const transporter = nodemailer.createTransport(
  sgTransport({
    auth: {
      api_key: process.env.SENDGRID_API_KEY
    }
  })
);

/**
 * Check if a date string (YYYY-MM-DD) is within the last 7 days
 */
function isDateInLast7Days(dateString) {
  if (!dateString) return false;
  
  const date = moment(dateString, 'YYYY-MM-DD');
  return date.isBetween(SEVEN_DAYS_AGO, TODAY, 'day', '[]'); // inclusive of both ends
}

/**
 * Check if a full datetime string is within the last 7 days (extract YYYY-MM-DD part)
 */
function isDateTimeInLast7Days(dateTimeString) {
  if (!dateTimeString) return false;
  
  // Extract YYYY-MM-DD from datetime string like "2025-06-04T11:04:33.745+00:00"
  const dateOnly = moment(dateTimeString).format('YYYY-MM-DD');
  return isDateInLast7Days(dateOnly);
}

/**
 * Count the number of keys in etiquetas_personalizadas object
 */
function countEtiquetasPersonalizadas(etiquetasObj) {
  if (!etiquetasObj || typeof etiquetasObj !== 'object') return 0;
  return Object.keys(etiquetasObj).length;
}

/**
 * Generate HTML table for users
 */
function generateUsersTable(users, tableTitle) {
  if (users.length === 0) {
    return `
      <h3>${tableTitle}</h3>
      <p>No hay usuarios en esta categoría.</p>
    `;
  }

  const tableRows = users.map(user => `
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">${user.email || 'N/A'}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${user.registration_date || user.first_date_registration_formatted || 'N/A'}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${user.subscription_plan || 'N/A'}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${user.promotion_code || 'N/A'}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${user.etiquetas_count}</td>
    </tr>
  `).join('');

  return `
    <h3>${tableTitle}</h3>
    <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px;">
      <thead>
        <tr style="background-color: #f2f2f2;">
          <th style="border: 1px solid #ddd; padding: 8px;">Email</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Fecha Registro</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Plan Suscripción</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Código Promoción</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Etiquetas Personalizadas</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
    <p><strong>Total usuarios:</strong> ${users.length}</p>
  `;
}

/**
 * Send the new users report email
 */
async function sendNewUsersReport(completedUsers, incompleteUsers) {
  const reportHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Reporte Usuarios Nuevos - Últimos 7 días</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          line-height: 1.6;
        }
        h1 {
          color: #04db8d;
          text-align: center;
        }
        h3 {
          color: #0c2532;
          margin-top: 30px;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin-bottom: 20px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #f2f2f2;
          font-weight: bold;
        }
        .date-range {
          background-color: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
          margin-bottom: 20px;
          text-align: center;
          border-left: 4px solid #04db8d;
        }
        .summary {
          background-color: #e8f5e8;
          padding: 15px;
          border-radius: 5px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <h1>Reporte Usuarios Nuevos</h1>
      
      <div class="date-range">
        <strong>Período del reporte:</strong> ${sevenDaysAgoString} al ${todayString} (últimos 7 días)
      </div>
      
      <div class="summary">
        <h3>Resumen</h3>
        <ul>
          <li><strong>Usuarios con onboarding completado:</strong> ${completedUsers.length}</li>
          <li><strong>Usuarios con registro iniciado pero onboarding incompleto:</strong> ${incompleteUsers.length}</li>
          <li><strong>Total usuarios nuevos:</strong> ${completedUsers.length + incompleteUsers.length}</li>
        </ul>
      </div>

      ${generateUsersTable(completedUsers, '1. Usuarios registrados en últimos 7 días')}
      
      ${generateUsersTable(incompleteUsers, '2. Usuarios con registro iniciado pero sin completar onboarding')}
      
      <hr>
      <p style="font-size: 12px; color: #666; text-align: center;">
        Reporte generado automáticamente el ${moment().format('YYYY-MM-DD HH:mm:ss')} UTC
      </p>
    </body>
    </html>
  `;

  const mailOptions = {
    from: 'Reversa <info@reversa.ai>',
    to: 'info@reversa.ai',
    subject: `Reporte Usuarios Nuevos - ${sevenDaysAgoString} al ${todayString}`,
    html: reportHTML
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('New users report email sent successfully to info@reversa.ai');
  } catch (err) {
    console.error('Error sending new users report email:', err);
    throw err;
  }
}

// MAIN EXECUTION
(async () => {
  let client;
  try {
    client = new MongoClient(MONGODB_URI, {});
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(DB_NAME);
    const usersCollection = db.collection('users');

    // Get all users from the database
    const allUsers = await usersCollection.find({}).toArray();
    console.log(`Total users in database: ${allUsers.length}`);

    // 1. Filter users with registration_date in last 7 days (completed onboarding)
    const completedUsers = allUsers
      .filter(user => user.registration_date && isDateInLast7Days(user.registration_date))
      .map(user => ({
        ...user,
        etiquetas_count: countEtiquetasPersonalizadas(user.etiquetas_personalizadas)
      }))
      .sort((a, b) => {
        // First sort by registration_date (most recent first)
        const dateCompare = moment(b.registration_date).diff(moment(a.registration_date));
        if (dateCompare !== 0) return dateCompare;
        
        // Then within same date, sort by promotion_code ("no" first, then others)
        const aPromo = a.promotion_code || '';
        const bPromo = b.promotion_code || '';
        
        if (aPromo === 'no' && bPromo !== 'no') return -1;
        if (aPromo !== 'no' && bPromo === 'no') return 1;
        return aPromo.localeCompare(bPromo);
      });

    console.log(`Users with completed onboarding in last 7 days: ${completedUsers.length}`);

    // Get the emails of completed users to exclude them from incomplete list
    const completedUserEmails = new Set(completedUsers.map(user => user.email?.toLowerCase()));

    // 2. Filter users with first_date_registration in last 7 days but NOT in completed list
    const incompleteUsers = allUsers
      .filter(user => {
        // Must have first_date_registration in last 7 days
        if (!user.first_date_registration || !isDateTimeInLast7Days(user.first_date_registration)) {
          return false;
        }
        
        // Must NOT be in the completed users list
        return !completedUserEmails.has(user.email?.toLowerCase());
      })
      .map(user => ({
        ...user,
        etiquetas_count: countEtiquetasPersonalizadas(user.etiquetas_personalizadas),
        first_date_registration_formatted: moment(user.first_date_registration).format('YYYY-MM-DD')
      }))
      .sort((a, b) => {
        // Sort by first_date_registration (most recent first)
        const dateCompare = moment(b.first_date_registration).diff(moment(a.first_date_registration));
        if (dateCompare !== 0) return dateCompare;
        
        // Then within same date, sort by promotion_code ("no" first, then others)
        const aPromo = a.promotion_code || '';
        const bPromo = b.promotion_code || '';
        
        if (aPromo === 'no' && bPromo !== 'no') return -1;
        if (aPromo !== 'no' && bPromo === 'no') return 1;
        return aPromo.localeCompare(bPromo);
      });

    console.log(`Users with incomplete onboarding in last 7 days: ${incompleteUsers.length}`);

    // Send the report email
    await sendNewUsersReport(completedUsers, incompleteUsers);

    console.log('Report generation completed successfully');
    await client.close();

  } catch (err) {
    console.error('Error generating new users report:', err);
    if (client) {
      await client.close();
    }
    process.exit(1);
  }
})();
