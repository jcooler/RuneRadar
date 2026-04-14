package com.runeradar;

import java.util.HashMap;
import java.util.Map;

/**
 * Detects player activity from region IDs.
 * Region ID formula: ((x >> 6) << 8) | (y >> 6)
 */
public class ActivityDetector
{
    private static final Map<Integer, String> REGION_ACTIVITY = new HashMap<>();

    static
    {
        // ── Cities (calculated from game coordinates) ──
        put(12850, "Lumbridge");
        put(12851, "Lumbridge");
        put(12853, "Varrock");
        put(12854, "Varrock");
        put(13109, "Varrock");
        put(13110, "Varrock");
        put(11828, "Falador");
        put(11829, "Falador");
        put(11827, "Falador");
        put(10547, "Ardougne");
        put(10548, "Ardougne");
        put(10803, "Ardougne");
        put(10804, "Ardougne");
        put(11062, "Camelot");
        put(13105, "Al Kharid");
        put(13106, "Al Kharid");
        put(12342, "Edgeville");
        put(13878, "Canifis");
        put(12598, "Grand Exchange");
        put(12597, "Grand Exchange");
        put(6968, "Hosidius");
        put(6967, "Hosidius");
        put(5944, "Shayzien");
        put(5945, "Shayzien");
        put(5948, "Lovakengj");
        put(6715, "Arceuus");
        put(7226, "Piscarilius");
        put(10553, "Rellekka");
        put(10554, "Rellekka");
        put(11061, "Catherby");
        put(10806, "Seers' Village");
        put(11573, "Taverley");
        put(11575, "Burthorpe");
        put(12082, "Port Sarim");
        put(11826, "Rimmington");
        put(10032, "Yanille");
        put(10033, "Yanille");
        put(12086, "Motherlode Mine");
        put(11310, "Crafting Guild");
        put(11571, "Heroes' Guild");
        put(6461, "Woodcutting Guild");
        put(4922, "Farming Guild");
        put(11319, "Legends' Guild");
        put(13617, "Slepe");
        put(14133, "Darkmeyer");
        put(14389, "Meiyerditch");
        put(13362, "Sophanem");
        put(13874, "Burgh de Rott");
        put(13618, "Port Phasmatys");
        put(6714, "Kourend Castle");
        put(12594, "Draynor Village");
        put(12595, "Draynor Village");
        put(9264, "Castle Wars");
        put(7513, "Civitas illa Fortis");
        put(7514, "Civitas illa Fortis");

        // ── Bosses ──
        put(11851, "Fighting Abyssal Sire");
        put(11850, "Fighting Abyssal Sire");
        put(4883, "Fighting Cerberus");
        put(5140, "Fighting Cerberus");
        put(11602, "Fighting Commander Zilyana");
        put(11844, "Fighting Corporeal Beast");
        put(11588, "Fighting Dagannoth Kings");
        put(11589, "Fighting Dagannoth Kings");
        put(11347, "Fighting General Graardor");
        put(6993, "Fighting Giant Mole");
        put(6992, "Fighting Giant Mole");
        put(6727, "Fighting Grotesque Guardians");
        put(5021, "Fighting Hespori");
        put(5536, "Fighting Alchemical Hydra");
        put(9116, "Fighting Kraken");
        put(11346, "Fighting Kree'arra");
        put(11603, "Fighting K'ril Tsutsaroth");
        put(11601, "Fighting Nex");
        put(15515, "Fighting Nightmare");
        put(15516, "Fighting Nightmare");
        put(7322, "Fighting Sarachnis");
        put(6810, "Fighting Skotizo");
        put(9363, "Fighting Thermonuclear Smoke Devil");
        put(12077, "Battling Tempoross");
        put(9023, "Fighting Vorkath");
        put(9024, "Fighting Vorkath");
        put(7222, "Subduing Wintertodt");
        put(6460, "Fighting Zalcano");
        put(9007, "Fighting Zulrah");
        put(9008, "Fighting Zulrah");

        // ── Raids ──
        put(13125, "Raiding Chambers of Xeric");
        put(13126, "Raiding Chambers of Xeric");
        put(13381, "Raiding Chambers of Xeric");
        put(13382, "Raiding Chambers of Xeric");
        put(13637, "Raiding Chambers of Xeric");
        put(13638, "Raiding Chambers of Xeric");
        put(12611, "Raiding Theatre of Blood");
        put(12612, "Raiding Theatre of Blood");
        put(12867, "Raiding Theatre of Blood");
        put(12868, "Raiding Theatre of Blood");
        put(14160, "Raiding Tombs of Amascut");
        put(14162, "Raiding Tombs of Amascut");
        put(15186, "Raiding Tombs of Amascut");
        put(15188, "Raiding Tombs of Amascut");

        // ── Minigames ──
        put(9620, "Playing Castle Wars");
        put(9876, "Playing Castle Wars");
        put(10322, "Playing Barbarian Assault");
        put(14131, "Exploring Barrows");
        put(7757, "Playing Blast Furnace");
        put(11157, "Playing Brimhaven Agility Arena");
        put(12127, "Playing The Gauntlet");
        put(12383, "Playing The Gauntlet");
        put(13491, "Playing Guardians of the Rift");
        put(9043, "Attempting The Inferno");
        put(9551, "Attempting Fight Caves");
        put(13914, "Playing Giants' Foundry");
        put(10537, "Playing Pest Control");
        put(10538, "Playing Pest Control");
        put(7749, "Playing Pyramid Plunder");
        put(11321, "Playing Rogues' Den");
        put(7562, "Playing Tithe Farm");
        put(15263, "Playing Volcanic Mine");
        put(9033, "Playing Nightmare Zone");

        // ── Wilderness ──
        put(12349, "Wilderness");
        put(12605, "Wilderness");
        put(12861, "Wilderness");
        put(13117, "Wilderness");
        put(13373, "Wilderness");
        put(12093, "Wilderness");
        put(12348, "Wilderness");
        put(12604, "Wilderness");
        put(12860, "Wilderness");
        put(13116, "Wilderness");
        put(13372, "Wilderness");
        put(13628, "Wilderness");

        // ── Dungeons ──
        put(12189, "Taverley Dungeon");
        put(11573, "Taverley Dungeon");
        put(12698, "Stronghold of Security");
        put(12954, "Stronghold of Security");
        put(11164, "Edgeville Dungeon");
        put(5280, "Catacombs of Kourend");
        put(6557, "Karuulm Slayer Dungeon");
    }

    private static void put(int regionId, String activity)
    {
        REGION_ACTIVITY.putIfAbsent(regionId, activity);
    }

    public static String forRegion(int regionId)
    {
        return REGION_ACTIVITY.get(regionId);
    }
}
