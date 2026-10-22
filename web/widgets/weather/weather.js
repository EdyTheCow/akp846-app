// Current weather from Open-Meteo (no key needed).
import { defineSymbols, make, refs } from "../../core/dom.js";
import { deg } from "../../core/format.js";
import { fetchJSON } from "../../core/net.js";
import { store } from "../../core/store.js";

const REFRESH_MS = 10 * 60 * 1000;
const RETRY_MS = 60 * 1000;

const WMO = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Rain showers", 82: "Heavy showers",
  85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm, hail", 99: "Thunderstorm, hail",
};

// Tint in the weather card, keyed by sky type: [r g b, alpha]
const GLOW = {
  "clear-day": ["242 179 61", 0.16], "clear-night": ["90 100 190", 0.20],
  "partly-day": ["150 170 210", 0.13], "partly-night": ["80 90 160", 0.16],
  cloudy: ["140 140 150", 0.10], fog: ["160 160 165", 0.10],
  drizzle: ["57 135 229", 0.14], rain: ["57 135 229", 0.18],
  snow: ["210 220 240", 0.13], thunder: ["144 133 233", 0.18],
};

function sky(code, isDay) {
  if (code <= 1) return isDay ? "clear-day" : "clear-night";
  if (code === 2) return isDay ? "partly-day" : "partly-night";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunder";
  return "cloudy";
}

const compass = (degrees) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(degrees / 45) % 8];

const SYMBOLS = `
  <symbol id="wx-sun-shape" viewBox="0 0 64 64">
    <g class="i-sun">
      <circle cx="32" cy="32" r="10"/>
      <path d="M32 10v6M32 48v6M10 32h6M48 32h6M16.4 16.4l4.3 4.3M43.3 43.3l4.3 4.3M16.4 47.6l4.3-4.3M43.3 20.7l4.3-4.3"/>
    </g>
  </symbol>
  <symbol id="wx-moon-shape" viewBox="0 0 64 64">
    <path class="i-moon" d="M41 13a20 20 0 1 0 12 28A16 16 0 0 1 41 13z"/>
  </symbol>
  <symbol id="wx-cloud-shape" viewBox="0 0 64 64">
    <path class="i-cloud" d="M22 46H46a9 9 0 0 0 1-18a13 13 0 0 0-25-2a10 10 0 0 0 0 20z"/>
  </symbol>
  <symbol id="wx-clear-day" viewBox="0 0 64 64"><use href="#wx-sun-shape"/></symbol>
  <symbol id="wx-clear-night" viewBox="0 0 64 64"><use href="#wx-moon-shape"/></symbol>
  <symbol id="wx-partly-day" viewBox="0 0 64 64">
    <use href="#wx-sun-shape" x="-9" y="-9" width="52" height="52"/>
    <use href="#wx-cloud-shape" x="4" y="6"/>
  </symbol>
  <symbol id="wx-partly-night" viewBox="0 0 64 64">
    <use href="#wx-moon-shape" x="-7" y="-8" width="50" height="50"/>
    <use href="#wx-cloud-shape" x="4" y="6"/>
  </symbol>
  <symbol id="wx-cloudy" viewBox="0 0 64 64"><use href="#wx-cloud-shape" y="2"/></symbol>
  <symbol id="wx-fog" viewBox="0 0 64 64">
    <use href="#wx-cloud-shape" y="-8"/>
    <path class="i-fog" d="M16 48h32M21 55h22"/>
  </symbol>
  <symbol id="wx-drizzle" viewBox="0 0 64 64">
    <use href="#wx-cloud-shape" y="-8"/>
    <path class="i-drop" d="M24 46l-1.5 3M34 46l-1.5 3M44 46l-1.5 3M29 53l-1.5 3M39 53l-1.5 3"/>
  </symbol>
  <symbol id="wx-rain" viewBox="0 0 64 64">
    <use href="#wx-cloud-shape" y="-8"/>
    <path class="i-drop" d="M25 45l-4 10M35 45l-4 10M45 45l-4 10"/>
  </symbol>
  <symbol id="wx-snow" viewBox="0 0 64 64">
    <use href="#wx-cloud-shape" y="-8"/>
    <g class="i-flake">
      <circle cx="23" cy="48" r="2.2"/><circle cx="33" cy="48" r="2.2"/><circle cx="43" cy="48" r="2.2"/>
      <circle cx="28" cy="56" r="2.2"/><circle cx="38" cy="56" r="2.2"/>
    </g>
  </symbol>
  <symbol id="wx-thunder" viewBox="0 0 64 64">
    <use href="#wx-cloud-shape" y="-8"/>
    <path class="i-bolt" d="M35 41l-6 9h7l-5 9"/>
  </symbol>
  <symbol id="i-sunrise" viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 18a5 5 0 0 0-10 0M12 9V2M8 6l4-4 4 4M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1"/>
    </g>
  </symbol>
  <symbol id="i-sunset" viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 18a5 5 0 0 0-10 0M12 2v7M16 5l-4 4-4-4M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1"/>
    </g>
  </symbol>`;

