const API_URL = '/api';
let currentView = 'dashboard';
let socket;
let allClients = [];
let allSensors = [];
let allEvents = [];
let allFirmwares = [];
let latestTelemetry = {};
let map, markers = {};
let breadcrumbStack = [];

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
    initSocket();
    initNavigation();
    fetchStats();
    fetchClients(true);
    document.getElementById('create-client-form')?.addEventListener('submit', handleCreateClient);
    document.getElementById('search-devices')?.addEventListener('input', () => renderDevices(allSensors));
    document.getElementById('search-clients')?.addEventListener('input', () => renderClients(allClients));
    document.getElementById('search-events')?.addEventListener('input', renderEvents);
    setInterval(() => { if (currentView === 'devices') fetchDevices(); if (currentView === 'dashboard') fetchStats(); }, 5000);
    
    const saved = localStorage.getItem('cs-theme');
    if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
    
    setTimeout(() => { lucide.createIcons(); initTippy(); }, 250);
});

function initTippy() { tippy('[data-tippy-content]', { animation:'shift-away', theme:'translucent', arrow:true }); }

// ── Theme ──
function toggleTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('cs-theme','dark'); }
    else { document.documentElement.setAttribute('data-theme','light'); localStorage.setItem('cs-theme','light'); }
    lucide.createIcons();
    updateMapTiles();
}

// ── Sonner ──
function sonner(title, type='success', desc='') {
    const c = document.getElementById('sonner-container');
    const icons = { success:'<circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>', error:'<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', info:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>' };
    const colors = { success:'var(--success)', error:'var(--danger)', info:'var(--unifi-blue)' };
    const t = document.createElement('div'); t.className='sonner-toast';
    t.innerHTML = `<svg class="sonner-icon ${type}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icons[type]||icons.info}</svg><div class="sonner-body"><div class="sonner-title">${title}</div>${desc?`<div class="sonner-desc">${desc}</div>`:''}</div><div class="sonner-progress" style="background:${colors[type]}"></div>`;
    t.style.position='relative'; t.style.overflow='hidden';
    c.appendChild(t);
    setTimeout(() => { t.classList.add('removing'); setTimeout(()=>t.remove(),350); }, 3000);
}
function showToast(m,t) { sonner(m,t); }

// ── Socket ──
function initSocket() {
    socket = io();
    socket.on('sensor-event', (data) => {
        allEvents.unshift(data);
        if (allEvents.length > 100) allEvents.pop();
        if (currentView === 'events') renderEvents();
        if (data.topic?.includes('telemetry')) {
            try { 
                const payload = JSON.parse(data.message);
                latestTelemetry[data.origin] = payload; 
                // Update specific sensor in allSensors to persist data during view
                const s = allSensors.find(x => x.id === data.origin);
                if (s) { 
                    s.rssi = payload.rssi; 
                    s.temp_interior = payload.temp_interior !== undefined ? payload.temp_interior : payload.t_in || payload.temp; 
                    s.temp_exterior = payload.temp_exterior !== undefined ? payload.temp_exterior : payload.t_out;
                    s.door_open = payload.door_open !== undefined ? payload.door_open : payload.p; 
                    s.ip = payload.ip;
                    s.mac = payload.mac;
                    s.uptime = payload.uptime_secs || payload.u;
                    s.fw = payload.fw || s.fw;
                }
                if (currentView === 'devices') renderDevices(allSensors); 
                if (currentView === 'dashboard') fetchStats();
            } catch(e) {}
        }
    });

    socket.on('sensor-ack', (data) => {
        console.log('ACK:', data);
        sonner('Comando Confirmado','success',`Dispositivo ${data.sensorId} recibió ${data.cmdId}`);
        // Visual indicator in table if needed
        const s = allSensors.find(x => x.id === data.sensorId);
        if (s) { s.last_cmd_status = 'success'; renderDevices(allSensors); }
    });
}

// ── Navigation ──
function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        const view = btn.dataset.view;
        if (!view) return;
        btn.onclick = () => navigateTo(view, btn.querySelector('span')?.textContent || view);
    });
    document.getElementById('sidebar-toggle').onclick = () => document.getElementById('main-sidebar').classList.toggle('collapsed');
}

