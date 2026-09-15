// Google Maps DirectionsService adapter.

const KNOWN_CODES = new Set(['ZERO_RESULTS', 'OVER_QUERY_LIMIT', 'REQUEST_DENIED']);

function providerError(status, message) {
  const code = KNOWN_CODES.has(status) ? status : 'UNKNOWN';
  const err = new Error(message || `Directions request failed: ${status || 'UNKNOWN'}`);
  err.code = code;
  err.status = status;
  return err;
}

/** Call DirectionsService.route supporting both the Promise and the callback form. */
function callRoute(service, request) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (result, status) => {
      if (settled) return;
      settled = true;
      if (status && status !== 'OK') {
        reject(providerError(status));
      } else if (result && result.status && result.status !== 'OK') {
        reject(providerError(result.status));
      } else if (result) {
        resolve(result);
      } else {
        reject(providerError('UNKNOWN', 'Directions request returned no result'));
      }
    };

    let maybePromise;
    try {
      maybePromise = service.route(request, (result, status) => done(result, status));
    } catch (e) {
      settled = true;
      reject(normaliseThrown(e));
      return;
    }
    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise.then(
        (result) => done(result, result && result.status),
        (e) => {
          if (settled) return;
          settled = true;
          reject(normaliseThrown(e));
        },
      );
    }
  });
}

function normaliseThrown(e) {
  if (e && e.code && KNOWN_CODES.has(e.code)) return e;
  const status = (e && (e.code || e.status)) || (typeof e === 'string' ? e : undefined);
  const err = providerError(status, e && e.message);
  err.cause = e;
  return err;
}

function toLatLng(p) {
  if (!p) return null;
  const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
  const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Decode an encoded polyline string into plain LatLng points. */
export function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function extractPath(googleRoute, google) {
  if (Array.isArray(googleRoute.overview_path) && googleRoute.overview_path.length) {
    return googleRoute.overview_path.map(toLatLng).filter(Boolean);
  }
  const poly = googleRoute.overview_polyline;
  const encoded = typeof poly === 'string' ? poly : poly && poly.points;
  if (encoded) {
    const decoder = google?.maps?.geometry?.encoding?.decodePath;
    const decoded = typeof decoder === 'function' ? decoder(encoded) : decodePolyline(encoded);
    return decoded.map(toLatLng).filter(Boolean);
  }
  // Last resort: concatenate leg steps.
  const path = [];
  for (const leg of googleRoute.legs || []) {
    for (const step of leg.steps || []) {
      for (const p of step.path || []) {
        const q = toLatLng(p);
        if (q) path.push(q);
      }
    }
  }
  return path;
}

export function createGoogleProvider(google) {
  if (!google || !google.maps || !google.maps.DirectionsService) {
    throw new Error('createGoogleProvider: google.maps.DirectionsService is not available');
  }
  const service = new google.maps.DirectionsService();
  const TravelMode = google.maps.TravelMode || { WALKING: 'WALKING', BICYCLING: 'BICYCLING' };

  return {
    async route({ start, waypoints = [], mode }) {
      const request = {
        origin: { lat: start.lat, lng: start.lng },
        destination: { lat: start.lat, lng: start.lng },
        // `via: true` marks a pass-through point (stopover: false); everything else is a stopover.
        waypoints: waypoints.map((w) => ({ location: { lat: w.lat, lng: w.lng }, stopover: !w.via })),
        travelMode: mode === 'bike' ? TravelMode.BICYCLING : TravelMode.WALKING,
        optimizeWaypoints: false,
        avoidHighways: true,
      };

      const result = await callRoute(service, request);
      const googleRoute = result.routes && result.routes[0];
      if (!googleRoute) throw providerError('ZERO_RESULTS', 'Directions returned no routes');

      const meters = (googleRoute.legs || []).reduce(
        (sum, leg) => sum + ((leg.distance && leg.distance.value) || 0),
        0,
      );
      const path = extractPath(googleRoute, google);
      if (!path.length) throw providerError('UNKNOWN', 'Directions route has no path');

      return { distanceKm: meters / 1000, path };
    },
  };
}
