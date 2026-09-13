/** Frosted-glass bottom sheet with a grabber, floating over the map. */
export function createSheet({ content, className = '' }) {
  const sheet = document.createElement('div');
  sheet.className = `sheet ${className}`.trim();

  const grabber = document.createElement('div');
  grabber.className = 'sheet__grabber';
  sheet.appendChild(grabber);

  const body = document.createElement('div');
  body.className = 'sheet__body';
  body.appendChild(content);
  sheet.appendChild(body);

  return sheet;
}
