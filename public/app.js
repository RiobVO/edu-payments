// Страница учёта: должники и все ученики за месяц, карточка ученика, формы оплаты и ученика.
// Без фреймворка — несколько форм не стоят сборки.
// Весь пользовательский текст выводится через textContent, чтобы имя вроде <img onerror> не стало XSS.

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

const money = new Intl.NumberFormat('ru-RU');
const plural = new Intl.PluralRules('ru-RU');
const longDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const $ = (id) => document.getElementById(id);
const ui = {
  monthTitle: $('month-title'),
  prev: $('prev-month'),
  next: $('next-month'),
  summaryText: $('summary-text'),
  summaryTotal: $('summary-total'),
  viewButtons: document.querySelectorAll('[data-view]'),
  countDebtors: $('count-debtors'),
  countAll: $('count-all'),
  list: $('debtors'),
  state: $('state'),
  stateText: $('state-text'),
  retry: $('retry'),
  openPayment: $('open-payment'),
  openStudentForm: $('open-student-form'),
  toast: $('toast'),
  payment: {
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
  },
  card: {
    dialog: $('student-dialog'),
    title: $('student-title'),
    group: $('student-group'),
    phone: $('student-phone'),
    fee: $('student-fee'),
    start: $('student-start'),
    status: $('student-status'),
    edit: $('edit-student'),
    pay: $('pay-student'),
    history: $('history-list'),
    historyState: $('history-state'),
    deleteButton: $('delete-student'),
    confirm: $('delete-confirm'),
    question: $('delete-question'),
    cancel: $('delete-cancel'),
    confirmDelete: $('delete-yes'),
    error: $('student-error'),
  },
  studentForm: {
    dialog: $('student-form-dialog'),
    form: $('student-form'),
    title: $('student-form-title'),
    name: $('sf-name'),
    phone: $('sf-phone'),
    group: $('sf-group'),
    groups: $('group-options'),
    fee: $('sf-fee'),
    start: $('sf-start'),
    error: $('student-form-error'),
    submit: $('submit-student'),
  },
};

const state = {
  // Часовой пояс центра приходит с сервера (/config), чтобы «сегодня» в формах совпадало с проверкой API
  timeZone: undefined,
  month: null,
  currentMonth: null,
  view: 'debtors',
  debtors: [],
  students: [],
  // Ученик, открытый в карточке или в форме редактирования
  studentId: null,
};

// ——— Утилиты ———

function todayInCenter() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: state.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const monthIndex = (month) => Number(month.slice(5, 7)) - 1;
const monthName = (month) => MONTHS[monthIndex(month)];

function monthTitle(month) {
  const name = monthName(month);
  return `${name[0].toUpperCase()}${name.slice(1)} ${month.slice(0, 4)}`;
}

// «2026-09-01» → «1 сентября 2026»; Intl добавляет « г.», в списке и карточке он лишний
const formatDate = (iso) => longDate.format(new Date(`${iso}T00:00:00Z`)).replace(/\s?г\.$/, '');

// Разрешены только цифры и пробелы-разделители. Точку, минус или буквы не вырезаем молча:
// иначе вставленное «500000.50» превратилось бы в 50 000 050 сум. Возвращает null для такого ввода.
function parseAmount(text) {
  const compact = text.replace(/[\s\u00a0\u202f]/g, '');
  if (compact === '') return 0;
  return /^\d{1,11}$/.test(compact) ? Number(compact) : null;
}

// Поле суммы форматируется по мере ввода; некорректный ввод оставляем как есть — его покажет проверка формы
function attachMoneyInput(input) {
  input.addEventListener('input', () => {
    const amount = parseAmount(input.value);
    if (amount !== null) input.value = amount ? money.format(amount) : '';
    input.removeAttribute('aria-invalid');
  });
}

const telHref = (phone) => `tel:${phone.replace(/[^\d+]/g, '')}`;

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

// Одновременно открыта только одна шторка: переход между ними закрывает предыдущую
function showDialog(dialog) {
  for (const open of document.querySelectorAll('dialog[open]')) if (open !== dialog) open.close();
  if (!dialog.open) dialog.showModal();
}

