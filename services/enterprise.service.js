/*
Servicio resolver de etiquetas para contexto empresa/individual
Abstrae lectura/escritura de etiquetas_personalizadas según el tipo de cuenta del usuario.
- Usuarios individuales: opera sobre users.etiquetas_personalizadas
- Usuarios empresa: opera sobre estructura_empresa.etiquetas_personalizadas (fuente de verdad)
- Incluye resolución de conflictos y bloqueos de edición concurrente
*/

const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.DB_URI;
const mongodbOptions = {};

// Reuse helpers from users.service.js
let usersServiceHelpers = null;
function _getUsersServiceHelpers() {
    if (!usersServiceHelpers) {
        usersServiceHelpers = require('./users.service');
    }
    return usersServiceHelpers;
}

/**
 * Migra un conjunto de usuarios (individuales) a una cuenta de empresa compartida.
 * Crea (o reutiliza) un documento estructura_empresa y actualiza los usuarios con permisos y referencias.
 * @param {Object} input - { userEmails: string[], adminEmail: string, empresaDomain?: string, empresaData?: object, defaultPermiso?: 'lectura'|'edicion' }
 * @returns {Object} - { success, estructura_empresa_id, empresa, updatedUsers: Array, skipped: Array, errors: Array }
 */
async function migrateUsersToEmpresa(input) {
    const client = new MongoClient(uri, mongodbOptions);
    try {
        const { userEmails, adminEmail, empresaDomain: domainInput, empresaData = {}, defaultPermiso = 'lectura' } = input || {};

        if (!Array.isArray(userEmails) || userEmails.length === 0) {
            return { success: false, error: 'Se requiere un array userEmails con al menos un email' };
        }
        if (!adminEmail || typeof adminEmail !== 'string') {
            return { success: false, error: 'Se requiere adminEmail válido' };
        }

        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');

        const { extractDomainFromEmail, createEstructuraEmpresa, ensureEmpresaIndex, getUserLimits } = _getUsersServiceHelpers();

        const adminDoc = await usersCollection.findOne({ email: adminEmail });
        if (!adminDoc) {
            return { success: false, error: `No se encontró el usuario admin con email ${adminEmail}` };
        }
        const adminId = (adminDoc._id instanceof ObjectId) ? adminDoc._id : new ObjectId(String(adminDoc._id));

        const empresaDomain = (domainInput && typeof domainInput === 'string') ? domainInput.toLowerCase() : (extractDomainFromEmail(adminEmail) || extractDomainFromEmail(userEmails[0]));
        if (!empresaDomain) {
            return { success: false, error: 'No se pudo determinar el dominio de empresa (empresaDomain)' };
        }

        // Crear o reutilizar estructura_empresa
        await ensureEmpresaIndex(client);
        let estructura = await db.collection('users').findOne({ tipo_cuenta: 'estructura_empresa', empresa: empresaDomain });
        if (!estructura) {
            estructura = await createEstructuraEmpresa(empresaDomain, adminId);
        }
        const estructuraId = (estructura._id instanceof ObjectId) ? estructura._id : new ObjectId(String(estructura._id));

        // Construir datos para actualizar estructura con overrides y valores por defecto
        const now = new Date();
        const plan4Limits = getUserLimits('plan4') || { limit_agentes: null, limit_fuentes: null };

        // Si hay datos en empresaData, fusionar con valores existentes/por defecto
        const estructuraUpdate = {
            subscription_plan: 'plan4',
            limit_agentes: plan4Limits.limit_agentes,
            limit_fuentes: plan4Limits.limit_fuentes,
            impact_analysis_limit: -1,
            profile_type: 'empresa',
            admin_principal_id: estructura.admin_principal_id || adminId,
            updated_at: now
        };
        const allowedEmpresaFields = [
            'company_name', 'web', 'detalle_empresa', 'interes', 'tamaño_empresa', 'perfil_regulatorio',
            'website_extraction_status', 'industry_tags', 'sub_industria_map', 'rama_juridicas', 'sub_rama_map',
            'cobertura_legal', 'rangos', 'etiquetas_personalizadas', 'tipo_empresa'
        ];
        allowedEmpresaFields.forEach(k => {
            if (empresaData[k] !== undefined) estructuraUpdate[k] = empresaData[k];
        });

        await usersCollection.updateOne({ _id: estructuraId }, { $set: estructuraUpdate });

        // Actualizar usuarios
        const updatedUsers = [];
        const skipped = [];
        const errors = [];

        // Campos individuales a limpiar en usuarios empresa (propios de cuentas individuales)
        const individualFieldsToUnset = [
            'cobertura_legal', 'industry_tags', 'sub_industria_map', 'rama_juridicas', 'sub_rama_map', 'rangos',
            'perfil_regulatorio', 'website_extraction_status', 'tipo_empresa', 'detalle_empresa', 'interes',
            'tamaño_empresa', 'web', 'company_name', 'etiquetas_personalizadas', 'estructura_carpetas_user'
        ];

        for (const email of userEmails) {
            try {
                const userDoc = await usersCollection.findOne({ email });
                if (!userDoc) {
                    skipped.push({ email, reason: 'usuario_no_encontrado' });
                    continue;
                }
                const userId = (userDoc._id instanceof ObjectId) ? userDoc._id : new ObjectId(String(userDoc._id));
                const isAdmin = email.toLowerCase() === adminEmail.toLowerCase();

                const permiso = isAdmin ? 'admin' : (defaultPermiso === 'edicion' ? 'edicion' : 'lectura');

                const $set = {
                    tipo_cuenta: 'empresa',
                    empresa: empresaDomain,
                    estructura_empresa_id: estructuraId,
                    admin_empresa_id: adminId,
                    permiso,
                    subscription_plan: 'plan4',
                    limit_agentes: plan4Limits.limit_agentes,
                    limit_fuentes: plan4Limits.limit_fuentes,
                    updated_at: now
                };

                const $unset = {};
                individualFieldsToUnset.forEach(f => $unset[f] = '');

                await usersCollection.updateOne({ _id: userId }, { $set, $unset });
                updatedUsers.push({ email, userId, permiso });
            } catch (e) {
                errors.push({ email, error: e.message });
            }
        }

        return { success: true, estructura_empresa_id: estructuraId, empresa: empresaDomain, updatedUsers, skipped, errors };
    } finally {
        await client.close();
    }
}

/**
 * Obtiene las etiquetas personalizadas según el contexto del usuario
 * @param {Object} user - Usuario con tipo_cuenta y estructura_empresa_id
 * @returns {Object} - { etiquetas_personalizadas, source: 'individual'|'empresa' }
 */
