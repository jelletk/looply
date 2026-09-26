import { describe, it, expect } from 'vitest';
import { sunTimes, skyPhase } from '../src/core/sun.js';

const MIN = 60 * 1000;

// Reference times from Open-Meteo (daily sunrise/sunset), converted to UTC.
const CASES = [
  { name: 'Utrecht, winter solstice', date: '2025-12-21', lat: 52.09, lng: 5.12, rise: '07:45', set: '15:29' },
  { name: 'Utrecht, spring equinox', date: '2026-03-20', lat: 52.09, lng: 5.12, rise: '05:42', set: '17:52' },
  { name: 'Utrecht, summer solstice', date: '2026-06-21', lat: 52.09, lng: 5.12, rise: '03:18', set: '20:03' },
  { name: 'Utrecht, late September', date: '2026-09-26', lat: 52.09, lng: 5.12, rise: '05:31', set: '17:28' },
  { name: 'Wijchen, late September', date: '2026-09-26', lat: 51.81, lng: 5.74, rise: '05:29', set: '17:26' },
];

describe('sunTimes', () => {
  for (const c of CASES) {
    it(`is within 3 minutes of the reference: ${c.name}`, () => {
      // Local noon on that date: the same calendar day in any European time zone.
      const [y, m, d] = c.date.split('-').map(Number);
      const { rise, set } = sunTimes(new Date(y, m - 1, d, 12), c.lat, c.lng);
      expect(Math.abs(rise - Date.parse(`${c.date}T${c.rise}:00Z`))).toBeLessThan(3 * MIN);
      expect(Math.abs(set - Date.parse(`${c.date}T${c.set}:00Z`))).toBeLessThan(3 * MIN);
    });
  }

  it('returns nulls when the sun does not set (polar day)', () => {
    expect(sunTimes(new Date(2026, 5, 21, 12), 78.2, 15.6)).toEqual({ rise: null, set: null });
  });
});

describe('skyPhase', () => {
  const sun = { rise: Date.UTC(2026, 8, 26, 5, 31), set: Date.UTC(2026, 8, 26, 17, 28) };
  const at = (minutesFromRise) => sun.rise + minutesFromRise * MIN;
  const atSet = (minutesFromSet) => sun.set + minutesFromSet * MIN;

  it('walks night → dawn → day → dusk → night over a day', () => {
    expect(skyPhase(at(-41), sun)).toBe('night');
    expect(skyPhase(at(-39), sun)).toBe('dawn');
    expect(skyPhase(at(59), sun)).toBe('dawn');
    expect(skyPhase(at(61), sun)).toBe('day');
    expect(skyPhase(atSet(-61), sun)).toBe('day');
    expect(skyPhase(atSet(-59), sun)).toBe('dusk');
    expect(skyPhase(atSet(49), sun)).toBe('dusk');
    expect(skyPhase(atSet(51), sun)).toBe('night');
  });

  it('falls back to day without sun times', () => {
    expect(skyPhase(Date.now(), { rise: null, set: null })).toBe('day');
  });
});
