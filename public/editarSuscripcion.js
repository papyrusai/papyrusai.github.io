// Add this to your main JS file (e.g., profile.js)
document.addEventListener('DOMContentLoaded', function() {
    const editSubscriptionBtn = document.getElementById('editSuscription');
    if (editSubscriptionBtn) {
      editSubscriptionBtn.addEventListener('click', function(e) {
        e.preventDefault();
        redirectToEditOnboarding();
      });
    }
  });
  
  async function redirectToEditOnboarding() {
    // Create overlay with loader
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(255, 255, 255, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    `;
    
    const loader = document.createElement('div');
    loader.className = 'loader';
    loader.style.cssText = `
      border: 5px solid #f3f3f3;
      border-top: 5px solid #3498db;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 2s linear infinite;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    
    document.head.appendChild(style);
    overlay.appendChild(loader);
    document.body.appendChild(overlay);
    
    try {
      // Fetch user data
      const response = await fetch('/api/current-user-details');
      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }
      
      const userData = await response.json();
      
      // Store the data in sessionStorage to be used in onboarding steps
      sessionStorage.setItem('userData', JSON.stringify({
        nombre: userData.name,
        cargo: userData.perfil_profesional,
        webEmpresa: userData.web,
        linkedin: userData.linkedin,
        especializacion: userData.especializacion,
        otro_perfil: userData.otro_perfil,
        fuentes: userData.cobertura_legal["fuentes-gobierno"] || [],
        reguladores: userData.cobertura_legal["fuentes-reguladores"] || []
      }));
      
      // Store etiquetas for step3
      sessionStorage.setItem('etiquetasRecomendadas', JSON.stringify({
        industrias: userData.industry_tags || [],
        ramas_juridicas: userData.rama_juridicas || [],
        subramas_juridicas: userData.sub_rama_map || {},
        rangos_normativos: userData.rangos || []
      }));
      
      // Store plan info for step4
      sessionStorage.setItem('subscription_plan', userData.subscription_plan || 'plan1');
      sessionStorage.setItem('profile_type', userData.profile_type || 'individual');
      sessionStorage.setItem('company_name', userData.company_name || '');
      
      // Flag that we're editing rather than a new onboarding
      sessionStorage.setItem('isEditing', 'true');
      
      // Redirect to step3
      window.location.href = '/paso3.html';
      
    } catch (error) {
      console.error('Error fetching user data:', error);
      alert('Error loading subscription data. Please try again.');
      document.body.removeChild(overlay);
    }
  }
  