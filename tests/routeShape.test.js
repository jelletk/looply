import { describe, it, expect } from 'vitest';
import { routeShape } from '../src/ui/components/routeShape.js';
import { boxForView, viewForBox } from '../src/ui/projection.js';

// A 3 km loop around Utrecht: in world units it is only ~0.006 wide.
const route = { path: [
  { lat: 52.0866, lng: 5.1356 }, { lat: 52.0950, lng: 5.1356 }, { lat: 52.0950, lng: 5.1500 },
  { lat: 52.0866, lng: 5.1500 }, { lat: 52.0866, lng: 5.1356 },
] };

const numbers = (s) => s.match(/-?\d+(\.\d+)?/g).map(Number);

describe('routeShape', () => {
  it('draws in local units (0–1000), not in tiny world units that WebKit cannot draw', () => {
    const { el } = routeShape(route, { draw: true });
    const vb = numbers(el.getAttribute('viewBox'));
    expect(Math.max(vb[2], vb[3])).toBeCloseTo(1000, 6);
    const coords = numbers(el.querySelector('path').getAttribute('d'));
    expect(Math.min(...coords)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...coords)).toBeLessThanOrEqual(1000);
    expect(Math.max(...coords)).toBeGreaterThan(500); // spread out, not crushed near zero
    expect(Number(el.querySelector('path').getAttribute('stroke-width'))).toBeGreaterThan(1);
  });

  it('setView maps a world view onto the same local frame', () => {
    const { el, box, setView } = routeShape(route);
    // The view a map would show for this box, rounded down a zoom level: more ground around it.
    const v = viewForBox(box, 362, 446);
    const wider = boxForView(v.center, Math.floor(v.zoom), 362, 446);
    setView(wider);
    const vb = numbers(el.getAttribute('viewBox'));
    // Same centre as the route's own frame (500, ~) and a larger window.
    const ownW = 1000 * box.w / Math.max(box.w, box.h);
    const ownH = 1000 * box.h / Math.max(box.w, box.h);
    expect(vb[0] + vb[2] / 2).toBeCloseTo(ownW / 2, 6);
    expect(vb[1] + vb[3] / 2).toBeCloseTo(ownH / 2, 6);
    expect(vb[2]).toBeGreaterThan(ownW);
    expect(vb[2] / vb[3]).toBeCloseTo(362 / 446, 6);
  });
});
