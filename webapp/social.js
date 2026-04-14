/**
 * RuneRadar — Social Layer
 *
 * Manages peer markers on the map. Peers are friends, clan members,
 * or FC members who also have the RuneRadar plugin with sharing enabled.
 * No room codes — matching is automatic via OSRS's social graph.
 */

// ── HTML Escaping (XSS prevention) ──

function escHtml(str) {
  if (typeof str !== "string") return String(str ?? "");
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ── Peer State ──

const peers = new Map(); // rsn → { marker, label, data, lastUpdate, color }
const peerLayer = L.layerGroup();
const STALE_TIMEOUT = 60_000;
const PEER_COLORS = [
  "#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#feca57",
  "#ff9ff3", "#54a0ff", "#5f27cd", "#01a3a4", "#f368e0",
  "#ee5a24", "#0abde3", "#10ac84", "#ff9f43", "#c44569",
];

let socialPanelVisible = false;
let activeTab = "friends";

// ── Peer marker helpers ──

function getPeerColor(rsn) {
  let hash = 0;
  for (let i = 0; i < rsn.length; i++) {
    hash = ((hash << 5) - hash) + rsn.charCodeAt(i);
    hash |= 0;
  }
  return PEER_COLORS[Math.abs(hash) % PEER_COLORS.length];
}

function makePeerIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div class="peer-marker" style="background:${color}; box-shadow:0 0 8px ${color}aa;"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// Via icons — use OSRS chat badge style icons
const VIA_ICONS = {
  friends: "https://oldschool.runescape.wiki/images/Friends_List.png",
  clan: "https://oldschool.runescape.wiki/images/Grouping_icon.png",
  fc: "https://oldschool.runescape.wiki/images/Chat-channel.png",
};

function makePeerLabel(rsn, world, via) {
  const worldTag = world ? ` W${world}` : "";
  const viaType = (via && via.length > 0) ? via[0] : null;
  const viaIcon = viaType && VIA_ICONS[viaType]
    ? `<img src="${VIA_ICONS[viaType]}" style="height:12px;vertical-align:middle;image-rendering:pixelated;margin-right:3px;" />`
    : "";
  return L.divIcon({
    className: "peer-label",
    html: `<span>${viaIcon}${escHtml(rsn)}${worldTag}</span>`,
    iconSize: [200, 22],
    iconAnchor: [100, 30],
  });
}

// ── Handle messages from the relay (forwarded via plugin WS) ──

function handlePluginPeerMessage(data) {
  switch (data.type) {
    case "peer_list":
      handlePeerList(data.peers || []);
      break;
    case "peer_position":
    case "peer_join":
      decryptAndUpdatePeer(data);
      break;
    case "peer_leave":
      removePeer(data.rsn);
      updateSocialPanel();
      break;
  }
}

/**
 * Decrypt an encrypted peer position and update the marker.
 * Tries all possible keys (friend pair, clan, FC) until one works.
 */
async function decryptAndUpdatePeer(data) {
  if (!data.encrypted) {
    // Unencrypted (dummy data or legacy) — use directly
    updatePeer(data);
    return;
  }

  const via = data.via || [];
  const rsn = data.rsn;

  // Try decryption with each possible key based on `via` tags
  for (const source of via) {
    let key;
    try {
      if (source === "friends" && currentPlayerName) {
        key = await deriveFriendKey(currentPlayerName, rsn);
      } else if (source === "clan") {
        // We'd need the clan name — for now, webapp gets it from plugin context
        // The plugin forwards clan name in social_update; store it
        if (window._localClan) key = await deriveGroupKey("clan", window._localClan);
      } else if (source === "fc") {
        if (window._localFc) key = await deriveGroupKey("fc", window._localFc);
      }

      if (!key) continue;

      const position = await decryptPosition(data.encrypted, key);
      if (position) {
        updatePeer({ rsn, ...position, via });
        return;
      }
    } catch {
      // Wrong key, try next
    }
  }

  // All keys failed — still show peer as online but no position
  updatePeer({ rsn, x: 0, y: 0, via });
}

function handlePeerList(peerList) {
  const seen = new Set();
  for (const p of peerList) {
    seen.add(p.rsn);
    updatePeer(p);
  }
  for (const [rsn] of peers) {
    if (!seen.has(rsn)) removePeer(rsn);
  }
  updateSocialPanel();
}

function updatePeer(data) {
  if (!data.rsn || data.rsn === currentPlayerName) return;

  const now = Date.now();
  const color = getPeerColor(data.rsn);

  if (data.x === 0 && data.y === 0) {
    // World-only or offline — track without marker
    let peer = peers.get(data.rsn);
    if (!peer) {
      peer = { marker: null, label: null, data, lastUpdate: now, color };
      peers.set(data.rsn, peer);
    }
    peer.data = data;
    peer.lastUpdate = now;
    updateSocialPanel();
    return;
  }

  const latlng = gameToLatLng(data.x, data.y);
  let peer = peers.get(data.rsn);

  if (!peer || !peer.marker) {
    if (peer) removePeer(data.rsn);

    const marker = L.marker(latlng, { icon: makePeerIcon(color), zIndexOffset: 500 }).addTo(peerLayer);
    marker.bindTooltip("", { direction: "top", offset: [0, -10] });

    const label = L.marker(latlng, {
      icon: makePeerLabel(data.rsn, data.world, data.via),
      interactive: false, zIndexOffset: 499,
    }).addTo(peerLayer);

    peer = { marker, label, data, lastUpdate: now, color };
    peers.set(data.rsn, peer);
  } else {
    peer.marker.setLatLng(latlng);
    peer.marker.setIcon(makePeerIcon(color));
    peer.label.setLatLng(latlng);
    peer.label.setIcon(makePeerLabel(data.rsn, data.world, data.via));
    peer.lastUpdate = now;
    peer.data = data;
  }

  const parts = [data.rsn];
  if (data.world) parts.push(`World ${data.world}`);
  if (data.activity) parts.push(data.activity);
  peer.marker.setTooltipContent(parts.join(" · "));

  updateSocialPanel();
}

function removePeer(rsn) {
  const peer = peers.get(rsn);
  if (!peer) return;
  if (peer.marker) peerLayer.removeLayer(peer.marker);
  if (peer.label) peerLayer.removeLayer(peer.label);
  peers.delete(rsn);
}

// ── Stale cleanup ──
setInterval(() => {
  const now = Date.now();
  for (const [rsn, peer] of peers) {
    if (now - peer.lastUpdate > STALE_TIMEOUT) {
      removePeer(rsn);
      updateSocialPanel();
    }
  }
}, 10_000);

// ── Social Panel UI ──

function createSocialPanel() {
  const panel = document.createElement("div");
  panel.id = "social-panel";
  panel.className = "social-panel";
  panel.innerHTML = `
    <div class="social-header" id="social-header">
      <span>Social</span>
      <span class="social-status connected" id="social-status-dot"></span>
      <span class="social-count" id="social-count">0</span>
      <span class="social-toggle-arrow" id="social-arrow">▲</span>
    </div>
    <div class="social-body visible" id="social-body">
      <div class="social-tabs">
        <button class="social-tab active" data-tab="friends">Friends</button>
        <button class="social-tab" data-tab="clan">Clan</button>
      </div>
      <div class="social-tab-content" id="social-tab-content"></div>
    </div>
  `;
  document.body.appendChild(panel);

  socialPanelVisible = true;

  // Toggle panel
  document.getElementById("social-header").addEventListener("click", () => {
    socialPanelVisible = !socialPanelVisible;
    document.getElementById("social-body").classList.toggle("visible", socialPanelVisible);
    panel.classList.toggle("expanded", socialPanelVisible);
    document.getElementById("social-arrow").textContent = socialPanelVisible ? "▲" : "▼";
  });

  // Tab switching
  panel.querySelectorAll(".social-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      e.stopPropagation();
      activeTab = tab.dataset.tab;
      panel.querySelectorAll(".social-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      updateSocialPanel();
    });
  });

  // Delegated click handler for peer members (replaces inline onclick)
  document.getElementById("social-tab-content").addEventListener("click", (e) => {
    const member = e.target.closest("[data-peer-rsn]");
    if (member) panToPeer(member.dataset.peerRsn);
  });

  updateSocialPanel();
}

