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

/** Bottom sheet content for the plan screen: mode segmented control, distance slider, search button. */
export function renderPlanSheet({ mode, distanceKm, onModeChange, onDistanceChange, onSearch }) {
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

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--primary btn--full';
  button.textContent = 'Routes zoeken';
  button.addEventListener('click', onSearch);
  wrap.appendChild(button);

  return wrap;
}
