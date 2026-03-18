/* ═══════════════════════════════════════════════════════
   ELV Sales / Presales Panel — JavaScript
═══════════════════════════════════════════════════════ */

const API = '/api';
let token = localStorage.getItem('elv_token');
let currentUser = JSON.parse(localStorage.getItem('elv_user') || '{}');
let allProjects = [];
let map, marker;
let selectedModules = new Set();
let excelData = null;

// ── Auth check ────────────────────────────────────────
if (!token || (currentUser.role !== 'sales' && currentUser.role !== 'presales' && currentUser.role !== 'admin')) {
  window.location.href = '/';
}

const headers = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` });

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
  if (res.status === 401) { logout(); return; }
  return res;
}

// ── Init ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('sidebar-name').textContent = currentUser.full_name || 'Sales User';
  const av = document.getElementById('sidebar-avatar');
  av.textContent = (currentUser.full_name || 'S')[0].toUpperCase();
  av.style.background = currentUser.avatar_color || '#8B0000';

  initMap();

  await loadProjects();

  loadNotifications();
  setInterval(loadNotifications, 30000);
  setInterval(loadProjects, 60000);

  // Nav click handlers
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });

  // Map search autocomplete (debounced)
  let mapSearchTimeout = null;
  document.getElementById('map-search-input').addEventListener('input', function() {
    clearTimeout(mapSearchTimeout);
    const query = this.value.trim();
    if (query.length < 3) {
      document.getElementById('map-search-results').style.display = 'none';
      return;
    }
    mapSearchTimeout = setTimeout(() => searchMapLocation(), 400);
  });

  // Excel drag & drop
  const uploadArea = document.getElementById('excel-upload-area');
  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleExcelUpload({ files: [file] });
  });

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
});

// ── Mobile Sidebar ─────────────────────────────────────
function closeSidebar() {}

// ── Navigation ────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .mobile-nav-tab').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));

  const titles = { 'projects': 'All Projects', 'new-project': 'New Project', 'quotation-builder': 'Quotation Builder' };
  document.getElementById('page-title').textContent = titles[page] || page;

  if (page === 'projects') loadProjects();
  if (page === 'new-project') {
    resetProjectForm();
    setTimeout(() => map?.invalidateSize(), 200);
  }
  if (page === 'quotation-builder') initQB();

  closeSidebar();
}

// ── Projects ──────────────────────────────────────────
async function loadProjects() {
  const res = await apiFetch('/projects');
  if (!res?.ok) return;
  allProjects = await res.json();
  renderProjects(allProjects);
}

function renderProjects(projects) {
  document.getElementById('projects-count').textContent = `${projects.length} project${projects.length !== 1 ? 's' : ''}`;
  const grid = document.getElementById('projects-grid');
  grid.innerHTML = projects.map(p => {
    const users = [p.user1_name, p.user2_name].filter(Boolean).join(' & ');
    return `
      <div class="project-card" onclick="openProjectDetail(${p.id})">
        <div class="project-card-header">
          <div class="proj-name">${p.project_name}</div>
          <div class="proj-client">${p.client_name_1 || 'No client'}</div>
          <div class="proj-priority">${p.priority || 'normal'}</div>
          <div class="hex-pattern"></div>
        </div>
        <div class="project-card-body">
          <div class="proj-meta">
            ${p.location_name ? `<div class="proj-meta-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg> ${p.location_name}</div>` : ''}
            ${p.start_date ? `<div class="proj-meta-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${p.start_date} → ${p.end_date || 'TBD'}</div>` : ''}
            ${users
              ? `<div class="proj-meta-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> ${users}</div>`
              : `<div class="proj-meta-row" style="color:var(--warning)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Awaiting team assignment</div>`}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="badge badge-${p.status === 'in_progress' ? 'progress' : p.status}">${p.status?.replace('_',' ') || 'pending'}</span>
            <span style="font-size:12px;color:var(--gray-400)">${p.module_count || 0} module${p.module_count !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="project-card-footer">
          <span style="font-size:12px;color:var(--gray-400)">${formatDate(p.created_at)}</span>
          <span style="font-size:12px;color:var(--gray-400)">View details →</span>
        </div>
      </div>
    `;
  }).join('') || `<div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;text-align:center">
    <div style="width:96px;height:96px;background:var(--gray-100);border-radius:24px;display:flex;align-items:center;justify-content:center;margin-bottom:24px">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" stroke-width="1.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
    </div>
    <h3 style="font-size:20px;font-weight:700;color:var(--gray-700);margin-bottom:8px">No projects yet</h3>
    <p style="font-size:14px;color:var(--gray-500);margin-bottom:24px;max-width:320px">Submit your first project to start coordinating with the technical team.</p>
    <button class="btn btn-danger" onclick="navigate('new-project')" style="padding:12px 28px;font-size:15px;font-weight:600;border-radius:12px;display:inline-flex;align-items:center;gap:8px">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      Create First Project
    </button>
  </div>`;
}

function filterProjects() {
  const status = document.getElementById('filter-status').value;
  const term = (document.getElementById('global-search').value || '').toLowerCase();
  let filtered = allProjects;
  if (status) filtered = filtered.filter(p => p.status === status);
  if (term) filtered = filtered.filter(p =>
    p.project_name?.toLowerCase().includes(term) ||
    p.client_name_1?.toLowerCase().includes(term) ||
    p.location_name?.toLowerCase().includes(term)
  );
  renderProjects(filtered);
}

// ── Project Detail Modal ──────────────────────────────
async function openProjectDetail(id) {
  openModal('project-detail-modal');
  document.getElementById('proj-detail-body').innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner" style="margin:auto"></div></div>';

  const res = await apiFetch(`/projects/${id}`);
  if (!res?.ok) {
    document.getElementById('proj-detail-body').innerHTML = '<p class="text-muted">Failed to load project</p>';
    return;
  }
  const p = await res.json();
  document.getElementById('proj-detail-title').textContent = p.project_name;

  document.getElementById('proj-detail-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px">
      <div>
        <h4 style="font-size:13px;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Project Info</h4>
        <table style="width:100%;font-size:14px">
          <tr><td style="color:var(--gray-500);padding:5px 0;width:120px">Client</td><td>${p.client_name_1 || '—'}${p.client_name_2 ? ' / '+p.client_name_2 : ''}</td></tr>
          <tr><td style="color:var(--gray-500);padding:5px 0">Contact</td><td>${p.client_number || '—'}</td></tr>
          <tr><td style="color:var(--gray-500);padding:5px 0">Location</td><td>${p.location_name || '—'}${p.location_lat ? ` <a href="https://maps.google.com/?q=${p.location_lat},${p.location_lng}" target="_blank" style="color:var(--red);font-size:12px">View on Maps</a>` : ''}</td></tr>
          <tr><td style="color:var(--gray-500);padding:5px 0">Start</td><td>${p.start_date || '—'}</td></tr>
          <tr><td style="color:var(--gray-500);padding:5px 0">End (Est.)</td><td>${p.end_date || '—'}</td></tr>
          <tr><td style="color:var(--gray-500);padding:5px 0">Priority</td><td>${priorityBadge(p.priority)}</td></tr>
          <tr><td style="color:var(--gray-500);padding:5px 0">Status</td><td>${statusBadge(p.status)}</td></tr>
        </table>
      </div>
      <div>
        <h4 style="font-size:13px;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Assigned Team</h4>
        ${p.user1_name ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><div class="user-avatar" style="background:${p.user1_color || 'var(--red)'};width:38px;height:38px;font-size:14px;border-radius:10px">${p.user1_name[0].toUpperCase()}</div><div><div style="font-size:14px;font-weight:600">${p.user1_name}</div><div style="font-size:12px;color:var(--gray-400)">Primary Technician</div></div></div>` : ''}
        ${p.user2_name ? `<div style="display:flex;align-items:center;gap:10px"><div class="user-avatar" style="background:${p.user2_color || '#8B0000'};width:38px;height:38px;font-size:14px;border-radius:10px">${p.user2_name[0].toUpperCase()}</div><div><div style="font-size:14px;font-weight:600">${p.user2_name}</div><div style="font-size:12px;color:var(--gray-400)">Secondary Technician</div></div></div>` : ''}
        ${!p.user1_name && !p.user2_name ? `
          <div style="background:#FFF9F0;border:1px solid #F39C12;border-radius:8px;padding:12px 14px;font-size:13px;color:#7D5A00;">
            <strong>Pending Assignment</strong><br>The admin will assign technicians to this project.
          </div>` : ''}
      </div>
    </div>

    <h4 style="font-size:15px;font-weight:700;margin-bottom:16px">Modules (${p.modules?.length || 0})</h4>
    <div style="display:flex;flex-direction:column;gap:16px">
      ${(p.modules || []).map(m => renderModuleCard(m)).join('') || '<p class="text-muted text-small">No modules</p>'}
    </div>
  `;
}

function renderModuleCard(m) {
  const done = m.checklist.filter(c => c.is_completed).length;
  const total = m.checklist.length;
  const progress = total > 0 ? Math.round((done/total)*100) : m.progress;

  return `
    <div style="border:2px solid var(--gray-200);border-radius:12px;overflow:hidden">
      <div style="background:var(--gray-50);padding:14px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--gray-200)">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:18px">${moduleIcon(m.module_type)}</span>
          <strong style="font-size:15px">${m.module_type}</strong>
          ${statusBadge(m.status)}
        </div>
        <div style="font-size:13px;font-weight:700;color:var(--red)">${progress}%</div>
      </div>
      <div style="padding:16px 18px">
        <div class="progress-bar" style="margin-bottom:14px"><div class="progress-fill" style="width:${progress}%"></div></div>
        ${m.scope_of_work ? `<div style="margin-bottom:12px"><span style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-400);font-weight:700">Scope of Work</span><p style="font-size:13px;color:var(--gray-700);margin-top:4px">${m.scope_of_work}</p></div>` : ''}
        ${m.issue_details ? `<div style="margin-bottom:12px"><span style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-400);font-weight:700">Issue Details</span><p style="font-size:13px;color:var(--gray-700);margin-top:4px">${m.issue_details}</p></div>` : ''}
        ${m.devices?.length ? `
          <div style="margin-bottom:12px">
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-400);font-weight:700">Devices / Equipment (${m.devices.length})</span>
            <div style="margin-top:8px;overflow-x:auto">
              <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead><tr style="background:var(--gray-100);color:var(--gray-600)">
                  <th style="text-align:left;padding:7px 10px">#</th>
                  <th style="text-align:left;padding:7px 10px">Model</th>
                  <th style="text-align:center;padding:7px 10px">Qty</th>
                  <th style="text-align:left;padding:7px 10px">Description</th>
                  <th style="text-align:left;padding:7px 10px">Serial #</th>
                </tr></thead>
                <tbody>${m.devices.map((d, idx) => `
                  <tr style="border-bottom:1px solid var(--gray-100)">
                    <td style="padding:6px 10px;color:var(--gray-400)">${idx+1}</td>
                    <td style="padding:6px 10px;font-weight:600;color:var(--gray-800)">${d.device_model || '—'}</td>
                    <td style="padding:6px 10px;text-align:center"><span style="background:var(--red-pale);color:var(--red-dark);padding:2px 8px;border-radius:12px;font-weight:700">${d.device_qty}</span></td>
                    <td style="padding:6px 10px;color:var(--gray-600)">${d.device_description || '—'}</td>
                    <td style="padding:6px 10px;color:var(--gray-500);font-family:monospace;font-size:11px">${d.serial_number || '—'}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>` : ''}
        ${m.checklist?.length ? `
          <div>
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-400);font-weight:700">Checklist — ${done}/${total}</span>
            <div style="margin-top:6px">
              ${m.checklist.slice(0,5).map(c => `
                <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px">
                  <span style="color:${c.is_completed ? 'var(--success)' : 'var(--gray-300)'};font-size:16px">${c.is_completed ? '✓' : '○'}</span>
                  <span style="${c.is_completed ? 'text-decoration:line-through;color:var(--gray-400)' : ''}">${c.task_title}</span>
                </div>`).join('')}
              ${m.checklist.length > 5 ? `<div style="font-size:12px;color:var(--gray-400);padding:4px 0">...and ${m.checklist.length-5} more</div>` : ''}
            </div>
          </div>` : ''}
      </div>
    </div>
  `;
}

