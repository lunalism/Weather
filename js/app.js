// ===== App entry: setActiveCircuit + boot sequence =====
// Loads last in <body> — relies on config/weather/map/ui having defined
// CIRCUITS, ensureCircuitWeather, map, surroundingLayer,
// loadSurroundingForCircuit, tabNodes, renderPanels, etc.

let activeCircuitId = null;
let autoRefreshTimer = null;

// Re-fetch the active circuit's weather on a fixed cadence so a left-running
// TV display stays current without any tab interaction. Cache-bypassing
// (force:true); ensureCircuitWeather's finally block already repaints panels,
// map labels, precip layer, wind field and fires the "Updated" toast on
// success. Restarted on every tab switch so the clock starts fresh per circuit.
function restartAutoRefresh() {
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    const c = CIRCUITS.find((x) => x.id === activeCircuitId);
    if (c) ensureCircuitWeather(c, { force: true });
  }, AUTO_REFRESH_MS);
}

// ---- Race-date helpers -----------------------------------------------------
// Compare against today's UTC midnight so the countdown ticks over at 00:00 UTC
// rather than the viewer's local midnight (TV display is timezone-agnostic).
function daysUntilRace(raceDate) {
  if (!raceDate) return null;
  const [y, m, d] = raceDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const raceUTC = Date.UTC(y, m - 1, d);
  return Math.round((raceUTC - todayUTC) / (24 * 3600 * 1000));
}

// Soonest upcoming race (days >= 0). If every race is past, fall back to the
// season opener so the season-finished state still has a sane default.
function pickDefaultCircuit() {
  let best = null;
  let bestDays = Infinity;
  CIRCUITS.forEach((c) => {
    const d = daysUntilRace(c.raceDate);
    if (d == null || d < 0) return;
    if (d < bestDays) { bestDays = d; best = c; }
  });
  return best?.id ?? CIRCUITS[0].id;
}

function setActiveCircuit(id, { fly = true } = {}) {
  activeCircuitId = id;

  tabNodes.forEach((node, key) => {
    node.classList.toggle("active", key === id);
  });

  const c = CIRCUITS.find((x) => x.id === id);

  // Track outline can blanket the screen at intermediate zoom levels during
  // flyTo (Le Mans is ~14 km wide). Clear immediately; draw the new outline
  // only once the camera has landed.
  trackLayer.clearLayers();
  windFieldLayer.clearLayers();
  const drawTrackIfStillActive = () => {
    if (activeCircuitId === id) updateTrackLayer(id);
  };

  if (fly && c) {
    map.flyTo([c.lat, c.lng], c.zoom ?? CIRCUIT_ZOOM, { duration: 1.8 });
    map.once("moveend", drawTrackIfStillActive);
  } else {
    drawTrackIfStillActive();
  }

  // Wind particles can draw immediately — the divIcon is geo-locked to the
  // circuit, so it flies in with the camera rather than blanketing the screen
  // mid-fly the way a large track polyline does.
  updateWindField(id);

  renderPanels();
  updateClock(); // repaint immediately so the clock's timezone flips on tab switch
  ensureCircuitWeather(c);
  restartAutoRefresh();

  // Surrounding points are tied to the active circuit
  surroundingLayer.clearLayers();
  if (c) loadSurroundingForCircuit(c);
}

// Clock kicks off here
updateClock();
setInterval(updateClock, 1000);

// Console debug exports
window.CIRCUITS = CIRCUITS;
window.surroundingData = surroundingData;
window.updateSurroundingLabels = updateSurroundingLabels;
window.loadSurroundingForCircuit = loadSurroundingForCircuit;
window.map = map;

// Boot:
//  1. Empty panels render so something is on screen immediately
//  2. Light fetch of all 8 circuits in background (labels appear as data lands)
//  3. After 1.8s, auto-select the next-upcoming-race circuit — flies in,
//     panels populate, surrounding fetch
renderPanels();
loadAllCircuitsMini();
setTimeout(() => setActiveCircuit(pickDefaultCircuit()), 1800);
