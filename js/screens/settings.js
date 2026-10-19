// Настройки: фаза, тренировок в неделю, мышцы и их цели, отдых, бэкап.

import { S } from '../store.js';
import * as store from '../store.js';
import { h, btn, segmented, stepper, toggle, chip, confirmSheet, toast } from '../ui.js';
import { refresh } from '../nav.js';
import { PHASES } from '../planner.js';
import { LOCATIONS, fmtDay, isoDate } from '../util.js';

export const APP_VERSION = '1.0';

const PHASE_TEXT = {
  cut: 'Цель — удержать рабочие веса. 10 → 14 подходов на мышцу в неделю, +1 не чаще раза в 2 недели. Повторы растут только после «легко».',
  bulk: 'Полная прогрессия. 12 → 20 подходов, +1 каждую неделю. +1 повтор каждую тренировку, «легко» — +2.',
  maintain: '6 подходов на мышцу в неделю, 1–2 тренировки. Веса не снижаем.',
};

export function render() {
  const week = store.currentWeek();
  const phase = S.settings.phase;
  return h('div', { class: 'screen' },
    h('header', { class: 'hero' }, h('h1', null, 'Настройки')),

    h('section', { class: 'card' },
      h('div', { class: 'label' }, 'Фаза'),
      segmented(Object.entries(PHASES).map(([k, p]) => [k, p.name]), phase, async k => {
        const p = PHASES[k];
        const ok = await confirmSheet(`Перейти в «${p.name}»?`, 'Перейти', {
          sub: `Цели мышц сдвинутся в коридор ${p.start === p.max ? p.start : `${p.start}–${p.max}`} подходов, с этой недели.`,
        });
        if (!ok) return;
        await store.setPhase(k);
        refresh();
      }),
      h('p', { class: 'muted small mt' }, PHASE_TEXT[phase])),

    h('section', { class: 'card' },
      h('div', { class: 'label' }, 'Тренировок в неделю'),
      Object.entries(LOCATIONS).map(([loc, name]) => h('div', { class: 'row between field' },
        h('span', null, name),
        stepper({
          value: S.settings.sessionsPerWeek[loc],
          onMinus: async () => { const n = S.settings.sessionsPerWeek[loc]; if (n > 1) { await store.setSessionsPerWeek(loc, n - 1); refresh(); } },
          onPlus: async () => { const n = S.settings.sessionsPerWeek[loc]; if (n < 7) { await store.setSessionsPerWeek(loc, n + 1); refresh(); } },
        }))),
      h('div', { class: 'row between field' }, h('span', null, 'Схема'), h('span', { class: 'muted' }, 'Фулбади — каждая тренировка на все мышцы'))),

    h('section', { class: 'card list' },
      h('div', { class: 'label' }, 'Мышцы и цель на неделю, подходов'),
      store.musclesSorted().map(m => h('div', { class: `list-row${m.inPlan ? '' : ' dim'}` },
        toggle(m.inPlan, async inPlan => {
          await store.save('muscles', { ...m, inPlan });
          await store.refreshWeekTargets();
          refresh();
        }),
        h('div', { class: 'grow' },
          h('div', null, m.name),
          h('div', null,
            week.deload.includes(m.id) && chip('разгрузка', 'warn'),
            m.deloadPending && chip('разгрузка со след. недели', 'warn'),
            m.hardStreak > 0 && chip(`на пределе ×${m.hardStreak}`))),
        m.inPlan && stepper({
          value: m.target,
          onMinus: async () => { if (m.target > 1) { await store.save('muscles', { ...m, target: m.target - 1 }); await store.refreshWeekTargets(); refresh(); } },
          onPlus: async () => { await store.save('muscles', { ...m, target: m.target + 1 }); await store.refreshWeekTargets(); refresh(); },
        })))),

    h('section', { class: 'card' },
      restRow('Отдых между подходами, с', 'restSec', 90),
      restRow('Отдых после круга в круговой, с', 'circuitRest', 120),
      h('p', { class: 'muted small' }, 'Суперсет и круговая: между упражнениями связки отдыха нет, таймер — после круга. Формат выбирается на «Сегодня».')),

    backupCard(),
    h('p', { class: 'muted small center' }, `Gym tracker ${APP_VERSION} · данные только на этом телефоне`));
}

function restRow(label, key, def) {
  const value = S.settings[key] ?? def;
  const set = async v => { S.settings[key] = v; await store.save('settings', S.settings); refresh(); };
  return h('div', { class: 'row between field' },
    h('span', null, label),
    stepper({ value, onMinus: () => value > 15 && set(value - 15), onPlus: () => set(value + 15) }));
}

function backupCard() {
  const last = S.settings.lastBackupAt;
  const input = h('input', {
    type: 'file', style: 'display:none',
    onChange: async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        const ok = await confirmSheet('Заменить все данные бэкапом?', 'Заменить', {
          danger: true,
          sub: `Бэкап от ${obj.exportedAt ? fmtDay(obj.exportedAt) : '?'}. Всё, что сейчас в приложении, пропадёт.`,
        });
        if (!ok) return;
        await store.importData(obj);
        toast('Данные восстановлены');
        refresh();
      } catch (err) {
        toast(`Не получилось: ${err.message}`);
      }
    },
  });
  return h('section', { class: 'card' },
    h('div', { class: 'label' }, 'Бэкап'),
    h('p', { class: 'muted small' }, last ? `Последний: ${fmtDay(last)}` : 'Ещё не было.',
      ' Экспорт открывает «Поделиться» — сохрани файл в «Файлы» или Google Drive.'),
    h('div', { class: 'row gap' },
      btn('Экспорт', exportBackup, 'primary grow'),
      btn('Импорт', () => input.click(), 'secondary grow')),
    input);
}

async function exportBackup() {
  const name = `gym-tracker-${isoDate()}.json`;
  const file = new File([JSON.stringify(store.exportData())], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Бэкап Gym tracker' });
    } else {
      const a = h('a', { href: URL.createObjectURL(file), download: name });
      document.body.append(a);
      a.click();
      a.remove();
    }
    await store.markBackup();
    toast('Бэкап готов');
    refresh();
  } catch (e) {
    if (e.name !== 'AbortError') toast(`Не получилось: ${e.message}`);
  }
}
