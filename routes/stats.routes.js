/*
Routes: Stats aggregator for Tendencias Normativas
- GET  '/api/stats/facets' (auth): distinct facets (rangos, divisiones, ramas) from Spanish sources since MIN_DATE
- POST '/api/stats/tendencias' (auth): aggregated series, distributions and heatmap based on filters; caches results in 'stats'
*/
const express = require('express');
const crypto = require('crypto');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const { getDatabase } = require('../services/db.utils');

const router = express.Router();

// Constants
const STATS_COLLECTION = 'stats';
const INFO_FUENTES = 'info_fuentes';
const DEFAULT_DB = 'papyrus';
// Fecha mínima (11/08/2025) configurable por env STATS_MIN_DATE=YYYY-MM-DD
const MIN_DATE = new Date(process.env.STATS_MIN_DATE || '2025-08-11T00:00:00.000Z');
// TTL cache para entradas en 'stats' (segundos)
const DEFAULT_TTL_SECONDS = Number(process.env.STATS_TTL_SECONDS || 600); // 10 min por defecto

// Candidate date fields to coalesce into createdAt (robust against varied schemas)
const CANDIDATE_DATE_FIELDS = [
  'date_time_insert',
  'datetime_insert',
  'fecha_disposicion',
  'fecha_publicacion',
  'publication_date',
  'publishedAt',
  'published_at',
  'pubDate',
  'pub_date',
  'fecha',
  'date',
  'fechaPublicacion',
  'fecha_publicado',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at'
];

// In-memory cache for Spanish sources to avoid repeat lookups
let __spanishSourcesCache = null; // { allSiglas: string[], regionalBulletins: Array<{region: string, sigla: string, nombre: string}> }
let __spanishSourcesCacheAt = 0;
const SPANISH_SOURCES_TTL_MS = 10 * 60 * 1000; // 10 min

function stableStringify(obj){
  return JSON.stringify(obj, Object.keys(obj).sort());
}
function hashParams(params){
  return crypto.createHash('sha1').update(stableStringify(params)).digest('hex');
}

async function ensureStatsIndexes(db){
  const col = db.collection(STATS_COLLECTION);
  try {
    await col.createIndex({ key: 1 }, { name: 'key_idx' });
  } catch(_e){}
  try {
    await col.createIndex({ expiresAt: 1 }, { name: 'ttl_idx', expireAfterSeconds: 0 });
  } catch(_e){}
}

async function getSpanishSources(db){
  const now = Date.now();
  if (__spanishSourcesCache && (now - __spanishSourcesCacheAt) < SPANISH_SOURCES_TTL_MS) return __spanishSourcesCache;
  const col = db.collection(INFO_FUENTES);
  const all = await col.find({
    $or: [
      { pais: 'España', nivel_geografico: { $in: ['Nacional', 'Regional'] } },
      { nivel_geografico: 'Europeo' }
    ]
  }, { projection: { sigla: 1, nombre: 1, tipo_fuente: 1, nivel_geografico: 1, region: 1, pais: 1 } }).toArray();
  
  console.log('[stats] ========== INFO_FUENTES CONFIGURATION ==========');
  console.log('[stats] Total sources found:', all.length);
  
  // Log all sources by category
  const nacional = all.filter(x => x.nivel_geografico === 'Nacional');
  const regional = all.filter(x => x.nivel_geografico === 'Regional');
  const europeo = all.filter(x => x.nivel_geografico === 'Europeo');
  
  console.log('[stats] NACIONAL sources:', nacional.length);
  nacional.forEach(x => console.log(`  - ${x.sigla}: ${x.nombre} (${x.tipo_fuente})`));
  
  console.log('[stats] EUROPEO sources:', europeo.length);
  europeo.forEach(x => console.log(`  - ${x.sigla}: ${x.nombre} (${x.tipo_fuente})`));
  
  console.log('[stats] REGIONAL sources:', regional.length);
  regional.forEach(x => console.log(`  - ${x.sigla}: ${x.nombre} (${x.tipo_fuente}) → ${x.region || 'NO REGION'}`));
  
  const allSiglas = Array.from(new Set(all.map(x => (x.sigla || '').trim()).filter(Boolean)));
  const regionalBulletins = all.filter(x => x.nivel_geografico === 'Regional' && x.tipo_fuente === 'Boletines Oficiales' && x.region && x.sigla).map(x => ({ region: x.region, sigla: x.sigla, nombre: x.nombre }));
  
  console.log('[stats] Final allSiglas for processing:', allSiglas);
  console.log('[stats] Regional bulletins for heatmap:', regionalBulletins.length);
  console.log('[stats] ===============================================');
  
  __spanishSourcesCache = { allSiglas, regionalBulletins };
  __spanishSourcesCacheAt = now;
  return __spanishSourcesCache;
}

