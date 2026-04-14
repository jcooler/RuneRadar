package com.runeradar;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import lombok.extern.slf4j.Slf4j;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.net.URI;
import java.util.List;
import java.util.Timer;
import java.util.TimerTask;
import java.util.function.Consumer;

/**
 * WebSocket client that connects to the RuneRadar relay server
 * for social features. Shares location with mutual friends,
 * clan members, and friends chat members automatically.
 */
@Slf4j
public class RuneRadarRelayClient
{
    private static final Gson GSON = new Gson();
    private static final int PING_INTERVAL = 25_000;
    private static final int RECONNECT_BASE = 3_000;
    private static final int RECONNECT_MAX = 60_000;

    private final String relayUrl;
    private final String rsn;
    private final Consumer<String> onPeerMessage;

    private WebSocketClient wsClient;
    private Timer pingTimer;
    private Timer reconnectTimer;
    private int reconnectDelay = RECONNECT_BASE;
    private volatile boolean running = true;
    private volatile boolean identified = false;

    public RuneRadarRelayClient(String relayUrl, String rsn, Consumer<String> onPeerMessage)
    {
        this.relayUrl = relayUrl;
        this.rsn = rsn;
        this.onPeerMessage = onPeerMessage;
    }

    public void connect()
    {
        try
        {
            wsClient = new WebSocketClient(new URI(relayUrl))
            {
                @Override
                public void onOpen(ServerHandshake handshake)
                {
                    log.info("RuneRadar Relay: Connected to {}", relayUrl);
                    reconnectDelay = RECONNECT_BASE;
                    identified = false;

                    JsonObject identify = new JsonObject();
                    identify.addProperty("type", "identify");
                    identify.addProperty("rsn", rsn);
                    send(GSON.toJson(identify));
                }

                @Override
                public void onMessage(String message)
                {
                    handleRelayMessage(message);
                }

                @Override
                public void onClose(int code, String reason, boolean remote)
                {
                    log.info("RuneRadar Relay: Disconnected (code={}, reason={})", code, reason);
                    identified = false;
                    stopPingTimer();
                    scheduleReconnect();
                }

                @Override
                public void onError(Exception ex)
                {
                    log.debug("RuneRadar Relay: Error", ex);
                }
            };

            wsClient.connect();
        }
        catch (Exception e)
        {
            log.error("RuneRadar Relay: Failed to create client", e);
            scheduleReconnect();
        }
    }

    private void handleRelayMessage(String message)
    {
        try
        {
            JsonObject msg = GSON.fromJson(message, JsonObject.class);
            String type = msg.get("type").getAsString();

            switch (type)
            {
                case "identified":
                    identified = true;
                    startPingTimer();
                    log.info("RuneRadar Relay: Identified as {}", rsn);
                    break;

                case "peer_list":
                case "peer_position":
                case "peer_join":
                case "peer_leave":
                    if (onPeerMessage != null) onPeerMessage.accept(message);
                    break;

                case "pong":
                    break;

                case "error":
                    log.warn("RuneRadar Relay: Server error: {}",
                        msg.get("message").getAsString());
                    break;
            }
        }
        catch (Exception e)
        {
            log.debug("RuneRadar Relay: Error parsing message", e);
        }
    }

    /**
     * Send the player's social graph to the relay for matching.
     * Called periodically and whenever the social state changes.
     */
    public void sendSocialUpdate(List<String> friends, String clan, String fc,
                                  boolean shareFriends, boolean shareClan, boolean shareFc)
    {
        if (!isConnected() || !identified) return;

        JsonObject msg = new JsonObject();
        msg.addProperty("type", "social_update");

        JsonArray friendsArr = new JsonArray();
        if (friends != null)
        {
            for (String f : friends) friendsArr.add(f);
        }
        msg.add("friends", friendsArr);

        msg.addProperty("clan", clan != null ? clan : "");
        msg.addProperty("fc", fc != null ? fc : "");
        msg.addProperty("shareFriends", shareFriends);
        msg.addProperty("shareClan", shareClan);
        msg.addProperty("shareFc", shareFc);

        sendToRelay(GSON.toJson(msg));
    }

