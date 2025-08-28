/*
Routes: Authentication and account flows (local + Google) and password recovery.
Endpoints:
- POST '/login': local login
- POST '/register': user registration + auto-login
- GET '/auth/google' and '/auth/google/callback': Google OAuth login
- GET '/logout': destroy session and redirect to index
- POST '/forgot-password': request password reset link via email
- POST '/reset-password': set new password using a valid token
*/
const express = require('express');
const passport = require('passport');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');

const router = express.Router();

const uri = process.env.DB_URI;
const BASE_URL = process.env.BASE_URL || 'https://app.reversa.ai';
const SPECIAL_DOMAIN = "@cuatrecasas.com";
const SPECIAL_ADDRESS = "xx";

// to avoid deprecation error (match app.js)
const mongodbOptions = {};

// Email provider
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (SENDGRID_API_KEY && SENDGRID_API_KEY.startsWith('SG.')) {
	sgMail.setApiKey(SENDGRID_API_KEY);
}

const { processSpecialDomainUser, processAODomainUser, extractDomainFromEmail, connectUserToEmpresa, getUserLimits } = require('../services/users.service');
const { sendPasswordResetEmail } = require('../services/email.service');

// Local login
router.post('/login', (req, res, next) => {
	passport.authenticate('local', async (err, user, info) => {
		if (err) {
			console.log(err);
			return res.status(500).json({ error: "Error interno de autenticación" });
		}
		if (!user) {
			return res.status(400).json({
				error: "Correo o contraseña equivocada, por favor, intente de nuevo o regístrese"
			});
		}

		req.logIn(user, async (err) => {
			if (err) {
				return res.status(500).json({ error: "Error al iniciar sesión" });
			}

			if (user && user.email) {
				res.cookie('userEmail', user.email, { 
					maxAge: 24 * 60 * 60 * 1000,
					httpOnly: false,
					secure: process.env.NODE_ENV === 'production',
					sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
				});
			}

			if (user.email.toLowerCase().endsWith(SPECIAL_DOMAIN)) {
				await processSpecialDomainUser(user);
				return res.status(200).json({ redirectUrl: '/profile' });
			}

			if (user.email.toLowerCase().endsWith(SPECIAL_ADDRESS)) {
				await processAODomainUser(user);
				return res.status(200).json({ redirectUrl: '/profile' });
			}

			// Autoconexión por dominio en login: si existe estructura de empresa, vincular/copiar y saltar onboarding
			try {
				const empresaDomain = extractDomainFromEmail(user.email);
				if (empresaDomain) {
					const client = new MongoClient(uri, mongodbOptions);
					await client.connect();
					const db = client.db('papyrus');
					const estructura = await db.collection('users').findOne({ tipo_cuenta: 'estructura_empresa', empresa: empresaDomain });
					if (estructura) {
						// Conectar usuario a empresa usando la conexión existente
						let isAdmin = false;
						if (!estructura.admin_principal_id) {
							const estructuraObjectId = (estructura._id && estructura._id instanceof ObjectId) ? estructura._id : new ObjectId(String(estructura._id));
							await db.collection('users').updateOne(
								{ _id: estructuraObjectId },
								{ $set: { admin_principal_id: (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)), updated_at: new Date() } }
							);
							isAdmin = true;
						} else {
							try {
								const currentUserObjectId = (user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id));
								isAdmin = estructura.admin_principal_id && estructura.admin_principal_id.equals ? estructura.admin_principal_id.equals(currentUserObjectId) : (String(estructura.admin_principal_id) === String(currentUserObjectId));
							} catch (_) {
								isAdmin = String(estructura.admin_principal_id) === String(user._id);
							}
						}
						
						// Actualizar usuario con datos de empresa
						// Solo asignar nuevo permiso si el usuario no tiene uno ya (primera vez)
						const currentUser = await db.collection('users').findOne({ _id: userObjectId });
						const permisoToAssign = currentUser && currentUser.tipo_cuenta === 'empresa' && currentUser.permiso
							? currentUser.permiso  // Mantener permiso existente
							: (isAdmin ? 'admin' : 'lectura'); // Solo asignar lectura por defecto si es primera vez
						
						const userUpdate = {
							$set: {
								tipo_cuenta: 'empresa',
								empresa: empresaDomain,
								estructura_empresa_id: estructura._id,
								permiso: permisoToAssign,
								admin_empresa_id: estructura.admin_principal_id || ((user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id))),
								subscription_plan: 'plan4',
								limit_agentes: getUserLimits('plan4').limit_agentes,
								limit_fuentes: getUserLimits('plan4').limit_fuentes,
								updated_at: new Date()
							}
						};
						const userObjectId = (user._id && user._id._bsontype === 'ObjectID') ? user._id : ((user._id instanceof ObjectId) ? user._id : new ObjectId(String(user._id)));
						await db.collection('users').updateOne({ _id: userObjectId }, userUpdate);
						
						// Copiar variables comunes de estructura a user (best effort)
						try {
							const now = new Date();
							const yyyy = now.getFullYear();
							const mm = String(now.getMonth() + 1).padStart(2, '0');
							const dd = String(now.getDate()).padStart(2, '0');
							const copyFields = {
								industry_tags: estructura.industry_tags || [],
								sub_industria_map: estructura.sub_industria_map || {},
								rama_juridicas: estructura.rama_juridicas || [],
								sub_rama_map: estructura.sub_rama_map || {},
								cobertura_legal: estructura.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] },
								rangos: estructura.rangos || [],
								perfil_regulatorio: estructura.perfil_regulatorio || '<p>Perfil regulatorio establecido para empresa.</p><p>Configuración completada automáticamente basada en la estructura organizacional.</p><p>Accede a la sección de Agentes para personalizar tu monitoreo normativo.</p>',
								tipo_empresa: estructura.tipo_empresa || 'Corporativo',
								detalle_empresa: estructura.detalle_empresa || { sector: 'Empresarial', actividad: 'Múltiples sectores' },
								interes: estructura.interes || 'Monitoreo normativo empresarial',
								tamaño_empresa: estructura.tamaño_empresa || 'Mediana-Grande',
								web: estructura.web || '',
								company_name: estructura.company_name || '',
								registration_date: user.registration_date || `${yyyy}-${mm}-${dd}`,
								registration_date_obj: now
							};
							await db.collection('users').updateOne({ _id: userObjectId }, { $set: copyFields });
						} catch (_) {}
						await client.close();
						return res.status(200).json({ redirectUrl: '/profile?view=configuracion&tab=agentes' });
					}
					await client.close();
				}
			} catch (_) {}

			if (user.subscription_plan) {
				return res.status(200).json({ redirectUrl: '/profile' });
			} else {
				return res.status(200).json({ redirectUrl: '/onboarding/paso0.html' });
			}
		});
	})(req, res, next);
});

