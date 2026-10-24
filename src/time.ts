// Даты храним строками YYYY-MM-DD в часовом поясе центра: оплата в 01:00 по Ташкенту
// 1-го числа должна попасть в новый месяц, хотя по UTC это ещё предыдущий.

export function todayIn(timeZone: string, now: Date): string {
  // Локаль en-CA форматирует дату как YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function nextMonthStart(month: string): string {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  return mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`;
}
