import ABILITY_NAMES from "./ability_names.json";
import { CONTACT_MOVES } from "./legalmoves";
import { pokemonNameToString } from "./helpers";
import { weatherOf } from "./field";

// Abilities. Showdown's abilities are engine code (data/abilities.ts event handlers), so
// they can't be imported; each one here is a small hand-written handler keyed by the
// PokeAPI slug, following what Showdown's handler does. The battle code (turn.js) calls the
// hooks below at the matching moment. Names/Korean names come from ability_names.json,
// generated from PokeAPI.
//
// Hooks (all optional; each gets one `ctx` object):
//   onSwitchIn(ctx)         the pokemon just came out          ctx: self, foe, selfTeam, foeTeam, field, text, selfIsPlayer
//   onModifyAtk(ctx)        multiplier for its own attack stat ctx: self, foe, move, category
//   onDamagingHit(ctx)      it was hit by a damaging move      ctx: self, attacker, move, damage, text
//   onHpBelowHalf(ctx)      a hit dropped it to half HP or less
//   onSetStatus(ctx)        return true to refuse a status     ctx: self, status
//   onResidual(ctx)         end of every turn                  ctx: self, field, text, applyBerry
//   onUpdate(ctx)           the field changed / it switched in ctx: self, field, text
//   onAfterMove(ctx)        it used a move                     ctx: self, foe, move, text
// `breakable: true` marks an ability Mold Breaker & co. ignore.

export function getAbility(slug) {
    const names = ABILITY_NAMES[slug] || {};
    return { name: slug, english_name: names.en || slug, korean_name: names.ko || null };
}

export function abilityName(pokemon) {
    return pokemon && pokemon.ability ? pokemon.ability.name : null;
}

export function abilityLabel(pokemon) {
    const a = pokemon && pokemon.ability;
    return a ? a.korean_name || a.english_name || a.name : "";
}

const MOLD_BREAKER_LIKE = new Set(["mold-breaker", "teravolt", "turboblaze"]);
// Abilities that can't be swapped or overwritten by Mummy / Wandering Spirit / Trace
const LOCKED_ABILITIES = new Set([
    "comatose", "mummy", "disguise", "gulp-missile", "ice-face", "zen-mode", "stance-change",
    "schooling", "shields-down", "zero-to-hero", "power-construct", "imposter", "illusion",
]);

// Does this attacker's move ignore the target's breakable abilities?
export function ignoresAbilities(attacker) {
    return MOLD_BREAKER_LIKE.has(abilityName(attacker));
}

const jsonClone = (x) => JSON.parse(JSON.stringify(x));

export const ABILITIES = {
    // ---- reflect status moves back at the user (the redirect itself is in turn.js) ----
    "magic-bounce": { breakable: true },

    // ---- contact reactions: change the attacker's ability ----
    mummy: {
        onDamagingHit({ attacker, move, text }) {
            if (!CONTACT_MOVES.has(move.name)) return;
            const theirs = abilityName(attacker);
            if (!theirs || LOCKED_ABILITIES.has(theirs)) return;
            attacker.ability = getAbility("mummy");
            text.push(pokemonNameToString(attacker) + "'s ability became Mummy!");
        },
    },
    "wandering-spirit": {
        onDamagingHit({ self, attacker, move, text }) {
            if (!CONTACT_MOVES.has(move.name)) return;
            const theirs = abilityName(attacker);
            if (!theirs || LOCKED_ABILITIES.has(theirs)) return;
            // Skill Swap: the two pokemon trade abilities
            const mine = self.ability;
            self.ability = attacker.ability;
            attacker.ability = mine;
            text.push(pokemonNameToString(self) + " swapped abilities with " + pokemonNameToString(attacker) + "!");
        },
    },

    // ---- switch out when knocked down to half HP ----
    "emergency-exit": {
        onHpBelowHalf({ self, selfTeam, text }) {
            if (!selfTeam.slice(1).some((p) => p.hp[0] > 0)) return;
            text.push(pokemonNameToString(self) + "'s Emergency Exit activated!");
            selfTeam.pivotRequest = { baton: false };
        },
    },

    // ---- attack doubles against a pokemon that only just switched in ----
    stakeout: {
        onModifyAtk({ foe }) {
            if (!foe.activeTurns) return 2;
        },
    },

    // ---- never gets a status condition (permanently "asleep" in spirit) ----
    comatose: {
        onSetStatus() {
            return true;
        },
    },

    // ---- eats its berry a second time at the end of the next turn ----
    "cud-chew": {
        onResidual({ self, text, applyBerry }) {
            const chew = self.cudChew;
            if (!chew || self.hp[0] <= 0) return;
            chew.turns -= 1;
            if (chew.turns > 0) return;
            self.cudChew = null;
            text.push(pokemonNameToString(self) + " chewed its " + (chew.berry.korean_name || chew.berry.name) + " again!");
            applyBerry(self, chew.berry, text);
        },
    },

    // ---- Morpeko flips between its two bellies every turn (Aura Wheel changes type) ----
    "hunger-switch": {
        onResidual({ self, text }) {
            if (self.hp[0] <= 0) return;
            self.hangry = !self.hangry;
            text.push(pokemonNameToString(self) + (self.hangry ? " turned hangry!" : " is full again!"));
        },
    },

    // ---- looks like the last member of its party until the first hit lands ----
    illusion: {
        onSwitchIn({ self, selfTeam, selfIsPlayer }) {
            // Only worth doing for the CPU: the player already knows their own team
            if (selfIsPlayer) return;
            const disguise = [...selfTeam].reverse().find((p) => p !== self && p.hp[0] > 0);
            self.illusion = disguise || null;
        },
        onDamagingHit({ self, text, damage }) {
            if (!self.illusion || !(damage > 0)) return;
            self.illusion = null;
            text.push(pokemonNameToString(self) + "'s Illusion wore off!");
        },
    },

    // ---- Transform into the opposing pokemon on entering ----
    imposter: {
        onSwitchIn({ self, foe, text }) {
            if (!foe || foe.hp[0] <= 0 || self.transformBackup || foe.transformBackup || foe.illusion) return;
            self.transformBackup = {
                types: self.types,
                base_stats: self.base_stats,
                moveset: self.moveset,
                ability: self.ability,
                stat_levels: self.stat_levels,
            };
            self.types = jsonClone(foe.types);
            self.base_stats = [self.base_stats[0], ...foe.base_stats.slice(1)]; // keeps its own HP
            self.stat_levels = [...foe.stat_levels];
            // Copied moves start with 5 PP each
            self.moveset = foe.moveset.map((m) => ({ ...jsonClone(m), ppLeft: 5, ppCap: 5 }));
            self.ability = foe.ability;
            text.push(pokemonNameToString(self) + " transformed into " + pokemonNameToString(foe) + "!");
        },
    },

    // ---- Mimikyu: the first hit it takes is absorbed by its disguise (handled in turn.js) ----
    disguise: {},

    // ---- Cramorant: after Surf/Dive it holds a prey that hits back once (turn.js) ----
    "gulp-missile": {
        onAfterMove({ self, move }) {
            if ((move.name === "surf" || move.name === "dive") && !self.gulp) {
                self.gulp = self.hp[0] <= self.hp[1] / 2 ? "pikachu" : "arrokuda";
            }
        },
        onDamagingHit({ self, attacker, text, boost, inflictStatus, damage }) {
            if (!self.gulp || !(damage > 0) || attacker.hp[0] <= 0) return;
            const prey = self.gulp;
            self.gulp = null;
            attacker.hp[0] = Math.max(0, attacker.hp[0] - Math.floor(attacker.hp[1] / 4));
            text.push(pokemonNameToString(attacker) + " was hurt by the Gulp Missile!");
            if (attacker.hp[0] === 0) {
                text.push(pokemonNameToString(attacker) + " fainted!");
                return;
            }
            if (prey === "arrokuda") boost(attacker, [{ stat: { name: "defense" }, change: -1 }], text);
            else inflictStatus(attacker, "paralysis", text);
        },
    },

    // ---- copies dance moves used by the other side (turn.js) ----
    dancer: {},

    // ---- Castform: its type follows the weather ----
    forecast: {
        onUpdate({ self, field }) {
            const weather = weatherOf(field);
            const wanted = weather === "sun" ? "fire" : weather === "rain" ? "water" : weather === "hail" || weather === "snow" ? "ice" : "normal";
            if (!self.baseTypes) self.baseTypes = self.types;
            self.types = [{ slot: 1, type: { name: wanted } }];
        },
    },
};

