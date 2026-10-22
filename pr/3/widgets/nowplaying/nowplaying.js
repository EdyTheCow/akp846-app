// What TIDAL Hi-Fi is playing, straight from its local Web API, which allows
// requests from any site. Polls once a second; the progress bar steps once a
// second too, never animates, so the USB driver only re-sends a few tiles per
// second.
// https://github.com/Mastermindzh/tidal-hifi/tree/master/src/features/api
import { make, onTap, refs } from "../../core/dom.js";
import { mmss } from "../../core/format.js";
import { HttpError, fetchJSON } from "../../core/net.js";

const POLL_MS = 1000;
const OFFLINE_POLL_MS = 5000;
// TIDAL Hi-Fi can report a new track before it has finished saving the new
// art, so the art is fetched once more this long after a change
const ART_RECHECK_MS = 3000;

const ICONS = {
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  prev: '<path d="M19 20 9 12l10-8z" fill="currentColor"/><path d="M5 19V5"/>',
  next: '<path d="m5 4 10 8-10 8z" fill="currentColor"/><path d="M19 5v14"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/>',
};

const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/**
 * The art's main vivid colour, "r g b": pixels are grouped by hue, weighted by
 * how vivid they are, and the heaviest group is averaged. Averaging the whole
 * image would blend, say, orange and purple into a dull mauve.
 */
function dominantColour(img) {
  const size = 24;
  const canvas = make("canvas", { width: size, height: size });
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, size, size);
  const { data } = g.getImageData(0, 0, size, size);
  const BUCKETS = 12;
  const sums = Array.from({ length: BUCKETS }, () => [0, 0, 0, 0]); // r, g, b, weight
  for (let i = 0; i < data.length; i += 4) {
    const [r, gr, b] = [data[i], data[i + 1], data[i + 2]];
    const max = Math.max(r, gr, b);
    const min = Math.min(r, gr, b);
    const saturation = max ? (max - min) / max : 0;
    let hue = 0;
    if (max !== min) {
      if (max === r) hue = ((gr - b) / (max - min) + 6) % 6;
      else if (max === gr) hue = (b - r) / (max - min) + 2;
      else hue = (r - gr) / (max - min) + 4;
    }
    const bucket = sums[Math.floor((hue / 6) * BUCKETS) % BUCKETS];
    const weight = 0.01 + saturation * saturation * (max / 255);
    bucket[0] += r * weight;
    bucket[1] += gr * weight;
    bucket[2] += b * weight;
    bucket[3] += weight;
  }
  const best = sums.reduce((a, b) => (b[3] > a[3] ? b : a));
  let rgb = best.slice(0, 3).map((v) => v / best[3]);
  // Keep it mid-toned, so the tint shows in dark mode and doesn't muddy light mode
  const light = (Math.max(...rgb) + Math.min(...rgb)) / 2;
  const target = Math.min(Math.max(light, 90), 170);
  rgb = rgb.map((v) => Math.round(Math.min(255, Math.max(0, v + (target - light)))));
  return rgb.join(" ");
}

