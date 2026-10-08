package com.runeradar;

import net.runelite.client.config.*;

@ConfigGroup(RuneRadarConfig.GROUP)
public interface RuneRadarConfig extends Config
{
    String GROUP = "runeradar";

    @ConfigItem(keyName = "showClues", name = "Show clue assistance", description = "Opt in to share the active Clue Scroll objective with your paired local map. Does not enable Clue Scroll automatically.", position = 3)
    default boolean showClues() { return false; }

    @ConfigItem(keyName = "showQuests", name = "Show Quest Helper assistance", description = "Opt in to share the active quest step with your paired local map. Requires Quest Helper step-sharing support, currently awaiting upstream release.", position = 4)
    default boolean showQuests() { return false; }

    @ConfigItem(keyName = "port", name = "Local connection port", description = "Change only if another program uses the default port. Reopens pairing after a change.", position = 1)
    @Range(min = 1024, max = 65535)
    default int port() { return 37780; }

    @ConfigItem(keyName = "developmentMap", name = "Use local development map", description = "For developers: opens and permits only http://127.0.0.1:8000 instead of runeradar.app. Disconnects the current map.", position = 2)
    default boolean developmentMap() { return false; }
}
