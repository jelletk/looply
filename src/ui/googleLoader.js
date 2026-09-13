// Loads the Google Maps JavaScript API using Google's official dynamic bootstrap
// loader snippet, then eagerly imports the libraries this app needs.
// https://developers.google.com/maps/documentation/javascript/load-maps-js-api

let loaderPromise = null;

function injectBootstrapLoader(apiKey) {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google);

  ((g) => {
    let h;
    let a;
    let k;
    const p = 'The Google Maps JavaScript API';
    const c = 'google';
    const l = 'importLibrary';
    const q = '__ib__';
    const m = document;
    let b = window;
    b = b[c] || (b[c] = {});
    const d = b.maps || (b.maps = {});
    const r = new Set();
    const e = new URLSearchParams();
    const u = () =>
      h ||
      (h = new Promise(async (f, n) => {
        await (a = m.createElement('script'));
        e.set('libraries', [...r] + '');
        for (k in g) e.set(k.replace(/[A-Z]/g, (t) => '_' + t[0].toLowerCase()), g[k]);
        e.set('callback', c + '.maps.' + q);
        a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
        d[q] = f;
        a.onerror = () => (h = n(Error(p + ' could not load.')));
        a.nonce = m.querySelector('script[nonce]')?.nonce || '';
        m.head.append(a);
      }));
    d[l]
      ? console.warn(p + ' only loads once. Ignoring:', g)
      : (d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)));
  })({ key: apiKey, v: 'weekly', language: 'nl', region: 'NL' });

  return Promise.resolve(window.google);
}

export async function loadGoogleMaps(apiKey) {
  if (!loaderPromise) loaderPromise = injectBootstrapLoader(apiKey);
  const google = await loaderPromise;
  await google.maps.importLibrary('maps');
  await google.maps.importLibrary('places');
  return google;
}
