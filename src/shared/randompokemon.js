import { PogeyData } from "./pogey";
import { getPokemonById, getMoveByName, getItemByName } from "./processjson";
import { shuffle } from "shared";
import { DEFAULT_MOVES } from "./legalmoves";
import { ITEM_POOL, SPECIES_EXCLUSIVE_ITEMS } from "./iteminfo";
import ELIGIBLE_POKEMON_IDS from "./eligible_pokemon_ids.json";

export async function generateRandomItem(pokemonName) {
    const choices = shuffle([...ITEM_POOL]);
    for (const itemName of choices) {
        const allowedSpecies = SPECIES_EXCLUSIVE_ITEMS[itemName];
        if (allowedSpecies && !allowedSpecies.includes(pokemonName)) continue;
        return await getItemByName(itemName);
    }
    return await getItemByName(choices[0]);
}

// Only fully-evolved pokemon, pokemon with no evolution at all, and every
// legendary/mythical (regardless of their own evolution stage) are drafted —
// precomputed once from PokeAPI's species + evolution-chain data (see
// scripts this was generated from) rather than walking evolution chains live.
export async function generateRandomPokemon(pokemonTeam) {
    const usedIds = new Set(
        pokemonTeam.filter((mon) => mon).map((mon) => mon.id)
    );
    for (let attempt = 0; attempt < 50; attempt++) {
        const id = generateRandomPokemonId();
        if (usedIds.has(id)) continue;
        return await getPokemonById(id);
    }
    throw new Error("Could not find a unique pokemon after 50 attempts");
}

export function generateRandomPokemonId() {
    return ELIGIBLE_POKEMON_IDS[
        Math.floor(Math.random() * ELIGIBLE_POKEMON_IDS.length)
    ];
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

export async function getGoodRandomMoveset(moves) {
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
        if (move.meta === undefined) move = await getMoveByName(move.name);
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
