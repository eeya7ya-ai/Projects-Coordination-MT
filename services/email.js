const nodemailer = require('nodemailer');
const db = require('../database/db');

// Generic SMTP transporter — credentials come from Vercel env vars:
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE (true/false), SMTP_FROM
//
// The transporter is a singleton with connection pooling so that repeated sends
// reuse the same TCP connection instead of opening a new one each time.
// Call resetTransporter() after SMTP credentials are changed (e.g. settings update).
let _transporter = null;
let _transporterKey = '';

function _buildTransporter() {
  const key = `${process.env.SMTP_HOST}|${process.env.SMTP_PORT}|${process.env.SMTP_USER}|${process.env.SMTP_SECURE}`;
  if (_transporter && _transporterKey === key) return _transporter;
  if (_transporter) { try { _transporter.close(); } catch (_) {} }
  _transporter = nodemailer.createTransport({
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    },
    tls: { rejectUnauthorized: false }
  });
  _transporterKey = key;
  return _transporter;
}

function resetTransporter() {
  if (_transporter) { try { _transporter.close(); } catch (_) {} }
  _transporter = null;
  _transporterKey = '';
}

// Cached admin display name — fetched once and reused to avoid per-email DB roundtrip.
// Call clearAdminNameCache() whenever the admin profile is updated so the next email
// picks up the new name.
let _cachedAdminName = null;
async function getAdminDisplayName() {
  if (_cachedAdminName) return _cachedAdminName;
  try {
    const admin = await db.get("SELECT full_name FROM users WHERE role = 'admin' LIMIT 1");
    _cachedAdminName = admin?.full_name || 'ELV Projects Coordination';
    return _cachedAdminName;
  } catch {
    return 'ELV Projects Coordination';
  }
}
function clearAdminNameCache() {
  _cachedAdminName = null;
}

/**
 * Build the shared HTML wrapper that every email uses.
 * @param {string} bodyHtml  – inner HTML content
 */
function wrapEmail(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MagicTech Projects Coordination</title>
</head>
<body style="margin:0;padding:0;background-color:#eef0f4;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background-color:#eef0f4;padding:40px 16px;">
    <tr><td align="center">

      <!-- ── Card container ── -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="width:600px;max-width:100%;">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background-color:#0f0f1a;padding:32px 40px 24px;text-align:center;
                     border-radius:14px 14px 0 0;">
            <div style="display:inline-block;margin-bottom:10px;">
              <span style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;
                           font-size:30px;font-weight:800;letter-spacing:-0.5px;
                           color:#ffffff;">Magic</span><span
                   style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;
                           font-size:30px;font-weight:800;letter-spacing:-0.5px;
                           color:#E74C3C;">Tech</span>
            </div>
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.45);
                      letter-spacing:3px;text-transform:uppercase;font-weight:600;">
              Projects Coordination
            </p>
          </td>
        </tr>

        <!-- ── RED ACCENT BAR ── -->
        <tr>
          <td style="background-color:#C0392B;height:4px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- ── BODY ── -->
        <tr>
          <td style="background-color:#ffffff;padding:40px 40px 36px;
                     border-left:1px solid #dde1e7;border-right:1px solid #dde1e7;">
            ${bodyHtml}
          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background-color:#1a1a2e;padding:22px 40px;text-align:center;
                     border-radius:0 0 14px 14px;">
            <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.45);line-height:1.6;">
              This is an automated message from
              <strong style="color:rgba(255,255,255,0.7);">MagicTech Projects Coordination</strong>.
              Please do not reply to this email.
            </p>
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);">
              Developed by&nbsp;<span style="color:#E74C3C;font-weight:700;">eSpark</span>&nbsp;Developers
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;
}

/**
 * Send an email. Returns true on success, false on failure (non-blocking).
 * The "from" display name is taken from the admin user account in the database.
 */
