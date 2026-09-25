import { ICON_LOCATION } from './icons.js';

/** Floating pill at the top: location icon + current label. */
export function createStartPill({ label, onTap }) {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'start-pill';

  const icon = document.createElement('span');
  icon.className = 'start-pill__icon';
  icon.innerHTML = ICON_LOCATION;

  const text = document.createElement('span');
  text.className = 'start-pill__label';
  text.textContent = label;

  pill.append(icon, text);
  pill.addEventListener('click', onTap);
  return pill;
}

/**
 * Opens a sheet with "Huidige locatie gebruiken" plus a search field.
 * Google mode uses PlaceAutocompleteElement; mock mode is a plain "lat, lng" text field.
 */
export function openStartSheet({ mode, google, onUseCurrentLocation, onCoords, onPlace }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';

  const sheet = document.createElement('div');
  sheet.className = 'sheet start-sheet';

  const grabber = document.createElement('div');
  grabber.className = 'sheet__grabber';
  sheet.appendChild(grabber);

  const body = document.createElement('div');
  body.className = 'sheet__body';

  const useCurrentBtn = document.createElement('button');
  useCurrentBtn.type = 'button';
  useCurrentBtn.className = 'btn btn--secondary btn--full';
  useCurrentBtn.textContent = 'Huidige locatie gebruiken';
  useCurrentBtn.addEventListener('click', () => {
    onUseCurrentLocation();
    close();
  });
  body.appendChild(useCurrentBtn);

  const fieldWrap = document.createElement('div');
  fieldWrap.className = 'start-sheet__field';
  body.appendChild(fieldWrap);
  sheet.appendChild(body);
  backdrop.appendChild(sheet);

  const error = document.createElement('p');
  error.className = 'start-sheet__error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  if (mode === 'google' && google) {
    google.maps
      .importLibrary('places')
      .then((placesLib) => {
        const autocomplete = new placesLib.PlaceAutocompleteElement();
        autocomplete.classList.add('start-sheet__autocomplete');
        fieldWrap.prepend(autocomplete);
        autocomplete.addEventListener('gmp-select', async (event) => {
          try {
            const place = event.placePrediction ? event.placePrediction.toPlace() : event.place;
            await place.fetchFields({ fields: ['location', 'displayName'] });
            const loc = place.location;
            onPlace({
              latLng: { lat: loc.lat(), lng: loc.lng() },
              label: place.displayName || 'Gekozen locatie',
            });
            close();
          } catch (err) {
            console.error('Place details failed', err);
            showError('Deze plek kon niet worden opgehaald. Controleer je verbinding en probeer het opnieuw.');
          }
        });
      })
      .catch((err) => {
        console.error('Places library failed to load', err);
        showError('Adres zoeken lukt nu niet. Controleer je verbinding, of gebruik je huidige locatie.');
      });
    fieldWrap.appendChild(error);
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'start-sheet__input';
    input.placeholder = 'lat, lng (bijv. 52.0907, 5.1214)';

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'btn btn--primary btn--full';
    submitBtn.textContent = 'Gebruik deze locatie';

    function submitManual() {
      const raw = input.value.trim();
      const match = raw.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
      const lat = match ? Number(match[1]) : NaN;
      const lng = match ? Number(match[2]) : NaN;
      if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) {
        showError('Dat zijn geen geldige coördinaten. Gebruik de vorm 52.0907, 5.1214.');
        input.focus();
        return;
      }
      onCoords({ latLng: { lat, lng }, label: raw });
      close();
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitManual();
    });
    submitBtn.addEventListener('click', submitManual);

    fieldWrap.append(input, error, submitBtn);
  }

  function close() {
    backdrop.remove();
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  document.body.appendChild(backdrop);
  return { close };
}
