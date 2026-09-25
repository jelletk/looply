/** Short message floating at the top of the screen; replaces any toast still showing. Read out by VoiceOver. */
export function showToast(text, { durationMs = 5000 } = {}) {
  document.querySelector('.toast')?.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = text;
  toast.addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), durationMs);
  return toast;
}
