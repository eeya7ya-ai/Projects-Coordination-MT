# ELV Project Coordinator — CLAUDE.md

## Project Overview

**ELV Project Coordinator** is a full-stack web application for managing Extra Low Voltage (ELV) installation, maintenance, and handover projects. It provides real-time task tracking, team collaboration, report submission/review, and project analytics.

**Developed by:** eSpark Developers
**Brand:** eSpark Logo displayed in the footer of every page.

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20.x |
| Backend | Express.js 4.x |
| Database | PostgreSQL (Neon serverless) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Frontend | Vanilla HTML5 / CSS3 / JavaScript |
| Maps | Leaflet.js 1.9.4 |
| File Uploads | multer |
| Excel Parsing | xlsx |
| Deployment | Vercel |

### Directory Structure

```
Projects-Coordination-MT/
├── server.js                  # Express entry point, static serving, route mounting
├── package.json               # Dependencies and scripts
├── vercel.json                # Vercel deployment config
│
├── database/
│   └── db.js                  # Neon PostgreSQL connection + full schema (auto-creates tables)
│
├── middleware/
│   └── auth.js                # JWT verification middleware; attaches req.user
│
├── routes/
│   ├── auth.js                # POST /api/auth/login, GET /api/auth/me, POST /api/auth/change-password
│   ├── admin.js               # Admin-only: user CRUD, analytics
│   └── projects.js            # Projects, modules, checklists, reports, notifications, excel-parse
│
└── public/                    # Static frontend files served by Express
    ├── index.html             # Login page (entry point for all users)
    ├── admin.html             # Admin dashboard (role: admin)
    ├── dashboard.html         # Field user dashboard (role: user)
    ├── eSpark Logo.jpeg       # Brand logo shown in footer on all pages
    ├── css/
    │   └── style.css          # Global styles — CSS variables, layout, components, animations
    └── js/
        ├── admin.js           # All admin UI logic (~1,155 lines)
        └── dashboard.js       # All user UI logic (~572 lines)
```

---

## Running the Project

### Prerequisites

- Node.js 20.x
- A Neon PostgreSQL database (or compatible PostgreSQL)
- `.env` file with the following variables:

```env
DATABASE_URL=postgresql://...   # Neon connection string
JWT_SECRET=your_secret_key
PORT=3000                        # Optional, defaults to 3000
```

### Install & Start

```bash
npm install
npm start        # production
npm run dev      # development with nodemon auto-reload
```

### Database Initialization

The schema is **auto-created** on first run via `database/db.js`. Tables created:
- `users`, `projects`, `project_modules`, `module_checklist`
- `module_devices`, `module_documents`, `module_reports`, `notifications`

A default admin account is seeded automatically:
- **Username:** `admin`
- **Password:** `admin123` *(change immediately in production)*

---

## API Reference

### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/login` | Login with username + password | No |
| GET | `/api/auth/me` | Get current user profile | Yes |
| POST | `/api/auth/change-password` | Change own password | Yes |

### Projects

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/api/projects/` | List projects (admin: all, user: assigned) | Any |
| GET | `/api/projects/:id` | Get project with modules & devices | Any |
| POST | `/api/projects/` | Create project | Admin |
| PUT | `/api/projects/:id` | Update project | Admin |
| DELETE | `/api/projects/:id` | Delete project | Admin |
| PUT | `/api/projects/:pid/modules/:mid` | Update module status/notes | Any |
| PUT | `/api/projects/:pid/modules/:mid/checklist/:iid` | Toggle checklist item | Any |
| POST | `/api/projects/:pid/modules/:mid/reports` | Submit work report | User |
| PUT | `/api/projects/:pid/modules/:mid/reports/:rid` | Review report | Admin |
| GET | `/api/projects/notifications/mine` | Get own notifications | Any |
| PUT | `/api/projects/notifications/:id/read` | Mark notification read | Any |
| POST | `/api/projects/excel-parse` | Parse Excel file for device import | Admin |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users` | Create user |
| PUT | `/api/admin/users/:id` | Update user |
| DELETE | `/api/admin/users/:id` | Deactivate user |
| GET | `/api/admin/analytics` | Dashboard analytics data |

### Frontend Routes

| Path | File | Access |
|------|------|--------|
| `/` | `index.html` | Public (login page) |
| `/admin` | `admin.html` | Admin only (enforced client-side) |
| `/dashboard` | `dashboard.html` | Users (enforced client-side) |

---

## Authentication Flow

1. User submits credentials to `POST /api/auth/login`
2. Server verifies password with `bcryptjs`, returns a **JWT** valid for **8 hours**
3. JWT stored in `localStorage` as `elv_token`; user object stored as `elv_user`
4. All subsequent API calls include `Authorization: Bearer <token>` header
5. Middleware (`middleware/auth.js`) verifies JWT and attaches `req.user` to every protected request
6. Role-based routing: `admin` → `/admin`, others → `/dashboard`

