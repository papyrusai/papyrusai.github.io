/*
Routes: Billing and subscription management (Stripe and plan updates)
Endpoints:
- GET '/api-key': returns Perplexity API key (legacy use)
- POST '/create-checkout-session' (auth): creates Stripe Checkout session
- POST '/save-free-plan' (auth): saves free plan data and sends confirmation email
- POST '/update-subscription' (auth): updates subscription data in DB
- POST '/save-same-plan2' (auth): updates data when staying on plan2
- POST '/cancel-plan2' (auth): cancels plan2 on Stripe and updates DB
- POST '/api/cancel-subscription' (auth): cancels current subscription and downgrades to plan1
*/
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const path = require('path');

// Reuse dependencies from app environment
const stripe = require('stripe')(process.env.STRIPE);
const BASE_URL = process.env.BASE_URL || 'https://app.reversa.ai';
const { getUserLimits } = require('../services/users.service');
const { sendSubscriptionEmail } = require('../services/email.service');

const router = express.Router();
const uri = process.env.DB_URI;
const mongodbOptions = {};

// GET /api-key (legacy)
router.get('/api-key', (req, res) => {
	res.json({ apiKey: process.env.API_KEY_PERPLEXITY });
});

// POST /create-checkout-session
router.post('/create-checkout-session', ensureAuthenticated, async (req, res) => {
	console.log('[create-checkout-session] Starting session creation...');
	console.log('[create-checkout-session] User authenticated:', !!req.user);
	console.log('[create-checkout-session] User ID:', req.user ? req.user._id : 'NO USER');
	console.log('[create-checkout-session] User email:', req.user ? req.user.email : 'NO EMAIL');

	const {
		plan,
		billingInterval,
		extra_agentes,
		extra_fuentes,
		impact_analysis_limit,
		industry_tags,
		sub_industria_map,
		rama_juridicas,
		profile_type,
		sub_rama_map,
		cobertura_legal,
		company_name,
		name,
		web,
		linkedin,
		perfil_profesional,
		rangos,
		feedback,
		etiquetas_personalizadas,
		isTrial
	} = req.body;

	console.log('[create-checkout-session] Request body plan:', plan);
	console.log('[create-checkout-session] Request body billingInterval:', billingInterval);

	try {
		const basePrices = {
			plan1: { monthly: 0, annual: 0 },
			plan2: { monthly: 5600, annual: 54000 },
			plan3: { monthly: 7000, annual: 67200 },
			plan4: { monthly: 0, annual: 0 },
		};
		const extraPrices = {
			agentes: { monthly: 2000, annual: 24000 },
			fuentes: { monthly: 1500, annual: 18000 },
		};
		if (!basePrices[plan]) {
			return res.status(400).json({ error: 'Invalid plan selected' });
		}
		const interval = billingInterval === 'annual' ? 'annual' : 'monthly';
		const lineItems = [];
		if (plan !== 'plan4') {
			lineItems.push({
				price_data: {
					currency: 'eur',
					product_data: {
						name: `Plan ${plan === 'plan1' ? 'Free' : plan === 'plan2' ? 'Starter' : 'Pro'} (${interval === 'annual' ? 'Anual' : 'Mensual'})`,
						tax_code: 'txcd_10000000',
					},
					unit_amount: basePrices[plan][interval],
					tax_behavior: 'exclusive',
					recurring: { interval: interval === 'annual' ? 'year' : 'month' },
				},
				quantity: 1,
			});
		} else {
			return res.json({ redirectUrl: 'https://cal.com/tomasburgaleta/30min', isEnterprise: true });
		}
		const numExtraAgentes = parseInt(extra_agentes) || 0;
		if (numExtraAgentes > 0) {
			lineItems.push({
				price_data: {
					currency: 'eur',
					product_data: { name: `Extra de 12 agentes personalizados (${interval === 'annual' ? 'Anual' : 'Mensual'})`, tax_code: 'txcd_10000000' },
					unit_amount: extraPrices.agentes[interval],
					tax_behavior: 'exclusive',
					recurring: { interval: interval === 'annual' ? 'year' : 'month' },
				},
				quantity: 1,
			});
		}
		const numExtraFuentes = parseInt(extra_fuentes) || 0;
		if (numExtraFuentes > 0) {
			lineItems.push({
				price_data: {
					currency: 'eur',
					product_data: { name: `Extra de ${numExtraFuentes} fuentes oficiales (${interval === 'annual' ? 'Anual' : 'Mensual'})`, tax_code: 'txcd_10000000' },
					unit_amount: extraPrices.fuentes[interval] * numExtraFuentes,
					tax_behavior: 'exclusive',
					recurring: { interval: interval === 'annual' ? 'year' : 'month' },
				},
				quantity: 1,
			});
		}
		const metadataChunks = {};
		metadataChunks.plan = plan;
		metadataChunks.billing_interval = interval;
		metadataChunks.extra_agentes = String(extra_agentes ?? '0');
		metadataChunks.extra_fuentes = String(extra_fuentes ?? '0');
		metadataChunks.impact_analysis_limit = String(impact_analysis_limit ?? '0');
		metadataChunks.profile_type = profile_type;
		metadataChunks.company_name = company_name;
		metadataChunks.name = name;
		metadataChunks.web = web;
		metadataChunks.linkedin = linkedin;
		metadataChunks.perfil_profesional = perfil_profesional;
		const industryTagsStr = JSON.stringify(industry_tags);
		if (industryTagsStr.length <= 500) metadataChunks.industry_tags = industryTagsStr; else {
			const chunks = Math.ceil(industryTagsStr.length / 450);
			for (let i = 0; i < chunks; i++) metadataChunks[`industry_tags_${i}`] = industryTagsStr.substring(i * 450, (i + 1) * 450);
			metadataChunks.industry_tags_chunks = chunks.toString();
		}
		const subIndustriaMapStr = JSON.stringify(sub_industria_map);
		if (subIndustriaMapStr.length <= 500) metadataChunks.sub_industria_map = subIndustriaMapStr; else {
			const chunks = Math.ceil(subIndustriaMapStr.length / 450);
			for (let i = 0; i < chunks; i++) metadataChunks[`sub_industria_map_${i}`] = subIndustriaMapStr.substring(i * 450, (i + 1) * 450);
			metadataChunks.sub_industria_map_chunks = chunks.toString();
		}
		const ramaJuridicasStr = JSON.stringify(rama_juridicas);
		if (ramaJuridicasStr.length <= 500) metadataChunks.rama_juridicas = ramaJuridicasStr; else {
			const chunks = Math.ceil(ramaJuridicasStr.length / 450);
			for (let i = 0; i < chunks; i++) metadataChunks[`rama_juridicas_${i}`] = ramaJuridicasStr.substring(i * 450, (i + 1) * 450);
			metadataChunks.rama_juridicas_chunks = chunks.toString();
		}
		const subRamaMapStr = JSON.stringify(sub_rama_map);
		if (subRamaMapStr.length <= 500) metadataChunks.sub_rama_map = subRamaMapStr; else {
			const chunks = Math.ceil(subRamaMapStr.length / 450);
			for (let i = 0; i < chunks; i++) metadataChunks[`sub_rama_map_${i}`] = subRamaMapStr.substring(i * 450, (i + 1) * 450);
			metadataChunks.sub_rama_map_chunks = chunks.toString();
		}
		const coberturaLegalStr = JSON.stringify(cobertura_legal);
		if (coberturaLegalStr.length <= 500) metadataChunks.cobertura_legal = coberturaLegalStr; else {
			const chunks = Math.ceil(coberturaLegalStr.length / 450);
			for (let i = 0; i < chunks; i++) metadataChunks[`cobertura_legal_${i}`] = coberturaLegalStr.substring(i * 450, (i + 1) * 450);
			metadataChunks.cobertura_legal_chunks = chunks.toString();
		}
		const rangosStr = JSON.stringify(rangos);
		if (rangosStr.length <= 500) metadataChunks.rangos = rangosStr; else {
			const chunks = Math.ceil(rangosStr.length / 450);
			for (let i = 0; i < chunks; i++) metadataChunks[`rangos_${i}`] = rangosStr.substring(i * 450, (i + 1) * 450);
			metadataChunks.rangos_chunks = chunks.toString();
		}
		const feedbackStr = JSON.stringify(feedback);
		if (feedbackStr.length <= 500) metadataChunks.feedback = feedbackStr; else {
			const chunks = Math.ceil(feedbackStr.length / 450);
			for (let i = 0; i < chunks; i++) metadataChunks[`feedback_${i}`] = feedbackStr.substring(i * 450, (i + 1) * 450);
			metadataChunks.feedback_chunks = chunks.toString();
		}
		const etiquetasPersonalizadasStr = JSON.stringify(etiquetas_personalizadas);
		if (etiquetasPersonalizadasStr.length <= 500) metadataChunks.etiquetas_personalizadas = etiquetasPersonalizadasStr; else {
			const chunks = Math.ceil(etiquetasPersonalizadasStr.length / 450);
			for (let i = 0; i < chunks; i++) metadataChunks[`etiquetas_personalizadas_${i}`] = etiquetasPersonalizadasStr.substring(i * 450, (i + 1) * 450);
			metadataChunks.etiquetas_personalizadas_chunks = chunks.toString();
		}
		if (req.user && req.user._id) {
			metadataChunks.user_id = req.user._id.toString();
			console.log('[create-checkout-session] User ID saved to metadata:', metadataChunks.user_id);
		} else {
			console.error('[create-checkout-session] ERROR: No user or user._id available to save to metadata!');
			console.error('[create-checkout-session] req.user:', req.user);
			return res.status(401).json({ error: 'User not authenticated' });
		}
		let subscriptionData = {};
		if (isTrial) subscriptionData = { trial_period_days: 15 };
		console.log('[create-checkout-session] Metadata chunks to be saved:');
		console.log('[create-checkout-session] user_id:', metadataChunks.user_id);
		console.log('[create-checkout-session] plan:', metadataChunks.plan);
		console.log('[create-checkout-session] Total metadata keys:', Object.keys(metadataChunks).length);
		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			line_items: lineItems,
			mode: 'subscription',
			subscription_data: subscriptionData,
			locale: 'es',
			automatic_tax: { enabled: true },
			tax_id_collection: { enabled: true },
			metadata: metadataChunks,
			success_url: `${BASE_URL}/save-user?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${BASE_URL}/views/onboarding/paso0.html`,
		});
		console.log('[create-checkout-session] Stripe session created successfully');
		console.log('[create-checkout-session] Session ID:', session.id);
		console.log('[create-checkout-session] Session metadata saved:', session.metadata ? 'YES' : 'NO');
		res.json({ sessionId: session.id });
	} catch (error) {
		console.error('Error creating Checkout Session:', error);
		res.status(500).json({ error: 'Failed to create Checkout Session' });
	}
});

