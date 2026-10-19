// Мини-набор для интерфейса: h() собирает DOM, плюс степпер, сегменты, лист снизу, тост.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (['value', 'checked', 'disabled', 'type', 'min', 'max', 'step', 'placeholder'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

// Кнопка, которая не всплывает к родителю (родитель часто сам кликабелен)
export const btn = (label, onClick, cls = '', extra = {}) =>
  h('button', { class: `btn ${cls}`, type: 'button', ...extra, onClick: e => { e.stopPropagation(); onClick?.(e); } }, label);

export function segmented(options, value, onChange, { disabled = false, cls = '' } = {}) {
  return h('div', { class: `seg ${cls}`, role: 'tablist' },
    options.map(([key, label]) => h('button', {
      type: 'button',
      class: key === value ? 'on' : '',
      disabled,
      onClick: () => key !== value && onChange(key),
    }, label)));
}

// [−] значение [+]; onValue — тап по значению (ввод числом)
export function stepper({ value, label, onMinus, onPlus, onValue, big = false }) {
  return h('div', { class: `stepper${big ? ' big' : ''}` },
    btn('−', onMinus, 'step'),
    h('button', { type: 'button', class: 'val', onClick: e => { e.stopPropagation(); onValue?.(); } },
      h('span', { class: 'v' }, value),
      label && h('span', { class: 'l' }, label)),
    btn('+', onPlus, 'step'));
}

export function toggle(checked, onChange) {
  return h('label', { class: 'switch', onClick: e => e.stopPropagation() },
    h('input', { type: 'checkbox', checked, onChange: e => onChange(e.target.checked) }),
    h('span'));
}

export function topbar(title, { back, right } = {}) {
  return h('header', { class: 'topbar' },
    back ? h('a', { class: 'back', href: back }, '‹ Назад') : h('span'),
    h('h1', null, title),
    right || h('span'));
}

// ---- Лист снизу ----

let sheetStack = [];

export function sheet(build, { onClose } = {}) {
  const root = document.getElementById('sheets');
  const close = () => {
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 200);
    sheetStack = sheetStack.filter(x => x !== close);
    onClose?.();
  };
  const panel = h('div', { class: 'sheet', onClick: e => e.stopPropagation() });
  const wrap = h('div', { class: 'sheet-wrap', onClick: close }, panel);
  const fill = () => {
    const kids = [build(close, fill)].flat(Infinity).filter(c => c != null && c !== false);
    panel.replaceChildren(h('div', { class: 'grip' }), ...kids);
  };
  fill();
  root.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  sheetStack.push(close);
  return close;
}

export const closeAllSheets = () => [...sheetStack].forEach(c => c());

export function confirmSheet(text, okLabel = 'Да', { danger = false, sub } = {}) {
  return new Promise(resolve => {
    let answered = false;
    sheet(close => [
      h('h2', null, text),
      sub && h('p', { class: 'muted' }, sub),
      h('div', { class: 'row gap' },
        btn('Отмена', () => { answered = true; close(); resolve(false); }, 'secondary grow'),
        btn(okLabel, () => { answered = true; close(); resolve(true); }, `${danger ? 'danger' : 'primary'} grow`)),
    ], { onClose: () => { if (!answered) resolve(false); } });
  });
}

// Ввод числа с клавиатуры; null — отмена
export function numberSheet(title, value, { decimal = true } = {}) {
  return new Promise(resolve => {
    let result = null;
    const input = h('input', {
      class: 'big-input', type: 'text', inputmode: decimal ? 'decimal' : 'numeric',
      value: String(value ?? '').replace('.', ','),
    });
    const ok = () => {
      const x = parseFloat(input.value.replace(',', '.'));
      if (Number.isFinite(x)) result = x;
      close();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
    const close = sheet(close => [
      h('h2', null, title),
      input,
      h('div', { class: 'row gap' },
        btn('Отмена', close, 'secondary grow'),
        btn('Готово', ok, 'primary grow')),
    ], { onClose: () => resolve(result) });
    input.focus();
    input.select();
  });
}

export function toast(text) {
  const el = h('div', { class: 'toast' }, text);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2200);
}

export const chip = (text, cls = '') => h('span', { class: `chip ${cls}` }, text);
