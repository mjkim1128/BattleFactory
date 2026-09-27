import { makeMove } from "./computermove";
import { damageCalc, statCalc, typeEffectiveness } from "./damagecalc";
import {
    moveNameToString,
    pokemonNameToString,
    statNameToString,
} from "./helpers";
import {
    RESIST_BERRIES,
    STAT_BOOST_BERRIES,
    HP_HEAL_BERRIES,
    BERRY_JUICE,
    CUSTAP_BERRY,
    KEE_BERRY,
    WHITE_HERB,
    WEAKNESS_POLICY,
    AIR_BALLOON,
    FOCUS_SASH,
    LIFE_ORB,
    BLACK_SLUDGE,
    LEFTOVERS,
    COVERT_CLOAK,
    METRONOME_ITEM,
    CHOICE_ITEMS,
    UNREMOVABLE_ITEMS,
} from "./iteminfo";

function hasCustapBoost(pokemon) {
    return (
        pokemon.item &&
        pokemon.item.name === CUSTAP_BERRY &&
        pokemon.hp[0] / pokemon.hp[1] <= 0.25
    );
}

// Consuming an item (eating a berry, popping a balloon, etc.) stashes it as the pokemon's
// "last consumed item" instead of just discarding it, so Recycle can restore it later.
function consumeItem(pokemon) {
    pokemon.consumedItem = pokemon.item;
    pokemon.item = null;
}

function isRemovable(item) {
    return item && !UNREMOVABLE_ITEMS.has(item.name);
}

// Applies a berry's "eaten" effect immediately (used by Bug Bite/Pluck stealing the
// defender's berry), without the HP-fraction gating tryConsumeHpTriggeredItem uses for
// a berry reacting to its own holder's HP dropping. Takes the berry object directly
// rather than reading pokemon.item, since the eater usually never held this berry.
function applyBerryEffect(pokemon, berry, text) {
    const name = berry.name;
    const label = berry.korean_name || berry.name;
    let healAmount = 0;
    if (name === BERRY_JUICE) healAmount = 20;
    else if (name === "sitrus-berry") healAmount = Math.floor(pokemon.hp[1] / 4);
    else if (HP_HEAL_BERRIES.has(name)) healAmount = Math.floor(pokemon.hp[1] / 3);
    if (healAmount > 0 && pokemon.hp[0] < pokemon.hp[1]) {
        pokemon.hp[0] = Math.min(pokemon.hp[1], pokemon.hp[0] + healAmount);
        text.push(pokemonNameToString(pokemon) + " ate the " + label + " and restored HP!");
        return;
    }
    const statIndex = STAT_BOOST_BERRIES[name];
    if (statIndex !== undefined) {
        addArrayToArray(text, doStatChangesRaw(pokemon, [{ statIndex, change: 1 }]));
    }
}

export function doTurn(playerPokemon, opponentPokemon, move) {
    let cpuMove = makeMove(playerPokemon, opponentPokemon);
    let playerPriority = move.priority + (hasCustapBoost(playerPokemon[0]) ? 1 : 0);
    let cpuPriority = cpuMove.priority + (hasCustapBoost(opponentPokemon[0]) ? 1 : 0);
    let movefirst = playerPriority > cpuPriority ? true : false;
    if (playerPriority === cpuPriority) {
        movefirst =
            statCalc(
                playerPokemon[0].base_stats[5],
                playerPokemon[0].stat_levels[4]
            ) >
            statCalc(
                opponentPokemon[0].base_stats[5],
                opponentPokemon[0].stat_levels[4]
            )
                ? true
                : false;
    }
    let text = [];
    if (movefirst) {
        if (hasCustapBoost(playerPokemon[0])) consumeItem(playerPokemon[0]);
        text = addArrayToArray(
            text,
            playerTurn(playerPokemon, opponentPokemon, move)
        );
        if (opponentPokemon[0].hp[0] <= 0) return text;
        if (hasCustapBoost(opponentPokemon[0])) consumeItem(opponentPokemon[0]);
        text = addArrayToArray(
            text,
            playerTurn(opponentPokemon, playerPokemon, cpuMove)
        );
    } else {
        if (hasCustapBoost(opponentPokemon[0])) consumeItem(opponentPokemon[0]);
        text = addArrayToArray(
            text,
            playerTurn(opponentPokemon, playerPokemon, cpuMove)
        );
        if (playerPokemon[0].hp[0] <= 0) return text;
        if (hasCustapBoost(playerPokemon[0])) consumeItem(playerPokemon[0]);
        text = addArrayToArray(
            text,
            playerTurn(playerPokemon, opponentPokemon, move)
        );
    }
    text = addArrayToArray(text, doEndOfTurn(playerPokemon[0]));
    text = addArrayToArray(text, doEndOfTurn(opponentPokemon[0]));
    return text;
}

