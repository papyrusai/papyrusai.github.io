/*
Routes: Permission management for empresa users
Endpoints:
- POST '/api/permisos/solicitar': Submit permission request from user
- POST '/api/permisos/check-pending': Check if user has pending requests for section
- GET '/api/permisos/solicitudes': Get pending permission requests (admin only)
- POST '/api/permisos/aprobar': Approve permission request (admin only)
- POST '/api/permisos/rechazar': Reject permission request (admin only)
*/
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const { getUserContext } = require('../services/enterprise.service');

const router = express.Router();
const uri = process.env.DB_URI;
const mongodbOptions = {};

// Helper: find estructura_empresa document prioritizing estructura_empresa_id
async function findEstructuraEmpresa(db, context) {
	const usersCollection = db.collection('users');
	if (context.estructura_empresa_id) {
		const estructuraId = (context.estructura_empresa_id instanceof ObjectId)
			? context.estructura_empresa_id
			: new ObjectId(String(context.estructura_empresa_id));
		return await usersCollection.findOne({ _id: estructuraId });
	}
	if (context.empresa) {
		return await usersCollection.findOne({ tipo_cuenta: 'estructura_empresa', empresa: context.empresa });
	}
	return null;
}

// POST /api/permisos/solicitar - Submit permission request
router.post('/api/permisos/solicitar', ensureAuthenticated, async (req, res) => {
	try {
		const { section, reason } = req.body;
		console.log('[Permisos] POST /api/permisos/solicitar', { user: req.user?.email, section });
		
		if (!section || !reason) {
			return res.status(400).json({ 
				success: false, 
				error: 'Sección y motivo son requeridos' 
			});
		}
		
		const context = await getUserContext(req.user);
		console.log('[Permisos] Context solicitar:', { tipo_cuenta: context.tipo_cuenta, is_admin: context.is_admin, empresa: context.empresa, estructura_empresa_id: context.estructura_empresa_id });
		
		// Verificar que sea usuario empresa
		if (context.tipo_cuenta !== 'empresa') {
			return res.status(403).json({ 
				success: false, 
				error: 'Solo usuarios empresa pueden solicitar permisos' 
			});
		}
		
		// Verificar que no tenga ya permisos de edición
		if (context.can_edit_empresa) {
			return res.status(400).json({ 
				success: false, 
				error: 'Ya tienes permisos de edición' 
			});
		}
		
		const client = new MongoClient(uri, mongodbOptions);
		try {
			await client.connect();
			const db = client.db('papyrus');
			const usersCollection = db.collection('users');
			
			// Buscar la estructura empresa (por id si existe)
			const estructuraDoc = await findEstructuraEmpresa(db, context);
			console.log('[Permisos] Estructura encontrada solicitar:', !!estructuraDoc);
			
			if (!estructuraDoc) {
				return res.status(404).json({ 
					success: false, 
					error: 'Estructura empresa no encontrada' 
				});
			}
			
			// Crear la solicitud
			const solicitud = {
				user_id: (req.user._id instanceof ObjectId) ? req.user._id : new ObjectId(String(req.user._id)),
				user_email: req.user.email,
				section: section,
				reason: reason.trim(),
				fecha_solicitud: new Date(),
				estado: 'pendiente'
			};
			
			// Verificar si ya existe una solicitud pendiente del mismo usuario para la misma sección
			const solicitudesExistentes = estructuraDoc.solicitudes_edicion || [];
			const solicitudExistente = solicitudesExistentes.find(s => 
				String(s.user_id) === String(solicitud.user_id) && 
				s.section === section && 
				s.estado === 'pendiente'
			);
			
			if (solicitudExistente) {
				return res.status(400).json({ 
					success: false, 
					error: 'Ya tienes una solicitud pendiente para esta sección' 
				});
			}
			
			// Añadir la solicitud al array
			await usersCollection.updateOne(
				{ _id: estructuraDoc._id },
				{ 
					$push: { 
						solicitudes_edicion: solicitud 
					},
					$set: { 
						updated_at: new Date() 
					}
				}
			);
			
			console.log('[Permisos] Solicitud de permisos guardada:', {
				empresa: context.empresa,
				user_email: req.user.email,
				section: section
			});
			
			res.json({ 
				success: true, 
				message: 'Solicitud enviada correctamente' 
			});
			
		} finally {
			await client.close();
		}
		
	} catch (error) {
		console.error('Error procesando solicitud de permisos:', error);
		res.status(500).json({ 
			success: false, 
			error: 'Error interno del servidor' 
		});
	}
});

