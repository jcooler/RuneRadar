/**
 * RuneRadar - OSRS Live Map
 */

function escHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ── Saved Settings ──────────────────────────────────────
let markerColor = MapStorage.getItem("runeradar-color") || "#3eff3e";
let showLocationLabel = MapStorage.getItem("runeradar-label") !== "false";
let autoFollow = MapStorage.getItem("runeradar-follow") !== "false";
let showFloorLayouts = MapStorage.getItem("runeradar-floor-layouts") === "true";
let fontScale = parseFloat(MapStorage.getItem("runeradar-fontscale") || "1.0");
if (!Number.isFinite(fontScale) || fontScale < 0.5 || fontScale > 3) fontScale = 1;
let currentTheme = MapStorage.getItem("runeradar-theme") || "dark";
if (!["dark", "light", "game"].includes(currentTheme)) currentTheme = "dark";
if (!/^#[0-9a-f]{6}$/i.test(markerColor)) markerColor = "#3eff3e";

// ── Theme System ────────────────────────────────────────

function applyTheme(theme) {
  currentTheme = theme;
  document.body.className = `theme-${theme}`;
  MapStorage.setItem("runeradar-theme", theme);
  // Update the theme selector if it exists
  const sel = document.getElementById("settingsTheme");
  if (sel && sel.value !== theme) sel.value = theme;
}

applyTheme(currentTheme);

// ── Fullscreen ──────────────────────────────────────────

const fullscreenBtn = document.getElementById("fullscreen-btn");

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    if (fullscreenBtn) fullscreenBtn.textContent = "⊠";
  } else {
    document.exitFullscreen().catch(() => {});
    if (fullscreenBtn) fullscreenBtn.textContent = "⛶";
  }
}

if (fullscreenBtn) fullscreenBtn.addEventListener("click", toggleFullscreen);

document.addEventListener("fullscreenchange", () => {
  if (fullscreenBtn) fullscreenBtn.textContent = document.fullscreenElement ? "⊠" : "⛶";
});

// ── Map Setup ───────────────────────────────────────────

const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -3,
  maxZoom: 5,
  maxNativeZoom: 3,
  zoomSnap: 1,
  zoomDelta: 1,
  attributionControl: false,
});

function gameToLatLng(x, y) {
  return L.latLng(y, x);
}

// ── Tile Layers with Plane Support ──────────────────────

let currentPlane = 0;
let requestedPlane = 0;
const getMapPlane = plane => showFloorLayouts ? plane : 0;

// Silent tile loader - hides broken tiles instead of showing broken image icons
function createSilentTile(src, done, fallbackSrc) {
  const tile = document.createElement("img");
  tile.alt = "";
  tile.crossOrigin = "anonymous";
  tile.onload = function () { done(null, tile); };
  tile.onerror = function () {
    if (fallbackSrc) {
      // Try fallback URL
      tile.onerror = function () {
        tile.onload = tile.onerror = null;
        tile.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        done(null, tile);
      };
      tile.src = fallbackSrc;
    } else {
      tile.onload = tile.onerror = null;
      tile.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      done(null, tile);
    }
  };
  tile.src = src;
  return tile;
}

// Exact tile membership prevents requests for holes inside sparse map regions.
const BLANK_TILE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const tileManifestReady = fetch("tile-manifest.json").then(response => {
  if (!response.ok) throw new Error("Tile manifest unavailable");
  return response.json();
}).then(data => ({detail: new Set(data.detail), overview: new Set(data.overview)})).catch(() => null);

function cancelTile({tile}) {
  tile._cancelled = true;
  tile.onload = tile.onerror = null;
}

