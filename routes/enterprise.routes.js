/*
Routes: Gestión de etiquetas y contexto empresa/individual
Endpoints:
- GET '/api/etiquetas-context': obtiene etiquetas según contexto del usuario (empresa/individual)  
- POST '/api/etiquetas-context': actualiza etiquetas con resolución de conflictos
- GET '/api/user-context': obtiene información del contexto del usuario (permisos, empresa, etc.)
- POST '/api/etiquetas-lock': bloquea edición para evitar conflictos concurrentes
- DELETE '/api/etiquetas-lock': libera bloqueo de edición
- POST '/api/enterprise/migrate-users': migra usuarios individuales a una estructura empresa
*/

const express = require('express');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const { 
    getEtiquetasPersonalizadas, 
    updateEtiquetasPersonalizadas, 
    getUserContext,
    lockEtiquetasForEdit,
    unlockEtiquetasForEdit,
    updateLockHeartbeat,
    getCoberturaLegal,
    updateCoberturaLegal,
    getContextData,
    updateContextData
} = require('../services/enterprise.service');

// Import migration function lazily to avoid circular deps elsewhere
const { migrateUsersToEmpresa } = require('../services/enterprise.service');

const router = express.Router();

// GET /api/etiquetas-context - Obtener etiquetas según contexto
router.get('/api/etiquetas-context', ensureAuthenticated, async (req, res) => {
    try {
        const result = await getEtiquetasPersonalizadas(req.user);
        res.json({
            success: true,
            data: result.etiquetas_personalizadas,
            source: result.source,
            version: result.version,
            estructura_id: result.estructura_id,
            user_id: result.user_id
        });
    } catch (error) {
        console.error('Error obteniendo etiquetas:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al obtener etiquetas personalizadas' 
        });
    }
});

// POST /api/etiquetas-context - Actualizar etiquetas con control de conflictos
router.post('/api/etiquetas-context', ensureAuthenticated, async (req, res) => {
    try {
        const { etiquetas_personalizadas, expectedVersion } = req.body;
        
        if (!etiquetas_personalizadas || typeof etiquetas_personalizadas !== 'object') {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere objeto etiquetas_personalizadas válido' 
            });
        }

        const result = await updateEtiquetasPersonalizadas(
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
        console.error('Error actualizando etiquetas:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al actualizar etiquetas personalizadas' 
        });
    }
});

// GET /api/user-context - Obtener contexto del usuario
router.get('/api/user-context', ensureAuthenticated, async (req, res) => {
    try {
        const context = await getUserContext(req.user);
        res.json({
            success: true,
            context
        });
    } catch (error) {
        console.error('Error obteniendo contexto de usuario:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al obtener contexto de usuario' 
        });
    }
});

// POST /api/etiquetas-lock - Bloquear edición
router.post('/api/etiquetas-lock', ensureAuthenticated, async (req, res) => {
    try {
        const { agenteName } = req.body;
        const result = await lockEtiquetasForEdit(req.user, agenteName);

        if (!result.success) {
            return res.status(423).json(result); // 423 Locked
        }

        res.json(result);
    } catch (error) {
        console.error('Error bloqueando edición:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al bloquear edición' 
        });
    }
});

// DELETE /api/etiquetas-lock - Liberar bloqueo
router.delete('/api/etiquetas-lock', ensureAuthenticated, async (req, res) => {
    try {
        const { agenteName } = req.body;
        const result = await unlockEtiquetasForEdit(req.user, agenteName);
        res.json(result);
    } catch (error) {
        console.error('Error liberando bloqueo:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al liberar bloqueo' 
        });
    }
});

// PUT /api/etiquetas-lock - Actualizar heartbeat
router.put('/api/etiquetas-lock', ensureAuthenticated, async (req, res) => {
    try {
        const { agenteName } = req.body;
        const result = await updateLockHeartbeat(req.user, agenteName);
        res.json(result);
    } catch (error) {
        console.error('Error actualizando heartbeat:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al actualizar heartbeat' 
        });
    }
});

// GET /api/cobertura-context - Obtener cobertura legal según contexto
router.get('/api/cobertura-context', ensureAuthenticated, async (req, res) => {
    try {
        const result = await getCoberturaLegal(req.user);
        res.json({
            success: true,
            cobertura_legal: result.cobertura_legal,
            rangos: result.rangos,
            source: result.source,
            version: result.version,
            estructura_id: result.estructura_id,
            user_id: result.user_id
        });
    } catch (error) {
        console.error('Error obteniendo cobertura legal:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al obtener cobertura legal' 
        });
    }
});

// POST /api/cobertura-context - Actualizar cobertura legal con control de conflictos
router.post('/api/cobertura-context', ensureAuthenticated, async (req, res) => {
    try {
        const { cobertura_legal, rangos, expectedVersion } = req.body;
        
        if (!cobertura_legal || typeof cobertura_legal !== 'object') {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere objeto cobertura_legal válido' 
            });
        }

        const result = await updateCoberturaLegal(
            req.user, 
            { cobertura_legal, rangos }, 
            expectedVersion
        );

        if (!result.success) {
            const statusCode = result.conflict ? 409 : (result.error.includes('permisos') ? 403 : 400);
            return res.status(statusCode).json(result);
        }

        res.json(result);
    } catch (error) {
        console.error('Error actualizando cobertura legal:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al actualizar cobertura legal' 
        });
    }
});

// GET /api/context-data - Obtener todos los datos de contexto según contexto
router.get('/api/context-data', ensureAuthenticated, async (req, res) => {
    try {
        const result = await getContextData(req.user);
        res.json({
            success: true,
            data: result,
            source: result.source,
            version: result.version,
            estructura_id: result.estructura_id,
            user_id: result.user_id
        });
    } catch (error) {
        console.error('Error obteniendo datos de contexto:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al obtener datos de contexto' 
        });
    }
});

// POST /api/context-data - Actualizar datos de contexto con control de conflictos
router.post('/api/context-data', ensureAuthenticated, async (req, res) => {
    try {
        const { contextData, expectedVersion } = req.body;
        
        if (!contextData || typeof contextData !== 'object') {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requieren datos de contexto válidos' 
            });
        }

        const result = await updateContextData(
            req.user, 
            contextData, 
            expectedVersion
        );

        if (!result.success) {
            const statusCode = result.conflict ? 409 : (result.error.includes('permisos') ? 403 : 400);
            return res.status(statusCode).json(result);
        }

        res.json(result);
    } catch (error) {
        console.error('Error actualizando datos de contexto:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al actualizar datos de contexto' 
        });
    }
});

// POST /api/enterprise/migrate-users - Migrar usuarios a estructura empresa
router.post('/api/enterprise/migrate-users', ensureAuthenticated, async (req, res) => {
    try {
        // Only allow admins to trigger migrations
        const context = await getUserContext(req.user);
        if (!context.is_admin) {
            return res.status(403).json({ success: false, error: 'Solo administradores pueden ejecutar migraciones' });
        }
        const { userEmails, adminEmail, empresaDomain, empresaData, defaultPermiso } = req.body || {};
        const result = await migrateUsersToEmpresa({ userEmails, adminEmail, empresaDomain, empresaData, defaultPermiso });
        if (!result.success) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (error) {
        console.error('Error en migración enterprise:', error);
        return res.status(500).json({ success: false, error: 'Error interno en migración enterprise' });
    }
});

module.exports = router; 