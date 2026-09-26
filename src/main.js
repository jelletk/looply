import {
  createMockProvider,
  createGoogleProvider,
  generateRoutes,
  generateTwoLoopRoutes,
  defaultToleranceKm,
  maxProviderCallsFor,
  googleMapsDirectionsUrl,
  listRoutes,
  saveRoute,
  deleteRoute,
  createSettingsStore,
  setSpeeds,
  sunTimes,
  createWeatherSource,
  parseWeather,
} from './core/index.js';
import { loadGoogleMaps } from './ui/googleLoader.js';
import { createRouteMap } from './ui/map.js';
import { createSky } from './ui/sky.js';
import { h, icon } from './ui/dom.js';
import { createTabBar } from './ui/components/tabbar.js';
import { showSheet, sheetHead } from './ui/components/sheet.js';
import { showToast } from './ui/components/toast.js';
import { openStartSheet } from './ui/components/startSheet.js';
import { createPlaceSearch } from './ui/places.js';
import { renderToday } from './ui/screens/today.js';
import { renderLoading, renderError, renderPosters, openMapSheet } from './ui/screens/results.js';
import { renderSaved } from './ui/screens/saved.js';
import { renderSettings } from './ui/screens/settings.js';
import { PROTO_DEFAULTS, protoNow, protoWeather, openProtoPanel } from './ui/proto.js';
import pkg from '../package.json';

const params = new URLSearchParams(window.location.search);
const forceMock = params.get('mock') === '1';
const apiKey = window.LOOPLY_CONFIG?.googleMapsApiKey || '';
const useGoogle = !forceMock && Boolean(apiKey);

const UTRECHT = { lat: 52.0907, lng: 5.1214 };
const WELCOME_KEY = 'looply.locationIntro.v1'; // shared with the old location intro: seen once is enough
const WEATHER_EVERY_MS = 15 * 60 * 1000;

const state = {
  tab: 'today', // 'today' | 'saved' | 'settings'
  flow: null, // null | 'loading' | 'error' | 'results' | 'saved-route': full screen over the tabs
  start: null, // { latLng, label, kind: 'home' | 'here' | 'place' }
  askHome: false, // "Is dit thuis?" under the start pill
  routes: [], // the last search's results
  query: null, // the plan they were found for (see queryKey)
  page: 0, // poster in view
  savedFilter: 'all',
  weatherJson: null, // raw Open-Meteo answer for the start point (null: none), parsed at render time
  locationState: 'prompt', // 'granted' | 'denied' | 'prompt'
  confirmingHomeDelete: false,
};

const proto = { ...PROTO_DEFAULTS };
const settingsStore = openSettingsStore();
let settings = settingsStore.load();
setSpeeds(settings.speeds);

let provider = createMockProvider();
let google = null;
let routeMap = null; // one Google map, created when the first results show
let placeSearch = createPlaceSearch(null);
const weatherAt = createWeatherSource();
let searchController = null;
let lastAgain = false; // a retry repeats the kind of search that failed
let lastFix = null; // last location fix from the start sheet or the welcome
let flowView = null; // the element on the flow layer (loading, error or posters)
let lastTouch = 0;

// ---------- Layout ----------

const app = document.getElementById('app');
const sky = createSky(document.body);
const page = h('main', { class: 'page' });
const flow = h('section', { class: 'flow', hidden: true });
const tabbarSlot = h('div');
const protoBtn = h('button', { class: 'proto', type: 'button', onclick: openProto, 'aria-label': 'Prototype: tijd, weer en fouten nabootsen' }, 'Prototype');
app.append(page, flow, tabbarSlot, protoBtn);
// Real input only: the ruler scrolls by itself when it is drawn, which must not count.
for (const type of ['pointerdown', 'touchstart', 'keydown', 'wheel']) app.addEventListener(type, () => (lastTouch = Date.now()), { capture: true, passive: true });
// Focus rings only show after keyboard use (see base.css).
addEventListener('keydown', (e) => e.key === 'Tab' && (document.documentElement.dataset.input = 'keyboard'), true);
addEventListener('pointerdown', () => delete document.documentElement.dataset.input, true);

