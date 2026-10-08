package com.runeradar;

/** Immutable capture for the authenticated map on this computer. No social data. */
final class PlayerData
{
    final String availability;
    final Position position;
    final Account account;
    final HelperData.Snapshot helpers;

    private PlayerData(String availability, Position position, Account account, HelperData.Snapshot helpers)
    {
        this.availability = availability;
        this.position = position;
        this.account = account;
        this.helpers = helpers;
    }

    static PlayerData position(int x, int y, int plane)
    {
        return position(x, y, plane, null);
    }

    static PlayerData position(int x, int y, int plane, Account account)
    {
        return position(x, y, plane, account, null);
    }

    static PlayerData position(int x, int y, int plane, Account account, HelperData.Snapshot helpers)
    {
        if (x < 0 || x > 65535 || y < 0 || y > 65535 || plane < 0 || plane > 3)
            return unavailable("unavailable");
        return new PlayerData("available", new Position(x, y, plane), account, helpers);
    }

    static PlayerData instanced(Account account, HelperData.Snapshot helpers)
    {
        return new PlayerData("instanced", null, account, helpers);
    }

    static PlayerData unavailable(String reason) { return new PlayerData(reason, null, null, null); }

    PlayerData withoutHelper(String helper)
    {
        return new PlayerData(availability, position, account, helpers == null ? null : helpers.without(helper));
    }

    static final class Account
    {
        final String name;
        final int world;
        final int hitpoints;
        final int prayer;
        final int runEnergy;

        Account(String name, int world, int hitpoints, int prayer, int runEnergy)
        {
            this.name = name;
            this.world = world;
            this.hitpoints = hitpoints;
            this.prayer = prayer;
            this.runEnergy = runEnergy;
        }
    }

    static final class Position
    {
        final int x;
        final int y;
        final int plane;
        Position(int x, int y, int plane) { this.x = x; this.y = y; this.plane = plane; }
    }
}
