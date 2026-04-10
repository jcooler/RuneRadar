/**
 * RuneRadar — Map Icons & Labels Layer
 *
 * Loads POI icons from the OSRS Wiki GeoJSON data and renders them on the map.
 * Also adds town/city labels as a separate toggleable layer.
 */

const ICON_LIST_URL = "https://maps.runescape.wiki/osrs/data/iconLists/MainIcons.json";
const ICON_GEOJSON_URL = "https://maps.runescape.wiki/osrs/data/overlayMaps/MainMapIconLoc.json";

// ── Icon Groups (for layer toggling) ────────────────────
// Maps icon keys to human-readable categories
const ICON_CATEGORIES = {
  "Transportation": ["transportation", "boat", "canoe_station", "charter_ship"],
  "Banks": ["bank", "grand_exchange"],
  "Quests": ["quest_start"],
  "Dungeons": ["dungeon", "dungeon_link"],
  "Skilling": [
    "mining_site", "fishing_spot", "cooking_range", "farming_patch",
    "rare_trees", "furnace", "pottery_wheel", "spinning_wheel",
    "tanning", "water_source", "anvil", "sawmill"
  ],
  "Combat": ["slayer_master"],
  "Altars": ["altar"],
  "Agility": ["agility_short-cut"],
  "Minigames": ["minigame"],
  "Other": ["general_store", "clothes_shop", "food_shop", "poll_booth",
    "house_portal", "jewellery_shop", "map_link", "sword_shop",
    "archery_shop", "magic_shop", "staff_shop", "platebody_shop",
    "axe_shop", "helmet_shop", "mining_shop", "shield_shop",
    "scimitar_shop"
  ],
};

// Reverse lookup: icon key → category name
const iconToCategory = {};
for (const [cat, icons] of Object.entries(ICON_CATEGORIES)) {
  for (const icon of icons) {
    iconToCategory[icon] = cat;
  }
}

// ── Town Labels ─────────────────────────────────────────
// Major OSRS towns/cities with game coordinates
// Kingdom/region labels (large, italic, gold)
const KINGDOM_LABELS = [
  { name: "Kingdom of Misthalin", x: 3170, y: 3350, size: 22 },
  { name: "Kingdom of Asgarnia", x: 2960, y: 3430, size: 22 },
  { name: "Kingdom of Kandarin", x: 2650, y: 3420, size: 22 },
  { name: "Wilderness", x: 3100, y: 3750, size: 26 },
  { name: "Morytania", x: 3550, y: 3400, size: 22 },
  { name: "Tirannwn", x: 2250, y: 3200, size: 20 },
  { name: "Karamja", x: 2850, y: 3080, size: 22 },
  { name: "Kharidian Desert", x: 3350, y: 2950, size: 20 },
  { name: "Fremennik Province", x: 2650, y: 3700, size: 18 },
  { name: "Great Kourend", x: 1640, y: 3680, size: 22 },
  { name: "Kebos Lowlands", x: 1280, y: 3550, size: 18 },
];

