package com.runeradar;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.Set;
import java.util.concurrent.*;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;

public class RuneRadarServerTest
{
    private RuneRadarServer server;
    private final HttpClient http = HttpClient.newHttpClient();

    @Before public void start() throws Exception
    {
        server = new RuneRadarServer(0, new Gson(), Set.of("https://runeradar.app"));
        server.start();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (!server.isReady() && System.nanoTime() < deadline) Thread.sleep(10);
        assertTrue(server.isReady());
    }
    @After public void stop() throws Exception { server.shutdown(); }

    private Peer connect(String origin) throws Exception
    {
        Peer peer = new Peer();
        WebSocket.Builder builder = http.newWebSocketBuilder().connectTimeout(java.time.Duration.ofSeconds(2));
        if (origin != null) builder.header("Origin", origin);
        peer.socket = builder.buildAsync(URI.create("ws://127.0.0.1:" + server.getPort() + "/"), peer).get(3, TimeUnit.SECONDS);
        return peer;
    }

    @Test public void requiresPairingThenSendsStationarySnapshotAndClearsOnLogout() throws Exception
    {
        server.update(PlayerData.position(3222, 3218, 0));
        Peer peer = connect("https://runeradar.app");
        assertNull(peer.messages.poll(200, TimeUnit.MILLISECONDS));
        String launch = server.issuePairingToken();
        peer.send("pair", launch);
        JsonObject accepted = peer.next();
        assertEquals("authenticated", accepted.get("type").getAsString());
        String credential = accepted.get("credential").getAsString();
        JsonObject snapshot = peer.next();
        assertEquals(3222, snapshot.getAsJsonObject("position").get("x").getAsInt());
        assertFalse(snapshot.toString().contains("name"));
        peer.socket.abort();
        Peer resumed = connect("https://runeradar.app");
        resumed.send("resume", credential);
        assertEquals("authenticated", resumed.next().get("type").getAsString());
        assertEquals(3222, resumed.next().getAsJsonObject("position").get("x").getAsInt());
        server.update(PlayerData.unavailable("logged_out"));
        JsonObject logout = resumed.next();
        assertEquals("logged_out", logout.get("availability").getAsString());
        assertFalse(logout.has("position"));
        assertNotEquals(snapshot.get("session"), logout.get("session"));
        resumed.socket.abort();
    }

