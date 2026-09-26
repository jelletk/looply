import { svg } from '../dom.js';
import { shapeFrame } from '../projection.js';

const d = (points) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(5)} ${p.y.toFixed(5)}`).join('');

/**
 * Route shape as SVG in Web Mercator, so a map under it lines up (see projection.js).
 * `draw`: the line draws itself when its poster comes into view. The start is a sun dot.
 * → { el, box }
 *
 * The drawn (poster) line does not use vector-effect: WebKit applies stroke dashes in screen
 * units under non-scaling-stroke, which breaks the pathLength-based draw animation (the line
 * stayed invisible in Safari). Instead the stroke width is kept at `px` screen pixels by
 * rescaling it whenever the shape is resized.
 */
export function routeShape(route, { draw = false, pad = 0.1, dot = true, className = 'route', px = 4 } = {}) {
  const { points, box } = shapeFrame(route.path, pad);
  const line = svg('path', {
    d: d(points),
    class: className + (draw ? ' route--draw' : ''),
    pathLength: draw ? 1 : null,
    'vector-effect': draw ? null : 'non-scaling-stroke',
  });
  const sun = dot && points[0] ? svg('circle', { cx: points[0].x, cy: points[0].y, fill: 'var(--sun)', stroke: 'var(--route-line)' }) : null;
  const el = svg(
    'svg',
    { viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' },
    line,
    sun
  );

  // User units per screen pixel for the current size ("meet": the tighter side decides).
  const fit = (width, height) => {
    const unit = 1 / Math.min(width / box.w, height / box.h);
    if (draw) line.setAttribute('stroke-width', String(px * unit));
    if (sun) {
      sun.setAttribute('r', String(6 * unit));
      sun.setAttribute('stroke-width', String(2 * unit));
    }
  };
  fit(340, 300); // until the real size is known
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) fit(width, height);
    }).observe(el);
  }
  return { el, box };
}

/** Small route thumbnail for lists: thin line, no glow, no dot. */
export function routeThumb(route) {
  return routeShape(route, { pad: 0.08, dot: false, className: 'thumb-line' }).el;
}
