import { h, icon, segments } from '../dom.js';
import { createRuler } from '../components/ruler.js';
import { MODES, kmNumber, nearReachKm } from '../modes.js';
import { adviceLine, sunLine, weatherLine, lineText } from '../../core/advice.js';
import { estimateDurationMin, formatDuration, formatShortDistance } from '../../core/index.js';

function greeting(now) {
  const hour = new Date(now).getHours();
  if (hour < 6) return 'Goedenacht, Jelle';
  if (hour < 12) return 'Goedemorgen, Jelle';
  if (hour < 18) return 'Goedemiddag, Jelle';
  return 'Goedenavond, Jelle';
}

/** The advice line under the distance: a yellow pill for a warning, with "Kies 3,5 km" when that helps. */
export function adviceView(advice, onSuggest) {
  if (!advice.warn) return h('div', { class: 't-callout' }, segments(advice.segments));
  const suggest =
    advice.suggestKm != null && onSuggest
      ? [' ', h('button', { type: 'button', onclick: () => onSuggest(advice.suggestKm) }, `Kies ${kmNumber(advice.suggestKm)} km`), ' om bij licht thuis te zijn.']
      : null;
  return h('div', { class: 'warn-pill', role: 'note' }, icon(advice.icon), h('span', {}, segments(advice.segments), suggest));
}

export const nearText = (km) => `Twee lussen die thuis samenkomen · binnen ongeveer ${formatShortDistance(nearReachKm(km))}`;

/**
 * Vandaag: greeting, sun and weather, start point, mode, distance, close to home, search.
 * Distance changes update this screen in place (the ruler keeps its scroll position).
 */
export function renderToday(ctx) {
  const { mode, now, sun, weather, phase, start } = ctx;
  const range = MODES[mode];
  let km = ctx.km;

  const advice = () =>
    adviceLine({ now, durationMin: estimateDurationMin(km, mode), km, sun, weather, step: range.step, minKm: range.min });
  const unitText = () => `kilometer · ${formatDuration(estimateDurationMin(km, mode))}`;

  const num = h('span', { class: 'num t-display', 'aria-hidden': 'true' }, kmNumber(km));
  const unit = h('div', { class: 't-unit', 'aria-hidden': 'true' }, unitText());
  const adviceBox = h('div', { class: 'advice' });
  const near = h('span', { class: 't-foot', id: 'near-detail' }, nearText(km));
  const backTo = h('div');
  let lastRoll = 0;

  function refresh({ roll = false } = {}) {
    num.textContent = kmNumber(km);
    // Roll the number once per short burst, not on every step of a fast swipe (that looked jittery).
    if (roll && Date.now() - lastRoll > 220) {
      lastRoll = Date.now();
      num.classList.remove('num--roll');
      void num.offsetWidth;
      num.classList.add('num--roll');
    }
    unit.textContent = unitText();
    const a = advice();
    adviceBox.replaceChildren(adviceView(a, (v) => ruler.setValue(v)));
    near.textContent = nearText(km);
    ruler.setValueText(`${kmNumber(km)} kilometer, ${formatDuration(estimateDurationMin(km, mode))}. ${lineText(a.segments)}`);
    backTo.replaceChildren(
      ctx.resultsFor?.(km)
        ? h('button', { class: 'btn--text', type: 'button', onclick: ctx.onBackToResults }, `Terug naar je ${ctx.resultsFor(km)} rondjes`)
        : ''
    );
  }

  const ruler = createRuler({
    min: range.min,
    max: range.max,
    step: range.step,
    value: km,
    onChange: (v) => {
      km = v;
      ctx.onKm(v);
      refresh({ roll: true });
    },
  });

  const sunL = sunLine(now, sun);
  const w = weatherLine(now, weather, phase);
  const startIcon = start?.kind === 'home' ? 'house' : start?.kind === 'here' ? 'loc' : start ? 'pin' : 'search';
  const switchInput = h('input', {
    type: 'checkbox',
    role: 'switch',
    class: 'switch',
    'aria-labelledby': 'near-label',
    'aria-describedby': 'near-detail',
    onchange: (e) => {
      ctx.onNear(e.target.checked);
      refresh();
    },
  });
  switchInput.checked = ctx.near;

  const page = h(
    'div',
    { class: 'today' },
    h(
      'div',
      { class: 'hello' },
      h('h1', { class: 't-title1', tabindex: '-1' }, greeting(now)),
      sunL ? h('div', { class: 't-callout' }, segments(sunL)) : null,
      w ? h('div', { class: 'weather t-callout' }, icon(w.icon), h('span', {}, segments(w.segments))) : null
    ),
    h(
      'div',
      { class: 'start-row' },
      h(
        'button',
        { class: 'pill glass', type: 'button', 'aria-haspopup': 'dialog', onclick: ctx.onStartTap },
        icon(startIcon),
        h('span', { class: 'pill__label' }, start ? ['Vanaf ', h('b', {}, start.label)] : 'Kies een startpunt'),
        icon('down')
      ),
      ctx.askHome
        ? h('span', { class: 'home-q' }, 'Is dit thuis?', h('button', { class: 'link-btn', type: 'button', onclick: ctx.onSaveHome }, 'Bewaar als Thuis'))
        : null
    ),
    h(
      'div',
      { class: 'modes', role: 'group', 'aria-label': 'Soort rondje' },
      Object.entries(MODES).map(([id, m]) =>
        h('button', { class: 'mode glass', type: 'button', 'aria-pressed': String(id === mode), onclick: () => ctx.onMode(id) }, icon(m.icon), m.label)
      )
    ),
    h('div', { class: 'big' }, h('div', { class: 'num-wrap' }, num), unit, adviceBox),
    ruler,
    h(
      'label',
      { class: 'switch-row glass' },
      h('span', { class: 'switch-row__text' }, h('span', { class: 'switch-row__label', id: 'near-label' }, 'Dicht bij huis'), near),
      switchInput
    ),
    h('div', { class: 'go-row' }, backTo, h('button', { class: 'btn btn--primary', type: 'button', onclick: ctx.onSearch }, 'Laat rondjes zien'))
  );
  refresh();
  return page;
}
