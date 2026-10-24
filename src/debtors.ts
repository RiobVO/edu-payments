import type { FastifyPluginAsync } from 'fastify';
import type { AppDeps } from './app.js';
import { nextMonthStart } from './time.js';

interface DebtorRow {
  id: number;
  name: string;
  phone: string;
  group_name: string;
  monthly_fee: number;
  paid: number;
}

export const debtorsRoutes: FastifyPluginAsync<AppDeps> = async (app, { db, today }) => {
  // Условие по дате оплаты стоит в ON, а не в WHERE: иначе LEFT JOIN выбросит учеников
  // без оплат за месяц — а это как раз самые главные должники.
  // Кто начал учиться после месяца, за него не должен (start_date < начала следующего месяца).
  const query = db.prepare(`
    SELECT s.id, s.name, s.phone, s.group_name, s.monthly_fee, COALESCE(SUM(p.amount), 0) AS paid
    FROM students s
    LEFT JOIN payments p ON p.student_id = s.id AND p.paid_at >= :monthStart AND p.paid_at < :nextStart
    WHERE s.start_date < :nextStart
    GROUP BY s.id
    HAVING paid < s.monthly_fee
    ORDER BY s.monthly_fee - paid DESC, s.name
  `);

  app.get<{ Querystring: { month?: string } }>('/debtors', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: { month: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' } },
      },
    },
  }, async (req) => {
    const month = req.query.month ?? today().slice(0, 7);
    const rows = query.all({ monthStart: `${month}-01`, nextStart: nextMonthStart(month) }) as unknown as DebtorRow[];

    const debtors = rows.map((row) => ({
      studentId: row.id,
      name: row.name,
      phone: row.phone,
      group: row.group_name,
      monthlyFee: row.monthly_fee,
      paid: row.paid,
      debt: row.monthly_fee - row.paid,
    }));
    return { month, totalDebt: debtors.reduce((sum, d) => sum + d.debt, 0), debtors };
  });
};
