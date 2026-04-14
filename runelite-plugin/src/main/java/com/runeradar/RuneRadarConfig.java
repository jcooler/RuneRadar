package com.runeradar;

import net.runelite.client.config.Config;
import net.runelite.client.config.ConfigGroup;
import net.runelite.client.config.ConfigItem;
import net.runelite.client.config.ConfigSection;
import net.runelite.client.config.Range;

@ConfigGroup(RuneRadarConfig.GROUP)
public interface RuneRadarConfig extends Config
{
    String GROUP = "runeradar";

    @ConfigItem(
        keyName = "port",
        name = "WebSocket Port",
        description = "Local port for the RuneRadar WebSocket server",
        position = 1
    )
    @Range(min = 1024, max = 65535)
    default int port()
    {
        return 37780;
    }

    // ── Social ──

    @ConfigSection(
        name = "Social",
        description = "Share your location with friends, clan, and FC",
        position = 10
    )
    String socialSection = "social";

    @ConfigItem(
        keyName = "relayEnabled",
        name = "Enable Social Features",
        description = "Connect to the relay server to share location with others",
        section = socialSection,
        position = 11
    )
    default boolean relayEnabled()
    {
        return false;
    }

    @ConfigItem(
        keyName = "relayUrl",
        name = "Relay Server",
        description = "WebSocket URL of the RuneRadar relay server",
        section = socialSection,
        position = 12
    )
    default String relayUrl()
    {
        return "ws://localhost:9550";
    }

    @ConfigItem(
        keyName = "shareFriends",
        name = "Share with Friends List",
        description = "Show your location to mutual friends who also have the plugin",
        section = socialSection,
        position = 13
    )
    default boolean shareFriends()
    {
        return true;
    }

    @ConfigItem(
        keyName = "shareClan",
        name = "Share with Clan",
        description = "Show your location to clan members who also have the plugin",
        section = socialSection,
        position = 14
    )
    default boolean shareClan()
    {
        return true;
    }

    @ConfigItem(
        keyName = "shareFc",
        name = "Share with Friends Chat",
        description = "Show your location to FC members who also have the plugin",
        section = socialSection,
        position = 15
    )
    default boolean shareFc()
    {
        return false;
    }

    @ConfigItem(
        keyName = "privacyMode",
        name = "Privacy",
        description = "Control what location detail is shared",
        section = socialSection,
        position = 16
    )
    default PrivacyMode privacyMode()
    {
        return PrivacyMode.EXACT;
    }
}