function clampToMinDate(date){
  return (date && date < MIN_DATE) ? new Date(MIN_DATE) : (date || new Date(MIN_DATE));
}

function resolvePeriod(periodo){
  // periodo: { preset: '30'|'90'|'365'|'ytd'|'custom', start?: 'YYYY-MM-DD', end?: 'YYYY-MM-DD' }
  const now = new Date();
  let start, end;
  if (periodo && periodo.preset === 'custom' && periodo.start) {
    start = new Date(periodo.start);
    end = periodo.end ? new Date(periodo.end) : now;
  } else {
    switch((periodo && periodo.preset) || '90'){
      case '30': start = new Date(now); start.setDate(start.getDate()-30); break;
      case '365': start = new Date(now); start.setDate(start.getDate()-365); break;
      case 'ytd': start = new Date(now.getFullYear(), 0, 1); break;
      case '90': default: start = new Date(now); start.setDate(start.getDate()-90); break;
    }
    end = now;
  }
  start = clampToMinDate(start);
  if (!end) end = now; if (end < MIN_DATE) end = new Date(MIN_DATE);
  
  // Periodo anterior con misma longitud
  const ms = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime()); // El final del periodo anterior es el inicio del actual
  const prevStart = new Date(prevEnd.getTime() - ms); // El inicio del anterior es prevEnd - duración
  
  // IMPORTANTE: Solo aplicar clampToMinDate a prevStart, NO a prevEnd
  // Si prevStart < MIN_DATE, lo ajustamos pero mantenemos prevEnd = start
  const clampedPrevStart = clampToMinDate(prevStart);
  
  return { 
    start, 
    end, 
    prevStart: clampedPrevStart, 
    prevEnd: prevEnd // NO aplicar clamp aquí para mantener el periodo correcto
  };
}

function normalizeFilters(raw){
  const pick = (arr)=> {
    if (!Array.isArray(arr)) return [];
    // Si contiene "Todos", significa sin filtro específico
    if (arr.some(v => v === 'Todos')) return [];
    // Si no, filtrar valores válidos y convertir a minúsculas
    return arr.filter(v => v && v !== 'Todos').map(v => String(v).toLowerCase());
  };
  return {
    rangos: pick(raw.rangos),
    divisiones: pick(raw.divisiones),
    ramas: pick(raw.ramas),
    excluirOutliers: !!raw.excluirOutliers
  };
}

