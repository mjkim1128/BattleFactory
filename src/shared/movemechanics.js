import MECHANICS from "./move_mechanics.json";

// Move behavior lists mined from Pokemon Showdown's data/moves.ts (MIT licensed, pinned
// commit recorded in move_mechanics.json's "source"), keyed by PokeAPI move slug. PokeAPI
// only has this as prose in effect text, so it can't be read from the move data itself.

// Charging moves (Solar Beam, Fly, Dig...), recharge moves (Hyper Beam...), self-switch
// moves (U-turn, Baton Pass...) and multi-hit ranges by slug ({ "fury-attack": [2, 5] }).
export const TWO_TURN_MOVES = new Set(MECHANICS.twoTurn);
export const RECHARGE_MOVES = new Set(MECHANICS.recharge);
export const PIVOT_MOVES = new Set(MECHANICS.pivot);
export const MULTIHIT_MOVES = MECHANICS.multihit;

// The subsets the battle code actually handles. Sky Drop (carries the target away) is
// left out and stays banned; Shed Tail needs Substitute and Revival Blessing revives a
// fainted ally, so those two are not pivots here (Chilly Reception sets snow, then switches).
export const CHARGE_MOVES = new Set([...TWO_TURN_MOVES].filter((m) => m !== "sky-drop"));
const UNSUPPORTED_PIVOTS = new Set(["shed-tail", "revival-blessing"]);
export const SUPPORTED_PIVOT_MOVES = new Set([...PIVOT_MOVES].filter((m) => !UNSUPPORTED_PIVOTS.has(m)));

// While a pokemon is on the charge turn of one of these, moves aimed at it miss, except
// the listed ones, which hit (and for `doubled` ones, hit for double). From the
// onInvulnerability / onSourceModifyDamage handlers in Showdown's data/moves.ts.
export const SEMI_INVULNERABLE_MOVES = {
    fly: {
        hitBy: ["gust", "twister", "sky-uppercut", "thunder", "hurricane", "smack-down", "thousand-arrows"],
        doubled: ["gust", "twister"],
    },
    bounce: {
        hitBy: ["gust", "twister", "sky-uppercut", "thunder", "hurricane", "smack-down", "thousand-arrows"],
        doubled: ["gust", "twister"],
    },
    dig: { hitBy: ["earthquake", "magnitude"], doubled: ["earthquake", "magnitude"] },
    dive: { hitBy: ["surf", "whirlpool"], doubled: ["surf", "whirlpool"] },
    "phantom-force": { hitBy: [], doubled: [] },
    "shadow-force": { hitBy: [], doubled: [] },
};

// Stat stage changes some charging moves grant on the charge turn (Showdown's onTryMove).
export const CHARGE_TURN_BOOSTS = {
    "electro-shot": [{ stat: { name: "special-attack" }, change: 1 }],
    "meteor-beam": [{ stat: { name: "special-attack" }, change: 1 }],
    "skull-bash": [{ stat: { name: "defense" }, change: 1 }],
};

// Multi-hit moves whose hits each roll accuracy (and stop at the first miss). The engine
// has no accuracy otherwise, so without this a 10-hit Population Bomb would always land
// all ten. The first hit always lands, like every other move here.
export const ROLLS_ACCURACY_EACH_HIT = new Set(["population-bomb", "triple-axel", "triple-kick"]);
// Multi-hit moves whose power grows with each hit (hit N uses N x base power).
export const ESCALATING_MULTIHIT = new Set(["triple-axel", "triple-kick"]);

// Status moves Magic Bounce sends back, and the moves Dancer copies (Showdown flags
// reflectable / dance). Lunar Dance (faints the user) and Petal Dance (locks in) are left out.
export const REFLECTABLE_MOVES = new Set(MECHANICS.reflectable);
export const DANCE_MOVES = new Set(MECHANICS.dance.filter((m) => m !== "lunar-dance" && m !== "petal-dance"));

// Moves that always land a critical hit (Showdown's willCrit).
export const ALWAYS_CRIT_MOVES = new Set(["flower-trick", "frost-breath", "storm-throw", "surging-strikes", "wicked-blow"]);
// Trapping: damaging moves that bind the target for a few turns (PokeAPI ailment "trap"),
// and the ones that trap it until the user leaves (Showdown's volatile 'trapped').
export const BINDING_MOVES = new Set(["bind", "clamp", "fire-spin", "infestation", "magma-storm", "sand-tomb", "snap-trap", "thunder-cage", "whirlpool", "wrap"]);
export const TRAPPING_MOVES = new Set(["mean-look", "block", "spider-web", "anchor-shot", "spirit-shackle", "thousand-waves", "jaw-lock"]);
// Only usable on the first turn after switching in (Showdown: activeMoveActions > 1 fails).
export const FIRST_TURN_ONLY_MOVES = new Set(["fake-out", "first-impression"]);

// One-hit KO moves and the type that is immune to them (from Showdown's `ohko` flag).
export const OHKO_MOVES = { fissure: null, guillotine: null, "horn-drill": null, "sheer-cold": "ice" };
// Jump Kick & co.: if the move misses or has no effect, the user takes half its max HP
// (Showdown's hasCrashDamage).
export const CRASH_MOVES = new Set(["jump-kick", "high-jump-kick", "supercell-slam", "axe-kick"]);
// These hit no matter how high the target's evasion is (Showdown's ignoreEvasion).
export const IGNORE_EVASION_MOVES = new Set(["chip-away", "darkest-lariat", "sacred-sword", "nihil-light"]);

// Moves that keep their real base power instead of being flattened to the 75-95 range
// every ordinary attack is clamped to (see Home.js). Charging/recharge moves need their
// real power to be worth the lost turn, a multi-hit move's power is per hit, and a move
// that can miss keeps its real power so the accuracy trade-off is real (Thunder is 110
// power at 70%, not a flattened 95 at 100%).
export function keepsRawPower(moveName, accuracy) {
    return (
        CHARGE_MOVES.has(moveName) ||
        RECHARGE_MOVES.has(moveName) ||
        MULTIHIT_MOVES[moveName] !== undefined ||
        (typeof accuracy === "number" && accuracy < 100)
    );
}

// Used by status conditions.
export const DEFROST_MOVES = new Set(MECHANICS.defrost); // using it thaws the user
export const THAWS_TARGET_MOVES = new Set(MECHANICS.thawsTarget); // hitting a frozen target thaws it
export const TOXIC_MOVES = new Set(MECHANICS.toxic); // PokeAPI reports these as plain "poison"
export const POWDER_MOVES = new Set(MECHANICS.powder); // Grass types are immune
// Status moves that, unlike most, are still stopped by type immunity (Thunder Wave vs Ground).
export const STATUS_TYPE_BLOCKED_MOVES = new Set(MECHANICS.statusTypeBlocked);

// Types that can't be given a status (from Showdown's data/typechart.ts).
export const STATUS_IMMUNE_TYPES = {
    paralysis: ["electric"],
    burn: ["fire"],
    freeze: ["ice"],
    poison: ["poison", "steel"],
    toxic: ["poison", "steel"],
};
