// Экран тренировки: текущий подход раскрыт крупно, ✓ одним тапом, оценка, таймер отдыха.

import { S } from '../store.js';
import * as store from '../store.js';
import { h, btn, stepper, sheet, confirmSheet, numberSheet, toast, chip } from '../ui.js';
import { go, refresh } from '../nav.js';
import * as G from '../progression.js';
import * as P from '../planner.js';
import { fmtDuration, fmtNum, fmtDay, plural } from '../util.js';
import { keepAwake, unlockAudio, beep, flash } from '../device.js';
import { HINTS, muscleTag, groupByRegion } from './common.js';

const RATINGS = [['easy', 'Легко'], ['ok', 'Норм'], ['hard', 'На пределе']];
const RATING_NAME = Object.fromEntries(RATINGS);

let focus = null;              // { ex, set } — раскрытый подход
const expanded = new Set();    // завершённые карточки, раскрытые вручную
let ticker = null;

const persist = s => store.save('sessions', s).catch(e => toast(`Не сохранилось: ${e.message}`));
const ctxOf = ex => { const v = store.variant(ex.variantId); return { v, eq: store.equipmentOf(v) }; };
const isComplete = ex => ex.sets.length > 0 && ex.sets.every(x => x.done) && !!ex.rating;
const currentIndex = s => s.exercises.findIndex(ex => !isComplete(ex));

export function leave() {
  clearInterval(ticker);
  ticker = null;
  keepAwake(false);
  focus = null;
  expanded.clear();
}

export function render() {
  const s = store.activeSession();
  if (!s) {
    setTimeout(() => go('#today'));
    return h('div');
  }
  keepAwake(true);
  startTicker();
  fixFocus(s);
  const cur = focus ? focus.ex : currentIndex(s);

  return h('div', { class: 'screen workout' },
    h('header', { class: 'wk-top' },
      btn('‹', () => go('#today'), 'ghost icon'),
      h('div', { class: 'wk-title' },
        h('div', null, 'Тренировка'),
        h('div', { class: 'muted small' },
          h('span', { id: 'elapsed' }, fmtDuration(Date.now() - Date.parse(s.startedAt))),
          s.mode && s.mode !== 'straight' ? ` · ${P.FORMATS[s.mode].toLowerCase()}` : '')),
      btn('Завершить', () => finish(s), 'primary small')),
    s.minDose && h('p', { class: 'note' }, 'Минимальная доза: веса прежние, без прибавок.'),
    P.groupRuns(s.exercises).map(run => run.idx.length < 2
      ? exerciseCard(s, s.exercises[run.idx[0]], run.idx[0], run.idx[0] === cur)
      : groupBox(s, run, cur)),
    !s.exercises.length && h('p', { class: 'muted center' }, 'Пусто. Добавь упражнения кнопкой ниже.'),
    h('div', { class: 'wk-bottom' },
      btn('+ Упражнение', () => addExercise(s), 'secondary block'),
      btn('Отменить тренировку', () => discard(s), 'ghost danger-text block')),
    restBar(s));
}

// Фокус, если ручной потерян: у обычного упражнения — его следующий подход, а после последнего
// ждём оценку; в суперсете и круговой — следующий неотмеченный подход по кругу
function fixFocus(s) {
  if (focus && s.exercises[focus.ex]?.sets[focus.set]) return;
  const cur = currentIndex(s);
  const ex = s.exercises[cur];
  if (ex && ex.group == null) {
    const j = ex.sets.findIndex(x => !x.done);
    focus = j >= 0 ? { ex: cur, set: j } : null;
    return;
  }
  focus = nextUndone(s, null);
}

// Следующий неотмеченный подход по порядку выполнения после from (или с начала)
function nextUndone(s, from) {
  const order = P.setOrder(s.exercises);
  const pos = from ? order.findIndex(o => o.ex === from.ex && o.set === from.set) : -1;
  const o = [...order.slice(pos + 1), ...order.slice(0, pos + 1)].find(o => !s.exercises[o.ex].sets[o.set].done);
  return o ? { ex: o.ex, set: o.set } : null;
}

const groupMembers = (s, ex) => (ex.group == null ? [ex] : s.exercises.filter(e => e.group === ex.group));

// Отдых после круга: в круговой — свой, иначе самый длинный из упражнений связки
function restFor(s, ex) {
  if (ex.group != null && s.mode === 'circuit') return S.settings.circuitRest ?? 120;
  return Math.max(...groupMembers(s, ex).map(e => store.variant(e.variantId)?.restSec ?? S.settings.restSec));
}

