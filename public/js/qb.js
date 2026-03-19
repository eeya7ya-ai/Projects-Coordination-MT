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
  qbUpdateModeDesc();

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
  const card = document.getElementById('qb-product-card');
  card.style.display = 'block';

  document.getElementById('qb-pc-model').textContent = p.model;
  document.getElementById('qb-pc-desc').textContent  = p.description || '—';
  document.getElementById('qb-pc-specs').textContent  = p.specifications || 'No specifications available';

  const currency = document.getElementById('qb-c-currency')?.value || 'JOD';
  document.getElementById('qb-pc-dpp').textContent = qbFmt(p.dpp_price,     currency);
  document.getElementById('qb-pc-si').textContent  = qbFmt(p.si_price,      currency);
  document.getElementById('qb-pc-eu').textContent  = qbFmt(p.enduser_price, currency);

  document.getElementById('qb-pc-series-badge').textContent = p.series || p.type || '';

  document.getElementById('qb-qty').value = 1;
  qbHighlightActivePrice();
  qbRecalc();
}

function qbHighlightActivePrice() {
  document.getElementById('qb-pcell-dpp').classList.remove('qb-active-price');
  document.getElementById('qb-pcell-si').classList.remove('qb-active-price');
  document.getElementById('qb-pcell-eu').classList.remove('qb-active-price');

  if (qbMode === 'si' || qbMode === 'contractor' || qbMode === 'custom') {
    document.getElementById('qb-pcell-si').classList.add('qb-active-price');
  } else if (qbMode === 'enduser') {
    document.getElementById('qb-pcell-eu').classList.add('qb-active-price');
  }
}

function qbHideProductCard() {
  qbCurrentProd = null;
  const el = document.getElementById('qb-product-card');
  const hint = document.getElementById('qb-no-product');
  if (el) el.style.display = 'none';
  if (hint) hint.style.display = '';
}

