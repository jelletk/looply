import { createSegmented } from '../components/segmented.js';
import { createSlider } from '../components/slider.js';
import { formatKm } from '../../core/index.js';

export const MODE_OPTIONS = [
  { value: 'walk', label: 'Wandelen' },
  { value: 'run', label: 'Hardlopen' },
  { value: 'bike', label: 'Fietsen' },
];

export const DISTANCE_RANGES = {
  walk: { min: 1, max: 20, step: 0.5 },
  run: { min: 1, max: 30, step: 0.5 },
  bike: { min: 5, max: 100, step: 1 },
};

/** iOS-style switch row: label + explanation on the left, switch on the right. The whole row is the tap target. */
function createSwitchRow({ label, detail, checked, onChange }) {
  const row = document.createElement('label');
  row.className = 'switch-row';

  const text = document.createElement('span');
  text.className = 'switch-row__text';
  const title = document.createElement('span');
  title.className = 'switch-row__label';
  title.textContent = label;
  const sub = document.createElement('span');
  sub.className = 'switch-row__detail';
  sub.textContent = detail;
  text.append(title, sub);

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'switch';
  input.setAttribute('role', 'switch');
  input.checked = checked;
  // Name = the label only; the explanation is read as a description.
  sub.id = 'switch-detail-' + Math.random().toString(36).slice(2, 8);
  input.setAttribute('aria-describedby', sub.id);
  title.id = sub.id + '-label';
  input.setAttribute('aria-labelledby', title.id);
  input.addEventListener('change', () => onChange(input.checked));

  row.append(text, input);
  return row;
}

/** Bottom sheet content for the plan screen: mode segmented control, distance slider, close-to-home switch, search button. */
export function renderPlanSheet({
  mode,
  distanceKm,
  closeToHome,
  onModeChange,
  onDistanceChange,
  onCloseToHomeChange,
  onSearch,
}) {
  const wrap = document.createElement('div');
  wrap.className = 'plan-sheet';

  wrap.appendChild(createSegmented({ options: MODE_OPTIONS, value: mode, onChange: onModeChange }));

  const range = DISTANCE_RANGES[mode];
  wrap.appendChild(
    createSlider({
      min: range.min,
      max: range.max,
      step: range.step,
      value: distanceKm,
      format: formatKm,
      onChange: onDistanceChange,
    })
  );

  wrap.appendChild(
    createSwitchRow({
      label: 'Dicht bij huis',
      detail: 'Twee kleinere lussen; halverwege kom je langs je startpunt.',
      checked: closeToHome,
      onChange: onCloseToHomeChange,
    })
  );

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--primary btn--full';
  button.textContent = 'Routes zoeken';
  button.addEventListener('click', onSearch);
  wrap.appendChild(button);

  return wrap;
}