function createIndexedTile(coords, done, overview = false) {
  const tile = document.createElement("img");
  tile.alt = "";
  const key = `${overview ? 0 : currentPlane}_${coords.x}_${-(coords.y + 1)}`;
  tileManifestReady.then(manifest => {
    if (tile._cancelled) return;
    if (manifest && !manifest[overview ? "overview" : "detail"].has(key)) {
      tile.src = BLANK_TILE;
      done(null, tile);
      return;
    }
    tile.onload = () => done(null, tile);
    tile.onerror = () => {
      tile.onload = tile.onerror = null;
      tile.src = BLANK_TILE;
      done(null, tile);
    };
    tile.src = `tiles/${overview ? "overview" : "2"}/${key}.png`;
  });
  return tile;
}

const localTileLayer = L.tileLayer("", {
  minZoom: -3, maxZoom: 5, maxNativeZoom: 2, minNativeZoom: 2, tileSize: 256,
});
localTileLayer.createTile = (coords, done) => createIndexedTile(coords, done);
localTileLayer.on("tileunload tileabort", cancelTile);
localTileLayer.addTo(map);

/** Switch the map to show a different plane (floor level) */
function switchPlane(newPlane) {
  requestedPlane = newPlane;
  newPlane = getMapPlane(newPlane);
  if (newPlane === currentPlane) return;
  currentPlane = newPlane;
  localTileLayer.redraw();
  objectives?.refreshPlane();
}

let objectives = null;
objectives = RuneRadarObjectives.create({map, container: document.getElementById("objectives"),
  getPlane: () => currentPlane, getDisplayPlane: getMapPlane, showTarget: (point, plane) => {
    pauseFollowing();
    switchPlane(plane);
    syncPlayerFloor();
    map.setView(gameToLatLng(point.x, point.y), Math.max(map.getZoom(), PLAYER_FOCUS_ZOOM));
  }});

const PLAYER_FOCUS_ZOOM = 3;
map.setView(gameToLatLng(3222, 3218), PLAYER_FOCUS_ZOOM);

// A separate pane keeps the player above every town and POI, regardless of y.
map.createPane("playerPane");
map.getPane("playerPane").style.zIndex = "625";

// ── Player Marker & Label ───────────────────────────────

function makePlayerIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div class="player-marker" style="background:${color}; box-shadow:0 0 10px ${color}cc;"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function makePlayerLabel(name) {
  const size = Math.round(16 * fontScale);
  const upstairs = playerPlane > 0 && !showFloorLayouts;
  const floorLabel = upstairs ? `<span class="player-floor">Upstairs${playerPlane > 1 ? ` · Floor ${playerPlane}` : ""}</span>` : "";
  return L.divIcon({
    className: "player-label",
    html: `<span style="font-size:${size}px">${escHtml(name || "Your Location")}</span>${floorLabel}`,
    iconSize: [120, upstairs ? 38 : 24],
    iconAnchor: [60, upstairs ? 48 : 34],
  });
}

let playerMarker = null;
let playerLabelMarker = null;
let followPlayer = autoFollow;
let currentPlayerName = "Your location";
let playerPlane = null;
const locateButton = document.getElementById("locate-btn");

function setFollowing(following) {
  followPlayer = following;
  locateButton.classList.toggle("active", following);
  locateButton.setAttribute("aria-pressed", String(following));
  locateButton.setAttribute("aria-label", following ? "Pause following your location" : "Follow my location");
  locateButton.title = following ? "Pause following your location" : "Follow my location (Space)";
  locateButton.querySelector("span").textContent = following ? "Following you" : "Follow my location";
}

function pauseFollowing() { setFollowing(false); }

