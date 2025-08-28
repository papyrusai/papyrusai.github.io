const { MongoClient, ObjectId } = require('mongodb');

// to avoid deprecation error (match app.js)
const mongodbOptions = {
	// Removidas las opciones deprecadas useNewUrlParser y useUnifiedTopology
};

const uri = process.env.DB_URI;

function getUserLimits(subscriptionPlan) {
	switch (subscriptionPlan) {
		case 'plan1':
			return {
				limit_agentes: 0,
				limit_fuentes: 0
			};
		case 'plan2':
			return {
				limit_agentes: 5,
				limit_fuentes: 3
			};
		case 'plan3':
			return {
				limit_agentes: 10,
				limit_fuentes: 10
			};
		case 'plan4':
			return {
				limit_agentes: null, // null means unlimited
				limit_fuentes: null  // null means unlimited
			};
		default:
			return {
				limit_agentes: 0,
				limit_fuentes: 0
			};
	}
}

async function processSpecialDomainUser(user) {
	// Create a new connection to check/create the special user.
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const database = client.db("papyrus");
		const usersCollection = database.collection("users");

		// Check if a special user exists with this email.
		const specialUser = await usersCollection.findOne({ email: user.email });
		if (specialUser) {
			return specialUser;
		} else {
			// Get user limits for plan2
			const userLimits = getUserLimits("plan2");

			// Create a new user with the special defaults.
			const specialDefaults = {
				email: user.email,
				cobertura_legal: {
					"Nacional y Europeo": ["BOE", "DOUE"],
					"Autonomico": ["BOA", "BOCM", "BOCYL", "BOJA", "BOPV"],
					"Reguladores": ["CNMV"]
				},
				profile_type: "Departamento conocimiento",
				company_name: "Cuatrecasas",
				subscription_plan: "plan2",
				limit_agentes: userLimits.limit_agentes,
				limit_fuentes: userLimits.limit_fuentes,
				etiquetas_cuatrecasas: [
					"Arbitraje Internacional",
					"Competencia",
					"Deporte y Entretenimiento",
					"Empresa y Derechos Humanos",
					"Energía e Infraestructura",
					"Farmacéutico y Sanitario",
					"Financiero",
					"Fiscalidad Contenciosa",
					"Fiscalidad Corporativa",
					"Fiscalidad Financiera",
					"Fiscalidad Indirecta",
					"Fondos",
					"Gobierno Corporativo y Compliance",
					"Inmobiliario y Urbanismo",
					"Laboral",
					"Litigación",
					"Mercado de Capitales",
					"Mercantil y M&A",
					"Penal",
					"Precios de Transferencia y Tax Governance",
					"Private Client & Wealth Management",
					"Private Equity",
					"Propiedad Intelectual, Industrial y Secretos",
					"Protección de Datos",
					"Público",
					"Reestructuraciones, Insolvencias y Situaciones Especiales",
					"Servicios Financieros y de Seguros",
					"Tecnologías y Medios Digitales",
					"Venture Capital"
				]
			};
			const result = await usersCollection.insertOne(specialDefaults);
			specialDefaults._id = result.insertedId;
			return specialDefaults;
		}
	} finally {
		await client.close();
	}
}

const etiquetasAandO = [
	"Chemicals",
	"Consumer and retail",
	"Communications, media and entertainment - Sports",
	"Communications, media and entertainment - Media",
	"Communications, media and entertainment - Telecommunications",
	"Energy - Oil and gas",
	"Energy - Hydrogen",
	"Energy - Carbon capture and storage",
	"Energy - Power",
	"Energy - Energy networks",
	"Energy - Nuclear",
	"Financial institutions - Banks",
	"Financial institutions - Insurance",
	"Financial institutions - Fintech",
	"Industrials and manufacturing - Automotive",
	"Industrials and manufacturing - Aerospace and defense",
	"Infrastructure and transport - Aviation",
	"Infrastructure and transport - Digital infrastructure",
	"Life sciences and healthcare",
	"Mining and metals",
	"Private capital - Family office",
	"Private capital - Infrastructure funds",
	"Private capital - Private credit",
	"Private capital - Private equity",
	"Private capital - Sovereign wealth and institutional investors",
	"Capital solutions",
	"Technology"
];

async function processAODomainUser(user) {
	// This is specifically for A&O
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const database = client.db("papyrus");
		const usersCollection = database.collection("users");

		// Check if the user already exists
		const aoUser = await usersCollection.findOne({ email: user.email });
		if (aoUser) {
			return aoUser;
		} else {
			// Get user limits for plan2
			const userLimits = getUserLimits("plan2");

			// Create a new user with A&O defaults
			// Notice how the property name in the DB is "etiquetas_ao"
			const specialDefaults = {
				email: user.email,
				cobertura_legal: {
					"Nacional y Europeo": ["BOE", "DOUE"],
					"Autonomico": ["BOA", "BOCM", "BOCYL", "BOJA", "BOPV"],
					"Reguladores": ["CNMV"]
				},
				profile_type: "Departamento conocimiento",
				company_name: "A&O", // or "Allen & Overy"
				subscription_plan: "plan2",
				limit_agentes: userLimits.limit_agentes,
				limit_fuentes: userLimits.limit_fuentes,
				etiquetas_ao: etiquetasAandO
			};

			const result = await usersCollection.insertOne(specialDefaults);
			specialDefaults._id = result.insertedId;
			return specialDefaults;
		}
	} finally {
		await client.close();
	}
}

function getDisplayName(userName, userEmail) {
	if (userName && userName.trim() !== '') {
		return userName;
	}
	if (userEmail && userEmail.includes('@')) {
		const emailPrefix = userEmail.split('@')[0];
		return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1).toLowerCase();
	}
	return '';
}

