const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const db = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { sendProjectAssignmentEmail } = require('../services/email');

const router = express.Router();

// Use memory storage so parsing works in serverless environments (Vercel /tmp is read-only)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
router.get('/', verifyToken, async (req, res) => {
  try {
    let projects;
    if (req.user.role === 'admin') {
      projects = await db.all(`
        SELECT p.*, u1.full_name as user1_name, u1.avatar_color as user1_color,
               u2.full_name as user2_name, u2.avatar_color as user2_color,
               (SELECT COUNT(*) FROM project_modules WHERE project_id = p.id) as module_count
        FROM projects p
        LEFT JOIN users u1 ON u1.id=p.user_id_1
        LEFT JOIN users u2 ON u2.id=p.user_id_2
        ORDER BY p.created_at DESC
      `);
    } else {
      projects = await db.all(`
        SELECT p.*, u1.full_name as user1_name, u1.avatar_color as user1_color,
               u2.full_name as user2_name, u2.avatar_color as user2_color,
               (SELECT COUNT(*) FROM project_modules WHERE project_id = p.id) as module_count
        FROM projects p
        LEFT JOIN users u1 ON u1.id=p.user_id_1
        LEFT JOIN users u2 ON u2.id=p.user_id_2
        WHERE p.user_id_1=? OR p.user_id_2=?
        ORDER BY p.created_at DESC
      `, [req.user.id, req.user.id]);
    }
    res.json(projects);
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Get single project with modules ────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const project = await db.get(`
      SELECT p.*, u1.full_name as user1_name, u1.avatar_color as user1_color,
             u2.full_name as user2_name, u2.avatar_color as user2_color
      FROM projects p
      LEFT JOIN users u1 ON u1.id=p.user_id_1
      LEFT JOIN users u2 ON u2.id=p.user_id_2
      WHERE p.id=?
    `, [req.params.id]);

    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (req.user.role !== 'admin' && project.user_id_1 !== req.user.id && project.user_id_2 !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const modules = await db.all('SELECT * FROM project_modules WHERE project_id=? ORDER BY id', [req.params.id]);

    for (const mod of modules) {
      mod.checklist = await db.all('SELECT * FROM module_checklist WHERE module_id=? ORDER BY sort_order', [mod.id]);
      mod.devices = await db.all('SELECT * FROM module_devices WHERE module_id=? ORDER BY id', [mod.id]);
      mod.documents = await db.all('SELECT id, doc_type, file_name, uploaded_at FROM module_documents WHERE module_id=? ORDER BY id', [mod.id]);
      mod.reports = await db.all(`
        SELECT mr.*, u.full_name as submitted_by_name
        FROM module_reports mr JOIN users u ON u.id=mr.submitted_by
        WHERE mr.module_id=? ORDER BY mr.submitted_at DESC
      `, [mod.id]);
    }

    project.modules = modules;
    res.json(project);
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Create project (admin only) ─────────────────────────
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const {
      project_name, client_name_1, client_name_2, client_number,
      location_name, location_lat, location_lng,
      user_id_1, user_id_2, start_date, end_date, priority, modules
    } = req.body;

    if (!project_name) return res.status(400).json({ error: 'Project name is required' });
    if (!modules || !modules.length) return res.status(400).json({ error: 'At least one module required' });

    const projectId = await db.transaction(async (tx) => {
      const result = await tx.run(
        `INSERT INTO projects (project_name, client_name_1, client_name_2, client_number,
          location_name, location_lat, location_lng, user_id_1, user_id_2,
          start_date, end_date, status, priority, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [project_name, client_name_1, client_name_2, client_number,
          location_name, location_lat, location_lng, user_id_1, user_id_2,
          start_date, end_date, priority || 'normal', req.user.id]
      );

      const projId = result.lastInsertRowid;

      for (const mod of modules) {
        const modResult = await tx.run(
          `INSERT INTO project_modules (project_id, module_type, scope_of_work, issue_details)
          VALUES (?, ?, ?, ?)`,
          [projId, mod.module_type, mod.scope_of_work || '', mod.issue_details || '']
        );

        const modId = modResult.lastInsertRowid;

        // Seed default checklist
        const defaultTasks = MODULE_CHECKLISTS[mod.module_type] || [];
        for (let idx = 0; idx < defaultTasks.length; idx++) {
          await tx.run(
            'INSERT INTO module_checklist (module_id, task_title, sort_order) VALUES (?, ?, ?)',
            [modId, defaultTasks[idx], idx]
          );
        }

        // Custom checklist items
        if (mod.checklist_items) {
          for (let idx = 0; idx < mod.checklist_items.length; idx++) {
            const item = mod.checklist_items[idx];
            await tx.run(
              'INSERT INTO module_checklist (module_id, task_title, task_description, sort_order) VALUES (?, ?, ?, ?)',
              [modId, item.title, item.description || '', defaultTasks.length + idx]
            );
          }
        }

        // Devices
        if (mod.devices) {
          for (const dev of mod.devices) {
            await tx.run(
              `INSERT INTO module_devices (module_id, device_model, device_qty, device_description, serial_number, added_by)
              VALUES (?, ?, ?, ?, ?, ?)`,
              [modId, dev.model, dev.qty || 1, dev.description || '', dev.serial || '', req.user.id]
            );
          }
        }
      }

      // Notify assigned users (in-app)
      const userIds = [user_id_1, user_id_2].filter(Boolean);
      for (const uid of userIds) {
        await tx.run(
          "INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'project')",
          [uid, `New Project Assigned: ${project_name}`,
            `You have been assigned to project "${project_name}". Please review your tasks.`]
        );
      }

      return projId;
    });

    // Send email notifications (non-blocking — failures don't abort the response)
    const assignedUserIds = [user_id_1, user_id_2].filter(Boolean);
    if (assignedUserIds.length) {
      const moduleList = modules.map(m => ({ module_type: m.module_type, scope_of_work: m.scope_of_work || '' }));
      for (const uid of assignedUserIds) {
        const usr = await db.get('SELECT full_name, email FROM users WHERE id=?', [uid]);
        if (usr?.email) {
          sendProjectAssignmentEmail({
            userEmail: usr.email,
            userName: usr.full_name,
            projectName: project_name,
            clientName: client_name_1,
            startDate: start_date,
            endDate: end_date,
            priority,
            modules: moduleList
          }).catch(e => console.error('[Email] Assignment email error:', e.message));
        }
      }
    }

    res.json({ success: true, id: projectId, message: 'Project created successfully' });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Update project (admin only) ─────────────────────────
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const existing = await db.get('SELECT * FROM projects WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const { project_name, client_name_1, client_name_2, client_number,
      location_name, location_lat, location_lng, user_id_1, user_id_2,
      start_date, end_date, status, priority } = req.body;

    const finalUserId1 = user_id_1 ?? existing.user_id_1;
    const finalUserId2 = user_id_2 ?? existing.user_id_2;

    await db.run(
      `UPDATE projects SET project_name=?, client_name_1=?, client_name_2=?, client_number=?,
        location_name=?, location_lat=?, location_lng=?, user_id_1=?, user_id_2=?,
        start_date=?, end_date=?, status=?, priority=?, updated_at=NOW()
      WHERE id=?`,
      [
        project_name ?? existing.project_name,
        client_name_1 ?? existing.client_name_1,
        client_name_2 ?? existing.client_name_2,
        client_number ?? existing.client_number,
        location_name ?? existing.location_name,
        location_lat ?? existing.location_lat,
        location_lng ?? existing.location_lng,
        finalUserId1,
        finalUserId2,
        start_date ?? existing.start_date,
        end_date ?? existing.end_date,
        status ?? existing.status,
        priority ?? existing.priority,
        req.params.id
      ]
    );

    // Email newly assigned users (those not previously assigned)
    const prevIds = [existing.user_id_1, existing.user_id_2].filter(Boolean).map(Number);
    const newIds  = [finalUserId1, finalUserId2].filter(Boolean).map(Number);
    const addedIds = newIds.filter(id => !prevIds.includes(id));

    if (addedIds.length) {
      const pName = project_name ?? existing.project_name;
      const mods  = await db.all('SELECT module_type, scope_of_work FROM project_modules WHERE project_id=?', [req.params.id]);
      for (const uid of addedIds) {
        const usr = await db.get('SELECT full_name, email FROM users WHERE id=?', [uid]);
        if (usr?.email) {
          sendProjectAssignmentEmail({
            userEmail: usr.email,
            userName: usr.full_name,
            projectName: pName,
            clientName: client_name_1 ?? existing.client_name_1,
            startDate: start_date ?? existing.start_date,
            endDate: end_date ?? existing.end_date,
            priority: priority ?? existing.priority,
            modules: mods
          }).catch(e => console.error('[Email] Update assignment email error:', e.message));
        }
      }
    }

    res.json({ success: true, message: 'Project updated' });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM projects WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Project deleted' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Module updates (users can update their module status) ─
router.put('/:projectId/modules/:moduleId', verifyToken, async (req, res) => {
  try {
    const { status, progress, user_notes, admin_notes } = req.body;
    const mod = await db.get(
      'SELECT pm.*, p.user_id_1, p.user_id_2 FROM project_modules pm JOIN projects p ON p.id=pm.project_id WHERE pm.id=?',
      [req.params.moduleId]
    );
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

    if (Object.keys(updates).length > 0) {
      const keys = Object.keys(updates);
      const fields = keys.map((k, i) => `${k}=$${i + 1}`).join(', ');
      const vals = keys.map(k => updates[k]);
      vals.push(req.params.moduleId);
      // SQL already uses $N notation, pgify won't touch it
      await db.run(
        `UPDATE project_modules SET ${fields}, updated_at=NOW() WHERE id=$${vals.length}`,
        vals
      );
    }

    res.json({ success: true, message: 'Module updated' });
  } catch (err) {
    console.error('Update module error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Checklist item toggle ───────────────────────────────
router.put('/:projectId/modules/:moduleId/checklist/:itemId', verifyToken, async (req, res) => {
  try {
    const { is_completed } = req.body;
    const item = await db.get(
      'SELECT mc.* FROM module_checklist mc JOIN project_modules pm ON pm.id=mc.module_id JOIN projects p ON p.id=pm.project_id WHERE mc.id=?',
      [req.params.itemId]
    );
    if (!item) return res.status(404).json({ error: 'Checklist item not found' });

    if (is_completed) {
      await db.run(
        'UPDATE module_checklist SET is_completed=1, completed_by=?, completed_at=NOW() WHERE id=?',
        [req.user.id, req.params.itemId]
      );
    } else {
      await db.run(
        'UPDATE module_checklist SET is_completed=0, completed_by=NULL, completed_at=NULL WHERE id=?',
        [req.params.itemId]
      );
    }

    // Auto-update module progress
    const allItems = await db.get('SELECT COUNT(*) as total FROM module_checklist WHERE module_id=?', [req.params.moduleId]);
    const doneItems = await db.get('SELECT COUNT(*) as done FROM module_checklist WHERE module_id=? AND is_completed=1', [req.params.moduleId]);
    const progressVal = allItems.total > 0 ? Math.round((doneItems.done / allItems.total) * 100) : 0;
    await db.run('UPDATE project_modules SET progress=? WHERE id=?', [progressVal, req.params.moduleId]);

    res.json({ success: true, progress: progressVal });
  } catch (err) {
    console.error('Toggle checklist error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Submit report ───────────────────────────────────────
router.post('/:projectId/modules/:moduleId/reports', verifyToken, async (req, res) => {
  try {
    const { report_text, work_done, issues_found, next_steps, hours_spent } = req.body;
    const result = await db.run(
      `INSERT INTO module_reports (module_id, submitted_by, report_text, work_done, issues_found, next_steps, hours_spent)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.moduleId, req.user.id, report_text, work_done, issues_found, next_steps, hours_spent]
    );

    // Check if all checklist items done => auto-complete module
    const allItems = await db.get('SELECT COUNT(*) as total FROM module_checklist WHERE module_id=?', [req.params.moduleId]);
    const doneItems = await db.get('SELECT COUNT(*) as done FROM module_checklist WHERE module_id=? AND is_completed=1', [req.params.moduleId]);
    if (allItems.total > 0 && Number(allItems.total) === Number(doneItems.done)) {
      await db.run(
        "UPDATE project_modules SET status='completed', progress=100, completed_at=NOW() WHERE id=?",
        [req.params.moduleId]
      );
    }

    // Notify admin
    const admins = await db.all("SELECT id FROM users WHERE role='admin'");
    const proj = await db.get('SELECT project_name FROM projects WHERE id=?', [req.params.projectId]);
    for (const admin of admins) {
      await db.run(
        "INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'report')",
        [admin.id, `Report Submitted: ${proj?.project_name}`,
          `${req.user.full_name} submitted a report for module #${req.params.moduleId}`]
      );
    }

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('Submit report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Review report (admin) ───────────────────────────────
router.put('/:projectId/modules/:moduleId/reports/:reportId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { review_status, review_notes } = req.body;
    await db.run(
      'UPDATE module_reports SET review_status=?, review_notes=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?',
      [review_status, review_notes, req.user.id, req.params.reportId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Review report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Excel upload & parsing ──────────────────────────────
router.post('/excel-parse', verifyToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Get raw rows (array of arrays) so we can find the real header row
    const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Helper: test if a cell value looks like a header keyword
    const MODEL_RE   = /model|device|item|product|equipment|part|unit|name|description/i;
    const QTY_RE     = /qty|quantity|count|pcs|pieces|no\.|number|amount/i;
    const DESC_RE    = /desc|description|spec|detail|remark|note|type/i;
    const SN_RE      = /serial|sn|s\/n|barcode/i;
    const SCOPE_RE   = /scope|work|task|activity|service/i;

    // Find the first row that looks like a header (has at least a model-ish column)
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      const row = rawRows[i].map(c => String(c));
      if (row.some(c => MODEL_RE.test(c)) || row.some(c => QTY_RE.test(c))) {
        headerRowIdx = i;
        break;
      }
    }

    const headers = rawRows[headerRowIdx].map(c => String(c));

    // Map column indices
    const modelIdx = headers.findIndex(h => MODEL_RE.test(h));
    const qtyIdx   = headers.findIndex(h => QTY_RE.test(h));
    const descIdx  = headers.findIndex(h => DESC_RE.test(h) && !MODEL_RE.test(h));
    const snIdx    = headers.findIndex(h => SN_RE.test(h));
    const scopeIdx = headers.findIndex(h => SCOPE_RE.test(h));

    const devices = [];
    const scopeLines = [];

    const dataRows = rawRows.slice(headerRowIdx + 1);
    for (const row of dataRows) {
      // Skip totally empty rows
      if (row.every(c => c === '' || c == null)) continue;

      const modelVal = modelIdx >= 0 ? String(row[modelIdx] ?? '').trim() : '';
      if (modelVal && modelVal !== 'undefined') {
        const qtyRaw = qtyIdx >= 0 ? row[qtyIdx] : '';
        const qty = Number(qtyRaw) || 1;
        const desc = descIdx >= 0 ? String(row[descIdx] ?? '').trim() : '';
        const serial = snIdx >= 0 ? String(row[snIdx] ?? '').trim() : '';
        devices.push({ model: modelVal, qty, description: desc, serial });
      }

      if (scopeIdx >= 0) {
        const scopeVal = String(row[scopeIdx] ?? '').trim();
        if (scopeVal && scopeVal !== 'undefined') scopeLines.push(scopeVal);
      }
    }

    // Fallback: if column-header strategy found nothing, use key-value JSON parse
    if (!devices.length) {
      const jsonRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
      for (const row of jsonRows) {
        const keys = Object.keys(row);
        const modelKey = keys.find(k => MODEL_RE.test(k));
        const qtyKey   = keys.find(k => QTY_RE.test(k));
        const descKey  = keys.find(k => DESC_RE.test(k));
        const snKey    = keys.find(k => SN_RE.test(k));
        if (modelKey && row[modelKey]) {
          devices.push({
            model: String(row[modelKey]).trim(),
            qty: qtyKey ? Number(row[qtyKey]) || 1 : 1,
            description: descKey ? String(row[descKey]).trim() : '',
            serial: snKey ? String(row[snKey]).trim() : ''
          });
        }
        const scopeKey = keys.find(k => SCOPE_RE.test(k));
        if (scopeKey && row[scopeKey]) scopeLines.push(String(row[scopeKey]).trim());
      }
    }

    res.json({
      success: true,
      devices,
      scope_of_work: scopeLines.join('\n'),
      raw_rows: rawRows.length,
      header_row: headerRowIdx,
      columns_detected: { model: headers[modelIdx] || null, qty: headers[qtyIdx] || null, desc: headers[descIdx] || null, serial: headers[snIdx] || null },
      file_name: req.file.originalname
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse Excel file: ' + err.message });
  }
});

// ── All reports (admin, single query) ──────────────────
router.get('/reports/all', verifyToken, requireAdmin, async (req, res) => {
  try {
    const reports = await db.all(`
      SELECT mr.*,
             u.full_name as submitted_by_name,
             pm.module_type,
             p.id as project_id, p.project_name
      FROM module_reports mr
      JOIN users u ON u.id = mr.submitted_by
      JOIN project_modules pm ON pm.id = mr.module_id
      JOIN projects p ON p.id = pm.project_id
      ORDER BY mr.submitted_at DESC
    `);
    res.json(reports);
  } catch (err) {
    console.error('All reports error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Daily Summary ────────────────────────────────────────
router.get('/daily-summary', verifyToken, requireAdmin, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    // Projects where start_date <= date AND (end_date >= date OR end_date IS NULL)
    // AND status is not cancelled
    const projects = await db.all(`
      SELECT p.id, p.project_name, p.client_name_1, p.client_name_2, p.client_number,
             p.location_name, p.status, p.priority, p.start_date, p.end_date,
             u1.full_name as user1_name, u2.full_name as user2_name
      FROM projects p
      LEFT JOIN users u1 ON u1.id = p.user_id_1
      LEFT JOIN users u2 ON u2.id = p.user_id_2
      WHERE p.status != 'cancelled'
        AND (p.start_date IS NULL OR p.start_date <= ?)
        AND (p.end_date IS NULL OR p.end_date >= ?)
      ORDER BY p.priority DESC, p.project_name ASC
    `, [date, date]);

    for (const proj of projects) {
      proj.modules = await db.all(
        `SELECT id, module_type, status, progress, scope_of_work
         FROM project_modules WHERE project_id = ? ORDER BY id`,
        [proj.id]
      );
    }

    res.json({ date, projects });
  } catch (err) {
    console.error('Daily summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Notifications ───────────────────────────────────────
router.get('/notifications/mine', verifyToken, async (req, res) => {
  try {
    const notes = await db.all(
      'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(notes);
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    await db.run('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/notifications/read-all', verifyToken, async (req, res) => {
  try {
    await db.run('UPDATE notifications SET is_read=1 WHERE user_id=?', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
