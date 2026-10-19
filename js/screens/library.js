// «Упражнения»: варианты по локации, движения с мышцами, железо. Всё редактируется.

import { S } from '../store.js';
import * as store from '../store.js';
import { h, btn, segmented, stepper, toggle, topbar, chip, confirmSheet, toast } from '../ui.js';
import { go, refresh } from '../nav.js';
import * as G from '../progression.js';
import { LOCATIONS, uid, fmtNum, round2, parseNumList } from '../util.js';
import { muscleTag, groupByRegion } from './common.js';

let libLoc = null;

const LOAD_TYPES = [['kg', 'кг'], ['band', 'резинка, уровень'], ['trx', 'TRX, уровень'], ['bw', 'свой вес ±кг']];
const KINDS = [['kg', 'кг'], ['band', 'резинка — уровни'], ['trx', 'TRX — уровни'], ['bw', 'свой вес'], ['none', 'условие (скамья и т. п.)']];
const STATUS = [['have', 'есть'], ['no', 'нет'], ['unknown', 'уточнить']];
const STATUS_NAME = Object.fromEntries(STATUS);
const kindToLoad = k => (k === 'none' ? null : k);

export function render([page, id] = []) {
  libLoc ||= S.settings.location;
  switch (page) {
    case 'v': return variantEditor(id);
    case 'moves': return movementList();
    case 'm': return movementEditor(id);
    case 'eq': return equipmentList();
    case 'e': return equipmentEditor(id);
    default: return variantList();
  }
}

// ---- Поля форм ----

const field = (label, ...control) => h('div', { class: 'field' }, h('div', { class: 'label' }, label), ...control);

function textInput(value, onSave, placeholder = '') {
  return h('input', {
    class: 'input', type: 'text', value, placeholder,
    onChange: e => onSave(e.target.value.trim()),
  });
}

function select(options, value, onChange) {
  return h('select', { class: 'input', onChange: e => onChange(e.target.value) },
    options.map(([k, label]) => h('option', { value: k, selected: k === value }, label)));
}

// ---- Список вариантов ----

function variantList() {
  const all = store.locationVariants(libLoc);
  const row = v => {
    const eq = store.equipmentOf(v);
    const ok = store.equipmentOk(v);
    const missing = [v.equipmentId, ...(v.needs || [])].map(store.equipment).find(e => e?.status !== 'have');
    return h('div', { class: `list-row${ok ? '' : ' dim'}` },
      toggle(v.inPlan, async on => { v.inPlan = on; await store.save('variants', v); refresh(); }),
      h('a', { class: 'grow', href: `#library/v/${v.id}` },
        h('div', null, v.name),
        h('div', { class: 'muted small' }, muscleTag(v),
          ` · ${eq?.name || '—'} · ${v.repMin}–${v.repMax}${v.perSide ? ' на сторону' : ''}`,
          !ok && missing ? ` · ${missing.name}: ${STATUS_NAME[missing.status]}` : '')),
      v.inPlan && h('div', { class: 'order' },
        btn('↑', () => reorder(v, -1), 'ghost icon'),
        btn('↓', () => reorder(v, +1), 'ghost icon')));
  };
  const planned = all.filter(v => v.inPlan);
  const rest = all.filter(v => !v.inPlan);
  return h('div', { class: 'screen' },
    h('header', { class: 'hero' }, h('h1', null, 'Упражнения')),
    segmented(Object.entries(LOCATIONS), libLoc, l => { libLoc = l; refresh(); }, { cls: 'big' }),
    h('div', { class: 'row gap' },
      btn('Движения', () => go('#library/moves'), 'secondary grow'),
      btn(`Железо · ${LOCATIONS[libLoc].toLowerCase()}`, () => go('#library/eq'), 'secondary grow')),
    h('section', { class: 'card list' },
      h('div', { class: 'label' }, 'В тренировке — по порядку'),
      planned.length ? planned.map(row) : h('p', { class: 'muted' }, 'Пусто — включи упражнения ниже.')),
    rest.length > 0 && h('section', { class: 'card list' }, h('div', { class: 'label' }, 'Не в плане'),
      groupByRegion(rest).map(([, name, vs]) => [h('div', { class: 'sublabel' }, name), vs.map(row)])),
    btn('+ Новый вариант', newVariant, 'secondary block'),
    h('p', { class: 'muted small' },
      'Порядок — порядок в тренировке: базовые упражнения выше изоляции. Упражнения на одну главную мышцу чередуются от тренировки к тренировке.'));
}