function syncPlayerFloor() {
  for (const marker of [playerMarker, playerLabelMarker]) {
    if (!marker) continue;
    if (getMapPlane(playerPlane) === currentPlane) {
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else if (map.hasLayer(marker)) map.removeLayer(marker);
  }
}

function locatePlayer() {
  if (!playerMarker) return;
  setFollowing(true);
  switchPlane(playerPlane);
  syncPlayerFloor();
  map.setView(playerMarker.getLatLng(), Math.max(map.getZoom(), PLAYER_FOCUS_ZOOM), { animate: true });
}

// Only user navigation pauses following. Programmatic player pans do not.
map.on("dragstart", pauseFollowing);
map.on("browsestart", ({plane = 0}) => {
  pauseFollowing();
  map.stop();
  switchPlane(plane);
  syncPlayerFloor();
});
const mapContainer = map.getContainer();
mapContainer.addEventListener("wheel", pauseFollowing, {passive: true});
mapContainer.addEventListener("touchstart", pauseFollowing, {passive: true});
mapContainer.addEventListener("dblclick", pauseFollowing);
mapContainer.addEventListener("keydown", event => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "+", "-", "="].includes(event.key)) pauseFollowing();
}, true);
mapContainer.addEventListener("click", event => {
  if (event.target.closest(".leaflet-control-zoom")) pauseFollowing();
}, true);

locateButton.addEventListener("click", () => {
  if (followPlayer) pauseFollowing();
  else locatePlayer();
});
setFollowing(followPlayer);

// ── UI Elements ─────────────────────────────────────────

const statusEl = document.getElementById("status");
const infoEl = document.getElementById("player-info");
const nameEl = document.getElementById("p-name");
const coordsEl = document.getElementById("p-coords");

const FLOOR_NAMES = ["Ground", "1st Floor", "2nd Floor", "3rd Floor"];

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls;
}

function updatePlayerInfo(data) {
  infoEl.classList.remove("hidden");
  const instanced = data.availability === "instanced";
  locateButton.classList.toggle("hidden", instanced);

  currentPlayerName = data.account?.name || "Your location";
  nameEl.textContent = currentPlayerName;
  const account = data.account;
  const area = instanced ? "Instanced area" : RuneRadarAreas.getArea(data.x, data.y);
  document.getElementById("p-world").textContent = account ? `W${account.world}${area ? ` · ${area}` : ""}` : "";
  document.getElementById("p-hp").textContent = account ? `HP ${account.hitpoints}` : "";
  document.getElementById("p-prayer").textContent = account ? `Prayer ${account.prayer}` : "";
  document.getElementById("p-run").textContent = account ? `Run ${account.runEnergy}%` : "";
  document.getElementById("p-stats").hidden = !account;
  const floor = FLOOR_NAMES[data.plane] || `Floor ${data.plane}`;
  coordsEl.textContent = instanced ? "Position unavailable" : `(${data.x}, ${data.y}) ${floor}`;
}

function hidePlayerInfo() {
  infoEl.classList.add("hidden");
  document.getElementById("locate-btn").classList.add("hidden");
}

function updatePosition(x, y, data) {
  const latlng = gameToLatLng(x, y);
  const plane = data.plane || 0;

  playerPlane = plane;
  if (followPlayer) switchPlane(plane);

  const firstPosition = !playerMarker;
  if (firstPosition && followPlayer) {
    map.setView(latlng, Math.max(map.getZoom(), PLAYER_FOCUS_ZOOM), {animate: false});
  }
  if (!playerMarker) {
    playerMarker = L.marker(latlng, { icon: makePlayerIcon(markerColor), pane: "playerPane", zIndexOffset: 1000 });
    playerMarker.on("click", locatePlayer);
  }

  playerMarker.setLatLng(latlng);
  playerMarker.setIcon(makePlayerIcon(markerColor));

  // Update or create the label
  if (showLocationLabel) {
    const labelText = data.account?.name || "Your location";
    if (!playerLabelMarker) {
      playerLabelMarker = L.marker(latlng, {
        icon: makePlayerLabel(labelText),
        pane: "playerPane",
        interactive: false,
        zIndexOffset: 999,
      }).addTo(map);
    } else {
      playerLabelMarker.setLatLng(latlng);
      playerLabelMarker.setIcon(makePlayerLabel(labelText));
    }
  } else if (playerLabelMarker) {
    map.removeLayer(playerLabelMarker);
    playerLabelMarker = null;
  }

  syncPlayerFloor();
  if (followPlayer) {
    map.panTo(latlng, { animate: true, duration: 0.3 });
  }

  updatePlayerInfo(data);
  objectives.update(data.helpers);
}

