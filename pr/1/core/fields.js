// Settings field types: defaults and validation for the screen and the
// settings page, and the settings page's form generation. Plain data and pure
// functions only, so it never touches the DOM.
//
//   toggle   true / false
//   text     { pattern, patternMessage, maxLength, check(value) -> message? }
//   number   { min, max, integer }
//   select   { options: [{ value, label }] }
//   group    { fields: { key: field } }          an object
//   list     { item: field, min, max, unique }   an array; item is a group or a scalar field

export const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function defaultsOf(field) {
  if (field.type === "group") {
    return Object.fromEntries(Object.entries(field.fields).map(([key, f]) => [key, defaultsOf(f)]));
  }
  // structuredClone keeps list defaults from being shared between documents
  return structuredClone(field.default);
}

// A new, empty-ish entry for a list: the item's own defaults
export const newItem = (list) => list.newItem ? structuredClone(list.newItem) : defaultsOf(list.item);

const pathName = (path) => path.join(".");

/**
 * Checks `value` against `field` and returns the cleaned value.
 * Problems are pushed onto `errors` as { path, message }. Missing values take
 * the default; a wrong value is replaced by the default too, so the result is
 * always usable even when errors were reported (the caller decides whether
 * errors are fatal: saving refuses, loading falls back to the defaults).
 */
export function validate(field, value, path = [], errors = []) {
  const fail = (message) => {
    errors.push({ path: pathName(path), message });
    return defaultsOf(field);
  };
  if (value === undefined) return defaultsOf(field);

  switch (field.type) {
    case "group": {
      if (!isObject(value)) return fail("must be an object");
      const out = {};
      for (const [key, f] of Object.entries(field.fields)) out[key] = validate(f, value[key], [...path, key], errors);
      return out;
    }
    case "list": {
      if (!Array.isArray(value)) return fail("must be a list");
      const items = value.map((item, i) => validate(field.item, item, [...path, i], errors));
      if (field.min != null && items.length < field.min) fail(`needs at least ${field.min} ${field.min === 1 ? "entry" : "entries"}`);
      if (field.max != null && items.length > field.max) return fail(`can have at most ${field.max} entries`);
      if (field.unique && new Set(items).size !== items.length) fail("has the same entry twice");
      return items.length < (field.min ?? 0) ? defaultsOf(field) : items;
    }
    case "toggle":
      return typeof value === "boolean" ? value : fail("must be on or off");
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return fail("must be a number");
      if (field.integer && !Number.isInteger(value)) return fail("must be a whole number");
      if (field.min != null && value < field.min) return fail(`must be at least ${field.min}`);
      if (field.max != null && value > field.max) return fail(`must be at most ${field.max}`);
      return value;
    }
    case "select":
      return field.options.some((o) => o.value === value) ? value
        : fail(`must be one of: ${field.options.map((o) => o.value).join(", ")}`);
    case "text": {
      if (typeof value !== "string") return fail("must be text");
      const text = value.trim();
      if (!text && !field.optional) return fail("can't be empty");
      if (field.maxLength && text.length > field.maxLength) return fail(`must be at most ${field.maxLength} characters`);
      if (text && field.pattern && !field.pattern.test(text)) return fail(field.patternMessage ?? "isn't in the right format");
      const problem = text && field.check?.(text);
      return problem ? fail(problem) : text;
    }
    default:
      throw new Error(`Unknown field type "${field.type}" at ${pathName(path)}`);
  }
}
