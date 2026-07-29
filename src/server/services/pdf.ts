import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser } from 'playwright-core';

/**
 * توليد PDF عبر Chromium.
 * السبب: هو الطريقة الوحيدة الموثوقة لتشكيل الحروف العربية (Arabic shaping)
 * ودعم RTL والخط Cairo بدقة كاملة داخل ملف PDF.
 * الخط يُضمَّن داخل HTML كـ data URI حتى لا يعتمد التوليد على الشبكة إطلاقًا.
 */

let fontCache: { ar: string; latin: string } | null = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), 'public', 'fonts');
  const [ar, latin] = await Promise.all([
    readFile(path.join(dir, 'cairo-arabic-wght-normal.woff2')),
    readFile(path.join(dir, 'cairo-latin-wght-normal.woff2')),
  ]);
  fontCache = { ar: ar.toString('base64'), latin: latin.toString('base64') };
  return fontCache;
}

export async function fontFaceCss() {
  const fonts = await loadFonts();
  return `
@font-face {
  font-family: 'Cairo';
  font-style: normal;
  font-weight: 200 1000;
  font-display: block;
  src: url(data:font/woff2;base64,${fonts.ar}) format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+FB50-FDFF, U+FE70-FEFF;
}
@font-face {
  font-family: 'Cairo';
  font-style: normal;
  font-weight: 200 1000;
  font-display: block;
  src: url(data:font/woff2;base64,${fonts.latin}) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215;
}`;
}

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const executablePath = process.env.CHROMIUM_PATH || undefined;
    browserPromise = chromium.launch({
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    });
  }
  return browserPromise;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    // انتظار تحميل الخطوط قبل الطباعة حتى لا تُطبع الحروف بخط احتياطي.
    await page.evaluate(() => (document as unknown as { fonts: FontFaceSet }).fonts.ready);
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}

export async function closePdfBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}
