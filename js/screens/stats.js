// Статистика: подходы на мышцу за неделю, результаты по вариантам, талия и вес.

import { S } from '../store.js';
import * as store from '../store.js';
import { h, btn, segmented, chip, topbar } from '../ui.js';
import { go, refresh } from '../nav.js';
import { MAINTAIN_MIN } from '../planner.js';
import * as G from '../progression.js';
import { LOCATIONS, fmtWeek, fmtDay, fmtNum, parseDate, plural } from '../util.js';
import { openMeasure } from './measure.js';
import { muscleTag } from './common.js';

const RATING_NAME = { easy: 'легко', ok: 'норм', hard: 'на пределе' };
const TABS = [['week', 'Неделя'], ['ex', 'Упражнения'], ['body', 'Талия']];
let exLoc = null;

export function render([tab = 'week', id] = []) {
  if (tab === 'v') return variantView(id);
  return h('div', { class: 'screen' },
    h('header', { class: 'hero' }, h('h1', null, 'Статистика')),
    segmented(TABS, tab, t => go(`#stats/${t}`)),
    tab === 'ex' ? exercisesView() : tab === 'body' ? bodyView() : weekView());
}

// ---- Неделя ----

function weekView() {
  const week = store.currentWeek();
  const prev = S.weeks.filter(w => w.id < week.id).sort((a, b) => (a.id < b.id ? 1 : -1))[0];
  return [
    weekBlock('Эта неделя', week, store.weekVolume(week.id, true)),
    prev && weekBlock('Прошлая неделя', prev, prev.done || store.weekVolume(prev.id)),
    h('p', { class: 'muted small legend' },
      h('span', { class: 'tick-key' }), ` — минимум поддержания, ${MAINTAIN_MIN} подходов; ✓ — добран. `,
      'Подходы дробные: основная мышца 1, вспомогательная 0,5.'),
  ];
}

function weekBlock(title, week, vol) {
  const n = store.weekSessions(week.id).length;
  const rows = store.musclesSorted().filter(m => m.id in week.targets || (vol[m.id] || 0) > 0);
  return h('section', { class: 'card' },
    h('div', { class: 'label' }, `${title} · ${fmtWeek(week.id)} · ${n} ${plural(n, 'тренировка', 'тренировки', 'тренировок')}`),
    rows.map(m => muscleBar(m.name, vol[m.id] || 0, week.targets[m.id], (week.deload || []).includes(m.id))));
}

function muscleBar(name, done, target, deload) {
  const scale = Math.max(target || 0, done, MAINTAIN_MIN);
  const pct = x => `${Math.min(100, (x / scale) * 100)}%`;
  const reached = done >= (target ?? Infinity) * 0.9;
  return h('div', { class: 'mbar', title: `${name}: ${fmtNum(done)} из ${target ?? '—'}` },
    h('div', { class: 'mbar-top' },
      h('span', null, name, deload && chip('разгрузка')),
      h('span', { class: 'num' }, `${fmtNum(done)} / ${target ?? '—'}`,
        done >= MAINTAIN_MIN ? h('span', { class: 'good-text' }, ' ✓') : '')),
    h('div', { class: 'track' },
      h('div', { class: `fill${reached ? ' full' : ''}`, style: `width:${pct(done)}` }),
      target != null && target < scale && h('div', { class: 'target', style: `left:${pct(target)}` }),
      h('div', { class: 'tick', style: `left:${pct(MAINTAIN_MIN)}` })));
}

// ---- Упражнения ----

function exercisesView() {
  exLoc ||= S.settings.location;
  const list = store.locationVariants(exLoc)
    .map(v => ({ v, last: G.lastExercise(v.id, S.sessions) }))
    .filter(x => x.last || (x.v.inPlan && store.equipmentOk(x.v)))
    .sort((a, b) => (b.last?.session.startedAt || '').localeCompare(a.last?.session.startedAt || ''));
  return [
    segmented(Object.entries(LOCATIONS), exLoc, l => { exLoc = l; refresh(); }, { cls: 'small' }),
    h('section', { class: 'card list' }, list.map(({ v, last }) =>
      h('a', { class: 'list-row', href: `#stats/v/${v.id}` },
        h('div', { class: 'grow' },
          h('div', null, v.name),
          h('div', { class: 'small' }, muscleTag(v)),
          h('div', { class: 'muted small' }, last
            ? `${fmtDay(last.session.startedAt)} · ${G.fmtResult(last.exercise.sets, v, store.equipmentOf(v))}` +
              (last.exercise.rating ? ` · ${RATING_NAME[last.exercise.rating]}` : '')
            : 'ещё не делал')),
        h('span', { class: 'muted' }, '›')))),
  ];
}

function variantView(id) {
  const v = store.variant(id);
  if (!v) return h('div', { class: 'screen' }, topbar('Нет такого', { back: '#stats/ex' }));
  const eq = store.equipmentOf(v);
  const past = G.history(v.id, S.sessions, 10);
  const next = store.buildExercise(v, past[0]?.exercise.sets.length || 3);
  const [hint] = { up: ['↑ нагрузка'], ceiling: ['потолок'], first: ['первый раз'] }[next.hint] || [];
  return h('div', { class: 'screen' },
    topbar(v.name, { back: '#stats/ex' }),
    h('section', { class: 'card' },
      h('div', { class: 'mb' }, muscleTag(v)),
      h('div', { class: 'label' }, 'В следующий раз'),
      h('div', { class: 'big-text' }, G.fmtPlan(next.sets, v, eq), v.perSide ? ' на сторону' : ''),
      h('p', { class: 'muted small' }, `Диапазон ${v.repMin}–${v.repMax}`, hint ? ` · ${hint}` : '')),
    h('section', { class: 'card list' },
      h('div', { class: 'label' }, 'История'),
      past.length ? past.map(p => h('div', { class: 'list-row' },
        h('span', { class: 'muted date' }, fmtDay(p.session.startedAt)),
        h('span', { class: 'grow' }, G.fmtResult(p.exercise.sets, v, eq)),
        p.exercise.rating && h('span', { class: 'muted small' }, RATING_NAME[p.exercise.rating])))
      : h('p', { class: 'muted' }, 'Пока пусто.')));
}

