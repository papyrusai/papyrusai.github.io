/*
Routes: User account data and post-checkout save
Endpoints:
- GET '/save-user': finalize Stripe checkout and persist user data
- GET '/api/current-user' (auth): minimal current user info
- GET '/api/get-user-data' (auth): full user profile data for settings
- POST '/api/update-user-data' (auth): updates allowed user fields
*/
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const stripe = require('stripe')(process.env.STRIPE);
const { getUserLimits } = require('../services/users.service');

const router = express.Router();
const uri = process.env.DB_URI;
const mongodbOptions = {};

// GET /save-user
router.get('/save-user', async (req, res) => {
	const { session_id } = req.query;
	console.log('[save-user] =================================');
	console.log('[save-user] Starting save-user process');
	console.log('[save-user] Session ID:', session_id);
	console.log('[save-user] req.user exists:', !!req.user);
	console.log('[save-user] req.user._id:', req.user ? req.user._id : 'NO USER ID');
	console.log('[save-user] req.session exists:', !!req.session);
	console.log('[save-user] req.isAuthenticated():', req.isAuthenticated ? req.isAuthenticated() : 'NO AUTH FUNCTION');
	if (!session_id) {
		console.error('[save-user] ERROR: No session_id provided in query params');
		return res.redirect('/index.html?error=no_session_id');
	}
	try {
		console.log('[save-user] Retrieving Stripe session...');
		let session;
		try {
			session = await stripe.checkout.sessions.retrieve(session_id, { expand: ['subscription', 'line_items'] });
		} catch (stripeError) {
			console.error('[save-user] ERROR: Failed to retrieve Stripe session:', stripeError.message);
			console.error('[save-user] Stripe error type:', stripeError.type);
			console.error('[save-user] Session ID that failed:', session_id);
			return res.redirect('/index.html?error=stripe_session_not_found&session_id=' + session_id);
		}
		console.log('[save-user] Stripe session retrieved successfully');
		console.log('[save-user] Session payment status:', session.payment_status);
		console.log('[save-user] Session metadata exists:', !!session.metadata);
		console.log('[save-user] Session metadata keys:', session.metadata ? Object.keys(session.metadata) : 'NO METADATA');
		console.log('[save-user] Session metadata.user_id:', session.metadata ? session.metadata.user_id : 'NO USER_ID IN METADATA');
		if (session.payment_status !== 'paid') {
			console.error('[save-user] ERROR: Payment not completed. Status:', session.payment_status);
			return res.redirect('/index.html?error=payment_not_completed&status=' + session.payment_status);
		}
		let user = req.user;
		if (!user) {
			console.warn('[save-user] req.user is undefined. Attempting to recover using session metadata.user_id');
			const metaUserId = session.metadata && session.metadata.user_id;
			console.log('[save-user] metadata.user_id value:', metaUserId);
			console.log('[save-user] metadata.user_id type:', typeof metaUserId);
			if (metaUserId) {
				console.log('[save-user] Found metadata.user_id:', metaUserId);
				try {
					console.log('[save-user] Connecting to MongoDB to recover user...');
					const tempClient = new MongoClient(uri, mongodbOptions);
					await tempClient.connect();
					console.log('[save-user] MongoDB connected, searching for user with ID:', metaUserId);
					let searchQuery;
					try { searchQuery = { _id: new ObjectId(metaUserId) }; console.log('[save-user] Search query:', JSON.stringify(searchQuery)); } catch (objectIdError) {
						console.error('[save-user] ERROR: Invalid ObjectId format:', metaUserId);
						console.error('[save-user] ObjectId error:', objectIdError.message);
						await tempClient.close();
						return;
					}
					user = await tempClient.db('papyrus').collection('users').findOne(searchQuery);
					console.log('[save-user] User found from DB:', !!user);
					if (user) {
						console.log('[save-user] Successfully recovered user with email:', user.email);
						console.log('[save-user] User ID from DB:', user._id.toString());
					} else if (session.customer_details && session.customer_details.email) {
						console.log('[save-user] Attempting to find user by email:', session.customer_details.email);
						user = await tempClient.db('papyrus').collection('users').findOne({ email: session.customer_details.email.toLowerCase() });
						if (user) console.log('[save-user] Successfully recovered user by email:', user.email);
					}
					await tempClient.close();
				} catch (recErr) {
					console.error('[save-user] ERROR: Exception retrieving user via metadata.user_id:', recErr);
					console.error('[save-user] Full error stack:', recErr.stack);
					console.error('[save-user] Error name:', recErr.name);
					console.error('[save-user] Error message:', recErr.message);
				}
			} else {
				console.error('[save-user] ERROR: metadata.user_id not present in session metadata');
				console.error('[save-user] Available metadata keys:', session.metadata ? Object.keys(session.metadata) : 'None');
				if (session.metadata) console.error('[save-user] Full metadata object:', JSON.stringify(session.metadata, null, 2));
			}
		} else {
			console.log('[save-user] req.user available with email:', user.email);
		}
		if (!user) {
			console.error('[save-user] CRITICAL ERROR: Unable to identify user after all recovery attempts');
			console.error('[save-user] Session metadata:', session.metadata);
			console.error('[save-user] Customer details:', session.customer_details);
			console.error('[save-user] Redirecting to login with session_lost error');
			return res.redirect('/index.html?error=session_lost&redirect_to=' + encodeURIComponent('/save-user?session_id=' + session_id));
		}
		const metadata = session.metadata || {};
		const reconstructedData = {};
		const reconstructObject = (prefix) => {
			if (metadata[prefix]) return JSON.parse(metadata[prefix]);
			else if (metadata[`${prefix}_chunks`]) {
				const chunks = parseInt(metadata[`${prefix}_chunks`]);
				let fullString = '';
				for (let i = 0; i < chunks; i++) fullString += metadata[`${prefix}_${i}`] || '';
				return JSON.parse(fullString);
			}
			return null;
		};
		reconstructedData.industry_tags = reconstructObject('industry_tags');
		reconstructedData.sub_industria_map = reconstructObject('sub_industria_map');
		reconstructedData.rama_juridicas = reconstructObject('rama_juridicas');
		reconstructedData.sub_rama_map = reconstructObject('sub_rama_map');
		reconstructedData.cobertura_legal = reconstructObject('cobertura_legal');
		reconstructedData.rangos = reconstructObject('rangos');
		reconstructedData.feedback_login = reconstructObject('feedback');
		reconstructedData.etiquetas_personalizadas = reconstructObject('etiquetas_personalizadas');
		reconstructedData.subscription_plan = metadata.plan;
		reconstructedData.profile_type = metadata.profile_type;
		reconstructedData.company_name = metadata.company_name;
		reconstructedData.name = metadata.name;
		reconstructedData.web = metadata.web;
		reconstructedData.linkedin = metadata.linkedin;
		reconstructedData.perfil_profesional = metadata.perfil_profesional;
		reconstructedData.billing_interval = metadata.billing_interval || 'monthly';
		reconstructedData.extra_agentes = parseInt(metadata.extra_agentes || '0');
		reconstructedData.extra_fuentes = parseInt(metadata.extra_fuentes || '0');
		reconstructedData.impact_analysis_limit = parseInt(metadata.impact_analysis_limit || '0');
		const userLimits = getUserLimits(reconstructedData.subscription_plan);
		reconstructedData.limit_agentes = userLimits.limit_agentes;
		reconstructedData.limit_fuentes = userLimits.limit_fuentes;
		const currentDate = new Date();
		const yyyy = currentDate.getFullYear();
		const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
		const dd = String(currentDate.getDate()).padStart(2, '0');
		const formattedDate = `${yyyy}-${mm}-${dd}`;
		reconstructedData.registration_date = formattedDate;
		reconstructedData.registration_date_obj = currentDate;
		reconstructedData.stripe_customer_id = session.customer;
		reconstructedData.stripe_subscription_id = session.subscription?.id;
		reconstructedData.payment_status = session.payment_status;
		if (session.line_items && session.line_items.data) {
			reconstructedData.purchased_items = session.line_items.data.map(item => ({ description: item.description, amount: item.amount_total, currency: item.currency }));
		}
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const db = client.db('papyrus');
		const usersCollection = db.collection('users');
		console.log('[save-user] Attempting to update user in database');
		console.log('[save-user] User ID for update:', user._id);
		console.log('[save-user] Update data keys:', Object.keys(reconstructedData));
		const updateResult = await usersCollection.updateOne({ _id: new ObjectId(user._id) }, { $set: reconstructedData }, { upsert: true });
		console.log('[save-user] Update result:', updateResult);
		console.log('[save-user] Matched count:', updateResult.matchedCount);
		console.log('[save-user] Modified count:', updateResult.modifiedCount);
		console.log('[save-user] User data updated successfully in database');
		console.log('[save-user] User email:', user.email);
		console.log('[save-user] Final subscription plan:', reconstructedData.subscription_plan);
		try { const { sendSubscriptionEmail } = require('./billing.routes'); await sendSubscriptionEmail(user, reconstructedData); } catch (emailError) { console.error('[save-user] Error sending confirmation email:', emailError); }
		await client.close();
		if (!req.user || req.user._id.toString() !== user._id.toString()) {
			req.login(user, (loginErr) => {
				if (loginErr) { console.error('[save-user] Error during manual login:', loginErr); }
				if (user && user.email) {
					res.cookie('userEmail', user.email, { maxAge: 24 * 60 * 60 * 1000, httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' });
				}
				res.redirect('/profile?view=configuracion');
			});
		} else {
			if (user && user.email) {
				res.cookie('userEmail', user.email, { maxAge: 24 * 60 * 60 * 1000, httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' });
			}
			res.redirect('/profile?view=configuracion');
		}
	} catch (error) {
		console.error('[save-user] CRITICAL ERROR in save-user process:');
		console.error('[save-user] Error message:', error.message);
		console.error('[save-user] Error stack:', error.stack);
		console.error('[save-user] Error name:', error.name);
		console.error('[save-user] Session ID that caused error:', session_id);
		console.error('[save-user] req.user at error time:', req.user ? req.user.email : 'NO USER');
		const errorParams = new URLSearchParams({ error: 'save_user_failed', message: error.message, session_id: session_id || 'unknown' });
		res.redirect('/index.html?' + errorParams.toString());
	}
});

// GET /api/current-user
router.get('/api/current-user', ensureAuthenticated, async (req, res) => {
	try {
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const database = client.db('papyrus');
		const usersCollection = database.collection('users');
		const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
		if (!user) return res.status(404).json({ error: 'User not found' });
		res.json({ name: user.name || '', subscription_plan: user.subscription_plan || 'plan1' });
	} catch (error) {
		console.error('Error fetching current user:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// GET /api/get-user-data
router.get('/api/get-user-data', ensureAuthenticated, async (req, res) => {
	try {
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const database = client.db('papyrus');
		const usersCollection = database.collection('users');
		const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
		if (!user) return res.status(404).json({ error: 'User not found' });
		res.json({
			name: user.name || '', web: user.web || '', linkedin: user.linkedin || '', perfil_profesional: user.perfil_profesional || '', especializacion: user.especializacion || '', otro_perfil: user.otro_perfil || '', subscription_plan: user.subscription_plan || 'plan1', profile_type: user.profile_type || 'individual', company_name: user.company_name || '', industry_tags: user.industry_tags || [], sub_industria_map: user.sub_industria_map || {}, rama_juridicas: user.rama_juridicas || [], sub_rama_map: user.sub_rama_map || {}, rangos: user.rangos || [], cobertura_legal: user.cobertura_legal || { fuentes: [], reguladores: [] }, etiquetas_personalizadas: user.etiquetas_personalizadas || {}, impact_analysis_limit: user.impact_analysis_limit || 0, extra_agentes: user.extra_agentes || 0, extra_fuentes: user.extra_fuentes || 0, payment_status: user.payment_status || '', stripe_customer_id: user.stripe_customer_id || '', stripe_subscription_id: user.stripe_subscription_id || '', billing_interval: user.billing_interval || 'monthly', registration_date: user.registration_date || '', purchased_items: user.purchased_items || [], limit_agentes: user.limit_agentes !== undefined ? user.limit_agentes : null, limit_fuentes: user.limit_fuentes !== undefined ? user.limit_fuentes : null, tipo_empresa: user.tipo_empresa || null, detalle_empresa: user.detalle_empresa || null, interes: user.interes || null, tamaño_empresa: user.tamaño_empresa || null, perfil_regulatorio: user.perfil_regulatorio || null, website_extraction_status: user.website_extraction_status || { success: true, error: null }
		});
		await client.close();
	} catch (error) {
		console.error('Error fetching current user:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// POST /api/update-user-data
router.post('/api/update-user-data', ensureAuthenticated, async (req, res) => {
	try {
		if (!req.body || Object.keys(req.body).length === 0) return res.status(400).json({ error: 'No data provided for update' });
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const database = client.db('papyrus');
		const usersCollection = database.collection('users');
		const allowedFields = ['etiquetas_personalizadas','cobertura_legal','rangos','accepted_email','limit_agentes','limit_fuentes','tipo_empresa','detalle_empresa','interes','tamaño_empresa','web','perfil_regulatorio','website_extraction_status'];
		const updateData = {};
		for (const field of allowedFields) { if (req.body[field] !== undefined) { updateData[field] = req.body[field]; } }
		if (Object.keys(updateData).length === 0) return res.status(400).json({ error: 'No valid fields provided for update' });
		const result = await usersCollection.updateOne({ _id: new ObjectId(req.user._id) }, { $set: updateData });
		if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
		const updatedUser = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
		await client.close();
		const response = {}; for (const field of Object.keys(updateData)) { response[field] = updatedUser[field]; }
		res.json({ success: true, message: 'User data updated successfully', updated_fields: response });
	} catch (error) {
		console.error('Error updating user data:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

module.exports = router; 