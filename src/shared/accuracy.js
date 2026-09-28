import { OHKO_MOVES, IGNORE_EVASION_MOVES } from "./movemechanics";
import { WIDE_LENS } from "./iteminfo";
import { weatherAccuracy } from "./field";
import { abilityAccuracyMod, abilityEvasionMod, ignoresBoosts, ignoresEvasion, hasNoGuard } from "./abilities";

// Accuracy, following Pokemon Showdown's hitStepAccuracy (sim/battle-actions.ts): the
// move's base accuracy, Wide Lens, then the accuracy/evasion stat stages, rolled against
// 100. stat_levels indexes 5 and 6 hold the accuracy and evasion stages.

// Targets that mean "the opposing pokemon" (a status move needs one to be rolled for).
export const FOE_TARGETS = new Set([
    "selected-pokemon",
    "all-opponents",
    "random-opponent",
    "all-other-pokemon",
]);

export function isOhkoMove(move) {
    return OHKO_MOVES[move.name] !== undefined;
}

// Sheer Cold can't touch Ice types.
export function ohkoImmune(defender, move) {
    const immuneType = OHKO_MOVES[move.name];
    return !!immuneType && defender.types.some((t) => t.type.name === immuneType);
}

// Does this move get an accuracy roll against the opponent at all? (Damaging moves do;
// status moves only if they're aimed at the foe, not the user or the field.)
function isRolled(move) {
    return move.damage_class.name !== "status" || FOE_TARGETS.has(move.target && move.target.name);
}

function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}

// The percent chance for `move` to hit, or null if it can't miss (Swift, Aerial Ace, moves
// that only affect the user, Toxic from a Poison type...). Can be above 100.
export function hitChance(attacker, defender, move, field = null) {
    let base = move.accuracy;
    // Thunder/Hurricane/Blizzard & co. change with the weather (never miss / only 50%)
    const weatherOverride = weatherAccuracy(move, field);
    if (weatherOverride === "always") return null;
    if (weatherOverride !== undefined) base = weatherOverride;
    if (base === null || base === undefined || base === true) return null;
    if (!isRolled(move)) return null;
    if (move.name === "toxic" && attacker.types.some((t) => t.type.name === "poison")) return null;

    // No Guard on either side: every move connects
    if (hasNoGuard(attacker) || hasNoGuard(defender)) return null;

    // One-hit KO moves ignore every accuracy modifier
    if (isOhkoMove(move)) {
        const isIce = attacker.types.some((t) => t.type.name === "ice");
        return move.name === "sheer-cold" && !isIce ? 20 : 30;
    }

    let accuracy = base;
    if (attacker.item && attacker.item.name === WIDE_LENS) {
        accuracy = Math.floor((accuracy * 4505) / 4096); // Wide Lens: x1.1
    }
    // Compound Eyes (x1.3) / Victory Star (x1.1)
    accuracy = Math.floor(accuracy * abilityAccuracyMod(attacker, move));
    // The target's own ability (Sand Veil, Snow Cloak, Tangled Feet, Wonder Skin)
    accuracy = Math.floor(accuracy * abilityEvasionMod(defender, attacker, move, field));
    // Unaware on either side ignores the other's accuracy/evasion stages
    const accuracyStage = ignoresBoosts(defender, attacker)
        ? 0
        : clamp((attacker.stat_levels && attacker.stat_levels[5]) || 0, -6, 6);
    const evasionStage =
        IGNORE_EVASION_MOVES.has(move.name) || ignoresBoosts(attacker) || ignoresEvasion(attacker)
            ? 0
            : (defender.stat_levels && defender.stat_levels[6]) || 0;
    const boost = clamp(accuracyStage - evasionStage, -6, 6);
    if (boost > 0) accuracy = Math.floor((accuracy * (3 + boost)) / 3);
    else if (boost < 0) accuracy = Math.floor((accuracy * 3) / (3 - boost));
    return accuracy;
}

// Rolls the accuracy check: true if the move connects.
export function rollAccuracy(attacker, defender, move, field = null) {
    const chance = hitChance(attacker, defender, move, field);
    return chance === null || Math.floor(Math.random() * 100) < chance;
}
