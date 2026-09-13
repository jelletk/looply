// Persistence of saved routes. Newest first. Injectable storage for tests.

export const STORAGE_KEY = 'looply.routes.v1';

function readAll(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(storage, routes) {
  storage.setItem(STORAGE_KEY, JSON.stringify(routes));
}

function byNewest(a, b) {
  return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

/** Create a route store on top of any object with getItem/setItem/removeItem. */
export function createRouteStore(storage = window.localStorage) {
  function listRoutes() {
    return readAll(storage).sort(byNewest);
  }

  function getRoute(id) {
    return readAll(storage).find((r) => r.id === id) ?? null;
  }

  function saveRoute(route) {
    if (!route || !route.id) throw new Error('saveRoute: route.id is required');
    const routes = readAll(storage).filter((r) => r.id !== route.id);
    const stored = { ...route, createdAt: route.createdAt || new Date().toISOString() };
    routes.push(stored);
    writeAll(storage, routes.sort(byNewest));
    return stored;
  }

  function deleteRoute(id) {
    const routes = readAll(storage);
    const remaining = routes.filter((r) => r.id !== id);
    if (remaining.length === routes.length) return false;
    writeAll(storage, remaining);
    return true;
  }

  function renameRoute(id, name) {
    const routes = readAll(storage);
    const route = routes.find((r) => r.id === id);
    if (!route) return null;
    route.name = name;
    writeAll(storage, routes);
    return route;
  }

  return { listRoutes, getRoute, saveRoute, deleteRoute, renameRoute };
}

let defaultStore = null;

// Lazily bind to window.localStorage so importing this module is safe in Node.
function store() {
  if (!defaultStore) defaultStore = createRouteStore(window.localStorage);
  return defaultStore;
}

export function listRoutes() {
  return store().listRoutes();
}
export function getRoute(id) {
  return store().getRoute(id);
}
export function saveRoute(route) {
  return store().saveRoute(route);
}
export function deleteRoute(id) {
  return store().deleteRoute(id);
}
export function renameRoute(id, name) {
  return store().renameRoute(id, name);
}