export function playerTurn(playerPokemon, opponentPokemon, move) {
    let text = [];
    /// Move is switch
    if (move.priority === 6) text.push(doSwitch(playerPokemon, move.index));
    /// Move is attack
    else {
        const attacker = playerPokemon[0];
        text = addArrayToArray(
            text,
            turnText(attacker, opponentPokemon[0], move)
        );
        if (typeEffectiveness(move, opponentPokemon[0]) !== 0) {
            text = addArrayToArray(
                text,
                doAttack(attacker, opponentPokemon[0], move)
            );
            trackMetronome(attacker, move);
            if (attacker.item && CHOICE_ITEMS[attacker.item.name] !== undefined)
                attacker.lockedMove = move.name;
            /// temporary fix for moves giving me errors
            if (move.meta !== undefined)
                text = addArrayToArray(
                    text,
                    doMoveEffects(attacker, opponentPokemon[0], move)
                );
        }
    }
    return text;
}

function trackMetronome(attacker, move) {
    if (!attacker.item || attacker.item.name !== METRONOME_ITEM) return;
    if (attacker.lastMoveName === move.name) {
        attacker.moveRepeatCount = Math.min((attacker.moveRepeatCount || 1) + 1, 6);
    } else {
        attacker.lastMoveName = move.name;
        attacker.moveRepeatCount = 1;
    }
}

export function turnText(attacker, defender, move) {
    let text = [
        pokemonNameToString(attacker) +
            " used " +
            moveNameToString(move) +
            "!",
    ];
    if (defender.hp[0] <= 0) {
        // attempt to stop turn when mon dies to recoil
        text.push("But it failed!");
        return text;
    }
    if (typeEffectiveness(move, defender) === 0) {
        text.push(
            "It doesnt't affect " + pokemonNameToString(defender) + "!"
        );
    }
    if (
        typeEffectiveness(move, defender) > 0 &&
        typeEffectiveness(move, defender) !== 1
    ) {
        let t =
            typeEffectiveness(move, defender) > 1
                ? " It's super effective!"
                : " It's not very effective...";
        text[0] = text[0] + t;
    }
    return text;
}

export function addArrayToArray(arr1, arr2) {
    for (const elem of arr2) {
        arr1.push(elem);
    }
    return arr1;
}

function itemLabel(pokemon) {
    return pokemon.item ? pokemon.item.korean_name || pokemon.item.name : "";
}

function healPercent(pokemon, amount, verb) {
    if (amount <= 0) return null;
    pokemon.hp[0] = Math.min(pokemon.hp[1], pokemon.hp[0] + amount);
    return (
        pokemonNameToString(pokemon) +
        (verb || " healed some HP using its ") +
        itemLabel(pokemon) +
        "!"
    );
}

