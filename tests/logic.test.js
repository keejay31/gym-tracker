// Проверка планировщика и прогрессии: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { weekIdOf, addDays, weeksBetween, parseNumList } from '../js/util.js';
import * as P from '../js/planner.js';
import * as G from '../js/progression.js';
import { seedData } from '../js/seed.js';

const seed = seedData();
const movementsById = new Map(seed.movements.map(m => [m.id, m]));
const variantsById = new Map(seed.variants.map(v => [v.id, v]));
const equipmentById = new Map(seed.equipment.map(e => [e.id, e]));
const V = id => variantsById.get(id);
const E = id => equipmentById.get(id);

const homePlan = () => seed.variants
  .filter(v => v.locationId === 'home' && v.inPlan && E(v.equipmentId).status === 'have')
  .sort((a, b) => a.order - b.order);

const asMap = r => Object.fromEntries(r.items.map(x => [x.variantId, x.sets]));

test('неделя начинается в понедельник', () => {
  assert.equal(weekIdOf(new Date(2026, 9, 14)), '2026-10-12'); // ср
  assert.equal(weekIdOf(new Date(2026, 9, 18)), '2026-10-12'); // вс
  assert.equal(weekIdOf(new Date(2026, 9, 19)), '2026-10-19'); // пн
  assert.equal(addDays('2026-10-26', 7), '2026-11-02');        // переход на зимнее время
  assert.equal(weeksBetween('2026-10-12', '2026-11-02'), 3);
});

test('бюджет: остаток ÷ оставшиеся тренировки, потолок 10, одна тренировка — 4', () => {
  const targets = { chest: 10, back: 30 };
  let r = P.sessionNeed({ targets, plannedSessions: 3, done: {}, sessionsDone: 0 });
  assert.ok(Math.abs(r.need.chest - 10 / 3) < 1e-9);
  assert.equal(r.need.back, 10);
  assert.equal(r.minDose, false);

  r = P.sessionNeed({ targets, plannedSessions: 3, done: { chest: 6 }, sessionsDone: 1 });
  assert.equal(r.need.chest, 2);

  r = P.sessionNeed({ targets, plannedSessions: 2, done: { chest: 12 }, sessionsDone: 1 });
  assert.equal(r.need.chest, 0, 'перебор не уходит в минус');

  r = P.sessionNeed({ targets, plannedSessions: 1, done: {}, sessionsDone: 0 });
  assert.equal(r.minDose, true);
  assert.equal(r.need.chest, 4);

  r = P.sessionNeed({ targets, plannedSessions: 1, done: {}, sessionsDone: 1 });
  assert.equal(r.minDose, false, 'вторая тренировка сверх плана — не минимальная доза');
});

test('состав тренировки: пример из документа (сброс, 10/нед, 3 тренировки, дом)', () => {
  const targets = P.weekTargets(seed.muscles, []);
  const { need } = P.sessionNeed({ targets, plannedSessions: 3, done: {}, sessionsDone: 0 });
  const s1 = asMap(P.composeSession({ variants: homePlan(), need, rotation: 0, movementsById }));
  assert.deepEqual(s1, { h_goblet: 3, h_pushups: 3, h_trxrow: 3, h_slrdl: 3, h_dbohp: 2, h_bandcurl: 2, h_wheel: 3 });

  const s2 = asMap(P.composeSession({ variants: homePlan(), need, rotation: 1, movementsById }));
  assert.ok(s2.h_bss && !s2.h_goblet, 'чередование: болгарские вместо гоблета');
  assert.ok(s2.h_bandpd && !s2.h_trxrow, 'чередование: тяга резинки вместо TRX');
});

test('мышце нужен подход, а прямого упражнения нет — оно добавляется', () => {
  const need = { triceps: 1.4, chest: 0 };
  const r = asMap(P.composeSession({ variants: homePlan(), need, movementsById }));
  assert.deepEqual(r, { h_bandext: 1 });
});

