package com.runeradar;

import com.google.inject.Provides;
import lombok.extern.slf4j.Slf4j;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.runelite.api.Client;
import net.runelite.api.FriendsChatManager;
import net.runelite.api.FriendsChatMember;
import net.runelite.api.GameState;
import net.runelite.api.Player;
import net.runelite.api.Quest;
import net.runelite.api.QuestState;
import net.runelite.api.clan.ClanChannel;
import net.runelite.api.clan.ClanChannelMember;
import net.runelite.api.clan.ClanSettings;
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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@PluginDescriptor(
    name = "RuneRadar",
    description = "Streams your live position to a local map webapp via WebSocket",
    tags = {"map", "location", "radar", "websocket", "social"}
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
    private RuneRadarRelayClient relayClient;
    private WorldPoint lastLocation;
    private WorldPoint lastSurfaceLocation;
    private QuestHelperBridge questBridge;
    private ClueScrollBridge clueBridge;
    private String lastQuestData;
    private String lastClueData;
    private int questNullTicks;
    private int clueNullTicks;
    private static final int NULL_CLEAR_THRESHOLD = 10;
    private static final Gson GSON = new Gson();
    private Map<String, String> lastQuestStates = new HashMap<>();
    private int questStateTickCounter;
    private static final int QUEST_STATE_POLL_INTERVAL = 50;

    // Social: track last sent social state to avoid spamming updates
    private int socialUpdateTickCounter;
    private static final int SOCIAL_UPDATE_INTERVAL = 100; // ~60 seconds
    private String lastSocialHash = "";

    // Activity detection
    private static final Map<Integer, String> REGION_ACTIVITIES = new HashMap<>();
    static
    {
        REGION_ACTIVITIES.put(14484, "Grand Exchange");
        REGION_ACTIVITIES.put(12850, "Varrock");
        REGION_ACTIVITIES.put(12338, "Lumbridge");
        REGION_ACTIVITIES.put(11828, "Falador");
        REGION_ACTIVITIES.put(10804, "Ardougne");
        REGION_ACTIVITIES.put(9776, "Camelot");
        REGION_ACTIVITIES.put(13358, "Al Kharid");
        REGION_ACTIVITIES.put(14646, "Edgeville");
        REGION_ACTIVITIES.put(13878, "Canifis");
        REGION_ACTIVITIES.put(6967, "Hosidius");
        REGION_ACTIVITIES.put(6714, "Shayzien");
        REGION_ACTIVITIES.put(14906, "Wilderness");
        REGION_ACTIVITIES.put(15155, "Wilderness");
        REGION_ACTIVITIES.put(12852, "Champions' Guild");
        REGION_ACTIVITIES.put(11310, "Crafting Guild");
        REGION_ACTIVITIES.put(11571, "Heroes' Guild");
        REGION_ACTIVITIES.put(6461, "Woodcutting Guild");
        REGION_ACTIVITIES.put(4922, "Farming Guild");
        REGION_ACTIVITIES.put(7222, "Wintertodt Camp");
        REGION_ACTIVITIES.put(14642, "Motherlode Mine");
        REGION_ACTIVITIES.put(5536, "Chambers of Xeric");
        REGION_ACTIVITIES.put(14386, "Theatre of Blood");
        REGION_ACTIVITIES.put(13122, "Tombs of Amascut");
        REGION_ACTIVITIES.put(9023, "Castle Wars");
        REGION_ACTIVITIES.put(7513, "Fortis Colosseum");
    }

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
        stopRelayClient();
        if (server != null)
        {
            server.stop(1000);
            server = null;
        }
        lastLocation = null;
    }

    private void startRelayClient()
    {
        if (!config.relayEnabled()) return;
        if (client.getGameState() != GameState.LOGGED_IN) return;

        Player localPlayer = client.getLocalPlayer();
        if (localPlayer == null) return;

        String rsn = localPlayer.getName();
        if (rsn == null || rsn.isEmpty()) return;

        relayClient = new RuneRadarRelayClient(
            config.relayUrl(),
            rsn,
            (peerMessage) -> {
                if (server != null)
                {
                    server.broadcastRaw(peerMessage);
                }
            }
        );
        relayClient.connect();
        log.info("RuneRadar Relay: Connecting as {}", rsn);
    }

    private void stopRelayClient()
    {
        if (relayClient != null)
        {
            relayClient.shutdown();
            relayClient = null;
        }
    }

    /**
     * Read the player's friends list from the RuneLite API.
     */
    private List<String> getFriendsList()
    {
        List<String> friends = new ArrayList<>();
        try
        {
            net.runelite.api.NameableContainer<net.runelite.api.Friend> container =
                client.getFriendContainer();
            if (container != null)
            {
                for (net.runelite.api.Friend friend : container.getMembers())
                {
                    if (friend != null && friend.getName() != null)
                    {
                        friends.add(friend.getName());
                    }
                }
            }
        }
        catch (Exception e)
        {
            log.debug("RuneRadar: Error reading friends list", e);
        }
        return friends;
    }

    /**
     * Get the current clan name, or null if not in a clan.
     */
    private String getClanName()
    {
        try
        {
            ClanSettings clanSettings = client.getClanSettings();
            if (clanSettings != null)
            {
                return clanSettings.getName();
            }
        }
        catch (Exception e)
        {
            log.debug("RuneRadar: Error reading clan", e);
        }
        return null;
    }

    /**
     * Get the current friends chat name, or null if not in one.
     */
    private String getFcName()
    {
        try
        {
            FriendsChatManager fcManager = client.getFriendsChatManager();
            if (fcManager != null)
            {
                return fcManager.getOwner();
            }
        }
        catch (Exception e)
        {
            log.debug("RuneRadar: Error reading FC", e);
        }
        return null;
    }

    /**
     * Send the social graph to the relay server.
     * Only sends if the data has changed since the last update.
     */
    private void sendSocialUpdate()
    {
        if (relayClient == null || !relayClient.isIdentified()) return;

        List<String> friends = config.shareFriends() ? getFriendsList() : new ArrayList<>();
        String clan = config.shareClan() ? getClanName() : null;
        String fc = config.shareFc() ? getFcName() : null;

        // Build a hash to avoid sending duplicate updates
        String hash = friends.toString() + "|" + clan + "|" + fc
            + "|" + config.shareFriends() + "|" + config.shareClan() + "|" + config.shareFc();

        if (hash.equals(lastSocialHash)) return;
        lastSocialHash = hash;

        relayClient.sendSocialUpdate(friends, clan, fc,
            config.shareFriends(), config.shareClan(), config.shareFc());

        log.debug("RuneRadar Relay: Social update — {} friends, clan={}, fc={}",
            friends.size(), clan, fc);
    }

    private String detectActivity(int regionId, boolean instanced)
    {
        if (instanced) return "In an instance";
        String area = REGION_ACTIVITIES.get(regionId);
        return area != null ? area : "";
    }

    @Subscribe
    public void onGameTick(GameTick event)
    {
        if (client.getGameState() != GameState.LOGGED_IN) return;

        Player localPlayer = client.getLocalPlayer();
        if (localPlayer == null) return;

        WorldPoint location = localPlayer.getWorldLocation();
        if (location == null) return;

        // Start relay once logged in
        if (relayClient == null && config.relayEnabled())
        {
            startRelayClient();
        }

        boolean positionChanged = !location.equals(lastLocation);
        lastLocation = location;

        boolean isInstanced = client.isInInstancedRegion();
        if (!isInstanced)
        {
            lastSurfaceLocation = location;
        }

        String playerName = localPlayer.getName();
        int world = client.getWorld();
        int health = client.getBoostedSkillLevel(net.runelite.api.Skill.HITPOINTS);
        int prayer = client.getBoostedSkillLevel(net.runelite.api.Skill.PRAYER);
        int runEnergy = client.getEnergy() / 100;

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

            // ── Relay: position + social updates ──
            if (relayClient != null && relayClient.isConnected())
            {
                if (positionChanged)
                {
                    String activity = detectActivity(reportLocation.getRegionID(), isInstanced);
                    List<String> friends = config.shareFriends() ? getFriendsList() : null;
                    String clanName = config.shareClan() ? getClanName() : null;
                    String fcName = config.shareFc() ? getFcName() : null;
                    relayClient.sendPosition(
                        reportLocation.getX(), reportLocation.getY(),
                        reportLocation.getPlane(), world,
                        activity, isInstanced, config.privacyMode(),
                        friends, clanName, fcName,
                        config.shareFriends(), config.shareClan(), config.shareFc()
                    );
                }

                // Periodically send social graph updates
                socialUpdateTickCounter++;
                if (socialUpdateTickCounter >= SOCIAL_UPDATE_INTERVAL)
                {
                    socialUpdateTickCounter = 0;
                    sendSocialUpdate();
                }
            }

            // ── Quest states ──
            questStateTickCounter++;
            if (questStateTickCounter >= QUEST_STATE_POLL_INTERVAL || lastQuestStates.isEmpty())
            {
                questStateTickCounter = 0;
                sendQuestStates();
            }

            // ── Quest helper ──
            if (questBridge != null)
            {
                try
                {
                    String questData = questBridge.getQuestWaypointsJson();
                    if (questData != null)
                    {
                        questNullTicks = 0;
                        if (!questData.equals(lastQuestData))
                        {
                            lastQuestData = questData;
                            server.broadcastRaw(questData);
                        }
                    }
                    else if (lastQuestData != null)
                    {
                        questNullTicks++;
                        if (questNullTicks >= NULL_CLEAR_THRESHOLD)
                        {
                            lastQuestData = null;
                            questNullTicks = 0;
                            server.broadcastRaw("{\"type\":\"questHelper\",\"quest\":null}");
                        }
                    }
                }
                catch (Exception e)
                {
                    log.debug("RuneRadar: Error sending quest data", e);
                }
            }

            // ── Clue scroll ──
            if (clueBridge != null)
            {
                try
                {
                    String clueData = clueBridge.getClueDataJson();
                    if (clueData != null)
                    {
                        clueNullTicks = 0;
                        if (!clueData.equals(lastClueData))
                        {
                            lastClueData = clueData;
                            server.broadcastRaw(clueData);
                        }
                    }
                    else if (lastClueData != null)
                    {
                        clueNullTicks++;
                        if (clueNullTicks >= NULL_CLEAR_THRESHOLD)
                        {
                            lastClueData = null;
                            clueNullTicks = 0;
                            server.broadcastRaw("{\"type\":\"clueScroll\",\"location\":null}");
                        }
                    }
                }
                catch (Exception e)
                {
                    log.debug("RuneRadar: Error sending clue data", e);
                }
            }
        }
    }

    private void sendQuestStates()
    {
        if (server == null || client.getGameState() != GameState.LOGGED_IN) return;

        try
        {
            Map<String, String> currentStates = new HashMap<>();
            JsonArray questArray = new JsonArray();

            for (Quest quest : Quest.values())
            {
                try
                {
                    QuestState state = quest.getState(client);
                    String name = quest.getName();
                    String stateStr = state == QuestState.FINISHED ? "completed"
                        : state == QuestState.IN_PROGRESS ? "in_progress"
                        : "not_started";

                    currentStates.put(name, stateStr);

                    JsonObject q = new JsonObject();
                    q.addProperty("name", name);
                    q.addProperty("state", stateStr);
                    questArray.add(q);
                }
                catch (Exception e)
                {
                    // Some quests may not be queryable
                }
            }

            if (!currentStates.equals(lastQuestStates))
            {
                lastQuestStates = currentStates;

                JsonObject msg = new JsonObject();
                msg.addProperty("type", "questStates");
                msg.add("quests", questArray);
                server.broadcastRaw(GSON.toJson(msg));
                log.debug("RuneRadar: Sent {} quest states", questArray.size());
            }
        }
        catch (Exception e)
        {
            log.debug("RuneRadar: Error collecting quest states", e);
        }
    }

    @Subscribe
    public void onGameStateChanged(GameStateChanged event)
    {
        if (event.getGameState() == GameState.LOGIN_SCREEN)
        {
            lastLocation = null;
            lastSocialHash = "";
            if (server != null)
            {
                server.broadcastLogout();
            }
            stopRelayClient();
        }
        else if (event.getGameState() == GameState.LOGGED_IN)
        {
            if (relayClient == null && config.relayEnabled())
            {
                startRelayClient();
            }
        }
    }

    @Subscribe
    public void onConfigChanged(ConfigChanged event)
    {
        if (!event.getGroup().equals(RuneRadarConfig.GROUP)) return;

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

        if (event.getKey().equals("relayEnabled") || event.getKey().equals("relayUrl"))
        {
            stopRelayClient();
            if (config.relayEnabled())
            {
                startRelayClient();
            }
        }

        // Social toggle changes — force a social update on next tick
        if (event.getKey().equals("shareFriends") || event.getKey().equals("shareClan")
            || event.getKey().equals("shareFc"))
        {
            lastSocialHash = "";
            socialUpdateTickCounter = SOCIAL_UPDATE_INTERVAL;
        }
    }
}
