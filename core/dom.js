export const make = (tag, props) => Object.assign(document.createElement(tag), props);

/** Every [data-ref] element under `root`, by name. */
export function refs(root) {
  const out = {};
  for (const el of root.querySelectorAll("[data-ref]")) out[el.dataset.ref] = el;
  return out;
}

// Touch: act as soon as the finger lifts off a control rather than waiting for the
// browser to turn the tap into a click, which it doesn't always do for this panel.
// Mouse and keyboard use click; the click a browser may still synthesize from the
// same tap is skipped. The skip is page-wide: a control that re-renders on tap
// (the rail does) would otherwise get the click on its replacement and fire twice.
// A touch that moved further than TAP_SLOP is a swipe, not a tap.
let lastTouch = 0;
const TAP_SLOP = 30; // px, about 4 mm on the panel
export function onTap(el, handler) {
  let down = null;
  el.addEventListener("pointerdown", (ev) => { down = { x: ev.clientX, y: ev.clientY }; });
  el.addEventListener("pointerup", (ev) => {
    if (ev.pointerType === "mouse") return;
    lastTouch = Date.now();
    const moved = !down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > TAP_SLOP;
    down = null;
    if (!moved) handler(ev);
  });
  el.addEventListener("click", (ev) => {
    if (Date.now() - lastTouch < 800) return;
    handler(ev);
  });
  // Quick taps on a control shouldn't also toggle fullscreen
  el.addEventListener("dblclick", (ev) => ev.stopPropagation());
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Adds SVG <symbol>s to the page's shared sprite, once per key. */
export function defineSymbols(key, markup) {
  let sprite = document.getElementById("sprite");
  if (!sprite) {
    sprite = document.createElementNS(SVG_NS, "svg");
    sprite.id = "sprite";
    sprite.setAttribute("width", "0");
    sprite.setAttribute("height", "0");
    sprite.setAttribute("aria-hidden", "true");
    sprite.style.position = "absolute";
    sprite.append(document.createElementNS(SVG_NS, "defs"));
    document.body.prepend(sprite);
  }
  if (sprite.querySelector(`[data-symbols="${key}"]`)) return;
  const group = document.createElementNS(SVG_NS, "g");
  group.dataset.symbols = key;
  group.innerHTML = markup;
  sprite.firstChild.append(group);
}

/** A 24 x 24 line icon from path markup, drawn in the current text colour. */
export function lineIcon(markup, className = "") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  if (className) svg.setAttribute("class", className);
  svg.innerHTML = markup;
  return svg;
}
