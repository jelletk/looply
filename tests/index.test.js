import { describe, it, expect } from 'vitest';
import * as core from '../src/core/index.js';

describe('core index', () => {
  it('re-exports the contract surface', () => {
    const expected = [
      'haversineKm', 'destinationPoint', 'pathLengthKm', 'bearingDeg', 'routeOverlap',
      'densifyPath', 'selfOverlapFraction', 'findSpurs',
      'generateRoutes', 'buildLoopWaypoints', 'defaultToleranceKm',
      'createGoogleProvider', 'createMockProvider',
      'estimateDurationMin', 'formatDuration', 'formatKm',
      'createRouteStore', 'listRoutes', 'getRoute', 'saveRoute', 'deleteRoute', 'renameRoute',
      'googleMapsDirectionsUrl',
    ];
    for (const name of expected) {
      expect(core[name], name).toBeTypeOf('function');
    }
  });
});
