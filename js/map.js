// ===== Leaflet map + markers + map labels + precipitation overlay =====
// Depends on config.js (CIRCUITS, ICONS, ...). Calls into app.js
// (setActiveCircuit) and weather.js (currentHourIndex, surroundingData,
// getSurroundingPoints) by name — globals resolved at call time.

const map = L.map("map", {
  zoomControl: false,
  attributionControl: false,
  worldCopyJump: true,
  preferCanvas: true,
});

L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 18 }
).addTo(map);

// Initial view: fit all 8 circuits so every marker is visible at boot.
const ALL_CIRCUITS_BOUNDS = L.latLngBounds(
  CIRCUITS.map((c) => [c.lat, c.lng])
).pad(0.25);
map.fitBounds(ALL_CIRCUITS_BOUNDS, { animate: false });

// Custom zoom buttons (default Leaflet controls hidden via zoomControl: false)
document.getElementById("zoom-in").addEventListener("click", () => map.zoomIn());
document.getElementById("zoom-out").addEventListener("click", () => map.zoomOut());

// ===== Circuit pulse markers =====
const pulseIcon = L.divIcon({
  className: "",
  html: `<div class="circuit-marker"><div class="ring"></div><div class="core"></div></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const markerNodes = new Map();
CIRCUITS.forEach((c) => {
  const marker = L.marker([c.lat, c.lng], { icon: pulseIcon }).addTo(map);
  marker.bindTooltip(`${c.flag}  ${c.name}`, {
    className: "circuit-tooltip",
    direction: "top",
    offset: [0, -10],
  });
  marker.on("click", () => setActiveCircuit(c.id));
  markerNodes.set(c.id, marker);
});

// ===== Layer groups =====
const mapLabelLayer    = L.layerGroup().addTo(map);
const surroundingLayer = L.layerGroup().addTo(map);
const precipLayer      = L.layerGroup();
const trackLayer       = L.layerGroup().addTo(map);
let precipLayerActive  = false;

// Dedicated pane for the wind-particle field — sits above the gradient
// bg-overlay (z:250) and tile pane (z:200) but below polylines (z:400) and
// markers/labels (z:600), so labels stay legible on top of the particles.
map.createPane("windPane");
map.getPane("windPane").style.zIndex = "350";
map.getPane("windPane").style.pointerEvents = "none";
const windFieldLayer = L.layerGroup().addTo(map);

// ===== Active circuit track outline (static OSM data from tracks.js) =====
function updateTrackLayer(circuitId) {
  trackLayer.clearLayers();
  if (!circuitId) return;
  const ways = (typeof TRACKS !== "undefined") ? TRACKS[circuitId] : null;
  if (!ways || !ways.length) return;
  ways.forEach((way) => {
    L.polyline(way, {
      color: "#FFD700",
      weight: 3,
      opacity: 0.85,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    }).addTo(trackLayer);
  });
}

// ===== Label icon =====
// Main circuit marker → "18° · 3.9m/s" (temp + wind speed).
// Surrounding-point markers → "18°" (temperature only).
// Wind direction is conveyed by the wind-particle field, not by an arrow.
function makeMapLabelIcon({ temp, wind, small = false }) {
  const tempText = temp == null ? "—" : `${Math.round(temp)}°`;

  let inner;
  if (small) {
    inner = `<span class="temp">${tempText}</span>`;
  } else {
    const windText = wind == null
      ? ""
      : `<span class="sep">·</span><span class="wind">${kmhToMs(wind).toFixed(1)}m/s</span>`;
    inner = `<span class="temp">${tempText}</span>${windText}`;
  }

  const cls = small ? "map-label map-label-sm" : "map-label";
  // Main label widened to fit "18° · 3.9m/s"; small shrunk to just "18°".
  const size = small ? [60, 28] : [150, 38];
  const anchor = small ? [30, 14] : [75, 56];

  return L.divIcon({
    className: "",
    html: `<div class="map-label-anchor"><div class="${cls}">${inner}</div></div>`,
    iconSize: size,
    iconAnchor: anchor,
  });
}

function updateMapLabels() {
  mapLabelLayer.clearLayers();
  CIRCUITS.forEach((c) => {
    // Prefer full weather (c.weather) if available, fall back to mini (c.mini)
    const src = c.weather?.current ?? c.mini;
    if (!src) return;
    L.marker([c.lat, c.lng], {
      icon: makeMapLabelIcon({
        temp: src.temperature_2m,
        wind: src.wind_speed_10m,
      }),
      interactive: false,
      keyboard: false,
    }).addTo(mapLabelLayer);
  });
}

function updateSurroundingLabels() {
  surroundingLayer.clearLayers();
  const zoom = map.getZoom();
  if (zoom < SURROUNDING_MIN_ZOOM) return;
  const c = CIRCUITS.find((x) => x.id === activeCircuitId);
  if (!c) return;
  const bounds = map.getBounds();
  let rendered = 0;
  let offScreen = 0;
  getSurroundingPoints(c).forEach((p) => {
    const data = surroundingData.get(p.id);
    if (!data?.current) return;
    const ll = L.latLng(p.lat, p.lng);
    if (!bounds.contains(ll)) offScreen++;
    L.marker(ll, {
      icon: makeMapLabelIcon({
        temp: data.current.temperature_2m,
        small: true,
      }),
      interactive: false,
      keyboard: false,
    }).addTo(surroundingLayer);
    rendered++;
  });
  console.log(
    `[RaceWeather] surrounding render: ${rendered} markers added, ${offScreen} outside viewport (zoom ${zoom.toFixed(1)})`
  );
}

// ===== Wind-particle field around the active circuit =====
// A fixed-screen-size square anchored at the circuit's lat/lng. The CSS
// rotates the whole container so particles' local +X drift aligns with
// the wind-TO bearing. Pure CSS animation — no rAF, no JS per frame.
const WIND_FIELD_PX = 700;   // overlay size in screen pixels (TV-readable)
const WIND_PARTICLE_N = 25;  // particles per field

function makeWindFieldIcon(windDeg, windMs) {
  // Open-Meteo dir = where wind comes FROM (0=N). Particles drift TO that
  // bearing's opposite. Local +X aligned with wind-TO ⇒ rotation = dir + 90.
  const rot = (((windDeg ?? 0) + 90) % 360 + 360) % 360;
  // Speed → animation duration. Faster wind ⇒ shorter cycle. Recalibrated for
  // m/s input: 17/(v+1.4) tracks the old km/h curve 60/(v_kmh+5) (since
  // v_kmh ≈ 3.6·v_ms), keeping the same 1–6s clamp range and visual feel.
  const speed = windMs ?? 0;
  const dur = Math.max(1.0, Math.min(6.0, 17 / (speed + 1.4)));

  let particles = "";
  for (let i = 0; i < WIND_PARTICLE_N; i++) {
    // Spread particles across the cross-wind axis (local Y), evenly with
    // jitter so the stream doesn't look like a comb.
    const t = (i + 0.5) / WIND_PARTICLE_N;
    const jitter = ((i * 41) % 31) - 15; // pseudo-random ±15px
    const y = Math.round(t * (WIND_FIELD_PX - 40) + 20 + jitter);
    // Negative delay so each particle starts mid-animation — instant stream.
    const delay = (-(i / WIND_PARTICLE_N) * dur).toFixed(2);
    particles += `<span class="wind-particle" style="--y:${y}px;--duration:${dur.toFixed(2)}s;animation-delay:${delay}s;"></span>`;
  }
  return L.divIcon({
    className: "",
    html: `<div class="wind-field" style="--wind-rot:${rot}deg;">${particles}</div>`,
    iconSize: [WIND_FIELD_PX, WIND_FIELD_PX],
    iconAnchor: [WIND_FIELD_PX / 2, WIND_FIELD_PX / 2],
  });
}

function updateWindField(circuitId) {
  windFieldLayer.clearLayers();
  if (!circuitId) return;
  const c = CIRCUITS.find((x) => x.id === circuitId);
  if (!c) return;
  const src = c.weather?.current ?? c.mini;
  if (!src) return;
  const speedMs = kmhToMs(src.wind_speed_10m);
  // Calm air: skip the animation rather than render a misleading slow drift.
  // 0.3 m/s ≈ 1.08 km/h, matching the prior < 1 km/h cutoff.
  if (speedMs == null || speedMs < 0.3) return;
  L.marker([c.lat, c.lng], {
    icon: makeWindFieldIcon(src.wind_direction_10m, speedMs),
    interactive: false,
    keyboard: false,
    pane: "windPane",
  }).addTo(windFieldLayer);
}

// ===== Precipitation overlay (toggleable) =====
// Renders a "X.X mm" pill below each circuit marker. Stays visible at 0mm
// (faint style) so the toggle gives unambiguous on/off feedback.
function precipClass(mm) {
  if (mm == null || mm === 0) return "zero";
  if (mm < 2.5) return "light";
  if (mm < 7.5) return "moderate";
  return "heavy";
}

function makePrecipLabelIcon(mm) {
  const cls = precipClass(mm);
  const text = mm == null ? "—" : `${mm.toFixed(1)} mm`;
  return L.divIcon({
    className: "",
    html: `<div class="precip-label-anchor"><div class="precip-label ${cls}">${text}</div></div>`,
    iconSize: [80, 24],
    // Negative y_anchor pulls the label below the geographic point — sits
    // ~14px below the circuit marker (which is 16px wide around geo).
    iconAnchor: [40, -14],
  });
}

function updatePrecipLayer() {
  precipLayer.clearLayers();
  if (!precipLayerActive) return;
  CIRCUITS.forEach((c) => {
    // Prefer full weather, fall back to mini (which now also carries precipitation)
    const src = c.weather?.current ?? c.mini;
    if (!src) return;
    L.marker([c.lat, c.lng], {
      icon: makePrecipLabelIcon(src.precipitation),
      interactive: false,
      keyboard: false,
    }).addTo(precipLayer);
  });
}

function togglePrecipLayer() {
  precipLayerActive = !precipLayerActive;
  const btn = document.getElementById("precip-toggle");
  if (precipLayerActive) {
    map.addLayer(precipLayer);
    btn.classList.add("active");
  } else {
    map.removeLayer(precipLayer);
    btn.classList.remove("active");
  }
  updatePrecipLayer();
}
document.getElementById("precip-toggle").addEventListener("click", togglePrecipLayer);

// Surrounding labels track zoom — show/hide as user pans/zooms.
map.on("zoomend", updateSurroundingLabels);
