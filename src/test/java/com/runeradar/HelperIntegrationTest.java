package com.runeradar;

import java.util.AbstractMap;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import net.runelite.api.coords.WorldPoint;
import net.runelite.client.events.PluginMessage;
import net.runelite.client.plugins.cluescrolls.clues.CrypticClue;
import net.runelite.client.plugins.cluescrolls.clues.ThreeStepCrypticClue;
import org.junit.Test;
import static org.junit.Assert.*;

public class HelperIntegrationTest
{
    @Test public void noHelperReadWithoutConsentOrViewer()
    {
        AtomicInteger reads = new AtomicInteger();
        assertNull(ClueHelperAdapter.capture(false, true, () -> { reads.incrementAndGet(); return null; }));
        assertNull(ClueHelperAdapter.capture(true, false, () -> { reads.incrementAndGet(); return null; }));
        QuestHelperBridge quest = new QuestHelperBridge();
        assertNull(quest.capture(false, true, event -> reads.incrementAndGet()));
        assertNull(quest.capture(true, false, event -> reads.incrementAndGet()));
        assertEquals(0, reads.get());
    }

    @Test public void missingOrBrokenClueDoesNotBreakPersonalMap()
    {
        assertEquals("missing", ClueHelperAdapter.capture(true, true, () -> null).state);
        assertEquals("unsupported", ClueHelperAdapter.capture(true, true, () -> { throw new NoSuchMethodError(); }).state);
        assertEquals("idle", ClueHelperAdapter.describe(null, null).state);
    }

    @Test public void snapshotsAreBoundedPlainTextAndDistinctValidPoints()
    {
        WorldPoint[] points = new WorldPoint[22];
        for (int i = 0; i < points.length; i++) points[i] = new WorldPoint(3000 + i, 3200, 0);
        points[20] = points[0]; points[21] = new WorldPoint(-1, 3200, 0);
        HelperData value = HelperData.objective("<col=ff0000>Clue</col>", "x".repeat(1500), points, true);
        assertEquals("Clue", value.title);
        assertEquals(1200, value.text.length());
        assertEquals(16, value.targets.size());
        assertEquals(20, value.totalTargets);
        assertTrue(value.approximate);
        points[0] = new WorldPoint(1, 2, 0);
        assertEquals(3000, value.targets.get(0).x);
    }

    @Test public void completedCrypticSubstepsCannotLeaveOldTargets()
    {
        // Use the public builder so this test does not depend on a clue database string.
        CrypticClue a = CrypticClue.builder().text("Synthetic clue").build();
        ThreeStepCrypticClue complete = new ThreeStepCrypticClue(Arrays.asList(new AbstractMap.SimpleEntry<>(a, true)), "done");
        HelperData snapshot = ClueHelperAdapter.describe(complete, null);
        assertTrue(snapshot.targets.isEmpty());
        assertEquals("", snapshot.text);
    }

    @Test public void questUsesCorrelatedCurrentReplyAndClearsOldSteps()
    {
        QuestHelperBridge bridge = new QuestHelperBridge();
        HelperData active = bridge.capture(true, true, request -> {
            Map<String, Object> reply = new HashMap<>(request.getData());
            reply.put("state", "active"); reply.put("title", "Example quest"); reply.put("text", "Speak to the guide.");
            reply.put("target", new WorldPoint(3222, 3218, 0));
            bridge.receive(new PluginMessage("questhelper", "stepSnapshot", reply));
        });
        assertEquals("active", active.state); assertEquals(1, active.targets.size());
        HelperData missing = bridge.capture(true, true, request -> {});
        assertEquals("unsupported", missing.state); assertTrue(missing.targets.isEmpty());
        assertNull(bridge.capture(false, true, request -> fail("Opt-out must not publish")));
    }

    @Test public void unrelatedAndMalformedQuestMessagesCannotBecomeObjectives()
    {
        QuestHelperBridge bridge = new QuestHelperBridge();
        HelperData result = bridge.capture(true, true, request -> {
            Map<String, Object> reply = new HashMap<>(request.getData());
            reply.put("state", "active"); reply.put("title", "Quest"); reply.put("text", "Step");
            reply.put("target", "not a point");
            bridge.receive(new PluginMessage("questhelper", "stepSnapshot", reply));
            reply.remove("target"); reply.put("requestId", "old-request");
            bridge.receive(new PluginMessage("questhelper", "stepSnapshot", reply));
            bridge.receive(new PluginMessage("shortestpath", "path", reply));
        });
        assertEquals("unsupported", result.state); assertTrue(result.targets.isEmpty());
    }
}
