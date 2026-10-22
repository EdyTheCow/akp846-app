export default {
  id: "weather",
  name: "Weather",
  description: "Current conditions from Open-Meteo for the location under General.",
  width: 139,
  icon: '<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1A4.5 4.5 0 0 0 7 18z"/>',
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
