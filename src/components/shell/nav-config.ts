import type { ModuleKey } from '@/server/auth/permissions';

export interface NavItem {
  href: string;
  labelAr: string;
  labelEn: string;
  icon: string;
  /** الصلاحية المطلوبة لعرض العنصر — الإخفاء تجميلي فقط، الحماية على السيرفر. */
  module?: ModuleKey;
  badge?: 'notifications' | 'myTasks' | 'approvals';
}

export interface NavSection {
  labelAr: string;
  labelEn: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    labelAr: 'الرئيسية',
    labelEn: 'Home',
    items: [
      { href: '/dashboard', labelAr: 'لوحة التحكم', labelEn: 'Dashboard', icon: 'LayoutDashboard' },
      { href: '/my-tasks', labelAr: 'مهامي', labelEn: 'My tasks', icon: 'ListChecks', module: 'tasks', badge: 'myTasks' },
      { href: '/notifications', labelAr: 'الإشعارات', labelEn: 'Notifications', icon: 'Bell', badge: 'notifications' },
    ],
  },
  {
    labelAr: 'المبيعات',
    labelEn: 'Sales',
    items: [
      { href: '/leads', labelAr: 'العملاء المحتملون', labelEn: 'Leads', icon: 'UserPlus', module: 'leads' },
      { href: '/pipeline', labelAr: 'مسار المبيعات', labelEn: 'Pipeline', icon: 'Kanban', module: 'deals' },
      { href: '/deals', labelAr: 'الصفقات', labelEn: 'Deals', icon: 'Handshake', module: 'deals' },
      { href: '/quotations', labelAr: 'عروض الأسعار', labelEn: 'Quotations', icon: 'FileText', module: 'quotations' },
    ],
  },
  {
    labelAr: 'العملاء',
    labelEn: 'Clients',
    items: [
      { href: '/clients', labelAr: 'العملاء', labelEn: 'Clients', icon: 'Building2', module: 'clients' },
      { href: '/contracts', labelAr: 'العقود', labelEn: 'Contracts', icon: 'FileSignature', module: 'contracts' },
      { href: '/services', labelAr: 'الخدمات والباقات', labelEn: 'Services', icon: 'Package', module: 'services' },
    ],
  },
  {
    labelAr: 'العمليات',
    labelEn: 'Operations',
    items: [
      { href: '/projects', labelAr: 'المشاريع', labelEn: 'Projects', icon: 'FolderKanban', module: 'projects' },
      { href: '/tasks', labelAr: 'المهام', labelEn: 'Tasks', icon: 'CheckSquare', module: 'tasks' },
      { href: '/approvals', labelAr: 'الاعتمادات والتعديلات', labelEn: 'Approvals', icon: 'BadgeCheck', module: 'approvals', badge: 'approvals' },
    ],
  },
  {
    labelAr: 'المالية',
    labelEn: 'Finance',
    items: [
      { href: '/invoices', labelAr: 'الفواتير', labelEn: 'Invoices', icon: 'Receipt', module: 'invoices' },
      { href: '/payments', labelAr: 'المدفوعات', labelEn: 'Payments', icon: 'Wallet', module: 'payments' },
      { href: '/expenses', labelAr: 'المصروفات', labelEn: 'Expenses', icon: 'CreditCard', module: 'expenses' },
    ],
  },
  {
    labelAr: 'التقارير والإدارة',
    labelEn: 'Reports & Admin',
    items: [
      { href: '/reports', labelAr: 'التقارير', labelEn: 'Reports', icon: 'BarChart3', module: 'reports' },
      { href: '/users', labelAr: 'المستخدمون', labelEn: 'Users', icon: 'Users', module: 'users' },
      { href: '/settings', labelAr: 'الإعدادات', labelEn: 'Settings', icon: 'Settings', module: 'settings' },
      { href: '/audit', labelAr: 'سجل التدقيق', labelEn: 'Audit log', icon: 'ScrollText', module: 'audit' },
    ],
  },
];
