const express = require('express');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const { 
    getEtiquetasPersonalizadasAdapter, 
    updateEtiquetasPersonalizadasAdapter,
    getEtiquetasSeleccionadasAdapter,
    getUserContext
} = require('../services/enterprise.service');

const router = express.Router();

/**
 * GET /api/etiquetas-context - Obtener etiquetas según contexto (empresa/individual)
 * Endpoint unificado que reemplaza múltiples endpoints legacy
 */
router.get('/api/etiquetas-context', ensureAuthenticated, async (req, res) => {
    try {
        const result = await getEtiquetasPersonalizadasAdapter(req.user);
        
        // Para empresas, también necesitamos información de permisos
        let permissions = null;
        if (result.isEnterprise) {
            const context = await getUserContext(req.user);
            permissions = context.permissions || {};
        }
        
        res.json({
            success: true,
            data: result.etiquetas_personalizadas,
            source: result.source,
            version: result.version,
            estructura_id: result.estructura_id,
            user_id: result.user_id,
            permissions: permissions,
            isEnterprise: result.isEnterprise
        });
        
    } catch (error) {
        console.error('Error in /api/etiquetas-context GET:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al obtener etiquetas personalizadas',
            details: error.message
        });
    }
});

/**
 * POST /api/etiquetas-context - Actualizar etiquetas con control de conflictos
 * Endpoint unificado para actualización con validación de permisos
 */
router.post('/api/etiquetas-context', ensureAuthenticated, async (req, res) => {
    try {
        const { etiquetas_personalizadas, expectedVersion } = req.body;
        
        if (!etiquetas_personalizadas || typeof etiquetas_personalizadas !== 'object') {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere objeto etiquetas_personalizadas válido' 
            });
        }

        const result = await updateEtiquetasPersonalizadasAdapter(
            req.user, 
            etiquetas_personalizadas, 
            expectedVersion
        );

        if (!result.success) {
            const statusCode = result.conflict ? 409 : (result.error.includes('permisos') ? 403 : 400);
            return res.status(statusCode).json(result);
        }

        res.json(result);
    } catch (error) {
        console.error('Error in /api/etiquetas-context POST:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al actualizar etiquetas personalizadas',
            details: error.message
        });
    }
});

/**
 * GET /api/user-context - Obtener contexto del usuario (permisos, empresa, etc.)
 * Mantener para compatibilidad con código existente
 */
router.get('/api/user-context', ensureAuthenticated, async (req, res) => {
    try {
        const context = await getUserContext(req.user);
        res.json({
            success: true,
            context
        });
    } catch (error) {
        console.error('Error in /api/user-context:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al obtener contexto de usuario',
            details: error.message
        });
    }
});

/**
 * NUEVO ENDPOINT: Obtener etiquetas seleccionadas del usuario
 * Devuelve solo las etiquetas marcadas como seleccionadas por el usuario
 * Para cuentas enterprise, respeta la estructura_empresa como fuente de verdad
 * Incluye degradación elegante si etiquetas seleccionadas ya no existen
 */
router.get('/api/etiquetas-seleccionadas', ensureAuthenticated, async (req, res) => {
    try {
        const result = await getEtiquetasSeleccionadasAdapter(req.user);
        
        res.json({
            success: true,
            etiquetas_seleccionadas: result.etiquetas_seleccionadas,
            etiquetas_mapping: result.etiquetas_mapping,
            metadata: {
                source: result.source,
                isEnterprise: result.isEnterprise,
                tipo_cuenta: req.user?.tipo_cuenta || 'individual',
                total_disponibles: result.total_disponibles,
                total_seleccionadas: result.total_seleccionadas,
                etiquetas_filtradas: result.etiquetas_filtradas
            },
            etiquetas_disponibles: result.etiquetas_disponibles
        });
        
        // Log para debugging en desarrollo
        if (result.etiquetas_filtradas > 0) {
            console.log(`Usuario ${req.user.email}: ${result.etiquetas_filtradas} etiquetas seleccionadas filtradas (no existen en fuente de verdad)`);
        }
        
    } catch (error) {
        console.error('Error in /api/etiquetas-seleccionadas:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            details: error.message
        });
    }
});

module.exports = router; 