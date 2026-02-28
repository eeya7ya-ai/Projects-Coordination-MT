const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, requireAdmin);

// ── Users ──────────────────────────────────────────────
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role, u.department, u.phone, u.email,
           u.avatar_color, u.is_active, u.created_at, u.last_login,
           (SELECT COUNT(*) FROM projects WHERE user_id_1 = u.id OR user_id_2 = u.id) AS total_projects,
           (SELECT COUNT(*) FROM projects WHERE (user_id_1 = u.id OR user_id_2 = u.id) AND status='completed') AS completed_projects
    FROM users u
    WHERE u.role != 'admin' AND u.is_active = 1
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

router.post('/users', (req, res) => {
  const { username, password, full_name, department, phone, email, avatar_color } = req.body;
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'Username, password, and full name are required' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(400).json({ error: 'Username already exists' });

  const hashed = bcrypt.hashSync(password, 10);
  const colors = ['#c0392b', '#e74c3c', '#8B0000', '#922B21', '#CB4335', '#A93226'];
  const color = avatar_color || colors[Math.floor(Math.random() * colors.length)];

  const result = db.prepare(`
    INSERT INTO users (username, password, full_name, role, department, phone, email, avatar_color)
    VALUES (?, ?, ?, 'user', ?, ?, ?, ?)
  `).run(username, hashed, full_name, department, phone, email, color);

  res.json({ success: true, id: result.lastInsertRowid, message: 'User created successfully' });
});

router.put('/users/:id', (req, res) => {
  const { full_name, department, phone, email, avatar_color, is_active, password } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE id = ? AND role != ?').get(req.params.id, 'admin');
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (password) {
    const hashed = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.params.id);
  }

  db.prepare(`
    UPDATE users SET full_name=?, department=?, phone=?, email=?, avatar_color=?, is_active=?, updated_at=CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(full_name, department, phone, email, avatar_color, is_active ?? 1, req.params.id);

  res.json({ success: true, message: 'User updated successfully' });
});

router.delete('/users/:id', (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ? AND role != ?').get(req.params.id, 'admin');
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'User deactivated' });
});

// ── Analytics ──────────────────────────────────────────
router.get('/analytics', (req, res) => {
  const stats = {
    total_projects: db.prepare("SELECT COUNT(*) as c FROM projects").get().c,
    active_projects: db.prepare("SELECT COUNT(*) as c FROM projects WHERE status NOT IN ('completed','cancelled')").get().c,
    completed_projects: db.prepare("SELECT COUNT(*) as c FROM projects WHERE status='completed'").get().c,
    total_users: db.prepare("SELECT COUNT(*) as c FROM users WHERE role='user' AND is_active=1").get().c,
    pending_reports: db.prepare("SELECT COUNT(*) as c FROM module_reports WHERE review_status='pending'").get().c,
    total_modules: db.prepare("SELECT COUNT(*) as c FROM project_modules").get().c
  };

  const user_achievements = db.prepare(`
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
    GROUP BY u.id
    ORDER BY completed_modules DESC
  `).all();

  const module_breakdown = db.prepare(`
    SELECT module_type,
      COUNT(*) as total,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
      AVG(progress) as avg_progress
    FROM project_modules
    GROUP BY module_type
  `).all();

  const recent_projects = db.prepare(`
    SELECT p.id, p.project_name, p.status, p.start_date, p.end_date, p.priority,
      u1.full_name as user1_name, u2.full_name as user2_name,
      p.client_name_1, p.created_at
    FROM projects p
    LEFT JOIN users u1 ON u1.id=p.user_id_1
    LEFT JOIN users u2 ON u2.id=p.user_id_2
    ORDER BY p.created_at DESC LIMIT 10
  `).all();

  const project_timeline = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month,
      COUNT(*) as created,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
    FROM projects
    GROUP BY month
    ORDER BY month DESC LIMIT 12
  `).all();

  res.json({ stats, user_achievements, module_breakdown, recent_projects, project_timeline });
});

module.exports = router;
