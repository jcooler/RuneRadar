/**
 * RuneRadar Relay Server — v3.1 (Security hardened)
 *
 * SECURITY:
 * - Position data is E2E encrypted — relay forwards opaque blobs
 * - No position data logged or persisted
 * - Per-IP connection limits
 * - Per-socket rate limiting (including pre-auth)
 * - RSN format validation (OSRS rules: 1-12 chars, alphanumeric + space/hyphen/underscore)
 * - Input length validation on all fields
 * - Re-identify cleans up previous state
 * - Stale cleanup collects before deleting
 */

const { WebSocketServer } = require("ws");

const PORT = parseInt(process.env.PORT) || 9550;
const HEARTBEAT_INTERVAL = 30_000;
const STALE_TIMEOUT = 90_000;
const RATE_LIMIT_PER_SEC = 5;
const MAX_FRIENDS = 400;
const MAX_RSN_LEN = 12;
const MAX_GROUP_NAME_LEN = 20;
const MAX_ENCRYPTED_LEN = 1024;
const MAX_CONNECTIONS_PER_IP = 5;
const POSITION_THROTTLE_MS = 300;

const RSN_REGEX = /^[a-zA-Z0-9 _-]{1,12}$/;

// ── Per-IP tracking ──
const connsByIp = new Map(); // ip → count

// ── Indexes ──
const playersByRsn = new Map();
const playersByWs = new Map();
const reverseFriends = new Map();
const groupMembers = new Map();

// ── Per-socket rate limiting (pre-auth) ──
const socketRateLimits = new WeakMap();

function checkSocketRateLimit(ws) {
  let rl = socketRateLimits.get(ws);
  if (!rl) { rl = { count: 0, start: Date.now() }; socketRateLimits.set(ws, rl); }
  const now = Date.now();
  if (now - rl.start > 1000) { rl.count = 0; rl.start = now; }
  return ++rl.count <= RATE_LIMIT_PER_SEC;
}

// ── Player State ──

class PlayerState {
  constructor(ws, rsn) {
    this.ws = ws;
    this.rsn = rsn;
    this.rsnLower = rsn.toLowerCase();
    this.friends = new Set();
    this.clan = null;
    this.fc = null;
    this.shareFriends = false;
    this.shareClan = false;
    this.shareFc = false;
    this.encryptedPosition = null;
    this.lastPing = Date.now();
    this.lastPositionBroadcast = 0;
    this._recipientCache = null;
    this._recipientCacheDirty = true;
  }

  invalidateRecipientCache() {
    this._recipientCacheDirty = true;
    this._recipientCache = null;
  }
}

// ── Index Management ──

function addToReverseFriends(playerRsnLower, friendRsnLower) {
  if (!reverseFriends.has(friendRsnLower)) reverseFriends.set(friendRsnLower, new Set());
  reverseFriends.get(friendRsnLower).add(playerRsnLower);
}

function removeFromReverseFriends(playerRsnLower, friendRsnLower) {
  const set = reverseFriends.get(friendRsnLower);
  if (set) { set.delete(playerRsnLower); if (set.size === 0) reverseFriends.delete(friendRsnLower); }
}

function addToGroup(groupKey, player) {
  if (!groupMembers.has(groupKey)) groupMembers.set(groupKey, new Set());
  groupMembers.get(groupKey).add(player);
}

function removeFromGroup(groupKey, player) {
  const set = groupMembers.get(groupKey);
  if (set) { set.delete(player); if (set.size === 0) groupMembers.delete(groupKey); }
}

function getRecipients(player) {
  if (!player._recipientCacheDirty && player._recipientCache) return player._recipientCache;

  const recipients = new Set();

  if (player.shareFriends) {
    const whoAddedMe = reverseFriends.get(player.rsnLower);
    if (whoAddedMe) {
      for (const otherRsnLower of whoAddedMe) {
        if (!player.friends.has(otherRsnLower)) continue;
        const other = playersByRsn.get(otherRsnLower);
        if (!other || other === player || !other.shareFriends) continue;
        recipients.add(other);
      }
    }
  }

  if (player.shareClan && player.clan) {
    const members = groupMembers.get("clan:" + player.clan);
    if (members) for (const other of members) { if (other !== player && other.shareClan) recipients.add(other); }
  }

  if (player.shareFc && player.fc) {
    const members = groupMembers.get("fc:" + player.fc);
    if (members) for (const other of members) { if (other !== player && other.shareFc) recipients.add(other); }
  }

  player._recipientCache = [...recipients];
  player._recipientCacheDirty = false;
  return player._recipientCache;
}