async function getEtiquetasPersonalizadas(user) {
    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');

        if (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id) {
            // Leer desde estructura_empresa (fuente de verdad)
            const estructuraDoc = await usersCollection.findOne({ 
                _id: (user.estructura_empresa_id instanceof ObjectId) ? user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id))
            });
            
            if (estructuraDoc) {
                return {
                    etiquetas_personalizadas: estructuraDoc.etiquetas_personalizadas || {},
                    source: 'empresa',
                    estructura_id: estructuraDoc._id,
                    version: estructuraDoc.estructura_carpetas?.version || 1
                };
            }
        }
        
        // Fallback a usuario individual o si no se encuentra estructura
        const userDoc = await usersCollection.findOne({ 
            _id: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id))
        });
        
        // Normalizar: si el usuario tiene etiquetas_personalizadas como array (legacy), convertir a objeto
        const etiquetasRaw = userDoc?.etiquetas_personalizadas || {};
        const etiquetasNormalized = Array.isArray(etiquetasRaw)
            ? etiquetasRaw.reduce((acc, k) => { acc[k] = ''; return acc; }, {})
            : etiquetasRaw;
        
        return {
            etiquetas_personalizadas: etiquetasNormalized,
            source: 'individual',
            user_id: userDoc?._id
        };
    } finally {
        await client.close();
    }
}

/**
 * Actualiza las etiquetas personalizadas con resolución de conflictos
 * @param {Object} user - Usuario que realiza la actualización
 * @param {Object} cambios - Cambios a aplicar a etiquetas_personalizadas
 * @param {Number} expectedVersion - Versión esperada para control optimista (solo empresa)
 * @returns {Object} - { success, newVersion?, error?, conflict? }
 */
