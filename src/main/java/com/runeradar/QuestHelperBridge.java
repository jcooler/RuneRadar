package com.runeradar;

import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import net.runelite.api.coords.WorldPoint;
import net.runelite.client.events.PluginMessage;

/** Proposed read-only API. Current Hub Quest Helper does not publish it yet. */
final class QuestHelperBridge
{
    private String requestId;
    private HelperData response;

    synchronized HelperData capture(boolean enabled, boolean viewer, Consumer<PluginMessage> publish)
    {
        clear();
        if (!enabled || !viewer) return null;
        requestId = UUID.randomUUID().toString();
        try
        {
            // RuneLite's event bus is synchronous. Never reuse a previous step on a missing reply.
            publish.accept(new PluginMessage("questhelper", "requestStepSnapshot",
                Map.of("version", 1, "requestId", requestId)));
            return response != null ? response : HelperData.status("unsupported",
                "Quest Helper step sharing is not available in the current Hub release. Integration is awaiting upstream support.");
        }
        catch (RuntimeException | LinkageError incompatible)
        {
            return HelperData.status("unsupported", "Quest Helper step sharing is unavailable in this version.");
        }
        finally { clear(); }
    }

    synchronized void receive(PluginMessage event)
    {
        if (requestId == null || !"questhelper".equals(event.getNamespace()) || !"stepSnapshot".equals(event.getName())) return;
        Map<String, Object> data = event.getData();
        if (data == null || !requestId.equals(data.get("requestId")) || !Integer.valueOf(1).equals(data.get("version"))) return;
        Object state = data.get("state");
        if ("disabled".equals(state)) response = HelperData.status("missing", "Enable step sharing in Quest Helper's settings.");
        else if ("idle".equals(state)) response = HelperData.status("idle", "Start a quest in Quest Helper to see the current step here.");
        else if ("unavailable".equals(state)) response = HelperData.status("unsupported", "This quest step is not available on the map.");
        else if ("active".equals(state) && data.get("title") instanceof String && data.get("text") instanceof String)
        {
            Object target = data.get("target");
            if (target != null && !(target instanceof WorldPoint)) return;
            response = HelperData.objective((String) data.get("title"), (String) data.get("text"),
                target == null ? null : new WorldPoint[]{(WorldPoint) target}, false);
        }
    }

    synchronized void clear() { requestId = null; response = null; }
}