// The handler for `hook` on `pokemon`'s ability. When `foe` is an attacker with Mold Breaker,
// abilities marked breakable are skipped.
export function hookOf(pokemon, hook, foe = null) {
    const handler = ABILITIES[abilityName(pokemon)];
    if (!handler || !handler[hook]) return null;
    if (handler.breakable && foe && ignoresAbilities(foe)) return null;
    return handler[hook];
}

export function runHook(pokemon, hook, ctx, foe = null) {
    const fn = hookOf(pokemon, hook, foe);
    return fn ? fn({ self: pokemon, ...ctx }) : undefined;
}

// Multiplier for the attacker's offensive stat from its own ability.
export function abilityAttackMod(attacker, defender, move, category) {
    const fn = hookOf(attacker, "onModifyAtk");
    if (!fn) return 1;
    const mod = fn({ self: attacker, foe: defender, move, category });
    return mod === undefined ? 1 : mod;
}

// Does the defender's Magic Bounce send `attacker`'s status move back?
export function bouncesMoves(defender, attacker) {
    return abilityName(defender) === "magic-bounce" && !ignoresAbilities(attacker);
}

// Does the pokemon's ability refuse this status (Comatose, and later Limber, Insomnia...)?
export function abilityBlocksStatus(pokemon, status, attacker = null) {
    const fn = hookOf(pokemon, "onSetStatus", attacker);
    return !!fn && fn({ self: pokemon, status }) === true;
}

// Undo everything an ability did to a pokemon that only lasts while it is out (Transform, a
// borrowed ability, an Illusion, held prey). Called when it switches out and after a battle.
export function resetAbilityState(pokemon) {
    if (pokemon.transformBackup) {
        Object.assign(pokemon, pokemon.transformBackup);
        pokemon.transformBackup = null;
    }
    if (pokemon.baseAbility) pokemon.ability = pokemon.baseAbility;
    pokemon.illusion = null;
    pokemon.gulp = null;
    pokemon.cudChew = null;
    if (pokemon.baseTypes) {
        pokemon.types = pokemon.baseTypes;
        pokemon.baseTypes = null;
    }
}

// Picks the ability a new pokemon gets: from its real set when it has one, otherwise a random
// one of the species' own abilities (preferring ones the battle engine actually implements).
export function pickAbility(factorySet, speciesAbilities) {
    const fromSet = factorySet && factorySet.ability ? [].concat(factorySet.ability) : [];
    let slug = null;
    if (fromSet.length > 0) {
        slug = fromSet[Math.floor(Math.random() * fromSet.length)];
    } else {
        const own = (speciesAbilities || []).map((a) => a.ability.name);
        const usable = own.filter((n) => ABILITIES[n]);
        const pool = usable.length > 0 ? usable : own;
        if (pool.length > 0) slug = pool[Math.floor(Math.random() * pool.length)];
    }
    return slug ? getAbility(slug) : null;
}
