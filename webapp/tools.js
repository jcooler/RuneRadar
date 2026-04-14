/**
 * RuneRadar — Map Tools
 * Search, coordinates, distance, pins, paths, transports
 */

// ── HTML Escaping (XSS prevention) ─────────────────────
function escHtmlTools(str) {
  if (typeof str !== "string") return String(str ?? "");
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ── Active Tool State (only one tool at a time) ─────────

let activeTool = null; // "measure" | "pin" | "path" | null

function setActiveTool(toolName, map) {
  // Deactivate all tools
  ["measure-btn", "pin-btn", "path-btn"].forEach((id) => {
    document.getElementById(id)?.classList.remove("active");
  });
  map.getContainer().style.cursor = "";

  if (activeTool === toolName) {
    // Toggle off
    activeTool = null;
    return false;
  }
  activeTool = toolName;
  document.getElementById(toolName + "-btn")?.classList.add("active");
  map.getContainer().style.cursor = "crosshair";
  return true;
}

// ── Search ──────────────────────────────────────────────

function initSearch(map, gameToLatLng) {
  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");
  const clearBtn = document.getElementById("search-clear");
  if (!searchInput) return;

  const searchIndex = [];
  if (typeof TOWN_LABELS !== "undefined") TOWN_LABELS.forEach((t) => searchIndex.push({ name: t.name, x: t.x, y: t.y, type: "Town" }));
  if (typeof KINGDOM_LABELS !== "undefined") KINGDOM_LABELS.forEach((k) => searchIndex.push({ name: k.name, x: k.x, y: k.y, type: "Region" }));
  if (typeof FAIRY_RINGS !== "undefined") FAIRY_RINGS.forEach((f) => searchIndex.push({ name: `${f.code} — ${f.name}`, x: f.x, y: f.y, type: "Fairy Ring" }));
  if (typeof SPIRIT_TREES !== "undefined") SPIRIT_TREES.filter((s) => s.x > 0).forEach((s) => searchIndex.push({ name: s.name, x: s.x, y: s.y, type: "Spirit Tree" }));
  if (typeof TELEPORT_LOCATIONS !== "undefined") TELEPORT_LOCATIONS.forEach((t) => searchIndex.push({ name: t.name, x: t.x, y: t.y, type: t.book }));

  // Add named POIs (quests, minigames, dungeons) to search
  function addNamedPois(lookup, type) {
    if (typeof lookup === "undefined") return;
    const seen = new Set();
    for (const [key, name] of Object.entries(lookup)) {
      if (seen.has(name)) continue;
      seen.add(name);
      const [x, y] = key.split(",").map(Number);
      searchIndex.push({ name, x, y, type });
    }
  }
  // Add supplemental new-area POIs to search
  if (typeof NEW_AREA_POIS !== "undefined") {
    const seen = new Set();
    NEW_AREA_POIS.forEach(p => {
      if (p.name && !seen.has(p.name)) { seen.add(p.name); searchIndex.push({ name: p.name, x: p.x, y: p.y, type: p.icon.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }); }
    });
  }

  if (typeof QUEST_NAMES !== "undefined") addNamedPois(QUEST_NAMES, "Quest");
  if (typeof MINIGAME_NAMES !== "undefined") addNamedPois(MINIGAME_NAMES, "Minigame");
  if (typeof DUNGEON_NAMES !== "undefined") addNamedPois(DUNGEON_NAMES, "Dungeon");
  if (typeof DUNGEON_LINK_NAMES !== "undefined") addNamedPois(DUNGEON_LINK_NAMES, "Dungeon");

  // Allow cache icons to be added to search after async load
  window._addCacheIconsToSearch = function (features, nameTable) {
    const seen = new Set();
    for (const f of features) {
      const [x, y] = f.geometry.coordinates;
      const iconKey = f.properties.icon;
      const coordKey = x + "," + y;
      // Use named lookup if available, otherwise use icon type as name
      const name = (nameTable && nameTable[coordKey]) ||
        iconKey.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const dedupKey = name + ":" + x + "," + y;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      const type = iconKey.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      searchIndex.push({ name, x, y, type });
    }
  };

  let selectedIdx = -1;

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = ""; searchResults.style.display = "none"; clearBtn.style.display = "none"; searchInput.focus();
    });
  }

  searchInput.addEventListener("input", () => {
    if (clearBtn) clearBtn.style.display = searchInput.value.length > 0 ? "" : "none";
    const q = searchInput.value.toLowerCase().trim();
    searchResults.innerHTML = ""; selectedIdx = -1;
    if (q.length < 2) { searchResults.style.display = "none"; return; }
    // Search name first, then type — prioritize name matches
    const nameMatches = searchIndex.filter((loc) => loc.name.toLowerCase().includes(q));
    const typeMatches = nameMatches.length < 15
      ? searchIndex.filter((loc) => !loc.name.toLowerCase().includes(q) && loc.type.toLowerCase().includes(q))
      : [];
    const matches = [...nameMatches, ...typeMatches].slice(0, 15);
    if (matches.length === 0) { searchResults.style.display = "none"; return; }
    searchResults.style.display = "block";
    matches.forEach((loc, i) => {
      const div = document.createElement("div");
      div.className = "search-result";
      div.innerHTML = `<span class="sr-name">${escHtmlTools(loc.name)}</span><span class="sr-type">${escHtmlTools(loc.type)}</span>`;
      div.addEventListener("click", () => { map.setView(gameToLatLng(loc.x, loc.y), 2); searchResults.style.display = "none"; searchInput.value = loc.name; searchInput.blur(); });
      div.addEventListener("mouseenter", () => { selectedIdx = i; const els = searchResults.querySelectorAll(".search-result"); els.forEach((el, j) => el.classList.toggle("active", j === i)); });
      searchResults.appendChild(div);
    });
  });

  searchInput.addEventListener("keydown", (e) => {
    const items = searchResults.querySelectorAll(".search-result");
    if (e.key === "ArrowDown") { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, items.length - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); }
    else if (e.key === "Enter" && selectedIdx >= 0 && items[selectedIdx]) { e.preventDefault(); items[selectedIdx].click(); return; }
    else if (e.key === "Escape") { searchResults.style.display = "none"; searchInput.blur(); return; }
    items.forEach((el, i) => el.classList.toggle("active", i === selectedIdx));
  });

  document.addEventListener("click", (e) => { if (!e.target.closest("#search-container")) searchResults.style.display = "none"; });
}