// Berries/items that react to the holder's own HP after it changes (own HP threshold
// heals and stat boosts). Consumed on use.
function tryConsumeHpTriggeredItem(pokemon, text) {
    if (!pokemon.item || pokemon.hp[0] <= 0) return;
    const name = pokemon.item.name;
    const fraction = pokemon.hp[0] / pokemon.hp[1];

    if (name === BERRY_JUICE && fraction < 0.5) {
        const msg = healPercent(pokemon, 20, " restored 20 HP using its ");
        if (msg) text.push(msg);
        consumeItem(pokemon);
        return;
    }
    if (name === "sitrus-berry" && fraction <= 0.5) {
        const msg = healPercent(pokemon, Math.floor(pokemon.hp[1] / 4), " ate its ");
        if (msg) text.push(msg + " and restored HP!");
        consumeItem(pokemon);
        return;
    }
    if (HP_HEAL_BERRIES.has(name) && name !== "sitrus-berry" && fraction <= 0.25) {
        const msg = healPercent(pokemon, Math.floor(pokemon.hp[1] / 3), " ate its ");
        if (msg) text.push(msg + " and restored HP!");
        consumeItem(pokemon);
        return;
    }
    const statIndex = STAT_BOOST_BERRIES[name];
    if (statIndex !== undefined && fraction <= 0.25) {
        addArrayToArray(
            text,
            doStatChangesRaw(pokemon, [{ statIndex, change: 1 }])
        );
        text.push(pokemonNameToString(pokemon) + " ate its " + itemLabel(pokemon) + "!");
        consumeItem(pokemon);
    }
}

// Item-swap/removal moves that either don't deal damage at all, or whose only extra
// effect (beyond normal damage) is on the target's item. Handled up front so the rest
// of doAttack's damage pipeline only runs for the moves that still need it.
function tryItemMove(attacker, defender, move, text) {
    if (move.name === "trick" || move.name === "switcheroo") {
        if (
            (attacker.item && !isRemovable(attacker.item)) ||
            (defender.item && !isRemovable(defender.item))
        ) {
            text.push("But it failed!"); // an unremovable item (e.g. Soul Dew) can't be swapped
            return true;
        }
        const temp = attacker.item;
        attacker.item = defender.item;
        defender.item = temp;
        text.push(
            pokemonNameToString(attacker) + " switched items with " + pokemonNameToString(defender) + " using " + moveNameToString(move) + "!"
        );
        return true;
    }
    if (move.name === "corrosive-gas") {
        if (isRemovable(defender.item)) {
            text.push(pokemonNameToString(defender) + "'s " + itemLabel(defender) + " was destroyed!");
            consumeItem(defender);
        } else {
            text.push("But it failed!");
        }
        return true;
    }
    if (move.name === "bestow") {
        if (!defender.item && attacker.item) {
            text.push(pokemonNameToString(attacker) + " gave its " + itemLabel(attacker) + " to " + pokemonNameToString(defender) + "!");
            defender.item = attacker.item;
            attacker.item = null;
        } else {
            text.push("But it failed!");
        }
        return true;
    }
    if (move.name === "recycle") {
        if (!attacker.item && attacker.consumedItem) {
            text.push(pokemonNameToString(attacker) + " recycled its " + (attacker.consumedItem.korean_name || attacker.consumedItem.name) + "!");
            attacker.item = attacker.consumedItem;
            attacker.consumedItem = null;
        } else {
            text.push("But it failed!");
        }
        return true;
    }
    return false;
}

