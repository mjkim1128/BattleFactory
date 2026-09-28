import MECHANICS from "./move_mechanics.json";

// Move behavior lists mined from Pokemon Showdown's data/moves.ts (MIT licensed, pinned
// commit recorded in move_mechanics.json's "source"), keyed by PokeAPI move slug. PokeAPI
// only has this as prose in effect text, so it can't be read from the move data itself.

// Not used by the battle code yet (the moves that need these are still unsupported or
// banned); mined now so they're ready: charging moves (Solar Beam, Fly, Dig...),
// recharge moves (Hyper Beam...), self-switch moves (U-turn, Baton Pass...), and
// multi-hit ranges by slug ({ "fury-attack": [2, 5] }).
export const TWO_TURN_MOVES = new Set(MECHANICS.twoTurn);
export const RECHARGE_MOVES = new Set(MECHANICS.recharge);
export const PIVOT_MOVES = new Set(MECHANICS.pivot);
export const MULTIHIT_MOVES = MECHANICS.multihit;

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
