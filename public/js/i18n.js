/* ═══════════════════════════════════════════════════════
   i18n — English / Arabic translations
   Toggle: localStorage key 'elv_lang' = 'en' | 'ar'
═══════════════════════════════════════════════════════ */

const TRANSLATIONS = {
  en: {
    // ── Navigation ──
    'nav.overview':        'Overview',
    'nav.dashboard':       'Dashboard',
    'nav.analytics':       'Analytics',
    'nav.projects_section':'Projects',
    'nav.all_projects':    'All Projects',
    'nav.new_project':     'New Project',
    'nav.assign_team':     'Assign Team',
    'nav.reports':         'Reports',
    'nav.management':      'Management',
    'nav.users':           'Users',
    'nav.daily_summary':   'Daily Summary',
    'nav.settings':        'Settings',
    'nav.my_work':         'My Work',
    'nav.my_projects':     'My Projects',
    'nav.active_tasks':    'Active Tasks',
    'nav.my_reports':      'My Reports',
    // ── Page titles ──
    'page.dashboard':      'Dashboard',
    'page.analytics':      'Analytics',
    'page.projects':       'All Projects',
    'page.new_project':    'New Project',
    'page.assign_team':    'Assign Team',
    'page.reports':        'Reports',
    'page.users':          'Users',
    'page.settings':       'Settings',
    'page.daily_summary':  'Daily Summary',
    'page.my_projects':    'My Projects',
    'page.active_tasks':   'Active Tasks',
    'page.my_reports':     'My Reports',
    // ── Buttons ──
    'btn.logout':          'Logout',
    'btn.assign':          'Assign',
    'btn.assign_team':     'Assign Team',
    'btn.edit':            'Edit',
    'btn.delete':          'Delete',
    'btn.approve':         '✓ Approve',
    'btn.reject':          '✗ Reject',
    'btn.save':            'Save',
    'btn.cancel':          'Cancel',
    'btn.view_all':        'View All',
    'btn.view_tasks':      'View Tasks →',
    'btn.submit_report':   'Submit Report',
    'btn.save_notes':      'Save Notes',
    'btn.mark_complete':   '✓ Mark as Complete',
    'btn.sign_in':         'Sign In',
    'btn.create_user':     'Create User',
    'btn.create_project':  'Create Project',
    // ── Status ──
    'status.pending':      'Pending',
    'status.in_progress':  'In Progress',
    'status.completed':    'Completed',
    'status.cancelled':    'Cancelled',
    'status.on_hold':      'On Hold',
    'status.approved':     'Approved',
    'status.rejected':     'Rejected',
    'status.needs_revision':'Needs Revision',
    // ── Labels ──
    'label.work_done':     'Work Done',
    'label.issues_found':  'Issues Found',
    'label.next_steps':    'Next Steps',
    'label.hours_spent':   'Hours Spent',
    'label.scope_of_work': 'Scope of Work',
    'label.issue_details': 'Issue Details',
    'label.my_notes':      'My Notes',
    'label.admin_notes':   'Admin Notes',
    'label.last_report':   'Last Report',
    'label.equipment':     'Equipment / Devices',
    'label.task_checklist':'Task Checklist',
    'label.assigned_team': 'Assigned Team',
    'label.select_project':'Select Project:',
    'label.username':      'Username',
    'label.password':      'Password',
    // ── Stat labels ──
    'stat.total_assigned': 'Total Assigned',
    'stat.in_progress':    'In Progress',
    'stat.completed':      'Completed',
    'stat.pending':        'Pending',
    'stat.total_projects': 'Total Projects',
    'stat.active_projects':'Active Projects',
    'stat.pending_reviews':'Pending Reviews',
    'stat.team_members':   'Team Members',
    // ── Priority ──
    'priority.low':        'Low',
    'priority.normal':     'Normal',
    'priority.medium':     'Medium',
    'priority.high':       'High',
    'priority.critical':   'Critical',
    'priority.urgent':     'Urgent',
    // ── Messages ──
    'msg.loading':               'Loading...',
    'msg.no_projects':           'No Projects Assigned',
    'msg.no_reports':            'No Reports Yet',
    'msg.no_reports_submitted':  'No reports submitted yet',
    'msg.no_notifications':      'No notifications',
    'notif.panel_title':         'Notifications',
    'notif.mark_all_read':       'Mark all read',
    'msg.select_project':        'Select a project above to view its tasks',
    'msg.admin_feedback':        'Admin feedback:',
    'msg.report':                'Report',
    'msg.admin_label':           'Admin:',
    'msg.no_client':             'No client',
    'msg.no_client_specified':   'No client specified',
    'msg.no_checklist':          'No checklist items',
    'msg.no_modules':            'No modules assigned',
    'msg.admin_notes_label':     'Admin Notes:',
    'msg.module_hash':           'Module #',
    'msg.submitted_by':          'Submitted by',
    'msg.reopened':              'Reopened',
    'msg.new_work_requested':    'New work requested',
    // ── Login ──
    'login.title':         'Projects Coordination Platform',
    'login.username':      'Username',
    'login.password':      'Password',
    'login.sign_in':       'Sign In',
    // ── Report modal ──
    'report.title':        'Submit Work Report',
    'report.work_done':    'Work Done *',
    'report.issues':       'Issues Found',
    'report.next_steps':   'Next Steps',
    'report.notes':        'Additional Notes',
    'report.hours':        'Hours Spent',
    'report.submit':       'Submit Report',
    'report.placeholder_work':   'Describe the work you completed...',
    'report.placeholder_issues': 'Any issues or observations...',
    'report.placeholder_next':   'What needs to be done next...',
    'report.placeholder_notes':  'Any additional notes...',
    'report.placeholder_hours':  'e.g. 4.5',
    // ── Change password ──
    'pw.title':     'Change Password',
    'pw.current':   'Current Password',
    'pw.new':       'New Password',
    'pw.confirm':   'Confirm New Password',
    // ── Cards ──
    'card.recent_projects':  'Recent Projects',
    'card.module_breakdown': 'Module Type Breakdown',
    'card.no_projects':      'No projects yet',
    // ── Prompts ──
    'prompt.rejection_reason': 'Reason for rejection:',
    'prompt.confirm_complete': 'Mark this module as complete and notify admin?',
    // ── Module types ──
    'module.maintenance':   'Maintenance',
    'module.handover':      'Handover',
    'module.installation':  'Installation and Wiring',
    'module.programming':   'Programming and Trouble Shooting',
    'module.delivering':    'Delivering',
    'module.site_survey':   'Site Survey',
    'module.poc':           'POC',
    // ── Notifications ──
    'notif.project_assigned.title': 'New Project Assigned: {project}',
    'notif.project_assigned.msg':   'You have been assigned to project "{project}". Please review your tasks.',
    'notif.project_created.title':  'Project Created: {project}',
    'notif.project_created.msg':    'The project "{project}" you are associated with has been created and assigned.',
    'notif.report_submitted.title': 'Report Submitted: {project}',
    'notif.report_submitted.msg':   '{user} submitted a report for module #{module}',
    'notif.ticket_reopened.title':  'Ticket Reopened: {project}',
    'notif.ticket_reopened.msg':    'Module "{module}" has been reopened. Client reason: {reason}',
    // ── Misc ──
    'misc.lang_toggle':  'عربي',
    'misc.admin':        'Admin',
    'misc.tbd':          'TBD',
    'misc.qty':          'Qty',
    'misc.sn':           'SN',
    'misc.choose_project': '— Choose a project —',
    'misc.completed_on': 'Completed',
    'misc.hours_suffix': 'h',
  },

  ar: {
    // ── Navigation ──
    'nav.overview':        'نظرة عامة',
    'nav.dashboard':       'لوحة التحكم',
    'nav.analytics':       'التحليلات',
    'nav.projects_section':'المشاريع',
    'nav.all_projects':    'جميع المشاريع',
    'nav.new_project':     'مشروع جديد',
    'nav.assign_team':     'تعيين الفريق',
    'nav.reports':         'التقارير',
    'nav.management':      'الإدارة',
    'nav.users':           'المستخدمون',
    'nav.daily_summary':   'الملخص اليومي',
    'nav.settings':        'الإعدادات',
    'nav.my_work':         'عملي',
    'nav.my_projects':     'مشاريعي',
    'nav.active_tasks':    'المهام النشطة',
    'nav.my_reports':      'تقاريري',
    // ── Page titles ──
    'page.dashboard':      'لوحة التحكم',
    'page.analytics':      'التحليلات',
    'page.projects':       'جميع المشاريع',
    'page.new_project':    'مشروع جديد',
    'page.assign_team':    'تعيين الفريق',
    'page.reports':        'التقارير',
    'page.users':          'المستخدمون',
    'page.settings':       'الإعدادات',
    'page.daily_summary':  'الملخص اليومي',
    'page.my_projects':    'مشاريعي',
    'page.active_tasks':   'المهام النشطة',
    'page.my_reports':     'تقاريري',
    // ── Buttons ──
    'btn.logout':          'تسجيل الخروج',
    'btn.assign':          'تعيين',
    'btn.assign_team':     'تعيين الفريق',
    'btn.edit':            'تعديل',
    'btn.delete':          'حذف',
    'btn.approve':         '✓ موافقة',
    'btn.reject':          '✗ رفض',
    'btn.save':            'حفظ',
    'btn.cancel':          'إلغاء',
    'btn.view_all':        'عرض الكل',
    'btn.view_tasks':      '← عرض المهام',
    'btn.submit_report':   'إرسال التقرير',
    'btn.save_notes':      'حفظ الملاحظات',
    'btn.mark_complete':   '✓ تحديد كمكتمل',
    'btn.sign_in':         'تسجيل الدخول',
    'btn.create_user':     'إنشاء مستخدم',
    'btn.create_project':  'إنشاء مشروع',
    // ── Status ──
    'status.pending':      'قيد الانتظار',
    'status.in_progress':  'جاري التنفيذ',
    'status.completed':    'مكتمل',
    'status.cancelled':    'ملغي',
    'status.on_hold':      'في الانتظار',
    'status.approved':     'موافق عليه',
    'status.rejected':     'مرفوض',
    'status.needs_revision':'يحتاج مراجعة',
    // ── Labels ──
    'label.work_done':     'العمل المنجز',
    'label.issues_found':  'المشاكل المكتشفة',
    'label.next_steps':    'الخطوات التالية',
    'label.hours_spent':   'الساعات المستغرقة',
    'label.scope_of_work': 'نطاق العمل',
    'label.issue_details': 'تفاصيل المشكلة',
    'label.my_notes':      'ملاحظاتي',
    'label.admin_notes':   'ملاحظات المدير',
    'label.last_report':   'آخر تقرير',
    'label.equipment':     'المعدات والأجهزة',
    'label.task_checklist':'قائمة المهام',
    'label.assigned_team': 'الفريق المعين',
    'label.select_project':'اختر المشروع:',
    'label.username':      'اسم المستخدم',
    'label.password':      'كلمة المرور',
    // ── Stat labels ──
    'stat.total_assigned': 'إجمالي المعين',
    'stat.in_progress':    'قيد التنفيذ',
    'stat.completed':      'مكتمل',
    'stat.pending':        'معلق',
    'stat.total_projects': 'إجمالي المشاريع',
    'stat.active_projects':'المشاريع النشطة',
    'stat.pending_reviews':'مراجعات معلقة',
    'stat.team_members':   'أعضاء الفريق',
    // ── Priority ──
    'priority.low':        'منخفض',
    'priority.normal':     'عادي',
    'priority.medium':     'متوسط',
    'priority.high':       'عالٍ',
    'priority.critical':   'حرج',
    'priority.urgent':     'عاجل',
    // ── Messages ──
    'msg.loading':               'جارٍ التحميل...',
    'msg.no_projects':           'لا توجد مشاريع معينة',
    'msg.no_reports':            'لا توجد تقارير بعد',
    'msg.no_reports_submitted':  'لم يتم تقديم أي تقارير بعد',
    'msg.no_notifications':      'لا توجد إشعارات',
    'notif.panel_title':         'الإشعارات',
    'notif.mark_all_read':       'تعيين الكل كمقروء',
    'msg.select_project':        'اختر مشروعاً أعلاه لعرض مهامه',
    'msg.admin_feedback':        'ملاحظات المدير:',
    'msg.report':                'تقرير',
    'msg.admin_label':           'المدير:',
    'msg.no_client':             'بدون عميل',
    'msg.no_client_specified':   'لم يُحدَّد عميل',
    'msg.no_checklist':          'لا توجد مهام في القائمة',
    'msg.no_modules':            'لا توجد وحدات معينة',
    'msg.admin_notes_label':     'ملاحظات المدير:',
    'msg.module_hash':           'وحدة #',
    'msg.submitted_by':          'قُدِّم بواسطة',
    'msg.reopened':              'أُعيد فتحه',
    'msg.new_work_requested':    'طلب عمل جديد',
    // ── Login ──
    'login.title':         'منصة تنسيق المشاريع',
    'login.username':      'اسم المستخدم',
    'login.password':      'كلمة المرور',
    'login.sign_in':       'تسجيل الدخول',
    // ── Report modal ──
    'report.title':        'إرسال تقرير العمل',
    'report.work_done':    'العمل المنجز *',
    'report.issues':       'المشاكل المكتشفة',
    'report.next_steps':   'الخطوات التالية',
    'report.notes':        'ملاحظات إضافية',
    'report.hours':        'الساعات المستغرقة',
    'report.submit':       'إرسال التقرير',
    'report.placeholder_work':   'صف العمل الذي أنجزته...',
    'report.placeholder_issues': 'أي مشاكل أو ملاحظات...',
    'report.placeholder_next':   'ما الذي يجب القيام به لاحقاً...',
    'report.placeholder_notes':  'أي ملاحظات إضافية...',
    'report.placeholder_hours':  'مثال: 4.5',
    // ── Change password ──
    'pw.title':     'تغيير كلمة المرور',
    'pw.current':   'كلمة المرور الحالية',
    'pw.new':       'كلمة المرور الجديدة',
    'pw.confirm':   'تأكيد كلمة المرور الجديدة',
    // ── Cards ──
    'card.recent_projects':  'المشاريع الأخيرة',
    'card.module_breakdown': 'توزيع أنواع الوحدات',
    'card.no_projects':      'لا توجد مشاريع بعد',
    // ── Prompts ──
    'prompt.rejection_reason': 'سبب الرفض:',
    'prompt.confirm_complete': 'هل تريد تحديد هذه الوحدة كمكتملة وإخطار المدير؟',
    // ── Module types ──
    'module.maintenance':   'صيانة',
    'module.handover':      'تسليم',
    'module.installation':  'تركيب وتمديد أسلاك',
    'module.programming':   'برمجة واستكشاف أعطال',
    'module.delivering':    'توصيل',
    'module.site_survey':   'مسح موقع',
    'module.poc':           'إثبات المفهوم',
    // ── Notifications ──
    'notif.project_assigned.title': 'تم تعيين مشروع جديد: {project}',
    'notif.project_assigned.msg':   'تم تعيينك في مشروع "{project}". يرجى مراجعة مهامك.',
    'notif.project_created.title':  'تم إنشاء مشروع: {project}',
    'notif.project_created.msg':    'تم إنشاء وتعيين مشروع "{project}" الذي ترتبط به.',
    'notif.report_submitted.title': 'تم تقديم تقرير: {project}',
    'notif.report_submitted.msg':   'قدّم {user} تقريراً للوحدة رقم #{module}',
    'notif.ticket_reopened.title':  'تمت إعادة فتح التذكرة: {project}',
    'notif.ticket_reopened.msg':    'تمت إعادة فتح الوحدة "{module}". سبب العميل: {reason}',
    // ── Misc ──
    'misc.lang_toggle':  'English',
    'misc.admin':        'مدير',
    'misc.tbd':          'غير محدد',
    'misc.qty':          'الكمية',
    'misc.sn':           'الرقم التسلسلي',
    'misc.choose_project': '— اختر مشروعاً —',
    'misc.completed_on': 'اكتمل',
    'misc.hours_suffix': 'س',
  }
};

