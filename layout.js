// The layout editor: which widgets are on which page, in what order, and the
// order of the pages. Each page is drawn to scale, as on the keyboard's
// screen. Widgets are dragged from the library onto a page, along a page,
// between pages, or back to the library to take them off; every move has a
// button too.
import { lineIcon, make } from "./core/dom.js";
import { draggable } from "./core/drag.js";
import { loadSettings, previewNumber, saveSettings, watchSettings } from "./core/settings-client.js";
import { layout as layoutSchema } from "./core/settings-schema.js";
import { columnFor, widgetById, widgets } from "./widgets/registry.js";

const pagesField = layoutSchema.fields.pages;
const MAX_PAGES = pagesField.max;
const MAX_WIDGETS = pagesField.item.fields.widgets.max;
const NAME_LENGTH = pagesField.item.fields.name.maxLength;

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const saveBtn = $("save");
const discardBtn = $("discard");

let saved = null; // the stored pages
let pages = null; // what the editor shows: [{ name, widgets: [id, …] }]
let selected = 0; // the page a tapped library widget goes to
let dirty = false;
let showProblems = false; // after a Save that was refused

const ICONS = {
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  remove: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3.2"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
};

const pageName = (i) => pages[i].name.trim() || `Page ${i + 1}`;

// ---------- Changes ----------
function changed() {
  dirty = JSON.stringify(pages) !== JSON.stringify(saved);
  render();
  setStatus(dirty ? "Unsaved changes" : "");
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
  saveBtn.disabled = !dirty;
  discardBtn.disabled = !dirty;
}

/** Why `id` can't go onto page `p` (coming from page `from`, or the library when null). */
function refusal(p, id, from) {
  if (from === p) return null;
  if (pages[p].widgets.includes(id)) return `${widgetById[id].name} is already on ${pageName(p)}`;
  if (pages[p].widgets.length >= MAX_WIDGETS) return `${pageName(p)} is full: ${MAX_WIDGETS} widgets at most`;
  return null;
}

function addWidget(p, id) {
  const problem = refusal(p, id, null);
  if (problem) return setStatus(problem, true);
  pages[p].widgets.push(id);
  changed();
}

function moveWidget(p, i, by) {
  const list = pages[p].widgets;
  list.splice(i + by, 0, ...list.splice(i, 1));
  changed();
}

function removeWidget(p, i) {
  pages[p].widgets.splice(i, 1);
  changed();
}

/** Reorders the pages, keeping the same page selected. */
function reorderPages(op) {
  const current = pages[selected];
  op();
  selected = Math.max(0, pages.indexOf(current));
  changed();
}

