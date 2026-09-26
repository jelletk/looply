import { h, icon } from '../dom.js';

const TABS = [
  { id: 'today', label: 'Vandaag', icon: 'today' },
  { id: 'saved', label: 'Bewaard', icon: 'bookmark' },
  { id: 'settings', label: 'Instellingen', icon: 'sliders' },
];

/** Floating glass tab bar: Vandaag / Bewaard / Instellingen. */
export function createTabBar({ active, onSelect }) {
  return h(
    'nav',
    { class: 'tabbar glass-strong', 'aria-label': 'Tabbladen' },
    TABS.map((t) =>
      h(
        'button',
        { class: 'tab', type: 'button', 'aria-current': t.id === active ? 'page' : null, onclick: () => onSelect(t.id) },
        icon(t.icon),
        t.label
      )
    )
  );
}
