const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

// On Vercel, /tmp is the only writable location. Each cold start gets a fresh /tmp,
// so initializeDB() seeds demo data automatically on every cold start to ensure
// the app always has users and projects to show.
const DB_PATH = process.env.VERCEL
  ? '/tmp/elv_coordinator.db'
  : path.join(__dirname, 'elv_coordinator.db');

const db = new Database(DB_PATH);

// Enable WAL mode for performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      department TEXT,
      phone TEXT,
      email TEXT,
      avatar_color TEXT DEFAULT '#c0392b',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      client_name_1 TEXT,
      client_name_2 TEXT,
      client_number TEXT,
      location_name TEXT,
      location_lat REAL,
      location_lng REAL,
      user_id_1 INTEGER REFERENCES users(id),
      user_id_2 INTEGER REFERENCES users(id),
      start_date TEXT,
      end_date TEXT,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'normal',
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      module_type TEXT NOT NULL,
      scope_of_work TEXT,
      issue_details TEXT,
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      started_at DATETIME,
      completed_at DATETIME,
      user_notes TEXT,
      admin_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS module_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL REFERENCES project_modules(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      file_name TEXT,
      file_path TEXT,
      content TEXT,
      uploaded_by INTEGER REFERENCES users(id),
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS module_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL REFERENCES project_modules(id) ON DELETE CASCADE,
      device_model TEXT,
      device_qty INTEGER DEFAULT 1,
      device_description TEXT,
      serial_number TEXT,
      added_by INTEGER REFERENCES users(id),
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS module_checklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL REFERENCES project_modules(id) ON DELETE CASCADE,
      task_title TEXT NOT NULL,
      task_description TEXT,
      is_completed INTEGER DEFAULT 0,
      completed_by INTEGER REFERENCES users(id),
      completed_at DATETIME,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS module_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL REFERENCES project_modules(id) ON DELETE CASCADE,
      submitted_by INTEGER NOT NULL REFERENCES users(id),
      report_text TEXT,
      work_done TEXT,
      issues_found TEXT,
      next_steps TEXT,
      hours_spent REAL,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_by INTEGER REFERENCES users(id),
      review_status TEXT DEFAULT 'pending',
      review_notes TEXT,
      reviewed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      message TEXT,
      type TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ── Admin user ────────────────────────────────────────
  const adminExists = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin');
  let adminId;
  if (!adminExists) {
    const hashedPw = bcrypt.hashSync('admin123', 10);
    const res = db.prepare(`
      INSERT INTO users (username, password, full_name, role, avatar_color)
      VALUES (?, ?, ?, ?, ?)
    `).run('admin', hashedPw, 'System Administrator', 'admin', '#8B0000');
    adminId = res.lastInsertRowid;
    console.log('Default admin created: username=admin, password=admin123');
  } else {
    adminId = adminExists.id;
  }

  // ── Seed demo team members if none exist ─────────────
  const userCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'user'").get().c;
  if (userCount === 0) {
    const pw = bcrypt.hashSync('user123', 10);
    const u1 = db.prepare(`
      INSERT INTO users (username, password, full_name, role, department, phone, email, avatar_color)
      VALUES (?, ?, ?, 'user', ?, ?, ?, ?)
    `).run('ahmed', pw, 'Ahmed Al-Rashid', 'ELV Engineering', '+962 79 123 4567', 'ahmed@elv.jo', '#c0392b');
    const u2 = db.prepare(`
      INSERT INTO users (username, password, full_name, role, department, phone, email, avatar_color)
      VALUES (?, ?, ?, 'user', ?, ?, ?, ?)
    `).run('sara', bcrypt.hashSync('user123', 10), 'Sara Khalil', 'Technical Operations',
      '+962 77 987 6543', 'sara@elv.jo', '#8B0000');

    console.log('Demo users seeded. ahmed / user123  |  sara / user123');

    // Seed demo projects if none exist
    const projCount = db.prepare('SELECT COUNT(*) as c FROM projects').get().c;
    if (projCount === 0) {
      seedDemoProjects(adminId, u1.lastInsertRowid, u2.lastInsertRowid);
    }
  }

  // ── Module checklists reference (used in projects.js) ─
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

  db.MODULE_CHECKLISTS = MODULE_CHECKLISTS;
  console.log('Database initialized successfully.');
}

