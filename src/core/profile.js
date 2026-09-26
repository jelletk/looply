// "Afstand tot huis onderweg": how far from the start you are at every point of a route,
// and the words used to name a route.

import { haversineKm, normalizeBearing } from './geo.js';

/**
 * Distance to the start along the route, thinned to about `maxPoints` points (the farthest point is
 * always kept). → { points: [{ atKm, dKm }], totalKm, farKm, farAtKm, lastKmFarKm }
 */
export function homeProfile(path, start, maxPoints = 160) {
  if (!Array.isArray(path) || path.length === 0 || !start) {
    return { points: [], totalKm: 0, farKm: 0, farAtKm: 0, lastKmFarKm: 0 };
  }
  const all = [];
  let at = 0;
  path.forEach((p, i) => {
    if (i) at += haversineKm(path[i - 1], p);
    all.push({ atKm: at, dKm: haversineKm(start, p) });
  });
  const totalKm = at;
  const far = all.reduce((best, p) => (p.dKm > best.dKm ? p : best), all[0]);
  const lastKmFarKm = all.filter((p) => p.atKm >= totalKm - 1).reduce((m, p) => Math.max(m, p.dKm), 0);

  const step = totalKm / maxPoints;
  const points = [];
  let next = 0;
  for (const p of all) {
    if (p.atKm >= next || p === far || p === all[all.length - 1]) {
      points.push(p);
      next = p.atKm + step;
    }
  }
  return { points, totalKm, farKm: far.dKm, farAtKm: far.atKm, lastKmFarKm };
}

const WIND = ['noord', 'noordoost', 'oost', 'zuidoost', 'zuid', 'zuidwest', 'west', 'noordwest'];

/** "zuidwest" for a bearing in degrees. */
export function windWord(bearing) {
  return WIND[Math.round(normalizeBearing(bearing) / 45) % 8];
}

/** Poster title: "De zuidwestlus", or "Twee lussen zuidwest" for a close-to-home route. */
export function routeTitle(route) {
  const wind = Number.isFinite(route?.bearingDeg) ? windWord(route.bearingDeg) : null;
  if (route?.loops === 2) return wind ? `Twee lussen ${wind}` : 'Twee lussen';
  return wind ? `De ${wind}lus` : route?.name || 'Rondje';
}
