/**
 * RuneRadar — Map Icons & Labels Layer
 *
 * Loads POI icons from the OSRS Wiki GeoJSON data and renders them on the map.
 * Also adds town/city labels as a separate toggleable layer.
 */

// Use local game cache sprites — exact same icons as the in-game OSRS world map
// Falls back to wiki MainIcons.json if local file is unavailable
const ICON_LIST_URL = "local-icons.json";
const ICON_LIST_FALLBACK = "https://maps.runescape.wiki/osrs/data/iconLists/MainIcons.json";
const ICON_GEOJSON_URL = "cache-icons.json";

// ── Icon Groups (for layer toggling) ────────────────────
// Maps icon keys to human-readable categories
// Each category: { icons: [...iconKeys], rep: "representativeIconKey" }
const ICON_CATEGORIES = {
  "Transportation":        { icons: ["transportation", "quetzal_transport"], rep: "transportation" },
  "Sailing":               { icons: ["sailing_destination", "docking_point", "sailing_hub",
    "sailing_station", "salvaging_station"], rep: "sailing_destination" },
  "Banks":                 { icons: ["bank", "grand_exchange"], rep: "bank" },
  "Quests":                { icons: ["quest_start"], rep: "quest_start" },
  "Dungeons":              { icons: ["dungeon", "dungeon_link"], rep: "dungeon" },
  "Mining & Smithing":     { icons: ["mining_site", "furnace", "anvil", "sandpit", "mining_shop"], rep: "mining_site" },
  "Fishing":               { icons: ["fishing_spot", "fishing_shop"], rep: "fishing_spot" },
  "Cooking":               { icons: ["cooking_range", "dairy_churn", "dairy_cow", "windmill", "brewery",
    "cookery_shop"], rep: "cooking_range" },
  "Woodcutting & Farming": { icons: ["rare_trees", "farming_patch", "woodcutting_stump", "sawmill",
    "farming_shop"], rep: "rare_trees" },
  "Crafting":              { icons: ["spinning_wheel", "potters_wheel", "tannery", "loom",
    "crafting_shop", "stonemason"], rep: "spinning_wheel" },
  "Water Sources":         { icons: ["water_source", "stagnant_water_source"], rep: "water_source" },
  "Hunter":                { icons: ["hunter_training", "hunter_shop"], rep: "hunter_training" },
  "Combat & Slayer":       { icons: ["slayer_master", "danger_tutor"], rep: "slayer_master" },
  "Altars":                { icons: ["altar", "runecraft_altar"], rep: "altar" },
  "Agility":               { icons: ["agility_short-cut", "agility_training"], rep: "agility_short-cut" },
  "Minigames & Raids":     { icons: ["minigame", "raids_lobby", "bounty_hunter_store"], rep: "minigame" },
  "Houses":                { icons: ["house_portal", "estate_agent", "garden_supplier"], rep: "house_portal" },
  "Shops — Weapons":       { icons: ["sword_shop", "archery_shop", "scimitar_shop", "mace_shop",
    "axe_shop", "staff_shop", "magic_shop"], rep: "sword_shop" },
  "Shops — Armour":        { icons: ["platebody_shop", "platelegs_shop", "plateskirt_shop",
    "helmet_shop", "shield_shop", "chainmail_shop"], rep: "shield_shop" },
  "Shops — Clothes":       { icons: ["clothes_shop", "silk_trader", "fur_trader", "dye_trader",
    "hairdresser", "makeover_mage"], rep: "clothes_shop" },
  "Shops — Food & Drink":  { icons: ["food_shop", "bar", "kebab_seller", "vegetable_store",
    "wine_trader", "tea_trader", "spice_shop"], rep: "food_shop" },
  "Shops — General":       { icons: ["general_store", "gem_shop", "jewellery_shop", "jewellery",
    "silver_shop", "amulet_shop", "candle_shop", "rope_trader", "newspaper_trader",
    "herbalist", "apothecary", "pet_insurance_shop", "taxidermist"], rep: "general_store" },
  "Stalls":                { icons: ["market_stall"], rep: "general_store" },
  "Tutors":                { icons: ["combat_tutor", "cooking_tutor", "crafting_tutor", "fishing_tutor",
    "mining_tutor", "prayer_tutor", "smithing_tutor", "woodcutting_tutor",
    "hunting_tutor", "security_tutor", "bank_tutor", "bond_tutor",
    "ironman_tutor", "deadman_tutor", "lumbridge_guide", "dummy",
    "task_master", "kourend_task", "junk_checker"], rep: "combat_tutor" },
  "Pricing Experts":       { icons: ["pricing_expert_herbs", "pricing_expert_logs",
    "pricing_expert_ores", "pricing_expert_runes",
    "pricing_expert_weapons_and_armours"], rep: "pricing_expert_herbs" },
  "Other":                 { icons: ["poll_booth", "map_link", "holiday_event", "holiday_item_trader",
    "stone_gate"], rep: "poll_booth" },
};

