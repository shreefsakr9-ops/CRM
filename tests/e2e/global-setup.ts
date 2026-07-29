import { config } from 'dotenv';
import { startServer, stopServer } from './server';

config({ path: '.env' });

if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * يشغّل الخادم مرة واحدة لكل تشغيل كامل بدل مرة لكل ملف — بدء `next start`
 * يستغرق ثوانيَ، وتكراره لكل ملف يضاعف زمن الحلقة بلا فائدة.
 */
export async function setup() {
  await startServer();
}

export async function teardown() {
  await stopServer();
}