let toastTimer;
function showToast(text) {
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 4000);
}

// Показывает ошибки формы: подсвечивает поля и собирает сообщения в одну строку
function reportProblems(fields, errorNode, problems) {
  for (const field of fields) field.removeAttribute('aria-invalid');
  for (const [field] of problems) field.setAttribute('aria-invalid', 'true');
  if (problems.length === 0) return true;
  errorNode.textContent = `${problems.map(([, message]) => message).join('. ')}.`;
  problems[0][0].focus();
  return false;
}

// ——— Месяц: сводка и список ———

const debtFor = (studentId) => state.debtors.find((d) => d.studentId === studentId);
const studentById = (studentId) => state.students.find((s) => s.id === studentId);

// Статус ученика за выбранный месяц: должник, оплатил или ещё не учился
function monthStatus(student) {
  if (student.startDate >= `${shiftMonth(state.month, 1)}-01`) return { kind: 'not-started' };
  const debtor = debtFor(student.id);
  return debtor ? { kind: 'debt', debtor } : { kind: 'paid' };
}

function renderSummary() {
  const count = state.debtors.length;
  const monthIn = MONTHS_IN[monthIndex(state.month)];
  ui.countDebtors.textContent = String(count);
  ui.countAll.textContent = String(state.students.length);
  if (count === 0) {
    ui.summaryText.textContent = `В ${monthIn} долгов нет`;
    ui.summaryTotal.replaceChildren();
    return;
  }
  const form = plural.select(count);
  const verb = form === 'one' ? 'должен' : 'должны';
  const noun = form === 'one' ? 'ученик' : form === 'few' ? 'ученика' : 'учеников';
  const total = state.debtors.reduce((sum, d) => sum + d.debt, 0);
  ui.summaryText.textContent = `В ${monthIn} ${verb} ${count} ${noun}`;
  ui.summaryTotal.replaceChildren(money.format(total), el('small', { text: 'сум' }));
}

function buildRow() {
  const row = el('li', { class: 'debtor' });
  const main = el('button', { type: 'button', class: 'debtor-main' }, [
    el('span', { class: 'debtor-name' }),
    el('span', { class: 'debtor-debt' }),
    el('span', { class: 'debtor-group' }),
    el('span', { class: 'debtor-paid' }),
    el('span', { class: 'meter', 'aria-hidden': 'true' }, [el('span', { class: 'meter-fill' })]),
  ]);
  main.addEventListener('click', () => openStudent(Number(row.dataset.id)));
  row.append(main, el('a', { class: 'debtor-call' }, [phoneIcon()]));
  return row;
}

function updateRow(row, student) {
  const status = monthStatus(student);
  const month = monthName(state.month);
  const fee = money.format(student.monthlyFee);
  let right;
  let below;
  let filled;
  let label;
  if (status.kind === 'debt') {
    right = money.format(status.debtor.debt);
    below = `из ${fee}`;
    filled = status.debtor.paid / student.monthlyFee;
    label = `долг ${right} из ${fee} сум, внесено ${money.format(status.debtor.paid)}`;
  } else if (status.kind === 'paid') {
    right = 'оплачено';
    below = `${fee} в месяц`;
    filled = 1;
    label = `за ${month} оплачено`;
  } else {
    right = '—';
    below = `с ${formatDate(student.startDate)}`;
    filled = 0;
    label = `учится с ${formatDate(student.startDate)}, за ${month} не должен`;
  }

  row.dataset.id = String(student.id);
  row.dataset.status = status.kind;
  const main = row.querySelector('.debtor-main');
  main.querySelector('.debtor-name').textContent = student.name;
  main.querySelector('.debtor-debt').textContent = right;
  main.querySelector('.debtor-group').textContent = student.group;
  main.querySelector('.debtor-paid').textContent = below;
  main.setAttribute('aria-label', `${student.name}, ${label}. Открыть карточку`);
  // У новой строки шкала сразу на месте; плавно растёт только у уже показанной — после оплаты
  main.querySelector('.meter-fill').style.width = `${Math.min(100, filled * 100)}%`;

  const call = row.querySelector('.debtor-call');
  call.href = telHref(student.phone);
  call.setAttribute('aria-label', `Позвонить: ${student.name}, ${student.phone}`);
}

