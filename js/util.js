// Чистые помощники: даты, формат, id. Без DOM — их же импортируют тесты под node.

export const LOCATIONS = { home: 'Дом', ship: 'Судно' };

export function uid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const round2 = x => Math.round(x * 100) / 100;

// ---- Даты. Неделя = пн–вс, id недели = дата понедельника 'YYYY-MM-DD' ----

const pad = n => String(n).padStart(2, '0');

export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function weekIdOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return isoDate(d);
}

export function weeksBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / (7 * 864e5));
}

// Список чисел через пробел или «;»: «0 10 16 24», «12,5 15». Запятая — десятичная.
export function parseNumList(txt) {
  const vals = String(txt).split(/[\s;]+/).filter(Boolean).map(t => parseFloat(t.replace(',', '.')));
  return [...new Set(vals.filter(x => Number.isFinite(x) && x >= 0))].sort((a, b) => a - b);
}

// ---- Формат ----

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function toDate(x) {
  return typeof x === 'string' && x.length === 10 ? parseDate(x) : new Date(x);
}

export function fmtDay(x) {
  const d = toDate(x);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtWeek(id) {
  const a = parseDate(id), b = parseDate(addDays(id, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${fmtDay(a)} – ${fmtDay(b)}`;
}

export function fmtNum(x, digits = 1) {
  const k = 10 ** digits;
  return String(Math.round(x * k) / k).replace('.', ',');
}

export function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
