import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import fastifyStatic from '@fastify/static';
import { openDatabase } from './db.js';
import { todayIn } from './time.js';
import { studentsRoutes } from './students.js';
import { paymentsRoutes } from './payments.js';
import { debtorsRoutes } from './debtors.js';

export interface AppOptions {
  dbPath: string;
  timeZone: string;
  // Часы передаются снаружи, чтобы тесты могли зафиксировать «сегодня»
  now?: () => Date;
  logger?: FastifyServerOptions['logger'];
}

export interface AppDeps {
  db: DatabaseSync;
  today: () => string;
}

export function buildApp({ dbPath, timeZone, now = () => new Date(), logger = true }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });
  const db = openDatabase(dbPath);
  const deps: AppDeps = { db, today: () => todayIn(timeZone, now()) };

  app.register(studentsRoutes, deps);
  app.register(paymentsRoutes, deps);
  app.register(debtorsRoutes, deps);
  app.register(fastifyStatic, { root: join(import.meta.dirname, '..', 'public') });

  app.addHook('onClose', async () => db.close());
  return app;
}
