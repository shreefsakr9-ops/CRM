import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { getSettings } from './settings';

/**
 * طبقة إرسال البريد.
 *
 * مبدأ أساسي: النظام يعمل بالكامل بدون SMTP.
 * إذا لم تُضبط الإعدادات، تُسجَّل محاولة الإرسال وتُعاد `skipped` بدل رمي خطأ —
 * حتى لا يفشل تسجيل دخول أو إشعار بسبب مشكلة في خادم البريد.
 */

export type SendResult =
  | { status: 'sent'; messageId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

export interface MailInput {
  to: string;
  /** نسخة إضافية — تُستخدم لإشراك زميل في مراسلة العميل. */
  cc?: string[];
  subject: string;
  /** المحتوى الأساسي بصيغة HTML (يُولَّد عادة من renderEmail) */
  html: string;
  /** نسخة نصية — تُشتق تلقائيًا من HTML إن لم تُمرَّر */
  text?: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

export function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    host,
    port,
    // 465 يستخدم TLS ضمنيًا، وما عداه يبدأ عاديًا ثم يرقّى بـ STARTTLS.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    user: process.env.SMTP_USER?.trim() || undefined,
    password: process.env.SMTP_PASSWORD || undefined,
    from: process.env.SMTP_FROM?.trim() || 'Blue Point OS <no-reply@localhost>',
  };
}

export function isMailEnabled(): boolean {
  return readSmtpConfig() !== null;
}

/** وصف آمن للعرض في صفحة الإعدادات — بدون كلمة مرور SMTP ولا اسم المستخدم. */
export interface MailStatus {
  enabled: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  authenticated?: boolean;
  from?: string;
}

export function mailStatus(): MailStatus {
  const config = readSmtpConfig();
  if (!config) return { enabled: false };
  return {
    enabled: true,
    host: config.host,
    port: config.port,
    secure: config.secure,
    authenticated: Boolean(config.user),
    from: config.from,
  };
}

let transporter: Transporter | null = null;
let transporterKey = '';

function getTransporter(config: SmtpConfig): Transporter {
  // إعادة الإنشاء فقط عند تغيّر الإعدادات — الاتصال يُعاد استخدامه بين الرسائل.
  const key = `${config.host}:${config.port}:${config.secure}:${config.user ?? ''}`;
  if (transporter && transporterKey === key) return transporter;

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    requireTLS: !config.secure,
  });
  transporterKey = key;
  return transporter;
}

/** يحوّل HTML إلى نص بسيط لعملاء البريد التي لا تعرض HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // مسافات بادئة من تنسيق HTML لا معنى لها في النص المجرّد.
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function sendMail(input: MailInput): Promise<SendResult> {
  const config = readSmtpConfig();
  if (!config) {
    return { status: 'skipped', reason: 'SMTP غير مضبوط' };
  }

  try {
    const info = await getTransporter(config).sendMail({
      from: config.from,
      to: input.to,
      cc: input.cc?.length ? input.cc : undefined,
      subject: input.subject,
      html: input.html,
      text: input.text ?? htmlToText(input.html),
      replyTo: input.replyTo,
      attachments: input.attachments,
    });
    return { status: 'sent', messageId: info.messageId };
  } catch (error) {
    // لا نسجّل كلمة مرور SMTP ولا محتوى الرسالة — فقط سبب الفشل.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mailer] تعذّر إرسال بريد إلى ${maskEmail(input.to)}: ${message}`);
    return { status: 'failed', error: message };
  }
}

/** يخفي جزءًا من البريد في السجلات حفاظًا على الخصوصية. */
export function maskEmail(email: string): string {
  const [name = '', domain = ''] = email.split('@');
  const visible = name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}

/** يتحقق من الاتصال بخادم البريد — يُستخدم في صفحة الإعدادات. */
export async function verifyMailConnection(): Promise<SendResult> {
  const config = readSmtpConfig();
  if (!config) return { status: 'skipped', reason: 'SMTP غير مضبوط' };
  try {
    await getTransporter(config).verify();
    return { status: 'sent', messageId: 'verified' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'failed', error: message };
  }
}

/* ── قالب الرسائل ───────────────────────────────────── */