const scrollToEx = i => document.getElementById(`ex${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// Рамка суперсета или круга: «круг 2 из 3»
function groupBox(s, run, cur) {
  const members = run.idx.map(i => s.exercises[i]);
  const rounds = Math.max(...members.map(e => e.sets.length));
  const next = P.setOrder(s.exercises).find(o => run.idx.includes(o.ex) && !s.exercises[o.ex].sets[o.set].done);
  const label = s.mode === 'circuit' ? 'Круговая' : 'Суперсет';
  return h('div', { class: 'gbox' },
    h('div', { class: 'gbox-head row between' },
      h('span', null, label),
      h('span', null, next ? `круг ${next.set + 1} из ${rounds}` : `${rounds} из ${rounds} ✓`)),
    run.idx.map(i => exerciseCard(s, s.exercises[i], i, i === cur)));
}

// ---- Карточка упражнения ----

function exerciseCard(s, ex, i, isCur) {
  const { v, eq } = ctxOf(ex);
  const allDone = ex.sets.length > 0 && ex.sets.every(x => x.done);
  const complete = isComplete(ex);
  const collapsed = complete && !expanded.has(i);
  const doneN = ex.sets.filter(x => x.done).length;
  const [hint, hintCls] = HINTS[ex.hint] || [];

  const head = h('div', {
    class: 'ex-head',
    onClick: complete ? () => { expanded.has(i) ? expanded.delete(i) : expanded.add(i); refresh(); } : null,
  },
    h('div', { class: 'grow' },
      h('div', { class: 'ex-name' }, v.name),
      h('div', { class: 'ex-sub' }, muscleTag(v),
        ` · ${doneN}/${ex.sets.length} · ${v.repMin}–${v.repMax}${v.perSide ? ' на сторону' : ''} `,
        hint && !collapsed && chip(hint, hintCls))),
    btn('⋯', () => exerciseMenu(s, i), 'ghost icon'));

  if (collapsed) {
    return h('section', { class: 'card ex complete', id: `ex${i}` }, head,
      h('div', { class: 'ex-summary' }, `✓ ${G.fmtResult(ex.sets, v, eq)} · ${RATING_NAME[ex.rating]}`));
  }

  return h('section', { class: `card ex${isCur ? ' current' : ''}`, id: `ex${i}` },
    head,
    ex.hint === 'ceiling' && h('p', { class: 'note' },
      v.loadType === 'bw'
        ? 'Потолок повторов: добавь отягощение, замедли опускание до 3 с или возьми вариант тяжелее.'
        : 'Потолок: тяжелее ступени нет. Замедли опускание до 3 с, добавь паузу или возьми вариант тяжелее.'),
    ex.sets.map((set, j) => focus?.ex === i && focus?.set === j
      ? setEditor(s, ex, i, j, v, eq)
      : setRow(ex, i, j, v, eq)),
    allDone && h('div', { class: `rating${ex.rating ? ' rated' : ''}` },
      !ex.rating && h('div', { class: 'label' }, 'Как зашло?'),
      h('div', { class: 'row gap' }, RATINGS.map(([k, label]) =>
        btn(label, () => rate(s, i, k), `rate ${k}${ex.rating === k ? ' on' : ''}`)))));
}

function setRow(ex, i, j, v, eq) {
  const set = ex.sets[j];
  return h('button', {
    type: 'button',
    class: `set-row${set.done ? ' done' : ''}`,
    onClick: () => { focus = { ex: i, set: j }; refresh(); },
  },
    h('span', { class: 'n' }, j + 1),
    h('span', { class: 'what' }, `${G.fmtLoad(set.load, v, eq)} × ${set.reps}`),
    h('span', { class: 'mark' }, set.done ? '✓' : ''));
}

function setEditor(s, ex, i, j, v, eq) {
  const set = ex.sets[j];
  const typed = v.loadType === 'kg' || v.loadType === 'bw';
  return h('div', { class: `set-editor${set.done ? ' done' : ''}` },
    h('div', { class: 'label' }, `Подход ${j + 1} из ${ex.sets.length}${set.done ? ' · отмечен' : ''}`),
    stepper({
      big: true, value: G.fmtLoad(set.load, v, eq), label: G.loadLabel(v, eq),
      onMinus: () => setLoad(s, i, j, G.stepLoad(set.load, -1, v, eq)),
      onPlus: () => setLoad(s, i, j, G.stepLoad(set.load, +1, v, eq)),
      onValue: typed ? async () => {
        const x = await numberSheet(v.loadType === 'kg' ? 'Вес, кг' : 'Отягощение, кг (минус — помощь)', set.load);
        if (x != null && (x >= 0 || v.loadType === 'bw')) setLoad(s, i, j, x);
      } : null,
    }),
    stepper({
      big: true, value: set.reps, label: v.perSide ? 'повторов на сторону' : 'повторов',
      onMinus: () => setReps(s, i, j, set.reps - 1),
      onPlus: () => setReps(s, i, j, set.reps + 1),
      onValue: async () => {
        const x = await numberSheet('Повторы', set.reps, { decimal: false });
        if (x != null) setReps(s, i, j, Math.round(x));
      },
    }),
    set.done
      ? h('div', { class: 'row gap' },
          btn('Снять ✓', () => undo(s, i, j), 'secondary grow'),
          btn('Готово', () => { focus = null; refresh(); }, 'primary grow'))
      : btn('✓', () => check(s, i, j), 'check block'));
}

// ---- Действия с подходами ----

// Новая нагрузка тянет за собой следующие неотмеченные подходы с той же нагрузкой
function setLoad(s, i, j, load) {
  const sets = s.exercises[i].sets;
  const old = sets[j].load;
  if (load === old) return;
  sets[j].load = load;
  for (let k = j + 1; k < sets.length; k++) if (!sets[k].done && sets[k].load === old) sets[k].load = load;
  persist(s);
  refresh();
}

function setReps(s, i, j, reps) {
  s.exercises[i].sets[j].reps = Math.max(0, reps);
  persist(s);
  refresh();
}

function check(s, i, j) {
  unlockAudio();
  const ex = s.exercises[i];
  ex.sets[j].done = true;
  ex.sets[j].at = new Date().toISOString();
  if (ex.group == null) {
    s.restEndsAt = Date.now() + restFor(s, ex) * 1000;
    const next = ex.sets.findIndex(x => !x.done);
    focus = next >= 0 ? { ex: i, set: next } : null;
    persist(s);
    refresh();
    return;
  }
  // В этом круге ещё есть упражнения — переходим без отдыха, иначе отдых после круга
  const order = P.setOrder(s.exercises);
  const pos = order.findIndex(o => o.ex === i && o.set === j);
  const roundLeft = order.slice(pos + 1).some(o =>
    s.exercises[o.ex].group === ex.group && o.set === j && !s.exercises[o.ex].sets[o.set].done);
  s.restEndsAt = roundLeft ? null : Date.now() + restFor(s, ex) * 1000;
  focus = nextUndone(s, { ex: i, set: j });
  persist(s);
  refresh();
  if (focus && focus.ex !== i) scrollToEx(focus.ex);
}

function undo(s, i, j) {
  const set = s.exercises[i].sets[j];
  set.done = false;
  set.at = null;
  persist(s);
  refresh();
}

function rate(s, i, rating) {
  s.exercises[i].rating = rating;
  expanded.delete(i);
  // В связке фокус уже ушёл на следующее упражнение — его не трогаем
  if (!(focus && !s.exercises[focus.ex].sets[focus.set].done)) focus = null;
  persist(s);
  refresh();
  const target = focus ? focus.ex : currentIndex(s);
  if (target >= 0 && target !== i) scrollToEx(target);
}

// ---- Таймер отдыха ----

function restBar(s) {
  const left = s.restEndsAt ? s.restEndsAt - Date.now() : 0;
  if (left <= 0) return null;
  const shift = sec => { s.restEndsAt += sec * 1000; persist(s); refresh(); };
  return h('div', { class: 'rest', id: 'rest' },
    h('div', { class: 'grow' },
      h('div', { class: 'label' }, s.mode === 'circuit' ? 'Отдых после круга' : 'Отдых'),
      h('div', { class: 'rest-t', id: 'rest-t' }, fmtDuration(left))),
    btn('−15', () => shift(-15), 'secondary'),
    btn('+15', () => shift(15), 'secondary'),
    btn('✕', () => { s.restEndsAt = null; persist(s); refresh(); }, 'secondary'));
}

function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    const s = store.activeSession();
    if (!s) return;
    const el = document.getElementById('elapsed');
    if (el) el.textContent = fmtDuration(Date.now() - Date.parse(s.startedAt));
    if (!s.restEndsAt) return;
    const left = s.restEndsAt - Date.now();
    if (left > 0) {
      const t = document.getElementById('rest-t');
      if (t) t.textContent = fmtDuration(left);
      return;
    }
    s.restEndsAt = null;
    persist(s);
    document.getElementById('rest')?.remove();
    if (left > -5000) { beep(); flash(); }   // давно истёк, пока телефон спал, — не пищим
  }, 250);
}

// ---- Меню упражнения ----

function exerciseMenu(s, i) {
  const ex = s.exercises[i];
  const { v, eq } = ctxOf(ex);
  const hasDone = ex.sets.some(x => x.done);
  const undone = ex.sets.filter(x => !x.done).length;
  const past = G.history(v.id, S.sessions, 3);
  const nextEx = s.exercises[i + 1];
  const canLink = s.mode !== 'circuit' && nextEx && (ex.group == null || nextEx.group !== ex.group);
  const inPair = s.mode !== 'circuit' && ex.group != null;

  sheet(close => {
    const act = fn => () => { fn(); close(); persist(s); refresh(); };
    return [
      h('h2', null, v.name),
      past.length
        ? h('div', { class: 'history' }, past.map(p => h('div', { class: 'row between small' },
            h('span', { class: 'muted' }, fmtDay(p.session.startedAt)),
            h('span', null, G.fmtResult(p.exercise.sets, v, eq), p.exercise.rating ? ` · ${RATING_NAME[p.exercise.rating]}` : ''))))
        : h('p', { class: 'muted' }, 'Раньше не делал.'),
      h('div', { class: 'menu' },
        btn('+ Подход', act(() => {
          const last = ex.sets[ex.sets.length - 1] || { load: G.startLoad(v, eq), reps: v.repMin };
          ex.sets.push({ load: last.load, reps: last.reps, planLoad: last.load, planReps: last.reps, done: false, at: null });
          focus = { ex: i, set: ex.sets.length - 1 };
        }), 'secondary block'),
        undone > 0 && btn('− Подход', act(() => {
          const k = ex.sets.map(x => x.done).lastIndexOf(false);
          ex.sets.splice(k, 1);
          focus = null;
        }), 'secondary block'),
        canLink && btn(`Суперсет со следующим: ${store.variant(nextEx.variantId)?.name}`, act(() => {
          const g = ex.group ?? nextEx.group ?? 1 + Math.max(-1, ...s.exercises.map(e => e.group ?? -1));
          const old = nextEx.group;
          for (const e of s.exercises) if (old != null && e.group === old) e.group = g;
          ex.group = g;
          nextEx.group = g;
          focus = null;
        }), 'secondary block'),
        inPair && btn('Убрать из суперсета', act(() => {
          ex.group = null;
          P.normalizeGroups(s.exercises);
          focus = null;
        }), 'secondary block'),
        !hasDone && btn('Заменить упражнение', () => { close(); replaceExercise(s, i); }, 'secondary block'),
        hasDone && undone > 0 && btn('Закончить упражнение', act(() => {
          ex.sets = ex.sets.filter(x => x.done);
          focus = null;
        }), 'secondary block'),
        !hasDone && btn('Убрать из тренировки', act(() => {
          s.exercises.splice(i, 1);
          P.normalizeGroups(s.exercises);
          focus = null;
          expanded.clear();
        }), 'secondary block danger-text')),
    ];
  });
}

function noProgressOpts(s) {
  return { minDose: s.minDose, deload: S.weeks.find(w => w.id === s.weekId)?.deload || [] };
}

// Варианты локации, которых ещё нет в тренировке
function candidates(s) {
  const used = new Set(s.exercises.map(e => e.variantId));
  return store.locationVariants(s.locationId).filter(v => store.equipmentOk(v) && !used.has(v.id));
}

function variantButton(v, onPick) {
  return btn([h('span', { class: 'grow' }, v.name), muscleTag(v)], () => onPick(v), 'secondary block left');
}

function variantList(list, onPick) {
  return groupByRegion(list).map(([, name, vs]) => h('div', { class: 'group' },
    h('div', { class: 'label' }, name),
    vs.map(v => variantButton(v, onPick))));
}

function replaceExercise(s, i) {
  const ex = s.exercises[i];
  const { v } = ctxOf(ex);
  const same = candidates(s).filter(x => x.movementId === v.movementId);
  const others = candidates(s).filter(x => x.movementId !== v.movementId);
  sheet(close => {
    const pick = nv => {
      s.exercises[i] = { ...store.buildExercise(nv, ex.sets.length, noProgressOpts(s)), group: ex.group ?? null };
      focus = { ex: i, set: 0 };
      close();
      persist(s);
      refresh();
    };
    return [
      h('h2', null, `Заменить «${v.name}»`),
      same.length
        ? h('div', { class: 'group' }, h('div', { class: 'label' }, store.movement(v.movementId)?.name), same.map(x => variantButton(x, pick)))
        : h('p', { class: 'muted' }, 'Других вариантов этого движения здесь нет.'),
      others.length > 0 && h('details', null, h('summary', null, 'Другие движения'), variantList(others, pick)),
    ];
  });
}

function addExercise(s) {
  const list = candidates(s);
  sheet(close => [
    h('h2', null, 'Добавить упражнение'),
    list.length
      ? variantList(list, v => {
          const circle = s.mode === 'circuit' && s.exercises.some(e => e.group === 0) ? 0 : null;
          s.exercises.push({ ...store.buildExercise(v, 3, noProgressOpts(s)), group: circle });
          focus = { ex: s.exercises.length - 1, set: 0 };
          close();
          persist(s);
          refresh();
          document.getElementById(`ex${s.exercises.length - 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
      : h('p', { class: 'muted' }, 'Все доступные упражнения уже в тренировке.'),
  ]);
}

