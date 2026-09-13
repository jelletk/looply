// Loop route generator: geometric candidates around the start, measured by a Directions provider.

import {
  destinationPoint,
  routeOverlap,
  normalizeBearing,
  haversineKm,
  bearingDeg as bearingBetween,
  selfOverlapFraction,
  findSpurs,
} from './geo.js';
import { estimateDurationMin, formatKm } from './pace.js';

const COMPASS = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
const MIN_ROUTES = 5;
const MAX_PASSES = 3;
const CONCURRENCY = 2;
const FATAL_CODES = new Set(['REQUEST_DENIED', 'OVER_QUERY_LIMIT']);
const NUDGE_MIN_KM = 0.06; // repaired waypoint sits 60–120 m past the spur base along the loop
const NUDGE_MAX_KM = 0.12;
const MERGE_KM = 0.15; // a repaired waypoint this close to another one is dropped instead

/** Dutch compass label for a bearing: N, NO, O, ZO, Z, ZW, W, NW. */
export function compassLabel(bearing) {
  const idx = Math.round(normalizeBearing(bearing) / 45) % 8;
  return COMPASS[idx];
}

/** Absolute distance tolerance per mode: walk/run ±0.3 km, bike ±1.0 km. */
export function defaultToleranceKm(mode) {
  return mode === 'bike' ? 1.0 : 0.3;
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

/** Point on `path` between 60 and 120 m past index `from`, walking forward; prefers a real vertex. */
function nudgeAlongPath(path, from) {
  let travelled = 0;
  for (let k = from + 1; k < path.length; k++) {
    const seg = haversineKm(path[k - 1], path[k]);
    if (travelled + seg >= NUDGE_MIN_KM) {
      if (travelled + seg <= NUDGE_MAX_KM) return path[k];
      const t = ((NUDGE_MIN_KM + NUDGE_MAX_KM) / 2 - travelled) / seg;
      const a = path[k - 1];
      const b = path[k];
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    }
    travelled += seg;
  }
  return path[Math.min(from, path.length - 1)];
}

/**
 * Move the waypoint nearest to each spur tip onto the road just past the spur base.
 * Returns { waypoints, pinned } or null when nothing could be changed.
 */
function repairWaypoints({ waypoints, pinned, path, spurs }) {
  const wps = waypoints.map((p) => ({ ...p }));
  const pins = pinned.slice();
  const touched = new Set();
  let changed = false;

  for (const spur of spurs) {
    const tip = path[spur.tipIndex];
    let nearest = -1;
    let nearestKm = Infinity;
    wps.forEach((wp, i) => {
      if (touched.has(i)) return;
      const d = haversineKm(wp, tip);
      if (d < nearestKm) {
        nearestKm = d;
        nearest = i;
      }
    });
    if (nearest < 0) continue;
    touched.add(nearest);
    wps[nearest] = nudgeAlongPath(path, spur.endIndex ?? spur.baseIndex);
    pins[nearest] = true;
    changed = true;
  }
  if (!changed) return null;

  // Drop repaired waypoints that now (nearly) coincide with another one, keeping ≥ 2.
  for (let i = wps.length - 1; i >= 0 && wps.length > 2; i--) {
    if (!touched.has(i)) continue;
    const tooClose = wps.some((other, j) => j !== i && haversineKm(other, wps[i]) < MERGE_KM);
    if (tooClose) {
      wps.splice(i, 1);
      pins.splice(i, 1);
    }
  }
  return { waypoints: wps, pinned: pins };
}

/** Scale the unpinned waypoints radially around `start`; pinned (repaired) ones stay on their road. */
function scaleWaypoints({ start, waypoints, pinned, factor }) {
  return waypoints.map((wp, i) => {
    if (pinned[i]) return wp;
    return destinationPoint(start, bearingBetween(start, wp), haversineKm(start, wp) * factor);
  });
}

/**
 * Generate loop routes. Resolves to Route[] sorted by |distanceKm − target|, deduped by
 * routeOverlap > 0.6. Every returned route is within `toleranceKm` of the target (absolute;
 * defaults per mode via defaultToleranceKm) and has a self-overlap ≤ `maxSelfOverlap`, i.e. no
 * out-and-back spurs. Throws only on REQUEST_DENIED / OVER_QUERY_LIMIT or when no route
 * at all could be produced.
 */
export async function generateRoutes({
  start,
  distanceKm,
  mode = 'walk',
  provider,
  count = 6,
  toleranceKm, // absolute; replaces the former relative `tolerance` option, which is now ignored
  maxAttemptsPerRoute = 4,
  maxSelfOverlap = 0.06,
  maxRepairs = 2,
  repairSpurKm = 0.15,
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
  const tolKm = Number.isFinite(toleranceKm) && toleranceKm > 0 ? toleranceKm : defaultToleranceKm(mode);
  const maxScaling = Math.max(1, maxAttemptsPerRoute);

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

  const buildAt = (candidate, scale) =>
    buildLoopWaypoints({
      start,
      distanceKm: target * scale,
      bearingDeg: candidate.bearingDeg,
      pointCount: candidate.pointCount,
      rng: replayRng(candidate.jitter),
    });

  async function measureCandidate(candidate) {
    let scale = 1;
    let waypoints = buildAt(candidate, scale);
    let pinned = waypoints.map(() => false);
    let scalings = 0;
    let repairs = 0;
    let best = null; // clean and within tolerance

    for (;;) {
      let result;
      try {
        result = await provider.route({ start, waypoints, mode });
      } catch (e) {
        if (e && FATAL_CODES.has(e.code)) throw e;
        break; // ZERO_RESULTS / UNKNOWN: give up on this candidate
      }
      if (!result || !Number.isFinite(result.distanceKm) || result.distanceKm <= 0) break;

      const path = result.path || [];
      const errorKm = Math.abs(result.distanceKm - target);
      const fits = errorKm <= tolKm;
      const overlap = selfOverlapFraction(path);
      const clean = overlap <= maxSelfOverlap;
      const spurs = findSpurs(path).filter((s) => s.lengthKm >= repairSpurKm);
      if (clean && fits && (!best || errorKm < best.errorKm)) {
        best = { errorKm, overlap, waypoints, distanceKm: result.distanceKm, path };
      }

      if (clean && fits && spurs.length === 0) break; // accepted as-is

      if ((!clean || spurs.length > 0) && repairs < maxRepairs && spurs.length > 0) {
        const repaired = repairWaypoints({ waypoints, pinned, path, spurs });
        if (repaired) {
          waypoints = repaired.waypoints;
          pinned = repaired.pinned;
          repairs++;
          continue;
        }
      }
      if (!clean) break; // out-and-back that we could not repair: discard
      if (fits) break; // clean, within tolerance, remaining spur is below maxSelfOverlap

      scalings++;
      if (scalings >= maxScaling) break;
      const factor = target / result.distanceKm;
      scale *= factor;
      waypoints = pinned.some(Boolean)
        ? scaleWaypoints({ start, waypoints, pinned, factor })
        : buildAt(candidate, scale);
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
  let attempts = [];
  let survivors = [];
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    if (pass > 0) total += n;
    const offset = (180 / n) * pass;
    const pointCount = pass % 2 === 0 ? 3 : 4;
    attempts = attempts.concat(await runPass(makeCandidates(offset, pointCount)));
    survivors = finalize(attempts);
    if (survivors.length >= MIN_ROUTES) break;
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

/** Sort by closeness, dedupe by path overlap (> 0.6). */
function finalize(attempts) {
  const kept = [];
  const sorted = attempts.slice().sort((a, b) => a.errorKm - b.errorKm);
  for (const candidate of sorted) {
    const duplicate = kept.some((k) => routeOverlap(k.path, candidate.path) > 0.6);
    if (!duplicate) kept.push(candidate);
  }
  return kept;
}
