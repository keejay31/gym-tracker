// «Сегодня»: локация, неделя, замер, сигналы и план следующей тренировки.

import { S } from '../store.js';
import * as store from '../store.js';
import { h, btn, segmented, stepper, chip } from '../ui.js';
import { go, refresh } from '../nav.js';
import { PHASES, MAINTAIN_MIN, FORMATS, groupRuns } from '../planner.js';
import * as G from '../progression.js';
import { LOCATIONS, fmtWeek, fmtNum, fmtDuration, plural } from '../util.js';
import { openMeasure } from './measure.js';
import { HINTS, muscleTag } from './common.js';

const names = ids => ids.map(id => store.muscle(id)?.name.toLowerCase()).filter(Boolean).join(', ');

export function render() {
  const week = store.currentWeek();
  const active = store.activeSession();
  const doneCount = store.weekSessions(week.id).length;

  return h('div', { class: 'screen' },
    h('header', { class: 'hero' },
      h('h1', null, 'Сегодня'),
      h('a', { class: 'chip phase', href: '#settings' }, PHASES[S.settings.phase].name)),
    segmented(Object.entries(LOCATIONS), S.settings.location,
      async loc => { await store.setLocation(loc); refresh(); },
      { disabled: !!active, cls: 'big' }),
    active && activeCard(active),
    weekCard(week, doneCount, !!active),
    signals(),
    measureCard(),
    !active && planCard(week, doneCount));
}

function activeCard(s) {
  const all = s.exercises.flatMap(e => e.sets);
  return h('section', { class: 'card accent' },
    h('div', { class: 'label' }, 'Тренировка идёт'),
    h('div', { class: 'big-text' }, fmtDuration(Date.now() - Date.parse(s.startedAt))),
    h('p', { class: 'muted' }, `Отмечено ${all.filter(x => x.done).length} из ${all.length} подходов`),
    btn('Продолжить', () => go('#workout'), 'primary block'));
}

function weekCard(week, doneCount, hasActive) {
  const remaining = Math.max(0, week.plannedSessions - doneCount);
  const min = hasActive ? 1 : 0;
  const maint = store.maintenanceCount(week);
  return h('section', { class: 'card' },
    h('div', { class: 'label' }, `Неделя ${fmtWeek(week.id)}`),
    h('div', { class: 'big-text' },
      `${doneCount} из ${week.plannedSessions} ${plural(week.plannedSessions, 'тренировки', 'тренировок', 'тренировок')}`),
    h('div', { class: 'row between mt' },
      h('span', null, 'Осталось'),
      stepper({
        value: remaining,
        onMinus: async () => { if (remaining > min) { await store.setRemaining(remaining - 1); refresh(); } },
        onPlus: async () => { await store.setRemaining(remaining + 1); refresh(); },
      })),
    h('a', { class: 'row between link mt', href: '#stats/week' },
      h('span', null, 'Минимум поддержания', h('div', { class: 'muted small' }, `${MAINTAIN_MIN} подходов на мышцу`)),
      h('span', { class: `nowrap${maint.done === maint.total ? ' good-text' : ''}` },
        `${maint.done} из ${maint.total}${maint.done === maint.total ? ' ✓' : ''} ›`)));
}

function signals() {
  const out = [];
  const week = store.currentWeek();
  const tip = S.settings.phase === 'cut' ? 'срежь объём или ослабь дефицит' : 'проверь сон и восстановление';
  for (const v of G.dropSignals(S.variants, S.sessions, week.id)) {
    out.push(h('a', { class: 'card warn', href: `#stats/v/${v.id}` },
      `⚠ ${v.name}: результат падает 2 недели подряд — ${tip}.`));
  }
  const last = S.settings.lastBackupAt;
  const days = last ? Math.floor((Date.now() - Date.parse(last)) / 864e5) : null;
  const trained = S.sessions.some(s => s.status === 'done');
  if (trained && (days == null || days > 14)) {
    out.push(h('a', { class: 'card warn', href: '#settings' },
      days == null ? '💾 Бэкапа ещё не было — сделай экспорт в Настройках.' : `💾 Бэкап был ${days} дн. назад — пора сделать новый.`));
  }
  return out;
}

