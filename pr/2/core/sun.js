// Sunrise and sunset, computed locally from the sunrise equation as NOAA and
// the astronomical almanac give it (solar mean anomaly, equation of centre,
// declination, hour angle for -0.833 deg). Within a few minutes of the
// published times, plenty for switching the theme.
const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const J0 = 0.0009;
const OBLIQUITY = RAD * 23.4397;
const SUNRISE_ALTITUDE = RAD * -0.833; // refraction and the sun's radius

const toDays = (ms) => ms / DAY_MS - 0.5 + J1970 - J2000;
const fromJulian = (j) => (j + 0.5 - J1970) * DAY_MS;

/**
 * Sunrise and sunset (ms) for the solar day nearest `ms`, or { polar: "day" | "night" }
 * when the sun doesn't cross the horizon that day.
 */
export function sunTimes(ms, lat, lon) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const n = Math.round(toDays(ms) - J0 - lw / (2 * Math.PI));
  const approx = (ht) => J0 + (ht + lw) / (2 * Math.PI) + n;

  const ds = approx(0);
  const M = RAD * (357.5291 + 0.98560028 * ds);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));
  const transit = (d) => J2000 + d + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const noon = transit(ds);

  const cosH = (Math.sin(SUNRISE_ALTITUDE) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosH > 1) return { polar: "night" };
  if (cosH < -1) return { polar: "day" };
  const set = transit(approx(Math.acos(cosH)));
  return { sunrise: fromJulian(noon - (set - noon)), sunset: fromJulian(set) };
}

/** Whether the sun is up at `now`, and when that next changes (ms, or null if not within two days). */
export function daylight(now, lat, lon) {
  const events = [];
  let polar = null;
  for (const offset of [-1, 0, 1, 2]) {
    const t = sunTimes(now + offset * DAY_MS, lat, lon);
    if (t.polar) {
      if (offset === 0) polar = t.polar;
      continue;
    }
    events.push({ at: t.sunrise, up: true }, { at: t.sunset, up: false });
  }
  events.sort((a, b) => a.at - b.at);
  const last = events.filter((e) => e.at <= now).pop();
  const next = events.find((e) => e.at > now);
  const day = last ? last.up : polar ? polar === "day" : !next?.up;
  return { day, next: next?.at ?? null };
}
