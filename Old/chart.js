
let myChart;
async function loadChart(months,counts) {
    const aspectRatio = window.innerWidth < 768 ? 1 : 2;
    const ctx = document.getElementById('documentsChart').getContext('2d');
    if (myChart) {
        myChart.destroy();
    }
    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [{
                label: 'Número Publicaciones',
                data: counts,
                borderColor: '#83a300',
                backgroundColor: '#83a300',
                fill: true,
                tension: 0.1,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio:aspectRatio,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Mes',
                        color: '#092534',
                    }, ticks: {
                        color: '#092534',
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Número',
                        color: '#092534',
                    },
                    ticks: {
                        color: '#092534', // Change font color of y-axis labels
                    }
                }
            },
            plugins: {
                legend: {
                    display: false,
                    labels: {
                        color: '#092534', // Change font color of the legend
                    }
                },
                title: {
                    display: true,
                    text: 'Normas publicadas mensualmente',
                    color: '#092534', // Change font color of the chart title
                }
            }
        }
    });
}

// Access the predefined embedded months and counts data and load the chart
const months = JSON.parse(document.getElementById('monthsData').textContent);
const counts = JSON.parse(document.getElementById('countsData').textContent);

// Load the chart on first rendering, with predefined variables
loadChart(months,counts);