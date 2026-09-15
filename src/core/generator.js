// Loop route generator: geometric candidates around the start, measured by a Directions provider.

import {
  destinationPoint,
  routeOverlap,
  normalizeBearing,
  haversineKm,
  bearingDeg as bearingBetween,
  selfOverlapFraction,
  findSpurs,
  spurCellKm,
  trimStartStem,
  pathLengthKm,
  densifyPath,
} from './geo.js';
import { estimateDurationMin, formatKm } from './pace.js';

const COMPASS = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
const MIN_ROUTES = 5;
const MAX_PASSES = 6; // the call budget usually ends the search earlier
const MIN_CANDIDATES_PER_PASS = 8;
const CONCURRENCY = 3;
const FATAL_CODES = new Set(['REQUEST_DENIED', 'OVER_QUERY_LIMIT']);
// Waypoints per pass. Two-point triangles never produced a clean loop in real tests, so they are
// gone; 4–5 points keep the legs short, which keeps the provider close to the intended circle.
const POINT_COUNTS_SHORT = [3, 4, 3, 4]; // < 3 km: ellipses on the odd passes
const POINT_COUNTS_MID = [4, 5, 3, 5]; // 3–10 km
const POINT_COUNTS_LONG = [3, 4, 5, 3]; // > 10 km
const SHORT_LOOP_KM = 3; // below this: ellipse family on odd passes, looser dedupe
const LONG_LOOP_KM = 10;
const ELLIPSE_ASPECT = 0.6;
const SPUR_FLOOR_KM = 0.03; // tolerated total one-way spur length: max(30 m, 1 % of the route)
const SPUR_FRACTION = 0.01;
const MAX_STEM_FRACTION = 0.3; // a start stem longer than this share of the route is an out-and-back
const STEM_MARGIN_KM = 0.15; // a stem may exceed the shortest stem seen for this start by max(150 m, 5 %)
const STEM_MARGIN_FRACTION = 0.05;
const MIN_POLISH_FRACTION = 0.6; // no polish when the loop left after cutting the spurs is shorter than this × target
const HOPELESS_SPUR_FRACTION = 0.3; // more doubled road than this share of the route: the direction is a dead end, discard
const SCALE_STEP_MIN = 0.6; // one scaling step never changes the loop by more than ×0.6–1.6 (damps oscillation)
const SCALE_STEP_MAX = 1.6;
const NEAR_CLEAN_SPUR_KM = 0.3; // a candidate with less doubled road than this marks a promising direction
const EXPLOIT_JITTER_DEG = 25;
const FILL_MAX_OVERLAP = 0.9; // when short of 5, near-identical routes are still never added
const CACHE_CELL_KM = 0.02; // requests whose points all round to the same 20 m cell are the same request
const POLISH_SHRINK_PRIOR = 0.95; // an unscaled polish comes back a little shorter than its loop
const SHRINK_MIN = 0.85;
const SHRINK_MAX = 1.0;
const CLOSE_FACTOR = 2; // a clean loop within 2 × tolerance (or a fitting one with a small spur) earns one extra attempt

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

/** Local flat offset (x east, y north, km) → LatLng. */
function offsetPoint(origin, x, y) {
  const d = Math.hypot(x, y);
  if (d === 0) return { lat: origin.lat, lng: origin.lng };
  return destinationPoint(origin, normalizeBearing((Math.atan2(x, y) * 180) / Math.PI), d);
}

/**
 * Pure: waypoints for a loop of roughly `distanceKm` that passes through `start`.
 * shape 'circle' (default): the circle centre lies at distance r from start along `bearingDeg`;
 * `pointCount` (2–6) points are spread evenly around the centre, skipping the angle that points
 * back at start. r is chosen so the inscribed polygon start → points → start has perimeter ≈ target.
 * shape 'ellipse': same idea on an ellipse with aspect ratio `aspect` (minor/major) whose major
 * axis points along `orientationDeg` (random via rng when omitted) — reaches different streets
 * than a circle in a dense grid. Jitter: ±10% radius, ±10° angle.
 */
