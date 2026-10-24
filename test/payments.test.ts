import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { addPayment, createStudent, createTestApp } from './helpers.js';

let app: FastifyInstance;
let studentId: number;
beforeEach(async () => {
  app = createTestApp();
  studentId = (await createStudent(app)).id;
});
afterEach(() => app.close());

describe('POST /students/:id/payments', () => {
  it('добавляет оплату с указанной датой', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/students/${studentId}/payments`,
      payload: { amount: 250_000, date: '2026-10-03' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: 1, studentId, amount: 250_000, date: '2026-10-03' });
  });

  it('без даты ставит сегодняшнюю по Ташкенту', async () => {
    const payment = await addPayment(app, studentId, 100_000);
    expect(payment.date).toBe('2026-10-15');
  });

  it('отдаёт 404 для несуществующего ученика', async () => {
    const res = await app.inject({ method: 'POST', url: '/students/999/payments', payload: { amount: 1000 } });
    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['без суммы', {}],
    ['нулевая сумма', { amount: 0 }],
    ['отрицательная сумма', { amount: -5000 }],
    ['дробная сумма', { amount: 99.9 }],
    ['дата в чужом формате', { amount: 1000, date: '15.10.2026' }],
    ['несуществующая дата', { amount: 1000, date: '2026-02-30' }],
    ['дата в будущем', { amount: 1000, date: '2026-10-16' }],
  ])('отклоняет некорректные данные: %s', async (_case, payload) => {
    const res = await app.inject({ method: 'POST', url: `/students/${studentId}/payments`, payload });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /students/:id/payments', () => {
  it('возвращает оплаты ученика, сначала новые', async () => {
    const other = await createStudent(app, { name: 'Другой' });
    await addPayment(app, studentId, 100_000, '2026-09-01');
    await addPayment(app, studentId, 200_000, '2026-10-01');
    await addPayment(app, other.id, 300_000, '2026-10-02');

    const res = await app.inject({ method: 'GET', url: `/students/${studentId}/payments` });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((p: { amount: number }) => p.amount)).toEqual([200_000, 100_000]);
  });

  it('отдаёт 404 для несуществующего ученика', async () => {
    const res = await app.inject({ method: 'GET', url: '/students/999/payments' });
    expect(res.statusCode).toBe(404);
  });
});