export function doAttack(attacker, defender, move) {
    let text = [];
    if (defender.hp[0] <= 0) return text; // attempt to stop turn when mon dies to recoil

    // Non-damaging item-swap/removal moves (Trick, Switcheroo, Corrosive Gas, Bestow, Recycle)
    if (tryItemMove(attacker, defender, move, text)) return text;

    // Poltergeist: fails outright if the target has no item
    if (move.name === "poltergeist" && !defender.item) {
        text.push("But it failed!");
        return text;
    }
    // Fling: fails if the attacker has nothing to throw
    if (move.name === "fling" && !attacker.item) {
        text.push("But it failed!");
        return text;
    }

    let damage = damageCalc(attacker, defender, move);
    const typeEff = typeEffectiveness(move, defender);

    // Resist berry: halves a super-effective hit of the matching type, then is eaten
    if (
        defender.item &&
        RESIST_BERRIES[defender.item.name] === move.type.name &&
        typeEff > 1
    ) {
        damage = Math.floor(damage / 2);
        text.push(
            pokemonNameToString(defender) +
                "'s " +
                itemLabel(defender) +
                " weakened the hit!"
        );
        consumeItem(defender);
    }

    // Focus Sash: survive a would-be KO from full HP with 1 HP, then is consumed
    let sashSaved = false;
    if (
        defender.item &&
        defender.item.name === FOCUS_SASH &&
        defender.hp[0] === defender.hp[1] &&
        damage >= defender.hp[0]
    ) {
        damage = defender.hp[0] - 1;
        sashSaved = true;
    }

    let damage_number = 0; /// changed to 0 from null
    [defender.hp[0], damage_number] =
        defender.hp[0] - damage > 0
            ? [defender.hp[0] - damage, damage]
            : [0, defender.hp[0]];
    text.push(
        pokemonNameToString(defender) +
            " lost " +
            Math.round((damage_number / defender.hp[1]) * 1000) / 10 +
            "% HP!"
    );
    if (sashSaved) {
        text.push(
            pokemonNameToString(defender) + " hung on using its " + itemLabel(defender) + "!"
        );
        consumeItem(defender);
    }

    // Air Balloon: pops the moment the holder takes any damage (ground hits never reach here, see typeEffectiveness)
    if (defender.item && defender.item.name === AIR_BALLOON && damage_number > 0) {
        text.push(pokemonNameToString(defender) + "'s Balloon popped!");
        consumeItem(defender);
    }

    // Weakness Policy: +2 Atk/SpA when hit by a super-effective move
    if (
        defender.item &&
        defender.item.name === WEAKNESS_POLICY &&
        typeEff > 1 &&
        defender.hp[0] > 0
    ) {
        addArrayToArray(
            text,
            doStatChangesRaw(defender, [
                { statIndex: 0, change: 2 },
                { statIndex: 2, change: 2 },
            ])
        );
        consumeItem(defender);
    }

    // Kee Berry: +1 Defense when hit by a physical move
    if (
        defender.item &&
        defender.item.name === KEE_BERRY &&
        move.damage_class.name === "physical" &&
        defender.hp[0] > 0
    ) {
        addArrayToArray(text, doStatChangesRaw(defender, [{ statIndex: 1, change: 1 }]));
        consumeItem(defender);
    }

    // Knock Off: knocks the defender's item away after the hit (unless it's unremovable)
    if (move.name === "knock-off" && isRemovable(defender.item) && damage_number > 0) {
        text.push(pokemonNameToString(defender) + " lost its " + itemLabel(defender) + "!");
        consumeItem(defender);
    }

    // Thief: steals the defender's item if the attacker isn't already holding one
    if (
        move.name === "thief" &&
        !attacker.item &&
        isRemovable(defender.item) &&
        damage_number > 0
    ) {
        text.push(
            pokemonNameToString(attacker) + " stole " + pokemonNameToString(defender) + "'s " + itemLabel(defender) + "!"
        );
        attacker.item = defender.item;
        defender.item = null;
    }

    // Incinerate: burns up the defender's Berry after the hit (no effect triggers, it's just gone)
    if (
        move.name === "incinerate" &&
        defender.item &&
        defender.item.name.endsWith("-berry") &&
        damage_number > 0
    ) {
        text.push(pokemonNameToString(defender) + "'s " + itemLabel(defender) + " was burnt up!");
        consumeItem(defender);
    }

    // Bug Bite / Pluck: eats the defender's Berry immediately for its effect
    if (
        (move.name === "bug-bite" || move.name === "pluck") &&
        defender.item &&
        defender.item.name.endsWith("-berry") &&
        damage_number > 0 &&
        attacker.hp[0] > 0
    ) {
        const stolenBerry = defender.item;
        text.push(
            pokemonNameToString(attacker) + " stole and ate " + pokemonNameToString(defender) + "'s " + itemLabel(defender) + "!"
        );
        consumeItem(defender);
        applyBerryEffect(attacker, stolenBerry, text);
    }

    if (
        attacker.hp[0] < attacker.hp[1] &&
        move.meta &&
        move.meta.drain > 0
    ) {
        // Drain hp (giga-drain, drain-punch)
        let hpNumber = 0;
        [hpNumber, attacker.hp[0]] =
            attacker.hp[0] +
                Math.floor(damage_number * (Math.abs(move.meta.drain) / 100)) >
            attacker.hp[1]
                ? [attacker.hp[1] - attacker.hp[0], attacker.hp[1]]
                : [
                      Math.floor(
                          damage_number * (Math.abs(move.meta.drain) / 100)
                      ),
                      attacker.hp[0] +
                          Math.floor(
                              (damage_number * Math.abs(move.meta.drain)) / 100
                          ),
                  ];
        if (attacker.hp[0] > attacker.hp[1]) attacker.hp[0] = attacker.hp[1];
        if (hpNumber === 0) {
            hpNumber = 1;
            attacker.hp[0] = attacker.hp[0] + hpNumber;
        }
        text.push(
            pokemonNameToString(attacker) +
                " healed " +
                Math.round((hpNumber / attacker.hp[1]) * 1000) / 10 +
                "% HP!"
        );
    } else if (move.meta && move.meta.drain < 0) {
        // Recoil
        let hpNumber = 0;
        [hpNumber, attacker.hp[0]] =
            attacker.hp[0] -
                Math.floor(damage_number * (Math.abs(move.meta.drain) / 100)) <=
            0
                ? [attacker.hp[0], 0]
                : [
                      Math.floor(
                          damage_number * (Math.abs(move.meta.drain) / 100)
                      ),
                      attacker.hp[0] -
                          Math.floor(
                              damage_number * (Math.abs(move.meta.drain) / 100)
                          ),
                  ];
        if (hpNumber === 0) {
            hpNumber = 1;
            attacker.hp[0] = attacker.hp[0] - hpNumber;
        }
        text.push(
            pokemonNameToString(attacker) +
                " lost " +
                Math.round((hpNumber / attacker.hp[1]) * 1000) / 10 +
                "% HP to recoil!"
        );
    } else if (move.name === "explosion" || move.name === "self-destruct") {
        attacker.hp[0] = 0;
        text.push(pokemonNameToString(attacker) + " blew up!");
    }

    // Life Orb: 1/10 max HP recoil on the attacker whenever it deals damage
    if (
        attacker.hp[0] > 0 &&
        damage_number > 0 &&
        attacker.item &&
        attacker.item.name === LIFE_ORB
    ) {
        attacker.hp[0] = Math.max(0, attacker.hp[0] - Math.floor(attacker.hp[1] / 10));
        text.push(pokemonNameToString(attacker) + " was hurt by its Life Orb!");
    }

    // Fling: whatever was thrown is gone after use
    if (move.name === "fling" && attacker.item) consumeItem(attacker);

    if (defender.hp[0] === 0) {
        text.push(pokemonNameToString(defender) + " fainted!");
    }
    if (attacker.hp[0] === 0) {
        text.push(pokemonNameToString(attacker) + " fainted!");
    }

    if (defender.hp[0] > 0) tryConsumeHpTriggeredItem(defender, text);
    if (attacker.hp[0] > 0) tryConsumeHpTriggeredItem(attacker, text);

    return text;
}