    @Test public void accountDetailsRequirePairingAndClearOnLogout() throws Exception
    {
        PlayerData data = new Gson().fromJson("{\"availability\":\"available\",\"position\":{\"x\":3222,\"y\":3218,\"plane\":0},\"account\":{\"name\":\"Test Player\",\"world\":301,\"hitpoints\":87,\"prayer\":63,\"runEnergy\":42}}", PlayerData.class);
        server.update(data);
        Peer peer = connect("https://runeradar.app");
        assertNull(peer.messages.poll(200, TimeUnit.MILLISECONDS));
        peer.send("pair", server.issuePairingToken());
        assertEquals("authenticated", peer.next().get("type").getAsString());
        JsonObject snapshot = peer.next();
        assertTrue("Full snapshot must include local account details", snapshot.has("account"));
        JsonObject account = snapshot.getAsJsonObject("account");
        assertEquals("Test Player", account.get("name").getAsString());
        assertEquals(301, account.get("world").getAsInt());
        assertEquals(87, account.get("hitpoints").getAsInt());
        assertEquals(63, account.get("prayer").getAsInt());
        assertEquals(42, account.get("runEnergy").getAsInt());
        server.update(PlayerData.unavailable("logged_out"));
        JsonObject logout = peer.next();
        assertEquals("logged_out", logout.get("availability").getAsString());
        assertFalse(logout.has("account"));
        assertFalse(logout.has("position"));
        peer.socket.abort();
    }
    @Test public void pluginCapturesFreshQuestAndAccountInInstancesWithoutCoordinates() throws Exception
    {
        Peer peer = connect("https://runeradar.app");
        peer.send("pair", server.issuePairingToken()); peer.next(); peer.next();
        boolean[] instanced = {true}, enabled = {true};
        net.runelite.api.GameState[] state = {net.runelite.api.GameState.LOGGED_IN};
        net.runelite.api.Player player = (net.runelite.api.Player) java.lang.reflect.Proxy.newProxyInstance(
            getClass().getClassLoader(), new Class<?>[]{net.runelite.api.Player.class}, (proxy, method, args) -> {
                if (method.getName().equals("getName")) return "Test Player";
                if (method.getName().equals("getWorldLocation")) {
                    assertFalse("Never read instance coordinates as a world-map position", instanced[0]);
                    return new net.runelite.api.coords.WorldPoint(3016, 3232, 0);
                }
                throw new AssertionError("Unexpected player call: " + method.getName());
            });
        net.runelite.api.Client client = (net.runelite.api.Client) java.lang.reflect.Proxy.newProxyInstance(
            getClass().getClassLoader(), new Class<?>[]{net.runelite.api.Client.class}, (proxy, method, args) -> {
                switch (method.getName()) {
                    case "getLocalPlayer": return player;
                    case "getGameState": return state[0];
                    case "isInInstancedRegion": return instanced[0];
                    case "getWorld": return 613;
                    case "getBoostedSkillLevel": return 99;
                    case "getEnergy": return 8500;
                    default: throw new AssertionError("Unexpected client call: " + method.getName());
                }
            });
        RuneRadarPlugin plugin = new RuneRadarPlugin();
        net.runelite.client.eventbus.EventBus bus = new net.runelite.client.eventbus.EventBus(error -> { throw new AssertionError(error); });
        RuneRadarConfig config = new RuneRadarConfig() { @Override public boolean showQuests() { return enabled[0]; } };
        for (java.util.Map.Entry<String,Object> field : java.util.Map.<String,Object>of(
            "client", client, "config", config, "server", server, "eventBus", bus, "active", true).entrySet()) {
            java.lang.reflect.Field member = RuneRadarPlugin.class.getDeclaredField(field.getKey());
            member.setAccessible(true); member.set(plugin, field.getValue());
        }
        java.util.concurrent.atomic.AtomicInteger requests = new java.util.concurrent.atomic.AtomicInteger();
        bus.register(net.runelite.client.events.PluginMessage.class, request -> {
            java.util.Map<String,Object> reply = new java.util.HashMap<>(request.getData());
            reply.put("state", "active"); reply.put("title", "Quest " + requests.incrementAndGet());
            reply.put("text", "Speak to the guide."); reply.put("target", new net.runelite.api.coords.WorldPoint(3013, 3209, 0));
            plugin.onPluginMessage(new net.runelite.client.events.PluginMessage("questhelper", "stepSnapshot", reply));
        }, 0);
        plugin.onGameTick(new net.runelite.api.events.GameTick());
        JsonObject first = peer.next();
        assertEquals("instanced", first.get("availability").getAsString());
        assertFalse(first.has("position"));
        assertTrue("Instance capture must keep the current quest step", first.has("helpers"));
        assertEquals("Quest 1", first.getAsJsonObject("helpers").getAsJsonObject("quest").get("title").getAsString());
        assertEquals("Test Player", first.getAsJsonObject("account").get("name").getAsString());
        plugin.onGameTick(new net.runelite.api.events.GameTick());
        assertEquals("Quest 2", peer.next().getAsJsonObject("helpers").getAsJsonObject("quest").get("title").getAsString());
        enabled[0] = false; plugin.onGameTick(new net.runelite.api.events.GameTick());
        assertFalse(peer.next().getAsJsonObject("helpers").has("quest")); assertEquals(2, requests.get());
        instanced[0] = false; plugin.onGameTick(new net.runelite.api.events.GameTick());
        assertEquals(3016, peer.next().getAsJsonObject("position").get("x").getAsInt());
        state[0] = net.runelite.api.GameState.LOGIN_SCREEN; plugin.onGameTick(new net.runelite.api.events.GameTick());
        JsonObject logout = peer.next();
        assertFalse(logout.has("account")); assertFalse(logout.has("helpers")); assertFalse(logout.has("position"));
        peer.socket.abort();
    }

