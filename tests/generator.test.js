import { describe, it, expect, vi } from 'vitest';
import { generateRoutes, buildLoopWaypoints, compassLabel, defaultToleranceKm } from '../src/core/generator.js';
import { createMockProvider } from '../src/core/providers/mock.js';
import { haversineKm, pathLengthKm, routeOverlap, selfOverlapFraction, findSpurs } from '../src/core/geo.js';

const start = { lat: 52.0907, lng: 5.1214 };

/** Small deterministic PRNG (mulberry32). */
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

describe('compassLabel', () => {
  it('maps bearings to Dutch compass points', () => {
    expect(compassLabel(0)).toBe('N');
    expect(compassLabel(44)).toBe('NO');
    expect(compassLabel(90)).toBe('O');
    expect(compassLabel(135)).toBe('ZO');
    expect(compassLabel(180)).toBe('Z');
    expect(compassLabel(225)).toBe('ZW');
    expect(compassLabel(270)).toBe('W');
    expect(compassLabel(315)).toBe('NW');
    expect(compassLabel(359)).toBe('N');
  });
});

describe('buildLoopWaypoints', () => {
  it('returns pointCount points clamped to 2–4', () => {
    const args = { start, distanceKm: 5, bearingDeg: 0, rng: seeded(1) };
    expect(buildLoopWaypoints({ ...args, pointCount: 3 })).toHaveLength(3);
    expect(buildLoopWaypoints({ ...args, pointCount: 1 })).toHaveLength(2);
    expect(buildLoopWaypoints({ ...args, pointCount: 9 })).toHaveLength(4);
  });

  it('makes a loop through start whose straight-line length is close to the target', () => {
    for (const bearing of [0, 90, 200, 300]) {
      for (const pointCount of [2, 3, 4]) {
        const wps = buildLoopWaypoints({ start, distanceKm: 5, bearingDeg: bearing, pointCount, rng: () => 0.5 });
        const len = pathLengthKm([start, ...wps, start]);
        expect(len).toBeGreaterThan(5 * 0.97);
        expect(len).toBeLessThan(5 * 1.03);
      }
    }
  });

  it('puts the loop in the requested direction, all points within half the target of start', () => {
    const wps = buildLoopWaypoints({ start, distanceKm: 5, bearingDeg: 90, pointCount: 3, rng: () => 0.5 });
    for (const p of wps) {
      expect(haversineKm(start, p)).toBeLessThan(2.5);
      expect(p.lng).toBeGreaterThan(start.lng); // east of start
    }
  });

  it('is pure and seed-dependent', () => {
    const a = buildLoopWaypoints({ start, distanceKm: 5, bearingDeg: 45, pointCount: 3, rng: seeded(7) });
    const b = buildLoopWaypoints({ start, distanceKm: 5, bearingDeg: 45, pointCount: 3, rng: seeded(7) });
    const c = buildLoopWaypoints({ start, distanceKm: 5, bearingDeg: 45, pointCount: 3, rng: seeded(8) });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('scales with distance', () => {
    const small = buildLoopWaypoints({ start, distanceKm: 2, bearingDeg: 0, pointCount: 3, rng: () => 0.5 });
    const large = buildLoopWaypoints({ start, distanceKm: 20, bearingDeg: 0, pointCount: 3, rng: () => 0.5 });
    expect(pathLengthKm([start, ...large, start])).toBeCloseTo(pathLengthKm([start, ...small, start]) * 10, 1);
  });
});

describe('defaultToleranceKm', () => {
  it('is ±0.3 km for walk/run and ±1.0 km for bike', () => {
    expect(defaultToleranceKm('walk')).toBe(0.3);
    expect(defaultToleranceKm('run')).toBe(0.3);
    expect(defaultToleranceKm('bike')).toBe(1.0);
  });
});

describe('generateRoutes with the mock provider', () => {
  it('returns ≥5 routes within ±0.3 km for a 5 km walk, sorted by closeness', async () => {
    const provider = createMockProvider({ delayMs: 0, wobble: 0.15 });
    const routeSpy = vi.spyOn(provider, 'route');
    const progress = vi.fn();

    const routes = await generateRoutes({
      start,
      distanceKm: 5,
      mode: 'walk',
      provider,
      rng: seeded(42),
      onProgress: progress,
    });

    expect(routes.length).toBeGreaterThanOrEqual(5);
    for (const r of routes) {
      expect(Math.abs(r.distanceKm - 5)).toBeLessThanOrEqual(0.3);
      expect(r.mode).toBe('walk');
      expect(r.start).toEqual(start);
      expect(r.waypoints.length).toBeGreaterThanOrEqual(2);
      expect(r.waypoints.length).toBeLessThanOrEqual(4);
      expect(r.path[0]).toEqual(start);
      expect(r.path[r.path.length - 1]).toEqual(start);
      expect(r.id).toBeTypeOf('string');
      expect(r.name).toMatch(/^Rondje (N|NO|O|ZO|Z|ZW|W|NW) · \d+,\d km$/);
      expect(r.durationMin).toBeCloseTo((r.distanceKm / 5) * 60, 6);
      expect(new Date(r.createdAt).toISOString()).toBe(r.createdAt);
      expect(r.bearingDeg).toBeGreaterThanOrEqual(0);
      expect(r.bearingDeg).toBeLessThan(360);
    }

    const errors = routes.map((r) => Math.abs(r.distanceKm - 5));
    expect([...errors].sort((a, b) => a - b)).toEqual(errors);

    // The 15% wobble pushes the first attempt out of tolerance, so retries happen.
    expect(routeSpy.mock.calls.length).toBeGreaterThan(6);

    expect(progress).toHaveBeenCalled();
    const last = progress.mock.calls.at(-1)[0];
    expect(last.done).toBe(last.total);
  });

  it('returns ≥5 bike routes within ±1.0 km for 30 km with matching duration estimates', async () => {
    const provider = createMockProvider({ delayMs: 0 });
    const bike = await generateRoutes({ start, distanceKm: 30, mode: 'bike', provider, rng: seeded(3) });
    expect(bike.length).toBeGreaterThanOrEqual(5);
    for (const r of bike) expect(Math.abs(r.distanceKm - 30)).toBeLessThanOrEqual(1.0);
    expect(bike[0].durationMin).toBeCloseTo((bike[0].distanceKm / 18) * 60, 6);
  });

  it('applies an explicit toleranceKm over the mode default', async () => {
    const provider = createMockProvider({ delayMs: 0 });
    const routes = await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, toleranceKm: 0.1, rng: seeded(4) });
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) expect(Math.abs(r.distanceKm - 5)).toBeLessThanOrEqual(0.1);
  });

  it('repairs spurs: with spurEvery 3 every returned route is a clean loop', async () => {
    const provider = createMockProvider({ delayMs: 0, spurEvery: 3 });
    const routeSpy = vi.spyOn(provider, 'route');
    const routes = await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, rng: seeded(21) });
    expect(routes.length).toBeGreaterThanOrEqual(5);
    for (const r of routes) {
      expect(Math.abs(r.distanceKm - 5)).toBeLessThanOrEqual(0.3);
      expect(selfOverlapFraction(r.path)).toBeLessThanOrEqual(0.06);
      expect(findSpurs(r.path).filter((s) => s.lengthKm >= 0.15)).toEqual([]);
      expect(r.waypoints.length).toBeGreaterThanOrEqual(2);
    }
    // The spurred responses were actually seen and repaired (some paths contained a spur).
    const spurred = await Promise.all(routeSpy.mock.results.map((res) => res.value));
    expect(spurred.some((res) => findSpurs(res.path).length > 0)).toBe(true);
  });

  it('discards a candidate whose spur cannot be repaired', async () => {
    // Every response is a 5 km out-and-back regardless of the waypoints.
    const tip = { lat: start.lat + 0.0225, lng: start.lng };
    const provider = { route: async () => ({ distanceKm: 5, path: [start, tip, start] }) };
    await expect(generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, rng: seeded(6) })).rejects.toMatchObject({
      code: 'NO_ROUTES',
    });
  });

  it('dedupes near-identical routes', async () => {
    // Every candidate yields the same path.
    const fixedPath = [start, { lat: 52.1, lng: 5.13 }, { lat: 52.095, lng: 5.14 }, start];
    const provider = { route: async () => ({ distanceKm: 5, path: fixedPath }) };
    const routes = await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, rng: seeded(1) });
    expect(routes).toHaveLength(1);
  });

  it('keeps distinct routes when overlap is below the threshold', async () => {
    const provider = createMockProvider({ delayMs: 0 });
    const routes = await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, rng: seeded(5) });
    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        expect(routeOverlap(routes[i].path, routes[j].path)).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it('propagates REQUEST_DENIED and OVER_QUERY_LIMIT', async () => {
    for (const code of ['REQUEST_DENIED', 'OVER_QUERY_LIMIT']) {
      const provider = {
        route: async () => {
          throw Object.assign(new Error(code), { code });
        },
      };
      await expect(generateRoutes({ start, distanceKm: 5, mode: 'walk', provider })).rejects.toMatchObject({ code });
    }
  });

  it('skips ZERO_RESULTS / UNKNOWN candidates and throws only when nothing survives', async () => {
    const always = {
      route: async () => {
        throw Object.assign(new Error('nothing'), { code: 'ZERO_RESULTS' });
      },
    };
    await expect(generateRoutes({ start, distanceKm: 5, mode: 'walk', provider: always })).rejects.toMatchObject({
      code: 'NO_ROUTES',
    });

    const mock = createMockProvider({ delayMs: 0 });
    let calls = 0;
    const flaky = {
      route: async (req) => {
        calls++;
        if (calls % 3 === 0) throw Object.assign(new Error('unknown'), { code: 'UNKNOWN' });
        return mock.route(req);
      },
    };
    const routes = await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider: flaky, rng: seeded(9) });
    expect(routes.length).toBeGreaterThan(0);
  });

  it('runs a second pass when the first pass yields fewer than 5 routes', async () => {
    const mock = createMockProvider({ delayMs: 0 });
    let calls = 0;
    // First 6 candidate requests fail; later ones succeed.
    const provider = {
      route: async (req) => {
        calls++;
        if (calls <= 6) throw Object.assign(new Error('zero'), { code: 'ZERO_RESULTS' });
        return mock.route(req);
      },
    };
    const progress = vi.fn();
    const routes = await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, rng: seeded(11), onProgress: progress });
    expect(routes.length).toBeGreaterThanOrEqual(1);
    const last = progress.mock.calls.at(-1)[0];
    expect(last.done).toBe(last.total);
    expect(last.total).toBeGreaterThanOrEqual(12);
    expect(last.total % 6).toBe(0);
  });

  it('never returns a route outside the absolute tolerance', async () => {
    // Always 0.5 km over target: outside ±0.3 km, so nothing may be returned.
    const provider = {
      route: async ({ start: s, waypoints }) => ({ distanceKm: 5.5, path: [s, ...waypoints, s] }),
    };
    await expect(
      generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, maxAttemptsPerRoute: 1, rng: seeded(2) }),
    ).rejects.toMatchObject({ code: 'NO_ROUTES' });
  });

  it('validates input', async () => {
    const provider = createMockProvider({ delayMs: 0 });
    await expect(generateRoutes({ start, distanceKm: 0, mode: 'walk', provider })).rejects.toThrow();
    await expect(generateRoutes({ start: {}, distanceKm: 5, mode: 'walk', provider })).rejects.toThrow();
    await expect(generateRoutes({ start, distanceKm: 5, mode: 'walk', provider: {} })).rejects.toThrow();
  });
});