// POST /api/permisos/check-pending - Check if user has pending requests
router.post('/api/permisos/check-pending', ensureAuthenticated, async (req, res) => {
	try {
		const { section } = req.body;
		
		if (!section) {
			return res.status(400).json({ 
				success: false, 
				error: 'Sección es requerida' 
			});
		}
		
		const context = await getUserContext(req.user);
		console.log('[Permisos] POST /api/permisos/check-pending', { user: req.user?.email, section, context: { tipo_cuenta: context.tipo_cuenta, empresa: context.empresa, estructura_empresa_id: context.estructura_empresa_id } });
		
		// Si no es usuario empresa o ya tiene permisos, no hay solicitudes pendientes
		if (context.tipo_cuenta !== 'empresa' || context.can_edit_empresa) {
			return res.json({ 
				success: true, 
				hasPending: false 
			});
		}
		
		const client = new MongoClient(uri, mongodbOptions);
		try {
			await client.connect();
			const db = client.db('papyrus');
			
			// Buscar estructura empresa
			const estructura = await findEstructuraEmpresa(db, context);
			console.log('[Permisos] Estructura encontrada check-pending:', !!estructura);
			
			if (!estructura) {
				return res.json({ 
					success: true, 
					hasPending: false 
				});
			}
			
			// Verificar si hay solicitudes pendientes o rechazadas para esta sección y usuario
			const userSolicitudes = (estructura.solicitudes_edicion || []).filter(solicitud => 
				solicitud.user_id.toString() === req.user._id.toString() &&
				solicitud.section === section
			);
			
			const hasPending = userSolicitudes.some(s => s.estado === 'pendiente');
			
			// Buscar la solicitud rechazada más reciente
			const rejectedSolicitudes = userSolicitudes.filter(s => s.estado === 'rechazada')
				.sort((a, b) => new Date(b.fecha_rechazo || 0) - new Date(a.fecha_rechazo || 0));
			
			const hasRejected = rejectedSolicitudes.length > 0;
			const rejectedDate = hasRejected ? rejectedSolicitudes[0].fecha_rechazo : null;
			
			return res.json({ 
				success: true, 
				hasPending: hasPending,
				hasRejected: hasRejected && !hasPending, // Solo mostrar rechazada si no hay pendiente
				rejectedDate: rejectedDate
			});
			
		} finally {
			await client.close();
		}
		
	} catch (error) {
		console.error('Error verificando solicitudes pendientes:', error);
		return res.status(500).json({ 
			success: false, 
			error: 'Error interno del servidor' 
		});
	}
});

// GET /api/permisos/solicitudes - Get pending permission requests (admin only)
router.get('/api/permisos/solicitudes', ensureAuthenticated, async (req, res) => {
	try {
		const context = await getUserContext(req.user);
		console.log('[Permisos] GET /api/permisos/solicitudes', { user: req.user?.email, context: { tipo_cuenta: context.tipo_cuenta, is_admin: context.is_admin, empresa: context.empresa, estructura_empresa_id: context.estructura_empresa_id } });
		
		// Verificar que sea admin de empresa
		if (context.tipo_cuenta !== 'empresa' || !context.is_admin) {
			console.log('[Permisos] Access denied - user is not empresa admin');
			return res.status(403).json({ 
				success: false, 
				error: 'Solo administradores empresa pueden ver solicitudes' 
			});
		}
		
		const client = new MongoClient(uri, mongodbOptions);
		try {
			await client.connect();
			const db = client.db('papyrus');
			const usersCollection = db.collection('users');
			
			// Buscar la estructura empresa con projection optimizada
			const estructuraDoc = await usersCollection.findOne(
				{ 
					tipo_cuenta: 'estructura_empresa', 
					empresa: context.empresa 
				},
				{ 
					projection: { solicitudes_edicion: 1 }
				}
			);
			console.log('[Permisos] Estructura encontrada solicitudes:', !!estructuraDoc);
			
			if (!estructuraDoc) {
				console.log('[Permisos] Estructura empresa no encontrada');
				return res.status(404).json({ 
					success: false, 
					error: 'Estructura empresa no encontrada' 
				});
			}
			
			const solicitudes = estructuraDoc.solicitudes_edicion || [];
			const solicitudesPendientes = solicitudes.filter(s => s.estado === 'pendiente');
			console.log('[Permisos] Solicitudes pendientes:', solicitudesPendientes.length);
			
			const solicitudesSanitized = solicitudesPendientes.map(s => ({
				user_id: s.user_id && s.user_id.toString ? s.user_id.toString() : String(s.user_id),
				user_email: s.user_email,
				section: s.section,
				reason: s.reason,
				fecha_solicitud: s.fecha_solicitud,
				estado: s.estado
			}));
			
			console.log('[Permisos] Returning solicitudes:', solicitudesSanitized.length);
			res.json({ 
				success: true, 
				solicitudes: solicitudesSanitized 
			});
			
		} finally {
			await client.close();
		}
		
	} catch (error) {
		console.error('Error obteniendo solicitudes:', error);
		res.status(500).json({ 
			success: false, 
			error: 'Error interno del servidor' 
		});
	}
});

