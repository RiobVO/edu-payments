// Демо-данные, чтобы после запуска страница не была пустой: npm run seed
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDatabase } from './db.js';
import { todayIn } from './time.js';

const dbPath = process.env.DB_PATH ?? 'data/payments.db';
mkdirSync(dirname(dbPath), { recursive: true });
const db = openDatabase(dbPath);

const { count } = db.prepare('SELECT COUNT(*) AS count FROM students').get() as { count: number };
if (count > 0) {
  process.stdout.write(`В базе уже ${count} учеников — сид пропущен. Удалите ${dbPath}, чтобы начать заново.\n`);
  process.exit(0);
}

const today = todayIn(process.env.TIME_ZONE ?? 'Asia/Tashkent', new Date());
const [year, month] = today.split('-').map(Number) as [number, number];
const prevMonth = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
const thisMonth = today.slice(0, 7);
// Записались в начале прошлого месяца — чтобы и за прошлый месяц было что смотреть
const joined = `${prevMonth}-01`;

// [имя, телефон, группа, сумма в месяц, оплаты прошлого месяца, оплаты текущего месяца]
const students: [string, string, string, number, number[], number[]][] = [
  ['Азиз Каримов', '+998 90 123-45-67', 'English B1', 500_000, [500_000], []],
  ['Малика Юсупова', '+998 93 555-12-34', 'English B1', 500_000, [500_000], [200_000]],
  ['Бобур Рахимов', '+998 97 765-43-21', 'IELTS 7.0', 900_000, [450_000, 450_000], [300_000, 150_000]],
  ['Дилноза Ахмедова', '+998 99 111-22-33', 'IELTS 7.0', 900_000, [900_000], [900_000]],
  ['Тимур Назаров', '+998 91 404-04-04', 'Математика 9', 400_000, [], [100_000]],
  ['Севара Исмоилова', '+998 94 321-00-99', 'Математика 9', 400_000, [400_000], [500_000]],
  ['Жасур Холматов', '+998 95 808-80-80', 'Python для детей', 650_000, [650_000], []],
  ['Нилуфар Саидова', '+998 88 246-13-57', 'Python для детей', 650_000, [300_000], [650_000]],
];

const insertStudent = db.prepare(
  'INSERT INTO students (name, phone, group_name, monthly_fee, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
);
const insertPayment = db.prepare('INSERT INTO payments (student_id, amount, paid_at) VALUES (?, ?, ?)');

db.exec('BEGIN');
for (const [name, phone, group, fee, prevPayments, currentPayments] of students) {
  const { id } = insertStudent.get(name, phone, group, fee, joined) as { id: number };
  prevPayments.forEach((amount, i) => insertPayment.run(id, amount, `${prevMonth}-${String(5 + i * 10).padStart(2, '0')}`));
  // Оплаты текущего месяца — не позже сегодняшнего дня, чтобы не было «оплат из будущего»
  currentPayments.forEach((amount, i) => {
    const date = `${thisMonth}-${String(1 + i * 2).padStart(2, '0')}`;
    insertPayment.run(id, amount, date > today ? today : date);
  });
}
db.exec('COMMIT');

process.stdout.write(`Добавлено ${students.length} учеников с оплатами за ${prevMonth} и ${thisMonth} в ${dbPath}\n`);
