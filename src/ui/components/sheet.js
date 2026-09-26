import { h, icon } from '../dom.js';

let openSheet = null;

/**
 * Modal sheet from the bottom over a blurred scrim. `content` is an element or an array.
 * Tap on the scrim, Escape or a [data-close] button closes it. → { el, close }
 */
export function showSheet({ label, content, onClose }) {
  openSheet?.close();
  const previousFocus = document.activeElement;
  const sheet = h(
    'div',
    { class: 'sheet glass-strong', role: 'dialog', 'aria-modal': 'true', 'aria-label': label },
    h('span', { class: 'sheet__grab', 'aria-hidden': 'true' }),
    content
  );
  const scrim = h('div', { class: 'scrim' }, sheet);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    scrim.remove();
    document.removeEventListener('keydown', onKey);
    if (openSheet === handle) openSheet = null;
    onClose?.();
    if (previousFocus?.isConnected) previousFocus.focus?.();
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) close();
  });
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey);
  document.getElementById('app').appendChild(scrim);
  (sheet.querySelector('[data-autofocus]') ?? sheet.querySelector('h2') ?? sheet).focus?.();

  const handle = { el: sheet, close };
  openSheet = handle;
  return handle;
}

/** Sheet header: title and a round close button. */
export function sheetHead(title) {
  return h(
    'div',
    { class: 'shead' },
    h('h2', { class: 't-title3', tabindex: '-1' }, title),
    h('button', { class: 'round glass', type: 'button', 'data-close': '', 'aria-label': 'Sluiten' }, icon('x'))
  );
}

export function closeOpenSheet() {
  openSheet?.close();
}
