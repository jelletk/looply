import { describe, it, expect } from 'vitest';
import { adviceLine, sunLine, weatherLine, lineText, clockTime, timeSpan } from '../src/core/advice.js';

// Local times, so the expected clock texts hold in any time zone.
const at = (h, m = 0) => new Date(2026, 8, 26, h, m).getTime();
const sun = { rise: at(7, 31), set: at(19, 28) };
const dry = { tempC: 14, rainingNow: false, rainAt: null, dryAt: null };
const advise = (opts) => adviceLine({ sun, weather: null, km: 5, durationMin: 60, ...opts });

describe('clockTime and timeSpan', () => {
  it('formats like the design', () => {
    expect(clockTime(at(7, 5))).toBe('07:05');
    expect(timeSpan(164 * 60000)).toBe('2 u 44 min');
    expect(timeSpan(60 * 60000)).toBe('1 u 00 min');
    expect(timeSpan(44 * 60000)).toBe('44 min');
  });
});

describe('sunLine', () => {
  it('follows the day', () => {
    expect(lineText(sunLine(at(6), sun))).toBe('Zon op om 07:31');
    expect(lineText(sunLine(at(17, 18), sun))).toBe('Zon onder om 19:28 · nog 2 u 10 min licht');
    expect(lineText(sunLine(at(20), sun))).toBe('Zon onder sinds 19:28');
    expect(sunLine(at(12), { rise: null, set: null })).toBeNull();
  });
});

describe('weatherLine', () => {
  it('covers dry, rain soon, rain later and rain now', () => {
    expect(lineText(weatherLine(at(14), dry, 'day').segments)).toBe('14 °C · droog het komende uur');
    expect(weatherLine(at(23), dry, 'night').icon).toBe('moon');
    const soon = weatherLine(at(14), { ...dry, rainAt: at(14, 40) }, 'day');
    expect(soon.icon).toBe('rain');
    expect(lineText(soon.segments)).toBe('14 °C · regen vanaf 14:40');
    expect(lineText(weatherLine(at(14), { ...dry, rainAt: at(16) }, 'day').segments)).toBe('14 °C · droog het komende uur');
    expect(lineText(weatherLine(at(14), { ...dry, rainingNow: true }, 'day').segments)).toBe('14 °C · het regent');
    expect(weatherLine(at(14), null, 'day')).toBeNull();
  });
});

describe('adviceLine', () => {
  it('has plenty of light', () => {
    const a = advise({ now: at(14) });
    expect(a.warn).toBe(false);
    expect(lineText(a.segments)).toBe('Terug om 15:00 · nog 4 u 28 min licht daarna');
  });

  it('is just before sunset', () => {
    expect(lineText(advise({ now: at(18, 10) }).segments)).toBe('Terug om 19:10, net voor zonsondergang (19:28)');
  });

  it('warns after sunset and suggests a distance that fits', () => {
    const a = advise({ now: at(18, 40) });
    expect(a.warn).toBe(true);
    expect(a.icon).toBe('sunset');
    expect(lineText(a.segments)).toBe('Terug om 19:40, zon onder om 19:28.');
    // 45 min of light left for 5 km in 60 min → 3,5 km on half-km steps.
    expect(a.suggestKm).toBe(3.5);
  });

  it('suggests nothing when even the shortest distance does not fit', () => {
    expect(advise({ now: at(19, 20) }).suggestKm).toBeNull();
  });

  it('respects the step size and minimum of the mode (bike)', () => {
    const a = adviceLine({ now: at(18), durationMin: 120, km: 44, sun, weather: null, step: 1, minKm: 5 });
    expect(a.suggestKm).toBe(31); // 85 min of 120 → 31,2 km
  });

  it('knows it is dark, and early mornings', () => {
    expect(lineText(advise({ now: at(21) }).segments)).toBe('Het is donker · terug om 22:00');
    expect(lineText(advise({ now: at(5) }).segments)).toBe('Het is donker · terug om 06:00');
    expect(lineText(advise({ now: at(7) }).segments)).toBe('Terug om 08:00 · zon op om 07:31');
  });

  it('puts rain before the sun', () => {
    const now = at(18, 40); // would be a sunset warning
    const raining = advise({ now, weather: { ...dry, rainingNow: true, dryAt: at(19, 5) } });
    expect(raining.icon).toBe('rain');
    expect(lineText(raining.segments)).toBe('Het regent nu, droog vanaf ongeveer 19:05.');
    expect(lineText(advise({ now, weather: { ...dry, rainingNow: true } }).segments)).toBe('Het blijft het komende uur regenen.');
  });

  it('places a shower in the loop', () => {
    const now = at(14);
    const early = advise({ now, weather: { ...dry, rainAt: at(14, 10), dryAt: at(14, 30) } });
    expect(early.warn).toBe(true);
    expect(lineText(early.segments)).toBe('Bui om 14:10, aan het begin van je rondje. Droog vanaf ongeveer 14:30.');
    expect(lineText(advise({ now, weather: { ...dry, rainAt: at(14, 30) } }).segments)).toBe('Bui om 14:30, halverwege je rondje.');
    expect(lineText(advise({ now, weather: { ...dry, rainAt: at(14, 50) } }).segments)).toContain('aan het eind van');
  });

  it('does not let "voor de bui" hide a sunset warning', () => {
    const a = advise({ now: at(18, 40), durationMin: 60, weather: { ...dry, rainAt: at(19, 45) } });
    expect(a.warn).toBe(true);
    expect(a.icon).toBe('sunset');
  });

  it('says you are back before the rain', () => {
    const a = advise({ now: at(14), durationMin: 30, weather: { ...dry, rainAt: at(14, 45) } });
    expect(a.warn).toBe(false);
    expect(lineText(a.segments)).toBe('Je bent terug om 14:30, voor de bui.');
  });
});
