import { h, icon, svg } from '../dom.js';
import { routeShape, routeThumb } from '../components/routeShape.js';
import { homeChart } from '../components/chart.js';
import { showSheet, sheetHead } from '../components/sheet.js';
import { adviceView } from './today.js';
import { MODES, kmNumber, nearReachKm } from '../modes.js';
import { adviceLine, clockTime } from '../../core/advice.js';
import { homeProfile, routeTitle, windWord } from '../../core/profile.js';
import { estimateDurationMin, formatDuration, formatShortDistance } from '../../core/index.js';

const MIN = 60 * 1000;

// ---------- Loading ----------

/** "Rondjes zoeken" with a ring that follows the progress. → element with .progress(done, total) */
export function renderLoading({ again, onCancel }) {
  const R = 74;
  const C = 2 * Math.PI * R;
  const arc = svg('circle', { class: 'ring__arc', cx: 80, cy: 80, r: R, transform: 'rotate(-90 80 80)', 'stroke-dasharray': C, 'stroke-dashoffset': C });
  const dot = svg('circle', { r: 6, fill: 'var(--sun)', stroke: 'var(--ink)', 'stroke-width': 2, cx: 80, cy: 80 - R });
  const label = h('div', { class: 't-callout', 'aria-live': 'polite' }, 'Rondjes zoeken…');
  const slow = h('div', { class: 't-foot', hidden: true }, 'Dit duurt meestal 5 tot 20 seconden.');
  const timer = setTimeout(() => (slow.hidden = false), 8000);
  const el = h(
    'div',
    { class: 'center' },
    h(
      'div',
      { class: 'stack' },
      svg('svg', { class: 'ring', viewBox: '0 0 160 160', 'aria-hidden': 'true' }, svg('circle', { class: 'ring__track', cx: 80, cy: 80, r: R }), arc, dot),
      h('h2', { class: 't-title3', tabindex: '-1' }, again ? 'Andere rondjes zoeken' : 'Rondjes zoeken'),
      label,
      slow,
      h('button', { class: 'btn btn--secondary glass', type: 'button', style: 'min-height:48px;margin-top:10px', onclick: () => { clearTimeout(timer); onCancel(); } }, 'Annuleren')
    )
  );
  el.progress = (done, total) => {
    if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return;
    const f = Math.min(1, done / total);
    arc.setAttribute('stroke-dashoffset', String(C * (1 - f)));
    const a = -Math.PI / 2 + f * Math.PI * 2;
    dot.setAttribute('cx', String(80 + R * Math.cos(a)));
    dot.setAttribute('cy', String(80 + R * Math.sin(a)));
    label.textContent = `Route ${Math.min(done, total)} van ${total}`;
  };
  el.dispose = () => clearTimeout(timer);
  return el;
}

// ---------- Errors ----------

/** One message, one main action (UX spec §2.6). */
export function renderError({ card, onBack }) {
  return h(
    'div',
    {},
    h('div', { class: 'topbar' }, h('button', { class: 'round glass', type: 'button', 'aria-label': 'Terug naar Vandaag', onclick: onBack }, icon('left'))),
    h(
      'div',
      { class: 'center' },
      h(
        'div',
        { class: 'errcard glass stack', role: 'alert' },
        h('span', { class: 'err-icon' }, icon(card.icon)),
        h('h2', { class: 't-title3', tabindex: '-1' }, card.title),
        h('p', { class: 't-callout' }, card.body),
        h('button', { class: 'btn btn--primary btn--full', type: 'button', style: 'margin-top:6px', onclick: card.action }, card.cta)
      )
    )
  );
}

// ---------- Posters ----------

function farKm(route, profile) {
  return Number.isFinite(route.maxFromStartKm) ? route.maxFromStartKm : profile.farKm;
}

