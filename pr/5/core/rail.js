// What the rail holds on a page, in order, from the layout's rail settings: a
// button per page (the one on show highlighted) and light/dark. Navigation
// only: a widget's own controls are on its card. The screen makes these into
// working buttons; the layout editor draws the same buttons as a preview.
import { lineIcon, make } from "./dom.js";
import { ICONS } from "./icons.js";
import { widgetById } from "../widgets/registry.js";

/** The icon markup for a page's button: its own, or its first widget's. */
export function pageIcon(page) {
  if (page.icon !== "auto") return ICONS[page.icon] ?? ICONS.grid;
  return widgetById[page.widgets[0]]?.icon ?? ICONS.grid;
}

/**
 * The rail on page `index`, top to bottom:
 *   { kind: "page", page, current } | { kind: "theme" }
 * With a single page there are no page buttons.
 */
export function railItems(layout, index) {
  const items = [];
  for (const group of layout.rail.order) {
    if (group === "pages" && layout.pages.length > 1) {
      layout.pages.forEach((page, i) => {
        if (page.inRail) items.push({ kind: "page", page: i, current: i === index });
      });
    } else if (group === "theme" && layout.rail.theme) {
      items.push({ kind: "theme" });
    }
  }
  return items;
}

/** A rail button. `icon` is an <svg> or a list of them. */
export function railButton({ icon, label, ariaLabel, className = "", current = false }) {
  const button = make("button", { className: `rail-btn ${className}`.trim(), type: "button" });
  if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
  if (current) {
    button.classList.add("current");
    button.setAttribute("aria-current", "page");
  }
  button.append(...[icon].flat(), make("span", { className: "rail-label", textContent: label }));
  return button;
}

/** The light/dark button's icons; CSS shows the one for the theme it switches to. */
export const themeIcons = () => [lineIcon(ICONS.sun, "rail-icon to-light"), lineIcon(ICONS.moon, "rail-icon to-dark")];

/**
 * Fits `rail` into `room` pixels of height: icons only when asked, or when
 * the labels would make it too tall. Returns "fits", "squeezed" (labels
 * dropped to fit) or "overflows" (too tall even so).
 */
export function fitRail(rail, room, labels) {
  rail.classList.toggle("icons-only", !labels);
  if (rail.offsetHeight <= room) return "fits";
  if (labels) {
    rail.classList.add("icons-only");
    if (rail.offsetHeight <= room) return "squeezed";
  }
  return "overflows";
}
