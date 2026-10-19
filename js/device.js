// Возможности телефона: экран не гаснет (Wake Lock) и сигнал конца отдыха (звук + вспышка).

let lock = null;
let pending = null;
let wantAwake = false;

export async function keepAwake(on) {
  wantAwake = on;
  if (!('wakeLock' in navigator)) return;
  try {
    if (on && !lock && !pending && document.visibilityState === 'visible') {
      pending = navigator.wakeLock.request('screen');
      lock = await pending;
      lock.addEventListener('release', () => { lock = null; });
      if (!wantAwake) await lock.release();   // пока ждали, тренировку уже закрыли
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch {
    lock = null;
  } finally {
    pending = null;
  }
}

// iOS снимает блокировку, когда приложение уходит в фон, — берём заново при возврате
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantAwake) keepAwake(true);
});

// ---- Звук. iOS даёт играть звук только после касания — «будим» аудио на первом ✓ ----

let ac = null;

export function unlockAudio() {
  try {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain();
    g.gain.value = 0;
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.01);
  } catch { /* без звука */ }
}

export function beep() {
  if (!ac) return;
  try {
    if (ac.state === 'suspended') ac.resume();
    const t0 = ac.currentTime;
    for (const t of [0, 0.3, 0.6]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = t === 0.6 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + t);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.22);
      o.connect(g).connect(ac.destination);
      o.start(t0 + t);
      o.stop(t0 + t + 0.25);
    }
  } catch { /* без звука */ }
}

export function flash() {
  document.body.classList.remove('flash');
  void document.body.offsetWidth;
  document.body.classList.add('flash');
  setTimeout(() => document.body.classList.remove('flash'), 1600);
}
