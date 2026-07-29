import { afterAll } from 'vitest';
import { closeBrowser } from './browser';

/**
 * المتصفح يعيش داخل عملية الاختبارات لا داخل globalSetup، فإغلاقه يجب أن يتم
 * من هنا — وإلا بقيت عملية Chromium معلّقة بعد انتهاء التشغيل.
 */
afterAll(closeBrowser);
