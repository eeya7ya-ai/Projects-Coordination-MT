/* ═══════════════════════════════════════════════════════
   ELV Admin Panel — JavaScript
═══════════════════════════════════════════════════════ */

const API = '/api';
let token = localStorage.getItem('elv_token');
let currentUser = JSON.parse(localStorage.getItem('elv_user') || '{}');
let allProjects = [];
let allUsers = [];
let map, marker;
let selectedModules = new Set();
let excelData = null;

// ── Auth check ────────────────────────────────────────
if (!token || currentUser.role !== 'admin') {
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
  document.getElementById('sidebar-name').textContent = currentUser.full_name || 'Administrator';
  const av = document.getElementById('sidebar-avatar');
  av.textContent = (currentUser.full_name || 'A')[0].toUpperCase();
  av.style.background = currentUser.avatar_color || '#8B0000';

  initMap();

  // Load users first (needed for dropdowns), then load the rest in parallel
  await loadUsers();
  await Promise.all([loadDashboard(), loadProjects()]);

  loadNotifications();
  setInterval(loadNotifications, 30000);
  setInterval(() => { loadProjects(); loadUsers(); }, 60000);

  // Nav click handlers
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });

  // Search
  document.getElementById('global-search').addEventListener('input', e => {
    if (document.getElementById('page-projects').classList.contains('active')) {
      filterProjects(e.target.value);
    }
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
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
}

// ── Navigation ────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .mobile-nav-tab').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  // Activate all matching nav items (sidebar + mobile bottom nav)
  document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));

  const titles = {
    'dashboard': 'Dashboard', 'analytics': 'Analytics', 'projects': 'Projects',
    'new-project': 'New Project', 'reports': 'Reports', 'users': 'Users',
    'daily-summary': 'Daily Summary', 'settings': 'Settings'
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  if (page === 'analytics') loadAnalytics();
  if (page === 'projects') loadProjects();
  if (page === 'reports') loadReports();
  if (page === 'users') loadUsersTable();
  if (page === 'settings') { loadAdminProfile(); loadEmailSettings(); }
  if (page === 'daily-summary') initDailySummary();
  if (page === 'new-project') {
    resetProjectForm();
    populateUserDropdowns();
    setTimeout(() => map?.invalidateSize(), 200);
  }

  // Close sidebar on mobile after navigation
  closeSidebar();
}

