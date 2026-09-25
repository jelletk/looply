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
import { showToast } from './ui/components/toast.js';
import { createBackButton } from './ui/components/backButton.js';
import { openLocationIntro, locationIntroSeen } from './ui/components/locationIntro.js';

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
  startLabel: 'Startpunt kiezen',
  routesStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  progressText: '',
  errorMessage: '',
  routes: [], // the last search's results; a saved route opened from the Saved tab never replaces them
  selectedRouteId: null,
  savedRoutes: [],
  savedRoute: null, // route shown in the Saved tab's detail view
};

let map = null;
let provider = null;
let searchController = null; // AbortController of the search in progress
let shownRouteId; // route currently drawn on the map (undefined: nothing drawn yet)

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
      showToast('Google Maps laadt niet (verbinding of kaartsleutel). Je ziet nu de demo-modus met geschetste routes.', { durationMs: 8000 });
    }
  } else {
    provider = createMockProvider();
    map = createMap({ container: mapContainer, mode: 'svg' });
  }

  render();
  if (locationIntroSeen()) {
    resolveCurrentLocation();
  } else {
    openLocationIntro({ onAllow: resolveCurrentLocation, onChoose: openStartPicker });
  }
}

function resolveCurrentLocation() {
  if (!navigator.geolocation) {
    showToast('Dit toestel geeft geen locatie door. Kies zelf een startpunt.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'Huidige locatie'),
    (err) => showToast(locationErrorMessage(err), { durationMs: 8000 }),
    { timeout: 10000 }
  );
}

function locationErrorMessage(err) {
  switch (err?.code) {
    case 1: // PERMISSION_DENIED
      return 'Looply mag je locatie niet gebruiken. Zet het aan via Instellingen › Privacy en beveiliging › Locatievoorzieningen, of kies zelf een startpunt.';
    case 3: // TIMEOUT
      return 'Je locatie bepalen duurde te lang. Probeer het opnieuw of kies zelf een startpunt.';
    default:
      return 'Je locatie is nu niet te bepalen. Kies zelf een startpunt.';
  }
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
    showOnMap(null);
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
  const inSaved = state.tab === 'saved';
  const routes = inSaved ? [state.savedRoute] : state.routes;
  const selectedRouteId = inSaved ? state.savedRoute.id : state.selectedRouteId;
  const status = inSaved ? 'ready' : state.routesStatus;
  if (status === 'ready') showOnMap(routes.find((r) => r.id === selectedRouteId) ?? null);
  else showOnMap(null);

  screenLayer.appendChild(
    createBackButton({ label: inSaved ? 'Terug naar opgeslagen' : 'Terug naar plannen', onTap: handleBack })
  );
  const savedIds = new Set(state.savedRoutes.map((r) => r.id));
  screenLayer.appendChild(
    createSheet({
      content: renderResultsSheet({
        status,
        progressText: state.progressText,
        errorMessage: state.errorMessage,
        routes,
        selectedRouteId,
        savedIds,
        onSelectRoute: handleSelectRoute,
        onSave: handleSave,
        onOpenMaps: handleOpenMaps,
        onRetry: handleSearch,
        onCancel: handleCancel,
      }),
    })
  );
}

/** Draw `route` on the map and fit to it, only when it differs from what is already drawn. */
function showOnMap(route) {
  const id = route?.id ?? null;
  if (id === shownRouteId) return;
  shownRouteId = id;
  map.showRoute(route);
  if (route) map.fitTo(route);
}

function handleBack() {
  if (state.tab === 'saved') {
    state.savedScreen = 'list';
  } else {
    if (state.routesStatus === 'loading') abortSearch();
    state.planScreen = 'form';
  }
  render();
}

function handleCancel() {
  abortSearch();
  state.planScreen = 'form';
  render();
}

function abortSearch() {
  searchController?.abort();
  searchController = null;
  state.routesStatus = 'idle';
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
  if (!state.start) {
    showToast('Kies eerst een startpunt.');
    openStartPicker();
    return;
  }
  searchController?.abort();
  const controller = new AbortController();
  searchController = controller;

  state.tab = 'plan';
  state.planScreen = 'results';
  state.routesStatus = 'loading';
  state.progressText = 'Routes zoeken…';
  state.routes = [];
  state.selectedRouteId = null;
  render();

  try {
    const routes = await generateRoutes({
      start: state.start,
      distanceKm: state.distanceByMode[state.mode],
      mode: state.mode,
      provider,
      count: 8, // more candidates than the 5 we need, so dedupe rarely drops us below 5
      toleranceKm: defaultToleranceKm(state.mode),
      maxProviderCalls: maxProviderCallsFor(state.distanceByMode[state.mode]),
      onProgress: (info) => {
        if (controller === searchController) handleProgress(info);
      },
      signal: controller.signal,
    });
    if (controller !== searchController) return;
    state.routesStatus = 'ready';
    state.routes = routes;
    state.selectedRouteId = routes[0]?.id ?? null;
  } catch (err) {
    if (err?.code === 'ABORTED' || controller !== searchController) return;
    state.routesStatus = 'error';
    state.errorMessage = errorMessageFor(err);
  }
  searchController = null;
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
  if (navigator.onLine === false) {
    return 'Je bent offline. Controleer je internetverbinding en probeer het opnieuw.';
  }
  switch (err?.code) {
    case 'NO_ANSWER':
      return 'Google gaf geen antwoord. Controleer je internetverbinding en probeer het opnieuw.';
    case 'NO_ROUTES':
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
  render();
}

function handleSave(route) {
  try {
    saveRoute(route);
  } catch (err) {
    console.error('Saving the route failed', err);
    showToast('Opslaan lukte niet. In een privévenster of met een volle opslag kan Safari niets bewaren.', { durationMs: 8000 });
    return;
  }
  render();
}

function handleOpenMaps(route) {
  window.open(googleMapsDirectionsUrl(route), '_blank');
}

function handleDelete(route) {
  try {
    deleteRoute(route.id);
  } catch (err) {
    console.error('Deleting the route failed', err);
    showToast('Verwijderen lukte niet. Probeer het opnieuw.');
    return;
  }
  render();
}

function openSavedDetail(route) {
  state.tab = 'saved';
  state.savedScreen = 'detail';
  state.savedRoute = route;
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
