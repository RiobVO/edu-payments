import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createStudent, createTestApp, validStudent } from './helpers.js';

let app: FastifyInstance;
beforeEach(() => { app = createTestApp(); });
afterEach(() => app.close());

describe('POST /students', () => {
  it('без startDate считает, что ученик учится с сегодняшнего дня по Ташкенту', async () => {
    const res = await app.inject({ method: 'POST', url: '/students', payload: validStudent });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: 1, ...validStudent, startDate: '2026-10-15' });
  });

  it('принимает дату начала учёбы, в том числе прошлую и будущую', async () => {
    expect((await createStudent(app, { startDate: '2026-09-01' })).startDate).toBe('2026-09-01');
    expect((await createStudent(app, { startDate: '2026-11-01' })).startDate).toBe('2026-11-01');
  });

  it('обрезает пробелы по краям строк', async () => {
    const student = await createStudent(app, { name: '  Азиз  ', group: ' A1 ' });
    expect(student).toMatchObject({ name: 'Азиз', group: 'A1' });
  });

  it.each([
    ['без имени', { name: undefined }],
    ['имя из одних пробелов', { name: '   ' }],
    ['телефон с буквами', { phone: 'позвонить маме' }],
    ['слишком короткий телефон', { phone: '123' }],
    ['пустая группа', { group: '' }],
    ['нулевая сумма', { monthlyFee: 0 }],
    ['отрицательная сумма', { monthlyFee: -100 }],
    ['дробная сумма', { monthlyFee: 100.5 }],
    ['сумма строкой', { monthlyFee: '500000' }],
    ['сумма-булево', { monthlyFee: true }],
    ['телефон из пробелов', { phone: '       ' }],
    ['телефон без цифр', { phone: '-------' }],
    ['неизвестное поле', { comment: 'VIP' }],
    ['несуществующая дата начала', { startDate: '2026-02-30' }],
    ['дата начала в чужом формате', { startDate: '01.09.2026' }],
  ])('отклоняет некорректные данные: %s', async (_case, overrides) => {
    const res = await app.inject({ method: 'POST', url: '/students', payload: { ...validStudent, ...overrides } });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /students', () => {
  it('возвращает пустой список без учеников', async () => {
    const res = await app.inject({ method: 'GET', url: '/students' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('возвращает учеников, отсортированных по имени', async () => {
    await createStudent(app, { name: 'Малика' });
    await createStudent(app, { name: 'Бобур' });
    const res = await app.inject({ method: 'GET', url: '/students' });
    expect(res.json().map((s: { name: string }) => s.name)).toEqual(['Бобур', 'Малика']);
  });
});

describe('GET /students/:id', () => {
  it('возвращает ученика по id', async () => {
    const { id } = await createStudent(app);
    const res = await app.inject({ method: 'GET', url: `/students/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id, ...validStudent });
  });

  it('отдаёт 404 для несуществующего ученика', async () => {
    const res = await app.inject({ method: 'GET', url: '/students/999' });
    expect(res.statusCode).toBe(404);
  });

  it.each(['abc', '0', '1.5'])('отдаёт 400 для некорректного id %s', async (id) => {
    const res = await app.inject({ method: 'GET', url: `/students/${id}` });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /students/:id', () => {
  it('меняет только переданные поля', async () => {
    const { id } = await createStudent(app);
    const res = await app.inject({ method: 'PATCH', url: `/students/${id}`, payload: { monthlyFee: 600_000 } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ...validStudent, monthlyFee: 600_000 });
  });

  it('меняет дату начала учёбы', async () => {
    const { id } = await createStudent(app);
    const res = await app.inject({ method: 'PATCH', url: `/students/${id}`, payload: { startDate: '2026-09-01' } });
    expect(res.json().startDate).toBe('2026-09-01');
  });

  it('отклоняет пустое тело', async () => {
    const { id } = await createStudent(app);
    const res = await app.inject({ method: 'PATCH', url: `/students/${id}`, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('отклоняет неизвестные поля, а не молча игнорирует их', async () => {
    const { id } = await createStudent(app);
    const res = await app.inject({ method: 'PATCH', url: `/students/${id}`, payload: { monthly_fee: 700_000 } });
    expect(res.statusCode).toBe(400);
  });

  it('не приводит булево значение к числу', async () => {
    const { id } = await createStudent(app);
    const res = await app.inject({ method: 'PATCH', url: `/students/${id}`, payload: { monthlyFee: true } });
    expect(res.statusCode).toBe(400);
  });

  it('отклоняет некорректное значение', async () => {
    const { id } = await createStudent(app);
    const res = await app.inject({ method: 'PATCH', url: `/students/${id}`, payload: { monthlyFee: -1 } });
    expect(res.statusCode).toBe(400);
  });

  it('отдаёт 404 для несуществующего ученика', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/students/999', payload: { name: 'X' } });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /students/:id', () => {
  it('удаляет ученика вместе с его оплатами', async () => {
    const { id } = await createStudent(app);
    await app.inject({ method: 'POST', url: `/students/${id}/payments`, payload: { amount: 100_000 } });

    const res = await app.inject({ method: 'DELETE', url: `/students/${id}` });
    expect(res.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/students/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/students/${id}/payments` })).statusCode).toBe(404);
  });

  it('отдаёт 404 для несуществующего ученика', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/students/999' });
    expect(res.statusCode).toBe(404);
  });
});
