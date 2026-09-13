import { describe, it, expect } from 'vitest';
import { createMockProvider } from '../src/core/providers/mock.js';
import { pathLengthKm, destinationPoint, findSpurs } from '../src/core/geo.js';

const start = { lat: 52.0907, lng: 5.1214 };

describe('createMockProvider', () => {
  it('returns a path starting and ending at start with wobbled distance', async () => {
    const provider = createMockProvider({ delayMs: 0, wobble: 0.15 });
    const waypoints = [destinationPoint(start, 0, 1), destinationPoint(start, 90, 1)];
    const { distanceKm, path } = await provider.route({ start, waypoints, mode: 'walk' });
    expect(path[0]).toEqual(start);
    expect(path[path.length - 1]).toEqual(start);
    expect(distanceKm).toBeCloseTo(pathLengthKm(path) * 1.15, 6);
  });

  it('is deterministic', async () => {
    const provider = createMockProvider({ delayMs: 0 });
    const waypoints = [destinationPoint(start, 45, 1)];
    const a = await provider.route({ start, waypoints, mode: 'run' });
    const b = await provider.route({ start, waypoints, mode: 'run' });
    expect(a).toEqual(b);
  });

  it('honours wobble = 0', async () => {
    const provider = createMockProvider({ delayMs: 0, wobble: 0 });
    const waypoints = [destinationPoint(start, 0, 1)];
    const { distanceKm } = await provider.route({ start, waypoints, mode: 'bike' });
    expect(distanceKm).toBeCloseTo(2, 6);
  });

  it('throws UNKNOWN on an invalid start', async () => {
    const provider = createMockProvider({ delayMs: 0 });
    await expect(provider.route({ start: {}, waypoints: [], mode: 'walk' })).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
  });

  it('adds a spur every Nth request and returns a clean path for a repaired request', async () => {
    const provider = createMockProvider({ delayMs: 0, spurEvery: 2 });
    const waypoints = [destinationPoint(start, 0, 1.5), destinationPoint(start, 60, 1.5), destinationPoint(start, 120, 1.5)];
    const first = await provider.route({ start, waypoints, mode: 'walk' });
    expect(findSpurs(first.path)).toEqual([]);
    const second = await provider.route({ start, waypoints, mode: 'walk' });
    const spurs = findSpurs(second.path);
    expect(spurs).toHaveLength(1);
    expect(spurs[0].lengthKm).toBeCloseTo(0.4, 1);
    expect(second.distanceKm).toBeGreaterThan(first.distanceKm);
    // Repaired: a waypoint on the previous path → clean, even though it is the 4th request.
    await provider.route({ start, waypoints, mode: 'walk' });
    const onPath = second.path[10];
    const repaired = await provider.route({ start, waypoints: [waypoints[0], onPath, waypoints[2]], mode: 'walk' });
    expect(findSpurs(repaired.path)).toEqual([]);
  });
});
