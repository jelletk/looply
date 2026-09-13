/** iOS-styled range slider with a large value label above it. */
export function createSlider({ min, max, step, value, format, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'slider';

  const valueEl = document.createElement('div');
  valueEl.className = 'slider__value';
  valueEl.textContent = format(value);

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'slider__input';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  function updateFill() {
    const pct = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
    input.style.setProperty('--fill', `${pct}%`);
  }

  input.addEventListener('input', () => {
    const v = Number(input.value);
    valueEl.textContent = format(v);
    updateFill();
    onChange(v);
  });

  updateFill();
  wrap.append(valueEl, input);

  wrap.setRange = ({ min: mn, max: mx, step: st, value: val }) => {
    input.min = String(mn);
    input.max = String(mx);
    input.step = String(st);
    input.value = String(val);
    valueEl.textContent = format(val);
    updateFill();
  };

  return wrap;
}
