package com.runeradar;

import com.google.gson.Gson;
import com.google.inject.Provides;
import java.util.Set;
import java.util.concurrent.ScheduledExecutorService;
import javax.inject.Inject;
import javax.swing.SwingUtilities;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Client;
import net.runelite.api.GameState;
import net.runelite.api.Player;
import net.runelite.api.Skill;
import net.runelite.api.coords.WorldPoint;
import net.runelite.api.events.GameStateChanged;
import net.runelite.api.events.GameTick;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.eventbus.EventBus;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.events.PluginMessage;
import net.runelite.client.plugins.PluginManager;
import net.runelite.client.plugins.cluescrolls.ClueScrollPlugin;
import net.runelite.client.events.ConfigChanged;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.client.ui.ClientToolbar;
import net.runelite.client.ui.NavigationButton;
import net.runelite.client.util.LinkBrowser;

@Slf4j
@PluginDescriptor(name = "RuneRadar", description = "Shows your own location on a paired map on this computer", tags = {"map", "location", "radar"})
public class RuneRadarPlugin extends Plugin
{
    @Inject private Client client;
    @Inject private RuneRadarConfig config;
    @Inject private Gson gson;
    @Inject private ClientToolbar toolbar;
    @Inject private ScheduledExecutorService executor;
    @Inject private PluginManager pluginManager;
    @Inject private EventBus eventBus;
    @Inject private ClientThread clientThread;
    private final QuestHelperBridge questBridge = new QuestHelperBridge();
    private SerialExecutor lifecycle;
    private volatile RuneRadarServer server;
    private volatile boolean active;
    private RuneRadarPanel panel;
    private NavigationButton navigation;

    @Provides RuneRadarConfig provideConfig(ConfigManager manager) { return manager.getConfig(RuneRadarConfig.class); }

    @Override protected void startUp()
    {
        if (lifecycle == null) lifecycle = new SerialExecutor(executor);
        active = true;
        SwingUtilities.invokeLater(() -> {
            if (!active) return;
            panel = new RuneRadarPanel(this::openMap, () -> {
                RuneRadarServer current = server;
                if (current != null) current.revoke();
                panel.setStatus("Disconnected. Open RuneRadar to pair again.", current != null && current.isReady());
            });
            navigation = NavigationButton.builder().tooltip("RuneRadar").icon(RuneRadarPanel.icon()).panel(panel).build();
            toolbar.addNavigation(navigation);
        });
        restartServer();
    }

    private synchronized void restartServer()
    {
        RuneRadarServer old = server;
        server = null;
        if (old != null) old.revoke();
        boolean development = config.developmentMap();
        RuneRadarServer next = new RuneRadarServer(config.port(), gson,
            development ? Set.of("http://127.0.0.1:8000") : Set.of("https://runeradar.app", "https://www.runeradar.app"));
        server = next;
        next.setStatusListener(message -> SwingUtilities.invokeLater(() -> {
            if (panel != null && server == next) panel.setStatus(message, next.isReady());
        }));
        lifecycle.execute(() -> {
            stopServer(old);
            synchronized (RuneRadarPlugin.this)
            {
                if (active && server == next) next.start();
                else stopServer(next);
            }
        });
    }

    private void openMap()
    {
        RuneRadarServer current = server;
        if (current == null || !current.isReady())
        {
            panel.setStatus("Local connection unavailable. Check the port setting.", false);
            return;
        }
        String url = config.developmentMap() ? "http://127.0.0.1:8000/" : "https://runeradar.app/";
        LinkBrowser.browse(url + "#pair=" + current.issuePairingToken() + "&port=" + current.getPort());
        panel.setStatus("Pairing link opened. Keep this RuneLite client running.", true);
    }

    @Override protected synchronized void shutDown()
    {
        active = false;
        questBridge.clear();
        RuneRadarServer old = server;
        server = null;
        if (old != null) old.revoke();
        lifecycle.execute(() -> stopServer(old));
        SwingUtilities.invokeLater(() -> {
            if (navigation != null) toolbar.removeNavigation(navigation);
            navigation = null;
            panel = null;
        });
    }

    private static void stopServer(RuneRadarServer current)
    {
        if (current == null) return;
        try { current.shutdown(); }
        catch (InterruptedException interrupted)
        {
            // RuneLite forbids Thread.interrupt(). Credentials and peers are already revoked.
            log.warn("Local map connection shutdown wait was interrupted.");
        }
    }

    @Subscribe public void onConfigChanged(ConfigChanged event)
    {
        if (!active || !RuneRadarConfig.GROUP.equals(event.getGroup())) return;
        if ("port".equals(event.getKey()) || "developmentMap".equals(event.getKey())) restartServer();
        if ("showClues".equals(event.getKey()) || "showQuests".equals(event.getKey()))
        {
            // Serialize consent changes with captures on the client thread.
            clientThread.invoke(() -> {
                RuneRadarServer current = server;
                if (current == null) return;
                if (!config.showClues()) current.clearHelper("clue");
                if (!config.showQuests()) { questBridge.clear(); current.clearHelper("quest"); }
            });
        }
    }

    @Subscribe public void onGameStateChanged(GameStateChanged event)
    {
        RuneRadarServer current = server;
        if (current != null && event.getGameState() != GameState.LOGGED_IN)
            current.update(PlayerData.unavailable(event.getGameState() == GameState.LOGIN_SCREEN ? "logged_out" : "loading"));
    }

    @Subscribe public void onPluginMessage(PluginMessage event)
    {
        if (active && config.showQuests()) questBridge.receive(event);
    }

    private ClueScrollPlugin activeCluePlugin()
    {
        for (Plugin plugin : pluginManager.getPlugins())
            if (plugin instanceof ClueScrollPlugin && pluginManager.isPluginActive(plugin)) return (ClueScrollPlugin) plugin;
        return null;
    }

    // Capture after Clue Scroll and Quest Helper have updated their current steps.
    @Subscribe(priority = -2.0f) public void onGameTick(GameTick event)
    {
        RuneRadarServer current = server;
        if (current == null) return;
        Player player = client.getLocalPlayer();
        if (client.getGameState() != GameState.LOGGED_IN || player == null)
            current.update(PlayerData.unavailable("logged_out"));
        else
        {
            String name = player.getName();
            PlayerData.Account account = name == null || name.isEmpty() ? null : new PlayerData.Account(
                name, client.getWorld(), client.getBoostedSkillLevel(Skill.HITPOINTS),
                client.getBoostedSkillLevel(Skill.PRAYER), client.getEnergy() / 100);
            boolean viewer = current.hasViewer();
            HelperData clue = ClueHelperAdapter.capture(config.showClues(), viewer, this::activeCluePlugin);
            HelperData quest = questBridge.capture(config.showQuests(), viewer, eventBus::post);
            HelperData.Snapshot helpers = new HelperData.Snapshot(clue, quest);
            if (client.isInInstancedRegion())
                current.update(PlayerData.instanced(account, helpers));
            else
            {
                WorldPoint point = player.getWorldLocation();
                current.update(PlayerData.position(point.getX(), point.getY(), point.getPlane(), account, helpers));
            }
        }
    }
}