export function buildLoopWaypoints({
  start,
  distanceKm,
  bearingDeg,
  pointCount = 3,
  rng = Math.random,
  shape = 'circle',
  aspect = ELLIPSE_ASPECT,
  orientationDeg,
}) {
  const n = clampInt(pointCount, 2, 6);
  const bearing = normalizeBearing(bearingDeg);
  const sides = n + 1;
  const step = 360 / sides;
  // Alternate direction per 45° sector so neighbouring bearings differ in shape.
  const direction = Math.floor(bearing / 45) % 2 === 0 ? 1 : -1;

  if (shape !== 'ellipse') {
    // Regular polygon with `sides` vertices on a circle of radius r has perimeter 2·sides·r·sin(π/sides).
    const radius = distanceKm / (2 * sides * Math.sin(Math.PI / sides));
    const centre = destinationPoint(start, bearing, radius);
    const backToStart = bearing + 180;
    const waypoints = [];
    for (let k = 1; k <= n; k++) {
      const angle = backToStart + direction * step * k + signed(rng) * 10;
      const r = radius * (1 + signed(rng) * 0.1);
      waypoints.push(destinationPoint(centre, normalizeBearing(angle), r));
    }
    return waypoints;
  }

  // Ellipse in a local frame: E(θ) = (a cos θ, b sin θ) along the major axis (math angle φ).
  const b = Math.max(0.2, Math.min(1, aspect));
  const orient = Number.isFinite(orientationDeg) ? orientationDeg : rng() * 180;
  const phi = ((90 - orient) * Math.PI) / 180; // compass → math angle of the major axis
  const psi = ((90 - bearing) * Math.PI) / 180 - phi; // wanted direction start → centre, in ellipse frame
  // Start sits on the ellipse at θ0 where the vector to the centre (−a cos θ0, −b sin θ0) points along ψ.
  const theta0 = Math.atan2(-Math.sin(psi) / b, -Math.cos(psi));
  const unit = (theta) => {
    const ex = Math.cos(theta);
    const ey = b * Math.sin(theta);
    return { x: ex * Math.cos(phi) - ey * Math.sin(phi), y: ex * Math.sin(phi) + ey * Math.cos(phi) };
  };
  const thetas = [];
  const jitterAngle = [];
  const jitterRadius = [];
  for (let k = 1; k <= n; k++) {
    thetas.push(theta0 + ((direction * step * k) * Math.PI) / 180);
    jitterAngle.push((signed(rng) * 10 * Math.PI) / 180);
    jitterRadius.push(1 + signed(rng) * 0.1);
  }
  // Perimeter of the polygon start → points → start for a = 1, then scale a to hit the target.
  const p0 = unit(theta0);
  let perimeter = 0;
  let prev = p0;
  for (const theta of thetas) {
    const p = unit(theta);
    perimeter += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  perimeter += Math.hypot(p0.x - prev.x, p0.y - prev.y);
  const a = distanceKm / perimeter;

  return thetas.map((theta, i) => {
    const p = unit(theta + jitterAngle[i]);
    const x = (p.x - p0.x) * a * jitterRadius[i];
    const y = (p.y - p0.y) * a * jitterRadius[i];
    return offsetPoint(start, x, y);
  });
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
 * Key that identifies a provider request up to ~20 m: mode, start and every waypoint (with its
 * via flag) snapped to a 20 m grid. Two requests with the same key would get the same answer.
 */
export function requestKey({ start, waypoints = [], mode }) {
  const kmPerDegLat = (Math.PI / 180) * 6371.0088;
  const kmPerDegLng = kmPerDegLat * Math.cos((start.lat * Math.PI) / 180);
  const cell = (p) => `${Math.round((p.lng * kmPerDegLng) / CACHE_CELL_KM)}:${Math.round((p.lat * kmPerDegLat) / CACHE_CELL_KM)}`;
  return `${mode}|${cell(start)}|${waypoints.map((w) => cell(w) + (w.via ? 'v' : '')).join('|')}`;
}

/**
 * Wrap a provider so that identical requests (see requestKey) are sent once: a repeat, even
 * while the first is still in flight, shares the same result or error. `hits` counts the repeats.
 */
export function withRequestCache(provider) {
  const cache = new Map();
  const wrapped = {
    hits: 0,
    misses: 0,
    route(req) {
      const key = requestKey(req);
      let pending = cache.get(key);
      if (pending) {
        wrapped.hits++;
        return pending;
      }
      wrapped.misses++;
      pending = provider.route(req);
      cache.set(key, pending);
      return pending;
    },
  };
  return wrapped;
}

/** `path` with every spur cut out: the vertices strictly after each base up to its end are dropped. */
export function cutSpurs(path, spurs) {
  if (!spurs.length) return path.slice();
  const sorted = spurs.slice().sort((a, b) => a.baseIndex - b.baseIndex);
  const out = [];
  let skipUntil = -1;
  let s = 0;
  for (let k = 0; k < path.length; k++) {
    if (k <= skipUntil) continue;
    out.push(path[k]);
    while (s < sorted.length && sorted[s].baseIndex <= k) {
      if (sorted[s].baseIndex === k) skipUntil = Math.max(skipUntil, sorted[s].endIndex);
      s++;
    }
  }
  return out;
}

/**
 * Snap-to-route polish: `count` points at equal arc-length fractions along `path`
 * (k / (count + 1)), each snapped to the nearest real vertex so they sit on roads the provider
 * itself returned. Marked `via: true` (a pass-through, not a stopover).
 */
export function polishWaypoints(path, count) {
  const n = clampInt(count, 2, 8);
  if (!Array.isArray(path) || path.length < 2) return [];
  const cum = [0];
  for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + haversineKm(path[k - 1], path[k]));
  const total = cum[cum.length - 1];
  if (total <= 0) return [];
  const out = [];
  for (let k = 1; k <= n; k++) {
    const t = (total * k) / (n + 1);
    let best = 1;
    let bestErr = Infinity;
    for (let i = 1; i < path.length - 1; i++) {
      const err = Math.abs(cum[i] - t);
      if (err < bestErr) {
        bestErr = err;
        best = i;
      }
    }
    const p = path[best];
    if (out.some((q) => haversineKm(q, p) < 0.01)) continue;
    out.push({ lat: p.lat, lng: p.lng, via: true });
  }
  return out;
}

/** Arc-length weighted centroid of a path (mean of the path densified every 30 m). */
export function pathCentroid(path) {
  const pts = densifyPath(path, 0.03);
  let lat = 0;
  let lng = 0;
  for (const p of pts) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / pts.length, lng: lng / pts.length };
}