function poster(route, i, ctx) {
  const n = ctx.routes.length;
  const near = route.loops === 2;
  const profile = homeProfile(route.path, route.start);
  const durationMin = estimateDurationMin(route.distanceKm, route.mode);
  const far = farKm(route, profile);
  const [farValue, farUnit] = formatShortDistance(far).split(' ');
  const minutes = Math.round(durationMin);
  const [durValue, durUnit] = minutes >= 60 ? [`${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`, 'uur'] : [String(minutes), 'min'];
  const range = MODES[route.mode] ?? MODES.walk;
  const advice = adviceLine({
    now: ctx.now, durationMin, km: route.distanceKm, sun: ctx.sun, weather: ctx.weather, step: range.step, minKm: range.min,
  });

  const shape = routeShape(route, { draw: true });
  const slot = h('div', { class: 'shape__map', 'aria-hidden': 'true' });
  const title = routeTitle(route);
  const eyebrow = [
    ctx.single ? 'Bewaard' : `${i + 1} van ${n}`,
    Number.isFinite(route.bearingDeg) ? `richting ${windWord(route.bearingDeg)}` : null,
    near ? 'Dicht bij huis' : null,
  ].filter(Boolean).join(' · ');
  const stat = (value, unit, label) =>
    h('div', { class: 'stat', 'aria-hidden': 'true' }, h('div', { class: 'stat__v' }, value, h('small', {}, unit)), h('div', { class: 't-foot' }, label));

  const el = h(
    'article',
    { class: 'poster' + (ctx.single ? ' poster--single' : ''), 'aria-label': ctx.single ? title : `${title}, rondje ${i + 1} van ${n}` },
    h('div', { class: 't-foot t-foot--strong' }, eyebrow),
    h('h2', { class: 't-title2' }, title),
    h(
      'button',
      { class: 'shape', type: 'button', 'aria-label': `Bekijk ${title} op de kaart`, onclick: () => ctx.onOpenMap(route) },
      slot,
      shape.el,
      ctx.map ? h('span', { class: 't-cap shape__credit' }, 'Kaart © Google') : null,
      h('span', { class: 'pill glass shape__hint', 'aria-hidden': 'true' }, icon('map'), 'Kaart')
    ),
    h(
      'div',
      {
        class: 'stats',
        role: 'group',
        'aria-label': `${kmNumber(route.distanceKm)} kilometer, ${formatDuration(durationMin)}, maximaal ${formatShortDistance(far)} van huis`,
      },
      stat(kmNumber(route.distanceKm), 'km', 'afstand'),
      stat(durValue, durUnit, 'duur'),
      stat(farValue, farUnit, near ? 'max van huis' : 'verst van huis')
    ),
    h(
      'div',
      { class: 'chart' },
      h('div', { class: 'chart__head', 'aria-hidden': 'true' }, h('span', { class: 't-cap' }, 'Afstand tot huis onderweg'), h('span', { class: 't-cap' }, `terug ${clockTime(ctx.now + durationMin * MIN)}`)),
      homeChart({ profile, distanceKm: route.distanceKm, near, guideKm: near ? nearReachKm(route.distanceKm) : null, durationMin, now: ctx.now, sun: ctx.sun })
    ),
    advice.warn ? h('div', { class: 'advice' }, adviceView(advice, ctx.onSuggest)) : null,
    near ? h('div', { class: 't-foot', style: 'margin-top:8px' }, 'Google Maps volgt de lussen bij benadering.') : null,
    !ctx.single && i === n - 1 && n < 5 ? h('div', { class: 't-foot', style: 'margin-top:8px' }, 'Meer rondjes vonden we niet vanaf hier.') : null
  );
  return { el, slot, box: shape.box };
}

/**
 * Results as full-screen posters you swipe up through (or one saved route, `single`).
 * ctx: routes, single, page, now, sun, weather, isSaved, onSave, onOpenMaps, onBack, onAgain,
 *      onOtherDistance, onPage, onOpenMap, onMore, onSuggest, showHint, map
 * → element with .refreshSaved() and .dispose()
 */