// ── Current language ──────────────────────────────────
let currentLang = localStorage.getItem('elv_lang') || 'en';

// ── Translate key ─────────────────────────────────────
function t(key) {
  return (TRANSLATIONS[currentLang]?.[key]) || (TRANSLATIONS['en']?.[key]) || key;
}

// ── Translate notification using notif_key + notif_params ──
// Falls back to raw title/message for old records without a key
function tNotif(n) {
  if (!n.notif_key) return { title: n.title, message: n.message || '' };
  let params = {};
  try { params = JSON.parse(n.notif_params || '{}'); } catch (e) { /* ignore */ }

  const titleKey = `notif.${n.notif_key}.title`;
  const msgKey   = `notif.${n.notif_key}.msg`;

  const interpolate = (str, p) =>
    str.replace(/\{(\w+)\}/g, (_, k) => p[k] !== undefined ? p[k] : `{${k}}`);

  return {
    title:   interpolate(t(titleKey), params),
    message: interpolate(t(msgKey),   params)
  };
}

// ── Apply data-i18n attributes to DOM ────────────────
function applyTranslations() {
  // Text content
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  // Placeholder attributes
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  // Title attributes (tooltips)
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });

  // RTL / LTR direction
  document.documentElement.lang = currentLang;
  document.documentElement.dir  = currentLang === 'ar' ? 'rtl' : 'ltr';

  // Update toggle button label
  const btn = document.getElementById('lang-toggle-btn');
  if (btn) btn.textContent = t('misc.lang_toggle');
}

// ── Toggle ─────────────────────────────────────────────
function toggleLanguage() {
  currentLang = currentLang === 'en' ? 'ar' : 'en';
  localStorage.setItem('elv_lang', currentLang);
  applyTranslations();
  // Re-render dynamic content if the page exposes a refresh hook
  if (typeof reRenderCurrentPage === 'function') reRenderCurrentPage();
}

// ── Auto-apply on load ────────────────────────────────
document.addEventListener('DOMContentLoaded', applyTranslations);
