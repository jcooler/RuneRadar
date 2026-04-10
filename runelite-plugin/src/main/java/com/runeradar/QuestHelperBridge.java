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
            // Quest Helper stores active quest via questManager
            // Try direct field first, then go through questManager
            Object selectedQuest = getFieldValue(questHelperPlugin, "selectedQuest");
            if (selectedQuest == null) selectedQuest = getFieldValue(questHelperPlugin, "selectedQuestHelper");

            // Try via questManager.getSelectedQuest() or similar
            if (selectedQuest == null)
            {
                Object questManager = getFieldValue(questHelperPlugin, "questManager");
                if (questManager != null)
                {
                    // Try methods on questManager
                    for (String methodName : new String[]{"getSelectedQuest", "getActiveQuest",
                        "getSelectedQuestHelper", "getActiveHelper", "getRunningHelper"})
                    {
                        try
                        {
                            java.lang.reflect.Method m = questManager.getClass().getMethod(methodName);
                            selectedQuest = m.invoke(questManager);
                            if (selectedQuest != null)
                            {
                                log.info("RuneRadar: Found quest via questManager.{}()", methodName);
                                break;
                            }
                        }
                        catch (NoSuchMethodException ignored) {}
                    }

                    // Try fields on questManager
                    if (selectedQuest == null)
                    {
                        for (java.lang.reflect.Field f : questManager.getClass().getDeclaredFields())
                        {
                            try
                            {
                                f.setAccessible(true);
                                Object val = f.get(questManager);
                                String typeName = f.getType().getSimpleName();
                                if (val != null && (typeName.contains("Quest") || typeName.contains("Helper"))
                                    && !typeName.contains("Manager") && !typeName.contains("Config")
                                    && !typeName.contains("Panel") && !typeName.contains("Menu"))
                                {
                                    log.info("RuneRadar QuestMgrDebug: field '{}' type={} class={}",
                                        f.getName(), typeName, val.getClass().getSimpleName());
                                    selectedQuest = val;
                                }
                            }
                            catch (Exception ignored) {}
                        }
                    }
                }
            }

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

            // Get current step — try many method names
            Object currentStep = null;
            for (String mName : new String[]{"getCurrentStep", "getActiveStep", "getSidebarStep",
                "getStep", "getCurrentDisplayStep"})
            {
                try
                {
                    Method m = selectedQuest.getClass().getMethod(mName);
                    currentStep = m.invoke(selectedQuest);
                    if (currentStep != null)
                    {
                        log.info("RuneRadar: Got step via {}(): {}", mName, currentStep.getClass().getSimpleName());
                        break;
                    }
                }
                catch (NoSuchMethodException ignored) {}
                catch (Exception e) { log.debug("RuneRadar: Error calling {}", mName, e); }
            }

            // If no step method worked, scan fields
            if (currentStep == null)
            {
                for (java.lang.reflect.Field f : selectedQuest.getClass().getDeclaredFields())
                {
                    try
                    {
                        f.setAccessible(true);
                        Object val = f.get(selectedQuest);
                        if (val != null)
                        {
                            String tName = val.getClass().getSimpleName();
                            if (tName.contains("Step") || tName.contains("WorldPoint"))
                            {
                                log.info("RuneRadar QuestStepScan: field '{}' type={}", f.getName(), tName);
                                if (tName.contains("Step")) currentStep = val;
                            }
                        }
                    }
                    catch (Exception ignored) {}
                }
            }

            if (currentStep == null)
            {
                log.debug("RuneRadar: No current step found for quest");
                return null;
            }

            // Unwrap ConditionalStep / wrapper steps to get the actual active step
            for (int depth = 0; depth < 5; depth++)
            {
                String stepType = currentStep.getClass().getSimpleName();
                if (stepType.contains("Conditional") || stepType.contains("Wrapper"))
                {
                    Object inner = null;
                    // Try getActiveStep()
                    for (String m : new String[]{"getActiveStep", "getStep", "getCurrentStep"})
                    {
                        try
                        {
                            inner = currentStep.getClass().getMethod(m).invoke(currentStep);
                            if (inner != null) break;
                        }
                        catch (Exception ignored) {}
                    }
                    // Try field 'activeStep' or 'step'
                    if (inner == null) inner = getFieldValue(currentStep, "activeStep");
                    if (inner == null) inner = getFieldValue(currentStep, "step");

                    if (inner != null && inner != currentStep)
                    {
                        log.debug("RuneRadar: Unwrapped {} -> {}", stepType, inner.getClass().getSimpleName());
                        currentStep = inner;
                    }
                    else break;
                }
                else break;
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

            // Get target world point — try multiple approaches
            JsonArray waypoints = new JsonArray();
            WorldPoint foundWp = null;

            // Try direct method
            for (String methodName : new String[]{"getWorldPoint", "getWorldLocation",
                "getLocation", "getWorldMapPoint", "getDestination"})
            {
                try
                {
                    Method m = currentStep.getClass().getMethod(methodName);
                    Object result2 = m.invoke(currentStep);
                    if (result2 instanceof WorldPoint)
                    {
                        foundWp = (WorldPoint) result2;
                        break;
                    }
                }
                catch (Exception ignored) {}
            }

            // Try DefinedPoint — Quest Helper's custom wrapper
            try
            {
                Object definedPoint = getFieldValue(currentStep, "definedPoint");
                if (definedPoint != null)
                {
                    // DefinedPoint has getX(), getY(), getPlane() or wraps a WorldPoint
                    try
                    {
                        Method gx = definedPoint.getClass().getMethod("getX");
                        Method gy = definedPoint.getClass().getMethod("getY");
                        Method gp = definedPoint.getClass().getMethod("getPlane");
                        int x = (int) gx.invoke(definedPoint);
                        int y = (int) gy.invoke(definedPoint);
                        int p = (int) gp.invoke(definedPoint);
                        foundWp = new WorldPoint(x, y, p);
                        log.info("RuneRadar: Found quest WP via DefinedPoint: {}", foundWp);
                    }
                    catch (Exception e)
                    {
                        // Try getWorldPoint() on DefinedPoint
                        try
                        {
                            Method gwp = definedPoint.getClass().getMethod("getWorldPoint");
                            foundWp = (WorldPoint) gwp.invoke(definedPoint);
                            log.info("RuneRadar: Found quest WP via DefinedPoint.getWorldPoint(): {}", foundWp);
                        }
                        catch (Exception ignored) {}
                    }
                }
            }
            catch (Exception ignored) {}

            // Try mapPoint — WorldMapPoint has getWorldPoint()
            if (foundWp == null)
            {
                try
                {
                    Object mapPoint = getFieldValue(currentStep, "mapPoint");
                    if (mapPoint != null)
                    {
                        Method gwp = mapPoint.getClass().getMethod("getWorldPoint");
                        foundWp = (WorldPoint) gwp.invoke(mapPoint);
                        log.info("RuneRadar: Found quest WP via mapPoint: {}", foundWp);
                    }
                }
                catch (Exception ignored) {}
            }

            // Deep scan: first pass — look for single WorldPoint fields
            if (foundWp == null)
            {
                Class<?> stepClass = currentStep.getClass();
                while (stepClass != null && stepClass != Object.class && foundWp == null)
                {
                    for (java.lang.reflect.Field f : stepClass.getDeclaredFields())
                    {
                        try
                        {
                            if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
                            f.setAccessible(true);
                            Object val = f.get(currentStep);
                            if (val instanceof WorldPoint)
                            {
                                foundWp = (WorldPoint) val;
                                log.info("RuneRadar: Found quest WP in {}.{}: {}", stepClass.getSimpleName(), f.getName(), foundWp);
                                break;
                            }
                        }
                        catch (Exception ignored) {}
                    }
                    stepClass = stepClass.getSuperclass();
                }
            }

            // Deep scan: second pass — check Lists of WorldPoints
            if (foundWp == null)
            {
                Class<?> stepClass = currentStep.getClass();
                while (stepClass != null && stepClass != Object.class && foundWp == null)
                {
                    for (java.lang.reflect.Field f : stepClass.getDeclaredFields())
                    {
                        try
                        {
                            if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
                            f.setAccessible(true);
                            Object val = f.get(currentStep);
                            if (val instanceof Collection)
                            {
                                for (Object item : (Collection<?>) val)
                                {
                                    if (item instanceof WorldPoint)
                                    {
                                        foundWp = (WorldPoint) item;
                                        log.info("RuneRadar: Found quest WP in list {}.{}: {}", stepClass.getSimpleName(), f.getName(), foundWp);
                                        break;
                                    }
                                }
                                if (foundWp != null) break;
                            }
                        }
                        catch (Exception ignored) {}
                    }
                    stepClass = stepClass.getSuperclass();
                }
            }

            if (foundWp != null)
            {
                JsonObject point = new JsonObject();
                point.addProperty("x", foundWp.getX());
                point.addProperty("y", foundWp.getY());
                point.addProperty("plane", foundWp.getPlane());
                point.addProperty("type", "target");
                waypoints.add(point);
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