// GET /api/permisos/usuarios - Get all users from empresa (admin only)
router.get('/api/permisos/usuarios', ensureAuthenticated, async (req, res) => {
	try {
		const context = await getUserContext(req.user);
		console.log('[Permisos] GET /api/permisos/usuarios', { user: req.user?.email, context: { tipo_cuenta: context.tipo_cuenta, is_admin: context.is_admin, empresa: context.empresa, estructura_empresa_id: context.estructura_empresa_id } });
		
		// Verificar que sea admin de empresa
		if (context.tipo_cuenta !== 'empresa' || !context.is_admin) {
			console.log('[Permisos] Access denied - user is not empresa admin');
			return res.status(403).json({ 
				success: false, 
				error: 'Solo administradores empresa pueden ver usuarios' 
			});
		}
		
		const client = new MongoClient(uri, mongodbOptions);
		try {
			await client.connect();
			const db = client.db('papyrus');
			const usersCollection = db.collection('users');
			
			// Buscar TODOS los usuarios de la empresa (por empresa field)
			// Esto captura usuarios con diferentes estructura_empresa_id de la misma empresa
			const query = { 
				tipo_cuenta: 'empresa',
				empresa: context.empresa
			};
			
			console.log('[Permisos] Searching users with query:', JSON.stringify(query, null, 2));
			
			const usuarios = await usersCollection.find(query, {
				projection: {
					_id: 1,
					email: 1,
					permiso: 1,
					admin_empresa_id: 1,
					estructura_empresa_id: 1,
					empresa: 1
				}
			}).toArray();
			console.log('[Permisos] Usuarios encontrados:', usuarios.length);
			
			const usuariosSanitized = (usuarios || []).map(u => ({
				_id: u._id && u._id.toString ? u._id.toString() : String(u._id),
				email: u.email,
				permiso: (u.permiso || 'lectura').toString().toLowerCase().trim(),
				admin_empresa_id: u.admin_empresa_id && u.admin_empresa_id.toString ? u.admin_empresa_id.toString() : String(u.admin_empresa_id),
				is_main_admin: String(u._id) === String(u.admin_empresa_id)
			}));
			
			console.log('[Permisos] Returning usuarios:', usuariosSanitized.length);
			res.json({ 
				success: true, 
				usuarios: usuariosSanitized 
			});
			
		} finally {
			await client.close();
		}
		
	} catch (error) {
		console.error('Error obteniendo usuarios:', error);
		res.status(500).json({ 
			success: false, 
			error: 'Error interno del servidor' 
		});
	}
});

