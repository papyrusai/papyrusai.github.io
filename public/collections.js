/**************************************************************
 * collections.js
 **************************************************************/

/*loader*/
document.addEventListener("DOMContentLoaded", () => {
  // Hide the loader overlay once the page content is loaded
  const loaderOverlay = document.getElementById("pageLoaderOverlay");
  if (loaderOverlay) {
    loaderOverlay.style.display = "none";
  }
});


/*Cambiar suscripcion*/
document.getElementById('editIndustriesLink').addEventListener('click', function(e){
  e.preventDefault();
  // Navigate to the new page:
  window.location.href = '/suscripcion.html';
});

/*rellenar date value*/
document.addEventListener("DOMContentLoaded", () => { 
  // Get the startDate from the server-side rendered variable
  const startDateInput = JSON.parse(document.getElementById("startDateInput").textContent || '"2024-01-01T00:00:00.000Z"');
  
  // Format the startDateInput into yyyy-mm-dd format
  const formattedDate = new Date(startDateInput).toISOString().split('T')[0];
  
  // Set the startDate input field value
  const startDate = document.getElementById("startDate");
  if (formattedDate) {
    startDate.value = formattedDate;
  }
});


/*booleano features segun plan seleccionado*/
document.addEventListener("DOMContentLoaded", () => {
  const userPlan = JSON.parse(document.getElementById("userPlan").textContent || '"plan1"');
  const boletinCheckboxes = document.querySelectorAll('.filter-options input[type="checkbox"]');
  let banner;

  if (userPlan === 'plan1') {
    boletinCheckboxes.forEach((checkbox) => {
      if (checkbox.value !== 'BOE') {
        checkbox.disabled = true;
        checkbox.parentElement.style.opacity = '0.5';

        // Function to show the banner
        const showBanner = () => {
          if (!banner) {
            banner = document.createElement("div");
            banner.textContent = "Mejora tu suscripción para acceder a otros Boletines Oficiales";
            banner.style.cssText = `
              position: fixed;
              bottom: 10px;
              left: 50%;
              transform: translateX(-50%);
              background: #ffc107;
              color: #000;
              padding: 10px 20px;
              border-radius: 5px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
              z-index: 1000;
              text-align: center;
            `;

            const closeButton = document.createElement("span");
            closeButton.textContent = " ×";
            closeButton.style.cssText = `
              margin-left: 10px;
              cursor: pointer;
              font-weight: bold;
            `;

            closeButton.onclick = () => {
              if (banner) {
                banner.remove();
                banner = null; // Reset the banner reference
              }
            };

            banner.appendChild(closeButton);
            document.body.appendChild(banner);

            // Auto-hide the banner after 5 seconds (optional)
            setTimeout(() => {
              if (banner) {
                banner.remove();
                banner = null;
              }
            }, 1500);
          }
        };

        // Attach hover and click event listeners to the parent label
        checkbox.parentElement.addEventListener('mouseover', (e) => {
          e.preventDefault(); // Prevent unintended interaction
          showBanner();
        });

        checkbox.parentElement.addEventListener('click', (e) => {
          e.preventDefault(); // Prevent checkbox interaction
          showBanner();
        });
      }
    });
  }
});




