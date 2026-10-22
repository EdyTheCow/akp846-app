// Light / dark. The setting picks the automatic theme; the rail's button sets
// an override that lasts until the automatic theme next changes by itself (the
// next sunrise or sunset, a system switch) or the setting is changed.
import { store } from "./store.js";
import { daylight } from "./sun.js";

const OVERRIDE_KEY = "theme-override";
const systemLight = matchMedia("(prefers-color-scheme: light)");

/** The theme the setting asks for right now, and when that next changes (ms or null). */
function automatic(general, now = Date.now()) {
  switch (general.theme) {
    case "light":
    case "dark":
      return { theme: general.theme, next: null };
    case "sun": {
      const { day, next } = daylight(now, general.latitude, general.longitude);
      return { theme: day ? "light" : "dark", next };
    }
    default:
      return { theme: systemLight.matches ? "light" : "dark", next: null };
  }
}

export function createTheme(onChange = () => {}) {
  const forced = new URLSearchParams(location.search).get("theme");
  let general = null;
  let timer = 0;

  function apply() {
    clearTimeout(timer);
    if (!general) return;
    const auto = automatic(general);
    let theme = auto.theme;
    const override = store.getJSON(OVERRIDE_KEY);
    if (override?.mode === general.theme && override.base === auto.theme) theme = override.theme;
    else if (override) store.remove(OVERRIDE_KEY);
    if (["light", "dark"].includes(forced)) theme = forced;

    document.documentElement.dataset.theme = theme;
    store.set("theme-last", theme);
    onChange(theme);
    // Re-check at the next sunrise/sunset (and at least hourly, in case the clock jumps)
    const wait = auto.next ? Math.min(auto.next - Date.now() + 1000, 3600000) : 3600000;
    timer = setTimeout(apply, Math.max(wait, 1000));
  }

  systemLight.addEventListener("change", apply);

  return {
    current: () => document.documentElement.dataset.theme,
    setSettings(next) {
      general = next;
      apply();
    },
    toggle() {
      const auto = automatic(general);
      const theme = this.current() === "light" ? "dark" : "light";
      if (theme === auto.theme) store.remove(OVERRIDE_KEY);
      else store.setJSON(OVERRIDE_KEY, { theme, mode: general.theme, base: auto.theme });
      apply();
    },
  };
}