async function init() {
  if (useGoogle) {
    try {
      google = await loadGoogleMaps(apiKey);
      provider = createGoogleProvider(google);
      placeSearch = createPlaceSearch(google);
    } catch (err) {
      console.error('Google Maps kon niet geladen worden, terug naar demo-modus.', err);
      google = null;
      showToast('Google Maps laadt niet. Je ziet nu de demo-modus met geschetste routes.', { durationMs: 6000 });
    }
  }
  watchLocationPermission();

  if (settings.home) {
    setStart(settings.home, 'Thuis', 'home');
  } else if (welcomeSeen()) {
    render();
    locate().then((error) => !error && useFix());
  } else {
    render();
    openWelcome();
  }
  refreshWeather();
  setInterval(tick, 60 * 1000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick());
}

// ---------- Time, sun, weather ----------

function skySpot() {
  return state.start?.latLng ?? settings.home ?? UTRECHT;
}

function sunAt(ms, spot = skySpot()) {
  return sunTimes(new Date(ms), spot.lat, spot.lng);
}

function now() {
  const real = Date.now();
  return protoNow(proto, real, sunAt(real));
}

function weatherNow(t) {
  const fake = protoWeather(proto, t);
  return fake === undefined ? parseWeather(state.weatherJson, t) : fake;
}

let weatherAsked = 0;
async function refreshWeather() {
  weatherAsked = Date.now();
  const spot = skySpot();
  const json = await weatherAt(spot);
  if (spot !== skySpot()) return; // the start moved meanwhile
  const changed = json !== state.weatherJson;
  state.weatherJson = json;
  if (changed) weatherPending = true;
  showPendingWeather();
}

let weatherPending = false;
/** New weather is worth a rebuild even with focus on the page (the plain minute tick is not). */
function showPendingWeather() {
  if (!weatherPending || state.flow || state.tab !== 'today' || !idle({ ignoreFocus: true })) return;
  weatherPending = false;
  const pillFocused = document.activeElement?.matches?.('.start-row .pill');
  renderTab();
  if (pillFocused) page.querySelector('.start-row .pill')?.focus({ preventScroll: true });
}

function idle({ ignoreFocus = false } = {}) {
  const focusOnPage = !ignoreFocus && page.contains(document.activeElement) && document.activeElement !== page;
  return Date.now() - lastTouch > 10000 && !document.querySelector('.scrim') && !focusOnPage;
}

/** Once a minute and when the app comes back: sky, texts, weather. */
function tick() {
  sky.update(now(), sunAt(now()));
  if (Date.now() - weatherAsked > WEATHER_EVERY_MS) refreshWeather();
  showPendingWeather();
  if (!state.flow && state.tab === 'today' && idle()) renderTab();
}

// ---------- Rendering ----------

function render() {
  sky.update(now(), sunAt(now()));
  renderTab();
  renderChrome();
}

function renderChrome() {
  const full = Boolean(state.flow);
  page.hidden = full;
  flow.hidden = !full;
  protoBtn.hidden = full || !settings.showProto;
  tabbarSlot.replaceChildren(full ? '' : createTabBar({ active: state.tab, onSelect: selectTab }));
}

function selectTab(tab) {
  state.tab = tab;
  state.confirmingHomeDelete = false;
  renderTab();
  renderChrome();
  page.scrollTop = 0;
  // The tab bar is rebuilt: keep VoiceOver on the tab that was tapped.
  tabbarSlot.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
}

function renderTab() {
  const t = now();
  sky.update(t, sunAt(t));
  if (state.tab === 'today') page.replaceChildren(todayView(t));
  else if (state.tab === 'saved') page.replaceChildren(savedView());
  else page.replaceChildren(settingsView());
}

function todayView(t) {
  const mode = settings.mode;
  return renderToday({
    mode,
    km: settings.distances[mode],
    near: settings.closeToHome,
    now: t,
    sun: sunAt(t),
    weather: weatherNow(t),
    phase: sky.phase,
    start: state.start,
    askHome: state.askHome,
    resultsFor: (km) => (state.routes.length && state.query === queryKey(km) ? state.routes.length : 0),
    onStartTap: () => openStartPicker('start'),
    onSaveHome: saveStartAsHome,
    onMode: (m) => {
      updateSettings({ mode: m });
      renderTab();
      page.querySelector('.mode[aria-pressed="true"]')?.focus({ preventScroll: true });
    },
    onKm: (km) => updateSettings({ distances: { [mode]: km } }),
    onNear: (on) => updateSettings({ closeToHome: on }),
    onSearch: () => runSearch(),
    onBackToResults: () => showResults(false),
  });
}

