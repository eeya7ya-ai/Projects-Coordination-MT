const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { verifyToken, requireAdmin, requireAdminOrManager } = require('../middleware/auth');
const { sendMail, clearAdminNameCache } = require('../services/email');

const router = express.Router();
// All admin routes require at minimum a valid token; individual routes enforce stricter roles
router.use(verifyToken);

// ── Admin self-profile update ───────────────────────────
router.put('/profile', requireAdmin, async (req, res) => {
  try {
    const { full_name, department, phone, email, avatar_color } = req.body;
    const existing = await db.get('SELECT id FROM users WHERE id = ? AND role = ?', [req.user.id, 'admin']);
    if (!existing) return res.status(404).json({ error: 'Admin profile not found. Please log out and log back in.' });
    await db.run(
      `UPDATE users SET full_name=?, department=?, phone=?, email=?, avatar_color=?
       WHERE id = ? AND role = 'admin'`,
      [full_name, department, phone, email, avatar_color || '#8B0000', req.user.id]
    );
    clearAdminNameCache(); // Ensure next email picks up the updated display name
    res.json({ success: true, message: 'Profile saved successfully' });
  } catch (err) {
    console.error('Save admin profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Users ──────────────────────────────────────────────
router.get('/users', requireAdminOrManager, async (req, res) => {
  try {
    const users = await db.all(`
      SELECT u.id, u.username, u.full_name, u.role, u.department, u.phone, u.email,
             u.avatar_color, u.is_active, u.created_at, u.last_login,
             (SELECT COUNT(*) FROM projects WHERE user_id_1 = u.id OR user_id_2 = u.id) AS total_projects,
             (SELECT COUNT(*) FROM projects WHERE (user_id_1 = u.id OR user_id_2 = u.id) AND status='completed') AS completed_projects
      FROM users u
      WHERE u.role NOT IN ('admin') AND u.is_active = 1
      ORDER BY u.created_at DESC
    `);
    res.json(users);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { username, password, full_name, role, department, phone, email, avatar_color } = req.body;
    if (!username || !password || !full_name) {
      return res.status(400).json({ error: 'Username, password, and full name are required' });
    }
    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) return res.status(400).json({ error: 'Username already exists' });

    const allowedRoles = ['user', 'technical', 'engineer', 'sales', 'presales', 'planner', 'projects_manager'];
    const assignedRole = allowedRoles.includes(role) ? role : 'technical';

    const hashed = bcrypt.hashSync(password, 10);
    const colors = ['#c0392b', '#e74c3c', '#8B0000', '#922B21', '#CB4335', '#A93226'];
    const color = avatar_color || colors[Math.floor(Math.random() * colors.length)];

    const result = await db.run(
      `INSERT INTO users (username, password, full_name, role, department, phone, email, avatar_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, hashed, full_name, assignedRole, department, phone, email, color]
    );

    res.json({ success: true, id: result.lastInsertRowid, message: 'User created successfully' });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { full_name, role, department, phone, email, avatar_color, is_active, password } = req.body;
    const user = await db.get('SELECT id FROM users WHERE id = ? AND role != ?', [req.params.id, 'admin']);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (password) {
      const hashed = bcrypt.hashSync(password, 10);
      await db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.params.id]);
    }

    const allowedRoles = ['user', 'technical', 'engineer', 'sales', 'presales', 'planner', 'projects_manager'];
    const assignedRole = role && allowedRoles.includes(role) ? role : undefined;

    const roleClause = assignedRole ? ', role=?' : '';
    const vals = [full_name, department, phone, email, avatar_color, is_active ?? 1];
    if (assignedRole) vals.push(assignedRole);
    vals.push(req.params.id);

    await db.run(
      `UPDATE users SET full_name=?, department=?, phone=?, email=?, avatar_color=?, is_active=?${roleClause}
       WHERE id = ?`,
      vals
    );

    res.json({ success: true, message: 'User updated successfully' });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const user = await db.get('SELECT id FROM users WHERE id = ? AND role != ?', [req.params.id, 'admin']);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await db.run('UPDATE users SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Analytics ──────────────────────────────────────────
router.get('/analytics', requireAdminOrManager, async (req, res) => {
  try {
    const stats = {
      total_projects: (await db.get("SELECT COUNT(*) as c FROM projects")).c,
      active_projects: (await db.get("SELECT COUNT(*) as c FROM projects WHERE status NOT IN ('completed','cancelled')")).c,
      completed_projects: (await db.get("SELECT COUNT(*) as c FROM projects WHERE status='completed'")).c,
      total_users: (await db.get("SELECT COUNT(*) as c FROM users WHERE role != 'admin' AND is_active=1")).c,
      pending_reports: (await db.get("SELECT COUNT(*) as c FROM module_reports WHERE review_status='pending'")).c,
      total_modules: (await db.get("SELECT COUNT(*) as c FROM project_modules")).c
    };

    const user_achievements = await db.all(`
      SELECT u.id, u.full_name, u.avatar_color, u.department,
        COUNT(DISTINCT pm.id) AS total_modules,
        SUM(CASE WHEN pm.status='completed' THEN 1 ELSE 0 END) AS completed_modules,
        SUM(CASE WHEN pm.status='in_progress' THEN 1 ELSE 0 END) AS active_modules,
        COUNT(DISTINCT mr.id) AS total_reports,
        AVG(pm.progress) AS avg_progress
      FROM users u
      LEFT JOIN projects p ON p.user_id_1=u.id OR p.user_id_2=u.id
      LEFT JOIN project_modules pm ON pm.project_id=p.id
      LEFT JOIN module_reports mr ON mr.submitted_by=u.id
      WHERE u.role='user' AND u.is_active=1
      GROUP BY u.id, u.full_name, u.avatar_color, u.department
      ORDER BY completed_modules DESC
    `);

    const module_breakdown = await db.all(`
      SELECT module_type,
        COUNT(*) as total,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
        AVG(progress) as avg_progress
      FROM project_modules
      GROUP BY module_type
    `);

    const recent_projects = await db.all(`
      SELECT p.id, p.project_name, p.status, p.start_date, p.end_date, p.priority,
        u1.full_name as user1_name, u2.full_name as user2_name,
        p.client_name_1, p.created_at
      FROM projects p
      LEFT JOIN users u1 ON u1.id=p.user_id_1
      LEFT JOIN users u2 ON u2.id=p.user_id_2
      ORDER BY p.created_at DESC LIMIT 10
    `);

    const project_timeline = await db.all(`
      SELECT TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as created,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
      FROM projects
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY TO_CHAR(created_at, 'YYYY-MM') DESC LIMIT 12
    `);

    res.json({ stats, user_achievements, module_breakdown, recent_projects, project_timeline });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Email Settings ──────────────────────────────────────
router.get('/email-settings', requireAdmin, async (req, res) => {
  try {
    const rows = await db.all("SELECT key, value FROM app_settings WHERE key LIKE 'email_%'");
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });

    // Pull sender identity from the admin user account
    const admin = await db.get(
      "SELECT full_name, email FROM users WHERE role = 'admin' LIMIT 1"
    );
    settings.admin_full_name = admin?.full_name || '';
    settings.admin_email     = admin?.email     || '';

    // Expose whether SMTP credentials are configured (never reveal the password)
    settings.smtp_configured = !!(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
    // Keep legacy key for UI compatibility
    settings.gmail_configured = settings.smtp_configured;
    res.json(settings);
  } catch (err) {
    console.error('Get email settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/email-settings', requireAdmin, async (req, res) => {
  try {
    // Only email_notifications_enabled is user-controlled.
    // Sender name/address come from the admin profile, not this form.
    if (req.body.email_notifications_enabled !== undefined) {
      // app_settings has key TEXT PRIMARY KEY (no id column) — must include RETURNING key
      // so db.run() does not append "RETURNING id" and cause a column-not-found error.
      await db.run(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
         RETURNING key`,
        ['email_notifications_enabled', String(req.body.email_notifications_enabled)]
      );
    }
    res.json({ success: true, message: 'Email settings saved' });
  } catch (err) {
    console.error('Save email settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/email-settings/test', requireAdmin, async (req, res) => {
  try {
    const { test_email } = req.body;
    if (!test_email) return res.status(400).json({ error: 'test_email is required' });

    const ok = await sendMail({
      to: test_email,
      subject: '[ELV] Email Configuration Test',
      html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:32px;">
        <h2 style="color:#C0392B;">Email Test Successful</h2>
        <p>Your Gmail SMTP configuration is working correctly.</p>
        <p style="color:#888;font-size:13px;">Sent from ELV Project Coordinator — <span style="color:#C0392B;font-weight:700;">eSpark</span> Developers</p>
      </body></html>`
    });

    if (ok) {
      res.json({ success: true, message: `Test email sent to ${test_email}` });
    } else {
      res.status(500).json({ error: 'Failed to send test email. Check SMTP_HOST, SMTP_USER, and SMTP_PASSWORD environment variables.' });
    }
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