// POST /save-free-plan
router.post('/save-free-plan', ensureAuthenticated, async (req, res) => {
	const {
		plan,
		industry_tags,
		sub_industria_map,
		rama_juridicas,
		profile_type,
		sub_rama_map,
		cobertura_legal,
		company_name,
		name,
		web,
		linkedin,
		perfil_profesional,
		rangos,
		feedback,
		etiquetas_personalizadas,
		promotion_code,
		extra_agentes,
		extra_fuentes,
	} = req.body;
	if (!req.user) { return res.status(401).send('Unauthorized'); }
	try {
		const currentDate = new Date();
		const yyyy = currentDate.getFullYear();
		const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
		const dd = String(currentDate.getDate()).padStart(2, '0');
		const formattedDate = `${yyyy}-${mm}-${dd}`;
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const db = client.db('papyrus');
		const usersCollection = db.collection('users');
		let impactAnalysisLimit = 0;
		if (plan === 'plan2') impactAnalysisLimit = 50; else if (plan === 'plan3') impactAnalysisLimit = 500; else if (plan === 'plan4') impactAnalysisLimit = -1;
		const userLimits = getUserLimits(plan);
		const userData = {
			industry_tags,
			sub_industria_map,
			rama_juridicas,
			sub_rama_map,
			subscription_plan: plan,
			profile_type,
			cobertura_legal,
			company_name,
			name,
			web,
			linkedin,
			perfil_profesional,
			rangos,
			feedback_login: feedback,
			registration_date: formattedDate,
			registration_date_obj: currentDate,
			etiquetas_personalizadas,
			promotion_code: promotion_code || 'no',
			impact_analysis_limit: impactAnalysisLimit,
			extra_agentes: parseInt(extra_agentes || '0'),
			extra_fuentes: parseInt(extra_fuentes || '0'),
			payment_status: promotion_code === 'yes' ? 'promotion_approved' : 'free_plan',
			limit_agentes: userLimits.limit_agentes,
			limit_fuentes: userLimits.limit_fuentes,
		};
		await usersCollection.updateOne({ _id: new ObjectId(req.user._id) }, { $set: userData }, { upsert: true });
		await sendSubscriptionEmail(req.user, userData);
		await client.close();
		res.json({ redirectUrl: '/profile?view=configuracion' });
	} catch (error) {
		console.error('Error saving free plan data:', error);
		res.status(500).send('Error saving user data');
	}
});

