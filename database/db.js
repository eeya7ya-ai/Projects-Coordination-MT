const { Pool, neonConfig, types } = require('@neondatabase/serverless');
const ws = require('ws');
const bcrypt = require('bcryptjs');

// Enable WebSocket support for Neon in Node.js environments
neonConfig.webSocketConstructor = ws;

// Parse COUNT/BIGINT (type 20) as JavaScript numbers instead of strings
types.setTypeParser(20, val => parseInt(val, 10));

// ── PostgreSQL connection (Neon) ───────────────────────
// Set DATABASE_URL in your .env file with your Neon connection string
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required. Set it to your Neon connection string.');
}

const pool = new Pool({
  connectionString,
  ssl: true,
  max: 3,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 10000
});

// Convert SQLite-style ? placeholders to PostgreSQL $1, $2, ...
function pgify(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const db = {
  async get(sql, params = []) {
    const { rows } = await pool.query(pgify(sql), params);
    return rows[0] || null;
  },

  async all(sql, params = []) {
    const { rows } = await pool.query(pgify(sql), params);
    return rows;
  },

  async run(sql, params = []) {
    const pgSql = pgify(sql);
    const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
    const finalSql = isInsert && !pgSql.toUpperCase().includes('RETURNING')
      ? pgSql + ' RETURNING id'
      : pgSql;
    const result = await pool.query(finalSql, params);
    return {
      lastInsertRowid: result.rows[0]?.id,
      changes: result.rowCount
    };
  },

  async exec(sql) {
    await pool.query(sql);
  },

  async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tx = {
        async get(sql, params = []) {
          const { rows } = await client.query(pgify(sql), params);
          return rows[0] || null;
        },
        async all(sql, params = []) {
          const { rows } = await client.query(pgify(sql), params);
          return rows;
        },
        async run(sql, params = []) {
          const pgSql = pgify(sql);
          const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
          const finalSql = isInsert && !pgSql.toUpperCase().includes('RETURNING')
            ? pgSql + ' RETURNING id'
            : pgSql;
          const result = await client.query(finalSql, params);
          return { lastInsertRowid: result.rows[0]?.id, changes: result.rowCount };
        }
      };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
};

// ── Schema & seeding ────────────────────────────────────
async function initializeDB() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      department TEXT,
      phone TEXT,
      email TEXT,
      avatar_color TEXT DEFAULT '#c0392b',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      last_login TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
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
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS project_modules (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      module_type TEXT NOT NULL,
      scope_of_work TEXT,
      issue_details TEXT,
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      user_notes TEXT,
      admin_notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS module_documents (
      id SERIAL PRIMARY KEY,
      module_id INTEGER NOT NULL REFERENCES project_modules(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      file_name TEXT,
      file_path TEXT,
      content TEXT,
      uploaded_by INTEGER REFERENCES users(id),
      uploaded_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS module_devices (
      id SERIAL PRIMARY KEY,
      module_id INTEGER NOT NULL REFERENCES project_modules(id) ON DELETE CASCADE,
      device_model TEXT,
      device_qty INTEGER DEFAULT 1,
      device_description TEXT,
      serial_number TEXT,
      added_by INTEGER REFERENCES users(id),
      added_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS module_checklist (
      id SERIAL PRIMARY KEY,
      module_id INTEGER NOT NULL REFERENCES project_modules(id) ON DELETE CASCADE,
      task_title TEXT NOT NULL,
      task_description TEXT,
      is_completed INTEGER DEFAULT 0,
      completed_by INTEGER REFERENCES users(id),
      completed_at TIMESTAMP,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS module_reports (
      id SERIAL PRIMARY KEY,
      module_id INTEGER NOT NULL REFERENCES project_modules(id) ON DELETE CASCADE,
      submitted_by INTEGER NOT NULL REFERENCES users(id),
      report_text TEXT,
      work_done TEXT,
      issues_found TEXT,
      next_steps TEXT,
      hours_spent REAL,
      submitted_at TIMESTAMP DEFAULT NOW(),
      reviewed_by INTEGER REFERENCES users(id),
      review_status TEXT DEFAULT 'pending',
      review_notes TEXT,
      reviewed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      message TEXT,
      type TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS module_preparations (
      id SERIAL PRIMARY KEY,
      module_id INTEGER NOT NULL REFERENCES project_modules(id) ON DELETE CASCADE,
      prepared_date TEXT NOT NULL,
      prepared_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(module_id, prepared_date, prepared_by)
    );
  `);

  // ── Schema migrations (add new columns if missing) ───
  await db.exec(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS scheduled_date TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS scheduling_notes TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS sales_person_id INTEGER REFERENCES users(id);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS presales_person_id INTEGER REFERENCES users(id);
    ALTER TABLE project_modules ADD COLUMN IF NOT EXISTS reopened_count INTEGER DEFAULT 0;
    ALTER TABLE project_modules ADD COLUMN IF NOT EXISTS reopen_reason TEXT;
    ALTER TABLE project_modules ADD COLUMN IF NOT EXISTS last_reopened_at TIMESTAMP;
    ALTER TABLE project_modules ADD COLUMN IF NOT EXISTS last_reopened_by INTEGER REFERENCES users(id);
  `);

  // ── Admin user ────────────────────────────────────────
  const adminExists = await db.get("SELECT id FROM users WHERE role = $1 LIMIT 1", ['admin']);
  let adminId;
  if (!adminExists) {
    const hashedPw = bcrypt.hashSync('admin123', 10);
    const res = await db.run(
      "INSERT INTO users (username, password, full_name, role, avatar_color) VALUES ($1, $2, $3, $4, $5)",
      ['admin', hashedPw, 'System Administrator', 'admin', '#8B0000']
    );
    adminId = res.lastInsertRowid;
    console.log('Default admin created: username=admin, password=admin123');
  } else {
    adminId = adminExists.id;
  }

  // ── Seed demo team members if none exist ─────────────
  const userCount = await db.get("SELECT COUNT(*) as c FROM users WHERE role = 'user'");
  if (userCount.c === 0 || Number(userCount.c) === 0) {
    const pw = bcrypt.hashSync('user123', 10);
    const u1 = await db.run(
      "INSERT INTO users (username, password, full_name, role, department, phone, email, avatar_color) VALUES ($1, $2, $3, 'user', $4, $5, $6, $7)",
      ['ahmed', pw, 'Ahmed Al-Rashid', 'ELV Engineering', '+962 79 123 4567', 'ahmed@elv.jo', '#c0392b']
    );
    const u2 = await db.run(
      "INSERT INTO users (username, password, full_name, role, department, phone, email, avatar_color) VALUES ($1, $2, $3, 'user', $4, $5, $6, $7)",
      ['sara', bcrypt.hashSync('user123', 10), 'Sara Khalil', 'Technical Operations',
        '+962 77 987 6543', 'sara@elv.jo', '#8B0000']
    );
    console.log('Demo users seeded. ahmed / user123  |  sara / user123');

    // Seed demo projects if none exist
    const projCount = await db.get('SELECT COUNT(*) as c FROM projects');
    if (projCount.c === 0 || Number(projCount.c) === 0) {
      await seedDemoProjects(adminId, u1.lastInsertRowid, u2.lastInsertRowid);
    }
  }

  console.log('Database initialized successfully.');
}

async function seedDemoProjects(adminId, userId1, userId2) {
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
  const p1 = await db.run(
    `INSERT INTO projects (project_name, client_name_1, client_number, location_name,
      location_lat, location_lng, user_id_1, user_id_2, start_date, end_date,
      status, priority, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    ['CCTV Installation – Amman Tower', 'Jordan Properties Group',
      '+962 6 555 0101', 'Queen Rania Al-Abdullah St, Amman',
      31.9730, 35.8986, userId1, userId2,
      '2026-02-01', '2026-03-15', 'in_progress', 'high', adminId]
  );

  const mod1 = await db.run(
    `INSERT INTO project_modules (project_id, module_type, scope_of_work, status, progress)
    VALUES ($1, $2, $3, $4, $5)`,
    [p1.lastInsertRowid, 'Installation and Wiring',
      'Install 24 IP cameras across all floors, run Cat6 cables to NVR room, configure recording system',
      'in_progress', 57]
  );

  for (let idx = 0; idx < checklists['Installation and Wiring'].length; idx++) {
    const task = checklists['Installation and Wiring'][idx];
    await db.run(
      'INSERT INTO module_checklist (module_id, task_title, is_completed, sort_order) VALUES ($1, $2, $3, $4)',
      [mod1.lastInsertRowid, task, idx < 4 ? 1 : 0, idx]
    );
  }

  await db.run(
    'INSERT INTO module_devices (module_id, device_model, device_qty, device_description, added_by) VALUES ($1, $2, $3, $4, $5)',
    [mod1.lastInsertRowid, 'Hikvision DS-2CD2143G2-I', 24, '4MP AcuSense Fixed Dome Camera', adminId]
  );
  await db.run(
    'INSERT INTO module_devices (module_id, device_model, device_qty, device_description, added_by) VALUES ($1, $2, $3, $4, $5)',
    [mod1.lastInsertRowid, 'Hikvision DS-7732NI-K4', 1, '32-Channel NVR', adminId]
  );

  // Project 2: Fire Alarm System – Pending
  const p2 = await db.run(
    `INSERT INTO projects (project_name, client_name_1, client_number, location_name,
      location_lat, location_lng, user_id_1, start_date, end_date, status, priority, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    ['Fire Alarm System – Zarqa Mall', 'Al-Zarqa Commercial Co.',
      '+962 5 388 7700', 'Prince Hassan St, Zarqa',
      32.0714, 36.0881, userId2,
      '2026-03-01', '2026-04-30', 'pending', 'urgent', adminId]
  );

  const mod2 = await db.run(
    `INSERT INTO project_modules (project_id, module_type, scope_of_work, status, progress)
    VALUES ($1, $2, $3, $4, $5)`,
    [p2.lastInsertRowid, 'Site Survey',
      'Survey entire mall for fire alarm zones, detector placement, and cable routes',
      'pending', 0]
  );

  for (let idx = 0; idx < checklists['Site Survey'].length; idx++) {
    const task = checklists['Site Survey'][idx];
    await db.run(
      'INSERT INTO module_checklist (module_id, task_title, is_completed, sort_order) VALUES ($1, $2, $3, $4)',
      [mod2.lastInsertRowid, task, 0, idx]
    );
  }

  // Notifications for assigned users
  await db.run(
    "INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, 'project')",
    [userId1, 'New Project: CCTV Installation – Amman Tower',
      'You have been assigned as primary engineer. Installation in progress.']
  );
  await db.run(
    "INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, 'project')",
    [userId2, 'New Project: CCTV Installation – Amman Tower',
      'You have been assigned as secondary engineer.']
  );
  await db.run(
    "INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, 'project')",
    [userId2, 'New Project: Fire Alarm System – Zarqa Mall',
      'You have been assigned as primary engineer. Start with site survey.']
  );

  console.log('Demo projects seeded: CCTV Installation (in_progress) | Fire Alarm (pending)');
}

// Initialize once and cache the promise
db.ready = initializeDB().catch(err => {
  console.error('Database initialization failed:', err);
  throw err;
});

module.exports = db;
