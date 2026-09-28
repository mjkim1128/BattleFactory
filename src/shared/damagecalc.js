import { PogeyData } from "./pogey";
import {
    TYPE_BOOST_ITEMS,
    CHOICE_ITEMS,
    EVIOLITE,
    EXPERT_BELT,
    MUSCLE_BAND,
    LIFE_ORB,
    AIR_BALLOON,
    METRONOME_ITEM,
    UNREMOVABLE_ITEMS,
    getFlingPower,
} from "./iteminfo";
import { STATUS_TYPE_BLOCKED_MOVES } from "./movemechanics";

export function typeEffectiveness(move, defender) {
    // Status moves aren't affected by the type chart (Trick vs Dark, Hypnosis vs Dark,
    // Will-O-Wisp vs Water all work), except the handful Showdown marks
    // ignoreImmunity: false (Thunder Wave vs Ground).
    if (
        move.damage_class &&
        move.damage_class.name === "status" &&
        !STATUS_TYPE_BLOCKED_MOVES.has(move.name)
    )
        return 1;
    if (
        move.type.name === "ground" &&
        defender.item &&
        defender.item.name === AIR_BALLOON
    )
        return 0; // Air Balloon grounds immunity, popped separately once the holder is hit by anything else
    let TE = PogeyData.getMoveResult(move, defender);
    if (
        move.name === "freeze-dry" &&
        defender.types.filter((t) => t.type.name === "water").length > 0
    )
        TE = TE * 4; // Freeze-dry vs water type
    return TE;
}

export function damageCalc(attacker, defender, move) {
    if (move.damage_class.name === "status") return 0; // status moves never deal damage
    let type = typeEffectiveness(move, defender);
    let category = move.damage_class.name;
    let [attack, defense] =
        category === "physical"
            ? [attacker.base_stats[1], defender.base_stats[2]]
            : [attacker.base_stats[3], defender.base_stats[4]];
    let [attack_level, defense_level] =
        category === "physical"
            ? [attacker.stat_levels[0], defender.stat_levels[1]]
            : [attacker.stat_levels[2], defender.stat_levels[3]];
    if (move.name === "psyshock") [defense, defense_level] = [defender.base_stats[2], defender.stat_levels[1]]; // Psyshock
    if (move.name === "body-press") [attack, attack_level] = [attacker.base_stats[2], attacker.stat_levels[1]]; // Body-press
    if (move.name === "foul-play") [attack, attack_level] = [defender.base_stats[1], defender.stat_levels[0]]; // Foul-play

    // Choice Band/Specs: 1.5x the stat that matches this move's category
    const choiceStatIndex = attacker.item && CHOICE_ITEMS[attacker.item.name];
    if (
        (choiceStatIndex === 1 && category === "physical") ||
        (choiceStatIndex === 3 && category === "special")
    )
        attack = Math.floor(attack * 1.5);
    // Eviolite: 1.5x both defenses
    if (defender.item && defender.item.name === EVIOLITE)
        defense = Math.floor(defense * 1.5);

    attack = statCalc(attack, attack_level);
    defense = statCalc(defense, defense_level);

    // Burn: halves the attack stat used by physical moves
    if (attacker.status && attacker.status.name === "burn" && category === "physical")
        attack = Math.floor(attack / 2);

    let power = move.priority < 0 ? move.power * 2 : move.power; // Double power of negative priority moves

    // Fling: power comes from whatever the attacker is holding, not the move's own base power
    if (move.name === "fling" && attacker.item) power = getFlingPower(attacker.item.name);
    // Knock Off: 1.5x if the defender holds an item that can actually be knocked off
    if (move.name === "knock-off" && defender.item && !UNREMOVABLE_ITEMS.has(defender.item.name))
        power *= 1.5;

    if (attacker.item) {
        const boostedType = TYPE_BOOST_ITEMS[attacker.item.name];
        if (boostedType && move.type.name === boostedType) power *= 1.2;
        if (attacker.item.name === EXPERT_BELT && type > 1) power *= 1.2;
        if (attacker.item.name === MUSCLE_BAND && category === "physical") power *= 1.1;
        if (attacker.item.name === LIFE_ORB) power *= 1.3;
        if (attacker.item.name === METRONOME_ITEM)
            power *= 1 + 0.2 * Math.min((attacker.moveRepeatCount || 1) - 1, 5);
    }

    let STAB = calculateSTAB(attacker, move) ? 1.5 : 1;
    let damage = (42 * power * (attack / defense)) / 50 + 2;
    damage = Math.floor(damage * STAB * type);
    return damage;
}

export function hpCalc(stat, iv = 31, ev = 0) {
    let result = 2 * stat + iv + ev / 4 + 110;
    return Math.floor(result);
}

export function statCalc(stat, stat_level=0, iv = 31, ev = 0, nature = 1) {
    let result = (2 * stat + iv + ev / 4 + 5) * nature;
    if (stat_level !== 0 ) {
        let [n, d] = stat_level < 0 ? [2, 2 + Math.abs(stat_level)] : [stat_level + 2, 2];
        result = result * (n / d);
    }
    return Math.floor(result);
}

export function calculateSTAB(pokemon, move) {
    if (pokemon.types[0].type.name === move.type.name) return true;
    if (
        pokemon.types.length > 1 &&
        pokemon.types[1].type.name === move.type.name
    )
        return true;
    return false;
}
