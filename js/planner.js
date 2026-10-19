// Планировщик: недельный бюджет подходов на мышцу, состав тренировки, закрытие недели.
// Чистые функции, без DOM и базы. Правила — 03-модель-и-экраны.md, раздел 3.

import { clamp, weeksBetween } from './util.js';

export const PHASES = {
  cut:      { name: 'Сброс',       start: 10, max: 14, growEvery: 2, repInc: { easy: 1, ok: 0, hard: 0 } },
  bulk:     { name: 'Набор',       start: 12, max: 20, growEvery: 1, repInc: { easy: 2, ok: 1, hard: 0 } },
  maintain: { name: 'Поддержание', start: 6,  max: 6,  growEvery: 0, repInc: { easy: 1, ok: 0, hard: 0 } },
};

export const SESSION_CAP = 10;            // подходов на мышцу за тренировку
export const MIN_DOSE = 4;                // неделя из одной тренировки
export const MAINTAIN_MIN = PHASES.maintain.start;
export const MAX_SETS_PER_EXERCISE = 5;
export const COMPLETE_RATIO = 0.9;        // неделя «добрана» от 90 % цели

// ---- Мышцы упражнения ----

export function muscleWeights(variant, movementsById) {
  return movementsById.get(variant.movementId)?.muscles || [];
}

export function primaryMuscles(variant, movementsById) {
  return muscleWeights(variant, movementsById).filter(m => m.w === 1).map(m => m.muscleId);
}

// Главная мышца — первая основная. По ней упражнения чередуются.
export function mainMuscle(variant, movementsById) {
  return primaryMuscles(variant, movementsById)[0];
}

// ---- Объём ----

// { muscleId: подходы } по отмеченным подходам: основная мышца 1, вспомогательная 0,5
export function sessionVolume(session, movementsById, variantsById) {
  const out = {};
  for (const ex of session.exercises) {
    const v = variantsById.get(ex.variantId);
    const n = ex.sets.filter(s => s.done).length;
    if (!v || !n) continue;
    for (const { muscleId, w } of muscleWeights(v, movementsById)) {
      out[muscleId] = (out[muscleId] || 0) + n * w;
    }
  }
  return out;
}

export function sumVolume(sessions, movementsById, variantsById) {
  const out = {};
  for (const s of sessions) {
    for (const [id, n] of Object.entries(sessionVolume(s, movementsById, variantsById))) {
      out[id] = (out[id] || 0) + n;
    }
  }
  return out;
}

// Мышцы, у которых в этих тренировках было «на пределе» в упражнении, где она основная
export function hardMuscles(sessions, movementsById, variantsById) {
  const out = new Set();
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (ex.rating !== 'hard') continue;
      const v = variantsById.get(ex.variantId);
      if (v) primaryMuscles(v, movementsById).forEach(id => out.add(id));
    }
  }
  return out;
}

// ---- Неделя ----

export const deloadTarget = target => Math.max(MIN_DOSE, Math.round(target / 2));

export function weekTargets(muscles, deloadIds = []) {
  const t = {};
  for (const m of muscles) {
    if (m.inPlan) t[m.id] = deloadIds.includes(m.id) ? deloadTarget(m.target) : m.target;
  }
  return t;
}

// Сколько подходов на мышцу нужно в следующей тренировке
export function sessionNeed({ targets, plannedSessions, done, sessionsDone }) {
  const planned = Math.max(plannedSessions, sessionsDone + 1);
  const minDose = planned === 1;
  const left = planned - sessionsDone;
  const need = {};
  for (const [id, target] of Object.entries(targets)) {
    const v = minDose ? Math.min(MIN_DOSE, target) : (target - (done[id] || 0)) / left;
    need[id] = clamp(v, 0, SESSION_CAP);
  }
  return { need, minDose };
}

// Упражнения с одной главной мышцей меняются местами по очереди тренировок:
// rotation = 0 → гоблет, болгарские; rotation = 1 → болгарские, гоблет.
export function rotateGroups(variants, rotation, movementsById) {
  const groups = new Map();
  variants.forEach((v, i) => {
    const k = mainMuscle(v, movementsById) ?? v.id;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  });
  const out = variants.slice();
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const r = rotation % idx.length;
    idx.forEach((pos, j) => { out[pos] = variants[idx[(j + r) % idx.length]]; });
  }
  return out;
}

