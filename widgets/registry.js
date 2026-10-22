// Every widget, in the order the settings page lists them. To add a widget,
// create widgets/<id>/schema.js, <id>.js and <id>.css and add its schema here.
import clock from "./clock/schema.js";
import weather from "./weather/schema.js";
import transit from "./transit/schema.js";
import nowplaying from "./nowplaying/schema.js";

export const widgets = [clock, weather, transit, nowplaying];
export const widgetById = Object.fromEntries(widgets.map((w) => [w.id, w]));
