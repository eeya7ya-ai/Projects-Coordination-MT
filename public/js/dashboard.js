/* ═══════════════════════════════════════════════════════
   ELV User Dashboard — JavaScript
═══════════════════════════════════════════════════════ */

const API = '/api';
let token = localStorage.getItem('elv_token');
let currentUser = JSON.parse(localStorage.getItem('elv_user') || '{}');
let myProjects = [];
let currentModuleId = null;
let currentProjectId = null;

// ── Auth check ────────────────────────────────────────
if (!token || currentUser.role === 'admin') {
  window.location.href = currentUser.role === 'admin' ? '/admin' : '/';
}

const headers = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` });

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
  if (res.status === 401) { logout(); return; }
  return res;
}

// ── Init ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('sidebar-name').textContent = currentUser.full_name || 'User';
  document.getElementById('sidebar-dept').textContent = currentUser.department || 'ELV Team';
  const av = document.getElementById('sidebar-avatar');
  av.textContent = (currentUser.full_name || 'U')[0].toUpperCase();
  av.style.background = currentUser.avatar_color || '#8B0000';

  await loadMyProjects();
  loadNotifications();
  setInterval(loadNotifications, 30000);

  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
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

  const titles = { 'my-projects': 'My Projects', 'active-tasks': 'Active Tasks', 'my-reports': 'My Reports' };
  document.getElementById('page-title').textContent = titles[page] || page;

  if (page === 'active-tasks') renderActiveTasks();
  if (page === 'my-reports') loadMyReports();

  // Close sidebar on mobile after navigation
  closeSidebar();
}

// ── My Projects ───────────────────────────────────────
async function loadMyProjects() {
  const res = await apiFetch('/projects');
  if (!res?.ok) return;
  myProjects = await res.json();

  // Stats
  const total = myProjects.length;
  const active = myProjects.filter(p => p.status === 'in_progress').length;
  const completed = myProjects.filter(p => p.status === 'completed').length;
  const pending = myProjects.filter(p => p.status === 'pending').length;

  if (total > 0) {
    document.getElementById('projects-badge').style.display = '';
    document.getElementById('projects-badge').textContent = total;
  }

  document.getElementById('user-stats').innerHTML = `
    <div class="stat-card"><div class="stat-icon red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg></div><div class="stat-value">${total}</div><div class="stat-label">Total Assigned</div></div>
    <div class="stat-card"><div class="stat-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="stat-value">${active}</div><div class="stat-label">In Progress</div></div>
    <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div class="stat-value">${completed}</div><div class="stat-label">Completed</div></div>
    <div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div class="stat-value">${pending}</div><div class="stat-label">Pending</div></div>
  `;

  document.getElementById('my-proj-count').textContent = `${total} project${total !== 1 ? 's' : ''}`;
  renderMyProjects(myProjects);
}

function renderMyProjects(projects) {
  const grid = document.getElementById('my-projects-grid');
  grid.innerHTML = projects.map(p => {
    const priorityColor = { urgent: '#E74C3C', high: '#E67E22', normal: '#27AE60' }[p.priority] || '#27AE60';
    return `
      <div class="project-card" onclick="openProject(${p.id})">
        <div class="project-card-header" style="background:linear-gradient(135deg, var(--red-deep), var(--red))">
          <div class="proj-name">${p.project_name}</div>
          <div class="proj-client">${p.client_name_1 || 'No client specified'}</div>
          <div class="proj-priority" style="background:${priorityColor}22;color:${priorityColor};border:1px solid ${priorityColor}44">${p.priority || 'normal'}</div>
          <div class="hex-pattern"></div>
        </div>
        <div class="project-card-body">
          <div class="proj-meta">
            ${p.location_name ? `<div class="proj-meta-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg> ${p.location_name}</div>` : ''}
            ${p.start_date ? `<div class="proj-meta-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${p.start_date} → ${p.end_date || 'TBD'}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            ${statusBadge(p.status)}
            <span style="font-size:12px;color:var(--gray-400)">${p.module_count || 0} module${p.module_count !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="project-card-footer">
          <span style="font-size:12px;color:var(--gray-400)">${formatDate(p.created_at)}</span>
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();openProject(${p.id})">
            View Tasks →
          </button>
        </div>
      </div>
    `;
  }).join('') || `
    <div style="grid-column:1/-1;text-align:center;padding:80px 20px;color:var(--gray-400)">
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom:16px;opacity:0.3"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
      <h3 style="font-size:18px;margin-bottom:8px;color:var(--gray-600)">No Projects Assigned</h3>
      <p style="font-size:14px">Your admin will assign projects to you soon.</p>
    </div>
  `;
}

