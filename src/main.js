import {
  createMockProvider,
  createGoogleProvider,
  generateRoutes,
  defaultToleranceKm,
  maxProviderCallsFor,
  googleMapsDirectionsUrl,
  listRoutes,
  saveRoute,
  deleteRoute,
} from './core/index.js';
import { loadGoogleMaps } from './ui/googleLoader.js';
import { createMap } from './ui/map.js';
import { createTabBar } from './ui/components/tabbar.js';
import { createSheet } from './ui/components/sheet.js';
import { createStartPill, openStartSheet } from './ui/components/startPicker.js';
import { renderPlanSheet } from './ui/screens/plan.js';
import { renderResultsSheet } from './ui/screens/results.js';
import { renderSavedList } from './ui/screens/saved.js';

const FALLBACK_START = { lat: 52.0907, lng: 5.1214 };

const params = new URLSearchParams(window.location.search);
const forceMock = params.get('mock') === '1';
const apiKey = window.LOOPLY_CONFIG?.googleMapsApiKey || '';
const useGoogle = !forceMock && Boolean(apiKey);

const state = {
  tab: 'plan', // 'plan' | 'saved'
  planScreen: 'form', // 'form' | 'results'
  savedScreen: 'list', // 'list' | 'detail'
  mode: 'walk',
  distanceByMode: { walk: 5, run: 7.5, bike: 30 },
  start: null,
  startLabel: 'Locatie zoeken…',
  routesStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  progressText: '',
  errorMessage: '',
  routes: [],
  selectedRouteId: null,
  savedRoutes: [],
};

let map = null;
let provider = null;

const app = document.getElementById('app');
const mapContainer = document.createElement('div');
mapContainer.id = 'map';
mapContainer.className = 'map-layer';
const screenLayer = document.createElement('div');
screenLayer.className = 'screen-layer';
app.append(mapContainer, screenLayer);

init();

async function init() {
  if (useGoogle) {
    try {
      const google = await loadGoogleMaps(apiKey);
      provider = createGoogleProvider(google);
      map = createMap({ container: mapContainer, mode: 'google', google });
    } catch (err) {
      console.error('Google Maps kon niet geladen worden, terug naar demo-modus.', err);
      provider = createMockProvider();
      map = createMap({ container: mapContainer, mode: 'svg' });
    }
  } else {
    provider = createMockProvider();
    map = createMap({ container: mapContainer, mode: 'svg' });
  }

  render();
  resolveCurrentLocation();
}