    @Test public void rejectsMissingNullAndLookalikeOrigins() throws Exception
    {
        for (String origin : new String[]{null, "null", "https://runeradar.app.evil.test", "https://runeradar.app:444", "http://localhost:8000"})
        {
            Peer peer = connect(origin);
            assertEquals(Integer.valueOf(1008), peer.closed.get(2, TimeUnit.SECONDS));
            assertTrue(peer.messages.isEmpty());
        }
    }

    @Test public void helperOptOutClearsOnlyThatHelperAndLogoutClearsBoth() throws Exception
    {
        assertFalse(server.hasViewer());
        Peer peer = connect("https://runeradar.app");
        assertFalse(server.hasViewer());
        peer.send("pair", server.issuePairingToken());
        assertEquals("authenticated", peer.next().get("type").getAsString());
        assertTrue(server.hasViewer());
        peer.next();
        HelperData clue = HelperData.objective("Clue", "Dig here", new net.runelite.api.coords.WorldPoint[]{new net.runelite.api.coords.WorldPoint(3222, 3218, 0)}, false);
        HelperData quest = HelperData.objective("Quest", "Speak to the guide", null, false);
        server.update(PlayerData.position(3222, 3218, 0, null, new HelperData.Snapshot(clue, quest)));
        assertTrue(peer.next().getAsJsonObject("helpers").has("clue"));
        server.clearHelper("clue");
        JsonObject changed = peer.next().getAsJsonObject("helpers");
        assertFalse(changed.has("clue")); assertEquals("Quest", changed.getAsJsonObject("quest").get("title").getAsString());
        server.update(PlayerData.unavailable("logged_out"));
        assertFalse(peer.next().has("helpers"));
        server.revoke();
        assertFalse(server.hasViewer());
        peer.socket.abort();
    }

    @Test public void wrongCredentialsAndOversizedInputNeverReceivePosition() throws Exception
    {
        for (String input : new String[]{"{", "{\"type\":\"authenticate\",\"version\":1,\"mode\":\"pair\",\"credential\":\"bad\"}", "x".repeat(2048)})
        {
            Peer peer = connect("https://runeradar.app");
            peer.socket.sendText(input, true).join();
            peer.closed.get(3, TimeUnit.SECONDS);
            assertTrue(peer.messages.isEmpty());
        }
    }

    @Test public void disconnectRevokesResumeCredential() throws Exception
    {
        Peer peer = connect("https://runeradar.app");
        peer.send("pair", server.issuePairingToken());
        String credential = peer.next().get("credential").getAsString();
        peer.next();
        peer.socket.sendText("{\"type\":\"disconnect\",\"version\":1}", true).join();
        peer.closed.get(2, TimeUnit.SECONDS);
        Peer rejected = connect("https://runeradar.app");
        rejected.send("resume", credential);
        assertEquals(Integer.valueOf(1008), rejected.closed.get(2, TimeUnit.SECONDS));
        assertTrue(rejected.messages.isEmpty());
    }

