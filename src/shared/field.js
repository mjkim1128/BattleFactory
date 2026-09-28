// Weather and terrain, following Pokemon Showdown's data/conditions.ts (weather) and the
// terrain conditions inside data/moves.ts. The field lives on both team arrays as the
// same shared object: { weather: {name, turns} | null, terrain: {name, turns} | null }.
import { WEATHER_ROCKS } from "./iteminfo";

export const WEATHER_MOVES = {
    "sunny-day": "sun",
    "rain-dance": "rain",
    sandstorm: "sand",
    hail: "hail",
    snowscape: "snow",
    "chilly-reception": "snow", // also switches the user out
};
export const TERRAIN_MOVES = {
    "electric-terrain": "electric",
    "grassy-terrain": "grassy",
    "misty-terrain": "misty",
    "psychic-terrain": "psychic",
};

const WEATHER_START = {
    sun: "The sunlight turned harsh!",
    rain: "It started to rain!",
    sand: "A sandstorm kicked up!",
    hail: "It started to hail!",
    snow: "It started to snow!",
};
const WEATHER_END = {
    sun: "The sunlight faded.",
    rain: "The rain stopped.",
    sand: "The sandstorm subsided.",
    hail: "The hail stopped.",
    snow: "The snow stopped.",
};
const TERRAIN_START = {
    electric: "Electric current runs across the battlefield!",
    grassy: "Grass grew to cover the battlefield!",
    misty: "Mist swirled around the battlefield!",
    psychic: "The battlefield got weird!",
};
const TERRAIN_END = {
    electric: "The electricity disappeared.",
    grassy: "The grass disappeared.",
    misty: "The mist disappeared.",
    psychic: "The weirdness disappeared.",
};

export const WEATHER_LABEL = { sun: "쾌청", rain: "비", sand: "모래바람", hail: "싸라기눈", snow: "설경" };
export const TERRAIN_LABEL = { electric: "일렉트릭필드", grassy: "그래스필드", misty: "미스트필드", psychic: "사이코필드" };

// Both teams point at one field object; make it if neither has one yet.
export function ensureField(teamA, teamB) {
    const field = (teamA && teamA.field) || (teamB && teamB.field) || { weather: null, terrain: null };
    if (teamA) teamA.field = field;
    if (teamB) teamB.field = field;
    return field;
}

// The weather that is actually in effect: Cloud Nine / Air Lock (field.suppressed, kept up to
// date by the battle) switch it off without ending it.
export function weatherOf(field) {
    return field && field.weather && !field.suppressed ? field.weather.name : null;
}
export function terrainOf(field) {
    return field && field.terrain ? field.terrain.name : null;
}

// Grounded pokemon are the ones terrain affects: not Flying-type, not holding an Air
// Balloon, and (Iron Ball aside) not levitating. `levitates` is a hook for abilities.
export function isGrounded(pokemon) {
    if (pokemon.item && pokemon.item.name === "iron-ball") return true;
    if (pokemon.types.some((t) => t.type.name === "flying")) return false;
    if (pokemon.item && pokemon.item.name === "air-balloon") return false;
    if (pokemon.levitates) return false;
    if (pokemon.ability && pokemon.ability.name === "levitate") return false;
    return true;
}

// Starts a weather. Fails (returns false) if that weather is already up. `holder` is the
// pokemon that set it: a rock item makes it last 8 turns instead of 5.
export function setWeather(field, name, holder, text) {
    if (weatherOf(field) === name) return false;
    const rock = holder && holder.item && WEATHER_ROCKS[name] === holder.item.name;
    field.weather = { name, turns: rock ? 8 : 5 };
    text.push(WEATHER_START[name]);
    return true;
}
export function setTerrain(field, name, holder, text) {
    if (terrainOf(field) === name) return false;
    field.terrain = { name, turns: 5 };
    text.push(TERRAIN_START[name]);
    return true;
}

// End of turn: the weather counts down before it does anything, so a 5-turn weather
// deals its damage 4 times and ends on the fifth; terrain counts down after its healing.
export function tickWeather(field, text) {
    if (field.weather) {
        field.weather.turns -= 1;
        if (field.weather.turns <= 0) {
            text.push(WEATHER_END[field.weather.name]);
            field.weather = null;
        }
    }
}
export function tickTerrain(field, text) {
    if (field.terrain) {
        field.terrain.turns -= 1;
        if (field.terrain.turns <= 0) {
            text.push(TERRAIN_END[field.terrain.name]);
            field.terrain = null;
        }
    }
}

const WEATHER_BALL_TYPE = { sun: "fire", rain: "water", sand: "rock", hail: "ice", snow: "ice" };
const TERRAIN_PULSE_TYPE = { electric: "electric", grassy: "grass", misty: "fairy", psychic: "psychic" };

// Moves whose type/power/priority depend on the field. Returns a changed copy (or the same
// move when nothing applies), so the original move object is never touched.
export function adaptMoveToField(move, attacker, field) {
    const weather = weatherOf(field);
    const terrain = terrainOf(field);
    if (move.name === "weather-ball" && weather) {
        return { ...move, type: { name: WEATHER_BALL_TYPE[weather] }, power: move.power * 2 };
    }
    if (move.name === "terrain-pulse" && terrain && isGrounded(attacker)) {
        return { ...move, type: { name: TERRAIN_PULSE_TYPE[terrain] }, power: move.power * 2 };
    }
    // Morpeko's Aura Wheel is Dark while it is hangry, Electric while it is full
    if (move.name === "aura-wheel") return { ...move, type: { name: attacker.hangry ? "dark" : "electric" } };
    if (move.name === "grassy-glide" && terrain === "grassy" && isGrounded(attacker)) {
        return { ...move, priority: move.priority + 1 };
    }
    return move;
}

