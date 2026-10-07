package com.runeradar;

import com.google.gson.Gson;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Scanner;
import java.util.Set;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** Synthetic browser QA only. Never loaded into the plugin or shipped in its jar. */
public final class PersonalMapFixture
{
    public static void main(String[] args) throws Exception
    {
        RuneRadarServer server = new RuneRadarServer(37781, new Gson(), Set.of("http://127.0.0.1:8000", "https://runeradar.app"));
        AtomicReference<PlayerData> data = new AtomicReference<>(PlayerData.position(3222, 3218, 0));
        ScheduledExecutorService ticks = Executors.newSingleThreadScheduledExecutor();
        server.start();
        while (!server.isReady()) Thread.sleep(20);
        ticks.scheduleAtFixedRate(() -> server.update(data.get()), 0, 600, TimeUnit.MILLISECONDS);
        Path launchFile = Path.of(args[0]);
        Files.createDirectories(launchFile.toAbsolutePath().getParent());
        System.out.println("Synthetic map fixture ready");
        try (Scanner input = new Scanner(System.in))
        {
            while (input.hasNextLine())
            {
                String[] command = input.nextLine().trim().split(" ");
                switch (command[0])
                {
                    case "pair":
                        Files.writeString(launchFile, "#pair=" + server.issuePairingToken() + "&port=37781");
                        System.out.println("Synthetic pairing link renewed"); break;
                    case "position": data.set(PlayerData.position(Integer.parseInt(command[1]), Integer.parseInt(command[2]), Integer.parseInt(command[3]))); break;
                    case "logout": data.set(PlayerData.unavailable("logged_out")); break;
                    case "instance": data.set(PlayerData.unavailable("instanced")); break;
                    case "drop": server.getConnections().forEach(socket -> socket.close(1001, "Test network interruption")); break;
                    case "revoke": server.revoke(); break;
                    case "stop": return;
                    default: System.out.println("Unknown fixture command");
                }
            }
        }
        finally { ticks.shutdownNow(); server.shutdown(); Files.deleteIfExists(launchFile); }
    }
}
