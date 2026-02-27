const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'elv_coordinator.db');
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

  // Create default admin if not exists
  const adminExists = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin');
  if (!adminExists) {
    const hashedPw = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password, full_name, role, avatar_color)
      VALUES (?, ?, ?, ?, ?)
    `).run('admin', hashedPw, 'System Administrator', 'admin', '#8B0000');
    console.log('Default admin created: username=admin, password=admin123');
  }

  // Seed default checklists per module type
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

  // Store these globally for seeding new modules
  db.MODULE_CHECKLISTS = MODULE_CHECKLISTS;

  console.log('Database initialized successfully.');
}

initializeDB();

module.exports = db;