// ── Personal connection ─────────────────────────────────
function clearPersonalPosition() {
  clearPlayerPosition();
  objectives.clear();
}

function updateUnavailablePosition(data) {
  clearPlayerPosition();
  updatePlayerInfo({...data, availability: "instanced"});
  // Always replace from the fresh snapshot, including opt-out and changed steps.
  objectives.update(data.helpers);
}

function clearPlayerPosition() {
  if (playerMarker) { map.removeLayer(playerMarker); playerMarker = null; }
  if (playerLabelMarker) { map.removeLayer(playerLabelMarker); playerLabelMarker = null; }
  currentPlayerName = "Your location";
  nameEl.textContent = "";
  coordsEl.textContent = "";
  for (const id of ["p-world", "p-hp", "p-prayer", "p-run"]) document.getElementById(id).textContent = "";
  document.getElementById("p-stats").hidden = true;
  playerPlane = null;
  hidePlayerInfo();
  if (followPlayer) switchPlane(0);
}

const connectionMessages = {
  static: "Open RuneRadar from its RuneLite sidebar to show your location.",
  pairing: "Connecting to RuneLite on this computer…",
  connected: "Connected to RuneLite",
  logged_out: "Connected · Log in to show your location.",
  loading: "Connected · Waiting for the game to load…",
  instanced: "Connected · Position unavailable",
  unavailable: "Connected · Location unavailable here.",
  stale: "Waiting for a fresh location from RuneLite…",
  reconnecting: "Connection lost. Reconnecting to RuneLite…",
  rejected: "Could not connect. Open RuneRadar again in RuneLite; allow local access if asked.",
  disconnected: "Disconnected. Open RuneRadar in RuneLite to pair again."
};
let connectionState = "static";
function createMapConnection(launch) { return RuneRadarConnection.createConnection({
  launch,
  onPosition: data => updatePosition(data.x, data.y, data),
  onClear: clearPersonalPosition,
  onUnavailable: updateUnavailablePosition,
  onState: state => {
    connectionState = state;
    setStatus(connectionMessages[state], ["connected", "logged_out", "loading", "instanced", "unavailable"].includes(state)
      ? "connected" : ["pairing", "reconnecting", "stale"].includes(state) ? "connecting" : "disconnected");
    const button = document.getElementById("settingsDisconnect");
    if (button) button.disabled = ["static", "rejected", "disconnected"].includes(state);
  }
});
}
let connection = createMapConnection(RuneRadarConnection.takeLaunch());
RuneRadarConnection.onLaunch(launch => {
  connection.disconnect();
  connection = createMapConnection(launch);
  connection.start();
});
window.addEventListener("pagehide", () => connection.disconnect());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) connection.checkFreshness();
});

// ── URL Hash Navigation ────────────────────────────────
// Format: #x=3222&y=3218&z=2  (z = zoom level)
// Allows sharing map links that open at a specific location

function readHashParams() {
  const hash = location.hash.slice(1);
  if (!hash) return null;
  const params = {};
  for (const part of hash.split("&")) {
    const [k, v] = part.split("=");
    if (k && v) params[k] = parseFloat(v);
  }
  if (params.x && params.y) return params;
  return null;
}

function applyHashParams() {
  const params = readHashParams();
  if (!params) return;
  const zoom = params.z != null ? params.z : 1;
  map.fire("browsestart");
  map.setView(gameToLatLng(params.x, params.y), zoom);
}

function updateHash() {
  // Personal movement must never become a saved/shareable map URL, including
  // a delayed pan event after disconnect. Static map browsing still supports links.
  if (connectionState !== "static") return;
  const center = map.getCenter();
  // center.lng = x, center.lat = y in our CRS.Simple setup
  const x = Math.round(center.lng);
  const y = Math.round(center.lat);
  const z = map.getZoom();
  history.replaceState(null, "", `#x=${x}&y=${y}&z=${z}`);
}

