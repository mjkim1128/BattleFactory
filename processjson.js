//import pokedex from "shared/thirdgenpokedex";
import pokedex from 'shared/pokedex_data.json';  // JSON 파일을 가져오는 방식
s
import moves from "shared/allmoves";

export const lodash = require("lodash");

export function getMoveByName(name) {
    return getCustomMoveData(
        lodash.cloneDeep(
            moves.filter((move) => {
                return move.name === name;
            })[0]
        )
    );
}

export function getMoveById(id) {
    return getCustomMoveData(
        lodash.cloneDeep(
            moves.filter((move) => {
                return move.id === id;
            })[0]
        )
    );
}

export function getPokemonById(id) {
    return getCustomPokemonData(lodash.cloneDeep(pokedex[id]));
}

export function getPokemonByName(name) {
    return getCustomPokemonData(
        lodash.cloneDeep(
            pokedex.filter((poke) => {
                return poke.name === name;
            })[0]
        )
    );
}

export function getCustomPokemonData(poke) {
    return {
        abilities: poke.abilities,
        forms: poke.forms,
        height: poke.heigt,
        id: poke.id,
        moves: poke.moves,
        name: poke.name,
        sprites: poke.sprites,
        stats: poke.stats,
        types: poke.types,
        weight: poke.weight,
    };
}

export function getCustomMoveData(move) {
    return {
        accuracy: move.accuracy,
        damage_class: move.damage_class,
        effect_chance: move.effect_chance,
        effect_changes: move.effect_changes,
        effect_entries: move.effect_entries,
        flavor_text_entries: move.flavor_text_entries,
        id: move.id,
        meta: move.meta,
        name: move.name,
        power: move.power,
        pp: move.pp,
        priority: move.priority,
        stat_changes: move.stat_changes,
        type: move.type,
    };
}