// POST /update-subscription
router.post('/update-subscription', ensureAuthenticated, async (req, res) => {
	const {
		plan,
		industry_tags,
		sub_industria_map,
		rama_juridicas,
		profile_type,
		sub_rama_map,
		cobertura_legal,
		company_name,
		name,
		web,
		linkedin,
		perfil_profesional,
		especializacion,
		otro_perfil,
		rangos,
		feedback,
		etiquetas_personalizadas,
	} = req.body;
	if (!req.user) { return res.status(401).send('Unauthorized'); }
	try {
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const db = client.db('papyrus');
		const usersCollection = db.collection('users');
		const userLimits = getUserLimits(plan);
		await usersCollection.updateOne({ _id: new ObjectId(req.user._id) }, {
			$set: {
				industry_tags,
				rama_juridicas,
				subscription_plan: plan,
				profile_type,
				sub_industria_map,
				sub_rama_map,
				cobertura_legal,
				company_name,
				name,
				web,
				linkedin,
				perfil_profesional,
				especializacion,
				otro_perfil,
				rangos,
				feedback_login: feedback,
				subscription_updated_at: new Date(),
				etiquetas_personalizadas,
				limit_agentes: userLimits.limit_agentes,
				limit_fuentes: userLimits.limit_fuentes,
			},
		});
		await client.close();
		res.json({ redirectUrl: '/profile?view=configuracion', message: 'Subscription updated successfully' });
	} catch (error) {
		console.error('Error updating subscription:', error);
		res.status(500).send('Error updating subscription');
	}
});

