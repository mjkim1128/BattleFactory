import ABILITY_NAMES from "./ability_names.json";
import { CONTACT_MOVES } from "./legalmoves";
import { pokemonNameToString, statNameToString } from "./helpers";
import { weatherOf, terrainOf, setWeather, setTerrain, isGrounded } from "./field";
import {
    SECONDARY_MOVES,
    PUNCH_MOVES,
    BITE_MOVES,
    PULSE_MOVES,
    SLICING_MOVES,
    SOUND_MOVES,
    BULLET_MOVES,
    WIND_MOVES,
    CRASH_MOVES,
} from "./movemechanics";
import { UNREMOVABLE_ITEMS } from "./iteminfo";
import { PogeyData } from "./pogey";

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
const ALL_STATUSES = ["paralysis", "burn", "poison", "toxic", "sleep", "freeze"];
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
        if (makesContact(attacker, move) && attacker.hp[0] > 0 && Math.random() < 0.3) inflictStatus(attacker, status, text);
    },
});
const absorbAbility = (type, effect) => ({ breakable: true, absorbs: { type, ...effect } });
// Contact damage to the attacker (Rough Skin / Iron Barbs): 1/8 of its max HP
const contactDamage = {
    onDamagingHit({ attacker, move, text, hurt }) {
        if (makesContact(attacker, move) && attacker.hp[0] > 0) hurt(attacker, Math.floor(attacker.hp[1] / 8), text, " was hurt!");
    },
};

// Does this move make contact? (Long Reach's owner never does.)
export function makesContact(attacker, move) {
    return CONTACT_MOVES.has(move.name) && abilityName(attacker) !== "long-reach";
}
const itemLabelOf = (p) => (p.item ? p.item.korean_name || p.item.name : "");
// A stat as the battle would compute it (for "highest stat" and Download style comparisons)
const stageStat = (base, stage) => {
    const raw = 2 * base + 31 + 5;
    return Math.floor(stage < 0 ? (raw * 2) / (2 - stage) : (raw * (2 + stage)) / 2);
};
const STAT_SLOTS = [["attack", 1, 0], ["defense", 2, 1], ["special-attack", 3, 2], ["special-defense", 4, 3], ["speed", 5, 4]];
const bestStatName = (p) => {
    let best = STAT_SLOTS[0];
    let value = -1;
    for (const slot of STAT_SLOTS) {
        const v = stageStat(p.base_stats[slot[1]], (p.stat_levels && p.stat_levels[slot[2]]) || 0);
        if (v > value) [best, value] = [slot, v];
    }
    return best[0];
};
const removableItem = (item) => !!item && !UNREMOVABLE_ITEMS.has(item.name);
// Sticky Hold: nothing can take or knock away its item
export function protectsItem(holder, thief) {
    const h = handlerOf(holder, thief);
    return !!h && !!h.stickyHold;
}
// Swaps `item` from `from` to `to` for the ability handlers that steal (Magician, Pickpocket)
const stealItem = (thief, victim, text) => {
    text.push(pokemonNameToString(thief) + " stole " + pokemonNameToString(victim) + "'s " + itemLabelOf(victim) + "!");
    thief.item = victim.item;
    victim.item = null;
};
const canSteal = (thief, victim) => !thief.item && removableItem(victim.item) && !protectsItem(victim, thief);

