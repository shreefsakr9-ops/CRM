/**
 * يجهّز قاعدة بيانات الاختبار: يطبّق المايجريشن ثم يزرع البيانات المرجعية فقط
 * (بدون بيانات تجريبية) حتى تبدأ الاختبارات من حالة معروفة.
 */
import { execSync } from 'node:child_process';
import { config } from 'dotenv';

config({ path: '.env' });

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error('✖ TEST_DATABASE_URL غير مضبوط في .env');
  process.exit(1);
}

console.info('▶ تجهيز قاعدة بيانات الاختبار…');
// migrate deploy غير تدميري: يطبّق المايجريشن الناقصة فقط.
// تنظيف بيانات الأعمال بين الاختبارات يتم عبر resetBusinessData() في tests/helpers.ts.
// لإعادة بناء قاعدة الاختبار من الصفر شغّل يدويًا:
//   DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate reset --force
execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});
execSync('npx tsx --conditions=react-server prisma/seed.ts', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url, SEED_DEMO_DATA: 'false' },
});
console.info('✔ قاعدة بيانات الاختبار جاهزة');
