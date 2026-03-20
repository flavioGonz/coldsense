const socket = io();
const API_URL = '/api';
let allMySensors = [];
let allBranches = [];
let currentUser = null;
let latestTelemetry = {};
let currentView = 'dashboard';

// ── Auth ──
async function checkAuth() {
    console.log('🔍 Checking identity...');
    try {
        const r = await fetch(`${API_URL}/auth/me`);
        if (!r.ok) {
            console.warn('❌ Auth failed, redirecting...');
            window.location.href = '/login.html';
            return;
        }
        const user = await r.json();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        currentUser = user;
        console.log('✅ Identity OK:', user.username);
        
        document.getElementById('user-name').textContent = (user.username || 'USUARIO').toUpperCase();
        
        // Show app immediately after auth
        document.getElementById('main-sidebar').classList.remove('hidden');
        document.getElementById('main-content').classList.remove('hidden');

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.onclick = () => {
                const view = btn.dataset.view;
                navigateTo(view, btn.querySelector('span')?.textContent || view);
            }
        });

        document.getElementById('sidebar-toggle').onclick = () => {
            document.body.classList.toggle('sidebar-collapsed');
            document.getElementById('main-sidebar').classList.toggle('collapsed');
        };

        const v = new URLSearchParams(window.location.search).get('view');
        if (v) navigateTo(v, v.toUpperCase());
        
        initSocket();
        await loadAllData();

        // PWA Nav Handling (Bottom Bar)
        document.querySelectorAll('.pwa-nav-btn').forEach(btn => {
            btn.onclick = () => {
                const view = btn.dataset.view;
                document.querySelectorAll('.pwa-nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                navigateTo(view, view.toUpperCase());
            }
        });
    } catch(e) {
        console.error('🔥 Init Crash:', e);
        document.body.innerHTML = `<div style="color:white;text-align:center;padding:10%;background:#000;height:100vh;">
            <h1>ERROR DE INICIO</h1>
            <p>${e.message}</p>
            <button onclick="location.reload()" style="background:var(--unifi-blue);color:white;padding:10px 20px;border:none;border-radius:8px;">REINTENTAR</button>
        </div>`;
    }
}

