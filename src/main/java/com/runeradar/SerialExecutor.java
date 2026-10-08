package com.runeradar;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

/** Orders asynchronous server stops/starts, even when RuneLite's executor has many workers. */
final class SerialExecutor implements Executor
{
    private final Executor delegate;
    private CompletableFuture<Void> tail = CompletableFuture.completedFuture(null);

    SerialExecutor(Executor delegate) { this.delegate = delegate; }

    @Override public synchronized void execute(Runnable task)
    {
        tail = tail.handle((ignored, error) -> null).thenRunAsync(task, delegate);
    }
}