function resolveCurrentLocation() {
  if (!navigator.geolocation) {
    useFallbackStart('Geolocatie niet beschikbaar op dit toestel.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'Huidige locatie'),
    () => useFallbackStart('Locatie niet beschikbaar, Utrecht Domplein gebruikt.'),
    { timeout: 10000 }
  );
}

function useFallbackStart(message) {
  console.warn(message);
  setStart(FALLBACK_START, 'Utrecht Domplein');
}

function setStart(latLng, label) {
  state.start = latLng;
  state.startLabel = label;
  map.setStart(latLng);
  render();
}

function render() {
  state.savedRoutes = listRoutes();
  renderScreenLayer();
  renderTabBar();
}

function renderTabBar() {
  const existing = app.querySelector('.tabbar');
  if (existing) existing.remove();
  app.appendChild(
    createTabBar({
      active: state.tab,
      onSelect: (tab) => {
        if (state.tab === tab) {
          if (tab === 'plan') state.planScreen = 'form';
          if (tab === 'saved') state.savedScreen = 'list';
        }
        state.tab = tab;
        render();
      },
    })
  );
}

function renderScreenLayer() {
  screenLayer.textContent = '';
  screenLayer.className = 'screen-layer';

  if (state.tab === 'saved' && state.savedScreen === 'list') {
    mapContainer.hidden = true;
    screenLayer.classList.add('screen-layer--saved');
    screenLayer.appendChild(
      renderSavedList({ routes: state.savedRoutes, onOpen: openSavedDetail, onDelete: handleDelete })
    );
    return;
  }

  mapContainer.hidden = false;

  if (state.tab === 'plan' && state.planScreen === 'form') {
    map.showRoute(null);
    screenLayer.appendChild(createStartPill({ label: state.startLabel, onTap: openStartPicker }));
    screenLayer.appendChild(
      createSheet({
        content: renderPlanSheet({
          mode: state.mode,
          distanceKm: state.distanceByMode[state.mode],
          onModeChange: handleModeChange,
          onDistanceChange: handleDistanceChange,
          onSearch: handleSearch,
        }),
      })
    );
    return;
  }

  // Results view — reused for both plan-tab search results and a saved-tab detail view.
  const savedIds = new Set(state.savedRoutes.map((r) => r.id));
  screenLayer.appendChild(
    createSheet({
      content: renderResultsSheet({
        status: state.routesStatus,
        progressText: state.progressText,
        errorMessage: state.errorMessage,
        routes: state.routes,
        selectedRouteId: state.selectedRouteId,
        savedIds,
        onSelectRoute: handleSelectRoute,
        onSave: handleSave,
        onOpenMaps: handleOpenMaps,
        onRetry: handleSearch,
      }),
    })
  );
}

function handleModeChange(mode) {
  state.mode = mode;
  render();
}

function handleDistanceChange(value) {
  // Slider updates its own label; no full re-render needed mid-drag.
  state.distanceByMode[state.mode] = value;
}

async function handleSearch() {
  state.tab = 'plan';
  state.planScreen = 'results';
  state.routesStatus = 'loading';
  state.progressText = 'Routes zoeken…';
  state.routes = [];
  state.selectedRouteId = null;
  render();

  try {
    const routes = await generateRoutes({
      start: state.start || FALLBACK_START,
      distanceKm: state.distanceByMode[state.mode],
      mode: state.mode,
      provider,
      count: 8, // more candidates than the 5 we need, so dedupe rarely drops us below 5
      toleranceKm: defaultToleranceKm(state.mode),
      maxProviderCalls: maxProviderCallsFor(state.distanceByMode[state.mode]),
      onProgress: handleProgress,
    });
    state.routesStatus = 'ready';
    state.routes = routes;
    const selected = routes[0] ?? null;
    state.selectedRouteId = selected?.id ?? null;
    if (selected) {
      map.showRoute(selected);
      map.fitTo(selected);
    }
  } catch (err) {
    state.routesStatus = 'error';
    state.errorMessage = errorMessageFor(err);
  }
  render();
}

function handleProgress(info) {
  // generator.js calls onProgress({ done, total }) after each attempted candidate.
  const done = info?.done ?? info?.current ?? info?.attempt;
  const total = info?.total ?? info?.count;
  state.progressText = Number.isFinite(done) && Number.isFinite(total)
    ? `Route ${done} van ${total}…`
    : 'Routes zoeken…';
  render();
}

function errorMessageFor(err) {
  switch (err?.code) {
    case 'ZERO_RESULTS':
      return 'Geen routes gevonden voor deze afstand en locatie. Probeer een andere afstand.';
    case 'OVER_QUERY_LIMIT':
      return 'De limiet voor kaartaanvragen is bereikt. Probeer het later opnieuw.';
    case 'REQUEST_DENIED':
      return 'Google heeft de kaartsleutel geweigerd. Controleer de API-key in de instellingen.';
    default:
      return 'Er ging iets mis bij het zoeken naar routes. Probeer het opnieuw.';
  }
}

function handleSelectRoute(id) {
  state.selectedRouteId = id;
  const route = state.routes.find((r) => r.id === id);
  if (route) {
    map.showRoute(route);
    map.fitTo(route);
  }
  render();
}

function handleSave(route) {
  saveRoute(route);
  render();
}

function handleOpenMaps(route) {
  window.open(googleMapsDirectionsUrl(route), '_blank');
}

function handleDelete(route) {
  deleteRoute(route.id);
  render();
}

function openSavedDetail(route) {
  state.tab = 'saved';
  state.savedScreen = 'detail';
  state.routesStatus = 'ready';
  state.routes = [route];
  state.selectedRouteId = route.id;
  map.showRoute(route);
  map.fitTo(route);
  render();
}

function openStartPicker() {
  openStartSheet({
    mode: useGoogle ? 'google' : 'mock',
    google: useGoogle ? window.google : null,
    onUseCurrentLocation: resolveCurrentLocation,
    onCoords: ({ latLng, label }) => setStart(latLng, label),
    onPlace: ({ latLng, label }) => setStart(latLng, label),
  });
}
