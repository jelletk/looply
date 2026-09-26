// Small DOM helpers. Text always goes in as text; only the static icon markup from icons.js is
// ever set as HTML.

import { ICONS } from './icons.js';

/**
 * h('button', { class: 'btn', onclick, 'aria-label': 'x' }, 'Text', child) → element.
 * Attributes: `class`, `on<event>` handlers, `hidden`/boolean attributes, anything else as attribute.
 * Children: strings, elements, arrays, and null/false (skipped).
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

/** A <span> holding one of the app's icons (decorative, hidden from VoiceOver). */
export function icon(name, className = '') {
  const span = document.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  span.style.display = 'contents';
  if (className) span.className = className;
  span.innerHTML = ICONS[name] ?? '';
  return span;
}

/** Render line segments from core/advice.js: strings as text, { strong } in bold. */
export function segments(list) {
  return list.map((s) => (typeof s === 'string' ? s : h('b', {}, s.strong)));
}

/** Namespace-aware SVG element. */
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
