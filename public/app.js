// Страница должников: список за месяц + форма оплаты. Без фреймворка — две формы не стоят сборки.
// Весь пользовательский текст выводится через textContent, чтобы имя вроде <img onerror> не стало XSS.

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

const money = new Intl.NumberFormat('ru-RU');
const plural = new Intl.PluralRules('ru-RU');

const $ = (id) => document.getElementById(id);
const ui = {
  monthTitle: $('month-title'),
  prev: $('prev-month'),
  next: $('next-month'),
  summaryText: $('summary-text'),
  summaryTotal: $('summary-total'),
  list: $('debtors'),
  state: $('state'),
  stateText: $('state-text'),
  retry: $('retry'),
  openPayment: $('open-payment'),
  dialog: $('payment-dialog'),
  form: $('payment-form'),
  student: $('payment-student'),
  studentHint: $('student-hint'),
  amount: $('payment-amount'),
  quickFill: $('quick-fill'),
  date: $('payment-date'),
  dateHint: $('date-hint'),
  error: $('payment-error'),
  submit: $('submit-payment'),
  close: $('close-payment'),
  toast: $('toast'),
};

const state = {
  // Часовой пояс центра приходит с сервера (/config), чтобы «сегодня» в форме совпадало с проверкой API
  timeZone: undefined,
  month: null,
  currentMonth: null,
  debtors: [],
  students: [],
};

function todayInCenter() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: state.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const monthIndex = (month) => Number(month.slice(5, 7)) - 1;

function monthTitle(month) {
  const name = MONTHS[monthIndex(month)];
  return `${name[0].toUpperCase()}${name.slice(1)} ${month.slice(0, 4)}`;
}

