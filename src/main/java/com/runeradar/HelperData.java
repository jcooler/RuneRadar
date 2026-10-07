package com.runeradar;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import net.runelite.api.coords.WorldPoint;

/** Only the current objective, never inventories, quest variables or helper internals. */
final class HelperData
{
    static final int MAX_TARGETS = 16;
    final String state;
    final String title;
    final String text;
    final List<PlayerData.Position> targets;
    final int totalTargets;
    final boolean approximate;

    private HelperData(String state, String title, String text, List<PlayerData.Position> targets,
        int totalTargets, boolean approximate)
    {
        this.state = state;
        this.title = plain(title, 100);
        this.text = plain(text, 1200);
        this.targets = Collections.unmodifiableList(targets);
        this.totalTargets = totalTargets;
        this.approximate = approximate;
    }

    static HelperData status(String state, String text)
    {
        return new HelperData(state, "", text, Collections.emptyList(), 0, false);
    }

    static HelperData objective(String title, String text, WorldPoint[] points, boolean approximate)
    {
        Set<WorldPoint> unique = new LinkedHashSet<>();
        if (points != null) for (WorldPoint point : points)
            if (point != null && point.getX() >= 0 && point.getX() <= 65535 && point.getY() >= 0 && point.getY() <= 65535
                && point.getPlane() >= 0 && point.getPlane() <= 3) unique.add(point);
        List<PlayerData.Position> targets = new ArrayList<>();
        for (WorldPoint point : unique)
        {
            if (targets.size() == MAX_TARGETS) break;
            targets.add(new PlayerData.Position(point.getX(), point.getY(), point.getPlane()));
        }
        return new HelperData("active", title, text, targets, unique.size(), approximate);
    }

    static String plain(String value, int limit)
    {
        if (value == null) return "";
        String clean = value.replaceAll("(?i)<br\\s*/?>", "\n").replaceAll("<[^>]*>", "")
            .replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", "").trim();
        return clean.length() <= limit ? clean : clean.substring(0, limit - 1) + "…";
    }

    static final class Snapshot
    {
        final HelperData clue;
        final HelperData quest;
        Snapshot(HelperData clue, HelperData quest) { this.clue = clue; this.quest = quest; }
        Snapshot without(String helper) { return new Snapshot("clue".equals(helper) ? null : clue, "quest".equals(helper) ? null : quest); }
    }
}
