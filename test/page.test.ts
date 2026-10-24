import { afterEach, beforeEach, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from './helpers.js';

let app: FastifyInstance;
beforeEach(() => { app = createTestApp(); });
afterEach(() => app.close());

it('отдаёт веб-страницу и её скрипт на корневом адресе', async () => {
  const page = await app.inject({ method: 'GET', url: '/' });
  expect(page.statusCode).toBe(200);
  expect(page.headers['content-type']).toContain('text/html');
  expect(page.body).toContain('id="payment-form"');

  const script = await app.inject({ method: 'GET', url: '/app.js' });
  expect(script.statusCode).toBe(200);
});
