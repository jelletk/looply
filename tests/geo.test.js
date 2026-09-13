import { describe, it, expect } from 'vitest';
import {
  haversineKm,
  destinationPoint,
  pathLengthKm,
  bearingDeg,
  routeOverlap,
  normalizeBearing,
} from '../src/core/geo.js';

const AMSTERDAM = { lat: 52.3676, lng: 4.9041 };
const UTRECHT = { lat: 52.0907, lng: 5.1214 };

describe('haversineKm', () => {
  it('Amsterdam–Utrecht is about 35 km', () => {
    const d = haversineKm(AMSTERDAM, UTRECHT);
    expect(d).toBeGreaterThan(33);
    expect(d).toBeLessThan(36);
  });

  it('is symmetric and zero for identical points', () => {
    expect(haversineKm(AMSTERDAM, UTRECHT)).toBeCloseTo(haversineKm(UTRECHT, AMSTERDAM), 9);
    expect(haversineKm(UTRECHT, UTRECHT)).toBe(0);
  });
});

describe('destinationPoint', () => {
  it('lands at the requested distance', () => {
    const p = destinationPoint(UTRECHT, 45, 3);
    expect(haversineKm(UTRECHT, p)).toBeCloseTo(3, 6);
  });

  it('round-trips the bearing', () => {
    for (const b of [0, 37, 90, 180, 250, 359]) {
      const p = destinationPoint(UTRECHT, b, 2);
      const diff = Math.abs(((bearingDeg(UTRECHT, p) - b + 540) % 360) - 180);
      expect(diff).toBeLessThan(0.001);
    }
  });

  it('moves north for bearing 0 and east for bearing 90', () => {
    const north = destinationPoint(UTRECHT, 0, 1);
    expect(north.lat).toBeGreaterThan(UTRECHT.lat);
    expect(north.lng).toBeCloseTo(UTRECHT.lng, 9);
    const east = destinationPoint(UTRECHT, 90, 1);
    expect(east.lng).toBeGreaterThan(UTRECHT.lng);
    expect(east.lat).toBeCloseTo(UTRECHT.lat, 4);
  });
});

describe('bearingDeg', () => {
  it('Utrecht → Amsterdam points roughly north-west', () => {
    const b = bearingDeg(UTRECHT, AMSTERDAM);
    expect(b).toBeGreaterThan(320);
    expect(b).toBeLessThan(340);
  });
});

describe('normalizeBearing', () => {
  it('wraps into [0, 360)', () => {
    expect(normalizeBearing(370)).toBe(10);
    expect(normalizeBearing(-90)).toBe(270);
    expect(normalizeBearing(360)).toBe(0);
  });
});

describe('pathLengthKm', () => {
  it('sums the segments', () => {
    const mid = destinationPoint(UTRECHT, 0, 1);
    const end = destinationPoint(mid, 90, 2);
    expect(pathLengthKm([UTRECHT, mid, end])).toBeCloseTo(3, 6);
  });

  it('returns 0 for degenerate input', () => {
    expect(pathLengthKm([])).toBe(0);
    expect(pathLengthKm([UTRECHT])).toBe(0);
    expect(pathLengthKm(null)).toBe(0);
  });
});

describe('routeOverlap', () => {
  const square = (origin, sideKm) => {
    const a = origin;
    const b = destinationPoint(a, 0, sideKm);
    const c = destinationPoint(b, 90, sideKm);
    const d = destinationPoint(a, 90, sideKm);
    return [a, b, c, d, a];
  };

  it('is 1 for identical paths', () => {
    const p = square(UTRECHT, 1);
    expect(routeOverlap(p, p)).toBe(1);
  });

  it('is high for a lightly perturbed copy', () => {
    const p = square(UTRECHT, 1);
    const q = p.map((pt) => ({ lat: pt.lat + 0.00002, lng: pt.lng + 0.00002 }));
    expect(routeOverlap(p, q)).toBeGreaterThan(0.6);
  });

  it('is low for paths far apart', () => {
    const p = square(UTRECHT, 1);
    const q = square(destinationPoint(UTRECHT, 90, 5), 1);
    expect(routeOverlap(p, q)).toBe(0);
  });

  it('is between 0 and 1 for partially shared paths', () => {
    const p = square(UTRECHT, 1);
    // Same first side, then diverging.
    const b = destinationPoint(UTRECHT, 0, 1);
    const q = [UTRECHT, b, destinationPoint(b, 270, 1), destinationPoint(UTRECHT, 270, 1), UTRECHT];
    const o = routeOverlap(p, q);
    expect(o).toBeGreaterThan(0.2);
    expect(o).toBeLessThan(0.6);
  });

  it('handles empty paths', () => {
    expect(routeOverlap([], square(UTRECHT, 1))).toBe(0);
  });
});
