/*
Routes: Internal Feedback Review endpoints for dashboard interno (tab: Feedback)
Endpoints (all gated to tomas@reversa.ai):
- GET  '/api/internal/review/feedback/users'  -> list distinct users who left etiquetado feedback
- GET  '/api/internal/review/feedback/data'   -> feedback documents html for selected user
*/

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const { expandCollectionsWithTest, collectionExists } = require('../services/db.utils');
const { buildEtiquetasQueryForIds } = require('../services/enterprise.service');

const router = express.Router();
const uri = process.env.DB_URI;
const mongodbOptions = {};

function parseIntSafe(v, def){ const n = parseInt(String(v || '').trim(), 10); return Number.isFinite(n) && n > 0 ? n : def; }

// GET: distinct feedback users (content_evaluated = 'etiquetado')
router.get('/api/internal/review/feedback/users', ensureAuthenticated, async (req, res) => {
    if (req.user?.email !== 'tomas@reversa.ai') {
        return res.status(403).json({ success: false, error: 'No autorizado' });
    }
    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const feedbackCol = db.collection('Feedback');
        const usersCol = db.collection('users');

        // Group by user_email for both etiquetado and doc_eliminado
        const agg = await feedbackCol.aggregate([
            { $match: { content_evaluated: { $in: ['etiquetado', 'doc_eliminado'] } } },
            { $group: { _id: '$user_email', lastCreated: { $max: '$created_at' } } },
            { $sort: { lastCreated: -1 } }
        ]).toArray();
        const emails = agg.map(a => a._id).filter(Boolean);
        let userDocs = [];
        if (emails.length){
            userDocs = await usersCol.find({ email: { $in: emails } }, { projection: { email: 1 } }).toArray();
        }
        const emailToId = new Map(userDocs.map(u => [u.email, String(u._id)]));
        const items = emails.map(email => ({ email, userId: emailToId.get(email) || null, displayName: email }));
        return res.json({ success: true, items });
    } catch (e) {
        console.error('[internal/review/feedback/users] error:', e);
        return res.status(500).json({ success: false, error: 'Error obteniendo usuarios con feedback' });
    } finally {
        await client.close();
    }
});

