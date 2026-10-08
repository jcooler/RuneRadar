package com.runeradar;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.Test;
import static org.junit.Assert.*;

public class PairingAuthorityTest
{
    @Test public void launchIsSingleUseAndResumeIsRevocable()
    {
        AtomicLong time = new AtomicLong(100);
        PairingAuthority auth = new PairingAuthority(time::get);
        String launch = auth.issue();
        assertEquals(43, launch.length());
        assertNull(auth.pair("wrong"));
        String session = auth.pair(launch);
        assertNotNull(session);
        assertNotEquals(launch, session);
        assertNull(auth.pair(launch));
        assertTrue(auth.accepts(session));
        auth.revoke();
        assertFalse(auth.accepts(session));
    }

    @Test public void expiryAndNewLaunchInvalidateOldCredentials()
    {
        AtomicLong time = new AtomicLong();
        PairingAuthority auth = new PairingAuthority(time::get);
        String expired = auth.issue();
        time.set(60_000);
        assertNull(auth.pair(expired));
        String session = auth.pair(auth.issue());
        time.addAndGet(12 * 60 * 60 * 1000L);
        assertFalse(auth.accepts(session));
        String oldLaunch = auth.issue();
        String newLaunch = auth.issue();
        assertNull(auth.pair(oldLaunch));
        String fresh = auth.pair(newLaunch);
        assertTrue(auth.accepts(fresh));
        auth.issue();
        assertFalse(auth.accepts(fresh));
    }
}
