package com.runeradar;

import net.runelite.client.config.Config;
import net.runelite.client.config.ConfigGroup;
import net.runelite.client.config.ConfigItem;
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
}