// === EMPRESA HELPERS ===
function extractDomainFromEmail(email) {
	if (typeof email !== 'string') return null;
	const atIdx = email.indexOf('@');
	if (atIdx === -1) return null;
	return email.slice(atIdx + 1).toLowerCase();
}

async function ensureEmpresaIndex(client) {
	const usersCollection = client.db('papyrus').collection('users');
	try {
		await usersCollection.createIndex(
			{ empresa: 1, tipo_cuenta: 1 },
			{
				name: 'unique_estructura_empresa_por_empresa',
				unique: true,
				partialFilterExpression: { tipo_cuenta: 'estructura_empresa' }
			}
		);
	} catch (_) {
		// ignore if already exists
	}
}

async function findEstructuraEmpresaByDomain(client, empresaDomain) {
	const usersCollection = client.db('papyrus').collection('users');
	return usersCollection.findOne({ tipo_cuenta: 'estructura_empresa', empresa: empresaDomain });
}

async function createEstructuraEmpresa(empresaDomain, adminUserId) {
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		await ensureEmpresaIndex(client);
		let estructura = await findEstructuraEmpresaByDomain(client, empresaDomain);
		if (estructura) return estructura;

		const now = new Date();
		const userLimits = getUserLimits('plan4');
		const adminId = adminUserId ? new ObjectId(String(adminUserId)) : null;
		const doc = {
			tipo_cuenta: 'estructura_empresa',
			empresa: empresaDomain,
			industry_tags: [],
			sub_industria_map: {},
			rama_juridicas: [],
			sub_rama_map: {},
			cobertura_legal: { fuentes_gobierno: [], fuentes_reguladores: [] },
			rangos: [],
			subscription_plan: 'plan4',
			limit_agentes: userLimits.limit_agentes,
			limit_fuentes: userLimits.limit_fuentes,
			impact_analysis_limit: -1,
			profile_type: 'empresa',
			company_name: '',
			web: '',
			detalle_empresa: {},
			interes: '',
			"tamaño_empresa": '',
			perfil_regulatorio: '',
			website_extraction_status: { success: true, error: null },
			etiquetas_personalizadas: {},
			estructura_carpetas: { folders: {}, asignaciones: {}, version: 1 },
			bloqueos_edicion: { agentes: {}, carpetas: {} },
			historial_agentes: [],
			historial_carpetas: [],
			created_at: now,
			updated_at: now,
			admin_principal_id: adminId
		};
		const result = await client.db('papyrus').collection('users').insertOne(doc);
		return { ...doc, _id: result.insertedId };
	} finally {
		await client.close();
	}
}

async function connectUserToEmpresa(userId, userEmail) {
	const client = new MongoClient(uri, mongodbOptions);
	try {
		await client.connect();
		const db = client.db('papyrus');
		const usersCollection = db.collection('users');
		const empresaDomain = extractDomainFromEmail(userEmail);
		if (!empresaDomain) return null;
		let estructura = await findEstructuraEmpresaByDomain(client, empresaDomain);
		if (!estructura) {
			// No crear aquí para no interferir con el flujo de onboarding
			return null;
		}
		// Si no hay admin asignado en la estructura, asignar este usuario como admin
		let isAdmin = false;
		if (!estructura.admin_principal_id) {
			const estructuraObjectId = (estructura._id && estructura._id instanceof ObjectId) ? estructura._id : new ObjectId(String(estructura._id));
			await usersCollection.updateOne(
				{ _id: estructuraObjectId },
				{ $set: { admin_principal_id: (userId instanceof ObjectId) ? userId : new ObjectId(String(userId)), updated_at: new Date() } }
			);
			isAdmin = true;
		} else {
			try {
				const currentUserObjectId = (userId instanceof ObjectId) ? userId : new ObjectId(String(userId));
				isAdmin = estructura.admin_principal_id && estructura.admin_principal_id.equals ? estructura.admin_principal_id.equals(currentUserObjectId) : (String(estructura.admin_principal_id) === String(currentUserObjectId));
			} catch (_) {
				isAdmin = String(estructura.admin_principal_id) === String(userId);
			}
		}
		// Solo asignar nuevo permiso si el usuario no tiene uno ya (primera vez)
		const userObjectId = (userId instanceof ObjectId) ? userId : new ObjectId(String(userId));
		const currentUser = await usersCollection.findOne({ _id: userObjectId });
		const permisoToAssign = currentUser && currentUser.tipo_cuenta === 'empresa' && currentUser.permiso
			? currentUser.permiso  // Mantener permiso existente
			: (isAdmin ? 'admin' : 'lectura'); // Solo asignar lectura por defecto si es primera vez

		const update = {
			$set: {
				tipo_cuenta: 'empresa',
				empresa: empresaDomain,
				estructura_empresa_id: estructura._id,
				permiso: permisoToAssign,
				admin_empresa_id: estructura.admin_principal_id || ((userId instanceof ObjectId) ? userId : new ObjectId(String(userId))),
				subscription_plan: 'plan4',
				limit_agentes: getUserLimits('plan4').limit_agentes,
				limit_fuentes: getUserLimits('plan4').limit_fuentes,
				updated_at: new Date()
			}
		};
		await usersCollection.updateOne({ _id: userObjectId }, update);
		return estructura;
	} finally {
		await client.close();
	}
}

module.exports = {
	getUserLimits,
	processSpecialDomainUser,
	processAODomainUser,
	getDisplayName,
	// Empresa helpers
	extractDomainFromEmail,
	ensureEmpresaIndex,
	createEstructuraEmpresa,
	connectUserToEmpresa,
}; 