window.addEventListener('DOMContentLoaded', function () {
  // --------------------- A) References to user data ---------------------
  let userIndustries = [];
  let userRamas = [];
  let userSubRamaMap = {};

  // 1) Load user industries from <script id="industryTags">
  const industryTagScript = document.getElementById('industryTags');
  if (industryTagScript) {
    userIndustries = JSON.parse(industryTagScript.textContent) || [];
  }

  // 2) Load user Ramas from <script id="ramaJuridicas">
  const ramaScript = document.getElementById('ramaJuridicas');
  if (ramaScript) {
    userRamas = JSON.parse(ramaScript.textContent) || [];
  }

  // 3) OPTIONAL: If you store sub-rama map in a hidden script, load it here:
  const subRamaMapScript = document.getElementById('userSubRamaMap');
  if (subRamaMapScript) {
    userSubRamaMap = JSON.parse(subRamaMapScript.textContent) || {};
  }
  // If you do not store sub-rama map in the backend, then remove or adapt.

  // --------------------- B) Variables ---------------------
  let selectedCollections = ['BOE']; // default

  // --------------------- C) Utility: updateSelectedCollections ---------------------
  function updateSelectedCollections() {
    const checked = document.querySelectorAll('input[name="boletin"]:checked');
    selectedCollections = Array.from(checked).map(ch => ch.value);
    if (selectedCollections.length === 0) {
      selectedCollections = ['BOE'];
    }
  }

  // --------------------- D) Utility: gather selected sub-ramas ---------------------
  function getSelectedSubRamas() {
    const checkedBoxes = document.querySelectorAll(
      '#subRamasCheckboxContainer input[type="checkbox"]:checked'
    );
    return Array.from(checkedBoxes).map(chk => chk.value);
  }

  // --------------------- E) Main fetch: sendSelectedOptions ---------------------
  async function sendSelectedOptions(desde, hasta) {
    try {
      // Show loaders
      document.getElementById('chartContainer').style.display = 'none';
      document.getElementById('loading-icon-chart').style.display = 'block';
      document.getElementById('loading-icon').style.display = 'block';

      // 1) Build collections param
      const colQuery = selectedCollections
        .map(c => `collections[]=${encodeURIComponent(c)}`)
        .join('&');

      // 2) Industry, Rama, from your selected spans
      const industryElem = document.getElementById('selectedIndustry');
      const industryVal = industryElem ? industryElem.textContent : 'Todas';

      const ramaElem = document.getElementById('selectedRama');
      const ramaVal = ramaElem ? ramaElem.textContent : 'Todas';

      // 3) Sub-ramas
      const subRamasArray = getSelectedSubRamas();

      // 4) Build final query
      const parts = [];
      if (colQuery) parts.push(colQuery);
      parts.push(`industry=${encodeURIComponent(industryVal)}`);
      parts.push(`rama=${encodeURIComponent(ramaVal)}`);
      if (subRamasArray.length > 0) {
        parts.push(`subRamas=${encodeURIComponent(subRamasArray.join(','))}`);
      }
      if (desde) parts.push(`desde=${encodeURIComponent(desde)}`);
      if (hasta) parts.push(`hasta=${encodeURIComponent(hasta)}`);

      const finalQuery = parts.join('&');
      const url = `/data?${finalQuery}`;

      // 5) Fetch
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      // 6) Insert HTML
      const data = await response.json();
      document.querySelector('.collectionDocs').innerHTML = data.documentsHtml || '';

      // 7) If we have months & counts => update chart
      if (data.months && data.counts) {
        loadChart(data.months, data.counts);
      }
    } catch (error) {
      console.error('Error sending selected options:', error);
    } finally {
      // Hide loaders
      document.getElementById('loading-icon').style.display = 'none';
      document.getElementById('loading-icon-chart').style.display = 'none';
      document.getElementById('chartContainer').style.display = 'block';
    }
  }

  // --------------------- F) Expose handleBuscar ---------------------
  window.handleBuscar = function () {
    updateSelectedCollections();
    const desde = document.getElementById('startDate').value;
    const hasta = document.getElementById('endDate').value;
    sendSelectedOptions(desde, hasta);
  };

  // ===========================================================
  //       G) Industry Dropdown: add "Todas" + userIndustries
  // ===========================================================
  function populateIndustryDropdown() {
    const dropdownContent = document.getElementById('myDropdown');
    if (!dropdownContent) return;

    dropdownContent.innerHTML = ''; // Clear
    // (1) "Todas"
    const linkTodas = document.createElement('a');
    linkTodas.href = '#';
    linkTodas.textContent = 'Todas';
    linkTodas.addEventListener('click', event => {
      event.preventDefault();
      document.getElementById('selectedIndustry').textContent = 'Todas';
      dropdownContent.classList.remove('show');
    });
    dropdownContent.appendChild(linkTodas);

    // (2) userIndustries
    userIndustries.forEach(tag => {
      const industryLink = document.createElement('a');
      industryLink.href = '#';
      industryLink.textContent = tag;
      industryLink.addEventListener('click', function (event) {
        event.preventDefault();
        document.getElementById('selectedIndustry').textContent = tag;
        dropdownContent.classList.remove('show');
      });
      dropdownContent.appendChild(industryLink);
    });

    // By default => "Todas"
    document.getElementById('selectedIndustry').textContent = 'Todas';
  }

  // Toggles the Industry dropdown
  window.myFunction = function() {
    const drop = document.getElementById('myDropdown');
    if (!drop) return;
    drop.classList.toggle('show');
  };

  // ===========================================================
  //       H) Rama Dropdown: add "Todas" + userRamas
  // ===========================================================
  function populateRamaDropdown() {
    const ramaDropdown = document.getElementById('ramaDropdown');
    if (!ramaDropdown) return;

    ramaDropdown.innerHTML = '';

    // (1) "Todas"
    const aTodas = document.createElement('a');
    aTodas.href = '#';
    aTodas.textContent = 'Todas';
    aTodas.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('selectedRama').textContent = 'Todas';
      ramaDropdown.style.display = 'none';
      // Hide sub-ramas container
      document.getElementById('subRamasCheckboxContainer').innerHTML = '';
      document.getElementById('subRamasCheckboxContainer').style.display = 'none';
    });
    ramaDropdown.appendChild(aTodas);

    // (2) userRamas
    userRamas.forEach(rama => {
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = rama;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('selectedRama').textContent = rama;
        ramaDropdown.style.display = 'none';
        fillSubRamas(rama);
      });
      ramaDropdown.appendChild(link);
    });

    // By default => "Todas"
    document.getElementById('selectedRama').textContent = 'Todas';
  }

  window.toggleRamaDropdown = function() {
    const d = document.getElementById('ramaDropdown');
    if (!d) return;
    d.style.display = (d.style.display === 'block') ? 'none' : 'block';
  };

  // ===========================================================
  //       I) fillSubRamas from userSubRamaMap
  // ===========================================================
  function fillSubRamas(ramaName) {
    const container = document.getElementById('subRamasCheckboxContainer');
    if (!container) return;
    container.innerHTML = '';

    // If user picks "Todas", just hide
    if (ramaName === 'Todas') {
      container.style.display = 'none';
      return;
    }

    // Show container
    container.style.display = 'block';

    // Grab the array from userSubRamaMap
    const subList = userSubRamaMap[ramaName] || [];
    if (subList.length === 0) {
      container.innerHTML = '<i>No hay sub-ramas para esta rama</i>';
      return;
    }

    subList.forEach(sub => {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.marginBottom = '5px';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = sub;
      checkbox.style.marginRight = '8px';

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(sub));
      container.appendChild(label);
    });
  }

  // ===========================================================
  //       J) Initialize
  // ===========================================================
  populateIndustryDropdown();
  populateRamaDropdown();

  // Close the "myDropdown" if user clicks outside
  window.addEventListener('click', function(e) {
    if (!e.target.matches('.dropbtn')) {
      const dd = document.getElementById('myDropdown');
      if (dd && dd.classList.contains('show')) {
        dd.classList.remove('show');
      }
    }
  });
});
