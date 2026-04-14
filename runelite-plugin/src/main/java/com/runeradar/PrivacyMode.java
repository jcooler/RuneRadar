package com.runeradar;

public enum PrivacyMode
{
    EXACT("Exact location"),
    REGION("Region only"),
    WORLD_ONLY("World only"),
    HIDDEN("Hidden");

    private final String label;

    PrivacyMode(String label)
    {
        this.label = label;
    }

    @Override
    public String toString()
    {
        return label;
    }
}
