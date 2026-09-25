// Geodesic helpers (spherical earth). All distances in km, bearings in degrees (0 = N, 90 = E).

const EARTH_RADIUS_KM = 6371.0088;
const DEG = Math.PI / 180;

function toRad(deg) {
  return deg * DEG;
}

function toDeg(rad) {
  return rad / DEG;
}

/** Great-circle distance between two LatLng points in km. */
export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point reached by travelling `distanceKm` from `origin` along `bearingDeg`. */
export function destinationPoint(origin, bearingDeg, distanceKm) {
  const delta = distanceKm / EARTH_RADIUS_KM;
  const theta = toRad(bearingDeg);
  const lat1 = toRad(origin.lat);
  const lng1 = toRad(origin.lng);

  const sinLat2 =
    Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(theta);
  const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));
  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(lat1);
  const x = Math.cos(delta) - Math.sin(lat1) * sinLat2;
  const lng2 = lng1 + Math.atan2(y, x);

  return { lat: toDeg(lat2), lng: normalizeLng(toDeg(lng2)) };
}

/** Initial bearing from a to b, normalised to [0, 360). */
export function bearingDeg(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return normalizeBearing(toDeg(Math.atan2(y, x)));
}

/** Sum of segment lengths along a path (km). */
export function pathLengthKm(path) {
  if (!Array.isArray(path) || path.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineKm(path[i - 1], path[i]);
  }
  return total;
}

/**
 * Fraction of shared grid cells between two paths, 0..1.
 * Each path is densified so consecutive points are at most `cellKm` apart,
 * then every point is snapped to a `cellKm` grid. Result = |A ∩ B| / min(|A|, |B|).
 */
export function routeOverlap(pathA, pathB, cellKm = 0.1) {
  const cellsA = pathCells(pathA, cellKm);
  const cellsB = pathCells(pathB, cellKm);
  const smallest = Math.min(cellsA.size, cellsB.size);
  if (smallest === 0) return 0;
  let shared = 0;
  for (const cell of cellsA) {
    if (cellsB.has(cell)) shared++;
  }
  return shared / smallest;
}

function pathCells(path, cellKm) {
  const cells = new Set();
  if (!Array.isArray(path) || path.length === 0) return cells;
  const key = cellKeyFactory(path[0].lat, cellKm);
  for (const p of densifyPath(path, cellKm)) cells.add(key(p));
  return cells;
}

/** Returns p → "x:y" grid-cell key for a `cellKm` grid, using a local flat projection around refLat. */
function cellKeyFactory(refLat, cellKm) {
  const kmPerDegLat = (Math.PI / 180) * EARTH_RADIUS_KM;
  const kmPerDegLng = kmPerDegLat * Math.cos(toRad(refLat));
  return (p) => {
    const x = Math.floor((p.lng * kmPerDegLng) / cellKm);
    const y = Math.floor((p.lat * kmPerDegLat) / cellKm);
    return `${x}:${y}`;
  };
}

/**
 * Densify while remembering which original vertex each point belongs to (nearest vertex).
 * Returns { points, orig } with orig[k] = index into `path`.
 */
function densifyIndexed(path, stepKm) {
  const points = [];
  const orig = [];
  if (!Array.isArray(path) || path.length === 0) return { points, orig };
  const step = stepKm > 0 ? stepKm : 0.03;
  points.push({ lat: path[0].lat, lng: path[0].lng });
  orig.push(0);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const steps = Math.max(1, Math.ceil(haversineKm(a, b) / step));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      points.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
      orig.push(t < 0.5 ? i - 1 : i);
    }
  }
  return { points, orig };
}

/** Linear densification: consecutive points at most `stepKm` apart. Original vertices are kept. */
export function densifyPath(path, stepKm = 0.03) {
  return densifyIndexed(path, stepKm).points;
}

/** Cell sequence of a path with consecutive duplicates removed; densified at cellKm / 3 so no cell is skipped. */
function cellSequence(points, cellKm) {
  if (points.length === 0) return [];
  const key = cellKeyFactory(points[0].lat, cellKm);
  const seq = [];
  for (const p of points) {
    const c = key(p);
    if (seq.length === 0 || seq[seq.length - 1] !== c) seq.push(c);
  }
  return seq;
}