function navigateTo(view, title) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-view="${view}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    document.querySelectorAll('.view-module').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${view}`)?.classList.remove('hidden');
    currentView = view;
    document.getElementById('view-title').textContent = title;
    breadcrumbStack = [{ view, title }];
    updateBreadcrumb();
    if (view === 'map') { initMap(); fetchMapData(); }
    if (view === 'devices') fetchDevices();
    if (view === 'clients') fetchClients();
    if (view === 'events') renderEvents();
    lucide.createIcons(); initTippy();
}

// ── Breadcrumb ──
function updateBreadcrumb() {
    const bc = document.getElementById('breadcrumb');
    if (!bc) return;
    if (breadcrumbStack.length <= 1) { bc.innerHTML = ''; return; }
    bc.innerHTML = breadcrumbStack.map((item, i) => {
        if (i < breadcrumbStack.length - 1) {
            return `<a onclick="navigateTo('${item.view}','${item.title}')">${item.title}</a><span class="breadcrumb-sep">/</span>`;
        }
        return `<span>${item.title}</span>`;
    }).join('');
}

// ── Stats ──
async function fetchStats() {
    try {
        const [r1, r2] = await Promise.all([fetch(`${API_URL}/admin/sensors`), fetch(`${API_URL}/admin/clients`)]);
        allSensors = await r1.json(); allClients = await r2.json();
        document.getElementById('stat-clients').textContent = allClients.length;
        document.getElementById('stat-sensors').textContent = allSensors.length;
        document.getElementById('stat-pending').textContent = allSensors.filter(s => s.status === 'pending').length;
    } catch(e) {}
}

// ── Devices ──
async function fetchDevices() { const r = await fetch(`${API_URL}/admin/sensors`); allSensors = await r.json(); renderDevices(allSensors); }

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