// Statuses an ability refuses (Limber, Insomnia, Water Veil...)
const blockStatus = (...names) => ({
    breakable: true,
    onSetStatus({ status }) {
        return names.includes(status) ? true : undefined;
    },
});
const weatherSetter = (weather) => ({
    onSwitchIn({ self, field, text }) {
        if (field) setWeather(field, weather, self, text);
    },
});
const terrainSetter = (terrain) => ({
    onSwitchIn({ self, field, text }) {
        if (field) setTerrain(field, terrain, self, text);
    },
});
const isSun = (field) => weatherOf(field) === "sun";
const isHail = (field) => weatherOf(field) === "hail" || weatherOf(field) === "snow";
// Speed doubles in one weather (Chlorophyll, Swift Swim, Sand Rush, Slush Rush)
const speedInWeather = (test) => ({
    onModifySpe({ field }) {
        if (test(field)) return 2;
    },
});
// Protosynthesis / Quark Drive: while the sun (or Electric Terrain) is up, its highest stat is
// boosted (x1.3, x1.5 for Speed). Which stat is chosen when it kicks in.
const boosterAbility = (label, isActive) => ({
    onUpdate({ self, field, text }) {
        const on = isActive(field);
        if (on && !self.boosterStat) {
            self.boosterStat = bestStatName(self);
            text.push(pokemonNameToString(self) + "'s " + label + " boosted its " + statNameToString(self.boosterStat) + "!");
        } else if (!on && self.boosterStat) {
            self.boosterStat = null;
            text.push(pokemonNameToString(self) + "'s " + label + " wore off.");
        }
    },
    onModifyAtk({ self, category }) {
        if (self.boosterStat === (category === "physical" ? "attack" : "special-attack")) return 1.3;
    },
    onModifyDef({ self, category }) {
        if (self.boosterStat === (category === "physical" ? "defense" : "special-defense")) return 1.3;
    },
    onModifySpe({ self }) {
        if (self.boosterStat === "speed") return 1.5;
    },
});
// Normal moves take another type and get 20% more power (Pixilate, Refrigerate); Normalize
// does the opposite; Liquid Voice turns sound moves into Water.
const NO_TYPE_CHANGE = new Set(["weather-ball", "terrain-pulse", "judgment", "multi-attack", "natural-gift", "hidden-power", "techno-blast", "struggle", "revelation-dance"]);
const skinAbility = (type) => ({
    onModifyType({ move }) {
        if (move.type.name === "normal" && move.damage_class.name !== "status") return { type, power: 4915 / 4096 };
    },
});
const recoilMove = (move) => (move.meta && move.meta.drain < 0 && move.name !== "struggle") || CRASH_MOVES.has(move.name);

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
            if (!makesContact(attacker, move)) return;
            const theirs = abilityName(attacker);
            if (!theirs || LOCKED_ABILITIES.has(theirs)) return;
            attacker.ability = getAbility("mummy");
            text.push(pokemonNameToString(attacker) + "'s ability became Mummy!");
        },
    },
    "wandering-spirit": {
        onDamagingHit({ self, attacker, move, text }) {
            if (!makesContact(attacker, move)) return;
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
            // Guard Dog / Rattled answer it (Guard Dog turns the drop into a boost)
            const reaction = hookOf(foe, "onIntimidated", self);
            if (reaction && reaction({ self: foe, text, boost }) === true) return;
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

    // ================= second batch: weather, terrain and the rest =================

    // ---- Mold Breaker & co. are markers (see ignoresAbilities) ----
    "mold-breaker": {},
    teravolt: {},
    turboblaze: {},

    // ---- setting the weather / terrain on entering ----
    drought: weatherSetter("sun"),
    drizzle: weatherSetter("rain"),
    "sand-stream": weatherSetter("sand"),
    "snow-warning": weatherSetter("snow"),
    "electric-surge": terrainSetter("electric"),
    "grassy-surge": terrainSetter("grassy"),
    "misty-surge": terrainSetter("misty"),
    "psychic-surge": terrainSetter("psychic"),
    "seed-sower": {
        onDamagingHit({ self, damage, field, text }) {
            if (damage > 0 && field) setTerrain(field, "grassy", self, text);
        },
    },
    // Cloud Nine / Air Lock: the weather still counts down, but does nothing while they are out
    "cloud-nine": { suppressesWeather: true },
    "air-lock": { suppressesWeather: true },

    // ---- speed in the weather ----
    chlorophyll: speedInWeather(isSun),
    "swift-swim": speedInWeather((field) => weatherOf(field) === "rain"),
    "sand-rush": speedInWeather((field) => weatherOf(field) === "sand"),
    "slush-rush": speedInWeather(isHail),
    protosynthesis: boosterAbility("Protosynthesis", isSun),
    "quark-drive": boosterAbility("Quark Drive", (field) => terrainOf(field) === "electric"),

    // ---- healing / hurting in the weather ----
    "rain-dish": {
        onResidual({ self, field, text, heal }) {
            if (weatherOf(field) === "rain") heal(self, Math.floor(self.hp[1] / 16), text, " restored HP with its Rain Dish!");
        },
    },
    "ice-body": {
        onResidual({ self, field, text, heal }) {
            if (isHail(field)) heal(self, Math.floor(self.hp[1] / 16), text, " restored HP with its Ice Body!");
        },
    },
    hydration: {
        onResidual({ self, field, text }) {
            if (weatherOf(field) === "rain" && self.status) {
                self.status = null;
                text.push(pokemonNameToString(self) + "'s status was cured by Hydration!");
            }
        },
    },
    "solar-power": {
        onModifyAtk({ category, field }) {
            if (category === "special" && isSun(field)) return 1.5;
        },
        onResidual({ self, field, text, hurt }) {
            if (isSun(field)) hurt(self, Math.floor(self.hp[1] / 8), text, " was hurt by its Solar Power!");
        },
    },
    "sand-force": {
        onBasePower({ move, field }) {
            if (weatherOf(field) === "sand" && ["rock", "ground", "steel"].includes(move.type.name)) return 5325 / 4096;
        },
    },
    "sand-veil": {
        breakable: true,
        onSourceModifyAccuracy({ field }) {
            if (weatherOf(field) === "sand") return 0.8;
        },
    },
    "snow-cloak": {
        breakable: true,
        onSourceModifyAccuracy({ field }) {
            if (isHail(field)) return 0.8;
        },
    },
    "leaf-guard": {
        breakable: true,
        onSetStatus({ status, field }) {
            if (isSun(field) && status !== "confusion") return true;
        },
    },
    "flower-gift": {
        breakable: true,
        onModifyAtk({ category, field }) {
            if (category === "physical" && isSun(field)) return 1.5;
        },
        onModifyDef({ category, field }) {
            if (category === "special" && isSun(field)) return 1.5;
        },
    },
    "grass-pelt": {
        breakable: true,
        onModifyDef({ category, field }) {
            if (category === "physical" && terrainOf(field) === "grassy") return 1.5;
        },
    },
    harvest: {
        onResidual({ self, field, text }) {
            const berry = self.consumedItem;
            if (self.hp[0] <= 0 || self.item || !berry || !berry.name.endsWith("-berry")) return;
            if (!isSun(field) && Math.random() >= 0.5) return;
            self.item = berry;
            self.consumedItem = null;
            text.push(pokemonNameToString(self) + " harvested one " + (berry.korean_name || berry.name) + "!");
        },
    },

    // ---- power and stat modifiers ----
    reckless: {
        onBasePower({ move }) {
            if (recoilMove(move)) return 4915 / 4096;
        },
    },
    analytic: {
        onBasePower({ foe }) {
            if (foe && (foe.movedThisTurn || foe.hp[0] <= 0)) return 5325 / 4096;
        },
    },
    "toxic-boost": {
        onBasePower({ self, move }) {
            if (move.damage_class.name === "physical" && self.status && (self.status.name === "poison" || self.status.name === "toxic")) return 1.5;
        },
    },
    "tough-claws": {
        onBasePower({ self, move }) {
            if (makesContact(self, move)) return 5325 / 4096;
        },
    },
    "strong-jaw": {
        onBasePower({ move }) {
            if (BITE_MOVES.has(move.name)) return 1.5;
        },
    },
    "mega-launcher": {
        onBasePower({ move }) {
            if (PULSE_MOVES.has(move.name)) return 1.5;
        },
    },
    sharpness: {
        onBasePower({ move }) {
            if (SLICING_MOVES.has(move.name)) return 1.5;
        },
    },
    "steely-spirit": {
        onBasePower({ move }) {
            if (move.type.name === "steel") return 1.5;
        },
    },
    "supreme-overlord": {
        onBasePower({ self }) {
            return 1 + 0.1 * Math.min(5, self.faintedAllies || 0);
        },
    },
    steelworker: {
        onModifyAtk({ move }) {
            if (move.type.name === "steel") return 1.5;
        },
    },
    "dragons-maw": {
        onModifyAtk({ move }) {
            if (move.type.name === "dragon") return 1.5;
        },
    },
    transistor: {
        onModifyAtk({ move }) {
            if (move.type.name === "electric") return 5325 / 4096;
        },
    },
    hustle: {
        onModifyAtk({ category }) {
            if (category === "physical") return 1.5;
        },
        onModifyAccuracy({ move }) {
            if (move.damage_class.name === "physical") return 0.8;
        },
    },
    defeatist: {
        onModifyAtk({ self }) {
            if (self.hp[0] * 2 <= self.hp[1]) return 0.5;
        },
    },
    "tinted-lens": {
        onModifyDamage({ typeEff }) {
            if (typeEff < 1) return 2;
        },
    },
    sniper: { critMultiplier: 1.5 },
    "super-luck": { critBoost: 1 },
    "battle-armor": { breakable: true, critImmune: true },
    "shell-armor": { breakable: true, critImmune: true },
    "skill-link": { maxHits: true },
    "no-guard": { noGuard: true },
    "water-bubble": {
        ...blockStatus("burn"),
        onModifyAtk({ move }) {
            if (move.type.name === "water") return 2;
        },
        onSourceModifyAtk({ move }) {
            if (move.type.name === "fire") return 0.5;
        },
    },
    heatproof: {
        breakable: true,
        halvesBurn: true,
        onSourceModifyAtk({ move }) {
            if (move.type.name === "fire") return 0.5;
        },
    },
    "punk-rock": {
        breakable: true,
        onBasePower({ move }) {
            if (SOUND_MOVES.has(move.name)) return 5325 / 4096;
        },
        onSourceModifyDamage({ move }) {
            if (SOUND_MOVES.has(move.name)) return 0.5;
        },
    },
    fluffy: {
        breakable: true,
        onSourceModifyDamage({ attacker, move }) {
            let mod = 1;
            if (makesContact(attacker, move)) mod *= 0.5;
            if (move.type.name === "fire") mod *= 2;
            return mod;
        },
    },
    "ice-scales": {
        breakable: true,
        onSourceModifyDamage({ move }) {
            if (move.damage_class.name === "special") return 0.5;
        },
    },
    multiscale: {
        breakable: true,
        onSourceModifyDamage({ self }) {
            if (self.hp[0] === self.hp[1]) return 0.5;
        },
    },
    "fur-coat": {
        breakable: true,
        onModifyDef({ category }) {
            if (category === "physical") return 2;
        },
    },
    "marvel-scale": {
        breakable: true,
        onModifyDef({ self, category }) {
            if (category === "physical" && self.status) return 1.5;
        },
    },
    // Ruin abilities weaken everyone else's stat (never their owner's)
    "tablets-of-ruin": {
        onSourceModifyAtk({ category }) {
            if (category === "physical") return 0.75;
        },
        onSwitchIn({ self, text }) {
            text.push(pokemonNameToString(self) + "'s Tablets of Ruin weakened the Attack of all surrounding Pokemon!");
        },
    },
    "vessel-of-ruin": {
        onSourceModifyAtk({ category }) {
            if (category === "special") return 0.75;
        },
        onSwitchIn({ self, text }) {
            text.push(pokemonNameToString(self) + "'s Vessel of Ruin weakened the Sp. Atk of all surrounding Pokemon!");
        },
    },
    "sword-of-ruin": {
        onFoeModifyDef({ category }) {
            if (category === "physical") return 0.75;
        },
        onSwitchIn({ self, text }) {
            text.push(pokemonNameToString(self) + "'s Sword of Ruin weakened the Defense of all surrounding Pokemon!");
        },
    },
    "beads-of-ruin": {
        onFoeModifyDef({ category }) {
            if (category === "special") return 0.75;
        },
        onSwitchIn({ self, text }) {
            text.push(pokemonNameToString(self) + "'s Beads of Ruin weakened the Sp. Def of all surrounding Pokemon!");
        },
    },
    "wonder-guard": { breakable: true, wonderGuard: true },

    // ---- moves that change type / priority ----
    pixilate: skinAbility("fairy"),
    refrigerate: skinAbility("ice"),
    normalize: {
        onModifyType({ move }) {
            if (move.type.name !== "normal" && move.damage_class.name !== "status") return { type: "normal", power: 4915 / 4096 };
        },
    },
    "liquid-voice": {
        onModifyType({ move }) {
            if (SOUND_MOVES.has(move.name)) return { type: "water", power: 1 };
        },
    },
    "gale-wings": {
        onModifyPriority({ self, move }) {
            if (self.hp[0] === self.hp[1] && move.type.name === "flying") return 1;
        },
    },
    triage: {
        onModifyPriority({ move }) {
            if (move.meta && (move.meta.healing > 0 || move.meta.drain > 0)) return 3;
        },
    },

    // ---- immunities that soak up a move ----
    "motor-drive": absorbAbility("electric", { boost: [{ stat: { name: "speed" }, change: 1 }] }),
    "earth-eater": absorbAbility("ground", { heal: 1 / 4 }),
    "well-baked-body": absorbAbility("fire", { boost: [{ stat: { name: "defense" }, change: 2 }] }),
    "wind-rider": { breakable: true, absorbs: { moves: WIND_MOVES, boost: [{ stat: { name: "attack" }, change: 1 }] } },
    bulletproof: { breakable: true, absorbs: { moves: BULLET_MOVES, nothing: true } },
    soundproof: { breakable: true, absorbs: { moves: SOUND_MOVES, nothing: true } },
    "good-as-gold": { breakable: true, blocksStatusMoves: true },
    "queenly-majesty": { breakable: true, blocksPriority: true },
    dazzling: { breakable: true, blocksPriority: true },
    "armor-tail": { breakable: true, blocksPriority: true },

    // ---- status immunities ----
    limber: blockStatus("paralysis"),
    insomnia: blockStatus("sleep"),
    "vital-spirit": blockStatus("sleep"),
    "sweet-veil": blockStatus("sleep"),
    "water-veil": blockStatus("burn"),
    "magma-armor": blockStatus("freeze"),
    "own-tempo": blockStatus("confusion"),
    "purifying-salt": {
        ...blockStatus(...ALL_STATUSES),
        onSourceModifyAtk({ move }) {
            if (move.type.name === "ghost") return 0.5;
        },
    },
    "shield-dust": { breakable: true, blocksSecondary: true },
    "inner-focus": { breakable: true, preventsFlinch: true },
    steadfast: {
        onFlinch({ self, text, boost }) {
            boost(self, [{ stat: { name: "speed" }, change: 1 }], text);
        },
    },
    "early-bird": { earlyBird: true },
    corrosion: { poisonsAnything: true },
    "hyper-cutter": { breakable: true, blocksDrop: (stat) => (stat === "attack" ? "Hyper Cutter" : null) },
    "big-pecks": { breakable: true, blocksDrop: (stat) => (stat === "defense" ? "Big Pecks" : null) },
    "keen-eye": { breakable: true, ignoresEvasion: true, blocksDrop: (stat) => (stat === "accuracy" ? "Keen Eye" : null) },
    illuminate: { breakable: true, ignoresEvasion: true, blocksDrop: (stat) => (stat === "accuracy" ? "Illuminate" : null) },
    "tangled-feet": {
        breakable: true,
        onSourceModifyAccuracy({ self }) {
            if (self.confusion) return 0.5;
        },
    },
    "wonder-skin": {
        breakable: true,
        onSourceModifyAccuracy({ move }) {
            if (move.damage_class.name === "status" && move.accuracy > 50) return 50 / move.accuracy;
        },
    },
    "sticky-hold": { breakable: true, stickyHold: true },
    oblivious: {}, // (only its Intimidate immunity, see INTIMIDATE_IMMUNE)
    "long-reach": {}, // (its moves don't make contact, see makesContact)
    damp: { breakable: true },

    // ---- trapping the opposing pokemon ----
    "arena-trap": { trapsFoe: (victim) => isGrounded(victim) },
    "shadow-tag": { trapsFoe: (victim) => abilityName(victim) !== "shadow-tag" },
    "magnet-pull": { trapsFoe: (victim) => victim.types.some((t) => t.type.name === "steel") },

    // ---- PP, berries, information ----
    pressure: {
        onSwitchIn({ self, text }) {
            text.push(pokemonNameToString(self) + " is exerting its pressure!");
        },
    },
    unnerve: {
        unnerves: true,
        onSwitchIn({ self, text }) {
            text.push(pokemonNameToString(self) + " is too nervous to eat Berries!");
        },
    },
    gluttony: { gluttony: true },
    ripen: { ripen: true },
    "cheek-pouch": {
        onEatBerry({ self, text, heal }) {
            heal(self, Math.floor(self.hp[1] / 3), text, " restored HP with its Cheek Pouch!");
        },
    },
    frisk: {
        onSwitchIn({ self, foe, text }) {
            if (foe && foe.hp[0] > 0 && foe.item) text.push(pokemonNameToString(self) + " frisked " + pokemonNameToString(foe) + " and found its " + itemLabelOf(foe) + "!");
        },
    },
    forewarn: {
        onSwitchIn({ self, foe, text }) {
            if (!foe || foe.hp[0] <= 0) return;
            const moves = (foe.moveset || []).filter((m) => m.damage_class.name !== "status");
            if (moves.length === 0) return;
            const strongest = moves.reduce((a, b) => ((b.power || 0) > (a.power || 0) ? b : a));
            text.push(pokemonNameToString(self) + "'s Forewarn alerted it to " + (strongest.korean_name || strongest.name) + "!");
        },
    },
    anticipation: {
        onSwitchIn({ self, foe, text }) {
            if (!foe || foe.hp[0] <= 0) return;
            const scary = (foe.moveset || []).some(
                (m) => m.damage_class.name !== "status" && (PogeyData.getMoveResult(m, self) > 1 || ["fissure", "guillotine", "horn-drill", "sheer-cold"].includes(m.name))
            );
            if (scary) text.push(pokemonNameToString(self) + " shuddered!");
        },
    },
    "screen-cleaner": {
        onSwitchIn({ self, selfTeam, foeTeam, text }) {
            const screened = [selfTeam, foeTeam].filter((t) => t && (t.reflectTurns > 0 || t.lightScreenTurns > 0 || t.auroraTurns > 0));
            if (screened.length === 0) return;
            for (const t of screened) [t.reflectTurns, t.lightScreenTurns, t.auroraTurns] = [0, 0, 0];
            text.push(pokemonNameToString(self) + "'s Screen Cleaner cleared the screens!");
        },
    },
    download: {
        onSwitchIn({ self, foe, text, boost }) {
            if (!foe || foe.hp[0] <= 0) return;
            const def = stageStat(foe.base_stats[2], foe.stat_levels[1] || 0);
            const spd = stageStat(foe.base_stats[4], foe.stat_levels[3] || 0);
            boost(self, [{ stat: { name: def >= spd ? "special-attack" : "attack" }, change: 1 }], text);
        },
    },

    // ---- end of turn ----
    "shed-skin": {
        onResidual({ self, text }) {
            if (self.hp[0] > 0 && self.status && Math.random() < 1 / 3) {
                self.status = null;
                text.push(pokemonNameToString(self) + "'s Shed Skin cured its status!");
            }
        },
    },
    "bad-dreams": {
        onResidual({ foe, text, hurt }) {
            if (foe && foe.hp[0] > 0 && foe.status && foe.status.name === "sleep") hurt(foe, Math.floor(foe.hp[1] / 8), text, " is having a nightmare!");
        },
    },
    moody: {
        onResidual({ self, text, boost }) {
            if (self.hp[0] <= 0) return;
            const names = ["attack", "defense", "special-attack", "special-defense", "speed"];
            const ups = names.filter((n, i) => (self.stat_levels[i] || 0) < 6);
            const up = ups.length > 0 ? ups[Math.floor(Math.random() * ups.length)] : null;
            const downs = names.filter((n, i) => (self.stat_levels[i] || 0) > -6 && n !== up);
            const down = downs.length > 0 ? downs[Math.floor(Math.random() * downs.length)] : null;
            const changes = [];
            if (up) changes.push({ stat: { name: up }, change: 2 });
            if (down) changes.push({ stat: { name: down }, change: -1 });
            if (changes.length > 0) boost(self, changes, text);
        },
    },

    // ---- being hit ----
    "weak-armor": {
        onDamagingHit({ self, move, damage, text, boost }) {
            if (damage > 0 && move.damage_class.name === "physical") {
                boost(self, [{ stat: { name: "defense" }, change: -1 }, { stat: { name: "speed" }, change: 2 }], text);
            }
        },
    },
    stamina: {
        onDamagingHit({ self, damage, text, boost }) {
            if (damage > 0) boost(self, [{ stat: { name: "defense" }, change: 1 }], text);
        },
    },
    "water-compaction": {
        onDamagingHit({ self, move, damage, text, boost }) {
            if (damage > 0 && move.type.name === "water") boost(self, [{ stat: { name: "defense" }, change: 2 }], text);
        },
    },
    "thermal-exchange": {
        ...blockStatus("burn"),
        onDamagingHit({ self, move, damage, text, boost }) {
            if (damage > 0 && move.type.name === "fire") boost(self, [{ stat: { name: "attack" }, change: 1 }], text);
        },
    },
    rattled: {
        onDamagingHit({ self, move, damage, text, boost }) {
            if (damage > 0 && ["bug", "dark", "ghost"].includes(move.type.name)) boost(self, [{ stat: { name: "speed" }, change: 1 }], text);
        },
        onIntimidated({ self, text, boost }) {
            boost(self, [{ stat: { name: "speed" }, change: 1 }], text);
            return false; // it is still intimidated
        },
    },
    "guard-dog": {
        breakable: true,
        onIntimidated({ self, text, boost }) {
            boost(self, [{ stat: { name: "attack" }, change: 1 }], text);
            return true;
        },
    },
    berserk: {
        onHpBelowHalf({ self, text, boost }) {
            boost(self, [{ stat: { name: "special-attack" }, change: 1 }], text);
        },
    },
    "anger-shell": {
        onHpBelowHalf({ self, text, boost }) {
            boost(
                self,
                [
                    { stat: { name: "attack" }, change: 1 },
                    { stat: { name: "special-attack" }, change: 1 },
                    { stat: { name: "speed" }, change: 1 },
                    { stat: { name: "defense" }, change: -1 },
                    { stat: { name: "special-defense" }, change: -1 },
                ],
                text
            );
        },
    },
    gooey: {
        onDamagingHit({ self, attacker, move, text, boost }) {
            if (makesContact(attacker, move) && attacker.hp[0] > 0) boost(attacker, [{ stat: { name: "speed" }, change: -1 }], text, self);
        },
    },
    pickpocket: {
        onDamagingHit({ self, attacker, move, text }) {
            if (self.hp[0] > 0 && makesContact(attacker, move) && canSteal(self, attacker)) stealItem(self, attacker, text);
        },
    },
    aftermath: {
        onDamagingHit({ self, attacker, move, text, hurt }) {
            if (self.hp[0] === 0 && makesContact(attacker, move) && abilityName(attacker) !== "damp") {
                hurt(attacker, Math.floor(attacker.hp[1] / 4), text, " was hurt by Aftermath!");
            }
        },
    },
    "innards-out": {
        onDamagingHit({ self, attacker, damage, text, hurt }) {
            if (self.hp[0] === 0 && damage > 0) hurt(attacker, damage, text, " was hurt by Innards Out!");
        },
    },
    "effect-spore": {
        onDamagingHit({ attacker, move, text, inflictStatus }) {
            if (!makesContact(attacker, move) || attacker.hp[0] <= 0) return;
            if (attacker.types.some((t) => t.type.name === "grass") || isPowderImmune(attacker, null)) return;
            const r = Math.random() * 100;
            if (r < 11) inflictStatus(attacker, "sleep", text);
            else if (r < 21) inflictStatus(attacker, "paralysis", text);
            else if (r < 30) inflictStatus(attacker, "poison", text);
        },
    },
    "liquid-ooze": { liquidOoze: true },

    // ---- hitting things ----
    "poison-touch": {
        onAttackHit({ self, defender, move, sheerForced, text, inflictStatus }) {
            if (!sheerForced && makesContact(self, move) && !blocksSecondaryEffects(defender, self) && Math.random() < 0.3) inflictStatus(defender, "poison", text);
        },
    },
    "toxic-chain": {
        onAttackHit({ self, defender, sheerForced, text, inflictStatus }) {
            if (!sheerForced && !blocksSecondaryEffects(defender, self) && Math.random() < 0.3) inflictStatus(defender, "toxic", text);
        },
    },
    "poison-puppeteer": {
        onStatusGiven({ defender, status, text }) {
            if (!["poison", "toxic"].includes(status) || defender.confusion || abilityBlocksStatus(defender, "confusion")) return;
            defender.confusion = { counter: 2 + Math.floor(Math.random() * 4) };
            text.push(pokemonNameToString(defender) + " became confused!");
        },
    },
    magician: {
        onAttackHit({ self, defender, damage, text }) {
            if (damage > 0 && self.hp[0] > 0 && canSteal(self, defender)) stealItem(self, defender, text);
        },
    },

    // ---- knocking something out ----
    "soul-heart": {
        onKO({ self, text, boost }) {
            boost(self, [{ stat: { name: "special-attack" }, change: 1 }], text);
        },
    },
    "chilling-neigh": {
        onKO({ self, text, boost }) {
            boost(self, [{ stat: { name: "attack" }, change: 1 }], text);
        },
    },
    "grim-neigh": {
        onKO({ self, text, boost }) {
            boost(self, [{ stat: { name: "special-attack" }, change: 1 }], text);
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
export function abilityAttackMod(attacker, defender, move, category, field = null) {
    let mod = 1;
    const own = hookOf(attacker, "onModifyAtk");
    if (own) mod *= orOne(own({ self: attacker, foe: defender, move, category, field }));
    const theirs = hookOf(defender, "onSourceModifyAtk", attacker);
    if (theirs) mod *= orOne(theirs({ self: defender, attacker, move, category, field }));
    return mod;
}

// Multiplier on the defender's defensive stat: its own ability (Fur Coat, Marvel Scale...) and
// the attacker's (Sword / Beads of Ruin).
export function abilityDefenseMod(attacker, defender, move, category, field = null) {
    let mod = 1;
    const own = hookOf(defender, "onModifyDef", attacker);
    if (own) mod *= orOne(own({ self: defender, foe: attacker, move, category, field }));
    const theirs = hookOf(attacker, "onFoeModifyDef");
    if (theirs) mod *= orOne(theirs({ self: attacker, defender, move, category, field }));
    return mod;
}

// Multiplier on a move's base power: attacker's ability (Blaze, Technician, Iron Fist,
// Sheer Force...) and the defender's (Dry Skin taking extra from Fire).
export function abilityBasePowerMod(attacker, defender, move, field = null) {
    let mod = 1;
    const own = hookOf(attacker, "onBasePower");
    if (own) mod *= orOne(own({ self: attacker, foe: defender, move, field }));
    const theirs = hookOf(defender, "onSourceBasePower", attacker);
    if (theirs) mod *= orOne(theirs({ self: defender, attacker, move, field }));
    return mod;
}

// Multiplier on final damage from the defender's ability (Solid Rock/Filter on super-effective hits).
export function abilityDamageMod(attacker, defender, move, typeEff, field = null) {
    let mod = 1;
    const own = hookOf(attacker, "onModifyDamage");
    if (own) mod *= orOne(own({ self: attacker, foe: defender, move, typeEff, field }));
    const theirs = hookOf(defender, "onSourceModifyDamage", attacker);
    if (theirs) mod *= orOne(theirs({ self: defender, attacker, move, typeEff, field }));
    return mod;
}

// A critical hit's damage multiplier (Sniper makes it 1.5 x 1.5)
export function abilityCritMultiplier(attacker) {
    const h = handlerOf(attacker);
    return 1.5 * (h && h.critMultiplier ? h.critMultiplier : 1);
}

// STAB multiplier (Adaptability makes it x2).
export function abilityStabMultiplier(attacker) {
    const h = handlerOf(attacker);
    return h && h.stab ? h.stab : 1.5;
}

// Multiplier on accuracy from the attacker's ability (Compound Eyes, Victory Star, Hustle)
// and from the defender's (Sand Veil, Snow Cloak, Tangled Feet, Wonder Skin).
export function abilityAccuracyMod(attacker, move = null) {
    const own = hookOf(attacker, "onModifyAccuracy");
    return own ? orOne(own({ self: attacker, move })) : 1;
}
export function abilityEvasionMod(defender, attacker, move, field = null) {
    const theirs = hookOf(defender, "onSourceModifyAccuracy", attacker);
    return theirs ? orOne(theirs({ self: defender, attacker, move, field })) : 1;
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
export const hasMaxHits = (pokemon) => flag(pokemon, "maxHits"); // Skill Link
export const hasNoGuard = (pokemon) => flag(pokemon, "noGuard");
export const ignoresEvasion = (pokemon) => flag(pokemon, "ignoresEvasion"); // Keen Eye / Illuminate
export const canPoisonAnything = (pokemon) => flag(pokemon, "poisonsAnything"); // Corrosion
export const hasEarlyBird = (pokemon) => flag(pokemon, "earlyBird");
export const halvesBurnDamage = (pokemon) => flag(pokemon, "halvesBurn");
export const hasLiquidOoze = (pokemon, attacker = null) => flag(pokemon, "liquidOoze", attacker);
export const suppressesWeather = (pokemon) => flag(pokemon, "suppressesWeather");
export const unnervesFoes = (pokemon) => flag(pokemon, "unnerves");
export const hasGluttony = (pokemon) => flag(pokemon, "gluttony");
export const hasRipen = (pokemon) => flag(pokemon, "ripen");
// Shield Dust: the secondary effects of a move (status, flinch, stat drops) don't land
export const blocksSecondaryEffects = (defender, attacker = null) => flag(defender, "blocksSecondary", attacker);
// Inner Focus: can't be flinched
export const preventsFlinch = (defender, attacker = null) => flag(defender, "preventsFlinch", attacker);
// Battle Armor / Shell Armor: no critical hits
export const critImmune = (defender, attacker = null) => flag(defender, "critImmune", attacker);
// Good as Gold: status moves aimed at it fail
export const blocksStatusMoves = (defender, attacker = null) => flag(defender, "blocksStatusMoves", attacker);
// Queenly Majesty / Dazzling / Armor Tail: priority moves aimed at it fail
export const blocksPriorityMoves = (defender, attacker = null) => flag(defender, "blocksPriority", attacker);
// Wonder Guard: only super-effective hits get through
export const isWonderGuard = (defender, attacker = null) => flag(defender, "wonderGuard", attacker);
export function critStageBonus(pokemon) {
    const h = handlerOf(pokemon);
    return h && h.critBoost ? h.critBoost : 0;
}

// Arena Trap / Shadow Tag / Magnet Pull: can `trapper` keep `victim` from switching out?
export function trapsFoe(trapper, victim) {
    const h = handlerOf(trapper);
    return !!h && !!h.trapsFoe && h.trapsFoe(victim);
}

// The type/power change an ability gives a move (Pixilate, Normalize, Liquid Voice): returns
// a changed copy of the move, or the same move.
export function abilityAdaptMove(attacker, move) {
    const fn = hookOf(attacker, "onModifyType");
    if (!fn || NO_TYPE_CHANGE.has(move.name) || move.type.name === "typeless") return move;
    const change = fn({ self: attacker, move });
    if (!change) return move;
    return { ...move, type: { name: change.type }, abilityPowerMod: change.power || 1 };
}

// Extra priority an ability gives a move (Gale Wings, Triage)
export function abilityPriorityBonus(pokemon, move) {
    const fn = hookOf(pokemon, "onModifyPriority");
    return fn ? fn({ self: pokemon, move }) || 0 : 0;
}

// Speed multiplier from the ability (Chlorophyll, Swift Swim, Quark Drive...)
export function abilitySpeedMod(pokemon, field) {
    const fn = hookOf(pokemon, "onModifySpe");
    return fn ? orOne(fn({ self: pokemon, field })) : 1;
}
export function chanceMultiplier(pokemon) {
    const h = handlerOf(pokemon);
    return h && h.chanceMultiplier ? h.chanceMultiplier : 1;
}

// Does the defender's ability soak up this move (Water Absorb vs Water, Sap Sipper vs Grass...)?
export function absorbsMove(defender, attacker, move) {
    const h = handlerOf(defender, attacker);
    if (!h || !h.absorbs || !aimsAtFoe(move) || defender === attacker) return false;
    return h.absorbs.type === move.type.name || (!!h.absorbs.moves && h.absorbs.moves.has(move.name));
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
    } else if (a.nothing) {
        text.push("It doesn't affect " + name + "!");
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
export function abilityBlocksStatus(pokemon, status, attacker = null, field = null) {
    const fn = hookOf(pokemon, "onSetStatus", attacker);
    return !!fn && fn({ self: pokemon, status, field }) === true;
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
    pokemon.boosterStat = null; // Protosynthesis / Quark Drive
    pokemon.movedThisTurn = false;
    pokemon.unnerved = false;
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