async function reorder(v, dir) {
  const all = store.locationVariants(libLoc);
  const planned = all.filter(x => x.inPlan);
  const other = planned[planned.indexOf(v) + dir];
  if (!other) return;
  const a = all.indexOf(v), b = all.indexOf(other);
  [all[a], all[b]] = [all[b], all[a]];
  for (const [i, x] of all.entries()) if (x.order !== i + 1) await store.save('variants', { ...x, order: i + 1 });
  refresh();
}

async function newVariant() {
  const eq = S.equipment.find(e => e.locationId === libLoc && e.kind !== 'none');
  const v = {
    id: uid('v'), name: 'Новое упражнение', movementId: S.movements[0]?.id, locationId: libLoc,
    equipmentId: eq?.id, needs: [], loadType: kindToLoad(eq?.kind) || 'kg',
    repMin: 8, repMax: 12, perSide: false, restSec: null, startLoad: null,
    inPlan: false, order: Math.max(0, ...S.variants.map(x => x.order || 0)) + 1, archived: false,
  };
  await store.save('variants', v);
  go(`#library/v/${v.id}`);
}

// ---- Редактор варианта ----

function variantEditor(id) {
  const v = store.variant(id);
  if (!v) return h('div', { class: 'screen' }, topbar('Нет такого', { back: '#library' }));
  const eq = store.equipmentOf(v);
  const locEq = S.equipment.filter(e => e.locationId === v.locationId);
  const conditions = locEq.filter(e => e.kind === 'none');
  const save = async (patch, rerender = true) => {
    Object.assign(v, patch);
    await store.save('variants', v);
    if (rerender) refresh();
  };
  const used = S.sessions.some(s => s.exercises.some(e => e.variantId === v.id));
  const start = v.startLoad ?? G.startLoad(v, eq);
  const rest = v.restSec ?? S.settings.restSec;

  return h('div', { class: 'screen' },
    topbar('Вариант', { back: '#library' }),
    h('section', { class: 'card' },
      field('Название', textInput(v.name, name => name && save({ name }, false))),
      field('Движение', select(S.movements.map(m => [m.id, m.name]), v.movementId, movementId => save({ movementId }))),
      field(`Снаряд · ${LOCATIONS[v.locationId].toLowerCase()}`,
        select(locEq.filter(e => e.kind !== 'none').map(e => [e.id, `${e.name}${e.status === 'have' ? '' : ` (${STATUS_NAME[e.status]})`}`]),
          v.equipmentId, equipmentId => {
            const k = kindToLoad(store.equipment(equipmentId)?.kind);
            save({ equipmentId, loadType: k || v.loadType, startLoad: null });
          })),
      field('Тип нагрузки', select(LOAD_TYPES, v.loadType, loadType => save({ loadType, startLoad: null }))),
      v.loadType === 'kg' && field('Свои ступени веса, кг',
        textInput((v.loads || []).map(x => fmtNum(x, 2)).join(' '),
          txt => { const loads = parseNumList(txt); save({ loads: loads.length ? loads : null, startLoad: null }); },
          eq?.kg?.values?.length ? `как у снаряда: ${eq.kg.values.map(x => fmtNum(x, 2)).join(' ')}` : 'как у снаряда — шагом'),
        h('p', { class: 'muted small' }, 'Через пробел. 0 — без веса. Пусто — ступени снаряда.')),
      conditions.length > 0 && field('Нужно ещё', conditions.map(c => h('div', { class: 'row between' },
        h('span', null, c.name, ' ', chip(STATUS_NAME[c.status])),
        toggle((v.needs || []).includes(c.id), on => save({
          needs: on ? [...(v.needs || []), c.id] : (v.needs || []).filter(x => x !== c.id),
        })))))),
    h('section', { class: 'card' },
      h('div', { class: 'label mt' }, 'Диапазон повторов'),
      h('div', { class: 'row between' }, h('span', null, 'от'),
        stepper({ value: v.repMin,
          onMinus: () => v.repMin > 1 && save({ repMin: v.repMin - 1 }),
          onPlus: () => v.repMin < v.repMax && save({ repMin: v.repMin + 1 }) })),
      h('div', { class: 'row between mt' }, h('span', null, 'до'),
        stepper({ value: v.repMax,
          onMinus: () => v.repMax > v.repMin && save({ repMax: v.repMax - 1 }),
          onPlus: () => save({ repMax: v.repMax + 1 }) })),
      h('div', { class: 'row between field' },
        h('span', null, 'Повторы на каждую сторону'),
        toggle(v.perSide, perSide => save({ perSide }))),
      field(`Отдых, с · ${v.restSec == null ? 'общий' : 'свой'}`,
        h('div', { class: 'row gap' },
          stepper({ value: rest,
            onMinus: () => rest > 15 && save({ restSec: rest - 15 }),
            onPlus: () => save({ restSec: rest + 15 }) }),
          v.restSec != null && btn('Как у всех', () => save({ restSec: null }), 'ghost small'))),
      field('Нагрузка для первой тренировки',
        stepper({ value: G.fmtLoad(start, v, eq),
          onMinus: () => save({ startLoad: G.stepLoad(start, -1, v, eq) }),
          onPlus: () => save({ startLoad: G.stepLoad(start, +1, v, eq) }) })),
      h('div', { class: 'row between field' },
        h('span', null, 'В тренировке'),
        toggle(v.inPlan, inPlan => save({ inPlan })))),
    btn(used ? 'Убрать в архив' : 'Удалить', async () => {
      const ok = await confirmSheet(used ? `Убрать «${v.name}» в архив?` : `Удалить «${v.name}»?`, used ? 'В архив' : 'Удалить', {
        danger: true, sub: used ? 'История сохранится, в списках вариант пропадёт.' : null,
      });
      if (!ok) return;
      if (used) await save({ archived: true, inPlan: false }, false);
      else await store.remove('variants', v.id);
      go('#library');
    }, 'ghost danger-text block'));
}