// ── Dashboard ─────────────────────────────────────────
async function loadDashboard() {
  const res = await apiFetch('/admin/analytics');
  if (!res?.ok) return;
  const data = await res.json();

  // Stats
  const statsEl = document.getElementById('stats-grid');
  statsEl.innerHTML = `
    <div class="stat-card"><div class="stat-icon red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg></div><div class="stat-value">${data.stats.total_projects}</div><div class="stat-label">Total Projects</div></div>
    <div class="stat-card"><div class="stat-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="stat-value">${data.stats.active_projects}</div><div class="stat-label">Active Projects</div></div>
    <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div class="stat-value">${data.stats.completed_projects}</div><div class="stat-label">Completed</div></div>
    <div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></div><div class="stat-value">${data.stats.total_users}</div><div class="stat-label">Team Members</div></div>
    <div class="stat-card"><div class="stat-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="stat-value">${data.stats.pending_reports}</div><div class="stat-label">Pending Reviews</div></div>
    <div class="stat-card"><div class="stat-icon red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></div><div class="stat-value">${data.stats.total_modules}</div><div class="stat-label">Total Modules</div></div>
  `;

  // Recent projects table
  const tbody = document.querySelector('#recent-projects-table tbody');
  tbody.innerHTML = data.recent_projects.map(p => `
    <tr onclick="openProjectDetail(${p.id})" style="cursor:pointer">
      <td><strong>${p.project_name}</strong></td>
      <td>${p.client_name_1 || '—'}</td>
      <td>${statusBadge(p.status)}</td>
      <td style="font-size:12px">${[p.user1_name, p.user2_name].filter(Boolean).join(', ') || '—'}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="text-center text-muted">No projects yet</td></tr>';

  // Module breakdown
  const mbEl = document.getElementById('module-breakdown');
  mbEl.innerHTML = data.module_breakdown.map(m => `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:13px;font-weight:600">${m.module_type}</span>
        <span style="font-size:12px;color:var(--gray-500)">${m.completed}/${m.total} done</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${m.total > 0 ? Math.round((m.completed/m.total)*100) : 0}%"></div></div>
    </div>
  `).join('') || '<p class="text-muted text-small">No modules yet</p>';

  // Update report badge (sidebar + mobile bottom nav)
  if (data.stats.pending_reports > 0) {
    document.getElementById('report-badge').style.display = '';
    document.getElementById('report-badge').textContent = data.stats.pending_reports;
    const mob = document.getElementById('mobile-report-badge');
    if (mob) { mob.classList.remove('hidden'); mob.textContent = data.stats.pending_reports; }
  }
}

// ── Analytics ─────────────────────────────────────────
async function loadAnalytics() {
  const res = await apiFetch('/admin/analytics');
  if (!res?.ok) return;
  const data = await res.json();

  const grid = document.getElementById('achievements-grid');
  grid.innerHTML = data.user_achievements.map(u => {
    const progress = Math.round(u.avg_progress || 0);
    const initials = u.full_name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
    return `
      <div class="achievement-card">
        <div class="ach-header">
          <div class="ach-avatar" style="background:${u.avatar_color || 'var(--red)'}">${initials}</div>
          <div>
            <div class="ach-name">${u.full_name}</div>
            <div class="ach-dept">${u.department || 'No Department'}</div>
          </div>
        </div>
        <div class="ach-stats">
          <div><div class="ach-stat-val">${u.total_modules || 0}</div><div class="ach-stat-lbl">Assigned</div></div>
          <div><div class="ach-stat-val">${u.completed_modules || 0}</div><div class="ach-stat-lbl">Completed</div></div>
          <div><div class="ach-stat-val">${u.total_reports || 0}</div><div class="ach-stat-lbl">Reports</div></div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:12px;color:var(--gray-500)">Avg Progress</span>
            <span style="font-size:12px;font-weight:700;color:var(--red)">${progress}%</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
        </div>
      </div>
    `;
  }).join('') || '<div class="text-muted text-small" style="grid-column:1/-1;text-align:center;padding:40px">No user data available yet</div>';

  // Timeline
  const tl = document.getElementById('timeline-chart');
  const max = Math.max(...data.project_timeline.map(t => t.created), 1);
  tl.innerHTML = data.project_timeline.reverse().map(t => `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
      <span style="font-size:12px;color:var(--gray-500);width:70px;flex-shrink:0">${t.month}</span>
      <div style="flex:1">
        <div style="display:flex;gap:4px;align-items:center">
          <div style="background:var(--red);height:24px;border-radius:4px;width:${(t.created/max)*100}%;min-width:4px;transition:width 0.8s"></div>
          <span style="font-size:12px;font-weight:600">${t.created} created</span>
        </div>
        ${t.completed > 0 ? `<div style="display:flex;gap:4px;align-items:center;margin-top:4px">
          <div style="background:var(--success);height:14px;border-radius:4px;width:${(t.completed/max)*100}%;min-width:4px"></div>
          <span style="font-size:11px;color:var(--success)">${t.completed} completed</span>
        </div>` : ''}
      </div>
    </div>
  `).join('') || '<p class="text-muted text-small">No timeline data</p>';
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
            ${users ? `<div class="proj-meta-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> ${users}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="badge badge-${p.status === 'in_progress' ? 'progress' : p.status}">${p.status?.replace('_',' ') || 'pending'}</span>
            <span style="font-size:12px;color:var(--gray-400)">${p.module_count || 0} module${p.module_count !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="project-card-footer">
          <span style="font-size:12px;color:var(--gray-400)">${formatDate(p.created_at)}</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();editProject(${p.id})">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteProject(${p.id},'${p.project_name}')">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('') || `<div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;text-align:center">
    <div style="width:96px;height:96px;background:var(--gray-100);border-radius:24px;display:flex;align-items:center;justify-content:center;margin-bottom:24px">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" stroke-width="1.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
    </div>
    <h3 style="font-size:20px;font-weight:700;color:var(--gray-700);margin-bottom:8px">No projects yet</h3>
    <p style="font-size:14px;color:var(--gray-500);margin-bottom:24px;max-width:320px">Create your first project to start coordinating your ELV team's work.</p>
    <button class="btn btn-danger" onclick="navigate('new-project')" style="padding:12px 28px;font-size:15px;font-weight:600;border-radius:12px;display:inline-flex;align-items:center;gap:8px">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      Create First Project
    </button>
  </div>`;
}

function filterProjects(search) {
  const status = document.getElementById('filter-status').value;
  const term = (search || document.getElementById('global-search').value || '').toLowerCase();
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
  if (!res?.ok) { document.getElementById('proj-detail-body').innerHTML = '<p class="text-muted">Failed to load project</p>'; return; }
  const p = await res.json();
  document.getElementById('proj-detail-title').textContent = p.project_name;

  const statusColors = { pending: '#F39C12', in_progress: '#2980B9', completed: '#27AE60', cancelled: '#95A5A6' };

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
        ${p.user1_name ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><div class="user-avatar" style="background:${p.user1_color || 'var(--red)'};width:38px;height:38px;font-size:14px;border-radius:10px">${p.user1_name[0].toUpperCase()}</div><div><div style="font-size:14px;font-weight:600">${p.user1_name}</div><div style="font-size:12px;color:var(--gray-400)">Primary</div></div></div>` : ''}
        ${p.user2_name ? `<div style="display:flex;align-items:center;gap:10px"><div class="user-avatar" style="background:${p.user2_color || '#8B0000'};width:38px;height:38px;font-size:14px;border-radius:10px">${p.user2_name[0].toUpperCase()}</div><div><div style="font-size:14px;font-weight:600">${p.user2_name}</div><div style="font-size:12px;color:var(--gray-400)">Secondary</div></div></div>` : ''}
        ${!p.user1_name && !p.user2_name ? '<p class="text-muted text-small">No users assigned</p>' : ''}

        <div style="margin-top:20px">
          <h4 style="font-size:13px;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Update Status</h4>
          <div style="display:flex;gap:8px">
            <select id="status-update-${p.id}" style="flex:1;padding:8px;border:2px solid var(--gray-200);border-radius:8px;font-family:inherit">
              <option value="pending" ${p.status==='pending'?'selected':''}>Pending</option>
              <option value="in_progress" ${p.status==='in_progress'?'selected':''}>In Progress</option>
              <option value="completed" ${p.status==='completed'?'selected':''}>Completed</option>
              <option value="cancelled" ${p.status==='cancelled'?'selected':''}>Cancelled</option>
            </select>
            <button class="btn btn-danger btn-sm" onclick="updateProjectStatus(${p.id})">Update</button>
          </div>
        </div>
      </div>
    </div>

    <h4 style="font-size:15px;font-weight:700;margin-bottom:16px">Modules (${p.modules?.length || 0})</h4>
    <div style="display:flex;flex-direction:column;gap:16px">
      ${(p.modules || []).map(m => renderModuleCard(m, p.id)).join('') || '<p class="text-muted text-small">No modules</p>'}
    </div>
  `;
}

function renderModuleCard(m, projectId) {
  const done = m.checklist.filter(c => c.is_completed).length;
  const total = m.checklist.length;
  const progress = total > 0 ? Math.round((done/total)*100) : m.progress;
  const modClass = 'mt-' + m.module_type.toLowerCase().replace(/\s+&?\s*/g, '-').replace(/[^a-z-]/g,'').replace(/-+/g,'-');

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
                <thead>
                  <tr style="background:var(--gray-100);color:var(--gray-600)">
                    <th style="text-align:left;padding:7px 10px;border-radius:6px 0 0 6px">#</th>
                    <th style="text-align:left;padding:7px 10px">Model</th>
                    <th style="text-align:center;padding:7px 10px">Qty</th>
                    <th style="text-align:left;padding:7px 10px">Description</th>
                    <th style="text-align:left;padding:7px 10px;border-radius:0 6px 6px 0">Serial #</th>
                  </tr>
                </thead>
                <tbody>
                  ${m.devices.map((d, idx) => `
                    <tr style="border-bottom:1px solid var(--gray-100)">
                      <td style="padding:6px 10px;color:var(--gray-400)">${idx + 1}</td>
                      <td style="padding:6px 10px;font-weight:600;color:var(--gray-800)">${d.device_model || '—'}</td>
                      <td style="padding:6px 10px;text-align:center"><span style="background:var(--red-pale);color:var(--red-dark);padding:2px 8px;border-radius:12px;font-weight:700">${d.device_qty}</span></td>
                      <td style="padding:6px 10px;color:var(--gray-600)">${d.device_description || '—'}</td>
                      <td style="padding:6px 10px;color:var(--gray-500);font-family:monospace;font-size:11px">${d.serial_number || '—'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        ${m.checklist?.length ? `
          <div style="margin-bottom:12px">
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-400);font-weight:700">Checklist — ${done}/${total}</span>
            <div style="margin-top:6px">
              ${m.checklist.slice(0,5).map(c => `
                <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px">
                  <span style="color:${c.is_completed ? 'var(--success)' : 'var(--gray-300)'};font-size:16px">${c.is_completed ? '✓' : '○'}</span>
                  <span style="${c.is_completed ? 'text-decoration:line-through;color:var(--gray-400)' : ''}">${c.task_title}</span>
                </div>
              `).join('')}
              ${m.checklist.length > 5 ? `<div style="font-size:12px;color:var(--gray-400);padding:4px 0">...and ${m.checklist.length-5} more</div>` : ''}
            </div>
          </div>
        ` : ''}

        ${m.reports?.length ? `
          <div>
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-400);font-weight:700">Latest Report</span>
            <div class="report-card" style="margin-top:8px">
              <div class="report-meta">
                <span class="submitter">${m.reports[0].submitted_by_name}</span>
                <div style="display:flex;gap:8px;align-items:center">
                  <span class="badge badge-${m.reports[0].review_status === 'approved' ? 'completed' : m.reports[0].review_status === 'rejected' ? 'urgent' : 'pending'}">${m.reports[0].review_status}</span>
                  <span class="date">${formatDate(m.reports[0].submitted_at)}</span>
                </div>
              </div>
              ${m.reports[0].work_done ? `<div class="report-section"><label>Work Done</label><p>${m.reports[0].work_done}</p></div>` : ''}
              ${m.reports[0].review_status === 'pending' ? `
                <div style="display:flex;gap:8px;margin-top:12px">
                  <button class="btn btn-success btn-sm" onclick="reviewReport(${m.reports[0].id}, ${projectId}, ${m.id}, 'approved')">Approve</button>
                  <button class="btn btn-danger btn-sm" onclick="reviewReport(${m.reports[0].id}, ${projectId}, ${m.id}, 'rejected')">Reject</button>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        ${m.user_notes ? `<div style="background:#FFF8E1;border:1px solid #FFE082;border-radius:8px;padding:10px;margin-top:10px"><span style="font-size:11px;font-weight:700;color:#F9A825;text-transform:uppercase;letter-spacing:0.5px">User Notes</span><p style="font-size:13px;margin-top:4px">${m.user_notes}</p></div>` : ''}
      </div>
    </div>
  `;
}

async function updateProjectStatus(projectId) {
  const status = document.getElementById(`status-update-${projectId}`).value;
  const res = await apiFetch(`/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  });
  if (res?.ok) {
    showToast('Project status updated', 'success');
    closeModal('project-detail-modal');
    loadProjects();
    loadDashboard();
  }
}

async function reviewReport(reportId, projectId, moduleId, status) {
  const notes = status === 'rejected' ? prompt('Reason for rejection:') : null;
  const res = await apiFetch(`/projects/${projectId}/modules/${moduleId}/reports/${reportId}`, {
    method: 'PUT',
    body: JSON.stringify({ review_status: status, review_notes: notes || '' })
  });
  if (res?.ok) {
    showToast(`Report ${status}`, 'success');
    openProjectDetail(projectId);
    loadDashboard();
  }
}

async function deleteProject(id, name) {
  if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
  const res = await apiFetch(`/projects/${id}`, { method: 'DELETE' });
  if (res?.ok) { loadProjects(); loadDashboard(); }
}

async function editProject(id) {
  const p = allProjects.find(x => x.id === id);
  if (!p) {
    const res = await apiFetch(`/projects/${id}`);
    if (!res?.ok) return;
    Object.assign(p || {}, await res.json());
  }

  const proj = allProjects.find(x => x.id === id) || {};
  document.getElementById('edit-proj-id').value = id;
  document.getElementById('edit-proj-name').value = proj.project_name || '';
  document.getElementById('edit-proj-client1').value = proj.client_name_1 || '';
  document.getElementById('edit-proj-client2').value = proj.client_name_2 || '';
  document.getElementById('edit-proj-clientnum').value = proj.client_number || '';
  document.getElementById('edit-proj-location').value = proj.location_name || '';
  document.getElementById('edit-proj-start').value = proj.start_date || '';
  document.getElementById('edit-proj-end').value = proj.end_date || '';
  document.getElementById('edit-proj-priority').value = proj.priority || 'normal';
  document.getElementById('edit-proj-status').value = proj.status || 'pending';

  const userOpts = '<option value="">— None —</option>' + allUsers.filter(u => u.is_active).map(u => `<option value="${u.id}">${u.full_name}</option>`).join('');
  document.getElementById('edit-proj-user1').innerHTML = userOpts;
  document.getElementById('edit-proj-user2').innerHTML = userOpts;
  if (proj.user_id_1) document.getElementById('edit-proj-user1').value = proj.user_id_1;
  if (proj.user_id_2) document.getElementById('edit-proj-user2').value = proj.user_id_2;

  openModal('edit-project-modal');
}

async function saveEditProject() {
  const id = document.getElementById('edit-proj-id').value;
  const name = document.getElementById('edit-proj-name').value.trim();
  if (!name) { showToast('Project name is required', 'error'); return; }

  const payload = {
    project_name: name,
    client_name_1: document.getElementById('edit-proj-client1').value.trim(),
    client_name_2: document.getElementById('edit-proj-client2').value.trim(),
    client_number: document.getElementById('edit-proj-clientnum').value.trim(),
    location_name: document.getElementById('edit-proj-location').value.trim(),
    user_id_1: document.getElementById('edit-proj-user1').value || null,
    user_id_2: document.getElementById('edit-proj-user2').value || null,
    start_date: document.getElementById('edit-proj-start').value,
    end_date: document.getElementById('edit-proj-end').value,
    priority: document.getElementById('edit-proj-priority').value,
    status: document.getElementById('edit-proj-status').value
  };

  const res = await apiFetch(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  if (res?.ok) {
    closeModal('edit-project-modal');
    showToast('Project updated successfully', 'success');
    await loadProjects();
    loadDashboard();
  } else {
    const data = await res.json();
    showToast('Error: ' + (data.error || 'Failed to update'), 'error');
  }
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
    user_id_1: document.getElementById('p-user1').value || null,
    user_id_2: document.getElementById('p-user2').value || null,
    start_date: document.getElementById('p-start').value,
    end_date: document.getElementById('p-end').value,
    priority: document.getElementById('p-priority').value,
    modules
  };

  const res = await apiFetch('/projects', { method: 'POST', body: JSON.stringify(payload) });
  const data = await res.json();
  if (res.ok) {
    showToast(`Project "${name}" created successfully`, 'success');
    resetProjectForm();
    await loadProjects();
    navigate('projects');
    loadDashboard();
  } else {
    showToast('Error: ' + data.error, 'error');
  }
}

function resetProjectForm() {
  ['p-name','p-client1','p-client2','p-client-num','p-location-name','p-lat','p-lng','p-start','p-end'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('p-priority').value = 'normal';
  document.getElementById('p-user1').value = '';
  document.getElementById('p-user2').value = '';
  document.querySelectorAll('.module-option.selected').forEach(el => el.classList.remove('selected'));
  selectedModules.clear();
  document.getElementById('module-details-container').innerHTML = '';
  document.getElementById('excel-result').classList.add('hidden');
  excelData = null;
  if (marker) { marker.remove(); marker = null; }
  if (map) { map.setView([31.9539, 35.9106], 8); map.invalidateSize(); }
  document.getElementById('map-search-input').value = '';
  document.getElementById('map-search-results').style.display = 'none';
  document.getElementById('map-coords').textContent = 'Search for a street or click on the map to pin';
}

// ── Users ─────────────────────────────────────────────
async function loadUsers() {
  const res = await apiFetch('/admin/users');
  if (!res?.ok) return;
  allUsers = await res.json();
  populateUserDropdowns();
}

async function loadUsersTable() {
  await loadUsers();
  const tbody = document.querySelector('#users-table tbody');
  tbody.innerHTML = allUsers.map(u => {
    const initials = u.full_name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="user-avatar" style="background:${u.avatar_color || 'var(--red)'};width:36px;height:36px;border-radius:9px;font-size:13px">${initials}</div>
            <div>
              <div style="font-size:14px;font-weight:600">${u.full_name}</div>
              <div style="font-size:12px;color:var(--gray-400)">${u.email || ''}</div>
            </div>
          </div>
        </td>
        <td><code style="background:var(--gray-100);padding:3px 8px;border-radius:5px;font-size:13px">${u.username}</code></td>
        <td>${u.department || '—'}</td>
        <td>${u.phone || '—'}</td>
        <td><span class="badge badge-${u.role === 'planner' ? 'info' : 'pending'}" style="${u.role === 'planner' ? 'background:var(--info);color:#fff' : ''}">${u.role === 'planner' ? 'Planner' : 'Technician'}</span></td>
        <td><span class="badge badge-${u.total_projects > 0 ? 'progress' : 'pending'}">${u.total_projects || 0} projects</span></td>
        <td>${u.is_active ? '<span class="badge badge-completed">Active</span>' : '<span class="badge badge-cancelled">Inactive</span>'}</td>
        <td style="font-size:12px;color:var(--gray-400)">${u.last_login ? formatDate(u.last_login) : 'Never'}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-secondary" onclick="openUserModal(${u.id})">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deactivateUser(${u.id},'${u.full_name}')">Deactivate</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="9" class="text-center text-muted">No users yet</td></tr>';
}

function populateUserDropdowns() {
  const fieldUsers = allUsers.filter(u => u.is_active && u.role !== 'planner');
  const opts = '<option value="">— Select User —</option>' + fieldUsers.map(u => `<option value="${u.id}">${u.full_name}</option>`).join('');
  document.getElementById('p-user1').innerHTML = opts;
  document.getElementById('p-user2').innerHTML = '<option value="">— Optional —</option>' + fieldUsers.map(u => `<option value="${u.id}">${u.full_name}</option>`).join('');
}

function openUserModal(userId) {
  document.getElementById('user-modal-title').textContent = userId ? 'Edit User' : 'Add New User';
  document.getElementById('edit-user-id').value = userId || '';
  ['u-fullname','u-username','u-password','u-dept','u-phone','u-email'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('u-color').value = '#C0392B';
  document.getElementById('u-role').value = 'user';
  document.getElementById('u-active-group').style.display = userId ? '' : 'none';

  if (userId) {
    const user = allUsers.find(u => u.id === userId);
    if (user) {
      document.getElementById('u-fullname').value = user.full_name || '';
      document.getElementById('u-username').value = user.username || '';
      document.getElementById('u-dept').value = user.department || '';
      document.getElementById('u-phone').value = user.phone || '';
      document.getElementById('u-email').value = user.email || '';
      document.getElementById('u-color').value = user.avatar_color || '#C0392B';
      document.getElementById('u-role').value = user.role || 'user';
      document.getElementById('u-active').value = user.is_active ? '1' : '0';
      document.getElementById('u-password').placeholder = 'Leave blank to keep current';
    }
  }
  openModal('user-modal');
}

async function saveUser() {
  const userId = document.getElementById('edit-user-id').value;
  const payload = {
    full_name: document.getElementById('u-fullname').value.trim(),
    username: document.getElementById('u-username').value.trim(),
    password: document.getElementById('u-password').value,
    role: document.getElementById('u-role').value,
    department: document.getElementById('u-dept').value.trim(),
    phone: document.getElementById('u-phone').value.trim(),
    email: document.getElementById('u-email').value.trim(),
    avatar_color: document.getElementById('u-color').value,
    is_active: document.getElementById('u-active')?.value ?? 1
  };

  if (!payload.full_name || !payload.username) { showToast('Full name and username are required', 'error'); return; }
  if (!userId && !payload.password) { showToast('Password is required for new users', 'error'); return; }

  const url = userId ? `/admin/users/${userId}` : '/admin/users';
  const method = userId ? 'PUT' : 'POST';
  const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
  const data = await res.json();

  if (res.ok) {
    closeModal('user-modal');
    await loadUsers();
    loadUsersTable();
    showToast(data.message, 'success');
  } else {
    showToast('Error: ' + data.error, 'error');
  }
}

async function deactivateUser(id, name) {
  if (!confirm(`Deactivate user "${name}"?`)) return;
  const res = await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
  if (res?.ok) { await loadUsers(); loadUsersTable(); }
}

// ── Reports ───────────────────────────────────────────
async function loadReports() {
  const res = await apiFetch('/projects');
  if (!res?.ok) return;
  const projects = await res.json();
  const container = document.getElementById('reports-list');

  // Fetch all project details in parallel (instead of sequential N+1 calls)
  const details = await Promise.all(
    projects.map(p => apiFetch(`/projects/${p.id}`).then(r => r?.ok ? r.json() : null))
  );

  const reportCards = [];
  for (const pd of details) {
    if (!pd) continue;
    for (const m of pd.modules || []) {
      for (const r of m.reports || []) {
        reportCards.push({ ...r, project: pd, module: m });
      }
    }
  }

  if (!reportCards.length) {
    container.innerHTML = '<div class="text-center text-muted" style="padding:60px">No reports submitted yet</div>';
    return;
  }

  container.innerHTML = reportCards.map(r => `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <div>
          <div style="font-size:16px;font-weight:700">${r.project.project_name}</div>
          <div style="font-size:13px;color:var(--gray-500)">${r.module.module_type} — Submitted by <strong>${r.submitted_by_name}</strong></div>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <span class="badge badge-${r.review_status === 'approved' ? 'completed' : r.review_status === 'rejected' ? 'urgent' : 'pending'}">${r.review_status}</span>
          <span style="font-size:12px;color:var(--gray-400)">${formatDate(r.submitted_at)}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="grid-2" style="gap:16px">
          ${r.work_done ? `<div><label style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase">Work Done</label><p style="font-size:14px;margin-top:4px">${r.work_done}</p></div>` : ''}
          ${r.issues_found ? `<div><label style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase">Issues Found</label><p style="font-size:14px;margin-top:4px">${r.issues_found}</p></div>` : ''}
          ${r.next_steps ? `<div><label style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase">Next Steps</label><p style="font-size:14px;margin-top:4px">${r.next_steps}</p></div>` : ''}
          ${r.hours_spent ? `<div><label style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase">Hours Spent</label><p style="font-size:14px;margin-top:4px">${r.hours_spent}h</p></div>` : ''}
        </div>
        ${r.review_status === 'pending' ? `
          <div style="display:flex;gap:10px;margin-top:16px">
            <button class="btn btn-success btn-sm" onclick="reviewReport(${r.id}, ${r.project.id}, ${r.module.id}, 'approved')">✓ Approve</button>
            <button class="btn btn-danger btn-sm" onclick="reviewReport(${r.id}, ${r.project.id}, ${r.module.id}, 'rejected')">✗ Reject</button>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

// ── Map ───────────────────────────────────────────────
const redIcon = L.divIcon({
  html: `<div style="background:var(--red);width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  className: ''
});

function initMap() {
  // Jordan bounds: restrict map to Jordan only
  const jordanBounds = L.latLngBounds(
    L.latLng(29.0, 34.8),  // SW corner
    L.latLng(33.5, 39.4)   // NE corner
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
    // Reverse geocode to get the street name
    reverseGeocode(lat, lng);
  });
}

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'ELVCoordinator/1.0' } });
    const data = await res.json();
    if (data && data.display_name) {
      const addr = data.address || {};
      const streetName = addr.road || addr.neighbourhood || addr.suburb || '';
      const area = addr.city || addr.town || addr.village || addr.state || '';
      const locationName = [streetName, area].filter(Boolean).join(', ') || data.display_name.split(',').slice(0, 2).join(',').trim();
      document.getElementById('p-location-name').value = locationName;
      document.getElementById('map-coords').textContent = `Pinned: ${locationName}`;
    }
  } catch(e) { /* keep coordinate-based name */ }
}

