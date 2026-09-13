# Looply

Looply is een PWA die rondjes genereert voor wandelen, hardlopen of fietsen: kies een startpunt en een afstand, en je krijgt meerdere alternatieve routes terug.

## Starten

```bash
npm install
npm run dev      # dev-server op http://localhost:5173/looply/
npm test         # unit tests (Vitest)
npm run build    # productie-build naar dist/
```

## API-key

De Google Maps-key staat in `public/config.js` (niet in git). Kopieer `public/config.example.js` naar `public/config.js` en vul de key in. Zonder key draait de app in demo-modus (`?mock=1` forceert dat ook).

Voor GitHub Pages wordt `public/config.js` tijdens de build aangemaakt uit de repository secret `GOOGLE_MAPS_API_KEY`.