// Register
router.post('/register', async (req, res) => {
	const { email, password, confirmPassword } = req.body;
	const bcrypt = require('bcryptjs');

	if (password !== confirmPassword) {
		return res.status(400).json({ error: "Las contraseñas no coinciden." });
	}
	if (password.length < 7) {
		return res.status(400).json({ error: "La contraseña debe tener al menos 7 caracteres." });
	}
	const specialCharRegex = /[^\p{L}\p{N}]/u;
	if (!specialCharRegex.test(password)) {
		return res.status(400).json({ error: "La contraseña debe contener al menos un carácter especial." });
	}

	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const database = client.db("papyrus");
		const usersCollection = database.collection("users");

		const existingUser = await usersCollection.findOne({ email: email });
		if (existingUser) {
			return res.status(400).json({ error: "El usuario ya existe, por favor inicia sesión" });
		}

		const hashedPassword = await bcrypt.hash(password, 10);
		const newUser = {
			email,
			password: hashedPassword,
			first_date_registration: new Date(),
		};

		const result = await usersCollection.insertOne(newUser);
		newUser._id = result.insertedId;

		req.login(newUser, async (err) => {
			if (err) {
				console.error("Error durante login después de registro:", err);
				return res.status(500).json({ error: "Registro completado, pero fallo al iniciar sesión" });
			}

			if (newUser && newUser.email) {
				res.cookie('userEmail', newUser.email, {
					maxAge: 24 * 60 * 60 * 1000,
					httpOnly: false,
					secure: process.env.NODE_ENV === 'production',
					sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
				});
			}

			// Registro inicial debe pasar por onboarding para selección de plan y promoción.
			// La vinculación a empresa (si procede) se hará en /save-free-plan cuando se use el código enterprise.

			if (newUser.email.toLowerCase().endsWith(SPECIAL_DOMAIN)) {
				await processSpecialDomainUser(newUser);
				return res.status(200).json({ redirectUrl: '/profile' });
			}
			if (newUser.email.toLowerCase().endsWith(SPECIAL_ADDRESS)) {
				await processAODomainUser(newUser);
				return res.status(200).json({ redirectUrl: '/profile' });
			}

			// Autoconexión por dominio: si existe estructura de empresa para el dominio, vincular y saltar onboarding
			try {
				const empresaDomain = extractDomainFromEmail(newUser.email);
				if (empresaDomain) {
					// Buscar estructura empresa existente usando la conexión ya abierta
					const estructura = await database.collection('users').findOne({ tipo_cuenta: 'estructura_empresa', empresa: empresaDomain });
					if (estructura) {
						// Conectar usuario a empresa usando la conexión existente
						let isAdmin = false;
						if (!estructura.admin_principal_id) {
							const estructuraObjectId = (estructura._id && estructura._id instanceof ObjectId) ? estructura._id : new ObjectId(String(estructura._id));
							await database.collection('users').updateOne(
								{ _id: estructuraObjectId },
								{ $set: { admin_principal_id: (newUser._id instanceof ObjectId) ? newUser._id : new ObjectId(String(newUser._id)), updated_at: new Date() } }
							);
							isAdmin = true;
						} else {
							try {
								const currentUserObjectId = (newUser._id instanceof ObjectId) ? newUser._id : new ObjectId(String(newUser._id));
								isAdmin = estructura.admin_principal_id && estructura.admin_principal_id.equals ? estructura.admin_principal_id.equals(currentUserObjectId) : (String(estructura.admin_principal_id) === String(currentUserObjectId));
							} catch (_) {
								isAdmin = String(estructura.admin_principal_id) === String(newUser._id);
							}
						}
						
						// Actualizar usuario con datos de empresa
						// Para nuevos usuarios registrándose, siempre asignar permiso por defecto
						const userUpdate = {
							$set: {
								tipo_cuenta: 'empresa',
								empresa: empresaDomain,
								estructura_empresa_id: estructura._id,
								permiso: isAdmin ? 'admin' : 'lectura',
								admin_empresa_id: estructura.admin_principal_id || ((newUser._id instanceof ObjectId) ? newUser._id : new ObjectId(String(newUser._id))),
								subscription_plan: 'plan4',
								limit_agentes: getUserLimits('plan4').limit_agentes,
								limit_fuentes: getUserLimits('plan4').limit_fuentes,
								updated_at: new Date()
							}
						};
						await database.collection('users').updateOne({ _id: (newUser._id instanceof ObjectId) ? newUser._id : new ObjectId(String(newUser._id)) }, userUpdate);
						
						// Copiar variables comunes de estructura a user (best effort)
						try {
							const now = new Date();
							const yyyy = now.getFullYear();
							const mm = String(now.getMonth() + 1).padStart(2, '0');
							const dd = String(now.getDate()).padStart(2, '0');
							const copyFields = {
								industry_tags: estructura.industry_tags || [],
								sub_industria_map: estructura.sub_industria_map || {},
								rama_juridicas: estructura.rama_juridicas || [],
								sub_rama_map: estructura.sub_rama_map || {},
								cobertura_legal: estructura.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] },
								rangos: estructura.rangos || [],
								perfil_regulatorio: estructura.perfil_regulatorio || '<p>Perfil regulatorio establecido para empresa.</p><p>Configuración completada automáticamente basada en la estructura organizacional.</p><p>Accede a la sección de Agentes para personalizar tu monitoreo normativo.</p>',
								tipo_empresa: estructura.tipo_empresa || 'Corporativo',
								detalle_empresa: estructura.detalle_empresa || { sector: 'Empresarial', actividad: 'Múltiples sectores' },
								interes: estructura.interes || 'Monitoreo normativo empresarial',
								tamaño_empresa: estructura.tamaño_empresa || 'Mediana-Grande',
								web: estructura.web || '',
								company_name: estructura.company_name || '',
								registration_date: `${yyyy}-${mm}-${dd}`,
								registration_date_obj: now
							};
							await database.collection('users').updateOne({ _id: (newUser._id instanceof ObjectId) ? newUser._id : new ObjectId(String(newUser._id)) }, { $set: copyFields });
						} catch (_) {
							// Non-blocking copy step
						}
						
						await client.close();
						return res.status(200).json({ redirectUrl: '/profile?view=configuracion&tab=agentes' });
					}
				}
			} catch (e) {
				console.warn('Autoconexión por dominio (registro) no aplicada:', e.message);
			}
			await client.close();
			return res.status(200).json({ redirectUrl: '/onboarding/paso0.html' });
		});
	} catch (err) {
		console.error("Error registrando usuario:", err);
		return res.status(500).json({ error: "Error al registrar el usuario." });
	}
});

