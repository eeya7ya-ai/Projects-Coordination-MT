# CLAUDE.md — ELV Project Coordinator

This file provides guidance for Claude Code (AI assistant) when working in this repository.

---

## Project Overview

**ELV Project Coordinator** is a full-stack web application for managing Extra Low Voltage (ELV) installation projects. It enables admins to create and track projects, assign team members, and review submitted work reports; team members can view their assignments, complete checklists, and submit reports.

**Developed by:** eSpark

---

## Tech Stack

| Layer       | Technology                                  |
|-------------|---------------------------------------------|
| Runtime     | Node.js 20.x                                |
| Framework   | Express.js 4.x                              |
| Database    | PostgreSQL via Neon (serverless)            |
| Auth        | JWT (`jsonwebtoken`) + bcrypt passwords     |
| Frontend    | Vanilla HTML5 / CSS3 / JavaScript           |
| Maps        | Leaflet.js (OpenStreetMap)                  |
| Excel       | `xlsx` library (device bulk import)         |
| Deployment  | Vercel                                       |

---

## Directory Structure

```
/
├── server.js               # Express app entry point, routes registration
├── package.json            # Dependencies and npm scripts
├── vercel.json             # Vercel deployment configuration
├── .gitignore
├── database/
│   └── db.js               # PostgreSQL connection + schema init + seeding
├── middleware/
│   └── auth.js             # JWT verification middleware, admin guard
├── routes/
│   ├── auth.js             # POST /api/auth/login, GET /api/auth/me, change-password
│   ├── admin.js            # Admin-only: users CRUD, analytics
│   └── projects.js         # Projects CRUD, modules, checklists, reports, notifications
├── public/                 # Static files served by Express
│   ├── index.html          # Login page (/)
│   ├── dashboard.html      # User dashboard (/dashboard)
│   ├── admin.html          # Admin panel (/admin)
│   ├── espark-logo.jpeg    # eSpark company logo (footer branding)
│   ├── css/
│   │   └── style.css       # Global styles (red/white theme, CSS variables)
│   └── js/
│       ├── dashboard.js    # User dashboard logic (projects, tasks, reports)
│       └── admin.js        # Admin panel logic (analytics, project creation, users)
└── uploads/                # Multer file upload target directory
```

---

## Environment Variables

Create a `.env` file in the project root with:

```
DATABASE_URL=postgresql://...   # Neon PostgreSQL connection string (required)
PORT=3000                        # Optional; defaults to 3000
```

> **Note:** `JWT_SECRET` is currently hardcoded in `middleware/auth.js` as `elv-coord-secret-2024-xK9mP`. Move this to `.env` for production.

---

## Running the Project

```bash
# Install dependencies
npm install

# Development (auto-reload)
npm run dev

# Production
npm start
```

Server starts on `http://localhost:3000`.

---

## API Routes

### Auth (`/api/auth`)
| Method | Path                        | Auth     | Description                  |
|--------|-----------------------------|----------|------------------------------|
| POST   | `/api/auth/login`           | None     | Login, returns JWT token     |
| GET    | `/api/auth/me`              | Token    | Get current user profile     |
| POST   | `/api/auth/change-password` | Token    | Change own password          |

### Admin (`/api/admin`) — requires admin role
| Method | Path                  | Description                       |
|--------|-----------------------|-----------------------------------|
| GET    | `/api/admin/users`    | List all users with project counts |
| POST   | `/api/admin/users`    | Create new user                   |
| PUT    | `/api/admin/users/:id`| Update user details/password      |
| DELETE | `/api/admin/users/:id`| Soft-delete (deactivate) user     |
| GET    | `/api/admin/analytics`| Dashboard stats & project timeline |

### Projects (`/api/projects`) — requires token
| Method | Path                                                          | Admin? | Description                     |
|--------|---------------------------------------------------------------|--------|---------------------------------|
| GET    | `/api/projects/`                                             | No     | All projects (filtered by role) |
| GET    | `/api/projects/:id`                                          | No     | Project detail with modules     |
| POST   | `/api/projects/`                                             | Yes    | Create project + modules        |
| PUT    | `/api/projects/:id`                                          | Yes    | Update project                  |
| DELETE | `/api/projects/:id`                                          | Yes    | Delete project                  |
| PUT    | `/api/projects/:pid/modules/:mid`                            | No     | Update module status/notes      |
| PUT    | `/api/projects/:pid/modules/:mid/checklist/:itemId`          | No     | Toggle checklist item           |
| POST   | `/api/projects/:pid/modules/:mid/reports`                    | No     | Submit work report              |
| PUT    | `/api/projects/:pid/modules/:mid/reports/:rid`               | Yes    | Review a report                 |
| GET    | `/api/projects/reports/all`                                  | Yes    | All submitted reports           |
| GET    | `/api/projects/notifications/mine`                           | No     | User notifications              |
| PUT    | `/api/projects/notifications/:id/read`                       | No     | Mark notification read          |
| PUT    | `/api/projects/notifications/read-all`                       | No     | Mark all notifications read     |
| POST   | `/api/projects/excel-parse`                                  | Yes    | Parse Excel for device import   |

