import { describe, it, expect, vi } from 'vitest';
import { createGoogleProvider, decodePolyline } from '../src/core/providers/google.js';

const start = { lat: 52.0907, lng: 5.1214 };
const waypoints = [
  { lat: 52.1, lng: 5.13 },
  { lat: 52.095, lng: 5.14 },
];

function latLngObj(lat, lng) {
  return { lat: () => lat, lng: () => lng };
}

function okResult(pathPoints) {
  return {
    status: 'OK',
    routes: [
      {
        legs: [{ distance: { value: 1500 } }, { distance: { value: 2000 } }, { distance: { value: 1700 } }],
        overview_path: pathPoints,
      },
    ],
  };
}

function fakeGoogle(routeImpl) {
  const route = vi.fn(routeImpl);
  return {
    google: {
      maps: {
        DirectionsService: class {
          route(...args) {
            return route(...args);
          }
        },
        TravelMode: { WALKING: 'WALKING', BICYCLING: 'BICYCLING' },
      },
    },
    route,
  };
}

describe('createGoogleProvider', () => {
  it('builds the request and sums legs (promise form, LatLng objects)', async () => {
    const { google, route } = fakeGoogle(async () =>
      okResult([latLngObj(52.0907, 5.1214), latLngObj(52.1, 5.13), latLngObj(52.0907, 5.1214)]),
    );
    const provider = createGoogleProvider(google);
    const result = await provider.route({ start, waypoints, mode: 'walk' });

    expect(result.distanceKm).toBeCloseTo(5.2, 9);
    expect(result.path).toEqual([
      { lat: 52.0907, lng: 5.1214 },
      { lat: 52.1, lng: 5.13 },
      { lat: 52.0907, lng: 5.1214 },
    ]);

    const request = route.mock.calls[0][0];
    expect(request.origin).toEqual(start);
    expect(request.destination).toEqual(start);
    expect(request.travelMode).toBe('WALKING');
    expect(request.optimizeWaypoints).toBe(false);
    expect(request.avoidHighways).toBe(true);
    expect(request.waypoints).toHaveLength(2);
    expect(request.waypoints[0].location).toEqual(waypoints[0]);
  });

  it('maps via: true to stopover: false', async () => {
    const { google, route } = fakeGoogle(async () => okResult([{ lat: 52, lng: 5 }]));
    const provider = createGoogleProvider(google);
    await provider.route({ start, waypoints: [{ ...waypoints[0], via: true }, waypoints[1]], mode: 'walk' });
    const request = route.mock.calls[0][0];
    expect(request.waypoints[0]).toEqual({ location: waypoints[0], stopover: false });
    expect(request.waypoints[1]).toEqual({ location: waypoints[1], stopover: true });
  });

  it('maps run → WALKING and bike → BICYCLING', async () => {
    const { google, route } = fakeGoogle(async () => okResult([{ lat: 52, lng: 5 }]));
    const provider = createGoogleProvider(google);
    await provider.route({ start, waypoints, mode: 'run' });
    await provider.route({ start, waypoints, mode: 'bike' });
    expect(route.mock.calls[0][0].travelMode).toBe('WALKING');
    expect(route.mock.calls[1][0].travelMode).toBe('BICYCLING');
  });

  it('supports the callback form and plain-number paths', async () => {
    const { google } = fakeGoogle((request, cb) => {
      cb(okResult([{ lat: 52, lng: 5 }, { lat: 52.01, lng: 5.01 }]), 'OK');
    });
    const provider = createGoogleProvider(google);
    const result = await provider.route({ start, waypoints, mode: 'walk' });
    expect(result.path).toEqual([{ lat: 52, lng: 5 }, { lat: 52.01, lng: 5.01 }]);
  });

  it('decodes overview_polyline when overview_path is absent', async () => {
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const { google } = fakeGoogle(async () => ({
      routes: [{ legs: [{ distance: { value: 1000 } }], overview_polyline: { points: encoded } }],
    }));
    const provider = createGoogleProvider(google);
    const result = await provider.route({ start, waypoints, mode: 'walk' });
    expect(result.path).toHaveLength(3);
    expect(result.path[0].lat).toBeCloseTo(38.5, 5);
    expect(result.path[0].lng).toBeCloseTo(-120.2, 5);
  });

  it('maps a rejected promise with a known status to the same code', async () => {
    const { google } = fakeGoogle(async () => {
      throw Object.assign(new Error('denied'), { code: 'REQUEST_DENIED' });
    });
    const provider = createGoogleProvider(google);
    await expect(provider.route({ start, waypoints, mode: 'walk' })).rejects.toMatchObject({
      code: 'REQUEST_DENIED',
    });
  });

  it('maps callback statuses and unknown statuses', async () => {
    const zero = fakeGoogle((req, cb) => cb(null, 'ZERO_RESULTS'));
    await expect(
      createGoogleProvider(zero.google).route({ start, waypoints, mode: 'walk' }),
    ).rejects.toMatchObject({ code: 'ZERO_RESULTS' });

    const limit = fakeGoogle(async () => {
      throw Object.assign(new Error('limit'), { code: 'OVER_QUERY_LIMIT' });
    });
    await expect(
      createGoogleProvider(limit.google).route({ start, waypoints, mode: 'walk' }),
    ).rejects.toMatchObject({ code: 'OVER_QUERY_LIMIT' });

    const weird = fakeGoogle((req, cb) => cb(null, 'NOT_FOUND'));
    await expect(
      createGoogleProvider(weird.google).route({ start, waypoints, mode: 'walk' }),
    ).rejects.toMatchObject({ code: 'UNKNOWN' });

    const thrown = fakeGoogle(async () => {
      throw new Error('network');
    });
    await expect(
      createGoogleProvider(thrown.google).route({ start, waypoints, mode: 'walk' }),
    ).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('throws when google.maps is missing', () => {
    expect(() => createGoogleProvider({})).toThrow();
  });
});

describe('decodePolyline', () => {
  it('decodes the reference example', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(pts).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });
});
