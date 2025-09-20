// middleware/analytics.middleware.js
// Tracking ligero: vistas de página y tiempo de sesión (logout)

const analyticsService = require('../services/analytics.service');

function trackPageView(req, res, next) {
  try {
    if (req.user && req.user._id) {
      analyticsService.trackEvent({
        userId: req.user._id,
        eventType: 'page_view',
        eventCategory: 'navigation',
        eventAction: req.path,
        metadata: { path: req.path, method: req.method, query: req.query },
        req
      }).catch(() => {});
    }
  } catch (_) {}
  next();
}

function sessionTimeTracker(req, res, next) {
  try {
    if (req.session && req.user) {
      if (!req.session.startTime) {
        req.session.startTime = new Date();
      }
      req.session.lastActivity = new Date();

      // Hook de logout: este middleware no intercepta /logout aquí, 
      // pero dejamos utilidad expuesta para ser usada en el endpoint de logout.
    }
  } catch (_) {}
  next();
}

module.exports = { trackPageView, sessionTimeTracker };


