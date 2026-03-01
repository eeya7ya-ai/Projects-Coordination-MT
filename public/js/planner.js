/* ─── Planner Dashboard ─────────────────────────────────
   Role: planner — shows daily project summary with module
   preparation checkmarks for the next-day readiness check.
──────────────────────────────────────────────────────── */

const token = localStorage.getItem('elv_token');
const currentUser = JSON.parse(localStorage.getItem('elv_user') || '{}');

// Guard: only planners (and admins who visit directly) may access
if (!token || !['planner', 'admin'].includes(currentUser.role)) {
  localStorage.clear();
  window.location.href = '/';
}

// ── API helper ───────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(opts.headers || {})
    }
  });
  if (res.status === 401) {
    localStorage.clear();
    window.location.href = '/';
  }
  return res;
}

// ── Helpers ──────────────────────────────────────────────
function formatDateLong(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function statusBadge(status) {
  const map = { pending: 'pending', in_progress: 'progress', completed: 'completed', cancelled: 'cancelled', on_hold: 'warning' };
  const cls = map[status] || 'pending';
  return `<span class="badge badge-${cls}">${(status || 'pending').replace('_', ' ')}</span>`;
}

function priorityBadge(p) {
  const colors = { low: '#27AE60', normal: '#2980B9', medium: '#2980B9', high: '#F39C12', urgent: '#C0392B', critical: '#8B0000' };
  const color = colors[p] || colors.normal;
  return `<span class="badge" style="background:${color};color:#fff">${p || 'normal'}</span>`;
}

function moduleIcon(type) {
  const icons = {
    'Maintenance': '🔧',
    'Handover': '🤝',
    'Installation and Wiring': '⚡',
    'Programming and Trouble Shooting': '💻',
    'Delivering': '📦',
    'Site Survey': '🗺️',
    'POC': '🔬'
  };
  return icons[type] || '📋';
}

function showToast(message, type = 'info') {
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
  }, 3500);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function logout() {
  localStorage.clear();
  window.location.href = '/';
}

// ── Mobile sidebar ───────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ── Date controls ────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function goToday() {
  document.getElementById('summary-date').value = todayStr();
  loadSummary();
}

// ── Load daily summary ────────────────────────────────────
async function loadSummary() {
  const date = document.getElementById('summary-date').value || todayStr();
  const content = document.getElementById('summary-content');
  const statsEl = document.getElementById('summary-stats');

  content.innerHTML = `
    <div class="text-center" style="padding:60px 20px">
      <div class="spinner" style="margin:0 auto 16px"></div>
      <p style="color:var(--gray-500)">Loading summary...</p>
    </div>`;
  statsEl.innerHTML = '';

  try {
    const res = await apiFetch(`/projects/daily-summary?date=${date}`);
    if (!res.ok) {
      const err = await res.json();
      content.innerHTML = `<div class="alert alert-error">${err.error || 'Failed to load summary'}</div>`;
      return;
    }
    const data = await res.json();
    renderSummary(data);
  } catch (e) {
    content.innerHTML = `<div class="alert alert-error">Network error. Please try again.</div>`;
  }
}

// ── Render summary ────────────────────────────────────────
function renderSummary(data) {
  const { date, projects } = data;
  const content = document.getElementById('summary-content');
  const statsEl = document.getElementById('summary-stats');

  // Update page title / date display
  document.getElementById('today-display').textContent = formatDateLong(date);

  // Stats
  const totalModules = projects.reduce((s, p) => s + (p.modules?.length || 0), 0);
  const preparedModules = projects.reduce((s, p) => s + (p.modules?.filter(m => m.is_prepared).length || 0), 0);
  statsEl.innerHTML = `
    <div style="text-align:center">
      <div style="font-size:22px;font-weight:700;color:var(--red);font-family:'Rajdhani',sans-serif">${projects.length}</div>
      <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.05em">Projects</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:22px;font-weight:700;color:var(--info);font-family:'Rajdhani',sans-serif">${totalModules}</div>
      <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.05em">Modules</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:22px;font-weight:700;color:var(--success);font-family:'Rajdhani',sans-serif">${preparedModules}/${totalModules}</div>
      <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.05em">Prepared</div>
    </div>`;

  if (!projects.length) {
    content.innerHTML = `
      <div class="text-center text-muted" style="padding:60px 20px">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--gray-300)" stroke-width="1.5" style="margin-bottom:16px">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p style="font-size:15px;color:var(--gray-500)">No active projects on <strong>${formatDateLong(date)}</strong></p>
      </div>`;
    return;
  }

  content.innerHTML = projects.map(proj => renderProjectCard(proj, date)).join('');
}

