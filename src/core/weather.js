// Weather for the next two hours from Open-Meteo (free, no key): temperature and rain per quarter.

const MIN = 60 * 1000;
const QUARTER = 15 * MIN;
const WET_MM = 0.1; // rain in a quarter from this amount up
const CACHE_MS = 15 * MIN; // ask at most once per quarter for the same spot
const TIMEOUT_MS = 8000;

export function openMeteoUrl({ lat, lng }) {
  const q = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lng.toFixed(3),
    current: 'temperature_2m,precipitation',
    minutely_15: 'precipitation',
    forecast_minutely_15: '9',
    past_minutely_15: '1',
    timeformat: 'unixtime',
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

/**
 * Turn an Open-Meteo answer into { tempC, rainingNow, rainAt, dryAt } (times in epoch ms, null when
 * not in the forecast). Each quarter's precipitation is the sum of the 15 minutes before its time.
 * Returns null when the answer is unusable.
 */
export function parseWeather(json, now) {
  const temp = Number(json?.current?.temperature_2m);
  const times = json?.minutely_15?.time;
  const mm = json?.minutely_15?.precipitation;
  if (!Number.isFinite(temp) || !Array.isArray(times) || !Array.isArray(mm) || times.length !== mm.length) return null;

  const slots = times
    .map((t, i) => ({ start: t * 1000 - QUARTER, end: t * 1000, wet: Number(mm[i]) >= WET_MM }))
    .filter((s) => s.end > now);
  if (slots.length === 0) return null;

  const current = slots[0].start <= now ? slots[0] : null;
  const rainingNow = Boolean(current?.wet) || Number(json.current.precipitation) >= WET_MM;
  const ahead = current ? slots.slice(1) : slots;
  let rainAt = null;
  let dryAt = null;
  if (rainingNow) {
    dryAt = ahead.find((s) => !s.wet)?.start ?? null;
  } else {
    const firstWet = ahead.findIndex((s) => s.wet);
    if (firstWet >= 0) {
      rainAt = ahead[firstWet].start;
      dryAt = ahead.slice(firstWet).find((s) => !s.wet)?.start ?? null;
    }
  }
  return { tempC: Math.round(temp), rainingNow, rainAt, dryAt };
}

/**
 * Weather fetcher with a 15-minute cache per spot (rounded to ~1 km). Resolves to the raw
 * Open-Meteo answer, so the caller parses it with parseWeather() at the time it shows it (a
 * forecast fetched at 17:00 still reads right at 17:20). Never throws: without an answer it
 * resolves to null, and the app simply leaves the weather out.
 */
export function createWeatherSource({ fetchFn = globalThis.fetch?.bind(globalThis), clock = () => Date.now() } = {}) {
  const cache = new Map(); // key → { at, json }

  return async function weatherAt(latLng) {
    if (!latLng || typeof fetchFn !== 'function') return null;
    const key = `${latLng.lat.toFixed(2)},${latLng.lng.toFixed(2)}`;
    const hit = cache.get(key);
    if (hit && clock() - hit.at < CACHE_MS) return hit.json;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), TIMEOUT_MS);
    try {
      const res = await fetchFn(openMeteoUrl(latLng), controller ? { signal: controller.signal } : undefined);
      if (!res.ok) return null;
      const json = await res.json();
      if (!parseWeather(json, clock())) return null;
      cache.set(key, { at: clock(), json });
      return json;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}
