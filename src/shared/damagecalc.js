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
import { weatherOf, weatherDamageMod, powerFieldMod } from "./field";
import {
    abilityAttackMod,
    abilityBasePowerMod,
    abilityDamageMod,
    abilityDefenseMod,
    abilityCritMultiplier,
    isWonderGuard,
    abilityStabMultiplier,
    absorbsMove,
    ignoresBoosts,
    ignoresBurnDrop,
    isGroundImmune,
    ignoresGhostImmunity,
} from "./abilities";

export function typeEffectiveness(move, defender, attacker = null) {
    // Status moves aren't affected by the type chart (Trick vs Dark, Hypnosis vs Dark,
    // Will-O-Wisp vs Water all work), except the handful Showdown marks
    // ignoreImmunity: false (Thunder Wave vs Ground).
    if (
        move.damage_class &&
        move.damage_class.name === "status" &&
        !STATUS_TYPE_BLOCKED_MOVES.has(move.name)
    )
        return 1;
    if (move.name === "struggle") return 1; // typeless: never resisted, never immune
    // Levitate: Ground moves don't touch it (unless the attacker has Mold Breaker)
    if (move.type.name === "ground" && isGroundImmune(defender, attacker)) return 0;
    if (
        move.type.name === "ground" &&
        defender.item &&
        defender.item.name === AIR_BALLOON
    )
        return 0; // Air Balloon grounds immunity, popped separately once the holder is hit by anything else
    let TE = PogeyData.getMoveResult(move, defender);
    // Scrappy: Normal/Fighting moves can hit Ghost types after all
    if (TE === 0 && attacker && ignoresGhostImmunity(attacker, move) && defender.types.some((t) => t.type.name === "ghost")) {
        const rest = defender.types.filter((t) => t.type.name !== "ghost");
        TE = rest.length > 0 ? PogeyData.getMoveResult(move, { ...defender, types: rest }) : 1;
    }
    if (
        move.name === "freeze-dry" &&
        defender.types.filter((t) => t.type.name === "water").length > 0
    )
        TE = TE * 4; // Freeze-dry vs water type
    // Wonder Guard: anything that isn't super effective bounces off
    if (TE !== 0 && TE <= 1 && isWonderGuard(defender, attacker)) return 0;
    return TE;
}

// ctx.crit: this hit is a critical hit. ctx.field: the battle's weather/terrain, if any.
export function damageCalc(attacker, defender, move, ctx = {}) {
    if (move.damage_class.name === "status") return 0; // status moves never deal damage
    const { crit = false, field = null } = ctx;
    let type = typeEffectiveness(move, defender, attacker);
    if (absorbsMove(defender, attacker, move)) return 0; // Water Absorb & co. take it instead
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
    // A critical hit ignores the attacker's Attack drops and the defender's Defense boosts
    if (crit) {
        attack_level = Math.max(attack_level, 0);
        defense_level = Math.min(defense_level, 0);
    }
    // Unaware ignores the other side's stat stages
    if (ignoresBoosts(attacker)) defense_level = 0;
    if (ignoresBoosts(defender, attacker)) attack_level = 0;

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
    attack = Math.floor(attack * abilityAttackMod(attacker, defender, move, category, field)); // e.g. Stakeout

    // Sandstorm gives Rock types x1.5 Sp. Def, Snow gives Ice types x1.5 Def (the stat the
    // move actually targets: Psyshock & co. hit the Defense stat even though they're special)
    const targetsDefense = category === "physical" || move.name === "psyshock" || move.name === "psystrike" || move.name === "secret-sword";
    defense = Math.floor(defense * abilityDefenseMod(attacker, defender, move, targetsDefense ? "physical" : "special", field)); // Fur Coat, Ruin abilities...
    const defenderTypes = defender.types.map((t) => t.type.name);
    if (weatherOf(field) === "sand" && !targetsDefense && defenderTypes.includes("rock")) defense = Math.floor(defense * 1.5);
    if (weatherOf(field) === "snow" && targetsDefense && defenderTypes.includes("ice")) defense = Math.floor(defense * 1.5);

    // Burn: halves the attack stat used by physical moves
    if (attacker.status && attacker.status.name === "burn" && category === "physical" && !ignoresBurnDrop(attacker))
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

    power *= powerFieldMod(move, attacker, defender, field);
    power *= abilityBasePowerMod(attacker, defender, move, field);
    power *= move.abilityPowerMod || 1; // Pixilate & co. already changed the move's type

    let STAB = calculateSTAB(attacker, move) ? abilityStabMultiplier(attacker) : 1;
    let damage = (42 * power * (attack / defense)) / 50 + 2;
    damage = Math.floor(damage * weatherDamageMod(move, field));
    damage = Math.floor(damage * abilityDamageMod(attacker, defender, move, type, field));
    if (crit) damage = Math.floor(damage * abilityCritMultiplier(attacker));
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
