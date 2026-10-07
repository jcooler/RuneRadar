package com.runeradar;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.java_websocket.WebSocket;
import org.java_websocket.WebSocketAdapter;
import org.java_websocket.WebSocketImpl;
import org.java_websocket.drafts.Draft;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.DefaultWebSocketServerFactory;
import org.java_websocket.server.WebSocketServer;

/** Loopback only. Each browser must prove possession of a user-issued launch secret. */
final class RuneRadarServer extends WebSocketServer
{
    private static final int MAX_CONNECTIONS = 4;
    private static final int MAX_MESSAGE = 1024;
    private final Gson gson;
    private final Set<String> origins;
    private final PairingAuthority authority = new PairingAuthority(RuneRadarServer::now);
    private final Map<WebSocket, Connection> peers = new ConcurrentHashMap<>();
    private final ScheduledExecutorService sender = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "RuneRadar-local-map");
        thread.setDaemon(true);
        return thread;
    });
    private final AtomicReference<Sample> latest = new AtomicReference<>(new Sample(PlayerData.unavailable("logged_out"), UUID.randomUUID().toString(), 0));
    private ScheduledFuture<?> sendTask;
    private volatile boolean ready;
    private volatile boolean stopped;
    private volatile Consumer<String> status = ignored -> {};

    RuneRadarServer(int port, Gson gson, Set<String> origins)
    {
        super(new InetSocketAddress("127.0.0.1", port), 1,
            Collections.singletonList(new Draft_6455(Collections.emptyList(), MAX_MESSAGE)));
        this.gson = gson;
        this.origins = Set.copyOf(origins);
        setReuseAddr(true);
        setDaemon(true);
        setMaxPendingConnections(MAX_CONNECTIONS);
        setConnectionLostTimeout(10);
        setWebSocketFactory(new DefaultWebSocketServerFactory()
        {
            @Override public WebSocketImpl createWebSocket(WebSocketAdapter adapter, List<Draft> drafts)
            {
                return new WebSocketImpl(adapter, drafts)
                {
                    private int headerBytes;
                    @Override public void decode(ByteBuffer bytes)
                    {
                        if (!isOpen())
                        {
                            headerBytes += bytes.remaining();
                            if (headerBytes > 8192) { closeConnection(1009, "Handshake too large"); return; }
                        }
                        super.decode(bytes);
                    }
                };
            }
        });
    }

    static long now() { return TimeUnit.NANOSECONDS.toMillis(System.nanoTime()); }
    boolean isReady() { return ready && !stopped; }
    void setStatusListener(Consumer<String> listener) { status = listener; }

    // A single-slot mailbox: the RuneLite thread never serializes, queues, or sends network data.
    void update(PlayerData data)
    {
        latest.updateAndGet(old -> new Sample(data,
            !old.data.availability.equals(data.availability) ? UUID.randomUUID().toString() : old.session,
            old.sequence + 1));
    }

    synchronized boolean hasViewer()
    {
        return peers.entrySet().stream().anyMatch(entry -> entry.getKey().isOpen()
            && entry.getValue().credential != null && authority.accepts(entry.getValue().credential));
    }

    void clearHelper(String helper)
    {
        latest.updateAndGet(old -> new Sample(old.data.withoutHelper(helper), old.session, old.sequence + 1, old.received));
    }

    synchronized String issuePairingToken()
    {
        if (!isReady()) throw new IllegalStateException("Local map server unavailable");
        String token = authority.issue();
        closeAuthorized();
        return token;
    }

    synchronized void revoke()
    {
        authority.revoke();
        closeAuthorized();
    }

    private void closeAuthorized()
    {
        for (Map.Entry<WebSocket, Connection> entry : peers.entrySet())
            if (entry.getValue().credential != null) entry.getKey().close(4001, "Pairing ended");
    }

    // Track sockets before the HTTP upgrade too, so incomplete handshakes expire.
    @Override protected synchronized void allocateBuffers(WebSocket socket) throws InterruptedException
    {
        if (stopped || peers.size() >= MAX_CONNECTIONS)
        {
            socket.closeConnection(1008, "Connection limit");
            return;
        }
        peers.put(socket, new Connection());
        super.allocateBuffers(socket);
    }

    @Override public synchronized void onOpen(WebSocket socket, ClientHandshake request)
    {
        if (!origins.contains(request.getFieldValue("Origin")) || !"/".equals(request.getResourceDescriptor()) || !peers.containsKey(socket))
            socket.close(1008, "Origin or path not allowed");
    }

    @Override public synchronized void onMessage(WebSocket socket, String message)
    {
        Connection peer = peers.get(socket);
        if (peer == null || !socket.isOpen()) return;
        try
        {
            if (message.length() > MAX_MESSAGE) throw new IllegalArgumentException();
            JsonObject input = gson.fromJson(message, JsonObject.class);
            if (input == null || !"1".equals(input.get("version").getAsString())) throw new IllegalArgumentException();
            String type = input.get("type").getAsString();
            if (peer.credential != null)
            {
                if (!authority.accepts(peer.credential) || !"disconnect".equals(type)) throw new IllegalArgumentException();
                revoke();
                return;
            }
            if (!"authenticate".equals(type) || now() - peer.created >= 5000) throw new IllegalArgumentException();
            String candidate = input.get("credential").getAsString();
            String mode = input.get("mode").getAsString();
            String credential = "pair".equals(mode) ? authority.pair(candidate)
                : "resume".equals(mode) && authority.accepts(candidate) ? candidate : null;
            if (credential == null) throw new IllegalArgumentException();
            closeAuthorized();
            peer.credential = credential;
            JsonObject accepted = new JsonObject();
            accepted.addProperty("type", "authenticated");
            accepted.addProperty("version", 1);
            accepted.addProperty("credential", credential);
            socket.send(gson.toJson(accepted));
            // First full snapshot is sent by the sender as soon as this small auth response drains.
            peer.lastSequence = -1;
        }
        catch (RuntimeException invalid)
        {
            socket.close(1008, "Pair again from RuneLite");
        }
    }

    @Override public void onMessage(WebSocket socket, ByteBuffer message) { socket.close(1008, "Text messages only"); }
    @Override public void onClose(WebSocket socket, int code, String reason, boolean remote) { peers.remove(socket); }
    @Override public void onError(WebSocket socket, Exception error)
    {
        // Never log frames, URLs, credentials or account information.
        if (socket == null) { ready = false; status.accept("Could not start the local connection. Check the port setting."); }
    }

    @Override public synchronized void onStart()
    {
        if (stopped) return;
        ready = true;
        sendTask = sender.scheduleAtFixedRate(this::sendLatest, 0, 100, TimeUnit.MILLISECONDS);
        status.accept("Ready. Open RuneRadar to connect this computer.");
    }

    private synchronized void sendLatest()
    {
        long time = now();
        Sample sample = latest.get();
        if (sample.data.position != null && time - sample.received >= 5000)
        {
            Sample stale = new Sample(PlayerData.unavailable("stale"), UUID.randomUUID().toString(), sample.sequence + 1);
            latest.compareAndSet(sample, stale);
            sample = latest.get();
        }
        for (Map.Entry<WebSocket, Connection> entry : new ArrayList<>(peers.entrySet()))
        {
            WebSocket socket = entry.getKey();
            Connection peer = entry.getValue();
            if (socket.isClosed()) { peers.remove(socket); continue; }
            if (peer.credential == null)
            {
                if (time - peer.created >= 5000) { socket.closeConnection(1008, "Pairing timed out"); peers.remove(socket); }
                continue;
            }
            if (!authority.accepts(peer.credential)) { socket.closeConnection(4001, "Pairing ended"); continue; }
            if (!socket.isOpen()) continue;
            // No unbounded outbound queue: only the newest sample is retained for a slow tab.
            if (socket.hasBufferedData())
            {
                if (peer.blockedSince == 0) peer.blockedSince = time;
                if (time - peer.blockedSince >= 5000) socket.closeConnection(4002, "Connection too slow");
                continue;
            }
            peer.blockedSince = 0;
            if (peer.lastSequence == sample.sequence && time - peer.lastSent < 2000) continue;
            try
            {
                socket.send(gson.toJson(new Snapshot(sample)));
                peer.lastSequence = sample.sequence;
                peer.lastSent = time;
            }
            catch (RuntimeException closed) { socket.closeConnection(1001, "Connection closed"); }
        }
    }

    void shutdown() throws InterruptedException
    {
        synchronized (this)
        {
            if (stopped) return;
            stopped = true;
            ready = false;
            authority.revoke();
            // The library only tracks upgraded sockets. Close raw handshakes ourselves.
            for (WebSocket socket : new ArrayList<>(peers.keySet())) socket.closeConnection(1001, "Plugin stopped");
            peers.clear();
            if (sendTask != null) sendTask.cancel(false);
        }
        sender.shutdown();
        stop(1000);
    }

    private static final class Connection
    {
        final long created = now();
        String credential;
        long lastSequence = -1;
        long lastSent;
        long blockedSince;
    }

    private static final class Sample
    {
        final PlayerData data;
        final String session;
        final long sequence;
        final long received;
        Sample(PlayerData data, String session, long sequence) { this(data, session, sequence, now()); }
        Sample(PlayerData data, String session, long sequence, long received)
        { this.data = data; this.session = session; this.sequence = sequence; this.received = received; }
    }

    private static final class Snapshot
    {
        final String type = "snapshot";
        final int version = 1;
        final String session;
        final long sequence;
        final long timestamp = System.currentTimeMillis();
        final String availability;
        final PlayerData.Position position;
        final PlayerData.Account account;
        final HelperData.Snapshot helpers;
        Snapshot(Sample sample)
        {
            session = sample.session;
            sequence = sample.sequence;
            availability = sample.data.availability;
            position = sample.data.position;
            account = sample.data.account;
            helpers = sample.data.helpers;
        }
    }
}
