import { describe, it, expect } from 'vitest';
import { generateTwoLoopRoutes, maxDistanceFromStartKm, pairLoops, spreadPick } from '../src/core/twoLoops.js';
import { generateRoutes } from '../src/core/generator.js';
import { createMockProvider } from '../src/core/providers/mock.js';
import { createSettingsStore, DEFAULT_SETTINGS } from '../src/core/settings.js';

const DEFAULTS_PLAIN = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

const start = { lat: 52.0907, lng: 5.1214 };

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('generateTwoLoopRoutes', () => {
  it('builds routes of two loops through the start that stay closer to home than one loop', async () => {
    const provider = createMockProvider({ delayMs: 0 });
    const single = await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, rng: seeded(4) });
    const routes = await generateTwoLoopRoutes({ start, distanceKm: 5, mode: 'walk', provider, rng: seeded(4) });

    expect(routes.length).toBeGreaterThanOrEqual(3);
    const singleReach = Math.min(...single.map((r) => maxDistanceFromStartKm(r.path, start)));
    for (const r of routes) {
      expect(r.loops).toBe(2);
      expect(Math.abs(r.distanceKm - 5)).toBeLessThanOrEqual(0.3);
      expect(r.maxFromStartKm).toBeLessThan(singleReach);
      expect(r.waypoints.length).toBeLessThanOrEqual(9); // fits a Google Maps link
      expect(r.waypoints.some((w) => w.lat === start.lat && w.lng === start.lng)).toBe(true);
    }
    expect(new Set(routes.map((r) => r.id)).size).toBe(routes.length);
  });
});

describe('pairLoops', () => {
  const loop = (id, km, path) => ({ id, distanceKm: km, path });
  const east = [start, { lat: 52.0907, lng: 5.14 }, { lat: 52.1, lng: 5.13 }, start];
  const west = [start, { lat: 52.0907, lng: 5.10 }, { lat: 52.08, lng: 5.11 }, start];

  it('only pairs halves that add up to the target within tolerance', () => {
    expect(pairLoops([loop('a', 2.5, east), loop('b', 2.6, west)], 5, 0.3)).toHaveLength(1);
    expect(pairLoops([loop('a', 2.5, east), loop('b', 3.0, west)], 5, 0.3)).toHaveLength(0);
  });

  it('does not pair a loop with a copy of itself', () => {
    expect(pairLoops([loop('a', 2.5, east), loop('b', 2.5, east)], 5, 0.3)).toHaveLength(0);
  });
});

describe('spreadPick', () => {
  it('keeps short lists and spreads long ones', () => {
    expect(spreadPick([1, 2, 3], 4)).toEqual([1, 2, 3]);
    expect(spreadPick([1, 2, 3, 4, 5, 6], 4)).toEqual([1, 3, 4, 6]);
  });
});

describe('generateRoutes avoidPaths', () => {
  it('ranks routes on streets to avoid last and marks them not fresh', async () => {
    const provider = createMockProvider({ delayMs: 0 });
    const first = await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, rng: seeded(9) });
    const again = await generateRoutes({
      start,
      distanceKm: 5,
      mode: 'walk',
      provider,
      rng: seeded(9), // same seed: without avoidance this returns the same loops
      avoidPaths: first.map((r) => r.path),
    });
    const freshFlags = again.map((r) => r.fresh);
    // Fresh routes first; every stale one after every fresh one.
    expect(freshFlags).toEqual(freshFlags.slice().sort((x, y) => Number(y) - Number(x)));
    expect(freshFlags.filter(Boolean).length).toBeGreaterThanOrEqual(1);
  });
});

describe('settings store', () => {
  function memory() {
    const data = {};
    return { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = String(v)) };
  }

  it('returns defaults and merges updates', () => {
    const store = createSettingsStore(memory());
    expect(store.load()).toEqual({ ...DEFAULTS_PLAIN });
    store.update({ home: { lat: 52, lng: 5, label: 'Thuis' }, speeds: { run: 10.5 } });
    const s = store.load();
    expect(s.home).toEqual({ lat: 52, lng: 5, label: 'Thuis' });
    expect(s.speeds).toEqual({ walk: 5, run: 10.5, bike: 22 });
  });

  it('ignores corrupt or out-of-range values', () => {
    const storage = memory();
    storage.setItem('looply.settings.v1', '{"speeds":{"run":-3,"bike":"fast"},"home":{"lat":"x"}}');
    expect(createSettingsStore(storage).load()).toEqual({ ...DEFAULTS_PLAIN });
    storage.setItem('looply.settings.v1', 'not json');
    expect(createSettingsStore(storage).load().speeds.walk).toBe(5);
  });

  it('remembers the mode and the distance per mode, within each mode’s range', () => {
    const storage = memory();
    const store = createSettingsStore(storage);
    store.update({ mode: 'bike', distances: { bike: 45 } });
    store.update({ distances: { walk: 3.5 } });
    expect(store.load().mode).toBe('bike');
    expect(store.load().distances).toEqual({ walk: 3.5, run: 7.5, bike: 45 });
    storage.setItem('looply.settings.v1', '{"mode":"swim","distances":{"walk":50,"bike":2},"resultsHints":-1}');
    expect(createSettingsStore(storage).load()).toMatchObject({ mode: 'walk', distances: { walk: 5, bike: 30 }, resultsHints: 0 });
  });
});

describe('two-loop errors and overlap across starts', () => {
  it('reports NO_PAIRS when the halves cannot be paired', async () => {
    const provider = { route: async () => { throw Object.assign(new Error('none'), { code: 'ZERO_RESULTS' }); } };
    await expect(generateTwoLoopRoutes({ start, distanceKm: 5, provider, rng: seeded(2) })).rejects.toMatchObject({ code: 'NO_PAIRS' });
  });

  it('measures the same street as shared when the two routes start 3 km apart on it', async () => {
    const { routeOverlap } = await import('../src/core/geo.js');
    // One 3 km north-south street, walked from its south end and from its north end: the paths
    // start at latitudes 3 km apart, which used to put them on grids that no longer lined up.
    const street = Array.from({ length: 31 }, (_, i) => ({ lat: 52.1 + i * 0.0009, lng: 5.1 }));
    const fromSouth = street;
    const fromNorth = street.slice().reverse();
    expect(routeOverlap(fromSouth, fromNorth)).toBeGreaterThan(0.95);
    expect(routeOverlap(fromNorth, fromSouth)).toBeCloseTo(routeOverlap(fromSouth, fromNorth), 6);
  });
});
