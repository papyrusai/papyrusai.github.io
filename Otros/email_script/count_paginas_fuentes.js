/************************************************
 * count_paginas_fuentes.js
 *
 * To run:
 *   node count_paginas_fuentes.js
 *
 * Generates a table with months as columns and collections as rows,
 * showing the count of pages for each collection per month.
 * Sends the result via email to info@reversa.ai
 ************************************************/
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const moment = require('moment');

require('dotenv').config();

// Configuration
const MONGODB_URI = process.env.DB_URI;
const DB_NAME = 'papyrus';

// Setup nodemailer with SendGrid transport
const transporter = nodemailer.createTransport(
  sgTransport({
    auth: {
      api_key: process.env.SENDGRID_API_KEY
    }
  })
);

/**
 * Get all unique collections from logs
 */
async function getAllCollectionsFromLogs(db) {
  try {
    const logsCollection = db.collection('logs');
    const logs = await logsCollection.find({}).toArray();
    
    const collectionsSet = new Set();
    
    for (const log of logs) {
      if (log.collections) {
        Object.keys(log.collections).forEach(collectionName => {
          collectionsSet.add(collectionName);
        });
      }
    }
    
    return Array.from(collectionsSet).sort();
  } catch (err) {
    console.error('Error getting collections from logs:', err);
    return [];
  }
}

/**
 * Get page count data organized by month and collection
 */
async function getPageCountData(db) {
  try {
    const logsCollection = db.collection('logs');
    const logs = await logsCollection.find({}).toArray();
    
    const monthlyData = {}; // { "YYYY-MM": { "BOE": pageCount, "DOUE": pageCount, ... } }
    const allCollections = new Set();
    
    for (const log of logs) {
      if (log["date_range"] && log["date_range"]["start"] && log.collections) {
        const dateStr = log["date_range"]["start"]; // "YYYY-MM-DD"
        const monthKey = dateStr.substring(0, 7); // "YYYY-MM"
        
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {};
        }
        
        // Process each collection in this log entry
        for (const [collectionName, collectionData] of Object.entries(log.collections)) {
          allCollections.add(collectionName);
          const pageCount = collectionData.page_count || 0;
          
          // Add to monthly total for this collection
          if (!monthlyData[monthKey][collectionName]) {
            monthlyData[monthKey][collectionName] = 0;
          }
          monthlyData[monthKey][collectionName] += pageCount;
        }
      }
    }
    
    return {
      monthlyData,
      allCollections: Array.from(allCollections).sort()
    };
  } catch (err) {
    console.error('Error getting page count data:', err);
    return { monthlyData: {}, allCollections: [] };
  }
}

/**
 * Generate HTML table with months as columns and collections as rows
 */