test('не больше 5 подходов на упражнение; что не влезло — в short', () => {
  const need = { chest: 6 };
  const one = homePlan().filter(v => v.movementId === 'hpush');
  const r = P.composeSession({ variants: one, need, movementsById });
  assert.deepEqual(asMap(r), { h_pushups: 5 });
  assert.deepEqual(r.short, { chest: 1 });
});

test('прогрессия: двойная, по кг из списка (гиря 16 → 24)', () => {
  const v = V('h_goblet'), eq = E('h_kb');
  const top = { rating: 'ok', sets: [25, 25, 25].map(reps => ({ load: 16, reps, done: true })) };
  let r = G.prefill({ variant: v, eq, last: top, nSets: 3, phaseKey: 'cut' });
  assert.equal(r.hint, 'up');
  assert.deepEqual(r.sets, [{ load: 24, reps: 12 }, { load: 24, reps: 12 }, { load: 24, reps: 12 }]);

  const top24 = { rating: 'ok', sets: [25, 25].map(reps => ({ load: 24, reps, done: true })) };
  r = G.prefill({ variant: v, eq, last: top24, nSets: 3, phaseKey: 'bulk' });
  assert.equal(r.hint, 'ceiling', 'тяжелее гири нет');
  assert.deepEqual(r.sets.map(s => s.load), [24, 24, 24]);

  const mid = rating => ({ rating, sets: [15, 14, 12].map(reps => ({ load: 16, reps, done: true })) });
  const reps = (phaseKey, rating, n = 3) => G.prefill({ variant: v, eq, last: mid(rating), nSets: n, phaseKey }).sets.map(s => s.reps);
  assert.deepEqual(reps('bulk', 'ok'), [16, 15, 13]);
  assert.deepEqual(reps('bulk', 'easy'), [17, 16, 14]);
  assert.deepEqual(reps('bulk', 'hard'), [15, 14, 12]);
  assert.deepEqual(reps('cut', 'ok'), [15, 14, 12]);
  assert.deepEqual(reps('cut', 'easy'), [16, 15, 13]);
  assert.deepEqual(reps('bulk', 'ok', 4), [16, 15, 13, 13], 'лишний подход копирует последний');
});

test('прогрессия: гоблет без веса → гантель 10 кг', () => {
  const last = { rating: 'ok', sets: [25, 25].map(reps => ({ load: 0, reps, done: true })) };
  const r = G.prefill({ variant: V('h_goblet'), eq: E('h_kb'), last, nSets: 2, phaseKey: 'cut' });
  assert.equal(r.hint, 'up');
  assert.deepEqual(r.sets[0], { load: 10, reps: 12 });
});

test('список чисел: пробелы, «;», десятичная запятая, 0', () => {
  assert.deepEqual(parseNumList('0, 10, 16, 24'), [0, 10, 16, 24]);
  assert.deepEqual(parseNumList('12,5 15; 7.5'), [7.5, 12.5, 15]);
  assert.deepEqual(parseNumList('x -5 10 10'), [10]);
});

test('прогрессия: верх диапазона, но «на пределе» — держим', () => {
  const v = V('h_goblet'), eq = E('h_kb');
  const last = { rating: 'hard', sets: [25, 25].map(reps => ({ load: 16, reps, done: true })) };
  const r = G.prefill({ variant: v, eq, last, nSets: 2, phaseKey: 'bulk' });
  assert.deepEqual(r.sets, [{ load: 16, reps: 25 }, { load: 16, reps: 25 }]);
});