// ── Coordinate Display + Right-Click Copy ───────────────

function initCoordinateTools(map) {
  const coordsDisplay = document.getElementById("hover-coords");
  map.on("mousemove", (e) => { if (coordsDisplay) { coordsDisplay.textContent = `${Math.round(e.latlng.lng)}, ${Math.round(e.latlng.lat)}`; coordsDisplay.style.display = ""; } });
  map.on("mouseout", () => { if (coordsDisplay) { coordsDisplay.textContent = ""; coordsDisplay.style.display = "none"; } });
  map.on("contextmenu", (e) => {
    if (activeTool) return; // don't copy coords when a tool is active
    e.originalEvent.preventDefault();
    const text = `${Math.round(e.latlng.lng)}, ${Math.round(e.latlng.lat)}`;
    navigator.clipboard.writeText(text).then(() => showToast(`Copied: (${text})`)).catch(() => showToast(`(${text})`));
  });
}

// ── Confirm Modal ───────────────────────────────────────

function showConfirm(title, msg, onConfirm, btnLabel) {
  const ov = document.getElementById("modal-overlay");
  const cm = document.getElementById("confirm-modal");
  const yes = document.getElementById("confirm-yes");
  const no = document.getElementById("confirm-no");
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-msg").textContent = msg;
  yes.textContent = btnLabel || "Delete All";
  ov.style.display = "block"; cm.style.display = "block";
  function hide() { ov.style.display = "none"; cm.style.display = "none"; yes.onclick = null; no.onclick = null; ov.onclick = null; }
  yes.onclick = () => { hide(); onConfirm(); };
  no.onclick = hide;
  ov.onclick = hide;
}

function showToast(msg) {
  let toast = document.getElementById("toast");
  if (!toast) { toast = document.createElement("div"); toast.id = "toast"; document.body.appendChild(toast); }
  toast.textContent = msg; toast.style.display = "block"; toast.style.opacity = "1";
  setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.style.display = "none", 300); }, 1500);
}

// ── Distance Measurement ────────────────────────────────

