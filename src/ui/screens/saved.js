import { h, svg } from '../dom.js';
import { routeThumb } from '../components/routeShape.js';
import { MODES, kmNumber } from '../modes.js';
import { routeTitle } from '../../core/profile.js';
import { estimateDurationMin, formatDuration } from '../../core/index.js';

const FILTER_FROM = 7; // filter chips from this many saved routes

/** Bewaard: tiles of saved routes, newest first, or an empty state. */
export function renderSaved({ routes, filter = 'all', onFilter, onOpen }) {
  const title = h('h1', { class: 't-title1 list-title', tabindex: '-1' }, 'Bewaard');
  if (routes.length === 0) {
    return h(
      'div',
      {},
      title,
      h(
        'div',
        { class: 'empty' },
        svg(
          'svg',
          { viewBox: '0 0 120 120', width: 120, height: 120, 'aria-hidden': 'true' },
          svg('path', { d: 'M60 16a44 44 0 1 1-0.1 0', fill: 'none', stroke: 'var(--ink-3)', 'stroke-width': 2, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round' }),
          svg('circle', { cx: 60, cy: 16, r: 6, fill: 'var(--sun)' })
        ),
        h('h2', { class: 't-title3' }, 'Nog niets bewaard'),
        h('p', { class: 't-callout' }, 'Tik op Opslaan bij een rondje dat je vaker wilt doen.')
      )
    );
  }

  const shown = filter === 'all' ? routes : routes.filter((r) => r.mode === filter);
  const filters =
    routes.length >= FILTER_FROM
      ? h(
          'div',
          { class: 'filters', role: 'group', 'aria-label': 'Toon' },
          [['all', 'Alle'], ...Object.entries(MODES).map(([id, m]) => [id, m.label])].map(([id, label]) =>
            h('button', { class: 'chip', type: 'button', 'aria-pressed': String(filter === id), onclick: () => onFilter(id) }, label)
          )
        )
      : null;

  return h(
    'div',
    {},
    title,
    filters,
    shown.map((r) =>
      h(
        'button',
        { class: 'tile glass', type: 'button', onclick: () => onOpen(r) },
        h('span', { class: 'tile__th' }, routeThumb(r)),
        h(
          'span',
          {},
          h('span', { class: 'tile__name' }, routeTitle(r)),
          h('span', { class: 't-callout' }, `${MODES[r.mode]?.label ?? 'Wandelen'} · ${kmNumber(r.distanceKm)} km · ${formatDuration(estimateDurationMin(r.distanceKm, r.mode))}`),
          r.loops === 2 ? [h('br'), h('span', { class: 'tag' }, 'Dicht bij huis')] : null
        )
      )
    ),
    h('p', { class: 't-foot note' }, 'Bewaarde rondjes komen niet terug als suggestie, zodat je steeds nieuwe straten ziet.')
  );
}