function navigateTo(view, title) {
    currentView = view;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-btn[data-view="${view}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Smooth UI Transition
    const modules = document.querySelectorAll('.view-module');
    modules.forEach(m => {
        m.style.opacity = '0';
        m.style.transform = 'translateY(10px)';
        setTimeout(() => m.classList.add('hidden'), 200);
    });

    setTimeout(() => {
        const target = document.getElementById(`view-${view}`);
        if (target) {
            target.classList.remove('hidden');
            setTimeout(() => {
                target.style.opacity = '1';
                target.style.transform = 'translateY(0)';
            }, 50);
        }
        renderAll();
    }, 250);
}

function initSocket() {
    socket.on('sensor-update', (data) => {
        // PERSIST: Translate server-side shorthand (tIn, tOut) to UI fields
        const mapped = {
            ...data,
            temp_interior: data.tIn,
            temp_exterior: data.tOut,
            door_open: data.door,
            uptime: data.uptime,
            timestamp: data.last_seen
        };
        
        latestTelemetry[data.id] = mapped; 
        
        // Add to historical event log for the 'Events' view
        allClientEvents.unshift({
            id: data.id,
            time: data.last_seen || new Date().toISOString(),
            type: 'TELEMETRÍA',
            rssi: data.rssi,
            uptime_secs: data.uptime
        });
        if (allClientEvents.length > 50) allClientEvents.pop();

        if (currentView === 'dashboard') renderDashboardCards();
        if (currentView === 'devices') renderMyDevices();
        if (currentView === 'events') renderEvents();
    });

    socket.on('sensor-ack', (data) => {
        const title = data.status === 'success' ? 'COMANDO EJECUTADO' : 'FALLO HARDWARE';
        sonner(`Dispositivo ${data.sensorId} confirmó ejecución.`, data.status==='success'?'success':'danger', title);
        
        // Also log command acks as events
        allClientEvents.unshift({
            id: data.sensorId,
            time: new Date().toISOString(),
            type: 'ACK',
            details: `Comando ${data.command} ejecutado con éxito.`
        });
        
        if (currentView === 'commands') loadHistory();
        if (currentView === 'events') renderEvents();
    });
}

function handleLogout() {
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = '/login.html';
}

function renderAll() { 
    const vTitle = document.getElementById('view-title');
    const vBread = document.getElementById('breadcrumb');
    
    if(currentView==='dashboard') {
        vTitle.textContent = "SISTEMA ACTIVO";
        vBread.textContent = "DASHBOARD / RESUMEN";
        renderDashboardCards(); 
    }
    if(currentView==='devices') {
        vTitle.textContent = "CONTROL FLOTA";
        vBread.textContent = "SISTEMA / HARDWARE";
        renderMyDevices(); 
    }
    if(currentView==='commands') {
        vTitle.textContent = "OPERACIONES";
        vBread.textContent = "SISTEMA / COMANDOS";
        loadHistory(); 
    }
    if(currentView==='events') {
        vTitle.textContent = "HISTORIAL EVENTOS";
        vBread.textContent = "SISTEMA / LOGS";
        renderEvents(); 
    }
    if(currentView==='branches') {
        vTitle.textContent = "UBICACIONES";
        vBread.textContent = "ADMIN / SEDES";
        renderBranches(); 
    }
}

// ── Data ──
async function loadAllData() {
    console.log('📦 Loading data...');
    try {
        const [sRes, bRes] = await Promise.all([
            fetch(`${API_URL}/client/sensors`), 
            fetch(`${API_URL}/client/branches`)
        ]);
        const sensors = await sRes.json();
        allBranches = await bRes.json();
        
        allMySensors = sensors; // Already filtered by server
        
        console.log('📶 Sensors found:', allMySensors.length);
        renderAll();
    } catch(e) {
        console.error('📦 Data Load Error:', e);
        throw e;
    }
}

async function loadHistory() {
    const list = document.getElementById('history-table-body'); if(!list) return;
    const r = await fetch(`${API_URL}/client/commands`);
    const logs = await r.json();
    list.innerHTML = logs.map(l => {
        const isOk = l.status === 'success';
        return `
        <tr>
            <td style="font-size:0.6rem; opacity:0.6;">${new Date(l.timestamp).toLocaleString()}</td>
            <td><div style="font-weight:900; font-size:0.75rem; color:var(--unifi-blue);">${(l.command||'').toUpperCase()}</div></td>
            <td><span class="label">${l.sensor_id}</span></td>
            <td>
                <span style="display:inline-flex; align-items:center; gap:6px; font-size:0.65rem; font-weight:800; color:${isOk ? 'var(--success)' : 'var(--warning)'};">
                    <span class="status-orb" style="background:${isOk ? 'var(--success)' : 'var(--warning)'}"></span>
                    ${isOk ? 'Recibido ok' : 'Enviado'}
                </span>
            </td>
            <td><div style="font-family:monospace; font-size:0.6rem; letter-spacing:1px; opacity:0.4;">${l.cmd_id}</div></td>
        </tr>
    `}).join('');
    lucide.createIcons();
}

let allClientEvents = [];
function renderEvents() {
    const list = document.getElementById('events-table-body'); if(!list) return;
    list.innerHTML = allClientEvents.map(e => `
        <tr>
            <td style="font-size:0.65rem; opacity:0.5;">${new Date(e.time||e.timestamp).toLocaleTimeString()}</td>
            <td><span class="label">${e.id || e.device_id}</span></td>
            <td><span class="pill" style="background:rgba(0,102,255,0.05); color:var(--unifi-blue);">${(e.type||'heartbeat').toUpperCase()}</span></td>
            <td style="font-size:0.7rem;">RSSI: ${e.rssi || '--'} dBm | Up: ${formatUptime(e.uptime_secs)}</td>
        </tr>
    `).join('');
    lucide.createIcons();
}

function getWifiIcon(rssi) {
    if (!rssi) return { icon: 'wifi-off', color: 'var(--text-secondary)' };
    if (rssi > -60) return { icon: 'wifi', color: 'var(--success)' };
    if (rssi > -80) return { icon: 'wifi', color: 'var(--warning)' };
    return { icon: 'wifi', color: 'var(--danger)' };
}

function formatUptime(seconds) {
    if (!seconds) return '--';
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

// ── Dashboard ──
function renderDashboardCards() {
    const grid = document.getElementById('client-dashboard-grid'); if(!grid) return;
    if (!allMySensors.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;opacity:0.4;"><i data-lucide="radio" style="width:48px;height:48px;"></i><h3 style="font-weight:800;margin-top:1rem;">SIN EQUIPOS ASIGNADOS</h3></div>`;
        lucide.createIcons(); return;
    }
    grid.innerHTML = allMySensors.map(s => {
        const tel = latestTelemetry[s.id] || {};
        const tIn = tel.temp_interior !== undefined ? tel.temp_interior : s.temp_interior;
        const tOut = tel.temp_exterior !== undefined ? tel.temp_exterior : s.temp_exterior;
        const door = tel.door_open !== undefined ? tel.door_open : s.door_open;
        
        const lastSeen = tel.timestamp ? new Date(tel.timestamp).getTime() : 0;
        const isOnline = Date.now() - lastSeen < 60000; // 1 min threshold

        const tMin = s.temp_min !== null ? s.temp_min : -20;
        const tMax = s.temp_max !== null ? s.temp_max : 10;
        
        let statusColor = 'var(--bg-card)';
        let borderHighlight = 'var(--border-light)';
        let statusText = isOnline ? 'NORMAL' : 'DISPOSITIVO OFFLINE';
        let glow = '';

        if (!isOnline) {
            statusColor = 'rgba(255, 255, 255, 0.02)';
            borderHighlight = 'rgba(255, 255, 255, 0.1)';
        } else if (tIn !== undefined) {
            if (tIn > tMax || tIn < tMin) {
                statusColor = 'rgba(255, 77, 77, 0.08)';
                borderHighlight = 'var(--danger)';
                statusText = 'CRÍTICO';
                glow = 'box-shadow: 0 0 25px rgba(255, 77, 77, 0.15);';
                notifyAlert(s.name || s.id, `¡ALERTA TÉRMICA! ${tIn}°C detectados fuera de rango.`);
            } else if (tIn > tMax - 2 || tIn < tMin + 2) {
                statusColor = 'rgba(255, 165, 0, 0.08)';
                borderHighlight = 'orange';
                statusText = 'ADVERTENCIA';
            } else {
                statusColor = 'rgba(0, 212, 129, 0.05)';
                borderHighlight = 'var(--success)';
            }
        }

        const sig = getWifiIcon(tel.rssi || s.rssi);
        
        return `
        <div class="unifi-card sensor-block-dynamic" style="background:${statusColor}; border-color:${borderHighlight}; ${glow} transition: all 0.5s ease; position:relative; overflow:hidden;">
            ${tIn !== undefined ? `<div style="position:absolute; top:8px; right:12px; font-size:0.55rem; font-weight:900; color:${borderHighlight}; letter-spacing:1px;">${statusText}</div>` : ''}
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.5rem;">
                <div style="display:flex; gap:12px; align-items:center;">
                    <div style="width:40px; height:40px; background:var(--input-bg); border-radius:10px; display:flex; align-items:center; justify-content:center; position:relative;">
                        <i data-lucide="thermometer" style="width:20px; height:20px; color:var(--unifi-blue);"></i>
                        ${isOnline ? `<span style="position:absolute; bottom:-2px; right:-2px; width:12px; height:12px; border-radius:50%; background:var(--success); border:2px solid var(--bg-card); box-shadow:0 0 10px var(--success); animation: pulse 2s infinite;"></span>` : ''}
                    </div>
                    <div>
                        <h4 style="font-weight:800; font-size:0.9rem;">${s.name || s.id} ${!isOnline ? '<span style="color:var(--danger); font-size:0.5rem;">OFFLINE</span>' : ''}</h4>
                        <p style="font-size:0.6rem; opacity:0.5; font-family:monospace;">${s.id}</p>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="color:${sig.color}; font-size:0.65rem; font-weight:700; display:flex; align-items:center; gap:4px; justify-content:flex-end;">
                        <i data-lucide="${sig.icon}" style="width:12px; height:12px;"></i>
                        ${tel.rssi || s.rssi || '--'} dBm
                    </div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:1.5rem;">
                <div style="background:rgba(0,0,0,0.1); padding:1rem; border-radius:12px; text-align:center;">
                    <div style="font-size:0.6rem; opacity:0.5; margin-bottom:4px; font-weight:800; letter-spacing:1px;">INTERIOR</div>
                    <div style="font-size:1.8rem; font-weight:900; color:var(--success); line-height:1;">${tIn !== undefined ? tIn : '--'}<span style="font-size:0.8rem; vertical-align:top; margin-left:2px;">°C</span></div>
                </div>
                <div style="background:rgba(0,0,0,0.1); padding:1rem; border-radius:12px; text-align:center;">
                    <div style="font-size:0.6rem; opacity:0.5; margin-bottom:4px; font-weight:800; letter-spacing:1px;">EXTERIOR</div>
                    <div style="font-size:1.8rem; font-weight:900; color:var(--unifi-blue); line-height:1;">${tOut !== undefined ? tOut : '--'}<span style="font-size:0.8rem; vertical-align:top; margin-left:2px;">°C</span></div>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.7rem; font-weight:600;">
                <div style="display:flex; align-items:center; gap:6px; color:${door?'var(--danger)':'var(--success)'};">
                    <i data-lucide="${door?'door-open':'door-closed'}" style="width:14px; height:14px;"></i>
                    ${door !== undefined ? (door ? 'ABIERTA' : 'CERRADA') : '--'}
                </div>
                <div style="opacity:0.6; font-size:0.6rem;">
                    Límite: ${tMin}° a ${tMax}°
                </div>
            </div>

            <div style="margin-top:1.2rem; padding-top:0.8rem; border-top:1px solid var(--border-light); display:flex; gap:6px; align-items:center;">
                <div style="font-size:0.55rem; font-weight:900; opacity:0.3; flex:1;">HARDWARE PULSAR C6</div>
                <button class="btn-sm btn-ghost" onclick="openGraphModal('${s.id}', \`${(s.name||s.id).replace(/'/g,"")}\`)" style="background:rgba(0,102,255,0.08); color:var(--unifi-blue); border-radius:8px;"><i data-lucide="line-chart" style="width:14px;height:14px;"></i></button>
                <button class="btn-sm btn-ghost" onclick="sendCommand('${s.id}','reboot')" data-tippy-content="Reiniciar"><i data-lucide="refresh-cw" style="width:12px;height:12px;"></i></button>
                <button class="btn-sm btn-ghost" style="color:var(--success);" onclick="sendCommand('${s.id}','open_door')" data-tippy-content="Abrir Puerta"><i data-lucide="unlock" style="width:12px;height:12px;"></i></button>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons(); initTippy();
}

function renderMyDevices() {
    const table = document.getElementById('my-sensors-table'); if(!table) return;
    const term = (document.getElementById('search-my-devices')?.value||'').toLowerCase();
    const filtered = allMySensors.filter(s => s.id.toLowerCase().includes(term)||(s.name||'').toLowerCase().includes(term));
    table.innerHTML = filtered.map(s => {
        const tel = latestTelemetry[s.id]||{};
        const tIn = tel.temp_interior !== undefined ? tel.temp_interior : s.temp_interior;
        const sig = getWifiIcon(tel.rssi || s.rssi);
        const door = tel.door_open !== undefined ? tel.door_open : s.door_open;

        return `<tr>
            <td><span class="label">${s.id}</span></td>
            <td><div style="font-weight:900;">${s.name || 'SIN NOMBRE'}</div></td>
            <td style="font-weight:900; color:var(--success);">${tIn !== undefined ? tIn+' °C' : '--'}</td>
            <td><span class="pill" style="color:${door?'var(--danger)':'var(--success)'};">${door?'ABIERTA':'CERRADA'}</span></td>
            <td>
                <div style="display:flex; align-items:center; gap:6px;">
                    <i data-lucide="${sig.icon}" style="width:14px; height:14px; color:${sig.color};"></i>
                    <span style="font-size:0.65rem; font-weight:800;">RSSI ${tel.rssi || s.rssi || '--'}</span>
                </div>
            </td>
            <td>
                <div style="display:flex; gap:6px;">
                    <button class="btn-sm btn-ghost" onclick="sendCommand('${s.id}','reboot')" data-tippy-content="Reiniciar"><i data-lucide="refresh-cw" style="width:12px;height:12px;"></i></button>
                    <button class="btn-sm btn-ghost" onclick="sendCommand('${s.id}','open_door')" data-tippy-content="Abrir Puerta"><i data-lucide="unlock" style="width:12px;height:12px;"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
    lucide.createIcons(); initTippy();
}

// ── Branches ──
function renderBranches() {
    const list = document.getElementById('branches-list'); if(!list) return;
    list.innerHTML = allBranches.map(b => `
        <div class="unifi-card" style="display:flex; justify-content:space-between; align-items:center;">
            <div><h4 style="font-weight:900;">${b.name}</h4><p style="font-size:0.7rem; opacity:0.5;">${b.address || 'Ubicación sin definir'}</p></div>
            <button class="btn-sm btn-ghost" style="color:var(--danger);" onclick="deleteBranch(${b.id})"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
        </div>
    `).join('');
    lucide.createIcons();
}

async function createBranch() {
    const name = prompt('Nombre de la Sucursal:');
    if(!name) return;
    await fetch(`${API_URL}/client/branches`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name })
    });
    loadAllData();
}

async function deleteBranch(id) {
    if(!confirm('¿Eliminar sucursal?')) return;
    await fetch(`${API_URL}/client/branches/${id}`, { method:'DELETE' });
    loadAllData();
}

async function sendCommand(id, cmd) {
    const r = await fetch(`${API_URL}/admin/sensors/${id}/command`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ cmd })
    });
    if (r.ok) sonner('Comando despachado', 'success', 'PENDING');
}