function initDistanceTool(map, gameToLatLng) {
  let startPoint = null;
  let measureLine = null;
  let measureLabel = null;
  const btn = document.getElementById("measure-btn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const active = setActiveTool("measure", map);
    if (!active) clearMeasure();
  });

  map.on("click", (e) => {
    if (activeTool !== "measure") return;
    const x = Math.round(e.latlng.lng), y = Math.round(e.latlng.lat);
    if (!startPoint) {
      startPoint = { x, y, latlng: e.latlng };
    } else {
      const dist = Math.max(Math.abs(x - startPoint.x), Math.abs(y - startPoint.y));
      if (measureLine) map.removeLayer(measureLine);
      if (measureLabel) map.removeLayer(measureLabel);
      measureLine = L.polyline([startPoint.latlng, e.latlng], { color: "#58a6ff", weight: 2, dashArray: "6,4" }).addTo(map);
      const mid = gameToLatLng((startPoint.x + x) / 2, (startPoint.y + y) / 2);
      const mSize = Math.round(16 * (typeof fontScale !== "undefined" ? fontScale : 1));
      measureLabel = L.marker(mid, { icon: L.divIcon({ className: "measure-label", html: `<span style="font-size:${mSize}px">${dist} tiles</span>`, iconSize: [0, 0] }), interactive: false }).addTo(map);
      startPoint = null;
    }
  });

  function clearMeasure() {
    startPoint = null;
    if (measureLine) { map.removeLayer(measureLine); measureLine = null; }
    if (measureLabel) { map.removeLayer(measureLabel); measureLabel = null; }
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && activeTool === "measure") { setActiveTool(null, map); clearMeasure(); }
  });
}

// ── Custom Pins ─────────────────────────────────────────

function initCustomMarkers(map, gameToLatLng) {
  const markerLayer = L.layerGroup().addTo(map);
  let pendingLatLng = null;
  const btn = document.getElementById("pin-btn");
  const modal = document.getElementById("pin-modal");
  const overlay = document.getElementById("modal-overlay");
  const noteInput = document.getElementById("pin-note-input");
  const saveBtn = document.getElementById("pin-save");
  const cancelBtn = document.getElementById("pin-cancel");
  if (!btn) return;

  // Load saved
  JSON.parse(localStorage.getItem("runeradar-pins") || "[]").forEach((p) => addPin(p.x, p.y, p.note));

  btn.addEventListener("click", () => { setActiveTool("pin", map); });

  // Right-click button shows pin list
  btn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const pl = document.getElementById("pin-list");
    pl.style.display = pl.style.display === "block" ? "none" : "block";
    updatePinList();
  });

  map.on("click", (e) => {
    if (activeTool !== "pin") return;
    pendingLatLng = e.latlng;
    modal.style.display = "block"; overlay.style.display = "block";
    noteInput.value = ""; noteInput.focus();
  });

  function hideModal() { modal.style.display = "none"; overlay.style.display = "none"; setActiveTool(null, map); }

  saveBtn.addEventListener("click", () => {
    if (!pendingLatLng) return;
    addPin(Math.round(pendingLatLng.lng), Math.round(pendingLatLng.lat), noteInput.value.trim());
    saveAllPins(); hideModal();
  });
  cancelBtn.addEventListener("click", hideModal);
  noteInput.addEventListener("keydown", (e) => { if (e.key === "Enter") saveBtn.click(); if (e.key === "Escape") hideModal(); });

  function addPin(x, y, note) {
    const pinFs = Math.round(13 * (typeof fontScale !== "undefined" ? fontScale : 1));
    const marker = L.marker(gameToLatLng(x, y), {
      icon: L.divIcon({ className: "custom-pin", html: `📍${note ? `<div class="pin-label" style="font-size:${pinFs}px">${escHtmlTools(note)}</div>` : ""}`, iconSize: [24, 24], iconAnchor: [12, 24] }),
    }).addTo(markerLayer);
    marker._pinData = { x, y, note };
    marker.on("contextmenu", (e) => { e.originalEvent.preventDefault(); showConfirm(`Remove "${escHtmlTools(note) || "Pin"}"?`, `Delete this pin at (${x}, ${y})?`, () => { markerLayer.removeLayer(marker); saveAllPins(); }, "Remove Pin"); });
    marker.bindTooltip(`(${x}, ${y})${note ? " — " + escHtmlTools(note) : ""}`, { direction: "top", offset: [0, -20] });
  }

  function saveAllPins() {
    const pins = []; markerLayer.eachLayer((l) => { if (l._pinData) pins.push(l._pinData); });
    localStorage.setItem("runeradar-pins", JSON.stringify(pins));
  }

  function updatePinList() {
    const pl = document.getElementById("pin-list");
    const pins = JSON.parse(localStorage.getItem("runeradar-pins") || "[]");
    pl.innerHTML = pins.length === 0 ? '<div class="empty-msg">No pins yet</div>' : "";
    pins.forEach((p) => {
      const item = document.createElement("div"); item.className = "pin-item";
      item.innerHTML = `<span>📍 ${escHtmlTools(p.note || "Pin")}</span><span class="pin-coords">(${p.x}, ${p.y})</span>`;
      item.addEventListener("click", () => { map.setView(gameToLatLng(p.x, p.y), 2); pl.style.display = "none"; });
      pl.appendChild(item);
    });
  }

  // Clear all button
  const clearBtn = document.getElementById("clear-drawings-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      showConfirm("Clear everything?", "This will delete ALL of your saved pins and drawn paths. This cannot be undone.", () => {
        markerLayer.clearLayers(); localStorage.removeItem("runeradar-pins"); localStorage.removeItem("runeradar-paths");
        if (window._pathLayer) window._pathLayer.clearLayers();
        showToast("Cleared all pins & paths");
      });
    });
  }

  // ── Export / Import Pins & Paths ──

  window.exportPinsAndPaths = function () {
    const data = {
      pins: JSON.parse(localStorage.getItem("runeradar-pins") || "[]"),
      paths: JSON.parse(localStorage.getItem("runeradar-paths") || "[]"),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "runeradar-markers.json";
    a.click();
    URL.revokeObjectURL(url);
    if (typeof showToast === "function") showToast("Exported pins & paths");
  };

  window.importPinsAndPaths = function () {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.pins && Array.isArray(data.pins)) {
            // Validate and merge with existing pins (avoid exact duplicates)
            const validPins = data.pins.filter(p =>
              typeof p.x === "number" && typeof p.y === "number" &&
              isFinite(p.x) && isFinite(p.y) &&
              (p.note === undefined || typeof p.note === "string")
            ).map(p => ({ x: Math.round(p.x), y: Math.round(p.y), note: (p.note || "").slice(0, 200) }));
            const existing = JSON.parse(localStorage.getItem("runeradar-pins") || "[]");
            const existingKeys = new Set(existing.map(p => p.x + "," + p.y));
            for (const pin of validPins) {
              const key = pin.x + "," + pin.y;
              if (!existingKeys.has(key)) {
                existing.push(pin);
                addPin(pin.x, pin.y, pin.note);
              }
            }
            localStorage.setItem("runeradar-pins", JSON.stringify(existing));
          }
          if (data.paths && Array.isArray(data.paths)) {
            // Validate path point arrays
            const validPaths = data.paths.filter(path =>
              Array.isArray(path) && path.length >= 2 && path.length <= 1000 &&
              path.every(p => typeof p.x === "number" && typeof p.y === "number" && isFinite(p.x) && isFinite(p.y))
            );
            const existingPaths = JSON.parse(localStorage.getItem("runeradar-paths") || "[]");
            existingPaths.push(...validPaths);
            localStorage.setItem("runeradar-paths", JSON.stringify(existingPaths));
            // Reload paths would require re-init — just notify user
          }
          if (typeof showToast === "function") {
            showToast(`Imported ${(data.pins || []).length} pins, ${(data.paths || []).length} paths`);
          }
        } catch {
          if (typeof showToast === "function") showToast("Invalid file format");
        }
      };
      reader.readAsText(file);
    });
    input.click();
  };

  return markerLayer;
}