const TOWN_LABELS = [
  // Major cities
  { name: "Varrock", x: 3213, y: 3428, size: 14 },
  { name: "Falador", x: 2965, y: 3380, size: 14 },
  { name: "Lumbridge", x: 3222, y: 3218, size: 14 },
  { name: "Ardougne", x: 2662, y: 3305, size: 14 },
  { name: "Camelot", x: 2757, y: 3478, size: 13 },
  { name: "Al Kharid", x: 3293, y: 3174, size: 13 },
  { name: "Prifddinas", x: 3239, y: 6075, size: 14 },
  { name: "Fortis", x: 1730, y: 3100, size: 13 },

  // Medium towns
  { name: "Edgeville", x: 3093, y: 3500, size: 12 },
  { name: "Canifis", x: 3496, y: 3488, size: 12 },
  { name: "Yanille", x: 2544, y: 3089, size: 12 },
  { name: "Grand Exchange", x: 3165, y: 3487, size: 11 },
  { name: "Hosidius", x: 1744, y: 3517, size: 12 },
  { name: "Shayzien", x: 1485, y: 3590, size: 12 },
  { name: "Lovakengj", x: 1504, y: 3840, size: 12 },
  { name: "Arceuus", x: 1690, y: 3745, size: 12 },
  { name: "Piscarilius", x: 1810, y: 3690, size: 12 },
  { name: "Draynor Village", x: 3093, y: 3244, size: 11 },
  { name: "Catherby", x: 2813, y: 3445, size: 11 },
  { name: "Seers' Village", x: 2724, y: 3484, size: 11 },
  { name: "Taverly", x: 2895, y: 3455, size: 11 },
  { name: "Burthorpe", x: 2899, y: 3544, size: 11 },
  { name: "Port Sarim", x: 3023, y: 3208, size: 11 },

  // Smaller locations
  { name: "Rimmington", x: 2957, y: 3214, size: 10 },
  { name: "Barbarian Village", x: 3082, y: 3420, size: 10 },
  { name: "Wizards' Tower", x: 3109, y: 3162, size: 10 },
  { name: "Brimhaven", x: 2775, y: 3178, size: 11 },
  { name: "Shilo Village", x: 2828, y: 2998, size: 11 },
  { name: "Tree Gnome Stronghold", x: 2461, y: 3444, size: 11 },
  { name: "Fossil Island", x: 3741, y: 3835, size: 12 },
  { name: "Neitiznot", x: 2321, y: 3802, size: 11 },
  { name: "Jatizso", x: 2407, y: 3802, size: 11 },
  { name: "Zanaris", x: 2411, y: 4444, size: 12 },
  { name: "Mort'ton", x: 3489, y: 3287, size: 10 },
  { name: "Burgh de Rott", x: 3491, y: 3232, size: 10 },
  { name: "Lletya", x: 2341, y: 3171, size: 11 },
  { name: "Sophanem", x: 3315, y: 2780, size: 11 },
  { name: "Nardah", x: 3422, y: 2917, size: 11 },
  { name: "Pollnivneach", x: 3359, y: 2981, size: 11 },
  { name: "Raids", x: 1255, y: 3558, size: 11 },
  { name: "Ferox Enclave", x: 3151, y: 3635, size: 10 },
  { name: "Piscatoris", x: 2338, y: 3650, size: 10 },
  { name: "Ape Atoll", x: 2764, y: 2785, size: 11 },
  { name: "Lunar Isle", x: 2111, y: 3915, size: 11 },
  { name: "Miscellania", x: 2535, y: 3860, size: 11 },
  { name: "Etceteria", x: 2614, y: 3895, size: 10 },
  { name: "Tutorial Island", x: 3094, y: 3107, size: 12 },
  { name: "Keldagrim", x: 2844, y: 10209, size: 12 },
  { name: "Dorgesh-Kaan", x: 2720, y: 5348, size: 12 },
  { name: "Mor Ul Rek", x: 2528, y: 5177, size: 12 },
  { name: "Cam Torum", x: 1449, y: 3120, size: 12 },
  { name: "Toll Gate", x: 3360, y: 3140, size: 10 },
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

  // Update label sizes on zoom — slightly larger when zoomed out, slightly smaller when zoomed in
  function updateAllLabels() {
    const zoom = map.getZoom();
    // Town scale: stays readable at all zoom levels
    // zoom -3: 1.8x, zoom 0: 1.2x, zoom 2: 1.0x, zoom 3+: 1.0x (never shrinks below base)
    const townScale = Math.max(1.0, Math.min(2.0, 1.2 - (zoom * 0.15)));
    // Kingdom scale: similar but kingdoms stay large
    const kingdomScale = Math.max(0.5, Math.min(2.5, 1.0 - (zoom * 0.25)));

    for (const { marker, town } of townMarkers) {
      const size = Math.round(town.size * townScale);
      marker.setIcon(L.divIcon({
        className: "town-label",
        html: `<span style="font-size:${size}px">${town.name}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }));
    }

    for (const { marker, data } of kingdomMarkers) {
      const size = Math.round(data.size * kingdomScale);
      marker.setIcon(L.divIcon({
        className: "kingdom-label",
        html: `<span style="font-size:${size}px">${data.name}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }));
    }
  }

  map.on("zoomend", updateAllLabels);
  updateAllLabels();

  kingdomLayer.addTo(map);
  townLayer.addTo(map);
  layers["Kingdoms"] = kingdomLayer;
  layers["Town Names"] = townLayer;

  // ── Load POI icons ──
  try {
    const [iconListRes, geojsonRes] = await Promise.all([
      fetch(ICON_LIST_URL),
      fetch(ICON_GEOJSON_URL),
    ]);

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

      // Add tooltip with icon name (Title Case)
      const displayName = iconKey
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      marker.bindTooltip(displayName, { direction: "top", offset: [0, -8] });

      // Add to the correct category layer
      const cat = iconToCategory[iconKey] || "Uncategorized";
      const targetLayer = categoryLayers[cat] || categoryLayers["Uncategorized"];
      marker.addTo(targetLayer);
      count++;
    }

    // Add ALL layers to map by default (all toggles on)
    for (const [cat, layer] of Object.entries(categoryLayers)) {
      if (layer.getLayers().length === 0) continue; // skip empty
      layer.addTo(map);
      layers[cat] = layer;
    }

    console.log(`RuneRadar: Loaded ${count} map icons`);
  } catch (err) {
    console.error("RuneRadar: Failed to load map icons", err);
  }

  return layers;
}
