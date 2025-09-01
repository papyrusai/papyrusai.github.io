#!/usr/bin/env node

/**
 * send_product_update_newsletter.js
 *
 * Purpose:
 *   Send the product update newsletter (Otros/Updates_producto/newsletter_reversa_update.html)
 *   to users stored in the MongoDB `users` collection using SendGrid API via Nodemailer
 *   (same transport approach as Otros/email_script/newsletter.js).
 *
 * Safety & Modes:
 *   - DRY RUN by default (no emails sent). Use --send to actually send.
 *   - Use --test to target only tomas@reversa.ai (for pruebas).
 *   - Use --all to target all users (filtered by accepted_email unless --include-unsubscribed).
 *   - Optional: --limit N to cap number of recipients; --subject "..." to override subject.
 *
 * Examples:
 *   node scripts/send_product_update_newsletter.js --test                 # Dry run, only tomas@reversa.ai
 *   node scripts/send_product_update_newsletter.js --send --test          # SEND only to tomas@reversa.ai
 *   node scripts/send_product_update_newsletter.js --send --all           # SEND to all users
 *   node scripts/send_product_update_newsletter.js --all --limit 50       # Dry run, preview first 50
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const { getDatabase, closeMongoConnection } = require('../../services/db.utils');

// ---------- CLI ARG PARSING ----------
function parseCliArgs(argv) {
  const args = new Set(argv);
  const getVal = (flag, fallback = undefined) => {
    const idx = argv.indexOf(flag);
    if (idx !== -1 && idx + 1 < argv.length) return argv[idx + 1];
    return fallback;
  };
  const sendForReal = args.has('--send');
  const testMode = args.has('--test');
  const allMode = args.has('--all');
  const includeUnsubscribed = args.has('--include-unsubscribed');
  const limitStr = getVal('--limit');
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;
  const subjectOverride = getVal('--subject');
  return { sendForReal, testMode, allMode, includeUnsubscribed, limit, subjectOverride };
}

const { sendForReal, testMode, allMode, includeUnsubscribed, limit, subjectOverride } = parseCliArgs(process.argv.slice(2));
if (testMode && allMode) {
  console.error('❌ Flags conflict: use either --test or --all, not both.');
  process.exit(1);
}

// ---------- CONSTANTS & HELPERS ----------
const NEWSLETTER_DIR = __dirname;
const NEWSLETTER_HTML_PATH = path.join(NEWSLETTER_DIR, 'newsletter_reversa_update.html');

const INLINE_IMAGES = [
  { filename: 'reversa_white.png', cid: 'reversaLogo' },
  { filename: 'captura_1_agentes.png', cid: 'cap1' },
  { filename: 'captura_2_agentes.png', cid: 'cap2' },
  { filename: 'captura_3_agentes.png', cid: 'cap3' }
];

const DEFAULT_FROM = 'Reversa <info@reversa.ai>';
const DEFAULT_SUBJECT = subjectOverride || 'Reversa - Actualización de producto: cuentas de empresa, panel de adminsitrador y organizacion de agentes';

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceImageSrcWithCid(htmlInput) {
  let html = htmlInput;
  for (const { filename, cid } of INLINE_IMAGES) {
    const pattern = new RegExp(`src=["'](?:\\./)?${escapeRegExp(filename)}["']`, 'g');
    html = html.replace(pattern, `src="cid:${cid}"`);
  }
  return html;
}

function loadNewsletterHtml() {
  if (!fs.existsSync(NEWSLETTER_HTML_PATH)) {
    throw new Error(`Newsletter HTML not found at ${NEWSLETTER_HTML_PATH}`);
  }
  const rawHtml = fs.readFileSync(NEWSLETTER_HTML_PATH, 'utf8');
  return replaceImageSrcWithCid(rawHtml);
}

function buildInlineAttachments() {
  const attachments = [];
  for (const { filename, cid } of INLINE_IMAGES) {
    const filePath = path.join(NEWSLETTER_DIR, filename);
    if (fs.existsSync(filePath)) {
      attachments.push({ filename: path.basename(filePath), path: filePath, cid });
    }
  }
  return attachments;
}

async function fetchAllUserEmails(db, includeUnsubscribed, limit) {
  const users = db.collection('users');
  const query = { email: { $exists: true, $ne: null } };
  if (!includeUnsubscribed) {
    query.$or = [
      { accepted_email: { $exists: false } },
      { accepted_email: { $ne: false } }
    ];
  }
  const projection = { email: 1 };
  const cursor = users.find(query, { projection }).sort({ _id: 1 });
  const emails = [];
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const email = (doc && doc.email) ? String(doc.email).trim() : '';
    if (/.+@.+\..+/.test(email)) emails.push(email);
    if (limit && emails.length >= limit) break;
  }
  await cursor.close();
  // de-duplicate
  return Array.from(new Set(emails));
}

function buildMailOptions(to, html, attachments) {
  return {
    from: DEFAULT_FROM,
    to,
    subject: DEFAULT_SUBJECT,
    html,
    attachments,
    headers: { 'List-Unsubscribe': '<mailto:info@reversa.ai?subject=BAJA>' }
  };
}

async function sendInBatches(transporter, recipients, html, attachments) {
  const concurrency = 8;
  let index = 0;
  let active = 0;
  let sent = 0, failed = 0;

  return new Promise((resolve) => {
    function next() {
      if (index >= recipients.length && active === 0) return resolve({ sent, failed });
      while (active < concurrency && index < recipients.length) {
        const email = recipients[index++];
        active++;
        const mailOptions = buildMailOptions(email, html, attachments);
        const op = transporter.sendMail(mailOptions);
        op.then(() => { sent++; })
          .catch(err => { failed++; console.error(`[newsletter] Failed to send to ${email}:`, err && err.message ? err.message : err); })
          .finally(() => { active--; setTimeout(next, 150); });
      }
    }
    next();
  });
}

async function main() {
  const modeLabel = testMode ? 'TEST (tomas@reversa.ai)' : (allMode ? 'ALL USERS' : 'UNSPECIFIED');
  console.log(`📧 Product Update Newsletter • Mode: ${modeLabel} • ${sendForReal ? 'SEND' : 'DRY RUN'}`);

  if (!process.env.SENDGRID_API_KEY) {
    console.warn('⚠️ SENDGRID_API_KEY not set. You can still dry-run, but sending will fail.');
  }

  // Create transporter (SendGrid API via nodemailer)
  const transporter = nodemailer.createTransport(sgTransport({ auth: { api_key: process.env.SENDGRID_API_KEY || '' } }));

  const htmlBody = loadNewsletterHtml();
  const attachments = buildInlineAttachments();

  // Resolve recipients
  let recipients = [];
  if (testMode) {
    recipients = ['tomas@reversa.ai'];
  } else if (allMode) {
    const db = await getDatabase('papyrus');
    try {
      recipients = await fetchAllUserEmails(db, includeUnsubscribed, limit);
    } finally {
      await closeMongoConnection();
    }
  } else {
    console.log('ℹ️ No mode selected. Use --test or --all. Defaulting to --test recipients list for preview.');
    recipients = ['tomas@reversa.ai'];
  }

  console.log(`👥 Recipients: ${recipients.length}`);
  console.log(`   Preview → ${recipients.slice(0, Math.min(5, recipients.length)).join(', ')}`);

  if (!sendForReal) {
    console.log('🚫 DRY RUN. Use --send to actually dispatch emails.');
    return;
  }

  const { sent, failed } = await sendInBatches(transporter, recipients, htmlBody, attachments);
  console.log(`✅ Completed. Sent: ${sent}, Failed: ${failed}`);
}

if (require.main === module) {
  main().catch(err => { console.error('❌ Fatal error:', err); process.exitCode = 1; });
} 