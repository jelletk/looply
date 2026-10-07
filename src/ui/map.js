// One Google map for the whole app (one map load per visit). It moves to where it is needed:
// under the route shape of the poster in view (subtle, still, no labels), or into the map sheet
// (interactive, with street names and the route drawn on it).

import { viewForBox, boxForView } from './projection.js';

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
   * Show the map in `slot` (a .shape__map element inside a poster shape) under the SVG shape
   * drawn from `box`. Once the map has settled, `onView(viewBox)` gets the view it really shows,
   * so the shape can follow it: iPhone Safari rounds fractional zooms, and then a shape drawn
   * for the requested zoom no longer lies on the streets. The slot fades in after that.
   */
  function showUnder(slot, box, onView) {
    const mine = ++token;
    clearDrawing();
    if (el.parentElement && el.parentElement !== slot) el.parentElement.classList.remove('shape__map--on');
    slot.appendChild(el);
    map.setOptions({ gestureHandling: 'none', styles: QUIET });
    requestAnimationFrame(() => {
      if (mine !== token || !slot.clientWidth) return;
      const width = slot.clientWidth;
      const height = slot.clientHeight;
      const wanted = viewForBox(box, width, height);
      map.setCenter(wanted.center);
      map.setZoom(wanted.zoom);
      let steppedOut = false;
      // Align the shape with what the map reports now. Safe to call again: right away (zoom and
      // centre are known at once), and once more when the map has settled, in case it snapped late.
      const align = () => {
        if (mine !== token) return;
        // Rounded up: the route would run off the shape. One whole level out instead.
        if (!steppedOut && map.getZoom() > wanted.zoom + 0.01) {
          steppedOut = true;
          map.setZoom(Math.floor(wanted.zoom));
        }
        const c = map.getCenter();
        onView?.(boxForView({ lat: c.lat(), lng: c.lng() }, map.getZoom(), width, height));
      };
      const show = () => {
        align();
        if (mine === token) slot.classList.add('shape__map--on');
      };
      align();
      google.maps.event.addListenerOnce(map, 'idle', show);
      setTimeout(show, 1500); // same view as before: Google may not fire 'idle' again
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
