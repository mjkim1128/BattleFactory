export const BANNED_MOVES = [
    "dream-eater",
    "dig",
    "dive",
    "fly",
    "uproar",
    "focus-punch",
    "hyper-beam",
    "giga-impact",
    "sky-drop",
    "skull-bash",
    "steel-roller",
    "dynamic-punch",
    "belch",
    "zap-cannon",
    "solar-beam",
    "solar-blade",
    "petal-dance",
    "burn-up",
    "last-resort",
    "sky-attack",
    "thrash",
    "meteor-beam",
    "steel-beam",
    "round",
    "future-sight", /// For now
    // "explosion",
    // "self-destruct",
    "covet", /// Bad move, maybe buff/make useful
    "swift",
    "bubble-beam", /// snorlax??
    "eruption",
    "water-spout",
    "blast-burn",
    "frenzy-plant",
    "hydro-cannon",
    "synchronoise",
    "strength", // boring
    "slash", // 70 bp lame
    "razor-wind", // ? lol
    "slam", // slam
    "headbutt", // butthead
    "vice-grip", // crabs
    "take-down", // too many, mabye unban and buff?
    "horn-attack", // just no
];

// Whether a move makes physical contact (needed for Rocky Helmet, Sticky Barb, etc.).
// PokeAPI doesn't expose this at all (no "flags" field on /move/{id}), so this is
// mined from Pokemon Showdown's data/moves.ts flags.contact instead, converted to
// PokeAPI-style slugs.
export const CONTACT_MOVES = new Set([
    "accelerock", "acrobatics", "aerial-ace", "anchor-shot", "aqua-jet", "aqua-step",
    "aqua-tail", "arm-thrust", "assurance", "astonish", "avalanche", "axe-kick",
    "behemoth-bash", "behemoth-blade", "bide", "bind", "bite", "bitter-blade",
    "blaze-kick", "body-press", "body-slam", "bolt-beak", "bolt-strike", "bounce",
    "branch-poke", "brave-bird", "breaking-swipe", "brick-break", "brutal-swing", "bug-bite",
    "bullet-punch", "catastropika", "ceaseless-edge", "chip-away", "circle-throw", "clamp",
    "close-combat", "collision-course", "comet-punch", "comeuppance", "constrict", "counter",
    "covet", "crabhammer", "cross-chop", "cross-poison", "crunch", "crush-claw",
    "crush-grip", "cut", "darkest-lariat", "dig", "dire-claw", "dive",
    "dizzy-punch", "double-edge", "double-hit", "double-iron-bash", "double-kick", "double-shock",
    "double-slap", "dragon-ascent", "dragon-claw", "dragon-hammer", "dragon-rush", "dragon-tail",
    "drain-punch", "draining-kiss", "drill-peck", "drill-run", "dual-chop", "dual-wingbeat",
    "dynamic-punch", "electro-drift", "endeavor", "extreme-speed", "facade", "fake-out",
    "false-surrender", "false-swipe", "feint-attack", "fell-stinger", "fire-fang", "fire-lash",
    "fire-punch", "first-impression", "fishious-rend", "flail", "flame-charge", "flame-wheel",
    "flare-blitz", "flip-turn", "floaty-fall", "fly", "flying-press", "focus-punch",
    "force-palm", "foul-play", "frustration", "fury-attack", "fury-cutter", "fury-swipes",
    "gear-grind", "giga-impact", "glaive-rush", "grass-knot", "grassy-glide", "guillotine",
    "gyro-ball", "hammer-arm", "hard-press", "head-charge", "head-smash", "headbutt",
    "headlong-rush", "heart-stamp", "heat-crash", "heavy-slam", "high-horsepower", "high-jump-kick",
    "hold-back", "horn-attack", "horn-drill", "horn-leech", "hyper-drill", "hyper-fang",
    "ice-ball", "ice-fang", "ice-hammer", "ice-punch", "ice-spinner", "infestation",
    "iron-head", "iron-tail", "jaw-lock", "jet-punch", "jump-kick", "karate-chop",
    "knock-off", "kowtow-cleave", "lash-out", "last-resort", "leaf-blade", "leech-life",
    "lets-snuggle-forever", "lick", "liquidation", "low-kick", "low-sweep", "lunge",
    "mach-punch", "malicious-moonsault", "mega-kick", "mega-punch", "megahorn", "metal-claw",
    "meteor-mash", "mighty-cleave", "mortal-spin", "multi-attack", "needle-arm", "night-slash",
    "nuzzle", "outrage", "payback", "peck", "petal-dance", "phantom-force",
    "plasma-fists", "play-rough", "pluck", "poison-fang", "poison-jab", "poison-tail",
    "population-bomb", "pounce", "pound", "power-trip", "power-up-punch", "power-whip",
    "psyblade", "psychic-fangs", "psyshield-bash", "pulverizing-pancake", "punishment", "pursuit",
    "quick-attack", "rage", "rage-fist", "raging-bull", "rapid-spin", "razor-shell",
    "retaliate", "return", "revenge", "reversal", "rock-climb", "rock-smash",
    "rolling-kick", "rollout", "sacred-sword", "scratch", "searing-sunraze-smash", "seismic-toss",
    "shadow-claw", "shadow-force", "shadow-punch", "shadow-sneak", "shadow-strike", "sizzly-slide",
    "skitter-smack", "skull-bash", "sky-drop", "sky-uppercut", "slam", "slash",
    "smart-strike", "smelling-salts", "snap-trap", "solar-blade", "soul-stealing-7-star-strike", "spark",
    "spectral-thief", "spin-out", "spirit-break", "steamroller", "steel-roller", "steel-wing",
    "stomp", "stomping-tantrum", "stone-axe", "storm-throw", "strength", "struggle",
    "submission", "sucker-punch", "sunsteel-strike", "super-fang", "supercell-slam", "superpower",
    "surging-strikes", "tackle", "tail-slap", "take-down", "temper-flare", "thief",
    "thrash", "throat-chop", "thunder-fang", "thunder-punch", "thunderous-kick", "trailblaze",
    "triple-axel", "triple-dive", "triple-kick", "trop-kick", "trump-card", "u-turn",
    "upper-hand", "v-create", "veevee-volley", "vine-whip", "vise-grip", "vital-throw",
    "volt-tackle", "wake-up-slap", "waterfall", "wave-crash", "wicked-blow", "wild-charge",
    "wing-attack", "wood-hammer", "wrap", "wring-out", "x-scissor", "zen-headbutt",
    "zing-zap", "zippy-zap",
]);

