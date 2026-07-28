import type { Locale } from './dictionary';

type Pair = { ar: string; en: string; tone: Tone };
export type Tone = 'neutral' | 'info' | 'brand' | 'ok' | 'warn' | 'danger' | 'muted';

export const LEAD_STATUS: Record<string, Pair> = {
  NEW: { ar: 'جديد', en: 'New', tone: 'info' },
  WORKING: { ar: 'قيد المتابعة', en: 'Working', tone: 'brand' },
  QUALIFIED: { ar: 'مؤهَّل', en: 'Qualified', tone: 'ok' },
  CONVERTED: { ar: 'تم التحويل', en: 'Converted', tone: 'ok' },
  LOST: { ar: 'خسارة', en: 'Lost', tone: 'danger' },
  ARCHIVED: { ar: 'مؤرشف', en: 'Archived', tone: 'muted' },
};

export const DEAL_STATUS: Record<string, Pair> = {
  OPEN: { ar: 'مفتوحة', en: 'Open', tone: 'brand' },
  WON: { ar: 'ناجحة', en: 'Won', tone: 'ok' },
  LOST: { ar: 'خسارة', en: 'Lost', tone: 'danger' },
};

export const PRIORITY: Record<string, Pair> = {
  LOW: { ar: 'منخفضة', en: 'Low', tone: 'muted' },
  MEDIUM: { ar: 'متوسطة', en: 'Medium', tone: 'info' },
  HIGH: { ar: 'عالية', en: 'High', tone: 'warn' },
  URGENT: { ar: 'عاجلة', en: 'Urgent', tone: 'danger' },
};