// POST /api/permisos/aprobar - Approve permission request (admin only)
router.post('/api/permisos/aprobar', ensureAuthenticated, async (req, res) => {
	try {
		const { user_id } = req.body;
		console.log('[Permisos] POST /api/permisos/aprobar', { admin: req.user?.email, user_id });
		
		if (!user_id) {
			return res.status(400).json({ 
				success: false, 
				error: 'user_id es requerido' 
			});
		}
		
		const context = await getUserContext(req.user);
		
		// Verificar que sea admin de empresa
		if (context.tipo_cuenta !== 'empresa' || !context.is_admin) {
			return res.status(403).json({ 
				success: false, 
				error: 'Solo administradores empresa pueden aprobar solicitudes' 
			});
		}
		
		const client = new MongoClient(uri, mongodbOptions);
		try {
			await client.connect();
			const db = client.db('papyrus');
			const usersCollection = db.collection('users');
			
			// Buscar la estructura empresa (por id si existe)
			const estructuraDoc = await findEstructuraEmpresa(db, context);
			console.log('[Permisos] Estructura encontrada aprobar:', !!estructuraDoc);
			
			if (!estructuraDoc) {
				return res.status(404).json({ 
					success: false, 
					error: 'Estructura empresa no encontrada' 
				});
			}
			
			// Actualizar usuario a permiso de edición
			const userObjectId = new ObjectId(user_id);
			await usersCollection.updateOne(
				{ _id: userObjectId },
				{ 
					$set: { 
						permiso: 'edicion',
						updated_at: new Date()
					}
				}
			);
			
			// Marcar solicitud como aprobada en estructura empresa
			await usersCollection.updateOne(
				{ _id: estructuraDoc._id },
				{ 
					$set: { 
						"solicitudes_edicion.$[elem].estado": "aprobada",
						"solicitudes_edicion.$[elem].fecha_aprobacion": new Date(),
						"solicitudes_edicion.$[elem].aprobado_por": req.user._id,
						updated_at: new Date() 
					}
				},
				{ 
					arrayFilters: [{ 
						"elem.user_id": userObjectId, 
						"elem.estado": "pendiente" 
					}] 
				}
			);
			
			console.log('[Permisos] Solicitud aprobada:', {
				empresa: context.empresa,
				user_id: user_id,
				approved_by: req.user.email
			});
			
			res.json({ 
				success: true, 
				message: 'Solicitud aprobada correctamente',
				updated_user: { _id: userObjectId.toString(), permiso: 'edicion' }
			});
			
		} finally {
			await client.close();
		}
		
	} catch (error) {
		console.error('Error aprobando solicitud:', error);
		res.status(500).json({ 
			success: false, 
			error: 'Error interno del servidor' 
		});
	}
});

// POST /api/permisos/rechazar - Reject permission request (admin only)
router.post('/api/permisos/rechazar', ensureAuthenticated, async (req, res) => {
	try {
		const { user_id } = req.body;
		console.log('[Permisos] POST /api/permisos/rechazar', { admin: req.user?.email, user_id });
		
		if (!user_id) {
			return res.status(400).json({ 
				success: false, 
				error: 'user_id es requerido' 
			});
		}
		
		const context = await getUserContext(req.user);
		
		// Verificar que sea admin de empresa
		if (context.tipo_cuenta !== 'empresa' || !context.is_admin) {
			return res.status(403).json({ 
				success: false, 
				error: 'Solo administradores empresa pueden rechazar solicitudes' 
			});
		}
		
		const client = new MongoClient(uri, mongodbOptions);
		try {
			await client.connect();
			const db = client.db('papyrus');
			const usersCollection = db.collection('users');
			
			// Buscar la estructura empresa (por id si existe)
			const estructuraDoc = await findEstructuraEmpresa(db, context);
			console.log('[Permisos] Estructura encontrada rechazar:', !!estructuraDoc);
			
			if (!estructuraDoc) {
				return res.status(404).json({ 
					success: false, 
					error: 'Estructura empresa no encontrada' 
				});
			}
			
			// Marcar solicitud como rechazada en estructura empresa
			const userObjectId = new ObjectId(user_id);
			await usersCollection.updateOne(
				{ _id: estructuraDoc._id },
				{ 
					$set: { 
						"solicitudes_edicion.$[elem].estado": "rechazada",
						"solicitudes_edicion.$[elem].fecha_rechazo": new Date(),
						"solicitudes_edicion.$[elem].rechazado_por": req.user._id,
						updated_at: new Date() 
					}
				},
				{ 
					arrayFilters: [{ 
						"elem.user_id": userObjectId, 
						"elem.estado": "pendiente" 
					}] 
				}
			);
			
			console.log('[Permisos] Solicitud rechazada:', {
				empresa: context.empresa,
				user_id: user_id,
				rejected_by: req.user.email
			});
			
			res.json({ 
				success: true, 
				message: 'Solicitud rechazada correctamente'
			});
			
		} finally {
			await client.close();
		}
		
	} catch (error) {
		console.error('Error rechazando solicitud:', error);
		res.status(500).json({ 
			success: false, 
			error: 'Error interno del servidor' 
		});
	}
});

