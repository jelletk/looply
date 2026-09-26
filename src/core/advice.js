// The sun, weather and "back at" lines on the plan screen and the posters.
// Lines are lists of segments: a string, or { strong: string } for the figures shown in bold.

const MIN = 60 * 1000;
const RAIN_SOON_MS = 60 * MIN; // "regen vanaf 17:25" when the rain starts within the hour

/** "07:05" in the device time zone. */
export function clockTime(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "2 u 44 min", "1 u 00 min", "44 min". */
export function timeSpan(ms) {
  const m = Math.max(0, Math.round(ms / MIN));
  const h = Math.floor(m / 60);
  return h ? `${h} u ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

/** Plain text of a line, for screen readers and tests. */
export function lineText(segments) {
  return segments.map((s) => (typeof s === 'string' ? s : s.strong)).join('');
}

const b = (strong) => ({ strong });

/** "Zon onder om 19:24 · nog 2 u 10 min licht" / "Zon onder sinds 19:24" / "Zon op om 07:31". */
export function sunLine(now, sun) {
  if (sun.rise == null || sun.set == null) return null;
  if (now < sun.rise) return ['Zon op om ', b(clockTime(sun.rise))];
  if (now < sun.set) return ['Zon onder om ', b(clockTime(sun.set)), ' · nog ', b(timeSpan(sun.set - now)), ' licht'];
  return ['Zon onder sinds ', b(clockTime(sun.set))];
}

/** { icon, segments } for the weather line, or null without weather. */
export function weatherLine(now, weather, phase) {
  if (!weather) return null;
  const temp = b(`${weather.tempC} °C`);
  if (weather.rainingNow) return { icon: 'rain', segments: [temp, ' · het regent'] };
  if (weather.rainAt != null && weather.rainAt - now <= RAIN_SOON_MS) {
    return { icon: 'rain', segments: [temp, ' · regen vanaf ', b(clockTime(weather.rainAt))] };
  }
  return { icon: phase === 'night' ? 'moon' : 'cloudsun', segments: [temp, ' · droog het komende uur'] };
}

/**
 * The one advice line under the distance: rain goes before the sun.
 * → { warn, icon, segments, suggestKm } where suggestKm is a shorter distance that gets you home
 *   before sunset (only when the planned loop ends after it and such a distance exists).
 */
export function adviceLine({ now, durationMin, km, sun, weather, step = 0.5, minKm = 1 }) {
  const back = now + durationMin * MIN;
  const w = weather;
  if (w?.rainingNow) {
    const tail = w.dryAt != null ? `Het regent nu, droog vanaf ongeveer ${clockTime(w.dryAt)}.` : 'Het blijft het komende uur regenen.';
    return { warn: true, icon: 'rain', segments: [tail] };
  }
  if (w?.rainAt != null && w.rainAt > now && w.rainAt < back) {
    const part = (w.rainAt - now) / (back - now);
    const where = part < 1 / 3 ? 'aan het begin van' : part < 2 / 3 ? 'halverwege' : 'aan het eind van';
    const dry = w.dryAt != null ? ` Droog vanaf ongeveer ${clockTime(w.dryAt)}.` : '';
    return { warn: true, icon: 'rain', segments: [`Bui om ${clockTime(w.rainAt)}, ${where} je rondje.${dry}`] };
  }
  if (w?.rainAt != null && w.rainAt >= back && w.rainAt - now <= RAIN_SOON_MS) {
    return { warn: false, segments: ['Je bent terug om ', b(clockTime(back)), ', voor de bui.'] };
  }
  if (sun.rise == null || sun.set == null) return { warn: false, segments: ['Terug om ', b(clockTime(back))] };
  if (now >= sun.set || now < sun.rise - 40 * MIN) {
    return { warn: false, segments: ['Het is donker · terug om ', b(clockTime(back))] };
  }
  if (now < sun.rise) {
    return { warn: false, segments: ['Terug om ', b(clockTime(back)), ' · zon op om ', b(clockTime(sun.rise))] };
  }
  if (back > sun.set) {
    const minutesLeft = (sun.set - now) / MIN - 3;
    const fit = Math.floor((minutesLeft / durationMin) * km / step + 1e-9) * step;
    const suggestKm = fit >= minKm && fit < km ? fit : null;
    return {
      warn: true,
      icon: 'sunset',
      segments: [`Terug om ${clockTime(back)}, zon onder om ${clockTime(sun.set)}.`],
      suggestKm,
    };
  }
  if (sun.set - back < 30 * MIN) {
    return { warn: false, segments: ['Terug om ', b(clockTime(back)), `, net voor zonsondergang (${clockTime(sun.set)})`] };
  }
  return { warn: false, segments: ['Terug om ', b(clockTime(back)), ' · nog ', b(timeSpan(sun.set - back)), ' licht daarna'] };
}