// Apply hash on load (before connection starts)
applyHashParams();

// Update hash as user pans/zooms (debounced)
let hashUpdateTimer = null;
map.on("moveend", () => {
  clearTimeout(hashUpdateTimer);
  hashUpdateTimer = setTimeout(updateHash, 500);
});

// Handle back/forward navigation
window.addEventListener("hashchange", applyHashParams);

// ── Keyboard Shortcuts ──────────────────────────────────

document.addEventListener("keydown", (e) => {
  // Don't capture shortcuts when typing in an input field
  if (e.target.closest("input, textarea, select, button, summary, a, [contenteditable]")) return;

  if (e.code === "Space" && playerMarker) {
    e.preventDefault();
    locatePlayer();
  }
  if (e.key === "F11") {
    e.preventDefault();
    toggleFullscreen();
  }
});

// ── Initialize Tools ────────────────────────────────────

initCoordinateTools(map, gameToLatLng);
initDistanceTool(map, gameToLatLng);
initCustomMarkers(map, gameToLatLng);
initPathDrawing(map, gameToLatLng);

// ── Minimap ─────────────────────────────────────────────

// The overview uses pre-sized tiles, rather than hundreds of detailed images.
let minimap = null;
let minimapEnabled = true;
const minimapViewport = matchMedia("(min-width: 481px)");
function syncMinimap() {
  if (!minimapEnabled || !minimapViewport.matches) {
    if (minimap) {
      const overviewMap = minimap._miniMap;
      minimap.remove();
      // MiniMap 3.6.1 does not destroy its nested map in onRemove.
      overviewMap.remove();
      minimap = null;
    }
    return;
  }
  if (minimap) return;
  const tiles = L.tileLayer("", {
    minZoom: -3, maxZoom: 5, minNativeZoom: -2, maxNativeZoom: -2, tileSize: 256,
  });
  tiles.createTile = (coords, done) => createIndexedTile(coords, done, true);
  tiles.on("tileunload tileabort", cancelTile);
  minimap = new L.Control.MiniMap(tiles, {
    position: "bottomleft", width: 220, height: 220,
    zoomLevelOffset: -4, toggleDisplay: false,
  }).addTo(map);
  // MiniMap's movement flags assume each programmatic update has finished.
  // Animated overview pans can finish late and undo a newer search/follow action.
  const setOverviewView = minimap._miniMap.setView;
  minimap._miniMap.setView = function (center, zoom, options) {
    return setOverviewView.call(this, center, zoom, {...options, animate: false});
  };
  minimap.getContainer().addEventListener("mousedown", pauseFollowing);
  minimap.getContainer().addEventListener("touchstart", pauseFollowing, {passive: true});
}
minimapViewport.addEventListener("change", syncMinimap);

// Give the local connection and the visible map a chance to paint before POIs.
const baseMapPainted = new Promise(resolve => {
  const finish = () => {
    clearTimeout(fallback);
    localTileLayer.off("load", finish);
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  };
  const fallback = setTimeout(finish, 600);
  localTileLayer.once("load", finish);
});
baseMapPainted.then(syncMinimap);

// ── Map Overlays, Layer Control & Settings ───────────────

function makeSettingsCheckbox(id, label, checked) {
  return `
    <div class="settings-row">
      <input type="checkbox" id="${id}" ${checked ? "checked" : ""}
             style="-webkit-appearance:none;appearance:none;width:16px;height:16px;border:1.5px solid var(--text-muted);
             border-radius:3px;background:${checked ? "var(--accent-bg)" : "var(--bg-surface)"};border-color:${checked ? "var(--accent)" : "var(--text-muted)"};
             cursor:pointer;position:relative;flex-shrink:0;" />
      <span>${label}</span>
    </div>`;
}