export const QUOTATION_STATUS: Record<string, Pair> = {
  DRAFT: { ar: 'مسودة', en: 'Draft', tone: 'muted' },
  PENDING_INTERNAL_APPROVAL: { ar: 'بانتظار الاعتماد الداخلي', en: 'Pending approval', tone: 'warn' },
  APPROVED_INTERNALLY: { ar: 'معتمد داخليًا', en: 'Approved internally', tone: 'info' },
  SENT: { ar: 'مُرسل', en: 'Sent', tone: 'brand' },
  UNDER_REVIEW: { ar: 'قيد مراجعة العميل', en: 'Under review', tone: 'warn' },
  REVISED: { ar: 'مُعدَّل', en: 'Revised', tone: 'info' },
  ACCEPTED: { ar: 'مقبول', en: 'Accepted', tone: 'ok' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected', tone: 'danger' },
  EXPIRED: { ar: 'منتهي', en: 'Expired', tone: 'muted' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', tone: 'muted' },
};

export const CONTRACT_STATUS: Record<string, Pair> = {
  DRAFT: { ar: 'مسودة', en: 'Draft', tone: 'muted' },
  AWAITING_SIGNATURE: { ar: 'بانتظار التوقيع', en: 'Awaiting signature', tone: 'warn' },
  ACTIVE: { ar: 'ساري', en: 'Active', tone: 'ok' },
  EXPIRING_SOON: { ar: 'قارب على الانتهاء', en: 'Expiring soon', tone: 'warn' },
  EXPIRED: { ar: 'منتهي', en: 'Expired', tone: 'danger' },
  RENEWED: { ar: 'مُجدَّد', en: 'Renewed', tone: 'ok' },
  SUSPENDED: { ar: 'موقوف', en: 'Suspended', tone: 'warn' },
  TERMINATED: { ar: 'مُنهى', en: 'Terminated', tone: 'danger' },
};

export const PROJECT_STATUS: Record<string, Pair> = {
  ONBOARDING: { ar: 'تهيئة العميل', en: 'Onboarding', tone: 'info' },
  PLANNING: { ar: 'تخطيط', en: 'Planning', tone: 'info' },
  IN_PROGRESS: { ar: 'قيد التنفيذ', en: 'In progress', tone: 'brand' },
  INTERNAL_REVIEW: { ar: 'مراجعة داخلية', en: 'Internal review', tone: 'warn' },
  CLIENT_REVIEW: { ar: 'مراجعة العميل', en: 'Client review', tone: 'warn' },
  ON_HOLD: { ar: 'متوقف', en: 'On hold', tone: 'muted' },
  AT_RISK: { ar: 'معرض للخطر', en: 'At risk', tone: 'danger' },
  COMPLETED: { ar: 'مكتمل', en: 'Completed', tone: 'ok' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', tone: 'muted' },
};

export const TASK_STATUS: Record<string, Pair> = {
  TODO: { ar: 'لم تبدأ', en: 'To do', tone: 'muted' },
  IN_PROGRESS: { ar: 'قيد التنفيذ', en: 'In progress', tone: 'brand' },
  WAITING_INTERNAL_REVIEW: { ar: 'بانتظار المراجعة الداخلية', en: 'Internal review', tone: 'warn' },
  REVISIONS_REQUIRED: { ar: 'مطلوب تعديلات', en: 'Revisions required', tone: 'danger' },
  WAITING_CLIENT: { ar: 'بانتظار العميل', en: 'Waiting client', tone: 'warn' },
  APPROVED: { ar: 'معتمد', en: 'Approved', tone: 'ok' },
  COMPLETED: { ar: 'مكتمل', en: 'Completed', tone: 'ok' },
  ON_HOLD: { ar: 'متوقف', en: 'On hold', tone: 'muted' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', tone: 'muted' },
};

export const INVOICE_STATUS: Record<string, Pair> = {
  DRAFT: { ar: 'مسودة', en: 'Draft', tone: 'muted' },
  SENT: { ar: 'مُرسلة', en: 'Sent', tone: 'brand' },
  PARTIALLY_PAID: { ar: 'مدفوعة جزئيًا', en: 'Partially paid', tone: 'warn' },
  PAID: { ar: 'مدفوعة', en: 'Paid', tone: 'ok' },
  OVERDUE: { ar: 'متأخرة', en: 'Overdue', tone: 'danger' },
  CANCELLED: { ar: 'ملغاة', en: 'Cancelled', tone: 'muted' },
};

export const CLIENT_STATUS: Record<string, Pair> = {
  PROSPECT: { ar: 'محتمل', en: 'Prospect', tone: 'info' },
  ACTIVE: { ar: 'نشط', en: 'Active', tone: 'ok' },
  PAUSED: { ar: 'متوقف مؤقتًا', en: 'Paused', tone: 'warn' },
  CHURNED: { ar: 'منتهي', en: 'Churned', tone: 'danger' },
};

export const DELIVERABLE_STATUS: Record<string, Pair> = {
  PLANNED: { ar: 'مخطط', en: 'Planned', tone: 'muted' },
  IN_PRODUCTION: { ar: 'قيد الإنتاج', en: 'In production', tone: 'brand' },
  INTERNAL_REVIEW: { ar: 'مراجعة داخلية', en: 'Internal review', tone: 'warn' },
  CLIENT_REVIEW: { ar: 'مراجعة العميل', en: 'Client review', tone: 'warn' },
  APPROVED: { ar: 'معتمد', en: 'Approved', tone: 'ok' },
  DELIVERED: { ar: 'تم التسليم', en: 'Delivered', tone: 'ok' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', tone: 'muted' },
};

export const ACTIVITY_TYPE: Record<string, Pair> = {
  CALL: { ar: 'مكالمة', en: 'Call', tone: 'info' },
  WHATSAPP: { ar: 'واتساب', en: 'WhatsApp', tone: 'ok' },
  EMAIL: { ar: 'بريد إلكتروني', en: 'Email', tone: 'info' },
  MEETING: { ar: 'اجتماع', en: 'Meeting', tone: 'brand' },
  NOTE: { ar: 'ملاحظة', en: 'Note', tone: 'muted' },
  STATUS_CHANGE: { ar: 'تغيير حالة', en: 'Status change', tone: 'warn' },
  ASSIGNMENT: { ar: 'إسناد', en: 'Assignment', tone: 'info' },
  QUOTATION: { ar: 'عرض سعر', en: 'Quotation', tone: 'brand' },
  FOLLOW_UP: { ar: 'متابعة', en: 'Follow-up', tone: 'warn' },
  FILE: { ar: 'ملف', en: 'File', tone: 'muted' },
  SYSTEM: { ar: 'حدث نظام', en: 'System', tone: 'muted' },
  COMMENT: { ar: 'تعليق', en: 'Comment', tone: 'info' },
  APPROVAL: { ar: 'اعتماد', en: 'Approval', tone: 'ok' },
  PAYMENT: { ar: 'دفعة', en: 'Payment', tone: 'ok' },
};

export const PAYMENT_METHOD: Record<string, Pair> = {
  CASH: { ar: 'نقدًا', en: 'Cash', tone: 'neutral' },
  BANK_TRANSFER: { ar: 'تحويل بنكي', en: 'Bank transfer', tone: 'neutral' },
  INSTAPAY: { ar: 'إنستا باي', en: 'InstaPay', tone: 'neutral' },
  VODAFONE_CASH: { ar: 'فودافون كاش', en: 'Vodafone Cash', tone: 'neutral' },
  CHEQUE: { ar: 'شيك', en: 'Cheque', tone: 'neutral' },
  CARD: { ar: 'بطاقة', en: 'Card', tone: 'neutral' },
  PAYPAL: { ar: 'باي بال', en: 'PayPal', tone: 'neutral' },
  OTHER: { ar: 'أخرى', en: 'Other', tone: 'neutral' },
};

export const EXPENSE_CATEGORY: Record<string, Pair> = {
  FREELANCER: { ar: 'فريلانسر', en: 'Freelancer', tone: 'neutral' },
  PRODUCTION: { ar: 'إنتاج', en: 'Production', tone: 'neutral' },
  TRANSPORTATION: { ar: 'انتقالات', en: 'Transportation', tone: 'neutral' },
  TOOLS: { ar: 'أدوات واشتراكات', en: 'Tools', tone: 'neutral' },
  MEDIA_SPEND: { ar: 'إنفاق إعلاني', en: 'Media spend', tone: 'neutral' },
  PRINTING: { ar: 'طباعة', en: 'Printing', tone: 'neutral' },
  OTHER: { ar: 'أخرى', en: 'Other', tone: 'neutral' },
};

export const DELAY_REASON: Record<string, Pair> = {
  NONE: { ar: 'لا يوجد', en: 'None', tone: 'muted' },
  INTERNAL_DELAY: { ar: 'تأخير داخلي', en: 'Internal delay', tone: 'danger' },
  CLIENT_WAITING: { ar: 'انتظار العميل', en: 'Client waiting', tone: 'warn' },
  APPROVED_EXTENSION: { ar: 'تمديد معتمد', en: 'Approved extension', tone: 'info' },
  BLOCKED: { ar: 'معطّل باعتمادية', en: 'Blocked', tone: 'danger' },
  OVERDUE_NO_REASON: { ar: 'متأخر بدون سبب', en: 'Overdue (no reason)', tone: 'danger' },
};

export const CONTACT_TYPE: Record<string, Pair> = {
  MAIN: { ar: 'جهة الاتصال الرئيسية', en: 'Main contact', tone: 'brand' },
  DECISION_MAKER: { ar: 'صاحب القرار', en: 'Decision maker', tone: 'ok' },
  FINANCE: { ar: 'مسؤول مالي', en: 'Finance', tone: 'info' },
  MARKETING: { ar: 'مسؤول تسويق', en: 'Marketing', tone: 'info' },
  APPROVAL: { ar: 'مسؤول الاعتماد', en: 'Approvals', tone: 'warn' },
  TECHNICAL: { ar: 'مسؤول تقني', en: 'Technical', tone: 'neutral' },
};

export const BILLING_TYPE: Record<string, Pair> = {
  ONE_TIME: { ar: 'مرة واحدة', en: 'One-time', tone: 'neutral' },
  MONTHLY_RETAINER: { ar: 'اشتراك شهري', en: 'Monthly retainer', tone: 'brand' },
  RECURRING: { ar: 'متكرر', en: 'Recurring', tone: 'info' },
  PACKAGE: { ar: 'باقة', en: 'Package', tone: 'ok' },
  HOURLY: { ar: 'بالساعة', en: 'Hourly', tone: 'neutral' },
};

export const NOTIFICATION_TYPE: Record<string, Pair> = {
  TASK_ASSIGNED: { ar: 'إسناد مهمة', en: 'Task assigned', tone: 'info' },
  TASK_DUE_SOON: { ar: 'اقتراب موعد مهمة', en: 'Task due soon', tone: 'warn' },
  TASK_OVERDUE: { ar: 'مهمة متأخرة', en: 'Task overdue', tone: 'danger' },
  COMMENT_ADDED: { ar: 'تعليق جديد', en: 'New comment', tone: 'info' },
  USER_MENTIONED: { ar: 'تمت الإشارة إليك', en: 'You were mentioned', tone: 'brand' },
  REVISION_REQUESTED: { ar: 'طلب تعديل', en: 'Revision requested', tone: 'warn' },
  APPROVAL_REQUESTED: { ar: 'طلب اعتماد', en: 'Approval requested', tone: 'warn' },
  WORK_APPROVED: { ar: 'تم الاعتماد', en: 'Work approved', tone: 'ok' },
  LEAD_ASSIGNED: { ar: 'إسناد عميل محتمل', en: 'Lead assigned', tone: 'info' },
  LEAD_NOT_CONTACTED: { ar: 'عميل محتمل بدون تواصل', en: 'Lead not contacted', tone: 'danger' },
  FOLLOW_UP_DUE: { ar: 'متابعة مستحقة', en: 'Follow-up due', tone: 'warn' },
  FOLLOW_UP_OVERDUE: { ar: 'متابعة متأخرة', en: 'Follow-up overdue', tone: 'danger' },
  QUOTATION_EXPIRING: { ar: 'عرض سعر يقارب الانتهاء', en: 'Quotation expiring', tone: 'warn' },
  CONTRACT_EXPIRING: { ar: 'عقد يقارب الانتهاء', en: 'Contract expiring', tone: 'warn' },
  INVOICE_DUE: { ar: 'فاتورة مستحقة', en: 'Invoice due', tone: 'warn' },
  INVOICE_OVERDUE: { ar: 'فاتورة متأخرة', en: 'Invoice overdue', tone: 'danger' },
  PROJECT_AT_RISK: { ar: 'مشروع معرض للخطر', en: 'Project at risk', tone: 'danger' },
  CLIENT_INACTIVE: { ar: 'عميل غير نشط', en: 'Client inactive', tone: 'warn' },
  RENEWAL_DUE: { ar: 'موعد تجديد', en: 'Renewal due', tone: 'warn' },
  SECURITY: { ar: 'تنبيه أمني', en: 'Security alert', tone: 'danger' },
};

export const REVISION_SOURCE: Record<string, Pair> = {
  INTERNAL: { ar: 'داخلي', en: 'Internal', tone: 'info' },
  CLIENT: { ar: 'من العميل', en: 'Client', tone: 'warn' },
};

export const REVISION_STATUS: Record<string, Pair> = {
  OPEN: { ar: 'مفتوح', en: 'Open', tone: 'warn' },
  IN_PROGRESS: { ar: 'قيد التنفيذ', en: 'In progress', tone: 'brand' },
  DONE: { ar: 'منفَّذ', en: 'Done', tone: 'ok' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected', tone: 'danger' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', tone: 'muted' },
};

export const APPROVAL_STATUS: Record<string, Pair> = {
  PENDING: { ar: 'بانتظار القرار', en: 'Pending', tone: 'warn' },
  APPROVED: { ar: 'معتمد', en: 'Approved', tone: 'ok' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected', tone: 'danger' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', tone: 'muted' },
};

export const FOLLOWUP_STATUS: Record<string, Pair> = {
  PENDING: { ar: 'مستحقة', en: 'Pending', tone: 'warn' },
  DONE: { ar: 'تمت', en: 'Done', tone: 'ok' },
  MISSED: { ar: 'فائتة', en: 'Missed', tone: 'danger' },
  CANCELLED: { ar: 'ملغاة', en: 'Cancelled', tone: 'muted' },
};

const REGISTRY: Record<string, Record<string, Pair>> = {
  leadStatus: LEAD_STATUS,
  dealStatus: DEAL_STATUS,
  priority: PRIORITY,
  quotationStatus: QUOTATION_STATUS,
  contractStatus: CONTRACT_STATUS,
  projectStatus: PROJECT_STATUS,
  taskStatus: TASK_STATUS,
  invoiceStatus: INVOICE_STATUS,
  clientStatus: CLIENT_STATUS,
  deliverableStatus: DELIVERABLE_STATUS,
  activityType: ACTIVITY_TYPE,
  paymentMethod: PAYMENT_METHOD,
  expenseCategory: EXPENSE_CATEGORY,
  delayReason: DELAY_REASON,
  contactType: CONTACT_TYPE,
  billingType: BILLING_TYPE,
  notificationType: NOTIFICATION_TYPE,
  revisionSource: REVISION_SOURCE,
  revisionStatus: REVISION_STATUS,
  approvalStatus: APPROVAL_STATUS,
  followUpStatus: FOLLOWUP_STATUS,
};

export function label(kind: keyof typeof REGISTRY | string, key: string, locale: Locale = 'ar') {
  const entry = REGISTRY[kind]?.[key];
  if (!entry) return key;
  return locale === 'ar' ? entry.ar : entry.en;
}

export function tone(kind: keyof typeof REGISTRY | string, key: string): Tone {
  return REGISTRY[kind]?.[key]?.tone ?? 'neutral';
}

export function options(kind: keyof typeof REGISTRY | string, locale: Locale = 'ar') {
  const map = REGISTRY[kind] ?? {};
  return Object.entries(map).map(([value, v]) => ({ value, label: locale === 'ar' ? v.ar : v.en }));
}