// ── New Project Form ──────────────────────────────────
function toggleModule(el) {
  const mod = el.dataset.module;
  el.classList.toggle('selected');
  if (el.classList.contains('selected')) {
    selectedModules.add(mod);
  } else {
    selectedModules.delete(mod);
  }
  renderModuleDetails();
}

function renderModuleDetails() {
  const container = document.getElementById('module-details-container');
  container.innerHTML = '';
  selectedModules.forEach(mod => {
    const slug = mod.toLowerCase().replace(/\s+/g, '-');
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-header" style="background:linear-gradient(135deg,var(--red-deep),var(--red-dark));color:white">
        <h3 class="card-title" style="color:white">${moduleIcon(mod)} ${mod} — Details</h3>
      </div>
      <div class="card-body">
        <div class="form-grid">
          <div class="form-group form-full">
            <label>Scope of Work</label>
            <textarea id="mod-scope-${slug}" rows="3" placeholder="Describe the scope of work for this module..."></textarea>
          </div>
          <div class="form-group form-full">
            <label>Issue Details / Special Notes</label>
            <textarea id="mod-issue-${slug}" rows="2" placeholder="Any known issues, special requirements..."></textarea>
          </div>
        </div>
        <div style="margin-top:16px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <label style="font-size:13px;font-weight:700;color:var(--gray-700);text-transform:uppercase;letter-spacing:0.4px">Devices / Equipment</label>
            <button class="btn btn-sm btn-secondary" onclick="addDeviceRow('${slug}')">+ Add Device</button>
          </div>
          <div id="devices-${slug}">
            <div class="device-row">
              <input placeholder="Device / Model" style="padding:8px;border:2px solid var(--gray-200);border-radius:6px;font-size:13px">
              <input type="number" placeholder="Qty" min="1" value="1" style="padding:8px;border:2px solid var(--gray-200);border-radius:6px;font-size:13px">
              <input placeholder="Description" style="padding:8px;border:2px solid var(--gray-200);border-radius:6px;font-size:13px">
              <input placeholder="Serial #" style="padding:8px;border:2px solid var(--gray-200);border-radius:6px;font-size:13px">
              <button onclick="this.closest('.device-row').remove()" class="btn btn-sm" style="color:var(--red);background:var(--red-pale)">✕</button>
            </div>
          </div>
        </div>
        ${excelData ? `<div class="alert alert-info" style="margin-top:12px">
          <strong>Excel data available!</strong> Click below to import ${excelData.devices.length} device(s).
          <button class="btn btn-sm btn-secondary" style="margin-left:8px" onclick="importExcelToModule('${slug}')">Import</button>
        </div>` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

function addDeviceRow(slug) {
  const container = document.getElementById(`devices-${slug}`);
  const row = document.createElement('div');
  row.className = 'device-row';
  row.innerHTML = `
    <input placeholder="Device / Model" style="padding:8px;border:2px solid var(--gray-200);border-radius:6px;font-size:13px">
    <input type="number" placeholder="Qty" min="1" value="1" style="padding:8px;border:2px solid var(--gray-200);border-radius:6px;font-size:13px">
    <input placeholder="Description" style="padding:8px;border:2px solid var(--gray-200);border-radius:6px;font-size:13px">
    <input placeholder="Serial #" style="padding:8px;border:2px solid var(--gray-200);border-radius:6px;font-size:13px">
    <button onclick="this.closest('.device-row').remove()" class="btn btn-sm" style="color:var(--red);background:var(--red-pale)">✕</button>
  `;
  container.appendChild(row);
}

function importExcelToModule(slug) {
  if (!excelData?.devices?.length) return;
  const container = document.getElementById(`devices-${slug}`);
  container.innerHTML = '';
  excelData.devices.forEach(d => {
    const row = document.createElement('div');
    row.className = 'device-row';
    row.innerHTML = `
      <input value="${d.model}" placeholder="Device / Model" style="padding:8px;border:2px solid var(--gray-200);border-radius:6px;font-size:13px">
      <input type="number" value="${d.qty}" placeholder="Qty" style="padding:8px;border:2px solid var(--gray-200);border-radius:6px;font-size:13px">
      <input value="${d.description}" placeholder="Description" style="padding:8px;border:2px solid var(--gray-200);border-radius:6px;font-size:13px">
      <input value="${d.serial}" placeholder="Serial #" style="padding:8px;border:2px solid var(--gray-200);border-radius:6px;font-size:13px">
      <button onclick="this.closest('.device-row').remove()" class="btn btn-sm" style="color:var(--red);background:var(--red-pale)">✕</button>
    `;
    container.appendChild(row);
  });
  if (excelData.scope_of_work) {
    const scopeEl = document.getElementById(`mod-scope-${slug}`);
    if (scopeEl && !scopeEl.value) scopeEl.value = excelData.scope_of_work;
  }
}

async function submitProject() {
  const name = document.getElementById('p-name').value.trim();
  if (!name) { showToast('Project name is required', 'error'); return; }
  if (selectedModules.size === 0) { showToast('Please select at least one module', 'error'); return; }

  const modules = [];
  for (const mod of selectedModules) {
    const slug = mod.toLowerCase().replace(/\s+/g, '-');
    const scope = document.getElementById(`mod-scope-${slug}`)?.value || '';
    const issue = document.getElementById(`mod-issue-${slug}`)?.value || '';
    const deviceRows = document.querySelectorAll(`#devices-${slug} .device-row`);
    const devices = [];
    deviceRows.forEach(row => {
      const inputs = row.querySelectorAll('input');
      if (inputs[0]?.value) {
        devices.push({ model: inputs[0].value, qty: parseInt(inputs[1]?.value) || 1, description: inputs[2]?.value || '', serial: inputs[3]?.value || '' });
      }
    });
    modules.push({ module_type: mod, scope_of_work: scope, issue_details: issue, devices });
  }

  const payload = {
    project_name: name,
    client_name_1: document.getElementById('p-client1').value,
    client_name_2: document.getElementById('p-client2').value,
    client_number: document.getElementById('p-client-num').value,
    location_name: document.getElementById('p-location-name').value,
    location_lat: parseFloat(document.getElementById('p-lat').value) || null,
    location_lng: parseFloat(document.getElementById('p-lng').value) || null,
    priority: document.getElementById('p-priority').value,
    modules
    // Note: user_id_1, user_id_2, start_date, end_date are assigned by admin after creation
  };

  const res = await apiFetch('/projects', { method: 'POST', body: JSON.stringify(payload) });
  const data = await res.json();
  if (res.ok) {
    showToast(`Project "${name}" submitted successfully. Admin will assign the team.`, 'success');
    resetProjectForm();
    await loadProjects();
    navigate('projects');
  } else {
    showToast('Error: ' + data.error, 'error');
  }
}

function resetProjectForm() {
  ['p-name','p-client1','p-client2','p-client-num','p-location-name','p-lat','p-lng'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('p-priority').value = 'normal';
  document.querySelectorAll('.module-option.selected').forEach(el => el.classList.remove('selected'));
  selectedModules.clear();
  document.getElementById('module-details-container').innerHTML = '';
  document.getElementById('excel-result').classList.add('hidden');
  excelData = null;
  if (marker) { marker.remove(); marker = null; }
  if (map) { map.setView([31.9539, 35.9106], 8); map.invalidateSize(); }
  document.getElementById('map-search-input').value = '';
  document.getElementById('map-search-results').style.display = 'none';
  document.getElementById('map-coords').textContent = 'Search for a location above or click on the map to pin';
}

// ── Map ───────────────────────────────────────────────
const redIcon = L.divIcon({
  html: `<div style="background:var(--red);width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  className: ''
});

function initMap() {
  const jordanBounds = L.latLngBounds(
    L.latLng(29.0, 34.8),
    L.latLng(33.5, 39.4)
  );

  map = L.map('map-picker', {
    center: [31.9539, 35.9106],
    zoom: 8,
    minZoom: 7,
    maxBounds: jordanBounds.pad(0.05),
    maxBoundsViscosity: 1.0
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(map);

  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    if (marker) marker.remove();
    marker = L.marker([lat, lng], { icon: redIcon }).addTo(map);
    document.getElementById('p-lat').value = lat.toFixed(6);
    document.getElementById('p-lng').value = lng.toFixed(6);
    document.getElementById('map-coords').textContent = `Pinned: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    reverseGeocode(lat, lng);
  });
}

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'ELVCoordinator/1.0' } });
    const data = await res.json();
    if (data?.display_name) {
      const addr = data.address || {};
      const streetName = addr.road || addr.neighbourhood || addr.suburb || '';
      const area = addr.city || addr.town || addr.village || addr.state || '';
      const locationName = [streetName, area].filter(Boolean).join(', ') || data.display_name.split(',').slice(0, 2).join(',').trim();
      document.getElementById('p-location-name').value = locationName;
      document.getElementById('map-coords').textContent = `Pinned: ${locationName}`;
    }
  } catch(e) {}
}