function savedView() {
  return renderSaved({
    routes: listRoutes(),
    filter: state.savedFilter,
    onFilter: (f) => {
      state.savedFilter = f;
      renderTab();
    },
    onOpen: showSavedRoute,
  });
}

function settingsView() {
  return renderSettings({
    settings,
    locationState: proto.loc === 'denied' ? 'denied' : state.locationState,
    version: `${pkg.version.split('.').slice(0, 2).join(',')} · Lucht`,
    confirmingHomeDelete: state.confirmingHomeDelete,
    onEditHome: () => openStartPicker('home'),
    onAskDeleteHome: () => {
      state.confirmingHomeDelete = true;
      renderTab();
      page.querySelector('[role="alert"] button')?.focus();
    },
    onCancelDeleteHome: () => {
      state.confirmingHomeDelete = false;
      renderTab();
    },
    onDeleteHome: deleteHome,
    onSpeed: (mode, kmh, label) => {
      updateSettings({ speeds: { [mode]: kmh } });
      renderTab();
      // The page is rebuilt: put focus back on the button the user was on (VoiceOver would lose it).
      page.querySelector(`[data-step="${label}"]`)?.focus();
    },
    onProto: (on) => {
      updateSettings({ showProto: on });
      renderChrome();
    },
  });
}

function setFlow(kind, view) {
  flowView?.dispose?.();
  flowView = view;
  state.flow = kind;
  flow.replaceChildren(view ?? '');
  renderChrome();
  view?.querySelector('h2')?.focus?.({ preventScroll: true });
}

function closeFlow() {
  abortSearch();
  setFlow(null, null);
  renderTab();
  page.querySelector('h1')?.focus?.({ preventScroll: true });
}

// ---------- Settings ----------

/** Settings store; when Safari blocks storage altogether, settings live in memory for this session. */
function openSettingsStore() {
  try {
    return createSettingsStore(window.localStorage);
  } catch {
    const memory = {};
    return createSettingsStore({ getItem: (k) => memory[k] ?? null, setItem: (k, v) => (memory[k] = String(v)) });
  }
}

let storageWarned = false;
function updateSettings(patch) {
  // Merge on what is in memory, so a change that could not be stored is not undone by the next one.
  const next = {
    ...settings,
    ...patch,
    speeds: { ...settings.speeds, ...(patch.speeds || {}) },
    distances: { ...settings.distances, ...(patch.distances || {}) },
  };
  try {
    settings = settingsStore.update(next);
  } catch (err) {
    console.error('Saving settings failed', err);
    settings = next;
    if (!storageWarned) showToast('Instellingen kunnen niet worden bewaard; ze gelden tot je de app sluit.');
    storageWarned = true;
  }
  setSpeeds(settings.speeds);
}

// ---------- Start point and location ----------

function welcomeSeen() {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return false;
  }
}

function markWelcomeSeen() {
  try {
    localStorage.setItem(WELCOME_KEY, '1');
  } catch {
    // Private mode: the welcome simply shows again next time.
  }
}

function watchLocationPermission() {
  navigator.permissions
    ?.query({ name: 'geolocation' })
    .then((status) => {
      state.locationState = status.state;
      status.onchange = () => {
        state.locationState = status.state;
        if (state.tab === 'settings' && !state.flow) renderTab();
      };
    })
    .catch(() => {});
}

/** Ask for the location. → null on success (the fix is in lastFix), or 'denied' | 'timeout' | 'unavailable'. */
function locate() {
  if (proto.loc === 'denied') return Promise.resolve('denied');
  if (!navigator.geolocation) return Promise.resolve('unavailable');
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastFix = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        state.locationState = 'granted';
        resolve(null);
      },
      (err) => {
        if (err?.code === 1) state.locationState = 'denied';
        resolve(err?.code === 1 ? 'denied' : err?.code === 3 ? 'timeout' : 'unavailable');
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  });
}

function useFix() {
  if (state.start && state.start.kind !== 'here') return; // a start picked meanwhile wins
  setStart(lastFix, 'Huidige locatie', 'here');
}