/**
 * Fraction (0..1) of grid steps that re-enter a cell the walk already left.
 * Consecutive duplicates, immediate boundary zig-zags (A B A) and the closing return into
 * the start cell are ignored. A clean loop ≈ 0, an out-and-back ≈ 0.5.
 */
export function selfOverlapFraction(path, cellKm = 0.03) {
  const cells = cellSequence(densifyPath(path, cellKm / 3), cellKm);
  if (cells.length < 3) return 0;
  const lastSeen = new Map([[cells[0], 0]]);
  let revisited = 0;
  for (let k = 1; k < cells.length; k++) {
    const c = cells[k];
    const closing = k === cells.length - 1 && c === cells[0];
    if (!closing && lastSeen.has(c) && lastSeen.get(c) < k - 2) revisited++;
    lastSeen.set(c, k);
  }
  return revisited / (cells.length - 1);
}

const MIN_SPUR_KM = 0.025;
const STEM_TOLERANCE_KM = 0.015;
// Way out and way back on the same road coincide this closely.
const RETRACE_TOLERANCE_KM = 0.008;
// On a divided road the way back runs on the other carriageway, 10–30 m away (Rotterdam fixture:
// ~25 m). That wider gap only counts when the two stretches run straight against each other;
// a sharp corner or a crossing never gets it.
const DIVIDED_ROAD_TOLERANCE_KM = 0.03;
const DIVIDED_ROAD_MIN_HEADING_DIFF = 170;
const RETRACE_MIN_HEADING_DIFF = 150; // a retrace comes back the opposite way; same-direction neighbours never pair
const MIN_PARTNER_ARC_KM = 0.012; // a partner must be this far along the path (rules out neighbours at a corner)
const MIN_RUN_KM = MIN_SPUR_KM - MIN_PARTNER_ARC_KM / 2; // a doubled run this long is a spur of ≥ MIN_SPUR_KM
const STEM_STEP_KM = 0.005;

/**
 * Grid cell size used by the spur/overlap detectors when none is given: 1/200 of the path
 * length, clamped to 10–30 m, so a 1.3 km loop is inspected at 10 m and a 30 km ride at 30 m.
 */
export function spurCellKm(path) {
  const len = pathLengthKm(path);
  return Math.max(0.01, Math.min(0.03, len / 200));
}

function cumulative(path) {
  const cum = [0];
  for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + haversineKm(path[k - 1], path[k]));
  return cum;
}

/** Point at arc length `t` along `path`, using the cumulative lengths `cum`. */
function pointAtArc(path, cum, t) {
  if (t <= 0) return path[0];
  const total = cum[cum.length - 1];
  if (t >= total) return path[path.length - 1];
  let k = 1;
  while (k < cum.length && cum[k] < t) k++;
  const a = path[k - 1];
  const b = path[k];
  const seg = cum[k] - cum[k - 1];
  const f = seg > 0 ? (t - cum[k - 1]) / seg : 0;
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
}

/**
 * The start stem: the stretch from the start point that the walk retraces at the very end
 * (a cul-de-sac the loop has to leave and re-enter). The outbound prefix and the reversed
 * inbound suffix are compared at equal arc lengths; the stem is where they coincide (≤ 15 m).
 * Returns null when there is none (< 25 m), otherwise { lengthKm, outIndex, backIndex, junction }:
 * lengthKm is one-way, outIndex = first original vertex after the stem on the way out,
 * backIndex = last vertex before the stem on the way back, junction = where the two part.
 */
export function spurStemAtStart(path) {
  if (!Array.isArray(path) || path.length < 3) return null;
  const cum = cumulative(path);
  const total = cum[cum.length - 1];
  if (total <= 0) return null;
  const reversed = path.slice().reverse();
  const rcum = cumulative(reversed);

  let t = 0;
  for (let step = STEM_STEP_KM; step <= total / 2; step += STEM_STEP_KM) {
    if (haversineKm(pointAtArc(path, cum, step), pointAtArc(reversed, rcum, step)) > STEM_TOLERANCE_KM) break;
    t = step;
  }
  if (t < MIN_SPUR_KM) return null;

  let outIndex = 1;
  while (outIndex < path.length - 1 && cum[outIndex] <= t) outIndex++;
  let backIndex = path.length - 2;
  while (backIndex > outIndex && total - cum[backIndex] <= t) backIndex--;
  if (backIndex < outIndex) backIndex = outIndex - 1; // nothing but stem: empty core
  const junction = pointAtArc(path, cum, t);

  // A stub that leaves the start and comes straight back before the loop begins looks the same
  // from the ends, but then the loop itself passes through the start again: that is a spur.
  const inner = path.slice(outIndex, backIndex + 1);
  if (inner.length > 1) {
    for (const p of densifyPath(inner, STEM_STEP_KM)) {
      if (haversineKm(p, path[0]) <= STEM_TOLERANCE_KM) return null;
    }
  }
  return { lengthKm: t, outIndex, backIndex, junction };
}