    @Test public void incompleteHandshakesAreBoundedAndExpire() throws Exception
    {
        java.util.List<java.net.Socket> raw = new java.util.ArrayList<>();
        try
        {
            for (int i = 0; i < 4; i++)
            {
                java.net.Socket socket = new java.net.Socket("127.0.0.1", server.getPort());
                socket.setSoTimeout(7000);
                raw.add(socket);
                Thread.sleep(30);
            }
            try (java.net.Socket excess = new java.net.Socket("127.0.0.1", server.getPort()))
            {
                excess.setSoTimeout(2000);
                assertEquals(-1, excess.getInputStream().read());
            }
            for (java.net.Socket socket : raw) assertEquals(-1, socket.getInputStream().read());
            Peer healthy = connect("https://runeradar.app");
            healthy.send("pair", server.issuePairingToken());
            assertEquals("authenticated", healthy.next().get("type").getAsString());
            healthy.socket.abort();
        }
        finally { for (java.net.Socket socket : raw) socket.close(); }
    }

    @Test public void oversizedHttpHandshakeIsRejected() throws Exception
    {
        try (java.net.Socket socket = new java.net.Socket("127.0.0.1", server.getPort()))
        {
            socket.setSoTimeout(2000);
            socket.getOutputStream().write(("GET / HTTP/1.1\r\nX-Fill: " + "a".repeat(9000)).getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            assertEquals(-1, socket.getInputStream().read());
        }
    }

    @Test public void launchReplacementRevokesConnectedBrowserAndWorksImmediately() throws Exception
    {
        Peer first = connect("https://runeradar.app");
        first.send("pair", server.issuePairingToken());
        first.next(); first.next();
        String replacement = server.issuePairingToken();
        first.closed.get(2, TimeUnit.SECONDS);
        Peer next = connect("https://runeradar.app");
        next.send("pair", replacement);
        assertEquals("authenticated", next.next().get("type").getAsString());
        next.socket.abort();
    }

    @Test public void frozenGameCaptureBecomesUnavailable() throws Exception
    {
        server.update(PlayerData.position(3200, 3200, 2));
        Peer peer = connect("https://runeradar.app");
        peer.send("pair", server.issuePairingToken()); peer.next();
        JsonObject message = peer.next();
        assertEquals(2, message.getAsJsonObject("position").get("plane").getAsInt());
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(7);
        while ("available".equals(message.get("availability").getAsString()) && System.nanoTime() < deadline)
        {
            // Changing helper consent must not make an old player capture fresh again.
            server.clearHelper("clue");
            message = peer.next();
        }
        assertEquals("stale", message.get("availability").getAsString());
        assertFalse(message.has("position"));
        peer.socket.abort();
    }

    @Test public void shutdownClosesIncompleteHandshakeImmediately() throws Exception
    {
        try (java.net.Socket socket = new java.net.Socket("127.0.0.1", server.getPort()))
        {
            socket.setSoTimeout(1500);
            Thread.sleep(100);
            server.shutdown();
            assertEquals(-1, socket.getInputStream().read());
        }
    }

    private static class Peer implements WebSocket.Listener
    {
        WebSocket socket;
        final BlockingQueue<JsonObject> messages = new LinkedBlockingQueue<>();
        final CompletableFuture<Integer> closed = new CompletableFuture<>();
        final StringBuilder text = new StringBuilder();
        public void onOpen(WebSocket socket) { socket.request(1); }
        public CompletionStage<?> onText(WebSocket socket, CharSequence data, boolean last)
        {
            text.append(data);
            if (last) { messages.add(new Gson().fromJson(text.toString(), JsonObject.class)); text.setLength(0); }
            socket.request(1);
            return null;
        }
        public CompletionStage<?> onClose(WebSocket socket, int status, String reason) { closed.complete(status); return null; }
        public void onError(WebSocket socket, Throwable error) { closed.completeExceptionally(error); }
        void send(String mode, String credential)
        {
            socket.sendText("{\"type\":\"authenticate\",\"version\":1,\"mode\":\"" + mode + "\",\"credential\":\"" + credential + "\"}", true).join();
        }
        JsonObject next() throws Exception
        {
            JsonObject message = messages.poll(3, TimeUnit.SECONDS);
            assertNotNull("Expected a protocol message", message);
            return message;
        }
    }
}