test('прогрессия: резинка — следующий уровень, свой вес — потолок, шаг кг', () => {
  const band = { rating: 'ok', sets: [20, 20].map(reps => ({ load: 2, reps, done: true })) };
  let r = G.prefill({ variant: V('h_bandcurl'), eq: E('h_band'), last: band, nSets: 2, phaseKey: 'cut' });
  assert.deepEqual(r.sets, [{ load: 3, reps: 12 }, { load: 3, reps: 12 }]);

  const band5 = { rating: 'ok', sets: [20, 20].map(reps => ({ load: 5, reps, done: true })) };
  r = G.prefill({ variant: V('h_bandcurl'), eq: E('h_band'), last: band5, nSets: 2, phaseKey: 'cut' });
  assert.equal(r.hint, 'ceiling');

  const bw = { rating: 'easy', sets: [25, 25].map(reps => ({ load: 0, reps, done: true })) };
  r = G.prefill({ variant: V('h_pushups'), eq: E('h_pushup'), last: bw, nSets: 2, phaseKey: 'bulk' });
  assert.equal(r.hint, 'ceiling');

  const smith = { rating: 'ok', sets: [12, 12, 12].map(reps => ({ load: 40, reps, done: true })) };
  r = G.prefill({ variant: V('s_squat'), eq: E('s_smith'), last: smith, nSets: 3, phaseKey: 'cut' });
  assert.deepEqual(r.sets[0], { load: 42.5, reps: 8 });
});

test('прогрессия: первый раз, разгрузка', () => {
  let r = G.prefill({ variant: V('s_row'), eq: E('s_row'), last: null, nSets: 3, phaseKey: 'cut' });
  assert.equal(r.hint, 'first');
  assert.deepEqual(r.sets[0], { load: 40, reps: 8 });

  const top = { rating: 'easy', sets: [12, 12].map(reps => ({ load: 40, reps, done: true })) };
  r = G.prefill({ variant: V('s_row'), eq: E('s_row'), last: top, nSets: 2, phaseKey: 'bulk', noProgress: true });
  assert.equal(r.hint, 'hold');
  assert.deepEqual(r.sets[0], { load: 40, reps: 12 });
});

test('шаги степпера', () => {
  assert.equal(G.stepLoad(16, +1, V('h_goblet'), E('h_kb')), 24);
  assert.equal(G.stepLoad(16, -1, V('h_swing'), E('h_kb')), 16, 'у махов ступени гирь: 16, 24');
  assert.equal(G.stepLoad(24, -1, V('h_goblet'), E('h_kb')), 16);
  assert.equal(G.stepLoad(16, -1, V('h_goblet'), E('h_kb')), 10, 'у гоблета свои ступени: 0, 10, 16, 24');
  assert.equal(G.stepLoad(0, +1, V('h_goblet'), E('h_kb')), 10);
  assert.equal(G.fmtLoad(0, V('h_goblet'), E('h_kb')), 'без веса');
  assert.equal(G.stepLoad(1, -1, V('h_bandcurl'), E('h_band')), 1);
  assert.equal(G.stepLoad(0, -1, V('h_pushups'), E('h_pushup')), -2.5);
  assert.equal(G.fmtLoad(10, V('h_dbohp'), E('h_db')), 'по 10 кг');
  assert.equal(G.loadLabel(V('h_dbohp'), E('h_db')), 'вес в руке');
  assert.equal(G.fmtLoad(0, V('h_pushups'), E('h_pushup')), 'свой вес');
  assert.equal(G.fmtLoad(3, V('h_trxrow'), E('h_trx')), 'ур. 3');
});

test('суперсеты: жим + тяга, ноги + пресс, остатки из разных зон', () => {
  const R = { goblet: 'legs', push: 'push', row: 'pull', rdl: 'legs', ohp: 'push', curl: 'pull', wheel: 'core' };
  const exs = Object.keys(R).map(id => ({ variantId: id, sets: [{}, {}] }));
  const r = P.applyFormat(exs, 'superset', ex => R[ex.variantId]);
  const groups = P.groupRuns(r).map(g => g.idx.map(i => r[i].variantId).join('+'));
  assert.deepEqual(groups, ['goblet+wheel', 'push+row', 'rdl', 'ohp+curl']);
  assert.equal(r.length, exs.length);

  const c = P.applyFormat(exs, 'circuit', ex => R[ex.variantId]);
  assert.ok(c.every(ex => ex.group === 0));
  assert.ok(P.applyFormat(exs, 'straight', () => 'core').every(ex => ex.group === null));
});