function setStart(latLng, label, kind) {
  state.start = { latLng: { lat: latLng.lat, lng: latLng.lng }, label, kind };
  state.askHome = kind === 'here' && !settings.home && !settings.homeAsked;
  if (state.askHome) updateSettings({ homeAsked: true });
  if (!state.flow) render();
  refreshWeather();
}

function saveStartAsHome() {
  const { latLng } = state.start;
  updateSettings({ home: { ...latLng, label: 'Bewaard vanaf je locatie' } });
  state.askHome = false;
  setStart(latLng, 'Thuis', 'home');
}

function deleteHome() {
  const old = settings.home;
  updateSettings({ home: null });
  state.confirmingHomeDelete = false;
  const wasStart = state.start?.kind === 'home';
  if (wasStart) state.start = { ...state.start, kind: 'place', label: 'Vorige Thuis' };
  renderTab();
  showToast('Thuis verwijderd', {
    undo: () => {
      updateSettings({ home: old });
      // Only when the start is still the old home (not a start picked meanwhile).
      const s = state.start;
      if (wasStart && s?.kind === 'place' && s.label === 'Vorige Thuis' && s.latLng.lat === old.lat && s.latLng.lng === old.lng) {
        state.start = { ...s, kind: 'home', label: 'Thuis' };
      }
      renderTab();
    },
  });
}

function openStartPicker(purpose) {
  openStartSheet({
    purpose,
    home: settings.home,
    currentKind: state.start?.kind,
    locate,
    search: placeSearch,
    onPick: (choice) => {
      pickStart(purpose, choice);
      // The start pill was rebuilt: put focus back on it for VoiceOver (a tap never focused it).
      if (purpose === 'start') page.querySelector('.start-row .pill')?.focus({ preventScroll: true });
    },
  });
}

function pickStart(purpose, choice) {
  if (purpose === 'home') {
    const home =
      choice.kind === 'here' ? { ...lastFix, label: 'Bewaard vanaf je locatie' } : { ...choice.latLng, label: choice.label };
    updateSettings({ home });
    if (state.start?.kind === 'home' || !state.start) setStart(home, 'Thuis', 'home');
    else renderTab();
    return;
  }
  if (choice.kind === 'home') setStart(settings.home, 'Thuis', 'home');
  else if (choice.kind === 'here') setStart(lastFix, 'Huidige locatie', 'here');
  else setStart(choice.latLng, choice.label, 'place');
}

function openWelcome() {
  const sheet = showSheet({
    label: 'Welkom',
    content: h(
      'div',
      { class: 'welcome' },
      h('span', { class: 'welcome__icon' }, icon('loc')),
      h('h2', { class: 't-title3', tabindex: '-1' }, 'Waar begin je meestal?'),
      h('p', { class: 't-callout', style: 'margin:0 0 6px' }, 'Looply zoekt rondjes vanaf je startpunt. Je locatie blijft op je telefoon en gaat alleen naar Google om routes te berekenen.'),
      h('button', {
        class: 'btn btn--primary btn--full',
        type: 'button',
        onclick: async () => {
          markWelcomeSeen();
          sheet.close();
          const error = await locate();
          if (!error) useFix();
          else openStartPicker('start');
        },
      }, 'Gebruik mijn locatie'),
      h('button', {
        class: 'btn--text',
        type: 'button',
        onclick: () => {
          markWelcomeSeen();
          sheet.close();
          openStartPicker('start');
        },
      }, 'Ik vul een adres in')
    ),
  });
}

// ---------- Search ----------

function queryKey(km = settings.distances[settings.mode]) {
  const s = state.start?.latLng;
  return `${settings.mode}|${km}|${settings.closeToHome}|${s ? `${s.lat.toFixed(5)},${s.lng.toFixed(5)}` : ''}`;
}

function abortSearch() {
  searchController?.abort();
  searchController = null;
}

const FAKE_FAILURES = { offline: 'OFFLINE', answer: 'NO_ANSWER', noroutes: 'NO_ROUTES', pairs: 'NO_PAIRS' };

async function fakeFailure(code, loading, signal) {
  for (let i = 1; i <= 8; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (signal.aborted) throw Object.assign(new Error('aborted'), { code: 'ABORTED' });
    loading.progress(i, 8);
  }
  throw Object.assign(new Error('Nagebootste fout'), { code });
}