function renderDevices(sensors) {
    const term = (document.getElementById('search-devices')?.value || '').toLowerCase();
    const filtered = sensors.filter(s => s.id.toLowerCase().includes(term) || (s.name||'').toLowerCase().includes(term) || (s.client_name||'').toLowerCase().includes(term));
    const tbody = document.getElementById('sensors-list-body'); if (!tbody) return;
    tbody.innerHTML = filtered.map(s => {
        const tel = latestTelemetry[s.id] || {};
        const tIn = tel.temp_interior !== undefined ? tel.temp_interior : s.temp_interior;
        const tOut = tel.temp_exterior !== undefined ? tel.temp_exterior : s.temp_exterior;
        const uptime = tel.uptime || s.uptime;
        const ip = tel.ip || s.ip || '---';
        const mac = tel.mac || s.mac || '---';
        const door = tel.door_open !== undefined ? tel.door_open : s.door_open;
        
        const client = s.client_name ? `<div style="font-weight:700;">${s.client_name}</div>` : '<span style="opacity:0.3">Sin asignar</span>';
        const fwPill = (tel.fw || s.fw) ? `<span class="pill" style="font-size:0.55rem;background:rgba(0,102,255,0.08);color:var(--unifi-blue);">FW ${tel.fw || s.fw}</span>` : '<span style="opacity:0.3;font-size:0.65rem;">---</span>';
        
        const sig = getWifiIcon(tel.rssi || s.rssi);
        const rssiHtml = (tel.rssi || s.rssi) ? `<div style="display:flex;align-items:center;gap:4px;color:${sig.color};font-weight:700;font-size:0.65rem;"><i data-lucide="${sig.icon}" style="width:12px;height:12px;"></i> ${tel.rssi||s.rssi}dBm</div>` : '<span style="opacity:0.2">—</span>';
        
        return `<tr>
            <td><div style="display:flex;align-items:center;gap:8px;">
                ${s.image_url ? `<img src="${s.image_url}" style="width:24px;height:24px;border-radius:4px;object-fit:cover;border:1px solid var(--border-light);">` : '<div style="width:24px;height:24px;background:var(--input-bg);border-radius:4px;display:flex;align-items:center;justify-content:center;"><i data-lucide="camera" style="width:10px;opacity:0.2;"></i></div>'}
                <code style="color:var(--unifi-blue);font-weight:800;">${s.id}</code>
            </div></td>
            <td>
                <div style="font-size:0.75rem; font-weight:600;">${ip}</div>
                <div style="font-size:0.6rem; opacity:0.4; font-family:monospace;">${mac}</div>
            </td>
            <td><strong>${s.name || '---'}</strong></td>
            <td>
                <div style="display:flex; gap:8px;">
                    <div data-tippy-content="Interior"><span style="font-size:0.6rem; opacity:0.5;">IN</span> <strong style="color:var(--success)">${tIn !== undefined ? tIn+'°' : '--'}</strong></div>
                    <div data-tippy-content="Exterior"><span style="font-size:0.6rem; opacity:0.5;">OUT</span> <strong style="color:var(--unifi-blue)">${tOut !== undefined ? tOut+'°' : '--'}</strong></div>
                </div>
            </td>
            <td style="font-weight:800;color:${door?'var(--danger)':'var(--success)'};">${door !== undefined ? (door ? 'ABIERTA':'CERRADA') : '--'}</td>
            <td style="font-size:0.75rem; font-weight:600;">${formatUptime(uptime)}</td>
            <td>
                ${client}
                <div style="display:flex; gap:6px; align-items:center; margin-top:4px;">
                    ${fwPill} ${rssiHtml}
                </div>
            </td>
            <td><div style="display:flex;gap:4px;">
                <button class="action-btn" onclick="openEditModal('${s.id}',\`${(s.name||'').replace(/`/g,'')}\`,'${s.client_id||''}','${s.image_url||''}','${s.temp_min}','${s.temp_max}')" data-tippy-content="Editar"><i data-lucide="pencil" style="width:12px;height:12px;"></i></button>
                <button class="action-btn" onclick="openRebootModal('${s.id}',\`${(s.name||'').replace(/`/g,'')}\`)" data-tippy-content="Reiniciar"><i data-lucide="refresh-cw" style="width:12px;height:12px;"></i></button>
                <button class="action-btn" onclick="openOpenDoorModal('${s.id}',\`${(s.name||'').replace(/`/g,'')}\`)" data-tippy-content="Abrir puerta GPIO"><i data-lucide="unlock" style="width:12px;height:12px;"></i></button>
                <button class="action-btn delete" onclick="openDeleteModal('${s.id}')" data-tippy-content="Eliminar"><i data-lucide="trash-2" style="width:12px;height:12px;"></i></button>
            </div></td>
        </tr>`;
    }).join('');
    lucide.createIcons(); initTippy();
}

// ── Edit Modal ──
function openEditModal(id, currentName, currentClientId, currentImageUrl, tMin, tMax) {
    const modal = document.getElementById('edit-device-modal');
    document.getElementById('modal-edit-title').textContent = `Configurar Sensor: ${id}`;
    document.getElementById('edit-sensor-name').value = currentName || '';
    document.getElementById('edit-sensor-photo').value = currentImageUrl || '';
    document.getElementById('edit-sensor-tmin').value = parseFloat(tMin) || -20.0;
    document.getElementById('edit-sensor-tmax').value = parseFloat(tMax) || 10.0;
    
    // Client Select
    const clientSelect = document.getElementById('edit-sensor-client');
    if (clientSelect) {
        clientSelect.innerHTML = '<option value="">Sin Cliente</option>' + allClients.map(c => `<option value="${c.id}" ${c.id==currentClientId?'selected':''}>${c.name}</option>`).join('');
    }

    // Firmware Select
    const fwSelect = document.getElementById('edit-sensor-fw-select');
    if (fwSelect) {
        fwSelect.innerHTML = allFirmwares.map(f => `<option value="${f.version}">${f.version} - ${f.filename.split('/').pop()}</option>`).join('');
    }
    
    document.getElementById('save-device-btn').onclick = () => saveDevice(id);
    document.getElementById('ota-update-btn').onclick = () => {
        const selectedFw = document.getElementById('edit-sensor-fw-select').value;
        sendAdminCommand(id, 'ota_update', selectedFw);
    };
    
    modal.classList.remove('hidden');
    lucide.createIcons();
}
function closeEditModal() { document.getElementById('edit-device-modal').classList.add('hidden'); }

