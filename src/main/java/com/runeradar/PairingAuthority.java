package com.runeradar;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.function.LongSupplier;

/** One browser per plugin instance. Secrets are never persisted or logged. */
final class PairingAuthority
{
    private final SecureRandom random = new SecureRandom();
    private final LongSupplier clock;
    private String launch;
    private long launchExpiry;
    private String session;
    private long sessionExpiry;

    PairingAuthority(LongSupplier clock) { this.clock = clock; }

    synchronized String issue()
    {
        revoke();
        launch = secret();
        launchExpiry = clock.getAsLong() + 60_000;
        return launch;
    }

    synchronized String pair(String candidate)
    {
        if (clock.getAsLong() >= launchExpiry || !matches(launch, candidate)) return null;
        launch = null;
        session = secret();
        sessionExpiry = clock.getAsLong() + 12 * 60 * 60 * 1000L;
        return session;
    }

    synchronized boolean accepts(String candidate)
    {
        return clock.getAsLong() < sessionExpiry && matches(session, candidate);
    }

    synchronized void revoke() { launch = null; session = null; }

    private String secret()
    {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static boolean matches(String expected, String candidate)
    {
        return expected != null && candidate != null && candidate.length() == 43
            && MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII), candidate.getBytes(StandardCharsets.US_ASCII));
    }
}
