import ABILITY_NAMES from "./ability_names.json";
import { CONTACT_MOVES } from "./legalmoves";
import { pokemonNameToString } from "./helpers";
import { weatherOf } from "./field";
import { SECONDARY_MOVES, PUNCH_MOVES } from "./movemechanics";

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
    "schooling", "shields-down", "zero-to-hero", "power-construct", "imposter", "illusion", "trace",
]);
// Abilities that keep Intimidate away from their owner (Showdown, gen 8+)
const INTIMIDATE_IMMUNE = new Set(["inner-focus", "oblivious", "own-tempo", "scrappy"]);
const FOE_TARGET_NAMES = new Set(["selected-pokemon", "all-opponents", "random-opponent", "all-other-pokemon"]);
const aimsAtFoe = (move) => move.damage_class.name !== "status" || FOE_TARGET_NAMES.has(move.target && move.target.name);
const pinch = (self) => self.hp[0] * 3 <= self.hp[1]; // 1/3 HP or less
const pinchBoost = (type) => ({
    onBasePower({ self, move }) {
        if (move.type.name === type && pinch(self)) return 1.5;
    },
});
const contactStatus = (status) => ({
    onDamagingHit({ attacker, move, text, inflictStatus }) {
        if (CONTACT_MOVES.has(move.name) && attacker.hp[0] > 0 && Math.random() < 0.3) inflictStatus(attacker, status, text);
    },
});
const absorbAbility = (type, effect) => ({ breakable: true, absorbs: { type, ...effect } });
// Contact damage to the attacker (Rough Skin / Iron Barbs): 1/8 of its max HP
const contactDamage = {
    onDamagingHit({ attacker, move, text, hurt }) {
        if (CONTACT_MOVES.has(move.name) && attacker.hp[0] > 0) hurt(attacker, Math.floor(attacker.hp[1] / 8), text, " was hurt!");
    },
};

// Does this attacker's move ignore the target's breakable abilities?
export function ignoresAbilities(attacker) {
    return MOLD_BREAKER_LIKE.has(abilityName(attacker));
}

const jsonClone = (x) => JSON.parse(JSON.stringify(x));

