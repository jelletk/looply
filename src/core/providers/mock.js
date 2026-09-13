// Deterministic offline provider: straight lines through the waypoints.
// The reported distance is inflated by `wobble` so the generator's scaling loop is exercised.

import { haversineKm } from '../geo.js';

const POINTS_PER_SEGMENT = 8;

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

export function createMockProvider({ delayMs = 150, wobble = 0.15 } = {}) {
  return {
    async route({ start, waypoints = [], mode }) {
      if (!start || !Number.isFinite(start.lat) || !Number.isFinite(start.lng)) {
        throw Object.assign(new Error('Mock provider: invalid start'), { code: 'UNKNOWN' });
      }
      if (delayMs > 0) await wait(delayMs);

      const stops = [start, ...waypoints, start];
      const path = [{ lat: start.lat, lng: start.lng }];
      let geodesicKm = 0;
      for (let i = 1; i < stops.length; i++) {
        geodesicKm += haversineKm(stops[i - 1], stops[i]);
        path.push(...interpolate(stops[i - 1], stops[i], POINTS_PER_SEGMENT));
      }

      return { distanceKm: geodesicKm * (1 + wobble), path, mode };
    },
  };
}
