package com.runeradar;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import net.runelite.api.coords.WorldPoint;
import net.runelite.client.plugins.cluescrolls.ClueScrollPlugin;
import net.runelite.client.plugins.cluescrolls.clues.*;

/** Core Clue Scroll is shared by RuneLite's class loader; only public typed APIs are used. */
final class ClueHelperAdapter
{
    static HelperData capture(boolean enabled, boolean viewer, Supplier<ClueScrollPlugin> source)
    {
        if (!enabled || !viewer) return null;
        try
        {
            ClueScrollPlugin plugin = source.get();
            if (plugin == null) return HelperData.status("missing", "Enable RuneLite's Clue Scroll plugin to show your active clue.");
            return describe(plugin.getClue(), plugin);
        }
        catch (RuntimeException | LinkageError incompatible)
        {
            // Do not log clue/account data. A helper update cannot break the base map.
            return HelperData.status("unsupported", "This clue cannot be read by this map version. Use RuneLite's clue overlay.");
        }
    }

    static HelperData describe(ClueScroll clue, ClueScrollPlugin plugin)
    {
        if (clue == null) return HelperData.status("idle", "Read a clue in game to show its current objective here.");
        String title = "Clue scroll", text = "";
        boolean approximate = false;
        WorldPoint[] points = locations(clue, plugin);
        if (clue instanceof HotColdClue)
        {
            HotColdClue hot = (HotColdClue) clue;
            title = "Hot / cold clue";
            approximate = hot.getHotColdSolver() != null && hot.getHotColdSolver().getLastWorldPoint() != null && hot.getLocation() == null;
            if (hot.getLocation() != null) points = new WorldPoint[]{hot.getLocation()};
            text = approximate ? "Possible search areas, not exact dig tiles. Use the strange device to narrow the locations."
                : hot.getLocation() != null ? "Dig at the marked tile." : hot.getSolution();
        }
        else if (clue instanceof ThreeStepCrypticClue)
        {
            title = "Three-part cryptic clue";
            List<String> steps = new ArrayList<>();
            List<HelperData.Target> targets = new ArrayList<>();
            List<Map.Entry<CrypticClue, Boolean>> parts = ((ThreeStepCrypticClue) clue).getClueSteps();
            int completed = 0;
            for (Map.Entry<CrypticClue, Boolean> entry : parts)
            {
                if (Boolean.TRUE.equals(entry.getValue())) { completed++; continue; }
                CrypticClue part = entry.getKey();
                String instruction = part.getSolution(plugin);
                steps.add(instruction);
                addTargets(targets, locations(part, plugin), label(part, plugin), instruction);
            }
            // This is progress within a three-part clue, not the length of the treasure trail.
            String progress = parts.size() == 3 ? completed + " of 3 parts complete" : null;
            return HelperData.objective(title, String.join("\n", steps), targets, false, progress);
        }
        else if (clue instanceof CrypticClue)
        {
            CrypticClue cryptic = (CrypticClue) clue;
            title = "Cryptic clue";
            text = cryptic.getSolution(plugin);
            if (cryptic.getAnswer() != null) text += "\nAnswer: " + cryptic.getAnswer();
        }
        else if (clue instanceof AnagramClue)
        {
            AnagramClue anagram = (AnagramClue) clue;
            title = "Anagram clue";
            text = "Speak to " + anagram.getNpcProvider().apply(plugin) + ". " + anagram.getArea();
            if (anagram.getAnswerProvider() != null) text += "\nAnswer: " + anagram.getAnswerProvider().apply(plugin);
        }
        else if (clue instanceof CipherClue)
        {
            CipherClue cipher = (CipherClue) clue;
            title = "Cipher clue";
            text = "Speak to " + String.join(", ", cipher.getNpcs(plugin)) + ".";
            if (cipher.getAnswer() != null) text += "\nAnswer: " + cipher.getAnswer();
        }
        else if (clue instanceof EmoteClue) { title = "Emote clue"; text = ((EmoteClue) clue).getText(); }
        else if (clue instanceof MapClue) { title = "Map clue"; text = ((MapClue) clue).getDescription(); }
        else if (clue instanceof CoordinateClue) { title = "Coordinate clue"; text = "Dig at the marked location. Check RuneLite's clue overlay for combat or equipment requirements."; }
        else if (clue instanceof FairyRingClue) { title = "Fairy ring clue"; text = ((FairyRingClue) clue).getText(); }
        else if (clue instanceof MusicClue) { title = "Music clue"; text = "Play " + ((MusicClue) clue).getSong() + " for the clue's NPC."; }
        else if (clue instanceof SkillChallengeClue)
        {
            SkillChallengeClue skill = (SkillChallengeClue) clue;
            title = "Skill challenge";
            text = skill.isChallengeCompleted() ? skill.getReturnText() : skill.getChallenge();
        }
        else if (clue instanceof FaloTheBardClue) { title = "Falo the Bard"; text = ((FaloTheBardClue) clue).getText(); }
        else return HelperData.status("unsupported", "This clue type has no supported map objective yet. Use RuneLite's clue overlay.");
        List<HelperData.Target> targets = new ArrayList<>();
        addTargets(targets, points, approximate ? "Possible search area" : label(clue, plugin), text);
        return HelperData.objective(title, text, targets, approximate, null);
    }

    private static WorldPoint[] locations(ClueScroll clue, ClueScrollPlugin plugin)
    {
        return clue instanceof LocationsClueScroll ? ((LocationsClueScroll) clue).getLocations(plugin)
            : clue instanceof LocationClueScroll ? ((LocationClueScroll) clue).getLocations(plugin) : null;
    }

    private static String label(ClueScroll clue, ClueScrollPlugin plugin)
    {
        if (clue instanceof NpcClueScroll)
        {
            String[] names = ((NpcClueScroll) clue).getNpcs(plugin);
            List<String> known = new ArrayList<>();
            if (names != null) for (String name : names)
                if (name != null && !name.isBlank() && !known.contains(name)) known.add(name);
            if (!known.isEmpty()) return String.join(" / ", known);
        }
        if (clue.isRequiresSpade()) return "Dig location";
        if (clue instanceof EmoteClue) return "Emote location";
        return "Clue location";
    }

    private static void addTargets(List<HelperData.Target> targets, WorldPoint[] points, String label, String description)
    {
        if (points != null) for (WorldPoint point : points)
            if (point != null) targets.add(new HelperData.Target(point, label, description));
    }
}
