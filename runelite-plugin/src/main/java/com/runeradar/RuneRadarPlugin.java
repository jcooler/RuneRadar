package com.runeradar;

import com.google.inject.Provides;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Client;
import net.runelite.api.GameState;
import net.runelite.api.Player;
import net.runelite.api.coords.WorldPoint;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.events.ConfigChanged;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.api.events.GameStateChanged;
import net.runelite.api.events.GameTick;

import net.runelite.client.plugins.PluginManager;

import javax.inject.Inject;

@Slf4j
@PluginDescriptor(
    name = "RuneRadar",
    description = "Streams your live position to a local map webapp via WebSocket",
    tags = {"map", "location", "radar", "websocket"}
)
public class RuneRadarPlugin extends Plugin
{
    @Inject
    private Client client;

    @Inject
    private PluginManager pluginManager;

    @Inject
    private RuneRadarConfig config;

    private RuneRadarServer server;
    private WorldPoint lastLocation;
    private WorldPoint lastSurfaceLocation;
    private QuestHelperBridge questBridge;
    private ClueScrollBridge clueBridge;
    private String lastQuestData;
    private String lastClueData;

    @Provides
    RuneRadarConfig provideConfig(ConfigManager configManager)
    {
        return configManager.getConfig(RuneRadarConfig.class);
    }

    @Override
    protected void startUp() throws Exception
    {
        log.info("RuneRadar starting up");
        server = new RuneRadarServer(config.port());
        server.start();
        questBridge = new QuestHelperBridge(pluginManager);
        clueBridge = new ClueScrollBridge(pluginManager);
        log.info("RuneRadar WebSocket server started on port {}", config.port());
    }

    @Override
    protected void shutDown() throws Exception
    {
        log.info("RuneRadar shutting down");
        if (server != null)
        {
            server.stop(1000);
            server = null;
        }
        lastLocation = null;
    }

    @Subscribe
    public void onGameTick(GameTick event)
    {
        if (client.getGameState() != GameState.LOGGED_IN)
        {
            return;
        }

        Player localPlayer = client.getLocalPlayer();
        if (localPlayer == null)
        {
            return;
        }

        WorldPoint location = localPlayer.getWorldLocation();
        if (location == null)
        {
            return;
        }

        boolean positionChanged = !location.equals(lastLocation);
        lastLocation = location;

        boolean isInstanced = client.isInInstancedRegion();

        // Track last non-instanced location so we can show it during instances
        if (!isInstanced)
        {
            lastSurfaceLocation = location;
        }

        String playerName = localPlayer.getName();
        int world = client.getWorld();
        int health = client.getBoostedSkillLevel(net.runelite.api.Skill.HITPOINTS);
        int prayer = client.getBoostedSkillLevel(net.runelite.api.Skill.PRAYER);
        int runEnergy = client.getEnergy() / 100;

        // If instanced, send the last surface location instead
        WorldPoint reportLocation = isInstanced && lastSurfaceLocation != null
            ? lastSurfaceLocation : location;

        PlayerData data = new PlayerData(
            playerName,
            reportLocation.getX(),
            reportLocation.getY(),
            reportLocation.getPlane(),
            reportLocation.getRegionID(),
            world,
            health,
            prayer,
            runEnergy,
            isInstanced
        );

        if (server != null)
        {
            if (positionChanged)
            {
                server.broadcast(data);
            }

            // Send quest helper data if available (every tick, only if changed)
            if (questBridge != null)
            {
                try
                {
                    String questData = questBridge.getQuestWaypointsJson();
                    if (questData != null && !questData.equals(lastQuestData))
                    {
                        lastQuestData = questData;
                        server.broadcastRaw(questData);
                    }
                    else if (questData == null && lastQuestData != null)
                    {
                        lastQuestData = null;
                        server.broadcastRaw("{\"type\":\"questHelper\",\"quest\":null}");
                    }
                }
                catch (Exception e)
                {
                    log.debug("RuneRadar: Error sending quest data", e);
                }
            }

            // Send clue scroll data if available
            if (clueBridge != null)
            {
                try
                {
                    String clueData = clueBridge.getClueDataJson();
                    if (clueData != null && !clueData.equals(lastClueData))
                    {
                        lastClueData = clueData;
                        server.broadcastRaw(clueData);
                    }
                    else if (clueData == null && lastClueData != null)
                    {
                        lastClueData = null;
                        server.broadcastRaw("{\"type\":\"clueScroll\",\"location\":null}");
                    }
                }
                catch (Exception e)
                {
                    log.debug("RuneRadar: Error sending clue data", e);
                }
            }
        }
    }

    @Subscribe
    public void onGameStateChanged(GameStateChanged event)
    {
        if (event.getGameState() == GameState.LOGIN_SCREEN)
        {
            lastLocation = null;
            if (server != null)
            {
                server.broadcastLogout();
            }
        }
    }

    @Subscribe
    public void onConfigChanged(ConfigChanged event)
    {
        if (!event.getGroup().equals(RuneRadarConfig.GROUP))
        {
            return;
        }

        if (event.getKey().equals("port") && server != null)
        {
            try
            {
                server.stop(1000);
                server = new RuneRadarServer(config.port());
                server.start();
                log.info("RuneRadar WebSocket server restarted on port {}", config.port());
            }
            catch (Exception e)
            {
                log.error("Failed to restart RuneRadar server", e);
            }
        }
    }
}
