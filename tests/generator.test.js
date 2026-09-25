import { describe, it, expect, vi } from 'vitest';
import {
  generateRoutes,
  maxProviderCallsFor,
  buildLoopWaypoints,
  compassLabel,
  defaultToleranceKm,
  inspectPath,
  cutSpurs,
  polishWaypoints,
  scaledPolishWaypoints,
  pathCentroid,
  requestKey,
  withRequestCache,
} from '../src/core/generator.js';
import { createMockProvider } from '../src/core/providers/mock.js';
import {
  haversineKm,
  pathLengthKm,
  routeOverlap,
  selfOverlapFraction,
  findSpurs,
  destinationPoint,
  spurStemAtStart,
} from '../src/core/geo.js';

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
  it('returns pointCount points clamped to 2–6', () => {
    const args = { start, distanceKm: 5, bearingDeg: 0, rng: seeded(1) };
    expect(buildLoopWaypoints({ ...args, pointCount: 3 })).toHaveLength(3);
    expect(buildLoopWaypoints({ ...args, pointCount: 1 })).toHaveLength(2);
    expect(buildLoopWaypoints({ ...args, pointCount: 9 })).toHaveLength(6);
  });

  it('makes a loop through start whose straight-line length is close to the target', () => {
    for (const bearing of [0, 90, 200, 300]) {
      for (const pointCount of [2, 3, 4, 5]) {
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

  it('builds an ellipse family that also hits the target length', () => {
    for (const bearing of [0, 90, 200, 300]) {
      for (const pointCount of [2, 3, 4]) {
        const wps = buildLoopWaypoints({ start, distanceKm: 1.5, bearingDeg: bearing, pointCount, shape: 'ellipse', rng: () => 0.5 });
        expect(wps).toHaveLength(pointCount);
        const len = pathLengthKm([start, ...wps, start]);
        expect(len).toBeGreaterThan(1.5 * 0.97);
        expect(len).toBeLessThan(1.5 * 1.03);
        for (const p of wps) expect(haversineKm(start, p)).toBeLessThan(0.75);
      }
    }
    const circle = buildLoopWaypoints({ start, distanceKm: 1.5, bearingDeg: 90, pointCount: 3, rng: () => 0.5 });
    const ellipse = buildLoopWaypoints({ start, distanceKm: 1.5, bearingDeg: 90, pointCount: 3, shape: 'ellipse', orientationDeg: 0, rng: () => 0.5 });
    expect(ellipse).not.toEqual(circle);
  });

  it('scales with distance', () => {
    const small = buildLoopWaypoints({ start, distanceKm: 2, bearingDeg: 0, pointCount: 3, rng: () => 0.5 });
    const large = buildLoopWaypoints({ start, distanceKm: 20, bearingDeg: 0, pointCount: 3, rng: () => 0.5 });
    expect(pathLengthKm([start, ...large, start])).toBeCloseTo(pathLengthKm([start, ...small, start]) * 10, 1);
  });
});

describe('cutSpurs / polishWaypoints', () => {
  const square = [start, destinationPoint(start, 0, 1), destinationPoint(destinationPoint(start, 0, 1), 90, 1), destinationPoint(start, 90, 1), start];

  it('cuts the spur vertices out and keeps the base', () => {
    const base = square[2];
    const tip = destinationPoint(base, 45, 0.1);
    const path = [square[0], square[1], base, tip, base, square[3], square[4]];
    const spurs = findSpurs(path);
    expect(spurs).toHaveLength(1);
    const cleaned = cutSpurs(path, spurs);
    expect(cleaned.some((p) => haversineKm(p, tip) < 0.001)).toBe(false);
    expect(pathLengthKm(cleaned)).toBeCloseTo(4, 1);
    expect(cutSpurs(path, [])).toEqual(path);
  });

  it('places via points on real vertices at equal arc-length fractions', () => {
    const dense = [];
    for (let i = 1; i < square.length; i++) {
      const a = square[i - 1];
      const b = square[i];
      for (let s = 0; s < 10; s++) dense.push({ lat: a.lat + ((b.lat - a.lat) * s) / 10, lng: a.lng + ((b.lng - a.lng) * s) / 10 });
    }
    dense.push(start);
    const wps = polishWaypoints(dense, 3);
    expect(wps).toHaveLength(3);
    for (const w of wps) {
      expect(w.via).toBe(true);
      expect(dense.some((p) => p.lat === w.lat && p.lng === w.lng)).toBe(true);
    }
    // 1/4, 1/2, 3/4 of a 4 km square: the three far corners.
    expect(haversineKm(wps[0], square[1])).toBeLessThan(0.001);
    expect(haversineKm(wps[1], square[2])).toBeLessThan(0.001);
    expect(haversineKm(wps[2], square[3])).toBeLessThan(0.001);
    expect(polishWaypoints([start], 3)).toEqual([]);
  });
});

describe('scaledPolishWaypoints / pathCentroid', () => {
  const sq = [start, destinationPoint(start, 0, 1), destinationPoint(destinationPoint(start, 0, 1), 90, 1), destinationPoint(start, 90, 1), start];

  it('finds the centroid of a square loop at its centre', () => {
    const c = pathCentroid(sq);
    const centre = destinationPoint(destinationPoint(start, 0, 0.5), 90, 0.5);
    expect(haversineKm(c, centre)).toBeLessThan(0.02);
  });

  it('scales via points radially around the centroid, and leaves them alone for factor 1', () => {
    const dense = [];
    for (let i = 1; i < sq.length; i++) {
      for (let s = 0; s < 10; s++) dense.push({ lat: sq[i - 1].lat + ((sq[i].lat - sq[i - 1].lat) * s) / 10, lng: sq[i - 1].lng + ((sq[i].lng - sq[i - 1].lng) * s) / 10 });
    }
    dense.push(start);
    const same = scaledPolishWaypoints(dense, 3, 1);
    expect(same).toEqual(polishWaypoints(dense, 3));
    const bigger = scaledPolishWaypoints(dense, 3, 1.5);
    const c = pathCentroid(dense);
    same.forEach((p, i) => {
      expect(haversineKm(c, bigger[i])).toBeCloseTo(haversineKm(c, p) * 1.5, 2);
      expect(bigger[i].via).toBe(true);
    });
  });
});

describe('request cache', () => {
  const wps = [destinationPoint(start, 0, 1), destinationPoint(start, 90, 1)];

  it('keys requests by mode, start and waypoints rounded to ~20 m', () => {
    const a = requestKey({ start, waypoints: wps, mode: 'walk' });
    const nudged = wps.map((p) => destinationPoint(p, 45, 0.0003));
    expect(requestKey({ start, waypoints: nudged, mode: 'walk' })).toBe(a);
    const moved = wps.map((p) => destinationPoint(p, 45, 0.1));
    expect(requestKey({ start, waypoints: moved, mode: 'walk' })).not.toBe(a);
    expect(requestKey({ start, waypoints: wps, mode: 'bike' })).not.toBe(a);
    expect(requestKey({ start, waypoints: wps.map((p) => ({ ...p, via: true })), mode: 'walk' })).not.toBe(a);
  });

  it('sends an identical request once, even while the first one is still in flight', async () => {
    const provider = createMockProvider({ delayMs: 5 });
    const spy = vi.spyOn(provider, 'route');
    const cached = withRequestCache(provider);
    const [a, b] = await Promise.all([
      cached.route({ start, waypoints: wps, mode: 'walk' }),
      cached.route({ start, waypoints: wps.map((p) => destinationPoint(p, 10, 0.0003)), mode: 'walk' }),
    ]);
    const c = await cached.route({ start, waypoints: wps, mode: 'walk' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(cached.hits).toBe(2);
    expect(cached.misses).toBe(1);
  });

  it('is applied inside generateRoutes: repeated polish requests do not cost provider calls', async () => {
    // Every request comes back as the same clean 5.5 km loop whatever the waypoints, so every
    // candidate's rescue polish is the same request: it must be sent once, not once per candidate.
    const loop = [start, destinationPoint(start, 0, 1.4), destinationPoint(destinationPoint(start, 0, 1.4), 90, 1.35), destinationPoint(start, 90, 1.35), start];
    const provider = { route: async () => ({ distanceKm: 5.5, path: loop }) };
    const spy = vi.spyOn(provider, 'route');
    const progress = vi.fn();
    await expect(generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, rng: seeded(2), onProgress: progress })).rejects.toMatchObject({ code: 'NO_ROUTES' });
    const last = progress.mock.calls.at(-1)[0];
    expect(last.calls).toBe(spy.mock.calls.length);
    // 8 candidates per pass × several passes, each with a first request that differs per bearing, but the
    // polish requests coincide: far fewer provider calls than requests attempted.
    const polish = spy.mock.calls.filter((c) => c[0].waypoints.some((w) => w.via)).length;
    expect(polish).toBeGreaterThan(0);
    expect(polish).toBeLessThan(8);
  });
});

describe('polish and rescue', () => {
  it('polishes a dirty candidate from its spur-cut loop, scaled towards the target', async () => {
    // Every other request grows a 1 km out-and-back at the second waypoint: 5 km loop → ~7 km with a
    // 1 km spur. The spur-cut loop is a sensible 5–6 km, so it must be polished (via points), not
    // rebuilt as a smaller circle — and the polish points are scaled, so they do not all sit on
    // the previous path.
    const provider = createMockProvider({ delayMs: 0, wobble: 0.15, spurEvery: 2, spurKm: 1.0 });
    const spy = vi.spyOn(provider, 'route');
    const routes = await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, rng: seeded(21) });
    expect(routes.length).toBeGreaterThanOrEqual(5);
    for (const r of routes) {
      expect(Math.abs(r.distanceKm - 5)).toBeLessThanOrEqual(0.3);
      expect(findSpurs(r.path)).toEqual([]);
    }
    const results = await Promise.all(spy.mock.results.map((res) => res.value));
    const spurred = results.filter((res) => findSpurs(res.path).length > 0);
    expect(spurred.length).toBeGreaterThan(0);
    const polishIdx = spy.mock.calls.map((c, i) => (c[0].waypoints.some((w) => w.via === true) ? i : -1)).filter((i) => i >= 0);
    expect(polishIdx.length).toBeGreaterThan(0);
    // A polish point sits on a path returned earlier (factor 1) or is a scaled copy of one (off every earlier path).
    const onEarlierPath = (p, i) => results.slice(0, i).some((res) => res.path.some((q) => haversineKm(p, q) < 0.001));
    const scaled = polishIdx.filter((i) => spy.mock.calls[i][0].waypoints.some((w) => !onEarlierPath(w, i)));
    expect(scaled.length).toBeGreaterThan(0);
  });

  it('rescues a clean loop that is out of tolerance by scaling its own path', async () => {
    // No spurs at all; the 15 % wobble puts every first result at ~5.75 km, outside ±0.3 km.
    // The rescue re-requests via points on that loop, scaled down around its centroid.
    const provider = createMockProvider({ delayMs: 0, wobble: 0.15 });
    const spy = vi.spyOn(provider, 'route');
    const routes = await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, rng: seeded(42) });
    expect(routes.length).toBeGreaterThanOrEqual(5);
    const reqs = spy.mock.calls.map((c) => c[0]);
    const rescues = reqs.filter((req) => req.waypoints.every((w) => w.via === true));
    expect(rescues.length).toBeGreaterThan(0);
    // The rescued loops are smaller than the first attempts, and the routes come from them.
    const firstSpan = Math.max(...reqs.filter((r) => !r.waypoints.some((w) => w.via)).map((r) => Math.max(...r.waypoints.map((w) => haversineKm(start, w)))));
    const rescueSpan = Math.max(...rescues.map((r) => Math.max(...r.waypoints.map((w) => haversineKm(start, w)))));
    expect(rescueSpan).toBeLessThan(firstSpan);
    for (const r of routes) expect(Math.abs(r.distanceKm - 5)).toBeLessThanOrEqual(0.3);
  });

  it('spends at most maxAttemptsPerRoute requests on one candidate', async () => {
    const provider = createMockProvider({ delayMs: 0, wobble: 0.5 }); // never within tolerance in one step
    const spy = vi.spyOn(provider, 'route');
    await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, maxAttemptsPerRoute: 2, maxProviderCalls: 16, rng: seeded(5) }).catch(() => {});
    expect(spy.mock.calls.length).toBeLessThanOrEqual(16);
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
      expect(r.waypoints.length).toBeLessThanOrEqual(6);
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

  it('repairs spurs: with spurEvery 4 every returned route is a clean loop', async () => {
    const provider = createMockProvider({ delayMs: 0, spurEvery: 4 });
    const routeSpy = vi.spyOn(provider, 'route');
    const routes = await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, rng: seeded(21) });
    expect(routes.length).toBeGreaterThanOrEqual(5);
    for (const r of routes) {
      expect(Math.abs(r.distanceKm - 5)).toBeLessThanOrEqual(0.3);
      expect(selfOverlapFraction(r.path)).toBeLessThanOrEqual(0.06);
      expect(findSpurs(r.path)).toEqual([]);
      expect(r.waypoints.length).toBeGreaterThanOrEqual(2);
      for (const w of r.waypoints) expect(Object.keys(w).sort()).toEqual(['lat', 'lng']);
    }
    // The spurred responses were actually seen and repaired (some paths contained a spur).
    const spurred = await Promise.all(routeSpy.mock.results.map((res) => res.value));
    expect(spurred.some((res) => findSpurs(res.path).length > 0)).toBe(true);
  });

  it('polishes short (50 m) stubs away with via waypoints on the route itself', async () => {
    const provider = createMockProvider({ delayMs: 0, spurEvery: 2, spurKm: 0.05 });
    const routeSpy = vi.spyOn(provider, 'route');
    const routes = await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, rng: seeded(31) });
    expect(routes.length).toBeGreaterThanOrEqual(5);
    for (const r of routes) {
      expect(Math.abs(r.distanceKm - 5)).toBeLessThanOrEqual(0.3);
      expect(findSpurs(r.path)).toEqual([]);
    }
    const results = await Promise.all(routeSpy.mock.results.map((res) => res.value));
    const spurred = results.filter((res) => findSpurs(res.path).length > 0);
    expect(spurred.length).toBeGreaterThan(0);

    // At least one polish request was made, and its via points all lie on an earlier response's path.
    const polishRequests = routeSpy.mock.calls.map((c) => c[0]).filter((req) => req.waypoints.some((w) => w.via === true));
    expect(polishRequests.length).toBeGreaterThan(0);
    const onSomePath = (p) =>
      results.some((res) => res.path.some((q) => haversineKm(p, q) < 0.001));
    for (const req of polishRequests) {
      expect(req.waypoints.length).toBeGreaterThanOrEqual(3);
      for (const w of req.waypoints) expect(onSomePath(w)).toBe(true);
    }
  });

  it('does not count the start stem: a loop reached through a cul-de-sac is accepted', async () => {
    // 1.1 km square loop entered through a 200 m stem south of its first corner: 1.5 km in total.
    const junction = { lat: start.lat + 0.005, lng: start.lng };
    const stemStart = destinationPoint(junction, 180, 0.2);
    const side = 0.275;
    const b = destinationPoint(junction, 0, side);
    const c = destinationPoint(b, 90, side);
    const d = destinationPoint(junction, 90, side);
    const path = [stemStart, junction, b, c, d, junction, stemStart];
    const provider = { route: async () => ({ distanceKm: pathLengthKm(path), path }) };
    expect(spurStemAtStart(path).lengthKm).toBeCloseTo(0.2, 1);
    expect(selfOverlapFraction(path)).toBeGreaterThan(0.06); // the raw metric alone would reject it
    const routes = await generateRoutes({ start: stemStart, distanceKm: 1.5, mode: 'walk', provider, rng: seeded(8) });
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe(path);
  });

  it('returns ≥5 spur-free routes for a 1.5 km walk in a dense grid (mock with 50 m stubs)', async () => {
    const provider = createMockProvider({ delayMs: 0, wobble: 0.1, spurEvery: 3, spurKm: 0.05 });
    const progress = vi.fn();
    const routes = await generateRoutes({ start, distanceKm: 1.5, mode: 'walk', provider, rng: seeded(15), onProgress: progress });
    expect(routes.length).toBeGreaterThanOrEqual(5);
    for (const r of routes) {
      expect(Math.abs(r.distanceKm - 1.5)).toBeLessThanOrEqual(0.3);
      expect(findSpurs(r.path)).toEqual([]);
      expect(inspectPath(r.path).clean).toBe(true);
    }
    const last = progress.mock.calls.at(-1)[0];
    expect(last.calls).toBeLessThanOrEqual(60);
  });

  it('budgets 60 requests below 3 km and 120 from 3 km', () => {
    expect(maxProviderCallsFor(1.5)).toBe(60);
    expect(maxProviderCallsFor(2.99)).toBe(60);
    expect(maxProviderCallsFor(3)).toBe(120);
    expect(maxProviderCallsFor(30)).toBe(120);
  });

  it('never makes more than maxProviderCalls requests and reports the count', async () => {
    const provider = createMockProvider({ delayMs: 0, wobble: 0.15 });
    const routeSpy = vi.spyOn(provider, 'route');
    const progress = vi.fn();
    const routes = await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider, maxProviderCalls: 9, rng: seeded(12), onProgress: progress });
    expect(routeSpy.mock.calls.length).toBeLessThanOrEqual(9);
    expect(routes.length).toBeGreaterThanOrEqual(1);
    const last = progress.mock.calls.at(-1)[0];
    expect(last.calls).toBe(routeSpy.mock.calls.length);
    expect(last.done).toBe(last.total);

    const generous = createMockProvider({ delayMs: 0, wobble: 0.15 });
    const generousSpy = vi.spyOn(generous, 'route');
    await generateRoutes({ start, distanceKm: 5, mode: 'walk', provider: generous, rng: seeded(12) });
    expect(generousSpy.mock.calls.length).toBeLessThanOrEqual(60);
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
    expect(last.total).toBeGreaterThanOrEqual(16);
    expect(last.total % 8).toBe(0);
    expect(last.calls).toBeGreaterThan(6);
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
