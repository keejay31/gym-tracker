// Прогрессия варианта: шаги нагрузки, предзаполнение подходов, сигналы падения.
// Чистые функции, без DOM и базы.

import { PHASES } from './planner.js';
import { clamp, round2, fmtNum, addDays, weeksBetween } from './util.js';

// ---- Нагрузка ----

const levelCount = eq => Math.max(1, eq?.levels?.length || 0);

// Ступени веса: свои у варианта (гоблет: 0, 10, 16, 24) или список снаряда; пусто — шагом
export function kgSteps(variant, eq) {
  const own = variant.loads?.length ? variant.loads : eq?.kg?.values || [];
  return own.slice().sort((a, b) => a - b);
}

// Шаг нагрузки степпером: dir = +1 / −1
export function stepLoad(load, dir, variant, eq) {
  switch (variant.loadType) {
    case 'kg': {
      const vals = kgSteps(variant, eq);
      if (vals.length) {
        return dir > 0 ? (vals.find(x => x > load) ?? load) : (vals.reverse().find(x => x < load) ?? load);
      }
      return Math.max(0, round2(load + dir * (eq?.kg?.step || 2.5)));
    }
    case 'band':
    case 'trx':
      return clamp(load + dir, 1, levelCount(eq));
    default: // bw: ±кг к своему весу
      return round2(load + dir * 2.5);
  }
}

// Следующая ступень для автопрогрессии; null — дальше некуда
export function nextLoad(load, variant, eq) {
  if (variant.loadType === 'bw') return null;
  const n = stepLoad(load, +1, variant, eq);
  return n > load ? n : null;
}

export function startLoad(variant, eq) {
  if (variant.startLoad != null) return variant.startLoad;
  if (variant.loadType === 'kg') return kgSteps(variant, eq)[0] ?? 0;
  return variant.loadType === 'bw' ? 0 : 1;
}

export function fmtLoad(load, variant, eq) {
  switch (variant.loadType) {
    case 'kg':
      if (!load) return 'без веса';
      return `${eq?.pair ? 'по ' : ''}${fmtNum(load, 2)} кг`;
    case 'band':
    case 'trx': {
      const name = eq?.levels?.[load - 1];
      return name && !/^Уровень \d+$/.test(name) ? `ур. ${load} · ${name}` : `ур. ${load}`;
    }
    default:
      return load ? (load > 0 ? '+' : '−') + fmtNum(Math.abs(load), 2) + ' кг' : 'свой вес';
  }
}

const LOAD_LABEL = { kg: 'вес', band: 'уровень', trx: 'уровень', bw: 'отягощение' };
export const loadLabel = (variant, eq) => (variant.loadType === 'kg' && eq?.pair ? 'вес в руке' : LOAD_LABEL[variant.loadType]);

// «3 × 15 · 24 кг», «3 × 12–14 · ур. 2»
export function fmtPlan(sets, variant, eq) {
  if (!sets.length) return '';
  const reps = sets.map(s => s.reps);
  const lo = Math.min(...reps), hi = Math.max(...reps);
  const loads = [...new Set(sets.map(s => s.load))];
  const r = lo === hi ? `${lo}` : `${lo}–${hi}`;
  const l = loads.length === 1 ? fmtLoad(loads[0], variant, eq) : 'разный вес';
  return `${sets.length} × ${r} · ${l}`;
}

// «24 кг: 15 · 14 · 12» или «24 кг × 15 · 16 кг × 12»
export function fmtResult(sets, variant, eq) {
  const done = sets.filter(s => s.done);
  if (!done.length) return '—';
  const loads = [...new Set(done.map(s => s.load))];
  if (loads.length === 1) return `${fmtLoad(loads[0], variant, eq)}: ${done.map(s => s.reps).join(' · ')}`;
  return done.map(s => `${fmtLoad(s.load, variant, eq)} × ${s.reps}`).join(' · ');
}

// ---- История ----