function getVia(player, other) {
  const via = [];
  if (player.shareFriends && other.shareFriends && player.friends.has(other.rsnLower) && other.friends.has(player.rsnLower)) via.push("friends");
  if (player.shareClan && other.shareClan && player.clan && player.clan === other.clan) via.push("clan");
  if (player.shareFc && other.shareFc && player.fc && player.fc === other.fc) via.push("fc");
  return via;
}

// ── Message Handlers ──

function handleIdentify(ws, data) {
  const rsn = (data.rsn || "").trim();
  if (!RSN_REGEX.test(rsn)) {
    return send(ws, { type: "error", message: "Invalid RSN format" });
  }

  // Clean up any previous identity for this socket
  disconnectPlayer(ws);

  // Reject if RSN already online (don't kick — prevents abuse)
  const existing = playersByRsn.get(rsn.toLowerCase());
  if (existing) {
    return send(ws, { type: "error", message: "RSN already online" });
  }

  const player = new PlayerState(ws, rsn);
  playersByRsn.set(rsn.toLowerCase(), player);
  playersByWs.set(ws, player);
  send(ws, { type: "identified", rsn });
}

function handleSocialUpdate(ws, player, data) {
  if (Array.isArray(data.friends)) {
    const newFriends = new Set(
      data.friends.slice(0, MAX_FRIENDS)
        .filter(f => typeof f === "string")
        .map(f => f.toLowerCase().trim())
        .filter(f => f.length > 0 && f.length <= MAX_RSN_LEN)
    );
    for (const oldFriend of player.friends) {
      if (!newFriends.has(oldFriend)) removeFromReverseFriends(player.rsnLower, oldFriend);
    }
    for (const newFriend of newFriends) {
      if (!player.friends.has(newFriend)) addToReverseFriends(player.rsnLower, newFriend);
    }
    player.friends = newFriends;
  }

  if (data.clan !== undefined) {
    const newClan = (typeof data.clan === "string" && data.clan.length <= MAX_GROUP_NAME_LEN)
      ? data.clan.toLowerCase().trim() || null : null;
    if (player.clan !== newClan) {
      if (player.clan) removeFromGroup("clan:" + player.clan, player);
      if (newClan) addToGroup("clan:" + newClan, player);
      player.clan = newClan;
    }
  }

  if (data.fc !== undefined) {
    const newFc = (typeof data.fc === "string" && data.fc.length <= MAX_GROUP_NAME_LEN)
      ? data.fc.toLowerCase().trim() || null : null;
    if (player.fc !== newFc) {
      if (player.fc) removeFromGroup("fc:" + player.fc, player);
      if (newFc) addToGroup("fc:" + newFc, player);
      player.fc = newFc;
    }
  }

  if (data.shareFriends !== undefined) player.shareFriends = !!data.shareFriends;
  if (data.shareClan !== undefined) player.shareClan = !!data.shareClan;
  if (data.shareFc !== undefined) player.shareFc = !!data.shareFc;

  invalidateAllCaches(player);
  sendPeerList(player);
  notifyPeersOfJoin(player);
}

function handlePosition(ws, player, data) {
  const now = Date.now();
  if (now - player.lastPositionBroadcast < POSITION_THROTTLE_MS) return;
  player.lastPositionBroadcast = now;

  // Validate encrypted payload
  if (typeof data.encrypted !== "string" || data.encrypted.length > MAX_ENCRYPTED_LEN) return;
  player.encryptedPosition = data.encrypted;

  const recipients = getRecipients(player);
  if (recipients.length === 0) return;

  const baseMsg = { type: "peer_position", rsn: player.rsn, encrypted: data.encrypted };
  for (const recipient of recipients) {
    if (recipient.ws.readyState !== 1) continue;
    recipient.ws.send(JSON.stringify({ ...baseMsg, via: getVia(player, recipient) }));
  }
}

function handlePing(ws, player) {
  player.lastPing = Date.now();
  send(ws, { type: "pong" });
}

// ── Peer List ──

