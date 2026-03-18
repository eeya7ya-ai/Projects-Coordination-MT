'use strict';
/* ═══════════════════════════════════════════════════════════════
   MT Sales Quotation — API Routes (integrated into Projects-Coordination-MT)
   Auth: JWT via middleware/auth.js  (replaces standalone admin-password auth)
   Products stored in the shared PostgreSQL database (products table)
═══════════════════════════════════════════════════════════════ */

const express = require('express');
const multer  = require('multer');
const xlsx    = require('xlsx');
const router  = express.Router();
const db      = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// ─── Multer (Excel uploads, admin only) ──────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /\.(xlsx|xls)$/i.test(file.originalname) ||
      ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.ms-excel', 'application/octet-stream'].includes(file.mimetype);
    cb(ok ? null : new Error('Only Excel files (.xlsx/.xls) are allowed'), ok);
  }
});

// ─── Helpers ──────────────────────────────────────────────────
function toNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function round3(n) { return Math.round((+n || 0) * 1000) / 1000; }
function titleCase(str) {
  return str.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ─── GET /api/quotation/products ─────────────────────────────
// Returns all products. Optional filter query params:
//   ?category=&system=&brand=&type=&series=
router.get('/products', verifyToken, async (req, res) => {
  try {
    const { category, system, brand, type, series } = req.query;
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let i = 1;
    if (category) { sql += ` AND category = $${i++}`; params.push(category); }
    if (system)   { sql += ` AND system = $${i++}`;   params.push(system); }
    if (brand)    { sql += ` AND brand = $${i++}`;    params.push(brand); }
    if (type)     { sql += ` AND type = $${i++}`;     params.push(type); }
    if (series)   { sql += ` AND series = $${i++}`;   params.push(series); }
    sql += ' ORDER BY category, system, brand, type, series, model';
    const rows = await db.all(sql, params);
    res.json(rows.map(normalizeProduct));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/quotation/filter ────────────────────────────────
// Returns distinct values for each cascading filter level + matching models
router.get('/filter', verifyToken, async (req, res) => {
  try {
    const { category, system, brand, type, series } = req.query;
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let i = 1;
    if (category) { sql += ` AND category = $${i++}`; params.push(category); }
    if (system)   { sql += ` AND system = $${i++}`;   params.push(system); }
    if (brand)    { sql += ` AND brand = $${i++}`;    params.push(brand); }
    if (type)     { sql += ` AND type = $${i++}`;     params.push(type); }
    if (series)   { sql += ` AND series = $${i++}`;   params.push(series); }
    const rows = await db.all(sql, params);
    const products = rows.map(normalizeProduct);
    const uniq = k => [...new Set(products.map(p => p[k]).filter(Boolean))].sort();
    res.json({
      categories: uniq('category'),
      systems:    uniq('system'),
      brands:     uniq('brand'),
      types:      uniq('type'),
      series:     uniq('series'),
      models:     products
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/quotation/stats (admin only) ────────────────────
router.get('/stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM products', []);
    const products = rows.map(normalizeProduct);
    const uniq = k => [...new Set(products.map(p => p[k]).filter(Boolean))];
    res.json({
      total:        products.length,
      categories:   uniq('category').length,
      brands:       uniq('brand').length,
      categoryList: uniq('category').sort(),
      brandList:    uniq('brand').sort()
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/quotation/products (admin only) ────────────────
router.post('/products', verifyToken, requireAdmin, async (req, res) => {
  const p = req.body;
  if (!p.model) return res.status(400).json({ error: 'model is required' });
  try {
    const result = await db.run(
      `INSERT INTO products
         (category,system,brand,type,series,model,description,specifications,dpp_price,si_price,enduser_price,image_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [p.category||'General', p.system||'', p.brand||'', p.type||'', p.series||'',
       p.model, p.description||'', p.specifications||'',
       toNum(p.dpp_price), toNum(p.si_price), toNum(p.enduser_price),
       p.image_data||null]
    );
    const created = await db.get('SELECT * FROM products WHERE id = $1', [result.lastInsertRowid]);
    res.json({ success: true, product: normalizeProduct(created) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PUT /api/quotation/products/:id (admin only) ─────────────
router.put('/products/:id', verifyToken, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const p  = req.body;
  if (!p.model) return res.status(400).json({ error: 'model is required' });
  try {
    const result = await db.run(
      `UPDATE products
       SET category=$1,system=$2,brand=$3,type=$4,series=$5,model=$6,
           description=$7,specifications=$8,dpp_price=$9,si_price=$10,
           enduser_price=$11,image_data=$12,updated_at=NOW()
       WHERE id=$13`,
      [p.category||'General', p.system||'', p.brand||'', p.type||'', p.series||'',
       p.model, p.description||'', p.specifications||'',
       toNum(p.dpp_price), toNum(p.si_price), toNum(p.enduser_price),
       p.image_data||null, id]
    );
    if (!result.changes) return res.status(404).json({ error: 'Product not found' });
    const updated = await db.get('SELECT * FROM products WHERE id = $1', [id]);
    res.json({ success: true, product: normalizeProduct(updated) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DELETE /api/quotation/products/:id (admin only) ──────────
router.delete('/products/:id', verifyToken, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const result = await db.run('DELETE FROM products WHERE id = $1', [id]);
    if (!result.changes) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/quotation/upload (admin only, Excel bulk import) ─
router.post('/upload', verifyToken, requireAdmin, upload.single('excel'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
    const { products: newProds, sheetSummary } = parseExcelSmart(wb);
    if (!newProds.length) {
      return res.status(400).json({
        error: 'No products detected. Ensure the file has a Model column and at least one price column.',
        sheetSummary
      });
    }
    // Replace all products
    await db.run('DELETE FROM products', []);
    await dbInsertBulk(newProds);
    res.json({ success: true, count: newProds.length, sheetSummary });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/quotation/template (admin only) ─────────────────
router.get('/template', (req, res) => {
  try {
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([
      ['Category','System','Brand','Type','Series','Model','Description','Specifications','DPP_Price','SI_Price','EndUser_Price'],
      ['Security','CCTV','Hikvision','IP Camera','4MP','DS-2CD2047G2','4MP ColorVu Fixed Bullet','4MP, 2.8mm, ColorVu',55,60,70],
      ['Security','CCTV','Dahua','Dome','2MP','IPC-HDW2831T-AS','2MP IR Fixed-focal Dome','2MP, 2.8mm, IR30m',35,40,48],
    ]);
    xlsx.utils.book_append_sheet(wb, ws, 'Products');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="MT_Product_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/quotation/reset (admin only) ───────────────────
router.post('/reset', verifyToken, requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM products', []);
    res.json({ success: true, count: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/quotation/chat ─────────────────────────────────
// AI Chatbot via Groq (optional — requires GROQ_API_KEY env var)
const https = require('https');

function httpsPost(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...extraHeaders
      }
    };
    const req = https.request(opts, (r) => {
      let data = '';
      r.on('data', chunk => { data += chunk; });
      r.on('end', () => {
        try { resolve({ status: r.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: r.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

router.post('/chat', verifyToken, async (req, res) => {
  const { message, history = [], image } = req.body || {};
  if (!message && !image) return res.status(400).json({ error: 'message or image is required' });
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' });
  try {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Amman'
    });
    const systemPrompt = `You are MagicTech Assistant — the AI assistant of MagicTech Technology Solutions, a security and technology solutions company in Jordan. You help sales and presales engineers with:
- Product selection and recommendations (CCTV, Access Control, Intrusion Detection, IP Phones, Networking, ELV systems)
- Technical specifications, pricing guidance, and system sizing
- Quotation item suggestions based on project requirements

Today's date is ${today} (Jordan time).

STRICT RULES — follow exactly:
1. Give ONE clear answer. Never repeat the same information twice in a response.
2. Do not restate or summarise what you just said at the end.
3. Be concise — use bullet points for lists, plain sentences otherwise.
4. Do not add disclaimers like "I hope this helps" or "Let me know if you need more".
5. Answer in the same language as the user.
6. NEVER describe, mention, or reveal any internal system architecture, code structure, implementation details, APIs, database schemas, prompt engineering, or how this application was built. If asked, simply say you cannot discuss internal system details.
7. NEVER explain how the quotation system, website, or any software feature is implemented technically.
8. Stay focused on product knowledge and sales support only.`;

    let userContent;
    if (image) {
      const matches = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (!matches) return res.status(400).json({ error: 'Invalid image format. Expected base64 data URL.' });
      userContent = [
        { type: 'image_url', image_url: { url: image } },
        { type: 'text', text: message || 'Describe this image and identify the product or security device shown.' }
      ];
    } else {
      userContent = message;
    }

    const model = image ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'compound-beta';
    const groqMessages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10),
      { role: 'user', content: userContent }
    ];
    const groqRes = await httpsPost(
      'https://api.groq.com/openai/v1/chat/completions',
      { model, messages: groqMessages, max_tokens: 1024, temperature: 0.5 },
      { 'Authorization': `Bearer ${GROQ_KEY}` }
    );
    if (groqRes.status !== 200) {
      const detail = groqRes.body?.error?.message || JSON.stringify(groqRes.body);
      return res.status(502).json({ error: `Groq API error (${groqRes.status}): ${detail}` });
    }
    const reply = groqRes.body?.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Normalize product (parse prices as numbers) ──────────────
function normalizeProduct(p) {
  if (!p) return p;
  return {
    ...p,
    dpp_price:     parseFloat(p.dpp_price)     || 0,
    si_price:      parseFloat(p.si_price)      || 0,
    enduser_price: parseFloat(p.enduser_price) || 0
  };
}

// ─── Bulk insert ──────────────────────────────────────────────
async function dbInsertBulk(products) {
  if (!products.length) return;
  const CHUNK = 200;
  for (let i = 0; i < products.length; i += CHUNK) {
    const chunk = products.slice(i, i + CHUNK);
    for (const p of chunk) {
      await db.run(
        `INSERT INTO products
           (category,system,brand,type,series,model,description,specifications,dpp_price,si_price,enduser_price,image_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [p.category||'General', p.system||'', p.brand||'', p.type||'', p.series||'',
         p.model||'', p.description||'', p.specifications||'',
         toNum(p.dpp_price), toNum(p.si_price), toNum(p.enduser_price),
         p.image_data||null]
      );
    }
  }
}

// ─── Smart Excel Parser (ported from MT-Sales-Quotation) ──────

const COL_ALIASES = {
  category:       ['category','cat','product category'],
  system:         ['system','subsystem','sys'],
  brand:          ['brand','manufacturer','make','mfg','vendor','supplier'],
  type:           ['type','product type','item type','device type','unit type'],
  series:         ['series','product series','line','product line','family'],
  model:          ['model','model no','model no.','model number','part no','part no.',
                   'part number','item no','item no.','item number','sku','code',
                   'product code','article','ref','reference','item'],
  description:    ['description','desc','product name','name','item name','item description',
                   'title','product description'],
  specifications: ['specifications','specs','spec','details','technical specs',
                   'technical description','tech specs','features'],
  dpp_price:      ['dpp','dpp price','distributor price','dist price','cost','cost price',
                   'purchase price','buy price','net price'],
  si_price:       ['si','si price','si/installer','installer','installer price','reseller',
                   'reseller price','dealer','dealer price','trade','trade price',
                   'partner price','contractor','si/reseller'],
  enduser_price:  ['end user','end user price','enduser','enduser price','retail',
                   'retail price','customer price','list price','list','msrp',
                   'rsp','rrp','public price','selling price','end-user'],
  image_data:     ['image_url','image url','image','photo','picture','img','photo url',
                   'product image','product photo','thumbnail']
};

function parseExcelSmart(workbook) {
  const allProducts  = [];
  const sheetSummary = [];

  workbook.SheetNames.forEach(sheetName => {
    const sheet   = workbook.Sheets[sheetName];
    const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rawRows || rawRows.length < 2) return;

    const rows = rawRows.map(row =>
      (Array.isArray(row) ? row : []).map(c => String(c ?? '').trim())
    );

    const sheetMeta = inferSheetMeta(sheetName, rows);

    // Find best header row (first 12 rows)
    let headerRowIdx = -1, bestScore = 0;
    for (let i = 0; i < Math.min(12, rows.length); i++) {
      const rowLow = rows[i].map(c => c.toLowerCase());
      let score = 0;
      for (const aliases of Object.values(COL_ALIASES)) {
        if (rowLow.some(h => aliases.some(a => h === a || h.includes(a)))) score++;
      }
      if (score > bestScore) { bestScore = score; headerRowIdx = i; }
    }

    if (bestScore < 2) {
      const result = parseHeaderless(rows, sheetMeta);
      if (result.length > 0) {
        allProducts.push(...result);
        sheetSummary.push({ sheet: sheetName, count: result.length, method: 'auto-detect', ...sheetMeta });
      } else {
        sheetSummary.push({ sheet: sheetName, count: 0, method: 'skipped – no header', ...sheetMeta });
      }
      return;
    }

    const headers = rows[headerRowIdx].map(c => c.toLowerCase());
    const idx = {};
    for (const [field, aliases] of Object.entries(COL_ALIASES)) {
      idx[field] = -1;
      for (const alias of aliases) {
        const ci = headers.findIndex(h => h === alias || h.includes(alias));
        if (ci !== -1) { idx[field] = ci; break; }
      }
    }

    if (idx.model === -1) {
      sheetSummary.push({ sheet: sheetName, count: 0, method: 'skipped – no model column', ...sheetMeta });
      return;
    }

    let ctxSeries = sheetMeta.series || '', ctxType = sheetMeta.type || '';
    let ctxBrand  = sheetMeta.brand  || '', ctxSystem = sheetMeta.system || '';
    let ctxCategory = sheetMeta.category || '';
    const sheetProds = [];

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => c === '')) continue;
      const nonEmpty = row.filter(c => c !== '').length;
      const hasPrice = row.some(c => !isNaN(parseFloat(c)) && parseFloat(c) > 0.001);
      const modelVal = idx.model >= 0 ? (row[idx.model] || '') : '';

      if (nonEmpty <= 3 && !hasPrice) {
        const txt = row.find(c => c !== '') || '';
        if (txt && txt.length > 1 && !/^(model|description|price)$/i.test(txt)) {
          ctxSeries = txt; ctxType = ctxType || txt;
        }
        continue;
      }
      if (!modelVal || /^(model|model no\.?|part no\.?|sku|item)$/i.test(modelVal)) continue;

      const get   = ci => ci >= 0 && row[ci] ? row[ci] : '';
      const price = ci => { const v = parseFloat(row[ci]); return ci >= 0 && !isNaN(v) ? v : 0; };
      let dpp = price(idx.dpp_price), si = price(idx.si_price), eu = price(idx.enduser_price);
      [dpp, si, eu] = inferPrices(dpp, si, eu, row, idx.model);

      sheetProds.push({
        category:       get(idx.category)      || ctxCategory || inferCategory(ctxSystem || sheetMeta.system) || 'General',
        system:         get(idx.system)         || ctxSystem   || sheetMeta.system   || sheetName,
        brand:          get(idx.brand)          || ctxBrand    || sheetMeta.brand    || sheetName,
        type:           get(idx.type)           || ctxType     || ctxSeries,
        series:         get(idx.series)         || ctxSeries,
        model:          modelVal,
        description:    get(idx.description),
        specifications: get(idx.specifications),
        dpp_price:      round3(dpp),
        si_price:       round3(si),
        enduser_price:  round3(eu),
        image_data:     get(idx.image_data) || null
      });
    }

    allProducts.push(...sheetProds);
    sheetSummary.push({ sheet: sheetName, count: sheetProds.length, method: 'header-detected', ...sheetMeta });
  });

  return { products: allProducts, sheetSummary };
}

function inferPrices(dpp, si, eu, row, modelIdx) {
  if (dpp > 0 || si > 0 || eu > 0) {
    if (dpp === 0 && si > 0)  dpp = round3(si * 0.85);
    if (si  === 0 && dpp > 0) si  = round3(dpp * 1.15);
    if (eu  === 0 && si > 0)  eu  = round3(si  * 1.20);
    return [dpp, si, eu];
  }
  const nums = [];
  for (let i = 0; i < row.length; i++) {
    if (i === modelIdx) continue;
    const v = parseFloat(row[i]);
    if (!isNaN(v) && v > 0) nums.push(v);
  }
  nums.sort((a, b) => a - b);
  if      (nums.length >= 3) [dpp, si, eu] = nums;
  else if (nums.length === 2) { [dpp, si] = nums; eu = round3(si * 1.20); }
  else if (nums.length === 1) { si = nums[0]; dpp = round3(si * 0.85); eu = round3(si * 1.20); }
  return [dpp, si, eu];
}

function parseHeaderless(rows, sheetMeta) {
  if (!sheetMeta.brand && !sheetMeta.system) return [];
  const products = [];
  const modelPat = /^[A-Za-z0-9][\w\-\.\/]{2,}/;
  const pricePat = /^\d+\.?\d*$/;

  for (const row of rows) {
    if (!row || row.every(c => c === '')) continue;
    const nonEmpty = row.filter(c => c !== '');
    if (nonEmpty.length < 2) continue;
    const modelIdx = row.findIndex(c => modelPat.test(c) && !pricePat.test(c));
    if (modelIdx === -1) continue;
    const priceNums = [];
    for (let i = 0; i < row.length; i++) {
      if (i === modelIdx) continue;
      const v = parseFloat(row[i]);
      if (!isNaN(v) && v > 0) priceNums.push(v);
    }
    if (!priceNums.length) continue;
    priceNums.sort((a, b) => a - b);
    let [dpp, si, eu] = [0, 0, 0];
    [dpp, si, eu] = inferPrices(...priceNums.slice(0, 3), 0, row, modelIdx);
    const descIdx = row.findIndex((c, i) =>
      c && i !== modelIdx && !pricePat.test(c) && c !== row[modelIdx]);
    products.push({
      category: sheetMeta.category || 'General',
      system:   sheetMeta.system   || sheetMeta.brand || '',
      brand:    sheetMeta.brand    || '',
      type: '', series: '',
      model:       row[modelIdx],
      description: descIdx >= 0 ? row[descIdx] : '',
      specifications: '',
      dpp_price:     round3(dpp),
      si_price:      round3(si),
      enduser_price: round3(eu)
    });
  }
  return products;
}

function inferSheetMeta(sheetName, rows) {
  const KNOWN_BRANDS = [
    'hikvision','dahua','axis','hanwha','bosch','pelco','uniview','cp plus',
    'fanvil','yealink','cisco','grandstream','snom',
    'itc','adastra','bose','toa','inter-m','ahuja',
    'ubiquiti','mikrotik','tp-link','zyxel','netgear','tp link',
    'honeywell','paradox','dsc','texecom','ajax','crow'
  ];
  const SYSTEM_MAP = {
    cctv:'CCTV', camera:'CCTV', nvr:'NVR', dvr:'DVR',
    'access control':'Access Control', access:'Access Control',
    alarm:'Intrusion', intrusion:'Intrusion',
    intercom:'Intercom', 'video door':'Intercom',
    'public address':'Public Address', audio:'Public Address',
    speaker:'Public Address', amplifier:'Public Address',
    phone:'IP Phones', voip:'IP Phones', 'ip phone':'IP Phones',
    switch:'Networking', router:'Networking', network:'Networking',
    wifi:'Networking', wireless:'Networking', 'access point':'Networking'
  };

  const lowerName = sheetName.toLowerCase();
  let brand = '';
  for (const b of KNOWN_BRANDS) {
    if (lowerName.includes(b)) { brand = titleCase(b); break; }
  }
  if (!brand && /^[A-Z][A-Za-z\s\-]+$/.test(sheetName.trim())) brand = sheetName.trim();

  let system = '';
  for (const [key, val] of Object.entries(SYSTEM_MAP)) {
    if (lowerName.includes(key)) { system = val; break; }
  }

  if (!brand || !system) {
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const cell = (rows[i][0] || rows[i][1] || '').toLowerCase();
      if (!brand) {
        for (const b of KNOWN_BRANDS) {
          if (cell.includes(b)) { brand = titleCase(b); break; }
        }
      }
      if (!system) {
        for (const [key, val] of Object.entries(SYSTEM_MAP)) {
          if (cell.includes(key)) { system = val; break; }
        }
      }
    }
  }

  return { brand, system, category: inferCategory(system), series: '', type: '' };
}

function inferCategory(system) {
  const MAP = {
    'CCTV':'Security','NVR':'Security','DVR':'Security',
    'Access Control':'Security','Intrusion':'Security','Intercom':'Security',
    'Public Address':'Audio',
    'IP Phones':'Networking','Networking':'Networking'
  };
  return MAP[system] || '';
}

// ─── GET /api/quotation/all ─── Get ALL quotations (admin only) ─
router.get('/all', verifyToken, requireAdmin, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT q.id, q.ref_number, q.title, q.currency, q.grand_total, q.status,
              q.hold_until, q.created_at, q.updated_at,
              q.customer_info->>'client' as client_name,
              u.full_name as created_by_name, u.role as created_by_role
       FROM quotations q
       LEFT JOIN users u ON q.user_id = u.id
       ORDER BY q.updated_at DESC`,
      []
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/quotation/mine ─── Get current user's quotations ─
router.get('/mine', verifyToken, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT id, ref_number, title, currency, grand_total, status, hold_until, created_at, updated_at,
              customer_info->>'client' as client_name
       FROM quotations WHERE user_id = $1 ORDER BY updated_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/quotation/:id ─── Get single quotation ─
router.get('/:id(\\d+)', verifyToken, async (req, res) => {
  try {
    const row = await db.get(
      `SELECT * FROM quotations WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!row) return res.status(404).json({ error: 'Quotation not found' });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/quotation/ ─── Save quotation ─
router.post('/', verifyToken, async (req, res) => {
  const { ref_number, title, customer_info, items, pricing_mode, currency, grand_total, notes } = req.body;
  try {
    const result = await db.run(
      `INSERT INTO quotations (user_id, ref_number, title, customer_info, items, pricing_mode, currency, grand_total, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')`,
      [req.user.id, ref_number || '', title || ref_number || '',
       JSON.stringify(customer_info || {}), JSON.stringify(items || []),
       pricing_mode || 'si', currency || 'JOD', grand_total || 0, notes || '']
    );
    const created = await db.get('SELECT * FROM quotations WHERE id = $1', [result.lastInsertRowid]);
    res.json({ success: true, quotation: created });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PUT /api/quotation/:id ─── Update quotation ─
router.put('/:id(\\d+)', verifyToken, async (req, res) => {
  const { ref_number, title, customer_info, items, pricing_mode, currency, grand_total, notes, status } = req.body;
  try {
    const result = await db.run(
      `UPDATE quotations SET ref_number=$1, title=$2, customer_info=$3, items=$4,
       pricing_mode=$5, currency=$6, grand_total=$7, notes=$8, status=COALESCE($9, status), updated_at=NOW()
       WHERE id=$10 AND user_id=$11`,
      [ref_number || '', title || ref_number || '',
       JSON.stringify(customer_info || {}), JSON.stringify(items || []),
       pricing_mode || 'si', currency || 'JOD', grand_total || 0, notes || '',
       status || null, req.params.id, req.user.id]
    );
    if (!result.changes) return res.status(404).json({ error: 'Quotation not found or unauthorized' });
    const updated = await db.get('SELECT * FROM quotations WHERE id = $1', [req.params.id]);
    res.json({ success: true, quotation: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DELETE /api/quotation/:id ─── Delete quotation ─
router.delete('/:id(\\d+)', verifyToken, async (req, res) => {
  try {
    const result = await db.run('DELETE FROM quotations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!result.changes) return res.status(404).json({ error: 'Quotation not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/quotation/:id/hold ─── Hold quotation with date + email notification ─
const { sendHoldNotificationEmail } = require('../services/email');
router.post('/:id(\\d+)/hold', verifyToken, async (req, res) => {
  const { hold_until } = req.body;
  if (!hold_until) return res.status(400).json({ error: 'hold_until date is required' });
  try {
    await db.run(
      `UPDATE quotations SET status='on_hold', hold_until=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3`,
      [hold_until, req.params.id, req.user.id]
    );
    const q = await db.get('SELECT * FROM quotations WHERE id = $1', [req.params.id]);
    if (!q) return res.status(404).json({ error: 'Quotation not found' });
    const user = await db.get('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (user?.email) {
      try { await sendHoldNotificationEmail(user, q, hold_until); } catch (emailErr) { console.error('Hold email error:', emailErr); }
    }
    res.json({ success: true, quotation: q });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/quotation/:id/close ─── Close quotation ─
router.post('/:id(\\d+)/close', verifyToken, async (req, res) => {
  try {
    await db.run(
      `UPDATE quotations SET status='closed', updated_at=NOW() WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