// Последнее выполнение варианта: { session, exercise } или null
export function lastExercise(variantId, sessions, excludeSessionId) {
  let best = null;
  for (const s of sessions) {
    if (s.status !== 'done' || s.id === excludeSessionId) continue;
    const ex = s.exercises.find(e => e.variantId === variantId && e.sets.some(x => x.done));
    if (ex && (!best || s.startedAt > best.session.startedAt)) best = { session: s, exercise: ex };
  }
  return best;
}

export function history(variantId, sessions, limit = 10) {
  return sessions
    .filter(s => s.status === 'done')
    .map(s => ({ session: s, exercise: s.exercises.find(e => e.variantId === variantId && e.sets.some(x => x.done)) }))
    .filter(x => x.exercise)
    .sort((a, b) => (a.session.startedAt < b.session.startedAt ? 1 : -1))
    .slice(0, limit);
}

// Рабочая нагрузка прошлого раза — самая частая, при равенстве большая
export function workingLoad(sets) {
  const count = new Map();
  for (const s of sets) count.set(s.load, (count.get(s.load) || 0) + 1);
  let best = null, bestN = 0;
  for (const [load, n] of count) if (n > bestN || (n === bestN && load > best)) { best = load; bestN = n; }
  return best;
}

// Предзаполнение подходов.
// hint: 'first' — первый раз, 'up' — новая ступень нагрузки, 'ceiling' — упёрся, 'hold' — без прибавок
export function prefill({ variant, eq, last, nSets, phaseKey, noProgress = false }) {
  const { repMin, repMax } = variant;
  const make = (load, repsAt) => Array.from({ length: nSets }, (_, i) => ({ load, reps: repsAt(i) }));

  const done = last ? last.sets.filter(s => s.done) : [];
  if (!done.length) return { sets: make(startLoad(variant, eq), () => repMin), hint: 'first' };

  const wl = workingLoad(done);
  const lastReps = i => (done[i] ?? done[done.length - 1]).reps;

  if (noProgress) return { sets: make(wl, lastReps), hint: 'hold' };

  const rating = last.rating || 'ok';
  const allTop = done.every(s => s.reps >= repMax && s.load >= wl);
  if (allTop && rating !== 'hard') {
    const nl = nextLoad(wl, variant, eq);
    if (nl != null) return { sets: make(nl, () => repMin), hint: 'up' };
    return { sets: make(wl, lastReps), hint: 'ceiling' };
  }
  const inc = PHASES[phaseKey].repInc[rating] ?? 0;
  return { sets: make(wl, i => Math.min(repMax, lastReps(i) + inc)), hint: null };
}

// ---- Сигналы ----

// Оценка лучшего подхода: кг — 1ПМ по Эпли, уровни и свой вес — сначала нагрузка, потом повторы
export function perfScore(sets, variant) {
  const done = sets.filter(s => s.done);
  if (!done.length) return null;
  if (variant.loadType === 'kg') return Math.max(...done.map(s => s.load * (1 + s.reps / 30)));
  return Math.max(...done.map(s => s.load * 1000 + s.reps));
}

// Варианты, у которых лучший результат недели падает 2 недели подряд
export function dropSignals(variants, sessions, currentWeekId) {
  const out = [];
  for (const v of variants) {
    const byWeek = new Map();
    for (const s of sessions) {
      if (s.status !== 'done') continue;
      const ex = s.exercises.find(e => e.variantId === v.id);
      const sc = ex && perfScore(ex.sets, v);
      if (sc != null) byWeek.set(s.weekId, Math.max(byWeek.get(s.weekId) ?? -Infinity, sc));
    }
    const pts = [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 3);
    if (pts.length < 3) continue;
    const [[w0, s0], [, s1], [w2, s2]] = pts;
    const fresh = w0 >= addDays(currentWeekId, -7);
    const recent = weeksBetween(w2, w0) <= 4;
    if (fresh && recent && s0 < s1 - 1e-9 && s1 < s2 - 1e-9) out.push(v);
  }
  return out;
}
