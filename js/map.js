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

// ===== Label icon (temp + wind arrow, optionally wind speed for small) =====
function makeMapLabelIcon({ dir, temp, wind, small = false }) {
  // Open-Meteo wind_direction = direction wind is coming FROM.
  // Arrow points where wind is BLOWING TO → rotate by deg + 180.
  const rot = (dir ?? 0) + 180;
  const tempText = temp == null ? "—" : `${Math.round(temp)}°`;

  let inner;
  if (small) {
    // Surrounding point: "15° ↗ 9km/h" — temp + arrow + wind speed.
    const windText = wind == null ? "—" : `${Math.round(wind)}km/h`;
    inner = `<span class="temp">${tempText}</span><span class="arrow" style="transform: rotate(${rot}deg)">${ICONS.arrow}</span><span class="wind">${windText}</span>`;
  } else {
    // Main circuit marker: "↗ 18°" — arrow + temp.
    inner = `<span class="arrow" style="transform: rotate(${rot}deg)">${ICONS.arrow}</span><span class="temp">${tempText}</span>`;
  }

  const cls = small ? "map-label map-label-sm" : "map-label";
  // Sized for the larger fonts (main 18px, small 14px) plus content.
  const size = small ? [140, 28] : [110, 38];
  // Small label has no underlying marker → center on point.
  // Main label sits ABOVE its pulse marker (~8px gap).
  const anchor = small ? [70, 14] : [55, 56];

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
        dir: src.wind_direction_10m,
        temp: src.temperature_2m,
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
        dir:  data.current.wind_direction_10m,
        temp: data.current.temperature_2m,
        wind: data.current.wind_speed_10m,
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
