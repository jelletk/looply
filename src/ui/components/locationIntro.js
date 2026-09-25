import { ICON_LOCATION } from './icons.js';

const SEEN_KEY = 'looply.locationIntro.v1';

/** Whether the explanation was shown before (then the app asks for the location straight away). */
export function locationIntroSeen(storage = window.localStorage) {
  try {
    return storage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(storage) {
  try {
    storage.setItem(SEEN_KEY, '1');
  } catch {
    // Private mode or full storage: the explanation simply shows again next time.
  }
}

/**
 * One-time sheet that explains why Looply wants the location before iOS asks for it.
 * onAllow → ask the system for the location; onChoose → let the user pick a start point.
 */
export function openLocationIntro({ onAllow, onChoose, storage = window.localStorage }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';

  const sheet = document.createElement('div');
  sheet.className = 'sheet start-sheet location-intro';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'location-intro-title');
  sheet.setAttribute('aria-describedby', 'location-intro-text');

  const body = document.createElement('div');
  body.className = 'sheet__body';

  const icon = document.createElement('div');
  icon.className = 'location-intro__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = ICON_LOCATION;

  const title = document.createElement('h2');
  title.id = 'location-intro-title';
  title.className = 'location-intro__title';
  title.textContent = 'Rondjes vanaf waar je bent';

  const text = document.createElement('p');
  text.id = 'location-intro-text';
  text.className = 'location-intro__text';
  text.textContent =
    'Looply gebruikt je locatie alleen als startpunt. Je startpunt en de routes gaan naar Google om de kaart en de rondjes te tonen; opgeslagen routes blijven op je telefoon.';

  const allow = document.createElement('button');
  allow.type = 'button';
  allow.className = 'btn btn--primary btn--full';
  allow.textContent = 'Gebruik mijn locatie';

  const choose = document.createElement('button');
  choose.type = 'button';
  choose.className = 'btn btn--plain btn--full';
  choose.textContent = 'Zelf een startpunt kiezen';

  function finish(callback) {
    markSeen(storage);
    backdrop.remove();
    callback();
  }
  allow.addEventListener('click', () => finish(onAllow));
  choose.addEventListener('click', () => finish(onChoose));

  body.append(icon, title, text, allow, choose);
  sheet.appendChild(body);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  allow.focus();
}