// Multiplier on the damage a move does because of the weather (Showdown's
// onWeatherModifyDamage): Sun/Rain boost one of Fire/Water and weaken the other.
export function weatherDamageMod(move, field) {
    const weather = weatherOf(field);
    if (weather === "sun") {
        if (move.name === "hydro-steam") return 1.5;
        if (move.type.name === "fire") return 1.5;
        if (move.type.name === "water") return 0.5;
    } else if (weather === "rain") {
        if (move.type.name === "water") return 1.5;
        if (move.type.name === "fire") return 0.5;
    }
    return 1;
}

// Multiplier on a move's base power from the weather/terrain (terrain boosts are x1.3).
export function powerFieldMod(move, attacker, defender, field) {
    const weather = weatherOf(field);
    const terrain = terrainOf(field);
    let mod = 1;
    // Solar Beam/Blade are halved in anything but sun
    if ((move.name === "solar-beam" || move.name === "solar-blade") && weather && weather !== "sun") mod *= 0.5;
    if (!terrain) return mod;
    const attackerGrounded = isGrounded(attacker);
    const defenderGrounded = isGrounded(defender);
    const type = move.type.name;
    if (terrain === "electric" && type === "electric" && attackerGrounded) mod *= 5325 / 4096;
    if (terrain === "psychic" && type === "psychic" && attackerGrounded) mod *= 5325 / 4096;
    if (terrain === "grassy") {
        if (["earthquake", "bulldoze", "magnitude"].includes(move.name) && defenderGrounded) mod *= 0.5;
        else if (type === "grass" && attackerGrounded) mod *= 5325 / 4096;
    }
    if (terrain === "misty" && type === "dragon" && defenderGrounded) mod *= 0.5;
    // Moves that get stronger with their terrain
    if (move.name === "rising-voltage" && terrain === "electric" && defenderGrounded) mod *= 2;
    if (move.name === "expanding-force" && terrain === "psychic" && attackerGrounded) mod *= 1.5;
    if (move.name === "psyblade" && terrain === "electric" && attackerGrounded) mod *= 1.5;
    if (move.name === "misty-explosion" && terrain === "misty" && attackerGrounded) mod *= 1.5;
    return mod;
}

// Accuracy overrides from the weather: 0 = can't miss, 50 = only 50%, undefined = no change.
const RAIN_SURE_HIT = ["thunder", "hurricane", "bleakwind-storm", "wildbolt-storm", "sandsear-storm"];
export function weatherAccuracy(move, field) {
    const weather = weatherOf(field);
    if (RAIN_SURE_HIT.includes(move.name)) {
        if (weather === "rain") return "always";
        if (weather === "sun") return 50;
    }
    if (move.name === "blizzard" && (weather === "hail" || weather === "snow")) return "always";
    return undefined;
}

// Does the weather stop this status from being caught? (Freeze can't happen in sun.)
export function weatherBlocksStatus(status, field) {
    return weatherOf(field) === "sun" && status === "freeze";
}

// Does the terrain protect this (grounded) pokemon from getting the status?
export function terrainBlocksStatus(pokemon, status, field) {
    const terrain = terrainOf(field);
    if (!terrain || !isGrounded(pokemon)) return false;
    if (terrain === "misty") return true; // misty terrain blocks every status and confusion
    if (terrain === "electric") return status === "sleep";
    return false;
}

// Priority moves can't hit a grounded pokemon under Psychic Terrain.
export function terrainBlocksPriority(move, defender, field) {
    return terrainOf(field) === "psychic" && move.priority > 0 && isGrounded(defender);
}

// Heal amount (percent of max HP) for the weather-dependent recovery moves.
export function weatherHealPercent(move, field) {
    const weather = weatherOf(field);
    if (["synthesis", "morning-sun", "moonlight"].includes(move.name)) {
        if (weather === "sun") return 66.7;
        if (weather) return 25;
        return 50;
    }
    if (move.name === "shore-up" && weather === "sand") return 66.7;
    return null;
}

// Abilities that shrug off a weather's chip damage
const WEATHER_DAMAGE_IMMUNE = {
    sand: ["sand-veil", "sand-rush", "sand-force"],
    hail: ["snow-cloak", "slush-rush", "ice-body"],
};

// End-of-turn weather damage (1/16 max HP) for whoever the weather hurts.
export function weatherEndOfTurnDamage(pokemon, field) {
    const weather = weatherOf(field);
    const ability = pokemon.ability && pokemon.ability.name;
    if (ability === "overcoat" || ability === "magic-guard") return 0; // (abilities.js can't be imported here)
    if (weather && (WEATHER_DAMAGE_IMMUNE[weather] || []).includes(ability)) return 0;
    const types = pokemon.types.map((t) => t.type.name);
    if (weather === "sand" && !types.some((t) => ["rock", "ground", "steel"].includes(t))) return Math.floor(pokemon.hp[1] / 16);
    if (weather === "hail" && !types.includes("ice")) return Math.floor(pokemon.hp[1] / 16);
    return 0;
}
