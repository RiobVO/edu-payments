import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { addPayment, createStudent, createTestApp } from './helpers.js';

async function getDebtors(app: FastifyInstance, month?: string) {
  const res = await app.inject({ method: 'GET', url: month ? `/debtors?month=${month}` : '/debtors' });
  return { status: res.statusCode, body: res.json() };
}

describe('GET /debtors', () => {
  it('ученик без оплат должен всю месячную сумму', async () => {
    const app = createTestApp();
    const s = await createStudent(app, { monthlyFee: 500_000 });

    const { status, body } = await getDebtors(app, '2026-10');
    expect(status).toBe(200);
    expect(body).toEqual({
      month: '2026-10',
      totalDebt: 500_000,
      debtors: [{
        studentId: s.id, name: s.name, phone: '+998 90 123-45-67', group: 'English B1',
        monthlyFee: 500_000, paid: 0, debt: 500_000,
      }],
    });
  });

  it('частичная оплата: должен остаток, несколько оплат суммируются', async () => {
    const app = createTestApp();
    const s = await createStudent(app, { monthlyFee: 500_000 });
    await addPayment(app, s.id, 100_000, '2026-10-01');
    await addPayment(app, s.id, 150_000, '2026-10-10');

    const { body } = await getDebtors(app, '2026-10');
    expect(body.debtors[0]).toMatchObject({ paid: 250_000, debt: 250_000 });
  });

  it('оплатившие полностью или с переплатой — не должники', async () => {
    const app = createTestApp();
    const exact = await createStudent(app, { name: 'Ровно', monthlyFee: 500_000 });
    const over = await createStudent(app, { name: 'Переплатил', monthlyFee: 500_000 });
    await addPayment(app, exact.id, 500_000, '2026-10-01');
    await addPayment(app, over.id, 700_000, '2026-10-01');

    const { body } = await getDebtors(app, '2026-10');
    expect(body.debtors).toEqual([]);
    expect(body.totalDebt).toBe(0);
  });

  it('учитывает только оплаты выбранного месяца, включая его границы', async () => {
    const app = createTestApp();
    const s = await createStudent(app, { monthlyFee: 500_000 });
    await addPayment(app, s.id, 500_000, '2026-09-30');
    await addPayment(app, s.id, 100_000, '2026-10-01');
    await addPayment(app, s.id, 100_000, '2026-10-15');

    const { body } = await getDebtors(app, '2026-10');
    expect(body.debtors[0]).toMatchObject({ paid: 200_000, debt: 300_000 });
  });

  it('ученик, записавшийся позже месяца, не должен за этот месяц', async () => {
    const app = createTestApp();
    await createStudent(app); // createdAt = 2026-10-15

    expect((await getDebtors(app, '2026-09')).body.debtors).toEqual([]);
    expect((await getDebtors(app, '2026-10')).body.debtors).toHaveLength(1);
  });

  it('сортирует по убыванию долга и считает общий долг', async () => {
    const app = createTestApp();
    const small = await createStudent(app, { name: 'Малый долг', monthlyFee: 300_000 });
    const big = await createStudent(app, { name: 'Большой долг', monthlyFee: 800_000 });
    await addPayment(app, small.id, 200_000, '2026-10-01');

    const { body } = await getDebtors(app, '2026-10');
    expect(body.debtors.map((d: { name: string }) => d.name)).toEqual(['Большой долг', 'Малый долг']);
    expect(body.totalDebt).toBe(900_000);
  });

  it('без параметра month берёт текущий месяц по Ташкенту', async () => {
    // 31 октября 20:00 UTC — в Ташкенте уже 1 ноября 01:00
    const app = createTestApp(new Date('2026-10-31T20:00:00Z'));
    const { body } = await getDebtors(app);
    expect(body.month).toBe('2026-11');
  });

  it.each(['2026-13', '2026-1', '2026-00', '10-2026', 'abc'])('отклоняет некорректный месяц %s', async (month) => {
    const app = createTestApp();
    expect((await getDebtors(app, month)).status).toBe(400);
  });
});
