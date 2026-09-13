// Pace estimates and Dutch number formatting.

const SPEED_KMH = { walk: 5, run: 10, bike: 18 };

/** Estimated duration in minutes for a distance at the mode's average speed. */
export function estimateDurationMin(distanceKm, mode) {
  const speed = SPEED_KMH[mode] ?? SPEED_KMH.walk;
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
