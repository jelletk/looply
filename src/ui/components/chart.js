import { svg } from '../dom.js';
import { formatKm, formatShortDistance } from '../../core/index.js';
import { clockTime } from '../../core/advice.js';

const W = 362;
const H = 64;
const T = 16; // room above the plot for the max label and the sunset pill
const MIN = 60 * 1000;

const text = (x, y, content, extra = {}) =>
  svg('text', { x, y, fill: 'var(--ink-2)', 'font-size': 12, 'font-weight': 600, 'font-family': 'var(--font-rounded)', ...extra }, content);

/**
 * "Afstand tot huis onderweg": distance from the start along the route. Labels never sit on the
 * filled area. Close to home: houses where the route passes the start and a dashed line at the
 * promised reach. Sunset during the loop: a dashed marker, and the part after it is darker.
 */
export function homeChart({ profile, distanceKm, near, guideKm, durationMin, now, sun }) {
  const total = profile.totalKm || 1; // x positions follow the drawn path
  const km = (at) => (at / total) * (distanceKm ?? total); // labels use the route's own length
  const maxD = Math.max(profile.farKm, near && guideKm ? guideKm * 1.1 : 0, 0.2);
  const x = (at) => (at / total) * W;
  const y = (d) => T + H - (d / maxD) * (H - 4);
  const line = profile.points.map((p) => `${x(p.atKm).toFixed(1)},${y(p.dKm).toFixed(1)}`).join(' L');
  const area = `M0,${T + H} L${line} L${W},${T + H} Z`;

  const sunsetIn = sun.set != null ? sun.set - now : null;
  const sunsetX = sunsetIn != null && sunsetIn > 0 && sunsetIn < durationMin * MIN ? (sunsetIn / (durationMin * MIN)) * W : null;
  const id = 'c' + Math.random().toString(36).slice(2, 8);

  const house = (hx) => svg('path', { d: `M${hx - 6} ${T + H - 7} l6 -5 6 5 v6 h-12 z`, fill: 'var(--ink)' });
  const zeros = near ? middleZeros(profile) : [];

  const children = [
    svg(
      'defs',
      {},
      svg('clipPath', { id: id + 'b' }, svg('rect', { x: 0, y: -10, width: sunsetX ?? W, height: T + H + 10 })),
      svg('clipPath', { id: id + 'a' }, svg('rect', { x: sunsetX ?? W, y: -10, width: W, height: T + H + 10 }))
    ),
    svg('path', { d: area, fill: 'var(--chart-fill)', 'clip-path': `url(#${id}b)` }),
    svg('path', { d: area, fill: 'var(--chart-fill-dark)', 'clip-path': `url(#${id}a)` }),
    svg('path', { d: `M${line}`, fill: 'none', stroke: 'var(--route-line)', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    svg('line', { x1: 0, y1: T + H, x2: W, y2: T + H, stroke: 'var(--chart-axis)' }),
    text(0, T - 4, formatShortDistance(profile.farKm)),
  ];

  if (near && guideKm && guideKm < maxD) {
    const gy = y(guideKm);
    children.push(
      svg('line', { x1: 0, x2: W, y1: gy, y2: gy, stroke: 'var(--chart-guide)', 'stroke-dasharray': '2 3' }),
      text(W, gy - 4, formatShortDistance(guideKm), { 'text-anchor': 'end', 'font-size': 11 })
    );
  }
  if (sunsetX != null) {
    const px = Math.min(W - 29, Math.max(29, sunsetX));
    children.push(
      svg('line', { x1: sunsetX, x2: sunsetX, y1: T - 2, y2: T + H, stroke: 'var(--warn)', 'stroke-width': 2, 'stroke-dasharray': '3 3' }),
      svg('rect', { x: px - 29, y: -4, width: 58, height: 18, rx: 9, fill: 'var(--warn)' }),
      text(px, 9, `☀︎↓ ${clockTime(sun.set)}`, { 'text-anchor': 'middle', fill: 'var(--warn-ink)', 'font-size': 11, 'font-weight': 700 })
    );
  }
  children.push(house(6), ...zeros.map((z) => house(x(z.atKm))), house(W - 6));
  children.push(
    text(0, T + H + 16, 'start'),
    text(W / 2, T + H + 16, near ? 'thuis' : formatKm(km(total / 2)), { 'text-anchor': 'middle' }),
    text(W, T + H + 16, `thuis · ${formatKm(km(total))}`, { 'text-anchor': 'end' })
  );

  const words = [
    `Afstand tot huis onderweg. Verst weg ${formatShortDistance(profile.farKm)}, na ${formatKm(km(profile.farAtKm))}.`,
    near ? 'Halverwege kom je langs je startpunt.' : '',
    `Laatste kilometer binnen ${formatShortDistance(profile.lastKmFarKm)} van huis.`,
    sunsetX != null ? `De zon gaat onder na ${formatKm(km((sunsetX / W) * total))}.` : '',
  ].filter(Boolean);

  return svg('svg', { viewBox: `0 -4 ${W} ${T + H + 22}`, role: 'img', 'aria-label': words.join(' ') }, children);
}

/** Where a two-loop route passes the start between its loops (closest point near halfway). */
function middleZeros(profile) {
  const half = profile.totalKm / 2;
  const candidates = profile.points.filter((p) => Math.abs(p.atKm - half) < profile.totalKm * 0.25);
  if (candidates.length === 0) return [];
  const best = candidates.reduce((a, b) => (b.dKm < a.dKm ? b : a));
  return best.dKm < 0.1 ? [best] : [];
}
