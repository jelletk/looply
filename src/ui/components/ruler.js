import { h } from '../dom.js';

const STEP_PX = 12;

/**
 * Distance ruler: a horizontal strip you swipe with the thumb, snapping to each step. For VoiceOver
 * and the keyboard it is a slider ("Afstand"). onChange(km) fires on every new step.
 * → element with .setValueText(text)
 */
export function createRuler({ min, max, step, value, onChange }) {
  const count = Math.round((max - min) / step);
  const canvas = h('canvas');
  const strip = h('div', {
    class: 'ruler',
    role: 'slider',
    tabindex: '0',
    'aria-label': 'Afstand',
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-valuenow': value,
  }, canvas);
  const wrap = h('div', { class: 'ruler-wrap' }, strip);

  let current = value;
  const toX = (km) => ((km - min) / step) * STEP_PX;
  const fromX = (x) => Math.min(max, Math.max(min, min + Math.round(x / STEP_PX) * step));

  function draw() {
    const pad = strip.clientWidth / 2;
    const w = count * STEP_PX + pad * 2;
    const dpr = devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = 72 * dpr;
    canvas.style.width = w + 'px';
    const g = canvas.getContext?.('2d');
    if (!g) return;
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#fff';
    g.scale(dpr, dpr);
    g.fillStyle = ink;
    g.font = '600 12px ui-rounded, -apple-system, system-ui';
    g.textAlign = 'center';
    for (let i = 0; i <= count; i++) {
      const v = min + i * step;
      const cx = pad + i * STEP_PX;
      const whole = Math.abs(v - Math.round(v)) < 1e-6;
      const five = whole && Math.round(v) % 5 === 0;
      g.globalAlpha = five ? 1 : whole ? 0.85 : 0.62;
      const bw = five || whole ? 2 : 1.5;
      g.fillRect(cx - bw / 2, 4, bw, five ? 32 : whole ? 22 : 12);
      if (max > 30 ? five : whole) {
        g.globalAlpha = 0.85;
        g.fillText(String(Math.round(v)), cx, 58);
      }
    }
    strip.scrollLeft = toX(current);
  }

  function set(km, { scroll = false } = {}) {
    if (km !== current) {
      current = km;
      strip.setAttribute('aria-valuenow', km);
      onChange(km);
    }
    if (scroll) strip.scrollLeft = toX(km);
  }

  // Only a scroll the user makes (touch, trackpad, and the momentum after it) changes the distance.
  // Scrolls from layout — the ruler hidden behind the search, a redraw, Safari's toolbars — would
  // otherwise read as "1 km" and are put back on the current value instead.
  let userUntil = 0;
  const byUser = () => (userUntil = Date.now() + 1200);
  for (const type of ['touchstart', 'touchmove', 'pointerdown', 'wheel']) strip.addEventListener(type, byUser, { passive: true });

  let settle;
  strip.addEventListener('scroll', () => {
    if (!strip.clientWidth || !strip.isConnected) return;
    if (Date.now() > userUntil) {
      if (Math.abs(strip.scrollLeft - toX(current)) > STEP_PX / 2) strip.scrollLeft = toX(current);
      return;
    }
    userUntil = Math.max(userUntil, Date.now() + 250); // momentum keeps counting as the user's
    const v = fromX(strip.scrollLeft);
    clearTimeout(settle);
    settle = setTimeout(() => strip.scrollTo({ left: toX(v), behavior: 'smooth' }), 120); // snap to the step
    set(v);
  });
  strip.addEventListener('keydown', (e) => {
    const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    set(Math.min(max, Math.max(min, current + dir * step)), { scroll: true });
  });

  // Draw whenever the strip gets a (new) width: once it is in the document, and after a rotation.
  let drawnWidth = -1;
  const redrawOnResize = () => {
    if (strip.clientWidth && strip.clientWidth !== drawnWidth) {
      drawnWidth = strip.clientWidth;
      draw();
    }
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(redrawOnResize).observe(strip);
  requestAnimationFrame(redrawOnResize);
  wrap.redraw = draw;
  wrap.setValue = (km) => set(km, { scroll: true });
  wrap.setValueText = (t) => strip.setAttribute('aria-valuetext', t);
  return wrap;
}
