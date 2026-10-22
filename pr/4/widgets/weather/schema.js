import { ICONS } from "../../core/icons.js";

export default {
  id: "weather",
  name: "Weather",
  description: "Current conditions from Open-Meteo for the location under General.",
  width: 139,
  icon: ICONS.cloud,
  settings: {
    model: {
      type: "select",
      label: "Forecast model",
      help: "MET Norway's model is the most accurate in the Nordics; elsewhere use Best match.",
      default: "metno_seamless",
      options: [
        { value: "metno_seamless", label: "MET Norway (Nordics)" },
        { value: "best_match", label: "Best match (worldwide)" },
      ],
    },
  },
};
