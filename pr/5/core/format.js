// Formatters for the configured locale and time zone. Times are always 24-hour.
export function formatters({ locale, timezone }) {
  const fmt = (opts, loc = locale) => new Intl.DateTimeFormat(loc, { timeZone: timezone, ...opts });
  const fmtHM = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const fmtSec = fmt({ second: "2-digit" });
  const fmtDate = fmt({ weekday: "long", day: "numeric", month: "long" });
  const fmtYMD = fmt({ year: "numeric", month: "numeric", day: "numeric" }, "en-GB");

  return {
    timezone,
    hm: (t) => fmtHM.format(new Date(t)),
    seconds: (t) => fmtSec.format(new Date(t)).padStart(2, "0"),
    date: (t) => fmtDate.format(new Date(t)).replace(",", ""),
    isoWeek(t) {
      const parts = Object.fromEntries(fmtYMD.formatToParts(new Date(t)).map((p) => [p.type, Number(p.value)]));
      const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
      const dow = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dow);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    },
  };
}

/** Whole degrees with a real minus sign. */
export const deg = (t) => {
  const n = Math.round(t) || 0;
  return `${n < 0 ? "−" : ""}${Math.abs(n)}°`;
};

/** 83 -> "1:23" */
export const mmss = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
