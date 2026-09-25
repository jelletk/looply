import { formatPace, formatSpeed } from '../../core/index.js';

// Stepper per mode. Running is set as pace (seconds per km), like a runner thinks; the rest in km/h.
const PACE_ROWS = [
  { mode: 'walk', label: 'Wandelen', kind: 'speed', step: 0.5, min: 3, max: 8 },
  { mode: 'run', label: 'Hardlopen', kind: 'pace', step: 5, min: 210, max: 540 }, // 3:30–9:00 min/km
  { mode: 'bike', label: 'Fietsen', kind: 'speed', step: 1, min: 10, max: 40 },
];

function stepSpeed(row, kmh, direction) {
  if (row.kind === 'pace') {
    // Faster = fewer seconds per km, so "+" lowers the pace number.
    const sec = Math.round(3600 / kmh / row.step) * row.step - direction * row.step;
    return 3600 / Math.min(row.max, Math.max(row.min, sec));
  }
  const next = Math.round(kmh / row.step) * row.step + direction * row.step;
  return Math.min(row.max, Math.max(row.min, next));
}

function section(title, footer) {
  const wrap = document.createElement('section');
  wrap.className = 'settings-section';
  const h = document.createElement('h2');
  h.className = 'settings-section__title';
  h.textContent = title;
  const group = document.createElement('div');
  group.className = 'grouped-list';
  wrap.append(h, group);
  if (footer) {
    const f = document.createElement('p');
    f.className = 'settings-section__footer';
    f.textContent = footer;
    wrap.appendChild(f);
  }
  return { wrap, group };
}

function stepperButton(text, label, disabled, onTap) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'stepper__button';
  b.textContent = text;
  b.setAttribute('aria-label', label);
  b.disabled = disabled;
  b.addEventListener('click', onTap);
  return b;
}

/** Full-page "Instellingen": Thuis and pace per mode. */
export function renderSettings({ settings, currentStart, onSetHome, onClearHome, onSpeedChange }) {
  const page = document.createElement('div');
  page.className = 'saved-page';

  const header = document.createElement('h1');
  header.className = 'large-title';
  header.textContent = 'Instellingen';
  page.appendChild(header);

  // Thuis
  const home = section('Thuis', 'Thuis staat bovenaan in de startpunt-kiezer. Het blijft alleen op deze telefoon.');
  const homeRow = document.createElement('div');
  homeRow.className = 'grouped-list__row settings-row';
  const homeText = document.createElement('span');
  homeText.className = 'grouped-list__text';
  const homeName = document.createElement('span');
  homeName.className = 'grouped-list__name';
  homeName.textContent = settings.home ? settings.home.label : 'Nog niet ingesteld';
  homeText.appendChild(homeName);
  homeRow.appendChild(homeText);
  if (settings.home) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'grouped-list__delete';
    clear.textContent = 'Verwijderen';
    clear.addEventListener('click', onClearHome);
    homeRow.appendChild(clear);
  }
  home.group.appendChild(homeRow);

  const setRow = document.createElement('div');
  setRow.className = 'grouped-list__row';
  const setBtn = document.createElement('button');
  setBtn.type = 'button';
  setBtn.className = 'grouped-list__main settings-row__action';
  const startIsHome =
    currentStart && settings.home &&
    currentStart.latLng.lat === settings.home.lat && currentStart.latLng.lng === settings.home.lng;
  setBtn.disabled = !currentStart || startIsHome;
  setBtn.textContent = !currentStart
    ? 'Kies eerst een startpunt op Plannen'
    : startIsHome
      ? 'Je startpunt is nu Thuis'
      : `Huidig startpunt als Thuis bewaren (${currentStart.label})`;
  setBtn.addEventListener('click', onSetHome);
  setRow.appendChild(setBtn);
  home.group.appendChild(setRow);
  page.appendChild(home.wrap);

  // Tempo
  const pace = section('Tempo', 'Gebruikt voor de tijdsschatting bij elke route, ook bij opgeslagen routes.');
  for (const row of PACE_ROWS) {
    const kmh = settings.speeds[row.mode];
    const r = document.createElement('div');
    r.className = 'grouped-list__row settings-row';

    const label = document.createElement('span');
    label.className = 'grouped-list__name settings-row__label';
    label.textContent = row.label;

    const value = document.createElement('span');
    value.className = 'settings-row__value';
    value.textContent = row.kind === 'pace' ? formatPace(kmh) : formatSpeed(kmh);
    value.setAttribute('aria-live', 'polite');

    const stepper = document.createElement('span');
    stepper.className = 'stepper';
    const slower = stepSpeed(row, kmh, -1);
    const faster = stepSpeed(row, kmh, 1);
    stepper.append(
      stepperButton('−', `${row.label} langzamer`, Math.abs(slower - kmh) < 1e-9, () => onSpeedChange(row.mode, slower)),
      stepperButton('+', `${row.label} sneller`, Math.abs(faster - kmh) < 1e-9, () => onSpeedChange(row.mode, faster))
    );

    r.append(label, value, stepper);
    pace.group.appendChild(r);
  }
  page.appendChild(pace.wrap);

  return page;
}
