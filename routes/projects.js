const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const MODULE_CHECKLISTS = {
  'Maintenance': [
    'Initial site inspection and assessment',
    'Check all existing equipment status',
    'Perform scheduled maintenance tasks',
    'Test all systems post-maintenance',
    'Document findings and actions taken',
    'Obtain client sign-off'
  ],
  'Handover': [
    'Prepare handover documentation',
    'Verify all systems are operational',
    'Conduct client walkthrough',
    'Train client on system operation',
    'Provide as-built drawings',
    'Collect all signed documents',
    'Final handover sign-off'
  ],
  'Installation and Wiring': [
    'Review installation drawings',
    'Prepare materials and tools',
    'Cable routing and labeling',
    'Equipment mounting and installation',
    'Wiring and terminations',
    'Quality check on all connections',
    'Initial power-up test'
  ],
  'Programming and Trouble Shooting': [
    'Load/verify configuration files',
    'Program device parameters',
    'Test all programmed functions',
    'Troubleshoot identified issues',
    'Document all changes made',
    'Final system validation'
  ],
  'Delivering': [
    'Prepare delivery manifest',
    'Pack and label equipment',
    'Coordinate delivery logistics',
    'Verify delivery receipt',
    'Obtain signed delivery note'
  ],
  'Site Survey': [
    'Review existing drawings/plans',
    'Photograph site conditions',
    'Measure and document dimensions',
    'Identify cable routes',
    'Note power availability',
    'Document survey findings',
    'Prepare survey report'
  ],
  'POC': [
    'Define POC objectives',
    'Setup test environment',
    'Configure demo equipment',
    'Conduct demonstration to client',
    'Document client feedback',
    'Prepare POC summary report'
  ]
};

// ── Get all projects ────────────────────────────────────
router.get('/', verifyToken, (req, res) => {
  let query, params;
  if (req.user.role === 'admin') {
    query = `
      SELECT p.*, u1.full_name as user1_name, u1.avatar_color as user1_color,
             u2.full_name as user2_name, u2.avatar_color as user2_color,
             COUNT(pm.id) as module_count
      FROM projects p
      LEFT JOIN users u1 ON u1.id=p.user_id_1
      LEFT JOIN users u2 ON u2.id=p.user_id_2
      LEFT JOIN project_modules pm ON pm.project_id=p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
    params = [];
  } else {
    query = `
      SELECT p.*, u1.full_name as user1_name, u1.avatar_color as user1_color,
             u2.full_name as user2_name, u2.avatar_color as user2_color,
             COUNT(pm.id) as module_count
      FROM projects p
      LEFT JOIN users u1 ON u1.id=p.user_id_1
      LEFT JOIN users u2 ON u2.id=p.user_id_2
      LEFT JOIN project_modules pm ON pm.project_id=p.id
      WHERE p.user_id_1=? OR p.user_id_2=?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
    params = [req.user.id, req.user.id];
  }
  const projects = db.prepare(query).all(...params);
  res.json(projects);
});

