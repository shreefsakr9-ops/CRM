import { config } from 'dotenv';

config({ path: '.env' });

// اختبارات التكامل تعمل على قاعدة بيانات منفصلة تمامًا عن التطوير.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.SESSION_SECRET ??= 'test-session-secret-value-not-for-production';
process.env.FILE_SIGNING_SECRET ??= 'test-file-secret-value-not-for-production';
