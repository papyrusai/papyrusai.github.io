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

const { processSpecialDomainUser, processAODomainUser } = require('../services/users.service');
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

			if (newUser.email.toLowerCase().endsWith(SPECIAL_DOMAIN)) {
				await processSpecialDomainUser(newUser);
				return res.status(200).json({ redirectUrl: '/profile' });
			}
			if (newUser.email.toLowerCase().endsWith(SPECIAL_ADDRESS)) {
				await processAODomainUser(newUser);
				return res.status(200).json({ redirectUrl: '/profile' });
			}
			return res.status(200).json({ redirectUrl: '/onboarding/paso0.html' });
		});
	} catch (err) {
		console.error("Error registrando usuario:", err);
		return res.status(500).json({ error: "Error al registrar el usuario." });
	} finally {
		await client.close();
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