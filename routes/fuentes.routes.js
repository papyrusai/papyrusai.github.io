/*
Routes: Fuentes catalog API for dynamic filters and grids
Endpoints:
- GET '/api/info-fuentes' (auth): list fuentes with optional filters { nivel_geografico, pais, region, tipo_fuente }
- GET '/api/info-fuentes/facets' (auth): distinct facets for filters (nivel, tipo, pais por nivel, regiones)
*/
const express = require('express');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const { getDatabase } = require('../services/db.utils');

const router = express.Router();

// GET /api/info-fuentes
router.get('/api/info-fuentes', ensureAuthenticated, async (req, res) => {
  try {
    const { nivel_geografico, pais, region, tipo_fuente } = req.query;
    const db = await getDatabase('papyrus');
    const col = db.collection('info_fuentes');

    const filter = {};
    if (nivel_geografico && nivel_geografico !== 'Todos') filter.nivel_geografico = nivel_geografico;
    if (pais && pais !== 'Todos') filter.pais = pais;
    if (region && region !== 'Todos') filter.region = region;
    if (tipo_fuente && tipo_fuente !== 'Todos') filter.tipo_fuente = tipo_fuente;

    const docs = await col
      .find(filter, { projection: { _id: 0, sigla: 1, nombre: 1, tipo_fuente: 1, nivel_geografico: 1, pais: 1, region: 1 } })
      .sort({ tipo_fuente: 1, sigla: 1 })
      .toArray();

    res.json({ success: true, data: docs });
  } catch (err) {
    console.error('Error fetching info_fuentes:', err);
    res.status(500).json({ success: false, error: 'Error fetching fuentes' });
  }
});

// GET /api/info-fuentes/facets
router.get('/api/info-fuentes/facets', ensureAuthenticated, async (req, res) => {
  try {
    const db = await getDatabase('papyrus');
    const col = db.collection('info_fuentes');

    const [niveles, tipos, paisNacional, paisRegional, regiones] = await Promise.all([
      col.distinct('nivel_geografico', {}),
      col.distinct('tipo_fuente', {}),
      col.distinct('pais', { nivel_geografico: 'Nacional' }),
      col.distinct('pais', { nivel_geografico: 'Regional' }),
      col.distinct('region', { nivel_geografico: 'Regional' })
    ]);

    res.json({
      success: true,
      facets: {
        nivel_geografico: (niveles || []).filter(Boolean).sort(),
        tipo_fuente: (tipos || []).filter(Boolean).sort(),
        pais_nacional: (paisNacional || []).filter(Boolean).sort(),
        pais_regional: (paisRegional || []).filter(Boolean).sort(),
        regiones_regional: (regiones || []).filter(Boolean).sort()
      }
    });
  } catch (err) {
    console.error('Error fetching info_fuentes facets:', err);
    res.status(500).json({ success: false, error: 'Error fetching facets' });
  }
});

module.exports = router; 