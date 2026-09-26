// The sky behind the app: phase on <html>, a soft crossfade when it changes, and the stars.

import { skyPhase } from '../core/sun.js';

const THEME = { dawn: '#26336b', day: '#7ab7ee', dusk: '#18224f', night: '#050a1f' };

export function createSky(root = document.body) {
  const sky = document.createElement('div');
  sky.className = 'sky';
  sky.setAttribute('aria-hidden', 'true');
  const stars = document.createElement('canvas');
  stars.className = 'stars';
  stars.setAttribute('aria-hidden', 'true');
  root.prepend(sky, stars);
  drawStars(stars);
  addEventListener('resize', () => drawStars(stars));

  let phase = null;

  /** Set the phase for `now` and `sun`; returns the phase. Crossfades when it changes. */
  function update(now, sun) {
    const next = skyPhase(now, sun);
    if (next === phase) return phase;
    const html = document.documentElement;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (phase && !reduce) {
      // Freeze the old sky on a copy on top, then fade that copy out over the new one.
      const old = sky.cloneNode();
      old.style.background = getComputedStyle(sky).background;
      old.classList.add('sky--leaving');
      sky.after(old);
      requestAnimationFrame(() => requestAnimationFrame(() => (old.style.opacity = '0')));
      setTimeout(() => old.remove(), 1000);
    }
    html.dataset.phase = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME[next]);
    phase = next;
    return phase;
  }

  return { update, get phase() { return phase; } };
}

function drawStars(canvas) {
  const dpr = devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  const g = canvas.getContext?.('2d');
  if (!g) return;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`;
    g.beginPath();
    g.arc(rnd() * canvas.width, rnd() * canvas.height * 0.6, (0.4 + rnd() * 1.1) * dpr, 0, 7);
    g.fill();
  }
}
