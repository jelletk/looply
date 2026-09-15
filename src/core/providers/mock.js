// Deterministic offline provider: straight lines through the waypoints.
// The reported distance is inflated by `wobble` so the generator's scaling loop is exercised.
// With `spurEvery` > 0 every Nth request gets an out-and-back spur of `spurKm` at the second
// waypoint (like a waypoint snapped to a dead end); a repaired request — one whose waypoints lie
// on a path returned earlier, or carry `via: true` (polish points on real roads) — always comes
// back clean, so the generator's repair logic is exercised. `via` has no other effect here.

import { haversineKm, destinationPoint, bearingDeg } from '../geo.js';

const POINTS_PER_SEGMENT = 8;
const ON_PATH_KM = 0.015;

function interpolate(a, b, steps) {
  const out = [];
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
  }
  return out;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Distance (km) from p to segment a–b using a local flat projection. */
function pointToSegmentKm(p, a, b) {
  const kx = 111.32 * Math.cos((a.lat * Math.PI) / 180);
  const ky = 111.32;
  const ax = 0;
  const ay = 0;
  const bx = (b.lng - a.lng) * kx;
  const by = (b.lat - a.lat) * ky;
  const px = (p.lng - a.lng) * kx;
  const py = (p.lat - a.lat) * ky;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / len2));
  const dx = px - (ax + t * bx);
  const dy = py - (ay + t * by);
  return Math.sqrt(dx * dx + dy * dy);
}

function angleDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * True when `point` lies on an earlier response's path without being one of that request's own
 * waypoints or a radially scaled version of one (those sit on the start→waypoint legs).
 */
function isRepairedWaypoint(point, start, previous) {
  for (const { path, waypoints } of previous) {
    if (waypoints.some((wp) => haversineKm(wp, point) < ON_PATH_KM)) continue;
    if (waypoints.some((wp) => angleDiff(bearingDeg(start, wp), bearingDeg(start, point)) < 0.5)) continue;
    for (let i = 1; i < path.length; i++) {
      if (pointToSegmentKm(point, path[i - 1], path[i]) < ON_PATH_KM) return true;
    }
  }
  return false;
}

export function createMockProvider({ delayMs = 150, wobble = 0.15, spurEvery = 0, spurKm = 0.4 } = {}) {
  const previous = [];
  let requests = 0;

  return {
    async route({ start, waypoints = [], mode }) {
      if (!start || !Number.isFinite(start.lat) || !Number.isFinite(start.lng)) {
        throw Object.assign(new Error('Mock provider: invalid start'), { code: 'UNKNOWN' });
      }
      if (delayMs > 0) await wait(delayMs);

      let stops = [start, ...waypoints, start];
      if (spurEvery > 0) {
        const repaired =
          waypoints.some((wp) => wp.via === true) || waypoints.some((wp) => isRepairedWaypoint(wp, start, previous));
        requests++;
        if (!repaired && requests % spurEvery === 0 && waypoints.length >= 2) {
          const base = waypoints[1];
          const tip = destinationPoint(base, bearingDeg(start, base), spurKm);
          stops = [start, waypoints[0], base, tip, base, ...waypoints.slice(2), start];
        }
      }

      const path = [{ lat: start.lat, lng: start.lng }];
      let geodesicKm = 0;
      for (let i = 1; i < stops.length; i++) {
        geodesicKm += haversineKm(stops[i - 1], stops[i]);
        path.push(...interpolate(stops[i - 1], stops[i], POINTS_PER_SEGMENT));
      }
      if (spurEvery > 0) previous.push({ path, waypoints });

      return { distanceKm: geodesicKm * (1 + wobble), path, mode };
    },
  };
}
