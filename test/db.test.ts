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