// POST /save-same-plan2
router.post('/save-same-plan2', ensureAuthenticated, async (req, res) => {
	const { plan, industry_tags, rama_juridicas, profile_type, sub_rama_map, cobertura_legal, company_name } = req.body;
	if (!req.user) { return res.status(401).send('Unauthorized'); }
	try {
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const db = client.db('papyrus');
		const usersCollection = db.collection('users');
		const userLimits = getUserLimits(plan);
		await usersCollection.updateOne({ _id: new ObjectId(req.user._id) }, {
			$set: {
				industry_tags,
				rama_juridicas,
				subscription_plan: plan,
				profile_type,
				sub_rama_map,
				cobertura_legal,
				company_name,
				limit_agentes: userLimits.limit_agentes,
				limit_fuentes: userLimits.limit_fuentes,
			},
		}, { upsert: true });
		res.json({ redirectUrl: '/profile?view=configuracion' });
	} catch (error) {
		console.error('Error saving same plan2 data:', error);
		res.status(500).send('Error saving user data');
	}
});

// POST /cancel-plan2
router.post('/cancel-plan2', ensureAuthenticated, async (req, res) => {
	const { plan, industry_tags, rama_juridicas, sub_rama_map } = req.body;
	if (!req.user) { return res.status(401).send('Unauthorized: No logged-in user'); }
	let subscriptionId = null;
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const db = client.db('papyrus');
		const usersCollection = db.collection('users');
		const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
		if (!user) { return res.status(404).json({ error: 'User not found' }); }
		subscriptionId = user.stripe_subscription_id;
		if (subscriptionId) {
			try { await stripe.subscriptions.cancel(subscriptionId); } catch (error) { console.error('Error cancelling subscription in Stripe', error); }
		}
		const userLimits = getUserLimits(plan);
		await usersCollection.updateOne({ _id: new ObjectId(req.user._id) }, { $set: {
			subscription_plan: 'plan1',
			industry_tags,
			rama_juridicas,
			sub_rama_map,
			limit_agentes: userLimits.limit_agentes,
			limit_fuentes: userLimits.limit_fuentes,
			payment_status: 'canceled',
		}}, { upsert: true });
		res.json({ redirectUrl: '/profile?view=configuracion', message: 'Subscription canceled and downgraded' });
	} catch (error) {
		console.error('Error canceling plan2:', error);
		res.status(500).send('Error canceling plan2');
	} finally {
		await client.close();
	}
});

