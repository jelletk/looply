import { MODE_ICONS, ICON_CHEVRON } from '../components/icons.js';
import { formatKm, formatDuration } from '../../core/index.js';

/** Full-page "Opgeslagen" screen: Large Title + grouped inset list. */
export function renderSavedList({ routes, onOpen, onDelete }) {
  const wrap = document.createElement('div');
  wrap.className = 'saved-page';

  const header = document.createElement('h1');
  header.className = 'large-title';
  header.textContent = 'Opgeslagen';
  wrap.appendChild(header);

  if (routes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'saved-page__empty';
    empty.textContent = 'Nog geen routes opgeslagen. Zoek een rondje en tik op “Opslaan”.';
    wrap.appendChild(empty);
    return wrap;
  }

  const group = document.createElement('div');
  group.className = 'grouped-list';

  routes.forEach((route) => {
    const row = document.createElement('div');
    row.className = 'grouped-list__row';

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'grouped-list__main';
    main.addEventListener('click', () => onOpen(route));

    const icon = document.createElement('span');
    icon.className = 'grouped-list__icon';
    icon.innerHTML = MODE_ICONS[route.mode] || MODE_ICONS.walk;

    const text = document.createElement('span');
    text.className = 'grouped-list__text';

    const name = document.createElement('span');
    name.className = 'grouped-list__name';
    name.textContent = route.name;

    const meta = document.createElement('span');
    meta.className = 'grouped-list__meta';
    meta.textContent = `${formatKm(route.distanceKm)} · ${formatDuration(route.durationMin)}`;

    text.append(name, meta);

    const chevron = document.createElement('span');
    chevron.className = 'grouped-list__chevron';
    chevron.innerHTML = ICON_CHEVRON;

    main.append(icon, text, chevron);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'grouped-list__delete';
    deleteBtn.textContent = 'Verwijderen';
    deleteBtn.addEventListener('click', () => onDelete(route));

    row.append(main, deleteBtn);
    group.appendChild(row);
  });

  wrap.appendChild(group);
  return wrap;
}