async function saveDevice(id) {
    const name = document.getElementById('edit-sensor-name').value;
    const client_id = document.getElementById('edit-sensor-client').value;
    const image_url = document.getElementById('edit-sensor-photo').value;
    const temp_min = document.getElementById('edit-sensor-tmin').value;
    const temp_max = document.getElementById('edit-sensor-tmax').value;
    
    const r = await fetch(`${API_URL}/admin/sensors/${id}`, {
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name, branch_id: null, image_url, temp_min, temp_max })
    });

    if (client_id) {
        await fetch(`${API_URL}/admin/sensors/${id}/assign`, { 
            method:'PUT', 
            headers:{'Content-Type':'application/json'}, 
            body:JSON.stringify({ client_id }) 
        });
    }
    
    if (r.ok) {
        sonner('Hardware actualizado','success',`${id} configurado`);
        closeEditModal(); fetchDevices();
    }
}

// ── Delete Modal ──
function openDeleteModal(id) {
    document.getElementById('delete-device-modal').classList.remove('hidden');
    document.getElementById('delete-device-id').textContent = id;
    document.getElementById('confirm-delete-btn').onclick = () => confirmDelete(id);
    lucide.createIcons();
}
function closeDeleteModal() { document.getElementById('delete-device-modal').classList.add('hidden'); }

async function confirmDelete(id) {
    await fetch(`${API_URL}/admin/sensors/${id}`, { method:'DELETE' });
    sonner('Equipo eliminado','error',`${id} dado de baja del sistema`);
    closeDeleteModal(); fetchDevices();
}

// ── Clients ──
async function fetchClients(silent=false) { const r = await fetch(`${API_URL}/admin/clients`); allClients = await r.json(); if (!silent) renderClients(allClients); }

function renderClients(clients) {
    const term = (document.getElementById('search-clients')?.value || '').toLowerCase();
    const filtered = clients.filter(c => c.name.toLowerCase().includes(term));
    const container = document.getElementById('clients-list-container'); if (!container) return;
    container.innerHTML = filtered.map(c => {
        const statusMap = { active: { label: 'Activo', color: 'var(--success)' }, suspended: { label: 'Bloqueado', color: 'var(--danger)' }, trial: { label: 'Prueba', color: 'var(--warning)' } };
        const status = statusMap[c.status] || statusMap.active;
        return `<tr>
            <td><strong>${c.name}</strong><br><span style="font-size:0.55rem; opacity:0.5; text-transform:uppercase;">Plan ${c.plan || 'Free'}</span></td>
            <td><span class="pill" style="background:rgba(0,102,255,0.08); color:var(--unifi-blue);">${c.device_count||0} / ${c.max_devices || 10}</span></td>
            <td><span class="status-orb" style="background:${status.color}"></span> <span style="font-size:0.72rem; font-weight:700;">${status.label}</span></td>
            <td><code style="opacity:0.4;">#${c.id}</code></td>
            <td><div style="display:flex; gap:3px;">
                <button onclick="openEditClientModal('${c.id}')" class="action-btn" data-tippy-content="Moderar Suscripción y Datos"><i data-lucide="shield-check" style="width:12px;height:12px;"></i></button>
                <button onclick="enterClientPanel('${c.id}')" class="btn-sm btn-primary"><i data-lucide="external-link" style="width:12px;height:12px;"></i> Portal</button>
                <button onclick="viewClientDevices('${c.id}','${c.name}')" class="btn-sm btn-ghost"><i data-lucide="package" style="width:12px;height:12px;"></i></button>
            </div></td>
        </tr>`;
    }).join('');
    lucide.createIcons(); initTippy();
}

function viewClientDevices(clientId, clientName) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-module').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-devices').classList.remove('hidden');
    currentView = 'devices';
    document.getElementById('view-title').textContent = `Equipos de ${clientName}`;
    breadcrumbStack = [{ view:'clients', title:'Empresas SaaS' }, { view:'devices', title:`Equipos de ${clientName}` }];
    updateBreadcrumb();
    renderDevices(allSensors.filter(s => parseInt(s.client_id) === parseInt(clientId)));
}

