// ===== Panels, tabs, bottom bar, clock, background gradient =====
// Depends on config.js + weather.js (currentHourIndex, build12hPrecip,
// weatherCodeText). Calls setActiveCircuit (app.js) from tab handlers.

// ---- Tab construction -------------------------------------------------------
const tabsEl = document.getElementById("tabs");
const tabNodes = new Map();
CIRCUITS.forEach((c) => {
  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "tab";
  tab.dataset.circuit = c.id;
  tab.innerHTML = `<span class="flag">${c.flag}</span><span>${c.tab}</span>`;
  tab.addEventListener("click", () => setActiveCircuit(c.id));
  tabsEl.appendChild(tab);
  tabNodes.set(c.id, tab);
});

// ---- Clock ------------------------------------------------------------------
// Shows the active circuit's local wall-clock time. The IANA `timezone` on each
// CIRCUITS entry drives the conversion; the parenthesised label is the city
// portion of that zone (Intl's short tz names are unreliable — European/Asian
// zones render as "GMT+2" rather than "CET" — so we show the city instead).
// Falls back to UTC before a circuit is selected at boot.
function tzCityLabel(timezone) {
  return timezone.split("/").pop().replace(/_/g, " ");
}

function updateClock() {
  const now = new Date();
  const c = CIRCUITS.find((x) => x.id === activeCircuitId);

  if (!c || !c.timezone) {
    const hh = String(now.getUTCHours()).padStart(2, "0");
    const mm = String(now.getUTCMinutes()).padStart(2, "0");
    const ss = String(now.getUTCSeconds()).padStart(2, "0");
    document.getElementById("clock").textContent = `${hh}:${mm}:${ss} UTC`;
    return;
  }

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: c.timezone,
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(now);
  document.getElementById("clock").textContent = `${time} (${tzCityLabel(c.timezone)})`;
}

// ---- Update toast (called after each successful weather fetch) -------------
let updateToastTimer = null;
function showUpdateToast() {
  const el = document.getElementById("update-toast");
  if (!el) return;
  el.classList.add("show");
  clearTimeout(updateToastTimer);
  updateToastTimer = setTimeout(() => el.classList.remove("show"), 2000);
}

// ---- Background gradient (driven by weather_code + is_day) -----------------
function gradientForWeather(weatherCode, isDay) {
  // Night first — overrides any cloud/clear state
  if (!isDay) {
    return "linear-gradient(135deg, rgba(15, 15, 35, 0.72), rgba(26, 26, 62, 0.58))";
  }
  if (weatherCode >= 95 || (weatherCode >= 80 && weatherCode <= 86)) {
    return "linear-gradient(135deg, rgba(26, 26, 46, 0.70), rgba(52, 52, 74, 0.58))";
  }
  if (weatherCode >= 51 && weatherCode <= 75) {
    return "linear-gradient(135deg, rgba(44, 62, 80, 0.62), rgba(74, 98, 116, 0.50))";
  }
  if (weatherCode === 45 || weatherCode === 48) {
    return "linear-gradient(135deg, rgba(120, 132, 152, 0.58), rgba(170, 180, 195, 0.48))";
  }
  if (weatherCode >= 1 && weatherCode <= 3) {
    return "linear-gradient(135deg, rgba(142, 154, 175, 0.55), rgba(203, 213, 225, 0.45))";
  }
  // Clear (0) — default bright blue
  return "linear-gradient(135deg, rgba(74, 144, 217, 0.50), rgba(116, 185, 255, 0.40))";
}

function updateBackgroundForActive() {
  const overlay = document.getElementById("bg-overlay");
  if (!overlay) return;
  const c = CIRCUITS.find((x) => x.id === activeCircuitId);
  const cur = c?.weather?.current;
  if (!cur || cur.weather_code == null) return;
  overlay.style.background = gradientForWeather(cur.weather_code, cur.is_day === 1);
}

// ---- Value formatting / classification ------------------------------------
function uvLabel(uv) {
  if (uv == null) return { text: "—", cls: "muted" };
  const n = uv.toFixed(0);
  if (uv >= 11) return { text: `Extreme ${n}`,   cls: "red" };
  if (uv >= 8)  return { text: `Very high ${n}`, cls: "red" };
  if (uv >= 6)  return { text: `High ${n}`,      cls: "amber" };
  if (uv >= 3)  return { text: `Moderate ${n}`,  cls: "" };
  return { text: `Low ${n}`, cls: "" };
}

