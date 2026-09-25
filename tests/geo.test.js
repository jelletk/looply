import { describe, it, expect } from 'vitest';
import {
  haversineKm,
  destinationPoint,
  pathLengthKm,
  bearingDeg,
  routeOverlap,
  normalizeBearing,
  densifyPath,
  selfOverlapFraction,
  findSpurs,
  spurCellKm,
  spurStemAtStart,
  trimStartStem,
} from '../src/core/geo.js';

const AMSTERDAM = { lat: 52.3676, lng: 4.9041 };
const UTRECHT = { lat: 52.0907, lng: 5.1214 };

describe('haversineKm', () => {
  it('Amsterdam–Utrecht is about 35 km', () => {
    const d = haversineKm(AMSTERDAM, UTRECHT);
    expect(d).toBeGreaterThan(33);
    expect(d).toBeLessThan(36);
  });

  it('is symmetric and zero for identical points', () => {
    expect(haversineKm(AMSTERDAM, UTRECHT)).toBeCloseTo(haversineKm(UTRECHT, AMSTERDAM), 9);
    expect(haversineKm(UTRECHT, UTRECHT)).toBe(0);
  });
});

describe('destinationPoint', () => {
  it('lands at the requested distance', () => {
    const p = destinationPoint(UTRECHT, 45, 3);
    expect(haversineKm(UTRECHT, p)).toBeCloseTo(3, 6);
  });

  it('round-trips the bearing', () => {
    for (const b of [0, 37, 90, 180, 250, 359]) {
      const p = destinationPoint(UTRECHT, b, 2);
      const diff = Math.abs(((bearingDeg(UTRECHT, p) - b + 540) % 360) - 180);
      expect(diff).toBeLessThan(0.001);
    }
  });

  it('moves north for bearing 0 and east for bearing 90', () => {
    const north = destinationPoint(UTRECHT, 0, 1);
    expect(north.lat).toBeGreaterThan(UTRECHT.lat);
    expect(north.lng).toBeCloseTo(UTRECHT.lng, 9);
    const east = destinationPoint(UTRECHT, 90, 1);
    expect(east.lng).toBeGreaterThan(UTRECHT.lng);
    expect(east.lat).toBeCloseTo(UTRECHT.lat, 4);
  });
});

describe('bearingDeg', () => {
  it('Utrecht → Amsterdam points roughly north-west', () => {
    const b = bearingDeg(UTRECHT, AMSTERDAM);
    expect(b).toBeGreaterThan(320);
    expect(b).toBeLessThan(340);
  });
});

describe('normalizeBearing', () => {
  it('wraps into [0, 360)', () => {
    expect(normalizeBearing(370)).toBe(10);
    expect(normalizeBearing(-90)).toBe(270);
    expect(normalizeBearing(360)).toBe(0);
  });
});

describe('pathLengthKm', () => {
  it('sums the segments', () => {
    const mid = destinationPoint(UTRECHT, 0, 1);
    const end = destinationPoint(mid, 90, 2);
    expect(pathLengthKm([UTRECHT, mid, end])).toBeCloseTo(3, 6);
  });

  it('returns 0 for degenerate input', () => {
    expect(pathLengthKm([])).toBe(0);
    expect(pathLengthKm([UTRECHT])).toBe(0);
    expect(pathLengthKm(null)).toBe(0);
  });
});

