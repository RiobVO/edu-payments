import { DatabaseSync } from 'node:sqlite';

// Суммы — целые числа в сумах: у сума нет ходовых копеек, а float в деньгах даёт ошибки округления.
// AUTOINCREMENT нужен, чтобы id удалённого ученика никогда не достался новому: иначе оплата,
// отправленная по старой ссылке, молча записалась бы другому человеку.
const COLUMNS = {
  students: `(
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  phone       TEXT    NOT NULL,
  group_name  TEXT    NOT NULL,
  monthly_fee INTEGER NOT NULL CHECK (monthly_fee > 0),
  -- С какой даты учится: за месяцы до неё долга нет
  start_date  TEXT    NOT NULL
)`,
  payments: `(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL CHECK (amount > 0),
  paid_at    TEXT    NOT NULL
)`,
};

const COLUMN_NAMES = {
  students: 'id, name, phone, group_name, monthly_fee, start_date',
  payments: 'id, student_id, amount, paid_at',
};

const INDEXES = 'CREATE INDEX IF NOT EXISTS payments_student_date ON payments(student_id, paid_at);';

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  // В SQLite внешние ключи выключены по умолчанию — без этого не сработает каскадное удаление оплат
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS students ${COLUMNS.students};
    CREATE TABLE IF NOT EXISTS payments ${COLUMNS.payments};
  `);
  migrate(db);
  db.exec(INDEXES);
  return db;
}

function migrate(db: DatabaseSync): void {
  // Первая опубликованная версия хранила дату записи в created_at; теперь это редактируемая start_date
  const columns = db.prepare('SELECT name FROM pragma_table_info(?)').all('students') as { name: string }[];
  if (columns.some((c) => c.name === 'created_at')) {
    db.exec('ALTER TABLE students RENAME COLUMN created_at TO start_date');
  }

  // Таблицы ранних версий созданы без AUTOINCREMENT. Добавить его через ALTER TABLE SQLite не умеет,
  // поэтому таблицу перестраиваем: https://www.sqlite.org/lang_altertable.html#otheralter
  const outdated = (['students', 'payments'] as const).filter((table) => {
    const row = db.prepare('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?').get('table', table) as
      { sql: string } | undefined;
    return row !== undefined && !row.sql.includes('AUTOINCREMENT');
  });
  if (outdated.length === 0) return;

  // Внешние ключи выключаются только вне транзакции; иначе DROP TABLE students каскадно стёр бы оплаты
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    for (const table of outdated) {
      db.exec(`
        CREATE TABLE ${table}_rebuild ${COLUMNS[table]};
        INSERT INTO ${table}_rebuild (${COLUMN_NAMES[table]}) SELECT ${COLUMN_NAMES[table]} FROM ${table};
        DROP TABLE ${table};
        ALTER TABLE ${table}_rebuild RENAME TO ${table};
      `);
    }
    const broken = db.prepare('PRAGMA foreign_key_check').all();
    if (broken.length > 0) throw new Error(`Migration left ${broken.length} broken foreign keys`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw new Error('Failed to rebuild tables with AUTOINCREMENT', { cause: err });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
