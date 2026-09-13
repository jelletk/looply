import { ICON_MAP, ICON_BOOKMARK } from './icons.js';

const TABS = [
  { id: 'plan', label: 'Plannen', icon: ICON_MAP },
  { id: 'saved', label: 'Opgeslagen', icon: ICON_BOOKMARK },
];

/** Floating iOS 26 tab bar with two tabs: Plannen / Opgeslagen. */
export function createTabBar({ active, onSelect }) {
  const nav = document.createElement('nav');
  nav.className = 'tabbar';

  TABS.forEach(({ id, label, icon }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tabbar__item' + (active === id ? ' tabbar__item--active' : '');

    const iconWrap = document.createElement('span');
    iconWrap.innerHTML = icon;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;

    btn.append(iconWrap, labelEl);
    btn.addEventListener('click', () => onSelect(id));
    nav.appendChild(btn);
  });

  return nav;
}