/**
 * Path with the start stem removed: the loop proper, closed at the junction.
 * Returns { stemKm, core, stem }; core === path when there is no stem.
 */
export function trimStartStem(path) {
  const stem = spurStemAtStart(path);
  if (!stem) return { stemKm: 0, core: path, stem: null };
  const inner = path.slice(stem.outIndex, stem.backIndex + 1);
  return { stemKm: stem.lengthKm, core: [stem.junction, ...inner, stem.junction], stem };
}

/** Local flat projection (km) around refLat: p → { x, y }. */
function flatXY(refLat) {
  const kmPerDegLat = (Math.PI / 180) * EARTH_RADIUS_KM;
  const kmPerDegLng = kmPerDegLat * Math.cos(toRad(refLat));
  return (p) => ({ x: p.lng * kmPerDegLng, y: p.lat * kmPerDegLat });
}

/** Absolute heading difference in degrees, 0..180. */
function headingDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Doubled-back stretches ("spurs"): road that the walk covers twice. Every point (path densified
 * to ~cellKm / 3) that has a partner point at least 12 m away along the path, travelled the
 * opposite way (≥ 150°) and within 8 m — or within 30 m when the two run straight against each
 * other (≥ 170°, the two carriageways of a divided road) — is "doubled"; a run of doubled points ≥ 19 m
 * long is a retraced stretch, and the outbound run is paired with the run it retraces. Returns
 * [{ baseIndex, tipIndex, endIndex, lengthKm }] in original path indices, largest first:
 * baseIndex = where the spur leaves the loop, endIndex = where the walk is back on the loop,
 * tipIndex = the turn-around, lengthKm = one-way doubled length (nested spurs are folded into the
 * enclosing one; runs that overlap in index space are merged into one continuous stretch instead
 * of being dropped). Catches plain stubs as well as lollipops (a doubled stick with a loop at the
 * end). Sharp corners, crossings and same-direction neighbours (< 150° apart — a parallel but
 * distinct path such as a towpath beside a road) are not spurs; the closing of the loop is not
 * either. A start stem is reported like any other spur — strip it with trimStartStem first when
 * it must not count.
 */
