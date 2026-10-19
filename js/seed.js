// Стартовый набор: мышцы, движения, железо, варианты. Всё правится в приложении.

import { PHASES } from './planner.js';

export const SCHEMA_VERSION = 3;

const levels = n => Array.from({ length: n }, (_, i) => `Уровень ${i + 1}`);

const MUSCLES = [
  ['chest', 'Грудь'],
  ['back', 'Спина'],
  ['delts', 'Плечи'],
  ['biceps', 'Бицепс'],
  ['triceps', 'Трицепс'],
  ['quads', 'Квадрицепс'],
  ['hams', 'Бицепс бедра'],
  ['glutes', 'Ягодицы'],
  ['abs', 'Пресс'],
  ['calves', 'Икры'],
];

const MOVEMENTS = [
  ['squat', 'Присед', { quads: 1, glutes: 0.5 }],
  ['lunge', 'Выпад / сплит-присед', { quads: 1, glutes: 0.5 }],
  ['hinge', 'Тазобедренный шарнир', { hams: 1, glutes: 1 }],
  ['hpush', 'Горизонтальный жим', { chest: 1, triceps: 0.5, delts: 0.5 }],
  ['vpush', 'Вертикальный жим', { delts: 1, triceps: 0.5 }],
  ['hpull', 'Горизонтальная тяга', { back: 1, biceps: 0.5 }],
  ['vpull', 'Вертикальная тяга', { back: 1, biceps: 0.5 }],
  ['curl', 'Сгибание рук', { biceps: 1 }],
  ['ext', 'Разгибание рук', { triceps: 1 }],
  ['core', 'Пресс', { abs: 1 }],
  ['calf', 'Подъём на носки', { calves: 1 }],
];

const EQUIPMENT = [
  // Дом
  { id: 'h_band', locationId: 'home', name: 'Резинки', status: 'have', kind: 'band', levels: levels(5), note: 'Уровень 1 — самая лёгкая' },
  { id: 'h_kb', locationId: 'home', name: 'Гири', status: 'have', kind: 'kg', kg: { values: [16, 24] } },
  { id: 'h_db', locationId: 'home', name: 'Гантели 2×10', status: 'have', kind: 'kg', kg: { values: [10] }, pair: true },
  { id: 'h_pushup', locationId: 'home', name: 'Упоры для отжиманий', status: 'have', kind: 'bw' },
  { id: 'h_trx', locationId: 'home', name: 'TRX', status: 'have', kind: 'trx', levels: levels(5), note: 'Уровень 1 — корпус почти вертикально, 5 — почти горизонтально' },
  { id: 'h_wheel', locationId: 'home', name: 'Ролик для пресса', status: 'have', kind: 'bw' },
  { id: 'h_bar', locationId: 'home', name: 'Турник', status: 'no', kind: 'bw' },
  { id: 'h_floor', locationId: 'home', name: 'Пол / свой вес', status: 'have', kind: 'bw' },
  // Судно
  { id: 's_lat', locationId: 'ship', name: 'Вертикальный блок', status: 'have', kind: 'kg', kg: { step: 5 } },
  { id: 's_row', locationId: 'ship', name: 'Горизонтальный блок', status: 'have', kind: 'kg', kg: { step: 5 } },
  { id: 's_smith', locationId: 'ship', name: 'Машина Смита', status: 'have', kind: 'kg', kg: { step: 2.5 }, note: 'Вес блинов без грифа' },
  { id: 's_bench', locationId: 'ship', name: 'Скамья', status: 'unknown', kind: 'none' },
  { id: 's_db', locationId: 'ship', name: 'Гантели', status: 'unknown', kind: 'kg', kg: { values: [] } },
  { id: 's_barbell', locationId: 'ship', name: 'Гриф', status: 'have', kind: 'kg', kg: { step: 2.5 }, note: 'Не используется — вместо него Смит' },
  { id: 's_floor', locationId: 'ship', name: 'Пол / свой вес', status: 'have', kind: 'bw' },
];

