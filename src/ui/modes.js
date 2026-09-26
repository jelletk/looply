// The three modes and their distance ranges.

export const MODES = {
  walk: { label: 'Wandelen', icon: 'walk', min: 1, max: 20, step: 0.5 },
  run: { label: 'Hardlopen', icon: 'run', min: 1, max: 30, step: 0.5 },
  bike: { label: 'Fietsen', icon: 'bike', min: 5, max: 100, step: 1 },
};

/** "5,0" — the distance without unit, Dutch comma. */
export const kmNumber = (km) => (Math.round(km * 10) / 10).toFixed(1).replace('.', ',');

/**
 * How far a close-to-home route goes from home: each half loop through the start reaches at most
 * its diameter, D/2 ÷ π (5 km → about 800 m), rounded to 50 m.
 */
export function nearReachKm(km) {
  return Math.round((km / 2 / Math.PI) * 20) / 20;
}
