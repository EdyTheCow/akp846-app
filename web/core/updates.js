// Keeps a screen that's left running up to date, and lets it start without
// internet. The publish workflow stamps the version into the page's
// <meta name="version"> and writes the same value to version.json; when the
// two differ, a new version is out and the page reloads. Running locally
// (version "dev") it only registers the service worker.
const CHECK_MS = 5 * 60 * 1000;

export function keepUpToDate() {
  navigator.serviceWorker?.register("sw.js").catch((err) => console.warn("No offline copy:", err.message));

  const mine = document.querySelector('meta[name="version"]')?.content;
  if (!mine || mine === "dev") return;
  setInterval(async () => {
    try {
      const res = await fetch("version.json", { cache: "no-store" });
      if (!res.ok) return;
      const { version } = await res.json();
      if (version && version !== mine) location.reload();
    } catch {} // offline: try again later
  }, CHECK_MS);
}
