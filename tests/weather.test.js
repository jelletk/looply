import { describe, it, expect, vi } from 'vitest';
import { parseWeather, createWeatherSource, openMeteoUrl } from '../src/core/weather.js';

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 8, 26, 14, 0) / 1000; // a quarter boundary, in seconds

/** Open-Meteo-shaped answer: `mm` per quarter, the first quarter ending at T0. */
function answer(mm, { temp = 13.8, current = 0 } = {}) {
  return {
    current: { time: T0, temperature_2m: temp, precipitation: current },
    minutely_15: { time: mm.map((_, i) => T0 + i * 900), precipitation: mm },
  };
}
const now = (T0 + 300) * 1000; // 14:05 UTC, inside the quarter 14:00–14:15

describe('parseWeather', () => {
  it('reads a dry forecast', () => {
    expect(parseWeather(answer([0, 0, 0, 0, 0]), now)).toEqual({ tempC: 14, rainingNow: false, rainAt: null, dryAt: null });
  });

  it('finds the start of rain later on, and when it stops', () => {
    // Quarter ending 15:00 (14:45–15:00) is the first wet one; 15:15–15:30 is dry again.
    const w = parseWeather(answer([0, 0, 0, 0, 0.4, 1.2, 0, 0]), now);
    expect(w.rainingNow).toBe(false);
    expect(w.rainAt).toBe(Date.UTC(2026, 8, 26, 14, 45));
    expect(w.dryAt).toBe(Date.UTC(2026, 8, 26, 15, 15));
  });

  it('sees rain now and when it will be dry', () => {
    const w = parseWeather(answer([0, 0.5, 0.3, 0, 0]), now);
    expect(w.rainingNow).toBe(true);
    expect(w.rainAt).toBeNull();
    expect(w.dryAt).toBe(Date.UTC(2026, 8, 26, 14, 30));
  });

  it('leaves dryAt empty when it keeps raining in the forecast', () => {
    const w = parseWeather(answer([0, 0.5, 0.5, 0.5, 0.5]), now);
    expect(w.rainingNow).toBe(true);
    expect(w.dryAt).toBeNull();
  });

  it('ignores drizzle below 0.1 mm per quarter', () => {
    expect(parseWeather(answer([0, 0.05, 0.05, 0]), now).rainingNow).toBe(false);
  });

  it('returns null for an unusable answer', () => {
    expect(parseWeather(null, now)).toBeNull();
    expect(parseWeather({ current: {} }, now)).toBeNull();
    expect(parseWeather(answer([0, 0]), (T0 + 3600) * 1000)).toBeNull(); // forecast already over
  });
});

describe('createWeatherSource', () => {
  const ok = (json) => Promise.resolve({ ok: true, json: () => Promise.resolve(json) });

  it('asks Open-Meteo once per quarter for the same spot', async () => {
    const fetchFn = vi.fn(() => ok(answer([0, 0, 0, 0])));
    let t = now;
    const weatherAt = createWeatherSource({ fetchFn, clock: () => t });
    const spot = { lat: 52.0907, lng: 5.1214 };
    expect((await weatherAt(spot)).tempC).toBe(14);
    t += 10 * MIN;
    await weatherAt(spot);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    t += 6 * MIN;
    await weatherAt(spot);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][0]).toBe(openMeteoUrl(spot));
  });

  it('resolves to null when the network fails or answers badly', async () => {
    const spot = { lat: 52, lng: 5 };
    expect(await createWeatherSource({ fetchFn: () => Promise.reject(new Error('offline')) })(spot)).toBeNull();
    expect(await createWeatherSource({ fetchFn: () => Promise.resolve({ ok: false }) })(spot)).toBeNull();
    expect(await createWeatherSource({ fetchFn: null })(spot)).toBeNull();
  });

  it('asks for temperature and quarter-hour rain without a key', () => {
    const url = openMeteoUrl({ lat: 52.0907, lng: 5.1214 });
    expect(url).toContain('api.open-meteo.com/v1/forecast?');
    expect(url).toContain('latitude=52.091');
    expect(url).toContain('minutely_15=precipitation');
    expect(url).not.toMatch(/key/i);
  });
});