export function doSwitch(pokemon, index) {
    let oldCurrent = pokemon[0];
    resetStatChanges(oldCurrent); // Reset stat changes on switch out
    oldCurrent.lockedMove = null;
    let text = "";
    if (oldCurrent.hp[0] > 0)
        text = "Switch out " + pokemonNameToString(oldCurrent) + "! ";
    pokemon[0] = pokemon[index];
    pokemon[index] = oldCurrent;
    pokemon[0].lockedMove = null;
    text = text + "Switch in " + pokemonNameToString(pokemon[0]) + "!";
    resetStatChanges(pokemon); // Reset stat changes on switch in
    return text;
}

export function doMoveEffects(attacker, defender, move) {
    let text = [];
    if (
        attacker.hp[0] > 0 &&
        move.meta &&
        move.meta.stat_chance === 100 &&
        move.meta.category.name === "damage+raise"
    ) {
        addArrayToArray(text, doStatChanges(attacker, move));
    }
    if (
        defender.hp[0] > 0 &&
        move.meta &&
        move.meta.stat_chance === 100 &&
        move.meta.category.name === "damage+lower"
    ) {
        if (defender.item && defender.item.name === COVERT_CLOAK) {
            text.push(
                pokemonNameToString(defender) +
                    "'s Covert Cloak protected it from the effect!"
            );
        } else {
            addArrayToArray(text, doStatChanges(defender, move));
        }
    }
    tryConsumeWhiteHerb(attacker, text);
    tryConsumeWhiteHerb(defender, text);
    return text;
}

