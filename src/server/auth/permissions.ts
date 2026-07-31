/**
 * Single Source of Truth لمصفوفة الصلاحيات.
 * docs/01-roles-permissions.md توثيق مطابق لهذا الملف.
 */

export const MODULES = [
  'leads',
  'deals',
  'clients',
  'contacts',
  'services',
  'quotations',
  'contracts',
  'projects',
  'tasks',
  'approvals',
  'files',
  'invoices',
  'payments',
  'expenses',
  'ad_wallets',
  'reports',
  'notifications',
  'users',
  'roles',
  'settings',
  'audit',
] as const;

export const ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'restore',
  'purge',
  'assign',
  'approve',
  'export',
  'view_financial',
  'view_cost_profit',
  'manage',
] as const;

export type ModuleKey = (typeof MODULES)[number];
export type ActionKey = (typeof ACTIONS)[number];
export type Scope = 'OWN' | 'TEAM' | 'ALL';

export const ROLE_KEYS = [
  'SUPER_ADMIN',
  'OPERATIONS_MANAGER',
  'SALES_MANAGER',
  'SALES_AGENT',
  'ACCOUNT_MANAGER',
  'CONTENT_CREATOR',
  'GRAPHIC_DESIGNER',
  'VIDEO_EDITOR',
  'MEDIA_BUYER',
  'FINANCE',
  'VIEWER',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, { ar: string; en: string }> = {
  SUPER_ADMIN: { ar: 'المدير التنفيذي / صلاحية كاملة', en: 'CEO / Super Admin' },
  OPERATIONS_MANAGER: { ar: 'مدير العمليات', en: 'Operations Manager' },
  SALES_MANAGER: { ar: 'مدير المبيعات', en: 'Sales Manager' },
  SALES_AGENT: { ar: 'مندوب مبيعات', en: 'Sales Agent' },
  ACCOUNT_MANAGER: { ar: 'مدير حسابات العملاء', en: 'Account Manager' },
  CONTENT_CREATOR: { ar: 'صانع محتوى', en: 'Content Creator' },
  GRAPHIC_DESIGNER: { ar: 'مصمم جرافيك', en: 'Graphic Designer' },
  VIDEO_EDITOR: { ar: 'مونتير', en: 'Video Editor' },
  MEDIA_BUYER: { ar: 'ميديا باير', en: 'Media Buyer' },
  FINANCE: { ar: 'المالية', en: 'Finance' },
  VIEWER: { ar: 'مشاهدة فقط', en: 'Viewer' },
};

export const MODULE_LABELS: Record<ModuleKey, { ar: string; en: string }> = {
  leads: { ar: 'العملاء المحتملون', en: 'Leads' },
  deals: { ar: 'الصفقات', en: 'Deals' },
  clients: { ar: 'العملاء', en: 'Clients' },
  contacts: { ar: 'جهات الاتصال', en: 'Contacts' },
  services: { ar: 'الخدمات', en: 'Services' },
  quotations: { ar: 'عروض الأسعار', en: 'Quotations' },
  contracts: { ar: 'العقود', en: 'Contracts' },
  projects: { ar: 'المشاريع', en: 'Projects' },
  tasks: { ar: 'المهام', en: 'Tasks' },
  approvals: { ar: 'الاعتمادات', en: 'Approvals' },
  files: { ar: 'الملفات', en: 'Files' },
  invoices: { ar: 'الفواتير', en: 'Invoices' },
  payments: { ar: 'المدفوعات', en: 'Payments' },
  expenses: { ar: 'المصروفات', en: 'Expenses' },
  ad_wallets: { ar: 'أرصدة إعلانات العملاء', en: 'Client Ad Wallets' },
  reports: { ar: 'التقارير', en: 'Reports' },
  notifications: { ar: 'الإشعارات', en: 'Notifications' },
  users: { ar: 'المستخدمون', en: 'Users' },
  roles: { ar: 'الأدوار', en: 'Roles' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
  audit: { ar: 'سجل التدقيق', en: 'Audit Log' },
};

export const ACTION_LABELS: Record<ActionKey, { ar: string; en: string }> = {
  view: { ar: 'عرض', en: 'View' },
  create: { ar: 'إنشاء', en: 'Create' },
  edit: { ar: 'تعديل', en: 'Edit' },
  delete: { ar: 'حذف', en: 'Delete' },
  restore: { ar: 'استرجاع', en: 'Restore' },
  purge: { ar: 'حذف نهائي', en: 'Purge' },
  assign: { ar: 'إسناد', en: 'Assign' },
  approve: { ar: 'اعتماد', en: 'Approve' },
  export: { ar: 'تصدير', en: 'Export' },
  view_financial: { ar: 'عرض البيانات المالية', en: 'View financial data' },
  view_cost_profit: { ar: 'عرض التكلفة والربح', en: 'View cost & profit' },
  manage: { ar: 'إدارة كاملة', en: 'Manage' },
};

type Grant = [ModuleKey, ActionKey[], Scope];

const ALL_ACTIONS = [...ACTIONS] as ActionKey[];

/** الصلاحيات الافتراضية لكل دور — تُزرع في قاعدة البيانات وتبقى قابلة للتعديل من الإعدادات. */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, Grant[]> = {
  SUPER_ADMIN: MODULES.map((m) => [m, ALL_ACTIONS, 'ALL'] as Grant),

  OPERATIONS_MANAGER: [
    ['leads', ['view'], 'ALL'],
    ['deals', ['view', 'view_financial'], 'ALL'],
    ['clients', ['view', 'edit'], 'ALL'],
    ['contacts', ['view', 'create', 'edit'], 'ALL'],
    ['services', ['view'], 'ALL'],
    ['quotations', ['view', 'view_financial'], 'ALL'],
    ['contracts', ['view', 'view_financial'], 'ALL'],
    ['projects', ['view', 'create', 'edit', 'delete', 'restore', 'assign', 'approve', 'export', 'view_financial'], 'ALL'],
    ['tasks', ['view', 'create', 'edit', 'delete', 'restore', 'assign', 'approve', 'export'], 'ALL'],
    ['approvals', ['view', 'approve'], 'ALL'],
    ['files', ['view', 'create', 'edit', 'delete', 'restore'], 'ALL'],
    ['invoices', ['view', 'view_financial'], 'ALL'],
    ['payments', ['view', 'view_financial'], 'ALL'],
    ['expenses', ['view', 'create', 'edit', 'view_financial'], 'ALL'],
    ['reports', ['view', 'export'], 'ALL'],
    ['notifications', ['view', 'edit'], 'OWN'],
    ['users', ['view'], 'ALL'],
    ['settings', ['view', 'edit'], 'ALL'],
    ['audit', ['view'], 'ALL'],
  ],

  SALES_MANAGER: [
    ['leads', ['view', 'create', 'edit', 'delete', 'restore', 'assign', 'approve', 'export'], 'TEAM'],
    ['deals', ['view', 'create', 'edit', 'delete', 'restore', 'assign', 'approve', 'export', 'view_financial'], 'TEAM'],
    ['clients', ['view', 'create', 'edit', 'assign'], 'TEAM'],
    ['contacts', ['view', 'create', 'edit'], 'TEAM'],
    ['services', ['view'], 'ALL'],
    ['quotations', ['view', 'create', 'edit', 'delete', 'restore', 'approve', 'export', 'view_financial'], 'TEAM'],
    ['contracts', ['view', 'create', 'edit', 'view_financial'], 'TEAM'],
    ['projects', ['view'], 'TEAM'],
    ['tasks', ['view', 'create', 'edit', 'assign'], 'TEAM'],
    ['approvals', ['view', 'approve'], 'TEAM'],
    ['files', ['view', 'create', 'edit', 'delete'], 'TEAM'],
    ['invoices', ['view', 'view_financial'], 'TEAM'],
    ['reports', ['view', 'export', 'view_financial'], 'TEAM'],
    ['notifications', ['view', 'edit'], 'OWN'],
    ['users', ['view'], 'TEAM'],
    ['audit', ['view'], 'TEAM'],
  ],

  SALES_AGENT: [
    ['leads', ['view', 'create', 'edit', 'assign'], 'OWN'],
    ['deals', ['view', 'create', 'edit', 'assign', 'view_financial'], 'OWN'],
    ['clients', ['view'], 'OWN'],
    ['contacts', ['view', 'create', 'edit'], 'OWN'],
    ['services', ['view'], 'ALL'],
    ['quotations', ['view', 'create', 'edit', 'view_financial'], 'OWN'],
    ['contracts', ['view', 'view_financial'], 'OWN'],
    ['projects', ['view'], 'OWN'],
    ['tasks', ['view', 'create', 'edit'], 'OWN'],
    ['approvals', ['view'], 'OWN'],
    ['files', ['view', 'create', 'edit'], 'OWN'],
    ['notifications', ['view', 'edit'], 'OWN'],
  ],

  ACCOUNT_MANAGER: [
    ['leads', ['view'], 'TEAM'],
    ['deals', ['view', 'view_financial'], 'TEAM'],
    ['clients', ['view', 'create', 'edit', 'assign'], 'TEAM'],
    ['contacts', ['view', 'create', 'edit'], 'TEAM'],
    ['services', ['view'], 'ALL'],
    ['quotations', ['view', 'view_financial'], 'TEAM'],
    ['contracts', ['view', 'view_financial'], 'TEAM'],
    ['projects', ['view', 'create', 'edit', 'assign'], 'TEAM'],
    ['tasks', ['view', 'create', 'edit', 'assign', 'approve'], 'TEAM'],
    ['approvals', ['view', 'approve'], 'TEAM'],
    ['files', ['view', 'create', 'edit', 'delete'], 'TEAM'],
    ['invoices', ['view', 'view_financial'], 'TEAM'],
    ['payments', ['view', 'view_financial'], 'TEAM'],
    ['reports', ['view'], 'TEAM'],
    ['notifications', ['view', 'edit'], 'OWN'],
    ['users', ['view'], 'TEAM'],
  ],

  CONTENT_CREATOR: [
    ['clients', ['view'], 'TEAM'],
    ['services', ['view'], 'ALL'],
    ['projects', ['view'], 'OWN'],
    ['tasks', ['view', 'create', 'edit', 'assign'], 'OWN'],
    ['approvals', ['view'], 'OWN'],
    ['files', ['view', 'create', 'edit'], 'OWN'],
    ['notifications', ['view', 'edit'], 'OWN'],
  ],

  GRAPHIC_DESIGNER: [
    ['clients', ['view'], 'TEAM'],
    ['services', ['view'], 'ALL'],
    ['projects', ['view'], 'OWN'],
    ['tasks', ['view', 'create', 'edit', 'assign'], 'OWN'],
    ['approvals', ['view'], 'OWN'],
    ['files', ['view', 'create', 'edit'], 'OWN'],
    ['notifications', ['view', 'edit'], 'OWN'],
  ],

  VIDEO_EDITOR: [
    ['clients', ['view'], 'TEAM'],
    ['services', ['view'], 'ALL'],
    ['projects', ['view'], 'OWN'],
    ['tasks', ['view', 'create', 'edit', 'assign'], 'OWN'],
    ['approvals', ['view'], 'OWN'],
    ['files', ['view', 'create', 'edit'], 'OWN'],
    ['notifications', ['view', 'edit'], 'OWN'],
  ],

  MEDIA_BUYER: [
    ['leads', ['view'], 'TEAM'],
    ['deals', ['view'], 'TEAM'],
    ['clients', ['view'], 'TEAM'],
    ['services', ['view'], 'ALL'],
    ['projects', ['view'], 'OWN'],
    ['tasks', ['view', 'create', 'edit', 'assign'], 'OWN'],
    ['approvals', ['view'], 'OWN'],
    ['files', ['view', 'create', 'edit'], 'OWN'],
    ['expenses', ['view', 'create', 'edit', 'view_financial'], 'OWN'],
    ['notifications', ['view', 'edit'], 'OWN'],
  ],

  FINANCE: [
    ['deals', ['view', 'view_financial'], 'ALL'],
    ['clients', ['view', 'view_financial'], 'ALL'],
    ['contacts', ['view'], 'ALL'],
    ['services', ['view', 'view_financial'], 'ALL'],
    ['quotations', ['view', 'export', 'view_financial'], 'ALL'],
    ['contracts', ['view', 'export', 'view_financial'], 'ALL'],
    ['projects', ['view', 'view_financial'], 'ALL'],
    ['tasks', ['view'], 'ALL'],
    ['files', ['view', 'create'], 'ALL'],
    ['invoices', ['view', 'create', 'edit', 'delete', 'restore', 'approve', 'export', 'view_financial'], 'ALL'],
    ['payments', ['view', 'create', 'edit', 'delete', 'restore', 'export', 'view_financial'], 'ALL'],
    ['expenses', ['view', 'create', 'edit', 'delete', 'restore', 'export', 'view_financial', 'view_cost_profit'], 'ALL'],
    ['ad_wallets', ['view', 'create', 'edit', 'export'], 'ALL'],
    ['reports', ['view', 'export', 'view_financial', 'view_cost_profit'], 'ALL'],
    ['notifications', ['view', 'edit'], 'OWN'],
    ['users', ['view'], 'ALL'],
    ['settings', ['view', 'edit'], 'ALL'],
    ['audit', ['view', 'view_financial'], 'ALL'],
  ],

  VIEWER: [
    ['leads', ['view'], 'TEAM'],
    ['deals', ['view'], 'TEAM'],
    ['clients', ['view'], 'TEAM'],
    ['contacts', ['view'], 'TEAM'],
    ['services', ['view'], 'ALL'],
    ['projects', ['view'], 'TEAM'],
    ['tasks', ['view'], 'TEAM'],
    ['files', ['view'], 'TEAM'],
    ['reports', ['view'], 'TEAM'],
    ['notifications', ['view', 'edit'], 'OWN'],
  ],
};

export type PermissionKey = `${ModuleKey}.${ActionKey}`;

/** خريطة الصلاحية → النطاق. غياب المفتاح = ممنوع. */
export type PermissionMap = Partial<Record<PermissionKey, Scope>>;

const SCOPE_RANK: Record<Scope, number> = { OWN: 1, TEAM: 2, ALL: 3 };

export function scopeAtLeast(actual: Scope | undefined, required: Scope): boolean {
  if (!actual) return false;
  return SCOPE_RANK[actual] >= SCOPE_RANK[required];
}

export function buildPermissionMap(
  rolePerms: { module: string; action: string; scope: Scope }[],
  overrides: { module: string; action: string; scope: Scope; allow: boolean }[] = [],
): PermissionMap {
  const map: PermissionMap = {};
  for (const p of rolePerms) map[`${p.module}.${p.action}` as PermissionKey] = p.scope;
  for (const o of overrides) {
    const key = `${o.module}.${o.action}` as PermissionKey;
    if (o.allow) map[key] = o.scope;
    else delete map[key];
  }
  return map;
}