function styleCheckbox(el) {
  el.addEventListener("change", () => {
    el.style.background = el.checked ? "var(--accent-bg)" : "var(--bg-surface)";
    el.style.borderColor = el.checked ? "var(--accent)" : "var(--text-muted)";
  });
}

baseMapPainted.then(() => loadMapOverlays(map, gameToLatLng)).then((overlayLayers) => {
  // Add transport layers
  const transportLayers = loadTransportLayers(map, gameToLatLng);
  Object.assign(overlayLayers, transportLayers);

  const control = L.control.layers(null, overlayLayers, {
    position: "topright",
    collapsed: true,
  }).addTo(map);

  const container = control.getContainer();
  const layersList = container.querySelector(".leaflet-control-layers-overlays");

  // ── Reorganize layers into collapsible groups ──
  // POI category names (text content after any <img> tags)
  const poiNames = Object.keys(ICON_CATEGORIES);
  const transportNames = ["Fairy Rings", "Spirit Trees", "Teleports"];
  const labelNames = ["Kingdoms", "Town Names"];

  const groupDefs = [
    { name: "Labels", match: labelNames, collapsed: false },
    { name: "Points of Interest", match: poiNames, collapsed: false },
    { name: "Transport", match: transportNames, collapsed: false },
  ];

  const allLabels = Array.from(layersList.querySelectorAll("label"));
  const fragment = document.createDocumentFragment();

  function getLabelText(label) {
    return label.textContent.trim();
  }

  function toggleAllInGroup(body, checkState) {
    const checkboxes = body.querySelectorAll("input[type='checkbox']");
    checkboxes.forEach(cb => {
      if (cb.checked !== checkState) {
        cb.click(); // Must use click() to trigger Leaflet's internal layer toggle
      }
    });
  }

  for (const group of groupDefs) {
    const groupLabels = allLabels.filter(label => {
      const text = getLabelText(label);
      return group.match.some(m => text.includes(m));
    });
    if (groupLabels.length === 0) continue;

    const header = document.createElement("div");
    header.className = "layer-group-header" + (group.collapsed ? " collapsed" : "");
    header.innerHTML = `<span class="layer-group-name">${group.name}</span>
      <span class="layer-group-controls">
        <span class="layer-group-toggle" title="Check all">✓</span>
        <span class="layer-group-toggle" title="Uncheck all">✗</span>
        <span class="arrow">▼</span>
      </span>`;

    const body = document.createElement("div");
    body.className = "layer-group-body" + (group.collapsed ? " collapsed" : "");
    groupLabels.forEach(l => body.appendChild(l));
    if (!group.collapsed) body.style.maxHeight = "none";

    // Check all / uncheck all buttons
    const toggleBtns = header.querySelectorAll(".layer-group-toggle");
    toggleBtns[0].addEventListener("click", (e) => { e.stopPropagation(); toggleAllInGroup(body, true); });
    toggleBtns[1].addEventListener("click", (e) => { e.stopPropagation(); toggleAllInGroup(body, false); });

    header.addEventListener("click", (e) => {
      if (e.target.classList.contains("layer-group-toggle")) return;
      const isCollapsed = header.classList.toggle("collapsed");
      if (isCollapsed) {
        body.style.maxHeight = body.scrollHeight + "px";
        requestAnimationFrame(() => { body.classList.add("collapsed"); body.style.maxHeight = "0"; });
      } else {
        body.classList.remove("collapsed");
        body.style.maxHeight = body.scrollHeight + "px";
        body.addEventListener("transitionend", () => { if (!body.classList.contains("collapsed")) body.style.maxHeight = "none"; }, { once: true });
      }
    });

    fragment.appendChild(header);
    fragment.appendChild(body);
  }

  // Append any unmatched labels
  allLabels.filter(l => !l.parentElement || l.parentElement === layersList).forEach(l => fragment.appendChild(l));

  layersList.innerHTML = "";
  layersList.appendChild(fragment);

  // Settings panel
  const settingsDiv = document.createElement("div");
  settingsDiv.className = "settings-section";
  settingsDiv.innerHTML = `
    <nav class="settings-links" aria-label="Help and policies"><a href="help.html" target="_blank" rel="noopener">Help</a><a href="privacy.html" target="_blank" rel="noopener">Privacy</a><a href="credits.html" target="_blank" rel="noopener">Credits</a></nav>
    <p id="storage-note" style="font-size:12px;color:var(--text-secondary)" hidden>Browser storage is unavailable. Changes last for this tab only; export drawings to keep them.</p>
    <div class="settings-title">Connection</div>
    <p style="font-size:12px;color:var(--text-secondary);margin:8px 0">Open RuneRadar in the RuneLite sidebar to pair this computer.</p>
    <p class="storage-notice">Clue and quest assistance are optional. Enable each in the RuneRadar plugin settings in RuneLite. <a href="help.html" target="_blank" rel="noopener">Helper support</a></p>
    <button id="settingsDisconnect" type="button" class="theme-select">Disconnect map</button>
    <div class="settings-title" style="margin-top:8px">Theme</div>
    <div class="settings-row">
      <label>Style</label>
      <select id="settingsTheme" class="theme-select">
        <option value="dark"${currentTheme === "dark" ? " selected" : ""}>Dark</option>
        <option value="light"${currentTheme === "light" ? " selected" : ""}>Light</option>
        <option value="game"${currentTheme === "game" ? " selected" : ""}>Old School</option>
      </select>
    </div>
    <div class="settings-title" style="margin-top:8px">Map view</div>
    ${makeSettingsCheckbox("settingsFloorLayouts", "Show upper-floor layouts", showFloorLayouts)}
    <p id="floor-layouts-note" class="storage-notice">Off keeps the ground map while you are upstairs. Upper-floor layouts can be sparse. Supported cave and dungeon maps remain available.</p>
    <div class="settings-title" style="margin-top:8px">Player Settings</div>
    <div class="settings-row">
      <label>Color</label>
      <input type="color" id="settingsColor" value="${markerColor}" />
    </div>
    ${makeSettingsCheckbox("settingsFollow", "Follow when map opens", autoFollow)}
    ${makeSettingsCheckbox("settingsLabel", "Show location label", showLocationLabel)}
    <div class="settings-title" style="margin-top:8px">Font Sizes</div>
    <div class="settings-row">
      <label>Scale</label>
      <input type="range" id="settingsFontScale" min="0.5" max="3" step="0.25" value="${fontScale}"
        style="flex:1;accent-color:var(--accent);" />
      <span id="fontScaleLabel" style="color:var(--text-secondary);font-size:11px;min-width:30px;text-align:right;">${fontScale}x</span>
    </div>
    <div class="settings-title" style="margin-top:8px">UI Visibility</div>
    ${makeSettingsCheckbox("settingsInfoPanel", "Player info panel", true)}
    ${makeSettingsCheckbox("settingsCoords", "Hover coordinates", true)}
    ${makeSettingsCheckbox("settingsSearch", "Search bar", true)}
    ${makeSettingsCheckbox("settingsMinimap", "Minimap", true)}
    ${makeSettingsCheckbox("settingsZoom", "Zoom controls", true)}
  `;
  layersList.parentNode.appendChild(settingsDiv);
  const storageNote = document.getElementById("storage-note");
  storageNote.hidden = MapStorage.persistent;
  window.addEventListener("map-storage-unavailable", () => { storageNote.hidden = false; });

  // Wire up checkboxes
  const floorCb = document.getElementById("settingsFloorLayouts");
  floorCb.setAttribute("aria-label", "Show upper-floor layouts");
  floorCb.setAttribute("aria-describedby", "floor-layouts-note");
  styleCheckbox(floorCb);
  floorCb.addEventListener("change", event => {
    showFloorLayouts = event.target.checked;
    MapStorage.setItem("runeradar-floor-layouts", showFloorLayouts);
    switchPlane(requestedPlane);
    syncPlayerFloor();
    if (playerLabelMarker) playerLabelMarker.setIcon(makePlayerLabel(currentPlayerName));
    objectives.refreshPlane();
  });
  const followCb = document.getElementById("settingsFollow");
  const labelCb = document.getElementById("settingsLabel");
  const infoPanelCb = document.getElementById("settingsInfoPanel");
  const coordsCb = document.getElementById("settingsCoords");
  const searchCb = document.getElementById("settingsSearch");
  const minimapCb = document.getElementById("settingsMinimap");
  const zoomCb = document.getElementById("settingsZoom");
  styleCheckbox(followCb);
  styleCheckbox(labelCb);
  styleCheckbox(infoPanelCb);
  styleCheckbox(coordsCb);
  styleCheckbox(searchCb);
  styleCheckbox(minimapCb);
  styleCheckbox(zoomCb);

  const disconnectButton = document.getElementById("settingsDisconnect");
  disconnectButton.disabled = ["static", "rejected", "disconnected"].includes(connectionState);
  disconnectButton.addEventListener("click", () => connection.disconnect());

  // Theme selector
  document.getElementById("settingsTheme").addEventListener("change", (e) => {
    applyTheme(e.target.value);
  });

  // Color picker
  document.getElementById("settingsColor").addEventListener("input", (e) => {
    markerColor = e.target.value;
    MapStorage.setItem("runeradar-color", markerColor);
    if (playerMarker) playerMarker.setIcon(makePlayerIcon(markerColor));
  });

  // Auto-follow toggle
  followCb.addEventListener("change", (e) => {
    autoFollow = e.target.checked;
    MapStorage.setItem("runeradar-follow", autoFollow);
    setFollowing(autoFollow);
    if (autoFollow) locatePlayer();
  });

  // Label toggle
  labelCb.addEventListener("change", (e) => {
    showLocationLabel = e.target.checked;
    MapStorage.setItem("runeradar-label", showLocationLabel);
    if (!showLocationLabel && playerLabelMarker) {
      map.removeLayer(playerLabelMarker);
      playerLabelMarker = null;
    } else if (showLocationLabel && playerMarker && !playerLabelMarker) {
      playerLabelMarker = L.marker(playerMarker.getLatLng(), {
        icon: makePlayerLabel(currentPlayerName), pane: "playerPane",
        interactive: false, zIndexOffset: 999,
      });
      syncPlayerFloor();
    }
  });

  // Font scale slider
  const fontSlider = document.getElementById("settingsFontScale");
  const fontLabel = document.getElementById("fontScaleLabel");
  if (fontSlider) {
    fontSlider.addEventListener("input", (e) => {
      fontScale = parseFloat(e.target.value);
      fontLabel.textContent = fontScale + "x";
      MapStorage.setItem("runeradar-fontscale", fontScale);
      // Trigger label redraw
      if (typeof window.updateAllLabels === "function") window.updateAllLabels();
    });
  }

  // UI visibility toggles
  let showInfoPanel = true;
  infoPanelCb.addEventListener("change", (e) => {
    showInfoPanel = e.target.checked;
    document.getElementById("player-info").style.display = showInfoPanel ? "" : "none";
  });
  coordsCb.addEventListener("change", (e) => {
    const coordsEl = document.getElementById("hover-coords");
    if (coordsEl) coordsEl.classList.toggle("hidden", !e.target.checked);
  });
  searchCb.addEventListener("change", (e) => {
    document.getElementById("search-container").style.display = e.target.checked ? "" : "none";
  });
  minimapCb.addEventListener("change", (e) => {
    minimapEnabled = e.target.checked;
    syncMinimap();
  });
  zoomCb.addEventListener("change", (e) => {
    const zoomEl = document.querySelector(".leaflet-control-zoom");
    if (zoomEl) zoomEl.style.display = e.target.checked ? "" : "none";
  });
});

// ── Start ───────────────────────────────────────────────
initSearch(map, gameToLatLng);
connection.start();
