import { h, icon } from '../dom.js';
import { showSheet, sheetHead } from './sheet.js';

const LOCATION_ERRORS = {
  denied: 'Looply mag je locatie niet zien. Kies Thuis of zoek een adres. Toestaan kan via Instellingen op je iPhone.',
  timeout: 'Je locatie komt niet binnen. Probeer opnieuw of zoek een adres.',
  unavailable: 'Je locatie is nu niet te bepalen. Zoek een adres.',
};

/**
 * "Vanaf waar?" sheet: Thuis, Huidige locatie, and address search. With purpose 'home' it sets Thuis
 * instead ("Waar is thuis?", no Thuis row).
 * - locate(): Promise → null on success, or 'denied' | 'timeout' | 'unavailable'
 * - search(query): see places.js
 * - onPick({ kind: 'home' | 'here' | 'place', latLng?, label? })
 */
export function openStartSheet({ purpose = 'start', home, currentKind, locate, search, onPick }) {
  const forHome = purpose === 'home';
  const locErr = h('div', { 'aria-live': 'polite' });
  const results = h('div', { 'aria-live': 'polite' });
  const input = h('input', {
    type: 'search',
    placeholder: 'Zoek een adres of plek',
    autocomplete: 'off',
    enterkeyhint: 'search',
    'aria-label': 'Zoek een adres of plek',
  });

  const check = (kind) => (!forHome && currentKind === kind ? h('span', { class: 'srow__check' }, icon('check')) : null);
  const row = (ic, title, detail, onclick, extra) =>
    h(
      'button',
      { class: 'srow', type: 'button', onclick },
      h('span', { class: 'srow__ic' }, icon(ic)),
      h('span', { class: 'srow__text' }, h('span', { class: 'srow__title' }, title), detail ? h('span', { class: 't-foot' }, detail) : null),
      extra
    );
  const inlineError = (text, action) =>
    h('div', { class: 'inline-err t-foot', role: 'alert' }, icon('alert'), h('span', {}, text, action ? [' ', action] : null));

  const homeRow = forHome
    ? null
    : home
      ? row('house', 'Thuis', home.label, () => finish({ kind: 'home' }), check('home'))
      : row('house', 'Thuis instellen', 'Zoek je adres hieronder', () => input.focus());

  let busy = false;
  let closed = false; // a fix arriving after the sheet closed (or after another pick) is dropped
  async function useLocation() {
    if (busy) return;
    busy = true;
    locErr.replaceChildren(h('div', { class: 'inline-err t-foot' }, h('span', {}, 'Locatie bepalen…')));
    const error = await locate();
    busy = false;
    if (closed) return;
    if (!error) return finish({ kind: 'here' });
    const retry = error === 'timeout' ? h('button', { class: 'link-btn', type: 'button', onclick: useLocation }, 'Opnieuw') : null;
    locErr.replaceChildren(inlineError(LOCATION_ERRORS[error] ?? LOCATION_ERRORS.unavailable, retry));
  }

  let query = 0;
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) {
      results.replaceChildren();
      return;
    }
    timer = setTimeout(() => runSearch(q), 250);
  });

  async function runSearch(q) {
    const mine = ++query;
    if (navigator.onLine === false) {
      results.replaceChildren(inlineError('Adressen zoeken lukt niet zonder internet. Thuis en je locatie werken wel.'));
      return;
    }
    let hits;
    try {
      hits = await search(q);
    } catch (err) {
      console.error('Address search failed', err);
      if (mine === query) results.replaceChildren(inlineError('Adressen zoeken lukt nu niet. Probeer het zo opnieuw.'));
      return;
    }
    if (mine !== query) return;
    if (hits.length === 0) {
      results.replaceChildren(inlineError(`Niets gevonden voor ‘${q}’. Probeer een straat met plaatsnaam.`));
      return;
    }
    results.replaceChildren(
      ...hits.map((hit) =>
        row('pin', hit.label, hit.detail, async () => {
          try {
            const place = await hit.pick();
            finish({ kind: 'place', ...place });
          } catch (err) {
            console.error('Place details failed', err);
            results.replaceChildren(inlineError('Deze plek kon niet worden opgehaald. Controleer je verbinding en probeer het opnieuw.'));
          }
        })
      )
    );
  }

  const sheet = showSheet({
    label: forHome ? 'Thuis instellen' : 'Startpunt kiezen',
    content: [
      sheetHead(forHome ? 'Waar is thuis?' : 'Vanaf waar?'),
      homeRow,
      row('loc', forHome ? 'Mijn huidige locatie' : 'Huidige locatie', null, useLocation, check('here')),
      locErr,
      h('label', { class: 'field' }, icon('search'), input),
      results,
    ],
    onClose: () => (closed = true),
  });

  function finish(choice) {
    if (closed) return;
    sheet.close();
    onPick(choice);
  }
  return sheet;
}