function tryConsumeWhiteHerb(pokemon, text) {
    if (!pokemon.item || pokemon.item.name !== WHITE_HERB) return;
    if (pokemon.stat_levels.some((level) => level < 0)) {
        pokemon.stat_levels = pokemon.stat_levels.map((level) => Math.max(level, 0));
        text.push(pokemonNameToString(pokemon) + " restored its stats using its White Herb!");
        consumeItem(pokemon);
    }
}

const STAT_NAMES = ["attack", "defense", "special-attack", "special-defense", "speed"];

// Applies stat stage changes described as {statIndex, change} pairs (used by items,
// which don't come with a move's stat_changes array to read from).
function doStatChangesRaw(pokemon, changes) {
    return doStatChanges(pokemon, {
        stat_changes: changes.map(({ statIndex, change }) => ({
            stat: { name: STAT_NAMES[statIndex] },
            change,
        })),
    });
}

export function doStatChanges(pokemon, move) {
    let texts = [];
    const stat_names = STAT_NAMES;
    for (const stat of move.stat_changes) {
        let text = "";
        const stat_index = stat_names.indexOf(stat.stat.name);
        pokemon.stat_levels[stat_index] =
            pokemon.stat_levels[stat_index] + stat.change;
        let change = stat.change < 0 ? " lowered!" : " raised!";
        text =
            pokemonNameToString(pokemon) +
            " had it's " +
            statNameToString(stat_names[stat_index]) +
            change;
        if (pokemon.stat_levels[stat_index] < -6) {
            pokemon.stat_levels[stat_index] = -6;
            text =
                pokemonNameToString(pokemon) +
                "'s " +
                statNameToString(stat_names[stat_index]) +
                " can't go lower!";
        } else if (pokemon.stat_levels[stat_index] > 6) {
            pokemon.stat_levels[stat_index] = 6;
            text =
                pokemonNameToString(pokemon) +
                "'s " +
                statNameToString(stat_names[stat_index]) +
                " can't go higher!";
        }
        texts.push(text);
    }
    return texts;
}

export function resetStatChanges(pokemon) {
    pokemon.stat_changes = Array(5).fill(0);
}

function doEndOfTurn(pokemon) {
    let text = [];
    if (pokemon.hp[0] <= 0 || !pokemon.item) return text;
    if (pokemon.item.name === LEFTOVERS) {
        const msg = healPercent(pokemon, Math.floor(pokemon.hp[1] / 16), " restored a little HP using its ");
        if (msg) text.push(msg);
    } else if (pokemon.item.name === BLACK_SLUDGE) {
        const isPoison = pokemon.types.some((t) => t.type.name === "poison");
        if (isPoison) {
            const msg = healPercent(pokemon, Math.floor(pokemon.hp[1] / 16), " restored a little HP using its ");
            if (msg) text.push(msg);
        } else {
            pokemon.hp[0] = Math.max(0, pokemon.hp[0] - Math.floor(pokemon.hp[1] / 8));
            text.push(pokemonNameToString(pokemon) + " was hurt by its Black Sludge!");
            if (pokemon.hp[0] === 0) text.push(pokemonNameToString(pokemon) + " fainted!");
        }
    }
    if (pokemon.hp[0] > 0) tryConsumeHpTriggeredItem(pokemon, text);
    return text;
}
