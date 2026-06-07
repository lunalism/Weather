// ===== Circuit data + constants =====
// Shared globals consumed by weather.js, map.js, ui.js, app.js.
// Plain script (no ES modules) — script tags must load this file first.

// Tab order mirrors the 2026 WEC season (R1 → R8). `raceDate` is the
// race day in the local calendar (ISO YYYY-MM-DD) — used both to pick
// the default active circuit at boot and to render the NEXT RACE pill.
// `endDate` is the event's final calendar day; it defaults to `raceDate`
// and only needs setting for multi-day events. Le Mans runs 24h across
// two days, so endDate=06-14 keeps it active through race night and the
// auto-advance hands off to São Paulo the following day (06-15).
const CIRCUITS = [
  { id: "imola",      name: "Imola",      tab: "Imola",      full: "Autodromo Enzo e Dino Ferrari", country: "Italy",   flag: "🇮🇹", lat:  44.3439, lng:  11.7167, elev:  47,           round: 1, race: "6H Imola",      raceDate: "2026-04-19", timezone: "Europe/Rome" },
  { id: "spa",        name: "Spa",        tab: "Spa",        full: "Circuit de Spa-Francorchamps",  country: "Belgium", flag: "🇧🇪", lat:  50.4372, lng:   5.9714, elev: 401,           round: 2, race: "6H Spa",        raceDate: "2026-05-09", timezone: "Europe/Brussels" },
  { id: "lemans",     name: "Le Mans",    tab: "Le Mans",    full: "Circuit de la Sarthe",          country: "France",  flag: "🇫🇷", lat:  47.9350, lng:   0.2220, elev:  62, zoom: 13, round: 3, race: "Le Mans 24h",   raceDate: "2026-06-13", endDate: "2026-06-14", timezone: "Europe/Paris" },
  { id: "interlagos", name: "Interlagos", tab: "Interlagos", full: "Autódromo José Carlos Pace",    country: "Brazil",  flag: "🇧🇷", lat: -23.7036, lng: -46.6997, elev: 750,           round: 4, race: "6H São Paulo",  raceDate: "2026-07-12", timezone: "America/Sao_Paulo" },
  { id: "cota",       name: "COTA",       tab: "COTA",       full: "Circuit of the Americas",       country: "USA",     flag: "🇺🇸", lat:  30.1328, lng: -97.6411, elev: 163,           round: 5, race: "6H COTA",       raceDate: "2026-09-06", timezone: "America/Chicago" },
  { id: "fuji",       name: "Fuji",       tab: "Fuji",       full: "Fuji Speedway",                 country: "Japan",   flag: "🇯🇵", lat:  35.3725, lng: 138.9267, elev: 560,           round: 6, race: "6H Fuji",       raceDate: "2026-09-27", timezone: "Asia/Tokyo" },
  { id: "lusail",     name: "Lusail",     tab: "Qatar",      full: "Lusail International Circuit",  country: "Qatar",   flag: "🇶🇦", lat:  25.4900, lng:  51.4543, elev:   8,           round: 7, race: "6H Qatar",      raceDate: "2026-10-24", timezone: "Asia/Qatar" },
  { id: "bahrain",    name: "Bahrain",    tab: "Bahrain",    full: "Bahrain International Circuit", country: "Bahrain", flag: "🇧🇭", lat:  26.0325, lng:  50.5106, elev:   7,           round: 8, race: "8H Bahrain",    raceDate: "2026-11-07", timezone: "Asia/Bahrain" },
];

// Default zoom for circuits that don't override it.
// Per-circuit override: set `zoom` on the CIRCUITS entry (e.g., Le Mans = 13
// because the 13.6 km Sarthe lap doesn't fit at zoom 15).
const CIRCUIT_ZOOM = 15;

// Inline SVG icons (stroke-based, monochrome)
const ICONS = {
  thermometer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>',
  rain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 13v8M8 13v8M12 15v8M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>',
  wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2m10.6 11.4A2 2 0 1 0 14 16H2"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M12 2 L5 16 L12 13 L19 16 Z"/></svg>',
};

// Open-Meteo API
const WEATHER_API = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const AUTO_REFRESH_MS = 10 * 60 * 1000; // re-fetch the active circuit every 10 min
const SCHEDULE_CHECK_MS = 60 * 1000;    // re-pick the schedule's current circuit every minute

// Open-Meteo returns wind speed in km/h; the UI displays m/s (km/h ÷ 3.6).
// Raw km/h is kept internally for color thresholds / Beaufort / grip logic —
// only display strings are converted.
const kmhToMs = (kmh) => (kmh == null || Number.isNaN(kmh) ? null : kmh / 3.6);

const CURRENT_VARS = [
  "temperature_2m", "relative_humidity_2m", "apparent_temperature",
  "precipitation", "rain", "weather_code", "cloud_cover",
  "surface_pressure", "wind_speed_10m", "wind_direction_10m",
  "wind_gusts_10m", "is_day", "dew_point_2m",
];
const HOURLY_VARS = [
  "temperature_2m", "precipitation_probability", "weather_code",
  "wind_speed_10m", "soil_temperature_0cm", "visibility",
];
const DAILY_VARS = [
  "sunrise", "sunset", "uv_index_max",
  "temperature_2m_max", "temperature_2m_min",
];

// Mini fetch — label-only (no hourly/daily).
// Includes precipitation so the precip-layer toggle has data for every circuit
// after the bootstrap loadAllCircuitsMini run, not just the active one.
const MINI_VARS = [
  "temperature_2m",
  "wind_speed_10m",
  "wind_direction_10m",
  "weather_code",
  "precipitation",
];

// Surrounding-point labels around the active circuit
const SURROUNDING_OFFSET = 0.008;  // ~0.9 km — hugs the track outline at zoom 15 (≈186px)
const SURROUNDING_MIN_ZOOM = 15;   // hide when zoomed out beyond this (close-up only)

// WMO weather codes → display strings
const WMO_CODES = {
  0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",
  45:"Fog",48:"Rime fog",
  51:"Light drizzle",53:"Drizzle",55:"Dense drizzle",
  56:"Freezing drizzle",57:"Freezing drizzle",
  61:"Light rain",63:"Rain",65:"Heavy rain",
  66:"Freezing rain",67:"Freezing rain",
  71:"Light snow",73:"Snow",75:"Heavy snow",77:"Snow grains",
  80:"Light showers",81:"Showers",82:"Violent showers",
  85:"Snow showers",86:"Heavy snow showers",
  95:"Thunderstorm",96:"Thunderstorm + hail",99:"Severe thunderstorm",
};

// 16-point compass direction names
const DIR_NAMES = [
  "N","NNE","NE","ENE","E","ESE","SE","SSE",
  "S","SSW","SW","WSW","W","WNW","NW","NNW",
];
