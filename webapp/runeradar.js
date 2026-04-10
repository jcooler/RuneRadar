/**
 * RuneRadar — OSRS Live Map
 */

// ── Config ──────────────────────────────────────────────
const RUNERADAR_WS_PORT = 37780;
const HTTP_PORTS = [8080, 8081];
const POLL_INTERVAL = 600;
const RECONNECT_INTERVAL = 3000;

// ── Saved Settings ──────────────────────────────────────
let markerColor = localStorage.getItem("runeradar-color") || "#3eff3e";
let showLocationLabel = localStorage.getItem("runeradar-label") !== "false";
let autoFollow = localStorage.getItem("runeradar-follow") !== "false";

// ── Map Setup ───────────────────────────────────────────

const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -3,
  maxZoom: 5,
  maxNativeZoom: 3,
  zoomSnap: 1,
  zoomDelta: 1,
  attributionControl: true,
});

function gameToLatLng(x, y) {
  return L.latLng(y, x);
}

// ── Tile Layers with Plane Support ──────────────────────

let currentPlane = 0;

// Silent tile loader — hides broken tiles instead of showing broken image icons
function createSilentTile(src, done) {
  const tile = document.createElement("img");
  tile.alt = "";
  tile.crossOrigin = "anonymous";
  tile.onload = function () { done(null, tile); };
  tile.onerror = function () {
    // Replace with transparent 1x1 pixel on failure
    tile.onload = tile.onerror = null;
    tile.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    done(null, tile);
  };
  tile.src = src;
  return tile;
}

// Wiki tiles (base — full ocean coverage, plane 0 only since wiki doesn't have other planes)
const wikiLayer = L.tileLayer("", {
  minZoom: -3, maxZoom: 5, maxNativeZoom: 3, tileSize: 256,
});
wikiLayer.getTileUrl = function (coords) {
  return `https://maps.runescape.wiki/osrs/tiles/0_2019-10-31_1/${coords.z}/0_${coords.x}_${-(coords.y + 1)}.png`;
};
wikiLayer.addTo(map);

// Mejrs tiles (up-to-date, supports all planes)
const mejrsLayer = L.tileLayer("", {
  minZoom: -3, maxZoom: 5, maxNativeZoom: 3, tileSize: 256,
  attribution: 'Map &copy; <a href="https://oldschool.runescape.wiki">OSRS Wiki</a> + <a href="https://github.com/mejrs/layers_osrs">mejrs</a>',
});
mejrsLayer.getTileUrl = function (coords) {
  return `https://raw.githubusercontent.com/mejrs/layers_osrs/refs/heads/master/mapsquares/-1/${coords.z}/${currentPlane}_${coords.x}_${-(coords.y + 1)}.png`;
};
mejrsLayer.createTile = function (coords, done) {
  return createSilentTile(this.getTileUrl(coords), done);
};
mejrsLayer.addTo(map);

/** Switch the map to show a different plane (floor level) */
function switchPlane(newPlane) {
  if (newPlane === currentPlane) return;
  currentPlane = newPlane;
  // Show/hide wiki base depending on plane (wiki only has plane 0)
  if (newPlane === 0) {
    if (!map.hasLayer(wikiLayer)) wikiLayer.addTo(map);
  } else {
    if (map.hasLayer(wikiLayer)) map.removeLayer(wikiLayer);
  }
  // Force mejrs to reload with new plane prefix
  mejrsLayer.redraw();
}

map.setView(gameToLatLng(3222, 3218), 0);

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
  return L.divIcon({
    className: "player-label",
    html: name || "Your Location",
    iconSize: [100, 20],
    iconAnchor: [50, 30],
  });
}

let playerMarker = null;
let playerLabelMarker = null;
let followPlayer = autoFollow;
let currentPlayerName = "Your Location";

map.on("mousedown", () => {
  if (autoFollow) return; // don't break follow if auto-follow is on
  followPlayer = false;
});

// ── Locate Button ───────────────────────────────────────

document.getElementById("locate-btn").addEventListener("click", () => {
  if (playerMarker) {
    followPlayer = true;
    map.panTo(playerMarker.getLatLng());
  }
});

// ── UI Elements ─────────────────────────────────────────

const statusEl = document.getElementById("status");
const infoEl = document.getElementById("player-info");
const nameEl = document.getElementById("p-name");
const coordsEl = document.getElementById("p-coords");
const hpEl = document.getElementById("p-hp");
const prayEl = document.getElementById("p-pray");
const runEl = document.getElementById("p-run");

const FLOOR_NAMES = ["Ground", "1st Floor", "2nd Floor", "3rd Floor"];

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls;
}

