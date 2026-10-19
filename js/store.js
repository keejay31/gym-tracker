// Состояние приложения: всё держим в памяти (данных мало), каждое изменение сразу пишем в базу.

import * as db from './db.js';
import { seedData, SCHEMA_VERSION, OWN_LOADS } from './seed.js';
import * as P from './planner.js';
import * as G from './progression.js';
import { weekIdOf, isoDate, uid } from './util.js';

export const S = {
  settings: null,
  muscles: [], movements: [], equipment: [], variants: [],
  weeks: [], sessions: [], measurements: [],
};

export async function load() {
  if (!(await db.getAll('settings')).length) await db.replaceAll(seedData());
  for (const s of db.STORES) S[s] = await db.getAll(s);
  S.settings = S.settings[0];
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  await migrate();
  await ensureWeek();
}

// Обновление данных, записанных прошлой версией (и старых бэкапов при импорте)
const RENAMED_V2 = {
  h_bandcurl: ['Сгибания с резинкой', 'Сгибания рук с резинкой'],
  h_bandext: ['Разгибания с резинкой над головой', 'Разгибания рук с резинкой над головой'],
  h_dbcurl: ['Сгибания с гантелями', 'Сгибания рук с гантелями'],
  s_curl: ['Сгибания на нижнем блоке', 'Сгибания рук на нижнем блоке'],
  s_pushdown: ['Разгибания на верхнем блоке', 'Разгибания рук на верхнем блоке'],
};

async function migrate() {
  const from = S.settings.schemaVersion || 1;
  if (from >= SCHEMA_VERSION) return;
  if (from < 2) {
    for (const v of S.variants) {
      const patch = {};
      if (RENAMED_V2[v.id]?.[0] === v.name) patch.name = RENAMED_V2[v.id][1];
      if (OWN_LOADS[v.id] && !v.loads) patch.loads = OWN_LOADS[v.id];
      if (Object.keys(patch).length) await save('variants', { ...v, ...patch });
    }
  }
  const settings = { ...S.settings, schemaVersion: SCHEMA_VERSION };
  if (from < 3) {
    settings.format ||= { home: 'straight', ship: 'straight' };
    settings.circuitRest ??= 120;
  }
  await save('settings', settings);
}

export async function save(store, obj) {
  if (store === 'settings') S.settings = obj;
  else {
    const arr = S[store];
    const i = arr.findIndex(x => x.id === obj.id);
    if (i >= 0) arr[i] = obj; else arr.push(obj);
  }
  await db.put(store, obj);
}

export async function remove(store, id) {
  S[store] = S[store].filter(x => x.id !== id);
  await db.del(store, id);
}

// ---- Справочники ----

export const muscle = id => S.muscles.find(x => x.id === id);
export const movement = id => S.movements.find(x => x.id === id);
export const variant = id => S.variants.find(x => x.id === id);
export const equipment = id => S.equipment.find(x => x.id === id);
export const equipmentOf = v => equipment(v.equipmentId);
export const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
export const musclesSorted = () => S.muscles.slice().sort(byOrder);

export function ctx() {
  return {
    movementsById: new Map(S.movements.map(x => [x.id, x])),
    variantsById: new Map(S.variants.map(x => [x.id, x])),
  };
}

// Снаряд и доп. условия в статусе «есть»
export function equipmentOk(v) {
  return [v.equipmentId, ...(v.needs || [])].every(id => equipment(id)?.status === 'have');
}

export function locationVariants(loc) {
  return S.variants.filter(v => v.locationId === loc && !v.archived).sort(byOrder);
}

export const planVariants = loc => locationVariants(loc).filter(v => v.inPlan && equipmentOk(v));

// ---- Недели ----

export const currentWeek = () => S.weeks.find(w => w.id === weekIdOf());

export async function ensureWeek() {
  const wid = weekIdOf();
  const old = S.weeks.filter(w => !w.closed && w.id < wid).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const w of old) {
    if (S.sessions.some(s => s.weekId === w.id && s.status === 'active')) continue;
    await closeWeek(w);
  }
  let week = S.weeks.find(w => w.id === wid);
  if (!week) {
    const deload = S.muscles.filter(m => m.inPlan && m.deloadPending).map(m => m.id);
    for (const m of S.muscles.filter(m => m.deloadPending)) await save('muscles', { ...m, deloadPending: false });
    week = {
      id: wid,
      plannedSessions: S.settings.sessionsPerWeek[S.settings.location],
      targets: P.weekTargets(S.muscles, deload),
      deload,
      closed: false,
      done: null,
    };
    await save('weeks', week);
  }
  return week;
}

async function closeWeek(w) {
  const { movementsById, variantsById } = ctx();
  const ss = S.sessions.filter(s => s.weekId === w.id && s.status === 'done');
  const done = P.sumVolume(ss, movementsById, variantsById);
  const muscles = P.closeWeek({
    week: w, muscles: S.muscles, phaseKey: S.settings.phase, done,
    sessionsCount: ss.length, hard: P.hardMuscles(ss, movementsById, variantsById),
  });
  for (const m of muscles) await save('muscles', m);
  await save('weeks', { ...w, closed: true, done });
}

export function weekSessions(weekId, status = 'done') {
  return S.sessions.filter(s => s.weekId === weekId && (!status || s.status === status));
}

// Сделано за неделю: по завершённым тренировкам (и активной, если withActive)
export function weekVolume(weekId, withActive = false) {
  const { movementsById, variantsById } = ctx();
  const ss = S.sessions.filter(s => s.weekId === weekId && (s.status === 'done' || (withActive && s.status === 'active')));
  return P.sumVolume(ss, movementsById, variantsById);
}

