// Build a Google Maps directions deep link for a route.

const MAX_WAYPOINTS = 9;

function fmt(p) {
  return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

function travelMode(mode) {
  return mode === 'bike' ? 'bicycling' : 'walking';
}

/**
 * https://www.google.com/maps/dir/?api=1&origin=..&destination=..&waypoints=..|..&travelmode=..
 * Origin and destination are the start point; at most 9 waypoints are included.
 */
export function googleMapsDirectionsUrl(route) {
  const start = fmt(route.start);
  const waypoints = (route.waypoints || []).slice(0, MAX_WAYPOINTS).map(fmt).join('|');
  const params = [
    'api=1',
    `origin=${encodeURIComponent(start)}`,
    `destination=${encodeURIComponent(start)}`,
  ];
  if (waypoints) params.push(`waypoints=${encodeURIComponent(waypoints)}`);
  params.push(`travelmode=${travelMode(route.mode)}`);
  return `https://www.google.com/maps/dir/?${params.join('&')}`;
}
