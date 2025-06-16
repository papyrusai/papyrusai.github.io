/************************************************
 * resumen_etl_semanal.js
 *
 * To run:
 *   node resumen_etl_semanal.js
 *
 * Genera un reporte semanal de ETL acumulado de los últimos 7 días
 * filtrando por environment = "production" y usando datetime_run
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
console.log("SendGrid key is:", process.env.SENDGRID_API_KEY);
const transporter = nodemailer.createTransport(
  sgTransport({
    auth: {
      api_key: process.env.SENDGRID_API_KEY
    }
  })
);

/**
 * Get ETL data for the last 7 days, grouped by day and collection
 */
async function getWeeklyETLData(db) {
  try {
    const logsCollection = db.collection('logs');
    
    // Calculate date range for the last 7 days
    const endDate = moment().utc();
    const startDate = endDate.clone().subtract(6, 'days'); // 6 days ago + today = 7 days
    
    const startOfPeriod = startDate.clone().startOf('day').toDate();
    const endOfPeriod = endDate.clone().endOf('day').toDate();
    
    console.log(`Fetching ETL data from ${startOfPeriod} to ${endOfPeriod} with environment = production`);
    
    // Get all production logs from the last 7 days
    const allLogs = await logsCollection.find(
      { 
        datetime_run: { 
          $exists: true,
          $gte: startOfPeriod,
          $lte: endOfPeriod
        },
        "run_info.environment": "production",
        etl_detailed_stats: { $exists: true }
      },
      { sort: { datetime_run: 1 } }
    ).toArray();
    
    console.log(`Found ${allLogs.length} logs with ETL detailed stats`);
    
    if (allLogs.length === 0) {
      return {
        weeklyStats: {},
        dailyStats: {},
        periodInfo: {
          startDate: startDate.format('YYYY-MM-DD'),
          endDate: endDate.format('YYYY-MM-DD'),
          totalDays: 7
        }
      };
    }
    
    // Group by day and collection
    const dailyStats = {}; // day -> collection -> stats
    const weeklyStats = {}; // collection -> accumulated stats
    
    // Process each log entry
    for (const logEntry of allLogs) {
      const logDate = moment(logEntry.datetime_run).format('YYYY-MM-DD');
      
      if (!dailyStats[logDate]) {
        dailyStats[logDate] = {};
      }
      
      // Process each collection in this log entry
      for (const [collectionName, stats] of Object.entries(logEntry.etl_detailed_stats)) {
        // Initialize daily stats for this collection on this day
        if (!dailyStats[logDate][collectionName]) {
          dailyStats[logDate][collectionName] = {
            docs_scraped: 0,
            docs_new: 0,
            docs_processed: 0,
            docs_uploaded: 0,
            etiquetas_found: 0,
            input_tokens: 0,
            output_tokens: 0,
            error_count: 0,
            errors: [],
            runs: []
          };
        }
        
        // For docs_scraped, take the maximum value across all runs of the day
        dailyStats[logDate][collectionName].docs_scraped = Math.max(
          dailyStats[logDate][collectionName].docs_scraped, 
          stats.docs_scraped || 0
        );
        
        // For all other metrics, sum them
        dailyStats[logDate][collectionName].docs_new += stats.docs_new || 0;
        dailyStats[logDate][collectionName].docs_processed += stats.docs_processed || 0;
        dailyStats[logDate][collectionName].docs_uploaded += stats.docs_uploaded || 0;
        dailyStats[logDate][collectionName].etiquetas_found += stats.etiquetas_found || 0;
        dailyStats[logDate][collectionName].input_tokens += stats.input_tokens || 0;
        dailyStats[logDate][collectionName].output_tokens += stats.output_tokens || 0;
        dailyStats[logDate][collectionName].error_count += stats.error_count || 0;
        
        // Collect errors
        if (stats.errors && Array.isArray(stats.errors)) {
          dailyStats[logDate][collectionName].errors.push(...stats.errors);
        }
        
        // Track run time for reference
        dailyStats[logDate][collectionName].runs.push(moment(logEntry.datetime_run).format('HH:mm:ss'));
      }
    }
    
    // Now aggregate daily stats into weekly stats
    for (const [date, collectionsOfDay] of Object.entries(dailyStats)) {
      for (const [collectionName, dayStats] of Object.entries(collectionsOfDay)) {
        if (!weeklyStats[collectionName]) {
          weeklyStats[collectionName] = {
            docs_scraped: 0,
            docs_new: 0,
            docs_processed: 0,
            docs_uploaded: 0,
            etiquetas_found: 0,
            input_tokens: 0,
            output_tokens: 0,
            error_count: 0,
            errors: [],
            active_days: 0
          };
        }
        
        // For docs_scraped, we sum the daily maximums
        weeklyStats[collectionName].docs_scraped += dayStats.docs_scraped;
        
        // For other metrics, sum them directly
        weeklyStats[collectionName].docs_new += dayStats.docs_new;
        weeklyStats[collectionName].docs_processed += dayStats.docs_processed;
        weeklyStats[collectionName].docs_uploaded += dayStats.docs_uploaded;
        weeklyStats[collectionName].etiquetas_found += dayStats.etiquetas_found;
        weeklyStats[collectionName].input_tokens += dayStats.input_tokens;
        weeklyStats[collectionName].output_tokens += dayStats.output_tokens;
        weeklyStats[collectionName].error_count += dayStats.error_count;
        
        // Collect all errors
        weeklyStats[collectionName].errors.push(...dayStats.errors);
        
        // Count active days (days where this collection had any activity)
        if (dayStats.docs_scraped > 0 || dayStats.docs_new > 0 || dayStats.docs_processed > 0) {
          weeklyStats[collectionName].active_days++;
        }
      }
    }
    
    return {
      weeklyStats,
      dailyStats,
      periodInfo: {
        startDate: startDate.format('YYYY-MM-DD'),
        endDate: endDate.format('YYYY-MM-DD'),
        totalDays: 7
      }
    };
    
  } catch (err) {
    console.error('Error fetching weekly ETL data:', err);
    return {
      weeklyStats: {},
      dailyStats: {},
      periodInfo: {
        startDate: moment().subtract(6, 'days').format('YYYY-MM-DD'),
        endDate: moment().format('YYYY-MM-DD'),
        totalDays: 7
      }
    };
  }
}

