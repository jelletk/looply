// Spur detection on real Google Directions geometry, recorded on 2026-09-24 (tests/fixtures).
// Labels were set by eye from rendered paths; only unambiguous cases are listed.

import { describe, it, expect } from 'vitest';
import { findSpurs, trimStartStem } from '../src/core/geo.js';
import rotterdamFixture from './fixtures/rotterdam-centraal-run-5km.json';
import maarssenFixture from './fixtures/maarssen-vecht-walk-3km.json';

function spurKm(path) {
  const { core } = trimStartStem(path);
  return findSpurs(core).reduce((sum, s) => sum + s.lengthKm, 0);
}

const rotterdam = rotterdamFixture.requests;
const maarssen = maarssenFixture.requests;

describe('findSpurs on recorded Google routes', () => {
  // Out-and-back spikes along a divided road north-east of the loop, way back on the other
  // carriageway ~25 m away. The pre-fix detector reported 0 m for both.
  it.each([4, 14])('catches the divided-road spike in Rotterdam #%i', (i) => {
    expect(spurKm(rotterdam[i].path)).toBeGreaterThan(0.08);
  });

  // Visually clean loops, several along the Vecht with towpaths beside the road.
  it.each([3, 4, 13, 26, 41, 45, 51, 52, 58, 59, 61])('keeps Maarssen #%i clean', (i) => {
    expect(spurKm(maarssen[i].path)).toBeLessThan(0.03);
  });

  it.each([23, 29])('keeps Rotterdam #%i clean', (i) => {
    expect(spurKm(rotterdam[i].path)).toBeLessThan(0.03);
  });
});
