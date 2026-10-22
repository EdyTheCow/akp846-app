import { ICONS } from "../../core/icons.js";

const MODES = [
  { value: "metro", label: "Metro (T-bane)" },
  { value: "bus", label: "Bus" },
  { value: "tram", label: "Tram" },
  { value: "rail", label: "Train" },
  { value: "water", label: "Ferry" },
  { value: "coach", label: "Coach" },
];

const route = {
  type: "group",
  fields: {
    label: { type: "text", label: "Button label", help: "Shown on the rail button that switches to this route.", default: "", maxLength: 12 },
    name: { type: "text", label: "Title", help: "Shown at the top of the card.", default: "", maxLength: 40 },
    icon: {
      type: "select", label: "Icon", default: "bus",
      options: [{ value: "train", label: "Train" }, { value: "bus", label: "Bus" }],
    },
    mode: { type: "select", label: "Transport mode", default: "bus", options: MODES },
    fromKind: {
      type: "select", label: "Departs from", default: "stopPlace",
      options: [{ value: "stopPlace", label: "Whole stop (StopPlace)" }, { value: "quay", label: "One platform (Quay)" }],
    },
    fromId: {
      type: "text", label: "Stop or platform ID",
      help: "From stoppested.entur.org, e.g. NSR:StopPlace:59705 or NSR:Quay:11345.",
      default: "", pattern: /^NSR:(StopPlace|Quay):\d+$/, patternMessage: "must look like NSR:StopPlace:123 or NSR:Quay:123",
    },
    dest: {
      type: "text", label: "Destination stop ID",
      help: "Departures are kept only if they call here afterwards.",
      default: "", pattern: /^NSR:StopPlace:\d+$/, patternMessage: "must look like NSR:StopPlace:123",
    },
    line: { type: "text", label: "Line (fallback badge)", help: "Used until live data names the line.", default: "", maxLength: 6 },
    colour: {
      type: "text", label: "Line colour (fallback)", help: "Hex without #, e.g. EC700C.",
      default: "E60000", pattern: /^[0-9a-f]{6}$/i, patternMessage: "must be a 6-digit hex colour, e.g. EC700C",
    },
  },
};

export default {
  id: "transit",
  name: "Departures",
  description: "Live departures from Entur (all of Norway). Several routes are switched from the rail.",
  width: "fill",
  icon: ICONS.train,
  settings: {
    clientName: {
      type: "text", label: "Entur client name",
      help: "Entur asks every app to identify itself as <company>-<application>, e.g. yourname-akp846-screen.",
      default: "akp846-screen", pattern: /^[\w.-]{3,80}$/, patternMessage: "use letters, digits, dots, dashes or underscores (3-80)",
    },
    routes: {
      type: "list",
      label: "Routes",
      itemTitle: "name",
      min: 1,
      max: 6,
      item: route,
      newItem: { label: "Route", name: "New route", icon: "bus", mode: "bus", fromKind: "stopPlace", fromId: "", dest: "", line: "", colour: "E60000" },
      default: [
        {
          label: "T-bane", name: "Sognsvann → Tåsen", icon: "train", mode: "metro", line: "5", colour: "EC700C",
          fromKind: "stopPlace", fromId: "NSR:StopPlace:59705", dest: "NSR:StopPlace:59573",
        },
        {
          label: "Bus", name: "Tåsen → Sagene", icon: "bus", mode: "bus", line: "34", colour: "E60000",
          fromKind: "quay", fromId: "NSR:Quay:11345", dest: "NSR:StopPlace:59894",
        },
      ],
    },
  },
  // The rail button it adds, for the layout editor's preview: the next route's, when there are several
  railButtons: (settings) => (settings.routes.length < 2 ? [] : [{ icon: ICONS[settings.routes[1].icon], label: settings.routes[1].label }]),
};
