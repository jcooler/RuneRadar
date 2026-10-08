package com.runeradar;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

public class SerialExecutorTest
{
    @Test public void serverStartWaitsForPriorStopAndErrorsDoNotStrandLaterChanges()
    {
        ArrayDeque<Runnable> scheduled = new ArrayDeque<>();
        SerialExecutor lifecycle = new SerialExecutor(scheduled::add);
        List<String> order = new ArrayList<>();
        lifecycle.execute(() -> { order.add("stop old"); throw new IllegalStateException("simulated shutdown failure"); });
        lifecycle.execute(() -> order.add("start new"));
        lifecycle.execute(() -> order.add("stop new"));
        assertEquals(1, scheduled.size());
        scheduled.remove().run();
        assertEquals(List.of("stop old"), order);
        assertEquals(1, scheduled.size());
        scheduled.remove().run();
        scheduled.remove().run();
        assertEquals(List.of("stop old", "start new", "stop new"), order);
    }
}