// [id, название, движение, снаряд, тип нагрузки, повторы от, до, старт, в плане, на сторону, доп. условия]
const VARIANTS = {
  home: [
    ['h_goblet', 'Гоблет-присед', 'squat', 'h_kb', 'kg', 12, 25, 16, true],
    ['h_pushups', 'Отжимания на упорах', 'hpush', 'h_pushup', 'bw', 10, 25, 0, true],
    ['h_trxrow', 'Тяга TRX', 'hpull', 'h_trx', 'trx', 10, 20, 2, true],
    ['h_slrdl', 'Румынская тяга на одной ноге', 'hinge', 'h_kb', 'kg', 10, 20, 16, true, true],
    ['h_dbohp', 'Жим гантелей стоя', 'vpush', 'h_db', 'kg', 10, 20, 10, true],
    ['h_bandpd', 'Тяга резинки сверху', 'vpull', 'h_band', 'band', 12, 20, 2, true],
    ['h_bss', 'Болгарские выпады', 'lunge', 'h_db', 'kg', 10, 20, 10, true, true],
    ['h_bandcurl', 'Сгибания рук с резинкой', 'curl', 'h_band', 'band', 12, 20, 2, true],
    ['h_bandext', 'Разгибания рук с резинкой над головой', 'ext', 'h_band', 'band', 12, 20, 2, true],
    ['h_wheel', 'Ролик для пресса', 'core', 'h_wheel', 'bw', 6, 15, 0, true],
    ['h_trxpush', 'Отжимания на TRX', 'hpush', 'h_trx', 'trx', 8, 20, 3, false],
    ['h_swing', 'Махи гирей', 'hinge', 'h_kb', 'kg', 15, 30, 16, false],
    ['h_kbpress', 'Жим гири одной рукой', 'vpush', 'h_kb', 'kg', 6, 12, 16, false, true],
    ['h_dbcurl', 'Сгибания рук с гантелями', 'curl', 'h_db', 'kg', 8, 15, 10, false],
    ['h_pullup', 'Подтягивания', 'vpull', 'h_bar', 'bw', 5, 12, 0, false],
    ['h_calf', 'Подъёмы на носки на одной ноге', 'calf', 'h_floor', 'bw', 12, 25, 0, false, true],
  ],
  ship: [
    ['s_squat', 'Присед в Смите', 'squat', 's_smith', 'kg', 8, 12, 40, true],
    ['s_pushups', 'Отжимания от пола', 'hpush', 's_floor', 'bw', 10, 25, 0, true],
    ['s_row', 'Тяга горизонтального блока', 'hpull', 's_row', 'kg', 8, 12, 40, true],
    ['s_rdl', 'Румынская тяга в Смите', 'hinge', 's_smith', 'kg', 8, 12, 40, true],
    ['s_ohp', 'Жим в Смите стоя', 'vpush', 's_smith', 'kg', 8, 12, 20, true],
    ['s_pulldown', 'Тяга вертикального блока', 'vpull', 's_lat', 'kg', 8, 12, 40, true],
    ['s_split', 'Сплит-присед в Смите', 'lunge', 's_smith', 'kg', 8, 12, 20, true, true],
    ['s_curl', 'Сгибания рук на нижнем блоке', 'curl', 's_row', 'kg', 10, 15, 15, true],
    ['s_pushdown', 'Разгибания рук на верхнем блоке', 'ext', 's_lat', 'kg', 10, 15, 20, true],
    ['s_crunch', 'Скручивания на верхнем блоке', 'core', 's_lat', 'kg', 10, 20, 30, true],
    ['s_bench', 'Жим лёжа в Смите', 'hpush', 's_smith', 'kg', 8, 12, 40, false, false, ['s_bench']],
    ['s_calf', 'Подъёмы на носки в Смите', 'calf', 's_smith', 'kg', 10, 20, 40, false],
  ],
};

// Свои ступени веса: гантель 10 кг и без веса до гирь
export const OWN_LOADS = { h_goblet: [0, 10, 16, 24], h_slrdl: [0, 10, 16, 24] };

export function seedData() {
  const phase = 'cut';
  return {
    settings: [{
      id: 'main',
      schemaVersion: SCHEMA_VERSION,
      phase,
      location: 'home',
      sessionsPerWeek: { home: 3, ship: 3 },
      split: 'fullbody',
      restSec: 90,
      format: { home: 'straight', ship: 'straight' },
      circuitRest: 120,
      lastBackupAt: null,
    }],
    muscles: MUSCLES.map(([id, name], i) => ({
      id, name, order: i + 1,
      inPlan: id !== 'calves',
      target: PHASES[phase].start,
      lastIncreaseWeek: null,
      hardStreak: 0,
      deloadPending: false,
    })),
    movements: MOVEMENTS.map(([id, name, m]) => ({
      id, name,
      muscles: Object.entries(m).map(([muscleId, w]) => ({ muscleId, w })),
    })),
    equipment: EQUIPMENT.map(e => ({ ...e })),
    variants: Object.entries(VARIANTS).flatMap(([locationId, list]) =>
      list.map(([id, name, movementId, equipmentId, loadType, repMin, repMax, start, inPlan, perSide = false, needs = []], i) => ({
        id, name, movementId, locationId, equipmentId, needs, loadType,
        repMin, repMax, perSide, restSec: null, startLoad: start, loads: OWN_LOADS[id] || null,
        inPlan, order: i + 1, archived: false,
      }))),
    weeks: [],
    sessions: [],
    measurements: [],
  };
}