// Reverse lookup: icon key → category name
const iconToCategory = {};
for (const [cat, def] of Object.entries(ICON_CATEGORIES)) {
  for (const icon of def.icons) {
    iconToCategory[icon] = cat;
  }
}

// ── Town Labels ─────────────────────────────────────────
// Major OSRS towns/cities with game coordinates
// Kingdom/region labels (large, italic, gold)
const KINGDOM_LABELS = [
  { name: "Kingdom of Misthalin", x: 3170, y: 3350, size: 30 },
  { name: "Kingdom of Asgarnia", x: 2960, y: 3430, size: 30 },
  { name: "Kingdom of Kandarin", x: 2650, y: 3420, size: 30 },
  { name: "Wilderness", x: 3100, y: 3750, size: 34 },
  { name: "Morytania", x: 3550, y: 3400, size: 28 },
  { name: "Tirannwn", x: 2250, y: 3200, size: 26 },
  { name: "Karamja", x: 2850, y: 3080, size: 28 },
  { name: "Kharidian Desert", x: 3350, y: 2950, size: 26 },
  { name: "Fremennik Province", x: 2650, y: 3700, size: 24 },
  { name: "Great Kourend", x: 1640, y: 3680, size: 30 },
  { name: "Kebos Lowlands", x: 1280, y: 3550, size: 24 },
  { name: "Varlamore", x: 1600, y: 3050, size: 28 },
  { name: "Feldip Hills", x: 2530, y: 2960, size: 22 },
  { name: "Troll Country", x: 2870, y: 3720, size: 22 },
];