    /**
     * Send an encrypted position update to the relay server.
     * Position data is AES-GCM encrypted — the relay cannot read coordinates.
     */
    public void sendPosition(int x, int y, int plane, int world,
                             String activity, boolean instanced, PrivacyMode privacy,
                             java.util.List<String> friends, String clan, String fc,
                             boolean shareFriends, boolean shareClan, boolean shareFc)
    {
        if (!isConnected() || !identified) return;
        if (privacy == PrivacyMode.HIDDEN) return;

        // Build the plaintext position payload
        JsonObject position = new JsonObject();
        switch (privacy)
        {
            case EXACT:
                position.addProperty("x", x);
                position.addProperty("y", y);
                position.addProperty("plane", plane);
                position.addProperty("world", world);
                position.addProperty("activity", activity);
                position.addProperty("instanced", instanced);
                break;
            case REGION:
                position.addProperty("x", (x / 64) * 64 + 32);
                position.addProperty("y", (y / 64) * 64 + 32);
                position.addProperty("plane", plane);
                position.addProperty("world", world);
                position.addProperty("activity", "");
                position.addProperty("instanced", false);
                break;
            case WORLD_ONLY:
                position.addProperty("x", 0);
                position.addProperty("y", 0);
                position.addProperty("plane", 0);
                position.addProperty("world", world);
                position.addProperty("activity", "");
                position.addProperty("instanced", false);
                break;
            case HIDDEN:
                return; // already handled above, but satisfies switch exhaustiveness
        }

        String plaintext = GSON.toJson(position);

        // Encrypt with the most permissive key the player is sharing with.
        // Friends get per-pair encryption, clan/FC get group encryption.
        // We encrypt once with a "broadcast key" — for simplicity, use the clan key
        // if sharing with clan (most members), otherwise the first friend key.
        try
        {
            javax.crypto.spec.SecretKeySpec key = null;

            if (shareClan && clan != null && !clan.isEmpty())
            {
                key = PositionCrypto.deriveClanKey(clan);
            }
            else if (shareFc && fc != null && !fc.isEmpty())
            {
                key = PositionCrypto.deriveFcKey(fc);
            }
            else if (shareFriends && friends != null && !friends.isEmpty())
            {
                // Use first friend as representative — recipients will try multiple keys
                key = PositionCrypto.deriveFriendKey(rsn, friends.get(0));
            }

            if (key == null) return;

            String encrypted = PositionCrypto.encrypt(plaintext, key);

            JsonObject msg = new JsonObject();
            msg.addProperty("type", "position");
            msg.addProperty("encrypted", encrypted);
            sendToRelay(GSON.toJson(msg));
        }
        catch (Exception e)
        {
            log.debug("RuneRadar Relay: Encryption error", e);
        }
    }

    private void sendToRelay(String json)
    {
        if (wsClient != null && wsClient.isOpen())
        {
            wsClient.send(json);
        }
    }

    public boolean isConnected()
    {
        return wsClient != null && wsClient.isOpen();
    }

    public boolean isIdentified()
    {
        return identified;
    }

    private void startPingTimer()
    {
        stopPingTimer();
        pingTimer = new Timer("RuneRadar-Relay-Ping", true);
        pingTimer.scheduleAtFixedRate(new TimerTask()
        {
            @Override
            public void run()
            {
                if (isConnected())
                {
                    sendToRelay("{\"type\":\"ping\"}");
                }
            }
        }, PING_INTERVAL, PING_INTERVAL);
    }

    private void stopPingTimer()
    {
        if (pingTimer != null)
        {
            pingTimer.cancel();
            pingTimer = null;
        }
    }

    private void scheduleReconnect()
    {
        if (!running) return;
        if (reconnectTimer != null) reconnectTimer.cancel();
        reconnectTimer = new Timer("RuneRadar-Relay-Reconnect", true);
        reconnectTimer.schedule(new TimerTask()
        {
            @Override
            public void run()
            {
                if (running) connect();
            }
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX);
    }

    public void shutdown()
    {
        running = false;
        stopPingTimer();
        if (reconnectTimer != null) reconnectTimer.cancel();
        if (wsClient != null)
        {
            try { wsClient.closeBlocking(); } catch (Exception ignored) {}
        }
    }
}
