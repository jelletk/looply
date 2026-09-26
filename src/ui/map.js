// One Google map for the whole app (one map load per visit). It moves to where it is needed:
// under the route shape of the poster in view (subtle, still, no labels), or into the map sheet
// (interactive, with street names and the route drawn on it).

import { viewForBox } from './projection.js';

const QUIET = [
  { elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ saturation: -100 }, { lightness: 10 }] },
  { featureType: 'landscape', stylers: [{ saturation: -60 }] },
];

const READABLE = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

export function createRouteMap(google) {
  const el = document.createElement('div');
  el.style.width = '100%';
  el.style.height = '100%';
  const map = new google.maps.Map(el, {
    center: { lat: 52.0907, lng: 5.1214 },
    zoom: 14,
    disableDefaultUI: true,
    gestureHandling: 'none',
    keyboardShortcuts: false,
    clickableIcons: false,
    isFractionalZoomEnabled: true,
    styles: QUIET,
  });
  let drawn = [];
  let token = 0;

  function clearDrawing() {
    drawn.forEach((o) => o.setMap(null));
    drawn = [];
  }

  /**
   * Show the map in `slot` (a .shape__map element inside a poster shape), aligned with the SVG
   * shape drawn from the same `box`. The slot fades in once the tiles are there.
   */
  function showUnder(slot, box) {
    const mine = ++token;
    clearDrawing();
    if (el.parentElement && el.parentElement !== slot) el.parentElement.classList.remove('shape__map--on');
    slot.appendChild(el);
    map.setOptions({ gestureHandling: 'none', styles: QUIET });
    requestAnimationFrame(() => {
      if (mine !== token || !slot.clientWidth) return;
      const view = viewForBox(box, slot.clientWidth, slot.clientHeight);
      map.setCenter(view.center);
      map.setZoom(view.zoom);
      google.maps.event.addListenerOnce(map, 'idle', () => {
        if (mine === token) slot.classList.add('shape__map--on');
      });
    });
  }

  /** Interactive map of `route` in `slot` (the map sheet). */
  function showInteractive(slot, route) {
    ++token;
    clearDrawing();
    el.parentElement?.classList.remove('shape__map--on');
    slot.appendChild(el);
    slot.classList.add('shape__map--on');
    map.setOptions({ gestureHandling: 'greedy', styles: READABLE });
    drawn = [
      new google.maps.Polyline({ map, path: route.path, strokeColor: '#ffffff', strokeWeight: 8, strokeOpacity: 0.9 }),
      new google.maps.Polyline({ map, path: route.path, strokeColor: '#0f1f3d', strokeWeight: 4 }),
      new google.maps.Marker({
        map,
        position: route.start,
        title: 'Start',
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#ff8a3d', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 },
      }),
    ];
    requestAnimationFrame(() => {
      const bounds = new google.maps.LatLngBounds();
      route.path.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 24);
    });
  }

  /** Take the map out of view (e.g. when the results close). */
  function hide() {
    ++token;
    clearDrawing();
    el.parentElement?.classList.remove('shape__map--on');
    el.remove();
  }

  return { showUnder, showInteractive, hide };
}
