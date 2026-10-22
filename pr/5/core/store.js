// localStorage, with every key prefixed. Holds the settings (see
// settings-client.js) and small UI state and caches: the selected route, the
// last weather reply.
const PREFIX = "akp846-";

export const store = {
  fullKey: (key) => PREFIX + key,
  get(key) {
    try { return localStorage.getItem(PREFIX + key); } catch { return null; }
  },
  /** Returns false when the browser refused (private window, storage full). */
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch {}
  },
  getJSON(key) {
    try { return JSON.parse(this.get(key) || "null"); } catch { return null; }
  },
  setJSON(key, value) {
    return this.set(key, JSON.stringify(value));
  },
};
