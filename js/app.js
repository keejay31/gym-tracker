// Точка входа: загрузка данных, вкладки, маршруты по #hash.

import * as store from './store.js';
import { h, closeAllSheets } from './ui.js';
import { setRenderer, refresh } from './nav.js';
import * as today from './screens/today.js';
import * as workout from './screens/workout.js';
import * as stats from './screens/stats.js';
import * as library from './screens/library.js';
import * as settings from './screens/settings.js';

const SCREENS = { today, workout, stats, library, settings };
const TABS = [
  ['today', 'Сегодня', '●'],
  ['stats', 'Статистика', '▤'],
  ['library', 'Упражнения', '☰'],
  ['settings', 'Настройки', '⚙'],
];

let current = null;

function parseHash() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { name: SCREENS[name] ? name : 'today', params };
}

function render({ keepScroll = false } = {}) {
  // Наступил понедельник, пока приложение было открыто, — сначала заводим новую неделю
  if (!store.currentWeek()) {
    store.ensureWeek().then(() => render({ keepScroll }));
    return;
  }
  const { name, params } = parseHash();
  if (current && current.name !== name) current.screen.leave?.();
  if (!current || current.name !== name) closeAllSheets();
  current = { name, screen: SCREENS[name] };

  const view = document.getElementById('view');
  view.replaceChildren(SCREENS[name].render(params) || '');
  document.body.classList.toggle('fullscreen', name === 'workout');
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === name));
  if (!keepScroll) window.scrollTo(0, 0);
}

function buildTabs() {
  document.getElementById('tabs').replaceChildren(...TABS.map(([id, label, icon]) =>
    h('a', { href: `#${id}`, 'data-tab': id }, h('span', { class: 'ico' }, icon), h('span', null, label))));
}

async function boot() {
  try {
    await store.load();
  } catch (e) {
    document.getElementById('view').replaceChildren(
      h('div', { class: 'card' }, h('h2', null, 'Не открылась база'), h('p', { class: 'muted' }, String(e))));
    return;
  }
  buildTabs();
  setRenderer(render);
  window.addEventListener('hashchange', () => render());
  // Новая неделя могла наступить, пока приложение висело в фоне
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const before = store.currentWeek()?.id;
    await store.ensureWeek();
    if (store.currentWeek()?.id !== before) refresh();
  });
  // iOS мог выгрузить приложение посреди тренировки — возвращаемся в неё
  if (store.activeSession() && !location.hash.startsWith('#workout')) location.hash = '#workout';
  render();
  // :active на iOS работает только при наличии touch-обработчика
  document.addEventListener('touchstart', () => {}, { passive: true });
}

// Офлайн-кэш. Новая версия (поднят VERSION в sw.js) подхватывается при возврате в приложение;
// посреди тренировки не перезагружаемся — обновимся при следующем запуске.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !store.activeSession()) location.reload();
  });
}

boot();
