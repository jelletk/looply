// Web Mercator, the projection Google Maps uses. Drawing route shapes in it lets the subtle map
// under a poster line up exactly with the shape drawn on top.

const TILE = 256; // world size in px at zoom 0
const RAD = Math.PI / 180;

export function project({ lat, lng }) {
  const s = Math.min(Math.max(Math.sin(lat * RAD), -0.9999), 0.9999);
  return { x: TILE * (0.5 + lng / 360), y: TILE * (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) };
}

export function unproject({ x, y }) {
  const n = Math.PI - (2 * Math.PI * y) / TILE;
  return { lat: Math.atan(Math.sinh(n)) / RAD, lng: (x / TILE - 0.5) * 360 };
}

/**
 * Frame for drawing `path`: projected points plus a viewBox with `pad` (fraction of the larger side)
 * around them. → { points, box: { x, y, w, h } }
 */
export function shapeFrame(path, pad = 0.1) {
  const points = (path || []).map(project);
  if (points.length === 0) return { points, box: { x: 0, y: 0, w: 1, h: 1 } };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(Math.max(...xs) - minX, 1e-6);
  const h = Math.max(Math.max(...ys) - minY, 1e-6);
  const p = Math.max(w, h) * pad;
  return { points, box: { x: minX - p, y: minY - p, w: w + 2 * p, h: h + 2 * p } };
}

/**
 * Map view that shows `box` like an SVG with preserveAspectRatio "xMidYMid meet" in a
 * width × height element: → { center: { lat, lng }, zoom } (fractional zoom).
 */
export function viewForBox(box, width, height) {
  const scale = Math.min(width / box.w, height / box.h);
  return { center: unproject({ x: box.x + box.w / 2, y: box.y + box.h / 2 }), zoom: Math.log2(scale) };
}