/**
 * Search routes from the current start. `again`: the user wants other loops than the ones on
 * screen, so those streets are avoided too. Saved routes of this mode are always avoided, so a
 * search favours loops you have not saved yet.
 */
async function runSearch({ again = false } = {}) {
  lastAgain = again;
  if (!state.start) {
    openStartPicker('start');
    return;
  }
  abortSearch();
  const controller = new AbortController();
  searchController = controller;
  const { mode, closeToHome } = settings;
  const km = settings.distances[mode];
  const key = queryKey(km);
  const avoidPaths = [
    ...listRoutes().filter((r) => r.mode === mode).map((r) => r.path),
    ...(again ? state.routes.map((r) => r.path) : []),
  ];

  const loading = renderLoading({ again, onCancel: closeFlow });
  setFlow('loading', loading);

  try {
    const fake = FAKE_FAILURES[proto.fail];
    if (fake && (fake !== 'NO_PAIRS' || closeToHome)) await fakeFailure(fake, loading, controller.signal);
    const generate = closeToHome ? generateTwoLoopRoutes : generateRoutes;
    const routes = await generate({
      start: state.start.latLng,
      distanceKm: km,
      mode,
      provider,
      count: 8, // more candidates than the 5 we need, so dedupe rarely drops us below 5
      toleranceKm: defaultToleranceKm(mode),
      maxProviderCalls: maxProviderCallsFor(km),
      onProgress: (info) => controller === searchController && loading.progress(info?.done, info?.total),
      signal: controller.signal,
      avoidPaths,
    });
    if (controller !== searchController) return;
    searchController = null;
    state.routes = routes;
    state.query = key;
    state.page = 0;
    showResults(true);
  } catch (err) {
    if (err?.code === 'ABORTED' || controller !== searchController) return;
    searchController = null;
    if (again && state.routes.length) {
      showResults(false);
      showToast(offline(err) ? 'Geen internet. Je ziet nog de vorige rondjes.' : 'Geen andere rondjes gevonden. Je ziet nog de vorige.');
      return;
    }
    setFlow('error', renderError({ card: errorCard(err, km), onBack: closeFlow }));
  }
}

function offline(err) {
  return navigator.onLine === false || err?.code === 'OFFLINE';
}

/** One message and one action per failure (UX spec §2.6). */
function errorCard(err, km) {
  const kmText = `${km.toFixed(1).replace('.', ',')} km`;
  const retry = () => runSearch({ again: lastAgain });
  if (offline(err)) {
    return { icon: 'wifi', title: 'Geen internet', body: 'Voor nieuwe rondjes heeft Looply verbinding nodig. Bewaarde rondjes kun je wel openen.', cta: 'Opnieuw', action: retry };
  }
  switch (err?.code) {
    case 'NO_ANSWER':
      return { icon: 'alert', title: 'Google antwoordt niet', body: 'Het duurde te lang. Meestal lukt het bij een tweede poging.', cta: 'Opnieuw', action: retry };
    case 'NO_ROUTES':
    case 'ZERO_RESULTS':
      return { icon: 'alert', title: 'Geen rondje gevonden', body: `Vanaf hier vonden we geen goed rondje van ${kmText}. Probeer een iets andere afstand of startpunt.`, cta: 'Afstand aanpassen', action: closeFlow };
    case 'NO_PAIRS':
      return {
        icon: 'alert',
        title: 'Dicht bij huis lukt niet',
        body: `Bij ${kmText} worden de twee lussen te kort. Kies een langere afstand of zet Dicht bij huis uit.`,
        cta: 'Zet uit en zoek',
        action: () => {
          updateSettings({ closeToHome: false });
          runSearch();
        },
      };
    case 'OVER_QUERY_LIMIT':
      return { icon: 'alert', title: 'Even te veel aanvragen', body: 'De limiet voor kaartaanvragen is bereikt. Probeer het later opnieuw.', cta: 'Terug', action: closeFlow };
    case 'REQUEST_DENIED':
      return { icon: 'alert', title: 'Kaartsleutel geweigerd', body: 'Google weigert de kaartsleutel van Looply. Dit los je op in de Google Cloud Console.', cta: 'Terug', action: closeFlow };
    default:
      return { icon: 'alert', title: 'Er ging iets mis', body: 'Het zoeken naar rondjes lukte niet. Probeer het opnieuw.', cta: 'Opnieuw', action: retry };
  }
}