// Разрешены только цифры и пробелы-разделители. Точку, минус или буквы не вырезаем молча:
// иначе вставленное «500000.50» превратилось бы в 50 000 050 сум. Возвращает null для такого ввода.
function parseAmount(text) {
  const compact = text.replace(/[\s\u00a0\u202f]/g, '');
  if (compact === '') return 0;
  return /^\d{1,11}$/.test(compact) ? Number(compact) : null;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(body?.message ?? `HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return body;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function phoneIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2');
  svg.append(path);
  return svg;
}

// ——— Список должников ———

function renderSummary(data) {
  const count = data.debtors.length;
  const monthIn = MONTHS_IN[monthIndex(data.month)];
  if (count === 0) {
    ui.summaryText.textContent = `В ${monthIn} долгов нет`;
    ui.summaryTotal.replaceChildren();
    return;
  }
  const form = plural.select(count);
  const verb = form === 'one' ? 'должен' : 'должны';
  const noun = form === 'one' ? 'ученик' : form === 'few' ? 'ученика' : 'учеников';
  ui.summaryText.textContent = `В ${monthIn} ${verb} ${count} ${noun}`;
  ui.summaryTotal.replaceChildren(money.format(data.totalDebt), el('small', { text: 'сум' }));
}

function buildDebtorRow(debtor) {
  const row = el('li', { class: 'debtor', 'data-id': debtor.studentId });
  const main = el('button', { type: 'button', class: 'debtor-main' }, [
    el('span', { class: 'debtor-name' }),
    el('span', { class: 'debtor-debt' }),
    el('span', { class: 'debtor-group' }),
    el('span', { class: 'debtor-paid' }),
    el('span', { class: 'meter', 'aria-hidden': 'true' }, [el('span', { class: 'meter-fill' })]),
  ]);
  main.addEventListener('click', () => openPayment(Number(row.dataset.id)));
  const call = el('a', { class: 'debtor-call' }, [phoneIcon()]);
  row.append(main, call);
  return row;
}

function updateDebtorRow(row, debtor) {
  const main = row.querySelector('.debtor-main');
  main.querySelector('.debtor-name').textContent = debtor.name;
  main.querySelector('.debtor-debt').textContent = money.format(debtor.debt);
  main.querySelector('.debtor-group').textContent = debtor.group;
  main.querySelector('.debtor-paid').textContent = `из ${money.format(debtor.monthlyFee)}`;
  main.setAttribute('aria-label', `${debtor.name}, долг ${money.format(debtor.debt)} из ${money.format(debtor.monthlyFee)} сум, внесено ${money.format(debtor.paid)}. Внести оплату`);
  // У новой строки шкала сразу на месте; плавно растёт только у уже показанной — после оплаты
  main.querySelector('.meter-fill').style.width = `${Math.min(100, (debtor.paid / debtor.monthlyFee) * 100)}%`;

  const call = row.querySelector('.debtor-call');
  call.href = `tel:${debtor.phone.replace(/[^\d+]/g, '')}`;
  call.setAttribute('aria-label', `Позвонить: ${debtor.name}, ${debtor.phone}`);
}

// Строки переиспользуются по id ученика: после оплаты шкала плавно дорастает, а не перерисовывается
function renderDebtors(debtors) {
  const existing = new Map([...ui.list.children].map((row) => [Number(row.dataset.id), row]));
  const rows = debtors.map((debtor) => {
    const row = existing.get(debtor.studentId) ?? buildDebtorRow(debtor);
    updateDebtorRow(row, debtor);
    return row;
  });
  ui.list.replaceChildren(...rows);
}

function showState(text, { retry = false, html = null } = {}) {
  ui.state.hidden = false;
  if (html) ui.stateText.replaceChildren(...html);
  else ui.stateText.textContent = text;
  ui.retry.hidden = !retry;
}

// При быстром листании месяцев ответы могут прийти не по порядку — применяем только последний запрос
let debtorsRequest = 0;

async function loadDebtors(month = state.month) {
  const request = ++debtorsRequest;
  const isStale = () => request !== debtorsRequest;
  ui.list.setAttribute('aria-busy', 'true');
  try {
    const data = await api(month ? `/debtors?month=${month}` : '/debtors');
    if (isStale()) return;
    state.month = data.month;
    state.currentMonth ??= data.month;
    state.debtors = data.debtors;

    ui.monthTitle.textContent = monthTitle(data.month);
    ui.next.disabled = data.month >= state.currentMonth;
    renderSummary(data);
    renderDebtors(data.debtors);
    ui.state.hidden = true;

    if (data.debtors.length === 0) await showEmptyState(data.month, isStale);
  } catch (err) {
    if (isStale()) return;
    ui.summaryText.textContent = 'Нет данных';
    ui.summaryTotal.replaceChildren();
    ui.list.replaceChildren();
    showState(`Не удалось загрузить должников: ${err.message}. Проверьте, что сервер запущен, и повторите.`, { retry: true });
  } finally {
    if (!isStale()) ui.list.removeAttribute('aria-busy');
  }
}

async function showEmptyState(month, isStale) {
  const students = await api('/students');
  if (isStale()) return;
  if (students.length > 0) {
    showState(`За ${MONTHS[monthIndex(month)]} все ученики оплатили полностью.`);
    return;
  }
  showState('', {
    html: [
      'Учеников пока нет. Для демо-данных выполните ',
      el('code', { text: 'npm run seed' }),
      ', учеников можно добавить через API — примеры в README.',
    ],
  });
}

// ——— Форма оплаты ———

function debtFor(studentId) {
  return state.debtors.find((d) => d.studentId === studentId);
}

function fillAmount(value) {
  ui.amount.value = value ? money.format(value) : '';
  ui.amount.removeAttribute('aria-invalid');
}

function updateStudentHints() {
  const id = Number(ui.student.value);
  const student = state.students.find((s) => s.id === id);
  ui.quickFill.replaceChildren();
  if (!student) {
    ui.studentHint.textContent = '';
    return;
  }

  const debtor = debtFor(id);
  const monthName = MONTHS[monthIndex(state.month)];
  ui.studentHint.textContent = debtor
    ? `Долг за ${monthName}: ${money.format(debtor.debt)} сум`
    : `За ${monthName} долга нет`;

  if (debtor) {
    const all = el('button', { type: 'button' }, ['Весь долг ', el('strong', { text: money.format(debtor.debt) })]);
    all.addEventListener('click', () => fillAmount(debtor.debt));
    ui.quickFill.append(all);
  }
  if (!debtor || debtor.debt !== student.monthlyFee) {
    const fee = el('button', { type: 'button' }, ['За месяц ', el('strong', { text: money.format(student.monthlyFee) })]);
    fee.addEventListener('click', () => fillAmount(student.monthlyFee));
    ui.quickFill.append(fee);
  }
}

// Оплата засчитывается в месяц своей даты — подсказываем это, чтобы не было сюрпризов
function updateDateHint() {
  const value = ui.date.value;
  ui.dateHint.textContent = value ? `Засчитается за ${MONTHS[monthIndex(value.slice(0, 7))]} ${value.slice(0, 4)}` : '';
}

// Номер открытия формы: ответ /students от прошлого открытия не должен подменить выбранного ученика
let paymentSession = 0;

async function openPayment(studentId = null) {
  const session = ++paymentSession;
  // Дата по умолчанию считается в поясе центра — без него форма могла бы подставить «вчера» или «завтра»
  await configReady;
  if (session !== paymentSession) return;
  ui.form.reset();
  ui.error.textContent = '';
  ui.form.querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'));
  const today = todayInCenter();
  ui.date.value = today;
  ui.date.max = today;
  updateDateHint();
  ui.dialog.showModal();

  let students;
  try {
    students = await api('/students');
  } catch (err) {
    if (session === paymentSession) ui.error.textContent = `Не удалось загрузить учеников: ${err.message}`;
    return;
  }
  if (session !== paymentSession) return;
  state.students = students;
  ui.student.replaceChildren(
    el('option', { value: '', text: 'Выберите ученика' }),
    ...state.students.map((s) => el('option', { value: s.id, text: `${s.name} (${s.group})` })),
  );

  if (studentId) {
    ui.student.value = String(studentId);
    fillAmount(debtFor(studentId)?.debt ?? 0);
    updateStudentHints();
    ui.amount.focus();
    ui.amount.select();
  } else {
    updateStudentHints();
    ui.student.focus();
  }
}

function validate() {
  const studentId = Number(ui.student.value);
  const amount = parseAmount(ui.amount.value);
  const date = ui.date.value;
  const problems = [];

  if (!studentId) problems.push([ui.student, 'Выберите ученика']);
  if (amount === null) problems.push([ui.amount, 'Сумма — целое число сумов, только цифры']);
  else if (amount <= 0) problems.push([ui.amount, 'Введите сумму больше нуля']);
  if (!date) problems.push([ui.date, 'Укажите дату оплаты']);
  else if (date > todayInCenter()) problems.push([ui.date, 'Дата оплаты не может быть в будущем']);

  for (const field of [ui.student, ui.amount, ui.date]) field.removeAttribute('aria-invalid');
  for (const [field] of problems) field.setAttribute('aria-invalid', 'true');
  if (problems.length > 0) {
    ui.error.textContent = `${problems.map(([, message]) => message).join('. ')}.`;
    problems[0][0].focus();
    return null;
  }
  return { studentId, amount, date };
}

let toastTimer;
function showToast(text) {
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 4000);
}

async function submitPayment(event) {
  event.preventDefault();
  const payment = validate();
  if (!payment) return;

  ui.error.textContent = '';
  ui.submit.disabled = true;
  ui.submit.textContent = 'Вносим…';
  try {
    await api(`/students/${payment.studentId}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount: payment.amount, date: payment.date }),
    });
    const student = state.students.find((s) => s.id === payment.studentId);
    ui.dialog.close();
    showToast(`${student?.name ?? 'Ученик'}: внесено ${money.format(payment.amount)} сум`);
    await loadDebtors();
  } catch (err) {
    ui.error.textContent = err.status === 404
      ? 'Этого ученика уже нет в базе. Обновите страницу.'
      : `Оплата не внесена: ${err.message}`;
  } finally {
    ui.submit.disabled = false;
    ui.submit.textContent = 'Внести оплату';
  }
}