// ---- Движения ----

const fmtWeight = w => (w === 1 ? '1' : '½');

function movementList() {
  return h('div', { class: 'screen' },
    topbar('Движения', { back: '#library' }),
    h('section', { class: 'card list' }, S.movements.map(m => h('a', { class: 'list-row', href: `#library/m/${m.id}` },
      h('div', { class: 'grow' },
        h('div', null, m.name),
        h('div', { class: 'muted small' },
          m.muscles.map(x => `${store.muscle(x.muscleId)?.name} ${fmtWeight(x.w)}`).join(' · ') || 'мышцы не заданы')),
      h('span', { class: 'muted' }, '›')))),
    btn('+ Новое движение', async () => {
      const m = { id: uid('mv'), name: 'Новое движение', muscles: [] };
      await store.save('movements', m);
      go(`#library/m/${m.id}`);
    }, 'secondary block'),
    h('p', { class: 'muted small' }, 'Основная мышца считает подход целиком, вспомогательная — половиной.'));
}

function movementEditor(id) {
  const m = store.movement(id);
  if (!m) return h('div', { class: 'screen' }, topbar('Нет такого', { back: '#library/moves' }));
  const weightOf = mid => m.muscles.find(x => x.muscleId === mid)?.w;
  // — → 1 → ½ → —
  const cycle = async mid => {
    const w = weightOf(mid);
    const next = w == null ? 1 : w === 1 ? 0.5 : null;
    const rest = m.muscles.filter(x => x.muscleId !== mid);
    if (next != null) rest.push({ muscleId: mid, w: next });
    const order = x => store.muscle(x.muscleId)?.order ?? 99;
    m.muscles = rest.sort((a, b) => b.w - a.w || order(a) - order(b));
    await store.save('movements', m);
    refresh();
  };
  const users = S.variants.filter(v => v.movementId === m.id && !v.archived);
  return h('div', { class: 'screen' },
    topbar('Движение', { back: '#library/moves' }),
    h('section', { class: 'card' },
      field('Название', textInput(m.name, name => name && store.save('movements', Object.assign(m, { name })))),
      field('Мышцы — тап меняет: — / 1 / ½',
        h('div', { class: 'muscle-grid' }, store.musclesSorted().map(x => {
          const w = weightOf(x.id);
          return btn([h('span', null, x.name), h('strong', null, w == null ? '—' : fmtWeight(w))],
            () => cycle(x.id), `muscle${w === 1 ? ' main' : w ? ' half' : ''}`);
        })))),
    h('p', { class: 'muted small' }, users.length
      ? `Варианты: ${users.map(v => v.name).join(', ')}.`
      : 'Вариантов на этом движении нет.'),
    !users.length && btn('Удалить движение', async () => {
      if (!(await confirmSheet(`Удалить «${m.name}»?`, 'Удалить', { danger: true }))) return;
      await store.remove('movements', m.id);
      go('#library/moves');
    }, 'ghost danger-text block'));
}

// ---- Железо ----

function eqDesc(e) {
  switch (e.kind) {
    case 'kg': return e.kg?.values ? `кг: ${e.kg.values.map(x => fmtNum(x, 2)).join(', ') || 'не задано'}${e.pair ? ', на руку' : ''}` : `кг, шаг ${fmtNum(e.kg?.step ?? 2.5, 2)}`;
    case 'band': case 'trx': return `уровни 1–${e.levels?.length || 1}`;
    case 'bw': return 'свой вес';
    default: return 'условие';
  }
}

