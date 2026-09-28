// Items this game actually gives real battle effects to. Left out on purpose: anything
// that only matters with a system this engine doesn't have (entry hazards, weather,
// accuracy/crit rolls, sound-move flags). Those items exist in the Pokedex/UI but were
// kept out of ITEM_POOL so nothing gets handed out that would silently do nothing.
// (Status conditions, contact detection, multi-hit and two-turn moves now exist, so
// their items were added back in.)
export const ITEM_POOL = [
    // General held items
    "leftovers",
    "choice-scarf",
    "eviolite",
    "choice-specs",
    "choice-band",
    "focus-sash",
    "assault-vest",
    "black-sludge",
    "air-balloon",
    "berry-juice",
    "expert-belt",
    "black-glasses",
    "weakness-policy",
    "soul-dew",
    "white-herb",
    "thick-club",
    "spell-tag",
    "silk-scarf",
    "covert-cloak",
    "magnet",
    "metronome",
    "metal-coat",
    "never-melt-ice",
    "soft-sand",
    "mystic-water",
    "sharp-beak",
    "dragon-fang",
    "charcoal",
    "iron-ball",
    "twisted-spoon",
    "poison-barb",
    "muscle-band",
    "life-orb",
    "rocky-helmet",
    "sticky-barb",
    "toxic-orb",
    "flame-orb",
    "light-clay",
    "power-herb",
    "loaded-dice",
    "wide-lens",
    // Berries
    "colbur-berry",
    "shuca-berry",
    "sitrus-berry",
    "salac-berry",
    "chople-berry",
    "occa-berry",
    "iapapa-berry",
    "figy-berry",
    "passho-berry",
    "babiri-berry",
    "liechi-berry",
    "custap-berry",
    "kee-berry",
    "aguav-berry",
    "petaya-berry",
    "coba-berry",
    "yache-berry",
    "roseli-berry",
    "haban-berry",
    // Status-curing berries
    "lum-berry",
    "cheri-berry",
    "chesto-berry",
    "pecha-berry",
    "rawst-berry",
    "aspear-berry",
    "persim-berry",
];

// Items that are only worth handing out on a real Showdown set (where the moves that make
// them useful come with them). A random pokemon with no Fly/Solar Beam/Fury Attack in its
// kit would just hold a dud, so generateRandomItem never rolls these.
export const REAL_SET_ONLY_ITEMS = new Set(["power-herb", "loaded-dice"]);

// item name -> move type it boosts 20% (or 30% for Muscle Band/physical, handled separately)
export const TYPE_BOOST_ITEMS = {
    "black-glasses": "dark",
    magnet: "electric",
    "metal-coat": "steel",
    "never-melt-ice": "ice",
    "soft-sand": "ground",
    "mystic-water": "water",
    "sharp-beak": "flying",
    "dragon-fang": "dragon",
    charcoal: "fire",
    "twisted-spoon": "psychic",
    "poison-barb": "poison",
    "silk-scarf": "normal",
    "spell-tag": "ghost",
};

// item name -> type it resists (halves damage of a super-effective hit of that type, then is consumed)
export const RESIST_BERRIES = {
    "colbur-berry": "dark",
    "shuca-berry": "ground",
    "chople-berry": "fighting",
    "occa-berry": "fire",
    "passho-berry": "water",
    "babiri-berry": "steel",
    "coba-berry": "flying",
    "yache-berry": "ice",
    "roseli-berry": "fairy",
    "haban-berry": "dragon",
};

// item name -> [allowed species] (only meaningfully functions on these)
export const SPECIES_EXCLUSIVE_ITEMS = {
    "soul-dew": ["latios", "latias"],
    "thick-club": ["cubone", "marowak", "marowak-alola", "marowak-alola-totem"],
    // Eviolite only makes sense on a not-fully-evolved pokemon; porygon2 (mid-evolution)
    // is the only NFE pokemon this pool can produce (see eligible_pokemon_ids.json).
    eviolite: ["porygon2"],
};

// item name -> stat_levels index (0 attack, 1 defense, 2 special-attack, 3 special-defense, 4 speed —
// there's no HP entry since HP has no stat stage). Berry raises that stat by 1 stage.
export const STAT_BOOST_BERRIES = {
    "liechi-berry": 0, // attack
    "petaya-berry": 2, // special attack
    "salac-berry": 4, // speed
};

