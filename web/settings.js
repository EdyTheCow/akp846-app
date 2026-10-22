// The settings page. Every form is generated from the schemas in
// core/settings-schema.js and widgets/*/schema.js, so a new widget's
// settings show up here without touching this file.
import { lineIcon, make } from "./core/dom.js";
import { newItem } from "./core/fields.js";
import { loadSettings, previewNumber, saveSettings, watchSettings } from "./core/settings-client.js";
import { settingsSchema, validateSettings } from "./core/settings-schema.js";
import { widgetById } from "./widgets/registry.js";

const form = document.getElementById("form");
const statusEl = document.getElementById("status");
const noteEl = document.getElementById("note");
const saveBtn = document.getElementById("save");
const discardBtn = document.getElementById("discard");

let saved = null; // what's stored
let ownLayout = false; // the form's layout is to be saved (imported), not left as stored
let state = null; // what the form shows
let dirty = false;
let errors = [];
const openItems = new Set(); // list items unfolded, by path

const ICONS = {
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  remove: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
};

const key = (path) => path.join(".");
const get = (path) => path.reduce((obj, k) => obj?.[k], state);
function set(path, value) {
  get(path.slice(0, -1))[path.at(-1)] = value;
  changed();
}

function changed() {
  dirty = true;
  updateTitles();
  setStatus("Unsaved changes");
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
  saveBtn.disabled = !dirty;
  discardBtn.disabled = !dirty;
}

// ---------- Rendering ----------
function render() {
  const { general, widgets } = settingsSchema.fields;
  form.replaceChildren(
    section("General", null, null, general, ["general"]),
    layoutSection(),
    ...Object.entries(widgets.fields).map(([id, group]) => {
      const el = section(group.label, group.description, widgetById[id].icon, group, ["widgets", id]);
      el.id = `widget-${id}`; // the layout editor links here
      return el;
    }),
  );
  showErrors(errors);
}

