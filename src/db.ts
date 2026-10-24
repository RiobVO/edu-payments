import { DatabaseSync } from 'node:sqlite';

// Суммы — целые числа в сумах: у сума нет ходовых копеек, а float в деньгах даёт ошибки округления
const SCHEMA = `
CREATE TABLE IF NOT EXISTS students (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  phone       TEXT    NOT NULL,
  group_name  TEXT    NOT NULL,
  monthly_fee INTEGER NOT NULL CHECK (monthly_fee > 0),
  created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id         INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL CHECK (amount > 0),
  paid_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS payments_student_date ON payments(student_id, paid_at);
`;

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  // В SQLite внешние ключи выключены по умолчанию — без этого не сработает каскадное удаление оплат
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}
