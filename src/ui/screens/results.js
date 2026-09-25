import { createRouteCard } from '../components/routeCard.js';

/** Bottom sheet content for the results screen: loading / error / route-card row + actions. */
export function renderResultsSheet({
  status,
  progressText,
  errorMessage,
  routes,
  selectedRouteId,
  savedIds,
  onSelectRoute,
  onSave,
  onOpenMaps,
  onRetry,
  onCancel,
  onAgain, // "Andere rondjes": new search away from these streets (plan tab only)
}) {
  const wrap = document.createElement('div');
  wrap.className = 'results-sheet';

  if (status === 'loading') {
    const statusBox = document.createElement('div');
    statusBox.className = 'results-sheet__status';

    const spinner = document.createElement('div');
    spinner.className = 'spinner';

    const text = document.createElement('div');
    text.className = 'results-sheet__progress';
    text.textContent = progressText || 'Routes zoeken…';

    statusBox.append(spinner, text);
    if (onCancel) {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn--plain';
      cancel.textContent = 'Annuleren';
      cancel.addEventListener('click', onCancel);
      statusBox.appendChild(cancel);
    }
    wrap.appendChild(statusBox);
    return wrap;
  }

  if (status === 'error') {
    const statusBox = document.createElement('div');
    statusBox.className = 'results-sheet__status';

    const msg = document.createElement('p');
    msg.className = 'results-sheet__error';
    msg.textContent = errorMessage;

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn--secondary';
    retry.textContent = 'Opnieuw proberen';
    retry.addEventListener('click', onRetry);

    statusBox.append(msg, retry);
    wrap.appendChild(statusBox);
    return wrap;
  }

  const row = document.createElement('div');
  row.className = 'route-card-row';
  routes.forEach((route) => {
    row.appendChild(
      createRouteCard({ route, selected: route.id === selectedRouteId, onSelect: onSelectRoute })
    );
  });
  wrap.appendChild(row);

  const selected = routes.find((r) => r.id === selectedRouteId) || routes[0];
  if (selected) {
    const actions = document.createElement('div');
    actions.className = 'results-sheet__actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn--secondary';
    saveBtn.textContent = savedIds.has(selected.id) ? 'Opgeslagen' : 'Opslaan';
    saveBtn.addEventListener('click', () => onSave(selected));
    actions.appendChild(saveBtn);

    const mapsBtn = document.createElement('button');
    mapsBtn.type = 'button';
    mapsBtn.className = 'btn btn--primary';
    mapsBtn.textContent = 'Google Maps ↗';
    mapsBtn.addEventListener('click', () => onOpenMaps(selected));
    actions.appendChild(mapsBtn);

    wrap.appendChild(actions);
  }

  if (onAgain) {
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'btn btn--plain btn--full';
    again.textContent = 'Andere rondjes';
    again.addEventListener('click', onAgain);
    wrap.appendChild(again);
  }

  return wrap;
}
