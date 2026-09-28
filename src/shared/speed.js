import { abilitySpeedMod, hasUnburden } from "./abilities";
import { activeItem } from "./helditem";

// A pokemon's Speed as it counts for turn order (and Gyro Ball): the stat with its stage,
// ability boosts (Chlorophyll, Swift Swim...), Choice Scarf's 1.5x, paralysis's 0.5x and Unburden.
export function effectiveSpeed(pokemon, field = null) {
    const stage = pokemon.stat_levels[4];
    const raw = 2 * pokemon.base_stats[5] + 31 + 5;
    let speed = Math.floor(stage < 0 ? (raw * 2) / (2 - stage) : (raw * (2 + stage)) / 2);
    speed = Math.floor(speed * abilitySpeedMod(pokemon, field));
    if (activeItem(pokemon) && pokemon.item.name === "choice-scarf") speed = Math.floor(speed * 1.5);
    if (pokemon.status && pokemon.status.name === "paralysis") speed = Math.floor(speed / 2);
    if (pokemon.tailwindActive) speed *= 2; // Tailwind (kept up to date by the battle)
    // Unburden: twice as fast once its item is gone
    if (!pokemon.item && pokemon.originalItem && hasUnburden(pokemon)) speed *= 2;
    return speed;
}
