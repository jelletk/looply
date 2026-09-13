// Loop route generator: geometric candidates around the start, measured by a Directions provider.

import { destinationPoint, routeOverlap, normalizeBearing } from './geo.js';
import { estimateDurationMin, formatKm } from './pace.js';

const COMPASS = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
const MIN_ROUTES = 5;
const CONCURRENCY = 2;
const FATAL_CODES = new Set(['REQUEST_DENIED', 'OVER_QUERY_LIMIT']);

/** Dutch compass label for a bearing: N, NO, O, ZO, Z, ZW, W, NW. */
export function compassLabel(bearing) {
  const idx = Math.round(normalizeBearing(bearing) / 45) % 8;
  return COMPASS[idx];
}

function clampInt(n, lo, hi) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

/** rng value in [-1, 1). */
function signed(rng) {
  return rng() * 2 - 1;
}

/**
 * Pure: waypoints for a loop of roughly `distanceKm` that passes through `start`.
 * The circle centre lies at distance r from start along `bearingDeg`; `pointCount` (2–4)
 * points are spread evenly around the centre, skipping the angle that points back at start.
 * r starts from distanceKm / 2π (circle perimeter = target) and is corrected so the
 * inscribed polygon start → points → start has perimeter ≈ target.
 * Jitter: ±10% radius, ±10° angle.
 */
export function buildLoopWaypoints({ start, distanceKm, bearingDeg, pointCount = 3, rng = Math.random }) {
  const n = clampInt(pointCount, 2, 4);
  const bearing = normalizeBearing(bearingDeg);
  const sides = n + 1;
  // Regular polygon with `sides` vertices on a circle of radius r has perimeter 2·sides·r·sin(π/sides).
  const radius = distanceKm / (2 * sides * Math.sin(Math.PI / sides));
  const centre = destinationPoint(start, bearing, radius);

  const backToStart = bearing + 180;
  const step = 360 / (n + 1);
  // Alternate direction per 45° sector so neighbouring bearings differ in shape.
  const direction = Math.floor(bearing / 45) % 2 === 0 ? 1 : -1;

  const waypoints = [];
  for (let k = 1; k <= n; k++) {
    const angle = backToStart + direction * step * k + signed(rng) * 10;
    const r = radius * (1 + signed(rng) * 0.1);
    waypoints.push(destinationPoint(centre, normalizeBearing(angle), r));
  }
  return waypoints;
}

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Replay a fixed list of rng draws so every retry of a candidate keeps the same jitter. */
function replayRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, lane);
  await Promise.all(lanes);
  return results;
}

/**
 * Generate loop routes. Resolves to Route[] sorted by |distanceKm − target|, deduped by
 * routeOverlap > 0.6. Throws only on REQUEST_DENIED / OVER_QUERY_LIMIT or when no route
 * at all could be produced.
 */
export async function generateRoutes({
  start,
  distanceKm,
  mode = 'walk',
  provider,
  count = 6,
  tolerance = 0.08,
  maxAttemptsPerRoute = 3,
  rng = Math.random,
  onProgress,
}) {
  if (!provider || typeof provider.route !== 'function') {
    throw new Error('generateRoutes: provider.route is required');
  }
  if (!start || !Number.isFinite(start.lat) || !Number.isFinite(start.lng)) {
    throw new Error('generateRoutes: start must be a LatLng');
  }
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    throw new Error('generateRoutes: distanceKm must be > 0');
  }
  const target = distanceKm;
  const n = Math.max(1, Math.round(count));

  let done = 0;
  let total = n;
  const progress = () => {
    if (typeof onProgress === 'function') onProgress({ done, total });
  };

  const makeCandidates = (offsetDeg, pointCount) =>
    Array.from({ length: n }, (_, i) => ({
      bearingDeg: normalizeBearing((i * 360) / n + offsetDeg + signed(rng) * (360 / n) * 0.25),
      pointCount,
      jitter: Array.from({ length: 8 }, () => rng()),
    }));

  async function measureCandidate(candidate) {
    let scale = 1;
    let best = null;
    for (let attempt = 0; attempt < Math.max(1, maxAttemptsPerRoute); attempt++) {
      const waypoints = buildLoopWaypoints({
        start,
        distanceKm: target * scale,
        bearingDeg: candidate.bearingDeg,
        pointCount: candidate.pointCount,
        rng: replayRng(candidate.jitter),
      });

      let result;
      try {
        result = await provider.route({ start, waypoints, mode });
      } catch (e) {
        if (e && FATAL_CODES.has(e.code)) throw e;
        break; // ZERO_RESULTS / UNKNOWN: give up on this candidate
      }
      if (!result || !Number.isFinite(result.distanceKm) || result.distanceKm <= 0) break;

      const error = Math.abs(result.distanceKm - target) / target;
      if (!best || error < best.error) {
        best = { error, waypoints, distanceKm: result.distanceKm, path: result.path || [] };
      }
      if (error <= tolerance) break;
      scale *= target / result.distanceKm;
    }
    done++;
    progress();
    return best ? { ...best, bearingDeg: candidate.bearingDeg } : null;
  }

  const runPass = async (candidates) => {
    const measured = await runPool(candidates, measureCandidate, CONCURRENCY);
    return measured.filter(Boolean);
  };

  progress();
  let attempts = await runPass(makeCandidates(0, 3));
  let survivors = finalize(attempts, target, tolerance);

  if (survivors.length < MIN_ROUTES) {
    total += n;
    const second = await runPass(makeCandidates(180 / n, 4));
    attempts = attempts.concat(second);
    survivors = finalize(attempts, target, tolerance);
  }

  if (survivors.length === 0) {
    const err = new Error('Geen routes gevonden voor dit startpunt en deze afstand');
    err.code = 'NO_ROUTES';
    throw err;
  }

  const createdAt = new Date().toISOString();
  return survivors.map((s) => ({
    id: newId(),
    name: `Rondje ${compassLabel(s.bearingDeg)} · ${formatKm(s.distanceKm)}`,
    mode,
    start: { lat: start.lat, lng: start.lng },
    waypoints: s.waypoints,
    distanceKm: s.distanceKm,
    durationMin: estimateDurationMin(s.distanceKm, mode),
    path: s.path,
    bearingDeg: s.bearingDeg,
    createdAt,
  }));
}

/** Filter to 1.5× tolerance, sort by closeness, dedupe by path overlap (> 0.6). */
function finalize(attempts, target, tolerance) {
  const kept = [];
  const sorted = attempts
    .filter((a) => a.error <= tolerance * 1.5)
    .sort((a, b) => a.error - b.error);
  for (const candidate of sorted) {
    const duplicate = kept.some((k) => routeOverlap(k.path, candidate.path) > 0.6);
    if (!duplicate) kept.push(candidate);
  }
  return kept;
}
