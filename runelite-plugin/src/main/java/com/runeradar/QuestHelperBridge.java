package com.runeradar;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.coords.WorldPoint;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginManager;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * Bridge to Quest Helper plugin — reads current quest step waypoints
 * via reflection since Quest Helper is a separate plugin without a public API.
 *
 * Quest Helper internals (from source):
 * - QuestHelperPlugin has field: QuestHelper selectedQuest
 * - QuestHelper has method: QuestStep getCurrentStep()
 * - QuestStep has methods:
 *   - WorldPoint getWorldPoint() — primary target location
 *   - List<WorldPoint> getWorldLinePoints() — path line on world map
 *   - List<WorldPoint> getLinePoints() — path line on minimap
 *   - Collection<WorldPoint> worldPointsOrdered() — all relevant world points
 */
@Slf4j
public class QuestHelperBridge
{
    private static final Gson GSON = new Gson();

    private final PluginManager pluginManager;
    private Plugin questHelperPlugin;
    private boolean searchedForPlugin = false;
    private boolean available = false;

    public QuestHelperBridge(PluginManager pluginManager)
    {
        this.pluginManager = pluginManager;
    }

    /**
     * Try to find the Quest Helper plugin instance.
     */
    private void findPlugin()
    {
        if (searchedForPlugin)
        {
            return;
        }
        searchedForPlugin = true;

        try
        {
            for (Plugin plugin : pluginManager.getPlugins())
            {
                if (plugin.getClass().getSimpleName().equals("QuestHelperPlugin"))
                {
                    questHelperPlugin = plugin;
                    available = true;
                    log.info("RuneRadar: Found Quest Helper plugin");
                    return;
                }
            }
            log.info("RuneRadar: Quest Helper plugin not found");
        }
        catch (Exception e)
        {
            log.debug("RuneRadar: Error searching for Quest Helper", e);
        }
    }

    /**
     * Get the current quest step waypoints as a JSON string.
     * Returns null if Quest Helper is not active or no quest is selected.
     */
    public String getQuestWaypointsJson()
    {
        findPlugin();
        if (!available || questHelperPlugin == null)
        {
            return null;
        }

        try
        {
            // Get selectedQuest field
            Object selectedQuest = getFieldValue(questHelperPlugin, "selectedQuest");
            if (selectedQuest == null)
            {
                return null;
            }

            // Get quest name
            String questName = null;
            try
            {
                Method getQuestMethod = selectedQuest.getClass().getMethod("getQuest");
                Object quest = getQuestMethod.invoke(selectedQuest);
                if (quest != null)
                {
                    Method getNameMethod = quest.getClass().getMethod("getName");
                    questName = (String) getNameMethod.invoke(quest);
                }
            }
            catch (Exception e)
            {
                // Try alternative: the class name often contains the quest name
                questName = selectedQuest.getClass().getSimpleName()
                    .replace("Helper", "")
                    .replaceAll("([A-Z])", " $1")
                    .trim();
            }

            // Get current step
            Object currentStep = null;
            try
            {
                Method getCurrentStep = selectedQuest.getClass().getMethod("getCurrentStep");
                currentStep = getCurrentStep.invoke(selectedQuest);
            }
            catch (NoSuchMethodException e)
            {
                // Try alternative method names
                try
                {
                    Method getStep = selectedQuest.getClass().getMethod("getActiveStep");
                    currentStep = getStep.invoke(selectedQuest);
                }
                catch (Exception e2)
                {
                    return null;
                }
            }

            if (currentStep == null)
            {
                return null;
            }

            JsonObject result = new JsonObject();
            result.addProperty("type", "questHelper");
            result.addProperty("quest", questName != null ? questName : "Unknown Quest");

            // Get step text/description
            try
            {
                Method getText = currentStep.getClass().getMethod("getText");
                Object textObj = getText.invoke(currentStep);
                if (textObj instanceof List)
                {
                    List<?> textList = (List<?>) textObj;
                    if (!textList.isEmpty())
                    {
                        result.addProperty("stepText", textList.get(0).toString());
                    }
                }
                else if (textObj instanceof String)
                {
                    result.addProperty("stepText", (String) textObj);
                }
            }
            catch (Exception e)
            {
                // Step text not available
            }

            // Get target world point
            JsonArray waypoints = new JsonArray();
            try
            {
                Method getWorldPoint = currentStep.getClass().getMethod("getWorldPoint");
                WorldPoint wp = (WorldPoint) getWorldPoint.invoke(currentStep);
                if (wp != null)
                {
                    JsonObject point = new JsonObject();
                    point.addProperty("x", wp.getX());
                    point.addProperty("y", wp.getY());
                    point.addProperty("plane", wp.getPlane());
                    point.addProperty("type", "target");
                    waypoints.add(point);
                }
            }
            catch (Exception e)
            {
                // No single world point
            }

            // Get world line points (path to follow)
            JsonArray pathPoints = new JsonArray();
            try
            {
                Method getLinePoints = findMethod(currentStep.getClass(),
                    "getWorldLinePoints", "getLinePoints", "worldPointsOrdered");
                if (getLinePoints != null)
                {
                    Object linePointsObj = getLinePoints.invoke(currentStep);
                    if (linePointsObj instanceof Collection)
                    {
                        for (Object obj : (Collection<?>) linePointsObj)
                        {
                            if (obj instanceof WorldPoint)
                            {
                                WorldPoint wp = (WorldPoint) obj;
                                JsonObject point = new JsonObject();
                                point.addProperty("x", wp.getX());
                                point.addProperty("y", wp.getY());
                                pathPoints.add(point);
                            }
                        }
                    }
                }
            }
            catch (Exception e)
            {
                // Path points not available
            }

            result.add("waypoints", waypoints);
            result.add("path", pathPoints);

            return GSON.toJson(result);
        }
        catch (Exception e)
        {
            log.debug("RuneRadar: Error reading Quest Helper data", e);
            return null;
        }
    }

    private Object getFieldValue(Object obj, String fieldName)
    {
        try
        {
            Field field = obj.getClass().getDeclaredField(fieldName);
            field.setAccessible(true);
            return field.get(obj);
        }
        catch (Exception e)
        {
            // Try superclass
            try
            {
                Class<?> superClass = obj.getClass().getSuperclass();
                while (superClass != null)
                {
                    try
                    {
                        Field field = superClass.getDeclaredField(fieldName);
                        field.setAccessible(true);
                        return field.get(obj);
                    }
                    catch (NoSuchFieldException nsfe)
                    {
                        superClass = superClass.getSuperclass();
                    }
                }
            }
            catch (Exception e2)
            {
                // ignore
            }
            return null;
        }
    }

    private Method findMethod(Class<?> clazz, String... names)
    {
        for (String name : names)
        {
            try
            {
                return clazz.getMethod(name);
            }
            catch (NoSuchMethodException e)
            {
                // try next
            }
        }
        return null;
    }
}
