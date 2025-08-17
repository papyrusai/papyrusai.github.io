const { MongoClient } = require('mongodb');

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

module.exports = {
	getUserLimits,
	processSpecialDomainUser,
	processAODomainUser,
	getDisplayName,
}; 