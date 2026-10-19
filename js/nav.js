// Навигация без циклических импортов: экраны зовут go/refresh, app.js подставляет отрисовку.

let renderFn = () => {};

export function setRenderer(fn) { renderFn = fn; }

export function go(hash) {
  if (location.hash === hash) renderFn();
  else location.hash = hash;
}

// Перерисовать текущий экран, сохранив прокрутку
export function refresh() {
  const y = window.scrollY;
  renderFn({ keepScroll: true });
  window.scrollTo(0, y);
}
