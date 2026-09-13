/**
 * Projects a lat/lng path into a square viewBox of `size` px, preserving aspect
 * ratio (longitude scaled by cos(latitude)), padded and flipped so north is up.
 */
export function normalizePathToViewBox(path, size, padding = 4) {
  if (!Array.isArray(path) || path.length === 0) return [];

  const lats = path.map((p) => p.lat);
  const lngs = path.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const avgLat = (minLat + maxLat) / 2;
  const lngScale = Math.cos((avgLat * Math.PI) / 180) || 1;

  const spanLat = Math.max(maxLat - minLat, 1e-9);
  const spanLng = Math.max((maxLng - minLng) * lngScale, 1e-9);
  const span = Math.max(spanLat, spanLng);

  const inner = size - padding * 2;
  const scale = inner / span;

  const drawnWidth = spanLng * scale;
  const drawnHeight = spanLat * scale;
  const offsetX = (size - drawnWidth) / 2;
  const offsetY = (size - drawnHeight) / 2;

  return path.map((p) => ({
    x: (p.lng - minLng) * lngScale * scale + offsetX,
    y: size - ((p.lat - minLat) * scale + offsetY), // flip so north renders up
  }));
}