/**
 * Via points for a loop like `path` but `factor` times as large: points sampled along `path`
 * (see polishWaypoints) moved radially around `centre` (default: the path's centroid; the
 * generator uses the start, so the scaled loop still runs through it). With factor 1 they stay
 * on the roads the provider returned; otherwise the provider snaps them to the nearest road.
 */
export function scaledPolishWaypoints(path, count, factor, centre = pathCentroid(path)) {
  const via = polishWaypoints(path, count);
  if (Math.abs(factor - 1) < 1e-6) return via;
  return via.map((p) => {
    const d = haversineKm(centre, p);
    if (d === 0) return p;
    const q = destinationPoint(centre, bearingBetween(centre, p), d * factor);
    return { lat: q.lat, lng: q.lng, via: true };
  });
}

/**
 * Inspect a measured path: strip the start stem, then find spurs and self-overlap on the loop
 * proper. A candidate is clean when the total one-way spur length ≤ max(30 m, 1 % of the route),
 * the self-overlap is ≤ maxSelfOverlap and the stem is ≤ 30 % of the route.
 */
export function inspectPath(path, { maxSelfOverlap = 0.06, minStemKm = Infinity } = {}) {
  const routeKm = pathLengthKm(path);
  const { stemKm, core } = trimStartStem(path);
  const cellKm = spurCellKm(core);
  const spurs = findSpurs(core, cellKm);
  const spurKm = spurs.reduce((sum, s) => sum + s.lengthKm, 0);
  const overlap = selfOverlapFraction(core, cellKm);
  const allowedSpurKm = Math.max(SPUR_FLOOR_KM, routeKm * SPUR_FRACTION);
  const stemOk = stemKm <= routeKm * MAX_STEM_FRACTION && stemAllowed(stemKm, routeKm, minStemKm);
  return {
    core,
    stemKm,
    spurs,
    spurKm,
    overlap,
    allowedSpurKm,
    clean: spurKm <= allowedSpurKm && overlap <= maxSelfOverlap && stemOk,
  };
}

/** A stem is fine when it is not much longer than the shortest stem any candidate needed. */
function stemAllowed(stemKm, routeKm, minStemKm) {
  if (!Number.isFinite(minStemKm)) return true;
  return stemKm <= minStemKm + Math.max(STEM_MARGIN_KM, routeKm * STEM_MARGIN_FRACTION);
}

function pointCountsFor(target) {
  if (target <= SHORT_LOOP_KM) return POINT_COUNTS_SHORT;
  if (target <= LONG_LOOP_KM) return POINT_COUNTS_MID;
  return POINT_COUNTS_LONG;
}