// ── Render a single project card ─────────────────────────
function renderProjectCard(proj, date) {
  const modules = proj.modules || [];
  const preparedCount = modules.filter(m => m.is_prepared).length;

  return `
    <div class="card" style="margin-bottom:20px" id="proj-card-${proj.id}">
      <div class="card-header" style="flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:17px;font-weight:700;margin-bottom:4px">${proj.project_name}</div>
          <div style="font-size:13px;color:var(--gray-500)">
            ${proj.client_name_1 ? `<span style="margin-right:12px">👤 ${proj.client_name_1}</span>` : ''}
            ${proj.location_name ? `<span style="margin-right:12px">📍 ${proj.location_name}</span>` : ''}
            ${proj.user1_name ? `<span style="margin-right:12px">🔧 ${proj.user1_name}${proj.user2_name ? ` &amp; ${proj.user2_name}` : ''}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          ${statusBadge(proj.status)}
          ${priorityBadge(proj.priority)}
          <span style="font-size:13px;color:var(--gray-500)">${preparedCount}/${modules.length} prepared</span>
        </div>
      </div>
      <div class="card-body" style="padding:0">
        ${modules.length === 0
          ? '<div style="padding:20px;color:var(--gray-400);font-size:14px;text-align:center">No modules for this project</div>'
          : `<div style="padding:8px 0">${modules.map(mod => renderModuleRow(mod, date, proj.id)).join('')}</div>`
        }
      </div>
    </div>`;
}

// ── Render a module row with preparation checkbox ─────────
function renderModuleRow(mod, date, projId) {
  const devices = mod.devices || [];
  const deviceSummary = devices.length
    ? `<span style="font-size:12px;color:var(--gray-500);margin-left:8px">${devices.map(d => `${d.device_model} ×${d.device_qty}`).join(', ')}</span>`
    : '';

  return `
    <div class="module-prep-row ${mod.is_prepared ? 'prepared' : ''}" id="mod-row-${mod.id}"
         style="display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid var(--gray-100);transition:background 0.2s">
      <label class="prep-checkbox" style="display:flex;align-items:center;gap:0;cursor:pointer;flex-shrink:0" title="${mod.is_prepared ? 'Mark as not prepared' : 'Mark as prepared'}">
        <input type="checkbox" ${mod.is_prepared ? 'checked' : ''} style="display:none"
          onchange="togglePrepare(${mod.id}, '${date}', this.checked)">
        <div class="prep-check-box" style="
          width:24px;height:24px;border-radius:6px;border:2px solid ${mod.is_prepared ? 'var(--success)' : 'var(--gray-300)'};
          background:${mod.is_prepared ? 'var(--success)' : 'transparent'};
          display:flex;align-items:center;justify-content:center;transition:all 0.2s;flex-shrink:0
        ">
          ${mod.is_prepared ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
        </div>
      </label>

      <div style="font-size:18px;flex-shrink:0">${moduleIcon(mod.module_type)}</div>

      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;${mod.is_prepared ? 'color:var(--gray-500);text-decoration:line-through' : ''}">${mod.module_type}</div>
        ${mod.scope_of_work ? `<div style="font-size:12px;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:480px">${mod.scope_of_work}</div>` : ''}
        ${deviceSummary}
      </div>

      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        ${statusBadge(mod.status)}
        ${mod.progress > 0 ? `<span style="font-size:12px;color:var(--gray-500)">${mod.progress}%</span>` : ''}
      </div>
    </div>`;
}

// ── Toggle preparation state ──────────────────────────────
async function togglePrepare(moduleId, date, isPrepared) {
  const row = document.getElementById(`mod-row-${moduleId}`);
  if (!row) return;

  try {
    const res = await apiFetch(`/projects/modules/${moduleId}/prepare`, {
      method: 'PUT',
      body: JSON.stringify({ prepared_date: date, is_prepared: isPrepared })
    });

    if (!res.ok) {
      showToast('Failed to update. Please try again.', 'error');
      // Revert checkbox
      const cb = row.querySelector('input[type=checkbox]');
      if (cb) cb.checked = !isPrepared;
      return;
    }

    // Update row appearance
    const checkBox = row.querySelector('.prep-check-box');
    const label = row.querySelector('div[style*="font-weight:600"]');

    if (isPrepared) {
      row.classList.add('prepared');
      row.style.background = 'rgba(39,174,96,0.05)';
      checkBox.style.border = '2px solid var(--success)';
      checkBox.style.background = 'var(--success)';
      checkBox.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
      if (label) { label.style.color = 'var(--gray-500)'; label.style.textDecoration = 'line-through'; }
    } else {
      row.classList.remove('prepared');
      row.style.background = '';
      checkBox.style.border = '2px solid var(--gray-300)';
      checkBox.style.background = 'transparent';
      checkBox.innerHTML = '';
      if (label) { label.style.color = ''; label.style.textDecoration = ''; }
    }

    // Update stats
    refreshStats();
  } catch (e) {
    showToast('Network error. Please try again.', 'error');
  }
}

// ── Refresh the stats counters ────────────────────────────
function refreshStats() {
  const rows = document.querySelectorAll('[id^="mod-row-"]');
  const totalModules = rows.length;
  const preparedModules = document.querySelectorAll('[id^="mod-row-"].prepared').length;

  const cards = document.querySelectorAll('[id^="proj-card-"]');
  const totalProjects = cards.length;

  const statsEl = document.getElementById('summary-stats');
  if (!statsEl) return;

  const children = statsEl.children;
  if (children[0]) children[0].querySelector('div').textContent = totalProjects;
  if (children[1]) children[1].querySelector('div').textContent = totalModules;
  if (children[2]) children[2].querySelector('div').textContent = `${preparedModules}/${totalModules}`;

  // Update per-project prepared counts
  cards.forEach(card => {
    const projId = card.id.replace('proj-card-', '');
    const projRows = card.querySelectorAll('[id^="mod-row-"]');
    const projPrepared = card.querySelectorAll('[id^="mod-row-"].prepared').length;
    const countEl = card.querySelector('.card-header span:last-child');
    if (countEl) countEl.textContent = `${projPrepared}/${projRows.length} prepared`;
  });
}

// ── Change password ───────────────────────────────────────
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

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Set user info in sidebar
  const initials = currentUser.full_name
    ? currentUser.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'P';
  const avatar = document.getElementById('sidebar-avatar');
  if (avatar) {
    avatar.textContent = initials;
    if (currentUser.avatar_color) avatar.style.background = currentUser.avatar_color;
  }
  const nameEl = document.getElementById('sidebar-name');
  if (nameEl) nameEl.textContent = currentUser.full_name || 'Planner';

  // Set today's date in picker and display
  const today = todayStr();
  document.getElementById('summary-date').value = today;
  document.getElementById('today-display').textContent = formatDateLong(today);

  // Load summary for today immediately
  loadSummary();

  // Hide loading overlay and show app
  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app').style.display = '';
});