export function mount(card, { settings, general, fmt }) {
  defineSymbols("weather", SYMBOLS);
  card.classList.add("weather");
  card.setAttribute("aria-label", `Weather in ${general.placeName}`);
  card.innerHTML = `
    <div class="head"><span data-ref="cond">Loading weather…</span></div>
    <div class="hero">
      <svg class="wx" aria-hidden="true"><use data-ref="icon" href="#wx-cloudy"/></svg>
      <span data-ref="temp">--°</span>
    </div>
    <div class="detail" data-ref="feels">&nbsp;</div>
    <ul class="stats">
      <li title="Wind">
        <svg class="wind-arrow" data-ref="windArrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20V4M5 11l7-7 7 7"/></svg>
        <span data-ref="wind">–</span>
      </li>
      <li title="Today's high / low">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 14.8V4.5a2.5 2.5 0 0 0-5 0v10.3a4.5 4.5 0 1 0 5 0z"/></svg>
        <span data-ref="hilo">–</span>
      </li>
      <li title="Next sunrise or sunset">
        <svg aria-hidden="true"><use data-ref="sunIcon" href="#i-sunset"/></svg>
        <span data-ref="sun">–</span>
      </li>
    </ul>`;
  const r = refs(card);

  const api = "https://api.open-meteo.com/v1/forecast?" + new URLSearchParams({
    latitude: general.latitude, longitude: general.longitude, timezone: general.timezone, timeformat: "unixtime",
    wind_speed_unit: "ms", models: settings.model,
    forecast_days: 2,
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day",
    daily: "temperature_2m_max,temperature_2m_min,sunrise,sunset",
  });
  const cacheKey = `weather-${general.latitude},${general.longitude},${settings.model}`;

  let weather = null;
  let lastOk = 0;
  let alive = true;
  let timer = 0;

  function render() {
    if (!weather) {
      if (lastOk === -1) r.cond.textContent = "Weather offline";
      return;
    }
    const c = weather.current, d = weather.daily, now = Date.now();
    const kind = sky(c.weather_code, c.is_day);
    r.icon.setAttribute("href", `#wx-${kind}`);
    r.temp.textContent = deg(c.temperature_2m);
    r.cond.textContent = WMO[c.weather_code] ?? "—";
    const stale = now - lastOk > 30 * 60 * 1000;
    r.feels.textContent = `Feels like ${deg(c.apparent_temperature)}${stale ? " · offline" : ""}`;

    r.wind.replaceChildren(`${Math.round(c.wind_speed_10m)} `, make("span", { className: "unit", textContent: "m/s" }), ` ${compass(c.wind_direction_10m)}`);
    // Arrow points where the wind is blowing to
    r.windArrow.style.transform = `rotate(${(c.wind_direction_10m + 180) % 360}deg)`;
    // No spaces around the slash: keeps "-10deg/-15deg" inside its column
    r.hilo.replaceChildren(deg(d.temperature_2m_max[0]), make("span", { className: "unit", textContent: "/" }), deg(d.temperature_2m_min[0]));

    // Only the next sun event: today's sunrise, today's sunset, or tomorrow's sunrise
    const events = [["sunrise", d.sunrise[0]], ["sunset", d.sunset[0]], ["sunrise", d.sunrise[1]]];
    const [kindOfSun, at] = events.find(([, s]) => s && s * 1000 > now) ?? events[1];
    r.sunIcon.setAttribute("href", `#i-${kindOfSun}`);
    r.sun.textContent = fmt.hm(at * 1000);

    const [rgb, alpha] = GLOW[kind];
    card.style.setProperty("--glow", rgb);
    card.style.setProperty("--glow-alpha", alpha);
  }

  async function refresh() {
    let next = REFRESH_MS;
    try {
      const reply = await fetchJSON(api);
      if (!alive) return;
      weather = reply;
      lastOk = Date.now();
      store.setJSON(cacheKey, { weather, lastOk });
    } catch (err) {
      if (!alive) return;
      console.warn("Weather refresh failed:", err);
      if (!weather) lastOk = -1;
      next = RETRY_MS;
    }
    render();
    timer = setTimeout(refresh, next);
  }

  const cached = store.getJSON(cacheKey);
  if (cached && Date.now() - cached.lastOk < 6 * 3600 * 1000) ({ weather, lastOk } = cached);
  render();
  refresh();
  // Moves the sun event along and flags stale data between fetches
  const ticker = setInterval(render, 60 * 1000);

  return {
    destroy() {
      alive = false;
      clearTimeout(timer);
      clearInterval(ticker);
    },
  };
}
