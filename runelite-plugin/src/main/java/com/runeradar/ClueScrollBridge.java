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

/**
 * Bridge to RuneLite's built-in ClueScrollPlugin.
 *
 * ClueScrollPlugin internals:
 * - Field: ClueScroll clue (the current active clue)
 * - ClueScroll has: getWorldMapPoint() returning WorldPoint
 * - Various clue types: AnagramClue, CipherClue, CoordinateClue, CrypticClue,
 *   EmoteClue, FairyRingClue, HotColdClue, MapClue, MusicClue, SkillChallengeClue
 * - Most have a location field or getLocation() method
 */
@Slf4j
public class ClueScrollBridge
{
    private static final Gson GSON = new Gson();

    private final PluginManager pluginManager;
    private Plugin cluePlugin;
    private boolean searched = false;
    private boolean available = false;

    public ClueScrollBridge(PluginManager pluginManager)
    {
        this.pluginManager = pluginManager;
    }

    private void findPlugin()
    {
        if (searched) return;
        searched = true;

        try
        {
            for (Plugin plugin : pluginManager.getPlugins())
            {
                if (plugin.getClass().getSimpleName().equals("ClueScrollPlugin"))
                {
                    cluePlugin = plugin;
                    available = true;
                    log.info("RuneRadar: Found ClueScrollPlugin");
                    return;
                }
            }
            log.info("RuneRadar: ClueScrollPlugin not found");
        }
        catch (Exception e)
        {
            log.debug("RuneRadar: Error finding ClueScrollPlugin", e);
        }
    }

    /**
     * Get the current clue scroll location as JSON, or null if no clue active.
     */
    public String getClueDataJson()
    {
        findPlugin();
        if (!available || cluePlugin == null) return null;

        try
        {
            // Get the 'clue' field from ClueScrollPlugin — must be an instance field, not static
            Object clue = getField(cluePlugin, "clue");
            if (clue == null) return null;
            // Verify it's actually a clue object, not a String
            if (clue instanceof String) return null;
            log.debug("RuneRadar: Got clue: {}", clue.getClass().getSimpleName());

            // Try to get the world map point
            WorldPoint location = null;

            // Method 1: getWorldMapPoint()
            try
            {
                Method m = clue.getClass().getMethod("getWorldMapPoint");
                location = (WorldPoint) m.invoke(clue);
            }
            catch (Exception e) { /* try next */ }

            // Method 2: getLocation()
            if (location == null)
            {
                try
                {
                    Method m = clue.getClass().getMethod("getLocation");
                    Object loc = m.invoke(clue);
                    if (loc instanceof WorldPoint)
                    {
                        location = (WorldPoint) loc;
                    }
                }
                catch (Exception e) { /* try next */ }
            }

            // Method 3: Try field named 'location' or 'worldPoint'
            if (location == null)
            {
                Object loc = getField(clue, "location");
                if (loc instanceof WorldPoint) location = (WorldPoint) loc;
            }
            if (location == null)
            {
                Object loc = getField(clue, "worldPoint");
                if (loc instanceof WorldPoint) location = (WorldPoint) loc;
            }

            // Method 4: Scan ALL fields of the clue AND nested objects for WorldPoint
            if (location == null)
            {
                Class<?> clazz = clue.getClass();
                while (clazz != null && location == null)
                {
                    for (Field f : clazz.getDeclaredFields())
                    {
                        try
                        {
                            f.setAccessible(true);
                            Object val = f.get(clue);
                            if (val instanceof WorldPoint)
                            {
                                location = (WorldPoint) val;
                                log.debug("RuneRadar: Found location in field '{}'", f.getName());
                                break;
                            }
                            // Check if the field is an enum/object that HAS a WorldPoint
                            // (e.g. STASHUnit, which EmoteClue uses)
                            if (val != null && !f.getType().isPrimitive()
                                && !f.getType().getName().startsWith("java."))
                            {
                                // Try getWorldPoint() on the nested object
                                try
                                {
                                    Method gwp = val.getClass().getMethod("getWorldPoint");
                                    Object wp = gwp.invoke(val);
                                    if (wp instanceof WorldPoint)
                                    {
                                        location = (WorldPoint) wp;
                                        log.debug("RuneRadar: Found location via {}.getWorldPoint()", f.getName());
                                        break;
                                    }
                                }
                                catch (NoSuchMethodException ignored) {}

                                // Try getLocation() on nested object
                                try
                                {
                                    Method gl = val.getClass().getMethod("getLocation");
                                    Object wp = gl.invoke(val);
                                    if (wp instanceof WorldPoint)
                                    {
                                        location = (WorldPoint) wp;
                                        log.debug("RuneRadar: Found location via {}.getLocation()", f.getName());
                                        break;
                                    }
                                }
                                catch (NoSuchMethodException ignored) {}

                                // Scan the nested object's fields for WorldPoint
                                for (Field nf : val.getClass().getDeclaredFields())
                                {
                                    try
                                    {
                                        nf.setAccessible(true);
                                        Object nval = nf.get(val);
                                        if (nval instanceof WorldPoint)
                                        {
                                            location = (WorldPoint) nval;
                                            log.debug("RuneRadar: Found location in {}.{}", f.getName(), nf.getName());
                                            break;
                                        }
                                    }
                                    catch (Exception ignored2) {}
                                }
                                if (location != null) break;
                            }
                        }
                        catch (Exception ignored) {}
                    }
                    clazz = clazz.getSuperclass();
                }
            }

            if (location == null) return null;

            // Get clue text and location name directly from fields
            String text = null;
            Object textObj = getField(clue, "text");
            if (textObj instanceof String) text = (String) textObj;

            String locationName = null;
            Object locNameObj = getField(clue, "locationName");
            if (locNameObj instanceof String) locationName = (String) locNameObj;

            // Get clue type name
            String clueType = clue.getClass().getSimpleName()
                .replace("Clue", "")
                .replaceAll("([A-Z])", " $1")
                .trim();

            JsonObject result = new JsonObject();
            result.addProperty("type", "clueScroll");
            result.addProperty("clueType", clueType);
            if (text != null) result.addProperty("text", text);
            if (locationName != null) result.addProperty("locationName", locationName);

            JsonObject wp = new JsonObject();
            wp.addProperty("x", location.getX());
            wp.addProperty("y", location.getY());
            wp.addProperty("plane", location.getPlane());
            result.add("location", wp);

            return GSON.toJson(result);
        }
        catch (Exception e)
        {
            log.debug("RuneRadar: Error reading clue data", e);
            return null;
        }
    }

    private Object getField(Object obj, String name)
    {
        Class<?> clazz = obj.getClass();
        while (clazz != null)
        {
            try
            {
                Field f = clazz.getDeclaredField(name);
                // Skip static fields — we want instance fields only
                if (java.lang.reflect.Modifier.isStatic(f.getModifiers()))
                {
                    clazz = clazz.getSuperclass();
                    continue;
                }
                f.setAccessible(true);
                return f.get(obj);
            }
            catch (NoSuchFieldException e)
            {
                clazz = clazz.getSuperclass();
            }
            catch (Exception e)
            {
                return null;
            }
        }
        return null;
    }
}