function buildFacetPipeline({ start, end, prevStart, prevEnd }, filters){
  // Coalesce date fields to a robust createdAt, accepting Date/string/number
  const coalescedCreatedAtExpr = (() => {
    const candidates = CANDIDATE_DATE_FIELDS.map(field => ({
      $cond: [
        { $eq: [{ $type: `$${field}` }, 'date'] },
        `$${field}`,
        { $convert: { input: `$${field}`, to: 'date', onError: null, onNull: null } }
      ]
    }));
    return {
      $let: {
        vars: {
          arr: {
            $filter: { input: candidates, as: 'd', cond: { $ne: ['$$d', null] } }
          }
        },
        in: { $arrayElemAt: ['$$arr', 0] }
      }
    };
  })();

  // Build dynamic array transformations for divisiones and ramas
  const setArraysStage = {
    $set: {
      createdAt: coalescedCreatedAtExpr,
      rangoLC: { $toLower: { $trim: { input: { $ifNull: ['$rango_titulo', ''] } } } },
      divisionesArray: {
        $cond: [
          { $isArray: '$divisiones' }, '$divisiones',
          { $cond: [
            { $eq: [{ $type: '$divisiones' }, 'object'] },
            { $map: { input: { $objectToArray: '$divisiones' }, as: 'kv', in: '$$kv.k' } },
            { $cond: [ { $eq: [{ $type: '$divisiones' }, 'string'] }, [ '$divisiones' ], [] ] }
          ] }
        ]
      },
      divisionesLC: {
        $map: { input: {
          $cond: [
            { $isArray: '$divisiones' }, '$divisiones',
            { $cond: [
              { $eq: [{ $type: '$divisiones' }, 'object'] },
              { $map: { input: { $objectToArray: '$divisiones' }, as: 'kv', in: '$$kv.k' } },
              { $cond: [ { $eq: [{ $type: '$divisiones' }, 'string'] }, [ '$divisiones' ], [] ] }
            ] }
          ]
        }, as: 'v', in: { $toLower: { $trim: { input: { $toString: '$$v' } } } } }
      },
      ramasArray: {
        $cond: [
          { $isArray: '$ramas_juridicas' }, '$ramas_juridicas',
          { $cond: [
            { $eq: [{ $type: '$ramas_juridicas' }, 'object'] },
            { $map: { input: { $objectToArray: '$ramas_juridicas' }, as: 'kv', in: '$$kv.k' } },
            { $cond: [ { $eq: [{ $type: '$ramas_juridicas' }, 'string'] }, [ '$ramas_juridicas' ], [] ] }
          ] }
        ]
      },
      ramasLC: {
        $map: { input: {
          $cond: [
            { $isArray: '$ramas_juridicas' }, '$ramas_juridicas',
            { $cond: [
              { $eq: [{ $type: '$ramas_juridicas' }, 'object'] },
              { $map: { input: { $objectToArray: '$ramas_juridicas' }, as: 'kv', in: '$$kv.k' } },
              { $cond: [ { $eq: [{ $type: '$ramas_juridicas' }, 'string'] }, [ '$ramas_juridicas' ], [] ] }
            ] }
          ]
        }, as: 'v', in: { $toLower: { $trim: { input: { $toString: '$$v' } } } } }
      }
    }
  };

  // Base filter stages (WITHOUT outliers) - these apply to all aggregations
  const baseFilterStages = [];
  baseFilterStages.push({ $match: { createdAt: { $gte: start, $lte: end } } });
  if (filters.rangos.length > 0) baseFilterStages.push({ $match: { rangoLC: { $in: filters.rangos } } });
  if (filters.divisiones.length > 0) baseFilterStages.push({ $match: { $expr: { $gt: [ { $size: { $setIntersection: ['$divisionesLC', filters.divisiones] } }, 0 ] } } });
  if (filters.ramas.length > 0) baseFilterStages.push({ $match: { $expr: { $gt: [ { $size: { $setIntersection: ['$ramasLC', filters.ramas] } }, 0 ] } } });

  // Base filter stages for previous period (WITHOUT outliers)
  const basePrevStages = [];
  basePrevStages.push({ $match: { createdAt: { $gte: prevStart, $lte: prevEnd } } });
  if (filters.rangos.length > 0) basePrevStages.push({ $match: { rangoLC: { $in: filters.rangos } } });
  if (filters.divisiones.length > 0) basePrevStages.push({ $match: { $expr: { $gt: [ { $size: { $setIntersection: ['$divisionesLC', filters.divisiones] } }, 0 ] } } });
  if (filters.ramas.length > 0) basePrevStages.push({ $match: { $expr: { $gt: [ { $size: { $setIntersection: ['$ramasLC', filters.ramas] } }, 0 ] } } });

  // Outlier exclusion filters (only applied to specific aggregations)
  const rangoOutlierFilter = filters.excluirOutliers ? { $match: { rangoLC: { $ne: 'otras' } } } : null;
  const divisionOutlierFilter = filters.excluirOutliers ? { $match: { divisionesLC: { $nin: ['administración pública', 'administracion pública', 'administración publica', 'administracion publica', 'adminsitracion publica', 'administracion publica'] } } } : null;
  const ramaOutlierFilter = filters.excluirOutliers ? { $match: { ramasLC: { $nin: ['derecho público sectorial', 'derecho publico sectorial', 'derecho publico sectorial', 'derecho administrativo general', 'derecho administrativo general'] } } } : null;

  return [
    // IMPORTANT: compute createdAt BEFORE any match to avoid excluding docs with alternative date fields
    setArraysStage,
    { $facet: {
      series: [
        ...baseFilterStages,
        { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' }, d: { $dayOfMonth: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } }
      ],
      seriesPrev: [
        ...basePrevStages,
        { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' }, d: { $dayOfMonth: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } }
      ],
      rangos: [
        ...baseFilterStages,
        ...(rangoOutlierFilter ? [rangoOutlierFilter] : []),
        { $group: { _id: { $ifNull: ['$rango_titulo', 'Indefinido'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ],
      divisiones: [
        ...baseFilterStages,
        { $unwind: { path: '$divisionesArray', preserveNullAndEmptyArrays: false } },
        ...(divisionOutlierFilter ? [{ $match: { divisionesArray: { $nin: ['Administración pública', 'administración pública', 'Administración publica', 'administracion publica', 'adminsitracion publica', 'Administracion publica'] } } }] : []),
        { $group: { _id: '$divisionesArray', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ],
      ramas: [
        ...baseFilterStages,
        { $unwind: { path: '$ramasArray', preserveNullAndEmptyArrays: false } },
        ...(ramaOutlierFilter ? [{ $match: { ramasArray: { $nin: ['Derecho público sectorial', 'derecho publico sectorial', 'Derecho publico sectorial', 'Derecho administrativo general', 'derecho administrativo general'] } } }] : []),
        { $group: { _id: '$ramasArray', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ],
      total: [
        ...baseFilterStages,
        { $count: 'n' }
      ],
      pagesSumCount: [
        ...baseFilterStages,
        { $match: { num_paginas: { $type: 'number' } } },
        { $group: { _id: null, sum: { $sum: '$num_paginas' }, count: { $sum: 1 } } }
      ],
      pagesDist: [
        ...baseFilterStages,
        { $match: { num_paginas: { $type: 'number' } } },
        { $group: { _id: '$num_paginas', c: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]
    } }
  ];
}

function mergeCounts(target, arr){
  for (const { _id, count } of arr || []){
    target[_id] = (target[_id] || 0) + (count || 0);
  }
}

function mergeSeries(target, arr){
  for (const { _id, count } of arr || []){
    const key = `${_id.y}-${String(_id.m).padStart(2,'0')}-${String(_id.d).padStart(2,'0')}`;
    target[key] = (target[key] || 0) + (count || 0);
  }
}

function computeMedianFromDistribution(dist){
  // dist: { value:number -> count:number }
  const entries = Object.entries(dist).map(([v,c]) => ({ v: Number(v), c: Number(c) })).sort((a,b)=> a.v - b.v);
  const total = entries.reduce((s,e)=> s+e.c, 0);
  if (total === 0) return null;
  let acc = 0;
  const mid = (total + 1) / 2; // median position (1-based)
  for (const e of entries){
    acc += e.c;
    if (acc >= mid) return e.v;
  }
  return entries.length ? entries[Math.floor(entries.length/2)].v : null;
}

function regionToIso(name){
  const map = {
    'Andalucía': 'ES-AN',
    'Aragón': 'ES-AR',
    'Principado de Asturias': 'ES-AS',
    'Illes Balears': 'ES-IB', 'Islas Baleares': 'ES-IB',
    'Canarias': 'ES-CN',
    'Cantabria': 'ES-CB',
    'Castilla y León': 'ES-CL',
    'Castilla-La Mancha': 'ES-CM',
    'Cataluña': 'ES-CT', 'Catalunya': 'ES-CT',
    'Comunidad Valenciana': 'ES-VC', 'Comunitat Valenciana': 'ES-VC', 'C. Valenciana': 'ES-VC',
    'Extremadura': 'ES-EX',
    'Galicia': 'ES-GA',
    'La Rioja': 'ES-RI',
    'Comunidad de Madrid': 'ES-MD', 'Madrid': 'ES-MD',
    'Región de Murcia': 'ES-MC', 'Murcia': 'ES-MC',
    'Comunidad Foral de Navarra': 'ES-NC', 'Navarra': 'ES-NC',
    'País Vasco': 'ES-PV', 'Euskadi': 'ES-PV',
    'Ceuta': 'ES-CE', 'Ciudad Autónoma de Ceuta': 'ES-CE',
    'Melilla': 'ES-ML', 'Ciudad Autónoma de Melilla': 'ES-ML'
  };
  return map[name] || null;
}

// GET /api/stats/facets
router.get('/api/stats/facets', ensureAuthenticated, async (req, res) => {
  try {
    const db = await getDatabase(DEFAULT_DB);
    const { allSiglas } = await getSpanishSources(db);

    const periodo = resolvePeriod({ preset: '365' });
    const filters = normalizeFilters({});
    const pipeline = buildFacetPipeline(periodo, filters);

    // Run once per collection and union results
    const results = await Promise.all(allSiglas.map(sigla => db.collection(sigla).aggregate(pipeline, { allowDiskUse: true }).toArray().then(r => r[0]).catch(()=> null)));

    const rangosMap = {}; const divisionesMap = {}; const ramasMap = {};
    for (const r of results){
      if (!r) continue;
      mergeCounts(rangosMap, r.rangos);
      mergeCounts(divisionesMap, r.divisiones);
      mergeCounts(ramasMap, r.ramas);
    }

    const rangos = Object.keys(rangosMap).filter(Boolean).sort();
    const divisiones = Object.keys(divisionesMap).filter(Boolean).sort();
    const ramas = Object.keys(ramasMap).filter(Boolean).sort();

    res.json({ success: true, facets: { rangos, divisiones, ramas } });
  } catch (err) {
    console.error('[stats.facets] error', err);
    res.status(500).json({ success: false, error: 'Error computing facets' });
  }
});

// POST /api/stats/tendencias
router.post('/api/stats/tendencias', ensureAuthenticated, async (req, res) => {
  try {
    const db = await getDatabase(DEFAULT_DB);
    await ensureStatsIndexes(db);

    const body = req.body || {};
    const periodo = resolvePeriod(body.periodo || { preset: '90' });
    const filters = normalizeFilters(body);

    console.log('[stats] request', { periodo, filters });

    // Build cache key
    const key = 'tendencias:' + hashParams({ periodo, filters, scope: 'espanha' });

    // Try cache first - TEMPORALMENTE DESHABILITADO PARA DEBUG
    /*
    const statsCol = db.collection(STATS_COLLECTION);
    const cached = await statsCol.findOne({ key });
    if (cached && cached.data && cached.expiresAt && cached.expiresAt > new Date()){
      return res.json({ success: true, cached: true, data: cached.data });
    }
    */

    const { allSiglas, regionalBulletins } = await getSpanishSources(db);

    console.log('[stats] processing with filters:', filters);
    console.log('[stats] allSiglas:', allSiglas.slice(0, 5), '... (total:', allSiglas.length, ')');

    const pipeline = buildFacetPipeline(periodo, filters);
    console.log('[stats] pipeline first few stages:', JSON.stringify(pipeline.slice(0, 3), null, 2));
    
    const perColl = await Promise.all(allSiglas.map(sigla => db.collection(sigla).aggregate(pipeline, { allowDiskUse: true }).toArray().then(r => r[0]).catch(()=> null)));

    const seriesMap = {}; const seriesPrevMap = {};
    const rangosMap = {}; const divisionesMap = {}; const ramasMap = {};
    let totalDocs = 0; let pagesSum = 0; let pagesCount = 0; const pagesDist = {};

    // Heatmap accumulation structures
    const siglaToRegion = new Map(regionalBulletins.map(({ region, sigla }) => [sigla, region]));
    const heatmapByRegionName = {};
    
    console.log('[stats] ========== HEATMAP CALCULATION REPORT ==========');
    console.log('[stats] Regional bulletins configuration:');
    regionalBulletins.forEach(({ region, sigla, nombre }) => {
      console.log(`  - ${region}: ${sigla} (${nombre})`);
    });
    console.log('[stats] Total collections to process:', allSiglas.length);
    console.log('[stats] Collections:', allSiglas);

    perColl.forEach((r, idx) => {
      if (!r) return;
      mergeSeries(seriesMap, r.series);
      mergeSeries(seriesPrevMap, r.seriesPrev);
      mergeCounts(rangosMap, r.rangos);
      mergeCounts(divisionesMap, r.divisiones);
      mergeCounts(ramasMap, r.ramas);
      if (Array.isArray(r.total) && r.total[0] && typeof r.total[0].n === 'number') {
        const n = r.total[0].n;
        totalDocs += n;
        const sigla = allSiglas[idx];
        const region = siglaToRegion.get(sigla) || null;
        
        console.log(`[stats] Collection ${sigla}: ${n} documents${region ? ` → ${region}` : ' (no region mapping)'}`);
        
        if (region) {
          heatmapByRegionName[region] = (heatmapByRegionName[region] || 0) + n;
          console.log(`  ✓ Added to ${region}, new total: ${heatmapByRegionName[region]}`);
        } else if (sigla !== 'boe' && sigla !== 'doue') { // Skip expected national/european sources
          console.log(`  ⚠️  Collection ${sigla} has no region mapping`);
        }
      }
      if (Array.isArray(r.pagesSumCount) && r.pagesSumCount[0]){
        pagesSum += Number(r.pagesSumCount[0].sum || 0);
        pagesCount += Number(r.pagesSumCount[0].count || 0);
      }
      for (const e of (r.pagesDist || [])){
        const v = Number(e._id); const c = Number(e.c || 0);
        if (!isNaN(v) && c>0) pagesDist[v] = (pagesDist[v] || 0) + c;
      }
    });
    
    console.log('[stats] ========== HEATMAP RESULTS BY REGION ==========');
    Object.entries(heatmapByRegionName).forEach(([region, count]) => {
      console.log(`  ${region}: ${count} documents`);
    });
    console.log('[stats] =================================================');

    // Build ordered labels from start..end inclusive (YYYY-MM-DD)
    const labels = [];
    const cursor = new Date(periodo.start.getFullYear(), periodo.start.getMonth(), periodo.start.getDate());
    const endDate = new Date(periodo.end.getFullYear(), periodo.end.getMonth(), periodo.end.getDate());
    while (cursor <= endDate){
      labels.push(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`);
      cursor.setDate(cursor.getDate() + 1);
    }

    const serieData = labels.map(l => seriesMap[l] || 0);
    const sumCurrent = serieData.reduce((a,b)=>a+b,0);
    const sumPrev = Object.values(seriesPrevMap).reduce((a,b)=>a+b,0);
    
    // Calcular delta solo si el periodo anterior es válido (después de MIN_DATE)
    // Si prevStart < MIN_DATE, significa que no tenemos datos suficientes para comparar
    let deltaPct = null;
    
    console.log('[stats] DELTA CALCULATION DEBUG:');
    console.log('  - Periodo actual:', { start: periodo.start.toISOString(), end: periodo.end.toISOString() });
    console.log('  - Periodo anterior:', { start: periodo.prevStart.toISOString(), end: periodo.prevEnd.toISOString() });
    console.log('  - MIN_DATE:', MIN_DATE.toISOString());
    console.log('  - prevStart >= MIN_DATE:', periodo.prevStart >= MIN_DATE);
    console.log('  - Duración actual (ms):', periodo.end.getTime() - periodo.start.getTime());
    console.log('  - Duración anterior (ms):', periodo.prevEnd.getTime() - periodo.prevStart.getTime());
    console.log('  - sumCurrent:', sumCurrent, 'sumPrev:', sumPrev);
    
    if (periodo.prevStart >= MIN_DATE && sumPrev > 0) {
      // Calcular la media diaria de cada periodo para comparación más justa
      const daysCurrent = Math.ceil((periodo.end - periodo.start) / (1000 * 60 * 60 * 24));
      const daysPrev = Math.ceil((periodo.prevEnd - periodo.prevStart) / (1000 * 60 * 60 * 24));
      
      const avgCurrent = daysCurrent > 0 ? sumCurrent / daysCurrent : 0;
      const avgPrev = daysPrev > 0 ? sumPrev / daysPrev : 0;
      
      console.log('  - daysCurrent:', daysCurrent, 'daysPrev:', daysPrev);
      console.log('  - avgCurrent:', avgCurrent.toFixed(2), 'avgPrev:', avgPrev.toFixed(2));
      
      if (avgPrev > 0) {
        deltaPct = ((avgCurrent - avgPrev) / avgPrev) * 100;
        console.log('  - deltaPct calculado:', deltaPct.toFixed(2), '%');
      } else {
        console.log('  - avgPrev es 0, no se puede calcular deltaPct');
      }
    } else {
      console.log('  - Condición no cumplida para calcular delta');
      if (periodo.prevStart < MIN_DATE) {
        console.log('    Razón: prevStart < MIN_DATE');
      }
      if (sumPrev <= 0) {
        console.log('    Razón: sumPrev <= 0');
      }
    }

    const rangos = Object.entries(rangosMap).sort((a,b)=> b[1]-a[1]).map(([k,v])=>({ label: k, value: v }));
    const divisiones = Object.entries(divisionesMap).sort((a,b)=> b[1]-a[1]).map(([k,v])=>({ label: k, value: v }));
    const ramas = Object.entries(ramasMap).sort((a,b)=> b[1]-a[1]).map(([k,v])=>({ label: k, value: v }));

    console.log('[stats] result', { totalDocs, labels: labels.length, sumCurrent, sumPrev, deltaPct, prevStartValid: periodo.prevStart >= MIN_DATE, prevStart: periodo.prevStart.toISOString(), minDate: MIN_DATE.toISOString(), rangos: rangos.slice(0,5), divisiones: divisiones.slice(0,5) });

    const medianPages = computeMedianFromDistribution(pagesDist);

    // Heatmap: build both byRegionName and byIso
    const heatmap = { byRegionName: {}, byIso: {} };
    
    console.log('[stats] ========== REGION TO ISO MAPPING ==========');
    Object.keys(heatmapByRegionName).forEach(region => {
      const count = heatmapByRegionName[region];
      heatmap.byRegionName[region] = count;
      const iso = regionToIso(region);
      if (iso) {
        heatmap.byIso[iso] = (heatmap.byIso[iso] || 0) + count;
        console.log(`  ${region} → ${iso}: ${count} documents`);
      } else {
        console.log(`  ⚠️  ${region} → NO ISO CODE: ${count} documents`);
      }
    });
    
    console.log('[stats] Final heatmap by ISO:');
    Object.entries(heatmap.byIso).forEach(([iso, count]) => {
      console.log(`  ${iso}: ${count} documents`);
    });
    console.log('[stats] =======================================');

    const data = {
      labels,
      series: [{ label: 'Total', data: serieData }],
      rangos,
      divisiones,
      ramas,
      kpis: {
        total: totalDocs,
        paginas: pagesCount > 0 ? pagesSum : null,
        mediana_paginas: medianPages,
        delta_pct: deltaPct,
        top_rango: rangos[0]?.label || null,
        top_division: divisiones[0]?.label || null
      },
      heatmap
    };

    const expiresAt = new Date(Date.now() + DEFAULT_TTL_SECONDS * 1000);
    // TEMPORALMENTE DESHABILITADO PARA DEBUG
    /*
    await statsCol.updateOne(
      { key },
      { $set: { key, data, computedAt: new Date(), expiresAt, version: 1, params: { periodo, filters } } },
      { upsert: true }
    );
    */

    res.json({ success: true, cached: false, data });
  } catch (err) {
    console.error('[stats.tendencias] error', err);
    res.status(500).json({ success: false, error: 'Error computing stats' });
  }
});

module.exports = router; 