// POST /api/permisos/cambiar - Change user permission (admin only)
router.post('/api/permisos/cambiar', ensureAuthenticated, async (req, res) => {
	try {
		const { user_id, new_permission } = req.body;
		console.log('[Permisos] POST /api/permisos/cambiar', { admin: req.user?.email, user_id, new_permission });
		
		if (!user_id || !new_permission) {
			return res.status(400).json({ 
				success: false, 
				error: 'user_id y new_permission son requeridos' 
			});
		}
		
		// Validar nuevo permiso
		if (!['lectura', 'edicion', 'admin'].includes(new_permission)) {
			return res.status(400).json({ 
				success: false, 
				error: 'Permiso inválido' 
			});
		}
		
		const context = await getUserContext(req.user);
		
		// Verificar que sea admin de empresa
		if (context.tipo_cuenta !== 'empresa' || !context.is_admin) {
			return res.status(403).json({ 
				success: false, 
				error: 'Solo administradores empresa pueden cambiar permisos' 
			});
		}
		
		const client = new MongoClient(uri, mongodbOptions);
		try {
			await client.connect();
			const db = client.db('papyrus');
			const usersCollection = db.collection('users');
			
			// Verificar que el usuario a modificar pertenece a la misma empresa
			const targetUser = await usersCollection.findOne({ _id: new ObjectId(user_id) });
			if (!targetUser || targetUser.tipo_cuenta !== 'empresa') {
				return res.status(404).json({ success: false, error: 'Usuario no encontrado en esta empresa' });
			}
			const sameStructure = context.estructura_empresa_id && (String(targetUser.estructura_empresa_id) === String(context.estructura_empresa_id));
			const sameEmpresa = !context.estructura_empresa_id && context.empresa && (targetUser.empresa === context.empresa);
			if (!(sameStructure || sameEmpresa)) {
				return res.status(404).json({ success: false, error: 'Usuario no encontrado en esta empresa' });
			}
			
			// Prevenir que se modifique el permiso del admin principal
			if (String(targetUser.admin_empresa_id) === String(targetUser._id)) {
				return res.status(403).json({ 
					success: false, 
					error: 'No se puede cambiar el permiso del administrador principal' 
				});
			}
			
			// Actualizar permiso del usuario
			await usersCollection.updateOne(
				{ _id: new ObjectId(user_id) },
				{ 
					$set: { 
						permiso: new_permission,
						updated_at: new Date()
					}
				}
			);
			
			console.log('[Permisos] Permiso actualizado:', {
				empresa: context.empresa,
				user_id: user_id,
				user_email: targetUser.email,
				old_permission: targetUser.permiso,
				new_permission: new_permission,
				changed_by: req.user.email
			});
			
			res.json({ 
				success: true, 
				message: 'Permiso actualizado correctamente',
				updated_user: { _id: user_id, permiso: new_permission }
			});
			
		} finally {
			await client.close();
		}
		
	} catch (error) {
		console.error('Error cambiando permiso:', error);
		res.status(500).json({ 
			success: false, 
			error: 'Error interno del servidor' 
		});
	}
});

// DEBUG ENDPOINT - Remove after testing
router.get('/api/permisos/debug', ensureAuthenticated, async (req, res) => {
	try {
		console.log('=== DEBUG PERMISOS ENDPOINT ===');
		console.log('User authenticated:', !!req.user);
		console.log('User ID:', req.user?._id);
		console.log('User email:', req.user?.email);
		
		const context = await getUserContext(req.user);
		console.log('User context:', context);
		
		const client = new MongoClient(uri, mongodbOptions);
		try {
			await client.connect();
			const db = client.db('papyrus');
			
			if (context.tipo_cuenta === 'empresa') {
				// Test estructura empresa access
				const estructuraDoc = await db.collection('users').findOne({ 
					tipo_cuenta: 'estructura_empresa', 
					empresa: context.empresa 
				});
				console.log('Estructura empresa found:', !!estructuraDoc);
				
				if (estructuraDoc) {
					console.log('Solicitudes count:', estructuraDoc.solicitudes_edicion?.length || 0);
					
					// Test usuarios access
					const usuarios = await db.collection('users').find({ 
						tipo_cuenta: 'empresa', 
						empresa: context.empresa 
					}).toArray();
					console.log('Usuarios count:', usuarios.length);
				}
			}
			
			res.json({
				success: true,
				debug: {
					user: {
						id: req.user._id,
						email: req.user.email,
						tipo_cuenta: req.user.tipo_cuenta
					},
					context: context,
					endpoints_status: 'accessible'
				}
			});
			
		} finally {
			await client.close();
		}
		
	} catch (error) {
		console.error('Error in debug endpoint:', error);
		res.status(500).json({ 
			success: false, 
			error: error.message,
			stack: error.stack
		});
	}
});

module.exports = router; 