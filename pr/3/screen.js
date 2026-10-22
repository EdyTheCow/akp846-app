// The screen: lays out the widgets of each page from the settings, runs the
// control rail, and rebuilds itself whenever the settings change.
import { lineIcon, make, onTap } from "./core/dom.js";
import { formatters } from "./core/format.js";
import { loadSettings, watchSettings } from "./core/settings-client.js";
import { store } from "./core/store.js";
import { createTheme } from "./core/theme.js";
import { keepUpToDate } from "./core/updates.js";
import { columnFor, widgetById } from "./widgets/registry.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

let settings = null;
let settingsText = "";
let pageIndex = Number(params.get("page") ?? store.get("page") ?? 0) || 0;
let mounted = []; // { page, id, instance }
const modules = new Map();

const theme = createTheme(() => renderRail());

// ---------- Widget code and styles, loaded once per widget ----------
function loadWidget(id) {
  if (!modules.has(id)) {
    const css = new Promise((resolve) => {
      const link = make("link", { rel: "stylesheet", href: `widgets/${id}/${id}.css` });
      link.onload = link.onerror = resolve;
      document.head.append(link);
    });
    modules.set(id, Promise.all([import(`./widgets/${id}/${id}.js`), css]).then(([mod]) => mod));
  }
  return modules.get(id);
}

// ---------- Build ----------
async function build(next) {
  for (const m of mounted) m.instance.destroy?.();
  mounted = [];
  settings = next;
  settingsText = JSON.stringify(next);
  theme.setSettings(next.general);

  const pages = next.layout.pages;
  const ids = [...new Set(pages.flatMap((p) => p.widgets))].filter((id) => widgetById[id]);
  const loaded = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await loadWidget(id)])));
  if (next !== settings) return; // newer settings arrived while loading

  const fmt = formatters(next.general);
  const pageEls = pages.map((page, index) => {
    const el = make("section", { className: "page", hidden: true });
    el.setAttribute("aria-label", page.name);
    const present = page.widgets.filter((id) => loaded[id]);
    el.style.gridTemplateColumns = present.map((id) => columnFor(widgetById[id].width)).join(" ");
    for (const id of present) {
      const card = make("section", { className: "card" });
      el.append(card);
      const ctx = {
        settings: next.widgets[id],
        general: next.general,
        fmt,
        params,
        refreshRail: () => renderRail(),
        emit: (type, detail) => onWidgetEvent(type, detail),
        isVisible: () => index === pageIndex,
      };
      mounted.push({ page: index, id, instance: loaded[id].mount(card, ctx) ?? {} });
    }
    return el;
  });
  $("pages").replaceChildren(...pageEls);
  showPage(Math.min(pageIndex, pages.length - 1));
}

function showPage(index) {
  pageIndex = index;
  store.set("page", String(index));
  [...$("pages").children].forEach((el, i) => { el.hidden = i !== index; });
  if (index === musicPage() && !playing) pausedSince = Date.now();
  for (const m of mounted) m.instance.visibilityChanged?.(m.page === index);
  renderRail();
}

// ---------- Rail ----------
function railButton({ icon, label, ariaLabel, onTap: handler, className = "" }) {
  const button = make("button", { className: `rail-btn ${className}`.trim(), type: "button" });
  if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
  button.append(...(Array.isArray(icon) ? icon : [icon]), make("span", { className: "rail-label", textContent: label }));
  onTap(button, handler);
  return button;
}

function themeButton() {
  const next = theme.current() === "light" ? "dark" : "light";
  return railButton({
    className: "theme-btn",
    icon: [
      lineIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', "rail-icon to-light"),
      lineIcon('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', "rail-icon to-dark"),
    ],
    label: next === "light" ? "Light" : "Dark",
    ariaLabel: `Switch to ${next} mode`,
    onTap: () => theme.toggle(),
  });
}

