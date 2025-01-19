import { PogeyData } from "./pogey";
import { getPokemonById, getMoveByName } from "./processjson";
//import pokedex from "shared/thirdgenpokedex";
import pokedex from 'shared/pokedex_data.json';  // JSON 파일을 가져오는 방식

import { shuffle } from "shared";
import { DEFAULT_MOVES } from "./legalmoves";

console.log(pokedex);

export function generateRandomPokemon(pokemonTeam) {
    let choices = [...pokedex];
    choices = shuffle(choices);
    // make sure unique pokemon
    for (const poke of choices) {
        if (pokemonTeam.filter((mon) => mon.name === poke.name).length > 0)
            continue;
        return getPokemonById(poke.id - 1);
    }
}

export function generateRandomPokemonId() {
    return Math.floor(Math.random() * 905);
}

export function getPokemonName(data) {
    return data["forms"][0]["name"];
}

export function getPokemonStats(data) {
    let temp = Array(6).fill(null);
    for (let i = 0; i < 6; i++) {
        temp[i] = parseInt(data["stats"][i]["base_stat"]);
    }
    temp = baseStatTotalTo600(temp);
    return temp;
}

export function getPokemonMoves(data) {
    let temp = Array(4).fill(null);
    for (let i = 0; i < 4; i++) {
        let j = Math.floor(Math.random() * data["moves"]["length"]);
        temp[i] = data["moves"][j]["move"]["name"];
    }
    return temp;
}

export function getPokemonImg(pokemonId) {
    return (
        "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/" +
        pokemonId.toString() +
        ".png"
    );
}

export function baseStatTotalTo600(pokemon) {
    let temp = Array(6).fill(null);
    let bst = 0;
    for (let i = 0; i < 6; i++) {
        bst += parseInt(pokemon.stats[i].base_stat);
    }
    for (let i = 0; i < 6; i++) {
        temp[i] = Math.floor(
            (parseInt(pokemon.stats[i].base_stat) * 600) / bst
        );
    }
    return temp;
}

// returns random key from Set or Map
function getRandomKey(collection) {
    let keys = Array.from(collection.keys());
    return keys[Math.floor(Math.random() * keys.length)];
}

export function getRandomType() {
    return getRandomKey(PogeyData.types).toLowerCase();
}

export function getGoodRandomMoveset(moves) {
    let choices = [...moves];
    let moveset = [];

    for (const move of choices) {
        let added = false;
        for (const set of moveset) {
            if (
                set.type.name === move.type.name &&
                set.damage_class.name === move.damage_class.name &&
                set.priority === move.priority
            ) {
                moveset[moveset.indexOf(set)] =
                    set.power > move.power ? set : move;
                added = true;
            }
        }
        if (!added) moveset.push(move);
        if (moveset.length === 4) return moveset;
    }
    if (moveset.length < 4) {
        let choices = [...DEFAULT_MOVES];
        shuffle(choices);
        moveset = [...moveset, ...choices.slice(0, 4 - moveset.length)];
    }
    for (let move of moveset) {
        if (move.meta === undefined) move = getMoveByName(move.name);
        if (move.name === "hidden-power" || move.name === "secret-power") {
            move.type.name = (" " + getRandomType()).slice(1);
            move.power = 80;
        }
    }
    return moveset;
}

export function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

// export function getCompetitiveMoves(pokemon, move) {}