const TOWN_LABELS = [
  // Major cities
  { name: "Varrock", x: 3213, y: 3428, size: 22 },
  { name: "Falador", x: 2965, y: 3380, size: 22 },
  { name: "Lumbridge", x: 3222, y: 3218, size: 22 },
  { name: "Ardougne", x: 2662, y: 3305, size: 22 },
  { name: "Camelot", x: 2757, y: 3478, size: 20 },
  { name: "Al Kharid", x: 3293, y: 3174, size: 20 },
  { name: "Prifddinas", x: 3265, y: 6075, size: 22 },
  { name: "Fortis", x: 1730, y: 3100, size: 20 },

  // Medium towns
  { name: "Edgeville", x: 3093, y: 3500, size: 18 },
  { name: "Canifis", x: 3496, y: 3488, size: 18 },
  { name: "Yanille", x: 2544, y: 3089, size: 18 },
  { name: "Grand Exchange", x: 3165, y: 3487, size: 17 },
  { name: "Hosidius", x: 1762, y: 3598, size: 18 },
  { name: "Shayzien", x: 1485, y: 3590, size: 18 },
  { name: "Lovakengj", x: 1504, y: 3840, size: 18 },
  { name: "Arceuus", x: 1700, y: 3800, size: 18 },
  { name: "Piscarilius", x: 1803, y: 3752, size: 18 },
  { name: "Draynor Village", x: 3093, y: 3244, size: 17 },
  { name: "Catherby", x: 2813, y: 3445, size: 17 },
  { name: "Seers' Village", x: 2724, y: 3484, size: 17 },
  { name: "Taverley", x: 2895, y: 3455, size: 17 },
  { name: "Burthorpe", x: 2899, y: 3544, size: 17 },
  { name: "Port Sarim", x: 3023, y: 3208, size: 17 },

  // Smaller locations
  { name: "Rimmington", x: 2957, y: 3214, size: 15 },
  { name: "Barbarian Village", x: 3082, y: 3420, size: 15 },
  { name: "Wizards' Tower", x: 3109, y: 3162, size: 15 },
  { name: "Brimhaven", x: 2775, y: 3178, size: 16 },
  { name: "Shilo Village", x: 2848, y: 2982, size: 16 },
  { name: "Tree Gnome Stronghold", x: 2461, y: 3444, size: 16 },
  { name: "Fossil Island", x: 3741, y: 3835, size: 18 },
  { name: "Neitiznot", x: 2321, y: 3802, size: 16 },
  { name: "Jatizso", x: 2407, y: 3802, size: 16 },
  { name: "Zanaris", x: 2411, y: 4444, size: 18 },
  { name: "Mort'ton", x: 3489, y: 3287, size: 15 },
  { name: "Burgh de Rott", x: 3491, y: 3232, size: 15 },
  { name: "Lletya", x: 2341, y: 3171, size: 16 },
  { name: "Sophanem", x: 3305, y: 2780, size: 16 },
  { name: "Nardah", x: 3422, y: 2917, size: 16 },
  { name: "Pollnivneach", x: 3359, y: 2981, size: 16 },
  { name: "Chambers of Xeric", x: 1255, y: 3558, size: 16 },
  { name: "Theatre of Blood", x: 3680, y: 3219, size: 16 },
  { name: "Tombs of Amascut", x: 3345, y: 2725, size: 16 },
  { name: "Mount Quidamortem", x: 1265, y: 3480, size: 14 },
  { name: "Ferox Enclave", x: 3151, y: 3635, size: 15 },
  { name: "Piscatoris", x: 2338, y: 3650, size: 15 },
  { name: "Ape Atoll", x: 2764, y: 2785, size: 16 },
  { name: "Lunar Isle", x: 2111, y: 3915, size: 16 },
  { name: "Miscellania", x: 2535, y: 3860, size: 16 },
  { name: "Etceteria", x: 2614, y: 3895, size: 15 },
  { name: "Tutorial Island", x: 3094, y: 3107, size: 18 },
  { name: "Keldagrim", x: 2844, y: 10209, size: 18 },
  { name: "Dorgesh-Kaan", x: 2720, y: 5348, size: 18 },
  { name: "Mor Ul Rek", x: 2528, y: 5177, size: 18 },
  { name: "Cam Torum", x: 1449, y: 3120, size: 18 },
  { name: "Hunter Guild", x: 1556, y: 3040, size: 15 },
  { name: "Aldarin", x: 1390, y: 2930, size: 16 },
  { name: "Sunset Coast", x: 1510, y: 2975, size: 15 },
  { name: "Quetzacalli", x: 1580, y: 3130, size: 15 },
  { name: "Ralos' Rise", x: 1475, y: 3000, size: 15 },
  { name: "Toll Gate", x: 3360, y: 3140, size: 15 },
  // Ver Sinhaza removed — same location as Theatre of Blood (1 tile apart)
  { name: "Slepe", x: 3724, y: 3370, size: 15 },
  { name: "Darkmeyer", x: 3625, y: 3370, size: 16 },
  { name: "Port Phasmatys", x: 3681, y: 3490, size: 15 },
  { name: "Meiyerditch", x: 3630, y: 3250, size: 15 },

  // Islands
  { name: "Crandor", x: 2835, y: 3260, size: 15 },
  { name: "Entrana", x: 2834, y: 3336, size: 15 },
  { name: "Waterbirth Island", x: 2520, y: 3754, size: 14 },
  { name: "Corsair Cove", x: 2484, y: 2862, size: 14 },
  { name: "Isle of Souls", x: 2210, y: 2855, size: 15 },
  { name: "Harmony Island", x: 3795, y: 2865, size: 14 },
  { name: "Mos Le'Harmless", x: 3748, y: 2978, size: 15 },
  { name: "Braindeath Island", x: 2160, y: 5070, size: 14 },
  { name: "Pest Control", x: 2658, y: 2660, size: 14 },
  { name: "Ungael", x: 2277, y: 4036, size: 14 },

  // Varlamore towns/areas
  { name: "Mistrock", x: 1374, y: 2852, size: 15 },
  { name: "Tal Teklan", x: 1226, y: 3090, size: 15 },
  { name: "Gloomthorn Trail", x: 1320, y: 3065, size: 13 },
  { name: "Auburnvale", x: 1395, y: 3330, size: 15 },
  { name: "Colosseum", x: 1798, y: 3110, size: 14 },
  { name: "Avium Savannah", x: 1650, y: 2975, size: 15 },
  { name: "Necropolis", x: 3315, y: 2775, size: 15 },

  // Desert / Kharid
  { name: "Ruins of Unkah", x: 3156, y: 2840, size: 14 },
  { name: "Uzer", x: 3490, y: 3060, size: 14 },
  { name: "Bedabin Camp", x: 3171, y: 3040, size: 14 },
  { name: "Bandit Camp", x: 3172, y: 2978, size: 14 },
  { name: "Menaphos", x: 3250, y: 2755, size: 16 },

  // Wilderness
  { name: "Mage Arena", x: 3095, y: 3958, size: 14 },
  { name: "Revenant Caves", x: 3130, y: 3832, size: 14 },
  { name: "Lava Dragon Isle", x: 3190, y: 3925, size: 13 },
  { name: "Rogues' Castle", x: 3280, y: 3930, size: 13 },
  { name: "Bandit Camp", x: 3032, y: 3702, size: 13 },
  { name: "Demonic Ruins", x: 3290, y: 3880, size: 13 },

  // Other
  { name: "Rellekka", x: 2645, y: 3680, size: 18 },
  { name: "Legends' Guild", x: 2729, y: 3348, size: 14 },
  { name: "Champions' Guild", x: 3190, y: 3365, size: 14 },
  { name: "Heroes' Guild", x: 2900, y: 3510, size: 14 },
  { name: "Rangers' Guild", x: 2660, y: 3440, size: 14 },
  { name: "Fishing Guild", x: 2610, y: 3395, size: 14 },
  { name: "Crafting Guild", x: 2932, y: 3290, size: 14 },
  { name: "Cooking Guild", x: 3142, y: 3443, size: 14 },
  { name: "Mining Guild", x: 3015, y: 3340, size: 14 },
  { name: "Woodcutting Guild", x: 1610, y: 3498, size: 14 },
  { name: "Farming Guild", x: 1248, y: 3720, size: 14 },
  { name: "Myths' Guild", x: 2458, y: 2845, size: 14 },
  { name: "Warriors' Guild", x: 2855, y: 3545, size: 14 },
  { name: "Musa Point", x: 2920, y: 3165, size: 14 },
  { name: "Witchaven", x: 2700, y: 3284, size: 14 },
  { name: "Eagles' Peak", x: 2335, y: 3575, size: 14 },
  { name: "Mort Myre Swamp", x: 3442, y: 3380, size: 14 },
  { name: "Castle Wars", x: 2440, y: 3090, size: 14 },
  { name: "Barbarian Outpost", x: 2530, y: 3575, size: 14 },
  { name: "Fight Caves", x: 2440, y: 5170, size: 14 },

  // Towns/villages missing
  { name: "West Ardougne", x: 2528, y: 3305, size: 16 },
  { name: "Port Khazard", x: 2656, y: 3168, size: 14 },
  { name: "Hemenster", x: 2635, y: 3440, size: 13 },
  { name: "Sinclair Mansion", x: 2740, y: 3540, size: 13 },
  { name: "Keep Le Faye", x: 2769, y: 3402, size: 13 },
  { name: "Tree Gnome Village", x: 2435, y: 3345, size: 14 },
  { name: "Observatory", x: 2440, y: 3160, size: 13 },

  { name: "Tai Bwo Wannai", x: 2790, y: 3065, size: 14 },
  { name: "White Wolf Mountain", x: 2845, y: 3505, size: 13 },
  { name: "Goblin Village", x: 2956, y: 3508, size: 13 },
  { name: "Ice Mountain", x: 3007, y: 3476, size: 13 },
  { name: "Digsite", x: 3360, y: 3420, size: 14 },
  { name: "Lighthouse", x: 2508, y: 3644, size: 13 },
  { name: "Trollheim", x: 2890, y: 3676, size: 14 },
  { name: "Weiss", x: 2865, y: 3940, size: 14 },
  { name: "God Wars Dungeon", x: 2917, y: 3750, size: 14 },
  // Void Knights' Outpost removed — same location as Pest Control (10 tiles apart)

  // Slayer / Boss areas
  { name: "Slayer Tower", x: 3430, y: 3535, size: 14 },
  { name: "Stronghold Slayer Cave", x: 2430, y: 3420, size: 12 },
  { name: "Chasm of Fire", x: 1432, y: 3672, size: 13 },
  { name: "Catacombs of Kourend", x: 1640, y: 3650, size: 13 },
  { name: "Barrows", x: 3565, y: 3285, size: 14 },
  { name: "Nightmare Zone", x: 2606, y: 3115, size: 13 },
  { name: "Gauntlet", x: 3230, y: 6110, size: 13 },
  { name: "Wintertodt Camp", x: 1625, y: 3940, size: 14 },
  { name: "Corporeal Beast", x: 3214, y: 3782, size: 13 },

  // Wilderness landmarks
  { name: "Chaos Temple", x: 3236, y: 3638, size: 13 },
  { name: "Dark Warriors' Fortress", x: 3014, y: 3595, size: 12 },
  { name: "Graveyard of Shadows", x: 3150, y: 3672, size: 12 },
  { name: "Fountain of Rune", x: 3375, y: 3893, size: 13 },
  { name: "Ruins of Camdozaal", x: 2998, y: 3494, size: 12 },

  // Kourend additions
  { name: "Kingstown", x: 1660, y: 3677, size: 14 },
  { name: "Land's End", x: 1510, y: 3420, size: 14 },
  { name: "Battlefront", x: 1368, y: 3716, size: 13 },
  { name: "Forthos Ruin", x: 1700, y: 3570, size: 13 },
  { name: "Xeric's Lookout", x: 1585, y: 3530, size: 13 },
  { name: "Molch", x: 1304, y: 3663, size: 13 },
  // Logava removed — NPC name (Logava Gricoller), not a location. Area covered by Kourend Woodland label.

  // Varlamore additions
  { name: "Neypotzli", x: 1440, y: 2960, size: 14 },
  { name: "Stonecutter Outpost", x: 1760, y: 2960, size: 13 },
  // Deepfin Point duplicate removed — real label is in Sailing Islands section
  { name: "Salvager Overlook", x: 1650, y: 3280, size: 13 },
  { name: "Outer Fortis", x: 1690, y: 3230, size: 14 },
  { name: "Locus Oasis", x: 1630, y: 2940, size: 13 },
  { name: "The Teomat", x: 1455, y: 2975, size: 13 },
  { name: "Proudspire", x: 1620, y: 3050, size: 13 },
  { name: "Colossal Wyrm Remains", x: 1640, y: 2921, size: 13 },
  { name: "Tempestus", x: 1780, y: 3050, size: 13 },

  // Islands / remote
  { name: "Lithkren", x: 3560, y: 3970, size: 14 },
  { name: "Zul-Andra", x: 2195, y: 3060, size: 13 },
  { name: "Tempoross Cove", x: 3040, y: 2865, size: 13 },
  { name: "Crash Island", x: 2920, y: 2725, size: 12 },
  { name: "Pirates' Cove", x: 2215, y: 3800, size: 13 },
  { name: "Mudskipper Point", x: 2985, y: 3120, size: 12 },

  // ── Sailing Islands (real OSRS names from wiki) ──

  // ── Sailing Islands (wiki-verified coordinates from {{Map}} templates) ──

  // Major port hubs
  { name: "The Pandemonium", x: 3040, y: 2980, size: 16 },
  { name: "Port Roberts", x: 1888, y: 3298, size: 14 },
  { name: "Deepfin Point", x: 1948, y: 2782, size: 16 },

  // The Great Conch (largest sailing island)
  { name: "The Great Conch", x: 3200, y: 2435, size: 16 },
  { name: "Summer Shore", x: 3155, y: 2415, size: 12 },

  // Sailing islands — Unquiet Ocean
  { name: "The Onyx Crest", x: 2975, y: 2273, size: 14 },
  { name: "Dognose Island", x: 3048, y: 2648, size: 13 },
  { name: "Remote Island", x: 2961, y: 2610, size: 13 },
  { name: "The Little Pearl", x: 3356, y: 2205, size: 12 },
  { name: "Rainbow's End", x: 2335, y: 2270, size: 12 },
  { name: "Charred Island", x: 2648, y: 2406, size: 13 },

  // Sailing islands — Shrouded Ocean
  { name: "Anglers' Retreat", x: 2478, y: 2715, size: 13 },
  { name: "Isle of Bones", x: 2533, y: 2533, size: 13 },
  { name: "Tear of the Soul", x: 2333, y: 2768, size: 13 },
  { name: "Wintumber Island", x: 2068, y: 2603, size: 12 },
  { name: "The Crown Jewel", x: 1761, y: 2664, size: 13 },
  { name: "Shimmering Atoll", x: 1569, y: 2786, size: 13 },
  { name: "Laguna Aurorae", x: 1195, y: 2772, size: 13 },
  { name: "Sunbleak Island", x: 2209, y: 2330, size: 12 },

  // Sailing islands — Western Ocean
  { name: "Chinchompa Island", x: 1884, y: 3434, size: 13 },
  { name: "Lledrith Island", x: 2091, y: 3179, size: 13 },
  { name: "Buccaneers' Haven", x: 2080, y: 3685, size: 13 },
  { name: "Drumstick Isle", x: 2146, y: 3545, size: 12 },

  // Sailing islands — Varlamore coast
  { name: "Vatrachos Island", x: 1887, y: 2984, size: 13 },
  { name: "Minotaurs' Rest", x: 1953, y: 3103, size: 12 },

  // Sailing islands — Northern Ocean
  { name: "Grimstone", x: 2913, y: 4072, size: 14 },
  { name: "Brittle Isle", x: 1947, y: 4069, size: 13 },

  // Motherlode Mine (underground but important)
  { name: "Motherlode Mine", x: 3055, y: 3470, size: 13 },

  // ── Asgarnia additions ──
  { name: "Black Knights' Fortress", x: 3016, y: 3514, size: 12 },
  { name: "Death Plateau", x: 2865, y: 3570, size: 13 },
  { name: "Dwarven Mine", x: 3015, y: 3450, size: 12 },
  { name: "Taverley Dungeon", x: 2884, y: 3397, size: 12 },
  { name: "Monastery", x: 3052, y: 3490, size: 12 },
  { name: "Draynor Manor", x: 3108, y: 3352, size: 13 },
  { name: "Mole Hole", x: 2985, y: 3388, size: 11 },

  // ── Misthalin additions ──
  { name: "Lumbridge Swamp", x: 3168, y: 3170, size: 13 },
  { name: "Paterdomus", x: 3405, y: 3506, size: 13 },
  // Stronghold of Security removed — overlaps Barbarian Village (1 tile apart, underground)
  { name: "Varrock Sewers", x: 3237, y: 3430, size: 11 },
  { name: "Exam Centre", x: 3360, y: 3340, size: 12 },

  // ── Kandarin additions ──
  { name: "Baxtorian Falls", x: 2510, y: 3510, size: 13 },
  { name: "Underground Pass", x: 2440, y: 3313, size: 12 },
  { name: "Otto's Grotto", x: 2501, y: 3488, size: 12 },
  // Ancient Cavern removed — overlaps Baxtorian Falls (2 tiles apart, underground)
  { name: "Wizards' Guild", x: 2593, y: 3085, size: 12 },
  { name: "McGrubor's Wood", x: 2650, y: 3490, size: 12 },
  { name: "Fight Arena", x: 2590, y: 3165, size: 12 },
  { name: "Coal Trucks", x: 2610, y: 3490, size: 11 },
  { name: "Gnome Glider", x: 2465, y: 3501, size: 11 },

  // ── Karamja additions ──
  { name: "Karamja Volcano", x: 2857, y: 3168, size: 13 },
  { name: "Kharazi Jungle", x: 2830, y: 2925, size: 14 },
  { name: "Hardwood Grove", x: 2820, y: 3075, size: 12 },
  { name: "Brimhaven Dungeon", x: 2743, y: 3154, size: 12 },
  // Nature Altar removed — covered by runecraft_altar POI icon

  // ── Desert additions ──
  { name: "Shantay Pass", x: 3304, y: 3117, size: 13 },
  { name: "Kalphite Lair", x: 3226, y: 3108, size: 12 },
  { name: "Desert Mining Camp", x: 3340, y: 2990, size: 12 },
  { name: "Agility Pyramid", x: 3355, y: 2830, size: 12 },
  { name: "Emir's Arena", x: 3313, y: 3238, size: 13 },
  { name: "Mage Training Arena", x: 3362, y: 3318, size: 12 },
  { name: "Smoke Dungeon", x: 3309, y: 2962, size: 11 },
  { name: "Pyramid Plunder", x: 3289, y: 2801, size: 12 },

  // ── Morytania additions ──
  { name: "Haunted Woods", x: 3600, y: 3490, size: 13 },
  { name: "Ectofuntus", x: 3660, y: 3520, size: 12 },
  { name: "Nature Grotto", x: 3440, y: 3340, size: 11 },

  // ── Tirannwn additions ──
  { name: "Arandar", x: 2370, y: 3317, size: 13 },
  { name: "Tyras Camp", x: 2187, y: 3145, size: 13 },
  { name: "Iorwerth Camp", x: 2193, y: 3257, size: 13 },
  { name: "Isafdar", x: 2240, y: 3180, size: 14 },

  // ── Kourend additions ──
  { name: "Tithe Farm", x: 1793, y: 3508, size: 12 },
  { name: "Dense Essence Mine", x: 1760, y: 3854, size: 12 },
  { name: "Dark Altar", x: 1760, y: 3870, size: 12 },
  { name: "Lizardman Canyon", x: 1475, y: 3690, size: 12 },
  { name: "Fishing Hamlet", x: 1645, y: 3960, size: 12 },
  { name: "Settlement Ruins", x: 1510, y: 3875, size: 11 },
  { name: "Kourend Woodland", x: 1580, y: 3460, size: 12 },

  // ── Wilderness additions ──
  { name: "Wilderness Agility Course", x: 2998, y: 3916, size: 12 },
  { name: "Lava Maze", x: 3070, y: 3850, size: 13 },
  { name: "Scorpion Pit", x: 3232, y: 3775, size: 12 },
  { name: "Frozen Waste Plateau", x: 2975, y: 3940, size: 12 },
  { name: "Resource Area", x: 3184, y: 3942, size: 12 },
  { name: "Bone Yard", x: 3236, y: 3700, size: 12 },
  { name: "Forgotten Cemetery", x: 3020, y: 3720, size: 12 },
  { name: "Deserted Keep", x: 3155, y: 3955, size: 12 },
  { name: "Hobgoblin Mine", x: 3120, y: 3740, size: 11 },
  { name: "Ruins", x: 3108, y: 3568, size: 11 },

  // ── Fremennik additions ──
  { name: "Mountain Camp", x: 2798, y: 3670, size: 13 },
  { name: "Troll Stronghold", x: 2838, y: 3693, size: 13 },
  { name: "Trollweiss", x: 2780, y: 3810, size: 13 },
  { name: "Fremennik Slayer Dungeon", x: 2794, y: 3615, size: 11 },
  { name: "Iceberg", x: 2660, y: 4020, size: 14 },

  // ── Other additions ──
  { name: "Gu'Tanoth", x: 2510, y: 3035, size: 14 },
  { name: "Jiggig", x: 2477, y: 3045, size: 12 },
  // Marim removed — overlaps Ape Atoll label (12 tiles apart, same location)
  { name: "Puro-Puro", x: 2591, y: 4318, size: 14 },
  { name: "Blast Furnace", x: 2931, y: 10196, size: 13 },
  { name: "Museum Camp", x: 3763, y: 3869, size: 12 },
  { name: "Volcanic Mine", x: 3815, y: 3808, size: 12 },
  { name: "Wyvern Cave", x: 3745, y: 3779, size: 11 },
];

