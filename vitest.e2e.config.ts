import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * إعداد منفصل لاختبارات المتصفح.
 *
 * سبب الفصل عن `npm test`: هذه الاختبارات تبني وتشغّل خادمًا وتفتح متصفحًا، فهي
 * أبطأ بمرتبة وتحتاج Chromium. خلطها بالاختبارات السريعة يجعل الحلقة اليومية
 * ثقيلة، ويخلط سبب الفشل (منطق أعمال أم بيئة متصفح).
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/e2e/**/*.e2e.ts'],
    setupFiles: ['tests/setup.ts', 'tests/e2e/setup-browser.ts'],
    globalSetup: ['tests/e2e/global-setup.ts'],
    // خادم واحد وقاعدة بيانات واحدة — التوازي يجعل النتائج غير حتمية.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
});