function notifyAlert(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/2322/2322701.png' });
    }
}

function sonner(msg, type='info', title='') {
    const toast = document.createElement('div');
    toast.className = `toast-sonner ${type}`;
    toast.innerHTML = `<div style="font-weight:900; font-size:0.7rem;">${title || type.toUpperCase()}</div><div style="font-size:0.7rem; opacity:0.8;">${msg}</div>`;
    document.getElementById('sonner-container').appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function initTippy() {
    tippy('[data-tippy-content]', { theme: 'unifi', animation: 'shift-away', arrow: false });
}

// ── Modals ──
function openRenameModal(id, currentName) {
    const newName = prompt('Nuevo nombre para el sensor:', currentName);
    if (newName !== null) renameSensor(id, newName);
}

async function renameSensor(id, name) {
    await fetch(`${API_URL}/client/sensors/${id}/rename`, {
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name })
    });
    loadAllData();
}

document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.dataset.view;
        document.querySelectorAll('.view-module').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${currentView}`).classList.remove('hidden');
        if (currentView === 'commands') loadHistory();
        renderAll();
    };
});

document.getElementById('sidebar-toggle').onclick = () => {
    document.getElementById('main-sidebar').classList.toggle('hidden');
};

if ("Notification" in window) Notification.requestPermission();

// ── Charting ──
let myChart = null;
async function openGraphModal(id, name) {
    document.getElementById('graph-title').textContent = `Sensor: ${name}`;
    document.getElementById('graph-modal').classList.remove('hidden');
    
    const r = await fetch(`${API_URL}/client/telemetry/${id}`);
    const data = await r.json() || [];

    if (!data.length) {
        sonner('Sin datos históricos para este sensor', 'info');
        // If no data, we can still show an empty chart or just return
    }
    
    const labels = data.map(d => new Date(d.time || d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })).reverse();
    const tempsIn = data.map(d => d.temp_interior).reverse();
    const tempsOut = data.map(d => d.temp_exterior).reverse();

    const ctx = document.getElementById('sensor-chart').getContext('2d');
    if (myChart) myChart.destroy();
    
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Temperatura Interior (°C)',
                    data: tempsIn,
                    borderColor: '#0066ff',
                    backgroundColor: 'rgba(0,102,255,0.05)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 0,
                    pointHoverRadius: 6
                },
                {
                    label: 'Temperatura Exterior (°C)',
                    data: tempsOut,
                    borderColor: '#00d481',
                    borderDash: [5, 5],
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#fff', font: { weight: 'bold', size: 10 } } }
            },
            scales: {
                x: { ticks: { color: 'rgba(255,255,255,0.3)', maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
                y: { ticks: { color: 'rgba(255,255,255,0.3)' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}
function closeGraphModal() { document.getElementById('graph-modal').classList.add('hidden'); }

async function requestNativePermissions() {
    try {
        console.log('🛰️ Solicitando permisos nativos...');
        // 1. GPS
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(() => console.log('📍 GPS OK'), (err) => console.warn('📍 GPS Denied', err));
        }
        // 2. Camera & Mic
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach(track => track.stop()); // Just to trigger prompt
        sonner('Permisos nativos concedidos', 'success', 'SISTEMA PWA');
    } catch(e) {
        console.error('🚫 Permisos fallidos:', e);
        sonner('Permisos denegados', 'danger', 'ERROR PWA');
    }
}

// Check for PWA mode to suggest permissions
if (window.matchMedia('(display-mode: standalone)').matches || window.innerWidth < 768) {
    setTimeout(() => {
        if (!localStorage.getItem('cs-permissions-asked')) {
            if(confirm('¿Deseas activar funciones nativas (GPS, Cámara, Mic) para mejorar la experiencia?')) {
                requestNativePermissions();
                localStorage.setItem('cs-permissions-asked', 'true');
            }
        }
    }, 3000);
}

window.onload = checkAuth;
