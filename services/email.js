const nodemailer = require('nodemailer');
const db = require('../database/db');

// Generic SMTP transporter — credentials come from Vercel env vars:
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE (true/false), SMTP_FROM
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

// Fetch the admin account's display name to use as the email sender name.
async function getAdminDisplayName() {
  try {
    const admin = await db.get("SELECT full_name FROM users WHERE role = 'admin' LIMIT 1");
    return admin?.full_name || 'ELV Project Coordinator';
  } catch {
    return 'ELV Project Coordinator';
  }
}

// Absolute base URL used to embed the logo in emails
const APP_URL = process.env.APP_URL || 'https://projects-coordination-mt.vercel.app';
const LOGO_URL = `${APP_URL}/company-logo.jpg`;

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
  <title>ELV Project Coordinator</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header with company logo -->
        <tr>
          <td style="background:#ffffff;padding:28px 40px 20px;text-align:center;border-bottom:3px solid #C0392B;">
            <img src="${LOGO_URL}" alt="Magic Tech" style="max-height:72px;max-width:280px;object-fit:contain;" />
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f9fa;padding:20px 40px;text-align:center;border-top:1px solid #e9ecef;">
            <p style="margin:0;font-size:12px;color:#6c757d;">
              This is an automated notification from the <strong>ELV Project Coordinator</strong> system.<br>
              Created by <span style="color:#C0392B;font-weight:700;">eSpark</span> Developers
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
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.warn('[Email] SMTP_USER / SMTP_PASSWORD not configured — skipping email to', to);
    return false;
  }
  if (!to) return false;
  try {
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
    console.error('[Email] Failed to send:', err.message);
    return false;
  }
}

/**
 * Notify a user that they have been assigned to a project.
 */
async function sendProjectAssignmentEmail({ userEmail, userName, projectName, clientName, startDate, endDate, priority, modules = [] }) {
  if (!userEmail) return false;

  const priorityColor = {
    critical: '#8B0000',
    high: '#C0392B',
    urgent: '#C0392B',
    medium: '#F39C12',
    normal: '#2980B9',
    low: '#27AE60'
  }[priority?.toLowerCase()] || '#2980B9';

  const moduleRows = modules.length
    ? modules.map(m => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">${m.module_type}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#555;">${m.scope_of_work || '—'}</td>
        </tr>`).join('')
    : `<tr><td colspan="2" style="padding:8px 12px;font-size:13px;color:#888;">No modules listed</td></tr>`;

  const body = `
    <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;">New Project Assigned</h2>
    <p style="margin:0 0 24px;color:#555;font-size:15px;">
      Hello <strong>${userName || 'Team Member'}</strong>, you have been assigned to a new project. Please review the details below.
    </p>

    <!-- Project Info Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;margin-bottom:24px;border:1px solid #e9ecef;">
      <tr>
        <td colspan="2" style="padding:14px 16px;background:#C0392B;border-radius:8px 8px 0 0;">
          <span style="color:#fff;font-size:16px;font-weight:700;">${projectName}</span>
        </td>
      </tr>
      ${clientName ? `<tr>
        <td style="padding:10px 16px;font-size:13px;color:#888;width:140px;">Client</td>
        <td style="padding:10px 16px;font-size:14px;color:#333;font-weight:600;">${clientName}</td>
      </tr>` : ''}
      ${startDate ? `<tr>
        <td style="padding:10px 16px;font-size:13px;color:#888;">Start Date</td>
        <td style="padding:10px 16px;font-size:14px;color:#333;">${startDate}</td>
      </tr>` : ''}
      ${endDate ? `<tr>
        <td style="padding:10px 16px;font-size:13px;color:#888;">End Date</td>
        <td style="padding:10px 16px;font-size:14px;color:#333;">${endDate}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:#888;">Priority</td>
        <td style="padding:10px 16px;">
          <span style="display:inline-block;padding:3px 10px;background:${priorityColor};color:#fff;border-radius:4px;font-size:12px;font-weight:600;text-transform:uppercase;">${priority || 'Normal'}</span>
        </td>
      </tr>
    </table>

    <!-- Modules Table -->
    <h3 style="margin:0 0 10px;color:#1a1a2e;font-size:15px;">Project Modules</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e9ecef;margin-bottom:28px;">
      <thead>
        <tr style="background:#1a1a2e;">
          <th style="padding:10px 12px;text-align:left;font-size:13px;color:#fff;font-weight:600;">Module Type</th>
          <th style="padding:10px 12px;text-align:left;font-size:13px;color:#fff;font-weight:600;">Scope of Work</th>
        </tr>
      </thead>
      <tbody>${moduleRows}</tbody>
    </table>

    <p style="margin:0;font-size:14px;color:#555;">
      Please log in to the <strong>ELV Project Coordinator</strong> to view your full task list and begin work.
    </p>
  `;

  return sendMail({
    to: userEmail,
    subject: `[ELV] New Project Assigned: ${projectName}`,
    html: wrapEmail(body)
  });
}

module.exports = { sendMail, sendProjectAssignmentEmail };
