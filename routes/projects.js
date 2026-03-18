const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const db = require('../database/db');
const { verifyToken, requireAdmin, requireAdminOrManager, requireSalesOrAdmin } = require('../middleware/auth');
const { sendProjectAssignmentEmail, sendReportReviewEmail, sendDailySummaryEmail, sendProjectCompletionEmail } = require('../services/email');

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
    if (req.user.role === 'admin' || req.user.role === 'projects_manager') {
      // Admins and Projects Managers see all projects
      projects = await db.all(`
        SELECT p.*, u1.full_name as user1_name, u1.avatar_color as user1_color,
               u2.full_name as user2_name, u2.avatar_color as user2_color,
               sp.full_name as sales_person_name, pp.full_name as presales_person_name,
               (SELECT COUNT(*) FROM project_modules WHERE project_id = p.id) as module_count
        FROM projects p
        LEFT JOIN users u1 ON u1.id=p.user_id_1
        LEFT JOIN users u2 ON u2.id=p.user_id_2
        LEFT JOIN users sp ON sp.id=p.sales_person_id
        LEFT JOIN users pp ON pp.id=p.presales_person_id
        ORDER BY p.created_at DESC
      `);
    } else {
      projects = await db.all(`
        SELECT p.*, u1.full_name as user1_name, u1.avatar_color as user1_color,
               u2.full_name as user2_name, u2.avatar_color as user2_color,
               sp.full_name as sales_person_name, pp.full_name as presales_person_name,
               (SELECT COUNT(*) FROM project_modules WHERE project_id = p.id) as module_count
        FROM projects p
        LEFT JOIN users u1 ON u1.id=p.user_id_1
        LEFT JOIN users u2 ON u2.id=p.user_id_2
        LEFT JOIN users sp ON sp.id=p.sales_person_id
        LEFT JOIN users pp ON pp.id=p.presales_person_id
        WHERE p.user_id_1=? OR p.user_id_2=? OR p.created_by=? OR p.sales_person_id=? OR p.presales_person_id=?
        ORDER BY p.created_at DESC
      `, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]);
    }
    res.json(projects);
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Daily Summary ────────────────────────────────────────
// MUST be declared before /:id to prevent Express from matching "daily-summary" as an id param
router.get('/daily-summary', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'projects_manager' && req.user.role !== 'planner') {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

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
      for (const mod of proj.modules) {
        mod.devices = await db.all(
          `SELECT device_model, device_qty, device_description FROM module_devices WHERE module_id = ? ORDER BY id`,
          [mod.id]
        );
        // Include preparation status for the current user
        const prep = await db.get(
          'SELECT id FROM module_preparations WHERE module_id = ? AND prepared_date = ? AND prepared_by = ?',
          [mod.id, date, req.user.id]
        );
        mod.is_prepared = !!prep;
      }
    }

    res.json({ date, projects });
  } catch (err) {
    console.error('Daily summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Forward daily summary to planner-role users via SMTP ─
// Must be declared before /:id routes to avoid conflicts
router.post('/daily-summary/forward', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'projects_manager' && req.user.role !== 'planner') {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    const date = req.body.date || new Date().toISOString().slice(0, 10);

    // Fetch planner users who have email addresses
    const planners = await db.all(
      "SELECT id, full_name, email FROM users WHERE role='planner' AND is_active=1 AND email IS NOT NULL AND email != ''",
      []
    );
    if (!planners.length) {
      return res.json({ success: true, sent: 0, skipped: 0, message: 'No planner users with email addresses found' });
    }

    // Rebuild summary data (same query as GET /daily-summary)
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
        'SELECT id, module_type, status, progress, scope_of_work FROM project_modules WHERE project_id = ? ORDER BY id',
        [proj.id]
      );
      for (const mod of proj.modules) {
        mod.devices = await db.all(
          'SELECT device_model, device_qty, device_description FROM module_devices WHERE module_id = ? ORDER BY id',
          [mod.id]
        );
      }
    }

    const plannerEmails = planners.map(p => p.email);
    const { sent, skipped } = await sendDailySummaryEmail({ date, summaryData: { projects }, plannerEmails });

    res.json({ success: true, sent, skipped, total: planners.length });
  } catch (err) {
    console.error('Forward daily summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Toggle module preparation (planner/admin) ─────────────
// Must be declared before /:id routes to avoid conflicts
router.put('/modules/:moduleId/prepare', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'projects_manager' && req.user.role !== 'planner') {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    const { prepared_date, is_prepared } = req.body;
    const date = prepared_date || new Date().toISOString().slice(0, 10);
    const moduleId = req.params.moduleId;

    if (is_prepared) {
      await db.run(
        `INSERT INTO module_preparations (module_id, prepared_date, prepared_by)
         VALUES (?, ?, ?)
         ON CONFLICT (module_id, prepared_date, prepared_by) DO NOTHING`,
        [moduleId, date, req.user.id]
      );
    } else {
      await db.run(
        'DELETE FROM module_preparations WHERE module_id = ? AND prepared_date = ? AND prepared_by = ?',
        [moduleId, date, req.user.id]
      );
    }

    res.json({ success: true, is_prepared: !!is_prepared });
  } catch (err) {
    console.error('Toggle preparation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Get single project with modules ────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const project = await db.get(`
      SELECT p.*, u1.full_name as user1_name, u1.avatar_color as user1_color,
             u2.full_name as user2_name, u2.avatar_color as user2_color,
             sp.full_name as sales_person_name, sp.email as sales_person_email,
             pp.full_name as presales_person_name, pp.email as presales_person_email
      FROM projects p
      LEFT JOIN users u1 ON u1.id=p.user_id_1
      LEFT JOIN users u2 ON u2.id=p.user_id_2
      LEFT JOIN users sp ON sp.id=p.sales_person_id
      LEFT JOIN users pp ON pp.id=p.presales_person_id
      WHERE p.id=?
    `, [req.params.id]);

    if (!project) return res.status(404).json({ error: 'Project not found' });
    const isPrivileged = req.user.role === 'admin' || req.user.role === 'projects_manager';
    const isAssigned = project.user_id_1 === req.user.id || project.user_id_2 === req.user.id;
    const isCreatorOrSales = project.created_by === req.user.id || project.sales_person_id === req.user.id || project.presales_person_id === req.user.id;
    if (!isPrivileged && !isAssigned && !isCreatorOrSales) {
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

// ── Create project (admin or sales) ────────────────────
router.post('/', verifyToken, requireSalesOrAdmin, async (req, res) => {
  try {
    const {
      project_name, client_name_1, client_name_2, client_number,
      location_name, location_lat, location_lng, google_map_url,
      user_id_1, user_id_2, start_date, end_date, priority, modules,
      scheduled_date, scheduling_notes, sales_person_id, presales_person_id
    } = req.body;

    if (!project_name) return res.status(400).json({ error: 'Project name is required' });
    if (!modules || !modules.length) return res.status(400).json({ error: 'At least one module required' });

    // Normalise FK fields: JSON delivers them as strings; cast to integer (or null)
    const uid1    = user_id_1       ? (parseInt(user_id_1, 10)       || null) : null;
    const uid2    = user_id_2       ? (parseInt(user_id_2, 10)       || null) : null;
    const salesId = sales_person_id ? (parseInt(sales_person_id, 10) || null) : null;
    const presId  = presales_person_id ? (parseInt(presales_person_id, 10) || null) : null;

    const projectId = await db.transaction(async (tx) => {
      const result = await tx.run(
        `INSERT INTO projects (project_name, client_name_1, client_name_2, client_number,
          location_name, location_lat, location_lng, google_map_url, user_id_1, user_id_2,
          start_date, end_date, status, priority, created_by,
          scheduled_date, scheduling_notes, sales_person_id, presales_person_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
        [project_name, client_name_1, client_name_2, client_number,
          location_name, location_lat, location_lng, google_map_url || null, uid1, uid2,
          start_date, end_date, priority || 'normal', req.user.id,
          scheduled_date, scheduling_notes, salesId, presId]
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

      // Notify assigned technician/engineer users (in-app)
      const userIds = [uid1, uid2].filter(Boolean);
      for (const uid of userIds) {
        await tx.run(
          "INSERT INTO notifications (user_id, title, message, type, notif_key, notif_params) VALUES (?, ?, ?, 'project', ?, ?)",
          [uid, `New Project Assigned: ${project_name}`,
            `You have been assigned to project "${project_name}". Please review your tasks.`,
            'project_assigned', JSON.stringify({ project: project_name })]
        );
      }

      // Notify sales/presales persons (in-app)
      const salesIds = [salesId, presId].filter(Boolean);
      for (const uid of salesIds) {
        await tx.run(
          "INSERT INTO notifications (user_id, title, message, type, notif_key, notif_params) VALUES (?, ?, ?, 'project', ?, ?)",
          [uid, `Project Created: ${project_name}`,
            `The project "${project_name}" you are associated with has been created and assigned.`,
            'project_created', JSON.stringify({ project: project_name })]
        );
      }

      return projId;
    });

    res.json({ success: true, id: projectId, message: 'Project created successfully' });

    // Send email notifications to ALL stakeholders (non-blocking — runs after response)
    const allNotifyIds = [uid1, uid2, salesId, presId].filter(Boolean);
    if (allNotifyIds.length) {
      const notifSetting = await db.get("SELECT value FROM app_settings WHERE key='email_notifications_enabled'");
      const notifEnabled = !notifSetting || notifSetting.value !== 'false';
      if (notifEnabled) {
        const moduleList = modules.map(m => ({ module_type: m.module_type, scope_of_work: m.scope_of_work || '' }));
        for (const uid of allNotifyIds) {
          try {
            const usr = await db.get('SELECT full_name, email, role FROM users WHERE id=?', [uid]);
            if (!usr) {
              console.warn(`[Email] User id=${uid} not found — skipping assignment email`);
              continue;
            }
            if (!usr.email) {
              console.warn(`[Email] User "${usr.full_name}" (id=${uid}) has no email — skipping assignment email`);
              continue;
            }
            sendProjectAssignmentEmail({
              userEmail: usr.email,
              userName: usr.full_name,
              userRole: usr.role,
              projectName: project_name,
              clientName: client_name_1,
              scheduledDate: scheduled_date,
              schedulingNotes: scheduling_notes,
              startDate: start_date,
              endDate: end_date,
              priority,
              modules: moduleList
            }).catch(e => console.error(`[Email] Assignment email error for user id=${uid}:`, e.message));
          } catch (e) {
            console.error(`[Email] Failed to process assignment email for user id=${uid}:`, e.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Update project (admin or projects manager) ──────────
router.put('/:id', verifyToken, requireAdminOrManager, async (req, res) => {
  try {
    const existing = await db.get('SELECT * FROM projects WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const { project_name, client_name_1, client_name_2, client_number,
      location_name, location_lat, location_lng, google_map_url, user_id_1, user_id_2,
      start_date, end_date, status, priority,
      scheduled_date, scheduling_notes, sales_person_id, presales_person_id } = req.body;

    const finalUserId1      = user_id_1       ?? existing.user_id_1;
    const finalUserId2      = user_id_2       ?? existing.user_id_2;
    const finalSalesId      = sales_person_id    !== undefined ? (sales_person_id || null)    : existing.sales_person_id;
    const finalPresalesId   = presales_person_id !== undefined ? (presales_person_id || null) : existing.presales_person_id;

    await db.run(
      `UPDATE projects SET project_name=?, client_name_1=?, client_name_2=?, client_number=?,
        location_name=?, location_lat=?, location_lng=?, google_map_url=?, user_id_1=?, user_id_2=?,
        start_date=?, end_date=?, status=?, priority=?,
        scheduled_date=?, scheduling_notes=?, sales_person_id=?, presales_person_id=?,
        updated_at=NOW()
      WHERE id=?`,
      [
        project_name ?? existing.project_name,
        client_name_1 ?? existing.client_name_1,
        client_name_2 ?? existing.client_name_2,
        client_number ?? existing.client_number,
        location_name ?? existing.location_name,
        location_lat ?? existing.location_lat,
        location_lng ?? existing.location_lng,
        google_map_url !== undefined ? (google_map_url || null) : existing.google_map_url,
        finalUserId1,
        finalUserId2,
        start_date ?? existing.start_date,
        end_date ?? existing.end_date,
        status ?? existing.status,
        priority ?? existing.priority,
        scheduled_date ?? existing.scheduled_date,
        scheduling_notes ?? existing.scheduling_notes,
        finalSalesId,
        finalPresalesId,
        req.params.id
      ]
    );

    res.json({ success: true, message: 'Project updated' });

    // Email sales/presales when project is marked completed — non-blocking
    const newStatus = status ?? existing.status;
    if (newStatus === 'completed' && existing.status !== 'completed') {
      const notifSetting = await db.get("SELECT value FROM app_settings WHERE key='email_notifications_enabled'");
      const notifEnabled = !notifSetting || notifSetting.value !== 'false';
      if (notifEnabled) {
        const mods = await db.all('SELECT module_type, scope_of_work FROM project_modules WHERE project_id=?', [req.params.id]);
        const stakeholderIds = [finalSalesId, finalPresalesId].filter(Boolean).map(Number);
        for (const uid of stakeholderIds) {
          try {
            const usr = await db.get('SELECT full_name, email, role FROM users WHERE id=?', [uid]);
            if (!usr?.email) continue;
            sendProjectCompletionEmail({
              userEmail: usr.email,
              userName: usr.full_name,
              userRole: usr.role,
              projectName: project_name ?? existing.project_name,
              clientName: client_name_1 ?? existing.client_name_1,
              startDate: start_date ?? existing.start_date,
              endDate: end_date ?? existing.end_date,
              priority: priority ?? existing.priority,
              modules: mods
            }).catch(e => console.error(`[Email] Completion email error for user id=${uid}:`, e.message));
          } catch (e) {
            console.error(`[Email] Failed to process completion email for user id=${uid}:`, e.message);
          }
        }
      }
    }

    // Email newly assigned stakeholders (technicians + sales/presales) — non-blocking
    const prevTechIds    = [existing.user_id_1, existing.user_id_2].filter(Boolean).map(Number);
    const newTechIds     = [finalUserId1, finalUserId2].filter(Boolean).map(Number);
    const addedTechIds   = newTechIds.filter(id => !prevTechIds.includes(id));

    const prevSalesIds   = [existing.sales_person_id, existing.presales_person_id].filter(Boolean).map(Number);
    const newSalesIds    = [finalSalesId, finalPresalesId].filter(Boolean).map(Number);
    const addedSalesIds  = newSalesIds.filter(id => !prevSalesIds.includes(id));

    const addedIds = [...new Set([...addedTechIds, ...addedSalesIds])];

    if (addedIds.length) {
      const notifSetting = await db.get("SELECT value FROM app_settings WHERE key='email_notifications_enabled'");
      const notifEnabled = !notifSetting || notifSetting.value !== 'false';
      if (notifEnabled) {
        const pName = project_name ?? existing.project_name;
        const mods  = await db.all('SELECT module_type, scope_of_work FROM project_modules WHERE project_id=?', [req.params.id]);
        for (const uid of addedIds) {
          try {
            const usr = await db.get('SELECT full_name, email, role FROM users WHERE id=?', [uid]);
            if (!usr) {
              console.warn(`[Email] User id=${uid} not found — skipping assignment email`);
              continue;
            }
            if (!usr.email) {
              console.warn(`[Email] User "${usr.full_name}" (id=${uid}) has no email — skipping assignment email`);
              continue;
            }
            sendProjectAssignmentEmail({
              userEmail: usr.email,
              userName: usr.full_name,
              userRole: usr.role,
              projectName: pName,
              clientName: client_name_1 ?? existing.client_name_1,
              scheduledDate: scheduled_date ?? existing.scheduled_date,
              schedulingNotes: scheduling_notes ?? existing.scheduling_notes,
              startDate: start_date ?? existing.start_date,
              endDate: end_date ?? existing.end_date,
              priority: priority ?? existing.priority,
              modules: mods
            }).catch(e => console.error(`[Email] Update assignment email error for user id=${uid}:`, e.message));
          } catch (e) {
            console.error(`[Email] Failed to process update assignment email for user id=${uid}:`, e.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Assign team to project (admin or projects manager) ──
// Dedicated endpoint so sales-created projects can have technicians assigned later
router.put('/:id/assign', verifyToken, requireAdminOrManager, async (req, res) => {
  try {
    const existing = await db.get('SELECT * FROM projects WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const { user_id_1, user_id_2 } = req.body;
    const finalUserId1 = user_id_1 !== undefined ? user_id_1 : existing.user_id_1;
    const finalUserId2 = user_id_2 !== undefined ? user_id_2 : existing.user_id_2;

    await db.run(
      'UPDATE projects SET user_id_1=?, user_id_2=?, updated_at=NOW() WHERE id=?',
      [finalUserId1 || null, finalUserId2 || null, req.params.id]
    );

    // Detect newly assigned users (not previously assigned) for notifications + email
    const prevIds  = [existing.user_id_1, existing.user_id_2].filter(Boolean).map(Number);
    const newIds   = [finalUserId1, finalUserId2].filter(Boolean).map(Number);
    const addedIds = newIds.filter(id => !prevIds.includes(id));

    // In-app notifications for newly assigned users
    for (const uid of addedIds) {
      await db.run(
        "INSERT INTO notifications (user_id, title, message, type, notif_key, notif_params) VALUES (?, ?, ?, 'project', ?, ?)",
        [uid, `New Project Assigned: ${existing.project_name}`,
          `You have been assigned to project "${existing.project_name}". Please review your tasks.`,
          'project_assigned', JSON.stringify({ project: existing.project_name })]
      );
    }

    res.json({ success: true, message: 'Team assigned successfully' });

    // Send assignment emails to newly assigned users (non-blocking)
    if (addedIds.length) {
      const notifSetting = await db.get("SELECT value FROM app_settings WHERE key='email_notifications_enabled'");
      const notifEnabled = !notifSetting || notifSetting.value !== 'false';
      if (notifEnabled) {
        const mods = await db.all('SELECT module_type, scope_of_work FROM project_modules WHERE project_id=?', [req.params.id]);
        for (const uid of addedIds) {
          try {
            const usr = await db.get('SELECT full_name, email FROM users WHERE id=?', [uid]);
            if (!usr) continue;
            if (!usr.email) {
              console.warn(`[Email] User "${usr.full_name}" (id=${uid}) has no email — skipping assignment email`);
              continue;
            }
            const { sendProjectAssignmentEmail } = require('../services/email');
            sendProjectAssignmentEmail({
              userEmail: usr.email,
              userName: usr.full_name,
              projectName: existing.project_name,
              clientName: existing.client_name_1,
              startDate: existing.start_date,
              endDate: existing.end_date,
              priority: existing.priority,
              modules: mods
            }).catch(e => console.error(`[Email] Assign email error for user id=${uid}:`, e.message));
          } catch (e) {
            console.error(`[Email] Failed to process assign email for user id=${uid}:`, e.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('Assign team error:', err);
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

    if (req.user.role !== 'admin' && req.user.role !== 'projects_manager' && mod.user_id_1 !== req.user.id && mod.user_id_2 !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = {};
    if (status) updates.status = status;
    if (progress !== undefined) updates.progress = progress;
    if (user_notes !== undefined) updates.user_notes = user_notes;
    if (admin_notes !== undefined && (req.user.role === 'admin' || req.user.role === 'projects_manager')) updates.admin_notes = admin_notes;
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
        "INSERT INTO notifications (user_id, title, message, type, notif_key, notif_params) VALUES (?, ?, ?, 'report', ?, ?)",
        [admin.id, `Report Submitted: ${proj?.project_name}`,
          `${req.user.full_name} submitted a report for module #${req.params.moduleId}`,
          'report_submitted', JSON.stringify({ project: proj?.project_name, user: req.user.full_name, module: req.params.moduleId })]
      );
    }

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('Submit report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Review report (admin or projects manager) ───────────
router.put('/:projectId/modules/:moduleId/reports/:reportId', verifyToken, requireAdminOrManager, async (req, res) => {
  try {
    const { review_status, review_notes } = req.body;

    // Fetch report + submitter + project + module info before updating (for email)
    const reportInfo = await db.get(
      `SELECT mr.submitted_by, mr.id,
              u.full_name AS user_name, u.email AS user_email,
              p.project_name, pm.module_type
       FROM module_reports mr
       JOIN users u ON u.id = mr.submitted_by
       JOIN project_modules pm ON pm.id = mr.module_id
       JOIN projects p ON p.id = pm.project_id
       WHERE mr.id = ?`,
      [req.params.reportId]
    );

    await db.run(
      'UPDATE module_reports SET review_status=?, review_notes=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?',
      [review_status, review_notes, req.user.id, req.params.reportId]
    );

    // Notify the report submitter by email (non-blocking)
    if (reportInfo?.user_email && (review_status === 'approved' || review_status === 'needs_revision')) {
      sendReportReviewEmail({
        userEmail: reportInfo.user_email,
        userName: reportInfo.user_name,
        projectName: reportInfo.project_name,
        moduleName: reportInfo.module_type,
        reviewStatus: review_status,
        reviewNotes: review_notes || ''
      }).catch(e => console.error('[Email] Report review email error:', e.message));
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Review report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Reopen a ticket (module) — admin only ───────────────
// Creates a new work cycle: resets status/checklist, keeps history, notifies team
router.post('/:projectId/modules/:moduleId/reopen', verifyToken, requireAdminOrManager, async (req, res) => {
  try {
    const { reason, new_user_id_1, new_user_id_2 } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A reopen reason is required' });
    }

    const mod = await db.get(
      `SELECT pm.*, p.project_name, p.status as project_status,
              p.user_id_1, p.user_id_2
       FROM project_modules pm JOIN projects p ON p.id = pm.project_id
       WHERE pm.id = ?`,
      [req.params.moduleId]
    );
    if (!mod) return res.status(404).json({ error: 'Module not found' });

    await db.transaction(async (tx) => {
      // 1. Reset module to pending and record reopen metadata
      await tx.run(
        `UPDATE project_modules SET
          status        = 'pending',
          progress      = 0,
          completed_at  = NULL,
          reopen_reason = ?,
          last_reopened_at = NOW(),
          last_reopened_by = ?,
          reopened_count = COALESCE(reopened_count, 0) + 1,
          updated_at    = NOW()
         WHERE id = ?`,
        [reason.trim(), req.user.id, req.params.moduleId]
      );

      // 2. Reset all checklist items so the technician starts fresh
      await tx.run(
        `UPDATE module_checklist
         SET is_completed = 0, completed_by = NULL, completed_at = NULL
         WHERE module_id = ?`,
        [req.params.moduleId]
      );

      // 3. If the project itself was completed/cancelled, reactivate it
      if (mod.project_status === 'completed' || mod.project_status === 'cancelled') {
        await tx.run(
          `UPDATE projects SET status = 'in_progress', updated_at = NOW() WHERE id = ?`,
          [req.params.projectId]
        );
      }

      // 4. Optional reassignment
      const userId1 = new_user_id_1 !== undefined ? (new_user_id_1 || null) : mod.user_id_1;
      const userId2 = new_user_id_2 !== undefined ? (new_user_id_2 || null) : mod.user_id_2;
      if (new_user_id_1 !== undefined || new_user_id_2 !== undefined) {
        await tx.run(
          'UPDATE projects SET user_id_1 = ?, user_id_2 = ?, updated_at = NOW() WHERE id = ?',
          [userId1, userId2, req.params.projectId]
        );
      }

      // 5. Notify assigned technicians
      const notifyIds = [...new Set([userId1, userId2].filter(Boolean))];
      for (const uid of notifyIds) {
        await tx.run(
          "INSERT INTO notifications (user_id, title, message, type, notif_key, notif_params) VALUES (?, ?, ?, 'project', ?, ?)",
          [
            uid,
            `Ticket Reopened: ${mod.project_name}`,
            `Module "${mod.module_type}" has been reopened. Client reason: ${reason.trim()}`,
            'ticket_reopened',
            JSON.stringify({ project: mod.project_name, module: mod.module_type, reason: reason.trim() })
          ]
        );
      }
    });

    res.json({ success: true, message: 'Ticket reopened successfully' });
  } catch (err) {
    console.error('Reopen ticket error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Excel upload & parsing ──────────────────────────────
router.post('/excel-parse', verifyToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });

    // Helper regexes — shared across all sheets
    const MODEL_RE = /model|device|item|product|equipment|part|unit|name|description/i;
    const QTY_RE   = /qty|quantity|count|pcs|pieces|no\.|number|amount/i;
    const DESC_RE  = /desc|description|spec|detail|remark|note|type/i;
    const SN_RE    = /serial|sn|s\/n|barcode/i;
    const SCOPE_RE = /scope|work|task|activity|service/i;

    // Parse a single sheet, return { devices, scopeLines, rawRowCount, headerRowIdx, headers }
    function parseSheet(sheet) {
      const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!rawRows.length) return { devices: [], scopeLines: [], rawRowCount: 0, headerRowIdx: 0, headers: [] };

      // Find the first row that looks like a header
      let headerRowIdx = 0;
      for (let i = 0; i < Math.min(10, rawRows.length); i++) {
        const row = rawRows[i].map(c => String(c));
        if (row.some(c => MODEL_RE.test(c)) || row.some(c => QTY_RE.test(c))) {
          headerRowIdx = i;
          break;
        }
      }

      const headers = rawRows[headerRowIdx].map(c => String(c));
      const modelIdx = headers.findIndex(h => MODEL_RE.test(h));
      const qtyIdx   = headers.findIndex(h => QTY_RE.test(h));
      const descIdx  = headers.findIndex(h => DESC_RE.test(h) && !MODEL_RE.test(h));
      const snIdx    = headers.findIndex(h => SN_RE.test(h));
      const scopeIdx = headers.findIndex(h => SCOPE_RE.test(h));

      const devices = [];
      const scopeLines = [];

      const dataRows = rawRows.slice(headerRowIdx + 1);
      for (const row of dataRows) {
        if (row.every(c => c === '' || c == null)) continue;

        const modelVal = modelIdx >= 0 ? String(row[modelIdx] ?? '').trim() : '';
        if (modelVal && modelVal !== 'undefined') {
          const qty = Number(qtyIdx >= 0 ? row[qtyIdx] : '') || 1;
          const desc = descIdx >= 0 ? String(row[descIdx] ?? '').trim() : '';
          const serial = snIdx >= 0 ? String(row[snIdx] ?? '').trim() : '';
          devices.push({ model: modelVal, qty, description: desc, serial });
        }

        if (scopeIdx >= 0) {
          const scopeVal = String(row[scopeIdx] ?? '').trim();
          if (scopeVal && scopeVal !== 'undefined') scopeLines.push(scopeVal);
        }
      }

      // Fallback: key-value JSON parse if header strategy found nothing
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

      return { devices, scopeLines, rawRowCount: rawRows.length, headerRowIdx, headers, modelIdx, qtyIdx, descIdx, snIdx };
    }

    // ── Iterate ALL sheets and combine results ───────────
    const allDevices = [];
    const allScopeLines = [];
    let totalRawRows = 0;
    let firstSheetResult = null;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const result = parseSheet(sheet);
      if (!firstSheetResult) firstSheetResult = { ...result, sheetName };
      allDevices.push(...result.devices);
      allScopeLines.push(...result.scopeLines);
      totalRawRows += result.rawRowCount;
    }

    const ref = firstSheetResult || { headers: [], modelIdx: -1, qtyIdx: -1, descIdx: -1, snIdx: -1, headerRowIdx: 0 };

    res.json({
      success: true,
      devices: allDevices,
      scope_of_work: allScopeLines.join('\n'),
      sheets_parsed: workbook.SheetNames.length,
      sheet_names: workbook.SheetNames,
      raw_rows: totalRawRows,
      header_row: ref.headerRowIdx,
      columns_detected: {
        model: ref.headers[ref.modelIdx] || null,
        qty: ref.headers[ref.qtyIdx] || null,
        desc: ref.headers[ref.descIdx] || null,
        serial: ref.headers[ref.snIdx] || null
      },
      file_name: req.file.originalname
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse Excel file: ' + err.message });
  }
});

// ── All reports (admin or projects manager) ─────────────
router.get('/reports/all', verifyToken, requireAdminOrManager, async (req, res) => {
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

// POST /api/projects/:id/quotation-devices — Add devices from quotation to existing project
router.post('/:id/quotation-devices', verifyToken, requireSalesOrAdmin, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const { quotation_devices } = req.body;
  if (!Array.isArray(quotation_devices) || !quotation_devices.length) {
    return res.status(400).json({ error: 'quotation_devices array is required' });
  }
  try {
    const project = await db.get('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Find or create an "Installation and Wiring" module
    let module = await db.get(
      "SELECT id FROM project_modules WHERE project_id = $1 AND module_type = 'Installation and Wiring' LIMIT 1",
      [projectId]
    );
    if (!module) {
      const m = await db.run(
        `INSERT INTO project_modules (project_id, module_type, scope_of_work, status) VALUES ($1, $2, $3, 'pending')`,
        [projectId, 'Installation and Wiring', 'Devices from quotation']
      );
      module = { id: m.lastInsertRowid };
    }
    for (const d of quotation_devices) {
      await db.run(
        `INSERT INTO module_devices (module_id, device_model, device_qty, device_description, added_by) VALUES ($1, $2, $3, $4, $5)`,
        [module.id, d.model || '', d.qty || 1, d.description || '', req.user.id]
      );
    }
    res.json({ success: true, module_id: module.id, devices_added: quotation_devices.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
