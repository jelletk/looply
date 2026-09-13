import { describe, it, expect } from 'vitest';
import { createMockProvider } from '../src/core/providers/mock.js';
import { pathLengthKm, destinationPoint } from '../src/core/geo.js';

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
});
