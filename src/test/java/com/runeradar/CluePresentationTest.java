package com.runeradar;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.util.AbstractMap;
import java.util.Arrays;
import java.util.Map;
import net.runelite.api.coords.WorldPoint;
import net.runelite.client.plugins.cluescrolls.clues.CrypticClue;
import net.runelite.client.plugins.cluescrolls.clues.ThreeStepCrypticClue;
import org.junit.Test;
import static org.junit.Assert.*;

public class CluePresentationTest
{
    private CrypticClue clue(String name, String instruction, int x)
    {
        return CrypticClue.builder().text("Synthetic clue").npc(name).solution(instruction)
            .location(new WorldPoint(x, 3250, 0)).build();
    }

    @Test public void destinationComesFromClueApiWithoutInventingTrailProgress()
    {
        HelperData result = ClueHelperAdapter.describe(clue("The Face", "Talk to The Face near the manhole.", 3018), null);
        JsonObject json = new Gson().toJsonTree(result).getAsJsonObject();
        JsonObject target = json.getAsJsonArray("targets").get(0).getAsJsonObject();
        assertTrue("Clue target needs an NPC label", target.has("label"));
        assertEquals("The Face", target.get("label").getAsString());
        assertEquals(result.text, target.get("description").getAsString());
        assertFalse("Trail length is unknown", json.has("progress"));
    }

    @Test public void threePartCluesKeepInstructionsWithTheirOwnUnfinishedLocations()
    {
        Map.Entry<CrypticClue, Boolean> first = new AbstractMap.SimpleEntry<>(clue("First NPC", "First instruction.", 3010), true);
        Map.Entry<CrypticClue, Boolean> second = new AbstractMap.SimpleEntry<>(clue("Second NPC", "Second instruction.", 3020), false);
        Map.Entry<CrypticClue, Boolean> third = new AbstractMap.SimpleEntry<>(clue("Third NPC", "Third instruction.", 3030), false);
        ThreeStepCrypticClue clue = new ThreeStepCrypticClue(Arrays.asList(first, second, third), "Three parts");
        HelperData result = ClueHelperAdapter.describe(clue, null);
        JsonObject json = new Gson().toJsonTree(result).getAsJsonObject();
        assertTrue("Only actual three-part progress may be displayed", json.has("progress"));
        assertEquals("1 of 3 parts complete", json.get("progress").getAsString());
        assertEquals(2, result.targets.size());
        JsonObject target = json.getAsJsonArray("targets").get(0).getAsJsonObject();
        assertEquals("Second NPC", target.get("label").getAsString());
        assertEquals("Second instruction.", target.get("description").getAsString());
        assertFalse(result.text.contains("First instruction"));
        second.setValue(true); third.setValue(true);
        result = ClueHelperAdapter.describe(clue, null);
        assertTrue(result.targets.isEmpty());
        assertEquals("3 of 3 parts complete", new Gson().toJsonTree(result).getAsJsonObject().get("progress").getAsString());
    }

    @Test public void destinationMetadataIsBoundedAndPlainText()
    {
        HelperData result = ClueHelperAdapter.describe(clue("<col=ff0000>" + "n".repeat(150) + "</col>", "<br>" + "x".repeat(1500), 3018), null);
        JsonObject target = new Gson().toJsonTree(result).getAsJsonObject().getAsJsonArray("targets").get(0).getAsJsonObject();
        assertTrue("Clue target needs bounded context", target.has("description"));
        assertTrue(target.get("label").getAsString().length() <= 100);
        assertFalse(target.get("label").getAsString().contains("<"));
        assertEquals(1200, target.get("description").getAsString().length());
    }
}
