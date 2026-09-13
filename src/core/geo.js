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
  const refLat = path[0].lat;
  const kmPerDegLat = (Math.PI / 180) * EARTH_RADIUS_KM;
  const kmPerDegLng = kmPerDegLat * Math.cos(toRad(refLat));

  const add = (p) => {
    const x = Math.floor((p.lng * kmPerDegLng) / cellKm);
    const y = Math.floor((p.lat * kmPerDegLat) / cellKm);
    cells.add(`${x}:${y}`);
  };

  add(path[0]);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const segKm = haversineKm(a, b);
    const steps = Math.max(1, Math.ceil(segKm / cellKm));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      add({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  return cells;
}

export function normalizeBearing(deg) {
  return ((deg % 360) + 360) % 360;
}

function normalizeLng(lng) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}