// GET: feedback data for selected user (or ALL)
router.get('/api/internal/review/feedback/data', ensureAuthenticated, async (req, res) => {
    if (req.user?.email !== 'tomas@reversa.ai') {
        return res.status(403).json({ success: false, error: 'No autorizado' });
    }
    const userEmail = String(req.query.userEmail || '').trim();
    if (!userEmail) return res.status(400).json({ success: false, error: 'Parámetro requerido: userEmail' });
    const typeFilter = String((req.query.type || 'all')).toLowerCase(); // 'all' | 'like' | 'dislike' | 'eliminados'
    const incorporado = String((req.query.incorporado || 'all')).toLowerCase(); // 'all' | 'si' | 'no'
    const desde = String(req.query.desde || '').trim();
    const hasta = String(req.query.hasta || '').trim();

    const page = parseIntSafe(req.query.page, 1);
    const pageSize = Math.min(parseIntSafe(req.query.pageSize, 25), 100);

    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCol = db.collection('users');
        const feedbackCol = db.collection('Feedback');

        // Helper cache to compute targetUserIds per email (for ALL path)
        const emailToTargetIds = new Map();
        async function computeTargetUserIdsByEmail(email){
            if (emailToTargetIds.has(email)) return emailToTargetIds.get(email);
            let targetUserIdsLocal = [];
            try {
                const base = await usersCol.findOne({ email }, { projection: { email: 1, tipo_cuenta: 1, estructura_empresa_id: 1, legacy_user_ids: 1, empresa: 1, empresa_name: 1 } });
                if (base) {
                    if (base.estructura_empresa_id) {
                        const empId = base.estructura_empresa_id instanceof ObjectId ? base.estructura_empresa_id : new ObjectId(String(base.estructura_empresa_id));
                        const empresaDoc = await usersCol.findOne({ _id: empId }, { projection: { legacy_user_ids: 1 } });
                        const legacy = Array.isArray(empresaDoc?.legacy_user_ids) ? empresaDoc.legacy_user_ids.map(String) : [];
                        targetUserIdsLocal = [String(empId), ...legacy];
                    } else if (!base.email && base.tipo_cuenta === 'empresa') {
                        const legacy = Array.isArray(base.legacy_user_ids) ? base.legacy_user_ids.map(String) : [];
                        targetUserIdsLocal = [String(base._id), ...legacy];
                    } else if (base.empresa || base.empresa_name) {
                        const empName = base.empresa || base.empresa_name;
                        const empresaDoc = await usersCol.findOne({ tipo_cuenta: 'empresa', $or: [ { empresa: empName }, { empresa_name: empName } ] }, { projection: { _id: 1, legacy_user_ids: 1 } });
                        if (empresaDoc?._id) {
                            const legacy = Array.isArray(empresaDoc.legacy_user_ids) ? empresaDoc.legacy_user_ids.map(String) : [];
                            targetUserIdsLocal = [String(empresaDoc._id), ...legacy];
                        }
                    }
                    if (!targetUserIdsLocal.length) targetUserIdsLocal = [String(base._id)];
                }
            } catch(_) { /* ignore */ }
            if (!targetUserIdsLocal.length) targetUserIdsLocal = [];
            emailToTargetIds.set(email, targetUserIdsLocal);
            return targetUserIdsLocal;
        }

        // Build query for feedback events
        const isAll = userEmail.toUpperCase() === 'ALL';
        const q = {};
        if (typeFilter === 'eliminados') {
            q.content_evaluated = 'doc_eliminado';
        } else if (typeFilter === 'like' || typeFilter === 'dislike') {
            q.content_evaluated = 'etiquetado';
            if (typeFilter === 'like') q.feedback = { $regex: '^like', $options: 'i' }; else if (typeFilter === 'dislike') q.feedback = { $regex: '^dislike', $options: 'i' };
        } else {
            // all -> incluir etiquetado y eliminados
            q.content_evaluated = { $in: ['etiquetado', 'doc_eliminado'] };
        }
        if (!isAll) q.user_email = userEmail;
        if (incorporado === 'si') q.feedback_incorporado = 'si'; else if (incorporado === 'no') q.feedback_incorporado = { $ne: 'si' };
        // Optional date filter over created_at using DD-MM-YYYY stored in 'fecha'
        const dateClauses = [];
        function parseYMD(str){ const [y,m,d] = str.split('-').map(Number); return { y, m, d }; }
        if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) dateClauses.push({ fecha: { $gte: `${desde.slice(8,10)}-${desde.slice(5,7)}-${desde.slice(0,4)}` } });
        if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) dateClauses.push({ fecha: { $lte: `${hasta.slice(8,10)}-${hasta.slice(5,7)}-${hasta.slice(0,4)}` } });
        if (dateClauses.length){ q.$and = (q.$and||[]).concat(dateClauses); }

        const total = await feedbackCol.countDocuments(q);
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const safePage = Math.min(page, totalPages);
        const skip = (safePage - 1) * pageSize;

        // Ordenar siempre por fecha (created_at) desc para consistencia
        const events = await feedbackCol.find(q)
            .sort({ created_at: -1, _id: -1 })
            .skip(skip)
            .limit(pageSize)
            .toArray();

        // Build html for each event by cross-referencing the referenced collection/doc
        const documentsHtmlParts = [];
        for (const ev of events) {
            const collectionName = ev.coleccion || ev.collection_name || null;
            const docIdRaw = ev.doc_id != null ? String(ev.doc_id) : '';
            let docData = null;
            if (collectionName) {
                try {
                    const coll = db.collection(collectionName);
                    const orConds = [];
                    // As _id (ObjectId)
                    if (/^[a-fA-F0-9]{24}$/.test(docIdRaw)) {
                        try { orConds.push({ _id: new ObjectId(docIdRaw) }); } catch(_){}
                    }
                    // As string id
                    orConds.push({ _id: docIdRaw });
                    // By short_name or title
                    orConds.push({ short_name: docIdRaw });
                    orConds.push({ short_name: { $regex: docIdRaw, $options: 'i' } });
                    orConds.push({ title: docIdRaw });
                    orConds.push({ title: { $regex: docIdRaw, $options: 'i' } });
                    docData = await coll.findOne({ $or: orConds }, { projection: { short_name: 1, resumen: 1, dia: 1, mes: 1, anio: 1, url_pdf: 1, url_html: 1, rango_titulo: 1, etiquetas_personalizadas: 1 } });
                    if (docData) docData.collectionName = collectionName;
                } catch (e) {
                    console.error('[internal/review/feedback/data] fetch doc error', collectionName, e.message);
                }
            }

            // Compute target ids for this event's user (works for ALL or single user)
            const emailForThisEvent = isAll ? (ev.user_email || '') : userEmail;
            const targetIdsForThis = emailForThisEvent ? (await computeTargetUserIdsByEmail(emailForThisEvent)) : [];

            // Build impacto agentes for selected user target ids
            let impactoAgentesHtml = '';
            if (docData && docData.etiquetas_personalizadas) {
                let userEtiquetas = null;
                for (const tid of targetIdsForThis) {
                    const val = docData.etiquetas_personalizadas[tid];
                    if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length) { userEtiquetas = val; break; }
                }
                if (userEtiquetas) {
                    const keys = Object.keys(userEtiquetas);
                    if (keys.length) {
                        impactoAgentesHtml = `
                          <div class="impacto-agentes" style="margin-top: 15px; margin-bottom: 15px; padding-left: 15px; border-left: 4px solid #495057; background-color: #45586221;">
                            <div style="font-weight: 600;font-size: large; margin-bottom: 10px; color: #0b2431; padding: 5px;">Impacto en agentes</div>
                            <div style="padding: 0 5px 10px 5px; font-size: 1.1em; line-height: 1.5;">
                              ${keys.map(etiqueta => {
                                const data = userEtiquetas[etiqueta];
                                let explicacion = '';
                                let nivelImpacto = '';
                                if (typeof data === 'string') { explicacion = data; }
                                else if (typeof data === 'object' && data !== null) { explicacion = data.explicacion || ''; nivelImpacto = data.nivel_impacto || ''; }
                                let nivelTag = '';
                                if (nivelImpacto) {
                                    let bgColor = '#f8f9fa'; let textColor = '#6c757d';
                                    switch (String(nivelImpacto).toLowerCase()) { case 'alto': bgColor = '#ffe6e6'; textColor = '#d32f2f'; break; case 'medio': bgColor = '#fff3cd'; textColor = '#856404'; break; case 'bajo': bgColor = '#d4edda'; textColor = '#155724'; break; }
                                    nivelTag = `<span style="background-color: ${bgColor}; color: ${textColor}; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; font-weight: 500; margin-left: 8px;">${nivelImpacto}</span>`;
                                }
                                return `<div style="margin-bottom: 12px; display: flex; align-items: baseline;"><svg width="16" height="16" viewBox="0 0 24 24" style="color: #0b2431; margin-right: 10px; flex-shrink: 0;"><path fill="currentColor" d="M10.5 17.5l7.5-7.5-7.5-7.5-1.5 1.5L15 10l-6 6z"></path></svg><div style="flex: 1;"><span style=\"font-weight: 600;\">${etiqueta}</span>${nivelTag}<div style=\"margin-top: 4px; color: #555;\">${explicacion}</div></div></div>`;
                              }).join('')}
                            </div>
                          </div>`;
                    }
                }
            }

            const rangoToShow = (docData && (docData.rango_titulo || 'Indefinido')) || 'Indefinido';
            let etiquetasParaMostrar = [];
            if (docData && docData.etiquetas_personalizadas) {
                for (const tid of targetIdsForThis) {
                    const val = docData.etiquetas_personalizadas[tid];
                    if (Array.isArray(val) && val.length) { etiquetasParaMostrar = val; break; }
                    if (val && typeof val === 'object' && Object.keys(val).length) { etiquetasParaMostrar = Object.keys(val); break; }
                }
            }
            const etiquetasHtml = etiquetasParaMostrar.length ? `<div class="etiquetas-personalizadas-values">${etiquetasParaMostrar.map(et => `<span class=\"etiqueta-personalizada-value\">${et}</span>`).join(' ')}</div>` : '';

            const dateStr = (() => {
                if (docData && docData.anio && docData.mes && docData.dia) return `${docData.dia}/${docData.mes}/${docData.anio}`;
                try { return ev.created_at ? new Date(ev.created_at).toLocaleString('es-ES') : ''; } catch(_) { return ''; }
            })();
            const docTitle = (docData && docData.short_name) || (ev.doc_title || ev.doc_id) || '';
            const docLink = (docData && (docData.url_pdf || docData.url_html)) || ev.doc_url || '';

            const isDeleted = String(ev.content_evaluated || '') === 'doc_eliminado';
            const fbType = String(ev.feedback || '').toLowerCase();
            const fbIsLike = !isDeleted && fbType.includes('like') && !fbType.includes('dislike');
            const fbIcon = isDeleted ? '🗑️' : (fbIsLike ? '👍' : '👎');
            const fbText = isDeleted ? 'Eliminado' : (fbIsLike ? 'Like' : 'Dislike');
            const fbDetalle = isDeleted ? (ev.reason_delete ? String(ev.reason_delete) : '') : (ev.feedback_detalle ? String(ev.feedback_detalle) : '');
            const fbIncorporado = isDeleted ? 'no' : (ev.feedback_incorporado === 'si' ? 'si' : 'no');

            const emailForTop = isAll ? (ev.user_email || '') : userEmail;
            const topUserHtml = `<div class=\"user-meta\" style=\"display:flex; align-items:center; gap:8px; color:#455862; margin-bottom:8px;\"><i class=\"fas fa-user\" style=\"color:#0b2431;\"></i><div><div style=\"font-weight:600; color:#0b2431;\">${emailForTop}</div><div style=\"font-size:12px; color:#6c757d;\">${collectionName || ''}</div></div></div>`;

            const fbBg = isDeleted ? 'rgba(255,152,0,.15)' : (fbIsLike ? 'rgba(4,219,141,.10)' : 'rgba(211,47,47,.10)');
            const fbBorder = isDeleted ? '#ff9800' : (fbIsLike ? '#04db8d' : '#d32f2f');
            const fbColor = '#0b2431';
            const feedbackInfoHtml = `<div class=\"feedback-info\" style=\"margin:8px 0 10px 0; padding:10px 12px; border-left:4px solid ${fbBorder}; background:${fbBg}; border-radius:8px; color:${fbColor}; font-weight:600; display:flex; align-items:center; gap:10px;\">${fbIcon} ${fbText}${fbDetalle ? `<span style=\"margin-left:12px; font-weight:500; color:#455862;\">${fbDetalle}</span>` : ''}</div>`;
            const incorporadoHtml = `<div class=\"incorporado-row\" style=\"margin:8px 0 12px 0; display:flex; align-items:center; gap:10px;\"><span style=\"font-weight:600; color:#0b2431;\">Feedback incorporado al agente:</span><select class=\"incorp-select\" data-email=\"${emailForTop}\" data-coll=\"${collectionName || ''}\" data-doc=\"${docIdRaw}\" style=\"border:1px solid #e8ecf0; border-radius:8px; padding:6px 8px;\"><option value=\"no\" ${fbIncorporado==='no'?'selected':''}>No</option><option value=\"si\" ${fbIncorporado==='si'?'selected':''}>Sí</option></select><span class=\"incorp-status\" style=\"font-size:12px; color:#6c757d;\"></span></div>`;

            const html = `
              <div class=\"data-item\"> 
                ${topUserHtml}
                ${feedbackInfoHtml}
                ${isDeleted ? '' : incorporadoHtml}
                <div class=\"header-row\"> 
                  <div class=\"id-values\">${docTitle} <i class=\"fas fa-clipboard-check\" style=\"margin-left:8px;color:#0b2431;opacity:.8;\"></i></div>
                  <span class=\"date\"><em>${dateStr}</em></span>
                </div>
                <div style=\"color: gray; font-size: 1.1em; margin-bottom: 6px;\">${rangoToShow} ${docData && docData.collectionName ? `| ${docData.collectionName}` : ''}</div>
                ${etiquetasHtml}
                <div class=\"resumen-label\">Resumen</div>
                <div class=\"resumen-content\" style=\"font-size: 1.1em; line-height: 1.4;\">${(docData && docData.resumen) ? docData.resumen : (ev.doc_title || '')}</div>
                ${impactoAgentesHtml}
                ${docLink ? `<a class=\\"leer-mas\\" href=\\"${docLink}\\" target=\\"_blank\\" style=\\"margin-right: 15px;\\">Leer más</a>` : `<span class=\\"leer-mas\\" style=\\"margin-right: 15px; color: #ccc;\\">Leer más (No disponible)</span>`}
              </div>`;
            documentsHtmlParts.push(html);
        }

        const documentsHtml = documentsHtmlParts.join('');
        if (!events.length) {
            return res.json({ success: true, documentsHtml: '<div class="no-results" style="color:#0b2431; font-weight:bold; padding:20px; text-align:center; font-size:16px; background-color:#f8f9fa; border-radius:8px; margin:12px 0;">No hay feedback para este usuario.</div>', pagination: { page: safePage, pageSize, total, totalPages } });
        }
        return res.json({ success: true, documentsHtml, pagination: { page: safePage, pageSize, total, totalPages } });
    } catch (e) {
        console.error('[internal/review/feedback/data] error:', e);
        return res.status(500).json({ success: false, error: 'Error interno' });
    } finally {
        await client.close();
    }
});