function renderRail() {
  if (!settings) return;
  const pages = settings.layout.pages;
  const buttons = [];
  if (pages.length > 1) {
    const next = (pageIndex + 1) % pages.length;
    const first = widgetById[pages[next].widgets[0]];
    buttons.push(railButton({
      icon: lineIcon(first?.icon ?? "", "rail-icon"),
      label: pages[next].name,
      ariaLabel: `Show the ${pages[next].name} page`,
      onTap: () => { returnTo = null; showPage(next); },
    }));
  }
  buttons.push(themeButton());
  for (const m of mounted) {
    if (m.page !== pageIndex) continue;
    for (const action of m.instance.railActions?.() ?? []) buttons.push(railButton(action));
  }
  $("rail").replaceChildren(...buttons);
}

// ---------- Now Playing: show its page when music starts, leave once paused a while ----------
let playing = false;
let pausedSince = null;
let returnTo = null;

const musicPage = () => settings?.layout.pages.findIndex((p) => p.widgets.includes("nowplaying")) ?? -1;

function onWidgetEvent(type, detail) {
  if (type !== "playback") return;
  const music = musicPage();
  const opts = settings.widgets.nowplaying;
  if (detail.playing && !playing) {
    pausedSince = null;
    if (opts.autoShow && music >= 0 && pageIndex !== music) {
      returnTo = pageIndex;
      showPage(music);
    }
  } else if (!detail.playing && (playing || pausedSince === null)) {
    pausedSince = Date.now();
  }
  playing = detail.playing;
}

setInterval(() => {
  const music = musicPage();
  if (!settings || playing || pausedSince === null || music < 0 || pageIndex !== music) return;
  const opts = settings.widgets.nowplaying;
  if (!opts.autoShow || Date.now() - pausedSince < opts.returnAfterMinutes * 60000) return;
  const back = returnTo ?? settings.layout.pages.findIndex((p, i) => i !== music);
  returnTo = null;
  if (back >= 0) showPage(back);
}, 15000);

// ---------- Screen behaviour ----------
// Hide the cursor when idle; double-click / double-tap toggles fullscreen
let idleTimer = 0;
addEventListener("pointermove", () => {
  document.body.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add("idle"), 3000);
});
addEventListener("dblclick", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});

// ?debug: log touch / pointer / click events, to check that taps reach the page
if (params.has("debug")) {
  const log = make("pre", { className: "debug-log", textContent: "debug: waiting for input…" });
  document.body.append(log);
  const lines = [];
  const note = (ev) => {
    const point = ev.touches?.[0] ?? ev.changedTouches?.[0] ?? ev;
    const x = Math.round(point.clientX), y = Math.round(point.clientY);
    const t = ev.target;
    const name = t.id || t.getAttribute?.("class") || t.tagName;
    lines.unshift(`${new Date().toLocaleTimeString("en-GB")}  ${ev.type}${ev.pointerType ? ` (${ev.pointerType})` : ""}  ${x},${y}  on ${name}`);
    lines.length = Math.min(lines.length, 8);
    log.textContent = `debug: ${innerWidth}x${innerHeight}\n${lines.join("\n")}`;
    if (ev.type === "pointerdown" || ev.type === "touchstart") {
      const dot = make("i", { className: "debug-dot" });
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      document.body.append(dot);
      setTimeout(() => dot.remove(), 1000);
    }
  };
  for (const type of ["touchstart", "touchend", "touchcancel", "pointerdown", "pointerup", "pointercancel", "click"]) {
    addEventListener(type, note, { capture: true, passive: true });
  }
}

// ---------- Start ----------
keepUpToDate();
const { settings: initial, errors } = loadSettings();
for (const e of errors) console.warn(`Settings: ${e.path || "(root)"} ${e.message}; using the default`);
try {
  await build(initial);
} catch (err) {
  console.error(err);
  $("pages").replaceChildren(make("p", { className: "fatal", textContent: `Couldn't start the screen: ${err.message}` }));
}
watchSettings((next) => {
  if (JSON.stringify(next) !== settingsText) build(next).catch((err) => console.error(err));
});