// POST /api/cancel-subscription
router.post('/api/cancel-subscription', ensureAuthenticated, async (req, res) => {
	const { cancel_stripe_subscription, billing_interval, rangos = [], cobertura_legal = {}, etiquetas_personalizadas = {} } = req.body;
	const user = req.user;
	if (!user) {
		return res.status(401).json({ success: false, error: 'Unauthorized' });
	}
	try {
		const client = new MongoClient(uri, mongodbOptions);
		await client.connect();
		const db = client.db('papyrus');
		const usersCollection = db.collection('users');
		const currentUser = await usersCollection.findOne({ _id: new ObjectId(user._id) });
		if (cancel_stripe_subscription && currentUser.stripe_subscription_id) {
			try {
				await stripe.subscriptions.cancel(currentUser.stripe_subscription_id, { prorate: true });
				console.log(`Suscripción ${currentUser.stripe_subscription_id} cancelada en Stripe`);
			} catch (stripeError) {
				console.error('Error al cancelar suscripción en Stripe:', stripeError);
			}
		}
		const currentDate = new Date();
		const yyyy = currentDate.getFullYear();
		const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
		const dd = String(currentDate.getDate()).padStart(2, '0');
		const formattedDate = `${yyyy}-${mm}-${dd}`;
		const userLimits = getUserLimits('plan1');
		const updateData = {
			subscription_plan: 'plan1',
			billing_interval: billing_interval || 'suscripción cancelada',
			rangos: rangos || [],
			cobertura_legal: cobertura_legal || { 'fuentes-gobierno': [], 'fuentes-reguladores': [] },
			etiquetas_personalizadas: etiquetas_personalizadas || {},
			cancellation_date: formattedDate,
			cancellation_date_obj: currentDate,
			payment_status: 'canceled',
			extra_agentes: 0,
			extra_fuentes: 0,
			impact_analysis_limit: 0,
			limit_agentes: userLimits.limit_agentes,
			limit_fuentes: userLimits.limit_fuentes,
		};
		await usersCollection.updateOne({ _id: new ObjectId(user._id) }, { $set: updateData });
		await client.close();
		res.status(200).json({ success: true, message: 'Suscripción cancelada correctamente', user: { ...updateData, _id: user._id, email: user.email } });
	} catch (error) {
		console.error('Error al cancelar suscripción:', error);
		res.status(500).json({ success: false, error: 'Error al cancelar la suscripción', details: error.message });
	}
});

module.exports = router; 