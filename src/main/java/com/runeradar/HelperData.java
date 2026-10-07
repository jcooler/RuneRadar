package com.runeradar;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.runelite.api.coords.WorldPoint;

/** Only the current objective, never inventories, quest variables or helper internals. */
final class HelperData
{
    static final int MAX_TARGETS = 16;
    final String state;
    final String title;
    final String text;
    final List<Target> targets;
    final int totalTargets;
    final boolean approximate;
    final String progress;

    private HelperData(String state, String title, String text, List<Target> targets,
        int totalTargets, boolean approximate, String progress)
    {
        this.state = state;
        this.title = plain(title, 100);
        this.text = plain(text, 1200);
        this.targets = Collections.unmodifiableList(targets);
        this.totalTargets = totalTargets;
        this.approximate = approximate;
        this.progress = progress == null ? null : plain(progress, 80);
    }

    static HelperData status(String state, String text)
    {
        return new HelperData(state, "", text, Collections.emptyList(), 0, false, null);
    }

    static HelperData objective(String title, String text, WorldPoint[] points, boolean approximate)
    {
        List<Target> targets = new ArrayList<>();
        if (points != null) for (WorldPoint point : points)
            if (point != null) targets.add(new Target(point, "", ""));
        return objective(title, text, targets, approximate, null);
    }

    static HelperData objective(String title, String text, List<Target> candidates, boolean approximate, String progress)
    {
        Map<WorldPoint, Target> unique = new LinkedHashMap<>();
        for (Target target : candidates)
            if (target != null && target.x >= 0 && target.x <= 65535 && target.y >= 0 && target.y <= 65535
                && target.plane >= 0 && target.plane <= 3)
                unique.putIfAbsent(new WorldPoint(target.x, target.y, target.plane), target);
        List<Target> targets = new ArrayList<>();
        for (Target target : unique.values())
        {
            if (targets.size() == MAX_TARGETS) break;
            targets.add(target);
        }
        return new HelperData("active", title, text, targets, unique.size(), approximate, progress);
    }

    static final class Target
    {
        final int x;
        final int y;
        final int plane;
        final String label;
        final String description;

        Target(WorldPoint point, String label, String description)
        {
            x = point.getX(); y = point.getY(); plane = point.getPlane();
            this.label = plain(label, 100);
            this.description = plain(description, 1200);
        }
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