function seedDemoProjects(adminId, userId1, userId2) {
  const checklists = {
    'Installation and Wiring': [
      'Review installation drawings', 'Prepare materials and tools',
      'Cable routing and labeling', 'Equipment mounting and installation',
      'Wiring and terminations', 'Quality check on all connections', 'Initial power-up test'
    ],
    'Site Survey': [
      'Review existing drawings/plans', 'Photograph site conditions',
      'Measure and document dimensions', 'Identify cable routes',
      'Note power availability', 'Document survey findings', 'Prepare survey report'
    ]
  };

  // Project 1: CCTV Installation – In Progress
  const p1 = db.prepare(`
    INSERT INTO projects (project_name, client_name_1, client_number, location_name,
      location_lat, location_lng, user_id_1, user_id_2, start_date, end_date,
      status, priority, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'CCTV Installation – Amman Tower', 'Jordan Properties Group',
    '+962 6 555 0101', 'Queen Rania Al-Abdullah St, Amman',
    31.9730, 35.8986, userId1, userId2,
    '2026-02-01', '2026-03-15', 'in_progress', 'high', adminId
  );

  const mod1 = db.prepare(`
    INSERT INTO project_modules (project_id, module_type, scope_of_work, status, progress)
    VALUES (?, ?, ?, ?, ?)
  `).run(p1.lastInsertRowid, 'Installation and Wiring',
    'Install 24 IP cameras across all floors, run Cat6 cables to NVR room, configure recording system',
    'in_progress', 57);

  checklists['Installation and Wiring'].forEach((task, idx) => {
    db.prepare('INSERT INTO module_checklist (module_id, task_title, is_completed, sort_order) VALUES (?, ?, ?, ?)')
      .run(mod1.lastInsertRowid, task, idx < 4 ? 1 : 0, idx);
  });

  db.prepare('INSERT INTO module_devices (module_id, device_model, device_qty, device_description, added_by) VALUES (?, ?, ?, ?, ?)')
    .run(mod1.lastInsertRowid, 'Hikvision DS-2CD2143G2-I', 24, '4MP AcuSense Fixed Dome Camera', adminId);
  db.prepare('INSERT INTO module_devices (module_id, device_model, device_qty, device_description, added_by) VALUES (?, ?, ?, ?, ?)')
    .run(mod1.lastInsertRowid, 'Hikvision DS-7732NI-K4', 1, '32-Channel NVR', adminId);

  // Project 2: Fire Alarm System – Pending
  const p2 = db.prepare(`
    INSERT INTO projects (project_name, client_name_1, client_number, location_name,
      location_lat, location_lng, user_id_1, start_date, end_date, status, priority, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Fire Alarm System – Zarqa Mall', 'Al-Zarqa Commercial Co.',
    '+962 5 388 7700', 'Prince Hassan St, Zarqa',
    32.0714, 36.0881, userId2,
    '2026-03-01', '2026-04-30', 'pending', 'urgent', adminId
  );

  const mod2 = db.prepare(`
    INSERT INTO project_modules (project_id, module_type, scope_of_work, status, progress)
    VALUES (?, ?, ?, ?, ?)
  `).run(p2.lastInsertRowid, 'Site Survey',
    'Survey entire mall for fire alarm zones, detector placement, and cable routes',
    'pending', 0);

  checklists['Site Survey'].forEach((task, idx) => {
    db.prepare('INSERT INTO module_checklist (module_id, task_title, is_completed, sort_order) VALUES (?, ?, ?, ?)')
      .run(mod2.lastInsertRowid, task, 0, idx);
  });

  // Notifications for assigned users
  db.prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'project')")
    .run(userId1, 'New Project: CCTV Installation – Amman Tower',
      'You have been assigned as primary engineer. Installation in progress.');
  db.prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'project')")
    .run(userId2, 'New Project: CCTV Installation – Amman Tower',
      'You have been assigned as secondary engineer.');
  db.prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'project')")
    .run(userId2, 'New Project: Fire Alarm System – Zarqa Mall',
      'You have been assigned as primary engineer. Start with site survey.');

  console.log('Demo projects seeded: CCTV Installation (in_progress) | Fire Alarm (pending)');
}

initializeDB();

module.exports = db;
