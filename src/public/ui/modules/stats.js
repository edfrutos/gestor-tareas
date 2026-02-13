import { API_BASE } from "./config.js";
import { fetchJson } from "./api.js";
import { $, toast } from "./utils.js";
import { getUser } from "./auth.js";

// Register the datalabels plugin globally
Chart.register(ChartDataLabels);

let charts = {};

export function initStatsModule() {
    const btn = $("#btnStats");
    if (btn) btn.onclick = openStatsModal;

    const modal = $("#statsModal");
    const close = $("#statsClose");
    if (close && modal) {
        close.onclick = () => modal.style.display = "none";
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };
    }

    // New: Export buttons
    const btnExportPng = $("#btnExportPng");
    if (btnExportPng) btnExportPng.onclick = exportToPng;
    const btnExportPdf = $("#btnExportPdf");
    if (btnExportPdf) btnExportPdf.onclick = exportToPdf;
}

async function openStatsModal() {
    $("#statsModal").style.display = "flex";
    try {
        const data = await fetchJson(`${API_BASE}/issues/stats/details`);
        renderCharts(data);
    } catch (e) {
        toast("Error al cargar estadísticas", "error");
    }
}

function renderCharts(data) {
    const user = getUser();
    const isAdmin = user?.role === 'admin';

    // 1. Gráfico de Estados (Doughnut)
    destroyChart('status');
    const statusCtx = $("#chartStatus");
    if (statusCtx) {
        charts.status = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: ['Abiertas', 'En curso', 'Resueltas'],
                datasets: [{
                    data: [data.byStatus.open || 0, data.byStatus.in_progress || 0, data.byStatus.resolved || 0],
                    backgroundColor: ['#3498db', '#f39c12', '#2ecc71'],
                    borderWidth: 0
                }]
            },
            options: { 
                responsive: true,
                plugins: { 
                    legend: { 
                        position: 'bottom', 
                        labels: { color: '#fff', font: { size: 11 } } 
                    },
                    datalabels: {
                        color: '#fff',
                        formatter: (value, ctx) => {
                            let sum = 0;
                            let dataArr = ctx.chart.data.datasets[0].data;
                            dataArr.map(data => { sum += data; });
                            let percentage = (value * 100 / sum).toFixed(0) + '%';
                            return percentage;
                        },
                        font: {
                            weight: 'bold',
                            size: 10,
                        }
                    }
                } 
            }
        });
    }

    // 2. Gráfico de Categorías (Bar horizontal)
    destroyChart('category');
    const categoryCtx = $("#chartCategory");
    if (categoryCtx) {
        const catLabels = Object.keys(data.byCategory);
        charts.category = new Chart(categoryCtx, {
            type: 'bar',
            data: {
                labels: catLabels,
                datasets: [{
                    label: 'Tareas',
                    data: catLabels.map(l => data.byCategory[l]),
                    backgroundColor: '#7c5cff'
                }]
            },
            options: { 
                indexAxis: 'y',
                responsive: true,
                scales: { 
                    x: { ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,0.1)' } }, 
                    y: { ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,0.1)' } } 
                },
                plugins: { 
                    legend: { display: false },
                    datalabels: {
                        color: '#fff',
                        anchor: 'end',
                        align: 'end',
                        formatter: (value) => value > 0 ? value : '',
                        font: { 
                            weight: 'bold',
                            size: 10,
                        }
                    }
                }
            }
        });
    }

    // 3. Gráfico de Usuarios (Solo Admin)
    const userContainer = $("#chartUserContainer");
    if (isAdmin && data.byUser && data.byUser.length > 0) {
        if (userContainer) userContainer.style.display = "block";
        destroyChart('user');
        const userCtx = $("#chartUser");
        if (userCtx) {
            charts.user = new Chart(userCtx, {
                type: 'bar',
                data: {
                    labels: data.byUser.map(u => u.username),
                    datasets: [{
                        label: 'Tareas creadas',
                        data: data.byUser.map(u => u.count),
                        backgroundColor: '#00c7ff'
                    }]
                },
                options: { 
                    responsive: true,
                    scales: { 
                        x: { ticks: { color: '#fff' } }, 
                        y: { ticks: { color: '#fff' } } 
                    },
                    plugins: { 
                        legend: { labels: { color: '#fff' } },
                        datalabels: {
                            color: '#fff',
                            anchor: 'end',
                            align: 'end',
                            formatter: (value) => value > 0 ? value : '',
                            font: {
                                weight: 'bold',
                                size: 10,
                            }
                        }
                    }
                }
            });
        }
    } else if (userContainer) {
        userContainer.style.display = "none";
    }
}