/**
 * Send weekly ETL report email
 */
async function sendWeeklyETLReportEmail(db) {
  try {
    console.log('Fetching weekly ETL data...');
    const { weeklyStats, dailyStats, periodInfo } = await getWeeklyETLData(db);
    
    if (Object.keys(weeklyStats).length === 0) {
      console.warn(`No weekly ETL data found for period ${periodInfo.startDate} to ${periodInfo.endDate}. Sending empty report...`);
      
      // Send a report indicating no data was found
      const noDataReportHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Reporte Semanal ETL - Sin Datos</title>
        </head>
        <body style="font-family: Arial, sans-serif; margin: 20px; font-size: 12px;">
          <h1 style="font-size: 18px;">Reporte Semanal ETL - ${periodInfo.startDate} a ${periodInfo.endDate}</h1>
          
          <h2 style="font-size: 16px;">🚨 Sin Datos Disponibles</h2>
          <p style="font-size: 12px; color: #dc3545;">
            <strong>No se encontraron logs de ETL para el período ${periodInfo.startDate} a ${periodInfo.endDate} con environment=production.</strong>
          </p>
          
          <h3 style="font-size: 14px;">Posibles causas:</h3>
          <ul style="font-size: 12px;">
            <li>Los procesos ETL no se ejecutaron durante estos días</li>
            <li>Los procesos ETL no completaron exitosamente</li>
            <li>No se guardaron estadísticas detalladas</li>
            <li>El environment no está configurado como "production"</li>
          </ul>
          
          <hr>
          <p style="font-size: 10px; color: #666;">
            Generado automáticamente el ${moment().format('YYYY-MM-DD HH:mm:ss')} UTC
          </p>
        </body>
        </html>
      `;
      
      const noDataMailOptions = {
        from: 'Reversa <info@reversa.ai>',
        to: 'info@reversa.ai',
        subject: `Reporte Semanal ETL - Sin Datos - ${periodInfo.startDate} a ${periodInfo.endDate}`,
        html: noDataReportHTML
      };
      
      await transporter.sendMail(noDataMailOptions);
      console.log('Weekly ETL report (no data) sent to info@reversa.ai');
      return;
    }
    
    console.log(`Processing weekly ETL data for ${Object.keys(weeklyStats).length} collections`);
    
    // Build collections statistics table
    let collectionsStatsTableHTML = '';
    let totalDocsScraped = 0;
    let totalDocsNew = 0;
    let totalDocsProcessed = 0;
    let totalDocsUploaded = 0;
    let totalEtiquetasFound = 0;
    let totalErrorCount = 0;
    let totalCostEUR = 0;
    let collectionsWithData = 0;
    let totalActiveDays = 0;
    
    // API pricing (USD per million tokens)
    const INPUT_TOKEN_COST_USD = 1.100; // USD per 1M tokens
    const OUTPUT_TOKEN_COST_USD = 4.400; // USD per 1M tokens
    const USD_TO_EUR_RATE = 0.92; // Approximate conversion rate
    
    // Process each collection in weekly stats
    for (const [collectionName, stats] of Object.entries(weeklyStats)) {
      const docsScraped = stats.docs_scraped || 0;
      const docsNew = stats.docs_new || 0;
      const docsProcessed = stats.docs_processed || 0;
      const docsUploaded = stats.docs_uploaded || 0;
      const etiquetasFound = stats.etiquetas_found || 0;
      const errorCount = stats.error_count || 0;
      const activeDays = stats.active_days || 0;
      
      // Calculate cost in EUR
      const inputTokens = stats.input_tokens || 0;
      const outputTokens = stats.output_tokens || 0;
      
      const inputCostUSD = (inputTokens / 1000000) * INPUT_TOKEN_COST_USD;
      const outputCostUSD = (outputTokens / 1000000) * OUTPUT_TOKEN_COST_USD;
      const totalCostUSD = inputCostUSD + outputCostUSD;
      const totalCostCollectionEUR = totalCostUSD * USD_TO_EUR_RATE;
      
      // Add to totals
      totalDocsScraped += docsScraped;
      totalDocsNew += docsNew;
      totalDocsProcessed += docsProcessed;
      totalDocsUploaded += docsUploaded;
      totalEtiquetasFound += etiquetasFound;
      totalErrorCount += errorCount;
      totalCostEUR += totalCostCollectionEUR;
      totalActiveDays += activeDays;
      
      if (docsScraped > 0 || docsNew > 0 || docsProcessed > 0) {
        collectionsWithData++;
      }
      
      // Determine row color based on status
      let rowStyle = '';
      if (errorCount > 0) {
        rowStyle = 'background-color: #ffebee;'; // Light red for errors
      } else if (docsNew === 0 && docsScraped === 0) {
        rowStyle = 'background-color: #f5f5f5;'; // Light gray for no activity
      } else if (docsUploaded > 0) {
        rowStyle = 'background-color: #e8f5e8;'; // Light green for successful uploads
      }
      
      collectionsStatsTableHTML += `
        <tr style="${rowStyle}">
          <td style="border: 1px solid #ddd; padding: 6px; font-weight: bold; font-size: 11px;">${collectionName}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${docsScraped}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${docsNew}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${docsProcessed}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${docsUploaded}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${etiquetasFound}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">€${totalCostCollectionEUR.toFixed(2)}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${activeDays}/7</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${errorCount}</td>
        </tr>
      `;
    }
    
    // Add totals row
    collectionsStatsTableHTML += `
      <tr style="background-color: #f2f2f2; font-weight: bold;">
        <td style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">TOTAL</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${totalDocsScraped}</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${totalDocsNew}</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${totalDocsProcessed}</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${totalDocsUploaded}</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${totalEtiquetasFound}</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">€${totalCostEUR.toFixed(2)}</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">-</td>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 11px;">${totalErrorCount}</td>
      </tr>
    `;
    
    // Calculate averages for summary
    const avgCollectionsPerDay = (totalActiveDays / 7).toFixed(1);
    
    // Build errors section grouped by day and collection
    let errorsHTML = '';
    let totalErrors = 0;
    
    // Group errors by day first, then by collection
    const errorsByDay = {};
    
    for (const [date, collectionsOfDay] of Object.entries(dailyStats)) {
      for (const [collectionName, dayStats] of Object.entries(collectionsOfDay)) {
        if (dayStats.errors && dayStats.errors.length > 0) {
          if (!errorsByDay[date]) {
            errorsByDay[date] = {};
          }
          if (!errorsByDay[date][collectionName]) {
            errorsByDay[date][collectionName] = [];
          }
          errorsByDay[date][collectionName].push(...dayStats.errors);
        }
      }
    }
    
    // Build HTML for errors grouped by day
    for (const [date, collectionsWithErrors] of Object.entries(errorsByDay)) {
      errorsHTML += `<h4 style="font-size: 12px; margin-top: 15px; margin-bottom: 5px; color: #dc3545;">${date}</h4>`;
      
      for (const [collectionName, errors] of Object.entries(collectionsWithErrors)) {
        errorsHTML += `<h5 style="font-size: 11px; margin: 5px 0; font-weight: bold;">${collectionName}:</h5>`;
        errorsHTML += `<ul style="font-size: 10px; margin: 5px 0 10px 20px;">`;
        
        for (const errorObj of errors) {
          totalErrors++;
          errorsHTML += `<li style="margin-bottom: 3px;">${errorObj.error}</li>`;
        }
        
        errorsHTML += `</ul>`;
      }
    }
    
    let errorsSection = '';
    if (totalErrors > 0) {
      errorsSection = `
        <h2 style="font-size: 16px;">3. Detalle de errores por día</h2>
        <div style="font-size: 11px; margin-bottom: 30px;">
          ${errorsHTML}
        </div>
      `;
    } else {
      errorsSection = `
        <h2 style="font-size: 16px;">3. Detalle de errores</h2>
        <p style="font-size: 12px; color: #28a745;">✅ No se encontraron errores en el procesamiento durante la semana.</p>
      `;
    }
    
    const weeklyReportHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte Semanal ETL</title>
      </head>
      <body style="font-family: Arial, sans-serif; margin: 20px; font-size: 12px;">
        <h1 style="font-size: 18px;">Reporte Semanal ETL - ${periodInfo.startDate} a ${periodInfo.endDate}</h1>
        
        <h2 style="font-size: 16px;">1. Resumen General</h2>
        <p style="font-size: 12px;"><strong>Período de Reporte:</strong> ${periodInfo.startDate} a ${periodInfo.endDate} (${periodInfo.totalDays} días)</p>
        <p style="font-size: 12px;"><strong>Colecciones Procesadas:</strong> ${Object.keys(weeklyStats).length}</p>
        <p style="font-size: 12px;"><strong>Colecciones con Actividad:</strong> ${collectionsWithData}</p>
        <p style="font-size: 12px;"><strong>Media de Colecciones Activas por Día:</strong> ${avgCollectionsPerDay}</p>
        <ul style="font-size: 12px; margin-bottom: 30px;">
          <li><strong>Total Documentos Scrapeados:</strong> ${totalDocsScraped} (suma de máximos diarios)</li>
          <li><strong>Total Documentos Nuevos:</strong> ${totalDocsNew}</li>
          <li><strong>Total Documentos Procesados:</strong> ${totalDocsProcessed}</li>
          <li><strong>Total Documentos Subidos:</strong> ${totalDocsUploaded}</li>
          <li><strong>Total Etiquetas Encontradas:</strong> ${totalEtiquetasFound}</li>
          <li><strong>Total Coste API:</strong> €${totalCostEUR.toFixed(2)}</li>
          <li><strong>Total Errores:</strong> ${totalErrorCount}</li>
        </ul>
        
        <h2 style="font-size: 16px;">2. Estadísticas Detalladas por Colección (Acumulado 7 días)</h2>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px; font-size: 11px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Colección</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Docs Scraped*</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Docs New</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Docs Processed</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Docs Uploaded</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Etiquetas Found</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Coste (€)</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Días Activos</th>
              <th style="border: 1px solid #ddd; padding: 6px; font-size: 11px;">Errors</th>
            </tr>
          </thead>
          <tbody>
            ${collectionsStatsTableHTML}
          </tbody>
        </table>
        
        <h3 style="font-size: 12px; margin-top: 20px;">Notas:</h3>
        <ul style="font-size: 10px; margin-bottom: 20px;">
          <li>* <strong>Docs Scraped:</strong> Suma de los máximos diarios (no suma simple)</li>
          <li><strong>Días Activos:</strong> Número de días donde la colección tuvo actividad durante la semana</li>
          <li><strong>Resto de métricas:</strong> Suma directa de todos los valores de la semana</li>
        </ul>
        
        <h3 style="font-size: 12px; margin-top: 20px;">Códigos de Color</h3>
        <ul style="font-size: 10px; margin-bottom: 30px;">
          <li><span style="background-color: #e8f5e8; padding: 1px 6px; border-radius: 3px; font-size: 9px;">Verde claro</span> - Documentos procesados exitosamente</li>
          <li><span style="background-color: #f5f5f5; padding: 1px 6px; border-radius: 3px; font-size: 9px;">Gris claro</span> - Sin actividad</li>
          <li><span style="background-color: #ffebee; padding: 1px 6px; border-radius: 3px; font-size: 9px;">Rojo claro</span> - Errores encontrados</li>
        </ul>
        
        ${errorsSection}
        
        <hr>
        <p style="font-size: 12px; color: #666;">
          Generado automáticamente el ${moment().format('YYYY-MM-DD HH:mm:ss')} UTC
        </p>
      </body>
      </html>
    `;
    
    const weeklyReportMailOptions = {
      from: 'Reversa <info@reversa.ai>',
      to: 'info@reversa.ai',
      subject: `Reporte Semanal ETL - ${periodInfo.startDate} a ${periodInfo.endDate}`,
      html: weeklyReportHTML
    };
    
    await transporter.sendMail(weeklyReportMailOptions);
    console.log('Weekly ETL report email sent to info@reversa.ai');
    
  } catch (err) {
    console.error('Error sending weekly ETL report email:', err);
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
    
    console.log('Generating weekly ETL report...');
    await sendWeeklyETLReportEmail(db);
    
    console.log('Weekly ETL report completed successfully');
    await client.close();

  } catch (err) {
    console.error('Error in weekly ETL report:', err);
    if (client) {
      await client.close();
    }
  }
})();