// ---- Завершение ----

async function discard(s) {
  const ok = await confirmSheet('Отменить тренировку?', 'Удалить', {
    danger: true, sub: 'Отмеченные подходы тоже пропадут.',
  });
  if (!ok) return;
  await store.remove('sessions', s.id);
  leave();
  go('#today');
}

async function finish(s) {
  const all = s.exercises.flatMap(e => e.sets);
  const doneN = all.filter(x => x.done).length;
  const undone = all.length - doneN;
  if (!doneN) {
    if (await confirmSheet('Ни одного подхода не отмечено', 'Удалить тренировку', { danger: true })) {
      await store.remove('sessions', s.id);
      leave();
      go('#today');
    }
    return;
  }
  if (undone && !(await confirmSheet('Завершить тренировку?', 'Завершить', {
    sub: `${undone} ${plural(undone, 'подход не отмечен', 'подхода не отмечены', 'подходов не отмечено')} — они не сохранятся.`,
  }))) return;

  const plan = s.plan;
  const saved = await store.finishSession(s);
  leave();
  // Итог показываем поверх «Сегодня», когда тот уже отрисован
  window.addEventListener('hashchange', () => showSummary(saved, plan), { once: true });
  go('#today');
}

function showSummary(s, plan) {
  const { movementsById, variantsById } = store.ctx();
  const vol = P.sessionVolume(s, movementsById, variantsById);
  const week = S.weeks.find(w => w.id === s.weekId);
  const wvol = store.weekVolume(s.weekId);
  const sets = s.exercises.reduce((a, e) => a + e.sets.length, 0);
  const rows = store.musclesSorted().filter(m => (plan[m.id] || 0) > 0.05 || (vol[m.id] || 0) > 0);

  sheet(close => [
    h('h2', null, 'Тренировка сохранена'),
    h('p', { class: 'muted' },
      `${fmtDuration(Date.parse(s.finishedAt) - Date.parse(s.startedAt))} · ${sets} ${plural(sets, 'подход', 'подхода', 'подходов')}`),
    h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', null, 'Мышца'), h('th', null, 'Сегодня / план'), h('th', null, 'Неделя / цель'))),
      h('tbody', null, rows.map(m => {
        const w = wvol[m.id] || 0;
        const target = week?.targets[m.id];
        return h('tr', null,
          h('td', null, m.name),
          h('td', null, `${fmtNum(vol[m.id] || 0)} / ${fmtNum(plan[m.id] || 0)}`),
          h('td', null, target != null ? `${fmtNum(w)} / ${target}` : fmtNum(w),
            w >= P.MAINTAIN_MIN ? h('span', { class: 'good-text' }, ' ✓') : ''));
      }))),
    h('p', { class: 'muted small' }, `✓ — добран минимум поддержания: ${P.MAINTAIN_MIN} подходов за неделю.`),
    btn('Готово', close, 'primary block'),
  ]);
}
