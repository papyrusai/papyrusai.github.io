
document.addEventListener("DOMContentLoaded", function() {
    const industryTags = JSON.parse(document.getElementById('industryTags').textContent);
    const selectedIndustrySpan = document.getElementById('selectedIndustry');
  
      // Function to update the button text
    function updateButtonText(selectedTag) {
        selectedIndustrySpan.textContent = selectedTag;
    }
    // Populate dropdown with industry tags
    function populateDropdown() {
      const dropdownContent = document.getElementById("myDropdown");
      dropdownContent.innerHTML = ''; // Clear any existing content
      
      if (industryTags.length === 0) {
        const noIndustryMsg = document.createElement('a');
        noIndustryMsg.textContent = "No hay industrias seleccionadas";
        dropdownContent.appendChild(noIndustryMsg);
        updateButtonText("Seleccione Industria");
      } else {
        industryTags.forEach(tag => {
          const industryLink = document.createElement('a');
          industryLink.href = `#${tag.toLowerCase().replace(/\s+/g, '-')}`;
          industryLink.textContent = tag;
          industryLink.addEventListener('click', function(event) {
            event.preventDefault(); // Prevent the default anchor behavior
            updateButtonText(tag); // Update the button text
            //window.loadChart(tag); // Call the global function to update the chart
          });
          dropdownContent.appendChild(industryLink);
        });
        // Set the button text to the first industry tag as default
        updateButtonText(industryTags[0]);

      }
    }
  
    // Toggle dropdown visibility
    function myFunction() {
      document.getElementById("myDropdown").classList.toggle("show");
    }
  
    // Close the dropdown if the user clicks outside of it
    window.onclick = function(event) {
      if (!event.target.matches('.dropbtn')) {
        var dropdowns = document.getElementsByClassName("dropdown-content");
        for (var i = 0; i < dropdowns.length; i++) {
          var openDropdown = dropdowns[i];
          if (openDropdown.classList.contains('show')) {
            openDropdown.classList.remove('show');
          }
        }
      }
    }
  
    // Populate the dropdown when the page loads
    populateDropdown();
  
    // Expose myFunction globally so it can be used in the onclick attribute
    window.myFunction = myFunction;
  });

  let allRamas = [
    "Derecho Civil",
    "Derecho Mercantil",
    "Derecho Administrativo",
    "Derecho Fiscal",
    "Derecho Laboral",
    "Derecho Procesal-Civil",
    "Derecho Procesal-Penal",
    "Derecho Constitucional",
    "Derecho de la UE",
    "Derecho Internacional Público"
  ];

  // Suppose sub-ramas are stored in an object:
  const subRamasMap = {
    "Derecho Civil": [
      "familia", "sucesiones", "divorcios", "arrendamientos"
    ],
    "Derecho Mercantil": [
      "M&A", "financiero", "inmobiliario", "mercados de capital",
      "societario", "gobierno corporativo"
    ],
    "Derecho Administrativo": [
      "energía", "medio ambiente", "urbanismo", "sectores regulados",
      "bancario", "contratación pública", "contencioso-administrativo"
    ],
    "Derecho Fiscal": [
      "tributación internacional", "IVA", "IS", "IRNR"
    ],
    "Derecho Laboral": [],
    "Derecho Procesal-Civil": [
      "pleitos masa (clausulas suelo, cárteles)", "impugnación acuerdos societarios",
      "desahucio"
    ],
    "Derecho Procesal-Penal": [
      "delitos medioambientales", "delitos económicos",
      "delitos de sangre"
    ],
    "Derecho Constitucional": [],
    "Derecho de la UE": [],
    "Derecho Internacional Privado": [],
    "Derecho Internacional Público": []
};

  function toggleRamaDropdown() {
    const dropdown = document.getElementById('ramaDropdown');
    dropdown.style.display = (dropdown.style.display === 'block') ? 'none' : 'block';
  }

  // Fill the dropdown with Ramas
  document.addEventListener('DOMContentLoaded', () => {
    const ramaDropdown = document.getElementById('ramaDropdown');
    allRamas.forEach(rama => {
      const a = document.createElement('a');
      a.href = "#";
      a.textContent = rama;
      a.dataset.value = rama; // store in data-value
      a.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('selectedRama').textContent = rama;
        ramaDropdown.style.display = 'none';
        // Then fill sub-ramas
        fillSubRamas(rama);
      });
      ramaDropdown.appendChild(a);
    });
  });

  function fillSubRamas(ramaName) {
    const container = document.getElementById('subRamasCheckboxContainer');
    container.innerHTML = '';
    container.style.display = 'block'; // show container

    const subList = subRamasMap[ramaName] || [];
    if(subList.length === 0) {
      container.innerHTML = '<i>No hay sub-ramas para esta rama</i>';
      return;
    }
    subList.forEach(sub => {
      const label = document.createElement('label');
      label.style.display = 'block'; // Each on a separate line
      label.style.marginBottom = '5px'; // Spacing between checkboxes
      label.style.cursor = 'pointer'; // Pointer cursor for the label
  
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = sub;
      checkbox.style.marginRight = '8px'; // Space between checkbox and text
      checkbox.style.width = '12px'; // Adjust checkbox size
      checkbox.style.height = '12px'; // Adjust checkbox size
      checkbox.style.border = '1px solid black'; // Add border for better visibility
      checkbox.style.borderRadius = '3px'; // Optional for rounded edges
      checkbox.style.appearance = 'none'; // Remove default checkbox styling
      checkbox.style.cursor = 'pointer'; // Pointer cursor for the checkbox itself
  
      // Handle checkbox background on check/uncheck
      checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
              checkbox.style.backgroundColor = '#83a300'; // Green when checked
              checkbox.style.border = 'none'; // Add border for better visibility
          } else {
              checkbox.style.backgroundColor = ''; // Reset to default when unchecked
              checkbox.style.border = '1px solid black'; // Add border for better visibility
          }
      });
  
      const text = document.createTextNode(` ${sub}`); // Create the text node
  
      label.appendChild(checkbox); // Append the checkbox
      label.appendChild(text); // Append the text
      container.appendChild(label); // Append the label to the container
  });
  
  }
