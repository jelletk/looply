import { svg } from '../dom.js';
import { shapeFrame } from '../projection.js';

const SPAN = 1000; // the longer side of the route's frame, in SVG units

const d = (points) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('');

/**
 * Route shape as SVG, framed like the map under it (Web Mercator, see projection.js).
 * `draw`: the line draws itself when its poster comes into view. The start is a sun dot.
 * → { el, box, setView } — `box` and setView's argument are in Web Mercator world units.
 *
 * Drawn in local units (0–SPAN), not in world units: a 3 km loop is only ~0.006 world units
 * wide with a line ~0.00007 thick, and WebKit loses precision with numbers that small. On
 * Jelle's iPhone the whole shape stayed invisible; in desktop Safari it showed in pieces or not
 * at all depending on filter and animation. Local units drew correctly in every combination
 * (test page, 7 Oct 2026). World coordinates only meet the SVG through `toLocal`.
 *
 * The drawn (poster) line does not use vector-effect: WebKit applies stroke dashes in screen
 * units under non-scaling-stroke, which breaks the pathLength-based draw animation. Instead the
 * stroke width is kept at `px` screen pixels by rescaling it whenever the shape is resized.
 */
export function routeShape(route, { draw = false, pad = 0.1, dot = true, className = 'route', px = 4 } = {}) {
  const { points, box } = shapeFrame(route.path, pad);
  const k = SPAN / Math.max(box.w, box.h);
  const toLocal = (p) => ({ x: (p.x - box.x) * k, y: (p.y - box.y) * k });
  const localBox = (b) => ({ x: (b.x - box.x) * k, y: (b.y - box.y) * k, w: b.w * k, h: b.h * k });

  const local = points.map(toLocal);
  const line = svg('path', {
    d: d(local),
    class: className + (draw ? ' route--draw' : ''),
    pathLength: draw ? 1 : null,
    'vector-effect': draw ? null : 'non-scaling-stroke',
  });
  const sun = dot && local[0] ? svg('circle', { cx: local[0].x.toFixed(2), cy: local[0].y.toFixed(2), fill: 'var(--sun)', stroke: 'var(--route-line)' }) : null;
  let view = localBox(box); // what the viewBox shows now: the route's own frame, or the map's actual view
  const el = svg(
    'svg',
    { viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' },
    line,
    sun
  );

  // SVG units per screen pixel for the current size ("meet": the tighter side decides).
  let size = [340, 300]; // until the real size is known
  const fit = (width, height) => {
    size = [width, height];
    const unit = 1 / Math.min(width / view.w, height / view.h);
    if (draw) line.setAttribute('stroke-width', (px * unit).toFixed(3));
    if (sun) {
      sun.setAttribute('r', (6 * unit).toFixed(3));
      sun.setAttribute('stroke-width', (2 * unit).toFixed(3));
    }
  };
  fit(...size);
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) fit(width, height);
    }).observe(el);
  }

  /**
   * Show exactly `next` (Web Mercator world units), e.g. the view the map under the shape really
   * ended up with. The map may round the zoom or shift the centre; following the map keeps line
   * and streets on top of each other whatever it did.
   */
  function setView(next) {
    view = localBox(next);
    el.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    fit(...size);
  }
  return { el, box, setView };
}

/** Small route thumbnail for lists: thin line, no glow, no dot. */
export function routeThumb(route) {
  return routeShape(route, { pad: 0.08, dot: false, className: 'thumb-line' }).el;
}