export function renderPosters(ctx) {
  const { routes, single } = ctx;
  const n = routes.length;
  const posters = routes.map((r, i) => poster(r, i, ctx));
  const endcard = single
    ? null
    : h(
        'article',
        { class: 'poster endcard', 'aria-label': 'Einde van de rondjes' },
        h('h2', { class: 't-title2' }, 'Niets voor je bij?'),
        h('p', { class: 't-callout' }, 'We zoeken nieuwe rondjes en vermijden de straten die je net zag.'),
        h('button', { class: 'btn btn--primary', type: 'button', onclick: ctx.onAgain }, icon('again'), 'Andere rondjes'),
        h('button', { class: 'btn--text', type: 'button', onclick: ctx.onOtherDistance }, 'Andere afstand kiezen')
      );
  const list = h('div', { class: 'posters' }, posters.map((p) => p.el), endcard);

  const counter = single
    ? h('span')
    : h('button', { class: 'pill glass topbar__middle', type: 'button', 'aria-label': 'Volgend rondje', onclick: () => go(Math.min(page + 1, n)) });
  const right = single
    ? h('button', { class: 'round glass', type: 'button', 'aria-label': 'Meer', onclick: ctx.onMore }, icon('more'))
    : h('button', { class: 'pill glass', type: 'button', onclick: openAll }, 'Alle');
  const dots = single
    ? null
    : h(
        'nav',
        { class: 'dots', 'aria-label': 'Rondjes' },
        routes.map((_, i) => h('button', { type: 'button', 'aria-label': `Rondje ${i + 1} van ${n}`, onclick: () => go(i) }, h('i')))
      );
  const saveBtn = h('button', { class: 'btn btn--secondary glass', type: 'button', onclick: () => ctx.onSave(current()) });
  const mapsBtn = h('button', { class: 'btn btn--primary', type: 'button', onclick: () => ctx.onOpenMaps(current()) }, 'Open in Google Maps');
  const actionbar = h('div', { class: 'actionbar' }, saveBtn, mapsBtn);
  const hint = h('div', { class: 'hint pill glass', hidden: true, 'aria-hidden': 'true' }, 'Veeg omhoog voor het volgende rondje');

  const el = h(
    'div',
    {},
    h(
      'div',
      { class: 'topbar' },
      h('button', { class: 'round glass', type: 'button', 'aria-label': single ? 'Terug naar Bewaard' : 'Terug naar Vandaag', onclick: ctx.onBack }, icon('left')),
      counter,
      right
    ),
    dots,
    list,
    actionbar,
    hint
  );

  let page = Math.min(ctx.page ?? 0, n);
  const current = () => routes[Math.min(page, n - 1)];

  function update() {
    const onEnd = !single && page >= n;
    actionbar.hidden = onEnd;
    if (!single) {
      counter.replaceChildren(onEnd ? 'Einde' : `${page + 1} van ${n}`, icon('down'));
      counter.setAttribute('aria-label', onEnd ? 'Einde van de rondjes' : `Rondje ${page + 1} van ${n}, tik voor het volgende`);
      [...dots.children].forEach((d, i) => d.setAttribute('aria-current', String(i === page)));
    }
    if (!onEnd) refreshSaved();
    const p = posters[page];
    if (p) {
      p.el.classList.add('poster--seen');
      ctx.map?.showUnder(p.slot, p.box);
    }
  }

  function refreshSaved() {
    const saved = ctx.isSaved(current());
    saveBtn.replaceChildren(icon(saved ? 'bookmarkFill' : 'bookmark'), h('span', {}, saved ? 'Bewaard' : 'Opslaan'));
    saveBtn.setAttribute('aria-pressed', String(saved));
  }

  function go(i) {
    list.scrollTo({ top: i * list.clientHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  let settle;
  list.addEventListener('scroll', () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      const i = Math.round(list.scrollTop / Math.max(1, list.clientHeight));
      if (i !== page) {
        page = i;
        ctx.onPage?.(i);
        update();
      }
    }, 80);
  });

  function openAll() {
    const sheet = showSheet({
      label: 'Alle rondjes',
      content: [
        sheetHead(`Alle ${n} rondjes`),
        h(
          'div',
          { class: 'grid2' },
          routes.map((r, i) => {
            const minutes = estimateDurationMin(r.distanceKm, r.mode);
            const far = farKm(r, homeProfile(r.path, r.start));
            return h(
              'button',
              {
                class: 'mini glass',
                type: 'button',
                'aria-label': `${routeTitle(r)}, ${kmNumber(r.distanceKm)} kilometer, ${formatDuration(minutes)}, maximaal ${formatShortDistance(far)} van huis`,
                onclick: () => {
                  sheet.close();
                  go(i);
                },
              },
              h('div', { class: 'mini__th' }, routeThumb(r)),
              h('span', { class: 'mini__name' }, routeTitle(r)),
              h('span', { class: 't-foot' }, `${kmNumber(r.distanceKm)} km · ${formatDuration(minutes)} · max ${formatShortDistance(far)}`)
            );
          })
        ),
      ],
    });
  }

  // Place the list on the current page once it has a size, then start.
  requestAnimationFrame(() => {
    list.scrollTop = page * list.clientHeight;
    update();
    if (ctx.showHint && !single) {
      ctx.onHintShown?.();
      hint.hidden = false;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) list.classList.add('posters--bounce');
      setTimeout(() => (hint.hidden = true), 3600);
    }
  });

  el.refreshSaved = refreshSaved;
  el.remap = () => {
    const p = posters[page];
    if (p) ctx.map?.showUnder(p.slot, p.box);
  };
  el.dispose = () => {
    clearTimeout(settle);
    ctx.map?.hide();
  };
  el.focusStart = () => el.querySelector('.t-title2')?.focus?.();
  return el;
}

/** Map sheet for one route: the real map in Google mode, the drawn shape in demo mode. */
export function openMapSheet(route, { map, onClose }) {
  const box = h('div', { class: 'mapbox' });
  if (map) box.appendChild(h('div', { class: 'shape__map' }));
  else box.appendChild(routeShape(route, { pad: 0.08 }).el);
  const sheet = showSheet({
    label: 'Kaart',
    content: [
      sheetHead(routeTitle(route)),
      box,
      map ? null : h('p', { class: 't-foot', style: 'margin:10px 4px 0' }, 'Demo-modus: zonder kaartsleutel zie je alleen de vorm van de route.'),
    ],
    onClose,
  });
  if (map) map.showInteractive(box.firstChild, route);
  return sheet;
}
