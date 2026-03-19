const API_URL = '/api';
const socket = io();
let currentUser = null;
let currentTab = 'my';

// Socket Events (Real-time SaaS)
socket.on('sensor-update', (data) => {
    updateSensorUI(data);
    if (data.type === 'alarm') createToast(`⚠️ ALERTA: ${data.detail}`, 'error');
});

socket.on('pending-sensor-discovery', (data) => {
    createToast(`📡 Nuevo dispositivo detectado: ${data.id}`, 'info');
    if (currentTab === 'pending') refreshData();
});

function updateSensorUI(data) {
    const row = document.querySelector(`tr[data-id="${data.id}"]`);
    if (!row) return;
    
    // Update Inline values
    if (data.temp_interior !== undefined) row.querySelector('.temp-val').textContent = `${data.temp_interior.toFixed(1)}°C`;
    if (data.door_open !== undefined) {
        const doorBadge = row.querySelector('.door-badge');
        doorBadge.textContent = data.door_open ? 'Abierta' : 'Cerrada';
        doorBadge.className = `badge ${data.door_open ? 'pending' : 'online'} door-badge`;
    }
    if (data.rssi !== undefined) row.querySelector('.rssi-val').textContent = `${data.rssi} dBm`;
}

function createToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `glass-card toast ${type}`;
    toast.style.padding = '1.2rem';
    toast.style.marginBottom = '0.5rem';
    toast.style.display = 'flex';
    toast.style.gap = '1rem';
    toast.style.alignItems = 'center';
    toast.style.borderLeft = `4px solid ${type === 'error' ? 'var(--accent-red)' : 'var(--primary)'}`;
    toast.innerHTML = `<span style="font-size:1.5rem">${type === 'error' ? '🚨' : '📡'}</span> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    
    // Auth Events
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Modal Close
    document.getElementById('close-modal').addEventListener('click', closeModal);
    
    // Adopt Form
    document.getElementById('adopt-form').addEventListener('submit', handleAdoption);

    // Auto-refresh data
    setInterval(refreshData, 15000);
});

// --- Auth Functions ---
async function checkAuth() {
    const response = await fetch(`${API_URL}/auth/me`);
    const user = await response.json();
    if (user) {
        currentUser = user;
        showDashboard();
    } else {
        showLogin();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    
    if (response.ok) {
        const data = await response.json();
        currentUser = data.user;
        showDashboard();
    } else {
        alert('Credenciales inválidas');
    }
}

async function handleLogout() {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST' });
    location.reload();
}

// --- UI Switcher ---
function showLogin() {
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('main-dashboard').classList.add('hidden');
    document.getElementById('user-sidebar').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('main-dashboard').classList.remove('hidden');
    document.getElementById('user-sidebar').classList.remove('hidden');
    document.getElementById('user-display').textContent = `Hola, ${currentUser.username}`;
    
    // Join Socket Room
    socket.emit('join-client', currentUser.clientId);

    // Show Admin Link if user is admin
    if (currentUser.role === 'admin' && !document.getElementById('admin-link')) {
        const nav = document.querySelector('.sidebar-nav');
        const adminBtn = document.createElement('button');
        adminBtn.id = 'admin-link';
        adminBtn.className = 'nav-item';
        adminBtn.style.color = 'var(--primary)';
        adminBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg> <span>Panel Admin</span>';
        adminBtn.onclick = () => window.location.href = '/admin.html';
        nav.appendChild(adminBtn);
    }
    
    // Tab switching in Frontend
    document.querySelectorAll('.nav-item').forEach(btn => {
        if (btn.dataset.tab) {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                currentTab = e.currentTarget.dataset.tab;
                document.getElementById('dashboard-title').textContent = currentTab === 'my' ? 'Mis Sensores' : 'Pendientes de Adopción';
                refreshData();
            });
        }
    });

    refreshData();
}

// --- Remote Actions ---
async function sendCmd(sensorId, cmd) {
    const response = await fetch(`${API_URL}/sensors/${sensorId}/cmd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd })
    });
    if (response.ok) createToast(`Comando ${cmd} enviado`, 'info');
}

// --- Data Functions ---
async function refreshData() {
    if (!currentUser) return;
    const endpoint = currentTab === 'my' ? '/api/sensors/my' : '/api/sensors/pending';
    const response = await fetch(`${API_URL}${endpoint}`);
    const sensors = await response.json();
    
    if (currentTab === 'pending') {
        document.getElementById('count-pending').textContent = sensors.length;
    }
    
    renderDataTable(sensors);
}

function renderDataTable(sensors) {
    const thead = document.getElementById('table-header');
    const tbody = document.getElementById('sensors-body');
    tbody.innerHTML = '';

    if (currentTab === 'my') {
        thead.innerHTML = '<th>Dispositivo</th><th>Temp Int</th><th>Puerta</th><th>Señal</th><th>Acciones</th>';
        sensors.forEach(s => {
            tbody.innerHTML += `
                <tr data-id="${s.id}">
                    <td><strong>${s.name || s.id}</strong><br><small style="color:var(--text-dim)">${s.id}</small></td>
                    <td><span class="temp-val">${s.temp_interior !== undefined ? s.temp_interior.toFixed(1) + '°C' : '--'}</span></td>
                    <td><span class="badge ${s.door_open ? 'pending' : 'online'} door-badge">${s.door_open ? 'Abierta' : 'Cerrada'}</span></td>
                    <td><span class="rssi-val">${s.rssi || '--'} dBm</span></td>
                    <td>
                        <button onclick="sendCmd('${s.id}', 'reboot')" class="btn-icon" title="Reiniciar">⚡</button>
                        <button onclick="sendCmd('${s.id}', 'ack_alarm')" class="btn-icon" title="Reconocer Alarma">🔕</button>
                    </td>
                </tr>
            `;
        });
    } else {
        thead.innerHTML = '<th>MAC / ID</th><th>Modelo</th><th>Versión FW</th><th>Acción</th>';
        sensors.forEach(s => {
            tbody.innerHTML += `
                <tr>
                    <td>${s.id}</td>
                    <td>${s.model || 'Pulsar C6'}</td>
                    <td>${s.fw || '3.2.0'}</td>
                    <td><button onclick="openAdoptModal('${s.id}')" class="btn-primary" style="padding:0.4rem">Adoptar</button></td>
                </tr>
            `;
        });
    }
}

// --- Adoption Flow ---
function openAdoptModal(id) {
    const modal = document.getElementById('sensor-modal');
    modal.classList.remove('hidden');
    document.getElementById('modal-view-details').classList.add('hidden');
    document.getElementById('modal-adopt-device').classList.remove('hidden');
    document.getElementById('adopt-id').value = id;
}

async function handleAdoption(e) {
    e.preventDefault();
    const id = document.getElementById('adopt-id').value;
    const name = document.getElementById('adopt-name').value;
    const local_id = document.getElementById('adopt-local-id').value;
    const cam_id = document.getElementById('adopt-cam-id').value;
    const temp_min = document.getElementById('adopt-temp-min').value;
    const temp_max = document.getElementById('adopt-temp-max').value;
    
    const response = await fetch(`${API_URL}/sensors/${id}/adopt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, local_id, cam_id, temp_min: parseFloat(temp_min), temp_max: parseFloat(temp_max) })
    });
    
    if (response.ok) {
        createToast('Dispositivo adoptado y configurado!', 'info');
        closeModal();
        currentTab = 'my';
        refreshData();
    } else {
        alert('Error al adoptar');
    }
}

function closeModal() {
    document.getElementById('sensor-modal').classList.add('hidden');
}
