package com.runeradar;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;

/** Small-size version of the rune stone and navigation arrow used by favicon.svg. */
final class RuneRadarIcon
{
    private RuneRadarIcon() { }

    static BufferedImage create(int size)
    {
        BufferedImage image = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        graphics.scale(size / 64.0, size / 64.0);
        fill(graphics, 0x536c82, 32,2, 59,17, 59,47, 32,62, 5,47, 5,17);
        fill(graphics, 0x192c40, 32,5, 56,19, 56,45, 32,59, 8,45, 8,19);
        fill(graphics, 0xfff1d4, 49,15, 35,51, 28,35, 12,29);
        fill(graphics, 0x4d9b9c, 43,22, 34,44, 31,33);
        graphics.dispose();
        return image;
    }

    private static void fill(Graphics2D graphics, int color, double... coordinates)
    {
        Path2D path = new Path2D.Double();
        path.moveTo(coordinates[0], coordinates[1]);
        for (int i = 2; i < coordinates.length; i += 2) path.lineTo(coordinates[i], coordinates[i + 1]);
        path.closePath();
        graphics.setColor(new Color(color));
        graphics.fill(path);
    }
}
