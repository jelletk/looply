// Test panel ("Prototype"): pretend another time of day, other weather, a failing search or a
// refused location, without waiting for it. Only in memory; closing the app resets it.
// Shown when Instellingen › Testen › "Testknop tonen" is on.

import { h } from './dom.js';
import { showSheet, sheetHead } from './components/sheet.js';

const MIN = 60 * 1000;

export const PROTO_DEFAULTS = Object.freeze({ time: 'auto', weather: 'real', fail: 'none', loc: 'real' });

const GROUPS = [
  ['time', 'Tijd van de dag', [['auto', 'Echte tijd'], ['dawn', 'Ochtend'], ['day', 'Middag'], ['dusk', 'Avond'], ['night', 'Nacht']]],
  ['weather', 'Weer', [['real', 'Echt weer'], ['dry', 'Droog'], ['later', 'Regen straks'], ['during', 'Regen tijdens'], ['now', 'Regent nu'], ['none', 'Geen weerdata']]],
  ['fail', 'Zoeken mislukt met', [['none', 'Niets'], ['offline', 'Geen internet'], ['answer', 'Geen antwoord'], ['noroutes', 'Geen rondjes'], ['pairs', 'Dicht bij huis lukt niet'], ['save', 'Bewaren lukt niet']]],
  ['loc', 'Locatietoegang', [['real', 'Echt'], ['denied', 'Geweigerd']]],
];

/** The time the app should use: the real clock, or a moment in the chosen part of today. */
export function protoNow(proto, realNow, sun) {
  const day = new Date(realNow);
  const at = (hours, minutes) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes).getTime();
  switch (proto.time) {
    case 'dawn': return sun.rise != null ? sun.rise + 20 * MIN : at(7, 30);
    case 'day': return at(13, 5);
    case 'dusk': return sun.set != null ? sun.set - 50 * MIN : at(19, 0);
    case 'night': return sun.set != null ? Math.max(sun.set + 90 * MIN, at(22, 15)) : at(22, 15);
    default: return realNow;
  }
}

/** Example weather for the chosen state; undefined means "use the real weather". */
export function protoWeather(proto, now) {
  switch (proto.weather) {
    case 'dry': return { tempC: 14, rainingNow: false, rainAt: null, dryAt: null };
    case 'later': return { tempC: 13, rainingNow: false, rainAt: now + 75 * MIN, dryAt: now + 110 * MIN };
    case 'during': return { tempC: 13, rainingNow: false, rainAt: now + 25 * MIN, dryAt: now + 50 * MIN };
    case 'now': return { tempC: 11, rainingNow: true, rainAt: null, dryAt: now + 40 * MIN };
    case 'none': return null;
    default: return undefined;
  }
}

/** Open the panel. onChange(key, value) after every choice; actions: { welcome, hint } */
export function openProtoPanel(proto, { onChange, onWelcome, onHint }) {
  const group = ([key, title, options]) => {
    const buttons = options.map(([value, label]) =>
      h('button', {
        class: 'chip',
        type: 'button',
        'aria-pressed': String(proto[key] === value),
        onclick: () => {
          buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btnFor(value))));
          onChange(key, value);
        },
      }, label)
    );
    const btnFor = (v) => buttons[options.findIndex(([value]) => value === v)];
    return [h('div', { class: 't-foot t-foot--strong' }, title), h('div', { class: 'opts', role: 'group', 'aria-label': title }, buttons)];
  };
  const sheet = showSheet({
    label: 'Prototype',
    content: [
      sheetHead('Prototype'),
      h('p', { class: 't-foot', style: 'margin:0 0 10px' }, 'Alleen om te testen. Zo zie je elke situatie; na sluiten van de app is alles weer echt.'),
      GROUPS.map(group),
      h(
        'div',
        { class: 'opts' },
        h('button', { class: 'chip', type: 'button', onclick: () => { sheet.close(); onWelcome(); } }, 'Eerste keer openen'),
        h('button', { class: 'chip', type: 'button', onclick: () => { onHint(); sheet.close(); } }, 'Veeg-hint opnieuw')
      ),
    ],
  });
  return sheet;
}
