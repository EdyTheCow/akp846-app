// Drag and drop with pointer events, so mouse and touch work alike (the HTML
// drag and drop API doesn't do touch). With a mouse a drag starts once the
// pointer has moved a few pixels, so a click stays a click. With touch it
// starts after a long press, so a swipe still scrolls the page. Escape cancels.
const MOVE_PX = 6;
const PRESS_MS = 300;
const EDGE_PX = 64; // scroll the page when dragging this close to the top or bottom

// Once dragging, a touch must not scroll the page instead. The browser only
// lets touchmove stop scrolling when the listener was there as the finger
// came down, so it's added once, for good, and checks whether a drag is on.
let dragging = false;
addEventListener("touchmove", (ev) => { if (dragging) ev.preventDefault(); }, { passive: false });

/**
 * Makes `el` draggable. On start, begin(pointerEvent) returns a session, or
 * null to refuse:
 *   { over(x, y, elementUnderPointer), drop(), end(), ghostOf? }
 * over() runs on every move, drop() when released, end() always, last. The
 * copy that follows the pointer is of ghostOf, or of `el` itself.
 */
export function draggable(el, begin) {
  el.addEventListener("contextmenu", (ev) => {
    if (ev.pointerType !== "mouse") ev.preventDefault(); // the long press is ours
  });
  el.addEventListener("pointerdown", (down) => {
    if (down.button !== 0 || down.target.closest("button, input, select, a")) return;
    const touch = down.pointerType !== "mouse";
    let session = null;
    let ghost = null;
    let offset = null;
    let last = down;
    let timer = 0;

    const start = () => {
      session = begin(down);
      if (!session) return finish();
      const source = session.ghostOf ?? el;
      const rect = source.getBoundingClientRect();
      offset = { x: down.clientX - rect.left, y: down.clientY - rect.top };
      ghost = source.cloneNode(true);
      ghost.classList.add("drag-ghost");
      ghost.removeAttribute("id");
      Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px` });
      document.body.append(ghost);
      document.body.classList.add("dragging");
      dragging = true;
      if (touch) navigator.vibrate?.(15);
      follow(last);
    };

    const follow = (ev) => {
      ghost.style.transform = `translate(${ev.clientX - offset.x}px, ${ev.clientY - offset.y}px)`;
      session.over(ev.clientX, ev.clientY, document.elementFromPoint(ev.clientX, ev.clientY));
      if (ev.clientY < EDGE_PX) scrollBy(0, -12);
      else if (ev.clientY > innerHeight - EDGE_PX) scrollBy(0, 12);
    };

    const move = (ev) => {
      if (ev.pointerId !== down.pointerId) return;
      last = ev;
      if (session) return follow(ev);
      const moved = Math.hypot(ev.clientX - down.clientX, ev.clientY - down.clientY) > MOVE_PX;
      if (!moved) return;
      if (touch) finish(); // moved before the long press: it's a scroll
      else start();
    };

    const up = (ev) => {
      if (ev.pointerId !== down.pointerId) return;
      if (session) session.drop();
      finish();
    };

    const cancel = (ev) => {
      if (ev.type === "keydown" && ev.key !== "Escape") return;
      if (ev.pointerId !== undefined && ev.pointerId !== down.pointerId) return;
      finish();
    };

    function finish() {
      clearTimeout(timer);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", cancel);
      removeEventListener("keydown", cancel);
      ghost?.remove();
      document.body.classList.remove("dragging");
      dragging = false;
      if (session) {
        session.end();
        // Releasing over the element it started on would also click it
        const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => removeEventListener("click", swallow, { capture: true }), 0);
      }
      session = null;
    }

    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", cancel);
    addEventListener("keydown", cancel);
    if (touch) timer = setTimeout(start, PRESS_MS);
  });
}