export const ABILITIES = {
    // ---- reflect status moves back at the user (the redirect itself is in turn.js) ----
    "magic-bounce": { breakable: true },

    // ---- no damage except from attacks ----
    "magic-guard": { noIndirectDamage: true },

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

    // ================= first batch: the most common abilities =================

    // ---- immunities that also do something (the redirect/heal is in tryAbsorb) ----
    levitate: { breakable: true, groundImmune: true },
    "water-absorb": absorbAbility("water", { heal: 1 / 4 }),
    "volt-absorb": absorbAbility("electric", { heal: 1 / 4 }),
    "dry-skin": {
        ...absorbAbility("water", { heal: 1 / 4 }),
        onSourceBasePower({ move }) {
            if (move.type.name === "fire") return 1.25;
        },
        onResidual({ self, field, text, hurt, heal }) {
            const weather = weatherOf(field);
            if (weather === "rain") heal(self, Math.floor(self.hp[1] / 8), text, " was healed by its Dry Skin!");
            else if (weather === "sun") hurt(self, Math.floor(self.hp[1] / 8), text, " was hurt by its Dry Skin!");
        },
    },
    "storm-drain": absorbAbility("water", { boost: [{ stat: { name: "special-attack" }, change: 1 }] }),
    "lightning-rod": absorbAbility("electric", { boost: [{ stat: { name: "special-attack" }, change: 1 }] }),
    "sap-sipper": absorbAbility("grass", { boost: [{ stat: { name: "attack" }, change: 1 }] }),
    "flash-fire": {
        ...absorbAbility("fire", { flashFire: true }),
        onModifyAtk({ self, move }) {
            if (self.flashFire && move.type.name === "fire") return 1.5;
        },
    },

    // ---- damage and stat modifiers ----
    blaze: pinchBoost("fire"),
    torrent: pinchBoost("water"),
    overgrow: pinchBoost("grass"),
    swarm: pinchBoost("bug"),
    technician: {
        onBasePower({ move }) {
            if (move.power > 0 && move.power <= 60) return 1.5;
        },
    },
    "iron-fist": {
        onBasePower({ move }) {
            if (PUNCH_MOVES.has(move.name)) return 4915 / 4096;
        },
    },
    "sheer-force": {
        removesSecondaries: true,
        onBasePower({ move }) {
            if (move.damage_class.name !== "status" && SECONDARY_MOVES.has(move.name)) return 5325 / 4096;
        },
    },
    adaptability: { stab: 2 },
    "huge-power": {
        onModifyAtk({ category }) {
            if (category === "physical") return 2;
        },
    },
    "pure-power": {
        onModifyAtk({ category }) {
            if (category === "physical") return 2;
        },
    },
    guts: {
        ignoresBurn: true,
        onModifyAtk({ self, category }) {
            if (category === "physical" && self.status) return 1.5;
        },
    },
    "thick-fat": {
        breakable: true,
        onSourceModifyAtk({ move }) {
            if (move.type.name === "fire" || move.type.name === "ice") return 0.5;
        },
    },
    "solid-rock": {
        breakable: true,
        onSourceModifyDamage({ typeEff }) {
            if (typeEff > 1) return 0.75;
        },
    },
    filter: {
        breakable: true,
        onSourceModifyDamage({ typeEff }) {
            if (typeEff > 1) return 0.75;
        },
    },
    "prism-armor": {
        onSourceModifyDamage({ typeEff }) {
            if (typeEff > 1) return 0.75;
        },
    },
    unaware: { breakable: true, ignoresBoosts: true },
    "compound-eyes": {
        onModifyAccuracy() {
            return 5325 / 4096;
        },
    },
    "victory-star": {
        onModifyAccuracy() {
            return 4506 / 4096;
        },
    },
    scrappy: { scrappy: true },
    infiltrator: { bypassesScreens: true },
    "serene-grace": { chanceMultiplier: 2 },
    "rock-head": { noRecoil: true },
    overcoat: { powderImmune: true, weatherImmune: true },
    unburden: { unburden: true },
    prankster: { boostsStatusPriority: true },
    "poison-heal": { poisonHeal: true },

    // ---- sturdy: survives a hit from full HP, immune to one-hit KOs ----
    sturdy: { breakable: true, sturdy: true },

    // ---- stat changes: Contrary/Simple rewrite them, Clear Body blocks drops from others ----
    contrary: { breakable: true, onModifyBoost: (change) => -change },
    simple: { breakable: true, onModifyBoost: (change) => change * 2 },
    "clear-body": {
        breakable: true,
        blocksDrop: () => "Clear Body",
    },
    "white-smoke": {
        breakable: true,
        blocksDrop: () => "White Smoke",
    },
    defiant: {
        onStatDropped({ self, text, boost }) {
            boost(self, [{ stat: { name: "attack" }, change: 2 }], text);
        },
    },
    competitive: {
        onStatDropped({ self, text, boost }) {
            boost(self, [{ stat: { name: "special-attack" }, change: 2 }], text);
        },
    },

    // ---- on entering ----
    intimidate: {
        onSwitchIn({ self, foe, text, boost }) {
            if (!foe || foe.hp[0] <= 0) return;
            const theirs = abilityName(foe);
            text.push(pokemonNameToString(self) + "'s Intimidate!");
            if (INTIMIDATE_IMMUNE.has(theirs)) {
                text.push(pokemonNameToString(foe) + "'s " + abilityLabel(foe) + " prevents its Attack from being lowered!");
                return;
            }
            boost(foe, [{ stat: { name: "attack" }, change: -1 }], text, self);
        },
    },
    trace: {
        onSwitchIn(ctx) {
            const { self, foe, text } = ctx;
            const theirs = abilityName(foe);
            if (!foe || foe.hp[0] <= 0 || !theirs || LOCKED_ABILITIES.has(theirs)) return;
            self.ability = foe.ability;
            text.push(pokemonNameToString(self) + " traced " + pokemonNameToString(foe) + "'s " + abilityLabel(foe) + "!");
            // the traced ability acts as if it had just switched in
            runHook(self, "onSwitchIn", ctx, foe);
        },
    },

    // ---- on leaving ----
    regenerator: {
        onSwitchOut({ self, text, heal }) {
            heal(self, Math.floor(self.hp[1] / 3), text, " regenerated some HP!");
        },
    },
    "natural-cure": {
        onSwitchOut({ self, text }) {
            if (!self.status) return;
            self.status = null;
            text.push(pokemonNameToString(self) + "'s status was cured by Natural Cure!");
        },
    },

    // ---- every turn ----
    "speed-boost": {
        onResidual({ self, text, boost }) {
            if (self.hp[0] > 0 && self.activeTurns) boost(self, [{ stat: { name: "speed" }, change: 1 }], text);
        },
    },

    // ---- knocking something out ----
    moxie: {
        onKO({ self, text, boost }) {
            boost(self, [{ stat: { name: "attack" }, change: 1 }], text);
        },
    },
    "beast-boost": {
        onKO({ self, text, boost }) {
            // raises whichever of its five stats is highest
            const names = ["attack", "defense", "special-attack", "special-defense", "speed"];
            let best = 0;
            for (let i = 1; i < 5; i++) if (self.base_stats[i + 1] > self.base_stats[best + 1]) best = i;
            boost(self, [{ stat: { name: names[best] }, change: 1 }], text);
        },
    },

    // ---- being hit ----
    justified: {
        onDamagingHit({ self, move, damage, text, boost }) {
            if (move.type.name === "dark" && damage > 0) boost(self, [{ stat: { name: "attack" }, change: 1 }], text);
        },
    },
    static: contactStatus("paralysis"),
    "flame-body": contactStatus("burn"),
    "rough-skin": contactDamage,
    "iron-barbs": contactDamage,
    "cursed-body": {
        onDamagingHit({ attacker, move, damage, text, disable }) {
            if (damage > 0 && move.name !== "struggle" && !attacker.disabled && Math.random() < 0.3) disable(attacker, move, text);
        },
    },
    synchronize: {
        onStatusInflicted({ attacker, status, text, inflictStatus }) {
            if (!attacker || !["burn", "paralysis", "poison", "toxic"].includes(status)) return;
            inflictStatus(attacker, status, text);
        },
    },

    // ---- changing its own type to match the move it is about to use (once per switch-in) ----
    protean: {
        onPrepareMove({ self, move, text }) {
            if (self.proteanUsed || move.type.name === "typeless") return;
            if (self.types.length === 1 && self.types[0].type.name === move.type.name) return;
            self.proteanUsed = true;
            if (!self.baseTypes) self.baseTypes = self.types;
            self.types = [{ slot: 1, type: { name: move.type.name } }];
            text.push(pokemonNameToString(self) + "'s type changed to " + move.type.name + "!");
        },
    },
    libero: {
        onPrepareMove({ self, move, text }) {
            if (self.proteanUsed || move.type.name === "typeless") return;
            if (self.types.length === 1 && self.types[0].type.name === move.type.name) return;
            self.proteanUsed = true;
            if (!self.baseTypes) self.baseTypes = self.types;
            self.types = [{ slot: 1, type: { name: move.type.name } }];
            text.push(pokemonNameToString(self) + "'s type changed to " + move.type.name + "!");
        },
    },

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

// The ability handler of `pokemon`, or null. When `foe` is an attacker with Mold Breaker,
// abilities marked breakable count as absent.
export function handlerOf(pokemon, foe = null) {
    const handler = ABILITIES[abilityName(pokemon)];
    if (!handler) return null;
    if (handler.breakable && foe && ignoresAbilities(foe)) return null;
    return handler;
}

// The handler for `hook` on `pokemon`'s ability (skipped if Mold Breaker ignores it).
export function hookOf(pokemon, hook, foe = null) {
    const handler = handlerOf(pokemon, foe);
    return handler && handler[hook] ? handler[hook] : null;
}

export function runHook(pokemon, hook, ctx, foe = null) {
    const fn = hookOf(pokemon, hook, foe);
    return fn ? fn({ self: pokemon, ...ctx }) : undefined;
}

const orOne = (x) => (x === undefined ? 1 : x);

// Multiplier for the attacker's offensive stat: from its own ability (Huge Power, Guts,
// Stakeout...) and from the defender's (Thick Fat).
export function abilityAttackMod(attacker, defender, move, category) {
    let mod = 1;
    const own = hookOf(attacker, "onModifyAtk");
    if (own) mod *= orOne(own({ self: attacker, foe: defender, move, category }));
    const theirs = hookOf(defender, "onSourceModifyAtk", attacker);
    if (theirs) mod *= orOne(theirs({ self: defender, attacker, move, category }));
    return mod;
}

// Multiplier on a move's base power: attacker's ability (Blaze, Technician, Iron Fist,
// Sheer Force...) and the defender's (Dry Skin taking extra from Fire).
export function abilityBasePowerMod(attacker, defender, move) {
    let mod = 1;
    const own = hookOf(attacker, "onBasePower");
    if (own) mod *= orOne(own({ self: attacker, foe: defender, move }));
    const theirs = hookOf(defender, "onSourceBasePower", attacker);
    if (theirs) mod *= orOne(theirs({ self: defender, attacker, move }));
    return mod;
}

// Multiplier on final damage from the defender's ability (Solid Rock/Filter on super-effective hits).
export function abilityDamageMod(attacker, defender, move, typeEff) {
    const theirs = hookOf(defender, "onSourceModifyDamage", attacker);
    return theirs ? orOne(theirs({ self: defender, attacker, move, typeEff })) : 1;
}

// STAB multiplier (Adaptability makes it x2).
export function abilityStabMultiplier(attacker) {
    const h = handlerOf(attacker);
    return h && h.stab ? h.stab : 1.5;
}

// Multiplier on accuracy from the attacker's ability (Compound Eyes, Victory Star).
export function abilityAccuracyMod(attacker) {
    const own = hookOf(attacker, "onModifyAccuracy");
    return own ? orOne(own({ self: attacker })) : 1;
}

// Unaware: it ignores the other side's stat stages.
export function ignoresBoosts(pokemon, foe = null) {
    const h = handlerOf(pokemon, foe);
    return !!h && !!h.ignoresBoosts;
}

// Guts: a burn doesn't halve its physical damage.
export function ignoresBurnDrop(pokemon) {
    const h = handlerOf(pokemon);
    return !!h && !!h.ignoresBurn;
}

// Levitate: Ground moves miss it entirely.
export function isGroundImmune(defender, attacker = null) {
    const h = handlerOf(defender, attacker);
    return !!h && !!h.groundImmune;
}

// Scrappy: Normal and Fighting moves can hit Ghost types.
export function ignoresGhostImmunity(attacker, move) {
    const h = handlerOf(attacker);
    return !!h && !!h.scrappy && (move.type.name === "normal" || move.type.name === "fighting");
}

// Sturdy: no one-hit KOs, and a hit from full HP leaves it on 1 HP.
export function blocksOhko(defender, attacker = null) {
    const h = handlerOf(defender, attacker);
    return !!h && !!h.sturdy;
}
export function sturdyEndures(defender, attacker, hpBefore, damage) {
    const h = handlerOf(defender, attacker);
    return !!h && !!h.sturdy && hpBefore === defender.hp[1] && damage >= hpBefore;
}

// Simple flags read by the battle code.
const flag = (pokemon, key, foe = null) => {
    const h = handlerOf(pokemon, foe);
    return !!h && !!h[key];
};
export const bypassesScreens = (pokemon) => flag(pokemon, "bypassesScreens");
export const hasNoRecoil = (pokemon) => flag(pokemon, "noRecoil");
export const isPowderImmune = (pokemon, attacker) => flag(pokemon, "powderImmune", attacker);
export const isWeatherImmune = (pokemon) => flag(pokemon, "weatherImmune");
export const hasUnburden = (pokemon) => flag(pokemon, "unburden");
export const hasPoisonHeal = (pokemon) => flag(pokemon, "poisonHeal");
export const boostsStatusPriority = (pokemon) => flag(pokemon, "boostsStatusPriority");
export const removesSecondaries = (pokemon) => flag(pokemon, "removesSecondaries");
export function chanceMultiplier(pokemon) {
    const h = handlerOf(pokemon);
    return h && h.chanceMultiplier ? h.chanceMultiplier : 1;
}

// Does the defender's ability soak up this move (Water Absorb vs Water, Sap Sipper vs Grass...)?
export function absorbsMove(defender, attacker, move) {
    const h = handlerOf(defender, attacker);
    return !!h && !!h.absorbs && h.absorbs.type === move.type.name && aimsAtFoe(move) && defender !== attacker;
}

// Carries out an absorb: heals, raises a stat or lights Flash Fire. Returns true if the move
// was absorbed (and so does nothing else).
export function tryAbsorb(defender, attacker, move, text, api) {
    if (!absorbsMove(defender, attacker, move)) return false;
    const a = handlerOf(defender, attacker).absorbs;
    const name = pokemonNameToString(defender);
    const label = abilityLabel(defender);
    if (a.heal) {
        const before = defender.hp[0];
        api.heal(defender, Math.floor(defender.hp[1] * a.heal), text, "'s " + label + " restored its HP!");
        if (defender.hp[0] === before) text.push("It doesn't affect " + name + "!");
    } else if (a.boost) {
        api.boost(defender, a.boost, text);
    } else if (a.flashFire) {
        if (!defender.flashFire) {
            defender.flashFire = true;
            text.push(name + "'s " + label + " powered up its Fire-type moves!");
        } else {
            text.push("It doesn't affect " + name + "!");
        }
    }
    return true;
}

// Magic Guard & co.: takes no damage from anything but attacks (poison, burn, weather,
// hazards, recoil...).
export function indirectDamageBlocked(pokemon) {
    const handler = ABILITIES[abilityName(pokemon)];
    return !!handler && !!handler.noIndirectDamage;
}

// The stat change after the owner's own ability had its say (Contrary flips it, Simple doubles it).
export function abilityModifyBoost(pokemon, change, source = null) {
    const fn = hookOf(pokemon, "onModifyBoost", source);
    return fn ? fn(change) : change;
}

// If the owner's ability stops `source` from lowering a stat, the ability's name (for the log).
export function abilityBlocksDrop(pokemon, statName, source) {
    const fn = hookOf(pokemon, "blocksDrop", source);
    return fn ? fn(statName) : null;
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
    pokemon.flashFire = false;
    pokemon.proteanUsed = false;
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
