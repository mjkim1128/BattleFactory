import { makeMove } from "./computermove";
import { damageCalc, statCalc, typeEffectiveness } from "./damagecalc";
import {
    moveNameToString,
    pokemonNameToString,
    statNameToString,
} from "./helpers";

export function doTurn(playerPokemon, opponentPokemon, move) {
    let cpuMove = makeMove(playerPokemon, opponentPokemon);
    let movefirst = move.priority > cpuMove.priority ? true : false;
    if (move.priority === cpuMove.priority) {
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
        text = addArrayToArray(
            text,
            playerTurn(playerPokemon, opponentPokemon, move)
        );
        if (opponentPokemon[0].hp[0] <= 0) return text;
        text = addArrayToArray(
            text,
            playerTurn(opponentPokemon, playerPokemon, cpuMove)
        );
    } else {
        text = addArrayToArray(
            text,
            playerTurn(opponentPokemon, playerPokemon, cpuMove)
        );
        if (playerPokemon[0].hp[0] <= 0) return text;
        text = addArrayToArray(
            text,
            playerTurn(playerPokemon, opponentPokemon, move)
        );
    }
    return text;
}

export function playerTurn(playerPokemon, opponentPokemon, move) {
    let text = [];
    /// Move is switch
    if (move.priority === 6) text.push(doSwitch(playerPokemon, move.index));
    /// Move is attack
    else {
        text = addArrayToArray(
            text,
            turnText(playerPokemon[0], opponentPokemon[0], move)
        );
        if (typeEffectiveness(move, opponentPokemon[0]) !== 0) {
            text = addArrayToArray(
                text,
                doAttack(playerPokemon[0], opponentPokemon[0], move)
            );
            /// temporary fix for moves giving me errors
            if (move.meta !== undefined)
                text = addArrayToArray(
                    text,
                    doMoveEffects(playerPokemon[0], opponentPokemon[0], move)
                );
        }
    }
    return text;
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

export function doAttack(attacker, defender, move) {
    let text = [];
    if (defender.hp[0] <= 0) return text; // attempt to stop turn when mon dies to recoil
    let damage = damageCalc(attacker, defender, move);
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
    if (defender.hp[0] === 0) {
        text.push(pokemonNameToString(defender) + " fainted!");
    }
    if (attacker.hp[0] === 0) {
        text.push(pokemonNameToString(attacker) + " fainted!");
    }
    return text;
}

export function doSwitch(pokemon, index) {
    let oldCurrent = pokemon[0];
    resetStatChanges(oldCurrent); // Reset stat changes on switch out
    let text = "";
    if (oldCurrent.hp[0] > 0)
        text = "Switch out " + pokemonNameToString(oldCurrent) + "! ";
    pokemon[0] = pokemon[index];
    pokemon[index] = oldCurrent;
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
        addArrayToArray(text, doStatChanges(defender, move));
    }
    return text;
}

export function doStatChanges(pokemon, move) {
    let texts = [];
    const stat_names = [
        "attack",
        "defense",
        "special-attack",
        "special-defense",
        "speed",
    ];
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