// ——— События ———

ui.prev.addEventListener('click', () => loadDebtors(shiftMonth(state.month, -1)));
ui.next.addEventListener('click', () => loadDebtors(shiftMonth(state.month, 1)));
ui.retry.addEventListener('click', () => loadDebtors());
ui.openPayment.addEventListener('click', () => openPayment());
ui.close.addEventListener('click', () => ui.dialog.close());
ui.dialog.addEventListener('close', () => { paymentSession += 1; });
// Клик по затемнённому фону вокруг шторки закрывает её
ui.dialog.addEventListener('click', (event) => { if (event.target === ui.dialog) ui.dialog.close(); });
ui.student.addEventListener('change', () => {
  updateStudentHints();
  fillAmount(debtFor(Number(ui.student.value))?.debt ?? 0);
});
ui.amount.addEventListener('input', () => {
  const amount = parseAmount(ui.amount.value);
  // Некорректный ввод оставляем как есть — validate() покажет ошибку, а не исправит сумму втихую
  if (amount !== null) ui.amount.value = amount ? money.format(amount) : '';
  ui.amount.removeAttribute('aria-invalid');
});
ui.date.addEventListener('input', updateDateHint);
ui.form.addEventListener('submit', submitPayment);

async function loadConfig() {
  try {
    ({ timeZone: state.timeZone } = await api('/config'));
  } catch {
    // Без /config берём пояс браузера: дату в будущем всё равно отсечёт сервер, а список загрузится и покажет ошибку сам
    state.timeZone = undefined;
  }
}

const configReady = loadConfig();
configReady.then(() => loadDebtors());
