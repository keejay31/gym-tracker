// Общее для экранов: подсказки прогрессии и метка «на какие мышцы» с цветом зоны тела.

import * as store from '../store.js';
import { h } from '../ui.js';
import { REGION_OF } from '../planner.js';

export const HINTS = {
  up: ['↑ нагрузка', 'good'],
  ceiling: ['потолок', 'warn'],
  first: ['первый раз', ''],
  hold: ['без прибавки', ''],
};

// Зоны тела (REGION_OF в planner.js): цвет точки у метки. Цвета проверены на различимость,
// в том числе при дальтонизме
export const REGIONS = {
  legs: 'Ноги',
  push: 'Грудь, плечи, трицепс',
  pull: 'Спина, бицепс',
  core: 'Пресс',
};

const primaryIds = v => (store.movement(v.movementId)?.muscles || []).filter(m => m.w === 1).map(m => m.muscleId);

export const regionOf = v => REGION_OF[primaryIds(v)[0]] || 'core';

// «● Бицепс бедра, ягодицы» — основные мышцы упражнения
export function muscleTag(v) {
  const names = primaryIds(v).map(id => store.muscle(id)?.name).filter(Boolean);
  return h('span', { class: `mtag ${regionOf(v)}` }, h('i'), names.join(', ') || 'мышцы не заданы');
}

// [[зона, название, варианты]] в порядке зон, пустые пропускаются
export function groupByRegion(variants) {
  return Object.entries(REGIONS)
    .map(([k, name]) => [k, name, variants.filter(v => regionOf(v) === k)])
    .filter(([, , list]) => list.length);
}