// ── Loader ──────────────────────────────────────────────

/**
 * Load all map overlays and add them to the map.
 * Returns an object of { categoryName: L.LayerGroup } for the layer control.
 */
async function loadMapOverlays(map, gameToLatLng) {
  const layers = {};

  // ── Load kingdom labels (zoom-responsive) ──
  const kingdomLayer = L.layerGroup();
  const kingdomMarkers = [];

  for (const k of KINGDOM_LABELS) {
    const marker = L.marker(gameToLatLng(k.x, k.y), {
      icon: L.divIcon({
        className: "kingdom-label",
        html: `<span style="font-size:${k.size}px">${k.name}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
      interactive: false,
      zIndexOffset: 5000,
    });
    marker.addTo(kingdomLayer);
    kingdomMarkers.push({ marker, data: k });
  }

  // ── Load town labels (zoom-responsive) ──
  const townLayer = L.layerGroup();
  const townMarkers = [];

  for (const town of TOWN_LABELS) {
    const marker = L.marker(gameToLatLng(town.x, town.y), {
      icon: L.divIcon({
        className: "town-label",
        html: `<span style="font-size:${town.size}px">${town.name}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
      interactive: false,
      zIndexOffset: 4000,
    });
    marker.addTo(townLayer);
    townMarkers.push({ marker, town });
  }

  // Update label sizes on zoom — uses global fontScale from settings
  function updateAllLabels() {
    const zoom = map.getZoom();
    const userScale = (typeof fontScale !== "undefined") ? fontScale : 1.0;
    const townZoomScale = Math.max(1.0, Math.min(2.0, 1.2 - (zoom * 0.15)));
    const kingdomZoomScale = Math.max(0.5, Math.min(2.5, 1.0 - (zoom * 0.25)));

    for (const { marker, town } of townMarkers) {
      const size = Math.round(town.size * townZoomScale * userScale);
      marker.setIcon(L.divIcon({
        className: "town-label",
        html: `<span style="font-size:${size}px">${town.name}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }));
    }

    for (const { marker, data } of kingdomMarkers) {
      const size = Math.round(data.size * kingdomZoomScale * userScale);
      marker.setIcon(L.divIcon({
        className: "kingdom-label",
        html: `<span style="font-size:${size}px">${data.name}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }));
    }
  }
  // Make globally accessible so settings slider can trigger it
  window.updateAllLabels = updateAllLabels;

  map.on("zoomend", updateAllLabels);
  updateAllLabels();

  kingdomLayer.addTo(map);
  townLayer.addTo(map);
  layers["Kingdoms"] = kingdomLayer;
  layers["Town Names"] = townLayer;

  // ── Load POI icons ──
  try {
    // Try local game cache sprites first, fall back to wiki
    let iconListRes = await fetch(ICON_LIST_URL).catch(() => null);
    if (!iconListRes || !iconListRes.ok) {
      iconListRes = await fetch(ICON_LIST_FALLBACK);
    }
    const geojsonRes = await fetch(ICON_GEOJSON_URL);

    const iconListData = await iconListRes.json();
    const geojsonData = await geojsonRes.json();

    const iconFolder = iconListData.folder;
    const icons = iconListData.icons;

    // Create a layer group per category
    const categoryLayers = {};
    for (const cat of Object.keys(ICON_CATEGORIES)) {
      categoryLayers[cat] = L.layerGroup();
    }
    categoryLayers["Uncategorized"] = L.layerGroup();

    // Build Leaflet icon cache
    const leafletIcons = {};
    for (const [key, def] of Object.entries(icons)) {
      leafletIcons[key] = L.icon({
        iconUrl: iconFolder + def.filename,
        iconSize: [def.width || 15, def.height || 15],
        iconAnchor: [(def.width || 15) / 2, (def.height || 15) / 2],
        popupAnchor: [0, -(def.height || 15) / 2],
      });
    }

    // Custom runecraft altar icon — uses the OSRS Runecraft skill icon
    leafletIcons["runecraft_altar"] = L.icon({
      iconUrl: "https://oldschool.runescape.wiki/images/Runecraft_icon.png",
      iconSize: [15, 15],
      iconAnchor: [7, 7],
      popupAnchor: [0, -7],
    });

    // Place each feature
    let count = 0;
    for (const feature of geojsonData.features) {
      const props = feature.properties;
      const coords = feature.geometry.coordinates;

      // Filter to surface map (mapID 0) only
      const mapID = props.mapID;
      if (Array.isArray(mapID) ? !mapID.includes(0) : mapID !== 0) {
        continue;
      }

      const iconKey = props.icon;
      const leafIcon = leafletIcons[iconKey] || leafletIcons["IconNotFound"];
      if (!leafIcon) continue;

      const latlng = gameToLatLng(coords[0], coords[1]);
      const marker = L.marker(latlng, { icon: leafIcon });

      // Add tooltip — use POI name lookup for quests, minigames, dungeons
      // Fuzzy match: try exact coord first, then search within 5 tiles
      const coordKey = coords[0] + "," + coords[1];
      const cx = coords[0], cy = coords[1];

      function fuzzyLookup(table) {
        if (!table) return null;
        if (table[coordKey]) return table[coordKey];
        // Search within 5 tiles
        let best = null, bestDist = 6;
        for (const [key, name] of Object.entries(table)) {
          const [kx, ky] = key.split(",").map(Number);
          const dist = Math.abs(kx - cx) + Math.abs(ky - cy);
          if (dist < bestDist) { best = name; bestDist = dist; }
        }
        return best;
      }

      let displayName;
      if (iconKey === "quest_start") {
        displayName = fuzzyLookup(typeof QUEST_NAMES !== "undefined" ? QUEST_NAMES : null);
      } else if (iconKey === "minigame") {
        displayName = fuzzyLookup(typeof MINIGAME_NAMES !== "undefined" ? MINIGAME_NAMES : null);
      } else if (iconKey === "dungeon" || iconKey === "dungeon_link") {
        displayName = fuzzyLookup(typeof DUNGEON_NAMES !== "undefined" ? DUNGEON_NAMES : null)
          || fuzzyLookup(typeof DUNGEON_LINK_NAMES !== "undefined" ? DUNGEON_LINK_NAMES : null);
      }

      if (!displayName) {
        displayName = iconKey
          .replace(/[_-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
      marker.bindTooltip(displayName, { direction: "top", offset: [0, -8] });

      // Track quest markers for state-based filtering
      if (iconKey === "quest_start") {
        marker._questName = displayName;
        marker._questCoordKey = coordKey;
        if (!window._questMarkers) window._questMarkers = [];
        window._questMarkers.push(marker);
      }

      // Add to the correct category layer
      const cat = iconToCategory[iconKey] || "Uncategorized";
      const targetLayer = categoryLayers[cat] || categoryLayers["Uncategorized"];
      marker.addTo(targetLayer);
      count++;
    }

    // ── Add supplemental POIs for new areas (deduplicated against cache) ──
    // Build a set of cache positions for dedup (icon + rounded coords)
    const cachePositions = new Set();
    for (const f of geojsonData.features) {
      const [x, y] = f.geometry.coordinates;
      cachePositions.add(f.properties.icon + ":" + Math.round(x / 3) + "," + Math.round(y / 3));
    }

    if (typeof NEW_AREA_POIS !== "undefined") {
      for (const poi of NEW_AREA_POIS) {
        // Skip if cache already has this icon nearby
        const dedupKey = poi.icon + ":" + Math.round(poi.x / 3) + "," + Math.round(poi.y / 3);
        if (cachePositions.has(dedupKey)) continue;

        const leafIcon = leafletIcons[poi.icon] || leafletIcons["IconNotFound"];
        if (!leafIcon) continue;

        const latlng = gameToLatLng(poi.x, poi.y);
        const marker = L.marker(latlng, { icon: leafIcon });
        marker.bindTooltip(poi.name || poi.icon.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase()), { direction: "top", offset: [0, -8] });

        if (poi.icon === "quest_start") {
          marker._questName = poi.name;
          marker._questCoordKey = poi.x + "," + poi.y;
          if (!window._questMarkers) window._questMarkers = [];
          window._questMarkers.push(marker);
        }

        const cat = iconToCategory[poi.icon] || "Uncategorized";
        const targetLayer = categoryLayers[cat] || categoryLayers["Uncategorized"];
        marker.addTo(targetLayer);
        count++;
      }
    }

    // Add all cache icons to search index
    if (typeof window._addCacheIconsToSearch === "function") {
      // Build a combined name lookup from all name tables
      const allNames = {};
      if (typeof QUEST_NAMES !== "undefined") Object.assign(allNames, QUEST_NAMES);
      if (typeof MINIGAME_NAMES !== "undefined") Object.assign(allNames, MINIGAME_NAMES);
      if (typeof DUNGEON_NAMES !== "undefined") Object.assign(allNames, DUNGEON_NAMES);
      if (typeof DUNGEON_LINK_NAMES !== "undefined") Object.assign(allNames, DUNGEON_LINK_NAMES);
      window._addCacheIconsToSearch(geojsonData.features, allNames);
    }

    // Build display names with representative icons
    const repIcons = {};
    for (const [cat, def] of Object.entries(ICON_CATEGORIES)) {
      const repDef = icons[def.rep];
      if (repDef) {
        repIcons[cat] = `<img src="${iconFolder}${repDef.filename}" style="width:15px;height:15px;vertical-align:middle;image-rendering:pixelated;margin-right:4px;" />${cat}`;
      } else {
        repIcons[cat] = cat;
      }
    }

    // Add ALL layers to map by default (all toggles on)
    for (const [cat, layer] of Object.entries(categoryLayers)) {
      if (layer.getLayers().length === 0) continue; // skip empty
      layer.addTo(map);
      layers[repIcons[cat] || cat] = layer;
    }

  } catch (err) {
    console.error("RuneRadar: Failed to load POI icons:", err);
  }

  return layers;
}
