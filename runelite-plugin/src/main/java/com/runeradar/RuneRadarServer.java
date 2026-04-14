package com.runeradar;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import lombok.extern.slf4j.Slf4j;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.net.InetSocketAddress;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;

@Slf4j
public class RuneRadarServer extends WebSocketServer
{
    private static final Gson GSON = new Gson();

    private static final Set<String> ALLOWED_ORIGINS = Set.of(
        "http://localhost",
        "http://localhost:5500",
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8080",
        "https://runeradar.app",
        "https://www.runeradar.app",
        "https://jcooler.github.io",
        "null",
        "file://"
    );

    private final Set<WebSocket> clients = new CopyOnWriteArraySet<>();

    public RuneRadarServer(int port)
    {
        super(new InetSocketAddress("127.0.0.1", port));
        setReuseAddr(true);
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake)
    {
        String origin = handshake.getFieldValue("Origin");
        if (origin != null && !origin.isEmpty())
        {
            boolean allowed = ALLOWED_ORIGINS.stream()
                .anyMatch(o -> origin.equals(o) || origin.startsWith(o + ":"));

            if (!allowed)
            {
                log.warn("RuneRadar: Rejected connection from origin: {}", origin);
                conn.close(1008, "Origin not allowed");
                return;
            }
        }

        clients.add(conn);
        log.info("RuneRadar: Client connected ({} total)", clients.size());

        JsonObject welcome = new JsonObject();
        welcome.addProperty("type", "welcome");
        welcome.addProperty("version", "1.0.0");
        conn.send(GSON.toJson(welcome));
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote)
    {
        clients.remove(conn);
        log.info("RuneRadar: Client disconnected ({} remaining)", clients.size());
    }

    @Override
    public void onMessage(WebSocket conn, String message)
    {
        log.debug("RuneRadar: Received message: {}", message);
    }

    @Override
    public void onError(WebSocket conn, Exception ex)
    {
        log.error("RuneRadar WebSocket error", ex);
        if (conn != null)
        {
            clients.remove(conn);
        }
    }

    @Override
    public void onStart()
    {
        log.info("RuneRadar WebSocket server started on {}", getAddress());
    }

    public void broadcast(PlayerData data)
    {
        if (clients.isEmpty())
        {
            return;
        }

        String json = data.toJson();
        for (WebSocket client : clients)
        {
            if (client.isOpen())
            {
                client.send(json);
            }
        }
    }

    /**
     * Broadcast a raw JSON string to all connected clients.
     */
    public void broadcastRaw(String json)
    {
        if (clients.isEmpty())
        {
            return;
        }

        for (WebSocket client : clients)
        {
            if (client.isOpen())
            {
                client.send(json);
            }
        }
    }

    public void broadcastLogout()
    {
        if (clients.isEmpty())
        {
            return;
        }

        JsonObject logout = new JsonObject();
        logout.addProperty("type", "logout");
        String json = GSON.toJson(logout);

        for (WebSocket client : clients)
        {
            if (client.isOpen())
            {
                client.send(json);
            }
        }
    }
}
