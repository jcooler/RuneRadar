/**
 * RuneRadar — OSRS Live Map
 */

// escHtml() defined in social.js (loaded first)

// ── Config ──────────────────────────────────────────────
const RUNERADAR_WS_PORT = 37780;
const HTTP_PORTS = [8080, 8081];
const POLL_INTERVAL = 600;
const RECONNECT_INTERVAL = 3000;

// ── Saved Settings ──────────────────────────────────────
let markerColor = localStorage.getItem("runeradar-color") || "#3eff3e";
let showLocationLabel = localStorage.getItem("runeradar-label") !== "false";
let autoFollow = localStorage.getItem("runeradar-follow") !== "false";
let fontScale = parseFloat(localStorage.getItem("runeradar-fontscale") || "1.0");
let currentTheme = localStorage.getItem("runeradar-theme") || "dark";

// ── Theme System ────────────────────────────────────────

function applyTheme(theme) {
  currentTheme = theme;
  document.body.className = `theme-${theme}`;
  localStorage.setItem("runeradar-theme", theme);
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

// Silent tile loader — hides broken tiles instead of showing broken image icons
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

// Wiki tiles (base — ocean/background coverage for areas our cache doesn't have)
const wikiLayer = L.tileLayer("", {
  minZoom: -3, maxZoom: 5, maxNativeZoom: 3, tileSize: 256,
});
wikiLayer.getTileUrl = function (coords) {
  return `https://maps.runescape.wiki/osrs/tiles/0_2019-10-31_1/${coords.z}/0_${coords.x}_${-(coords.y + 1)}.png`;
};
wikiLayer.addTo(map);

// Local tiles (generated from OSRS game cache — our own data, all planes)
const localTileLayer = L.tileLayer("", {
  minZoom: -3, maxZoom: 5, maxNativeZoom: 2, tileSize: 256,
});
localTileLayer.getTileUrl = function (coords) {
  return `tiles/2/${currentPlane}_${coords.x}_${-(coords.y + 1)}.png`;
};
localTileLayer.createTile = function (coords, done) {
  const wikiUrl = `https://maps.runescape.wiki/osrs/tiles/0_2019-10-31_1/${coords.z}/0_${coords.x}_${-(coords.y + 1)}.png`;
  return createSilentTile(this.getTileUrl(coords), done, currentPlane === 0 ? wikiUrl : null);
};
localTileLayer.addTo(map);

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
  // Reload local tiles with new plane
  localTileLayer.redraw();
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
  const size = Math.round(16 * fontScale);
  return L.divIcon({
    className: "player-label",
    html: `<span style="font-size:${size}px">${escHtml(name || "Your Location")}</span>`,
    iconSize: [120, 24],
    iconAnchor: [60, 34],
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
    map.setView(playerMarker.getLatLng(), Math.max(map.getZoom(), 1), { animate: true });
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
    questInfoEl.style.cssText = "position:fixed;top:56px;right:12px;z-index:1000;background:var(--bg-panel);border:1px solid #f0c040;border-radius:8px;padding:10px 14px;backdrop-filter:blur(10px);max-width:340px;";
    document.body.appendChild(questInfoEl);
  }
  questInfoEl.style.display = "block";
  const hasWp = data.waypoints && data.waypoints.length > 0;
  const wp = hasWp ? data.waypoints[0] : null;
  questInfoEl.innerHTML = `
    <div style="color:#f0c040;font-size:14px;font-weight:700;">📜 ${escHtml(data.quest)}</div>
    ${data.stepText ? `<div style="color:var(--text);font-size:13px;margin-top:6px;line-height:1.5;">${escHtml(data.stepText)}</div>` : ""}
    ${wp ? `<div style="color:var(--text-secondary);font-size:11px;margin-top:8px;">(${wp.x}, ${wp.y})</div>` : ""}
    <button id="quest-goto" style="background:var(--accent-bg);color:#fff;border:none;border-radius:5px;padding:5px 12px;font-size:12px;cursor:pointer;font-weight:600;margin-top:8px;width:100%;">Go to location</button>
  `;
  document.getElementById("quest-goto")?.addEventListener("click", () => {
    if (wp) {
      map.setView(gameToLatLng(wp.x, wp.y), 2, { animate: true });
    } else if (questTargetMarker) {
      map.setView(questTargetMarker.getLatLng(), 2, { animate: true });
    }
  });

  // Draw target waypoint markers with quest icon
  if (data.waypoints && data.waypoints.length > 0) {
    data.waypoints.forEach((wp) => {
      const questFontSize = Math.round(13 * fontScale);
      const questIconSize = Math.round(28 * fontScale);
      const marker = L.marker(gameToLatLng(wp.x, wp.y), {
        icon: L.divIcon({
          className: "",
          html: `<div style="text-align:center;">
            <div style="color:#f0c040;font-size:${questFontSize}px;font-weight:700;white-space:nowrap;text-shadow:0 0 4px #000,0 0 4px #000;margin-bottom:2px;">${escHtml(data.quest)}</div>
            <img src="icons/1454.png" style="width:${questIconSize}px;height:${questIconSize}px;image-rendering:pixelated;filter:drop-shadow(0 0 6px #f0c040);" />
          </div>`,
          iconSize: [120, 48],
          iconAnchor: [60, 48],
        }),
        zIndexOffset: 900,
      }).addTo(questLayer);
      marker.bindTooltip(`${escHtml(data.quest)} (${wp.x}, ${wp.y})`, { direction: "top", offset: [0, -10] });
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

// ── Clue Scroll Rendering ───────────────────────────────

const clueLayer = L.layerGroup().addTo(map);
let clueMarker = null;
let clueInfoEl = null;

function handleClueScroll(data) {
  clueLayer.clearLayers();
  clueMarker = null;

  if (!data.location) {
    if (clueInfoEl) clueInfoEl.style.display = "none";
    return;
  }

  // Show clue info
  if (!clueInfoEl) {
    clueInfoEl = document.createElement("div");
    clueInfoEl.id = "clue-info";
    clueInfoEl.style.cssText = "position:fixed;top:56px;left:60px;z-index:1000;background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:10px 14px;backdrop-filter:blur(10px);max-width:340px;";
    document.body.appendChild(clueInfoEl);
  }
  clueInfoEl.style.display = "block";

  // Format clue text — escape first, then highlight keywords
  let formattedText = escHtml(data.text || "");
  // Highlight "equip" and items in green/red (safe: regex only matches known words)
  formattedText = formattedText
    .replace(/(equip|wear|wield)/gi, '<span style="color:#4CAF50;font-weight:600;">$1</span>')
    .replace(/(unequip|remove|nothing)/gi, '<span style="color:#EF5350;font-weight:600;">$1</span>')
    .replace(/(dig|search|talk to|speak to|open|use|dance|wave|clap|bow|cry|laugh|jig|spin|headbang|salute|cheer|beckon|jump|yawn|shrug|blow kiss|panic|raspberry|stomp|flap|slap head)/gi, '<span style="color:#FFA726;font-weight:600;">$1</span>');

  const locName = escHtml(data.locationName || "");
  clueInfoEl.innerHTML = `
    <div style="color:#8b5cf6;font-size:14px;font-weight:700;">🗺️ Clue: ${escHtml(data.clueType || "Scroll")}</div>
    ${locName ? `<div style="color:var(--accent);font-size:13px;margin-top:4px;font-weight:600;">${locName}</div>` : ""}
    ${formattedText ? `<div style="color:var(--text);font-size:13px;margin-top:6px;line-height:1.5;">${formattedText}</div>` : ""}
    <div style="color:var(--text-secondary);font-size:11px;margin-top:8px;">(${data.location.x}, ${data.location.y})</div>
    <button id="clue-goto" style="background:var(--accent-bg);color:#fff;border:none;border-radius:5px;padding:5px 12px;font-size:12px;cursor:pointer;font-weight:600;margin-top:6px;width:100%;">Go to location</button>
  `;

  document.getElementById("clue-goto")?.addEventListener("click", () => {
    map.setView(gameToLatLng(data.location.x, data.location.y), 2, { animate: true });
  });

  // Place marker with clue scroll icon
  const loc = data.location;
  const clueLabel = escHtml(data.clueType || "Clue");
  const clueFontSize = Math.round(15 * fontScale);
  const clueIconSize = Math.round(32 * fontScale);
  clueMarker = L.marker(gameToLatLng(loc.x, loc.y), {
    icon: L.divIcon({
      className: "",
      html: `<div style="text-align:center;">
        <div style="color:#ffffff;font-size:${clueFontSize}px;font-weight:700;white-space:nowrap;text-shadow:2px 2px 3px #000,0 0 8px #000,-1px -1px 2px #000;margin-bottom:4px;">${clueLabel}</div>
        <img src="https://oldschool.runescape.wiki/images/Clue_scroll_%28medium%29.png" style="width:${clueIconSize}px;height:${clueIconSize}px;image-rendering:pixelated;filter:drop-shadow(0 0 8px #8b5cf6);" />
      </div>`,
      iconSize: [120, 52],
      iconAnchor: [60, 52],
    }),
    zIndexOffset: 900,
  }).addTo(clueLayer);
  clueMarker.bindTooltip(`${clueLabel} (${loc.x}, ${loc.y})`, { direction: "top", offset: [0, -10] });
}

// ── Quest State Tracking ────────────────────────────────

let questStates = {}; // { "Cook's Assistant": "completed", ... }
let questFilter = localStorage.getItem("runeradar-questfilter") || "all"; // "all", "hide_completed", "hide_not_started"

function handleQuestStates(data) {
  if (!data.quests) return;
  questStates = {};
  for (const q of data.quests) {
    questStates[q.name] = q.state;
  }
  applyQuestStates();
}

function applyQuestStates() {
  if (!window._questMarkers) return;
  for (const marker of window._questMarkers) {
    const name = marker._questName;
    const state = questStates[name];
    // Update tooltip with state
    if (state) {
      const stateLabel = state === "completed" ? " ✓" : state === "in_progress" ? " ◆" : "";
      marker.unbindTooltip();
      marker.bindTooltip(name + stateLabel, { direction: "top", offset: [0, -8] });
    }
    // Update opacity based on filter
    const el = marker.getElement?.();
    if (!el) continue;
    if (questFilter === "hide_completed" && state === "completed") {
      el.style.opacity = "0.15";
    } else if (questFilter === "hide_not_started" && state === "not_started") {
      el.style.opacity = "0.15";
    } else {
      el.style.opacity = "";
    }
  }
}

function setQuestFilter(filter) {
  questFilter = filter;
  localStorage.setItem("runeradar-questfilter", filter);
  applyQuestStates();
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
      else if (data.type === "clueScroll") handleClueScroll(data);
      else if (data.type === "questStates") handleQuestStates(data);
      else if (data.type === "logout") handleLogout();
      else if (data.type === "peer_position" || data.type === "peer_join"
        || data.type === "peer_leave" || data.type === "room_joined"
        || data.type === "room_created") handlePluginPeerMessage(data);
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

let connectEnabled = localStorage.getItem("runeradar-connect") !== "false";

function setConnectEnabled(enabled) {
  connectEnabled = enabled;
  localStorage.setItem("runeradar-connect", enabled);
  if (!enabled) {
    // Disconnect and hide status
    if (ws) { ws.close(); ws = null; }
    wsConnected = false;
    httpPolling = false;
    activeHttpPort = null;
    statusEl.style.display = "none";
  } else {
    statusEl.style.display = "";
    setStatus("Connecting to RuneLite...", "connecting");
    connectWebSocket();
  }
}

function startConnectionLoop() {
  if (!connectEnabled) {
    statusEl.style.display = "none";
    return;
  }
  setStatus("Connecting to RuneLite...", "connecting");
  connectWebSocket();
  setInterval(() => { if (connectEnabled && !wsConnected) pollHttp(); }, POLL_INTERVAL);
  setInterval(() => {
    if (!connectEnabled) return;
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
  clueLayer.clearLayers();
  if (questInfoEl) questInfoEl.style.display = "none";
  if (clueInfoEl) clueInfoEl.style.display = "none";
  hidePlayerInfo();
  switchPlane(0);
  setStatus("Player logged out", "disconnected");
}

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
  map.setView(gameToLatLng(params.x, params.y), zoom);
  followPlayer = false;
}

function updateHash() {
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
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  if (e.code === "Space" && playerMarker) {
    e.preventDefault();
    followPlayer = true;
    map.setView(playerMarker.getLatLng(), Math.max(map.getZoom(), 1), { animate: true });
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

// Custom tile layer: local cache tiles first, wiki fallback for ocean/gaps
const minimapTiles = L.tileLayer("", { minZoom: -3, maxZoom: 5, maxNativeZoom: 2, tileSize: 256 });
minimapTiles.createTile = function (coords, done) {
  const localUrl = `tiles/2/0_${coords.x}_${-(coords.y + 1)}.png`;
  const wikiUrl = `https://maps.runescape.wiki/osrs/tiles/0_2019-10-31_1/${coords.z}/0_${coords.x}_${-(coords.y + 1)}.png`;
  return createSilentTile(localUrl, done, wikiUrl);
};
const minimap = new L.Control.MiniMap(minimapTiles, {
  position: "bottomleft",
  width: 220,
  height: 220,
  zoomLevelOffset: -4,
  toggleDisplay: false,
}).addTo(map);

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

loadMapOverlays(map, gameToLatLng).then((overlayLayers) => {
  // Add transport layers
  const transportLayers = loadTransportLayers(map, gameToLatLng);
  Object.assign(overlayLayers, transportLayers);

  // Quest, clue, friends layers — with icons for context
  const _i = (src, label) => `<img src="${src}" style="width:15px;height:15px;vertical-align:middle;image-rendering:pixelated;margin-right:4px;" />${label}`;
  const W = "https://oldschool.runescape.wiki/images";
  overlayLayers[_i("icons/1454.png", "Quest Waypoints")] = questLayer;
  overlayLayers[_i(`${W}/Clue_scroll.png`, "Clue Scroll")] = clueLayer;
  overlayLayers[_i(`${W}/Friends_List.png`, "Friends")] = peerLayer;

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
  const pluginNames = ["Quest Waypoints", "Clue Scroll", "Friends"];
  const labelNames = ["Kingdoms", "Town Names"];

  const groupDefs = [
    { name: "Labels", match: labelNames, collapsed: false },
    { name: "Points of Interest", match: poiNames, collapsed: false },
    { name: "Transport", match: transportNames, collapsed: false },
    { name: "Plugin", match: pluginNames, collapsed: false },
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
    header.innerHTML = `<span>${group.name}</span>
      <span class="layer-group-toggle" title="Check all">✓</span>
      <span class="layer-group-toggle" title="Uncheck all">✗</span>
      <span class="arrow">▼</span>`;

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
    <div class="settings-title">Connection</div>
    ${makeSettingsCheckbox("settingsConnect", "Connect to RuneLite", connectEnabled)}
    <div class="settings-title" style="margin-top:8px">Theme</div>
    <div class="settings-row">
      <label>Style</label>
      <select id="settingsTheme" class="theme-select">
        <option value="dark"${currentTheme === "dark" ? " selected" : ""}>Dark</option>
        <option value="light"${currentTheme === "light" ? " selected" : ""}>Light</option>
        <option value="game"${currentTheme === "game" ? " selected" : ""}>Old School</option>
      </select>
    </div>
    <div class="settings-title" style="margin-top:8px">Quest Icons</div>
    <div class="settings-row">
      <label>Filter</label>
      <select id="settingsQuestFilter" class="theme-select">
        <option value="all"${questFilter === "all" ? " selected" : ""}>Show All</option>
        <option value="hide_completed"${questFilter === "hide_completed" ? " selected" : ""}>Fade Completed</option>
        <option value="hide_not_started"${questFilter === "hide_not_started" ? " selected" : ""}>Fade Not Started</option>
      </select>
    </div>
    <div class="settings-title" style="margin-top:8px">Player Settings</div>
    <div class="settings-row">
      <label>Color</label>
      <input type="color" id="settingsColor" value="${markerColor}" />
    </div>
    ${makeSettingsCheckbox("settingsFollow", "Auto-follow player", autoFollow)}
    ${makeSettingsCheckbox("settingsLabel", "Show name label", showLocationLabel)}
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

  // Wire up checkboxes
  const connectCb = document.getElementById("settingsConnect");
  const followCb = document.getElementById("settingsFollow");
  const labelCb = document.getElementById("settingsLabel");
  const infoPanelCb = document.getElementById("settingsInfoPanel");
  const coordsCb = document.getElementById("settingsCoords");
  const searchCb = document.getElementById("settingsSearch");
  const minimapCb = document.getElementById("settingsMinimap");
  const zoomCb = document.getElementById("settingsZoom");
  styleCheckbox(connectCb);
  styleCheckbox(followCb);
  styleCheckbox(labelCb);
  styleCheckbox(infoPanelCb);
  styleCheckbox(coordsCb);
  styleCheckbox(searchCb);
  styleCheckbox(minimapCb);
  styleCheckbox(zoomCb);

  // Connection toggle
  connectCb.addEventListener("change", (e) => {
    setConnectEnabled(e.target.checked);
  });

  // Theme selector
  document.getElementById("settingsTheme").addEventListener("change", (e) => {
    applyTheme(e.target.value);
  });

  // Quest filter
  document.getElementById("settingsQuestFilter").addEventListener("change", (e) => {
    setQuestFilter(e.target.value);
  });

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

  // Font scale slider
  const fontSlider = document.getElementById("settingsFontScale");
  const fontLabel = document.getElementById("fontScaleLabel");
  if (fontSlider) {
    fontSlider.addEventListener("input", (e) => {
      fontScale = parseFloat(e.target.value);
      fontLabel.textContent = fontScale + "x";
      localStorage.setItem("runeradar-fontscale", fontScale);
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
initSocial(map, gameToLatLng);
startConnectionLoop();
