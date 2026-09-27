// Items this game actually gives real battle effects to. Left out on purpose: anything
// that only matters with a system this engine doesn't have (status conditions, entry
// hazards, screens, weather, contact/trapping, accuracy/crit rolls, multi-hit moves,
// two-turn moves, sound-move flags). Those items exist in the Pokedex/UI but were kept
// out of ITEM_POOL so nothing gets handed out that would silently do nothing.
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
];

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
export const CHOICE_ITEMS = {
    "choice-band": 1, // attack
    "choice-specs": 3, // special attack
    "choice-scarf": 5, // speed
};
