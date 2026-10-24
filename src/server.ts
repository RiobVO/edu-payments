import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildApp } from './app.js';

const dbPath = process.env.DB_PATH ?? 'data/payments.db';
mkdirSync(dirname(dbPath), { recursive: true });

const app = buildApp({ dbPath, timeZone: process.env.TIME_ZONE ?? 'Asia/Tashkent' });

try {
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
} catch (err) {
  app.log.error(err, 'Failed to start server');
  process.exit(1);
}
