/**
 * غلاف رقيق حول Playwright لاختبارات المتصفح.
 *
 * كل اختبار يفتح سياقًا جديدًا (كوكيز نظيفة) على متصفح واحد مشترك: إنشاء متصفح
 * لكل اختبار يضيف ثوانيَ بلا فائدة، ومشاركة السياق تسرّب جلسة مستخدم إلى اختبار
 * دور آخر — وهو بالضبط ما تفحصه هذه الاختبارات.
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { E2E_BASE } from './server';
import { E2E_PASSWORD, USERS, ADMIN_TOTP_SECRET } from './fixtures';
import { totpCode } from '../../src/server/auth/totp';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser) return browser;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    // البيئات المعزولة (CI، الحاويات) لا تسمح بـsandbox الخاص بـChromium.
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  return browser;
}

export async function closeBrowser() {
  await browser?.close();
  browser = null;
}

export interface Session {
  context: BrowserContext;
  page: Page;
  /** أخطاء console التي ظهرت منذ فتح السياق. */
  consoleErrors: string[];
  close(): Promise<void>;
}

export async function newSession(
  options: { viewport?: { width: number; height: number }; isMobile?: boolean } = {},
): Promise<Session> {
  const context = await (
    await getBrowser()
  ).newContext({
    viewport: options.viewport ?? { width: 1440, height: 900 },
    isMobile: options.isMobile,
    hasTouch: options.isMobile,
    baseURL: E2E_BASE,
    locale: 'ar-EG',
  });
  // البيئات المشتركة (CI، الحاويات) أبطأ بكثير من جهاز التطوير: مهلة قصيرة
  // تنتج فشلًا يبدو خطأً في الكود وهو في الحقيقة بطء بيئة.
  context.setDefaultTimeout(45_000);
  context.setDefaultNavigationTimeout(60_000);
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  return {
    context,
    page,
    consoleErrors,
    close: () => context.close(),
  };
}

/**
 * تسجيل دخول حقيقي عبر النموذج — لا حقن كوكيز، فالمسار نفسه جزء من الاختبار.
 * ويشمل الخطوة الثانية: حساب رمز TOTP فعلي من سرّ المستخدم وإدخاله كما يفعل
 * صاحب الحساب من تطبيق المصادقة.
 */
export async function login(session: Session, email: string, password = E2E_PASSWORD) {
  const { page } = session;
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // إما أن ننتقل مباشرةً، أو تظهر شاشة الرمز أولًا.
  const codeField = page.locator('input[name="code"]');
  await Promise.race([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 }),
    codeField.waitFor({ state: 'visible', timeout: 60_000 }),
  ]);

  if (await codeField.count()) {
    const secret = TOTP_SECRETS[email];
    if (!secret) throw new Error(`المستخدم ${email} يطلب رمزًا ثنائيًا بلا سرّ معروف`);
    await codeField.fill(await freshTotp(secret));
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 }),
      page.click('button[type="submit"]'),
    ]);
  }
}

const TOTP_SECRETS: Record<string, string> = { [USERS.admin]: ADMIN_TOTP_SECRET };

const TOTP_PERIOD = 30;
const usedSteps = new Map<string, number>();

/**
 * ينتظر نافذة زمنية جديدة قبل توليد الرمز.
 *
 * النظام يرفض إعادة استخدام رمز نجح مرة (منع إعادة التشغيل)، فتسجيلا دخول
 * داخل نفس الثلاثين ثانية يفشل ثانيهما. هذا سلوك صحيح ومقصود — فننتظر هنا بدل
 * إضعافه، حتى تبقى الحماية مُختبَرة لا ملتفًّا حولها.
 */
async function freshTotp(secret: string): Promise<string> {
  const currentStep = () => Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  const last = usedSteps.get(secret);
  while (last !== undefined && currentStep() <= last) {
    await new Promise((r) => setTimeout(r, 1_000));
  }
  usedSteps.set(secret, currentStep());
  return totpCode(secret);
}