function addPage() {
  const names = new Set(pages.map((p) => p.name));
  let n = pages.length + 1;
  while (names.has(`Page ${n}`)) n++;
  pages.push({ name: `Page ${n}`, widgets: [] });
  selected = pages.length - 1;
  changed();
  $("pages").lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/** Problems that stop a save, by page index. */
function problems() {
  const out = new Map();
  pages.forEach((page, i) => {
    const list = [];
    if (!page.name.trim()) list.push("Give the page a name.");
    if (!page.widgets.length) list.push("Add at least one widget.");
    if (list.length) out.set(i, list.join(" "));
  });
  return out;
}

// ---------- Rendering ----------
function iconButton(name, label, onClick, disabled = false) {
  const button = make("button", { type: "button", className: "icon-btn", disabled, title: label });
  button.setAttribute("aria-label", label);
  button.append(lineIcon(ICONS[name]));
  button.addEventListener("click", onClick);
  return button;
}

function render() {
  renderLibrary();
  renderPages();
}

function renderLibrary() {
  $("library-help").replaceChildren(
    "Drag a widget onto a page, or tap it to add it to ",
    make("strong", { textContent: pageName(selected) }),
    " (tap a page to choose it). To take a widget off a page, drag it back here.",
  );
  $("library").replaceChildren(...widgets.map((w) => {
    const used = pages.flatMap((page, i) => (page.widgets.includes(w.id) ? [pageName(i)] : []));
    const card = make("div", { className: "library-card", tabIndex: 0 });
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Add ${w.name} to ${pageName(selected)}`);
    card.dataset.widget = w.id;
    const text = make("div", { className: "library-text" });
    text.append(
      make("span", { className: "library-name", textContent: w.name }),
      make("span", { className: "library-description", textContent: w.description }),
      make("span", {
        className: "library-meta",
        textContent: `${w.width === "fill" ? "Takes the space left" : "Fixed width"} · ${used.length ? `On ${used.join(", ")}` : "Not on a page"}`,
      }),
    );
    card.append(lineIcon(w.icon, "library-icon"), text);
    card.addEventListener("click", () => addWidget(selected, w.id));
    card.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      addWidget(selected, w.id);
    });
    draggable(card, widgetDrag({ id: w.id, page: null, index: -1, el: card }));
    return card;
  }));
}

function renderPages() {
  const issues = showProblems ? problems() : new Map();
  $("pages").replaceChildren(...pages.map((page, p) => {
    const card = make("article", { className: `page-card${p === selected ? " selected" : ""}` });
    card.dataset.page = p;
    card.addEventListener("click", (ev) => {
      if (ev.target.closest("button, input, a") || p === selected) return;
      selected = p;
      render();
    });

    // Head: drag handle, name, count, page buttons
    const grip = make("span", { className: "grip", title: "Drag to reorder" });
    grip.append(lineIcon(ICONS.grip));
    draggable(grip, pageDrag(p, card));
    const name = make("input", { type: "text", className: "page-name", value: page.name, maxLength: NAME_LENGTH, spellcheck: false, autocomplete: "off" });
    name.setAttribute("aria-label", `Name of page ${p + 1}`);
    name.addEventListener("focus", () => {
      if (selected === p) return;
      selected = p;
      for (const el of document.querySelectorAll(".page-card")) el.classList.toggle("selected", el === card);
      renderLibrary();
    });
    name.addEventListener("input", () => {
      page.name = name.value;
      dirty = JSON.stringify(pages) !== JSON.stringify(saved);
      setStatus(dirty ? "Unsaved changes" : "");
      renderLibrary();
    });
    const head = make("header", { className: "page-head" });
    head.append(
      grip,
      make("span", { className: "page-number", textContent: `${p + 1}` }),
      name,
      make("span", { className: "page-count", textContent: `${page.widgets.length} of ${MAX_WIDGETS}` }),
      iconButton("up", "Move page up", () => reorderPages(() => pages.splice(p - 1, 0, ...pages.splice(p, 1))), p === 0),
      iconButton("down", "Move page down", () => reorderPages(() => pages.splice(p + 1, 0, ...pages.splice(p, 1))), p === pages.length - 1),
      iconButton("remove", "Delete page", () => reorderPages(() => pages.splice(p, 1)), pages.length <= 1),
    );

    // The page as it will look on the screen, with the rail on the right
    const strip = make("div", { className: "strip" });
    strip.dataset.page = p;
    strip.style.gridTemplateColumns = page.widgets.map((id) => columnFor(widgetById[id].width)).join(" ") || "minmax(0, 1fr)";
    if (!page.widgets.length) strip.append(make("div", { className: "empty-slot", textContent: "Drag a widget here" }));
    page.widgets.forEach((id, i) => strip.append(block(p, i, id)));
    const screen = make("div", { className: "screen" });
    screen.append(strip, make("div", { className: "rail-stub" }));
    const frame = make("div", { className: "screen-frame" });
    frame.append(screen);

    const error = make("p", { className: "field-error", textContent: issues.get(p) ?? "" });
    card.append(head, frame, make("p", { className: "drop-hint" }), error);
    return card;
  }));
  $("add-page").disabled = pages.length >= MAX_PAGES;
  $("add-page").textContent = pages.length >= MAX_PAGES ? `${MAX_PAGES} pages at most` : "Add page";
}

function block(p, i, id) {
  const w = widgetById[id];
  const count = pages[p].widgets.length;
  const el = make("div", { className: "block" });
  el.dataset.page = p;
  el.dataset.index = i;
  const label = make("div", { className: "block-label" });
  label.append(lineIcon(w.icon, "block-icon"), make("span", { className: "block-name", textContent: w.name }));
  const settings = make("a", { className: "icon-btn", href: `settings.html#widget-${id}`, title: `${w.name} settings` });
  settings.setAttribute("aria-label", `${w.name} settings`);
  settings.append(lineIcon(ICONS.settings));
  const tools = make("div", { className: "block-tools" });
  tools.append(
    iconButton("left", `Move ${w.name} left`, () => moveWidget(p, i, -1), i === 0),
    iconButton("right", `Move ${w.name} right`, () => moveWidget(p, i, 1), i === count - 1),
    settings,
    iconButton("close", `Take ${w.name} off ${pageName(p)}`, () => removeWidget(p, i)),
  );
  el.append(label, tools);
  draggable(el, widgetDrag({ id, page: p, index: i, el }));
  return el;
}

// ---------- Dragging ----------
function clearDropState() {
  for (const el of document.querySelectorAll(".drop-ok, .drop-no, .drop-remove")) el.classList.remove("drop-ok", "drop-no", "drop-remove");
  for (const el of document.querySelectorAll(".drop-hint")) el.textContent = "";
  document.querySelector(".drop-marker")?.remove();
}

/** Dragging a widget: from the library (page null) or from a page. */
function widgetDrag(source) {
  return () => {
    let target = null; // { page, index } | { remove: true }
    source.el.classList.add("is-dragged");
    return {
      over(x, _y, el) {
        clearDropState();
        target = null;
        const card = el?.closest(".page-card");
        if (card) {
          const p = Number(card.dataset.page);
          const problem = refusal(p, source.id, source.page);
          card.classList.add(problem ? "drop-no" : "drop-ok");
          if (problem) {
            card.querySelector(".drop-hint").textContent = problem;
            return;
          }
          // Where it goes: before the first widget whose middle is right of the pointer
          const strip = card.querySelector(".strip");
          const others = [...strip.querySelectorAll(".block")].filter((b) => b !== source.el);
          let index = others.findIndex((b) => {
            const r = b.getBoundingClientRect();
            return x < r.left + r.width / 2;
          });
          if (index < 0) index = others.length;
          target = { page: p, index };
          showMarker(strip, others, index);
        } else if (source.page !== null && el?.closest(".library")) {
          el.closest(".library").classList.add("drop-remove");
          target = { remove: true };
        }
      },
      drop() {
        if (!target) return;
        if (source.page !== null) pages[source.page].widgets.splice(source.index, 1);
        if (!target.remove) {
          pages[target.page].widgets.splice(target.index, 0, source.id);
          selected = target.page;
        }
        changed();
      },
      end() {
        clearDropState();
        source.el.classList.remove("is-dragged");
      },
    };
  };
}

/** A bar where a dropped widget would go, between `others[index - 1]` and `others[index]`. */
function showMarker(strip, others, index) {
  const box = strip.getBoundingClientRect();
  let x;
  if (!others.length) x = box.width / 2;
  else if (index === 0) x = others[0].getBoundingClientRect().left - box.left;
  else x = others[index - 1].getBoundingClientRect().right - box.left;
  const marker = make("div", { className: "drop-marker" });
  marker.style.left = `${x}px`;
  strip.append(marker);
}

/** Dragging a page by its handle, to reorder the pages. */
function pageDrag(p, card) {
  return () => {
    let to = null;
    card.classList.add("is-dragged");
    return {
      ghostOf: card,
      over(_x, y) {
        clearDropState();
        const others = [...document.querySelectorAll(".page-card")].filter((c) => c !== card);
        to = others.findIndex((c) => {
          const r = c.getBoundingClientRect();
          return y < r.top + r.height / 2;
        });
        if (to < 0) to = others.length;
        const list = $("pages").getBoundingClientRect();
        const edge = !others.length ? 0
          : to === 0 ? others[0].getBoundingClientRect().top - list.top
          : others[to - 1].getBoundingClientRect().bottom - list.top;
        const marker = make("div", { className: "drop-marker page-marker" });
        marker.style.top = `${edge}px`;
        $("pages").append(marker);
      },
      drop() {
        if (to === null || to === p) return;
        reorderPages(() => pages.splice(to, 0, ...pages.splice(p, 1)));
      },
      end() {
        clearDropState();
        card.classList.remove("is-dragged");
      },
    };
  };
}

// ---------- Saving ----------
function adopt(stored) {
  saved = structuredClone(stored.pages);
  pages = structuredClone(stored.pages);
  selected = Math.min(selected, pages.length - 1);
  dirty = false;
  showProblems = false;
  render();
}

saveBtn.addEventListener("click", () => {
  const issues = problems();
  if (issues.size) {
    showProblems = true;
    renderPages();
    setStatus(`${issues.size} ${issues.size === 1 ? "page needs" : "pages need"} fixing`, true);
    document.querySelector(".page-card .field-error:not(:empty)")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  // Only the layout is ours; the rest is as stored now, in case the settings page saved meanwhile
  const result = saveSettings({ ...loadSettings().settings, layout: { pages } });
  if (result.errors) {
    setStatus(`Couldn't save: ${result.errors.map((e) => `${e.path} ${e.message}`.trim()).join("; ")}`, true);
    return;
  }
  adopt(result.settings.layout);
  setStatus("Saved");
});

discardBtn.addEventListener("click", () => {
  adopt({ pages: saved });
  setStatus("Changes discarded");
});

$("add-page").addEventListener("click", addPage);

addEventListener("beforeunload", (ev) => {
  if (dirty) ev.preventDefault();
});

// ---------- Start ----------
$("note").textContent = previewNumber
  ? `Preview of pull request #${previewNumber}: this layout is separate from the main screen's.`
  : "Saved in this browser, like the settings. A screen open in the same browser updates as soon as you save.";
adopt(loadSettings().settings.layout);
setStatus("");
watchSettings((next) => {
  if (JSON.stringify(next.layout.pages) === JSON.stringify(saved)) return;
  if (dirty) {
    saved = structuredClone(next.layout.pages);
    setStatus("Changed in another tab: Save overwrites, Discard loads it", true);
  } else {
    adopt(next.layout);
    setStatus("Updated from another tab");
  }
});
