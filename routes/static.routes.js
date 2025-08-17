/*
Routes: Serves static HTML pages and views for the app (some protected by auth).
Endpoints:
- GET '/' and '/index.html': serve main index.html
- GET '/multistep.html', '/paso1.html': gated onboarding pages
- GET '/onboarding/paso0.html', '/onboarding/paso4.html': onboarding steps (protected)
- GET '/profile.html': profile shell HTML (protected)
- GET '/views/analisis/norma.html': analysis view (protected)
- GET '/consultas_publicas.html': consultas públicas view (protected)
- GET '/reset-password.html', '/feedback.html', '/suscripcion_email.html': feature pages
- GET '/views/tuslistas/textEditor.js': static JS for lists editor (protected)
*/
const express = require('express');
const path = require('path');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');

const router = express.Router();

router.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'index.html'));
});

router.get('/multistep.html', ensureAuthenticated, (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'public', 'multistep.html'));
});

router.get('/paso1.html', ensureAuthenticated, (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'public', 'paso1.html'));
});

router.get('/onboarding/paso0.html', ensureAuthenticated, (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'public', 'onboarding', 'paso0.html'));
});

router.get('/onboarding/paso4.html', ensureAuthenticated, (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'public', 'onboarding', 'paso4.html'));
});

router.get('/views/tuslistas/textEditor.js', ensureAuthenticated, (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'public', 'views', 'tuslistas', 'textEditor.js'));
});

router.get('/profile.html', ensureAuthenticated, (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'public', 'profile.html'));
});

router.get('/features/suscripcion.html', ensureAuthenticated, (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'public', 'features', 'suscripcion.html'));
});

router.get('/views/analisis/norma.html', ensureAuthenticated, (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'public', 'views', 'analisis', 'norma.html'));
});

router.get('/consultas_publicas.html', ensureAuthenticated, (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'public', 'views', 'consultas_publicas', 'consultas_publicas.html'));
});

router.get('/reset-password.html', (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'public', 'features', 'reset-password.html'));
});

router.get('/feedback.html', (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'public', 'features', 'feedback.html'));
});

router.get('/suscripcion_email.html', (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'public', 'features', 'suscripcion_email.html'));
});

module.exports = router; 