---

## Database Schema

All tables are created automatically on first startup via `database/db.js`.

| Table              | Key Columns                                                                     |
|--------------------|---------------------------------------------------------------------------------|
| `users`            | id, username (unique), password (hashed), full_name, role, department, is_active |
| `projects`         | id, project_name, client_name_1, user_id_1, user_id_2, status, priority, dates  |
| `project_modules`  | id, project_id, module_type, status, progress (0-100%)                          |
| `module_documents` | id, module_id, doc_type, file_name, content                                     |
| `module_devices`   | id, module_id, device_model, device_qty, serial_number                          |
| `module_checklist` | id, module_id, task_title, is_completed, sort_order                             |
| `module_reports`   | id, module_id, submitted_by, work_done, hours_spent, review_status              |
| `notifications`    | id, user_id, title, message, type, is_read                                      |

**Module types:** Maintenance, Handover, Installation, Programming, Delivering, Site Survey, POC

**Seeded defaults:**
- Admin: `admin` / `admin123`
- Demo users: `ahmed` / `user123`, `sara` / `user123`

---

## Frontend Pages

| Page            | URL          | File                   | Description                             |
|-----------------|--------------|------------------------|-----------------------------------------|
| Login           | `/`          | `public/index.html`    | JWT login, redirects by role            |
| User Dashboard  | `/dashboard` | `public/dashboard.html`| My Projects, Active Tasks, My Reports   |
| Admin Panel     | `/admin`     | `public/admin.html`    | Full project/user management, analytics |

**Authentication flow:** Token stored in `localStorage` as `elv_token`. All API calls send `Authorization: Bearer {token}` header. Expired/missing token → redirect to `/`.

---

## CSS Design System

File: `public/css/style.css`

Key CSS variables:
```css
--red:        #C0392B   /* Primary brand color */
--red-dark:   #8B0000   /* Sidebar, dark accents */
--red-light:  #E74C3C   /* Badges, highlights */
--gray-50 → --gray-900  /* Neutral scale */
--shadow-sm / --shadow / --shadow-lg
--transition: all 0.2s ease
```

Typography: **Inter** (body), **Rajdhani** (headings/brand) — loaded from Google Fonts.

---

## Branding

The eSpark company logo (`public/espark-logo.jpeg`) appears as a small fixed footer on all pages via:
- CSS class: `.espark-footer` (fixed bottom bar, 22px logo height)
- CSS class: `.espark-footer-logo`

This footer is present on `index.html`, `dashboard.html`, and `admin.html`.

---

## Common Development Tasks

### Add a new API endpoint
1. Add the route handler to the appropriate file in `routes/`
2. Register it in `server.js` if it is a new router
3. Protect with `verifyToken` and/or `requireAdmin` from `middleware/auth.js`

### Add a new module type
1. Add the type string to the module selector in `public/admin.html`
2. Add a default checklist entry in `database/db.js` under the seeding block
3. Add an icon/emoji mapping in `public/js/admin.js` and `public/js/dashboard.js`

### Database schema changes
- Edit `database/db.js` — the `initializeDatabase()` function runs `CREATE TABLE IF NOT EXISTS` on startup
- For existing deployed instances, run ALTER TABLE migrations manually

### Deployment (Vercel)
- Push to the connected branch; Vercel auto-deploys
- Set `DATABASE_URL` in Vercel environment variables
- `vercel.json` routes all traffic through `server.js`

---

## Security Notes

- Passwords hashed with **bcrypt** (10 rounds)
- JWT expiry: **8 hours**
- Soft-delete for users (never hard-deleted)
- Move `JWT_SECRET` out of code and into environment variable before production use
- No file-system uploads stored in production (use cloud storage for `module_documents`)

---

## Key Dependencies

| Package                   | Purpose                          |
|---------------------------|----------------------------------|
| `express`                 | Web server framework             |
| `bcryptjs`                | Password hashing                 |
| `jsonwebtoken`            | JWT generation & verification    |
| `@neondatabase/serverless`| Neon PostgreSQL client           |
| `xlsx`                    | Excel file parsing               |
| `multer`                  | Multipart file upload handling   |
| `cors`                    | Cross-origin resource sharing    |
| `dotenv`                  | Environment variable loading     |
| `ws`                      | WebSocket (required by Neon SDK) |
