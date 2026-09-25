import { ICON_MAP, ICON_BOOKMARK, ICON_SETTINGS } from './icons.js';

const TABS = [
  { id: 'plan', label: 'Plannen', icon: ICON_MAP },
  { id: 'saved', label: 'Opgeslagen', icon: ICON_BOOKMARK },
  { id: 'settings', label: 'Instellingen', icon: ICON_SETTINGS },
];

/** Floating iOS 26 tab bar: Plannen / Opgeslagen / Instellingen. */
export function createTabBar({ active, onSelect }) {
  const nav = document.createElement('nav');
  nav.className = 'tabbar';

  TABS.forEach(({ id, label, icon }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tabbar__item' + (active === id ? ' tabbar__item--active' : '');
    if (active === id) btn.setAttribute('aria-current', 'page');

    const iconWrap = document.createElement('span');
    iconWrap.setAttribute('aria-hidden', 'true');
    iconWrap.innerHTML = icon;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;

    btn.append(iconWrap, labelEl);
    btn.addEventListener('click', () => onSelect(id));
    nav.appendChild(btn);
  });

  return nav;
}
