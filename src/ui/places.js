// Address search for the start-point sheet. Google mode uses Places Autocomplete (New) with a
// session token (the suggestions of one search are billed together with the chosen place).
// Demo mode knows a few places around Utrecht and accepts "lat, lng".

/** → async search(query) → [{ label, detail, pick: async () => ({ latLng, label }) }] */
export function createPlaceSearch(google) {
  return google ? googleSearch(google) : demoSearch();
}

function googleSearch(google) {
  let lib = null;
  let session = null;
  return async function search(query) {
    lib ??= await google.maps.importLibrary('places');
    session ??= new lib.AutocompleteSessionToken();
    const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      sessionToken: session,
      language: 'nl',
      region: 'nl',
    });
    return suggestions
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .slice(0, 6)
      .map((p) => ({
        label: p.mainText?.text ?? p.text.text,
        detail: p.secondaryText?.text ?? '',
        pick: async () => {
          const place = p.toPlace();
          await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] });
          session = null; // the session ends with the chosen place
          return {
            latLng: { lat: place.location.lat(), lng: place.location.lng() },
            label: place.displayName || p.mainText?.text || 'Gekozen plek',
          };
        },
      }));
  };
}

const DEMO_PLACES = [
  ['Domplein', 'Utrecht', 52.0907, 5.1214],
  ['Park Oog in Al', 'Utrecht', 52.0925, 5.0925],
  ['Wilhelminapark', 'Utrecht', 52.0856, 5.1406],
  ['Amelisweerd', 'Bunnik', 52.0772, 5.1622],
  ['Maliebaan', 'Utrecht', 52.0888, 5.1318],
  ['Vondelpark', 'Amsterdam', 52.358, 4.8686],
];

function demoSearch() {
  return async function search(query) {
    const coords = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coords) {
      const lat = Number(coords[1]);
      const lng = Number(coords[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        const label = `${lat}, ${lng}`;
        return [{ label, detail: 'Coördinaten', pick: async () => ({ latLng: { lat, lng }, label }) }];
      }
    }
    const q = query.trim().toLowerCase();
    return DEMO_PLACES.filter(([name, city]) => `${name} ${city}`.toLowerCase().includes(q)).map(([name, city, lat, lng]) => ({
      label: name,
      detail: city,
      pick: async () => ({ latLng: { lat, lng }, label: name }),
    }));
  };
}
