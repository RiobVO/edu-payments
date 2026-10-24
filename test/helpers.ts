import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

// «Сейчас» для тестов фиксировано: 15 октября 2026, полдень по Ташкенту (UTC+5)
export const NOW = new Date('2026-10-15T07:00:00Z');

export function createTestApp(now: Date = NOW): FastifyInstance {
  return buildApp({ dbPath: ':memory:', now: () => now, timeZone: 'Asia/Tashkent', logger: false });
}

export const validStudent = {
  name: 'Азиз Каримов',
  phone: '+998 90 123-45-67',
  group: 'English B1',
  monthlyFee: 500_000,
};

export async function createStudent(app: FastifyInstance, overrides: Record<string, unknown> = {}) {
  const res = await app.inject({ method: 'POST', url: '/students', payload: { ...validStudent, ...overrides } });
  if (res.statusCode !== 201) throw new Error(`createStudent: ${res.statusCode} ${res.body}`);
  return res.json() as { id: number; name: string; monthlyFee: number; startDate: string };
}

export async function addPayment(app: FastifyInstance, studentId: number, amount: number, date?: string) {
  const res = await app.inject({
    method: 'POST',
    url: `/students/${studentId}/payments`,
    payload: date ? { amount, date } : { amount },
  });
  if (res.statusCode !== 201) throw new Error(`addPayment: ${res.statusCode} ${res.body}`);
  return res.json() as { id: number; studentId: number; amount: number; date: string };
}
