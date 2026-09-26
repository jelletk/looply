import { svg } from '../dom.js';
import { shapeFrame } from '../projection.js';

const d = (points) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(5)} ${p.y.toFixed(5)}`).join('');

/**
 * Route shape as SVG in Web Mercator, so a map under it lines up (see projection.js).
 * `draw`: the line draws itself when its poster comes into view. The start is a sun dot.
 * → { el, box }
 */
export function routeShape(route, { draw = false, pad = 0.1, dot = true, className = 'route' } = {}) {
  const { points, box } = shapeFrame(route.path, pad);
  const size = Math.max(box.w, box.h);
  const el = svg(
    'svg',
    { viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' },
    svg('path', {
      d: d(points),
      class: className + (draw ? ' route--draw' : ''),
      pathLength: draw ? 1 : null,
      'vector-effect': 'non-scaling-stroke',
    }),
    dot && points[0]
      ? svg('circle', {
          cx: points[0].x,
          cy: points[0].y,
          r: size / 36,
          fill: 'var(--sun)',
          stroke: 'var(--route-line)',
          'stroke-width': 2,
          'vector-effect': 'non-scaling-stroke',
        })
      : null
  );
  return { el, box };
}

/** Small route thumbnail for lists: thin line, no glow, no dot. */
export function routeThumb(route) {
  return routeShape(route, { pad: 0.08, dot: false, className: 'thumb-line' }).el;
}
