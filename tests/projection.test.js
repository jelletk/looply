import { describe, it, expect } from 'vitest';
import { project, unproject, shapeFrame, viewForBox } from '../src/ui/projection.js';

describe('Web Mercator projection', () => {
  it('matches Google’s world coordinates', () => {
    // Google Maps docs: Chicago (41.85, -87.65) → world (65.67, 95.17).
    const p = project({ lat: 41.85, lng: -87.65 });
    expect(p.x).toBeCloseTo(65.67, 2);
    expect(p.y).toBeCloseTo(95.17, 2);
  });

  it('round-trips', () => {
    const q = unproject(project({ lat: 52.0907, lng: 5.1214 }));
    expect(q.lat).toBeCloseTo(52.0907, 9);
    expect(q.lng).toBeCloseTo(5.1214, 9);
  });
});

describe('shapeFrame and viewForBox', () => {
  const path = [
    { lat: 52.09, lng: 5.12 },
    { lat: 52.1, lng: 5.12 },
    { lat: 52.1, lng: 5.14 },
    { lat: 52.09, lng: 5.12 },
  ];

  it('pads the box around the path', () => {
    const { box, points } = shapeFrame(path, 0.1);
    const xs = points.map((p) => p.x);
    expect(box.x).toBeLessThan(Math.min(...xs));
    expect(box.x + box.w).toBeGreaterThan(Math.max(...xs));
  });

  it('centres the map on the box and zooms so the box fits the element', () => {
    const { box } = shapeFrame(path);
    const view = viewForBox(box, 362, 280);
    const c = project(view.center);
    expect(c.x).toBeCloseTo(box.x + box.w / 2, 9);
    expect(c.y).toBeCloseTo(box.y + box.h / 2, 9);
    const scale = 2 ** view.zoom;
    expect(Math.min(362 - box.w * scale, 280 - box.h * scale)).toBeCloseTo(0, 6); // one side fits exactly
    expect(view.zoom).toBeGreaterThan(12);
    expect(view.zoom).toBeLessThan(17);
  });
});

describe('boxForView', () => {
  it('is the inverse of viewForBox, also for a box with another aspect ratio', async () => {
    const { boxForView, viewForBox, shapeFrame } = await import('../src/ui/projection.js');
    const { box } = shapeFrame([{ lat: 52.08, lng: 5.12 }, { lat: 52.1, lng: 5.15 }], 0.1);
    const v = viewForBox(box, 362, 446);
    const back = boxForView(v.center, v.zoom, 362, 446);
    // Same centre; the box fits inside the view ("meet") and touches it on one side.
    expect(back.x + back.w / 2).toBeCloseTo(box.x + box.w / 2, 9);
    expect(back.y + back.h / 2).toBeCloseTo(box.y + box.h / 2, 9);
    expect(Math.max(box.w / back.w, box.h / back.h)).toBeCloseTo(1, 9);
  });

  it('shows more ground when the map rounds the zoom down', async () => {
    const { boxForView } = await import('../src/ui/projection.js');
    const c = { lat: 52.09, lng: 5.12 };
    expect(boxForView(c, 14, 300, 300).w).toBeCloseTo(boxForView(c, 14.6, 300, 300).w * 2 ** 0.6, 9);
  });
});