// ── Path Drawing ────────────────────────────────────────

function initPathDrawing(map, gameToLatLng) {
  const pathLayer = L.layerGroup().addTo(map);
  window._pathLayer = pathLayer; // reference for clear-all
  let currentPath = [];
  let currentLine = null;
  const btn = document.getElementById("path-btn");
  if (!btn) return;

  // Load saved
  JSON.parse(localStorage.getItem("runeradar-paths") || "[]").forEach((p) => addSavedPath(p));

  btn.addEventListener("click", () => {
    if (activeTool === "path") {
      // Finish current path
      finishPath();
      setActiveTool(null, map);
    } else {
      setActiveTool("path", map);
      currentPath = [];
      btn.title = "Click map to add points, click ✏️ to finish";
    }
  });

  // Right-click button shows path list
  btn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const pl = document.getElementById("pin-list");
    updatePathList(pl);
    pl.style.display = pl.style.display === "block" ? "none" : "block";
  });

  map.on("click", (e) => {
    if (activeTool !== "path") return;
    const x = Math.round(e.latlng.lng), y = Math.round(e.latlng.lat);
    currentPath.push({ x, y });
    if (currentLine) pathLayer.removeLayer(currentLine);
    if (currentPath.length > 1) {
      currentLine = L.polyline(currentPath.map((p) => gameToLatLng(p.x, p.y)), { color: "#ff6b6b", weight: 3, opacity: 0.8 }).addTo(pathLayer);
    }
  });

  function finishPath() {
    if (currentPath.length >= 2) {
      addSavedPath(currentPath);
      if (currentLine) { pathLayer.removeLayer(currentLine); currentLine = null; }
      savePaths();
    }
    currentPath = []; currentLine = null;
    btn.title = "Draw path";
  }

  function calcPathLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      total += Math.round(Math.sqrt(dx * dx + dy * dy));
    }
    return total;
  }

  function addSavedPath(points) {
    if (points.length < 2) return;
    const start = points[0], end = points[points.length - 1];
    const totalDist = calcPathLength(points);

    const line = L.polyline(points.map((p) => gameToLatLng(p.x, p.y)), { color: "#ff6b6b", weight: 3, opacity: 0.8 }).addTo(pathLayer);
    line._pathData = points;

    line.bindTooltip(
      `(${start.x}, ${start.y}) → (${end.x}, ${end.y})<br>${totalDist} tiles total · ${points.length} points`,
      { sticky: true }
    );

    line.on("contextmenu", (e) => {
      e.originalEvent.preventDefault();
      showConfirm("Remove this path?", `Delete path from (${start.x}, ${start.y}) to (${end.x}, ${end.y})? (${totalDist} tiles total, ${points.length} points)`, () => {
        pathLayer.removeLayer(line); savePaths();
      }, "Remove Path");
    });
  }

  function savePaths() {
    const paths = [];
    pathLayer.eachLayer((l) => { if (l._pathData) paths.push(l._pathData); });
    localStorage.setItem("runeradar-paths", JSON.stringify(paths));
  }

  function updatePathList(pl) {
    const paths = JSON.parse(localStorage.getItem("runeradar-paths") || "[]");
    pl.innerHTML = paths.length === 0 ? '<div class="empty-msg">No paths yet</div>' : "";
    paths.forEach((points) => {
      const start = points[0], end = points[points.length - 1];
      const totalDist = calcPathLength(points);
      const item = document.createElement("div"); item.className = "pin-item";
      item.innerHTML = `<span>✏️ ${totalDist} tiles</span><span class="pin-coords">(${start.x}, ${start.y}) → (${end.x}, ${end.y})</span>`;
      item.addEventListener("click", () => {
        const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        map.setView(gameToLatLng(mid.x, mid.y), 1); pl.style.display = "none";
      });
      pl.appendChild(item);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && activeTool === "path") { finishPath(); setActiveTool(null, map); }
  });

  return pathLayer;
}

