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

/** True when ≥ 60 % of the distinct cells strictly between i and j are entered at least twice. */
function isRetrace(cells, i, j) {
  const counts = new Map();
  let prev = null;
  for (let k = i + 1; k < j; k++) {
    const c = cells[k];
    if (c === prev) continue;
    prev = c;
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  if (counts.size === 0) return false;
  let twice = 0;
  for (const n of counts.values()) if (n >= 2) twice++;
  return twice / counts.size >= 0.6;
}

const MIN_SPUR_KM = 0.08;

/**
 * Doubled-back stretches ("spurs"): the walk leaves a cell, retraces its cells in reverse and
 * returns to the same cell. Returns [{ baseIndex, tipIndex, endIndex, lengthKm }] in original
 * path indices, largest first. baseIndex = where the spur starts, tipIndex = the point furthest
 * from the base, endIndex = where the walk is back at the base, lengthKm = one-way length.
 * Only spurs of ≥ 0.08 km are reported; the loop's own closing return is not a spur.
 */
export function findSpurs(path, cellKm = 0.03) {
  const { points, orig } = densifyIndexed(path, cellKm / 3);
  const n = points.length;
  if (n < 4) return [];
  const key = cellKeyFactory(points[0].lat, cellKm);
  const cells = points.map(key);
  const cum = [0];
  for (let k = 1; k < n; k++) cum.push(cum[k - 1] + haversineKm(points[k - 1], points[k]));

  const occurrences = new Map();
  cells.forEach((c, k) => {
    if (!occurrences.has(c)) occurrences.set(c, []);
    occurrences.get(c).push(k);
  });

  const raw = [];
  for (let i = 0; i < n - 1; i++) {
    for (const j of occurrences.get(cells[i])) {
      if (j <= i + 1) continue;
      if (i === 0 && j === n - 1) continue; // closing the loop
      if ((cum[j] - cum[i]) / 2 < MIN_SPUR_KM) continue;
      if (isRetrace(cells, i, j)) {
        raw.push({ i, j });
        break;
      }
    }
  }

  const merged = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.i <= last.j) last.j = Math.max(last.j, r.j);
    else merged.push({ ...r });
  }

  return merged
    .map(({ i, j }) => {
      let tip = i + 1;
      let far = -1;
      for (let k = i + 1; k < j; k++) {
        const d = haversineKm(points[i], points[k]);
        if (d > far) {
          far = d;
          tip = k;
        }
      }
      return { baseIndex: orig[i], tipIndex: orig[tip], endIndex: orig[j], lengthKm: (cum[j] - cum[i]) / 2 };
    })
    .filter((s) => s.lengthKm >= MIN_SPUR_KM)
    .sort((a, b) => b.lengthKm - a.lengthKm);
}

export function normalizeBearing(deg) {
  return ((deg % 360) + 360) % 360;
}

function normalizeLng(lng) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}
