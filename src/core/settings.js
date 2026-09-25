// User settings: home start point, "close to home" switch and own speeds. Injectable storage for tests.

export const SETTINGS_KEY = 'looply.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  home: null, // { lat, lng, label }
  closeToHome: false,
  speeds: Object.freeze({ walk: 5, run: 10, bike: 22 }), // km/h; run 10 km/h = 6:00 min/km
});

function sanitize(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const home =
    s.home && Number.isFinite(s.home.lat) && Number.isFinite(s.home.lng)
      ? { lat: s.home.lat, lng: s.home.lng, label: String(s.home.label || 'Thuis') }
      : null;
  const speeds = { ...DEFAULT_SETTINGS.speeds };
  for (const mode of Object.keys(speeds)) {
    const v = Number(s.speeds?.[mode]);
    if (Number.isFinite(v) && v > 0 && v < 100) speeds[mode] = v;
  }
  return { home, closeToHome: s.closeToHome === true, speeds };
}

/** Create a settings store on top of any object with getItem/setItem. Never throws on read. */
export function createSettingsStore(storage = window.localStorage) {
  function load() {
    try {
      return sanitize(JSON.parse(storage.getItem(SETTINGS_KEY) || 'null'));
    } catch {
      return sanitize(null);
    }
  }

  /** Merge `patch` into the stored settings and return the result. Throws when storage is unavailable. */
  function update(patch) {
    const next = sanitize({ ...load(), ...patch, speeds: { ...load().speeds, ...(patch.speeds || {}) } });
    storage.setItem(SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  return { load, update };
}
