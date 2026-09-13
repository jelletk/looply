import { createThumbnail } from './thumbnail.js';
import { formatKm, formatDuration, compassLabel } from '../../core/index.js';

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
  meta.textContent = `${formatDuration(route.durationMin)} · richting ${compassLabel(route.bearingDeg)}`;

  card.append(name, meta);
  card.addEventListener('click', () => onSelect(route.id));
  return card;
}
