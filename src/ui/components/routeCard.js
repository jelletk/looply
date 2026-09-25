import { createThumbnail } from './thumbnail.js';
import { formatDuration, formatShortDistance, compassLabel, estimateDurationMin } from '../../core/index.js';

/** "1 u · richting NO", or for two loops "1 u · binnen 850 m" (farthest from start). Duration uses the user's own pace. */
export function routeMeta(route) {
  const duration = formatDuration(estimateDurationMin(route.distanceKm, route.mode));
  if (route.loops === 2 && Number.isFinite(route.maxFromStartKm)) {
    return `${duration} · binnen ${formatShortDistance(route.maxFromStartKm)}`;
  }
  return `${duration} · richting ${compassLabel(route.bearingDeg)}`;
}

/** White, 18px-radius route card: thumbnail, name, distance/duration/compass. */
export function createRouteCard({ route, selected, onSelect }) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'route-card' + (selected ? ' route-card--selected' : '');

  card.appendChild(createThumbnail(route));

  const name = document.createElement('div');
  name.className = 'route-card__name';
  name.textContent = route.name;

  const meta = document.createElement('div');
  meta.className = 'route-card__meta';
  meta.textContent = routeMeta(route);

  card.append(name, meta);
  card.addEventListener('click', () => onSelect(route.id));
  return card;
}