// Раздача подходов по кругу. variants — доступные варианты локации по порядку.
// items — [{ variantId, sets }] в порядке выполнения; short — мышцы, которым не хватило
// упражнений (все их упражнения уже на потолке 5 подходов): { muscleId: сколько не влезло }.
export function composeSession({ variants, need, rotation = 0, movementsById }) {
  const ordered = rotateGroups(variants, rotation, movementsById);
  const rem = { ...need };
  const sets = new Map();
  const weights = v => muscleWeights(v, movementsById).filter(m => m.muscleId in rem);
  const prim = v => weights(v).filter(m => m.w === 1).map(m => m.muscleId);
  const maxNeed = v => Math.max(-Infinity, ...prim(v).map(id => rem[id]));
  const add = (v, n) => {
    sets.set(v.id, (sets.get(v.id) || 0) + n);
    for (const m of weights(v)) rem[m.muscleId] -= m.w * n;
  };

  // 1. Упражнение входит сразу с двумя подходами, если его мышце нужно ≥ 1,5
  for (const v of ordered) if (maxNeed(v) >= 1.5) add(v, 2);

  // 2. По кругу +1, пока нужно ≥ 0,5
  for (let grew = true; grew;) {
    grew = false;
    for (const v of ordered) {
      if (sets.has(v.id) && sets.get(v.id) < MAX_SETS_PER_EXERCISE && maxNeed(v) >= 0.5) {
        add(v, 1);
        grew = true;
      }
    }
  }

  // 3. Мышце нужен ещё подход, а прямого упражнения нет — первое её упражнение с остатком
  for (const id of Object.keys(rem)) {
    if (rem[id] < 1) continue;
    if (ordered.some(v => sets.has(v.id) && prim(v).includes(id))) continue;
    const v = ordered.find(v => prim(v).includes(id));
    if (v) add(v, Math.min(MAX_SETS_PER_EXERCISE, Math.round(rem[id])));
  }

  const short = {};
  for (const [id, r] of Object.entries(rem)) if (r >= 1) short[id] = r;
  return {
    items: ordered.filter(v => sets.has(v.id)).map(v => ({ variantId: v.id, sets: sets.get(v.id) })),
    short,
  };
}

// ---- Рост объёма ----

// После тренировки: «на пределе» подряд по каждой мышце
export function updateHardStreaks(muscles, session, movementsById, variantsById) {
  const hard = new Set(), rated = new Set();
  for (const ex of session.exercises) {
    const v = variantsById.get(ex.variantId);
    if (!ex.rating || !v) continue;
    for (const id of primaryMuscles(v, movementsById)) {
      rated.add(id);
      if (ex.rating === 'hard') hard.add(id);
    }
  }
  return muscles.map(m =>
    hard.has(m.id) ? { ...m, hardStreak: (m.hardStreak || 0) + 1 }
    : rated.has(m.id) ? { ...m, hardStreak: 0 }
    : m);
}

// Закрытие недели: новые цели мышц
export function closeWeek({ week, muscles, phaseKey, done, sessionsCount, hard }) {
  const phase = PHASES[phaseKey];
  return muscles.map(m0 => {
    const m = { ...m0 };
    if (!m.inPlan || !(m.id in week.targets)) return m;

    if ((week.deload || []).includes(m.id)) {          // разгрузка прошла → новый цикл
      m.target = Math.min(m.target, phase.start);
      m.hardStreak = 0;
      return m;
    }
    if ((m.hardStreak || 0) >= 2) {                     // «на пределе» 2 раза подряд
      m.deloadPending = true;
      m.hardStreak = 0;
      return m;
    }
    const complete = (done[m.id] || 0) >= week.targets[m.id] * COMPLETE_RATIO;
    const canGrow = phase.growEvery > 0 &&
      (!m.lastIncreaseWeek || weeksBetween(m.lastIncreaseWeek, week.id) >= phase.growEvery);
    if (complete && !hard.has(m.id) && sessionsCount > 1 && canGrow && m.target < phase.max) {
      m.target += 1;
      m.lastIncreaseWeek = week.id;
    }
    return m;
  });
}