// Google OAuth
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback',
	passport.authenticate('google', { failureRedirect: '/' }),
	async (req, res) => {
		const client = new MongoClient(uri, mongodbOptions);
		try {
			await client.connect();
			const database = client.db("papyrus");
			const usersCollection = database.collection("users");

			if (req.user && req.user.email) {
				res.cookie('userEmail', req.user.email, { 
					maxAge: 24 * 60 * 60 * 1000,
					httpOnly: false,
					secure: process.env.NODE_ENV === 'production',
					sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
				});
			}

			await usersCollection.findOne({ _id: new ObjectId(req.user._id) });

			// Autoconexión por dominio para Google OAuth
			try {
				const empresaDomain = extractDomainFromEmail(req.user.email);
				if (empresaDomain) {
					const estructura = await connectUserToEmpresa(req.user._id, req.user.email);
					if (estructura) {
						const estructuraDoc = await database.collection('users').findOne({ _id: (estructura._id instanceof ObjectId) ? estructura._id : new ObjectId(String(estructura._id)) });
						if (estructuraDoc) {
							const now = new Date();
							const yyyy = now.getFullYear();
							const mm = String(now.getMonth() + 1).padStart(2, '0');
							const dd = String(now.getDate()).padStart(2, '0');
							const copyFields = {
								industry_tags: estructuraDoc.industry_tags || [],
								sub_industria_map: estructuraDoc.sub_industria_map || {},
								rama_juridicas: estructuraDoc.rama_juridicas || [],
								sub_rama_map: estructuraDoc.sub_rama_map || {},
								cobertura_legal: estructuraDoc.cobertura_legal || { fuentes_gobierno: [], fuentes_reguladores: [] },
								rangos: estructuraDoc.rangos || [],
								perfil_regulatorio: estructuraDoc.perfil_regulatorio || '<p>Perfil regulatorio establecido para empresa.</p><p>Configuración completada automáticamente basada en la estructura organizacional.</p><p>Accede a la sección de Agentes para personalizar tu monitoreo normativo.</p>',
								tipo_empresa: estructuraDoc.tipo_empresa || 'Corporativo',
								detalle_empresa: estructuraDoc.detalle_empresa || { sector: 'Empresarial', actividad: 'Múltiples sectores' },
								interes: estructuraDoc.interes || 'Monitoreo normativo empresarial',
								tamaño_empresa: estructuraDoc.tamaño_empresa || 'Mediana-Grande',
								web: estructuraDoc.web || '',
								company_name: estructuraDoc.company_name || '',
								subscription_plan: 'plan4',
								impact_analysis_limit: -1,
								limit_agentes: estructuraDoc.limit_agentes ?? null,
								limit_fuentes: estructuraDoc.limit_fuentes ?? null,
								registration_date: `${yyyy}-${mm}-${dd}`,
								registration_date_obj: now,
								updated_at: new Date()
							};
							await database.collection('users').updateOne({ _id: (req.user._id instanceof ObjectId) ? req.user._id : new ObjectId(String(req.user._id)) }, { $set: copyFields });
						}
						return res.redirect('/profile?view=configuracion&tab=agentes');
					}
				}
			} catch (e) {
				console.warn('Autoconexión por dominio (Google) no aplicada:', e.message);
			}

			if (req.user.email.toLowerCase().endsWith(SPECIAL_DOMAIN)) {
				await processSpecialDomainUser(req.user);
				return res.redirect('/profile');
			}
			if (req.user.email.toLowerCase().endsWith(SPECIAL_ADDRESS)) {
				await processAODomainUser(req.user);
				return res.redirect('/profile');
			}

			if (req.user.subscription_plan) {
				if (req.session.returnTo) {
					const redirectPath = req.session.returnTo;
					req.session.returnTo = null;
					return res.redirect(redirectPath);
				}
				return res.redirect('/profile');
			} else {
				return res.redirect('/onboarding/paso0.html');
			}
		} catch (err) {
			console.error('Error connecting to MongoDB', err);
			return res.redirect('/');
		} finally {
			await client.close();
		}
	}
);