function generateHTMLTable(monthlyData, allCollections) {
  // Get sorted months
  const sortedMonths = Object.keys(monthlyData).sort();
  
  if (sortedMonths.length === 0 || allCollections.length === 0) {
    return '<p>No hay datos disponibles para generar la tabla.</p>';
  }
  
  // Generate table header
  let tableHTML = `
    <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
      <thead>
        <tr style="background-color: #f2f2f2;">
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Fuente</th>
  `;
  
  // Add month columns
  for (const month of sortedMonths) {
    const [year, monthNum] = month.split('-');
    const monthName = new Date(parseInt(year), parseInt(monthNum) - 1, 1)
      .toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    
    tableHTML += `
          <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">${capitalizedMonth}</th>
    `;
  }
  
  tableHTML += `
        </tr>
      </thead>
      <tbody>
  `;
  
  // Generate table rows for each collection
  for (const collection of allCollections) {
    tableHTML += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">${collection}</td>
    `;
    
    let rowTotal = 0;
    
    // Add data for each month
    for (const month of sortedMonths) {
      const pageCount = monthlyData[month][collection] || 0;
      rowTotal += pageCount;
      
      const cellStyle = pageCount > 0 
        ? "border: 1px solid #ddd; padding: 8px; text-align: center;" 
        : "border: 1px solid #ddd; padding: 8px; text-align: center; color: #999;";
      
      tableHTML += `
          <td style="${cellStyle}">${pageCount.toLocaleString()}</td>
      `;
    }
    
    tableHTML += `
        </tr>
    `;
  }
  
  // Add totals row
  tableHTML += `
        <tr style="background-color: #f9f9f9; font-weight: bold;">
          <td style="border: 1px solid #ddd; padding: 8px;">TOTAL</td>
  `;
  
  for (const month of sortedMonths) {
    let monthTotal = 0;
    for (const collection of allCollections) {
      monthTotal += monthlyData[month][collection] || 0;
    }
    
    tableHTML += `
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${monthTotal.toLocaleString()}</td>
    `;
  }
  
  tableHTML += `
        </tr>
      </tbody>
    </table>
  `;
  
  return tableHTML;
}

/**
 * Generate summary statistics
 */
function generateSummaryStats(monthlyData, allCollections) {
  const sortedMonths = Object.keys(monthlyData).sort();
  
  if (sortedMonths.length === 0) {
    return '<p>No hay datos disponibles para generar estadísticas.</p>';
  }
  
  // Calculate totals
  let grandTotal = 0;
  const collectionTotals = {};
  const monthTotals = {};
  
  // Initialize collection totals
  for (const collection of allCollections) {
    collectionTotals[collection] = 0;
  }
  
  // Calculate totals
  for (const month of sortedMonths) {
    monthTotals[month] = 0;
    
    for (const collection of allCollections) {
      const pageCount = monthlyData[month][collection] || 0;
      collectionTotals[collection] += pageCount;
      monthTotals[month] += pageCount;
      grandTotal += pageCount;
    }
  }
  
  // Find top collections
  const sortedCollections = Object.entries(collectionTotals)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5);
  
  // Find top months
  const sortedMonthTotals = Object.entries(monthTotals)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3);
  
  let summaryHTML = `
    <div style="margin: 20px 0;">
      <h3>Resumen Estadístico</h3>
      <ul>
        <li><strong>Total de páginas procesadas:</strong> ${grandTotal.toLocaleString()}</li>
        <li><strong>Período analizado:</strong> ${sortedMonths[0]} a ${sortedMonths[sortedMonths.length - 1]}</li>
        <li><strong>Número de fuentes:</strong> ${allCollections.length}</li>
        <li><strong>Número de meses:</strong> ${sortedMonths.length}</li>
      </ul>
      
      <h4>Top 5 Fuentes por Páginas</h4>
      <ol>
  `;
  
  for (const [collection, total] of sortedCollections) {
    const percentage = ((total / grandTotal) * 100).toFixed(1);
    summaryHTML += `
        <li><strong>${collection}:</strong> ${total.toLocaleString()} páginas (${percentage}%)</li>
    `;
  }
  
  summaryHTML += `
      </ol>
      
      <h4>Top 3 Meses por Páginas</h4>
      <ol>
  `;
  
  for (const [month, total] of sortedMonthTotals) {
    const [year, monthNum] = month.split('-');
    const monthName = new Date(parseInt(year), parseInt(monthNum) - 1, 1)
      .toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    
    summaryHTML += `
        <li><strong>${capitalizedMonth}:</strong> ${total.toLocaleString()} páginas</li>
    `;
  }
  
  summaryHTML += `
      </ol>
    </div>
  `;
  
  return summaryHTML;
}

/**
 * Send email with the page count table
 */
async function sendPageCountEmail(tableHTML, summaryHTML) {
  const currentDate = moment().format('YYYY-MM-DD');
  
  const emailHTML = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reporte de Páginas por Fuente</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          background-color: #f5f5f5;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          background-color: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
          color: #0c2532;
          text-align: center;
          margin-bottom: 30px;
        }
        h3, h4 {
          color: #0c2532;
        }
        table {
          font-size: 12px;
        }
        th {
          background-color: #4ce3a7 !important;
          color: #0c2532 !important;
        }
        .footer {
          margin-top: 30px;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Reporte de Páginas Procesadas por Fuente</h1>
        
        ${summaryHTML}
        
        <h3>Tabla Detallada por Mes y Fuente</h3>
        ${tableHTML}
        
        <div class="footer">
          <p>Reporte generado automáticamente el ${currentDate}</p>
          <p>&copy; ${moment().year()} Reversa. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const mailOptions = {
    from: 'Reversa <info@reversa.ai>',
    to: 'info@reversa.ai',
    subject: `Reporte de Páginas por Fuente - ${currentDate}`,
    html: emailHTML
  };
  
  try {
    await transporter.sendMail(mailOptions);
    console.log('Page count report email sent successfully to info@reversa.ai');
  } catch (err) {
    console.error('Error sending page count report email:', err);
  }
}

// MAIN EXECUTION
(async () => {
  let client;
  try {
    client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(DB_NAME);
    
    console.log('Fetching page count data from logs...');
    const { monthlyData, allCollections } = await getPageCountData(db);
    
    if (Object.keys(monthlyData).length === 0) {
      console.log('No data found in logs collection');
      await client.close();
      return;
    }
    
    console.log(`Found data for ${Object.keys(monthlyData).length} months and ${allCollections.length} collections`);
    
    // Generate HTML table and summary
    const tableHTML = generateHTMLTable(monthlyData, allCollections);
    const summaryHTML = generateSummaryStats(monthlyData, allCollections);
    
    // Send email
    console.log('Sending page count report email...');
    await sendPageCountEmail(tableHTML, summaryHTML);
    
    console.log('Page count report completed successfully');
    await client.close();

  } catch (err) {
    console.error('Error in page count report:', err);
    if (client) {
      await client.close();
    }
  }
})();