// ── Transport Network ───────────────────────────────────

function loadTransportLayers(map, gameToLatLng) {
  const layers = {};

  // Fairy rings
  const fairyLayer = L.layerGroup();
  const fs = typeof fontScale !== "undefined" ? fontScale : 1;
  FAIRY_RINGS.forEach((fr) => {
    const fSize = Math.round(12 * fs);
    L.marker(gameToLatLng(fr.x, fr.y), {
      icon: L.divIcon({ className: "transport-icon fairy-ring", html: `<span style="font-size:${fSize}px"><img src="https://oldschool.runescape.wiki/images/Fairy_ring_icon.png" style="height:${Math.round(fSize * 1.4)}px;vertical-align:middle;image-rendering:pixelated;margin-right:3px;" />${fr.code}</span>`, iconSize: [60, 24], iconAnchor: [30, 30] }),
    }).addTo(fairyLayer).bindTooltip(`${fr.code} — ${fr.name}`, { direction: "top", offset: [0, -12] });
  });
  fairyLayer.addTo(map);
  const icoStyle = "width:15px;height:15px;vertical-align:middle;image-rendering:pixelated;margin-right:4px;";
  layers[`<img src="icons/1504.png" style="${icoStyle}" />Fairy Rings`] = fairyLayer;

  // Spirit trees
  const spiritLayer = L.layerGroup();
  SPIRIT_TREES.filter((s) => s.x > 0).forEach((st) => {
    L.marker(gameToLatLng(st.x, st.y), {
      icon: L.divIcon({ className: "transport-icon spirit-tree", html: "🌳", iconSize: [24, 24], iconAnchor: [12, 12] }),
    }).addTo(spiritLayer).bindTooltip(st.name, { direction: "top" });
  });
  spiritLayer.addTo(map);
  layers[`<img src="icons/1504.png" style="${icoStyle}" />Spirit Trees`] = spiritLayer;

  // Teleports
  const teleportLayer = L.layerGroup();
  TELEPORT_LOCATIONS.forEach((tp) => {
    L.marker(gameToLatLng(tp.x, tp.y), {
      icon: L.divIcon({ className: "teleport-icon", html: `<img src="${tp.icon}" alt="${tp.book}" />`, iconSize: [24, 24], iconAnchor: [12, 12] }),
    }).addTo(teleportLayer).bindTooltip(tp.name, { direction: "top" });
  });
  teleportLayer.addTo(map);
  layers[`<img src="icons/1504.png" style="${icoStyle}" />Teleports`] = teleportLayer;

  return layers;
}
