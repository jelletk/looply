import { h } from '../dom.js';

let current = null;

/**
 * Short message at the top, read out by VoiceOver. With `undo`, an "Ongedaan maken" button shows
 * and the toast stays a little longer. Replaces a toast still showing.
 */
export function showToast(text, { undo, durationMs } = {}) {
  current?.remove();
  const undoBtn = undo
    ? h('button', { type: 'button', onclick: () => { undo(); hide(); } }, 'Ongedaan maken')
    : null;
  const toast = h(
    'div',
    { class: 'toast glass-strong' + (undo ? ' toast--undo' : ''), role: 'status', 'aria-live': 'polite' },
    h('span', {}, text),
    undoBtn
  );
  document.getElementById('app').appendChild(toast);
  current = toast;
  requestAnimationFrame(() => toast.classList.add('toast--on'));
  const timer = setTimeout(hide, durationMs ?? (undo ? 4500 : 3000));

  function hide() {
    clearTimeout(timer);
    toast.classList.remove('toast--on');
    setTimeout(() => toast.remove(), 250);
    if (current === toast) current = null;
  }
  return toast;
}
