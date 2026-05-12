// ===== Circuit data + constants =====
// Shared globals consumed by weather.js, map.js, ui.js, app.js.
// Plain script (no ES modules) — script tags must load this file first.

const CIRCUITS = [
  { id: "imola",      name: "Imola",      tab: "Imola",      full: "Autodromo Enzo e Dino Ferrari", country: "Italy",   flag: "🇮🇹", lat:  44.3439, lng:  11.7167, elev:  47 },
  { id: "spa",        name: "Spa",        tab: "Spa",        full: "Circuit de Spa-Francorchamps",  country: "Belgium", flag: "🇧🇪", lat:  50.4372, lng:   5.9714, elev: 401 },
  { id: "lemans",     name: "Le Mans",    tab: "Le Mans",    full: "Circuit de la Sarthe",          country: "France",  flag: "🇫🇷", lat:  47.9562, lng:   0.2075, elev:  62 },
  { id: "interlagos", name: "Interlagos", tab: "Interlagos", full: "Autódromo José Carlos Pace",    country: "Brazil",  flag: "🇧🇷", lat: -23.7036, lng: -46.6997, elev: 750 },
  { id: "cota",       name: "COTA",       tab: "COTA",       full: "Circuit of the Americas",       country: "USA",     flag: "🇺🇸", lat:  30.1328, lng: -97.6411, elev: 163 },
  { id: "fuji",       name: "Fuji",       tab: "Fuji",       full: "Fuji Speedway",                 country: "Japan",   flag: "🇯🇵", lat:  35.3725, lng: 138.9267, elev: 560 },
  { id: "lusail",     name: "Lusail",     tab: "Qatar",      full: "Lusail International Circuit",  country: "Qatar",   flag: "🇶🇦", lat:  25.4900, lng:  51.4543, elev:   8 },
  { id: "bahrain",    name: "Bahrain",    tab: "Bahrain",    full: "Bahrain International Circuit", country: "Bahrain", flag: "🇧🇭", lat:  26.0325, lng:  50.5106, elev:   7 },
];

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