function measureCard() {
  const m = store.weekMeasurement();
  if (!m) {
    return h('section', { class: 'card' },
      h('div', { class: 'row between' },
        h('div', null, h('div', { class: 'label' }, 'Замер недели'), h('div', null, 'Талия ещё не записана')),
        btn('Записать', () => openMeasure(refresh), 'primary')));
  }
  return h('button', { class: 'card row between plain', type: 'button', onClick: () => openMeasure(refresh) },
    h('span', { class: 'label' }, 'Замер недели'),
    h('span', null, `талия ${fmtNum(m.waist)} см${m.weight != null ? ` · вес ${fmtNum(m.weight)} кг` : ''} ✓`));
}

function planRow(ex) {
  const v = store.variant(ex.variantId);
  const [hint, cls] = HINTS[ex.hint] || [];
  return h('div', { class: 'plan-row' },
    h('div', { class: 'grow' }, h('div', null, v.name),
      h('div', { class: 'muted small' }, muscleTag(v), ' · ', G.fmtPlan(ex.sets, v, store.equipmentOf(v)),
        v.perSide ? ' на сторону' : '')),
    hint && chip(hint, cls));
}

function planCard(week, doneCount) {
  const plan = store.nextSessionPlan();
  const n = doneCount + 1;
  const total = Math.max(week.plannedSessions, n);
  const shortIds = Object.keys(plan.short);
  const start = async () => {
    await store.startSession(plan);
    go('#workout');
  };

  return h('section', { class: 'card' },
    h('div', { class: 'label' }, `Следующая · ${LOCATIONS[S.settings.location].toLowerCase()}`),
    h('div', { class: 'big-text' }, `Тренировка ${n} из ${total}`),
    plan.minDose && h('p', { class: 'note' },
      'Одна тренировка на неделе — минимальная доза: по 4 подхода на мышцу, веса прежние.'),
    week.deload.length > 0 && h('p', { class: 'note' },
      `Разгрузка: ${names(week.deload)} — половина подходов, веса те же.`),
    segmented(Object.entries(FORMATS), plan.mode,
      async mode => { await store.setFormat(S.settings.location, mode); refresh(); }, { cls: 'small' }),
    plan.mode !== 'straight' && h('p', { class: 'muted small' }, plan.mode === 'circuit'
      ? 'По подходу каждого упражнения подряд, отдых — после круга.'
      : 'Подход одного упражнения пары, сразу подход второго, потом отдых.'),
    plan.exercises.length
      ? h('div', { class: 'plan-list' }, groupRuns(plan.exercises).map(run => {
          const rows = run.idx.map(i => planRow(plan.exercises[i]));
          if (run.idx.length < 2) return rows;
          const rounds = Math.max(...run.idx.map(i => plan.exercises[i].sets.length));
          return h('div', { class: 'gbox' },
            h('div', { class: 'gbox-head' }, plan.mode === 'circuit'
              ? `По кругу · ${rounds} ${plural(rounds, 'круг', 'круга', 'кругов')}`
              : 'Суперсет'),
            rows);
        }))
      : h('p', { class: 'muted' }, 'Бюджет недели выбран. Отдыхай — или начни свободную тренировку и добавь упражнения сам.'),
    shortIds.length > 0 && h('p', { class: 'note warn-text' },
      `Не влезает: ${names(shortIds)}. На одно упражнение максимум 5 подходов — включи второе в «Упражнениях».`),
    plan.exercises.length > 0 && h('div', { class: 'chips' },
      store.musclesSorted().filter(m => plan.plan[m.id] > 0.05)
        .map(m => chip(`${m.name} ${fmtNum(plan.plan[m.id])}`))),
    btn(plan.exercises.length ? 'Начать тренировку' : 'Свободная тренировка', start, 'primary block big'));
}