// ── New Client Modal ──
function openNewClientModal() { document.getElementById('new-client-modal').classList.remove('hidden'); lucide.createIcons(); }
function closeNewClientModal() { document.getElementById('new-client-modal').classList.add('hidden'); }

async function handleCreateClient(e) {
    e.preventDefault();
    const r = await fetch(`${API_URL}/admin/clients`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name: document.getElementById('client-name').value, username: document.getElementById('admin-user').value, password: document.getElementById('admin-pass').value }) });
    if (r.ok) { sonner('Empresa creada','success','Cliente SaaS provisionado'); e.target.reset(); closeNewClientModal(); fetchClients(); fetchStats(); }
}

// ── Edit Client Modal ──
let editingClientId = null;
async function openEditClientModal(id) {
    editingClientId = id;
    const r = await fetch(`${API_URL}/admin/clients/${id}`);
    const c = await r.json();
    document.getElementById('edit-client-name').value = c.name || '';
    document.getElementById('edit-client-contact').value = c.contact_name || '';
    document.getElementById('edit-client-phone').value = c.contact_phone || '';
    document.getElementById('edit-client-email').value = c.contact_email || '';
    document.getElementById('edit-client-address').value = c.address || '';
    document.getElementById('edit-client-lat').value = c.lat || '';
    document.getElementById('edit-client-lng').value = c.lng || '';
    
    // Subscription
    document.getElementById('edit-client-plan').value = c.plan || 'free';
    document.getElementById('edit-client-status').value = c.status || 'active';
    document.getElementById('edit-client-sub-end').value = c.subscription_end ? c.subscription_end.split('T')[0] : '';
    document.getElementById('edit-client-max-dev').value = c.max_devices || 10;
    
    document.getElementById('save-client-btn').onclick = saveClientChanges;
    const fwSelect = document.getElementById('edit-sensor-fw-select');
    if(fwSelect) {
        fwSelect.innerHTML = allFirmwares.map(f => `<option value="${f.version}">${f.version} - ${f.filename.split('/').pop()}</option>`).join('');
    }

    document.getElementById('edit-client-modal').classList.remove('hidden');
    lucide.createIcons();
}
function closeEditClientModal() { document.getElementById('edit-client-modal').classList.add('hidden'); editingClientId = null; }