// ---- Талия и вес ----

function bodyView() {
  const ms = S.measurements.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = ms[ms.length - 1];
  const monthAgo = [...ms].reverse().find(m => (parseDate(last?.date || '2000-01-01') - parseDate(m.date)) / 864e5 >= 28);
  const delta = (a, b) => {
    const d = a - b;
    return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmtNum(Math.abs(d))} см`;
  };
  return [
    h('section', { class: 'card' },
      h('div', { class: 'row between' },
        h('div', null,
          h('div', { class: 'label' }, 'Талия, см'),
          h('div', { class: 'hero-num' }, last ? fmtNum(last.waist) : '—'),
          last && h('div', { class: 'muted small' },
            monthAgo ? `${delta(last.waist, monthAgo.waist)} за месяц · ` : '',
            ms.length > 1 ? `${delta(last.waist, ms[0].waist)} с ${fmtDay(ms[0].date)}` : '')),
        btn('+ Замер', () => openMeasure(refresh), 'secondary')),
      waistChart(ms)),
    h('section', { class: 'card list' },
      h('div', { class: 'label' }, 'Все замеры'),
      ms.length ? weightRows(ms).reverse() : h('p', { class: 'muted' }, 'Пока пусто.')),
  ];
}

// Строки замеров; разница веса между двумя домашними замерами с судном посередине — «за вахту»
function weightRows(ms) {
  let prevW = null;
  let shipSince = false;
  return ms.map(m => {
    let note = '';
    if (m.locationId === 'ship') shipSince = true;
    if (m.weight != null) {
      if (prevW) {
        const d = m.weight - prevW.weight;
        note = `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmtNum(Math.abs(d))} кг${shipSince ? ' за вахту' : ''}`;
      }
      prevW = m;
      shipSince = false;
    }
    return h('div', { class: 'list-row' },
      h('span', { class: 'muted date' }, fmtDay(m.date)),
      h('span', { class: 'grow' },
        `${fmtNum(m.waist)} см`, m.weight != null ? ` · ${fmtNum(m.weight)} кг` : '',
        h('div', { class: 'muted small' }, [LOCATIONS[m.locationId], note].filter(Boolean).join(' · '))));
  });
}

// График талии: одна серия, линия 2 px, точки r 4 с кольцом, перекрестие с подсказкой по касанию
function waistChart(ms) {
  if (ms.length < 2) {
    return h('p', { class: 'muted small' }, ms.length ? 'График появится со второго замера.' : 'Замеров ещё нет.');
  }
  const W = 320, H = 170, L = 34, R = 40, T = 10, B = 22;
  const ts = ms.map(m => parseDate(m.date).getTime());
  const t0 = ts[0], t1 = ts[ts.length - 1];
  const vals = ms.map(m => m.waist);
  const span = Math.max(...vals) - Math.min(...vals);
  const step = span <= 3 ? 1 : span <= 8 ? 2 : 5;
  const lo = Math.floor((Math.min(...vals) - 0.5) / step) * step;
  const hi = Math.ceil((Math.max(...vals) + 0.5) / step) * step;
  const X = t => L + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - L - R);
  const Y = v => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const pts = ms.map((m, i) => [X(ts[i]), Y(m.waist)]);

  const grid = [];
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid.push(`<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/>`,
      `<text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="axis">${v}</text>`);
  }
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const area = `${line}L${pts[pts.length - 1][0]},${H - B}L${pts[0][0]},${H - B}Z`;
  const [lx, ly] = pts[pts.length - 1];
  const svg = `
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Талия по неделям">
      ${grid.join('')}
      <text x="${L}" y="${H - 6}" class="axis">${fmtDay(ms[0].date)}</text>
      <text x="${W - R}" y="${H - 6}" text-anchor="end" class="axis">${fmtDay(ms[ms.length - 1].date)}</text>
      <path d="${area}" class="area"/>
      <path d="${line}" class="line"/>
      <line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
      ${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" class="dot"/>`).join('')}
      <text x="${lx + 8}" y="${ly + 4}" class="end">${fmtNum(ms[ms.length - 1].waist)}</text>
      <rect x="${L}" y="0" width="${W - L - R}" height="${H}" class="hit"/>
    </svg>`;

  const wrap = h('div', { class: 'chart-wrap', html: svg });
  const tip = h('div', { class: 'chart-tip', hidden: true });
  wrap.append(tip);
  const el = wrap.querySelector('svg');
  const cross = el.querySelector('.cross');
  const show = e => {
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let i = 0;
    pts.forEach((p, k) => { if (Math.abs(p[0] - x) < Math.abs(pts[i][0] - x)) i = k; });
    cross.setAttribute('x1', pts[i][0]);
    cross.setAttribute('x2', pts[i][0]);
    cross.setAttribute('visibility', 'visible');
    tip.replaceChildren(h('strong', null, `${fmtNum(ms[i].waist)} см`), h('span', null, ` ${fmtDay(ms[i].date)}`));
    tip.hidden = false;
    tip.style.left = `${(pts[i][0] / W) * 100}%`;
  };
  el.addEventListener('pointerdown', show);
  el.addEventListener('pointermove', show);
  el.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; });
  return wrap;
}
