// The whole settings document: General, Pages, and one section per widget.
// Shared by the screen and the settings page; no DOM here.
import { defaultsOf, validate } from "./fields.js";
import { ICON_NAMES } from "./icons.js";
import { widgets } from "../widgets/registry.js";

export const SETTINGS_VERSION = 1;

const validTimeZone = (tz) => {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { return "isn't a known time zone (e.g. Europe/Oslo)"; }
};
const validLocale = (locale) => {
  try { Intl.getCanonicalLocales(locale); } catch { return "isn't a valid language tag (e.g. en-GB, nb-NO)"; }
};

export const general = {
  type: "group",
  label: "General",
  fields: {
    placeName: { type: "text", label: "Place name", help: "Used in screen-reader labels.", default: "Oslo", maxLength: 40 },
    latitude: { type: "number", label: "Latitude", default: 59.9133, min: -90, max: 90 },
    longitude: { type: "number", label: "Longitude", default: 10.7389, min: -180, max: 180 },
    timezone: { type: "text", label: "Time zone", help: "IANA name, e.g. Europe/Oslo.", default: "Europe/Oslo", check: validTimeZone },
    locale: { type: "text", label: "Date language", help: "How dates are written, e.g. en-GB or nb-NO.", default: "en-GB", check: validLocale },
    theme: {
      type: "select",
      label: "Theme",
      help: "The rail's theme button overrides this until the next automatic change.",
      default: "system",
      options: [
        { value: "system", label: "Follow the system" },
        { value: "sun", label: "Follow sunrise and sunset" },
        { value: "light", label: "Always light" },
        { value: "dark", label: "Always dark" },
      ],
    },
  },
};

/** The rail's groups of buttons, which are arranged as a whole. */
export const RAIL_GROUPS = [
  { value: "pages", label: "Page buttons" },
  { value: "theme", label: "Light/dark" },
];

export const layout = {
  type: "group",
  label: "Pages",
  fields: {
    pages: {
      type: "list",
      label: "Pages",
      help: "The rail's page button steps through these. Up to 4 widgets fit on a page.",
      itemTitle: "name",
      min: 1,
      max: 6,
      newItem: { name: "Page", widgets: ["clock"] },
      item: {
        type: "group",
        fields: {
          name: { type: "text", label: "Name", help: "Shown on the page button.", default: "Page", maxLength: 12 },
          icon: {
            type: "select", label: "Icon", help: "On the page's rail button. Automatic uses the first widget's.", default: "auto",
            options: [{ value: "auto", label: "Automatic" }, ...ICON_NAMES.map((name) => ({ value: name, label: name }))],
          },
          inRail: { type: "toggle", label: "Button in the rail", default: true },
          widgets: {
            type: "list",
            label: "Widgets, left to right",
            min: 1,
            max: 4,
            unique: true,
            newItem: "clock",
            item: { type: "select", label: "Widget", default: "clock", options: widgets.map((w) => ({ value: w.id, label: w.name })) },
            default: ["clock"],
          },
        },
      },
      default: [
        { name: "Home", icon: "home", inRail: true, widgets: ["clock", "weather", "transit"] },
        { name: "Music", icon: "music", inRail: true, widgets: ["nowplaying"] },
      ],
    },
    rail: {
      type: "group",
      label: "Rail",
      fields: {
        order: {
          type: "list", label: "Order, top to bottom", min: 2, max: 2, unique: true,
          item: { type: "select", label: "Group", default: "pages", options: RAIL_GROUPS },
          default: RAIL_GROUPS.map((g) => g.value),
        },
        labels: { type: "toggle", label: "Labels under the icons", help: "Without them about 6 buttons fit instead of 4.", default: true },
        theme: { type: "toggle", label: "Light/dark button", default: true },
        swipe: { type: "toggle", label: "Swipe to change page", help: "Left or right on the screen goes to the next or previous page.", default: true },
      },
    },
  },
};

export const settingsSchema = {
  type: "group",
  fields: {
    general,
    layout,
    widgets: {
      type: "group",
      fields: Object.fromEntries(widgets.map((w) => [w.id, {
        type: "group", label: w.name, description: w.description, fields: w.settings,
      }])),
    },
  },
};

// Through validate, so the defaults have the same shape (key order included) as
// stored settings once loaded, and compare equal as JSON
export const defaultSettings = () => validateSettings({ version: SETTINGS_VERSION, ...defaultsOf(settingsSchema) }).settings;

/** Brings settings saved by an earlier version up to date, before they're validated. */
function upgrade(input) {
  // The rail's "widget buttons" group went when Departures got its route buttons on the card
  const order = input?.layout?.rail?.order;
  if (!Array.isArray(order) || !order.includes("widgets")) return input;
  return { ...input, layout: { ...input.layout, rail: { ...input.layout.rail, order: order.filter((g) => g !== "widgets") } } };
}

/** Returns { settings, errors }; settings is always complete and usable. */
export function validateSettings(input) {
  const errors = [];
  const settings = validate(settingsSchema, upgrade(input), [], errors);
  return { settings: { version: SETTINGS_VERSION, ...settings }, errors };
}
