import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { openDatabase } from '../src/db.js';

it('переносит базу первой версии: created_at становится start_date, данные сохраняются', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'edu-payments-')), 'old.db');
  const old = new DatabaseSync(path);
  old.exec(`
    CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, group_name TEXT NOT NULL,
      monthly_fee INTEGER NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO students (name, phone, group_name, monthly_fee, created_at) VALUES ('Азиз', '+998901234567', 'A1', 500000, '2026-09-01');
  `);
  old.close();

  const db = openDatabase(path);
  expect(db.prepare('SELECT name, start_date FROM students').get()).toEqual({ name: 'Азиз', start_date: '2026-09-01' });
  db.close();

  // Повторное открытие уже перенесённой базы ничего не ломает
  openDatabase(path).close();
});

it('перестраивает таблицы без AUTOINCREMENT: данные и каскад целы, удалённый id больше не выдаётся', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'edu-payments-')), 'reuse.db');
  const old = new DatabaseSync(path);
  old.exec(`
    CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, group_name TEXT NOT NULL,
      monthly_fee INTEGER NOT NULL CHECK (monthly_fee > 0), start_date TEXT NOT NULL);
    CREATE TABLE payments (id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL CHECK (amount > 0), paid_at TEXT NOT NULL);
    INSERT INTO students VALUES (1, 'Азиз', '+998901234567', 'A1', 500000, '2026-09-01');
    INSERT INTO students VALUES (2, 'Малика', '+998901234568', 'A1', 500000, '2026-09-01');
    INSERT INTO payments VALUES (1, 2, 100000, '2026-10-01');
  `);
  old.close();

  const db = openDatabase(path);
  const schema = (name: string) => (db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(name) as { sql: string }).sql;
  expect(schema('students')).toContain('AUTOINCREMENT');
  expect(schema('payments')).toContain('AUTOINCREMENT');
  expect(db.prepare('SELECT student_id, amount FROM payments').all()).toEqual([{ student_id: 2, amount: 100000 }]);

  // Каскад по-прежнему работает, а id удалённого последнего ученика не достаётся новому
  db.exec('DELETE FROM students WHERE id = 2');
  expect(db.prepare('SELECT COUNT(*) AS n FROM payments').get()).toEqual({ n: 0 });
  const { id } = db.prepare(`INSERT INTO students (name, phone, group_name, monthly_fee, start_date)
    VALUES ('Новый', '+998901234569', 'A1', 500000, '2026-10-01') RETURNING id`).get() as { id: number };
  expect(id).toBe(3);
  db.close();

  openDatabase(path).close();
});