// ---------- Results and saved routes ----------

function ensureMap() {
  if (!routeMap && google) {
    try {
      routeMap = createRouteMap(google);
    } catch (err) {
      console.error('Map failed', err);
    }
  }
  return routeMap;
}

function posterContext(routes, extra) {
  const t = now();
  const spot = routes[0]?.start ?? skySpot();
  return {
    routes,
    now: t,
    sun: sunAt(t, spot),
    weather: weatherNow(t),
    isSaved: (r) => listRoutes().some((s) => s.id === r.id),
    onSave: toggleSave,
    onOpenMaps: (r) => window.open(googleMapsDirectionsUrl(r), '_blank'),
    onOpenMap: (r) => openMapSheet(r, { map: routeMap, onClose: () => flowView?.remap?.() }),
    // "Kies 3,5 km" on a poster: plan that distance for this route's mode on Vandaag.
    onSuggest: extra?.single
      ? undefined
      : (km) => {
          const mode = routes[0]?.mode ?? settings.mode;
          updateSettings({ mode, distances: { [mode]: km } });
          state.tab = 'today';
          closeFlow();
        },
    map: ensureMap(),
    ...extra,
  };
}

function showResults(fresh) {
  if (!state.routes.length) return;
  const view = renderPosters(
    posterContext(state.routes, {
      page: fresh ? 0 : state.page,
      onBack: closeFlow,
      onAgain: () => runSearch({ again: true }),
      onOtherDistance: closeFlow,
      onPage: (i) => (state.page = i),
      showHint: fresh && settings.resultsHints < 2,
      onHintShown: () => updateSettings({ resultsHints: settings.resultsHints + 1 }),
    })
  );
  setFlow('results', view);
}

function showSavedRoute(route) {
  const view = renderPosters(
    posterContext([route], {
      single: true,
      onBack: closeFlow,
      onMore: () => {
        const sheet = showSheet({
          label: 'Opties',
          content: [
            sheetHead('Opties'),
            h(
              'button',
              {
                class: 'srow',
                type: 'button',
                onclick: () => {
                  sheet.close();
                  removeSaved(route);
                  closeFlow();
                },
              },
              h('span', { class: 'srow__ic danger' }, icon('x')),
              h('span', { class: 'srow__text danger' }, 'Verwijder uit Bewaard')
            ),
            h('p', { class: 't-foot', style: 'margin:10px 8px 0' }, 'Later komen hier ook Hernoemen, Notitie en GPX-export.'),
          ],
        });
      },
    })
  );
  setFlow('saved-route', view);
}

function removeSaved(route) {
  try {
    deleteRoute(route.id);
  } catch (err) {
    console.error('Deleting the route failed', err);
    showToast('Verwijderen lukte niet. Probeer het opnieuw.');
    return;
  }
  showToast('Uit Bewaard gehaald', {
    undo: () => {
      try {
        trySave(route);
      } catch (err) {
        console.error('Saving the route back failed', err);
        showToast('Terugzetten lukt niet. Staat Safari in privémodus?');
        return;
      }
      if (!state.flow) renderTab();
      flowView?.refreshSaved?.();
    },
  });
}

function trySave(route) {
  if (proto.fail === 'save') throw new Error('Nagebootste fout bij bewaren');
  saveRoute(route);
}

function toggleSave(route) {
  if (listRoutes().some((s) => s.id === route.id)) {
    removeSaved(route);
  } else {
    try {
      trySave(route);
    } catch (err) {
      console.error('Saving the route failed', err);
      showToast('Bewaren lukt niet. Staat Safari in privémodus?');
    }
  }
  flowView?.refreshSaved?.();
}

// ---------- Test panel ----------

function openProto() {
  openProtoPanel(proto, {
    onChange: (key, value) => {
      proto[key] = value;
      render();
    },
    onWelcome: () => {
      selectTab('today');
      openWelcome();
    },
    onHint: () => updateSettings({ resultsHints: 0 }),
  });
}

// Start once every module-level binding above exists.
init();