// Logout
router.get('/logout', (req, res) => {
	req.session = null;
	res.clearCookie('connect.sid', { path: '/' });
	res.redirect('/index.html');
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
	const { email } = req.body;
	if (!email) {
		return res.status(400).json({ error: "Email es requerido" });
	}
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const database = client.db("papyrus");
		const usersCollection = database.collection("users");
		const user = await usersCollection.findOne({ email: email.toLowerCase() });
		const successMessage = "Si el correo existe en nuestro sistema, recibirás un enlace de recuperación";
		if (!user || !user.password) {
			return res.status(200).json({ message: successMessage });
		}
		const resetToken = crypto.randomBytes(32).toString('hex');
		const resetTokenExpiry = new Date(Date.now() + 3600000);
		await usersCollection.updateOne(
			{ email: email.toLowerCase() },
			{ $set: { resetPasswordToken: resetToken, resetPasswordExpires: resetTokenExpiry } }
		);
		try {
			await sendPasswordResetEmail(user.email, resetToken);
		} catch (_) {}
		return res.status(200).json({ message: successMessage });
	} catch (err) {
		console.error("Error in forgot password:", err);
		return res.status(500).json({ error: "Error interno del servidor" });
	} finally {
		await client.close();
	}
});

// Reset password
router.post('/reset-password', async (req, res) => {
	const { token, newPassword } = req.body;
	if (!token || !newPassword) {
		return res.status(400).json({ error: "Token y nueva contraseña son requeridos" });
	}
	const bcrypt = require('bcryptjs');
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const database = client.db("papyrus");
		const usersCollection = database.collection("users");
		const user = await usersCollection.findOne({
			resetPasswordToken: token,
			resetPasswordExpires: { $gt: new Date() }
		});
		if (!user) {
			return res.status(400).json({ error: "Token inválido o expirado. Solicita un nuevo enlace de recuperación." });
		}
		if (newPassword.length < 7) {
			return res.status(400).json({ error: "La contraseña debe tener al menos 7 caracteres." });
	}
		const specialCharRegex = /[^\p{L}\p{N}]/u;
		if (!specialCharRegex.test(newPassword)) {
			return res.status(400).json({ error: "La contraseña debe contener al menos un carácter especial." });
		}
		const hashedPassword = await bcrypt.hash(newPassword, 10);
		await usersCollection.updateOne(
			{ _id: user._id },
			{ $set: { password: hashedPassword }, $unset: { resetPasswordToken: "", resetPasswordExpires: "" } }
		);
		return res.status(200).json({ message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión." });
	} catch (err) {
		console.error("Error in reset password:", err);
		return res.status(500).json({ error: "Error interno del servidor" });
	} finally {
		await client.close();
	}
});



module.exports = router; 