function updateSocialPanel() {
  const contentEl = document.getElementById("social-tab-content");
  const countEl = document.getElementById("social-count");
  if (!contentEl) return;

  if (activeTab === "friends") {
    renderFriendsTab(contentEl, countEl);
  } else if (activeTab === "clan") {
    renderClanTab(contentEl, countEl);
  }
}

function renderFriendsTab(contentEl, countEl) {
  const friendsList = [];

  // Add real peers tagged as friends
  for (const [, peer] of peers) {
    const via = peer.data.via || [];
    if (via.includes("friends") && !friendsList.find(f => f.rsn === peer.data.rsn)) {
      friendsList.push({ ...peer.data });
    }
  }

  countEl.textContent = friendsList.length;

  let html = "";

  if (friendsList.length > 0) {
    html += `<div class="social-group-label">Online — ${friendsList.length}</div>`;
    for (const f of friendsList) {
      html += renderMember(f);
    }
  } else {
    html = `<div class="social-empty">Enable social features in the RuneLite plugin to see friends here</div>`;
  }

  contentEl.innerHTML = html;
}

function renderClanTab(contentEl, countEl) {
  const clan = { name: null, members: [] };

  // Add real peers tagged as clan
  const clanMembers = [...clan.members];
  for (const [, peer] of peers) {
    const via = peer.data.via || [];
    if (via.includes("clan") && !clanMembers.find(m => m.rsn === peer.data.rsn)) {
      clanMembers.push({ ...peer.data, online: true });
    }
  }

  countEl.textContent = clanMembers.length;

  let html = "";

  if (clan.name) {
    html += `<div class="social-clan-header">
      <span class="social-clan-icon">⚔</span>
      <span class="social-clan-name">${escHtml(clan.name)}</span>
      <span class="social-clan-count">${clanMembers.length} online</span>
    </div>`;
  }

  if (clanMembers.length > 0) {
    html += `<div class="social-group-label">Online — ${clanMembers.length}</div>`;
    for (const m of clanMembers) {
      html += renderMember(m);
    }
  } else {
    html = `<div class="social-empty">Join a clan in-game and enable clan sharing in the plugin</div>`;
  }

  contentEl.innerHTML = html;
}

