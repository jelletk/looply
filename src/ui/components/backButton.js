import { ICON_CHEVRON } from './icons.js';

/** Round translucent back button floating top-left over the map, like Apple Maps. */
export function createBackButton({ label = 'Terug', onTap }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'back-button';
  btn.setAttribute('aria-label', label);
  btn.innerHTML = ICON_CHEVRON;
  btn.addEventListener('click', onTap);
  return btn;
}