// Pages are arranged in the layout editor; this only sums them up
function layoutSection() {
  const el = make("section", { className: "section layout-summary" });
  const heading = make("h2");
  heading.append(lineIcon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14M15 5v14"/>'), "Pages");
  const list = make("ul", { className: "page-summary" });
  for (const page of state.layout.pages) {
    const item = make("li");
    item.append(make("strong", { textContent: `${page.name}:` }), ` ${page.widgets.map((id) => widgetById[id]?.name ?? id).join(", ")}`);
    list.append(item);
  }
  const link = make("a", { className: "btn tonal", href: "layout.html", textContent: "Arrange pages and widgets" });
  el.append(heading, list, link);
  return el;
}

function section(title, description, icon, group, path) {
  const el = make("section", { className: "section" });
  const heading = make("h2");
  if (icon) heading.append(lineIcon(icon));
  heading.append(title);
  el.append(heading);
  if (description) el.append(make("p", { className: "description", textContent: description }));
  for (const [k, field] of Object.entries(group.fields)) {
    // A section that is just one list ("Pages") doesn't need the list's label as well
    el.append(field.type === "list" && field.label === title ? renderList(field, [...path, k], { hideLabel: true }) : renderField(field, [...path, k]));
  }
  return el;
}

const errorSlot = (path) => {
  const el = make("div", { className: "field-error" });
  el.dataset.errorFor = key(path);
  return el;
};

function renderField(field, path) {
  if (field.type === "list") return renderList(field, path);
  if (field.type === "group") {
    const wrap = make("div", { className: "item-fields" });
    for (const [k, f] of Object.entries(field.fields)) wrap.append(renderField(f, [...path, k]));
    return wrap;
  }
  const id = `f-${key(path)}`;
  const row = make("div", { className: `field ${field.type}` });
  const text = make("div", { className: "field-text" });
  text.append(make("label", { className: "field-label", htmlFor: id, textContent: field.label }));
  if (field.help) text.append(make("span", { className: "field-help", textContent: field.help }));
  row.append(text, control(field, path, id), errorSlot(path));
  return row;
}

function control(field, path, id) {
  const value = get(path);
  switch (field.type) {
    case "toggle": {
      const input = make("input", { type: "checkbox", id, className: "switch", checked: value });
      input.setAttribute("role", "switch");
      input.addEventListener("change", () => set(path, input.checked));
      return input;
    }
    case "number": {
      const input = make("input", { type: "number", id, value: value ?? "", step: field.integer ? "1" : "any", inputMode: "decimal" });
      if (field.min != null) input.min = field.min;
      if (field.max != null) input.max = field.max;
      input.addEventListener("input", () => set(path, input.value === "" ? null : Number(input.value)));
      return input;
    }
    case "select": {
      const select = make("select", { id });
      for (const o of field.options) select.append(make("option", { value: o.value, textContent: o.label, selected: o.value === value }));
      select.addEventListener("change", () => set(path, select.value));
      return select;
    }
    default: {
      const input = make("input", { type: "text", id, value: value ?? "", spellcheck: false, autocomplete: "off" });
      if (field.maxLength) input.maxLength = field.maxLength;
      input.addEventListener("input", () => set(path, input.value));
      return input;
    }
  }
}

function iconButton(name, label, onClick, disabled = false) {
  const button = make("button", { type: "button", className: "icon-btn", disabled });
  button.setAttribute("aria-label", label);
  button.title = label;
  button.append(lineIcon(ICONS[name]));
  button.addEventListener("click", (ev) => {
    ev.preventDefault(); // inside a <summary>, a click would also fold the item
    onClick();
  });
  return button;
}

function renderList(field, path, { hideLabel = false } = {}) {
  const list = get(path);
  const wrap = make("div", { className: "list" });
  const head = make("div", { className: "list-head" });
  if (!hideLabel) head.append(make("span", { className: "field-label", textContent: field.label }));
  if (field.help) head.append(make("span", { className: "field-help", textContent: field.help }));
  wrap.append(head);

  // Applies the same change to the items and to which of them are unfolded
  const restructure = (op) => () => {
    const open = list.map((_, i) => openItems.has(key([...path, i])));
    op(list, true);
    op(open, false);
    list.forEach((_, i) => openItems.delete(key([...path, i])));
    open.forEach((isOpen, i) => isOpen && openItems.add(key([...path, i])));
    changed();
    render();
  };
  const move = (i, by) => restructure((arr) => arr.splice(i + by, 0, ...arr.splice(i, 1)));
  const tools = (i) => [
    iconButton("up", "Move up", move(i, -1), i === 0),
    iconButton("down", "Move down", move(i, 1), i === list.length - 1),
    iconButton("remove", "Remove", restructure((arr) => arr.splice(i, 1)), list.length <= (field.min ?? 0)),
  ];

  const items = make("div", { className: "items" });
  list.forEach((value, i) => {
    const itemPath = [...path, i];
    if (field.item.type === "group") {
      const item = make("details", { className: "item", open: openItems.has(key(itemPath)) });
      item.addEventListener("toggle", () => {
        if (item.open) openItems.add(key(itemPath));
        else openItems.delete(key(itemPath));
      });
      const title = make("span", { className: "item-title" });
      title.dataset.titleFor = key(itemPath);
      title.dataset.titleKey = field.itemTitle ?? "";
      const summary = make("summary", { className: "item-head" });
      summary.append(title, ...tools(i));
      item.append(summary, renderField(field.item, itemPath), errorSlot(itemPath));
      items.append(item);
    } else {
      const row = make("div", { className: "row" });
      row.append(control(field.item, itemPath, `f-${key(itemPath)}`), ...tools(i));
      const wrapRow = make("div", { className: "field-row" });
      wrapRow.append(row, errorSlot(itemPath));
      items.append(wrapRow);
    }
  });
  wrap.append(items);

  const add = make("button", { type: "button", className: "btn tonal add", disabled: list.length >= (field.max ?? Infinity) });
  add.append(`Add ${field.item.type === "group" ? field.label.replace(/s$/, "").toLowerCase() : field.item.label.toLowerCase()}`);
  add.addEventListener("click", restructure((arr, isItems) => arr.push(isItems ? newItem(field) : true)));
  wrap.append(add, errorSlot(path));
  updateTitles(wrap);
  return wrap;
}

function updateTitles(root = form) {
  for (const el of root.querySelectorAll("[data-title-for]")) {
    const path = el.dataset.titleFor.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p));
    const value = get(path);
    el.textContent = (el.dataset.titleKey && value?.[el.dataset.titleKey]) || `#${path.at(-1) + 1}`;
  }
}