// Смена фазы: цель зажимается в [старт; потолок] новой фазы
export function applyPhase(muscles, phaseKey) {
  const p = PHASES[phaseKey];
  return muscles.map(m => ({ ...m, target: clamp(m.target, p.start, p.max) }));
}

// ---- Формат тренировки: обычная, суперсеты, круговая ----
// Подходы и объём не меняются — только порядок выполнения. Упражнения одной группы (ex.group)
// идут кругами: по подходу каждого, отдых после круга.

export const FORMATS = { straight: 'Обычная', superset: 'Суперсеты', circuit: 'Круговая' };

export const REGION_OF = {
  quads: 'legs', hams: 'legs', glutes: 'legs', calves: 'legs',
  chest: 'push', delts: 'push', triceps: 'push',
  back: 'pull', biceps: 'pull',
  abs: 'core',
};

export const regionOfVariant = (v, movementsById) => REGION_OF[mainMuscle(v, movementsById)] || 'core';

// Расставить группы и порядок. region(ex) → 'push' | 'pull' | 'legs' | 'core'.
// Суперсеты: жим + тяга, ноги + пресс, остатки — соседи из разных зон.
export function applyFormat(exercises, mode, region) {
  const list = exercises.map(ex => ({ ...ex, group: null }));
  if (mode === 'circuit') return list.length > 1 ? list.map(ex => ({ ...ex, group: 0 })) : list;
  if (mode !== 'superset') return list;

  const by = { push: [], pull: [], legs: [], core: [] };
  list.forEach((ex, i) => by[region(ex)].push(i));
  const groups = [];
  const zip = (a, b) => { while (a.length && b.length) groups.push([a.shift(), b.shift()]); };
  zip(by.push, by.pull);
  zip(by.legs, by.core);
  const rest = [...by.push, ...by.pull, ...by.legs, ...by.core].sort((a, b) => a - b);
  while (rest.length) {
    const a = rest.shift();
    const k = rest.findIndex(b => region(list[b]) !== region(list[a]));
    groups.push(k < 0 ? [a] : [a, rest.splice(k, 1)[0]]);
  }
  return groups
    .map(g => g.sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0])
    .flatMap((g, gi) => g.map(i => ({ ...list[i], group: g.length > 1 ? gi : null })));
}

// Порядок подходов: [{ ex, set }]. Одиночное упражнение — все подходы подряд,
// группа — кругами: круг r = подход r каждого участника, у кого он есть.
export function setOrder(exercises) {
  const out = [];
  const seen = new Set();
  exercises.forEach((ex, i) => {
    if (ex.group == null) {
      ex.sets.forEach((_, j) => out.push({ ex: i, set: j }));
      return;
    }
    if (seen.has(ex.group)) return;
    seen.add(ex.group);
    const members = exercises.map((e, k) => [e, k]).filter(([e]) => e.group === ex.group);
    const rounds = Math.max(...members.map(([e]) => e.sets.length));
    for (let r = 0; r < rounds; r++) {
      for (const [e, k] of members) if (r < e.sets.length) out.push({ ex: k, set: r });
    }
  });
  return out;
}

// Подряд идущие упражнения одной группы: [{ group, idx: [индексы] }]
export function groupRuns(exercises) {
  const runs = [];
  exercises.forEach((ex, i) => {
    const last = runs[runs.length - 1];
    if (last && ex.group != null && last.group === ex.group) last.idx.push(i);
    else runs.push({ group: ex.group ?? null, idx: [i] });
  });
  return runs;
}

// Группа из одного упражнения — уже не группа
export function normalizeGroups(exercises) {
  const count = {};
  for (const ex of exercises) if (ex.group != null) count[ex.group] = (count[ex.group] || 0) + 1;
  for (const ex of exercises) if (ex.group != null && count[ex.group] < 2) ex.group = null;
  return exercises;
}
