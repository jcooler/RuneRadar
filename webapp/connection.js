/* Loaded in <head>: consume secrets before map navigation or third-party scripts. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    let launch = api.consumeLaunch(root.location, root.history);
    let launchHandler = null;
    root.addEventListener("hashchange", () => {
      const incoming = api.consumeLaunch(root.location, root.history);
      if (!incoming) return;
      if (launchHandler) launchHandler(incoming);
      else launch = incoming;
    });
    root.RuneRadarConnection = {createConnection: api.createConnection,
      onLaunch(handler) { launchHandler = handler; }, takeLaunch() {
      const value = launch; launch = null; return value;
    }};
  }
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const SECRET = /^[A-Za-z0-9_-]{43}$/;
  const AVAILABILITY = new Set(["available", "logged_out", "loading", "instanced", "stale", "unavailable"]);

  function consumeLaunch(location, history) {
    const params = new URLSearchParams(location.hash.slice(1));
    if (!params.has("pair") && !params.has("port")) return null;
    const keys = params.getAll("pair"), ports = params.getAll("port");
    const credential = keys[0], portText = ports[0] || "37780";
    params.delete("pair"); params.delete("port");
    // Erase even malformed credentials. No storage, request parameter or logging.
    history.replaceState(null, "", location.pathname + location.search + (params.size ? "#" + params.toString() : ""));
    const port = Number(portText);
    return keys.length === 1 && ports.length <= 1 && SECRET.test(credential) && /^\d+$/.test(portText) && port >= 1024 && port <= 65535
      ? {credential, port} : null;
  }

  function createConnection(options) {
    const {WebSocketClass = WebSocket, onState, onPosition, onClear,
      now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout} = options;
    let launch = options.launch;
    const port = launch?.port;
    let credential = null, socket = null, active = false, authenticated = false;
    let timeout = null, retry = null, lastSequence = -1, lastSeen = 0, attempts = 0;

    function clearTimers() { clearTimer(timeout); clearTimer(retry); timeout = retry = null; }
    function stop(state, notify = false) {
      const previous = socket;
      socket = null; active = false; authenticated = false; launch = null; credential = null;
      clearTimers(); onClear(); onState(state);
      if (previous) {
        if (notify && previous.readyState === 1) previous.send(JSON.stringify({type: "disconnect", version: 1}));
        previous.close();
      }
    }
    function lost() {
      const previous = socket; socket = null; authenticated = false;
      clearTimers(); onClear();
      if (previous) previous.close();
      if (!credential || ++attempts > 5) { stop("rejected"); return; }
      onState("reconnecting");
      retry = setTimer(connect, Math.min(2000 * attempts, 10000));
    }
    function armTimeout(delay, callback) { clearTimer(timeout); timeout = setTimer(callback, delay); }
    function connect() {
      if (!active) return;
      let current;
      try { current = new WebSocketClass(`ws://127.0.0.1:${port}/`); }
      catch { stop("rejected"); return; }
      socket = current; authenticated = false; lastSequence = -1;
      const live = () => active && socket === current;
      armTimeout(5000, () => { if (live()) stop("rejected"); });
      current.onopen = () => {
        if (!live()) return;
        const mode = credential ? "resume" : "pair";
        const secret = credential || launch?.credential;
        launch = null;
        if (!secret) { stop("rejected"); return; }
        current.send(JSON.stringify({type: "authenticate", version: 1, mode, credential: secret}));
      };
      current.onmessage = event => {
        if (!live()) return;
        try {
          if (typeof event.data !== "string" || event.data.length > 32768) throw new Error();
          const data = JSON.parse(event.data);
          if (data.version !== 1) throw new Error();
          if (data.type === "authenticated" && !authenticated && SECRET.test(data.credential)) {
            credential = data.credential; authenticated = true; attempts = 0;
            lastSeen = now(); armTimeout(7000, lost); return;
          }
          if (!authenticated || data.type !== "snapshot" || !validSnapshot(data)) throw new Error();
          lastSeen = now(); armTimeout(7000, lost);
          if (data.sequence <= lastSequence) return;
          lastSequence = data.sequence;
          if (data.availability === "available") { onPosition({...data.position, account: data.account, helpers: data.helpers}); onState("connected"); }
          else { onClear(); onState(data.availability); }
        } catch { stop("rejected"); }
      };
      current.onclose = event => {
        if (!live()) return;
        if (event.code === 1008 || event.code === 4001) stop("rejected");
        else lost();
      };
      current.onerror = () => {}; // Close event or handshake timeout supplies the actionable state.
    }
    return {
      start() {
        if (active) return;
        if (!launch) { onState("static"); return; }
        active = true; onState("pairing"); connect();
      },
      disconnect() { stop("disconnected", true); },
      checkFreshness() { if (active && authenticated && now() - lastSeen >= 7000) lost(); }
    };
  }

  function validAccount(account) {
    const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
    return typeof account.name === "string" && account.name.length > 0 && account.name.length <= 64 &&
      !/[\u0000-\u001f\u007f]/.test(account.name) && integer(account.world, 1, 65535) &&
      integer(account.hitpoints, 0, 255) && integer(account.prayer, 0, 255) && integer(account.runEnergy, 0, 100);
  }

  function validPoint(point) {
    return point && Number.isInteger(point.x) && point.x >= 0 && point.x <= 65535 &&
      Number.isInteger(point.y) && point.y >= 0 && point.y <= 65535 &&
      Number.isInteger(point.plane) && point.plane >= 0 && point.plane <= 3;
  }
  function optionalHelperText(value, limit) {
    return value == null || (typeof value === "string" && value.length <= limit &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));
  }
  function validHelperTarget(point) {
    return validPoint(point) && optionalHelperText(point.label, 100) && optionalHelperText(point.description, 1200);
  }
  function validHelper(value) {
    if (value == null) return true;
    if (!["active", "idle", "missing", "unsupported"].includes(value.state) ||
        typeof value.title !== "string" || value.title.length > 100 ||
        typeof value.text !== "string" || value.text.length > 1200 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.title + value.text) ||
        !Array.isArray(value.targets) || value.targets.length > 16 || !value.targets.every(validHelperTarget) ||
        !Number.isSafeInteger(value.totalTargets) || value.totalTargets < value.targets.length ||
        value.totalTargets > 10000 || typeof value.approximate !== "boolean" || !optionalHelperText(value.progress, 80)) return false;
    return value.state === "active" || (value.targets.length === 0 && value.totalTargets === 0);
  }

  function validSnapshot(data) {
    if (typeof data.session !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(data.session) ||
        !Number.isSafeInteger(data.sequence) || data.sequence < 0 ||
        !Number.isSafeInteger(data.timestamp) || data.timestamp < 0 || !AVAILABILITY.has(data.availability)) return false;
    if (data.availability !== "available") return data.position == null && data.account == null && data.helpers == null;
    if (data.account != null && !validAccount(data.account)) return false;
    if (data.helpers != null && (typeof data.helpers !== "object" || Array.isArray(data.helpers) ||
        !validHelper(data.helpers.clue) || !validHelper(data.helpers.quest))) return false;
    return validPoint(data.position);
  }
  return {consumeLaunch, createConnection};
});
