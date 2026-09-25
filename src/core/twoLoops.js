// "Close to home": a route made of two loops of half the distance that meet at the start.
// A single loop through the start always reaches at least distance / π away (a circle); two
// half loops halve that, and the walk passes the start halfway — a natural point to stop.

import { generateRoutes, compassLabel, defaultToleranceKm } from './generator.js';
import { routeOverlap, haversineKm } from './geo.js';
import { estimateDurationMin, formatKm } from './pace.js';

const HALF_TOLERANCE_FACTOR = 0.75; // each half a little tighter, so pairs still sum to within tolerance
const MAX_PAIR_OVERLAP = 0.5; // two halves that share more road than this feel like the same loop twice
const MAX_USES_PER_LOOP = 2; // one good half may appear in at most two pairs
const MAX_PAIRS = 8;
const MAPS_POINTS_PER_LOOP = 4; // 4 + start + 4 = 9, the most a Google Maps link carries

/** Farthest point of `path` from `start`, in km. */
export function maxDistanceFromStartKm(path, start) {
  let max = 0;
  for (const p of path) max = Math.max(max, haversineKm(start, p));
  return max;
}

/** `count` points spread evenly over `points` (all of them when there are no more). */
export function spreadPick(points, count) {
  if (points.length <= count) return points.slice();
  return Array.from({ length: count }, (_, i) => points[Math.floor(((i + 0.5) * points.length) / count)]);
}

/**
 * Pair half-distance loops into two-loop routes: sum within `toleranceKm` of `distanceKm`, the two
 * halves on different streets. Pairs of fresh halves (not on streets to avoid) come first, then
 * least shared road, then closest to the target.
 */
export function pairLoops(loops, distanceKm, toleranceKm) {
  const pairs = [];
  for (let i = 0; i < loops.length; i++) {
    for (let j = i + 1; j < loops.length; j++) {
      const a = loops[i];
      const b = loops[j];
      const errorKm = Math.abs(a.distanceKm + b.distanceKm - distanceKm);
      if (errorKm > toleranceKm) continue;
      const overlap = routeOverlap(a.path, b.path);
      if (overlap > MAX_PAIR_OVERLAP) continue;
      pairs.push({ a, b, errorKm, overlap, fresh: (a.fresh !== false) + (b.fresh !== false) });
    }
  }
  pairs.sort((x, y) => y.fresh - x.fresh || x.overlap - y.overlap || x.errorKm - y.errorKm);

  const uses = new Map();
  const chosen = [];
  for (const pair of pairs) {
    if (chosen.length >= MAX_PAIRS) break;
    if ((uses.get(pair.a) || 0) >= MAX_USES_PER_LOOP || (uses.get(pair.b) || 0) >= MAX_USES_PER_LOOP) continue;
    uses.set(pair.a, (uses.get(pair.a) || 0) + 1);
    uses.set(pair.b, (uses.get(pair.b) || 0) + 1);
    chosen.push(pair);
  }
  return chosen;
}

/** Same options and result shape as generateRoutes; routes carry `loops: 2` and `maxFromStartKm`. */
export async function generateTwoLoopRoutes(options) {
  const { start, distanceKm, mode = 'walk' } = options;
  const toleranceKm = options.toleranceKm ?? defaultToleranceKm(mode);
  const halves = await generateRoutes({
    ...options,
    distanceKm: distanceKm / 2,
    toleranceKm: toleranceKm * HALF_TOLERANCE_FACTOR,
  });
  const fresh = new Set(halves.filter((h) => h.fresh !== false));

  const pairs = pairLoops(halves, distanceKm, toleranceKm);
  if (pairs.length === 0) {
    const err = new Error('Geen twee rondjes gevonden die samen deze afstand halen');
    err.code = 'NO_ROUTES';
    throw err;
  }

  return pairs.map(({ a, b }) => {
    const total = a.distanceKm + b.distanceKm;
    const path = [...a.path, ...b.path.slice(1)];
    return {
      id: a.id + '+' + b.id,
      name: `${compassLabel(a.bearingDeg)} + ${compassLabel(b.bearingDeg)} · ${formatKm(total)}`, // the thumbnail shows the two loops
      mode,
      start: { lat: start.lat, lng: start.lng },
      // Via the start between the loops, so Google Maps also brings you past home halfway.
      waypoints: [
        ...spreadPick(a.waypoints, MAPS_POINTS_PER_LOOP),
        { lat: start.lat, lng: start.lng },
        ...spreadPick(b.waypoints, MAPS_POINTS_PER_LOOP),
      ],
      distanceKm: total,
      durationMin: estimateDurationMin(total, mode),
      path,
      bearingDeg: a.bearingDeg,
      loops: 2,
      maxFromStartKm: maxDistanceFromStartKm(path, start),
      fresh: fresh.has(a) && fresh.has(b),
      createdAt: a.createdAt,
    };
  });
}