function classifyValue(v, { red, amber, low } = {}) {
  if (v == null || Number.isNaN(v)) return "muted";
  if (red != null && v >= red) return "red";
  if (amber != null && v >= amber) return "amber";
  if (low != null && v <= low) return "amber";
  return "";
}

function formatHM(iso) {
  if (!iso) return "—";
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : iso;
}

// ---- Wind helpers ---------------------------------------------------------
function dirName(deg) {
  if (deg == null || Number.isNaN(deg)) return "—";
  const n = ((deg % 360) + 360) % 360;
  return DIR_NAMES[Math.round(n / 22.5) % 16];
}

function beaufort(kmh) {
  if (kmh == null || Number.isNaN(kmh)) return { n: null, name: "—" };
  const v = kmh;
  if (v < 1)   return { n: 0,  name: "Calm" };
  if (v < 6)   return { n: 1,  name: "Light air" };
  if (v < 12)  return { n: 2,  name: "Light breeze" };
  if (v < 20)  return { n: 3,  name: "Gentle breeze" };
  if (v < 29)  return { n: 4,  name: "Moderate breeze" };
  if (v < 39)  return { n: 5,  name: "Fresh breeze" };
  if (v < 50)  return { n: 6,  name: "Strong breeze" };
  if (v < 62)  return { n: 7,  name: "Near gale" };
  if (v < 75)  return { n: 8,  name: "Gale" };
  if (v < 89)  return { n: 9,  name: "Strong gale" };
  if (v < 103) return { n: 10, name: "Storm" };
  if (v < 118) return { n: 11, name: "Violent storm" };
  return { n: 12, name: "Hurricane" };
}

