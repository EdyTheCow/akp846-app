import { ICONS } from "../../core/icons.js";

export default {
  id: "clock",
  name: "Clock",
  description: "Time, date and week number.",
  // Column width on the 1920 x 440 base layout, in u (1% of the height); "fill" takes what's left
  width: 111,
  icon: ICONS.clock,
  settings: {
    showSeconds: { type: "toggle", label: "Show seconds", default: true },
    showWeek: { type: "toggle", label: "Show week number", default: true },
  },
};
