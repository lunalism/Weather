// ===== App entry: setActiveCircuit + boot sequence =====
// Loads last in <body> — relies on config/weather/map/ui having defined
// CIRCUITS, ensureCircuitWeather, map, surroundingLayer,
// loadSurroundingForCircuit, tabNodes, renderPanels, etc.

let activeCircuitId = null;

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
  const drawTrackIfStillActive = () => {
    if (activeCircuitId === id) updateTrackLayer(id);
  };

  if (fly && c) {
    map.flyTo([c.lat, c.lng], c.zoom ?? CIRCUIT_ZOOM, { duration: 1.8 });
    map.once("moveend", drawTrackIfStillActive);
  } else {
    drawTrackIfStillActive();
  }

  renderPanels();
  ensureCircuitWeather(c);

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
//  3. After 1.8s, auto-select Imola — flies in, panels populate, surrounding fetch
renderPanels();
loadAllCircuitsMini();
setTimeout(() => setActiveCircuit("imola"), 1800);
