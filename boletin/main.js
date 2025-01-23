document.addEventListener('DOMContentLoaded', function () {
    fetchData(); //Output recibido y accedido en Json (por ahora no da problemas)
});


function fetchData() {

 // Show the loading icon
    document.getElementById('loading-icon').style.display = 'flex';

    fetch('https://papyrus-dusky.vercel.app/')
    .then(response => response.json())
    .then(data => {
 // Hide the loading icon
        document.getElementById('loading-icon').style.display = 'none';
        const container = document.getElementById('data-container');
        container.innerHTML = ''; // Clear previous content

        if(data.length > 0) {
            // Extract date from the first document
            const date = `${data[0].dia}/${data[0].mes}/${data[0].anio}`;
            // Update the page title with the date
            document.querySelector('h1').textContent = `Novedades Regulatorias - ${date}`;

            // Iterate over each item and display it in the requested order
            data.forEach(item => {
                // Main div for each document
                const itemDiv = document.createElement('div');
                itemDiv.classList.add('data-item');

                // Div for ID
                const idDiv = document.createElement('div');
                idDiv.textContent = `${item._id}`;
                idDiv.classList.add('id-values');
                itemDiv.appendChild(idDiv);

                // Div for "Etiquetas" label
                const etiquetasLabelDiv = document.createElement('div');
                etiquetasLabelDiv.textContent = "Etiquetas";
                etiquetasLabelDiv.classList.add('etiquetas-label');
                itemDiv.appendChild(etiquetasLabelDiv);

                // Container for Etiquetas values
                const etiquetasValuesContainer = document.createElement('div');
                etiquetasValuesContainer.classList.add('etiquetas-values');

                // Append each etiqueta as a separate span/div inside etiquetasValuesContainer
                item.etiquetas.forEach(etiqueta => {
                    const etiquetaSpan = document.createElement('span'); // Using 'span' for inline display
                    etiquetaSpan.textContent = etiqueta;
                    etiquetasValuesContainer.appendChild(etiquetaSpan);
                });

                // Append Etiquetas values container to the main Etiquetas container
                itemDiv.appendChild(etiquetasValuesContainer);

                // Div for "Resumen" label
                const resumenLabelDiv = document.createElement('div');
                resumenLabelDiv.textContent = "Resumen";
                resumenLabelDiv.classList.add('resumen-label'); 
                itemDiv.appendChild(resumenLabelDiv);

                // Div for Resumen content
                const resumenContentDiv = document.createElement('div');
                resumenContentDiv.classList.add('resumen-content'); 
                resumenContentDiv.textContent = item.resumen;
                itemDiv.appendChild(resumenContentDiv);

                // Append the main div to the container
                container.appendChild(itemDiv);
            });
        } else {
            // Handle case where no items were found
            container.textContent = 'No data found for the selected date.';
        }
    })
    .catch(error => {
        console.error('Error fetching data:', error);
    });
}