function sendPeerList(player) {
  const recipients = getRecipients(player);
  const allVisible = new Set(recipients);
  for (const other of recipients) {
    const theirRecipients = getRecipients(other);
    if (theirRecipients.includes(player)) allVisible.add(other);
  }

  const peers = [];
  for (const other of allVisible) {
    const via = getVia(player, other);
    if (via.length === 0) continue;
    peers.push({ rsn: other.rsn, encrypted: other.encryptedPosition, via });
  }
  send(player.ws, { type: "peer_list", peers });
}

function notifyPeersOfJoin(player) {
  for (const other of getRecipients(player)) {
    if (other.ws.readyState !== 1) continue;
    send(other.ws, { type: "peer_join", rsn: player.rsn, encrypted: player.encryptedPosition, via: getVia(other, player) });
  }
}

function notifyPeersOfLeave(player) {
  for (const other of getRecipients(player)) {
    if (other.ws.readyState !== 1) continue;
    send(other.ws, { type: "peer_leave", rsn: player.rsn });
  }
}

function invalidateAllCaches(player) {
  player.invalidateRecipientCache();
  const whoAddedMe = reverseFriends.get(player.rsnLower);
  if (whoAddedMe) for (const otherRsn of whoAddedMe) { const o = playersByRsn.get(otherRsn); if (o) o.invalidateRecipientCache(); }
  if (player.clan) { const m = groupMembers.get("clan:" + player.clan); if (m) for (const p of m) p.invalidateRecipientCache(); }
  if (player.fc) { const m = groupMembers.get("fc:" + player.fc); if (m) for (const p of m) p.invalidateRecipientCache(); }
}

// ── Utility ──

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function disconnectPlayer(ws) {
  const player = playersByWs.get(ws);
  if (!player) return;

  for (const friendRsn of player.friends) removeFromReverseFriends(player.rsnLower, friendRsn);
  if (player.clan) removeFromGroup("clan:" + player.clan, player);
  if (player.fc) removeFromGroup("fc:" + player.fc, player);

  player.encryptedPosition = null;
  notifyPeersOfLeave(player);
  invalidateAllCaches(player);
  playersByRsn.delete(player.rsnLower);
  playersByWs.delete(ws);
}

// ── Server ──

const wss = new WebSocketServer({
  port: PORT,
  maxPayload: 4096,
  perMessageDeflate: false,
  verifyClient: (info) => {
    const ip = info.req.socket.remoteAddress;
    const count = connsByIp.get(ip) || 0;
    if (count >= MAX_CONNECTIONS_PER_IP) return false;
    return true;
  },
});

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  connsByIp.set(ip, (connsByIp.get(ip) || 0) + 1);

  ws.on("close", () => {
    disconnectPlayer(ws);
    const count = connsByIp.get(ip) || 1;
    if (count <= 1) connsByIp.delete(ip); else connsByIp.set(ip, count - 1);
  });
  ws.on("error", () => {
    disconnectPlayer(ws);
    const count = connsByIp.get(ip) || 1;
    if (count <= 1) connsByIp.delete(ip); else connsByIp.set(ip, count - 1);
  });

  send(ws, { type: "welcome", version: "3.1.0" });

  ws.on("message", (raw) => {
    if (!checkSocketRateLimit(ws)) {
      return send(ws, { type: "error", message: "Rate limited" });
    }

    let data;
    try { data = JSON.parse(raw); } catch {
      return send(ws, { type: "error", message: "Invalid JSON" });
    }

    const player = playersByWs.get(ws);

    switch (data.type) {
      case "identify":
        handleIdentify(ws, data);
        break;
      case "social_update":
        if (!player) return send(ws, { type: "error", message: "Must identify first" });
        handleSocialUpdate(ws, player, data);
        break;
      case "position":
        if (player) handlePosition(ws, player, data);
        break;
      case "ping":
        if (player) handlePing(ws, player);
        else send(ws, { type: "pong" });
        break;
      default:
        send(ws, { type: "error", message: "Unknown message type" });
    }
  });
});

// ── Cleanup ──

setInterval(() => {
  const now = Date.now();
  const stale = [];
  for (const [ws, player] of playersByWs) {
    if (now - player.lastPing > STALE_TIMEOUT) stale.push(ws);
  }
  for (const ws of stale) {
    ws.terminate();
    disconnectPlayer(ws);
  }
}, HEARTBEAT_INTERVAL);

wss.on("listening", () => {
  console.log(`RuneRadar relay v3.1 on port ${PORT}`);
});