async function searchMapLocation() {
  const query = document.getElementById('map-search-input').value.trim();
  if (!query || query.length < 2) return;
  const btn = document.getElementById('map-search-btn');
  btn.textContent = '...';
  btn.disabled = true;
  try {
    // First try: country-restricted search with viewbox preference (not bounded)
    const base = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&namedetails=1&limit=10`;
    const joParams = `&countrycodes=jo&viewbox=34.8,29.0,39.4,33.5`;
    const url1 = `${base}${joParams}&q=${encodeURIComponent(query)}`;
    const headers = { 'Accept-Language': 'en,ar', 'User-Agent': 'ELVCoordinator/1.0' };

    let res = await fetch(url1, { headers });
    let results = await res.json();

    // Fallback: try without viewbox restriction (catches more remote/small areas)
    if (!results.length) {
      const url2 = `${base}&countrycodes=jo&q=${encodeURIComponent(query + ' Jordan')}`;
      res = await fetch(url2, { headers });
      results = await res.json();
    }

    // Second fallback: free-text search including Jordan keyword
    if (!results.length) {
      const url3 = `${base}&q=${encodeURIComponent(query + ', Jordan')}`;
      res = await fetch(url3, { headers });
      const all = await res.json();
      // Filter to only Jordanian results by checking address.country_code
      results = all.filter(r => (r.address?.country_code || '').toLowerCase() === 'jo');
    }

    const listEl = document.getElementById('map-search-results');
    if (!results.length) {
      listEl.innerHTML = '<div style="padding:10px 14px;color:var(--gray-400);font-size:13px">No results found in Jordan. Try a district, city, or landmark name.</div>';
      listEl.style.display = 'block';
    } else {
      window._mapSearchResults = results;
      listEl.innerHTML = results.map((r, i) => {
        const addr = r.address || {};
        const street = addr.road || addr.pedestrian || addr.path || addr.footway || addr.neighbourhood || '';
        const district = addr.suburb || addr.quarter || addr.neighbourhood || '';
        const area = addr.city || addr.town || addr.village || addr.county || addr.state_district || addr.state || '';
        const parts = [street, district !== street ? district : '', area].filter(Boolean);
        const label = parts.length ? parts.join(', ') : r.display_name.split(',').slice(0, 3).join(',').trim();
        const sublabel = r.display_name.length > label.length + 5 ? r.display_name : '';
        return `
          <div class="map-search-result-item" onclick="selectMapResultByIndex(${i})" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--gray-100);font-size:13px;transition:background 0.15s" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background=''">
            <strong>${label}</strong>
            ${sublabel ? `<div style="font-size:11px;color:var(--gray-400);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sublabel}</div>` : ''}
          </div>
        `;
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
  selectMapResult(r.lat, r.lon, r.display_name, r.address);
}

function selectMapResult(lat, lng, displayName, address) {
  lat = parseFloat(lat); lng = parseFloat(lng);
  if (marker) marker.remove();
  marker = L.marker([lat, lng], { icon: redIcon }).addTo(map);
  map.setView([lat, lng], 17);
  document.getElementById('p-lat').value = lat.toFixed(6);
  document.getElementById('p-lng').value = lng.toFixed(6);

  const addr = address || {};
  const street = addr.road || addr.pedestrian || addr.path || addr.footway || addr.neighbourhood || addr.suburb || '';
  const district = addr.suburb || addr.quarter || '';
  const area = addr.city || addr.town || addr.village || addr.county || addr.state_district || addr.state || '';
  const parts = [street, district !== street ? district : '', area].filter(Boolean);
  const locationName = parts.length ? parts.join(', ') : displayName.split(',').slice(0, 2).join(',').trim();

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

    // Build header summary — show sheet count when multiple sheets found
    const sheetCount = data.sheets_parsed || 1;
    const sheetInfo = sheetCount > 1
      ? `<span style="background:#e8f4fd;color:#2980B9;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700;margin-left:6px">${sheetCount} sheets</span>`
      : '';
    const sheetNames = data.sheet_names?.length > 1
      ? `<div style="font-size:11px;color:var(--gray-500);margin-top:3px">Sheets: ${data.sheet_names.map(s=>`<em>${s}</em>`).join(', ')}</div>`
      : '';

    document.getElementById('excel-msg').innerHTML =
      `<span style="color:var(--success);font-weight:700">✓</span> Parsed <strong>${data.devices.length}</strong> device(s) from <strong>${data.raw_rows}</strong> rows${sheetInfo}${sheetNames}`;

    document.getElementById('excel-devices-preview').innerHTML = data.devices.length
      ? `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
          <thead><tr style="background:var(--gray-100)">
            <th style="text-align:left;padding:6px 8px;border-radius:4px 0 0 4px">Model</th>
            <th style="text-align:center;padding:6px 8px">Qty</th>
            <th style="text-align:left;padding:6px 8px">Description</th>
            <th style="text-align:left;padding:6px 8px;border-radius:0 4px 4px 0">Serial</th>
          </tr></thead>
          <tbody>${data.devices.slice(0, 10).map(d => `
            <tr style="border-bottom:1px solid var(--gray-100)">
              <td style="padding:5px 8px;font-weight:600">${d.model}</td>
              <td style="padding:5px 8px;text-align:center">${d.qty}</td>
              <td style="padding:5px 8px;color:var(--gray-600)">${d.description || '—'}</td>
              <td style="padding:5px 8px;color:var(--gray-600)">${d.serial || '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${data.devices.length > 10 ? `<div style="font-size:11px;color:var(--gray-400);margin-top:4px">...and ${data.devices.length - 10} more devices</div>` : ''}`
      : `<div style="color:var(--gray-400);font-size:12px;margin-top:6px">
           No devices detected. Ensure column headers include words like <strong>Model</strong>, <strong>Device</strong>, <strong>Qty</strong>, or <strong>Quantity</strong>.
         </div>`;
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

  const dot = document.getElementById('notif-dot');
  dot.classList.toggle('hidden', unread.length === 0);

  document.getElementById('notif-list').innerHTML = notes.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markRead(${n.id})">
      <div class="notif-title">${n.title}</div>
      <div class="notif-msg">${n.message || ''}</div>
      <div class="notif-time">${formatDate(n.created_at)}</div>
    </div>
  `).join('') || '<div style="padding:20px;text-align:center;color:var(--gray-400)">No notifications</div>';
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
  if (newpw.length < 6)  { alertEl.innerHTML = '<div class="alert alert-error">Password must be at least 6 characters</div>'; return; }

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
  const cls = map[status] || 'pending';
  return `<span class="badge badge-${cls}">${(status || 'pending').replace('_',' ')}</span>`;
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
  if (!panel.contains(e.target) && !btn.contains(e.target)) panel.classList.remove('open');
});

// ── Admin Profile (Contact Settings) ───────────────────
let _adminProfileId = null;

async function loadAdminProfile() {
  const alertEl = document.getElementById('admin-profile-alert');
  try {
    const res = await apiFetch('/auth/me');
    if (!res) return; // 401 — apiFetch already called logout()
    const data = await res.json();
    if (!res.ok) {
      alertEl.innerHTML = `<div class="alert alert-error">${data.error || 'Failed to load profile'} — <a href="#" onclick="logout()" style="color:inherit;text-decoration:underline">Log out and re-login</a></div>`;
      return;
    }
    alertEl.innerHTML = '';
    _adminProfileId = data.id;
    document.getElementById('admin-full-name').value  = data.full_name  || '';
    document.getElementById('admin-department').value = data.department || '';
    document.getElementById('admin-email').value      = data.email      || '';
    document.getElementById('admin-phone').value      = data.phone      || '';
  } catch (err) {
    console.error('Load admin profile error:', err);
    alertEl.innerHTML = '<div class="alert alert-error">Failed to load profile. Please refresh the page.</div>';
  }
}

async function saveAdminProfile() {
  const alertEl = document.getElementById('admin-profile-alert');
  const body = {
    full_name:   document.getElementById('admin-full-name').value.trim(),
    department:  document.getElementById('admin-department').value.trim(),
    email:       document.getElementById('admin-email').value.trim(),
    phone:       document.getElementById('admin-phone').value.trim()
  };
  try {
    const res = await apiFetch('/admin/profile', {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      alertEl.innerHTML = '<div class="alert alert-success">Profile saved successfully.</div>';
      // Refresh the SMTP panel so the sender name/email reflect the updated profile
      loadEmailSettings();
    } else {
      alertEl.innerHTML = `<div class="alert alert-error">${data.error || 'Failed to save profile'}</div>`;
    }
  } catch (err) {
    alertEl.innerHTML = '<div class="alert alert-error">Network error. Please try again.</div>';
  }
  setTimeout(() => { alertEl.innerHTML = ''; }, 4000);
}

// ── Email Settings ─────────────────────────────────────
async function loadEmailSettings() {
  try {
    const res = await apiFetch('/admin/email-settings');
    const data = await res.json();

    const banner = document.getElementById('gmail-status-banner');
    if (data.gmail_configured) {
      banner.style.background = '#d4edda';
      banner.style.color = '#155724';
      banner.style.border = '1px solid #c3e6cb';
      banner.innerHTML = '&#10003; Gmail SMTP is configured and ready to send emails.';
    } else {
      banner.style.background = '#fff3cd';
      banner.style.color = '#856404';
      banner.style.border = '1px solid #ffeeba';
      banner.innerHTML = '&#9888; SMTP credentials not detected. Set <strong>SMTP_HOST</strong>, <strong>SMTP_USER</strong>, and <strong>SMTP_PASSWORD</strong> in your Vercel environment variables.';
    }

    // Sender identity comes from the admin user account, not from env vars or a separate form field
    document.getElementById('settings-gmail-user').value = data.admin_email     || '';
    document.getElementById('settings-from-name').value  = data.admin_full_name || '';
    document.getElementById('settings-notif-enabled').checked = data.email_notifications_enabled !== 'false';
  } catch (err) {
    console.error('Load email settings error:', err);
  }
}

async function saveEmailSettings() {
  const notifEnabled = document.getElementById('settings-notif-enabled').checked;
  const alertEl = document.getElementById('settings-alert');

  try {
    const res = await apiFetch('/admin/email-settings', {
      method: 'PUT',
      body: JSON.stringify({ email_notifications_enabled: notifEnabled })
    });
    const data = await res.json();
    if (res.ok) {
      alertEl.innerHTML = '<div class="alert alert-success">Settings saved successfully.</div>';
    } else {
      alertEl.innerHTML = `<div class="alert alert-error">${data.error || 'Failed to save settings'}</div>`;
    }
  } catch (err) {
    alertEl.innerHTML = '<div class="alert alert-error">Network error. Please try again.</div>';
  }
  setTimeout(() => { alertEl.innerHTML = ''; }, 4000);
}

async function sendTestEmail() {
  const email = document.getElementById('settings-test-email').value.trim();
  const alertEl = document.getElementById('settings-alert');
  if (!email) { alertEl.innerHTML = '<div class="alert alert-error">Enter a recipient email address.</div>'; return; }

  try {
    const res = await apiFetch('/admin/email-settings/test', {
      method: 'POST',
      body: JSON.stringify({ test_email: email })
    });
    const data = await res.json();
    if (res.ok) {
      alertEl.innerHTML = `<div class="alert alert-success">${data.message}</div>`;
    } else {
      alertEl.innerHTML = `<div class="alert alert-error">${data.error || 'Test failed'}</div>`;
    }
  } catch (err) {
    alertEl.innerHTML = '<div class="alert alert-error">Network error. Please try again.</div>';
  }
  setTimeout(() => { alertEl.innerHTML = ''; }, 5000);
}

// ── Daily Summary ─────────────────────────────────────
let _lastSummaryData = null;

function initDailySummary() {
  const dateEl = document.getElementById('summary-date');
  if (!dateEl.value) {
    dateEl.value = new Date().toISOString().slice(0, 10);
  }
}

async function loadDailySummary() {
  const dateVal = document.getElementById('summary-date').value;
  if (!dateVal) { showToast('Please select a date', 'error'); return; }

  const container = document.getElementById('daily-summary-content');
  container.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner" style="margin:auto"></div></div>';
  document.getElementById('btn-copy-summary').style.display = 'none';

  const res = await apiFetch(`/projects/daily-summary?date=${encodeURIComponent(dateVal)}`);
  if (!res?.ok) {
    container.innerHTML = '<div class="alert alert-error" style="margin-top:16px">Failed to load summary. Please try again.</div>';
    return;
  }

  const data = await res.json();
  _lastSummaryData = data;

  if (!data.projects || data.projects.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:48px 24px">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--gray-300)" stroke-width="1.5" style="margin:0 auto 16px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <h3 style="font-size:18px;color:var(--gray-600);margin-bottom:8px">No projects found</h3>
        <p style="font-size:14px;color:var(--gray-400)">No active projects for ${formatSummaryDate(dateVal)}.</p>
      </div>`;
    return;
  }

  const moduleIcons = {
    'Maintenance': '🔧', 'Handover': '🤝', 'Installation and Wiring': '⚡',
    'Programming and Trouble Shooting': '💻', 'Delivering': '📦', 'Site Survey': '🗺️', 'POC': '🔬'
  };
  const statusColors = { pending: '#F39C12', in_progress: '#2980B9', completed: '#27AE60', cancelled: '#95A5A6' };

  const totalModules = data.projects.reduce((sum, p) => sum + (p.modules?.length || 0), 0);

  let html = `
    <div class="card" style="margin-bottom:20px">
      <div class="card-body" style="padding:20px">
        <div style="display:flex;gap:24px;flex-wrap:wrap">
          <div style="text-align:center;min-width:80px">
            <div style="font-size:32px;font-weight:800;color:var(--red);font-family:'Rajdhani',sans-serif">${data.projects.length}</div>
            <div style="font-size:12px;color:var(--gray-500);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Projects</div>
          </div>
          <div style="text-align:center;min-width:80px">
            <div style="font-size:32px;font-weight:800;color:var(--info);font-family:'Rajdhani',sans-serif">${totalModules}</div>
            <div style="font-size:12px;color:var(--gray-500);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Total Modules</div>
          </div>
          <div style="text-align:center;min-width:100px">
            <div style="font-size:20px;font-weight:700;color:var(--gray-700);font-family:'Rajdhani',sans-serif">${formatSummaryDate(dateVal)}</div>
            <div style="font-size:12px;color:var(--gray-500);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Summary Date</div>
          </div>
        </div>
      </div>
    </div>`;

  html += data.projects.map((proj, idx) => {
    const modulesHtml = (proj.modules || []).length === 0
      ? '<p style="font-size:13px;color:var(--gray-400);padding:8px 0">No modules assigned</p>'
      : (proj.modules || []).map(mod => {
          const icon = moduleIcons[mod.module_type] || '📋';
          const color = statusColors[mod.status] || '#999';
          const devicesHtml = (mod.devices || []).length > 0
            ? `<div style="margin-top:8px;padding:8px 10px;background:var(--gray-50);border-radius:6px;border-left:3px solid var(--gray-300)">
                <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Devices</div>
                ${mod.devices.map(d => `
                  <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--gray-700);padding:2px 0">
                    <span style="color:var(--gray-400)">▪</span>
                    <span style="font-weight:600">${d.device_model}</span>
                    <span style="background:var(--gray-200);color:var(--gray-600);padding:1px 7px;border-radius:10px;font-size:11px">×${d.device_qty}</span>
                    ${d.device_description ? `<span style="color:var(--gray-500)">${d.device_description}</span>` : ''}
                  </div>`).join('')}
              </div>`
            : '';
          return `
            <div style="padding:10px 0;border-bottom:1px solid var(--gray-100)">
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:18px;flex-shrink:0">${icon}</span>
                <div style="flex:1">
                  <div style="font-size:14px;font-weight:600;color:var(--gray-800)">${mod.module_type}</div>
                  ${mod.scope_of_work ? `<div style="font-size:12px;color:var(--gray-500);margin-top:2px">${mod.scope_of_work.substring(0,80)}${mod.scope_of_work.length>80?'…':''}</div>` : ''}
                </div>
                <span style="font-size:11px;font-weight:600;color:white;background:${color};padding:3px 9px;border-radius:20px;white-space:nowrap;flex-shrink:0">${(mod.status||'pending').replace('_',' ')}</span>
                <span style="font-size:12px;color:var(--gray-500);min-width:35px;text-align:right">${mod.progress||0}%</span>
              </div>
              ${devicesHtml}
            </div>`;
        }).join('');

    return `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header" style="background:linear-gradient(135deg,var(--red-deep),var(--red));color:white;border-radius:var(--radius) var(--radius) 0 0">
          <div>
            <div style="font-size:16px;font-weight:700">${idx + 1}. ${proj.project_name}</div>
            <div style="font-size:12px;opacity:0.8;margin-top:2px">${[proj.client_name_1, proj.location_name].filter(Boolean).join(' · ') || 'No client / location'}</div>
          </div>
          <div style="text-align:right">
            <span style="font-size:11px;background:rgba(255,255,255,0.2);padding:4px 10px;border-radius:12px">${(proj.status||'pending').replace('_',' ')}</span>
            <div style="font-size:11px;opacity:0.7;margin-top:4px">${proj.modules?.length || 0} module${proj.modules?.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div class="card-body" style="padding:0 20px">
          ${modulesHtml}
        </div>
        ${proj.user1_name || proj.user2_name ? `
          <div style="padding:10px 20px;border-top:1px solid var(--gray-100);font-size:12px;color:var(--gray-500)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            Assigned: ${[proj.user1_name, proj.user2_name].filter(Boolean).join(' & ')}
          </div>` : ''}
      </div>`;
  }).join('');

  container.innerHTML = html;
  document.getElementById('btn-copy-summary').style.display = '';
}

function formatSummaryDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function copySummaryText() {
  if (!_lastSummaryData) return;
  const d = _lastSummaryData;
  const moduleIcons = {
    'Maintenance': '🔧', 'Handover': '🤝', 'Installation and Wiring': '⚡',
    'Programming and Trouble Shooting': '💻', 'Delivering': '📦', 'Site Survey': '🗺️', 'POC': '🔬'
  };

  let text = `📅 *Daily Project Summary — ${formatSummaryDate(document.getElementById('summary-date').value)}*\n`;
  text += `📊 ${d.projects.length} project${d.projects.length !== 1 ? 's' : ''} | `;
  const totalMods = d.projects.reduce((s, p) => s + (p.modules?.length || 0), 0);
  text += `${totalMods} module${totalMods !== 1 ? 's' : ''}\n`;
  text += '─'.repeat(35) + '\n\n';

  d.projects.forEach((proj, idx) => {
    text += `📁 *${idx + 1}. ${proj.project_name}*\n`;
    if (proj.client_name_1) text += `   👤 Client: ${proj.client_name_1}\n`;
    if (proj.location_name) text += `   📍 ${proj.location_name}\n`;
    if (proj.user1_name || proj.user2_name) {
      text += `   👷 ${[proj.user1_name, proj.user2_name].filter(Boolean).join(' & ')}\n`;
    }
    if (proj.modules?.length) {
      proj.modules.forEach(mod => {
        const icon = moduleIcons[mod.module_type] || '📋';
        const status = (mod.status || 'pending').replace('_', ' ');
        text += `   ${icon} ${mod.module_type} — ${status} (${mod.progress || 0}%)\n`;
        if (mod.devices?.length) {
          mod.devices.forEach(d => {
            text += `      • ${d.device_model} ×${d.device_qty}${d.device_description ? ' — ' + d.device_description : ''}\n`;
          });
        }
      });
    } else {
      text += `   _(no modules)\n`;
    }
    text += '\n';
  });

  text += `Generated by ELV Project Coordinator`;

  navigator.clipboard.writeText(text).then(() => {
    showToast('Summary copied to clipboard!', 'success');
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Summary copied to clipboard!', 'success');
  });
}
