// Лист «Замер недели»: талия везде, вес только дома и по желанию.

import { S } from '../store.js';
import * as store from '../store.js';
import { h, btn, stepper, sheet, numberSheet } from '../ui.js';
import { fmtNum, round2 } from '../util.js';

const latest = key => S.measurements
  .filter(m => m[key] != null)
  .sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.[key];

export function openMeasure(onSaved) {
  const home = S.settings.location === 'home';
  const cur = store.weekMeasurement();
  let waist = cur?.waist ?? latest('waist') ?? 90;
  let weight = cur?.weight ?? null;

  sheet((close, fill) => [
    h('h2', null, 'Замер недели'),
    h('p', { class: 'muted' }, 'Утром натощак, лента на уровне пупка, на выдохе.'),
    h('div', { class: 'field' },
      h('div', { class: 'label' }, 'Талия, см'),
      stepper({
        big: true, value: fmtNum(waist),
        onMinus: () => { waist = round2(waist - 0.5); fill(); },
        onPlus: () => { waist = round2(waist + 0.5); fill(); },
        onValue: async () => {
          const x = await numberSheet('Талия, см', waist);
          if (x > 0) { waist = x; fill(); }
        },
      })),
    home
      ? h('div', { class: 'field' },
          h('div', { class: 'label' }, 'Вес, кг — необязательно'),
          weight == null
            ? btn('+ Добавить вес', () => { weight = latest('weight') ?? 80; fill(); }, 'secondary block')
            : [
                stepper({
                  big: true, value: fmtNum(weight),
                  onMinus: () => { weight = round2(weight - 0.1); fill(); },
                  onPlus: () => { weight = round2(weight + 0.1); fill(); },
                  onValue: async () => {
                    const x = await numberSheet('Вес, кг', weight);
                    if (x > 0) { weight = x; fill(); }
                  },
                }),
                btn('Без веса', () => { weight = null; fill(); }, 'ghost small'),
              ])
      : h('p', { class: 'muted' }, 'Вес пишем только дома — на судне весов нет.'),
    btn('Сохранить', async () => {
      await store.saveMeasurement({ waist, weight });
      close();
      onSaved?.();
    }, 'primary block'),
  ]);
}