export function mount(card, { settings, emit }) {
  const api = `http://${settings.host}:${settings.port}`;
  card.classList.add("nowplaying");
  card.setAttribute("aria-label", "Now playing");
  card.innerHTML = `
    <div class="backdrop" aria-hidden="true"><img data-ref="glow" alt="" hidden></div>
    <div class="art">
      <img data-ref="art" alt="" hidden>
      <span class="art-empty" data-ref="artEmpty">${svg("note")}</span>
    </div>
    <div class="info">
      <div class="from" data-ref="from"></div>
      <div class="title" data-ref="title">Loading…</div>
      <div class="artist" data-ref="artist"></div>
      <div class="meta">
        <span class="album" data-ref="album"></span>
        <span class="chip" data-ref="quality"></span>
        <span class="chip notice" data-ref="notice"></span>
      </div>
    </div>
    <div class="controls">
      <button class="np-btn like" data-ref="like" type="button" aria-label="Like">${svg("heart")}</button>
      <button class="np-btn" data-ref="prev" type="button" aria-label="Previous track">${svg("prev")}</button>
      <button class="np-btn play" data-ref="play" type="button" aria-label="Play">${svg("play")}</button>
      <button class="np-btn" data-ref="next" type="button" aria-label="Next track">${svg("next")}</button>
    </div>
    <div class="progress">
      <span class="time" data-ref="pos">0:00</span>
      <div class="bar"><div class="fill" data-ref="fill"></div></div>
      <span class="time" data-ref="dur">0:00</span>
    </div>`;
  const r = refs(card);

  let info = null; // last /current reply
  let state = "loading"; // loading | offline | idle | ok
  let artKey = "";
  let base = { reported: -1, pos: 0, at: 0 }; // for interpolating the position between polls
  let timer = 0;
  let noticeTimer = 0;
  let artTimer = 0;
  let alive = true;

  // ---------- Album art ----------
  r.art.addEventListener("load", () => {
    r.art.hidden = false;
    r.artEmpty.hidden = true;
    if (settings.tint) {
      // A blurred copy of the art behind the card, and its colour for the play button and progress
      r.glow.src = r.art.src;
      r.glow.hidden = false;
      try {
        card.style.setProperty("--tint", dominantColour(r.art));
        card.classList.add("tinted");
      } catch {
        // Loaded without CORS (see below), so its pixels can't be read
        card.style.removeProperty("--tint");
        card.classList.remove("tinted");
      }
    }
  });
  r.art.addEventListener("error", () => {
    if (!r.art.getAttribute("src")) return; // cleared on purpose
    // Until it has saved the art, TIDAL Hi-Fi redirects to TIDAL's image
    // server, which may not allow reading the pixels. Show it without the tint.
    if (r.art.crossOrigin !== null) {
      r.art.removeAttribute("crossorigin");
      r.art.src = `${r.art.src}&plain`;
      return;
    }
    r.art.hidden = true;
    r.artEmpty.hidden = false;
    r.glow.hidden = true;
    card.classList.remove("tinted");
    // TIDAL Hi-Fi may still be downloading it; try once more
    if (!r.art.src.includes("&retry")) setTimeout(() => { if (alive && r.art.src) loadArt(`${r.art.src}&retry`); }, 3000);
  });

  // Anonymous CORS, so dominantColour can read the pixels
  function loadArt(src) {
    r.art.crossOrigin = "anonymous";
    r.art.src = src;
  }

  function showArt(key) {
    clearTimeout(artTimer);
    if (!key) {
      r.art.removeAttribute("src");
      r.art.hidden = true;
      r.artEmpty.hidden = false;
      r.glow.removeAttribute("src");
      r.glow.hidden = true;
      card.style.removeProperty("--tint");
      card.classList.remove("tinted");
      return;
    }
    const src = `${api}/current/image?v=${encodeURIComponent(key)}`;
    loadArt(src);
    artTimer = setTimeout(() => { if (alive && artKey === key) loadArt(`${src}&again`); }, ART_RECHECK_MS);
  }

  // ---------- Rendering ----------
  const position = () => {
    if (!info) return 0;
    const elapsed = info.status === "playing" ? (Date.now() - base.at) / 1000 : 0;
    return Math.min(base.pos + elapsed, info.durationInSeconds || Infinity);
  };

  function render() {
    card.dataset.state = state;
    if (state === "offline" || state === "loading") {
      r.from.textContent = "";
      r.title.textContent = state === "loading" ? "Loading…" : "TIDAL Hi-Fi isn't running";
      r.artist.textContent = state === "loading" ? "" : "Open TIDAL Hi-Fi and turn on its Web API";
      r.album.textContent = state === "loading" ? "" : "In TIDAL Hi-Fi: Settings → API → Web API";
      r.quality.textContent = "";
      showArt("");
      return;
    }
    if (state === "idle") {
      r.from.textContent = "";
      r.title.textContent = "Nothing playing";
      r.artist.textContent = "Play something in TIDAL Hi-Fi";
      r.album.textContent = "";
      r.quality.textContent = "";
    } else {
      r.from.textContent = info.playingFrom ? `Playing from ${info.playingFrom}` : "";
      r.title.textContent = info.title;
      r.artist.textContent = info.artists || info.artist || "";
      r.album.textContent = info.album || "";
      r.quality.textContent = settings.showQuality ? info.audioQuality?.badgeText || info.audioQuality?.quality?.replaceAll("_", " ") || "" : "";
    }

    const playing = info?.status === "playing";
    r.play.innerHTML = svg(playing ? "pause" : "play");
    r.play.setAttribute("aria-label", playing ? "Pause" : "Play");
    r.like.classList.toggle("on", !!info?.favorite);
    r.like.setAttribute("aria-pressed", String(!!info?.favorite));

    const duration = info?.durationInSeconds || 0;
    const pos = position();
    r.pos.textContent = mmss(pos);
    r.dur.textContent = mmss(duration);
    r.fill.style.width = `${duration ? Math.min(100, (pos / duration) * 100) : 0}%`;
  }

  function notice(text) {
    clearTimeout(noticeTimer);
    r.notice.textContent = text;
    noticeTimer = setTimeout(() => { r.notice.textContent = ""; }, 8000);
  }

  // ---------- Polling ----------
  async function poll() {
    clearTimeout(timer);
    try {
      const reply = await fetchJSON(`${api}/current`, {}, 3000);
      if (!alive) return;
      info = reply;
      state = info.title ? "ok" : "idle";
      if (info.currentInSeconds !== base.reported) base = { reported: info.currentInSeconds, pos: info.currentInSeconds || 0, at: Date.now() };
      else if (info.status !== "playing") base = { ...base, pos: info.currentInSeconds || 0, at: Date.now() };
      // Not trackId: TIDAL Hi-Fi falls back to the URL of the page being browsed when
      // it can't find the track's link, so it can stay the same across tracks
      const key = state === "ok" ? [info.image || info.icon, info.title, info.artists, info.album].join("|") : "";
      if (key !== artKey) {
        artKey = key;
        showArt(key);
      }
    } catch (err) {
      if (!alive) return;
      state = "offline";
      // Not running is normal; anything else is worth a look
      if (err instanceof HttpError) console.warn("Now Playing:", err);
      info = null;
      artKey = "";
    }
    render();
    emit("playback", { playing: info?.status === "playing" });
    timer = setTimeout(poll, state === "offline" ? OFFLINE_POLL_MS : POLL_MS);
  }

  async function act(path, optimistic) {
    if (!info) return;
    optimistic?.();
    render();
    try {
      // No body, so no CORS preflight. The player routes only exist with Playback control on.
      const res = await fetch(`${api}/player/${path}`, { method: "POST", signal: AbortSignal.timeout(3000) });
      if (res.status === 404) notice("Turn on Playback control in TIDAL Hi-Fi's API settings");
      else if (!res.ok) notice(`TIDAL Hi-Fi answered ${res.status}`);
    } catch {
      notice("TIDAL Hi-Fi didn't respond");
    }
    setTimeout(() => alive && poll(), 300);
  }

  onTap(r.play, () => act("playpause", () => {
    // Freeze or restart the interpolated position along with the status
    base = { ...base, pos: position(), at: Date.now() };
    info.status = info.status === "playing" ? "paused" : "playing";
  }));
  onTap(r.prev, () => act("previous"));
  onTap(r.next, () => act("next"));
  onTap(r.like, () => act("favorite/toggle", () => { info.favorite = !info.favorite; }));

  render();
  poll();

  return {
    destroy() {
      alive = false;
      clearTimeout(timer);
      clearTimeout(noticeTimer);
      clearTimeout(artTimer);
    },
  };
}
