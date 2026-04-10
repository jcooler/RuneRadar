package com.runeradar;

import com.google.gson.Gson;

public class PlayerData
{
    private static final Gson GSON = new Gson();

    public final String type = "position";
    public final String name;
    public final int x;
    public final int y;
    public final int plane;
    public final int regionId;
    public final int world;
    public final int hitpoints;
    public final int prayer;
    public final int runEnergy;
    public final boolean instanced;
    public final long timestamp;

    public PlayerData(String name, int x, int y, int plane, int regionId,
                      int world, int hitpoints, int prayer, int runEnergy,
                      boolean instanced)
    {
        this.name = name;
        this.x = x;
        this.y = y;
        this.plane = plane;
        this.regionId = regionId;
        this.world = world;
        this.hitpoints = hitpoints;
        this.prayer = prayer;
        this.runEnergy = runEnergy;
        this.instanced = instanced;
        this.timestamp = System.currentTimeMillis();
    }

    public String toJson()
    {
        return GSON.toJson(this);
    }
}
