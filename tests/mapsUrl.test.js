import { describe, it, expect } from 'vitest';
import { googleMapsDirectionsUrl } from '../src/core/mapsUrl.js';

const start = { lat: 52.0907, lng: 5.1214 };

function route(overrides = {}) {
  return {
    id: 'x',
    name: 'Test',
    mode: 'walk',
    start,
    waypoints: [
      { lat: 52.1, lng: 5.13 },
      { lat: 52.095, lng: 5.14 },
    ],
    ...overrides,
  };
}

describe('googleMapsDirectionsUrl', () => {
  it('builds the api=1 directions URL with origin = destination = start', () => {
    const url = googleMapsDirectionsUrl(route());
    expect(url.startsWith('https://www.google.com/maps/dir/?api=1&')).toBe(true);
    expect(url).toContain('origin=52.090700%2C5.121400');
    expect(url).toContain('destination=52.090700%2C5.121400');
    expect(url).toContain('waypoints=52.100000%2C5.130000%7C52.095000%2C5.140000');
    expect(url).toContain('travelmode=walking');
  });

  it('maps run to walking and bike to bicycling', () => {
    expect(googleMapsDirectionsUrl(route({ mode: 'run' }))).toContain('travelmode=walking');
    expect(googleMapsDirectionsUrl(route({ mode: 'bike' }))).toContain('travelmode=bicycling');
  });

  it('caps waypoints at 9', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ lat: 52 + i * 0.001, lng: 5 + i * 0.001 }));
    const url = googleMapsDirectionsUrl(route({ waypoints: many }));
    const wp = decodeURIComponent(new URL(url).searchParams.get('waypoints'));
    expect(wp.split('|')).toHaveLength(9);
    expect(wp.split('|')[0]).toBe('52.000000,5.000000');
  });

  it('omits the waypoints parameter when there are none', () => {
    const url = googleMapsDirectionsUrl(route({ waypoints: [] }));
    expect(url).not.toContain('waypoints=');
    expect(url).toContain('travelmode=walking');
  });
});
