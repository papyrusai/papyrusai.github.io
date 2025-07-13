document.addEventListener("DOMContentLoaded", function() {
    const industryTags = JSON.parse(document.getElementById('industryTags').textContent);
    const etiquetasContainer = document.getElementById('etiquetasContainer');

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
  
     const ramasContainer = document.getElementById('ramasContainer');

    // Function to create and insert span elements for each tag
    function displayTags(tags,container) {
      container.innerHTML = ''; // Clear any existing content+
      tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'industry-tag';
        tagSpan.textContent = tag;
        container.appendChild(tagSpan);
      });
    }
    function displayRamas(tags,container) {
      container.innerHTML = ''; // Clear any existing content+
      tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'industry-tag';
        tagSpan.textContent = tag;
        container.appendChild(tagSpan);
      });
      console.log(userSubRamaMap);
    }
  
    // Display the tags initially
    displayTags(industryTags, etiquetasContainer);
    
   displayRamas(userRamas, ramasContainer);

    //displaySub(userSubRamaMap, ramasContainer);
  });





   






// Function to send tags to IndustryForm.html

/*document.addEventListener('DOMContentLoaded', function () {
    const editLink = document.getElementById('editIndustriesLink');
    const industryTags = document.querySelectorAll('.industry-tag');
  
    editLink.addEventListener('click', function (event) {
      event.preventDefault();
  
      const selectedIndustries = Array.from(industryTags).map(tag => tag.textContent.trim());
      const queryString = selectedIndustries.map(industry => `industries[]=${encodeURIComponent(industry)}`).join('&');
      console.log(queryString);
      // Redirect to the select-industries page with the query parameters
      window.location.href = `/select-industries?${queryString}`;
      
    });
  });
  */