function equipmentList() {
  const list = S.equipment.filter(e => e.locationId === libLoc);
  return h('div', { class: 'screen' },
    topbar(`Железо · ${LOCATIONS[libLoc].toLowerCase()}`, { back: '#library' }),
    h('section', { class: 'card list' }, list.map(e => h('a', { class: `list-row${e.status === 'have' ? '' : ' dim'}`, href: `#library/e/${e.id}` },
      h('div', { class: 'grow' }, h('div', null, e.name), h('div', { class: 'muted small' }, eqDesc(e))),
      chip(STATUS_NAME[e.status], e.status === 'have' ? 'good' : e.status === 'unknown' ? 'warn' : ''),
      h('span', { class: 'muted' }, '›')))),
    btn('+ Новый снаряд', async () => {
      const e = { id: uid('e'), locationId: libLoc, name: 'Новый снаряд', status: 'have', kind: 'kg', kg: { step: 2.5 } };
      await store.save('equipment', e);
      go(`#library/e/${e.id}`);
    }, 'secondary block'),
    h('p', { class: 'muted small' }, 'Упражнения на снарядах «нет» и «уточнить» в тренировку не попадают.'));
}

function equipmentEditor(id) {
  const e = store.equipment(id);
  if (!e) return h('div', { class: 'screen' }, topbar('Нет такого', { back: '#library/eq' }));
  const save = async (patch, rerender = true) => {
    Object.assign(e, patch);
    await store.save('equipment', e);
    if (rerender) refresh();
  };
  const users = S.variants.filter(v => v.equipmentId === e.id || (v.needs || []).includes(e.id));
  const setKind = async kind => {
    const patch = { kind };
    if (kind === 'kg' && !e.kg) patch.kg = { step: 2.5 };
    if ((kind === 'band' || kind === 'trx') && !e.levels?.length) patch.levels = ['Уровень 1', 'Уровень 2', 'Уровень 3', 'Уровень 4', 'Уровень 5'];
    for (const v of users) if (v.equipmentId === e.id && kindToLoad(kind)) await store.save('variants', { ...v, loadType: kind, startLoad: null });
    save(patch);
  };
  const levels = e.levels || [];

  return h('div', { class: 'screen' },
    topbar('Снаряд', { back: '#library/eq' }),
    h('section', { class: 'card' },
      field('Название', textInput(e.name, name => name && save({ name }, false))),
      field('Статус', segmented(STATUS, e.status, status => save({ status }))),
      field('Нагрузка', select(KINDS, e.kind, setKind)),
      e.kind === 'kg' && [
        field('Как меняется вес', segmented([['step', 'шагом'], ['values', 'списком']], e.kg?.values ? 'values' : 'step',
          mode => save({ kg: mode === 'values' ? { values: [] } : { step: 2.5 } }))),
        e.kg?.values
          ? field('Веса через пробел, кг', textInput(e.kg.values.map(x => fmtNum(x, 2)).join(' '),
              txt => save({ kg: { values: parseNumList(txt) } }), '16 24'))
          : field('Шаг, кг', stepper({
              value: fmtNum(e.kg?.step ?? 2.5, 2),
              onMinus: () => (e.kg.step ?? 2.5) > 0.5 && save({ kg: { step: round2((e.kg.step ?? 2.5) - 0.5) } }),
              onPlus: () => save({ kg: { step: round2((e.kg?.step ?? 2.5) + 0.5) } }),
            })),
        h('div', { class: 'row between field' },
          h('span', null, 'Пара — вес пишется на одну руку'),
          toggle(!!e.pair, pair => save({ pair }))),
      ],
      (e.kind === 'band' || e.kind === 'trx') && [
        field('Сколько уровней', stepper({
          value: levels.length,
          onMinus: () => levels.length > 1 && save({ levels: levels.slice(0, -1) }),
          onPlus: () => save({ levels: [...levels, `Уровень ${levels.length + 1}`] }),
        })),
        field('Названия — от лёгкого к тяжёлому', levels.map((name, i) => h('div', { class: 'row gap level' },
          h('span', { class: 'muted' }, i + 1),
          textInput(name, txt => { levels[i] = txt || `Уровень ${i + 1}`; save({ levels }, false); })))),
      ],
      field('Заметка', textInput(e.note || '', note => save({ note }, false), 'например: вес без грифа'))),
    h('p', { class: 'muted small' }, users.length
      ? `Используют: ${users.map(v => v.name).join(', ')}.`
      : 'Ни один вариант этот снаряд не использует.'),
    !users.length && btn('Удалить снаряд', async () => {
      if (!(await confirmSheet(`Удалить «${e.name}»?`, 'Удалить', { danger: true }))) return;
      await store.remove('equipment', e.id);
      go('#library/eq');
    }, 'ghost danger-text block'));
}
