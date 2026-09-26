// Sunrise, sunset and the sky phase, computed on the device (sunrise equation, no network).

const MIN = 60 * 1000;
const RAD = Math.PI / 180;
const J2000 = 2451545;
const julianToMs = (j) => (j - 2440587.5) * 864e5;

/**
 * Sunrise and sunset (epoch ms) on the calendar day of `date` (device time zone) at lat/lng.
 * Within about a minute of published times in the Netherlands. rise/set are null on days the
 * sun does not cross the horizon (polar day or night).
 */
export function sunTimes(date = new Date(), lat = 52.09, lng = 5.12) {
  const noonJulian = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12) / 864e5 + 2440587.5;
  const jStar = Math.round(noonJulian - J2000) - lng / 360; // mean solar noon
  const m = (357.5291 + 0.98560028 * jStar) % 360; // mean anomaly
  const c = 1.9148 * Math.sin(m * RAD) + 0.02 * Math.sin(2 * m * RAD) + 0.0003 * Math.sin(3 * m * RAD);
  const lambda = (m + c + 180 + 102.9372) % 360; // ecliptic longitude
  const transit = J2000 + jStar + 0.0053 * Math.sin(m * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDecl = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDecl = Math.cos(Math.asin(sinDecl));
  const cosHa = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDecl) / (Math.cos(lat * RAD) * cosDecl);
  if (!(cosHa >= -1 && cosHa <= 1)) return { rise: null, set: null };
  const ha = Math.acos(cosHa) / RAD / 360; // in days
  return { rise: julianToMs(transit - ha), set: julianToMs(transit + ha) };
}

/**
 * Sky phase at `now` (epoch ms): 'dawn' from 40 min before sunrise to an hour after it, 'dusk' from
 * an hour before sunset to 50 min after it, 'night' outside those, 'day' in between.
 */
export function skyPhase(now, sun) {
  if (sun.rise == null || sun.set == null) return 'day';
  if (now < sun.rise - 40 * MIN || now > sun.set + 50 * MIN) return 'night';
  if (now < sun.rise + 60 * MIN) return 'dawn';
  if (now > sun.set - 60 * MIN) return 'dusk';
  return 'day';
}
