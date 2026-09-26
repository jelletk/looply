// Icons in the style of SF Symbols, drawn as own SVGs (the SF Symbols licence does not allow web use).
// Static, developer-authored markup: safe for innerHTML. 24px grid, stroke 1.9.

const s = (d) => `<svg viewBox="0 0 24 24" fill="none">${d}</svg>`;
const line = 'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  walk: s(`<circle cx="13" cy="4.5" r="1.7" fill="currentColor"/><path d="M10.5 21l1.2-5.4-2.4-2 .7-4.4 3.3-1.6 2.6 2.7 3 1.1M9 21l2-4.2M9.5 10.4 6 12" ${line}/>`),
  run: s(`<circle cx="14.5" cy="4.5" r="1.7" fill="currentColor"/><path d="M8 9.5 12 8l2 2.6 3.5 1-1 2.7-3-.6-1 3.6 2.5 3.8M6 14l3.3-1.6L11 15l-3 3.6" ${line}/>`),
  bike: s(`<circle cx="6" cy="17" r="3" stroke="currentColor" stroke-width="1.9"/><circle cx="18" cy="17" r="3" stroke="currentColor" stroke-width="1.9"/><path d="M6 17l4-7h4l3 7M10 10 9 7h3" ${line}/>`),
  house: s('<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-7.5Z" fill="currentColor"/>'),
  loc: s('<path d="M20.5 3.5 3.8 10.4c-.8.3-.7 1.4.1 1.6l6.6 1.5 1.5 6.6c.2.8 1.3.9 1.6.1L20.5 3.5Z" fill="currentColor"/>'),
  locslash: s(`<path d="M20.5 3.5 3.8 10.4c-.8.3-.7 1.4.1 1.6l6.6 1.5 1.5 6.6c.2.8 1.3.9 1.6.1L20.5 3.5ZM3 3l18 18" ${line}/>`),
  search: s('<circle cx="10.5" cy="10.5" r="6" stroke="currentColor" stroke-width="2"/><path d="m15 15 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  pin: s(`<path d="M12 21s7-6.3 7-11.5A7 7 0 0 0 5 9.5C5 14.7 12 21 12 21Z" ${line}/><circle cx="12" cy="9.5" r="2.3" stroke="currentColor" stroke-width="1.9"/>`),
  down: s('<path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  left: s('<path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  x: s('<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  check: s('<path d="M5 12.5 10 17.5 19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  bookmark: s(`<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1Z" ${line}/>`),
  bookmarkFill: s(`<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1Z" fill="currentColor" ${line}/>`),
  map: s(`<path d="M9 4 3.8 5.9a1 1 0 0 0-.7 1V19l5.9-2.1 6 2.1 5.2-1.9a1 1 0 0 0 .7-1V4.1L15 6.1 9 4Z" ${line}/><path d="M9 4v12.9M15 6.1V19" stroke="currentColor" stroke-width="1.9"/>`),
  again: s(`<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5" ${line}/>`),
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/></svg>',
  sunset: s(`<path d="M4 18h16M7 14a5 5 0 0 1 10 0M12 4v4m0 0-2-2m2 2 2-2M4.5 10l1.4 1.4M19.5 10l-1.4 1.4" ${line}/>`),
  rain: s(`<path d="M7 15a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6 1.5A3.3 3.3 0 0 1 17 15H7Z" ${line}/><path d="m9 18-1 2.5M13 18l-1 2.5M17 18l-1 2.5" ${line}/>`),
  cloudsun: s(`<circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.9"/><path d="M9 2.5v1.2M3.5 8h1.2M5.1 4.1l.9.9M12.9 4.1l-.9.9" ${line}/><path d="M9 19a3.5 3.5 0 0 1-.2-7 5 5 0 0 1 9.6 1.4A2.9 2.9 0 0 1 18 19H9Z" ${line}/>`),
  moon: s(`<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" ${line}/>`),
  alert: s(`<path d="M12 4 2.8 19.5h18.4L12 4Z" ${line}/><path d="M12 10v4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.2" fill="currentColor"/>`),
  wifi: s(`<path d="M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0M4 4l16 16" ${line}/>`),
  // Tab bar
  today: s(`<path d="M5.5 15.5a7 7 0 1 1 13 0" ${line}/><circle cx="12" cy="8.5" r="2.2" fill="currentColor"/><path d="M3 19.5h18" ${line}/>`),
  sliders: s(`<path d="M4 7h10m4 0h2M4 17h2m4 0h10" ${line}/><circle cx="16" cy="7" r="2.3" stroke="currentColor" stroke-width="1.9"/><circle cx="8" cy="17" r="2.3" stroke="currentColor" stroke-width="1.9"/>`),
};