describe('routeOverlap', () => {
  const square = (origin, sideKm) => {
    const a = origin;
    const b = destinationPoint(a, 0, sideKm);
    const c = destinationPoint(b, 90, sideKm);
    const d = destinationPoint(a, 90, sideKm);
    return [a, b, c, d, a];
  };

  it('is 1 for identical paths', () => {
    const p = square(UTRECHT, 1);
    expect(routeOverlap(p, p)).toBe(1);
  });

  it('is high for a lightly perturbed copy', () => {
    const p = square(UTRECHT, 1);
    const q = p.map((pt) => ({ lat: pt.lat + 0.00002, lng: pt.lng + 0.00002 }));
    expect(routeOverlap(p, q)).toBeGreaterThan(0.6);
  });

  it('is low for paths far apart', () => {
    const p = square(UTRECHT, 1);
    const q = square(destinationPoint(UTRECHT, 90, 5), 1);
    expect(routeOverlap(p, q)).toBe(0);
  });

  it('is between 0 and 1 for partially shared paths', () => {
    const p = square(UTRECHT, 1);
    // Same first side, then diverging.
    const b = destinationPoint(UTRECHT, 0, 1);
    const q = [UTRECHT, b, destinationPoint(b, 270, 1), destinationPoint(UTRECHT, 270, 1), UTRECHT];
    const o = routeOverlap(p, q);
    expect(o).toBeGreaterThan(0.2);
    expect(o).toBeLessThan(0.6);
  });

  it('handles empty paths', () => {
    expect(routeOverlap([], square(UTRECHT, 1))).toBe(0);
  });
});

/** Straight line of points every `step` km from `from` along `bearing` (excluding `from`). */
function line(from, bearing, km, step = 0.1) {
  const out = [];
  const steps = Math.round(km / step);
  for (let s = 1; s <= steps; s++) out.push(destinationPoint(from, bearing, (km * s) / steps));
  return out;
}

/** Closed square loop of `side` km per side, vertices every 100 m. */
function squareLoop(side = 1.25) {
  const path = [UTRECHT];
  for (const b of [0, 90, 180, 270]) path.push(...line(path[path.length - 1], b, side));
  path[path.length - 1] = UTRECHT;
  return path;
}

describe('densifyPath', () => {
  it('keeps vertices and caps the spacing', () => {
    const path = [UTRECHT, destinationPoint(UTRECHT, 90, 1)];
    const dense = densifyPath(path, 0.03);
    expect(dense[0]).toEqual(UTRECHT);
    expect(dense[dense.length - 1]).toEqual(path[1]);
    for (let i = 1; i < dense.length; i++) expect(haversineKm(dense[i - 1], dense[i])).toBeLessThanOrEqual(0.03 + 1e-9);
    expect(densifyPath([], 0.03)).toEqual([]);
  });
});

describe('selfOverlapFraction', () => {
  it('is ≈ 0 for a clean square loop', () => {
    expect(selfOverlapFraction(squareLoop())).toBeLessThan(0.01);
  });

  it('is ≈ 0.5 for an out-and-back', () => {
    const out = line(UTRECHT, 45, 2.5);
    const back = line(out[out.length - 1], 225, 2.5);
    back[back.length - 1] = UTRECHT;
    const f = selfOverlapFraction([UTRECHT, ...out, ...back]);
    expect(f).toBeGreaterThan(0.4);
    expect(f).toBeLessThanOrEqual(0.5);
  });

  it('grows with a spur', () => {
    const sq = squareLoop();
    const base = sq[25];
    const spurred = [...sq.slice(0, 26), ...line(base, 45, 0.4), ...line(destinationPoint(base, 45, 0.4), 225, 0.4), ...sq.slice(26)];
    expect(selfOverlapFraction(spurred)).toBeGreaterThan(0.06);
  });
});

