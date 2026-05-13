// ===== Open-Meteo API + cache + surrounding fetch =====
// Depends on config.js (CIRCUITS, WEATHER_API, etc.).
// Calls into ui.js (renderPanels, showUpdateToast) and map.js
// (updateMapLabels, updatePrecipLayer, updateSurroundingLabels) by name —
// those are global and resolve at call time, after all scripts load.

// ---- Helpers ----------------------------------------------------------------

const weatherCodeText = (code) => WMO_CODES[code] ?? `Code ${code}`;

function currentHourIndex(weather) {
  const t = weather?.current?.time;
  const arr = weather?.hourly?.time;
  if (!t || !arr) return -1;
  // current.time is at minute resolution ("...T15:42"), hourly is hourly
  // ("...T15:00") — align to the hour, then fall back to the latest
  // hourly entry not after current.
  const hourKey = t.slice(0, 13) + ":00";
  const hit = arr.indexOf(hourKey);
  if (hit >= 0) return hit;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] <= t) return i;
  }
  return 0;
}

function build12hPrecip(weather) {
  const arr = weather?.hourly?.time;
  const probs = weather?.hourly?.precipitation_probability;
  const start = currentHourIndex(weather);
  if (!arr || !probs || start < 0) return [];
  const out = [];
  for (let i = 0; i < 12 && start + i < arr.length; i++) {
    const t = arr[start + i];
    out.push({ hour: t.slice(11, 13), pct: probs[start + i] ?? 0 });
  }
  return out;
}

// ---- Full fetch (detailed, per active circuit) ------------------------------

function buildWeatherURL(c) {
  const params = new URLSearchParams({
    latitude: c.lat,
    longitude: c.lng,
    current: CURRENT_VARS.join(","),
    hourly: HOURLY_VARS.join(","),
    daily: DAILY_VARS.join(","),
    forecast_days: "2",
    timezone: "auto",
  });
  return `${WEATHER_API}?${params}`;
}

async function fetchCircuitWeather(c) {
  const res = await fetch(buildWeatherURL(c));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function isCacheFresh(c) {
  return (
    c.weather &&
    c.weatherFetchedAt &&
    Date.now() - c.weatherFetchedAt < CACHE_TTL_MS
  );
}

async function ensureCircuitWeather(c) {
  if (!c) return;
  if (isCacheFresh(c)) return;
  if (c.weatherLoading) return;

  c.weatherLoading = true;
  if (activeCircuitId === c.id) renderPanels();

  const t0 = performance.now();
  let updated = false;
  try {
    const data = await fetchCircuitWeather(c);
    c.weather = data;
    c.weatherFetchedAt = Date.now();
    updated = true;
    const dt = (performance.now() - t0).toFixed(0);
    console.log(`[RaceWeather] ${c.id} fetched in ${dt}ms`, {
      tempC: data.current?.temperature_2m,
      rainMM: data.current?.precipitation,
      windKmh: data.current?.wind_speed_10m,
      windDir: data.current?.wind_direction_10m,
      weatherCode: data.current?.weather_code,
    });
  } catch (err) {
    console.warn(`[RaceWeather] ${c.id} fetch failed — keeping last data`, err);
  } finally {
    c.weatherLoading = false;
    if (activeCircuitId === c.id) renderPanels();
    if (updated && activeCircuitId === c.id) showUpdateToast();
    updateMapLabels();
    updatePrecipLayer();
    if (activeCircuitId === c.id) updateWindField(c.id);
  }
}

// ---- Mini fetch (label-only, any lat/lng) -----------------------------------

function buildMiniURL(lat, lng) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lng,
    current: MINI_VARS.join(","),
    timezone: "auto",
  });
  return `${WEATHER_API}?${params}`;
}

async function fetchMiniWeather(lat, lng) {
  const res = await fetch(buildMiniURL(lat, lng));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.current ?? null;
}

// Bootstrap: walk all 8 circuits sequentially (300ms spacing) so labels
// appear progressively on the world view without tripping rate limits.
async function loadAllCircuitsMini() {
  for (const c of CIRCUITS) {
    if (c.weather || c.mini) continue;
    try {
      c.mini = await fetchMiniWeather(c.lat, c.lng);
      updateMapLabels();
      updatePrecipLayer();  // refresh if precip toggle is active
      if (activeCircuitId === c.id) updateWindField(c.id);
    } catch (err) {
      console.warn(`[RaceWeather] mini fetch failed for ${c.id}`, err);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

// ---- Surrounding points (NE/NW/SE/SW around active circuit) -----------------

const surroundingData = new Map(); // id → { lat, lng, current, fetchedAt }
let surroundingLoadToken = 0;

function getSurroundingPoints(c) {
  // Diagonal layout (NE/NW/SE/SW) keeps labels in the open quadrants of
  // the screen — out of the way of the left/right panels and top/bottom bars.
  return [
    { id: `${c.id}-ne`, lat: c.lat + SURROUNDING_OFFSET, lng: c.lng + SURROUNDING_OFFSET },
    { id: `${c.id}-nw`, lat: c.lat + SURROUNDING_OFFSET, lng: c.lng - SURROUNDING_OFFSET },
    { id: `${c.id}-se`, lat: c.lat - SURROUNDING_OFFSET, lng: c.lng + SURROUNDING_OFFSET },
    { id: `${c.id}-sw`, lat: c.lat - SURROUNDING_OFFSET, lng: c.lng - SURROUNDING_OFFSET },
  ];
}

async function loadSurroundingForCircuit(c) {
  const myToken = ++surroundingLoadToken;
  const points = getSurroundingPoints(c);
  console.log(`[RaceWeather] surrounding: loading 4 points around ${c.id}`);
  for (const p of points) {
    if (myToken !== surroundingLoadToken) return; // cancelled by new active circuit
    const cached = surroundingData.get(p.id);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      console.log(`[RaceWeather] surrounding ${p.id} from cache`);
      updateSurroundingLabels();
      continue;
    }
    try {
      const cur = await fetchMiniWeather(p.lat, p.lng);
      if (myToken !== surroundingLoadToken) return;
      surroundingData.set(p.id, {
        lat: p.lat, lng: p.lng, current: cur, fetchedAt: Date.now(),
      });
      console.log(`[RaceWeather] surrounding ${p.id} fetched`, {
        tempC: cur?.temperature_2m,
        windKmh: cur?.wind_speed_10m,
        windDir: cur?.wind_direction_10m,
      });
      updateSurroundingLabels();
    } catch (err) {
      console.warn(`[RaceWeather] surrounding fetch failed for ${p.id}`, err);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}