function buildCompassSVG(dirDeg) {
  const cx = 100, cy = 100, R = 92;
  const ticks = [];
  for (let a = 0; a < 360; a += 15) {
    const major = a % 90 === 0;
    const len = major ? 10 : 5;
    const rad = ((a - 90) * Math.PI) / 180;
    const x1 = cx + R * Math.cos(rad);
    const y1 = cy + R * Math.sin(rad);
    const x2 = cx + (R - len) * Math.cos(rad);
    const y2 = cy + (R - len) * Math.sin(rad);
    ticks.push(`<line class="tick${major ? " tick-major" : ""}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
  }
  const rot = dirDeg ?? 0;
  return `
    <svg class="compass" viewBox="0 0 200 200" aria-hidden="true">
      <circle class="ring-outer" cx="100" cy="100" r="92"/>
      <circle class="ring-inner" cx="100" cy="100" r="74"/>
      ${ticks.join("")}
      <text class="cardinal n" x="100" y="14">N</text>
      <text class="cardinal"   x="186" y="100">E</text>
      <text class="cardinal"   x="100" y="186">S</text>
      <text class="cardinal"   x="14"  y="100">W</text>
      <g class="needle" style="transform: rotate(${rot}deg)">
        <polygon class="needle-arrow" points="100,26 92,100 108,100"/>
        <polygon class="needle-tail"  points="92,100 108,100 100,158"/>
      </g>
      <circle class="hub" cx="100" cy="100" r="5"/>
    </svg>
  `;
}

function detailCell(label, value, cls = "") {
  return `<div class="detail-cell"><span class="detail-label">${label}</span><span class="detail-value ${cls}">${value}</span></div>`;
}

function metric(label, value, cls = "") {
  return `<span class="metric"><span class="metric-label">${label}</span><span class="metric-value ${cls}">${value}</span></span>`;
}

// ---- Track-state classification ------------------------------------------
function trackState(precipProb, precipMM) {
  const prob = precipProb ?? 0;
  const mm = precipMM ?? 0;
  if (prob > 60 || mm >= 0.5) return "Wet";
  if (prob >= 20 || mm > 0)   return "Damp";
  return "Dry";
}

function gripLevel(state, surfaceTemp, windKmh) {
  if (state === "Wet" && (windKmh ?? 0) > 40) return "Very low";
  if (state === "Wet")  return "Low";
  if (state === "Damp") return "Medium";
  if (surfaceTemp == null) return "Medium";
  if (surfaceTemp < 20 || surfaceTemp > 50) return "Medium";
  return "High";
}

// ---- Next-race pill -------------------------------------------------------
function nextRacePill(c) {
  if (!c?.raceDate) return "";
  const days = daysUntilRace(c.raceDate);
  if (days == null) return "";
  const label = c.race ?? c.name;

  let countdown, cls;
  if (days < 0)       { countdown = "Race completed"; cls = "past"; }
  else if (days === 0){ countdown = "Race day";       cls = "today"; }
  else if (days === 1){ countdown = "Tomorrow";       cls = "soon"; }
  else if (days <= 7) { countdown = `${days} days`;   cls = "soon"; }
  else                { countdown = `${days} days`;   cls = ""; }

  return `
    <span class="next-race ${cls}">
      <span class="next-race-label">Next</span>
      <span class="next-race-name">${label}</span>
      <span class="next-race-sep">·</span>
      <span class="next-race-count">${countdown}</span>
    </span>`;
}

function nextRainText(weather) {
  const cur = weather?.current ?? {};
  const probs = weather?.hourly?.precipitation_probability;
  if ((cur.precipitation ?? 0) > 0) return "Now";
  const idx = currentHourIndex(weather);
  if (idx < 0 || !probs) return "—";
  for (let i = 1; i < 24 && idx + i < probs.length; i++) {
    if ((probs[idx + i] ?? 0) > 50) return `+${i}h`;
  }
  return "—";
}

// ---- Render: left panel (card stack) ---------------------------------------
function renderCurrentPanel() {
  const el = document.getElementById("panel-left");
  const c = CIRCUITS.find((x) => x.id === activeCircuitId);

  if (!c) {
    el.innerHTML = `<div class="panel-placeholder"><span class="dot"></span>Select a circuit</div>`;
    return;
  }
  if (!c.weather) {
    el.innerHTML = `<div class="panel-placeholder"><span class="dot"></span>Loading ${c.name}…</div>`;
    return;
  }

  const w = c.weather;
  const cur = w.current ?? {};
  const hr = w.hourly ?? {};
  const dy = w.daily ?? {};
  const hIdx = currentHourIndex(w);

  const precipProb = hIdx >= 0 ? hr.precipitation_probability?.[hIdx] : null;
  const soilTemp   = hIdx >= 0 ? hr.soil_temperature_0cm?.[hIdx]      : null;
  const visMeters  = hIdx >= 0 ? hr.visibility?.[hIdx]                : null;
  const visKm      = visMeters != null ? visMeters / 1000 : null;

  const uv = uvLabel(dy.uv_index_max?.[0]);

  const soilStatCls = classifyValue(soilTemp,   { red: 50, amber: 40, low: 15 });
  const rainStatCls = classifyValue(precipProb, { red: 70, amber: 40 });
  const windStatCls = classifyValue(cur.wind_speed_10m, { red: 60, amber: 40 });

  const temp     = cur.temperature_2m;
  const feels    = cur.apparent_temperature;
  const humidity = cur.relative_humidity_2m;
  const pressure = cur.surface_pressure;
  const clouds   = cur.cloud_cover;
  const dew      = cur.dew_point_2m;
  const wind     = cur.wind_speed_10m;
  const maxT     = dy.temperature_2m_max?.[0];
  const minT     = dy.temperature_2m_min?.[0];
  const wcText   = weatherCodeText(cur.weather_code);

  const fmt = (v, digits = 0, suffix = "") =>
    v == null || Number.isNaN(v) ? "—" : `${v.toFixed(digits)}${suffix}`;

  const refreshingTag = c.weatherLoading
    ? `<span class="refreshing-tag"><span class="dot"></span>Refreshing</span>`
    : "";

  el.innerHTML = `
    <div class="card hero-card">
      <div class="hero-flag-name">
        <span class="flag">${c.flag}</span>
        <div>
          <div class="circuit-name">${c.name}</div>
          <div class="circuit-sub">${c.full}</div>
        </div>
      </div>
      <div class="hero-temp">${fmt(temp, 0)}<span class="unit">°</span></div>
      <div class="hero-state">${wcText}</div>
      <div class="hero-meta">
        <span>Feels like ${fmt(feels, 0)}°</span>
        <span class="sep">·</span>
        <span>H ${fmt(maxT, 0)}°</span>
        <span class="sep">·</span>
        <span>L ${fmt(minT, 0)}°</span>
        ${refreshingTag}
      </div>
    </div>

    <div class="card stats-card">
      <div class="stat ${soilStatCls}">
        <span class="stat-icon">${ICONS.thermometer}</span>
        <span class="stat-label">Surface</span>
        <span class="stat-value">${fmt(soilTemp, 0)}<span class="unit">°</span></span>
      </div>
      <div class="stat ${rainStatCls}">
        <span class="stat-icon">${ICONS.rain}</span>
        <span class="stat-label">Rain</span>
        <span class="stat-value">${fmt(precipProb, 0)}<span class="unit">%</span></span>
      </div>
      <div class="stat ${windStatCls}">
        <span class="stat-icon">${ICONS.wind}</span>
        <span class="stat-label">Wind</span>
        <span class="stat-value">${fmt(kmhToMs(wind), 1)}<span class="unit">m/s</span></span>
      </div>
    </div>

    <div class="card detail-card">
      <div class="detail-grid">
        ${detailCell("Humidity",    fmt(humidity, 0, "%"))}
        ${detailCell("Pressure",    fmt(pressure, 0, " hPa"))}
        ${detailCell("Cloud cover", fmt(clouds, 0, "%"))}
        ${detailCell("UV index",    uv.text, uv.cls)}
        ${detailCell("Dew point",   fmt(dew, 0, "°"))}
        ${detailCell("Visibility",  visKm == null ? "—" : `${visKm.toFixed(0)} km`)}
        ${detailCell("Sunrise",     formatHM(dy.sunrise?.[0]))}
        ${detailCell("Sunset",      formatHM(dy.sunset?.[0]))}
      </div>
    </div>
  `;
}

// ---- Render: right panel (card stack) --------------------------------------
function renderForecastPanel() {
  const el = document.getElementById("panel-right");
  const c = CIRCUITS.find((x) => x.id === activeCircuitId);

  if (!c) {
    el.innerHTML = `<div class="panel-placeholder"><span class="dot"></span>Select a circuit</div>`;
    return;
  }
  if (!c.weather) {
    el.innerHTML = `<div class="panel-placeholder"><span class="dot"></span>Loading…</div>`;
    return;
  }

  const w = c.weather;
  const cur = w.current ?? {};

  const series = build12hPrecip(w);
  const chartHTML = series.length
    ? series.map(({ hour, pct }) => {
        const v = Number.isFinite(pct) ? pct : 0;
        const cls = v >= 60 ? "red" : v >= 30 ? "amber" : "";
        const h = Math.max(2, Math.min(100, v));
        return `
          <div class="bar-col">
            <div class="bar-pct ${cls}">${v}</div>
            <div class="bar-track"><div class="bar ${cls}" style="height: ${h}%"></div></div>
            <div class="bar-time">${hour}</div>
          </div>`;
      }).join("")
    : `<div class="bar-col"><div class="bar-pct">—</div><div class="bar-track"></div><div class="bar-time">—</div></div>`;

  const ws    = cur.wind_speed_10m;
  const gust  = cur.wind_gusts_10m;
  const dDeg  = cur.wind_direction_10m;
  const dTxt  = dirName(dDeg);
  const bft   = beaufort(ws);

  const speedCls = classifyValue(ws,   { red: 50, amber: 30 });
  const gustCls  = classifyValue(gust, { red: 60, amber: 40 });

  const fmt = (v, digits = 0, suffix = "") =>
    v == null || Number.isNaN(v) ? "—" : `${v.toFixed(digits)}${suffix}`;

  const dirMeta = dDeg == null ? "—" : `${dTxt} · ${Math.round(dDeg)}°`;

  el.innerHTML = `
    <div class="card right-card">
      <div class="card-heading">
        <span>12-hour precipitation</span>
        <span class="meta">Prob %</span>
      </div>
      <div class="chart-precip">${chartHTML}</div>
    </div>

    <div class="card right-card">
      <div class="card-heading">
        <span>Wind</span>
        <span class="meta">${dirMeta}</span>
      </div>
      <div class="compass-wrap">
        ${buildCompassSVG(dDeg)}
        <div class="compass-center">${dDeg == null ? "—" : Math.round(dDeg) + "°"}</div>
      </div>
      <div class="wind-detail-grid">
        ${detailCell("Speed",     fmt(kmhToMs(ws), 1, " m/s"), speedCls)}
        ${detailCell("Gusts",     fmt(kmhToMs(gust), 1, " m/s"), gustCls)}
        ${detailCell("Direction", dirMeta)}
        ${detailCell("Beaufort",  bft.n == null ? "—" : `${bft.n} · ${bft.name}`)}
      </div>
    </div>
  `;
}

// ---- Render: bottom bar ----------------------------------------------------
function renderBottomStrip() {
  const stripEl = document.getElementById("bottom-strip");
  const c = CIRCUITS.find((x) => x.id === activeCircuitId);

  const coordsHTML = c
    ? `<span class="coords">
        <span class="label">Lat</span>${c.lat.toFixed(4)}°
        <span class="sep">·</span>
        <span class="label">Lng</span>${c.lng.toFixed(4)}°
        <span class="sep">·</span>
        <span class="label">Alt</span>${c.elev} m
      </span>`
    : "";

  const racePillHTML = nextRacePill(c);

  if (!c || !c.weather) {
    stripEl.innerHTML = `
      <div class="bottom-section">
        <span class="track-state standby">
          <span class="dot"></span>${c ? "Loading…" : "Standby"}
        </span>
        ${racePillHTML}
      </div>
      <div class="bottom-section center"></div>
      <div class="bottom-section">${coordsHTML}</div>`;
    return;
  }

  const cur = c.weather.current ?? {};
  const hr = c.weather.hourly ?? {};
  const idx = currentHourIndex(c.weather);

  const precipProb = idx >= 0 ? hr.precipitation_probability?.[idx] : null;
  const soilTemp   = idx >= 0 ? hr.soil_temperature_0cm?.[idx]      : null;
  const visMeters  = idx >= 0 ? hr.visibility?.[idx]                : null;
  const visKm      = visMeters != null ? visMeters / 1000 : null;
  const wind       = cur.wind_speed_10m;
  const precipMM   = cur.precipitation;

  const state = trackState(precipProb, precipMM);
  const grip  = gripLevel(state, soilTemp, wind);
  const stateCls = state.toLowerCase();

  const surfCls = classifyValue(soilTemp,   { red: 50, amber: 40, low: 15 });
  const windCls = classifyValue(wind,       { red: 60, amber: 40 });
  const rainCls = classifyValue(precipProb, { red: 60, amber: 20 });
  const visCls  = visKm == null ? "muted" : visKm < 5 ? "red" : visKm < 10 ? "amber" : "";
  const nextRain = nextRainText(c.weather);
  const nextCls =
    nextRain === "Now"               ? "red" :
    /^\+([123])h$/.test(nextRain)    ? "amber" :
    /^\+\d+h$/.test(nextRain)        ? "" : "muted";

  const fmt = (v, digits, suffix) =>
    v == null || Number.isNaN(v) ? "—" : `${v.toFixed(digits)}${suffix}`;

  stripEl.innerHTML = `
    <div class="bottom-section">
      <span class="track-state ${stateCls}">
        <span class="dot"></span>${state} · ${grip} grip
      </span>
      ${racePillHTML}
    </div>
    <div class="bottom-section center">
      <div class="metric-list">
        ${metric("Surface",   fmt(soilTemp, 0, "°C"),  surfCls)}
        ${metric("Wind",      fmt(kmhToMs(wind), 1, " m/s"), windCls)}
        ${metric("Rain",      fmt(precipProb, 0, "%"), rainCls)}
        ${metric("Next rain", nextRain,                nextCls)}
        ${metric("Visibility",fmt(visKm, 0, " km"),    visCls)}
      </div>
    </div>
    <div class="bottom-section">${coordsHTML}</div>
  `;
}

function renderPanels() {
  renderCurrentPanel();
  renderForecastPanel();
  renderBottomStrip();
  updateBackgroundForActive();
}