describe('findSpurs', () => {
  it('finds nothing on a clean loop', () => {
    expect(findSpurs(squareLoop())).toEqual([]);
  });

  it('detects a synthetic spur with the right base and tip', () => {
    const sq = squareLoop();
    const baseIdx = 25;
    const base = sq[baseIdx];
    const out = line(base, 45, 0.4);
    const back = line(out[out.length - 1], 225, 0.4);
    const path = [...sq.slice(0, baseIdx + 1), ...out, ...back, ...sq.slice(baseIdx + 1)];
    const tipIdx = baseIdx + out.length;
    const endIdx = tipIdx + back.length;

    const spurs = findSpurs(path);
    expect(spurs).toHaveLength(1);
    const [spur] = spurs;
    expect(Math.abs(spur.baseIndex - baseIdx)).toBeLessThanOrEqual(1);
    expect(spur.tipIndex).toBe(tipIdx);
    expect(Math.abs(spur.endIndex - endIdx)).toBeLessThanOrEqual(1);
    expect(spur.lengthKm).toBeGreaterThan(0.35);
    expect(spur.lengthKm).toBeLessThan(0.45);
  });

  it('detects short spurs down to 25 m and ignores 15 m', () => {
    const sq = squareLoop();
    const base = sq[25];
    const withSpur = (km) => [
      ...sq.slice(0, 26),
      ...line(base, 45, km, 0.005),
      ...line(destinationPoint(base, 45, km), 225, km, 0.005),
      ...sq.slice(26),
    ];
    expect(findSpurs(withSpur(0.015))).toEqual([]);
    for (const km of [0.03, 0.05]) {
      const spurs = findSpurs(withSpur(km));
      expect(spurs).toHaveLength(1);
      expect(spurs[0].lengthKm).toBeGreaterThan(km - 0.01);
      expect(spurs[0].lengthKm).toBeLessThan(km + 0.01);
      expect(Math.abs(spurs[0].baseIndex - 25)).toBeLessThanOrEqual(1);
    }
  });

  it('uses a finer grid for short loops', () => {
    expect(spurCellKm(squareLoop(0.325))).toBeCloseTo(0.01, 6);
    expect(spurCellKm(squareLoop())).toBeCloseTo(0.025, 4);
    expect(spurCellKm(squareLoop(7.5))).toBeCloseTo(0.03, 6);
    const sq = squareLoop(0.325);
    const base = sq[8];
    const path = [...sq.slice(0, 9), ...line(base, 45, 0.03, 0.005), ...line(destinationPoint(base, 45, 0.03), 225, 0.03, 0.005), ...sq.slice(9)];
    const spurs = findSpurs(path);
    expect(spurs).toHaveLength(1);
    expect(spurs[0].lengthKm).toBeGreaterThan(0.025);
    expect(spurs[0].lengthKm).toBeLessThan(0.04);
  });

  it('detects a lollipop: a doubled stick with a loop at its end', () => {
    // Square loop; at vertex 25 a 300 m stick leads to a small 400 m square, then back down the stick.
    const sq = squareLoop();
    const base = sq[25];
    const stick = line(base, 45, 0.3, 0.02);
    const head = stick[stick.length - 1];
    const smallLoop = [];
    let cur = head;
    for (const b of [0, 90, 180, 270]) {
      const seg = line(cur, b, 0.1, 0.02);
      smallLoop.push(...seg);
      cur = seg[seg.length - 1];
    }
    const back = line(head, 225, 0.3, 0.02);
    const path = [...sq.slice(0, 26), ...stick, ...smallLoop, ...back, ...sq.slice(26)];
    const spurs = findSpurs(path);
    expect(spurs).toHaveLength(1);
    expect(spurs[0].lengthKm).toBeGreaterThan(0.25);
    expect(spurs[0].lengthKm).toBeLessThan(0.35);
    expect(Math.abs(spurs[0].baseIndex - 25)).toBeLessThanOrEqual(1);
    expect(spurs[0].endIndex).toBeGreaterThan(spurs[0].tipIndex);
  });

  it('does not report a crossing of the loop with itself', () => {
    // Figure of eight: two squares sharing a corner, crossed at 90°.
    const a = UTRECHT;
    const p = [a];
    for (const b of [0, 90, 180, 270, 180, 270, 0, 90]) p.push(...line(p[p.length - 1], b, 0.6, 0.02));
    p[p.length - 1] = a;
    expect(findSpurs(p)).toEqual([]);
  });

  it('detects a spur whose way back runs on the other carriageway of a divided road', () => {
    // 200 m out, then back 25 m to the side: the two carriageways of a dual road.
    const sq = squareLoop();
    const base = sq[25];
    const tip = destinationPoint(base, 45, 0.2);
    const across = destinationPoint(tip, 135, 0.025);
    const path = [...sq.slice(0, 26), ...line(base, 45, 0.2, 0.02), across, ...line(across, 225, 0.2, 0.02), ...sq.slice(26)];
    const spurs = findSpurs(path);
    expect(spurs).toHaveLength(1);
    expect(spurs[0].lengthKm).toBeGreaterThan(0.15);
  });

  it('does not mistake a parallel path in the same direction for a spur', () => {
    // A towpath 5 m beside the road, walked the same way after a short loop: distinct road, no retrace.
    const sq = squareLoop();
    const base = sq[25];
    const a = line(base, 45, 0.3, 0.02);
    const end = a[a.length - 1];
    const hop = destinationPoint(end, 135, 0.3);
    const side = destinationPoint(base, 135, 0.005);
    const back = [...line(end, 135, 0.3, 0.02), ...line(hop, 225, 0.3, 0.02), ...line(destinationPoint(hop, 225, 0.3), 315, 0.295, 0.02)];
    const parallel = line(side, 45, 0.3, 0.02);
    const path = [...sq.slice(0, 26), ...a, ...back, ...parallel];
    expect(findSpurs(path).filter((s) => s.lengthKm > 0.05)).toEqual([]);
  });

  it('does not mistake a sharp corner for a spur', () => {
    // 60° fold: out 1.5 km north, then back south-south-east — the legs share cells near the vertex.
    const a = destinationPoint(UTRECHT, 0, 1.5);
    const b = destinationPoint(a, 150, 1.5);
    const path = [UTRECHT, ...line(UTRECHT, 0, 1.5, 0.05), ...line(a, 150, 1.5, 0.05), ...line(b, 270, 1.5, 0.05), UTRECHT];
    expect(findSpurs(path)).toEqual([]);
  });
});