// ── Pricing mode ─────────────────────────────────────────────
function setQBMode(mode, btn) {
  qbMode = mode;
  document.querySelectorAll('.qb-pm-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const wrap = document.getElementById('qb-custom-wrap');
  if (wrap) wrap.style.display = mode === 'custom' ? 'block' : 'none';
  qbUpdateModeDesc();
  qbHighlightActivePrice();
  qbRecalc();
  qbRenderTable();
}

function qbUpdateModeDesc() {
  const descs = {
    si:         'Using SI / Installer price directly from database',
    contractor: 'Contractor price = SI Price x 1.25',
    enduser:    'Using End User price directly from database',
    custom:     'Custom = SI Price x your multiplier'
  };
  const el = document.getElementById('qb-mode-desc');
  if (el) el.textContent = descs[qbMode] || '';
}

function qbGetGlobalMultiplier() {
  return parseFloat(document.getElementById('qb-multiplier')?.value) || 1;
}

function qbResetMultiplier() {
  const el = document.getElementById('qb-multiplier');
  if (el) el.value = '1.00';
  qbRecalc();
  qbRenderTable();
}

function qbGetUnitPrice(p) {
  if (!p) return 0;
  const gm = qbGetGlobalMultiplier();
  let base = 0;
  switch (qbMode) {
    case 'si':         base = +p.si_price || 0; break;
    case 'contractor': base = (+p.si_price || 0) * 1.25; break;
    case 'enduser':    base = +p.enduser_price || 0; break;
    case 'custom': {
      const cm = parseFloat(document.getElementById('qb-custom-mult')?.value) || 1;
      base = (+p.si_price || 0) * cm;
      break;
    }
    default: base = +p.si_price || 0;
  }
  return base * gm;
}

function qbRecalc() {
  if (!qbCurrentProd) return;
  const currency  = document.getElementById('qb-c-currency')?.value || 'JOD';
  const unitPrice = qbGetUnitPrice(qbCurrentProd);
  const qty       = parseInt(document.getElementById('qb-qty')?.value) || 1;
  const total     = unitPrice * qty;

  const modeLabel = { si: 'SI Price', contractor: 'Contractor Price', enduser: 'End User Price', custom: 'Custom Price' };
  const cpLabel = document.getElementById('qb-cp-mode-label');
  const cpValue = document.getElementById('qb-cp-value');
  if (cpLabel) cpLabel.textContent = modeLabel[qbMode] || 'Price';
  if (cpValue) cpValue.textContent = qbFmt(unitPrice, currency);

  const totalEl = document.getElementById('qb-item-total');
  if (totalEl) totalEl.textContent = qbFmt(total, currency);
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
  const gm   = qbGetGlobalMultiplier();
  const base = gm > 0 ? unit / gm : unit;

  qbItems.push({
    id:             Date.now(),
    model:          qbCurrentProd.model,
    brand:          qbCurrentProd.brand || '',
    description:    qbCurrentProd.description || '',
    specifications: qbCurrentProd.specifications || '',
    category:       qbCurrentProd.category || '',
    system:         qbCurrentProd.system || '',
    series:         qbCurrentProd.series || '',
    type:           qbCurrentProd.type || '',
    image_data:     qbCurrentProd.image_data || '',
    qty,
    unit_price:     unit,
    base_price:     base,
    si_price:       +qbCurrentProd.si_price || 0,
    enduser_price:  +qbCurrentProd.enduser_price || 0,
    dpp_price:      +qbCurrentProd.dpp_price || 0,
    pricing_mode:   qbMode
  });
  saveQBItems();
  qbRenderTable();
  showToast('\u2713 ' + qbCurrentProd.model + ' added to quotation', 'success');
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

// ── Render quotation table (system-grouped, matching MT-Sales) ─
function qbRenderTable() {
  const tbody    = document.getElementById('qb-items-body');
  const empty    = document.getElementById('qb-empty-state');
  const summary  = document.getElementById('qb-summary-bar');
  const currency = document.getElementById('qb-c-currency')?.value || 'JOD';
  if (!tbody) return;

  if (qbItems.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    if (summary) summary.style.display = 'none';
    return;
  }

  if (empty) empty.style.display = 'none';
  if (summary) summary.style.display = 'flex';

  // Group by system for section headers
  const grouped = {};
  qbItems.forEach(item => {
    const key = item.system || 'General';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  let html     = '';
  let itemNum  = 1;
  let grandTotal = 0;
  let grandQty   = 0;
  const gm = qbGetGlobalMultiplier();

  Object.entries(grouped).forEach(([system, items]) => {
    html += '<tr class="qb-section-header"><td colspan="9">' + escHtml(system.toUpperCase()) + '</td></tr>';
    items.forEach(item => {
      // Fixed-price items (manual/service) ignore global multiplier
      let effectivePrice;
      if (item._fixed_price) {
        effectivePrice = item.unit_price;
      } else {
        effectivePrice = item.base_price !== undefined ? item.base_price * gm : item.unit_price;
      }
      item.unit_price = effectivePrice;
      const total = effectivePrice * item.qty;
      grandTotal += total;
      grandQty   += item.qty;

      html += '<tr>' +
        '<td class="qb-td-num">' + itemNum++ + '</td>' +
        '<td class="qb-td-brand">' + escHtml(item.brand) + '</td>' +
        '<td class="qb-td-model"><strong>' + escHtml(item.model) + '</strong>' +
          (item.series || item.type ? '<div style="font-size:10px;color:var(--gray-400);margin-top:2px">' + escHtml(item.series || item.type) + '</div>' : '') +
        '</td>' +
        '<td class="qb-td-desc" title="' + escHtml(item.description) + '">' + escHtml(qbTruncate(item.description, 60)) + '</td>' +
        '<td class="qb-td-specs">' + (item.image_data ? '<img src="' + escHtml(item.image_data) + '" style="width:38px;height:38px;object-fit:contain;border-radius:4px;border:1px solid #e2e8f0;background:#f8fafc;padding:2px;display:block;margin:0 auto" alt="">' : '<span style="color:#aaa;font-size:10px">No image</span>') + '</td>' +
        '<td class="qb-td-qty">' +
          '<div style="display:flex;align-items:center;gap:3px;justify-content:center">' +
            '<button class="qb-qty-btn" onclick="updateQBQty(' + item.id + ',' + (item.qty - 1) + ')">−</button>' +
            '<input type="number" class="qb-qty-input" value="' + item.qty + '" min="1" style="width:48px" onchange="updateQBQty(' + item.id + ',this.value)">' +
            '<button class="qb-qty-btn" onclick="updateQBQty(' + item.id + ',' + (item.qty + 1) + ')">+</button>' +
          '</div>' +
        '</td>' +
        '<td class="qb-td-price">' + qbFmt(effectivePrice, currency) + '</td>' +
        '<td class="qb-td-total">' + qbFmt(total, currency) + '</td>' +
        '<td class="qb-td-remove"><button class="qb-remove-btn" onclick="removeQBItem(' + item.id + ')" title="Remove">\u2715</button></td>' +
      '</tr>';
    });
  });

  // Grand total row
  html += '<tr class="qb-grand-total-row"><td colspan="9" style="text-align:center;padding:12px 16px">' +
    '<span style="font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.5px">Total Material Cost:</span> ' +
    '<span style="font-size:16px;color:var(--red);font-weight:700;margin-left:12px">' + qbFmt(grandTotal, currency) + '</span>' +
  '</td></tr>';

  tbody.innerHTML = html;

  // Update summary bar
  const sumItems = document.getElementById('qb-sum-items');
  const sumQty   = document.getElementById('qb-sum-qty');
  const sumTotal = document.getElementById('qb-sum-total');
  if (sumItems) sumItems.textContent = qbItems.length;
  if (sumQty)   sumQty.textContent   = grandQty;
  if (sumTotal) sumTotal.textContent = qbFmt(grandTotal, currency);
}

// ── Customer info (inline auto-save, matching MT-Sales) ───────
function qbToggleCustomerInfo() {
  const body = document.getElementById('qb-customer-info-body');
  if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
}

function qbAutoSaveCustomer() {
  const g = id => document.getElementById(id)?.value || '';
  const info = {
    client:      g('qb-c-name'),
    project:     g('qb-c-project'),
    att:         g('qb-c-attn'),
    phone:       g('qb-c-phone'),
    ref:         g('qb-c-ref'),
    date:        g('qb-c-date'),
    prepared:    g('qb-c-prepared'),
    prepphone:   g('qb-c-prepphone'),
    saleseng:    g('qb-c-saleseng'),
    salesnumber: g('qb-c-salesnumber'),
    currency:    g('qb-c-currency') || 'JOD',
    notes:       g('qb-c-notes')
  };
  localStorage.setItem('mt_customer_info', JSON.stringify(info));
}

function loadQBCustomer() {
  try {
    const info = JSON.parse(localStorage.getItem('mt_customer_info') || '{}');
    const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    set('qb-c-name',       info.client  || info.name);
    set('qb-c-project',    info.project);
    set('qb-c-attn',       info.att     || info.attn);
    set('qb-c-phone',      info.phone);
    set('qb-c-currency',   info.currency);
    set('qb-c-notes',      info.notes);
    set('qb-c-prepared',   info.prepared);
    set('qb-c-prepphone',  info.prepphone);
    set('qb-c-saleseng',   info.saleseng);
    set('qb-c-salesnumber',info.salesnumber);
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

// ── Clear filter chain from level ─────────────────────────────
function qbClearFrom(level) {
  const idx = QB_FILTER_ORDER.indexOf(level);
  QB_FILTERS[level] = '';
  const sel = document.getElementById('qb-sel-' + level);
  if (sel) sel.value = '';
  qbSetStep(level, 'active');

  for (let i = idx + 1; i < QB_FILTER_ORDER.length; i++) {
    const k = QB_FILTER_ORDER[i];
    QB_FILTERS[k] = '';
    const s = document.getElementById('qb-sel-' + k);
    if (s) {
      s.innerHTML = '<option value="">— Select ' + k.charAt(0).toUpperCase() + k.slice(1) + ' —</option>';
      s.disabled = true;
    }
    qbSetStep(k, 'locked');
  }
  qbHideProductCard();
  qbPopulateFilter(level);
}

// ── Installation / Service Modal ──────────────────────────────
function openQBInstallModal() {
  document.getElementById('qb-install-modal').classList.add('open');
  document.getElementById('qb-install-type').value = 'Installation & Configuration';
  document.getElementById('qb-install-custom-wrap').style.display = 'none';
  document.getElementById('qb-install-price').value = '200';
  document.getElementById('qb-install-qty').value = '1';

  // Populate system dropdown from existing quotation items
  const systemSel = document.getElementById('qb-install-system');
  const current = systemSel.value;
  systemSel.innerHTML = '<option value="Service">— General Service (separate section) —</option>';
  const systems = [...new Set(qbItems.filter(i => i.system && i.system !== 'Service').map(i => i.system))];
  systems.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    systemSel.appendChild(opt);
  });
  if ([...systemSel.options].some(o => o.value === current)) systemSel.value = current;
}

function confirmQBInstall() {
  const typeVal = document.getElementById('qb-install-type').value;
  const desc = typeVal === 'custom'
    ? (document.getElementById('qb-install-custom').value.trim() || 'Service')
    : typeVal;
  const price  = parseFloat(document.getElementById('qb-install-price').value) || 0;
  const qty    = parseInt(document.getElementById('qb-install-qty').value) || 1;
  const system = document.getElementById('qb-install-system').value || 'Service';

  qbItems.push({
    id:             Date.now(),
    brand:          '',
    model:          desc,
    description:    desc,
    specifications: '',
    category:       system === 'Service' ? 'Service' : system,
    system:         system,
    series:         '',
    type:           'Service',
    qty,
    unit_price:     price,
    base_price:     price,
    pricing_mode:   'custom',
    _fixed_price:   true,
    si_price:       price,
    enduser_price:  price,
    dpp_price:      price,
    image_data:     ''
  });
  saveQBItems();
  qbRenderTable();
  closeModal('qb-install-modal');
  showToast('\u2713 Service row added', 'success');
}

// ── Manual Item Modal ─────────────────────────────────────────
function openQBManualModal() {
  document.getElementById('qb-manual-modal').classList.add('open');
  ['qb-mi-brand', 'qb-mi-model', 'qb-mi-description', 'qb-mi-specs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('qb-mi-price').value = '0';
  document.getElementById('qb-mi-qty').value = '1';

  // Populate system dropdown
  const systemSel = document.getElementById('qb-mi-system');
  const existing = systemSel.value;
  systemSel.innerHTML = '';
  const systems = [...new Set(qbItems.filter(i => i.system).map(i => i.system))];
  if (!systems.includes('General')) systems.unshift('General');
  systems.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    systemSel.appendChild(opt);
  });
  const newOpt = document.createElement('option');
  newOpt.value = '__new__'; newOpt.textContent = '+ New system\u2026';
  systemSel.appendChild(newOpt);
  if ([...systemSel.options].some(o => o.value === existing)) systemSel.value = existing;
  systemSel.onchange = () => {
    if (systemSel.value === '__new__') {
      const name = prompt('Enter new system name:');
      if (name && name.trim()) {
        const o = document.createElement('option');
        o.value = name.trim(); o.textContent = name.trim();
        systemSel.insertBefore(o, newOpt);
        systemSel.value = name.trim();
      } else {
        systemSel.value = systems[0] || 'General';
      }
    }
  };
}

function confirmQBManual() {
  const model = document.getElementById('qb-mi-model').value.trim();
  if (!model) { showToast('Model / Name is required', 'error'); return; }

  const price  = parseFloat(document.getElementById('qb-mi-price').value) || 0;
  const qty    = parseInt(document.getElementById('qb-mi-qty').value) || 1;
  const systemSel = document.getElementById('qb-mi-system');
  const system = (systemSel.value && systemSel.value !== '__new__') ? systemSel.value : 'General';

  qbItems.push({
    id:             Date.now(),
    brand:          document.getElementById('qb-mi-brand').value.trim(),
    model,
    description:    document.getElementById('qb-mi-description').value.trim(),
    specifications: '',
    category:       system,
    system,
    series:         '',
    type:           '',
    qty,
    unit_price:     price,
    base_price:     price,
    pricing_mode:   'custom',
    _fixed_price:   true,
    si_price:       price,
    enduser_price:  price,
    dpp_price:      price,
    image_data:     document.getElementById('qb-mi-specs').value.trim()
  });
  saveQBItems();
  qbRenderTable();
  closeModal('qb-manual-modal');
  showToast('\u2713 Item added to quotation', 'success');
}

// ── Build quotation HTML (shared between preview and PDF export) ──
function buildQuotationHTML() {
  const currency = document.getElementById('qb-c-currency')?.value || 'JOD';
  const gm       = qbGetGlobalMultiplier();
  const info     = (() => {
    try { return JSON.parse(localStorage.getItem('mt_customer_info') || '{}'); } catch (_) { return {}; }
  })();
  const logoData = localStorage.getItem('mt_company_logo') || null;

  // ── Colors ────────────────────────────────────────────────
  const PRIMARY  = '#8B0000';
  const ACCENT   = '#C0392B';
  const GOLD     = '#f4a832';
  const BORDER   = '#d0d8e0';
  const TEXT     = '#1e2a38';
  const TEXTSUB  = '#5a6a7a';
  const SECBG    = '#C0392B';

  const fmtP = v => `${currency} ${(parseFloat(v) || 0).toFixed(2)}`;
  const fmtDate = iso => {
    if (!iso) return new Date().toLocaleDateString('en-GB');
    const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`;
  };

  // ── Recalculate unit prices ────────────────────────────────
  const cm = parseFloat(document.getElementById('qb-custom-mult')?.value) || 1;
  const calcUnit = item => {
    if (item._fixed_price) return item.unit_price;
    let base = 0;
    switch (qbMode) {
      case 'si':         base = +item.si_price || 0; break;
      case 'contractor': base = (+item.si_price || 0) * 1.25; break;
      case 'enduser':    base = +item.enduser_price || 0; break;
      case 'custom':     base = (+item.si_price || 0) * cm; break;
      default:           base = +item.si_price || 0;
    }
    return base * gm;
  };

  // ── Group items by system ─────────────────────────────────
  const grouped = {};
  qbItems.forEach(item => {
    const key = item.system || 'General';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  let grandTotal = 0;
  const systemTotals = {};
  Object.entries(grouped).forEach(([sys, items]) => {
    let sub = 0;
    items.forEach(it => { sub += calcUnit(it) * it.qty; });
    systemTotals[sys] = sub;
    grandTotal += sub;
  });

  const logoHTML = logoData
    ? `<img src="${logoData}" style="height:48px;width:auto;display:block;object-fit:contain;" alt="Logo">`
    : `<img src="/Magic Tech Logo.png" style="height:48px;width:auto;display:block;object-fit:contain;" alt="MT Logo" onerror="this.style.display='none'">`;

  const dateStr = fmtDate(info.date);

  // ── Shared page header (repeated on each system page) ─────
  const leftRows = [
    ['Date',    dateStr],
    ['Project', info.project  || ''],
    ['Client',  info.client   || info.name || ''],
    ['Att.',    info.att      || info.attn || ''],
    ['Phone',   info.phone    || '']
  ].filter(([,v]) => v).map(([l,v]) => `
    <div style="display:flex;gap:6px;padding:3px 0;font-size:11.5px;align-items:baseline">
      <span style="font-weight:700;color:${TEXT};white-space:nowrap;min-width:110px;font-size:11px;flex-shrink:0">${escHtml(l)}:</span>
      <span style="color:${TEXT};font-weight:700">${escHtml(v)}</span>
    </div>`).join('');

  const rightRows = [
    ['Ref.',              info.ref         || ''],
    ['Presales Engineer', info.prepared    || ''],
    ['Phone',             info.prepphone   || ''],
    ['Sales Engineer',    info.saleseng    || ''],
    ['Sales Phone',       info.salesnumber || '']
  ].filter(([,v]) => v).map(([l,v]) => `
    <div style="display:flex;gap:6px;padding:3px 0;font-size:11.5px;align-items:baseline">
      <span style="font-weight:700;color:${TEXT};white-space:nowrap;min-width:110px;font-size:11px;flex-shrink:0">${escHtml(l)}:</span>
      <span style="color:${TEXT};font-weight:700">${escHtml(v)}</span>
    </div>`).join('');

  const metaHTML = `
    <div style="padding:14px 28px;display:grid;grid-template-columns:1.1fr 0.9fr;border-bottom:1px solid ${BORDER};background:#fafbfc">
      <div>${leftRows}</div>
      <div style="border-left:1px solid ${BORDER};padding-left:32px">${rightRows}</div>
    </div>`;

  const pageHeaderHTML = () => `
    <div style="background:${PRIMARY};color:#fff;padding:18px 28px;display:flex;align-items:center;justify-content:space-between;gap:20px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
      <div style="flex-shrink:0;min-width:130px;min-height:62px;display:flex;align-items:center;justify-content:center">
        ${logoHTML}
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <div style="font-size:18px;font-weight:800;letter-spacing:2px;text-transform:uppercase;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);padding:8px 20px;border-radius:5px;display:inline-block;line-height:1">SALES QUOTATION</div>
        <div style="font-size:12px;opacity:.75;letter-spacing:.5px;font-weight:500">${escHtml(dateStr)}</div>
      </div>
    </div>
    ${metaHTML}`;

  const tableHeaderHTML = `
    <thead>
      <tr style="-webkit-print-color-adjust:exact;print-color-adjust:exact">
        <th style="background:#edf1f6;color:${TEXT};padding:7px 8px;text-align:center;font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid ${BORDER};white-space:nowrap">#</th>
        <th style="background:#edf1f6;color:${TEXT};padding:7px 8px;text-align:left;font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid ${BORDER};white-space:nowrap">Brand</th>
        <th style="background:#edf1f6;color:${TEXT};padding:7px 8px;text-align:center;font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid ${BORDER};white-space:nowrap">Picture</th>
        <th style="background:#edf1f6;color:${TEXT};padding:7px 8px;text-align:left;font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid ${BORDER};white-space:nowrap">Model</th>
        <th style="background:#edf1f6;color:${TEXT};padding:7px 8px;text-align:left;font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid ${BORDER};white-space:nowrap">Description</th>
        <th style="background:#edf1f6;color:${TEXT};padding:7px 8px;text-align:center;font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid ${BORDER};white-space:nowrap">Qty</th>
        <th style="background:#edf1f6;color:${TEXT};padding:7px 8px;text-align:right;font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid ${BORDER};white-space:nowrap">Unit Price</th>
        <th style="background:#edf1f6;color:${TEXT};padding:7px 8px;text-align:right;font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid ${BORDER};white-space:nowrap">Total Price</th>
      </tr>
    </thead>`;

  const pageFooterHTML = `
    <div style="background:${PRIMARY};color:rgba(255,255,255,.65);text-align:center;padding:10px 20px;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
      This quotation is valid for ${escHtml(info.validity || '30')} days. Prices subject to change without prior notice. | MagicTech Projects Coordination
    </div>`;

  // ── Page 1: MT.pdf cover page ─────────────────────────────
  const coverPage = `
    <div class="qb-page" style="width:210mm;height:297mm;page-break-after:always;break-after:page;overflow:hidden;position:relative;display:flex;flex-direction:column;border:none;outline:none;box-shadow:none;margin:0;padding:0">
      <embed src="/MT.pdf#toolbar=0&navpanes=0&scrollbar=0" type="application/pdf"
             style="width:210mm;height:297mm;flex:1;border:none;outline:none;box-shadow:none;display:block;margin:0;padding:0"
             title="MagicTech Company Profile">
      </embed>
    </div>`;

  // ── Pages 2..N: One page per system ──────────────────────
  const systems = Object.entries(grouped);
  let itemNum = 1;
  let systemPages = '';

  systems.forEach(([system, groupItems], idx) => {
    let tableRows = '';
    let subtotal = 0;

    groupItems.forEach(item => {
      const unit  = calcUnit(item);
      const total = unit * item.qty;
      subtotal += total;

      const imgCell = item.image_data
        ? `<img src="${item.image_data}" style="width:40px;height:40px;object-fit:contain;border-radius:3px;background:#f5f7fa;border:1px solid ${BORDER};padding:2px;display:block;margin:0 auto;" alt="">`
        : `<div style="width:0;height:0;display:block;"></div>`;

      tableRows += `
        <tr style="page-break-inside:avoid;break-inside:avoid">
          <td style="padding:6px 8px;text-align:center;color:${TEXTSUB};font-size:11px;border-bottom:1px solid #e8edf2;vertical-align:middle">${itemNum++}</td>
          <td style="padding:6px 8px;font-weight:600;font-size:11px;border-bottom:1px solid #e8edf2;vertical-align:middle;overflow:hidden;text-overflow:ellipsis">${escHtml(item.brand || '')}</td>
          <td style="padding:6px 8px;text-align:center;border-bottom:1px solid #e8edf2;vertical-align:middle">${imgCell}</td>
          <td style="padding:6px 8px;font-weight:700;color:${ACCENT};font-size:11px;border-bottom:1px solid #e8edf2;vertical-align:middle;word-break:break-word;line-height:1.35">${escHtml(item.model)}</td>
          <td style="padding:6px 8px;font-size:11px;line-height:1.4;border-bottom:1px solid #e8edf2;vertical-align:middle">
            <strong style="display:block;color:${TEXT};font-weight:600">${escHtml(item.description || item.model)}</strong>
            ${item.specifications ? `<span style="color:${TEXTSUB};font-size:10.5px;line-height:1.5;display:block;margin-top:1px">${escHtml(item.specifications.slice(0, 120))}</span>` : ''}
          </td>
          <td style="padding:6px 8px;text-align:center;font-weight:600;font-size:11.5px;border-bottom:1px solid #e8edf2;vertical-align:middle">${item.qty}</td>
          <td style="padding:6px 8px;text-align:right;white-space:nowrap;font-size:11px;border-bottom:1px solid #e8edf2;vertical-align:middle">${fmtP(unit)}</td>
          <td style="padding:6px 8px;text-align:right;font-weight:700;white-space:nowrap;color:${ACCENT};font-size:11.5px;border-bottom:1px solid #e8edf2;vertical-align:middle">${fmtP(total)}</td>
        </tr>`;
    });

    // Subtotal row for this system
    tableRows += `
      <tr>
        <td colspan="5" style="background:#fff3f3;font-weight:700;font-size:11px;border-top:2px solid ${ACCENT};padding:8px 12px;text-align:right;color:${PRIMARY};text-transform:uppercase;letter-spacing:.5px">
          SUBTOTAL — ${escHtml(system.toUpperCase())}:
        </td>
        <td colspan="3" style="background:#fff3f3;font-weight:700;font-size:13px;border-top:2px solid ${ACCENT};padding:8px 12px;text-align:center;color:${ACCENT}">
          ${fmtP(subtotal)}
        </td>
      </tr>`;

    systemPages += `
      <div class="qb-page" style="page-break-before:${idx === 0 ? 'always' : 'always'};break-before:page;background:#fff;margin-bottom:0;padding-top:10mm">
        ${pageHeaderHTML()}

        <!-- System banner -->
        <div style="background:${SECBG};color:#fff;padding:12px 28px;font-weight:800;font-size:15px;letter-spacing:2px;text-align:center;text-transform:uppercase;-webkit-print-color-adjust:exact;print-color-adjust:exact">
          ${escHtml(system.toUpperCase())}
        </div>

        <!-- System items table -->
        <div style="padding:0 24px 16px">
          <table style="width:100%;border-collapse:collapse;margin-top:0;font-size:11.5px;table-layout:auto">
            <colgroup>
              <col style="width:3%"><col style="width:7%"><col style="width:7%">
              <col style="width:13%"><col><col style="width:5%">
              <col style="width:11%"><col style="width:12%">
            </colgroup>
            ${tableHeaderHTML}
            <tbody>${tableRows}</tbody>
          </table>
        </div>

        ${pageFooterHTML}
      </div>`;
  });

  // ── Last page: Cost summary + Thank you + T&C ─────────────
  const summaryRows = systems.map(([sys]) => `
    <tr>
      <td style="padding:10px 16px;font-weight:600;font-size:12px;border-bottom:1px solid ${BORDER};color:${TEXT}">${escHtml(sys)}</td>
      <td style="padding:10px 16px;font-weight:700;font-size:12px;border-bottom:1px solid ${BORDER};text-align:right;color:${ACCENT}">${fmtP(systemTotals[sys])}</td>
    </tr>`).join('');

  const endPage = `
    <div class="qb-page" style="page-break-before:always;break-before:page;background:#fff;min-height:297mm;display:flex;flex-direction:column;padding-top:10mm">
      ${pageHeaderHTML()}

      <!-- Thank you section -->
      <div style="padding:48px 28px 32px;text-align:center;border-bottom:1px solid ${BORDER}">
        <div style="font-size:28px;font-weight:800;color:${PRIMARY};letter-spacing:1px;margin-bottom:12px">Thank You for Your Trust</div>
        <div style="font-size:14px;color:${TEXTSUB};max-width:560px;margin:0 auto;line-height:1.8">
          We sincerely appreciate the opportunity to serve you.<br>
          Your confidence in MagicTech drives us to deliver excellence in every project.<br>
          We look forward to a successful partnership.
        </div>
      </div>

      <!-- Cost summary -->
      <div style="padding:28px 28px 20px">
        <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${TEXT};margin-bottom:14px;padding-bottom:6px;border-bottom:2px solid ${ACCENT}">
          Cost Summary
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="-webkit-print-color-adjust:exact;print-color-adjust:exact">
              <th style="background:#edf1f6;color:${TEXT};padding:9px 16px;text-align:left;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid ${BORDER}">System</th>
              <th style="background:#edf1f6;color:${TEXT};padding:9px 16px;text-align:right;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid ${BORDER}">Cost</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows}
            <tr style="-webkit-print-color-adjust:exact;print-color-adjust:exact">
              <td style="background:#fff8e6;padding:12px 16px;font-weight:800;font-size:14px;border-top:2px solid ${GOLD};color:${PRIMARY};text-transform:uppercase;letter-spacing:.5px">Total Cost</td>
              <td style="background:#fff8e6;padding:12px 16px;font-weight:800;font-size:16px;border-top:2px solid ${GOLD};color:${ACCENT};text-align:right">${fmtP(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      ${info.notes && info.notes.trim() ? `
      <!-- Custom Notes -->
      <div style="padding:16px 28px 20px;border-top:1px solid ${BORDER};background:#fafbfc">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${TEXTSUB};margin-bottom:6px">Notes</div>
        <div style="font-size:12px;color:${TEXTSUB};line-height:1.7;white-space:pre-wrap">${escHtml(info.notes)}</div>
      </div>` : ''}

      <!-- Terms & Conditions -->
      <div style="padding:20px 28px 24px;border-top:2px solid ${BORDER};margin-top:auto">
        <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${TEXT};margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid ${ACCENT}">
          Terms &amp; Conditions
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px">
          ${[
            [`Validity`, `This quotation is valid for ${escHtml(info.validity || '30')} days from the date of issue.`],
            [`Payment Terms`, `50% advance payment upon order confirmation; 50% upon delivery/completion.`],
            [`Delivery`, `Delivery timelines will be confirmed upon order placement and subject to availability.`],
            [`Installation`, `Installation charges are quoted separately unless explicitly included above.`],
            [`Warranty`, `All products carry the manufacturer's standard warranty. Labour warranty is 1 year.`],
            [`Prices`, `Prices are subject to change without prior notice until a purchase order is confirmed.`],
            [`Governing Law`, `This quotation is governed by the laws of the Hashemite Kingdom of Jordan.`],
            [`Acceptance`, `Placing a purchase order constitutes acceptance of these terms and conditions.`]
          ].map(([title, text]) => `
            <div style="padding:6px 0;border-bottom:1px solid #f0f3f7">
              <div style="font-weight:700;font-size:10.5px;color:${TEXT};margin-bottom:2px">${title}</div>
              <div style="font-size:10.5px;color:${TEXTSUB};line-height:1.5">${text}</div>
            </div>`).join('')}
        </div>
      </div>

      ${pageFooterHTML}
    </div>`;

  // ── Assemble all pages ────────────────────────────────────
  const pagesHTML = coverPage + systemPages + endPage;

  return { pagesHTML, info, grandTotal };
}

// ── Preview Quotation ─────────────────────────────────────────
function previewQuotation() {
  if (!qbItems.length) { showToast('Add items to the quotation before previewing', 'error'); return; }
  const { pagesHTML } = buildQuotationHTML();
  const body = document.getElementById('qb-preview-body');
  body.innerHTML = `<style>.qb-page{border:none!important;outline:none!important;box-shadow:0 2px 12px rgba(0,0,0,.12)!important;border-radius:2px;margin-bottom:16px;}</style><div style="font-family:'Segoe UI',Arial,sans-serif;color:#1e2a38;font-size:13px;line-height:1.5;">${pagesHTML}</div>`;
  openModal('qb-preview-modal');
}

// ── PDF Export ────────────────────────────────────────────────
// Uses a print window — identical rendering to the in-page preview.
// html2pdf/html2canvas dropped: opacity tricks cause blank pages.
function exportQBPdf() {
  if (!qbItems.length) { showToast('Add items to the quotation before exporting', 'error'); return; }

  const { pagesHTML, info } = buildQuotationHTML();
  const ref = info.ref || 'Quotation';
  const title = `MT Quotation — ${ref}`;

  const printWin = window.open('', '_blank');
  if (!printWin) { showToast('Pop-up blocked — allow pop-ups and try again', 'error'); return; }

  printWin.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family:'Segoe UI',Arial,sans-serif;
    color:#1e2a38; font-size:12px; line-height:1.5;
    background:#fff;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }
  table  { width:100% !important; border-collapse:collapse; }
  td, th { word-break:break-word; }
  img    { display:block; max-width:100%; height:auto; }
  embed  { border:none !important; outline:none !important; box-shadow:none !important; }
  .qb-page { page-break-before:always; break-before:page; border:none !important; outline:none !important; box-shadow:none !important; }
  .qb-page:first-child { page-break-before:auto; break-before:auto; }
  @media print {
    @page { size:A4 portrait; margin:0; }
    html, body { border:none !important; outline:none !important; box-shadow:none !important; }
    body  { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    tr    { page-break-inside:avoid; break-inside:avoid; }
    .qb-page { page-break-before:always; break-before:page; border:none !important; outline:none !important; box-shadow:none !important; }
    .qb-page:first-child { page-break-before:auto; break-before:auto; }
    embed { width:210mm !important; height:297mm !important; display:block !important; border:none !important; }
  }
</style>
</head><body>
<div style="font-family:'Segoe UI',Arial,sans-serif;color:#1e2a38;font-size:12px;line-height:1.5;">
${pagesHTML}
</div>
<script>
  // Wait for all images to load before opening print dialog
  var imgs = document.images;
  var total = imgs.length, loaded = 0;
  function tryPrint() { window.focus(); window.print(); }
  if (total === 0) {
    setTimeout(tryPrint, 400);
  } else {
    for (var i = 0; i < total; i++) {
      if (imgs[i].complete) { if (++loaded >= total) { setTimeout(tryPrint, 400); break; } }
      else {
        imgs[i].onload  = function() { if (++loaded >= total) setTimeout(tryPrint, 400); };
        imgs[i].onerror = function() { if (++loaded >= total) setTimeout(tryPrint, 400); };
      }
    }
  }
<\/script>
</body></html>`);
  printWin.document.close();
  showToast('Print dialog opened — choose "Save as PDF"', 'info');
}

// ── Create Project from Quotation ─────────────────────────────
function createProjectFromQuotation() {
  if (!qbItems.length) { showToast('Add items to the quotation first', 'error'); return; }

  const info = (() => {
    try { return JSON.parse(localStorage.getItem('mt_customer_info') || '{}'); } catch (_) { return {}; }
  })();

  // Pre-fill fields from quotation data
  document.getElementById('qbp-name').value = info.project || '';
  document.getElementById('qbp-client').value = info.client || info.name || '';
  document.getElementById('qbp-phone').value = info.phone || '';
  document.getElementById('qbp-location').value = '';

  // Build module selection from quotation systems
  const systems = [...new Set(qbItems.map(i => i.system || 'General'))];
  const modulesDiv = document.getElementById('qbp-modules');
  modulesDiv.innerHTML = systems.map(sys => {
    const items = qbItems.filter(i => (i.system || 'General') === sys);
    const deviceCount = items.reduce((s, i) => s + i.qty, 0);
    return `
      <div style="border:1px solid var(--gray-200);border-radius:8px;padding:12px 14px;background:var(--gray-50)">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <strong style="color:var(--red-dark);font-size:13px">${escHtml(sys)}</strong>
            <div style="font-size:12px;color:var(--gray-500)">${items.length} item(s), ${deviceCount} unit(s)</div>
          </div>
          <span style="background:var(--red-pale);color:var(--red);padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">Installation</span>
        </div>
      </div>`;
  }).join('');

  openModal('qb-create-project-modal');
}

async function submitProjectFromQuotation() {
  const name = document.getElementById('qbp-name').value.trim();
  if (!name) { showToast('Project name is required', 'error'); return; }

  const info = (() => {
    try { return JSON.parse(localStorage.getItem('mt_customer_info') || '{}'); } catch (_) { return {}; }
  })();

  // Group items by system to create modules
  const grouped = {};
  qbItems.forEach(item => {
    const key = item.system || 'General';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  const gm = qbGetGlobalMultiplier();
  const cm = parseFloat(document.getElementById('qb-custom-mult')?.value) || 1;
  const calcUnit = item => {
    if (item._fixed_price) return item.unit_price;
    let base = 0;
    switch (qbMode) {
      case 'si':         base = +item.si_price || 0; break;
      case 'contractor': base = (+item.si_price || 0) * 1.25; break;
      case 'enduser':    base = +item.enduser_price || 0; break;
      case 'custom':     base = (+item.si_price || 0) * cm; break;
      default:           base = +item.si_price || 0;
    }
    return base * gm;
  };

  const currency = document.getElementById('qb-c-currency')?.value || 'JOD';

  const modules = Object.entries(grouped).map(([system, items]) => {
    const devices = items.map(item => ({
      model: item.model,
      qty: item.qty,
      description: `${item.description || item.model} | ${currency} ${calcUnit(item).toFixed(2)} x ${item.qty}`,
      serial: ''
    }));

    // Map system to a reasonable module type
    let moduleType = 'Installation and Wiring';
    const sysLower = system.toLowerCase();
    if (sysLower.includes('survey')) moduleType = 'Site Survey';
    else if (sysLower.includes('maintenance')) moduleType = 'Maintenance';
    else if (sysLower.includes('handover')) moduleType = 'Handover';
    else if (sysLower.includes('deliver')) moduleType = 'Delivering';
    else if (sysLower.includes('poc') || sysLower.includes('proof')) moduleType = 'POC';
    else if (sysLower.includes('program') || sysLower.includes('trouble')) moduleType = 'Programming and Trouble Shooting';

    const subtotal = items.reduce((s, i) => s + calcUnit(i) * i.qty, 0);

    return {
      module_type: moduleType,
      scope_of_work: `${system} - ${items.length} product(s), total: ${currency} ${subtotal.toFixed(2)}.\nRef: ${info.ref || 'N/A'}`,
      issue_details: '',
      devices
    };
  });

  const payload = {
    project_name: name,
    client_name_1: document.getElementById('qbp-client').value || info.client || '',
    client_name_2: '',
    client_number: document.getElementById('qbp-phone').value || info.phone || '',
    location_name: document.getElementById('qbp-location').value || '',
    location_lat: null,
    location_lng: null,
    priority: document.getElementById('qbp-priority').value || 'normal',
    modules
  };

  try {
    const res = await apiFetch('/projects', { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (res.ok) {
      showToast(`Project "${name}" created from quotation! Admin will assign the team.`, 'success');
      closeModal('qb-create-project-modal');
      await loadProjects();
      navigate('projects');
    } else {
      showToast('Error: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('Failed to create project: ' + err.message, 'error');
  }
}

// ── Save Draft Quotation ──────────────────────────────────────
async function saveDraftQuotation() {
  if (!qbItems.length) { showToast('Add items to the quotation first', 'error'); return; }
  const btn = document.querySelector('.qb-save-draft-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const savedId = await autoSaveQuotation();
    if (savedId) {
      currentQuotationId = savedId;
      showToast('✓ Quotation saved to My Quotations', 'success');
    } else {
      showToast('Failed to save quotation', 'error');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" style="vertical-align:middle;margin-right:4px"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Save Draft';
    }
  }
}

// ── Finalize Quotation (4-Roads) ─────────────────────────────
let selectedRoad = null;
let currentQuotationId = null;

async function finalizeQuotation() {
  if (!qbItems.length) { showToast('Add items to the quotation first', 'error'); return; }

  // Auto-save quotation to DB first
  const savedId = await autoSaveQuotation();
  if (!savedId) { showToast('Failed to save quotation. Please try again.', 'error'); return; }
  currentQuotationId = savedId;

  // Reset road selection
  selectedRoad = null;
  document.getElementById('qb-finalize-action-btn').disabled = true;
  document.getElementById('qb-finalize-action-btn').textContent = 'Select an option above';
  document.querySelectorAll('.qb-road-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.road-detail').forEach(d => d.style.display = 'none');

  // Pre-fill new project form
  const info = (() => {
    try { return JSON.parse(localStorage.getItem('mt_customer_info') || '{}'); } catch (_) { return {}; }
  })();
  const nameEl = document.getElementById('qbp-name');
  if (nameEl) nameEl.value = info.project || '';
  const clientEl = document.getElementById('qbp-client');
  if (clientEl) clientEl.value = info.client || info.name || '';
  const phoneEl = document.getElementById('qbp-phone');
  if (phoneEl) phoneEl.value = info.phone || '';

  // Build modules preview
  const systems = [...new Set(qbItems.map(i => i.system || 'General'))];
  const modulesDiv = document.getElementById('qbp-modules');
  if (modulesDiv) {
    modulesDiv.innerHTML = systems.map(sys => {
      const items = qbItems.filter(i => (i.system || 'General') === sys);
      const deviceCount = items.reduce((s, i) => s + i.qty, 0);
      return `<div style="border:1px solid var(--gray-200);border-radius:8px;padding:10px 14px;background:#fff;display:flex;align-items:center;justify-content:space-between">
        <div><strong style="color:var(--red-dark);font-size:13px">${escHtml(sys)}</strong>
        <div style="font-size:12px;color:var(--gray-500)">${items.length} item(s), ${deviceCount} unit(s)</div></div>
        <span style="background:var(--red-pale);color:var(--red);padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">Installation</span>
      </div>`;
    }).join('');
  }

  // Load existing projects for "add to existing" road
  loadProjectsForSelect();

  // Set min date for hold
  const holdDate = document.getElementById('qbp-hold-date');
  if (holdDate) holdDate.min = new Date().toISOString().split('T')[0];

  openModal('qb-finalize-modal');
}

function selectRoad(road) {
  selectedRoad = road;
  document.querySelectorAll('.qb-road-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.road-detail').forEach(d => d.style.display = 'none');
  const card = document.getElementById('road-' + road);
  if (card) card.classList.add('selected');
  const detail = document.getElementById('road-detail-' + road);
  if (detail) detail.style.display = 'block';

  const actionBtn = document.getElementById('qb-finalize-action-btn');
  actionBtn.disabled = false;
  const labels = { 'close': 'Close Quotation', 'new-project': 'Create Project', 'add-project': 'Add to Project', 'hold': 'Set Hold Date' };
  actionBtn.textContent = labels[road] || 'Confirm';
}

async function loadProjectsForSelect() {
  try {
    const res = await apiFetch('/projects');
    const data = await res.json();
    const sel = document.getElementById('qbp-existing-project');
    if (sel) {
      sel.innerHTML = '<option value="">— Select a project —</option>';
      const projects = Array.isArray(data) ? data : (data.projects || []);
      projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id; opt.textContent = `${p.project_name} (${p.client_name_1 || 'N/A'})`;
        sel.appendChild(opt);
      });
    }
  } catch (e) { console.error('Failed to load projects', e); }
}

async function executeRoadAction() {
  if (!selectedRoad) return;
  const btn = document.getElementById('qb-finalize-action-btn');
  btn.disabled = true;
  btn.textContent = 'Processing…';

  try {
    if (selectedRoad === 'close') {
      await apiFetch(`/quotation/${currentQuotationId}/close`, { method: 'POST' });
      showToast('Quotation closed and saved to My Quotations', 'success');
      closeModal('qb-finalize-modal');
      loadMyQuotations();
    } else if (selectedRoad === 'new-project') {
      await submitProjectFromQuotation();
      if (currentQuotationId) {
        await apiFetch(`/quotation/${currentQuotationId}/close`, { method: 'POST' });
      }
    } else if (selectedRoad === 'add-project') {
      const projId = document.getElementById('qbp-existing-project')?.value;
      if (!projId) { showToast('Please select a project', 'error'); btn.disabled = false; btn.textContent = 'Add to Project'; return; }
      await addQuotationToProject(projId);
      await apiFetch(`/quotation/${currentQuotationId}/close`, { method: 'POST' });
      showToast('Quotation items added to existing project!', 'success');
      closeModal('qb-finalize-modal');
      loadMyQuotations();
    } else if (selectedRoad === 'hold') {
      const holdDate = document.getElementById('qbp-hold-date')?.value;
      if (!holdDate) { showToast('Please select a follow-up date', 'error'); btn.disabled = false; btn.textContent = 'Set Hold Date'; return; }
      const res = await apiFetch(`/quotation/${currentQuotationId}/hold`, {
        method: 'POST', body: JSON.stringify({ hold_until: holdDate })
      });
      if (res.ok) {
        showToast('Quotation placed on hold. You will be notified by email on the selected date.', 'success');
        closeModal('qb-finalize-modal');
        loadMyQuotations();
      } else { showToast('Failed to set hold date', 'error'); }
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

async function addQuotationToProject(projectId) {
  const gm = qbGetGlobalMultiplier();
  const cm = parseFloat(document.getElementById('qb-custom-mult')?.value) || 1;
  const calcUnit = item => {
    if (item._fixed_price) return item.unit_price;
    let base = 0;
    switch (qbMode) {
      case 'si': base = +item.si_price || 0; break;
      case 'contractor': base = (+item.si_price || 0) * 1.25; break;
      case 'enduser': base = +item.enduser_price || 0; break;
      case 'custom': base = (+item.si_price || 0) * cm; break;
      default: base = +item.si_price || 0;
    }
    return base * gm;
  };
  const currency = document.getElementById('qb-c-currency')?.value || 'JOD';
  const devices = qbItems.map(item => ({
    model: item.model,
    qty: item.qty,
    description: `${item.description || item.model} | ${currency} ${calcUnit(item).toFixed(2)} x ${item.qty}`,
    serial: ''
  }));
  const payload = { quotation_devices: devices, quotation_ref: currentQuotationId };
  const res = await apiFetch(`/projects/${projectId}/quotation-devices`, {
    method: 'POST', body: JSON.stringify(payload)
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to add devices'); }
}

async function autoSaveQuotation() {
  const info = (() => {
    try { return JSON.parse(localStorage.getItem('mt_customer_info') || '{}'); } catch (_) { return {}; }
  })();
  const gm = qbGetGlobalMultiplier();
  const cm = parseFloat(document.getElementById('qb-custom-mult')?.value) || 1;
  const calcUnit = item => {
    if (item._fixed_price) return item.unit_price;
    let base = 0;
    switch (qbMode) {
      case 'si': base = +item.si_price || 0; break;
      case 'contractor': base = (+item.si_price || 0) * 1.25; break;
      case 'enduser': base = +item.enduser_price || 0; break;
      case 'custom': base = (+item.si_price || 0) * cm; break;
      default: base = +item.si_price || 0;
    }
    return base * gm;
  };
  let grandTotal = 0;
  qbItems.forEach(it => { grandTotal += calcUnit(it) * it.qty; });

  const payload = {
    ref_number: info.ref || '',
    title: info.project || info.client || info.ref || 'Quotation',
    customer_info: info,
    items: qbItems,
    pricing_mode: qbMode,
    currency: document.getElementById('qb-c-currency')?.value || 'JOD',
    grand_total: grandTotal,
    notes: info.notes || ''
  };

  try {
    const res = await apiFetch('/quotation', { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (res.ok && data.quotation) return data.quotation.id;
    return null;
  } catch (e) { return null; }
}

// ── My Quotations ─────────────────────────────────────────────
// ── Load ALL quotations (Admin only) ──────────────────────────
async function loadAllQuotations() {
  try {
    const res = await apiFetch('/quotation/all');
    if (!res?.ok) { console.error('Failed to load all quotations'); return; }
    const quotations = await res.json();
    const grid  = document.getElementById('all-quotations-grid');
    const empty = document.getElementById('all-quotations-empty');
    const count = document.getElementById('all-quotations-count');
    if (!grid) return;
    if (count) count.textContent = quotations.length > 0 ? `(${quotations.length})` : '';
    if (quotations.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    const statusColors = { draft: 'var(--info)', closed: 'var(--gray-500)', on_hold: 'var(--warning)', sent: 'var(--success)' };
    grid.innerHTML = quotations.map(q => {
      const date   = new Date(q.updated_at || q.created_at).toLocaleDateString('en-GB');
      const status = q.status || 'draft';
      const color  = statusColors[status] || 'var(--gray-500)';
      const holdInfo = q.hold_until ? `<div style="font-size:12px;color:var(--warning);margin-top:4px">⏰ Follow-up: ${new Date(q.hold_until).toLocaleDateString('en-GB')}</div>` : '';
      const byUser = q.created_by_name ? `<span>👤 ${escHtml(q.created_by_name)} (${escHtml(q.created_by_role || '')})</span>` : '';
      return `
      <div class="project-card" style="cursor:default">
        <div class="project-card-header">
          <div>
            <div class="project-name">${escHtml(q.title || q.ref_number || 'Untitled')}</div>
            <div style="font-size:12px;color:var(--gray-500);margin-top:2px">${escHtml(q.client_name || '')} · Ref: ${escHtml(q.ref_number || 'N/A')}</div>
          </div>
          <span style="background:${color};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;text-transform:capitalize">${status.replace('_', ' ')}</span>
        </div>
        <div class="project-meta" style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--gray-600)">
          <span>💰 ${escHtml(q.currency || 'JOD')} ${parseFloat(q.grand_total || 0).toFixed(2)}</span>
          <span>📅 ${date}</span>
          ${byUser}
        </div>
        ${holdInfo}
        <div style="margin-top:12px;display:flex;gap:8px">
          <button class="btn btn-sm btn-secondary" onclick="loadQuotationToBuilder(${q.id})">Edit</button>
          <button class="btn btn-sm" style="background:var(--red);color:#fff" onclick="adminDeleteQuotation(${q.id})">Delete</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) { console.error('Failed to load all quotations', e); }
}

async function adminDeleteQuotation(id) {
  if (!confirm('Delete this quotation? This cannot be undone.')) return;
  try {
    const res = await apiFetch(`/quotation/${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Quotation deleted', 'success'); loadAllQuotations(); }
    else showToast('Failed to delete quotation', 'error');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function loadMyQuotations() {
  try {
    const res = await apiFetch('/quotation/mine');
    const quotations = await res.json();
    const grid = document.getElementById('my-quotations-grid');
    const empty = document.getElementById('my-quotations-empty');
    const count = document.getElementById('my-quotations-count');
    if (!grid) return;
    if (count) count.textContent = quotations.length > 0 ? `(${quotations.length})` : '';
    if (quotations.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    const statusColors = { draft: 'var(--info)', closed: 'var(--gray-500)', on_hold: 'var(--warning)', sent: 'var(--success)' };
    grid.innerHTML = quotations.map(q => {
      const date = new Date(q.updated_at || q.created_at).toLocaleDateString('en-GB');
      const status = q.status || 'draft';
      const color = statusColors[status] || 'var(--gray-500)';
      const holdInfo = q.hold_until ? `<div style="font-size:12px;color:var(--warning);margin-top:4px">⏰ Follow-up: ${new Date(q.hold_until).toLocaleDateString('en-GB')}</div>` : '';
      return `
      <div class="project-card" style="cursor:default">
        <div class="project-card-header">
          <div>
            <div class="project-name">${escHtml(q.title || q.ref_number || 'Untitled')}</div>
            <div style="font-size:12px;color:var(--gray-500);margin-top:2px">${escHtml(q.client_name || '')} · Ref: ${escHtml(q.ref_number || 'N/A')}</div>
          </div>
          <span style="background:${color};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;text-transform:capitalize">${status.replace('_', ' ')}</span>
        </div>
        <div class="project-meta" style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--gray-600)">
          <span>💰 ${escHtml(q.currency || 'JOD')} ${parseFloat(q.grand_total || 0).toFixed(2)}</span>
          <span>📅 ${date}</span>
        </div>
        ${holdInfo}
        <div style="margin-top:12px;display:flex;gap:8px">
          <button class="btn btn-sm btn-secondary" onclick="loadQuotationToBuilder(${q.id})">Edit</button>
          <button class="btn btn-sm" style="background:var(--red);color:#fff" onclick="deleteMyQuotation(${q.id})">Delete</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) { console.error('Failed to load quotations', e); }
}

async function loadQuotationToBuilder(id) {
  try {
    const res = await apiFetch(`/quotation/${id}`);
    const q = await res.json();
    const customerInfo = typeof q.customer_info === 'string' ? JSON.parse(q.customer_info || '{}') : (q.customer_info || {});
    const items = typeof q.items === 'string' ? JSON.parse(q.items || '[]') : (q.items || []);
    localStorage.setItem('mt_customer_info', JSON.stringify(customerInfo));
    localStorage.setItem('mt_quotation_items', JSON.stringify(items));
    qbItems = items;
    loadQBCustomer();
    qbRenderTable();
    currentQuotationId = id;
    navigate('quotation-builder');
    showToast('Quotation loaded for editing', 'success');
  } catch (e) { showToast('Failed to load quotation: ' + e.message, 'error'); }
}

async function deleteMyQuotation(id) {
  if (!confirm('Delete this quotation? This cannot be undone.')) return;
  try {
    const res = await apiFetch(`/quotation/${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Quotation deleted', 'success'); loadMyQuotations(); }
    else showToast('Failed to delete quotation', 'error');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ── Utility ───────────────────────────────────────────────────
function qbFmt(val, currency) {
  const n = parseFloat(val) || 0;
  return (currency || 'JOD') + ' ' + n.toFixed(2);
}

function qbTruncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '\u2026' : str;
}

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
  playChatSound('send');
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
      body.image = `data:${chatImageData.mimeType};base64,${chatImageData.base64}`;
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
    playChatSound('receive'); speakText(reply);

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

// ── Voice Recognition + TTS ──────────────────────────────────
let voiceRecognition = null;
let voiceEnabled = false;
let ttsEnabled = false;
let isListening = false;

// Web Audio context for notification sounds
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// Play a soft bell chime — much more pleasant than raw oscillator beeps
function playChime(ctx, freq, startTime, duration, vol) {
  // Fundamental + 2nd harmonic for bell-like timbre
  [freq, freq * 2.756].forEach((f, i) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, startTime);
    // Fast attack, slow exponential decay (natural bell)
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(vol * (i === 0 ? 1 : 0.35), startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  });
}

function playChatSound(type) {
  try {
    const ctx = getAudioCtx();
    const t   = ctx.currentTime;
    if (type === 'send') {
      // Two ascending notes — light, airy "whoosh-ding"
      playChime(ctx, 880,  t,        0.6,  0.10);
      playChime(ctx, 1047, t + 0.08, 0.55, 0.07);
    } else if (type === 'receive') {
      // Two descending notes — warm, welcoming "ding-dong"
      playChime(ctx, 1047, t,        0.7,  0.09);
      playChime(ctx, 784,  t + 0.12, 0.65, 0.07);
    } else if (type === 'listen_start') {
      // Three rising notes — friendly "ready" chime
      playChime(ctx, 523,  t,        0.5,  0.08);
      playChime(ctx, 659,  t + 0.1,  0.5,  0.08);
      playChime(ctx, 784,  t + 0.2,  0.6,  0.09);
    } else if (type === 'listen_stop') {
      // Two falling notes — gentle "done" chime
      playChime(ctx, 784,  t,        0.55, 0.08);
      playChime(ctx, 523,  t + 0.12, 0.65, 0.07);
    }
  } catch (e) { /* audio not supported */ }
}

function initVoiceRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.continuous = false;
  r.interimResults = true;
  r.lang = 'en-US';

  r.onstart = () => {
    isListening = true;
    playChatSound('listen_start');
    const btn = document.getElementById('chat-mic-btn');
    if (btn) { btn.classList.add('listening'); btn.title = 'Listening... (click to stop)'; }
    const input = document.getElementById('chat-input');
    if (input) input.placeholder = '🎤 Listening...';
  };
  r.onend = () => {
    isListening = false;
    playChatSound('listen_stop');
    const btn = document.getElementById('chat-mic-btn');
    if (btn) { btn.classList.remove('listening'); btn.title = 'Voice input'; }
    const input = document.getElementById('chat-input');
    if (input) input.placeholder = 'Ask about products, pricing, systems…';
  };
  r.onerror = (e) => {
    isListening = false;
    const btn = document.getElementById('chat-mic-btn');
    if (btn) btn.classList.remove('listening');
    if (e.error !== 'aborted') showToast('Voice error: ' + e.error, 'error');
  };
  r.onresult = (event) => {
    const input = document.getElementById('chat-input');
    if (!input) return;
    let final = '', interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) final += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }
    input.value = final || interim;
    if (final) {
      setTimeout(() => sendChatMsg(), 300);
    }
  };
  return r;
}

function toggleVoiceInput() {
  if (!voiceRecognition) {
    voiceRecognition = initVoiceRecognition();
    if (!voiceRecognition) { showToast('Voice input not supported in this browser', 'error'); return; }
  }
  if (isListening) {
    voiceRecognition.stop();
  } else {
    try { voiceRecognition.start(); } catch (e) { showToast('Could not start voice input', 'error'); }
  }
}

function toggleTTS() {
  ttsEnabled = !ttsEnabled;
  const btn = document.getElementById('chat-tts-btn');
  if (btn) {
    btn.classList.toggle('active', ttsEnabled);
    btn.title = ttsEnabled ? 'Text-to-speech ON (click to disable)' : 'Enable text-to-speech';
  }
  if (ttsEnabled) showToast('🔊 Voice responses enabled', 'success');
  else { window.speechSynthesis?.cancel(); showToast('🔇 Voice responses disabled', 'info'); }
}

// Cache the chosen voice once voices are loaded
let _ttsVoice = null;
function _loadTTSVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  // Priority: Google cloud voices > Microsoft Neural > Apple > any en-US
  return voices.find(v => /Google US English/i.test(v.name))
    || voices.find(v => /Microsoft (Aria|Jenny|Emma|Guy|Brian|Ryan)/i.test(v.name))
    || voices.find(v => /Samantha|Karen|Moira|Daniel|Serena|Allison/i.test(v.name))
    || voices.find(v => v.lang === 'en-US' && !v.localService)
    || voices.find(v => v.lang === 'en-US')
    || voices.find(v => v.lang.startsWith('en'))
    || voices[0];
}
// Pre-cache as soon as voices are available (Chrome fires this async)
if (window.speechSynthesis) {
  if (window.speechSynthesis.getVoices().length) {
    _ttsVoice = _loadTTSVoice();
  } else {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      _ttsVoice = _loadTTSVoice();
    }, { once: true });
  }
}

function speakText(text) {
  if (!ttsEnabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[*#_~`]/g, '').replace(/\n+/g, ' ').trim().slice(0, 600);

  function _speak() {
    const utt  = new SpeechSynthesisUtterance(clean);
    const voice = _ttsVoice || _loadTTSVoice();
    if (voice) { utt.voice = voice; _ttsVoice = voice; }
    utt.rate   = 0.95;
    utt.pitch  = 1;
    utt.volume = 0.92;
    window.speechSynthesis.speak(utt);
  }

  // If voices still not loaded, wait for the event then speak
  if (!_ttsVoice && !window.speechSynthesis.getVoices().length) {
    window.speechSynthesis.addEventListener('voiceschanged', _speak, { once: true });
  } else {
    _speak();
  }
}
