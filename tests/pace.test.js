import { describe, it, expect } from 'vitest';
import {
  estimateDurationMin,
  formatDuration,
  formatKm,
  formatPace,
  formatShortDistance,
  formatSpeed,
  setSpeeds,
} from '../src/core/pace.js';

describe('estimateDurationMin', () => {
  it('uses 5 / 10 / 22 km/h by default', () => {
    expect(estimateDurationMin(5, 'walk')).toBeCloseTo(60);
    expect(estimateDurationMin(5, 'run')).toBeCloseTo(30);
    expect(estimateDurationMin(22, 'bike')).toBeCloseTo(60);
  });

  it('uses the speeds set by the user', () => {
    setSpeeds({ run: 12 });
    expect(estimateDurationMin(6, 'run')).toBeCloseTo(30);
    expect(estimateDurationMin(5, 'walk')).toBeCloseTo(60); // unset modes keep the default
    setSpeeds({});
    expect(estimateDurationMin(5, 'run')).toBeCloseTo(30);
  });

  it('falls back to walking for unknown modes and 0 for bad input', () => {
    expect(estimateDurationMin(5, 'hover')).toBeCloseTo(60);
    expect(estimateDurationMin(-1, 'walk')).toBe(0);
    expect(estimateDurationMin(NaN, 'walk')).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats minutes under an hour', () => {
    expect(formatDuration(25)).toBe('25 min');
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(59.4)).toBe('59 min');
  });

  it('formats hours with zero-padded minutes', () => {
    expect(formatDuration(65)).toBe('1 u 05 min');
    expect(formatDuration(120)).toBe('2 u');
    expect(formatDuration(59.6)).toBe('1 u');
  });
});

describe('formatPace / formatSpeed / formatShortDistance', () => {
  it('shows running speed as min/km', () => {
    expect(formatPace(10)).toBe('6:00 min/km');
    expect(formatPace(10.4)).toBe('5:46 min/km');
  });

  it('shows km/u with a Dutch comma', () => {
    expect(formatSpeed(5)).toBe('5,0 km/u');
  });

  it('uses metres below 1 km', () => {
    expect(formatShortDistance(0.76)).toBe('750 m');
    expect(formatShortDistance(1.24)).toBe('1,2 km');
  });
});

describe('formatKm', () => {
  it('uses a Dutch comma and one decimal', () => {
    expect(formatKm(5.1)).toBe('5,1 km');
    expect(formatKm(5)).toBe('5,0 km');
    expect(formatKm(12.345)).toBe('12,3 km');
  });
});