// Мышцы недели, добравшие минимум поддержания
export function maintenanceCount(week) {
  const vol = weekVolume(week.id, true);
  const ids = Object.keys(week.targets);
  return { done: ids.filter(id => (vol[id] || 0) >= P.MAINTAIN_MIN).length, total: ids.length };
}

export async function setRemaining(n) {
  const week = currentWeek();
  week.plannedSessions = weekSessions(week.id).length + Math.max(0, n);
  await save('weeks', week);
}

// ---- Тренировка ----

export const activeSession = () => S.sessions.find(s => s.status === 'active');

export function buildExercise(v, nSets, { minDose = false, deload = [] } = {}) {
  const { movementsById } = ctx();
  const noProgress = minDose || P.primaryMuscles(v, movementsById).some(id => deload.includes(id));
  const last = G.lastExercise(v.id, S.sessions);
  const pre = G.prefill({
    variant: v, eq: equipmentOf(v), last: last?.exercise, nSets,
    phaseKey: S.settings.phase, noProgress,
  });
  return {
    variantId: v.id,
    group: null,
    rating: null,
    hint: pre.hint,
    sets: pre.sets.map(s => ({ load: s.load, reps: s.reps, planLoad: s.load, planReps: s.reps, done: false, at: null })),
  };
}

// План следующей тренировки (не сохраняется, пока не нажмёшь «Начать»)
export function nextSessionPlan() {
  const week = currentWeek();
  const loc = S.settings.location;
  const { movementsById } = ctx();
  const done = weekSessions(week.id);
  const { need, minDose } = P.sessionNeed({
    targets: week.targets, plannedSessions: week.plannedSessions,
    done: weekVolume(week.id), sessionsDone: done.length,
  });
  const rotation = S.sessions.filter(s => s.status === 'done' && s.locationId === loc).length;
  const { items, short } = P.composeSession({ variants: planVariants(loc), need, rotation, movementsById });
  const mode = S.settings.format?.[loc] || 'straight';
  const exercises = items.map(x => buildExercise(variant(x.variantId), x.sets, { minDose, deload: week.deload }));
  return {
    id: uid('s'),
    weekId: week.id,
    locationId: loc,
    startedAt: null,
    finishedAt: null,
    status: 'active',
    mode,
    minDose,
    plan: need,
    short,
    restEndsAt: null,
    exercises: P.applyFormat(exercises, mode, ex => P.regionOfVariant(variant(ex.variantId), movementsById)),
  };
}

export async function startSession(plan) {
  const week = currentWeek();
  const doneCount = weekSessions(week.id).length;
  if (week.plannedSessions <= doneCount) {
    week.plannedSessions = doneCount + 1;
    await save('weeks', week);
  }
  const s = { ...plan, startedAt: new Date().toISOString() };
  delete s.short;
  await save('sessions', s);
  return s;
}

export async function finishSession(s) {
  s.exercises = s.exercises
    .map(ex => ({ ...ex, sets: ex.sets.filter(x => x.done) }))
    .filter(ex => ex.sets.length);
  if (!s.exercises.length) {
    await remove('sessions', s.id);
    return null;
  }
  s.status = 'done';
  s.finishedAt = new Date().toISOString();
  s.restEndsAt = null;
  const { movementsById, variantsById } = ctx();
  const muscles = P.updateHardStreaks(S.muscles, s, movementsById, variantsById);
  for (const m of muscles) if (m !== muscle(m.id)) await save('muscles', m);
  await save('sessions', s);
  return s;
}

// ---- Настройки ----

export async function setPhase(phase) {
  S.settings.phase = phase;
  await save('settings', S.settings);
  for (const m of P.applyPhase(S.muscles, phase)) await save('muscles', m);
  await refreshWeekTargets();
}

export async function refreshWeekTargets() {
  const week = currentWeek();
  week.targets = P.weekTargets(S.muscles, week.deload);
  await save('weeks', week);
}

export async function setFormat(loc, mode) {
  S.settings.format = { ...S.settings.format, [loc]: mode };
  await save('settings', S.settings);
}

export async function setLocation(loc) {
  S.settings.location = loc;
  await save('settings', S.settings);
}

export async function setSessionsPerWeek(loc, n) {
  S.settings.sessionsPerWeek[loc] = n;
  await save('settings', S.settings);
  const week = currentWeek();
  if (loc === S.settings.location && !S.sessions.some(s => s.weekId === week.id)) {
    week.plannedSessions = n;
    await save('weeks', week);
  }
}

// ---- Замеры ----

export const weekMeasurement = (weekId = weekIdOf()) => S.measurements.find(m => m.weekId === weekId);

export async function saveMeasurement({ waist, weight }) {
  const wid = weekIdOf();
  const loc = S.settings.location;
  const m = weekMeasurement(wid) || { id: uid('m'), weekId: wid };
  Object.assign(m, { date: isoDate(), locationId: loc, waist, weight: loc === 'home' ? weight : (m.weight ?? null) });
  await save('measurements', m);
}

// ---- Бэкап ----

export function exportData() {
  const data = {};
  for (const s of db.STORES) data[s] = s === 'settings' ? [S.settings] : S[s];
  return { app: 'gym-tracker', schemaVersion: S.settings.schemaVersion, exportedAt: new Date().toISOString(), data };
}

export async function importData(obj) {
  if (obj?.app !== 'gym-tracker' || !obj.data?.settings?.length) throw new Error('Это не бэкап Gym tracker');
  await db.replaceAll(obj.data);
  for (const s of db.STORES) S[s] = await db.getAll(s);
  S.settings = S.settings[0];
  await migrate();
  await ensureWeek();
}

export async function markBackup() {
  S.settings.lastBackupAt = new Date().toISOString();
  await save('settings', S.settings);
}
