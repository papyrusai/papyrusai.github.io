/*
 * dropdown.js
 * This file handles:
 * 1) The Sector Económico dropdown (#myDropdown)
 * 2) The Rama Jurídica dropdown (#ramaDropdown)
 * 3) Sub-ramas checkboxes in #subRamasCheckboxContainer
 *
 * The functions toggleIndustryDropdown() and toggleRamaDropdown() are
 * exposed globally so the HTML buttons can call them. 
 */

document.addEventListener("DOMContentLoaded", function() {
  //========================== SECTOR ECONOMICO ==========================
  const industryTags = JSON.parse(document.getElementById('industryTags').textContent || '[]');
  const selectedIndustrySpan = document.getElementById('selectedIndustry');
  const industryDropdown = document.getElementById("myDropdown");

  // Fill the industry dropdown
  function populateIndustryDropdown() {
    if (!industryDropdown) return;

    industryDropdown.innerHTML = ''; // clear previous

    // Add "Todas"
    const linkAll = document.createElement('a');
    linkAll.href = '#';
    linkAll.textContent = 'Todas';
    linkAll.addEventListener('click', function(e) {
      e.preventDefault();
      selectedIndustrySpan.textContent = 'Todas';
      industryDropdown.classList.remove('show');
    });
    industryDropdown.appendChild(linkAll);

    // If user has no industry tags:
    if (industryTags.length === 0) {
      const noIndustryMsg = document.createElement('a');
      noIndustryMsg.textContent = "No hay industrias seleccionadas";
      noIndustryMsg.href = '#';
      noIndustryMsg.addEventListener('click', function(e) {
        e.preventDefault();
        selectedIndustrySpan.textContent = "Seleccione Industria";
        industryDropdown.classList.remove('show');
      });
      industryDropdown.appendChild(noIndustryMsg);
      // default button text
      selectedIndustrySpan.textContent = "Seleccione Industria";
      return;
    }

    // Add each industry option
    industryTags.forEach(tag => {
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = tag;
      a.addEventListener('click', function(e) {
        e.preventDefault();
        selectedIndustrySpan.textContent = tag;
        industryDropdown.classList.remove('show');
      });
      industryDropdown.appendChild(a);
    });

    // Set default selection
    if (!selectedIndustrySpan.textContent || selectedIndustrySpan.textContent === 'Cargando...') {
      selectedIndustrySpan.textContent = industryTags[0];
    }
  }

  // Toggle the display of #myDropdown
  window.toggleIndustryDropdown = function() {
    if (!industryDropdown) return;
    industryDropdown.classList.toggle("show");
  };

  //========================== RAMA JURIDICA ==========================
  const ramaDropdown = document.getElementById('ramaDropdown');
  const selectedRamaSpan = document.getElementById('selectedRama');

  // Hard-coded or server-provided array of Ramas
  const allRamas = JSON.parse(document.getElementById('ramaJuridicas').textContent || '[]');

  // If you want a fallback if that array is empty, you can define it:
  // const fallbackRamas = ["Derecho Civil", "Derecho Mercantil", ...];
  // if (allRamas.length === 0) allRamas = fallbackRamas;

  // Fill the rama dropdown
  function populateRamaDropdown() {
    if (!ramaDropdown) return;
    ramaDropdown.innerHTML = '';

    // "Todas" entry
    const aTodas = document.createElement('a');
    aTodas.href = '#';
    aTodas.textContent = 'Todas';
    aTodas.addEventListener('click', function(e) {
      e.preventDefault();
      selectedRamaSpan.textContent = 'Todas';
      ramaDropdown.classList.remove('show');

      // Hide the sub-ramas container
      const subRamasContainer = document.getElementById('subRamasCheckboxContainer');
      subRamasContainer.innerHTML = '';
      subRamasContainer.style.display = 'none';
    });
    ramaDropdown.appendChild(aTodas);

    // Add each rama entry
    allRamas.forEach(rama => {
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = rama;
      a.addEventListener('click', function(e) {
        e.preventDefault();
        selectedRamaSpan.textContent = rama;
        ramaDropdown.classList.remove('show');
        // fill subramas
        fillSubRamas(rama);
      });
      ramaDropdown.appendChild(a);
    });

    // Default: "Todas"
    if (!selectedRamaSpan.textContent || selectedRamaSpan.textContent === 'Todas') {
      selectedRamaSpan.textContent = 'Todas';
    }
  }

  // Expose a global function to toggle the Rama dropdown
  window.toggleRamaDropdown = function() {
    if (!ramaDropdown) return;
    ramaDropdown.classList.toggle("show");
  };

  //========================== SUB-RAMAS ==========================
  // If you are storing a userSubRamaMap in your HTML, parse it:
  let userSubRamaMapData = {};
  try {
    userSubRamaMapData = JSON.parse(document.getElementById('userSubRamaMap').textContent || '{}');
  } catch(e) {
    console.warn('No or invalid userSubRamaMap data found.');
  }

  function fillSubRamas(ramaName) {
    const container = document.getElementById('subRamasCheckboxContainer');
    if (!container) return;
    container.innerHTML = '';

    // If user picks "Todas", hide subramas
    if (ramaName === 'Todas') {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    // Attempt to retrieve sub-ramas from userSubRamaMapData
    const subList = userSubRamaMapData[ramaName] || [];
    if (subList.length === 0) {
      container.innerHTML = '<i>No hay sub-ramas para esta rama</i>';
      return;
    }

    // Build checkboxes for each subrama
    subList.forEach(sub => {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.marginBottom = '5px';
      label.style.cursor = 'pointer';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = sub;
      checkbox.checked = true;
      checkbox.style.marginRight = '8px';

      // Optional styling
      checkbox.style.width = '12px';
      checkbox.style.height = '12px';
      checkbox.style.border = '1px solid black';
      checkbox.style.borderRadius = '3px';
      checkbox.style.appearance = 'none';
      checkbox.style.cursor = 'pointer';

      checkbox.addEventListener('change', function() {
        if (checkbox.checked) {
          checkbox.style.backgroundColor = '#83a300';
          checkbox.style.border = 'none';
        } else {
          checkbox.style.backgroundColor = '';
          checkbox.style.border = '1px solid black';
        }
      });

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(' ' + sub));
      container.appendChild(label);
    });
  }

  //========================== ONLOAD INIT ==========================
  populateIndustryDropdown();
  populateRamaDropdown();

  //========================== GLOBAL CLICK TO CLOSE DROPDOWNS ==========================
  // This ensures if the user clicks anywhere outside a .dropdown, we hide them
  document.addEventListener('click', function(event) {
    // If the click is not in an element with class .dropdown or its descendants, close
    const dropdowns = document.querySelectorAll('.dropdown-content');
    dropdowns.forEach(function(dd) {
      if (!event.target.closest('.dropdown')) {
        dd.classList.remove('show');
      }
    });
  });
});
