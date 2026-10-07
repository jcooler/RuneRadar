package com.runeradar;

import java.awt.BorderLayout;
import java.awt.GridLayout;
import java.awt.image.BufferedImage;
import javax.swing.*;
import net.runelite.client.ui.PluginPanel;

final class RuneRadarPanel extends PluginPanel
{
    private final JLabel status = new JLabel();
    private final JButton open = new JButton("Open RuneRadar");

    RuneRadarPanel(Runnable onOpen, Runnable onDisconnect)
    {
        setLayout(new BorderLayout(0, 12));
        add(new JLabel("<html><h2>RuneRadar</h2>Your location on your own map.<br><br>Open RuneRadar shares your location, account name, world, HP, prayer and run energy with the map in your browser on this computer.<br><br>These details stay on this computer. Disconnect map stops the connection.<br><br>Clue and quest assistance each have an optional setting, off by default. Quest step sharing still needs upstream support.<br><br>The link works once and expires after one minute. No location sharing with other players.</html>"), BorderLayout.NORTH);
        JPanel controls = new JPanel(new GridLayout(0, 1, 0, 8));
        open.addActionListener(event -> onOpen.run());
        open.setEnabled(false);
        JButton disconnect = new JButton("Disconnect map");
        disconnect.addActionListener(event -> onDisconnect.run());
        controls.add(open);
        controls.add(disconnect);
        controls.add(status);
        add(controls, BorderLayout.CENTER);
        setStatus("Starting the local connection...", false);
    }

    void setStatus(String message, boolean ready)
    {
        status.setText("<html><p style='width:190px'>" + message + "</p></html>");
        open.setEnabled(ready);
    }

    static BufferedImage icon()
    {
        return RuneRadarIcon.create(16);
    }
}
