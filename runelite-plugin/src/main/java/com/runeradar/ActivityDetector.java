package com.runeradar;

import java.util.HashMap;
import java.util.Map;

/**
 * Detects player activity from region IDs.
 * Region mappings sourced from RuneLite's Discord plugin (DiscordGameEventType).
 */
public class ActivityDetector
{
    private static final Map<Integer, String> REGION_ACTIVITY = new HashMap<>();

    static
    {
        // ── Bosses ──
        for (int r : new int[]{11851, 11850}) put(r, "Fighting Abyssal Sire");
        for (int r : new int[]{14672, 14416}) put(r, "Fighting Araxxor");
        for (int r : new int[]{4883, 5140, 5395}) put(r, "Fighting Cerberus");
        put(11602, "Fighting Commander Zilyana");
        put(11844, "Fighting Corporeal Beast");
        for (int r : new int[]{11588, 11589}) put(r, "Fighting Dagannoth Kings");
        put(12132, "Fighting Duke Sucellus");
        put(11347, "Fighting General Graardor");
        for (int r : new int[]{6993, 6992}) put(r, "Fighting Giant Mole");
        put(6727, "Fighting Grotesque Guardians");
        put(5021, "Fighting Hespori");
        put(5536, "Fighting Alchemical Hydra");
        for (int r : new int[]{13972, 14484}) put(r, "Fighting Kalphite Queen");
        put(9116, "Fighting Kraken");
        put(11346, "Fighting Kree'arra");
        put(11603, "Fighting K'ril Tsutsaroth");
        put(11601, "Fighting Nex");
        for (int r : new int[]{15515, 15516}) put(r, "Fighting Nightmare");
        put(12852, "Fighting Phantom Muspah");
        put(7322, "Fighting Sarachnis");
        put(6810, "Fighting Skotizo");
        put(9363, "Fighting Thermonuclear Smoke Devil");
        put(12077, "Battling Tempoross");
        put(8291, "Fighting The Leviathan");
        put(7768, "Fighting The Whisperer");
        put(4405, "Fighting Vardorvis");
        for (int r : new int[]{9023, 9024}) put(r, "Fighting Vorkath");
        put(7222, "Subduing Wintertodt");
        put(6460, "Fighting Zalcano");
        for (int r : new int[]{9007, 9008}) put(r, "Fighting Zulrah");

        // ── Raids ──
        for (int r : new int[]{13125, 13126, 13127, 13381, 13382, 13383, 13637, 13638, 13639, 13140, 13141, 13142, 13396, 13397, 13398, 13652, 13653, 13654})
            put(r, "Raiding Chambers of Xeric");
        for (int r : new int[]{12611, 12612, 12613, 12867, 12868, 12869, 13123, 13124, 13125})
            put(r, "Raiding Theatre of Blood");
        for (int r : new int[]{14160, 14162, 14164, 14674, 15186, 15188, 14672})
            put(r, "Raiding Tombs of Amascut");

        // ── Minigames ──
        for (int r : new int[]{9620, 9876}) put(r, "Playing Castle Wars");
        for (int r : new int[]{10322, 10578, 10834}) put(r, "Playing Barbarian Assault");
        put(14131, "Playing Barrows");
        put(7757, "Playing Blast Furnace");
        put(11157, "Playing Brimhaven Agility Arena");
        put(7513, "Playing Fortis Colosseum");
        put(7514, "In Colosseum Lobby");
        for (int r : new int[]{12127, 12383}) put(r, "Playing The Gauntlet");
        put(13491, "Playing Guardians of the Rift");
        for (int r : new int[]{8797, 9053, 9309, 9565}) put(r, "Exploring Hallowed Sepulchre");
        put(9043, "Attempting The Inferno");
        put(9551, "Attempting Fight Caves");
        put(13914, "Playing Giants' Foundry");
        for (int r : new int[]{10537, 10538}) put(r, "Playing Pest Control");
        put(7749, "Playing Pyramid Plunder");
        put(11321, "Playing Rogues' Den");
        for (int r : new int[]{8253, 8509, 8765, 9021}) put(r, "Playing Soul Wars");
        for (int r : new int[]{7223, 7479, 7735, 7991, 8247}) put(r, "Playing Temple Trekking");
        put(7222, "Subduing Wintertodt");
        put(7562, "Playing Tithe Farm");
        for (int r : new int[]{15263, 15519}) put(r, "Playing Volcanic Mine");
        put(9033, "Playing Nightmare Zone");
        put(6992, "Playing Mole");

        // ── Cities (selected major ones) ──
        for (int r : new int[]{12850, 12851, 13106, 13107, 13362, 13363}) put(r, "Varrock");
        for (int r : new int[]{12338, 12339, 12594, 12595}) put(r, "Lumbridge");
        for (int r : new int[]{11828, 11572, 11571, 12084}) put(r, "Falador");
        for (int r : new int[]{10547, 10548, 10804, 10292}) put(r, "Ardougne");
        for (int r : new int[]{11062, 11318}) put(r, "Camelot");
        for (int r : new int[]{13358, 13614, 13613}) put(r, "Al Kharid");
        for (int r : new int[]{14646, 14647}) put(r, "Edgeville");
        for (int r : new int[]{13878, 13622}) put(r, "Canifis");
        put(14484, "Grand Exchange");
        for (int r : new int[]{6967, 6711, 6710, 7223}) put(r, "Hosidius");
        for (int r : new int[]{5690, 5946}) put(r, "Shayzien");
        for (int r : new int[]{5941, 5942, 6197, 6198}) put(r, "Lovakengj");
        for (int r : new int[]{6454, 6710}) put(r, "Arceuus");
        for (int r : new int[]{7223, 7224}) put(r, "Piscarilius");
        for (int r : new int[]{12079, 12080, 12335, 12336}) put(r, "Rellekka");
        put(11319, "Seers' Village");
        put(11573, "Taverley");
        for (int r : new int[]{11574, 11575, 11830, 11831}) put(r, "Burthorpe");
        put(12082, "Port Sarim");
        put(11826, "Rimmington");
        put(11310, "Crafting Guild");
        put(11571, "Heroes' Guild");
        put(9776, "Catherby");
        for (int r : new int[]{6461, 6462}) put(r, "Woodcutting Guild");
        for (int r : new int[]{4922, 5178}) put(r, "Farming Guild");
        for (int r : new int[]{9263, 9264}) put(r, "Yanille");

        // ── Wilderness ──
        for (int r : new int[]{12092, 12093, 12348, 12349, 12604, 12605, 12860, 12861, 13116, 13117, 13372, 13373, 13628, 13629})
            put(r, "Wilderness");
    }

    private static void put(int regionId, String activity)
    {
        REGION_ACTIVITY.put(regionId, activity);
    }

    /**
     * Get the activity string for a region ID.
     * Returns null if no specific activity is mapped.
     */
    public static String forRegion(int regionId)
    {
        return REGION_ACTIVITY.get(regionId);
    }
}