export interface EmailAction {
  label: string;
  url: string;
}

export interface EmailBlock {
  title: string;
  value: string;
  href?: string;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * قالب HTML موحّد بهوية Blue Point.
 * مبني على جداول وأنماط inline لأن عملاء البريد لا تدعم CSS الحديث بثبات،
 * وبدون أي صور خارجية حتى لا يُحجب المحتوى أو يُستخدم للتتبع.
 */
export async function renderEmail(params: {
  heading: string;
  intro?: string;
  blocks?: EmailBlock[];
  action?: EmailAction;
  footnote?: string;
  /**
   * الجمهور يحدّد التذييل. الرسالة الداخلية تشير إلى تفضيلات الإشعارات وتطلب
   * عدم الرد؛ أما رسالة العميل فتحمل بيانات التواصل — لأن العميل يحتاج الرد فعلًا
   * على فاتورة أو عرض سعر. الافتراضي داخلي.
   */
  audience?: 'internal' | 'client';
}): Promise<string> {
  const settings = await getSettings();
  const company = settings.company.nameAr || 'Blue Point';
  const contactLine = [settings.company.email, settings.company.phone].filter(Boolean).join(' · ');
  const footerText =
    params.audience === 'client'
      ? contactLine
        ? `${company} — للتواصل: ${contactLine}`
        : company
      : 'هذه رسالة آلية من نظام Blue Point OS الداخلي — لا تردّ عليها. يمكنك ضبط تفضيلات الإشعارات من صفحة الإشعارات داخل النظام.';
  const navy = '#0B1A2F';
  const blue = '#2C7BE5';
  const cyan = '#3FC8F5';
  const ink = '#10233D';
  const muted = '#5C7189';
  const line = '#DCE4EE';

  const blocksHtml = (params.blocks ?? [])
    .map(
      (b) => `
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid ${line};">
          <div style="font-size:11px;color:${muted};">${esc(b.title)}</div>
          <div style="font-size:14px;color:${ink};font-weight:600;">
            ${b.href ? `<a href="${esc(b.href)}" style="color:${blue};text-decoration:none;">${esc(b.value)}</a>` : esc(b.value)}
          </div>
        </td>
      </tr>`,
    )
    .join('');

  const actionHtml = params.action
    ? `
      <tr>
        <td align="center" style="padding:24px 0 8px;">
          <a href="${esc(params.action.url)}"
             style="display:inline-block;background:${blue};color:#ffffff;text-decoration:none;
                    font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;">
            ${esc(params.action.label)}
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:0 0 8px;">
          <div style="font-size:11px;color:${muted};word-break:break-all;">
            أو انسخ هذا الرابط: ${esc(params.action.url)}
          </div>
        </td>
      </tr>`
    : '';

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(params.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#F0F4F9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="max-width:560px;background:#ffffff;border:1px solid ${line};border-radius:12px;overflow:hidden;
                      font-family:'Cairo','Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;text-align:right;">

          <tr>
            <td style="background:${navy};padding:18px 24px;">
              <span style="color:#ffffff;font-size:17px;font-weight:800;">Blue</span><span
                    style="color:${cyan};font-size:17px;font-weight:800;"> Point</span>
              <span style="color:#9CB0C9;font-size:11px;"> · ${esc(company)}</span>
            </td>
          </tr>

          <tr>
            <td style="padding:24px;">
              <h1 style="margin:0 0 10px;font-size:18px;color:${ink};font-weight:800;">${esc(params.heading)}</h1>
              ${params.intro ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:${muted};">${esc(params.intro)}</p>` : ''}
              ${blocksHtml ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${blocksHtml}</table>` : ''}
              ${actionHtml ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${actionHtml}</table>` : ''}
              ${params.footnote ? `<p style="margin:16px 0 0;font-size:11px;line-height:1.7;color:${muted};">${esc(params.footnote)}</p>` : ''}
            </td>
          </tr>

          <tr>
            <td style="background:#F8FAFD;border-top:1px solid ${line};padding:14px 24px;">
              <p style="margin:0;font-size:11px;color:${muted};">${esc(footerText)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function appUrl(path = ''): string {
  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
