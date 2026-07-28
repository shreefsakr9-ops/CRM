import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // اختبارات التكامل تشترك في قاعدة بيانات واحدة — تشغيل متسلسل يمنع التداخل.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 'server-only' يرمي خطأ خارج بيئة Next — الاختبارات كلها تعمل على السيرفر أصلًا.
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
});