function destroyChart(id) {
    if (charts[id]) {
        charts[id].destroy();
        delete charts[id];
    }
}


async function exportToPng() {
    if (Object.keys(charts).length === 0) {
        toast("No hay gráficos para exportar", "info");
        return;
    }

    const overlay = $(".busy-overlay");
    if (overlay) overlay.classList.add("is-on");

    try {
        for (const chartId in charts) {
            const chart = charts[chartId];
            if (chart) {
                const image = chart.toBase64Image('image/png', 1.0);
                const a = document.createElement('a');
                a.href = image;
                a.download = `estadisticas-${chartId}-${new Date().toISOString().slice(0, 10)}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        }
        toast("Gráficos exportados como PNG", "success");
    } catch (e) {
        toast("Error al exportar PNG: " + e.message, "error");
    } finally {
        if (overlay) overlay.classList.remove("is-on");
    }
}

/**
 * Exporta todos los gráficos a un único documento PDF.
 */
async function exportToPdf() {
    if (Object.keys(charts).length === 0) {
        toast("No hay gráficos para exportar", "info");
        return;
    }

    const overlay = $(".busy-overlay");
    if (overlay) overlay.classList.add("is-on");

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4'); // Portrait, milimeters, A4 size

        let yOffset = 10;
        const pageHeight = doc.internal.pageSize.height;
        const pageWidth = doc.internal.pageSize.width;
        const margin = 10;
        const chartWidth = pageWidth - 2 * margin;

        // Título del documento
        doc.setFontSize(18);
        doc.text("Informe de Estadísticas de Tareas", margin, yOffset);
        yOffset += 15;

        // Fecha de generación
        doc.setFontSize(10);
        doc.text(`Fecha de generación: ${new Date().toLocaleDateString()}`, margin, yOffset);
        yOffset += 10;

        for (const chartId in charts) {
            const chart = charts[chartId];
            if (chart) {
                // Asegurarse de que el elemento canvas sea visible para html2canvas
                const canvasElement = $(`#chart${chartId.charAt(0).toUpperCase() + chartId.slice(1)}`);
                if (!canvasElement) continue;

                // NEW: Get chart title from HTML and add to PDF
                const chartContainer = canvasElement.parentElement;
                const chartTitleElement = chartContainer ? chartContainer.querySelector('h4') : null;
                const chartTitle = chartTitleElement ? chartTitleElement.textContent : `Gráfico de ${chartId}`; // Fallback title

                if (yOffset + 20 > pageHeight) { // Check if new title + image will fit
                    doc.addPage();
                    yOffset = 10;
                }

                doc.setFontSize(14);
                doc.text(chartTitle, margin, yOffset);
                yOffset += 10; // Space for title

                const canvas = await html2canvas(canvasElement, { backgroundColor: '#ffffff' });
                const imgData = canvas.toDataURL('image/png');

                const imgProps = doc.getImageProperties(imgData);
                const imgHeight = (imgProps.height * chartWidth) / imgProps.width;

                if (yOffset + imgHeight + 10 > pageHeight) {
                    doc.addPage();
                    yOffset = 10;
                }
                doc.addImage(imgData, 'PNG', margin, yOffset, chartWidth, imgHeight);
                yOffset += imgHeight + 15; // Add more padding below the image
            }
        }

        doc.save(`informe-estadisticas-${new Date().toISOString().slice(0, 10)}.pdf`);
        toast("Informe PDF generado", "success");
    } catch (e) {
        console.error("Error al exportar PDF:", e);
        toast("Error al exportar PDF: " + e.message, "error");
    } finally {
        if (overlay) overlay.classList.remove("is-on");
    }
}

/**
 * Función exportada necesaria para app.js
 */
export function startStatsPolling() {
    updateStats();
    setInterval(updateStats, 30000);
}

/**
 * Actualiza los badges de conteo rápido en el header
 */
async function updateStats() {
    try {
        const stats = await fetchJson(`${API_BASE}/issues/stats`);
        if (!stats) return;

        const bOpen = $("#badgeOpen");
        const bProg = $("#badgeProgress");
        const bRes = $("#badgeResolved");

        if (bOpen) { 
            bOpen.textContent = stats.open || 0; 
            bOpen.style.display = (stats.open > 0) ? "inline-flex" : "none"; 
        }
        if (bProg) { 
            bProg.textContent = stats.in_progress || 0; 
            bProg.style.display = (stats.in_progress > 0) ? "inline-flex" : "none"; 
        }
        if (bRes) { 
            bRes.textContent = stats.resolved || 0; 
            bRes.style.display = (stats.resolved > 0) ? "inline-flex" : "none"; 
        }
    } catch (e) {
        // Fallo silencioso del polling
    }
}
