/** iOS segmented control: grey track with a white sliding selected segment. */
export function createSegmented({ options, value, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'segmented';

  const track = document.createElement('div');
  track.className = 'segmented__track';
  track.style.width = `calc(${100 / options.length}% - 2px)`;
  wrap.appendChild(track);

  const buttons = options.map((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented__option';
    btn.textContent = opt.label;
    btn.addEventListener('click', () => onChange(opt.value));
    wrap.appendChild(btn);
    return btn;
  });

  function update(val) {
    const idx = Math.max(0, options.findIndex((o) => o.value === val));
    track.style.transform = `translateX(${idx * 100}%)`;
    buttons.forEach((b, i) => b.classList.toggle('segmented__option--active', i === idx));
  }

  update(value);
  wrap.update = update;
  return wrap;
}
