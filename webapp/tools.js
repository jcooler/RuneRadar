/**
 * RuneRadar — Map Tools
 * Search, coordinates, distance, pins, paths, transports
 */

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
    const matches = searchIndex.filter((loc) => loc.name.toLowerCase().includes(q)).slice(0, 8);
    if (matches.length === 0) { searchResults.style.display = "none"; return; }
    searchResults.style.display = "block";
    matches.forEach((loc, i) => {
      const div = document.createElement("div");
      div.className = "search-result";
      div.innerHTML = `<span class="sr-name">${loc.name}</span><span class="sr-type">${loc.type}</span>`;
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
  map.on("mousemove", (e) => { if (coordsDisplay) coordsDisplay.textContent = `${Math.round(e.latlng.lng)}, ${Math.round(e.latlng.lat)}`; });
  map.on("mouseout", () => { if (coordsDisplay) coordsDisplay.textContent = ""; });
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
      icon: L.divIcon({ className: "custom-pin", html: `📍${note ? `<div class="pin-label" style="font-size:${pinFs}px">${note}</div>` : ""}`, iconSize: [24, 24], iconAnchor: [12, 24] }),
    }).addTo(markerLayer);
    marker._pinData = { x, y, note };
    marker.on("contextmenu", (e) => { e.originalEvent.preventDefault(); showConfirm(`Remove "${note || "Pin"}"?`, `Delete this pin at (${x}, ${y})?`, () => { markerLayer.removeLayer(marker); saveAllPins(); }, "Remove Pin"); });
    marker.bindTooltip(`(${x}, ${y})${note ? " — " + note : ""}`, { direction: "top", offset: [0, -20] });
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
      item.innerHTML = `<span>📍 ${p.note || "Pin"}</span><span class="pin-coords">(${p.x}, ${p.y})</span>`;
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
      icon: L.divIcon({ className: "transport-icon fairy-ring", html: `<span style="font-size:${fSize}px">${fr.code}</span>`, iconSize: [42, 20], iconAnchor: [21, 30] }),
    }).addTo(fairyLayer).bindTooltip(`${fr.code} — ${fr.name}`, { direction: "top", offset: [0, -12] });
  });
  fairyLayer.addTo(map);
  layers["Fairy Rings"] = fairyLayer;

  // Spirit trees
  const spiritLayer = L.layerGroup();
  SPIRIT_TREES.filter((s) => s.x > 0).forEach((st) => {
    L.marker(gameToLatLng(st.x, st.y), {
      icon: L.divIcon({ className: "transport-icon spirit-tree", html: "🌳", iconSize: [24, 24], iconAnchor: [12, 12] }),
    }).addTo(spiritLayer).bindTooltip(st.name, { direction: "top" });
  });
  spiritLayer.addTo(map);
  layers["Spirit Trees"] = spiritLayer;

  // Teleports
  const teleportLayer = L.layerGroup();
  TELEPORT_LOCATIONS.forEach((tp) => {
    L.marker(gameToLatLng(tp.x, tp.y), {
      icon: L.divIcon({ className: "teleport-icon", html: `<img src="${tp.icon}" alt="${tp.book}" />`, iconSize: [24, 24], iconAnchor: [12, 12] }),
    }).addTo(teleportLayer).bindTooltip(tp.name, { direction: "top" });
  });
  teleportLayer.addTo(map);
  layers["Teleports"] = teleportLayer;

  return layers;
}
