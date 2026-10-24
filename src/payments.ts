import type { FastifyPluginAsync } from 'fastify';
import type { AppDeps } from './app.js';
import { idParams } from './students.js';

interface PaymentRow {
  id: number;
  student_id: number;
  amount: number;
  paid_at: string;
}

const toPayment = (row: PaymentRow) => ({
  id: row.id,
  studentId: row.student_id,
  amount: row.amount,
  date: row.paid_at,
});

export const paymentsRoutes: FastifyPluginAsync<AppDeps> = async (app, { db, today }) => {
  const studentExists = db.prepare('SELECT 1 FROM students WHERE id = ?');

  app.get<{ Params: { id: number } }>('/students/:id/payments', { schema: { params: idParams } }, async (req, reply) => {
    if (!studentExists.get(req.params.id)) return reply.code(404).send({ message: 'Student not found' });
    const rows = db.prepare('SELECT * FROM payments WHERE student_id = ? ORDER BY paid_at DESC, id DESC')
      .all(req.params.id) as unknown as PaymentRow[];
    return rows.map(toPayment);
  });

  app.post<{ Params: { id: number }; Body: { amount: number; date?: string } }>('/students/:id/payments', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        required: ['amount'],
        additionalProperties: false,
        properties: {
          amount: { type: 'integer', minimum: 1, maximum: 10_000_000_000 },
          // format: date проверяет и реальность даты: 2026-02-30 не пройдёт
          date: { type: 'string', format: 'date' },
        },
      },
    },
  }, async (req, reply) => {
    const date = req.body.date ?? today();
    // Будущая дата почти всегда опечатка оператора, а она молча закрыла бы долг не того месяца
    if (date > today()) return reply.code(400).send({ message: 'Payment date cannot be in the future' });
    if (!studentExists.get(req.params.id)) return reply.code(404).send({ message: 'Student not found' });

    const row = db.prepare('INSERT INTO payments (student_id, amount, paid_at) VALUES (?, ?, ?) RETURNING *')
      .get(req.params.id, req.body.amount, date) as unknown as PaymentRow;
    return reply.code(201).send(toPayment(row));
  });
};
