import 'server-only';
import { prisma } from '@/server/db';
import { audit } from './audit';

export interface CompanyInfo {
  nameAr: string;
  nameEn: string;
  taxNumber: string;
  commercialReg: string;
  addressAr: string;
  addressEn: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  /** تعليمات السداد كما تظهر أسفل الفاتورة — لا تضع بيانات حساسة لا يجوز للعميل رؤيتها. */
  bankDetails: string;
}

export interface SystemSettings {
  company: CompanyInfo;
  brand: { navy: string; blue: string; cyan: string; red: string };
  locale: { defaultLocale: 'ar' | 'en'; timezone: string; baseCurrency: string };
  quotation: {
    requireInternalApproval: boolean;
    allowSelfApproval: boolean;
    defaultValidityDays: number;
    defaultTermsAr: string;
    defaultTermsEn: string;
  };
  contract: { defaultReminderDays: number[]; expiringSoonDays: number };
  finance: {
    includeIndirectCosts: boolean;
    overdueGraceDays: number;
    defaultPaymentTermsDays: number;
  };
  leads: { requireNextFollowUp: boolean; uncontactedAlertHours: number; staleLeadDays: number };
  projects: { atRiskDaysBeforeEnd: number; atRiskProgressThreshold: number; clientWaitAlertDays: number };
  files: { maxSizeMb: number; allowedTypes: string[]; retentionDays: number };
  backup: { enabled: boolean; retentionDays: number; notifyEmail: string };
  security: {
    /** مفاتيح الأدوار التي يُلزَم أصحابها بتفعيل المصادقة الثنائية قبل استخدام النظام. */
    requireTwoFactorRoles: string[];
  };
  reports: {
    /** ملخص دوري بالبريد لأصحاب الأدوار المحددة — يُبنى بهوية كل مستلم. */
    digestEnabled: boolean;
    digestPeriod: 'WEEKLY' | 'MONTHLY';
    digestRoles: string[];
  };
}

export const DEFAULT_SETTINGS: SystemSettings = {
  company: {
    nameAr: 'بلو بوينت للتسويق',
    nameEn: 'Blue Point Marketing Agency',
    taxNumber: '',
    commercialReg: '',
    addressAr: '',
    addressEn: '',
    phone: '',
    email: '',
    website: '',
    logoUrl: '/brand/logo-full.png',
    bankDetails: '',
  },
  brand: { navy: '#0B1A2F', blue: '#2C7BE5', cyan: '#3FC8F5', red: '#F5333F' },
  locale: { defaultLocale: 'ar', timezone: 'Africa/Cairo', baseCurrency: 'EGP' },
  quotation: {
    requireInternalApproval: true,
    allowSelfApproval: false,
    defaultValidityDays: 14,
    defaultTermsAr:
      '١. الأسعار المذكورة لا تشمل أي رسوم حكومية إضافية.\n٢. يبدأ التنفيذ بعد سداد الدفعة الأولى.\n٣. العرض ساري خلال المدة الموضحة أعلاه فقط.',
    defaultTermsEn:
      '1. Prices exclude any additional governmental fees.\n2. Execution starts after the first payment.\n3. This quotation is valid only within the stated period.',
  },
  contract: { defaultReminderDays: [30, 14, 7, 1], expiringSoonDays: 30 },
  finance: { includeIndirectCosts: false, overdueGraceDays: 0, defaultPaymentTermsDays: 15 },
  leads: { requireNextFollowUp: true, uncontactedAlertHours: 24, staleLeadDays: 14 },
  projects: { atRiskDaysBeforeEnd: 7, atRiskProgressThreshold: 70, clientWaitAlertDays: 5 },
  files: {
    maxSizeMb: Number(process.env.MAX_UPLOAD_MB ?? 25),
    allowedTypes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/svg+xml',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip',
      'video/mp4',
      'audio/mpeg',
      'text/csv',
      'text/plain',
    ],
    retentionDays: 3650,
  },
  backup: { enabled: true, retentionDays: 30, notifyEmail: '' },
  // الحسابات الأعلى صلاحية أولًا: من يملكها يستطيع تعديل الصلاحيات ورؤية كل
  // البيانات المالية، فاختراق واحد منها يكافئ اختراق النظام كله.
  security: { requireTwoFactorRoles: ['SUPER_ADMIN'] },
  // معطّل افتراضيًا: إرسال أرقام الشركة بالبريد قرار إداري لا إعداد ضمني.
  reports: { digestEnabled: false, digestPeriod: 'WEEKLY', digestRoles: [] },
};

type SettingsCache = { value: SystemSettings; at: number } | null;
let cache: SettingsCache = null;
const TTL_MS = 30_000;

function deepMerge<T>(base: T, override: unknown): T {
  if (override === null || override === undefined) return base;
  if (typeof base !== 'object' || Array.isArray(base) || base === null) return override as T;
  const out = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    out[k] = k in out ? deepMerge((base as Record<string, unknown>)[k], v) : v;
  }
  return out as T;
}

export async function getSettings(force = false): Promise<SystemSettings> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await prisma.setting.findMany();
  let merged: SystemSettings = structuredClone(DEFAULT_SETTINGS);
  for (const row of rows) {
    merged = deepMerge(merged, { [row.key]: row.value }) as SystemSettings;
  }
  cache = { value: merged, at: Date.now() };
  return merged;
}

export function invalidateSettingsCache() {
  cache = null;
}

export async function updateSettingSection<K extends keyof SystemSettings>(
  key: K,
  value: SystemSettings[K],
  userId: string,
) {
  const before = await prisma.setting.findUnique({ where: { key: String(key) } });
  await prisma.setting.upsert({
    where: { key: String(key) },
    create: { key: String(key), category: String(key), value: value as object, updatedBy: userId },
    update: { value: value as object, updatedBy: userId },
  });
  invalidateSettingsCache();
  await audit({
    userId,
    action: 'UPDATE',
    module: 'settings',
    entityType: 'SETTING',
    entityId: String(key),
    summary: `تحديث إعدادات ${String(key)}`,
    oldValue: before?.value,
    newValue: value,
  });
}