function updatePlayerInfo(data) {
  infoEl.classList.remove("hidden");
  document.getElementById("locate-btn").classList.remove("hidden");

  currentPlayerName = data.name || "Player";
  nameEl.textContent = currentPlayerName;
  const floor = FLOOR_NAMES[data.plane] || `Floor ${data.plane}`;
  const instanceTag = data.instanced ? " · Instanced" : "";
  coordsEl.textContent = `(${data.x}, ${data.y}) ${floor}${data.world ? " · W" + data.world : ""}${instanceTag}`;
  hpEl.textContent = data.hitpoints || "?";
  prayEl.textContent = data.prayer || "?";
  runEl.textContent = data.runEnergy || "?";
}

function hidePlayerInfo() {
  infoEl.classList.add("hidden");
  document.getElementById("locate-btn").classList.add("hidden");
}

function updatePosition(x, y, data) {
  const latlng = gameToLatLng(x, y);
  const plane = data.plane || 0;

  // Switch plane/floor if it changed
  switchPlane(plane);

  if (!playerMarker) {
    playerMarker = L.marker(latlng, { icon: makePlayerIcon(markerColor), zIndexOffset: 1000 }).addTo(map);
    playerMarker.on("click", () => {
      followPlayer = true;
      map.panTo(playerMarker.getLatLng());
    });
    followPlayer = true;
  }

  playerMarker.setLatLng(latlng);
  playerMarker.setIcon(makePlayerIcon(markerColor));

  // Update or create the label
  if (showLocationLabel) {
    const labelText = data.name || "Your Location";
    if (!playerLabelMarker) {
      playerLabelMarker = L.marker(latlng, {
        icon: makePlayerLabel(labelText),
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

  if (followPlayer || autoFollow) {
    map.panTo(latlng, { animate: true, duration: 0.3 });
  }

  updatePlayerInfo(data);
}

// ── Quest Helper Rendering ──────────────────────────────

const questLayer = L.layerGroup().addTo(map);
let questTargetMarker = null;
let questPathLine = null;
let questInfoEl = null;

function handleQuestHelper(data) {
  // Clear old quest markers
  questLayer.clearLayers();
  questTargetMarker = null;
  questPathLine = null;

  if (!data.quest) {
    // Quest deselected — hide info
    if (questInfoEl) questInfoEl.style.display = "none";
    return;
  }

  // Show quest info panel
  if (!questInfoEl) {
    questInfoEl = document.createElement("div");
    questInfoEl.id = "quest-info";
    questInfoEl.style.cssText = "position:fixed;top:56px;left:12px;z-index:1000;background:rgba(13,17,23,0.9);border:1px solid #30363d;border-radius:8px;padding:8px 12px;backdrop-filter:blur(8px);max-width:300px;";
    document.body.appendChild(questInfoEl);
  }
  questInfoEl.style.display = "block";
  questInfoEl.innerHTML = `
    <div style="color:#f0c040;font-size:13px;font-weight:600;">📜 ${data.quest}</div>
    ${data.stepText ? `<div style="color:#c9d1d9;font-size:12px;margin-top:4px;">${data.stepText}</div>` : ""}
  `;

  // Draw target waypoint markers
  if (data.waypoints && data.waypoints.length > 0) {
    data.waypoints.forEach((wp) => {
      const marker = L.marker(gameToLatLng(wp.x, wp.y), {
        icon: L.divIcon({
          className: "",
          html: '<div style="width:14px;height:14px;background:#f0c040;border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px #f0c040cc;animation:pulse 2s ease-in-out infinite;"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
        zIndexOffset: 900,
      }).addTo(questLayer);
      marker.bindTooltip(`Quest target: ${data.quest}`, { direction: "top" });
      questTargetMarker = marker;
    });
  }

  // Draw path line
  if (data.path && data.path.length > 1) {
    questPathLine = L.polyline(
      data.path.map((p) => gameToLatLng(p.x, p.y)),
      { color: "#f0c040", weight: 3, opacity: 0.7, dashArray: "8,6" }
    ).addTo(questLayer);
  }
}

// ── Data Source: RuneRadar WebSocket ─────────────────────

let ws = null;
let wsConnected = false;

function connectWebSocket() {
  try { ws = new WebSocket(`ws://127.0.0.1:${RUNERADAR_WS_PORT}`); } catch { return; }

  ws.onopen = () => {
    wsConnected = true;
    setStatus("Connected (RuneRadar)", "connected");
    setTimeout(() => { if (statusEl.classList.contains("connected")) statusEl.style.opacity = "0.5"; }, 2000);
  };
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "position") updatePosition(data.x, data.y, data);
      else if (data.type === "questHelper") handleQuestHelper(data);
      else if (data.type === "logout") handleLogout();
    } catch {}
  };
  ws.onclose = () => { wsConnected = false; ws = null; };
  ws.onerror = () => {};
}

// ── Data Source: HTTP Polling ─────────────────────────────

let httpPolling = false;
let activeHttpPort = null;
let lastX = 0, lastY = 0;

async function pollHttp() {
  const ports = activeHttpPort ? [activeHttpPort] : HTTP_PORTS;
  for (const port of ports) {
    try {
      const [eventsRes, statsRes] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/events`),
        fetch(`http://127.0.0.1:${port}/stats`).catch(() => null),
      ]);
      const events = await eventsRes.json();
      const stats = statsRes ? await statsRes.json() : null;
      if (events.worldX && events.worldY) {
        activeHttpPort = port;
        if (events.worldX !== lastX || events.worldY !== lastY) {
          lastX = events.worldX; lastY = events.worldY;
          updatePosition(events.worldX, events.worldY, {
            name: stats?.username || "Player", x: events.worldX, y: events.worldY,
            plane: events.plane || 0, world: null,
            hitpoints: events.health || events.real_health || "?",
            prayer: "?", runEnergy: events.run_energy || "?",
          });
        }
        if (!httpPolling) {
          httpPolling = true;
          setStatus(`Connected (HTTP :${port})`, "connected");
          setTimeout(() => { if (statusEl.classList.contains("connected")) statusEl.style.opacity = "0.5"; }, 2000);
        }
        return;
      }
    } catch {}
  }
  if (httpPolling) { httpPolling = false; activeHttpPort = null; }
}

// ── Connection Manager ──────────────────────────────────

function startConnectionLoop() {
  setStatus("Connecting to RuneLite...", "connecting");
  connectWebSocket();
  setInterval(() => { if (!wsConnected) pollHttp(); }, POLL_INTERVAL);
  setInterval(() => {
    if (!wsConnected && (!ws || ws.readyState === WebSocket.CLOSED)) connectWebSocket();
    if (!wsConnected && !httpPolling) {
      setStatus("Waiting for RuneLite...", "disconnected");
      statusEl.style.opacity = "1";
    }
  }, RECONNECT_INTERVAL);
}

function handleLogout() {
  if (playerMarker) { map.removeLayer(playerMarker); playerMarker = null; }
  if (playerLabelMarker) { map.removeLayer(playerLabelMarker); playerLabelMarker = null; }
  questLayer.clearLayers();
  if (questInfoEl) questInfoEl.style.display = "none";
  hidePlayerInfo();
  switchPlane(0);
  setStatus("Player logged out", "disconnected");
}

// ── Keyboard Shortcuts ──────────────────────────────────

document.addEventListener("keydown", (e) => {
  // Don't capture shortcuts when typing in an input field
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  if (e.code === "Space" && playerMarker) {
    e.preventDefault();
    followPlayer = true;
    map.panTo(playerMarker.getLatLng());
  }
});

// ── Initialize Tools ────────────────────────────────────

initCoordinateTools(map, gameToLatLng);
initDistanceTool(map, gameToLatLng);
initCustomMarkers(map, gameToLatLng);
initPathDrawing(map, gameToLatLng);

// ── Minimap ─────────────────────────────────────────────

const minimapTiles = L.tileLayer("", { minZoom: -3, maxZoom: 5, maxNativeZoom: 3, tileSize: 256 });
minimapTiles.getTileUrl = function (coords) {
  return `https://maps.runescape.wiki/osrs/tiles/0_2019-10-31_1/${coords.z}/0_${coords.x}_${-(coords.y + 1)}.png`;
};
const minimap = new L.Control.MiniMap(minimapTiles, {
  position: "bottomright",
  width: 220,
  height: 220,
  zoomLevelOffset: -4,
  toggleDisplay: true,
}).addTo(map);

// ── Map Overlays, Layer Control & Settings ───────────────

function makeSettingsCheckbox(id, label, checked) {
  return `
    <div class="settings-row">
      <input type="checkbox" id="${id}" ${checked ? "checked" : ""}
             style="-webkit-appearance:none;appearance:none;width:16px;height:16px;border:1.5px solid #484f58;
             border-radius:3px;background:${checked ? "#1f6feb" : "#161b22"};border-color:${checked ? "#58a6ff" : "#484f58"};
             cursor:pointer;position:relative;flex-shrink:0;" />
      <span>${label}</span>
    </div>`;
}

function styleCheckbox(el) {
  el.addEventListener("change", () => {
    el.style.background = el.checked ? "#1f6feb" : "#161b22";
    el.style.borderColor = el.checked ? "#58a6ff" : "#484f58";
  });
}

loadMapOverlays(map, gameToLatLng).then((overlayLayers) => {
  // Add transport layers
  const transportLayers = loadTransportLayers(map, gameToLatLng);
  Object.assign(overlayLayers, transportLayers);

  // Quest helper layer
  overlayLayers["Quest Waypoints"] = questLayer;

  const control = L.control.layers(null, overlayLayers, {
    position: "topright",
    collapsed: true,
  }).addTo(map);

  const container = control.getContainer();
  const layersList = container.querySelector(".leaflet-control-layers-overlays");

  // Settings panel
  const settingsDiv = document.createElement("div");
  settingsDiv.className = "settings-section";
  settingsDiv.innerHTML = `
    <div class="settings-title">Player Settings</div>
    <div class="settings-row">
      <label>Color</label>
      <input type="color" id="settingsColor" value="${markerColor}" />
    </div>
    ${makeSettingsCheckbox("settingsFollow", "Auto-follow player", autoFollow)}
    ${makeSettingsCheckbox("settingsLabel", "Show name label", showLocationLabel)}
    <div class="settings-title" style="margin-top:8px">UI Visibility</div>
    ${makeSettingsCheckbox("settingsInfoPanel", "Player info panel", true)}
    ${makeSettingsCheckbox("settingsSearch", "Search bar", true)}
    ${makeSettingsCheckbox("settingsMinimap", "Minimap", true)}
    ${makeSettingsCheckbox("settingsZoom", "Zoom controls", true)}
  `;
  layersList.parentNode.appendChild(settingsDiv);

  // Wire up checkboxes
  const followCb = document.getElementById("settingsFollow");
  const labelCb = document.getElementById("settingsLabel");
  const infoPanelCb = document.getElementById("settingsInfoPanel");
  const searchCb = document.getElementById("settingsSearch");
  const minimapCb = document.getElementById("settingsMinimap");
  const zoomCb = document.getElementById("settingsZoom");
  styleCheckbox(followCb);
  styleCheckbox(labelCb);
  styleCheckbox(infoPanelCb);
  styleCheckbox(searchCb);
  styleCheckbox(minimapCb);
  styleCheckbox(zoomCb);

  // Color picker
  document.getElementById("settingsColor").addEventListener("input", (e) => {
    markerColor = e.target.value;
    localStorage.setItem("runeradar-color", markerColor);
    if (playerMarker) playerMarker.setIcon(makePlayerIcon(markerColor));
  });

  // Auto-follow toggle
  followCb.addEventListener("change", (e) => {
    autoFollow = e.target.checked;
    followPlayer = autoFollow;
    localStorage.setItem("runeradar-follow", autoFollow);
    if (autoFollow && playerMarker) {
      map.panTo(playerMarker.getLatLng());
    }
  });

  // Label toggle
  labelCb.addEventListener("change", (e) => {
    showLocationLabel = e.target.checked;
    localStorage.setItem("runeradar-label", showLocationLabel);
    if (!showLocationLabel && playerLabelMarker) {
      map.removeLayer(playerLabelMarker);
      playerLabelMarker = null;
    } else if (showLocationLabel && playerMarker && !playerLabelMarker) {
      playerLabelMarker = L.marker(playerMarker.getLatLng(), {
        icon: makePlayerLabel(currentPlayerName),
        interactive: false, zIndexOffset: 999,
      }).addTo(map);
    }
  });

  // UI visibility toggles
  let showInfoPanel = true;
  infoPanelCb.addEventListener("change", (e) => {
    showInfoPanel = e.target.checked;
    document.getElementById("player-info").style.display = showInfoPanel ? "" : "none";
  });
  searchCb.addEventListener("change", (e) => {
    document.getElementById("search-container").style.display = e.target.checked ? "" : "none";
  });
  minimapCb.addEventListener("change", (e) => {
    const minimapEl = document.querySelector(".leaflet-control-minimap");
    if (minimapEl) minimapEl.style.display = e.target.checked ? "" : "none";
  });
  zoomCb.addEventListener("change", (e) => {
    const zoomEl = document.querySelector(".leaflet-control-zoom");
    if (zoomEl) zoomEl.style.display = e.target.checked ? "" : "none";
  });
});

// ── Start ───────────────────────────────────────────────
initSearch(map, gameToLatLng);
startConnectionLoop();
