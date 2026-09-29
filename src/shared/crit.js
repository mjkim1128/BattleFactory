import { ALWAYS_CRIT_MOVES } from "./movemechanics";
import { SCOPE_LENS } from "./iteminfo";
import { activeItem } from "./helditem";
import { critImmune, critStageBonus } from "./abilities";

// Critical hits (Showdown, gen 7+ rules). The crit "stage" starts at the move's own crit
// rate (PokeAPI meta.crit_rate: 0 normal, 1 for Slash/Stone Edge...) plus bonuses, and
// picks the chance: stage 0 = 1/24, 1 = 1/8, 2 = 1/2, 3+ = always.
const CRIT_DENOMINATOR = [24, 8, 2, 1];

export function critStage(attacker, move) {
    let stage = (move.meta && move.meta.crit_rate) || 0;
    if (attacker.focusEnergy) stage += 2; // Focus Energy
    if (attacker.laserFocus) stage += 3; // Laser Focus: guarantees a crit
    if (activeItem(attacker) && attacker.item.name === SCOPE_LENS) stage += 1;
    stage += critStageBonus(attacker); // Super Luck
    return stage;
}

export function critChanceDenominator(attacker, move) {
    if (ALWAYS_CRIT_MOVES.has(move.name)) return 1;
    return CRIT_DENOMINATOR[Math.min(critStage(attacker, move), 3)];
}

// Rolls for a critical hit against `defender`. (`defender` is there for abilities that
// make a pokemon immune to crits.)
export function rollCrit(attacker, defender, move) {
    if (move.damage_class.name === "status") return false;
    if (defender && (defender.critImmune || critImmune(defender, attacker))) return false; // Battle Armor / Shell Armor
    const denominator = critChanceDenominator(attacker, move);
    return denominator === 1 || Math.floor(Math.random() * denominator) === 0;
}
