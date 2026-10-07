// Saved map preferences/drawings only. Never store live player data or credentials.
const MapStorage = (() => {
  const memory = new Map();
  let persistent = true;
  function unavailable() {
    persistent = false;
    window.dispatchEvent(new Event("map-storage-unavailable"));
  }
  function getItem(key) {
    if (persistent) {
      try {
        const value = window.localStorage.getItem(key);
        if (value === null) memory.delete(key); else memory.set(key, value);
      } catch { unavailable(); }
    }
    return memory.get(key) ?? null;
  }
  function setItem(key, value) {
    memory.set(key, String(value));
    if (persistent) {
      try { window.localStorage.setItem(key, String(value)); } catch { unavailable(); }
    }
  }
  function removeItem(key) {
    memory.delete(key);
    if (persistent) {
      try { window.localStorage.removeItem(key); } catch { unavailable(); }
    }
  }
  const point = p => p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
  function drawings(kind) {
    try {
      const saved = JSON.parse(getItem("runeradar-" + kind) || "[]");
      if (!Array.isArray(saved)) return [];
      return kind === "pins"
        ? saved.filter(p => point(p) && (p.note == null || typeof p.note === "string"))
        : saved.filter(p => Array.isArray(p) && p.length >= 2 && p.length <= 1000 && p.every(point));
    } catch { return []; }
  }
  return {getItem, setItem, removeItem, drawings, get persistent() { return persistent; }};
})();