test('порядок подходов: одиночные подряд, группа — кругами', () => {
  const ex = (n, group = null) => ({ group, sets: Array.from({ length: n }, () => ({})) });
  const order = P.setOrder([ex(2), ex(3, 0), ex(2, 0), ex(1)]).map(o => `${o.ex}.${o.set}`);
  assert.deepEqual(order, ['0.0', '0.1', '1.0', '2.0', '1.1', '2.1', '1.2', '3.0']);

  const g = P.normalizeGroups([ex(1, 4), ex(1, 5), ex(1, 5)]);
  assert.deepEqual(g.map(e => e.group), [null, 5, 5]);
});

const week = (id, targets, deload = []) => ({ id, targets, deload });
const mus = (o = {}) => ({ id: 'chest', inPlan: true, target: 12, hardStreak: 0, lastIncreaseWeek: null, ...o });

test('закрытие недели: набор +1 каждую неделю, недобор и «на пределе» — без прибавки', () => {
  const w = week('2026-10-12', { chest: 12 });
  const args = { week: w, phaseKey: 'bulk', sessionsCount: 3, hard: new Set() };
  assert.equal(P.closeWeek({ ...args, muscles: [mus()], done: { chest: 11 } })[0].target, 13);
  assert.equal(P.closeWeek({ ...args, muscles: [mus()], done: { chest: 10 } })[0].target, 12);
  assert.equal(P.closeWeek({ ...args, muscles: [mus()], done: { chest: 12 }, hard: new Set(['chest']) })[0].target, 12);
  assert.equal(P.closeWeek({ ...args, muscles: [mus()], done: { chest: 12 }, sessionsCount: 1 })[0].target, 12);
  assert.equal(P.closeWeek({ ...args, muscles: [mus({ target: 20 })], done: { chest: 20 } })[0].target, 20, 'потолок');
});

test('закрытие недели: сброс — не чаще раза в 2 недели', () => {
  const args = { phaseKey: 'cut', sessionsCount: 3, hard: new Set(), done: { chest: 12 } };
  let m = P.closeWeek({ ...args, week: week('2026-10-12', { chest: 10 }), muscles: [mus({ target: 10 })] })[0];
  assert.equal(m.target, 11);
  m = P.closeWeek({ ...args, week: week('2026-10-19', { chest: 11 }), muscles: [m] })[0];
  assert.equal(m.target, 11);
  m = P.closeWeek({ ...args, week: week('2026-10-26', { chest: 11 }), muscles: [m] })[0];
  assert.equal(m.target, 12);
});

test('разгрузка: 2 раза «на пределе» → разгрузочная неделя → старт фазы', () => {
  let ms = [mus({ target: 16 })];
  const s = { exercises: [{ variantId: 'h_pushups', rating: 'hard', sets: [] }] };
  ms = P.updateHardStreaks(ms, s, movementsById, variantsById);
  ms = P.updateHardStreaks(ms, s, movementsById, variantsById);
  assert.equal(ms[0].hardStreak, 2);

  const args = { phaseKey: 'bulk', sessionsCount: 3, hard: new Set(['chest']), done: { chest: 16 } };
  ms = P.closeWeek({ ...args, week: week('2026-10-12', { chest: 16 }), muscles: ms });
  assert.equal(ms[0].deloadPending, true);
  assert.equal(ms[0].target, 16);
  assert.deepEqual(P.weekTargets(ms, ['chest']), { chest: 8 });

  ms = P.closeWeek({ ...args, hard: new Set(), week: week('2026-10-19', { chest: 8 }, ['chest']), muscles: ms });
  assert.equal(ms[0].target, 12);

  const ok = { exercises: [{ variantId: 'h_pushups', rating: 'ok', sets: [] }] };
  assert.equal(P.updateHardStreaks([mus({ hardStreak: 1 })], ok, movementsById, variantsById)[0].hardStreak, 0);
});