describe('spurStemAtStart / trimStartStem', () => {
  /** Square loop reached through a 200 m stem south of its first corner. */
  function stemmedLoop(stemKm = 0.2) {
    const junction = UTRECHT;
    const start = destinationPoint(junction, 180, stemKm);
    const sq = squareLoop(1.25);
    const path = [start, ...line(start, 0, stemKm, 0.05), ...sq.slice(1), ...line(junction, 180, stemKm, 0.05)];
    path[path.length - 1] = start;
    return { path, start, junction };
  }

  it('is null for a loop without a stem', () => {
    expect(spurStemAtStart(squareLoop())).toBeNull();
    expect(trimStartStem(squareLoop()).stemKm).toBe(0);
  });

  it('finds the stem and its junction', () => {
    const { path, junction } = stemmedLoop();
    const stem = spurStemAtStart(path);
    expect(stem).not.toBeNull();
    expect(stem.lengthKm).toBeGreaterThan(0.18);
    expect(stem.lengthKm).toBeLessThan(0.23);
    expect(haversineKm(stem.junction, junction)).toBeLessThan(0.02);
    expect(stem.outIndex).toBeGreaterThan(0);
    expect(stem.backIndex).toBeLessThan(path.length - 1);
  });

  it('the trimmed core is a clean closed loop even though the full path overlaps itself', () => {
    const { path } = stemmedLoop();
    expect(selfOverlapFraction(path)).toBeGreaterThan(0.03);
    const { stemKm, core } = trimStartStem(path);
    expect(stemKm).toBeGreaterThan(0.18);
    expect(haversineKm(core[0], core[core.length - 1])).toBeLessThan(1e-6);
    expect(pathLengthKm(core)).toBeCloseTo(5, 0);
    expect(findSpurs(core)).toEqual([]);
    expect(selfOverlapFraction(core)).toBeLessThan(0.01);
  });

  it('does not report a stub at the start that is not retraced at the end', () => {
    // 60 m out-and-back east of the start before the loop begins: a spur, not a stem.
    const sq = squareLoop();
    const tip = destinationPoint(UTRECHT, 90, 0.06);
    const path = [UTRECHT, ...line(UTRECHT, 90, 0.06, 0.01), ...line(tip, 270, 0.06, 0.01), ...sq.slice(1)];
    expect(spurStemAtStart(path)).toBeNull();
    const spurs = findSpurs(path);
    expect(spurs).toHaveLength(1);
    expect(spurs[0].lengthKm).toBeCloseTo(0.06, 1);
  });
});