---

## Database Schema

### users
```
id, username (unique), password (hashed), full_name, role (admin|user),
department, phone, email, avatar_color, is_active, created_at, last_login
```

### projects
```
id, project_name, client_name_1, client_name_2, client_number,
location_name, location_lat, location_lng,
user_id_1, user_id_2 (FK → users),
start_date, end_date, status (active|completed|on_hold|cancelled),
priority (low|medium|high|critical), created_by, created_at, updated_at
```

### project_modules
```
id, project_id (FK), module_type (Maintenance|Handover|Installation and Wiring|
Programming and Trouble Shooting|Delivering|Site Survey|POC),
scope_of_work, issue_details, status (pending|in_progress|completed),
progress (0-100), started_at, completed_at, user_notes, admin_notes,
created_at, updated_at
```

### module_checklist
```
id, module_id (FK), task_title, task_description, is_completed,
completed_by, completed_at, sort_order, created_at
```

### module_devices
```
id, module_id (FK), device_model, device_qty, device_description,
serial_number, added_by, added_at
```

### module_documents
```
id, module_id (FK), doc_type, file_name, file_path, content,
uploaded_by, uploaded_at
```

### module_reports
```
id, module_id (FK), submitted_by (FK → users), report_text, work_done,
issues_found, next_steps, hours_spent, submitted_at, reviewed_by,
review_status (pending|approved|needs_revision), review_notes, reviewed_at
```

### notifications
```
id, user_id (FK), title, message, type, is_read, created_at
```

---

## Frontend Architecture

All frontend logic is **vanilla JavaScript** — no framework.

### index.html (Login)
- Animated particle background (JS-generated)
- Submits to `/api/auth/login`, stores JWT, redirects by role

### admin.html + public/js/admin.js
Single-page app using tab-based navigation. Sections:
- **Dashboard** — stats cards, recent projects, module type breakdown
- **Analytics** — team performance, achievements, project timeline
- **Projects** — filterable project list with status badges
- **New Project** — multi-step form with Leaflet map picker, module selection, Excel device import
- **Reports** — admin reviews submitted reports (approve / needs revision)
- **Users** — create, edit, deactivate users; generate temp passwords

### dashboard.html + public/js/dashboard.js
User-facing single-page app. Sections:
- **My Projects** — assigned projects with progress bars
- **Active Tasks** — checklist items to complete
- **My Reports** — submitted work reports and their review status

### CSS Design System (public/css/style.css)

**Color Variables:**
```css
--red:       #C0392B   /* Primary brand */
--red-dark:  #8B0000
--red-light: #E74C3C
--success:   #27AE60
--warning:   #F39C12
--info:      #2980B9
```

**Typography:**
- Body: `Inter` (Google Fonts)
- Headers/Numbers: `Rajdhani` (Google Fonts)

**Layout:** Fixed sidebar (240px) + scrollable main content
**Responsive:** Collapses to single column on `< 768px`

---

## Module Types & Auto-Generated Checklists

When a module is created, the system auto-generates a relevant checklist:

| Module Type | Auto Checklist Tasks |
|-------------|---------------------|
| Maintenance | Site inspection, fault identification, repair, testing, documentation |
| Handover | Documentation review, system walkthrough, client training, sign-off |
| Installation and Wiring | Cable routing, termination, labeling, testing |
| Programming and Trouble Shooting | Config backup, fault diagnosis, reprogramming, verification |
| Delivering | Packing, delivery, client receipt, documentation |
| Site Survey | Survey, measurements, photo documentation, report |
| POC | Demo setup, testing, results documentation, presentation |

---

## Deployment (Vercel)

The project is configured for Vercel via `vercel.json`. All requests are handled by `server.js` (Node.js builder). Environment variables (`DATABASE_URL`, `JWT_SECRET`) must be set in the Vercel dashboard.

```bash
# Deploy
vercel --prod
```

---

## Key Conventions

- **Never commit** `.env`, `node_modules/`, or files in `uploads/`
- **JWT expiry** is 8 hours — sessions auto-expire
- **Password hashing** uses bcryptjs with 10 salt rounds
- **File uploads** (Excel, documents) are stored in `/uploads/` and NOT version-controlled
- **Admin seeding** happens once on DB init if no admin user exists
- **eSpark footer** (`espark-footer` CSS class) must remain on all pages as brand attribution

---

## Development Notes

- Run `npm run dev` for hot-reload during development (requires nodemon)
- The database schema auto-migrates — adding columns requires editing `database/db.js`
- Frontend JS files are large (~1000+ lines each); search by section comment headers
- Leaflet map is only initialized when the "New Project" form is opened (lazy init)
- Excel import (`/api/projects/excel-parse`) expects specific column headers: `Device Model`, `Quantity`, `Description`