async function sendMail({ to, subject, html }) {
  // Guard: all three SMTP credentials must be present before attempting a connection.
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.warn('[Email] SMTP not fully configured (SMTP_HOST / SMTP_USER / SMTP_PASSWORD required) — skipping email to', to);
    return false;
  }
  if (!to) return false;
  try {
    const transporter = _buildTransporter(); // reuses pooled connection
    const displayName = await getAdminDisplayName();
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
    await transporter.sendMail({
      from: `"${displayName}" <${fromAddress}>`,
      to,
      subject,
      html
    });
    console.log(`[Email] Sent "${subject}" → ${to}`);
    return true;
  } catch (err) {
    console.error('[Email] Failed to send to', to, ':', err.message);
    return false;
  }
}

/**
 * Notify a user that they have been assigned to a project.
 * Accepts optional scheduledDate / schedulingNotes for sales & presales context.
 */
async function sendProjectAssignmentEmail({ userEmail, userName, userRole, projectName, clientName,
  scheduledDate, schedulingNotes, startDate, endDate, priority, modules = [] }) {
  if (!userEmail) return false;

  const priorityColors = {
    critical: '#8B0000',
    high:     '#C0392B',
    urgent:   '#C0392B',
    medium:   '#E67E22',
    normal:   '#2980B9',
    low:      '#27AE60'
  };
  const priorityColor = priorityColors[priority?.toLowerCase()] || '#2980B9';
  const priorityLabel = (priority || 'Normal').charAt(0).toUpperCase() + (priority || 'Normal').slice(1).toLowerCase();

  // Role-aware greeting
  const roleLabels = { sales: 'Sales', presales: 'Presales', user: 'Technician', planner: 'Planner' };
  const roleLabel  = roleLabels[userRole] || 'Team Member';
  const isSalesPerson = userRole === 'sales' || userRole === 'presales';

  const moduleRows = modules.length
    ? modules.map((m, i) => `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
          <td style="padding:11px 16px;font-size:13px;color:#1a1a2e;font-weight:600;
                     border-bottom:1px solid #eaecef;white-space:nowrap;">
            ${m.module_type}
          </td>
          <td style="padding:11px 16px;font-size:13px;color:#555;border-bottom:1px solid #eaecef;">
            ${m.scope_of_work || '<em style="color:#aaa;">Not specified</em>'}
          </td>
        </tr>`).join('')
    : `<tr><td colspan="2" style="padding:14px 16px;font-size:13px;color:#aaa;font-style:italic;">
         No modules listed
       </td></tr>`;

  const formattedScheduled = scheduledDate ? new Date(scheduledDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : null;
  const formattedStart     = startDate ? new Date(startDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : null;
  const formattedEnd       = endDate   ? new Date(endDate).toLocaleDateString('en-GB',   { day:'2-digit', month:'short', year:'numeric' }) : null;

  const body = `
    <!-- Greeting -->
    <h2 style="margin:0 0 4px;color:#0f0f1a;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
      New Project Assigned
    </h2>
    <p style="margin:0 0 30px;color:#6c757d;font-size:15px;line-height:1.7;border-bottom:1px solid #f0f0f0;padding-bottom:26px;">
      Hello <strong style="color:#1a1a2e;">${userName || roleLabel}</strong>,<br>
      ${isSalesPerson
        ? `A project associated with your account has been created and assigned to the technical team. Below are the project details for your records.`
        : `You have been assigned to a new project. Please review the details below and log in to begin your work.`}
    </p>

    <!-- Project Info Card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border-radius:10px;overflow:hidden;border:1px solid #dde1e7;margin-bottom:28px;">

      <!-- Card header -->
      <tr>
        <td colspan="2" style="background-color:#0f0f1a;padding:16px 20px;">
          <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.3px;">
            ${projectName}
          </span>
        </td>
      </tr>

      <!-- Priority badge row -->
      <tr style="background-color:#fff8f8;">
        <td style="padding:12px 20px;font-size:12px;color:#888;font-weight:600;
                   text-transform:uppercase;letter-spacing:0.8px;width:130px;">Priority</td>
        <td style="padding:12px 20px;">
          <span style="display:inline-block;padding:4px 14px;background-color:${priorityColor};
                       color:#fff;border-radius:20px;font-size:12px;font-weight:700;
                       text-transform:uppercase;letter-spacing:1px;">
            ${priorityLabel}
          </span>
        </td>
      </tr>

      ${clientName ? `<tr>
        <td style="padding:12px 20px;font-size:12px;color:#888;font-weight:600;
                   text-transform:uppercase;letter-spacing:0.8px;border-top:1px solid #f2f2f2;">Client</td>
        <td style="padding:12px 20px;font-size:14px;color:#1a1a2e;font-weight:600;
                   border-top:1px solid #f2f2f2;">${clientName}</td>
      </tr>` : ''}

      ${formattedScheduled ? `<tr>
        <td style="padding:12px 20px;font-size:12px;color:#888;font-weight:600;
                   text-transform:uppercase;letter-spacing:0.8px;border-top:1px solid #f2f2f2;">Scheduled Date</td>
        <td style="padding:12px 20px;font-size:14px;color:#333;border-top:1px solid #f2f2f2;">${formattedScheduled}</td>
      </tr>` : ''}

      ${schedulingNotes ? `<tr>
        <td style="padding:12px 20px;font-size:12px;color:#888;font-weight:600;
                   text-transform:uppercase;letter-spacing:0.8px;border-top:1px solid #f2f2f2;vertical-align:top;">Scheduling Notes</td>
        <td style="padding:12px 20px;font-size:14px;color:#333;border-top:1px solid #f2f2f2;line-height:1.6;">${schedulingNotes}</td>
      </tr>` : ''}

      ${formattedStart ? `<tr>
        <td style="padding:12px 20px;font-size:12px;color:#888;font-weight:600;
                   text-transform:uppercase;letter-spacing:0.8px;border-top:1px solid #f2f2f2;">Start Date</td>
        <td style="padding:12px 20px;font-size:14px;color:#333;border-top:1px solid #f2f2f2;">${formattedStart}</td>
      </tr>` : ''}

      ${formattedEnd ? `<tr>
        <td style="padding:12px 20px;font-size:12px;color:#888;font-weight:600;
                   text-transform:uppercase;letter-spacing:0.8px;border-top:1px solid #f2f2f2;">Est. End Date</td>
        <td style="padding:12px 20px;font-size:14px;color:#333;border-top:1px solid #f2f2f2;">${formattedEnd}</td>
      </tr>` : ''}
    </table>

    <!-- Modules Table -->
    <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#888;
              text-transform:uppercase;letter-spacing:1px;">Assigned Modules</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border-radius:10px;overflow:hidden;border:1px solid #dde1e7;margin-bottom:32px;">
      <thead>
        <tr style="background-color:#1a1a2e;">
          <th style="padding:11px 16px;text-align:left;font-size:12px;color:rgba(255,255,255,0.8);
                     font-weight:600;text-transform:uppercase;letter-spacing:0.8px;white-space:nowrap;">
            Module Type
          </th>
          <th style="padding:11px 16px;text-align:left;font-size:12px;color:rgba(255,255,255,0.8);
                     font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">
            Scope of Work
          </th>
        </tr>
      </thead>
      <tbody>
        ${moduleRows}
      </tbody>
    </table>

    <!-- CTA -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background-color:#f8f9fa;border-radius:8px;padding:18px 20px;border-left:4px solid #C0392B;">
          <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">
            ${isSalesPerson
              ? `Log in to <strong style="color:#1a1a2e;">MagicTech Projects Coordination</strong> to track project progress and stay updated on all activities.`
              : `Log in to <strong style="color:#1a1a2e;">MagicTech Projects Coordination</strong> to view your full task list, complete checklist items, and submit work reports.`}
          </p>
        </td>
      </tr>
    </table>
  `;

  return sendMail({
    to: userEmail,
    subject: `New Project Assigned: ${projectName}`,
    html: wrapEmail(body)
  });
}

/**
 * Notify a user that their report has been reviewed (approved or needs revision).
 */
async function sendReportReviewEmail({ userEmail, userName, projectName, moduleName, reviewStatus, reviewNotes }) {
  if (!userEmail) return false;

  const isApproved  = reviewStatus === 'approved';
  const statusColor = isApproved ? '#1e8449' : '#c0392b';
  const statusBg    = isApproved ? '#eafaf1' : '#fdf2f2';
  const statusLabel = isApproved ? 'Approved' : 'Needs Revision';
  const statusDesc  = isApproved
    ? 'Your work report has been reviewed and approved by the project administrator.'
    : 'Your work report requires revision. Please review the notes below and resubmit.';

  const body = `
    <!-- Heading -->
    <h2 style="margin:0 0 4px;color:#0f0f1a;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
      Report Review Update
    </h2>
    <p style="margin:0 0 30px;color:#6c757d;font-size:15px;line-height:1.7;border-bottom:1px solid #f0f0f0;padding-bottom:26px;">
      Hello <strong style="color:#1a1a2e;">${userName || 'Team Member'}</strong>,<br>
      ${statusDesc}
    </p>

    <!-- Status Banner -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border-radius:10px;overflow:hidden;border:1px solid #dde1e7;margin-bottom:28px;">
      <tr>
        <td colspan="2" style="background-color:${statusColor};padding:16px 20px;">
          <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.3px;">
            ${isApproved ? 'Report Approved' : 'Revision Required'}
          </span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;font-size:12px;color:#888;font-weight:600;
                   text-transform:uppercase;letter-spacing:0.8px;width:130px;">Project</td>
        <td style="padding:12px 20px;font-size:14px;color:#1a1a2e;font-weight:600;">${projectName}</td>
      </tr>
      ${moduleName ? `<tr>
        <td style="padding:12px 20px;font-size:12px;color:#888;font-weight:600;
                   text-transform:uppercase;letter-spacing:0.8px;border-top:1px solid #f2f2f2;">Module</td>
        <td style="padding:12px 20px;font-size:14px;color:#333;border-top:1px solid #f2f2f2;">${moduleName}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:12px 20px;font-size:12px;color:#888;font-weight:600;
                   text-transform:uppercase;letter-spacing:0.8px;border-top:1px solid #f2f2f2;">Status</td>
        <td style="padding:12px 20px;border-top:1px solid #f2f2f2;">
          <span style="display:inline-block;padding:4px 14px;background-color:${statusColor};
                       color:#fff;border-radius:20px;font-size:12px;font-weight:700;
                       text-transform:uppercase;letter-spacing:1px;">
            ${statusLabel}
          </span>
        </td>
      </tr>
      ${reviewNotes ? `<tr>
        <td style="padding:12px 20px;font-size:12px;color:#888;font-weight:600;
                   text-transform:uppercase;letter-spacing:0.8px;border-top:1px solid #f2f2f2;
                   vertical-align:top;">Notes</td>
        <td style="padding:12px 20px;font-size:14px;color:#333;border-top:1px solid #f2f2f2;
                   line-height:1.6;">${reviewNotes}</td>
      </tr>` : ''}
    </table>

    <!-- CTA -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background-color:${statusBg};border-radius:8px;padding:18px 20px;
                   border-left:4px solid ${statusColor};">
          <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">
            ${isApproved
              ? 'Thank you for your effort. Log in to <strong style="color:#1a1a2e;">MagicTech Projects Coordination</strong> to continue with your other tasks.'
              : 'Please log in to <strong style="color:#1a1a2e;">MagicTech Projects Coordination</strong>, review the notes above, and submit a revised report.'}
          </p>
        </td>
      </tr>
    </table>
  `;

  return sendMail({
    to: userEmail,
    subject: `Report ${statusLabel}: ${projectName}`,
    html: wrapEmail(body)
  });
}

/**
 * Forward the daily project summary to all planner-role users with emails.
 * @param {string} date - YYYY-MM-DD
 * @param {object} summaryData - { projects: [...] } as returned by the daily-summary endpoint
 */
async function sendDailySummaryEmail({ date, summaryData, plannerEmails }) {
  if (!plannerEmails || plannerEmails.length === 0) return { sent: 0, skipped: 0 };

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const statusColors = { pending: '#F39C12', in_progress: '#2980B9', completed: '#27AE60', cancelled: '#95A5A6' };
  const moduleIcons  = {
    'Maintenance': '🔧', 'Handover': '🤝', 'Installation and Wiring': '⚡',
    'Programming and Trouble Shooting': '💻', 'Delivering': '📦', 'Site Survey': '🗺️', 'POC': '🔬'
  };

  const projects = summaryData.projects || [];
  const totalModules = projects.reduce((s, p) => s + (p.modules?.length || 0), 0);

  const projectsHtml = projects.map((proj, idx) => {
    const modulesHtml = (proj.modules || []).map(mod => {
      const color = statusColors[mod.status] || '#999';
      const icon  = moduleIcons[mod.module_type] || '📋';
      const devicesHtml = (mod.devices || []).length > 0
        ? `<div style="margin-top:6px;padding:6px 10px;background:#f8f9fa;border-left:3px solid #dee2e6;font-size:12px">
            ${mod.devices.map(d => `<div>▪ <strong>${d.device_model}</strong> ×${d.device_qty}${d.device_description ? ' — ' + d.device_description : ''}</div>`).join('')}
           </div>`
        : '';
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f3f5;vertical-align:top">
            <span style="font-size:15px">${icon}</span>
          </td>
          <td style="padding:8px 8px;border-bottom:1px solid #f1f3f5">
            <div style="font-size:13px;font-weight:600">${mod.module_type}</div>
            ${mod.scope_of_work ? `<div style="font-size:12px;color:#6c757d">${mod.scope_of_work.substring(0, 80)}${mod.scope_of_work.length > 80 ? '…' : ''}</div>` : ''}
            ${devicesHtml}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #f1f3f5;white-space:nowrap">
            <span style="font-size:11px;font-weight:600;color:white;background:${color};padding:2px 8px;border-radius:12px">${(mod.status || 'pending').replace('_', ' ')}</span>
            <div style="font-size:11px;color:#adb5bd;text-align:right;margin-top:2px">${mod.progress || 0}%</div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div style="border:1px solid #dee2e6;border-radius:8px;margin-bottom:16px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#6B0000,#C0392B);color:white;padding:12px 16px">
          <div style="font-size:15px;font-weight:700">${idx + 1}. ${proj.project_name}</div>
          <div style="font-size:12px;opacity:0.8">${[proj.client_name_1, proj.location_name].filter(Boolean).join(' · ') || 'No client / location'}</div>
        </div>
        <div style="padding:0 16px">
          <table style="width:100%;border-collapse:collapse">${modulesHtml}</table>
        </div>
        ${proj.user1_name || proj.user2_name ? `
          <div style="padding:8px 16px;border-top:1px solid #f1f3f5;font-size:12px;color:#6c757d;background:#f8f9fa">
            👷 Assigned: ${[proj.user1_name, proj.user2_name].filter(Boolean).join(' & ')}
          </div>` : ''}
      </div>`;
  }).join('');

  const body = `
    <h2 style="font-size:20px;font-weight:700;margin:0 0 4px">Daily Project Summary</h2>
    <p style="font-size:14px;color:#6c757d;margin:0 0 20px">${dateLabel}</p>
    <div style="display:flex;gap:24px;margin-bottom:20px;padding:16px;background:#f8f9fa;border-radius:8px">
      <div style="text-align:center">
        <div style="font-size:28px;font-weight:800;color:#C0392B">${projects.length}</div>
        <div style="font-size:11px;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px">Projects</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:28px;font-weight:800;color:#2980B9">${totalModules}</div>
        <div style="font-size:11px;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px">Total Modules</div>
      </div>
    </div>
    ${projectsHtml}
  `;

  let sent = 0, skipped = 0;
  for (const email of plannerEmails) {
    const ok = await sendMail({
      to: email,
      subject: `📅 Daily Summary — ${dateLabel}`,
      html: wrapEmail(body)
    });
    ok ? sent++ : skipped++;
  }
  return { sent, skipped };
}