export const GOOD_MOVES = [
    "quick-attack",
    "extreme-speed",
    "aqua-jet",
    "bullet-punch",
    "first-impression",
    "ice-shard",
    "mach-punch",
    "shadow-sneak", /// not in gen1
    "sucker-punch", /// power nerf to 70, gonna buff back to 80
    "overheat",
    "thunder",
    "blizzard",
    "leaf-storm",
    "earthquake",
    "stone-edge",
    "close-combat",
    "superpower",
    "flare-blitz",
    "brave-bird",
    "hydro-pump",
    "draco-meteor",
    "outrage",
    "megahorn",
    "dark-pulse",
    "crunch",
    "throat-chop", /// buff this move to at least 90-95 for the lols
];

export const DEFAULT_MOVES = [
    {
        name: "secret-power",
        damage_class: { name: "physical" },
        power: 70,
        priority: 0,
        pp: 10,
        effect_entries: [{ effect: "Does normal damage." }],
        flavor_text_entries: [
            { flavor_text: "Why" },
            { flavor_text: "Cool move. Will be random type one day." },
        ],
        type: { name: "normal" },
        accuracy: 100,
    },
    {
        name: "hidden-power",
        damage_class: { name: "special" },
        power: 70,
        priority: 0,
        pp: 10,
        effect_entries: [{ effect: "*hidden*" }],
        flavor_text_entries: [
            { flavor_text: "Why" },
            { flavor_text: "Cool move. Will be random type one day." },
        ],
        type: { name: "normal" },
        accuracy: 100,
    },
    {
        name: "knock-off",
        damage_class: { name: "physical" },
        power: 95,
        priority: 0,
        pp: 10,
        effect_entries: [{ effect: "Knock Knock" }],
        flavor_text_entries: [
            { flavor_text: "Why" },
            { flavor_text: "Knocks off the item." },
        ],
        type: { name: "dark" },
        accuracy: 100,
    },
    {
        name: "quick-attack",
        damage_class: { name: "physical" },
        power: 40,
        priority: 1,
        pp: 10,
        effect_entries: [{ effect: "G2GFAST" }],
        flavor_text_entries: [
            { flavor_text: "Why" },
            { flavor_text: "Usually moves first ;)" },
        ],
        type: { name: "normal" },
        accuracy: 100,
    },
    {
        name: "foul-play",
        damage_class: { name: "physical" },
        power: 95,
        priority: 0,
        pp: 10,
        effect_entries: [{ effect: "Not fair!" }],
        flavor_text_entries: [
            { flavor_text: "Why" },
            {
                flavor_text:
                    "No additional effect. Will use the target's attack in calculation one day.",
            },
        ],
        type: { name: "dark" },
        accuracy: 100,
    },
];