function showErrors(list) {
  errors = list;
  for (const el of form.querySelectorAll("[data-error-for]")) el.textContent = "";
  for (const el of form.querySelectorAll(".invalid")) el.classList.remove("invalid");
  for (const { path, message } of list) {
    // The nearest slot: the field itself, or the list or item it belongs to
    let parts = path.split(".");
    let slot = null;
    while (parts.length && !slot) {
      slot = form.querySelector(`[data-error-for="${CSS.escape(parts.join("."))}"]`);
      if (!slot) parts = parts.slice(0, -1);
    }
    if (!slot) continue;
    const rest = path.slice(parts.join(".").length + 1);
    const text = (rest ? `${rest} ${message}` : message).replace(/^\w/, (c) => c.toUpperCase());
    slot.textContent = slot.textContent ? `${slot.textContent} · ${text}` : text;
    slot.closest(".field")?.classList.add("invalid");
    for (let item = slot.closest("details"); item; item = item.parentElement.closest("details")) item.open = true;
  }
}


// ---------- Saving ----------
function adopt(settings) {
  saved = settings;
  state = structuredClone(settings);
  dirty = false;
  ownLayout = false;
  errors = [];
  render();
}

function save() {
  const local = validateSettings(state).errors;
  if (local.length) {
    showErrors(local);
    setStatus(`${local.length} ${local.length === 1 ? "setting needs" : "settings need"} fixing`, true);
    form.querySelector(".field-error:not(:empty)")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  // The layout editor owns the layout, unless one was imported here
  const result = saveSettings(ownLayout ? state : { ...state, layout: loadSettings().settings.layout });
  if (result.errors) {
    showErrors(result.errors);
    setStatus(`Couldn't save: ${result.errors.map((e) => `${e.path} ${e.message}`.trim()).join("; ")}`, true);
    return;
  }
  adopt(result.settings);
  setStatus("Saved");
}

// ---------- Export and import ----------
document.getElementById("export").addEventListener("click", () => {
  const blob = new Blob([`${JSON.stringify(saved, null, 2)}\n`], { type: "application/json" });
  const link = make("a", { href: URL.createObjectURL(blob), download: "akp846-settings.json" });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

const importFile = document.getElementById("import-file");
document.getElementById("import").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  importFile.value = "";
  if (!file) return;
  let input;
  try {
    input = JSON.parse(await file.text());
  } catch {
    setStatus(`${file.name} isn't a settings file`, true);
    return;
  }
  // Into the form only, so it can be checked before Save
  const { settings, errors: problems } = validateSettings(input);
  state = settings;
  ownLayout = true;
  errors = [];
  render();
  changed();
  setStatus(problems.length
    ? `Imported ${file.name}; ${problems.length} ${problems.length === 1 ? "setting wasn't" : "settings weren't"} valid and use the default. Check, then Save`
    : `Imported ${file.name}. Check, then Save`, problems.length > 0);
});

saveBtn.addEventListener("click", save);
discardBtn.addEventListener("click", () => {
  adopt(saved);
  setStatus("Changes discarded");
});
addEventListener("beforeunload", (ev) => {
  if (dirty) ev.preventDefault();
});

// ---------- Start ----------
noteEl.textContent = previewNumber
  ? `Preview of pull request #${previewNumber}: these settings are separate from the main screen's, and started as a copy of them.`
  : "Saved in this browser. A screen open in the same browser updates as soon as you save. To move them to another browser, Export here and Import there.";
const loaded = loadSettings();
adopt(loaded.settings);
if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
setStatus(loaded.errors.length ? `${loaded.errors.length} stored ${loaded.errors.length === 1 ? "setting wasn't" : "settings weren't"} valid and use the default` : "", loaded.errors.length > 0);
const exceptLayout = (s) => JSON.stringify({ ...s, layout: null });
watchSettings((next) => {
  if (JSON.stringify(next) === JSON.stringify(saved)) return;
  if (dirty) {
    const others = exceptLayout(next) !== exceptLayout(saved);
    saved = next;
    if (!ownLayout) {
      state.layout = structuredClone(next.layout);
      form.querySelector(".layout-summary")?.replaceWith(layoutSection());
    }
    if (others) setStatus("Changed in another tab: Save overwrites, Discard loads it", true);
  } else {
    adopt(next);
    setStatus("Updated from another tab");
  }
});
