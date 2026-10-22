export default {
  id: "nowplaying",
  name: "Now Playing",
  description: "What TIDAL Hi-Fi is playing, with playback controls. Needs TIDAL Hi-Fi's Web API (Settings → API).",
  width: "fill",
  icon: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  settings: {
    host: {
      type: "text", label: "TIDAL Hi-Fi API host", help: "Where TIDAL Hi-Fi's Web API listens; 127.0.0.1 unless you changed it.",
      default: "127.0.0.1", pattern: /^[a-z0-9.-]+$|^\[[0-9a-f:]+\]$/i, patternMessage: "must be a host name or IP address",
    },
    port: { type: "number", label: "TIDAL Hi-Fi API port", default: 47836, min: 1, max: 65535, integer: true },
    autoShow: { type: "toggle", label: "Switch to this page when music starts", default: true },
    returnAfterMinutes: {
      type: "number", label: "Switch back after paused for (minutes)", default: 5, min: 1, max: 240, integer: true,
    },
    showQuality: { type: "toggle", label: "Show audio quality", help: "e.g. 24-bit 96kHz, when TIDAL reports it.", default: true },
    tint: {
      type: "toggle", label: "Colour the card from the album art",
      help: "A blurred copy of the art behind the card, and its main colour on the play button and progress bar.", default: true,
    },
  },
};
