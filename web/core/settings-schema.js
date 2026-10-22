// The whole settings document: General, Pages, and one section per widget.
// Shared by the screen and the settings page; no DOM here.
import { defaultsOf, validate } from "./fields.js";
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
    placeName: { type: "text", label: "Place name", help: "Used in the page title and screen-reader labels.", default: "Oslo", maxLength: 40 },
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
        { name: "Home", widgets: ["clock", "weather", "transit"] },
        { name: "Music", widgets: ["nowplaying"] },
      ],
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

export const defaultSettings = () => ({ version: SETTINGS_VERSION, ...defaultsOf(settingsSchema) });

/** Returns { settings, errors }; settings is always complete and usable. */
export function validateSettings(input) {
  const errors = [];
  const settings = validate(settingsSchema, input, [], errors);
  return { settings: { version: SETTINGS_VERSION, ...settings }, errors };
}
