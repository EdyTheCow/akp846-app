// Settings live in this browser's localStorage. Other tabs of the same browser
// see a change straight away (the storage event), so saving on the settings
// page updates the screen on the keyboard.
//
// A PR preview (…/pr/<number>/) keeps its own copy, started from the main
// site's, so trying out a change can't break the settings the screen uses.
import { defaultSettings, validateSettings } from "./settings-schema.js";
import { store } from "./store.js";

const preview = location.pathname.match(/\/pr\/(\d+)\//)?.[1] ?? null;
const KEY = preview ? `settings-pr-${preview}` : "settings";

/** The PR number when this is a preview, otherwise null. */
export const previewNumber = preview;

/** Returns { settings, errors }; settings is always complete and usable. */
export function loadSettings() {
  let saved = store.getJSON(KEY);
  if (saved === null && preview) saved = store.getJSON("settings");
  if (saved === null) return { settings: defaultSettings(), errors: [] };
  return validateSettings(saved);
}

/** Validates and stores `input`. Returns { errors } without storing when anything is wrong. */
export function saveSettings(input) {
  const { settings, errors } = validateSettings(input);
  if (errors.length) return { errors };
  if (!store.setJSON(KEY, settings)) return { errors: [{ path: "", message: "this browser won't store them (private window or storage full?)" }] };
  return { settings };
}

/** Calls onSettings(settings) whenever another tab changes them. */
export function watchSettings(onSettings) {
  const listener = (ev) => {
    if (ev.key === null || ev.key === store.fullKey(KEY)) onSettings(loadSettings().settings);
  };
  addEventListener("storage", listener);
  return () => removeEventListener("storage", listener);
}