test('смена фазы зажимает цели', () => {
  const r = P.applyPhase([mus({ target: 18 }), mus({ id: 'back', target: 6 })], 'cut');
  assert.deepEqual(r.map(m => m.target), [14, 10]);
});

test('сигнал: падение 2 недели подряд', () => {
  const v = V('s_squat');
  const sess = (weekId, load) => ({
    status: 'done', weekId, startedAt: weekId,
    exercises: [{ variantId: v.id, sets: [{ load, reps: 10, done: true }] }],
  });
  const down = [sess('2026-09-28', 60), sess('2026-10-05', 57.5), sess('2026-10-12', 55)];
  assert.equal(G.dropSignals([v], down, '2026-10-12').length, 1);
  const flat = [sess('2026-09-28', 60), sess('2026-10-05', 57.5), sess('2026-10-12', 57.5)];
  assert.equal(G.dropSignals([v], flat, '2026-10-12').length, 0);
  assert.equal(G.dropSignals([v], down, '2026-11-16').length, 0, 'старый сигнал не висит');
});

// Прогон: 6 недель, все подходы как в плане, оценка «норм». Мышца добирает ≥ 90 % цели —
// или планировщик сообщает, что ей не хватает упражнений (одно упражнение = максимум 5 подходов).
test('симуляция: сброс и набор добирают недельную цель', () => {
  for (const phaseKey of ['cut', 'bulk']) {
    const plan = homePlan();
    const shortSeen = new Set();
    let muscles = P.applyPhase(seed.muscles.map(m => ({ ...m })), phaseKey);
    const sessions = [];
    const log = [];
    let wid = '2026-10-12';
    for (let w = 0; w < 6; w++, wid = addDays(wid, 7)) {
      const targets = P.weekTargets(muscles, []);
      const weekSessions = [];
      for (let k = 0; k < 3; k++) {
        const done = P.sumVolume(weekSessions, movementsById, variantsById);
        const { need } = P.sessionNeed({ targets, plannedSessions: 3, done, sessionsDone: k });
        const rotation = sessions.length;
        const r = P.composeSession({ variants: plan, need, rotation, movementsById });
        Object.keys(r.short).forEach(id => shortSeen.add(id));
        const comp = r.items;
        const s = {
          id: `s${sessions.length}`, weekId: wid, status: 'done', startedAt: `${wid}T0${k}`,
          exercises: comp.map(c => ({
            variantId: c.variantId, rating: 'ok',
            sets: Array.from({ length: c.sets }, () => ({ load: 1, reps: 10, done: true })),
          })),
        };
        weekSessions.push(s);
        sessions.push(s);
      }
      const done = P.sumVolume(weekSessions, movementsById, variantsById);
      for (const [id, t] of Object.entries(targets)) {
        if (shortSeen.has(id)) continue;
        assert.ok(done[id] >= t * P.COMPLETE_RATIO, `${phaseKey} неделя ${w + 1}: ${id} ${done[id]} из ${t}`);
      }
      log.push(`${phaseKey} нед ${w + 1}: цель ${targets.chest}, подходов за тренировку ` +
        weekSessions.map(s => s.exercises.reduce((a, e) => a + e.sets.length, 0)).join('/'));
      muscles = P.closeWeek({ week: { id: wid, targets, deload: [] }, muscles, phaseKey, done, sessionsCount: 3, hard: new Set() });
    }
    if (phaseKey === 'cut') assert.deepEqual([...shortSeen], [], 'в сбросе всё влезает');
    log.push(`${phaseKey}: не влезает в одно упражнение — ${[...shortSeen].join(', ') || 'ничего'}`);
    console.log(log.join('\n'));
  }
});
