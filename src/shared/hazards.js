import { isGrounded } from "./field";
import { typeEffectiveness } from "./damagecalc";
import { pokemonNameToString } from "./helpers";
import { HEAVY_DUTY_BOOTS } from "./iteminfo";
import { STATUS_IMMUNE_TYPES } from "./movemechanics";
import { indirectDamageBlocked } from "./abilities";

// Entry hazards (Stealth Rock, Spikes, Toxic Spikes, Sticky Web), following the side
// conditions in Showdown's data/moves.ts. They live on the team array of the side they
// were set on: team.hazards = { stealthRock, spikes (0-3), toxicSpikes (0-2), stickyWeb }.

export const HAZARD_MOVES = {
    "stealth-rock": "stealthRock",
    spikes: "spikes",
    "toxic-spikes": "toxicSpikes",
    "sticky-web": "stickyWeb",
};
// Moves that sweep hazards away: Rapid Spin & Mortal Spin clear the user's own side, Defog
// and Tidy Up clear both sides.
export const CLEAR_OWN_SIDE_MOVES = new Set(["rapid-spin", "mortal-spin"]);
export const CLEAR_BOTH_SIDES_MOVES = new Set(["defog", "tidy-up"]);

const MAX_LAYERS = { stealthRock: 1, spikes: 3, toxicSpikes: 2, stickyWeb: 1 };
export const HAZARD_LABEL = { stealthRock: "스텔스록", spikes: "압정뿌리기", toxicSpikes: "독압정", stickyWeb: "끈적끈적네트" };

export function getHazards(team) {
    if (!team.hazards) team.hazards = { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false };
    return team.hazards;
}

export function hasHazards(team) {
    const h = team.hazards;
    return !!h && (h.stealthRock || h.spikes > 0 || h.toxicSpikes > 0 || h.stickyWeb);
}

// Lays a hazard on `team`'s side (a layer more for Spikes/Toxic Spikes). False if it can't
// go any higher.
export function setHazard(team, kind, text) {
    const h = getHazards(team);
    if (kind === "stealthRock" || kind === "stickyWeb") {
        if (h[kind]) return false;
        h[kind] = true;
    } else {
        if (h[kind] >= MAX_LAYERS[kind]) return false;
        h[kind] += 1;
    }
    text.push(
        kind === "stealthRock"
            ? "Pointed stones float in the air around the opposing team!"
            : kind === "spikes"
            ? "Spikes were scattered on the ground around the opposing team!"
            : kind === "toxicSpikes"
            ? "Poison spikes were scattered on the ground around the opposing team!"
            : "A sticky web spreads out on the ground around the opposing team!"
    );
    return true;
}

export function clearHazards(team, text) {
    if (!hasHazards(team)) return false;
    team.hazards = null;
    if (text) text.push("The hazards around the team were blown away!");
    return true;
}

const ROCK_MOVE = { type: { name: "rock" }, damage_class: { name: "physical" } };

// What the hazards on `team`'s side do to `pokemon`, which has just switched in. Heavy-Duty
// Boots ignore all of it, Magic Guard blocks the damage, and Spikes/Toxic Spikes/Sticky Web
// only touch grounded pokemon. `boost` lowers a stat (Sticky Web).
export function applyHazards(pokemon, team, text, boost) {
    const h = team.hazards;
    if (!h || pokemon.hp[0] <= 0) return;
    if (pokemon.item && pokemon.item.name === HEAVY_DUTY_BOOTS) return;
    const name = pokemonNameToString(pokemon);
    const grounded = isGrounded(pokemon);
    const hurt = (amount, msg) => {
        if (indirectDamageBlocked(pokemon)) return;
        pokemon.hp[0] = Math.max(0, pokemon.hp[0] - Math.max(1, Math.floor(amount)));
        text.push(name + msg);
        if (pokemon.hp[0] === 0) text.push(name + " fainted!");
    };

    if (h.stealthRock) {
        // 1/8 of max HP, scaled by how well Rock does against it (1/32 .. 1/2)
        hurt((pokemon.hp[1] / 8) * typeEffectiveness(ROCK_MOVE, pokemon), " was hurt by the pointed stones!");
    }
    if (pokemon.hp[0] > 0 && h.spikes > 0 && grounded) {
        hurt(pokemon.hp[1] / (h.spikes === 1 ? 8 : h.spikes === 2 ? 6 : 4), " was hurt by the spikes!");
    }
    if (pokemon.hp[0] > 0 && h.toxicSpikes > 0 && grounded) {
        const types = pokemon.types.map((t) => t.type.name);
        if (types.includes("poison")) {
            // a grounded Poison type soaks the poison spikes up
            h.toxicSpikes = 0;
            text.push(name + " absorbed the poison spikes!");
        } else if (!pokemon.status && !types.some((t) => (STATUS_IMMUNE_TYPES.poison || []).includes(t))) {
            pokemon.status = h.toxicSpikes >= 2 ? { name: "toxic", counter: 1 } : { name: "poison" };
            text.push(name + " was " + (h.toxicSpikes >= 2 ? "badly poisoned" : "poisoned") + " by the poison spikes!");
        }
    }
    if (pokemon.hp[0] > 0 && h.stickyWeb && grounded) {
        text.push(name + " was caught in a sticky web!");
        boost(pokemon, [{ stat: { name: "speed" }, change: -1 }], text);
    }
}
