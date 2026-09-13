import { normalizePathToViewBox } from './pathGeometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIZE = 64;

/** Small SVG thumbnail of a route's loop shape, normalized into a 64×64 viewBox. */
export function createThumbnail(route) {
  const points = normalizePathToViewBox(route.path, SIZE, 8);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute('class', 'route-card__thumb');

  const polyline = document.createElementNS(SVG_NS, 'polyline');
  polyline.setAttribute('points', points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', 'currentColor');
  polyline.setAttribute('stroke-width', '2');
  polyline.setAttribute('stroke-linecap', 'round');
  polyline.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(polyline);

  return svg;
}