async function searchMapLocation() {
  const query = document.getElementById('map-search-input').value.trim();
  if (!query || query.length < 2) return;
  const btn = document.getElementById('map-search-btn');
  btn.textContent = '...';
  btn.disabled = true;
  try {
    const base = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&namedetails=1&limit=10`;
    const hdr = { 'Accept-Language': 'en,ar', 'User-Agent': 'ELVCoordinator/1.0' };
    let res = await fetch(`${base}&countrycodes=jo&viewbox=34.8,29.0,39.4,33.5&q=${encodeURIComponent(query)}`, { headers: hdr });
    let results = await res.json();
    if (!results.length) {
      res = await fetch(`${base}&countrycodes=jo&q=${encodeURIComponent(query + ' Jordan')}`, { headers: hdr });
      results = await res.json();
    }
    if (!results.length) {
      res = await fetch(`${base}&q=${encodeURIComponent(query + ', Jordan')}`, { headers: hdr });
      const all = await res.json();
      results = all.filter(r => (r.address?.country_code || '').toLowerCase() === 'jo');
    }

    const listEl = document.getElementById('map-search-results');
    if (!results.length) {
      listEl.innerHTML = '<div style="padding:10px 14px;color:var(--gray-400);font-size:13px">No results found in Jordan.</div>';
      listEl.style.display = 'block';
    } else {
      window._mapSearchResults = results;
      listEl.innerHTML = results.map((r, i) => {
        const addr = r.address || {};
        const street = addr.road || addr.pedestrian || addr.path || addr.neighbourhood || '';
        const district = addr.suburb || addr.quarter || addr.neighbourhood || '';
        const area = addr.city || addr.town || addr.village || addr.county || addr.state || '';
        const parts = [street, district !== street ? district : '', area].filter(Boolean);
        const label = parts.length ? parts.join(', ') : r.display_name.split(',').slice(0, 3).join(',').trim();
        return `<div onclick="selectMapResultByIndex(${i})" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--gray-100);font-size:13px;transition:background 0.15s" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background=''">
          <strong>${label}</strong>
        </div>`;
      }).join('');
      listEl.style.display = 'block';
    }
  } catch(e) {
    console.error('Map search failed:', e);
  } finally {
    btn.textContent = '🔍';
    btn.disabled = false;
  }
}

function selectMapResultByIndex(index) {
  const r = window._mapSearchResults?.[index];
  if (!r) return;
  const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
  if (marker) marker.remove();
  marker = L.marker([lat, lng], { icon: redIcon }).addTo(map);
  map.setView([lat, lng], 17);
  document.getElementById('p-lat').value = lat.toFixed(6);
  document.getElementById('p-lng').value = lng.toFixed(6);
  const addr = r.address || {};
  const street = addr.road || addr.pedestrian || addr.neighbourhood || addr.suburb || '';
  const area = addr.city || addr.town || addr.village || addr.state || '';
  const parts = [street, area].filter(Boolean);
  const locationName = parts.length ? parts.join(', ') : r.display_name.split(',').slice(0, 2).join(',').trim();
  document.getElementById('p-location-name').value = locationName;
  document.getElementById('map-coords').textContent = `Pinned: ${locationName}`;
  document.getElementById('map-search-results').style.display = 'none';
  document.getElementById('map-search-input').value = locationName;
}

// ── Excel Upload ──────────────────────────────────────
async function handleExcelUpload(input) {
  const file = input.files ? input.files[0] : input;
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/projects/excel-parse', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  const data = await res.json();

  if (res.ok) {
    excelData = data;
    document.getElementById('excel-result').classList.remove('hidden');
    const sheetCount = data.sheets_parsed || 1;
    const sheetInfo = sheetCount > 1 ? `<span style="background:#e8f4fd;color:#2980B9;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700;margin-left:6px">${sheetCount} sheets</span>` : '';
    document.getElementById('excel-msg').innerHTML =
      `<span style="color:var(--success);font-weight:700">✓</span> Parsed <strong>${data.devices.length}</strong> device(s) from <strong>${data.raw_rows}</strong> rows${sheetInfo}`;
    document.getElementById('excel-devices-preview').innerHTML = data.devices.length
      ? `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
          <thead><tr style="background:var(--gray-100)">
            <th style="text-align:left;padding:6px 8px">Model</th><th style="text-align:center;padding:6px 8px">Qty</th>
            <th style="text-align:left;padding:6px 8px">Description</th><th style="text-align:left;padding:6px 8px">Serial</th>
          </tr></thead>
          <tbody>${data.devices.slice(0, 10).map(d => `
            <tr style="border-bottom:1px solid var(--gray-100)">
              <td style="padding:5px 8px;font-weight:600">${d.model}</td>
              <td style="padding:5px 8px;text-align:center">${d.qty}</td>
              <td style="padding:5px 8px;color:var(--gray-600)">${d.description || '—'}</td>
              <td style="padding:5px 8px;color:var(--gray-600)">${d.serial || '—'}</td>
            </tr>`).join('')}
          </tbody></table>
          ${data.devices.length > 10 ? `<div style="font-size:11px;color:var(--gray-400);margin-top:4px">...and ${data.devices.length - 10} more devices</div>` : ''}`
      : `<div style="color:var(--gray-400);font-size:12px;margin-top:6px">No devices detected. Check column headers.</div>`;
    renderModuleDetails();
  } else {
    showToast('Failed to parse file: ' + data.error, 'error');
  }
}

// ── Notifications ─────────────────────────────────────
async function loadNotifications() {
  const res = await apiFetch('/projects/notifications/mine');
  if (!res?.ok) return;
  const notes = await res.json();
  const unread = notes.filter(n => !n.is_read);
  document.getElementById('notif-dot').classList.toggle('hidden', unread.length === 0);
  const noNotifMsg = typeof t === 'function' ? t('msg.no_notifications') : 'No notifications';
  document.getElementById('notif-list').innerHTML = notes.map(n => {
    const tx = typeof tNotif === 'function' ? tNotif(n) : { title: n.title, message: n.message || '' };
    return `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markRead(${n.id})">
      <div class="notif-title">${tx.title}</div>
      <div class="notif-msg">${tx.message}</div>
      <div class="notif-time">${formatDate(n.created_at)}</div>
    </div>`;
  }).join('') || `<div style="padding:20px;text-align:center;color:var(--gray-400)">${noNotifMsg}</div>`;
}

function toggleNotifs() {
  document.getElementById('notif-panel').classList.toggle('open');
}

async function markRead(id) {
  await apiFetch(`/projects/notifications/${id}/read`, { method: 'PUT' });
  loadNotifications();
}

async function markAllRead() {
  await apiFetch('/projects/notifications/read-all', { method: 'PUT' });
  loadNotifications();
}

// ── Change Password ───────────────────────────────────
function showChangePassword() {
  openModal('pw-modal');
  document.getElementById('pw-alert').innerHTML = '';
}

async function changePassword() {
  const current = document.getElementById('pw-current').value;
  const newpw = document.getElementById('pw-new').value;
  const confirm = document.getElementById('pw-confirm').value;
  const alertEl = document.getElementById('pw-alert');
  if (newpw !== confirm) { alertEl.innerHTML = '<div class="alert alert-error">Passwords do not match</div>'; return; }
  if (newpw.length < 6) { alertEl.innerHTML = '<div class="alert alert-error">Password must be at least 6 characters</div>'; return; }
  const res = await apiFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: current, new_password: newpw })
  });
  const data = await res.json();
  if (res.ok) {
    alertEl.innerHTML = '<div class="alert alert-success">Password changed successfully!</div>';
    setTimeout(() => closeModal('pw-modal'), 1500);
  } else {
    alertEl.innerHTML = `<div class="alert alert-error">${data.error}</div>`;
  }
}

// ── Helpers ───────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span style="font-size:16px;flex-shrink:0">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

function statusBadge(status) {
  const map = { pending: 'pending', in_progress: 'progress', completed: 'completed', cancelled: 'cancelled' };
  return `<span class="badge badge-${map[status] || 'pending'}">${(status || 'pending').replace('_',' ')}</span>`;
}

function priorityBadge(p) {
  const map = { normal: 'normal', high: 'high', urgent: 'urgent' };
  return `<span class="badge badge-${map[p] || 'normal'}">${p || 'normal'}</span>`;
}

function moduleIcon(type) {
  const icons = { 'Maintenance': '🔧', 'Handover': '🤝', 'Installation and Wiring': '⚡', 'Programming and Trouble Shooting': '💻', 'Delivering': '📦', 'Site Survey': '🗺️', 'POC': '🔬' };
  return icons[type] || '📋';
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function logout() {
  localStorage.removeItem('elv_token');
  localStorage.removeItem('elv_user');
  window.location.href = '/';
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
});

// Close notif panel on outside click
document.addEventListener('click', e => {
  const panel = document.getElementById('notif-panel');
  const btn = document.querySelector('.notif-btn');
  if (panel && !panel.contains(e.target) && !btn?.contains(e.target)) {
    panel.classList.remove('open');
  }
});

/* ═══════════════════════════════════════════════════════════════
   QUOTATION BUILDER (MT Sales Quotation — Sales Integration)
═══════════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────
let qbAllProducts  = [];
let qbItems        = [];
let qbCurrentProd  = null;
let qbMode         = 'si';
let qbInitialized  = false;
const QB_FILTER_ORDER = ['category', 'system', 'brand', 'type', 'series', 'model'];
const QB_FILTERS      = { category: '', system: '', brand: '', type: '', series: '', model: '' };

// ── Init ─────────────────────────────────────────────────────
async function initQB() {
  // Restore saved items
  try { qbItems = JSON.parse(localStorage.getItem('mt_quotation_items') || '[]'); } catch (_) { qbItems = []; }
  loadQBCustomer();

  if (!qbInitialized) {
    qbInitialized = true;
    await fetchQBProducts();
  } else {
    qbRenderTable();
  }
}

async function fetchQBProducts() {
  try {
    const res = await apiFetch('/quotation/products');
    if (!res?.ok) throw new Error('Server error');
    qbAllProducts = await res.json();
    const count = qbAllProducts.length;
    const el = document.getElementById('qb-db-status');
    if (el) el.textContent = count > 0 ? `— ${count} products loaded` : '— No products available';
    if (count > 0) qbPopulateFilter('category');
  } catch (e) {
    const el = document.getElementById('qb-db-status');
    if (el) el.textContent = '— Failed to load products';
  }
  qbRenderTable();
}

// ── Cascading filters ─────────────────────────────────────────
function qbPopulateFilter(level) {
  const idx = QB_FILTER_ORDER.indexOf(level);

  for (let i = idx; i < QB_FILTER_ORDER.length; i++) {
    const key = QB_FILTER_ORDER[i];
    const sel = document.getElementById(`qb-sel-${key}`);
    if (!sel) continue;
    sel.innerHTML = `<option value="">— Select ${key.charAt(0).toUpperCase() + key.slice(1)} —</option>`;
    sel.disabled  = true;
    if (i > idx) QB_FILTERS[key] = '';
    qbSetStep(key, i === idx ? 'active' : 'locked');
  }

  let filtered = qbAllProducts;
  for (let i = 0; i < idx; i++) {
    const k = QB_FILTER_ORDER[i];
    if (QB_FILTERS[k]) filtered = filtered.filter(p => p[k] === QB_FILTERS[k]);
  }

  const key    = QB_FILTER_ORDER[idx];
  const values = [...new Set(filtered.map(p => p[key]).filter(Boolean))].sort();
  const sel    = document.getElementById(`qb-sel-${key}`);
  if (!sel) return;

  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    sel.appendChild(opt);
  });
  if (QB_FILTERS[key] && values.includes(QB_FILTERS[key])) sel.value = QB_FILTERS[key];
  sel.disabled = false;
  qbSetStep(key, 'active');
}

function onQBFilter(level) {
  const sel = document.getElementById(`qb-sel-${level}`);
  const val = sel.value;
  QB_FILTERS[level] = val;
  const idx = QB_FILTER_ORDER.indexOf(level);
  qbSetStep(level, val ? 'done' : 'active');

  if (!val) {
    for (let i = idx + 1; i < QB_FILTER_ORDER.length; i++) {
      const k = QB_FILTER_ORDER[i];
      QB_FILTERS[k] = '';
      const s = document.getElementById(`qb-sel-${k}`);
      if (s) { s.innerHTML = `<option value="">— Select ${k.charAt(0).toUpperCase() + k.slice(1)} —</option>`; s.disabled = true; }
      qbSetStep(k, 'locked');
    }
    qbHideProductCard();
    return;
  }

  if (idx + 1 < QB_FILTER_ORDER.length) qbPopulateNextLevel(idx + 1);
}

function qbPopulateNextLevel(idx) {
  const key = QB_FILTER_ORDER[idx];
  let filtered = qbAllProducts;
  for (let i = 0; i < idx; i++) {
    const k = QB_FILTER_ORDER[i];
    if (QB_FILTERS[k]) filtered = filtered.filter(p => p[k] === QB_FILTERS[k]);
  }
  const values = [...new Set(filtered.map(p => p[key]).filter(Boolean))].sort();
  const sel    = document.getElementById(`qb-sel-${key}`);
  if (!sel) return;
  sel.innerHTML = `<option value="">— Select ${key.charAt(0).toUpperCase() + key.slice(1)} —</option>`;
  values.forEach(v => {
    const opt = document.createElement('option'); opt.value = v; opt.textContent = v;
    sel.appendChild(opt);
  });
  sel.disabled = false;
  qbSetStep(key, 'active');

  for (let i = idx + 1; i < QB_FILTER_ORDER.length; i++) {
    const k = QB_FILTER_ORDER[i]; QB_FILTERS[k] = '';
    const s = document.getElementById(`qb-sel-${k}`);
    if (s) { s.innerHTML = `<option value="">— Select ${k.charAt(0).toUpperCase() + k.slice(1)} —</option>`; s.disabled = true; }
    qbSetStep(k, 'locked');
  }

  if (values.length === 1) {
    sel.value = values[0]; QB_FILTERS[key] = values[0];
    qbSetStep(key, 'done');
    if (idx + 1 < QB_FILTER_ORDER.length) qbPopulateNextLevel(idx + 1);
  }
  qbHideProductCard();
}

function onQBModelSelect() {
  const sel   = document.getElementById('qb-sel-model');
  const model = sel.value;
  QB_FILTERS.model = model;
  qbSetStep('model', model ? 'done' : 'active');
  if (!model) { qbHideProductCard(); return; }
  qbCurrentProd = qbAllProducts.find(p => p.model === model) || null;
  if (qbCurrentProd) qbShowProductCard(qbCurrentProd);
}

function qbSetStep(level, state) {
  const step  = document.getElementById(`qb-step-${level}`);
  const idx   = QB_FILTER_ORDER.indexOf(level);
  const badge = document.getElementById(`qb-badge-${idx + 1}`);
  if (!step) return;
  step.classList.remove('locked', 'active', 'done');
  step.classList.add(state);
  if (badge) badge.textContent = state === 'done' ? '✓' : idx + 1;
}

// ── Product card ──────────────────────────────────────────────
function qbShowProductCard(p) {
  document.getElementById('qb-no-product').style.display = 'none';
  document.getElementById('qb-product-card').style.display = 'block';
  document.getElementById('qb-pc-model').textContent = p.model;
  document.getElementById('qb-pc-desc').textContent  = p.description || '—';
  const currency = document.getElementById('qb-c-currency')?.value || 'JOD';
  document.getElementById('qb-pc-dpp').textContent = `${(+p.dpp_price || 0).toFixed(3)} ${currency}`;
  document.getElementById('qb-pc-si').textContent  = `${(+p.si_price  || 0).toFixed(3)} ${currency}`;
  document.getElementById('qb-pc-eu').textContent  = `${(+p.enduser_price || 0).toFixed(3)} ${currency}`;
  document.getElementById('qb-qty').value = 1;
  qbRecalc();
}

function qbHideProductCard() {
  qbCurrentProd = null;
  const el = document.getElementById('qb-product-card');
  const hint = document.getElementById('qb-no-product');
  if (el) el.style.display = 'none';
  if (hint) hint.style.display = 'block';
}

// ── Pricing mode ─────────────────────────────────────────────
function setQBMode(mode, btn) {
  qbMode = mode;
  document.querySelectorAll('.qb-pm-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const wrap = document.getElementById('qb-custom-wrap');
  if (wrap) wrap.style.display = mode === 'custom' ? 'flex' : 'none';
  const lbl = document.getElementById('qb-mode-label');
  const names = { si: 'SI Price', contractor: 'Contractor Price', enduser: 'End User Price', custom: 'Custom' };
  if (lbl) lbl.textContent = `Mode: ${names[mode] || mode}`;
  qbRecalc();
  qbRenderTable();
}

function qbGetUnitPrice(p) {
  if (!p) return 0;
  const gm = parseFloat(document.getElementById('qb-multiplier')?.value) || 1;
  let base = 0;
  switch (qbMode) {
    case 'si':         base = +p.si_price      || 0; break;
    case 'contractor': base = (+p.si_price || 0) * 1.25; break;
    case 'enduser':    base = +p.enduser_price  || 0; break;
    case 'custom':     base = (+p.si_price || 0) * (parseFloat(document.getElementById('qb-multiplier')?.value) || 1); break;
    default:           base = +p.si_price || 0;
  }
  return base * (qbMode === 'custom' ? 1 : gm);
}

function qbRecalc() {
  if (!qbCurrentProd) return;
  const currency = document.getElementById('qb-c-currency')?.value || 'JOD';
  const unit = qbGetUnitPrice(qbCurrentProd);
  const qty  = parseInt(document.getElementById('qb-qty')?.value) || 1;
  const el   = document.getElementById('qb-item-total');
  if (el) el.textContent = `${(unit * qty).toFixed(3)} ${currency}`;
}

function qbAdjQty(delta) {
  const input = document.getElementById('qb-qty');
  if (!input) return;
  input.value = Math.max(1, (parseInt(input.value) || 1) + delta);
  qbRecalc();
}

// ── Add to quotation ──────────────────────────────────────────
function addToQB() {
  if (!qbCurrentProd) return;
  const qty  = parseInt(document.getElementById('qb-qty')?.value) || 1;
  const unit = qbGetUnitPrice(qbCurrentProd);
  qbItems.push({
    id:           Date.now(),
    model:        qbCurrentProd.model,
    brand:        qbCurrentProd.brand || '',
    description:  qbCurrentProd.description || '',
    category:     qbCurrentProd.category || '',
    system:       qbCurrentProd.system || '',
    qty,
    unit_price:   unit,
    si_price:     +qbCurrentProd.si_price || 0,
    enduser_price: +qbCurrentProd.enduser_price || 0,
    dpp_price:    +qbCurrentProd.dpp_price || 0,
    pricing_mode: qbMode
  });
  saveQBItems();
  qbRenderTable();
  showToast(`✓ ${qbCurrentProd.model} added`, 'success');
  document.getElementById('qb-qty').value = 1;
  qbRecalc();
}

function removeQBItem(id) {
  qbItems = qbItems.filter(i => i.id !== id);
  saveQBItems();
  qbRenderTable();
}

function updateQBQty(id, qty) {
  const item = qbItems.find(i => i.id === id);
  if (!item) return;
  item.qty = Math.max(1, parseInt(qty) || 1);
  saveQBItems();
  qbRenderTable();
}

function saveQBItems() {
  localStorage.setItem('mt_quotation_items', JSON.stringify(qbItems));
}

function clearQBItems() {
  if (!qbItems.length || confirm('Clear all quotation items?')) {
    qbItems = [];
    saveQBItems();
    qbRenderTable();
  }
}

// ── Render quotation table ────────────────────────────────────
function qbRenderTable() {
  const currency = document.getElementById('qb-c-currency')?.value || 'JOD';
  const discount = parseFloat(document.getElementById('qb-discount')?.value) || 0;
  const tbody    = document.getElementById('qb-items-body');
  const countEl  = document.getElementById('qb-items-count');
  if (!tbody) return;

  if (!qbItems.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--gray-400)">No items yet. Select a product and click Add +</td></tr>`;
    if (countEl) countEl.textContent = '(0 items)';
    document.getElementById('qb-subtotal').textContent    = `0.000 ${currency}`;
    document.getElementById('qb-grand-total').textContent = `0.000 ${currency}`;
    return;
  }

  let subtotal = 0;
  tbody.innerHTML = qbItems.map((item, idx) => {
    // Recalculate unit price based on current mode
    let unit = 0;
    const gm = parseFloat(document.getElementById('qb-multiplier')?.value) || 1;
    switch (qbMode) {
      case 'si':         unit = (+item.si_price      || 0) * gm; break;
      case 'contractor': unit = (+item.si_price      || 0) * 1.25 * gm; break;
      case 'enduser':    unit = (+item.enduser_price  || 0) * gm; break;
      case 'custom': {
        const m = parseFloat(document.getElementById('qb-multiplier')?.value) || 1;
        unit = (+item.si_price || 0) * m;
        break;
      }
      default: unit = +item.si_price || 0;
    }
    const total = unit * item.qty;
    subtotal += total;
    return `
      <tr style="border-bottom:1px solid var(--gray-100)">
        <td style="padding:10px 12px;color:var(--gray-400);font-size:12px">${idx + 1}</td>
        <td style="padding:10px 12px"><code style="font-size:12px;background:var(--gray-100);padding:2px 6px;border-radius:4px">${escHtml(item.model)}</code>
          ${item.brand ? `<div style="font-size:11px;color:var(--gray-400)">${escHtml(item.brand)}</div>` : ''}
        </td>
        <td style="padding:10px 12px;font-size:12px;color:var(--gray-500);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(item.description||'—')}</td>
        <td style="padding:10px 12px;text-align:right;font-size:13px">${unit.toFixed(3)}</td>
        <td style="padding:10px 12px;text-align:center">
          <input type="number" value="${item.qty}" min="1" style="width:52px;padding:4px;border:1px solid var(--gray-200);border-radius:6px;text-align:center;font-size:13px"
            onchange="updateQBQty(${item.id},this.value)">
        </td>
        <td style="padding:10px 12px;text-align:right;font-weight:600;color:var(--red)">${total.toFixed(3)}</td>
        <td style="padding:10px 12px;text-align:center">
          <button onclick="removeQBItem(${item.id})" style="border:none;background:none;cursor:pointer;color:var(--gray-400);padding:4px" title="Remove">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const grandTotal = subtotal * (1 - discount / 100);
  if (countEl) countEl.textContent = `(${qbItems.length} item${qbItems.length !== 1 ? 's' : ''})`;
  document.getElementById('qb-subtotal').textContent    = `${subtotal.toFixed(3)} ${currency}`;
  document.getElementById('qb-grand-total').textContent = `${grandTotal.toFixed(3)} ${currency}`;
}

// ── Customer info ─────────────────────────────────────────────
function openQBCustomer() {
  document.getElementById('qb-customer-modal').classList.add('open');
}

function saveQBCustomer() {
  const info = {
    name:     document.getElementById('qb-c-name')?.value     || '',
    attn:     document.getElementById('qb-c-attn')?.value     || '',
    ref:      document.getElementById('qb-c-ref')?.value      || '',
    date:     document.getElementById('qb-c-date')?.value     || '',
    currency: document.getElementById('qb-c-currency')?.value || 'JOD',
    validity: document.getElementById('qb-c-validity')?.value || '30',
    notes:    document.getElementById('qb-c-notes')?.value    || ''
  };
  localStorage.setItem('mt_customer_info', JSON.stringify(info));
  closeModal('qb-customer-modal');
  qbRenderTable();
  showToast('Customer info saved', 'success');
}

function loadQBCustomer() {
  try {
    const info = JSON.parse(localStorage.getItem('mt_customer_info') || '{}');
    const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    set('qb-c-name', info.name);
    set('qb-c-attn', info.attn);
    set('qb-c-currency', info.currency);
    set('qb-c-validity', info.validity);
    set('qb-c-notes', info.notes);
    if (info.ref)  set('qb-c-ref',  info.ref);
    if (info.date) set('qb-c-date', info.date);
    if (!info.ref) {
      const r = document.getElementById('qb-c-ref');
      if (r) r.value = 'QyMT-' + String(Math.floor(Math.random() * 900) + 100);
    }
    if (!info.date) {
      const d = document.getElementById('qb-c-date');
      if (d) d.value = new Date().toISOString().split('T')[0];
    }
  } catch (_) {}
}

// ── PDF Export ────────────────────────────────────────────────
async function exportQBPdf() {
  if (!qbItems.length) { showToast('Add items to the quotation before exporting', 'error'); return; }
  if (typeof html2pdf === 'undefined') { showToast('PDF library not loaded yet, please wait', 'error'); return; }

  const currency = document.getElementById('qb-c-currency')?.value || 'JOD';
  const discount = parseFloat(document.getElementById('qb-discount')?.value) || 0;
  const gm       = parseFloat(document.getElementById('qb-multiplier')?.value) || 1;
  const info     = (() => {
    try { return JSON.parse(localStorage.getItem('mt_customer_info') || '{}'); } catch (_) { return {}; }
  })();

  const modeNames = { si: 'SI Price', contractor: 'Contractor', enduser: 'End User', custom: `Custom ×${gm}` };

  let subtotal = 0;
  const rows = qbItems.map((item, idx) => {
    let unit = 0;
    switch (qbMode) {
      case 'si':         unit = (+item.si_price || 0) * gm; break;
      case 'contractor': unit = (+item.si_price || 0) * 1.25 * gm; break;
      case 'enduser':    unit = (+item.enduser_price || 0) * gm; break;
      case 'custom': {
        const m = parseFloat(document.getElementById('qb-multiplier')?.value) || 1;
        unit = (+item.si_price || 0) * m; break;
      }
      default: unit = +item.si_price || 0;
    }
    const total = unit * item.qty;
    subtotal += total;
    return `<tr style="border-bottom:1px solid #eee">
      <td style="padding:8px 10px;color:#888;font-size:12px">${idx + 1}</td>
      <td style="padding:8px 10px;font-family:monospace;font-size:12px">${escHtml(item.model)}</td>
      <td style="padding:8px 10px;font-size:12px;color:#555">${escHtml(item.description || '—')}</td>
      <td style="padding:8px 10px;text-align:right;font-size:12px">${unit.toFixed(3)}</td>
      <td style="padding:8px 10px;text-align:center;font-size:12px">${item.qty}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;font-size:12px">${total.toFixed(3)}</td>
    </tr>`;
  }).join('');

  const grandTotal = subtotal * (1 - discount / 100);

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;color:#1e2a38;padding:32px;max-width:800px;margin:auto">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;border-bottom:3px solid #C0392B;padding-bottom:20px">
        <div>
          <div style="font-size:22px;font-weight:800;color:#C0392B;letter-spacing:.5px">MagicTech</div>
          <div style="font-size:12px;color:#888;margin-top:4px">Sales Quotation</div>
        </div>
        <div style="text-align:right;font-size:12px;color:#555">
          <div><strong>Ref:</strong> ${escHtml(info.ref || '—')}</div>
          <div><strong>Date:</strong> ${escHtml(info.date || '—')}</div>
          <div><strong>Valid:</strong> ${escHtml(info.validity || '30')} days</div>
          <div style="margin-top:4px;padding:4px 8px;background:#FFF0F0;border-radius:4px;color:#C0392B;font-size:11px">${modeNames[qbMode] || qbMode}</div>
        </div>
      </div>

      <div style="margin-bottom:20px;font-size:13px">
        <div><strong>To:</strong> ${escHtml(info.name || '—')}</div>
        ${info.attn ? `<div><strong>Attn:</strong> ${escHtml(info.attn)}</div>` : ''}
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px">
        <thead>
          <tr style="background:#C0392B;color:#fff">
            <th style="padding:10px;text-align:left;width:36px">#</th>
            <th style="padding:10px;text-align:left">Model</th>
            <th style="padding:10px;text-align:left">Description</th>
            <th style="padding:10px;text-align:right">Unit (${currency})</th>
            <th style="padding:10px;text-align:center">Qty</th>
            <th style="padding:10px;text-align:right">Total (${currency})</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div style="max-width:260px;margin-left:auto;font-size:13px">
        <div style="display:flex;justify-content:space-between;padding:6px 0;color:#666">
          <span>Subtotal</span><span>${subtotal.toFixed(3)} ${currency}</span>
        </div>
        ${discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;color:#e67e22">
          <span>Discount (${discount}%)</span><span>−${(subtotal * discount / 100).toFixed(3)} ${currency}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #C0392B;font-weight:800;font-size:15px;color:#C0392B">
          <span>Grand Total</span><span>${grandTotal.toFixed(3)} ${currency}</span>
        </div>
      </div>

      ${info.notes ? `<div style="margin-top:24px;padding:14px;background:#F8F9FA;border-left:4px solid #C0392B;font-size:12px;color:#555">
        <strong>Notes:</strong> ${escHtml(info.notes)}
      </div>` : ''}

      <div style="margin-top:32px;font-size:11px;color:#aaa;text-align:center;border-top:1px solid #eee;padding-top:12px">
        Generated by MagicTech Projects Coordination System
      </div>
    </div>`;

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  const refStr = (info.ref || 'quotation').replace(/[^a-z0-9\-]/gi, '_');
  await html2pdf().set({
    margin:     [10, 10, 10, 10],
    filename:   `MT_Quotation_${refStr}.pdf`,
    html2canvas:{ scale: 2, useCORS: true },
    jsPDF:      { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(container).save();

  document.body.removeChild(container);
}

// ── Utility ───────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════════
// ── AI CHATBOT ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
let chatHistory = [];
let chatImageData = null; // { base64, mimeType, name }

function toggleChatbot() {
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    setTimeout(() => document.getElementById('chat-input').focus(), 250);
  }
}

function chatAttachImage(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const base64 = dataUrl.split(',')[1];
    chatImageData = { base64, mimeType: file.type, name: file.name };
    document.getElementById('chat-image-name').textContent = file.name;
    document.getElementById('chat-image-preview').style.display = 'block';
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function chatRemoveImage() {
  chatImageData = null;
  document.getElementById('chat-image-preview').style.display = 'none';
  document.getElementById('chat-image-name').textContent = '';
}

async function sendChatMsg() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const text = input.value.trim();
  if (!text && !chatImageData) return;

  const token = localStorage.getItem('elv_token');

  // Show user bubble
  if (chatImageData) {
    const imgHtml = `<img class="chat-thumb" src="data:${chatImageData.mimeType};base64,${chatImageData.base64}" alt="attached">`;
    appendChatBubble(text ? imgHtml + '\n' + escHtml(text) : imgHtml, 'user', true);
  } else {
    appendChatBubble(escHtml(text), 'user', true);
  }

  input.value = '';
  sendBtn.disabled = true;

  // Build message for history
  const userMsg = { role: 'user', content: text || '(image attached)' };
  chatHistory.push(userMsg);

  // Thinking indicator
  const thinkId = 'chat-think-' + Date.now();
  appendChatBubble('Thinking…', 'thinking', false, thinkId);

  try {
    const body = {
      message: text || '',
      history: chatHistory.slice(-12), // last 6 exchanges
    };
    if (chatImageData) {
      body.image = { base64: chatImageData.base64, mimeType: chatImageData.mimeType };
    }

    const res = await fetch('/api/quotation/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    const thinkEl = document.getElementById(thinkId);
    if (thinkEl) thinkEl.remove();

    if (!res.ok) throw new Error(data.error || 'AI request failed');

    const reply = data.reply || '(no response)';
    chatHistory.push({ role: 'assistant', content: reply });
    appendChatBubble(escHtml(reply).replace(/\n/g, '<br>'), 'bot', true);

  } catch (err) {
    const thinkEl = document.getElementById(thinkId);
    if (thinkEl) thinkEl.remove();
    appendChatBubble('Sorry, something went wrong: ' + escHtml(err.message), 'bot', true);
  } finally {
    sendBtn.disabled = false;
    chatRemoveImage();
    input.focus();
  }
}

function appendChatBubble(htmlContent, type, scroll = true, id = null) {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-bubble ' + type;
  div.innerHTML = htmlContent;
  if (id) div.id = id;
  msgs.appendChild(div);
  if (scroll) msgs.scrollTop = msgs.scrollHeight;
  return div;
}
