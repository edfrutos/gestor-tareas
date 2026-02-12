import { API_BASE } from "./config.js";
import { fetchJson } from "./api.js";
import { $, toast } from "./utils.js";
import { getUser } from "./auth.js";

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
                plugins: { legend: { display: false } }
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
                    plugins: { legend: { labels: { color: '#fff' } } }
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
