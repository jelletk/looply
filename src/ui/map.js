import { normalizePathToViewBox } from './components/pathGeometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * createMap({ container, mode: 'google'|'svg', google }) → { setStart, showRoute, fitTo }
 */
export function createMap({ container, mode, google }) {
  return mode === 'google' ? createGoogleMap(container, google) : createSvgMap(container);
}

function createGoogleMap(container, google) {
  const map = new google.maps.Map(container, {
    center: { lat: 52.0907, lng: 5.1214 },
    zoom: 14,
    disableDefaultUI: true,
    gestureHandling: 'greedy',
  });

  let marker = null;
  let polyline = null;

  function setStart(latLng) {
    map.setCenter(latLng);
    if (!marker) {
      marker = new google.maps.Marker({ map, position: latLng });
    } else {
      marker.setPosition(latLng);
    }
  }

  function showRoute(route) {
    if (polyline) {
      polyline.setMap(null);
      polyline = null;
    }
    if (!route) return;
    polyline = new google.maps.Polyline({
      map,
      path: route.path,
      strokeColor: '#0066cc',
      strokeWeight: 5,
    });
  }

  function fitTo(route) {
    if (!route?.path?.length) return;
    const bounds = new google.maps.LatLngBounds();
    route.path.forEach((p) => bounds.extend(p));
    // Leave room for the floating start pill (top) and the results sheet (bottom).
    map.fitBounds(bounds, { top: 110, bottom: 330, left: 32, right: 32 });
  }

  return { setStart, showRoute, fitTo };
}

function createSvgMap(container) {
  container.classList.add('svg-map');
  container.textContent = '';

  const banner = document.createElement('div');
  banner.className = 'svg-map__banner';
  banner.textContent = 'Demo-modus: zonder API-key zie je een schets in plaats van de kaart.';
  container.appendChild(banner);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'svg-map__canvas');
  svg.setAttribute('viewBox', '0 0 400 400');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  container.appendChild(svg);

  const grid = document.createElementNS(SVG_NS, 'g');
  grid.setAttribute('class', 'svg-map__grid');
  for (let i = 0; i <= 400; i += 40) {
    const vLine = document.createElementNS(SVG_NS, 'line');
    vLine.setAttribute('x1', String(i));
    vLine.setAttribute('y1', '0');
    vLine.setAttribute('x2', String(i));
    vLine.setAttribute('y2', '400');
    grid.appendChild(vLine);

    const hLine = document.createElementNS(SVG_NS, 'line');
    hLine.setAttribute('x1', '0');
    hLine.setAttribute('y1', String(i));
    hLine.setAttribute('x2', '400');
    hLine.setAttribute('y2', String(i));
    grid.appendChild(hLine);
  }
  svg.appendChild(grid);

  let startMarker = null;
  let routeLine = null;

  function drawStartMarker(cx, cy) {
    if (startMarker) startMarker.remove();
    startMarker = document.createElementNS(SVG_NS, 'circle');
    startMarker.setAttribute('cx', String(cx));
    startMarker.setAttribute('cy', String(cy));
    startMarker.setAttribute('r', '7');
    startMarker.setAttribute('class', 'svg-map__start');
    svg.appendChild(startMarker);
  }

  function setStart() {
    // No real georeference in demo mode: show the marker at the canvas centre
    // until a route is drawn, at which point showRoute() repositions it precisely.
    if (!routeLine) drawStartMarker(200, 200);
  }

  function showRoute(route) {
    if (routeLine) {
      routeLine.remove();
      routeLine = null;
    }
    if (!route) {
      drawStartMarker(200, 200);
      return;
    }
    const points = normalizePathToViewBox(route.path, 400, 48);
    routeLine = document.createElementNS(SVG_NS, 'polyline');
    routeLine.setAttribute('points', points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
    routeLine.setAttribute('class', 'svg-map__route');
    svg.appendChild(routeLine);
    if (points[0]) drawStartMarker(points[0].x, points[0].y);
  }

  function fitTo() {
    // The SVG viewBox already scales to fill the container; nothing to do.
  }

  drawStartMarker(200, 200);
  return { setStart, showRoute, fitTo };
}