// GET: stats for stacked bar chart (likes vs dislikes per user)
router.get('/api/internal/review/feedback/stats', ensureAuthenticated, async (req, res) => {
    if (req.user?.email !== 'tomas@reversa.ai') {
        return res.status(403).json({ success: false, error: 'No autorizado' });
    }
    const filterType = String((req.query.type || 'all')).toLowerCase(); // 'all' | 'like' | 'dislike' | 'eliminados'
    const incorporado = String((req.query.incorporado || 'all')).toLowerCase(); // 'all' | 'si' | 'no'
    const userEmail = String(req.query.userEmail || '').trim(); // optional; if set and not 'ALL', filter to that user
    const desde = String(req.query.desde || '').trim();
    const hasta = String(req.query.hasta || '').trim();

    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const feedbackCol = db.collection('Feedback');
        const usersCol = db.collection('users');

        // Determine target set of users based on filter (users with at least one feedback of selected type)
        const match = {};
        if (filterType === 'eliminados') {
            match.content_evaluated = 'doc_eliminado';
        } else {
            match.content_evaluated = 'etiquetado';
            if (filterType === 'like') match.feedback = { $regex: '^like', $options: 'i' }; else if (filterType === 'dislike') match.feedback = { $regex: '^dislike', $options: 'i' };
        }
        if (userEmail && userEmail.toUpperCase() !== 'ALL') match.user_email = userEmail;
        if (incorporado === 'si') match.feedback_incorporado = 'si'; else if (incorporado === 'no') match.feedback_incorporado = { $ne: 'si' };
        // Date range (DD-MM-YYYY in 'fecha')
        const and = [];
        if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) and.push({ fecha: { $gte: `${desde.slice(8,10)}-${desde.slice(5,7)}-${desde.slice(0,4)}` } });
        if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) and.push({ fecha: { $lte: `${hasta.slice(8,10)}-${hasta.slice(5,7)}-${hasta.slice(0,4)}` } });
        if (and.length) match.$and = and;

        const usersRows = await feedbackCol.aggregate([
            { $match: match },
            { $group: { _id: '$user_email', total: { $sum: 1 } } },
            { $sort: { total: -1 } }
        ]).toArray();
        const emails = usersRows.map(r => r._id).filter(Boolean);
        if (emails.length === 0) return res.json({ success: true, items: [] });

        // Fetch ALL events for these users (ignoring type) to compute unique doc sets and like/dislike counts (unique per doc)
        const events = await feedbackCol.find(
            { content_evaluated: { $in: ['etiquetado', 'doc_eliminado'] }, user_email: { $in: emails } },
            { projection: { user_email: 1, feedback: 1, content_evaluated: 1, doc_id: 1, coleccion: 1, collection_name: 1 } }
        ).toArray();

        const emailToSets = new Map(); // email -> { likes:Set, dislikes:Set, union:Set }
        for (const ev of events) {
            const email = ev.user_email || '';
            if (!email) continue;
            if (!emailToSets.has(email)) emailToSets.set(email, { likes: new Set(), dislikes: new Set(), union: new Set() });
            const sets = emailToSets.get(email);
            const coll = ev.coleccion || ev.collection_name || '';
            const idStr = (ev.doc_id != null) ? String(ev.doc_id) : '';
            if (!coll || !idStr) continue;
            const key = `${coll}|${idStr}`;
            const isDeleted = String(ev.content_evaluated || '') === 'doc_eliminado';
            const fb = String(ev.feedback || '').toLowerCase();
            if (isDeleted) {
                // count as own category by union (only for total) but not like/dislike
                sets.union.add(key);
            } else {
                if (fb.startsWith('dislike')) sets.dislikes.add(key); else if (fb.startsWith('like')) sets.likes.add(key);
                if (fb.startsWith('like') || fb.startsWith('dislike')) sets.union.add(key);
            }
        }

        // Helper to compute target ids, etiquetas y cobertura para un email
        async function computeMatchContextForEmail(email){
            const base = await usersCol.findOne({ email }, { projection: { email: 1, tipo_cuenta: 1, estructura_empresa_id: 1, legacy_user_ids: 1, empresa: 1, empresa_name: 1, etiquetas_personalizadas: 1, etiquetas_personalizadas_seleccionadas: 1, cobertura_legal: 1 } });
            if (!base) return { targetIds: [], etiquetas: [], boletines: ['BOE'] };
            let targetIds = [];
            let etiquetas = [];
            let coberturaSource = base.cobertura_legal || {};
            if (base.estructura_empresa_id) {
                const empId = base.estructura_empresa_id instanceof ObjectId ? base.estructura_empresa_id : new ObjectId(String(base.estructura_empresa_id));
                const empresaDoc = await usersCol.findOne({ _id: empId }, { projection: { legacy_user_ids: 1, etiquetas_personalizadas: 1, cobertura_legal: 1 } });
                const legacy = Array.isArray(empresaDoc?.legacy_user_ids) ? empresaDoc.legacy_user_ids.map(String) : [];
                targetIds = [String(empId), ...legacy];
                if (Array.isArray(base.etiquetas_personalizadas_seleccionadas) && base.etiquetas_personalizadas_seleccionadas.length > 0) {
                    etiquetas = base.etiquetas_personalizadas_seleccionadas;
                } else if (empresaDoc && empresaDoc.etiquetas_personalizadas) {
                    const e = empresaDoc.etiquetas_personalizadas;
                    etiquetas = Array.isArray(e) ? e : (typeof e === 'object' ? Object.keys(e) : []);
                }
                if (empresaDoc?.cobertura_legal) coberturaSource = empresaDoc.cobertura_legal;
            } else if (!base.email && base.tipo_cuenta === 'empresa') {
                const legacy = Array.isArray(base.legacy_user_ids) ? base.legacy_user_ids.map(String) : [];
                targetIds = [String(base._id), ...legacy];
                const e = base.etiquetas_personalizadas || {};
                etiquetas = Array.isArray(e) ? e : (typeof e === 'object' ? Object.keys(e) : []);
            } else if (base.empresa || base.empresa_name) {
                const empName = base.empresa || base.empresa_name;
                const empresaDoc = await usersCol.findOne({ tipo_cuenta: 'empresa', $or: [ { empresa: empName }, { empresa_name: empName } ] }, { projection: { _id: 1, legacy_user_ids: 1, etiquetas_personalizadas: 1, cobertura_legal: 1 } });
                if (empresaDoc?._id) {
                    const legacy = Array.isArray(empresaDoc.legacy_user_ids) ? empresaDoc.legacy_user_ids.map(String) : [];
                    targetIds = [String(empresaDoc._id), ...legacy];
                    const e = empresaDoc.etiquetas_personalizadas || {};
                    etiquetas = Array.isArray(e) ? e : (typeof e === 'object' ? Object.keys(e) : []);
                    if (empresaDoc.cobertura_legal) coberturaSource = empresaDoc.cobertura_legal;
                }
            } else {
                // Individual: fallback etiquetas del propio doc si existen
                const e = base.etiquetas_personalizadas || {};
                etiquetas = Array.isArray(e) ? e : (typeof e === 'object' ? Object.keys(e) : []);
                targetIds = [String(base._id)];
            }
            let boletines = [];
            const fuentesGobierno = coberturaSource?.['fuentes-gobierno'] || coberturaSource?.fuentes_gobierno || coberturaSource?.fuentes || [];
            if (Array.isArray(fuentesGobierno) && fuentesGobierno.length) boletines = boletines.concat(fuentesGobierno);
            const fuentesReguladores = coberturaSource?.['fuentes-reguladores'] || coberturaSource?.fuentes_reguladores || coberturaSource?.['fuentes-regulador'] || coberturaSource?.reguladores || [];
            if (Array.isArray(fuentesReguladores) && fuentesReguladores.length) boletines = boletines.concat(fuentesReguladores);
            boletines = (boletines.length ? boletines : ['BOE']).map(b => String(b).toUpperCase());
            return { targetIds, etiquetas, boletines };
        }

        // Build items with like/dislike unique counts and matched total/noFeedback per user
        const items = [];
        for (const email of emails) {
            const sets = emailToSets.get(email) || { likes: new Set(), dislikes: new Set(), union: new Set() };
            const likeUnique = sets.likes.size;
            const dislikeUnique = sets.dislikes.size;
            const deletedUnique = 0; // For future breakdown if needed separately

            // Compute matched total across user's coverage and etiquetas
            let matchedTotal = 0;
            try {
                const ctx = await computeMatchContextForEmail(email);
                const expanded = Array.from(new Set(expandCollectionsWithTest(ctx.boletines).filter(n => !String(n).toLowerCase().endsWith('_test'))));
                if (ctx.etiquetas.length > 0 && ctx.targetIds.length > 0 && expanded.length > 0) {
                    const etiquetasQuery = buildEtiquetasQueryForIds(ctx.etiquetas, ctx.targetIds);
                    if (etiquetasQuery && Object.keys(etiquetasQuery).length > 0) {
                        const and = [ etiquetasQuery ];
                        const baseQuery = and.length ? { $and: and } : {};
                        for (const cName of expanded) {
                            try {
                                const exists = await collectionExists(db, cName);
                                if (!exists) continue;
                                const count = await db.collection(cName).countDocuments(baseQuery);
                                matchedTotal += Number(count || 0);
                            } catch(_) { /* ignore per collection errors */ }
                        }
                    }
                }
            } catch(_) { matchedTotal = 0; }

            const feedbackDocsCount = sets.union.size;
            const noFeedback = Math.max(0, matchedTotal - feedbackDocsCount);

            // Apply type filter to visible like/dislike counts
            const likeOut = (filterType === 'dislike') ? 0 : likeUnique;
            const dislikeOut = (filterType === 'like') ? 0 : dislikeUnique;

            items.push({ email, userId: null, displayName: email, like: likeOut, dislike: dislikeOut, deleted: deletedUnique, noFeedback, total: likeUnique + dislikeUnique + noFeedback });
        }

        // Enrich userId for items
        const userDocs = await usersCol.find({ email: { $in: emails } }, { projection: { email: 1 } }).toArray();
        const emailToId = new Map(userDocs.map(u => [u.email, String(u._id)]));
        items.forEach(it => { it.userId = emailToId.get(it.email) || null; });

        // Sort by total feedback count desc
        items.sort((a,b) => (b.total - a.total));

        return res.json({ success: true, items });
    } catch (e) {
        console.error('[internal/review/feedback/stats] error:', e);
        return res.status(500).json({ success: false, error: 'Error obteniendo estadísticas' });
    } finally {
        await client.close();
    }
});

// Update feedback_incorporado flag for a single feedback event (must be after router initialization)
router.post('/api/internal/review/feedback/incorporado', ensureAuthenticated, async (req, res) => {
    if (req.user?.email !== 'tomas@reversa.ai') {
        return res.status(403).json({ success: false, error: 'No autorizado' });
    }
    const { userEmail, coleccion, docId, value } = req.body || {};
    if (!userEmail || !coleccion || !docId || !['si','no'].includes(String(value))) {
        return res.status(400).json({ success: false, error: 'Parámetros inválidos' });
    }
    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const feedbackCol = db.collection('Feedback');
        const val = String(value);
        const q = { user_email: userEmail, content_evaluated: 'etiquetado', doc_id: String(docId), $or: [ { coleccion: coleccion }, { collection_name: coleccion } ] };
        const upd = { $set: { feedback_incorporado: val, updated_at: new Date() } };
        const r = await feedbackCol.updateMany(q, upd);
        return res.json({ success: true, modified: r.modifiedCount || 0 });
    } catch (e) {
        console.error('[internal/review/feedback/incorporado] error:', e);
        return res.status(500).json({ success: false, error: 'Error interno' });
    } finally {
        await client.close();
    }
});

module.exports = router;


