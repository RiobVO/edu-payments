import type { FastifyPluginAsync } from 'fastify';
import type { AppDeps } from './app.js';

interface StudentRow {
  id: number;
  name: string;
  phone: string;
  group_name: string;
  monthly_fee: number;
  created_at: string;
}

interface StudentInput {
  name: string;
  phone: string;
  group: string;
  monthlyFee: number;
}

const toStudent = (row: StudentRow) => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  group: row.group_name,
  monthlyFee: row.monthly_fee,
  createdAt: row.created_at,
});

// Хотя бы один непробельный символ: ajv считает "   " валидной строкой длины 3
const nonBlank = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' });

const studentFields = {
  name: nonBlank(100),
  // Формат телефонов не навязываем (+998, городские, с пробелами), но цифр должно быть 7–15
  phone: { type: 'string', maxLength: 30, pattern: '^\\s*\\+?(?:[ ()-]*[0-9]){7,15}[ ()-]*\\s*$' },
  group: nonBlank(50),
  monthlyFee: { type: 'integer', minimum: 1, maximum: 1_000_000_000 },
};

// Приведение типов выключено, поэтому id из URL проверяем как строку из цифр и переводим в число сами
export const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: '^[1-9][0-9]{0,14}$' } },
};

export type IdParams = { id: string };

export const studentsRoutes: FastifyPluginAsync<AppDeps> = async (app, { db, today }) => {
  const findById = db.prepare('SELECT * FROM students WHERE id = ?');

  app.get('/students', async () => {
    const rows = db.prepare('SELECT * FROM students ORDER BY name, id').all() as unknown as StudentRow[];
    return rows.map(toStudent);
  });

  app.get<{ Params: IdParams }>('/students/:id', { schema: { params: idParams } }, async (req, reply) => {
    const row = findById.get(Number(req.params.id)) as StudentRow | undefined;
    if (!row) return reply.code(404).send({ message: 'Student not found' });
    return toStudent(row);
  });

  app.post<{ Body: StudentInput }>('/students', {
    schema: {
      body: { type: 'object', required: Object.keys(studentFields), additionalProperties: false, properties: studentFields },
    },
  }, async (req, reply) => {
    const { name, phone, group, monthlyFee } = req.body;
    const row = db.prepare(`
      INSERT INTO students (name, phone, group_name, monthly_fee, created_at)
      VALUES (?, ?, ?, ?, ?) RETURNING *
    `).get(name.trim(), phone.trim(), group.trim(), monthlyFee, today()) as unknown as StudentRow;
    return reply.code(201).send(toStudent(row));
  });

  app.patch<{ Params: IdParams; Body: Partial<StudentInput> }>('/students/:id', {
    schema: {
      params: idParams,
      body: { type: 'object', minProperties: 1, additionalProperties: false, properties: studentFields },
    },
  }, async (req, reply) => {
    const { name, phone, group, monthlyFee } = req.body;
    // COALESCE оставляет старое значение для полей, которых нет в запросе
    const row = db.prepare(`
      UPDATE students SET
        name        = COALESCE(?, name),
        phone       = COALESCE(?, phone),
        group_name  = COALESCE(?, group_name),
        monthly_fee = COALESCE(?, monthly_fee)
      WHERE id = ? RETURNING *
    `).get(name?.trim() ?? null, phone?.trim() ?? null, group?.trim() ?? null, monthlyFee ?? null, Number(req.params.id)) as
      StudentRow | undefined;
    if (!row) return reply.code(404).send({ message: 'Student not found' });
    return toStudent(row);
  });

  app.delete<{ Params: IdParams }>('/students/:id', { schema: { params: idParams } }, async (req, reply) => {
    const { changes } = db.prepare('DELETE FROM students WHERE id = ?').run(Number(req.params.id));
    if (changes === 0) return reply.code(404).send({ message: 'Student not found' });
    return reply.code(204).send();
  });
};