function renderMember(data, isOffline = false) {
  const color = isOffline ? "#555" : getPeerColor(data.rsn);
  const world = data.world ? `W${data.world}` : "";
  const activity = escHtml(data.activity || "");
  const info = [world, activity].filter(Boolean).join(" · ");
  const hasPos = data.x && data.y && !isOffline;
  const offlineClass = isOffline ? " offline" : "";
  const safeRsn = escHtml(data.rsn);
  // Use data attribute + delegated handler instead of inline onclick to avoid JS injection
  return `<div class="social-member${hasPos ? " clickable" : ""}${offlineClass}"
    ${hasPos ? `data-peer-rsn="${safeRsn}"` : ""}>
    <span class="social-member-dot" style="background:${color}"></span>
    <span class="social-member-name">${safeRsn}</span>
    <span class="social-member-info">${isOffline ? "Offline" : info}</span>
  </div>`;
}

function panToPeer(rsn) {
  const peer = peers.get(rsn);
  if (peer && peer.marker) {
    map.setView(peer.marker.getLatLng(), Math.max(map.getZoom(), 1), { animate: true });
  }
}

window.panToPeer = panToPeer;

// ── Initialize ──

function initSocial(mapInstance) {
  peerLayer.addTo(mapInstance);
  createSocialPanel();
}