// item name -> [heal-threshold fraction of max hp, heal amount as fraction of max hp or fixed]
export const HP_HEAL_BERRIES = new Set(["sitrus-berry", "figy-berry", "aguav-berry", "iapapa-berry"]);
export const BERRY_JUICE = "berry-juice";
export const CUSTAP_BERRY = "custap-berry";
export const KEE_BERRY = "kee-berry";
export const WHITE_HERB = "white-herb";
export const WEAKNESS_POLICY = "weakness-policy";
export const AIR_BALLOON = "air-balloon";
export const FOCUS_SASH = "focus-sash";
export const LIFE_ORB = "life-orb";
export const BLACK_SLUDGE = "black-sludge";
export const LEFTOVERS = "leftovers";
export const EXPERT_BELT = "expert-belt";
export const MUSCLE_BAND = "muscle-band";
export const EVIOLITE = "eviolite";
export const ASSAULT_VEST = "assault-vest";
export const IRON_BALL = "iron-ball";
export const COVERT_CLOAK = "covert-cloak";
export const METRONOME_ITEM = "metronome";
export const SOUL_DEW = "soul-dew";
export const ROCKY_HELMET = "rocky-helmet";
export const STICKY_BARB = "sticky-barb";
export const TOXIC_ORB = "toxic-orb";
export const FLAME_ORB = "flame-orb";
export const LIGHT_CLAY = "light-clay";
export const POWER_HERB = "power-herb";
export const LOADED_DICE = "loaded-dice";
export const WIDE_LENS = "wide-lens";

// berry -> which of the holder's conditions it cures ("confusion" is the volatile one; the
// rest are the major status names in pokemon.status.name). Lum Berry cures all of them.
export const STATUS_CURE_BERRIES = {
    "lum-berry": ["paralysis", "burn", "poison", "toxic", "sleep", "freeze", "confusion"],
    "cheri-berry": ["paralysis"],
    "chesto-berry": ["sleep"],
    "pecha-berry": ["poison", "toxic"],
    "rawst-berry": ["burn"],
    "aspear-berry": ["freeze"],
    "persim-berry": ["confusion"],
};
export const CHOICE_ITEMS = {
    "choice-band": 1, // attack
    "choice-specs": 3, // special attack
    "choice-scarf": 5, // speed
};

// Items that can't be removed/stolen/traded/thrown at all (Knock Off, Thief, Trick,
// Switcheroo, Bestow, Corrosive Gas, Fling all fail against/with these). Real games
// also protect Mega Stones/Z-Crystals/Plates/Drives/orbs this way, but none of those
// are in ITEM_POOL, so Soul Dew is the only one that matters here.
export const UNREMOVABLE_ITEMS = new Set([SOUL_DEW]);

// Real Fling base power per item (Bulbapedia's Fling power list); best-effort for the
// items in ITEM_POOL specifically. Falls back to 30 for an unlisted general item, since
// that's the most common value, and every berry is 10 (the standard berry Fling power).
export const FLING_POWER = {
    leftovers: 10,
    "choice-scarf": 10,
    eviolite: 40,
    "choice-specs": 10,
    "choice-band": 10,
    "focus-sash": 10,
    "assault-vest": 10,
    "black-sludge": 30,
    "air-balloon": 10,
    "berry-juice": 30,
    "expert-belt": 10,
    "black-glasses": 30,
    "weakness-policy": 10,
    "white-herb": 10,
    "thick-club": 90,
    "spell-tag": 30,
    "silk-scarf": 10,
    "covert-cloak": 10,
    magnet: 30,
    metronome: 30,
    "metal-coat": 30,
    "never-melt-ice": 30,
    "soft-sand": 10,
    "mystic-water": 30,
    "sharp-beak": 30,
    "dragon-fang": 70,
    charcoal: 30,
    "iron-ball": 130,
    "twisted-spoon": 30,
    "poison-barb": 70,
    "muscle-band": 10,
    "life-orb": 30,
    "rocky-helmet": 60,
    "sticky-barb": 80,
    "power-herb": 10,
    "toxic-orb": 30,
    "flame-orb": 30,
    "light-clay": 30,
    "loaded-dice": 30,
    "wide-lens": 10,
};
export function getFlingPower(itemName) {
    if (itemName.endsWith("-berry")) return 10;
    return FLING_POWER[itemName] !== undefined ? FLING_POWER[itemName] : 30;
}
