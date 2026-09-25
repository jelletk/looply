// Pace estimates and Dutch number formatting.

const DEFAULT_SPEED_KMH = { walk: 5, run: 10, bike: 22 };
let speedKmh = { ...DEFAULT_SPEED_KMH };

/** Use the user's own speeds (km/h per mode) for every estimate from now on. */
export function setSpeeds(speeds) {
  speedKmh = { ...DEFAULT_SPEED_KMH, ...speeds };
}

/** Estimated duration in minutes for a distance at the mode's average speed. */
export function estimateDurationMin(distanceKm, mode) {
  const speed = speedKmh[mode] ?? speedKmh.walk;
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  return (distanceKm / speed) * 60;
}

/** "25 min" under an hour, "1 u 05 min" from an hour up. */
export function formatDuration(min) {
  const total = Math.max(0, Math.round(Number(min) || 0));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} u`;
  return `${hours} u ${String(minutes).padStart(2, '0')} min`;
}

/** "5,1 km" — one decimal, Dutch comma. */
export function formatKm(km) {
  const value = Number(km) || 0;
  return `${value.toFixed(1).replace('.', ',')} km`;
}

/** "1,2 km" from 1 km up, "750 m" below (rounded to 50 m). */
export function formatShortDistance(km) {
  const value = Number(km) || 0;
  if (value >= 1) return formatKm(value);
  return `${Math.round((value * 1000) / 50) * 50} m`;
}

/** Speed as a runner reads it: 10 km/h → "6:00 min/km". */
export function formatPace(kmh) {
  const secPerKm = Math.round(3600 / kmh);
  return `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, '0')} min/km`;
}

/** "5,0 km/u" */
export function formatSpeed(kmh) {
  return `${(Number(kmh) || 0).toFixed(1).replace('.', ',')} km/u`;
}