/**
 * Notify the sales and presales persons when a project is marked as completed.
 */
async function sendProjectCompletionEmail({ userEmail, userName, userRole, projectName, clientName,
  startDate, endDate, priority, modules = [] }) {
  if (!userEmail) return false;

  const priorityColors = {
    critical: '#8B0000', high: '#C0392B', urgent: '#C0392B',
    medium: '#E67E22', normal: '#2980B9', low: '#27AE60'
  };
  const priorityColor = priorityColors[priority?.toLowerCase()] || '#2980B9';
  const priorityLabel = (priority || 'Normal').charAt(0).toUpperCase() + (priority || 'Normal').slice(1).toLowerCase();

  const roleLabels = { sales: 'Sales', presales: 'Presales', user: 'Technician', planner: 'Planner' };
  const roleLabel  = roleLabels[userRole] || 'Team Member';

  const formattedStart = startDate ? new Date(startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
  const formattedEnd   = endDate   ? new Date(endDate).toLocaleDateString('en-GB',   { day: '2-digit', month: 'short', year: 'numeric' }) : null;

  const moduleRows = modules.length
    ? modules.map((m, i) => `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
          <td style="padding:11px 16px;font-size:13px;color:#1a1a2e;font-weight:600;
                     border-bottom:1px solid #eaecef;white-space:nowrap;">${m.module_type}</td>
          <td style="padding:11px 16px;font-size:13px;color:#555;border-bottom:1px solid #eaecef;">
            ${m.scope_of_work || '<em style="color:#aaa;">Not specified</em>'}
          </td>
        </tr>`).join('')
    : `<tr><td colspan="2" style="padding:14px 16px;font-size:13px;color:#aaa;font-style:italic;">No modules listed</td></tr>`;

  const body = `
    <h2 style="margin:0 0 4px;color:#0f0f1a;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
      Project Completed
    </h2>
    <p style="margin:0 0 30px;color:#6c757d;font-size:15px;line-height:1.7;border-bottom:1px solid #f0f0f0;padding-bottom:26px;">
      Hello <strong style="color:#1a1a2e;">${userName || roleLabel}</strong>,<br>
      The following project has been marked as <strong style="color:#27AE60;">Completed</strong>.
      All work has been finished and the project is now closed.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border-radius:10px;overflow:hidden;border:1px solid #dde1e7;margin-bottom:28px;">
      <tr>
        <td colspan="2" style="background-color:#1e8449;padding:16px 20px;">
          <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.3px;">
            ✓ ${projectName}
          </span>
        </td>
      </tr>
      <tr style="background-color:#eafaf1;">
        <td style="padding:12px 20px;font-size:12px;color:#888;font-weight:600;
                   text-transform:uppercase;letter-spacing:0.8px;width:130px;">Priority</td>
        <td style="padding:12px 20px;">
          <span style="display:inline-block;padding:4px 14px;background-color:${priorityColor};
                       color:#fff;border-radius:20px;font-size:12px;font-weight:700;
                       text-transform:uppercase;letter-spacing:1px;">${priorityLabel}</span>
        </td>
      </tr>
      ${clientName ? `<tr>
        <td style="padding:12px 20px;font-size:12px;color:#888;font-weight:600;
                   text-transform:uppercase;letter-spacing:0.8px;border-top:1px solid #f2f2f2;">Client</td>
        <td style="padding:12px 20px;font-size:14px;color:#1a1a2e;font-weight:600;
                   border-top:1px solid #f2f2f2;">${clientName}</td>
      </tr>` : ''}
      ${formattedStart ? `<tr>
        <td style="padding:12px 20px;font-size:12px;color:#888;font-weight:600;
                   text-transform:uppercase;letter-spacing:0.8px;border-top:1px solid #f2f2f2;">Start Date</td>
        <td style="padding:12px 20px;font-size:14px;color:#333;border-top:1px solid #f2f2f2;">${formattedStart}</td>
      </tr>` : ''}
      ${formattedEnd ? `<tr>
        <td style="padding:12px 20px;font-size:12px;color:#888;font-weight:600;
                   text-transform:uppercase;letter-spacing:0.8px;border-top:1px solid #f2f2f2;">End Date</td>
        <td style="padding:12px 20px;font-size:14px;color:#333;border-top:1px solid #f2f2f2;">${formattedEnd}</td>
      </tr>` : ''}
    </table>

    <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#888;
              text-transform:uppercase;letter-spacing:1px;">Completed Modules</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border-radius:10px;overflow:hidden;border:1px solid #dde1e7;margin-bottom:32px;">
      <thead>
        <tr style="background-color:#1a1a2e;">
          <th style="padding:11px 16px;text-align:left;font-size:12px;color:rgba(255,255,255,0.8);
                     font-weight:600;text-transform:uppercase;letter-spacing:0.8px;white-space:nowrap;">Module Type</th>
          <th style="padding:11px 16px;text-align:left;font-size:12px;color:rgba(255,255,255,0.8);
                     font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Scope of Work</th>
        </tr>
      </thead>
      <tbody>${moduleRows}</tbody>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background-color:#eafaf1;border-radius:8px;padding:18px 20px;border-left:4px solid #27AE60;">
          <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">
            Log in to <strong style="color:#1a1a2e;">MagicTech Projects Coordination</strong> to view the
            full project record, final reports, and any handover documentation.
          </p>
        </td>
      </tr>
    </table>
  `;

  return sendMail({
    to: userEmail,
    subject: `Project Completed: ${projectName}`,
    html: wrapEmail(body)
  });
}

function canSend() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

async function sendHoldNotificationEmail(user, quotation, holdDate) {
  if (!canSend()) return;
  const transporter = _buildTransporter();
  const customerInfo = typeof quotation.customer_info === 'string'
    ? JSON.parse(quotation.customer_info || '{}') : (quotation.customer_info || {});
  const clientName = customerInfo.client || customerInfo.name || 'N/A';
  const formattedDate = new Date(holdDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const body = wrapEmail(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:32px 40px 24px;">
        <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1e2a38;">Quotation Hold Reminder</h2>
        <p style="margin:0 0 20px;font-size:14px;color:#5a6a7a;">Hello ${escEmailStr(user.full_name)}, your quotation has been placed on hold.</p>
        <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#f8f9fa;border-radius:8px;margin-bottom:20px;">
          <tr><td style="font-size:13px;font-weight:600;color:#1e2a38;width:160px">Quotation Ref:</td><td style="font-size:13px;color:#C0392B;font-weight:700">${escEmailStr(quotation.ref_number || 'N/A')}</td></tr>
          <tr><td style="font-size:13px;font-weight:600;color:#1e2a38;">Client:</td><td style="font-size:13px;color:#1e2a38;">${escEmailStr(clientName)}</td></tr>
          <tr><td style="font-size:13px;font-weight:600;color:#1e2a38;">Total Value:</td><td style="font-size:13px;color:#1e2a38;">${escEmailStr(quotation.currency || 'JOD')} ${parseFloat(quotation.grand_total || 0).toFixed(2)}</td></tr>
          <tr><td style="font-size:13px;font-weight:600;color:#1e2a38;">Follow-up Date:</td><td style="font-size:14px;font-weight:700;color:#C0392B;">${escEmailStr(formattedDate)}</td></tr>
        </table>
        <p style="margin:0;font-size:13px;color:#5a6a7a;">Please log in to MagicTech Projects Coordination to review and take action on this quotation by the scheduled date.</p>
      </td></tr>
    </table>
  `);

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: user.email,
    subject: `[MagicTech] Quotation ${quotation.ref_number || ''} — Follow-up on ${formattedDate}`,
    html: body
  });
}

function escEmailStr(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

module.exports = { sendMail, sendProjectAssignmentEmail, sendReportReviewEmail, sendDailySummaryEmail, sendProjectCompletionEmail, clearAdminNameCache, resetTransporter, sendHoldNotificationEmail };
