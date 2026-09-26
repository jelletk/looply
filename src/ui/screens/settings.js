import { h } from '../dom.js';
import { formatPace, formatSpeed } from '../../core/index.js';

// Stepper per mode. Running is set as pace (seconds per km), like a runner thinks; the rest in km/h.
const PACE_ROWS = [
  { mode: 'walk', label: 'Wandelen', kind: 'speed', step: 0.5, min: 3, max: 8 },
  { mode: 'run', label: 'Hardlopen', kind: 'pace', step: 5, min: 210, max: 540 }, // 3:30–9:00 min/km
  { mode: 'bike', label: 'Fietsen', kind: 'speed', step: 1, min: 10, max: 40 },
];

export function stepSpeed(row, kmh, direction) {
  if (row.kind === 'pace') {
    // Faster = fewer seconds per km, so "+" lowers the pace number.
    const sec = Math.round(3600 / kmh / row.step) * row.step - direction * row.step;
    return 3600 / Math.min(row.max, Math.max(row.min, sec));
  }
  const next = Math.round(kmh / row.step) * row.step + direction * row.step;
  return Math.min(row.max, Math.max(row.min, next));
}

const LOCATION_STATUS = { granted: 'Toegestaan', denied: 'Niet toegestaan', prompt: 'Nog niet gevraagd' };

/**
 * Instellingen: Thuis, Jouw tempo, Locatie, Testen, Over.
 * ctx: settings, locationState, version, confirmingHomeDelete, onEditHome, onAskDeleteHome,
 *      onDeleteHome, onCancelDeleteHome, onSpeed(mode, kmh, buttonLabel), onProto(bool)
 */
export function renderSettings(ctx) {
  const { settings } = ctx;
  const section = (title, group, note) => [
    h('h2', { class: 't-foot t-foot--strong section' }, title),
    h('div', { class: 'group glass' }, group),
    note ? h('p', { class: 't-foot note' }, note) : null,
  ];

  const homeRows = settings.home
    ? [
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'row__grow' }, settings.home.label),
          h('button', { class: 'btn--text', type: 'button', onclick: ctx.onEditHome }, 'Wijzig')
        ),
        ctx.confirmingHomeDelete
          ? h(
              'div',
              { class: 'row', role: 'alert' },
              h('span', { class: 'row__grow t-callout' }, 'Thuis verwijderen? Je kunt hem later opnieuw instellen.'),
              h('button', { class: 'btn--text', type: 'button', onclick: ctx.onCancelDeleteHome }, 'Nee'),
              h('button', { class: 'btn--text danger', type: 'button', onclick: ctx.onDeleteHome }, 'Verwijder')
            )
          : h('div', { class: 'row' }, h('button', { class: 'btn--text danger', type: 'button', style: 'padding:0', onclick: ctx.onAskDeleteHome }, 'Verwijder Thuis')),
      ]
    : [h('div', { class: 'row' }, h('button', { class: 'btn--text', type: 'button', style: 'padding:0', onclick: ctx.onEditHome }, 'Stel Thuis in'))];

  const paceRows = PACE_ROWS.map((row) => {
    const kmh = settings.speeds[row.mode];
    const slower = stepSpeed(row, kmh, -1);
    const faster = stepSpeed(row, kmh, 1);
    const stepper = (text, label, next) => {
      const atEnd = Math.abs(next - kmh) < 1e-9;
      return h(
        'button',
        {
          class: 'step',
          type: 'button',
          'aria-label': label,
          'aria-disabled': String(atEnd),
          'data-step': label,
          onclick: () => !atEnd && ctx.onSpeed(row.mode, next, label),
        },
        text
      );
    };
    return h(
      'div',
      { class: 'row' },
      h('span', { class: 'row__grow' }, row.label),
      stepper('−', `${row.label} langzamer`, slower),
      h('span', { class: 'row__val', 'aria-live': 'polite' }, row.kind === 'pace' ? formatPace(kmh).replace(' min/km', ' /km') : formatSpeed(kmh)),
      stepper('+', `${row.label} sneller`, faster)
    );
  });

  const protoSwitch = h('input', {
    type: 'checkbox',
    role: 'switch',
    class: 'switch',
    'aria-labelledby': 'proto-label',
    onchange: (e) => ctx.onProto(e.target.checked),
  });
  protoSwitch.checked = settings.showProto;

  return h(
    'div',
    {},
    h('h1', { class: 't-title1 list-title', tabindex: '-1' }, 'Instellingen'),
    section('Thuis', homeRows, 'Thuis staat bovenaan in de startpunt-kiezer. Het blijft alleen op deze telefoon.'),
    section('Jouw tempo', paceRows, 'Hiermee rekent Looply uit hoe laat je terug bent.'),
    section(
      'Locatie',
      h('div', { class: 'row' }, h('span', { class: 'row__grow' }, 'Locatietoegang'), h('span', { class: 't-callout' }, LOCATION_STATUS[ctx.locationState] ?? 'Onbekend')),
      ctx.locationState === 'denied'
        ? 'Zet het aan via Instellingen › Privacy en beveiliging › Locatievoorzieningen op je iPhone. Thuis en adressen werken ook zonder.'
        : null
    ),
    section(
      'Testen',
      h(
        'label',
        { class: 'row', style: 'cursor:pointer' },
        h('span', { class: 'row__grow', id: 'proto-label' }, 'Testknop tonen'),
        protoSwitch
      ),
      'Toont de knop Prototype bovenin. Daarmee boots je een tijdstip, het weer of een fout na.'
    ),
    section(
      'Over',
      [
        h('div', { class: 'row' }, h('span', { class: 'row__grow' }, 'Versie'), h('span', { class: 't-callout' }, ctx.version)),
        h('div', { class: 'row' }, h('span', { class: 'row__grow t-callout' }, 'Routes: Google · Weer: Open-Meteo')),
      ]
    )
  );
}
