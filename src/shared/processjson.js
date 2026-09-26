export const lodash = require("lodash");

const POKEAPI_BASE = "https://pokeapi.co/api/v2";

// In-memory caches so a pokemon/move already fetched this session never triggers
// a second network request (only newly-seen ids/names pay the request cost).
const pokemonByIdCache = new Map();
const pokemonByNameCache = new Map();
const moveByNameCache = new Map();
const moveByIdCache = new Map();
const speciesKoreanNameCache = new Map();

async function fetchFromApi(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`PokeAPI request failed (${res.status}): ${url}`);
    }
    return res.json();
}

function findLocalizedName(names, language) {
    const entry = (names || []).find((n) => n.language.name === language);
    return entry ? entry.name : null;
}

async function getKoreanSpeciesName(speciesUrl) {
    if (speciesKoreanNameCache.has(speciesUrl)) {
        return speciesKoreanNameCache.get(speciesUrl);
    }
    let koreanName = null;
    try {
        const species = await fetchFromApi(speciesUrl);
        koreanName = findLocalizedName(species.names, "ko");
    } catch {
        // Species lookup is a display-only nicety; fall back to the english name.
    }
    speciesKoreanNameCache.set(speciesUrl, koreanName);
    return koreanName;
}

export async function getMoveByName(name) {
    if (moveByNameCache.has(name)) {
        return lodash.cloneDeep(moveByNameCache.get(name));
    }
    const move = getCustomMoveData(
        await fetchFromApi(`${POKEAPI_BASE}/move/${name}`)
    );
    moveByNameCache.set(move.name, move);
    moveByIdCache.set(move.id, move);
    return lodash.cloneDeep(move);
}

export async function getMoveById(id) {
    if (moveByIdCache.has(id)) {
        return lodash.cloneDeep(moveByIdCache.get(id));
    }
    const move = getCustomMoveData(
        await fetchFromApi(`${POKEAPI_BASE}/move/${id}`)
    );
    moveByNameCache.set(move.name, move);
    moveByIdCache.set(move.id, move);
    return lodash.cloneDeep(move);
}

export async function getPokemonById(id) {
    if (pokemonByIdCache.has(id)) {
        return lodash.cloneDeep(pokemonByIdCache.get(id));
    }
    const raw = await fetchFromApi(`${POKEAPI_BASE}/pokemon/${id}`);
    const pokemon = getCustomPokemonData(raw);
    pokemon.korean_name = await getKoreanSpeciesName(raw.species.url);
    pokemonByIdCache.set(pokemon.id, pokemon);
    pokemonByNameCache.set(pokemon.name, pokemon);
    return lodash.cloneDeep(pokemon);
}

export async function getPokemonByName(name) {
    if (pokemonByNameCache.has(name)) {
        return lodash.cloneDeep(pokemonByNameCache.get(name));
    }
    const raw = await fetchFromApi(`${POKEAPI_BASE}/pokemon/${name}`);
    const pokemon = getCustomPokemonData(raw);
    pokemon.korean_name = await getKoreanSpeciesName(raw.species.url);
    pokemonByIdCache.set(pokemon.id, pokemon);
    pokemonByNameCache.set(pokemon.name, pokemon);
    return lodash.cloneDeep(pokemon);
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
        korean_name: findLocalizedName(move.names, "ko"),
        meta: move.meta,
        name: move.name,
        power: move.power,
        pp: move.pp,
        priority: move.priority,
        stat_changes: move.stat_changes,
        type: move.type,
    };
}
