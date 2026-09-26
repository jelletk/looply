import { describe, it, expect } from 'vitest';
import { homeProfile, windWord, routeTitle } from '../src/core/profile.js';
import { destinationPoint } from '../src/core/geo.js';

const start = { lat: 52.09, lng: 5.12 };

/** Square out-and-around loop: 1 km north, 1 km east, 1 km south, back west. */
function squareLoop() {
  const n = destinationPoint(start, 0, 1);
  const ne = destinationPoint(n, 90, 1);
  const e = destinationPoint(start, 90, 1);
  const leg = (a, b) => Array.from({ length: 20 }, (_, i) => ({ lat: a.lat + ((b.lat - a.lat) * i) / 20, lng: a.lng + ((b.lng - a.lng) * i) / 20 }));
  return [...leg(start, n), ...leg(n, ne), ...leg(ne, e), ...leg(e, start), start];
}

describe('homeProfile', () => {
  it('measures distance along the route and to home', () => {
    const p = homeProfile(squareLoop(), start);
    expect(p.totalKm).toBeCloseTo(4, 1);
    expect(p.farKm).toBeCloseTo(Math.SQRT2, 1); // the far corner
    expect(p.farAtKm).toBeCloseTo(2, 1);
    expect(p.points[0]).toEqual({ atKm: 0, dKm: 0 });
    expect(p.points.at(-1).dKm).toBeCloseTo(0, 5);
    expect(p.lastKmFarKm).toBeGreaterThan(0.9); // the last km runs back from 1 km east
  });

  it('thins long paths but keeps the farthest point', () => {
    const p = homeProfile(squareLoop(), start, 10);
    expect(p.points.length).toBeLessThanOrEqual(13);
    expect(Math.max(...p.points.map((q) => q.dKm))).toBeCloseTo(p.farKm, 6);
  });

  it('copes with an empty path', () => {
    expect(homeProfile([], start)).toEqual({ points: [], totalKm: 0, farKm: 0, farAtKm: 0, lastKmFarKm: 0 });
  });
});

describe('route names', () => {
  it('names the direction in words', () => {
    expect(windWord(0)).toBe('noord');
    expect(windWord(225)).toBe('zuidwest');
    expect(windWord(-45)).toBe('noordwest');
  });

  it('titles a loop and a close-to-home route', () => {
    expect(routeTitle({ bearingDeg: 270 })).toBe('De westlus');
    expect(routeTitle({ bearingDeg: 135, loops: 2 })).toBe('Twee lussen zuidoost');
    expect(routeTitle({ name: 'Oud' })).toBe('Oud');
  });
});
