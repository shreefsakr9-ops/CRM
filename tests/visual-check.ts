/** فحص بصري سريع: تسجيل دخول ثم لقطات للصفحات الأساسية (ديسكتوب + موبايل). */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const OUT = process.env.OUT_DIR ?? '/tmp/shots';

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox'],
  });

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/01-login.png` });

  await page.fill('input[name="email"]', 'ceo@bluepoint.local');
  await page.fill('input[name="password"]', 'Demo#2026Pass');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/02-dashboard.png`, fullPage: true });

  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  for (const [name, path] of [
    ['03-leads', '/leads'],
    ['04-pipeline', '/pipeline'],
    ['05-projects', '/projects'],
    ['06-reports', '/reports'],
    ['07-settings', '/settings'],
  ] as const) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }

  // موبايل — التحقق من عدم وجود تمرير أفقي للصفحة
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    storageState: await desktop.storageState(),
  });
  const m = await mobile.newPage();
  await m.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await m.screenshot({ path: `${OUT}/08-mobile-dashboard.png` });

  await m.goto(`${BASE}/leads`, { waitUntil: 'networkidle' });
  await m.screenshot({ path: `${OUT}/09-mobile-leads.png` });

  const overflow = await m.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log('mobile horizontal overflow (px):', overflow);
  console.log('console errors:', errors.length ? errors : 'none');

  await browser.close();
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