// Строки переиспользуются по id ученика: после оплаты шкала плавно дорастает, а не перерисовывается
function renderList() {
  const students = state.view === 'debtors'
    ? state.debtors.map((d) => studentById(d.studentId)).filter(Boolean)
    : state.students;
  const existing = new Map([...ui.list.children].map((row) => [Number(row.dataset.id), row]));
  ui.list.replaceChildren(...students.map((student) => {
    const row = existing.get(student.id) ?? buildRow();
    updateRow(row, student);
    return row;
  }));

  for (const button of ui.viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
  renderEmptyState(students.length);
}

function showState(content, { retry = false } = {}) {
  ui.state.hidden = false;
  ui.stateText.replaceChildren(...content);
  ui.retry.hidden = !retry;
}

function renderEmptyState(shown) {
  if (shown > 0) {
    ui.state.hidden = true;
  } else if (state.students.length === 0) {
    showState(['Учеников пока нет. Добавьте первого кнопкой «+ Ученик» или заполните демо-данными: ', el('code', { text: 'npm run seed' }), '.']);
  } else {
    showState([`За ${monthName(state.month)} все ученики оплатили полностью.`]);
  }
}

// При быстром листании месяцев ответы могут прийти не по порядку — применяем только последний запрос
let monthRequest = 0;

async function loadMonth(month = state.month) {
  const request = ++monthRequest;
  ui.list.setAttribute('aria-busy', 'true');
  try {
    const [data, students] = await Promise.all([
      api(month ? `/debtors?month=${month}` : '/debtors'),
      api('/students'),
    ]);
    if (request !== monthRequest) return;
    state.month = data.month;
    state.currentMonth ??= data.month;
    state.debtors = data.debtors;
    state.students = students;

    ui.monthTitle.textContent = monthTitle(data.month);
    ui.next.disabled = data.month >= state.currentMonth;
    renderSummary();
    renderList();
  } catch (err) {
    if (request !== monthRequest) return;
    ui.summaryText.textContent = 'Нет данных';
    ui.summaryTotal.replaceChildren();
    ui.list.replaceChildren();
    showState([`Не удалось загрузить данные: ${err.message}. Проверьте, что сервер запущен, и повторите.`], { retry: true });
  } finally {
    if (request === monthRequest) ui.list.removeAttribute('aria-busy');
  }
}

// ——— Карточка ученика ———

// Номер открытия карточки: история прошлого ученика не должна попасть в карточку следующего
let cardSession = 0;

function resetDeleteConfirm() {
  ui.card.confirm.hidden = true;
  ui.card.deleteButton.hidden = false;
  ui.card.error.textContent = '';
}

async function openStudent(studentId) {
  const student = studentById(studentId);
  if (!student) return;
  const session = ++cardSession;
  state.studentId = studentId;
  const { card } = ui;

  card.title.textContent = student.name;
  card.group.textContent = student.group;
  card.phone.textContent = student.phone;
  card.phone.href = telHref(student.phone);
  card.fee.textContent = `${money.format(student.monthlyFee)} сум`;
  card.start.textContent = formatDate(student.startDate);

  const status = monthStatus(student);
  const month = monthName(state.month);
  card.status.dataset.status = status.kind;
  card.status.textContent = status.kind === 'debt'
    ? `Долг за ${month}: ${money.format(status.debtor.debt)} сум`
    : status.kind === 'paid' ? `За ${month} оплачено` : `В ${MONTHS_IN[monthIndex(state.month)]} ещё не учился`;

  resetDeleteConfirm();
  // Вопрос ставим сразу: если история ещё грузится, подтверждение не должно называть прошлого ученика
  card.question.textContent = `Удалить ученика «${student.name}» вместе с его оплатами? Это нельзя отменить.`;
  card.history.replaceChildren();
  card.historyState.textContent = 'Загружаем оплаты…';
  showDialog(card.dialog);

  try {
    const payments = await api(`/students/${studentId}/payments`);
    if (session !== cardSession) return;
    card.history.replaceChildren(...payments.map((p) => el('li', {}, [
      el('span', { text: formatDate(p.date) }),
      el('strong', { text: `${money.format(p.amount)} сум` }),
    ])));
    card.historyState.textContent = payments.length === 0 ? 'Оплат пока нет' : '';
    card.question.textContent = payments.length === 0
      ? `Удалить ученика «${student.name}»? Это нельзя отменить.`
      : `Удалить ученика «${student.name}» и ${payments.length} ${plural.select(payments.length) === 'one' ? 'оплату' : plural.select(payments.length) === 'few' ? 'оплаты' : 'оплат'}? Это нельзя отменить.`;
  } catch (err) {
    if (session !== cardSession) return;
    card.historyState.textContent = `Не удалось загрузить оплаты: ${err.message}`;
  }
}

async function deleteStudent() {
  const student = studentById(state.studentId);
  ui.card.confirmDelete.disabled = true;
  try {
    await api(`/students/${state.studentId}`, { method: 'DELETE' });
    ui.card.dialog.close();
    showToast(`Ученик удалён: ${student?.name ?? ''}`);
    await loadMonth();
  } catch (err) {
    ui.card.error.textContent = err.status === 404
      ? 'Этого ученика уже нет в базе. Обновите страницу.'
      : `Ученик не удалён: ${err.message}`;
  } finally {
    ui.card.confirmDelete.disabled = false;
  }
}

// ——— Форма оплаты ———

function fillAmount(value) {
  ui.payment.amount.value = value ? money.format(value) : '';
  ui.payment.amount.removeAttribute('aria-invalid');
}

function updatePaymentHints() {
  const { payment } = ui;
  const id = Number(payment.student.value);
  const student = studentById(id);
  payment.quickFill.replaceChildren();
  if (!student) {
    payment.studentHint.textContent = '';
    return;
  }

  const debtor = debtFor(id);
  const month = monthName(state.month);
  payment.studentHint.textContent = debtor
    ? `Долг за ${month}: ${money.format(debtor.debt)} сум`
    : `За ${month} долга нет`;

  if (debtor) {
    const all = el('button', { type: 'button' }, ['Весь долг ', el('strong', { text: money.format(debtor.debt) })]);
    all.addEventListener('click', () => fillAmount(debtor.debt));
    payment.quickFill.append(all);
  }
  if (!debtor || debtor.debt !== student.monthlyFee) {
    const fee = el('button', { type: 'button' }, ['За месяц ', el('strong', { text: money.format(student.monthlyFee) })]);
    fee.addEventListener('click', () => fillAmount(student.monthlyFee));
    payment.quickFill.append(fee);
  }
}

// Оплата засчитывается в месяц своей даты — подсказываем это, чтобы не было сюрпризов
function updateDateHint() {
  const value = ui.payment.date.value;
  ui.payment.dateHint.textContent = value ? `Засчитается за ${monthName(value.slice(0, 7))} ${value.slice(0, 4)}` : '';
}

// Номер открытия формы: ответ /students от прошлого открытия не должен подменить выбранного ученика
let paymentSession = 0;

async function openPayment(studentId = null) {
  const session = ++paymentSession;
  // Дата по умолчанию считается в поясе центра — без него форма могла бы подставить «вчера» или «завтра»
  await configReady;
  if (session !== paymentSession) return;
  const { payment } = ui;
  payment.form.reset();
  payment.submit.disabled = false;
  payment.submit.textContent = 'Внести оплату';
  payment.error.textContent = '';
  payment.form.querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'));
  const today = todayInCenter();
  payment.date.value = today;
  payment.date.max = today;
  updateDateHint();
  showDialog(payment.dialog);

  let students;
  try {
    students = await api('/students');
  } catch (err) {
    if (session === paymentSession) payment.error.textContent = `Не удалось загрузить учеников: ${err.message}`;
    return;
  }
  if (session !== paymentSession) return;
  state.students = students;
  payment.student.replaceChildren(
    el('option', { value: '', text: 'Выберите ученика' }),
    ...students.map((s) => el('option', { value: s.id, text: `${s.name} (${s.group})` })),
  );

  if (studentId) {
    payment.student.value = String(studentId);
    fillAmount(debtFor(studentId)?.debt ?? 0);
    updatePaymentHints();
    payment.amount.focus();
    payment.amount.select();
  } else {
    updatePaymentHints();
    payment.student.focus();
  }
}

function validatePayment() {
  const { payment } = ui;
  const studentId = Number(payment.student.value);
  const amount = parseAmount(payment.amount.value);
  const date = payment.date.value;
  const problems = [];

  if (!studentId) problems.push([payment.student, 'Выберите ученика']);
  if (amount === null) problems.push([payment.amount, 'Сумма — целое число сумов, только цифры']);
  else if (amount <= 0) problems.push([payment.amount, 'Введите сумму больше нуля']);
  if (!date) problems.push([payment.date, 'Укажите дату оплаты']);
  else if (date > todayInCenter()) problems.push([payment.date, 'Дата оплаты не может быть в будущем']);

  return reportProblems([payment.student, payment.amount, payment.date], payment.error, problems)
    ? { studentId, amount, date }
    : null;
}

async function submitPayment(event) {
  event.preventDefault();
  const { payment } = ui;
  const values = validatePayment();
  if (!values) return;

  // Пока запрос в пути, форму могут закрыть и открыть заново — тогда её не трогаем
  const session = paymentSession;
  const isCurrent = () => session === paymentSession;
  payment.error.textContent = '';
  payment.submit.disabled = true;
  payment.submit.textContent = 'Вносим…';
  try {
    await api(`/students/${values.studentId}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount: values.amount, date: values.date }),
    });
    if (isCurrent()) payment.dialog.close();
    showToast(`${studentById(values.studentId)?.name ?? 'Ученик'}: внесено ${money.format(values.amount)} сум`);
    await loadMonth();
  } catch (err) {
    if (!isCurrent()) return;
    payment.error.textContent = err.status === 404
      ? 'Этого ученика уже нет в базе. Обновите страницу.'
      : `Оплата не внесена: ${err.message}`;
  } finally {
    if (isCurrent()) {
      payment.submit.disabled = false;
      payment.submit.textContent = 'Внести оплату';
    }
  }
}

// ——— Форма ученика: добавление и изменение ———

// Ошибку API («body/phone must match pattern») переводим в понятную подсказку у нужного поля
const FIELD_ERRORS = {
  name: 'Укажите имя',
  phone: 'В телефоне должно быть от 7 до 15 цифр',
  group: 'Укажите группу',
  monthlyFee: 'Сумма в месяц — целое число больше нуля',
  startDate: 'Укажите дату начала учёбы',
};

// Номер открытия формы ученика: ответ на прошлое сохранение не должен закрыть новую форму
let studentFormSession = 0;

async function openStudentForm(studentId = null) {
  const session = ++studentFormSession;
  await configReady;
  if (session !== studentFormSession) return;
  const { studentForm: f } = ui;
  const student = studentId ? studentById(studentId) : null;
  state.studentId = student?.id ?? null;

  f.form.reset();
  f.submit.disabled = false;
  f.error.textContent = '';
  f.form.querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'));
  f.title.textContent = student ? 'Изменить ученика' : 'Новый ученик';
  f.submit.textContent = student ? 'Сохранить' : 'Добавить ученика';
  f.name.value = student?.name ?? '';
  f.phone.value = student?.phone ?? '';
  f.group.value = student?.group ?? '';
  f.fee.value = student ? money.format(student.monthlyFee) : '';
  f.start.value = student?.startDate ?? todayInCenter();

  const groups = [...new Set(state.students.map((s) => s.group))].sort((a, b) => a.localeCompare(b, 'ru'));
  f.groups.replaceChildren(...groups.map((group) => el('option', { value: group })));

  showDialog(f.dialog);
  f.name.focus();
}

function validateStudent() {
  const { studentForm: f } = ui;
  const values = {
    name: f.name.value.trim(),
    phone: f.phone.value.trim(),
    group: f.group.value.trim(),
    monthlyFee: parseAmount(f.fee.value),
    startDate: f.start.value,
  };
  const digits = values.phone.replace(/\D/g, '').length;
  const problems = [];

  if (!values.name) problems.push([f.name, FIELD_ERRORS.name]);
  if (!/^\+?[0-9 ()-]+$/.test(values.phone) || digits < 7 || digits > 15) problems.push([f.phone, FIELD_ERRORS.phone]);
  if (!values.group) problems.push([f.group, FIELD_ERRORS.group]);
  if (!values.monthlyFee) problems.push([f.fee, FIELD_ERRORS.monthlyFee]);
  if (!values.startDate) problems.push([f.start, FIELD_ERRORS.startDate]);

  return reportProblems([f.name, f.phone, f.group, f.fee, f.start], f.error, problems) ? values : null;
}

async function submitStudent(event) {
  event.preventDefault();
  const { studentForm: f } = ui;
  const values = validateStudent();
  if (!values) return;

  const editingId = state.studentId;
  const session = studentFormSession;
  const isCurrent = () => session === studentFormSession;
  f.error.textContent = '';
  f.submit.disabled = true;
  try {
    const saved = await api(editingId ? `/students/${editingId}` : '/students', {
      method: editingId ? 'PATCH' : 'POST',
      body: JSON.stringify(values),
    });
    showToast(editingId ? `Сохранено: ${saved.name}` : `Ученик добавлен: ${saved.name}`);
    if (!isCurrent()) {
      // Форму уже закрыли или открыли для другого ученика — только обновляем список
      await loadMonth();
      return;
    }
    f.dialog.close();
    await loadMonth();
    // После правки возвращаемся в карточку — там видно, как изменился долг
    if (editingId) openStudent(saved.id);
  } catch (err) {
    if (!isCurrent()) return;
    const field = /body\/(\w+)/.exec(err.message)?.[1];
    f.error.textContent = err.status === 404
      ? 'Этого ученика уже нет в базе. Обновите страницу.'
      : `Не сохранено: ${FIELD_ERRORS[field] ?? err.message}`;
  } finally {
    if (isCurrent()) f.submit.disabled = false;
  }
}

// ——— События ———

ui.prev.addEventListener('click', () => loadMonth(shiftMonth(state.month, -1)));
ui.next.addEventListener('click', () => loadMonth(shiftMonth(state.month, 1)));
ui.retry.addEventListener('click', () => loadMonth());
for (const button of ui.viewButtons) {
  button.addEventListener('click', () => {
    state.view = button.dataset.view;
    renderList();
  });
}
ui.openPayment.addEventListener('click', () => openPayment());
ui.openStudentForm.addEventListener('click', () => openStudentForm());

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
  // Клик по затемнённому фону вокруг шторки закрывает её
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
}
ui.payment.dialog.addEventListener('close', () => { paymentSession += 1; });
ui.card.dialog.addEventListener('close', () => { cardSession += 1; });
ui.studentForm.dialog.addEventListener('close', () => { studentFormSession += 1; });

ui.payment.student.addEventListener('change', () => {
  updatePaymentHints();
  fillAmount(debtFor(Number(ui.payment.student.value))?.debt ?? 0);
});
attachMoneyInput(ui.payment.amount);
attachMoneyInput(ui.studentForm.fee);
ui.payment.date.addEventListener('input', updateDateHint);
ui.payment.form.addEventListener('submit', submitPayment);
ui.studentForm.form.addEventListener('submit', submitStudent);

ui.card.pay.addEventListener('click', () => openPayment(state.studentId));
ui.card.edit.addEventListener('click', () => openStudentForm(state.studentId));
ui.card.deleteButton.addEventListener('click', () => {
  ui.card.deleteButton.hidden = true;
  ui.card.confirm.hidden = false;
  ui.card.cancel.focus();
});
ui.card.cancel.addEventListener('click', resetDeleteConfirm);
ui.card.confirmDelete.addEventListener('click', deleteStudent);

async function loadConfig() {
  try {
    ({ timeZone: state.timeZone } = await api('/config'));
  } catch {
    // Без /config берём пояс браузера: дату в будущем всё равно отсечёт сервер, а список загрузится и покажет ошибку сам
    state.timeZone = undefined;
  }
}

const configReady = loadConfig();
configReady.then(() => loadMonth());
