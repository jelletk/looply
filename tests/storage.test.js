import { describe, it, expect, beforeEach } from 'vitest';
import { createRouteStore, STORAGE_KEY } from '../src/core/storage.js';
import * as storageModule from '../src/core/storage.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    _data: data,
  };
}

function route(id, createdAt, name = `Route ${id}`) {
  return {
    id,
    name,
    mode: 'walk',
    start: { lat: 52, lng: 5 },
    waypoints: [],
    distanceKm: 5,
    durationMin: 60,
    path: [],
    bearingDeg: 0,
    createdAt,
  };
}

describe('createRouteStore', () => {
  let storage;
  let store;

  beforeEach(() => {
    storage = memoryStorage();
    store = createRouteStore(storage);
  });

  it('starts empty', () => {
    expect(store.listRoutes()).toEqual([]);
    expect(store.getRoute('nope')).toBeNull();
  });

  it('saves and lists newest first', () => {
    store.saveRoute(route('a', '2026-09-01T10:00:00.000Z'));
    store.saveRoute(route('c', '2026-09-03T10:00:00.000Z'));
    store.saveRoute(route('b', '2026-09-02T10:00:00.000Z'));
    expect(store.listRoutes().map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(storage.getItem(STORAGE_KEY)).toBeTypeOf('string');
  });

  it('gets a route by id', () => {
    store.saveRoute(route('a', '2026-09-01T10:00:00.000Z'));
    expect(store.getRoute('a').name).toBe('Route a');
  });

  it('upserts on the same id', () => {
    store.saveRoute(route('a', '2026-09-01T10:00:00.000Z', 'first'));
    store.saveRoute(route('a', '2026-09-01T10:00:00.000Z', 'second'));
    expect(store.listRoutes()).toHaveLength(1);
    expect(store.getRoute('a').name).toBe('second');
  });

  it('fills createdAt when missing', () => {
    const saved = store.saveRoute({ ...route('a'), createdAt: undefined });
    expect(typeof saved.createdAt).toBe('string');
    expect(store.getRoute('a').createdAt).toBe(saved.createdAt);
  });

  it('deletes and reports whether something was removed', () => {
    store.saveRoute(route('a', '2026-09-01T10:00:00.000Z'));
    expect(store.deleteRoute('a')).toBe(true);
    expect(store.deleteRoute('a')).toBe(false);
    expect(store.listRoutes()).toEqual([]);
  });

  it('renames', () => {
    store.saveRoute(route('a', '2026-09-01T10:00:00.000Z'));
    expect(store.renameRoute('a', 'Ochtendrondje').name).toBe('Ochtendrondje');
    expect(store.getRoute('a').name).toBe('Ochtendrondje');
    expect(store.renameRoute('missing', 'x')).toBeNull();
  });

  it('tolerates corrupt storage', () => {
    storage.setItem(STORAGE_KEY, '{not json');
    expect(store.listRoutes()).toEqual([]);
  });

  it('rejects routes without id', () => {
    expect(() => store.saveRoute({})).toThrow();
  });
});

describe('default named exports', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('use window.localStorage lazily', () => {
    expect(storageModule.listRoutes()).toEqual([]);
    storageModule.saveRoute(route('z', '2026-09-05T10:00:00.000Z'));
    expect(storageModule.listRoutes().map((r) => r.id)).toEqual(['z']);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toHaveLength(1);
    storageModule.renameRoute('z', 'Nieuw');
    expect(storageModule.getRoute('z').name).toBe('Nieuw');
    expect(storageModule.deleteRoute('z')).toBe(true);
    expect(storageModule.listRoutes()).toEqual([]);
  });
});