/**
 * Generate loop routes. Resolves to Route[] sorted by |distanceKm − target|, deduped by path
 * overlap (> 0.6; > 0.7 for targets under 3 km). Every returned route is within `toleranceKm` of
 * the target (absolute; defaults per mode via defaultToleranceKm) and has no out-and-back spurs
 * beyond max(30 m, 1 % of its length) — only a start stem (a cul-de-sac the loop must leave and
 * re-enter) is allowed. At most `maxProviderCalls` provider requests are made; identical requests
 * are sent once. Throws only on REQUEST_DENIED / OVER_QUERY_LIMIT or when no route at all could
 * be produced. onProgress receives { done, total, calls }.
 *
 * Per candidate: at most `maxAttemptsPerRoute` requests. After the first one, a result whose loop
 * (spurs cut out) is at least 60 % of the target is re-requested with via points sampled along
 * that loop and scaled around the start towards the target ("polish", at most `maxRepairs`
 * times) — that repairs spurs and rescues clean loops that are merely too long or too short in
 * one call. Only when there is no usable loop is the geometric circle rescaled instead.
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
  maxRepairs = 4,
  maxProviderCalls = 60,
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
  const n = Math.max(MIN_CANDIDATES_PER_PASS, Math.round(count) || 0);
  const tolKm = Number.isFinite(toleranceKm) && toleranceKm > 0 ? toleranceKm : defaultToleranceKm(mode);
  const maxAttempts = Math.max(1, maxAttemptsPerRoute);
  const callCap = Math.max(1, Math.round(maxProviderCalls) || 0);
  const short = target <= SHORT_LOOP_KM;
  const dedupeThreshold = short ? 0.7 : 0.6;
  const pointCounts = pointCountsFor(target);
  const cached = withRequestCache(provider);

  let done = 0;
  let total = n;
  let calls = 0;
  let minStemKm = Infinity; // shortest start stem seen so far: the unavoidable one
  let ratioSum = 0; // measured road length / geometric polygon length, learned as we go
  let ratioCount = 0;
  let shrinkSum = 0; // unscaled polish length / its loop's length: via points let the provider shortcut
  let shrinkCount = 0;
  const polishShrink = () =>
    shrinkCount > 0 ? Math.max(SHRINK_MIN, Math.min(SHRINK_MAX, shrinkSum / shrinkCount)) : POLISH_SHRINK_PRIOR;
  const promising = []; // bearings whose loops were clean or nearly clean (spur < 300 m)
  const progress = () => {
    if (typeof onProgress === 'function') onProgress({ done, total, calls });
  };
  const debug = (msg) => {
    if (typeof console !== 'undefined' && typeof console.debug === 'function') console.debug(`[looply] ${msg}`);
  };

  /** 0, 4, 2, 6, 1, 5, 3, 7 … — bit-reversed order, so opposite directions are probed first. */
  const probeOrder = (count) => {
    const bits = Math.ceil(Math.log2(Math.max(2, count)));
    const order = [];
    for (let i = 0; i < 1 << bits; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      if (r < count) order.push(r);
    }
    return order;
  };

  /** Promising bearings grouped per 45° sector, most hits first: [{ bearing, hits }]. */
  const promisingSectors = () => {
    const sectors = new Map();
    for (const b of promising) {
      const s = Math.floor(normalizeBearing(b) / 45);
      const cur = sectors.get(s) || { sum: 0, hits: 0 };
      // Average around the sector centre so wrap-around at 360° cannot bite.
      cur.sum += normalizeBearing(b) - s * 45;
      cur.hits++;
      sectors.set(s, cur);
    }
    return [...sectors.entries()]
      .map(([s, v]) => ({ bearing: normalizeBearing(s * 45 + v.sum / v.hits), hits: v.hits }))
      .sort((a, b) => b.hits - a.hits);
  };

  const makeCandidates = (pass) => {
    const offset = (180 / n) * pass;
    const pointCount = pointCounts[pass % pointCounts.length];
    const shape = short && pass % 2 === 1 ? 'ellipse' : 'circle';
    const bearings = probeOrder(n).map((i) => normalizeBearing((i * 360) / n + offset + signed(rng) * (360 / n) * 0.25));
    // From the second pass on, most of the budget goes to directions that (nearly) worked:
    // up to 3/4 of the candidates, two per promising sector, spread over the sectors.
    if (pass > 0) {
      const sectors = promisingSectors();
      const exploit = Math.min(Math.floor((3 * n) / 4), 2 * sectors.length);
      for (let k = 0; k < exploit; k++) {
        const base = sectors[k % sectors.length].bearing;
        bearings[n - 1 - k] = normalizeBearing(base + signed(rng) * EXPLOIT_JITTER_DEG);
      }
    }
    return bearings.map((bearingDeg) => ({
      bearingDeg,
      pointCount,
      shape,
      orientationDeg: rng() * 180,
      jitter: Array.from({ length: 12 }, () => rng()),
    }));
  };

  const buildAt = (candidate, scale) =>
    buildLoopWaypoints({
      start,
      distanceKm: target * scale,
      bearingDeg: candidate.bearingDeg,
      pointCount: candidate.pointCount,
      shape: candidate.shape,
      orientationDeg: candidate.orientationDeg,
      rng: replayRng(candidate.jitter),
    });

  /** One provider request through the cache; counts towards the budget only when really sent. */
  const sentKeys = new Set();
  async function request(waypoints) {
    const key = requestKey({ start, waypoints, mode });
    const hit = sentKeys.has(key);
    if (!hit) {
      if (calls >= callCap) return { capped: true };
      calls++;
      sentKeys.add(key);
    }
    try {
      const result = await cached.route({ start, waypoints, mode });
      return { result, hit };
    } catch (e) {
      if (e && FATAL_CODES.has(e.code)) throw e;
      return { failed: true, hit }; // ZERO_RESULTS / UNKNOWN: give up on this candidate
    }
  }

  async function measureCandidate(candidate) {
    // Start from the road/polygon ratio seen so far, so the first request is already close.
    let scale = ratioCount > 0 ? Math.max(0.3, Math.min(1.5, ratioCount / ratioSum)) : 1;
    let waypoints = buildAt(candidate, scale);
    let attempts = 0;
    let repairs = 0;
    let custom = false; // waypoints came from a polish: via points on/around a measured loop
    let intendedKm = 0; // the loop length an unscaled polish was sampled from, to learn the shrink
    let bonus = 0; // one extra attempt for a near miss
    let best = null; // clean and within tolerance; fewer spur metres wins, then closeness
    let label = `${candidate.shape} ${Math.round(candidate.bearingDeg)}° n=${waypoints.length}`;

    while (attempts < maxAttempts + bonus) {
      attempts++;
      const { result, hit, capped } = await request(waypoints);
      if (capped || !result) break;
      if (!Number.isFinite(result.distanceKm) || result.distanceKm <= 0) break;

      const path = result.path || [];
      const errorKm = Math.abs(result.distanceKm - target);
      const fits = errorKm <= tolKm;
      const info = inspectPath(path, { maxSelfOverlap, minStemKm });
      if (info.stemKm < minStemKm) minStemKm = info.stemKm;
      const stemExcess =
        !stemAllowed(info.stemKm, result.distanceKm, minStemKm) || info.stemKm > result.distanceKm * MAX_STEM_FRACTION;
      const hopeless = info.spurKm > result.distanceKm * HOPELESS_SPUR_FRACTION;
      // The loop once its doubled stretches are cut out, and what a polish of it would land on
      // (the provider shortcuts a little between via points).
      const basis = info.spurs.length > 0 ? cutSpurs(info.core, info.spurs) : info.core;
      const basisKm = pathLengthKm(basis);
      const effectiveKm = Math.max(0.1, result.distanceKm - 2 * info.spurKm);
      if (intendedKm > 0 && !hit) {
        shrinkSum += result.distanceKm / intendedKm;
        shrinkCount++;
      }
      intendedKm = 0;
      const predictedKm = info.spurs.length > 0 ? effectiveKm * polishShrink() : result.distanceKm;
      if (!custom) {
        ratioSum += effectiveKm / (target * scale);
        ratioCount++;
      }
      if (!stemExcess && !hopeless && info.spurKm < NEAR_CLEAN_SPUR_KM) promising.push(candidate.bearingDeg);
      debug(
        `${label}${hit ? ' (cached)' : ''}: ${result.distanceKm.toFixed(2)} km fits=${fits} eff=${effectiveKm.toFixed(2)} pred=${predictedKm.toFixed(2)}` +
          ` stem=${info.stemKm.toFixed(3)} spur=${info.spurKm.toFixed(3)}/${info.allowedSpurKm.toFixed(3)} (${info.spurs.length}) overlap=${info.overlap.toFixed(3)} clean=${info.clean}`,
      );

      const nearMiss = (info.clean && errorKm <= tolKm * CLOSE_FACTOR) || (fits && info.spurKm < NEAR_CLEAN_SPUR_KM);
      if (nearMiss && !stemExcess && bonus === 0 && attempts === maxAttempts) bonus = 1;
      if (info.clean && fits) {
        const better =
          !best ||
          info.spurKm < best.spurKm - 1e-9 ||
          (Math.abs(info.spurKm - best.spurKm) < 1e-9 && errorKm < best.errorKm);
        if (better) {
          best = { errorKm, overlap: info.overlap, spurKm: info.spurKm, stemKm: info.stemKm, waypoints, distanceKm: result.distanceKm, path };
        }
        if (info.spurs.length === 0) break; // accepted as-is
      }
      if (stemExcess) break; // the loop sits at the end of an avoidable out-and-back: wrong geometry, discard
      if (hopeless) break; // mostly dead ends out there: discard
      if (hit && custom) break; // a repeated polish request cannot say anything new

      // Next request: polish on the measured loop, scaled towards the target, when that loop is
      // a sensible one (≥ 60 % of the target). This repairs spurs (via points on the spur-free
      // part) and rescues clean loops that are out of tolerance (same points, scaled).
      const factor = Math.abs(predictedKm - target) <= tolKm ? 1 : Math.max(SCALE_STEP_MIN, Math.min(SCALE_STEP_MAX, target / predictedKm));
      if (basisKm >= target * MIN_POLISH_FRACTION && repairs < maxRepairs) {
        // Scaled points leave the roads and get snapped: fewer of them means fewer dead ends.
        // Unscaled ones sit on the measured loop, so six pin it down without that risk.
        const via = scaledPolishWaypoints(basis, factor === 1 ? 6 : 4, factor, start);
        if (via.length >= 2) {
          waypoints = via;
          custom = true;
          intendedKm = factor === 1 ? effectiveKm : 0;
          repairs++;
          label = `${candidate.shape} ${Math.round(candidate.bearingDeg)}° n=${via.length} polish#${repairs} ×${factor.toFixed(2)}`;
          continue;
        }
      }
      if (custom || factor === 1) break; // nothing left to try for this geometry
      // No usable loop to polish: rescale the geometric candidate and measure again.
      scale *= factor;
      waypoints = buildAt(candidate, scale);
      label = `${candidate.shape} ${Math.round(candidate.bearingDeg)}° n=${waypoints.length} ×${scale.toFixed(2)}`;
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
  let pool = [];
  let survivors = [];
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    if (pass > 0) total += n;
    pool = pool.concat(await runPass(makeCandidates(pass)));
    // Stems are judged against the shortest one seen over all candidates, so re-check the pool.
    pool = pool.filter((c) => stemAllowed(c.stemKm, c.distanceKm, minStemKm));
    survivors = finalize(pool, dedupeThreshold);
    if (survivors.length >= MIN_ROUTES) break;
    if (calls >= callCap) break;
  }

  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(
      `[looply] generateRoutes: ${calls} provider calls (${cached.hits} cached), ${pool.length} clean candidates, ${survivors.length} routes (${formatKm(target)} ${mode})`,
    );
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
    waypoints: s.waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
    distanceKm: s.distanceKm,
    durationMin: estimateDurationMin(s.distanceKm, mode),
    path: s.path,
    bearingDeg: s.bearingDeg,
    createdAt,
  }));
}

/**
 * Sort by closeness, dedupe by path overlap (> threshold). When that leaves fewer than
 * MIN_ROUTES while the pool holds at least that many, the least-overlapping leftovers are added
 * back (never near-identical ones) so a dense grid still yields five distinct-enough loops.
 */
function finalize(pool, threshold) {
  const sorted = pool.slice().sort((a, b) => a.errorKm - b.errorKm);
  const kept = [];
  const rest = [];
  for (const candidate of sorted) {
    const duplicate = kept.some((k) => routeOverlap(k.path, candidate.path) > threshold);
    if (duplicate) rest.push(candidate);
    else kept.push(candidate);
  }
  while (kept.length < MIN_ROUTES && rest.length > 0) {
    let bestIdx = -1;
    let bestOverlap = Infinity;
    rest.forEach((c, i) => {
      const o = Math.max(...kept.map((k) => routeOverlap(k.path, c.path)));
      if (o < bestOverlap) {
        bestOverlap = o;
        bestIdx = i;
      }
    });
    if (bestIdx < 0 || bestOverlap >= FILL_MAX_OVERLAP) break;
    kept.push(rest.splice(bestIdx, 1)[0]);
  }
  return kept.sort((a, b) => a.errorKm - b.errorKm);
}