async function updateEtiquetasPersonalizadas(user, cambios, expectedVersion = null) {
    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');

        if (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id) {
            // Verificar permisos
            if (!['admin', 'edicion'].includes(user.permiso)) {
                return { 
                    success: false, 
                    error: 'Sin permisos para editar etiquetas empresariales. Se requiere permiso admin o edición.' 
                };
            }

            const estructuraId = (user.estructura_empresa_id instanceof ObjectId) ? 
                user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id));

            // Control de bloqueo concurrente - verificar si alguien más está editando
            const estructura = await usersCollection.findOne({ _id: estructuraId });
            if (!estructura) {
                return { success: false, error: 'Estructura de empresa no encontrada' };
            }

            // Verificar versión para control optimista
            const currentVersion = estructura.estructura_carpetas?.version || 1;
            if (expectedVersion !== null && currentVersion !== expectedVersion) {
                return { 
                    success: false, 
                    conflict: true, 
                    error: 'Conflicto de versión. Otro usuario ha modificado las etiquetas. Recarga la página.',
                    currentVersion 
                };
            }

            // Aplicar cambios con nueva versión
            const now = new Date();
            const newVersion = currentVersion + 1;
            const updateData = {
                $set: {
                    etiquetas_personalizadas: cambios,
                    updated_at: now,
                    'estructura_carpetas.version': newVersion
                },
                $push: {
                    historial_agentes: {
                        accion: 'actualizacion_masiva',
                        version_anterior: estructura.etiquetas_personalizadas || {},
                        version_nueva: cambios,
                        modificado_por: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)),
                        fecha: now,
                        nombre_version: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`
                    }
                }
            };

            const result = await usersCollection.updateOne({ _id: estructuraId }, updateData);
            
            if (result.matchedCount === 0) {
                return { success: false, error: 'No se pudo actualizar la estructura de empresa' };
            }

            return { 
                success: true, 
                newVersion,
                source: 'empresa',
                message: 'Etiquetas empresariales actualizadas correctamente'
            };

        } else {
            // Usuario individual - actualización directa
            const userId = (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id));
            const updateData = {
                $set: {
                    etiquetas_personalizadas: cambios,
                    updated_at: new Date()
                }
            };

            const result = await usersCollection.updateOne({ _id: userId }, updateData);
            
            if (result.matchedCount === 0) {
                return { success: false, error: 'No se pudo actualizar las etiquetas del usuario' };
            }

            return { 
                success: true, 
                source: 'individual',
                message: 'Etiquetas individuales actualizadas correctamente'
            };
        }
    } finally {
        await client.close();
    }
}

/**
 * Obtiene la estructura de carpetas según el contexto del usuario
 * @param {Object} user - Usuario con tipo_cuenta y estructura_empresa_id
 * @returns {Object} - { estructura_carpetas, source: 'individual'|'empresa' }
 */
async function getEstructuraCarpetas(user) {
    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');

        if (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id) {
            // Leer desde estructura_empresa
            const estructuraDoc = await usersCollection.findOne({ 
                _id: (user.estructura_empresa_id instanceof ObjectId) ? user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id))
            });
            
            if (estructuraDoc) {
                return {
                    estructura_carpetas: estructuraDoc.estructura_carpetas || { folders: {}, asignaciones: {}, version: 1 },
                    source: 'empresa',
                    estructura_id: estructuraDoc._id
                };
            }
        }
        
        // Fallback a usuario individual
        const userDoc = await usersCollection.findOne({ 
            _id: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id))
        });
        
        return {
            estructura_carpetas: userDoc?.estructura_carpetas_user || { folders: {}, asignaciones: {}, version: 1 },
            source: 'individual',
            user_id: userDoc?._id
        };
    } finally {
        await client.close();
    }
}

/**
 * Obtiene información del contexto del usuario (permisos, empresa, etc.)
 * @param {Object} user - Usuario 
 * @returns {Object} - Información de contexto completa
 */
async function getUserContext(user) {
    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');

        const userDoc = await usersCollection.findOne({ 
            _id: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id))
        });

        if (!userDoc) {
            return { tipo_cuenta: 'individual', permiso: null, empresa: null };
        }

        const permisoNormalized = (userDoc.permiso || '').toString().toLowerCase().trim();

        const context = {
            tipo_cuenta: userDoc.tipo_cuenta || 'individual',
            permiso: permisoNormalized || null,
            empresa: userDoc.empresa || null,
            estructura_empresa_id: userDoc.estructura_empresa_id || null,
            can_edit_empresa: userDoc.tipo_cuenta === 'empresa' && ['admin', 'edicion'].includes(permisoNormalized),
            is_admin: userDoc.tipo_cuenta === 'empresa' && permisoNormalized === 'admin'
        };

        // Si es empresa, obtener info adicional de la estructura
        if (context.tipo_cuenta === 'empresa' && context.estructura_empresa_id) {
            const estructuraDoc = await usersCollection.findOne({ 
                _id: context.estructura_empresa_id 
            });
            if (estructuraDoc) {
                context.empresa_info = {
                    company_name: estructuraDoc.company_name,
                    admin_principal_id: estructuraDoc.admin_principal_id,
                    created_at: estructuraDoc.created_at,
                    total_users: await usersCollection.countDocuments({ 
                        estructura_empresa_id: context.estructura_empresa_id 
                    })
                };
            }
        }

        return context;
    } finally {
        await client.close();
    }
}

/**
 * Bloquea la edición de etiquetas para evitar conflictos concurrentes
 * @param {Object} user - Usuario que solicita el bloqueo
 * @param {String} agenteName - Nombre del agente a bloquear (opcional, null para bloqueo global)
 * @returns {Object} - { success, lockId?, error? }
 */
async function lockEtiquetasForEdit(user, agenteName = null) {
    if (user.tipo_cuenta !== 'empresa' || !user.estructura_empresa_id) {
        return { success: true }; // No hay bloqueo para usuarios individuales
    }

    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');

        const estructuraId = (user.estructura_empresa_id instanceof ObjectId) ? 
            user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id));
        const userId = (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id));
        const now = new Date();

        const lockKey = agenteName || 'global';
        const lockPath = `bloqueos_edicion.agentes.${lockKey}`;

        // Verificar si ya está bloqueado por otro usuario
        const estructura = await usersCollection.findOne({ _id: estructuraId });
        const currentLock = estructura?.bloqueos_edicion?.agentes?.[lockKey];

        if (currentLock && currentLock.en_edicion_por && !currentLock.en_edicion_por.equals(userId)) {
            // Verificar si el bloqueo no ha expirado 
            // Timeout reducido a 10 minutos + heartbeat cada 5 minutos para detectar inactividad
            const lockAge = now - new Date(currentLock.desde);
            const lastHeartbeat = currentLock.last_heartbeat ? now - new Date(currentLock.last_heartbeat) : lockAge;
            
            // Timeout si no hay heartbeat en 10 minutos (inactividad)
            if (lockAge < 30 * 60 * 1000 && lastHeartbeat < 10 * 60 * 1000) { // 30 min total, 10 min sin actividad
                return { 
                    success: false, 
                    error: 'Otro usuario está editando este agente actualmente.',
                    details: 'Por favor, inténtalo en unos minutos.',
                    locked_by: currentLock.en_edicion_por,
                    locked_since: currentLock.desde,
                    show_modal: true // Indicar que debe mostrarse en modal
                };
            }
            
            // Si ha pasado el timeout, limpiar bloqueo automáticamente
            if (lockAge >= 30 * 60 * 1000 || lastHeartbeat >= 10 * 60 * 1000) {
                console.log(`🔓 Auto-clearing expired lock for agent ${lockKey} (lockAge: ${Math.round(lockAge/60000)}min, heartbeat: ${Math.round(lastHeartbeat/60000)}min)`);
                await usersCollection.updateOne(
                    { _id: estructuraId }, 
                    { $unset: { [`${lockPath}.en_edicion_por`]: '', [`${lockPath}.desde`]: '', [`${lockPath}.last_heartbeat`]: '' } }
                );
            }
        }

        // Establecer bloqueo con heartbeat inicial
        const updateData = {
            $set: {
                [`${lockPath}.en_edicion_por`]: userId,
                [`${lockPath}.desde`]: now,
                [`${lockPath}.last_heartbeat`]: now
            }
        };

        await usersCollection.updateOne({ _id: estructuraId }, updateData);

        return { 
            success: true, 
            lockId: `${estructuraId}-${lockKey}`,
            message: 'Bloqueo de edición establecido'
        };
    } finally {
        await client.close();
    }
}

/**
 * Actualiza el heartbeat del bloqueo para indicar actividad
 * @param {Object} user - Usuario que actualiza el heartbeat
 * @param {String} agenteName - Nombre del agente (opcional)
 * @returns {Object} - { success, error? }
 */
async function updateLockHeartbeat(user, agenteName = null) {
    if (user.tipo_cuenta !== 'empresa' || !user.estructura_empresa_id) {
        return { success: true };
    }

    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');

        const estructuraId = (user.estructura_empresa_id instanceof ObjectId) ? 
            user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id));
        const userId = (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id));

        const lockKey = agenteName || 'global';
        const lockPath = `bloqueos_edicion.agentes.${lockKey}`;

        // Verificar que el usuario tiene el bloqueo antes de actualizar heartbeat
        const estructura = await usersCollection.findOne({ _id: estructuraId });
        const currentLock = estructura?.bloqueos_edicion?.agentes?.[lockKey];

        if (!currentLock || !currentLock.en_edicion_por || !currentLock.en_edicion_por.equals(userId)) {
            return { success: false, error: 'No tienes el bloqueo de este agente' };
        }

        // Actualizar heartbeat
        const updateData = {
            $set: {
                [`${lockPath}.last_heartbeat`]: new Date()
            }
        };

        await usersCollection.updateOne({ _id: estructuraId }, updateData);

        return { success: true, message: 'Heartbeat actualizado' };
    } finally {
        await client.close();
    }
}

/**
 * Libera el bloqueo de edición
 * @param {Object} user - Usuario que libera el bloqueo
 * @param {String} agenteName - Nombre del agente a desbloquear (opcional)
 * @returns {Object} - { success, error? }
 */
async function unlockEtiquetasForEdit(user, agenteName = null) {
    if (user.tipo_cuenta !== 'empresa' || !user.estructura_empresa_id) {
        return { success: true };
    }

    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');

        const estructuraId = (user.estructura_empresa_id instanceof ObjectId) ? 
            user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id));

        const lockKey = agenteName || 'global';
        const lockPath = `bloqueos_edicion.agentes.${lockKey}`;

        const updateData = {
            $unset: {
                [`${lockPath}.en_edicion_por`]: '',
                [`${lockPath}.desde`]: '',
                [`${lockPath}.last_heartbeat`]: ''
            }
        };

        await usersCollection.updateOne({ _id: estructuraId }, updateData);

        return { success: true, message: 'Bloqueo de edición liberado' };
    } finally {
        await client.close();
    }
}

/**
 * Obtiene la cobertura legal según el contexto del usuario
 * @param {Object} user - Usuario con tipo_cuenta y estructura_empresa_id
 * @returns {Object} - { cobertura_legal, rangos, source: 'individual'|'empresa' }
 */
async function getCoberturaLegal(user) {
    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');

        if (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id) {
            // Leer desde estructura_empresa (fuente de verdad)
            const estructuraDoc = await usersCollection.findOne({ 
                _id: (user.estructura_empresa_id instanceof ObjectId) ? user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id))
            });
            
            if (estructuraDoc) {
                return {
                    cobertura_legal: estructuraDoc.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] },
                    rangos: estructuraDoc.rangos || [],
                    source: 'empresa',
                    estructura_id: estructuraDoc._id,
                    version: estructuraDoc.estructura_carpetas?.version || 1
                };
            }
        }
        
        // Fallback a usuario individual o si no se encuentra estructura
        const userDoc = await usersCollection.findOne({ 
            _id: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id))
        });
        
        return {
            cobertura_legal: userDoc?.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] },
            rangos: userDoc?.rangos || [],
            source: 'individual',
            user_id: userDoc?._id
        };
    } finally {
        await client.close();
    }
}

/**
 * Actualiza la cobertura legal con resolución de conflictos
 * @param {Object} user - Usuario que realiza la actualización
 * @param {Object} coberturaData - { cobertura_legal, rangos }
 * @param {Number} expectedVersion - Versión esperada para control optimista (solo empresa)
 * @returns {Object} - { success, newVersion?, error?, conflict? }
 */
async function updateCoberturaLegal(user, coberturaData, expectedVersion = null) {
    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');

        if (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id) {
            // Verificar permisos
            if (!['admin', 'edicion'].includes(user.permiso)) {
                return { 
                    success: false, 
                    error: 'Sin permisos para editar fuentes empresariales. Se requiere permiso admin o edición.' 
                };
            }

            const estructuraId = (user.estructura_empresa_id instanceof ObjectId) ? 
                user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id));

            // Control de bloqueo concurrente y versión
            const estructura = await usersCollection.findOne({ _id: estructuraId });
            if (!estructura) {
                return { success: false, error: 'Estructura de empresa no encontrada' };
            }

            // Verificar versión para control optimista
            const currentVersion = estructura.estructura_carpetas?.version || 1;
            if (expectedVersion !== null && currentVersion !== expectedVersion) {
                return { 
                    success: false, 
                    conflict: true, 
                    error: 'Conflicto de versión. Otro usuario ha modificado las fuentes. Recarga la página.',
                    currentVersion 
                };
            }

            // Aplicar cambios con nueva versión
            const now = new Date();
            const newVersion = currentVersion + 1;
            const updateData = {
                $set: {
                    cobertura_legal: coberturaData.cobertura_legal,
                    rangos: coberturaData.rangos,
                    updated_at: now,
                    'estructura_carpetas.version': newVersion
                }
            };

            const result = await usersCollection.updateOne({ _id: estructuraId }, updateData);
            
            if (result.matchedCount === 0) {
                return { success: false, error: 'No se pudo actualizar la estructura de empresa' };
            }

            return { 
                success: true, 
                newVersion,
                source: 'empresa',
                message: 'Fuentes empresariales actualizadas correctamente'
            };

        } else {
            // Usuario individual - actualización directa
            const userId = (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id));
            const updateData = {
                $set: {
                    cobertura_legal: coberturaData.cobertura_legal,
                    rangos: coberturaData.rangos,
                    updated_at: new Date()
                }
            };

            const result = await usersCollection.updateOne({ _id: userId }, updateData);
            
            if (result.matchedCount === 0) {
                return { success: false, error: 'No se pudo actualizar las fuentes del usuario' };
            }

            return { 
                success: true, 
                source: 'individual',
                message: 'Fuentes individuales actualizadas correctamente'
            };
        }
    } finally {
        await client.close();
    }
}

/**
 * Obtiene todos los datos de contexto según el contexto del usuario
 * @param {Object} user - Usuario con tipo_cuenta y estructura_empresa_id
 * @returns {Object} - Todos los datos de contexto según empresa/individual
 */
async function getContextData(user) {
    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');

        if (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id) {
            // Leer desde estructura_empresa (fuente de verdad)
            const estructuraDoc = await usersCollection.findOne({ 
                _id: (user.estructura_empresa_id instanceof ObjectId) ? user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id))
            });
            
            if (estructuraDoc) {
                return {
                    // Datos de contexto empresarial
                    perfil_regulatorio: estructuraDoc.perfil_regulatorio || '',
                    tipo_empresa: estructuraDoc.tipo_empresa || '',
                    detalle_empresa: estructuraDoc.detalle_empresa || {},
                    interes: estructuraDoc.interes || '',
                    tamaño_empresa: estructuraDoc.tamaño_empresa || '',
                    web: estructuraDoc.web || '',
                    company_name: estructuraDoc.company_name || '',
                    industry_tags: estructuraDoc.industry_tags || [],
                    sub_industria_map: estructuraDoc.sub_industria_map || {},
                    rama_juridicas: estructuraDoc.rama_juridicas || [],
                    sub_rama_map: estructuraDoc.sub_rama_map || {},
                    cobertura_legal: estructuraDoc.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] },
                    rangos: estructuraDoc.rangos || [],
                    etiquetas_personalizadas: estructuraDoc.etiquetas_personalizadas || {},
                    website_extraction_status: estructuraDoc.website_extraction_status || { success: true, error: null },
                    // Metadatos
                    source: 'empresa',
                    tipo_cuenta: 'empresa', // Add this for consistency
                    estructura_id: estructuraDoc._id,
                    version: estructuraDoc.estructura_carpetas?.version || 1,
                    empresa: estructuraDoc.empresa,
                    subscription_plan: estructuraDoc.subscription_plan || 'plan4',
                    limit_agentes: estructuraDoc.limit_agentes,
                    limit_fuentes: estructuraDoc.limit_fuentes
                };
            }
        }
        
        // Fallback a usuario individual o si no se encuentra estructura
        const userDoc = await usersCollection.findOne({ 
            _id: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id))
        });
        
        if (!userDoc) {
            return {
                source: 'individual',
                perfil_regulatorio: '',
                tipo_empresa: '',
                detalle_empresa: {},
                interes: '',
                tamaño_empresa: '',
                web: '',
                company_name: '',
                industry_tags: [],
                sub_industria_map: {},
                rama_juridicas: [],
                sub_rama_map: {},
                cobertura_legal: { fuentes_gobierno: [], fuentes_reguladores: [] },
                rangos: [],
                etiquetas_personalizadas: {},
                website_extraction_status: { success: true, error: null },
                user_id: null,
                subscription_plan: 'plan1',
                limit_agentes: null,
                limit_fuentes: null
            };
        }
        
        return {
            // Datos de contexto individual
            perfil_regulatorio: userDoc.perfil_regulatorio || '',
            tipo_empresa: userDoc.tipo_empresa || '',
            detalle_empresa: userDoc.detalle_empresa || {},
            interes: userDoc.interes || '',
            tamaño_empresa: userDoc.tamaño_empresa || '',
            web: userDoc.web || '',
            company_name: userDoc.company_name || '',
            industry_tags: userDoc.industry_tags || [],
            sub_industria_map: userDoc.sub_industria_map || {},
            rama_juridicas: userDoc.rama_juridicas || [],
            sub_rama_map: userDoc.sub_rama_map || {},
            cobertura_legal: userDoc.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] },
            rangos: userDoc.rangos || [],
            etiquetas_personalizadas: userDoc.etiquetas_personalizadas || {},
            website_extraction_status: userDoc.website_extraction_status || { success: true, error: null },
            // Metadatos
            source: 'individual',
            tipo_cuenta: userDoc.tipo_cuenta || 'individual', // Add this for consistency
            user_id: userDoc._id,
            subscription_plan: userDoc.subscription_plan || 'plan1',
            limit_agentes: userDoc.limit_agentes,
            limit_fuentes: userDoc.limit_fuentes
        };
    } finally {
        await client.close();
    }
}

/**
 * Actualiza los datos de contexto con resolución de conflictos
 * @param {Object} user - Usuario que realiza la actualización
 * @param {Object} contextData - Datos de contexto a actualizar
 * @param {Number} expectedVersion - Versión esperada para control optimista (solo empresa)
 * @returns {Object} - { success, newVersion?, error?, conflict? }
 */
async function updateContextData(user, contextData, expectedVersion = null) {
    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');

        if (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id) {
            // Verificar permisos
            if (!['admin', 'edicion'].includes(user.permiso)) {
                return { 
                    success: false, 
                    error: 'Sin permisos para editar datos empresariales. Se requiere permiso admin o edición.' 
                };
            }

            const estructuraId = (user.estructura_empresa_id instanceof ObjectId) ? 
                user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id));

            // Control de bloqueo concurrente y versión
            const estructura = await usersCollection.findOne({ _id: estructuraId });
            if (!estructura) {
                return { success: false, error: 'Estructura de empresa no encontrada' };
            }

            // Verificar versión para control optimista
            const currentVersion = estructura.estructura_carpetas?.version || 1;
            if (expectedVersion !== null && currentVersion !== expectedVersion) {
                return { 
                    success: false, 
                    conflict: true, 
                    error: 'Conflicto de versión. Otro usuario ha modificado los datos. Recarga la página.',
                    currentVersion 
                };
            }

            // Aplicar cambios con nueva versión
            const now = new Date();
            const newVersion = currentVersion + 1;
            
            // Filtrar solo campos permitidos para contexto empresarial
            const allowedFields = [
                'perfil_regulatorio', 'tipo_empresa', 'detalle_empresa', 'interes', 
                'tamaño_empresa', 'web', 'company_name', 'industry_tags', 
                'sub_industria_map', 'rama_juridicas', 'sub_rama_map', 
                'cobertura_legal', 'rangos', 'etiquetas_personalizadas',
                'website_extraction_status'
            ];
            
            const updateData = {
                updated_at: now,
                'estructura_carpetas.version': newVersion
            };
            
            allowedFields.forEach(field => {
                if (contextData[field] !== undefined) {
                    updateData[field] = contextData[field];
                }
            });

            const result = await usersCollection.updateOne(
                { _id: estructuraId }, 
                { $set: updateData }
            );
            
            if (result.matchedCount === 0) {
                return { success: false, error: 'No se pudo actualizar la estructura de empresa' };
            }

            return { 
                success: true, 
                newVersion,
                source: 'empresa',
                message: 'Datos empresariales actualizados correctamente'
            };

        } else {
            // Usuario individual - actualización directa
            const userId = (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id));
            
            // Filtrar solo campos permitidos
            const allowedFields = [
                'perfil_regulatorio', 'tipo_empresa', 'detalle_empresa', 'interes', 
                'tamaño_empresa', 'web', 'company_name', 'industry_tags', 
                'sub_industria_map', 'rama_juridicas', 'sub_rama_map', 
                'cobertura_legal', 'rangos', 'etiquetas_personalizadas',
                'website_extraction_status'
            ];
            
            const updateData = { updated_at: new Date() };
            
            allowedFields.forEach(field => {
                if (contextData[field] !== undefined) {
                    updateData[field] = contextData[field];
                }
            });

            const result = await usersCollection.updateOne({ _id: userId }, { $set: updateData });
            
            if (result.matchedCount === 0) {
                return { success: false, error: 'No se pudo actualizar los datos del usuario' };
            }

            return { 
                success: true, 
                source: 'individual',
                message: 'Datos individuales actualizados correctamente'
            };
        }
    } finally {
        await client.close();
    }
}

/**
 * UTILIDADES INTERNAS PARA ESTRUCTURA DE CARPETAS
 */
function _generateFolderId() {
	// Usar ObjectId como string para consistencia
	try { return new ObjectId().toString(); } catch (_) { return String(Date.now()); }
}

function _isNameUniqueAmongSiblings(folders, parentId, name, excludeId = null) {
	const targetName = (name || '').trim().toLowerCase();
	return Object.values(folders || {}).every(f => {
		if (excludeId && String(f.id) === String(excludeId)) return true;
		const sameParent = (f.parentId || null) === (parentId || null);
		return !sameParent || (f.nombre || '').trim().toLowerCase() !== targetName;
	});
}

function _willCreateCycle(folders, folderId, newParentId) {
	if (!newParentId) return false;
	if (String(folderId) === String(newParentId)) return true;
	// Subir por la cadena de padres para detectar si folderId está arriba
	let current = folders[newParentId];
	while (current) {
		if (String(current.id) === String(folderId)) return true;
		current = current.parentId ? folders[current.parentId] : null;
	}
	return false;
}

function _buildChildrenMap(folders) {
	const children = {};
	Object.values(folders || {}).forEach(f => {
		const pid = f.parentId || 'root';
		if (!children[pid]) children[pid] = [];
		children[pid].push(f);
	});
	// Orden alfabético por nombre
	Object.keys(children).forEach(k => {
		children[k].sort((a,b) => (a.nombre||'').localeCompare(b.nombre||''));
	});
	return children;
}

function _computeAgentCounts(folders, asignaciones) {
	const counts = {};
	Object.keys(folders || {}).forEach(fid => counts[fid] = 0);
	counts.root = 0;
	Object.entries(asignaciones || {}).forEach(([ag, fid]) => {
		const key = fid || 'root';
		if (counts[key] == null) counts[key] = 0;
		counts[key] += 1;
	});
	// Propagar conteos a padres (totales por subárbol)
	const children = _buildChildrenMap(folders);
	function dfs(fid) {
		let sum = (counts[fid] || 0);
		const kids = children[fid] || [];
		kids.forEach(k => { sum += dfs(String(k.id)); });
		counts[fid] = sum;
		return sum;
	}
	// Raíces
	(children.root || []).forEach(rootF => dfs(String(rootF.id)));
	// Añadir total raíz incluyendo asignados directos en root
	counts.root_total = (counts.root || 0) + (children.root || []).reduce((acc, f) => acc + (counts[String(f.id)] || 0), 0);
	return counts;
}

/**
 * Obtiene estructura de carpetas con conteos por carpeta
 */
async function getCarpetasEstructura(user) {
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const db = client.db('papyrus');
		const usersCollection = db.collection('users');

		let estructuraDoc = null;
		let source = 'individual';
		let path = 'estructura_carpetas_user';
		let targetId = (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id));

		if (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id) {
			estructuraDoc = await usersCollection.findOne({ _id: (user.estructura_empresa_id instanceof ObjectId) ? user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id)) });
			source = 'empresa';
			path = 'estructura_carpetas';
			targetId = estructuraDoc?._id;
		} else {
			estructuraDoc = await usersCollection.findOne({ _id: targetId });
		}

		const estructura = estructuraDoc?.[path] || { folders: {}, asignaciones: {}, version: 1 };
		const counts = _computeAgentCounts(estructura.folders || {}, estructura.asignaciones || {});
		return { success: true, estructura_carpetas: estructura, counts, source, targetId };
	} finally {
		await client.close();
	}
}

/**
 * Crea carpeta (empresa admin o individual)
 */
async function createCarpeta(user, nombre, parentId = null, expectedVersion = null) {
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const db = client.db('papyrus');
		const usersCollection = db.collection('users');

		let isEmpresa = (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id);
		if (isEmpresa && (user.permiso || '').toLowerCase() !== 'admin') {
			return { success: false, error: 'Solo admins de empresa pueden crear carpetas' };
		}
		const targetId = isEmpresa ? ((user.estructura_empresa_id instanceof ObjectId) ? user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id))) : ((user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)));
		const path = isEmpresa ? 'estructura_carpetas' : 'estructura_carpetas_user';
		const doc = await usersCollection.findOne({ _id: targetId });
		if (!doc) return { success: false, error: 'Documento de destino no encontrado' };
		const estructura = doc[path] || { folders: {}, asignaciones: {}, version: 1 };

		// Validaciones
		if (parentId && !estructura.folders[parentId]) {
			return { success: false, error: 'Carpeta padre no existe' };
		}
		if (!_isNameUniqueAmongSiblings(estructura.folders, parentId || null, nombre)) {
			return { success: false, error: 'Ya existe una carpeta con ese nombre en la misma ubicación' };
		}
		const currentVersion = estructura.version || 1;
		if (expectedVersion !== null && expectedVersion !== currentVersion) {
			return { success: false, conflict: true, error: 'Conflicto de versión', currentVersion };
		}

		// Crear carpeta
		const now = new Date();
		const folderId = _generateFolderId();
		estructura.folders[folderId] = {
			id: folderId,
			nombre: nombre,
			parentId: parentId || null,
			orden: 0,
			createdAt: now,
			createdBy: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)),
			updatedAt: now,
			updatedBy: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id))
		};
		const newVersion = currentVersion + 1;

		const update = {
			$set: {
				[`${path}.folders`]: estructura.folders,
				[`${path}.version`]: newVersion,
				updated_at: now
			},
			$push: {
				historial_carpetas: {
					action: 'create', folder: { id: folderId, nombre, parentId: parentId || null },
					user_id: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)),
					date: now
				}
			}
		};
		await usersCollection.updateOne({ _id: targetId }, update);
		return { success: true, folderId, newVersion };
	} finally {
		await client.close();
	}
}

/** Renombra carpeta */
async function renameCarpeta(user, folderId, newName, expectedVersion = null) {
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const usersCollection = client.db('papyrus').collection('users');
		const isEmpresa = (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id);
		if (isEmpresa && (user.permiso || '').toLowerCase() !== 'admin') {
			return { success: false, error: 'Solo admins de empresa pueden renombrar carpetas' };
		}
		const targetId = isEmpresa ? ((user.estructura_empresa_id instanceof ObjectId) ? user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id))) : ((user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)));
		const path = isEmpresa ? 'estructura_carpetas' : 'estructura_carpetas_user';
		const doc = await usersCollection.findOne({ _id: targetId });
		if (!doc) return { success: false, error: 'Documento no encontrado' };
		const estructura = doc[path] || { folders: {}, asignaciones: {}, version: 1 };
		const folder = estructura.folders[folderId];
		if (!folder) return { success: false, error: 'Carpeta no existe' };
		if (!_isNameUniqueAmongSiblings(estructura.folders, folder.parentId || null, newName, folderId)) {
			return { success: false, error: 'Ya existe una carpeta con ese nombre en la misma ubicación' };
		}
		const currentVersion = estructura.version || 1;
		if (expectedVersion !== null && expectedVersion !== currentVersion) {
			return { success: false, conflict: true, error: 'Conflicto de versión', currentVersion };
		}
		const now = new Date();
		estructura.folders[folderId] = { ...folder, nombre: newName, updatedAt: now, updatedBy: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)) };
		const newVersion = currentVersion + 1;
		await usersCollection.updateOne({ _id: targetId }, {
			$set: { [`${path}.folders`]: estructura.folders, [`${path}.version`]: newVersion, updated_at: now },
			$push: { historial_carpetas: { action: 'rename', folder: { id: folderId, nombre_anterior: folder.nombre, nombre_nuevo: newName }, user_id: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)), date: now } }
		});
		return { success: true, newVersion };
	} finally {
		await client.close();
	}
}

/** Mueve carpeta */
async function moveCarpeta(user, folderId, newParentId, expectedVersion = null) {
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const usersCollection = client.db('papyrus').collection('users');
		const isEmpresa = (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id);
		if (isEmpresa && (user.permiso || '').toLowerCase() !== 'admin') {
			return { success: false, error: 'Solo admins de empresa pueden mover carpetas' };
		}
		const targetId = isEmpresa ? ((user.estructura_empresa_id instanceof ObjectId) ? user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id))) : ((user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)));
		const path = isEmpresa ? 'estructura_carpetas' : 'estructura_carpetas_user';
		const doc = await usersCollection.findOne({ _id: targetId });
		if (!doc) return { success: false, error: 'Documento no encontrado' };
		const estructura = doc[path] || { folders: {}, asignaciones: {}, version: 1 };
		const folder = estructura.folders[folderId];
		if (!folder) return { success: false, error: 'Carpeta no existe' };
		if (newParentId && !estructura.folders[newParentId]) return { success: false, error: 'Nueva carpeta padre no existe' };
		if (_willCreateCycle(estructura.folders, folderId, newParentId || null)) return { success: false, error: 'Movimiento inválido: crearía un ciclo' };
		// Mantener unicidad
		if (!_isNameUniqueAmongSiblings(estructura.folders, newParentId || null, folder.nombre, folderId)) {
			return { success: false, error: 'Ya existe una carpeta con ese nombre en la carpeta destino' };
		}
		const currentVersion = estructura.version || 1;
		if (expectedVersion !== null && expectedVersion !== currentVersion) {
			return { success: false, conflict: true, error: 'Conflicto de versión', currentVersion };
		}
		const now = new Date();
		estructura.folders[folderId] = { ...folder, parentId: newParentId || null, updatedAt: now, updatedBy: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)) };
		const newVersion = currentVersion + 1;
		await usersCollection.updateOne({ _id: targetId }, {
			$set: { [`${path}.folders`]: estructura.folders, [`${path}.version`]: newVersion, updated_at: now },
			$push: { historial_carpetas: { action: 'move', folder: { id: folderId, from: folder.parentId || null, to: newParentId || null }, user_id: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)), date: now } }
		});
		return { success: true, newVersion };
	} finally {
		await client.close();
	}
}

/** Elimina carpeta (solo si está vacía) */
async function deleteCarpeta(user, folderId, expectedVersion = null) {
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const usersCollection = client.db('papyrus').collection('users');
		const isEmpresa = (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id);
		if (isEmpresa && (user.permiso || '').toLowerCase() !== 'admin') {
			return { success: false, error: 'Solo admins de empresa pueden eliminar carpetas' };
		}
		const targetId = isEmpresa ? ((user.estructura_empresa_id instanceof ObjectId) ? user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id))) : ((user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)));
		const path = isEmpresa ? 'estructura_carpetas' : 'estructura_carpetas_user';
		const doc = await usersCollection.findOne({ _id: targetId });
		if (!doc) return { success: false, error: 'Documento no encontrado' };
		const estructura = doc[path] || { folders: {}, asignaciones: {}, version: 1 };
		const folder = estructura.folders[folderId];
		if (!folder) return { success: false, error: 'Carpeta no existe' };
		// Verificar vacía: sin hijos ni asignaciones
		const hasChildren = Object.values(estructura.folders).some(f => (f.parentId || null) === (folderId || null));
		if (hasChildren) return { success: false, error: 'La carpeta tiene subcarpetas. Muévelas o elimínalas primero.' };
		const hasAssignments = Object.values(estructura.asignaciones || {}).some(fid => (fid || null) === (folderId || null));
		if (hasAssignments) return { success: false, error: 'La carpeta tiene agentes asignados. Reasígnalos primero.' };
		const currentVersion = estructura.version || 1;
		if (expectedVersion !== null && expectedVersion !== currentVersion) {
			return { success: false, conflict: true, error: 'Conflicto de versión', currentVersion };
		}
		const now = new Date();
		delete estructura.folders[folderId];
		const newVersion = currentVersion + 1;
		await usersCollection.updateOne({ _id: targetId }, {
			$set: { [`${path}.folders`]: estructura.folders, [`${path}.version`]: newVersion, updated_at: now },
			$push: { historial_carpetas: { action: 'delete', folder: { id: folderId, nombre: folder.nombre }, user_id: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)), date: now } }
		});
		return { success: true, newVersion };
	} finally {
		await client.close();
	}
}

/** Asignar agente a carpeta (folderId o null) */
async function assignAgenteToCarpeta(user, agenteName, folderId = null, expectedVersion = null) {
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const usersCollection = client.db('papyrus').collection('users');
		const isEmpresa = (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id);
		// Para empresa, permitir admin o edicion mover asignaciones
		if (isEmpresa && !['admin','edicion'].includes((user.permiso||'').toLowerCase())) {
			return { success: false, error: 'Sin permisos para asignar agentes' };
		}
		const targetId = isEmpresa ? ((user.estructura_empresa_id instanceof ObjectId) ? user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id))) : ((user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)));
		const path = isEmpresa ? 'estructura_carpetas' : 'estructura_carpetas_user';
		const doc = await usersCollection.findOne({ _id: targetId });
		if (!doc) return { success: false, error: 'Documento no encontrado' };
		const estructura = doc[path] || { folders: {}, asignaciones: {}, version: 1 };
		if (folderId && !estructura.folders[folderId]) return { success: false, error: 'Carpeta destino no existe' };
		// Validar que el agente exista
		const etiquetas = isEmpresa ? (doc.etiquetas_personalizadas || {}) : (doc.etiquetas_personalizadas || {});
		if (!etiquetas || !etiquetas.hasOwnProperty(agenteName)) {
			return { success: false, error: 'Agente no existe en etiquetas_personalizadas' };
		}
		const currentVersion = estructura.version || 1;
		if (expectedVersion !== null && expectedVersion !== currentVersion) {
			return { success: false, conflict: true, error: 'Conflicto de versión', currentVersion };
		}
		const now = new Date();
		estructura.asignaciones = estructura.asignaciones || {};
		const fromFolder = estructura.asignaciones[agenteName] || null;
		estructura.asignaciones[agenteName] = folderId || null;
		const newVersion = currentVersion + 1;
		await usersCollection.updateOne({ _id: targetId }, {
			$set: { [`${path}.asignaciones`]: estructura.asignaciones, [`${path}.version`]: newVersion, updated_at: now },
			$push: { historial_agentes: { action: 'assign', agente: agenteName, from: fromFolder, to: folderId || null, user_id: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)), date: now } }
		});
		return { success: true, newVersion };
	} finally {
		await client.close();
	}
}

/** Selección personalizada de agentes del usuario */
async function getSeleccionAgentes(user) {
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const usersCollection = client.db('papyrus').collection('users');
		const userDoc = await usersCollection.findOne({ _id: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)) });
		const seleccion = Array.isArray(userDoc?.etiquetas_personalizadas_seleccionadas) ? userDoc.etiquetas_personalizadas_seleccionadas : [];
		return { success: true, seleccion };
	} finally { await client.close(); }
}

async function updateSeleccionAgentes(user, seleccion = []) {
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const usersCollection = client.db('papyrus').collection('users');
		// Validar límite por plan
		const plan = user.subscription_plan || 'plan1';
		let limit = null;
		try { const { getUserLimits } = require('./users.service'); limit = (getUserLimits(plan) || {}).limit_agentes; } catch (_) { limit = null; }
		if (limit != null && Array.isArray(seleccion) && seleccion.length > limit) {
			return { success: false, error: `Has superado el límite de agentes (${limit}) para tu plan` };
		}
		// Guardar selección
		const now = new Date();
		await usersCollection.updateOne(
			{ _id: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)) },
			{ $set: { etiquetas_personalizadas_seleccionadas: Array.isArray(seleccion) ? seleccion : [], updated_at: now } }
		);
		return { success: true };
	} finally { await client.close(); }
}

/** Bloqueo de edición de carpetas (global o por carpeta) */
async function lockCarpetasForEdit(user, folderId = null) {
	if (user.tipo_cuenta !== 'empresa' || !user.estructura_empresa_id) return { success: true };
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const usersCollection = client.db('papyrus').collection('users');
		const estructuraId = (user.estructura_empresa_id instanceof ObjectId) ? user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id));
		const userId = (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id));
		const now = new Date();
		const lockKey = folderId ? String(folderId) : 'global';
		const doc = await usersCollection.findOne({ _id: estructuraId });
		const current = doc?.bloqueos_edicion?.carpetas?.[lockKey];
		if (current && current.en_edicion_por && !current.en_edicion_por.equals(userId)) {
			const age = now - new Date(current.desde);
			if (age < 30 * 60 * 1000) {
				return { success: false, error: 'Otro usuario está editando carpetas', locked_by: current.en_edicion_por, locked_since: current.desde };
			}
		}
		await usersCollection.updateOne({ _id: estructuraId }, { $set: { [`bloqueos_edicion.carpetas.${lockKey}.en_edicion_por`]: userId, [`bloqueos_edicion.carpetas.${lockKey}.desde`]: now } });
		return { success: true };
	} finally { await client.close(); }
}

async function unlockCarpetasForEdit(user, folderId = null) {
	if (user.tipo_cuenta !== 'empresa' || !user.estructura_empresa_id) return { success: true };
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const usersCollection = client.db('papyrus').collection('users');
		const estructuraId = (user.estructura_empresa_id instanceof ObjectId) ? user.estructura_empresa_id : new ObjectId(String(user.estructura_empresa_id));
		const lockKey = folderId ? String(folderId) : 'global';
		await usersCollection.updateOne({ _id: estructuraId }, { $unset: { [`bloqueos_edicion.carpetas.${lockKey}.en_edicion_por`]: '', [`bloqueos_edicion.carpetas.${lockKey}.desde`]: '' } });
		return { success: true };
	} finally { await client.close(); }
}

/**
 * ADAPTADOR ENTERPRISE PARA ETIQUETAS_PERSONALIZADAS
 * Centraliza la lógica de redirección entre cuentas individuales/empresa
 * Garantiza compatibilidad y degradación elegante
 */

/**
 * Adaptador principal para lectura de etiquetas_personalizadas
 * Redirige automáticamente según tipo de cuenta
 * @param {Object} user - Usuario con tipo_cuenta y estructura_empresa_id
 * @returns {Object} - { etiquetas_personalizadas, source, metadata }
 */
async function getEtiquetasPersonalizadasAdapter(user) {
    try {
        if (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id) {
            // RUTA EMPRESA: Leer desde estructura_empresa
            const result = await getEtiquetasPersonalizadas(user);
            
            return {
                etiquetas_personalizadas: result.etiquetas_personalizadas,
                source: 'empresa',
                estructura_id: result.estructura_id,
                version: result.version,
                isEnterprise: true
            };
        } else {
            // RUTA INDIVIDUAL: Leer desde usuario individual
            const result = await getEtiquetasPersonalizadas(user);
            
            return {
                etiquetas_personalizadas: result.etiquetas_personalizadas,
                source: 'individual', 
                user_id: result.user_id,
                isEnterprise: false
            };
        }
    } catch (error) {
        console.error('Error in getEtiquetasPersonalizadasAdapter:', error);
        // Degradación elegante - devolver objeto vacío
        return {
            etiquetas_personalizadas: {},
            source: 'fallback',
            isEnterprise: false,
            error: error.message
        };
    }
}

/**
 * Adaptador para escritura de etiquetas_personalizadas
 * Redirige según tipo de cuenta con validación de permisos
 * @param {Object} user - Usuario que realiza la actualización
 * @param {Object} etiquetas - Nuevas etiquetas a guardar
 * @param {Number} expectedVersion - Versión esperada (solo empresa)
 * @returns {Object} - { success, newVersion?, error?, conflict? }
 */
async function updateEtiquetasPersonalizadasAdapter(user, etiquetas, expectedVersion = null) {
    try {
        if (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id) {
            // RUTA EMPRESA: Verificar permisos y actualizar estructura_empresa
            const context = await getUserContext(user);
            
            if (!context.can_edit_empresa) {
                return {
                    success: false,
                    error: 'Sin permisos para editar etiquetas empresariales',
                    required_permission: 'can_edit_empresa'
                };
            }
            
            return await updateEtiquetasPersonalizadas(user, etiquetas, expectedVersion);
        } else {
            // RUTA INDIVIDUAL: Actualizar directamente
            return await updateEtiquetasPersonalizadas(user, etiquetas);
        }
    } catch (error) {
        console.error('Error in updateEtiquetasPersonalizadasAdapter:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Adaptador para obtener etiquetas seleccionadas del usuario
 * Filtra las etiquetas disponibles según selección personal
 * @param {Object} user - Usuario
 * @returns {Object} - { etiquetas_seleccionadas, etiquetas_disponibles, mapping }
 */
async function getEtiquetasSeleccionadasAdapter(user) {
    const client = new MongoClient(uri, mongodbOptions);
    try {
        await client.connect();
        const db = client.db('papyrus');
        const usersCollection = db.collection('users');
        
        // 1. Obtener etiquetas disponibles (empresa o individuales)
        const etiquetasResult = await getEtiquetasPersonalizadasAdapter(user);
        const etiquetasDisponibles = etiquetasResult.etiquetas_personalizadas || {};
        
        // 2. Obtener selección personal del usuario
        const userDoc = await usersCollection.findOne(
            { _id: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)) },
            { projection: { etiquetas_personalizadas_seleccionadas: 1 } }
        );
        
        const seleccionPersonal = Array.isArray(userDoc?.etiquetas_personalizadas_seleccionadas) 
            ? userDoc.etiquetas_personalizadas_seleccionadas 
            : [];
        
        // 3. DEGRADACIÓN ELEGANTE: Filtrar solo etiquetas que existen
        const etiquetasSeleccionadasValidas = seleccionPersonal.filter(nombreEtiqueta => {
            return etiquetasDisponibles.hasOwnProperty(nombreEtiqueta);
        });
        
        // 4. Crear mapping de etiquetas seleccionadas con sus definiciones
        const etiquetasMapping = {};
        etiquetasSeleccionadasValidas.forEach(nombreEtiqueta => {
            etiquetasMapping[nombreEtiqueta] = etiquetasDisponibles[nombreEtiqueta];
        });
        
        return {
            etiquetas_seleccionadas: etiquetasSeleccionadasValidas,
            etiquetas_disponibles: etiquetasDisponibles,
            etiquetas_mapping: etiquetasMapping,
            source: etiquetasResult.source,
            isEnterprise: etiquetasResult.isEnterprise,
            // Metadatos para debugging
            total_disponibles: Object.keys(etiquetasDisponibles).length,
            total_seleccionadas: etiquetasSeleccionadasValidas.length,
            seleccion_original: seleccionPersonal.length,
            etiquetas_filtradas: seleccionPersonal.length - etiquetasSeleccionadasValidas.length
        };
    } finally {
        await client.close();
    }
}

/**
 * Construcción de query MongoDB adaptada para empresa/individual
 * Genera la consulta correcta según el contexto del usuario
 * @param {Object} user - Usuario 
 * @param {Array} selectedEtiquetas - Etiquetas seleccionadas para filtrar
 * @returns {Object} - Query MongoDB para documentos
 */
function buildEtiquetasQuery(user, selectedEtiquetas) {
    if (!selectedEtiquetas || selectedEtiquetas.length === 0) {
        return {}; // Sin filtro si no hay etiquetas
    }
    
    // ENTERPRISE ADAPTER: Para usuarios empresa, usar estructura_empresa_id
    // Para usuarios individuales, usar user._id
    let targetUserId;
    
    if (user.tipo_cuenta === 'empresa' && user.estructura_empresa_id) {
        targetUserId = user.estructura_empresa_id.toString();
        console.log(`[buildEtiquetasQuery] Usuario empresa detectado, usando estructura_empresa_id: ${targetUserId}`);
    } else {
        targetUserId = user._id.toString();
        console.log(`[buildEtiquetasQuery] Usuario individual, usando user._id: ${targetUserId}`);
    }
    
    console.log(`[buildEtiquetasQuery] Construyendo query para etiquetas:`, selectedEtiquetas);
    
    // Query universal que funciona tanto para empresa como individual
    // Busca en el campo etiquetas_personalizadas de los documentos
    const query = {
        $or: [
            // Estructura nueva (objeto por etiqueta)
            {
                $or: selectedEtiquetas.map(etiqueta => ({
                    [`etiquetas_personalizadas.${targetUserId}.${etiqueta}`]: { $exists: true }
                }))
            },
            // Estructura antigua (array de etiquetas)
            {
                [`etiquetas_personalizadas.${targetUserId}`]: { 
                    $in: selectedEtiquetas 
                }
            }
        ]
    };
    
    console.log(`[buildEtiquetasQuery] Query construida:`, JSON.stringify(query, null, 2));
    return query;
}

// Actualizar exportaciones
module.exports = {
    // Lectura/escritura etiquetas
    getEtiquetasPersonalizadas,
    updateEtiquetasPersonalizadas,

    // Contexto de usuario
    getUserContext,

    // Cobertura legal y contexto completo
    getCoberturaLegal,
    updateCoberturaLegal,
    getContextData,
    updateContextData,

    // Carpetas y selección
    getCarpetasEstructura,
    createCarpeta,
    renameCarpeta,
    moveCarpeta,
    deleteCarpeta,
    assignAgenteToCarpeta,
    getSeleccionAgentes,
    updateSeleccionAgentes,

    // Bloqueos
    lockEtiquetasForEdit,
    unlockEtiquetasForEdit,
    updateLockHeartbeat,
    lockCarpetasForEdit,
    unlockCarpetasForEdit,

    // Adaptadores enterprise
    getEtiquetasPersonalizadasAdapter,
    updateEtiquetasPersonalizadasAdapter, 
    getEtiquetasSeleccionadasAdapter,
    buildEtiquetasQuery,

    // Migración
    migrateUsersToEmpresa
}; 