// ── Get single project with modules ────────────────────
router.get('/:id', verifyToken, (req, res) => {
  const project = db.prepare(`
    SELECT p.*, u1.full_name as user1_name, u1.avatar_color as user1_color,
           u2.full_name as user2_name, u2.avatar_color as user2_color
    FROM projects p
    LEFT JOIN users u1 ON u1.id=p.user_id_1
    LEFT JOIN users u2 ON u2.id=p.user_id_2
    WHERE p.id=?
  `).get(req.params.id);

  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (req.user.role !== 'admin' && project.user_id_1 !== req.user.id && project.user_id_2 !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const modules = db.prepare('SELECT * FROM project_modules WHERE project_id=? ORDER BY id').all(req.params.id);

  for (const mod of modules) {
    mod.checklist = db.prepare('SELECT * FROM module_checklist WHERE module_id=? ORDER BY sort_order').all(mod.id);
    mod.devices = db.prepare('SELECT * FROM module_devices WHERE module_id=? ORDER BY id').all(mod.id);
    mod.documents = db.prepare('SELECT id, doc_type, file_name, uploaded_at FROM module_documents WHERE module_id=? ORDER BY id').all(mod.id);
    mod.reports = db.prepare(`
      SELECT mr.*, u.full_name as submitted_by_name
      FROM module_reports mr JOIN users u ON u.id=mr.submitted_by
      WHERE mr.module_id=? ORDER BY mr.submitted_at DESC
    `).all(mod.id);
  }

  project.modules = modules;
  res.json(project);
});

// ── Create project (admin only) ─────────────────────────
router.post('/', verifyToken, requireAdmin, (req, res) => {
  const {
    project_name, client_name_1, client_name_2, client_number,
    location_name, location_lat, location_lng,
    user_id_1, user_id_2, start_date, end_date, priority, modules
  } = req.body;

  if (!project_name) return res.status(400).json({ error: 'Project name is required' });
  if (!modules || !modules.length) return res.status(400).json({ error: 'At least one module required' });

  const insertProject = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO projects (project_name, client_name_1, client_name_2, client_number,
        location_name, location_lat, location_lng, user_id_1, user_id_2,
        start_date, end_date, status, priority, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(project_name, client_name_1, client_name_2, client_number,
      location_name, location_lat, location_lng, user_id_1, user_id_2,
      start_date, end_date, priority || 'normal', req.user.id);

    const projectId = result.lastInsertRowid;

    for (const mod of modules) {
      const modResult = db.prepare(`
        INSERT INTO project_modules (project_id, module_type, scope_of_work, issue_details)
        VALUES (?, ?, ?, ?)
      `).run(projectId, mod.module_type, mod.scope_of_work || '', mod.issue_details || '');

      const modId = modResult.lastInsertRowid;

      // Seed default checklist
      const defaultTasks = MODULE_CHECKLISTS[mod.module_type] || [];
      defaultTasks.forEach((task, idx) => {
        db.prepare(`
          INSERT INTO module_checklist (module_id, task_title, sort_order) VALUES (?, ?, ?)
        `).run(modId, task, idx);
      });

      // Custom checklist items
      if (mod.checklist_items) {
        mod.checklist_items.forEach((item, idx) => {
          db.prepare(`
            INSERT INTO module_checklist (module_id, task_title, task_description, sort_order)
            VALUES (?, ?, ?, ?)
          `).run(modId, item.title, item.description || '', defaultTasks.length + idx);
        });
      }

      // Devices
      if (mod.devices) {
        for (const dev of mod.devices) {
          db.prepare(`
            INSERT INTO module_devices (module_id, device_model, device_qty, device_description, serial_number, added_by)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(modId, dev.model, dev.qty || 1, dev.description || '', dev.serial || '', req.user.id);
        }
      }
    }

    // Notify assigned users
    const userIds = [user_id_1, user_id_2].filter(Boolean);
    for (const uid of userIds) {
      db.prepare(`
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, ?, ?, 'project')
      `).run(uid, `New Project Assigned: ${project_name}`,
        `You have been assigned to project "${project_name}". Please review your tasks.`);
    }

    return projectId;
  });

  const projectId = insertProject();
  res.json({ success: true, id: projectId, message: 'Project created successfully' });
});

// ── Update project (admin only) ─────────────────────────
router.put('/:id', verifyToken, requireAdmin, (req, res) => {
  const { project_name, client_name_1, client_name_2, client_number,
    location_name, location_lat, location_lng, user_id_1, user_id_2,
    start_date, end_date, status, priority } = req.body;

  db.prepare(`
    UPDATE projects SET project_name=?, client_name_1=?, client_name_2=?, client_number=?,
      location_name=?, location_lat=?, location_lng=?, user_id_1=?, user_id_2=?,
      start_date=?, end_date=?, status=?, priority=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(project_name, client_name_1, client_name_2, client_number,
    location_name, location_lat, location_lng, user_id_1, user_id_2,
    start_date, end_date, status, priority, req.params.id);

  res.json({ success: true, message: 'Project updated' });
});

router.delete('/:id', verifyToken, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  res.json({ success: true, message: 'Project deleted' });
});

// ── Module updates (users can update their module status) ─
router.put('/:projectId/modules/:moduleId', verifyToken, (req, res) => {
  const { status, progress, user_notes, admin_notes } = req.body;
  const mod = db.prepare('SELECT pm.*, p.user_id_1, p.user_id_2 FROM project_modules pm JOIN projects p ON p.id=pm.project_id WHERE pm.id=?').get(req.params.moduleId);
  if (!mod) return res.status(404).json({ error: 'Module not found' });

  if (req.user.role !== 'admin' && mod.user_id_1 !== req.user.id && mod.user_id_2 !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const updates = {};
  if (status) updates.status = status;
  if (progress !== undefined) updates.progress = progress;
  if (user_notes !== undefined) updates.user_notes = user_notes;
  if (admin_notes !== undefined && req.user.role === 'admin') updates.admin_notes = admin_notes;
  if (status === 'in_progress' && !mod.started_at) updates.started_at = new Date().toISOString();
  if (status === 'completed') updates.completed_at = new Date().toISOString();

  const fields = Object.keys(updates).map(k => `${k}=?`).join(', ');
  const vals = Object.values(updates);
  db.prepare(`UPDATE project_modules SET ${fields}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...vals, req.params.moduleId);

  res.json({ success: true, message: 'Module updated' });
});

// ── Checklist item toggle ───────────────────────────────
router.put('/:projectId/modules/:moduleId/checklist/:itemId', verifyToken, (req, res) => {
  const { is_completed } = req.body;
  const item = db.prepare('SELECT mc.* FROM module_checklist mc JOIN project_modules pm ON pm.id=mc.module_id JOIN projects p ON p.id=pm.project_id WHERE mc.id=?').get(req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Checklist item not found' });

  if (is_completed) {
    db.prepare('UPDATE module_checklist SET is_completed=1, completed_by=?, completed_at=CURRENT_TIMESTAMP WHERE id=?').run(req.user.id, req.params.itemId);
  } else {
    db.prepare('UPDATE module_checklist SET is_completed=0, completed_by=NULL, completed_at=NULL WHERE id=?').run(req.params.itemId);
  }

  // Auto-update module progress
  const allItems = db.prepare('SELECT COUNT(*) as total FROM module_checklist WHERE module_id=?').get(req.params.moduleId);
  const doneItems = db.prepare('SELECT COUNT(*) as done FROM module_checklist WHERE module_id=? AND is_completed=1').get(req.params.moduleId);
  const progress = allItems.total > 0 ? Math.round((doneItems.done / allItems.total) * 100) : 0;
  db.prepare('UPDATE project_modules SET progress=? WHERE id=?').run(progress, req.params.moduleId);

  res.json({ success: true, progress });
});

// ── Submit report ───────────────────────────────────────
router.post('/:projectId/modules/:moduleId/reports', verifyToken, (req, res) => {
  const { report_text, work_done, issues_found, next_steps, hours_spent } = req.body;
  const result = db.prepare(`
    INSERT INTO module_reports (module_id, submitted_by, report_text, work_done, issues_found, next_steps, hours_spent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.moduleId, req.user.id, report_text, work_done, issues_found, next_steps, hours_spent);

  // Check if all checklist items done => auto-complete module
  const allItems = db.prepare('SELECT COUNT(*) as total FROM module_checklist WHERE module_id=?').get(req.params.moduleId);
  const doneItems = db.prepare('SELECT COUNT(*) as done FROM module_checklist WHERE module_id=? AND is_completed=1').get(req.params.moduleId);
  if (allItems.total > 0 && allItems.total === doneItems.done) {
    db.prepare("UPDATE project_modules SET status='completed', progress=100, completed_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.moduleId);
  }

  // Notify admin
  const admins = db.prepare("SELECT id FROM users WHERE role='admin'").all();
  const proj = db.prepare('SELECT project_name FROM projects WHERE id=?').get(req.params.projectId);
  for (const admin of admins) {
    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'report')`).run(
      admin.id,
      `Report Submitted: ${proj?.project_name}`,
      `${req.user.full_name} submitted a report for module #${req.params.moduleId}`
    );
  }

  res.json({ success: true, id: result.lastInsertRowid });
});

// ── Review report (admin) ───────────────────────────────
router.put('/:projectId/modules/:moduleId/reports/:reportId', verifyToken, requireAdmin, (req, res) => {
  const { review_status, review_notes } = req.body;
  db.prepare(`
    UPDATE module_reports SET review_status=?, review_notes=?, reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(review_status, review_notes, req.user.id, req.params.reportId);
  res.json({ success: true });
});

// ── Excel upload & parsing ──────────────────────────────
router.post('/excel-parse', verifyToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    const devices = [];
    const scopeLines = [];

    for (const row of data) {
      const keys = Object.keys(row);
      // Try to detect device rows
      const modelKey = keys.find(k => /model|device|item|product/i.test(k));
      const qtyKey = keys.find(k => /qty|quantity|count|pcs/i.test(k));
      const descKey = keys.find(k => /desc|description|spec|detail/i.test(k));
      const snKey = keys.find(k => /serial|sn|s\/n/i.test(k));

      if (modelKey && row[modelKey]) {
        devices.push({
          model: String(row[modelKey]).trim(),
          qty: qtyKey ? Number(row[qtyKey]) || 1 : 1,
          description: descKey ? String(row[descKey]).trim() : '',
          serial: snKey ? String(row[snKey]).trim() : ''
        });
      }

      // Scope of work detection
      const scopeKey = keys.find(k => /scope|work|task|activity/i.test(k));
      if (scopeKey && row[scopeKey]) {
        scopeLines.push(String(row[scopeKey]).trim());
      }
    }

    // Store file path for reference
    const filePath = req.file.path;

    res.json({
      success: true,
      devices,
      scope_of_work: scopeLines.join('\n'),
      raw_rows: data.length,
      file_name: req.file.originalname,
      file_path: filePath
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse Excel file: ' + err.message });
  }
});

// ── Notifications ───────────────────────────────────────
router.get('/notifications/mine', verifyToken, (req, res) => {
  const notes = db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  res.json(notes);
});

router.put('/notifications/:id/read', verifyToken, (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

router.put('/notifications/read-all', verifyToken, (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.user.id);
  res.json({ success: true });
});

module.exports = router;