function filterMyProjects() {
  const status = document.getElementById('filter-proj-status').value;
  renderMyProjects(status ? myProjects.filter(p => p.status === status) : myProjects);
}

// ── Open Project (module list) ────────────────────────
async function openProject(id) {
  currentProjectId = id;
  const res = await apiFetch(`/projects/${id}`);
  if (!res?.ok) return;
  const p = await res.json();

  // Navigate to active tasks and show this project's modules
  navigate('active-tasks');
  renderProjectModules(p);
}

function renderProjectModules(p) {
  const container = document.getElementById('active-tasks-list');

  // Mini project header
  const header = `
    <div class="card" style="margin-bottom:24px;border-left:4px solid var(--red)">
      <div class="card-body" style="padding:20px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <h2 style="font-size:20px;font-weight:800;color:var(--gray-800)">${p.project_name}</h2>
            <p style="font-size:14px;color:var(--gray-500);margin-top:4px">${p.client_name_1 || ''}${p.client_name_2 ? ' / '+p.client_name_2 : ''}${p.client_number ? ' — '+p.client_number : ''}</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            ${p.location_name ? `<a href="https://maps.google.com/?q=${p.location_lat || p.location_name},${p.location_lng || ''}" target="_blank" class="btn btn-sm btn-secondary">📍 ${p.location_name}</a>` : ''}
            ${statusBadge(p.status)}
          </div>
        </div>
        ${p.start_date || p.end_date ? `<div style="font-size:13px;color:var(--gray-500);margin-top:10px">📅 ${p.start_date || '?'} → ${p.end_date || 'TBD'}</div>` : ''}
      </div>
    </div>
  `;

  const modulesHtml = (p.modules || []).map(m => renderUserModuleCard(m, p)).join('') ||
    '<div class="text-muted text-center" style="padding:40px">No modules assigned</div>';

  container.innerHTML = header + modulesHtml;

  // Render mini map if location
  if (p.location_lat && p.location_lng) {
    setTimeout(() => {
      const mapId = `mini-map-${p.id}`;
      if (document.getElementById(mapId)) {
        const miniMap = L.map(mapId).setView([p.location_lat, p.location_lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(miniMap);
        L.circleMarker([p.location_lat, p.location_lng], {
          radius: 10, fillColor: '#C0392B', color: 'white', weight: 2, fillOpacity: 1
        }).addTo(miniMap);
      }
    }, 200);
  }
}

function renderUserModuleCard(m, project) {
  const done = m.checklist.filter(c => c.is_completed).length;
  const total = m.checklist.length;
  const progress = total > 0 ? Math.round((done/total)*100) : m.progress;
  const hasReport = m.reports?.length > 0;
  const lastReport = m.reports?.[0];

  return `
    <div class="card" style="margin-bottom:20px;overflow:visible">
      <!-- Module Header -->
      <div style="background:linear-gradient(135deg,var(--red-dark),var(--red));padding:16px 20px;border-radius:var(--radius) var(--radius) 0 0;position:relative;overflow:hidden">
        <div class="hex-pattern"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;position:relative">
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:26px">${moduleIcon(m.module_type)}</span>
            <div>
              <div style="font-size:16px;font-weight:700;color:white">${m.module_type}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.7)">Module #${m.id}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:20px;font-weight:800;color:white;font-family:'Rajdhani',sans-serif">${progress}%</span>
            ${moduleStatusSelect(m, project.id)}
          </div>
        </div>
        <!-- Progress bar in header -->
        <div style="margin-top:12px;background:rgba(255,255,255,0.2);height:6px;border-radius:3px;overflow:hidden">
          <div style="background:white;height:100%;width:${progress}%;border-radius:3px;transition:width 0.8s"></div>
        </div>
      </div>

      <div style="padding:20px">
        <!-- Info -->
        <div class="grid-2" style="gap:16px;margin-bottom:20px">
          ${m.scope_of_work ? `<div><label style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.5px">Scope of Work</label><p style="font-size:13px;color:var(--gray-700);margin-top:6px;line-height:1.6">${m.scope_of_work}</p></div>` : ''}
          ${m.issue_details ? `<div><label style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.5px">Issue Details</label><p style="font-size:13px;color:var(--gray-700);margin-top:6px;line-height:1.6">${m.issue_details}</p></div>` : ''}
        </div>

        <!-- Devices -->
        ${m.devices?.length ? `
          <div style="margin-bottom:20px">
            <label style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.5px">Equipment / Devices</label>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
              ${m.devices.map(d => `
                <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:8px 12px">
                  <div style="font-size:13px;font-weight:700">${d.device_model}</div>
                  <div style="font-size:11px;color:var(--gray-400)">Qty: ${d.device_qty}${d.serial_number ? ' | SN: '+d.serial_number : ''}${d.device_description ? ' | '+d.device_description : ''}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Checklist -->
        <div style="margin-bottom:20px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <label style="font-size:13px;font-weight:700;color:var(--gray-700)">Task Checklist <span style="color:var(--gray-400);font-weight:400">(${done}/${total} completed)</span></label>
          </div>
          <div>
            ${m.checklist.map(item => `
              <div class="checklist-item ${item.is_completed ? 'completed' : ''}" id="check-${item.id}">
                <div class="check-circle ${item.is_completed ? 'checked' : ''}" onclick="toggleChecklist(${project.id}, ${m.id}, ${item.id}, ${!item.is_completed})"></div>
                <div style="flex:1">
                  <div class="item-title">${item.task_title}</div>
                  ${item.task_description ? `<div class="item-desc">${item.task_description}</div>` : ''}
                  ${item.is_completed && item.completed_at ? `<div class="item-desc" style="color:var(--success)">✓ Completed ${formatDate(item.completed_at)}</div>` : ''}
                </div>
              </div>
            `).join('') || '<p class="text-muted text-small">No checklist items</p>'}
          </div>
        </div>

        <!-- User Notes -->
        <div style="margin-bottom:20px">
          <label style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px">My Notes</label>
          <textarea id="notes-${m.id}" rows="2" placeholder="Add your working notes here..."
            style="width:100%;padding:10px 14px;border:2px solid var(--gray-200);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none;transition:border-color 0.2s"
            onfocus="this.style.borderColor='var(--red)'" onblur="this.style.borderColor='var(--gray-200)'">${m.user_notes || ''}</textarea>
          <button class="btn btn-sm btn-secondary" style="margin-top:6px" onclick="saveNotes(${project.id}, ${m.id})">Save Notes</button>
        </div>

        <!-- Report section -->
        ${lastReport ? `
          <div style="background:#F8F9FA;border-radius:10px;padding:14px;margin-bottom:16px;border:1px solid var(--gray-200)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong style="font-size:13px">Last Report</strong>
              <span class="badge badge-${lastReport.review_status === 'approved' ? 'completed' : lastReport.review_status === 'rejected' ? 'urgent' : 'pending'}">${lastReport.review_status}</span>
            </div>
            ${lastReport.work_done ? `<p style="font-size:13px;color:var(--gray-600)">${lastReport.work_done}</p>` : ''}
            ${lastReport.review_notes ? `<div style="margin-top:8px;padding:8px;background:${lastReport.review_status === 'rejected' ? '#FDECEA' : '#D5F5E3'};border-radius:6px;font-size:12px">
              <strong>Admin feedback:</strong> ${lastReport.review_notes}
            </div>` : ''}
          </div>
        ` : ''}

        <!-- Action buttons -->
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-danger" onclick="openReportModal(${project.id}, ${m.id})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Submit Report
          </button>
          ${m.status !== 'completed' && done === total && total > 0 ? `
            <button class="btn btn-success" onclick="markModuleComplete(${project.id}, ${m.id})">
              ✓ Mark as Complete
            </button>
          ` : ''}
        </div>

        ${m.admin_notes ? `<div style="margin-top:12px;background:#FFF3CD;border:1px solid #FFDA6A;border-radius:8px;padding:12px"><strong style="font-size:12px;color:#856404">Admin Notes:</strong><p style="font-size:13px;margin-top:4px;color:#856404">${m.admin_notes}</p></div>` : ''}
      </div>
    </div>
  `;
}

function moduleStatusSelect(m, projectId) {
  return `
    <select onchange="updateModuleStatus(${projectId}, ${m.id}, this.value)"
      style="padding:6px 10px;background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.3);border-radius:8px;font-size:12px;font-family:inherit;cursor:pointer;outline:none">
      <option value="pending" ${m.status==='pending'?'selected':''} style="color:#333">Pending</option>
      <option value="in_progress" ${m.status==='in_progress'?'selected':''} style="color:#333">In Progress</option>
      <option value="completed" ${m.status==='completed'?'selected':''} style="color:#333">Completed</option>
    </select>
  `;
}

async function toggleChecklist(projectId, moduleId, itemId, complete) {
  const res = await apiFetch(`/projects/${projectId}/modules/${moduleId}/checklist/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify({ is_completed: complete ? 1 : 0 })
  });
  if (!res?.ok) return;
  const data = await res.json();

  // Update UI
  const item = document.getElementById(`check-${itemId}`);
  if (item) {
    item.classList.toggle('completed', complete);
    const circle = item.querySelector('.check-circle');
    circle.classList.toggle('checked', complete);
  }

  // Update progress bar in module header
  const projectRes = await apiFetch(`/projects/${projectId}`);
  if (projectRes?.ok) {
    const p = await projectRes.json();
    const m = p.modules.find(mod => mod.id === moduleId);
    if (m) {
      const done = m.checklist.filter(c => c.is_completed).length;
      const total = m.checklist.length;
      const progress = total > 0 ? Math.round((done/total)*100) : 0;
      const bars = document.querySelectorAll(`[data-module-progress="${moduleId}"]`);
      bars.forEach(b => b.style.width = progress + '%');
    }
  }
}

async function updateModuleStatus(projectId, moduleId, status) {
  const opts = { method: 'PUT', body: JSON.stringify({ status }) };
  if (status === 'in_progress') opts.body = JSON.stringify({ status, started_at: new Date().toISOString() });
  await apiFetch(`/projects/${projectId}/modules/${moduleId}`, opts);
}

async function saveNotes(projectId, moduleId) {
  const notes = document.getElementById(`notes-${moduleId}`)?.value || '';
  const res = await apiFetch(`/projects/${projectId}/modules/${moduleId}`, {
    method: 'PUT',
    body: JSON.stringify({ user_notes: notes })
  });
  if (res?.ok) {
    const btn = event.target;
    btn.textContent = '✓ Saved!';
    setTimeout(() => btn.textContent = 'Save Notes', 1500);
  }
}

async function markModuleComplete(projectId, moduleId) {
  if (!confirm('Mark this module as complete and notify admin?')) return;
  const res = await apiFetch(`/projects/${projectId}/modules/${moduleId}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'completed', progress: 100 })
  });
  if (res?.ok) {
    alert('Module marked as complete!');
    openProject(projectId);
  }
}

// ── Active Tasks ──────────────────────────────────────
function renderActiveTasks() {
  if (!myProjects.length) {
    document.getElementById('active-tasks-list').innerHTML =
      '<div class="text-center text-muted" style="padding:60px">No projects assigned yet</div>';
    return;
  }
  // Show select first
  document.getElementById('active-tasks-list').innerHTML = `
    <div class="card" style="margin-bottom:20px">
      <div class="card-body">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <label style="font-size:14px;font-weight:600;color:var(--gray-700)">Select Project:</label>
          <select onchange="openProject(this.value)" style="flex:1;min-width:200px;padding:10px;border:2px solid var(--gray-200);border-radius:8px;font-family:inherit;outline:none">
            <option value="">— Choose a project —</option>
            ${myProjects.filter(p => p.status !== 'completed').map(p => `<option value="${p.id}">${p.project_name} (${p.status?.replace('_',' ') || 'pending'})</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
    <div class="text-center text-muted" style="padding:40px">Select a project above to view its tasks</div>
  `;
}

// ── My Reports ────────────────────────────────────────
async function loadMyReports() {
  const container = document.getElementById('my-reports-list');
  container.innerHTML = '<div class="text-center text-muted" style="padding:20px">Loading...</div>';

  const reportItems = [];
  for (const p of myProjects) {
    const res = await apiFetch(`/projects/${p.id}`);
    if (!res?.ok) continue;
    const pd = await res.json();
    for (const m of pd.modules || []) {
      for (const r of m.reports || []) {
        if (r.submitted_by === currentUser.id || String(r.submitted_by) === String(currentUser.id)) {
          reportItems.push({ ...r, project: pd, module: m });
        }
      }
    }
  }

  if (!reportItems.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:80px;color:var(--gray-400)">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom:16px;opacity:0.3"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <h3 style="font-size:18px;color:var(--gray-600);margin-bottom:8px">No Reports Yet</h3>
        <p>Submit your first report from your project tasks.</p>
      </div>`;
    return;
  }

  container.innerHTML = reportItems.map(r => `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <div>
          <div style="font-size:16px;font-weight:700">${r.project.project_name}</div>
          <div style="font-size:13px;color:var(--gray-500)">${r.module.module_type}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="badge badge-${r.review_status === 'approved' ? 'completed' : r.review_status === 'rejected' ? 'urgent' : 'pending'}">${r.review_status}</span>
          <span style="font-size:12px;color:var(--gray-400)">${formatDate(r.submitted_at)}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="grid-2" style="gap:16px">
          ${r.work_done ? `<div><label style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;display:block;margin-bottom:4px">Work Done</label><p style="font-size:14px">${r.work_done}</p></div>` : ''}
          ${r.issues_found ? `<div><label style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;display:block;margin-bottom:4px">Issues Found</label><p style="font-size:14px">${r.issues_found}</p></div>` : ''}
          ${r.hours_spent ? `<div><label style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;display:block;margin-bottom:4px">Hours Spent</label><p style="font-size:14px">${r.hours_spent}h</p></div>` : ''}
        </div>
        ${r.review_notes ? `<div style="margin-top:12px;padding:10px;background:${r.review_status==='rejected'?'#FDECEA':'#D5F5E3'};border-radius:8px;font-size:13px"><strong>Admin:</strong> ${r.review_notes}</div>` : ''}
      </div>
    </div>
  `).join('');
}

// ── Report Modal ──────────────────────────────────────
function openReportModal(projectId, moduleId) {
  currentProjectId = projectId;
  currentModuleId = moduleId;
  document.getElementById('report-project-id').value = projectId;
  document.getElementById('report-module-id').value = moduleId;
  ['r-work-done','r-issues','r-next','r-notes','r-hours'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('report-alert').innerHTML = '';
  openModal('report-modal');
}

async function submitReport() {
  const projectId = document.getElementById('report-project-id').value;
  const moduleId = document.getElementById('report-module-id').value;
  const work_done = document.getElementById('r-work-done').value.trim();
  const alertEl = document.getElementById('report-alert');

  if (!work_done) {
    alertEl.innerHTML = '<div class="alert alert-error">Please describe the work completed</div>';
    return;
  }

  const payload = {
    work_done,
    issues_found: document.getElementById('r-issues').value,
    next_steps: document.getElementById('r-next').value,
    report_text: document.getElementById('r-notes').value,
    hours_spent: parseFloat(document.getElementById('r-hours').value) || null
  };

  const res = await apiFetch(`/projects/${projectId}/modules/${moduleId}/reports`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (res?.ok) {
    alertEl.innerHTML = '<div class="alert alert-success">Report submitted successfully!</div>';
    setTimeout(() => {
      closeModal('report-modal');
      openProject(projectId);
    }, 1200);
  } else {
    const data = await res?.json();
    alertEl.innerHTML = `<div class="alert alert-error">${data?.error || 'Failed to submit'}</div>`;
  }
}

// ── Notifications ─────────────────────────────────────
async function loadNotifications() {
  const res = await apiFetch('/projects/notifications/mine');
  if (!res?.ok) return;
  const notes = await res.json();
  const unread = notes.filter(n => !n.is_read);
  document.getElementById('notif-dot').classList.toggle('hidden', unread.length === 0);
  const mobNotif = document.getElementById('mobile-notif-badge');
  if (mobNotif) { mobNotif.classList.toggle('hidden', unread.length === 0); if (unread.length) mobNotif.textContent = unread.length; }

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
function showChangePassword() { openModal('pw-modal'); }

async function changePassword() {
  const current = document.getElementById('pw-current').value;
  const newpw   = document.getElementById('pw-new').value;
  const confirm = document.getElementById('pw-confirm').value;
  const alertEl = document.getElementById('pw-alert');
  if (newpw !== confirm) { alertEl.innerHTML = '<div class="alert alert-error">Passwords do not match</div>'; return; }
  const res = await apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: newpw }) });
  const data = await res.json();
  if (res.ok) { alertEl.innerHTML = '<div class="alert alert-success">Password changed!</div>'; setTimeout(() => closeModal('pw-modal'), 1500); }
  else alertEl.innerHTML = `<div class="alert alert-error">${data.error}</div>`;
}

// ── Helpers ───────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function logout() { localStorage.clear(); window.location.href = '/'; }

function statusBadge(status) {
  const map = { pending: 'pending', in_progress: 'progress', completed: 'completed', cancelled: 'cancelled' };
  return `<span class="badge badge-${map[status] || 'pending'}">${(status || 'pending').replace('_',' ')}</span>`;
}

function moduleIcon(type) {
  const icons = { 'Maintenance': '🔧', 'Handover': '🤝', 'Installation and Wiring': '⚡', 'Programming and Trouble Shooting': '💻', 'Delivering': '📦', 'Site Survey': '🗺️', 'POC': '🔬' };
  return icons[type] || '📋';
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Close modals / panel on outside click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
});
document.addEventListener('click', e => {
  const panel = document.getElementById('notif-panel');
  const btn = document.querySelector('.notif-btn');
  if (btn && !panel.contains(e.target) && !btn.contains(e.target)) panel.classList.remove('open');
});
