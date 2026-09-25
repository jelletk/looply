// Static, developer-authored inline SVG icon markup (never user data — safe to use with innerHTML).

export const ICON_SETTINGS = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7h10m4 0h2M4 17h2m4 0h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="16" cy="7" r="2.2" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="17" r="2.2" stroke="currentColor" stroke-width="1.6"/></svg>`;

export const ICON_MAP =`<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 20l-6-2V5l6 2m0 13l6-2m-6 2V7m6 11l6 2V5l-6-2m0 15V5m0 0L9 7" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

export const ICON_BOOKMARK = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.6L6 21V4.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

export const ICON_LOCATION = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21s7-6.3 7-11.5A7 7 0 0 0 5 9.5C5 14.7 12 21 12 21Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.3" stroke="currentColor" stroke-width="1.6"/></svg>`;

export const ICON_CHEVRON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const ICON_WALK = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="13" cy="4.5" r="1.6" fill="currentColor"/><path d="M10.5 21l1.2-5.4-2.4-2 .7-4.4 3.3-1.6 2.6 2.7 3 1.1M9 21l2-4.2M9.5 10.4 6 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const ICON_RUN = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14.5" cy="4.5" r="1.6" fill="currentColor"/><path d="M8 9.5 12 8l2 2.6 3.5 1-1 2.7-3-.6-1 3.6 2.5 3.8M6 14l3.3-1.6L11 15l-3 3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const ICON_BIKE = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="17" r="3" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="17" r="3" stroke="currentColor" stroke-width="1.6"/><path d="M6 17l4-7h4l3 7M10 10 9 7h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const MODE_ICONS = { walk: ICON_WALK, run: ICON_RUN, bike: ICON_BIKE };