async function saveClientChanges() {
    const basicData = {
        name: document.getElementById('edit-client-name').value,
        contact_name: document.getElementById('edit-client-contact').value,
        contact_phone: document.getElementById('edit-client-phone').value,
        contact_email: document.getElementById('edit-client-email').value,
        address: document.getElementById('edit-client-address').value,
        lat: parseFloat(document.getElementById('edit-client-lat').value) || null,
        lng: parseFloat(document.getElementById('edit-client-lng').value) || null
    };

    const subData = {
        plan: document.getElementById('edit-client-plan').value,
        status: document.getElementById('edit-client-status').value,
        subscription_end: document.getElementById('edit-client-sub-end').value,
        max_devices: parseInt(document.getElementById('edit-client-max-dev').value) || 10
    };

    await Promise.all([
        fetch(`${API_URL}/admin/clients/${editingClientId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(basicData) }),
        fetch(`${API_URL}/admin/clients/${editingClientId}/subscription`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(subData) })
    ]);

    sonner('Empresa y Suscripción actualizadas','success',basicData.name);
    closeEditClientModal(); fetchClients();
}

async function enterClientPanel(clientId) {
    const r = await fetch(`${API_URL}/admin/impersonate`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({clientId}) });
    if (r.ok) window.location.href = '/';
}

// ── Events ──
async function renderEvents() {
    if (!allEvents.length) {
        const r = await fetch(`${API_URL}/admin/events`);
        allEvents = await r.json();
    }
    const term = (document.getElementById('search-events')?.value || '').toLowerCase();
    const filtered = allEvents.filter(d => d.origin?.toLowerCase().includes(term) || d.topic?.toLowerCase().includes(term) || d.payload?.toLowerCase().includes(term));
    const tbody = document.getElementById('events-log'); if (!tbody) return;
    tbody.innerHTML = filtered.slice(0,100).map(d => `<tr>
        <td><code style="color:var(--unifi-blue)">${d.sensor_id || d.origin}</code></td>
        <td style="opacity:0.5; font-size:0.72rem;">${d.topic}</td>
        <td><span class="status-orb online" style="background:#00d481"></span> STORED</td>
        <td style="color:var(--text-secondary); font-size:0.72rem;">${new Date(d.timestamp || d.time).toLocaleString()}</td>
    </tr>`).join('');
}

// ── Map ──
const TILES_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILES_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
let tileLayer = null;

function initMap() {
    if (map) { map.invalidateSize(); updateMapTiles(); return; }
    map = L.map('map', { zoomControl: false }).setView([-34.9, -56.1], 13);
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    tileLayer = L.tileLayer(isLight ? TILES_LIGHT : TILES_DARK, { attribution: '' }).addTo(map);
    setTimeout(() => map.invalidateSize(), 200);
}

function updateMapTiles() {
    if (!map || !tileLayer) return;
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    tileLayer.setUrl(isLight ? TILES_LIGHT : TILES_DARK);
}

async function fetchMapData() {
    const sensors = allSensors.length ? allSensors : (await (await fetch(`${API_URL}/admin/sensors`)).json());
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};
    
    // ONLY show sensors on map as requested
    sensors.forEach(s => {
        if (s.lat && s.lng) {
            markers['sensor-'+s.id] = L.circleMarker([s.lat, s.lng], {
                radius: 8,
                fillColor: '#0066ff',
                color: '#fff',
                weight: 2,
                fillOpacity: 1
            }).addTo(map).bindPopup(`
                <div style="padding:4px;">
                    <strong style="color:var(--unifi-blue);">${s.name || s.id}</strong><br>
                    <span style="font-size:0.65rem; opacity:0.6;">${s.id}</span>
                </div>
            `);
        }
    });

    if (sensors.some(s => s.lat && s.lng)) {
        const first = sensors.find(s => s.lat && s.lng);
        map.setView([first.lat, first.lng], 13);
    }
}

// ── Map Command Bar Logic ──
function handleMapSearch() {
    const term = document.getElementById('map-search-input').value.toLowerCase();
    const resultsDiv = document.getElementById('map-search-results');
    
    if (!term) { resultsDiv.classList.add('hidden'); return; }
    
    const matches = allSensors.filter(s => 
        s.id.toLowerCase().includes(term) || 
        (s.name || '').toLowerCase().includes(term)
    );
    
    if (!matches.length) { resultsDiv.classList.add('hidden'); return; }
    
    resultsDiv.innerHTML = matches.map(s => `
        <div class="search-result-item" onclick="flyToSensor('${s.id}', ${s.lat}, ${s.lng})">
            <i data-lucide="cpu" style="width:14px;height:14px;color:var(--unifi-blue);"></i>
            <div>
                <strong>${s.name || s.id}</strong><br>
                <span>${s.id} · ${s.client_name || 'Sin cliente'}</span>
            </div>
        </div>
    `).join('');
    
    resultsDiv.classList.remove('hidden');
    lucide.createIcons();
}

function flyToSensor(id, lat, lng) {
    document.getElementById('map-search-results').classList.add('hidden');
    document.getElementById('map-search-input').value = '';
    
    if (!lat || !lng) {
        sonner('Sin ubicación', 'error', `El sensor ${id} no tiene coordenadas.`);
        return;
    }
    
    map.flyTo([lat, lng], 18, { duration: 1.5 });
    setTimeout(() => markers['sensor-'+id]?.openPopup(), 1600);
}

// ── Utils ──
async function checkAdminAuth() { 
    try {
        const r = await fetch(`${API_URL}/auth/me`); 
        const u = await r.json(); 
        if (!u || u.role !== 'admin') {
            window.location.href = '/admin-login.html'; 
            return;
        }
        document.getElementById('user-name').textContent = 'ADMIN FLOW';
        await loadAllData();
    } catch(e) {
        console.error('🛡️ Auth Error:', e);
        window.location.href = '/admin-login.html'; 
    }
}

async function handleLogout() { 
    await fetch(`${API_URL}/auth/logout`, {method:'POST'}); 
    window.location.href = '/admin-login.html'; 
}

async function loadAllData() {
    console.log('📦 Loading Admin Data...');
    try {
        const [sRes, cRes, fRes] = await Promise.all([
            fetch(`${API_URL}/admin/sensors`), 
            fetch(`${API_URL}/admin/clients`),
            fetch(`${API_URL}/admin/firmwares`)
        ]);
        allSensors = await sRes.json();
        allClients = await cRes.json();
        allFirmwares = await fRes.json();
        renderAll();
    } catch(e) { console.error('📦 Load error:', e); }
}

function renderAll() {
    if(currentView === 'devices') renderDevices(allSensors);
    if(currentView === 'clients') renderClients(allClients);
    if(currentView === 'firmwares') renderFirmwares();
    if(currentView === 'events') renderEvents();
    if(currentView === 'map') { initMap(); fetchMapData(); }
}

// ── Firmwares ──
function renderFirmwares() {
    const list = document.getElementById('firmwares-table-body'); if(!list) return;
    list.innerHTML = allFirmwares.map(f => `
        <tr>
            <td><div style="font-weight:900; color:var(--unifi-blue);">${f.version}</div></td>
            <td style="font-size:0.65rem; opacity:0.4; font-family:monospace;">${f.filename}</td>
            <td><div style="font-size:0.65rem; max-width:400px; white-space:pre-line;">${f.changelog || 'Sin cambios registrados'}</div></td>
            <td style="font-size:0.6rem; opacity:0.5;">${new Date(f.created_at).toLocaleString()}</td>
            <td>
                <button class="btn-sm btn-ghost" style="color:var(--danger);" onclick="deleteFirmware(${f.id})"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

function openFirmwareModal() { document.getElementById('firmware-modal').classList.remove('hidden'); }
function closeFirmwareModal() { document.getElementById('firmware-modal').classList.add('hidden'); }

async function saveFirmware() {
    const version = document.getElementById('fw-version').value;
    const filename = document.getElementById('fw-filename').value;
    const changelog = document.getElementById('fw-changelog').value;
    if(!version || !filename) return sonner('Campos requeridos', 'error');

    const r = await fetch(`${API_URL}/admin/firmwares`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ version, filename, changelog })
    });
    if (r.ok) {
        sonner('Firmware registrado', 'success', 'OTA ENGINE');
        closeFirmwareModal();
        loadAllData();
    }
}

async function deleteFirmware(id) {
    if(!confirm('¿Eliminar versión?')) return;
    await fetch(`${API_URL}/admin/firmwares/${id}`, { method:'DELETE' });
    loadAllData();
}

// ── Remote Commands (Modals) ──
function openRebootModal(id, name) {
    document.getElementById('reboot-device-modal').classList.remove('hidden');
    document.getElementById('reboot-device-name').textContent = name || id;
    document.getElementById('confirm-reboot-btn').onclick = () => {
        sendAdminCommand(id, 'reboot');
        closeRebootModal();
    };
    lucide.createIcons();
}
function closeRebootModal() { document.getElementById('reboot-device-modal').classList.add('hidden'); }

function openOpenDoorModal(id, name) {
    document.getElementById('open-door-modal').classList.remove('hidden');
    document.getElementById('door-device-name').textContent = name || id;
    document.getElementById('confirm-open-door-btn').onclick = () => {
        sendAdminCommand(id, 'open_door');
        closeOpenDoorModal();
    };
    lucide.createIcons();
}
function closeOpenDoorModal() { document.getElementById('open-door-modal').classList.add('hidden'); }

async function sendAdminCommand(sensorId, cmd) {
    try {
        const r = await fetch(`${API_URL}/admin/sensors/${sensorId}/command`, { 
            method:'POST', 
            headers:{'Content-Type':'application/json'}, 
            body:JSON.stringify({cmd}) 
        });
        if (r.ok) sonner('Comando enviado', 'success', `${cmd} → ${sensorId}`);
        else { 
            const err = await r.json(); 
            sonner('Error', 'error', err.error || 'No se pudo enviar'); 
        }
    } catch(e) { sonner('Error de conexión', 'error'); }
}