export function findSpurs(path, cellKm = spurCellKm(path)) {
  const step = Math.max(0.003, cellKm / 3);
  const { points, orig } = densifyIndexed(path, step);
  const n = points.length;
  if (n < 4) return [];
  const cum = cumulative(points);
  const tol = DIVIDED_ROAD_TOLERANCE_KM; // bin size: the widest distance any partner may have
  const xy = flatXY(points[0].lat);
  const pts = points.map(xy);

  // Spatial hash with tol-sized bins; neighbours are in the 3 × 3 bins around a point.
  const bins = new Map();
  const binKey = (bx, by) => `${bx}:${by}`;
  pts.forEach((p, k) => {
    const key = binKey(Math.floor(p.x / tol), Math.floor(p.y / tol));
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(k);
  });
  const heading = (k) => bearingDeg(points[Math.max(0, k - 1)], points[Math.min(n - 1, k + 1)]);
  const headings = points.map((_, k) => heading(k));

  const partner = new Array(n).fill(-1);
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    const bx = Math.floor(p.x / tol);
    const by = Math.floor(p.y / tol);
    let best = -1;
    let bestD = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = bins.get(binKey(bx + dx, by + dy));
        if (!list) continue;
        for (const m of list) {
          if (Math.abs(cum[m] - cum[k]) < MIN_PARTNER_ARC_KM) continue;
          const diff = headingDiff(headings[k], headings[m]);
          // A retrace always comes back the opposite way; anything else — a crossing, or a
          // distinct parallel path (towpath beside a road) that runs the same direction — is not
          // a spur.
          if (diff < RETRACE_MIN_HEADING_DIFF) continue;
          const ex = pts[m].x - p.x;
          const ey = pts[m].y - p.y;
          const d = Math.hypot(ex, ey);
          // The wide gap must be sideways (the other carriageway beside you), not ahead of you:
          // two stretches that meet head-on at a crossing are opposite too, but lie in line.
          const h = headings[k] * DEG;
          const along = Math.abs(ex * Math.sin(h) + ey * Math.cos(h));
          const wide = diff >= DIVIDED_ROAD_MIN_HEADING_DIFF && along <= step;
          const maxD = wide ? DIVIDED_ROAD_TOLERANCE_KM : RETRACE_TOLERANCE_KM;
          if (d <= maxD && d <= bestD) {
            bestD = d;
            best = m;
          }
        }
      }
    }
    partner[k] = best;
  }

  // Runs of doubled points (gaps of ≤ 2 points bridged), split where the partner side flips.
  const runs = [];
  let cur = null;
  let gap = 0;
  for (let k = 0; k < n; k++) {
    const doubled = partner[k] >= 0;
    if (doubled) {
      const side = partner[k] > k ? 1 : -1;
      if (cur && cur.side === side) {
        cur.b = k;
      } else {
        if (cur) runs.push(cur);
        cur = { a: k, b: k, side };
      }
      gap = 0;
    } else if (cur) {
      gap++;
      if (gap > 2) {
        runs.push(cur);
        cur = null;
        gap = 0;
      }
    }
  }
  if (cur) runs.push(cur);
  const long = runs.filter((r) => cum[r.b] - cum[r.a] >= MIN_RUN_KM);
  if (long.length === 0) return [];

  // Pair each run with the run holding the median of its partners.
  const runOf = new Array(n).fill(-1);
  long.forEach((r, idx) => {
    for (let k = r.a; k <= r.b; k++) runOf[k] = idx;
  });
  const pairs = [];
  const used = new Set();
  long.forEach((r, idx) => {
    if (used.has(idx)) return;
    const partners = [];
    for (let k = r.a; k <= r.b; k++) if (partner[k] >= 0) partners.push(partner[k]);
    partners.sort((x, y) => x - y);
    const median = partners[Math.floor(partners.length / 2)];
    const q = runOf[median];
    if (q < 0 || q === idx || used.has(q)) return;
    const other = long[q];
    const first = r.a < other.a ? r : other;
    const second = r.a < other.a ? other : r;
    used.add(idx);
    used.add(q);
    if (second.a <= first.b) {
      // The runs overlap in index space (the gap bridging joined out and back): one continuous
      // doubled stretch, half of it one-way.
      const end = Math.max(first.b, second.b);
      const mid = (cum[first.a] + cum[end]) / 2;
      let tip = first.a;
      while (tip < end && cum[tip] < mid) tip++;
      pairs.push({ base: first.a, tip, end, lengthKm: (cum[end] - cum[first.a]) / 2 + MIN_PARTNER_ARC_KM / 2 });
      return;
    }
    const lengthKm = (cum[first.b] - cum[first.a] + cum[second.b] - cum[second.a]) / 2 + MIN_PARTNER_ARC_KM / 2;
    // Turn-around: the point between the runs furthest along the way out and back.
    const mid = (cum[first.b] + cum[second.a]) / 2;
    let tip = first.b;
    while (tip < second.a && cum[tip] < mid) tip++;
    pairs.push({ base: first.a, tip, end: second.b, lengthKm });
  });

  // Fold nested spurs into the enclosing one.
  pairs.sort((x, y) => x.base - y.base || y.end - x.end);
  const outer = [];
  for (const s of pairs) {
    const parent = outer.find((o) => s.base >= o.base && s.end <= o.end);
    if (parent) parent.lengthKm += s.lengthKm;
    else outer.push(s);
  }

  return outer
    .map((s) => ({ baseIndex: orig[s.base], tipIndex: orig[s.tip], endIndex: orig[s.end], lengthKm: s.lengthKm }))
    .filter((s) => s.lengthKm >= MIN_SPUR_KM)
    .sort((a, b) => b.lengthKm - a.lengthKm);
}

export function normalizeBearing(deg) {
  return ((deg % 360) + 360) % 360;
}

function normalizeLng(lng) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}
