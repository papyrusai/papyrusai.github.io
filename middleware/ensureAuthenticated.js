const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  // Check if this is an AJAX/API request
  if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.url.startsWith('/api/')) {
    return res.status(401).json({ 
      success: false, 
      error: 'No autenticado', 
      redirect: '/' 
    });
  }
  
  req.session.returnTo = req.originalUrl;
  return res.redirect('/');
};

module.exports = ensureAuthenticated; 