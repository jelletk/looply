// User settings: home start point, "close to home" switch, own speeds and the last plan choices.
// Injectable storage for tests.

export const SETTINGS_KEY = 'looply.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  home: null, // { lat, lng, label }
  closeToHome: false,
  speeds: Object.freeze({ walk: 5, run: 10, bike: 22 }), // km/h; run 10 km/h = 6:00 min/km
  mode: 'walk', // last chosen mode
  distances: Object.freeze({ walk: 5, run: 7.5, bike: 30 }), // last chosen distance per mode (km)
  showProto: false, // test panel for time, weather and failures (Instellingen › Testen)
  resultsHints: 0, // times the "veeg omhoog" hint was shown; it shows twice
  homeAsked: false, // "Is dit thuis?" was offered once
});

const DISTANCE_LIMITS = { walk: [1, 20], run: [1, 30], bike: [5, 100] };

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
  const distances = { ...DEFAULT_SETTINGS.distances };
  for (const [mode, [min, max]] of Object.entries(DISTANCE_LIMITS)) {
    const v = Number(s.distances?.[mode]);
    if (Number.isFinite(v) && v >= min && v <= max) distances[mode] = v;
  }
  const mode = s.mode in DISTANCE_LIMITS ? s.mode : DEFAULT_SETTINGS.mode;
  const hints = Number(s.resultsHints);
  return {
    home,
    closeToHome: s.closeToHome === true,
    speeds,
    mode,
    distances,
    showProto: s.showProto === true,
    resultsHints: Number.isInteger(hints) && hints > 0 ? hints : 0,
    homeAsked: s.homeAsked === true,
  };
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
    const now = load();
    const next = sanitize({
      ...now,
      ...patch,
      speeds: { ...now.speeds, ...(patch.speeds || {}) },
      distances: { ...now.distances, ...(patch.distances || {}) },
    });
    storage.setItem(SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  return { load, update };
}
