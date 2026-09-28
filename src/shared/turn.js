import { makeMove, switchPokemon } from "./computermove";
import { damageCalc, statCalc, typeEffectiveness } from "./damagecalc";
import {
    moveNameToString,
    pokemonNameToString,
    statNameToString,
} from "./helpers";
import { FOE_TARGETS, isOhkoMove, ohkoImmune, rollAccuracy } from "./accuracy";
import { spendPP } from "./pp";
import {
    HAZARD_MOVES,
    CLEAR_OWN_SIDE_MOVES,
    CLEAR_BOTH_SIDES_MOVES,
    setHazard,
    clearHazards,
    applyHazards,
} from "./hazards";
import { rollCrit } from "./crit";
import {
    abilityName,
    abilityBlocksStatus,
    abilityModifyBoost,
    abilityBlocksDrop,
    bouncesMoves,
    ignoresAbilities,
    runHook,
    resetAbilityState,
    absorbsMove,
    tryAbsorb,
    blocksOhko,
    sturdyEndures,
    bypassesScreens,
    hasNoRecoil,
    isPowderImmune,
    hasUnburden,
    hasPoisonHeal,
    boostsStatusPriority,
    removesSecondaries,
    chanceMultiplier,
    indirectDamageBlocked,
    abilityLabel,
    makesContact,
    abilityAdaptMove,
    abilityPriorityBonus,
    abilitySpeedMod,
    trapsFoe,
    suppressesWeather,
    unnervesFoes,
    hasMaxHits,
    hasNoGuard,
    canPoisonAnything,
    hasEarlyBird,
    halvesBurnDamage,
    hasLiquidOoze,
    hasGluttony,
    hasRipen,
    blocksSecondaryEffects,
    preventsFlinch,
    blocksStatusMoves,
    blocksPriorityMoves,
    protectsItem,
} from "./abilities";
import {
    ensureField,
    weatherOf,
    terrainOf,
    isGrounded,
    setWeather,
    setTerrain,
    tickWeather,
    tickTerrain,
    adaptMoveToField,
    WEATHER_MOVES,
    TERRAIN_MOVES,
    weatherBlocksStatus,
    terrainBlocksStatus,
    terrainBlocksPriority,
    weatherHealPercent,
    weatherEndOfTurnDamage,
} from "./field";
import {
    DEFROST_MOVES,
    THAWS_TARGET_MOVES,
    TOXIC_MOVES,
    POWDER_MOVES,
    STATUS_IMMUNE_TYPES,
    CHARGE_MOVES,
    RECHARGE_MOVES,
    SUPPORTED_PIVOT_MOVES,
    MULTIHIT_MOVES,
    SEMI_INVULNERABLE_MOVES,
    CRASH_MOVES,
    CHARGE_TURN_BOOSTS,
    ROLLS_ACCURACY_EACH_HIT,
    ESCALATING_MULTIHIT,
    BINDING_MOVES,
    TRAPPING_MOVES,
    FIRST_TURN_ONLY_MOVES,
    REFLECTABLE_MOVES,
    DANCE_MOVES,
    SECONDARY_MOVES,
    EXPLOSIVE_MOVES,
} from "./movemechanics";
import {
    RESIST_BERRIES,
    STAT_BOOST_BERRIES,
    HP_HEAL_BERRIES,
    BERRY_JUICE,
    CUSTAP_BERRY,
    KEE_BERRY,
    WHITE_HERB,
    WEAKNESS_POLICY,
    AIR_BALLOON,
    FOCUS_SASH,
    LIFE_ORB,
    BLACK_SLUDGE,
    LEFTOVERS,
    COVERT_CLOAK,
    METRONOME_ITEM,
    CHOICE_ITEMS,
    UNREMOVABLE_ITEMS,
    ROCKY_HELMET,
    STICKY_BARB,
    TOXIC_ORB,
    FLAME_ORB,
    LIGHT_CLAY,
    POWER_HERB,
    LOADED_DICE,
    STATUS_CURE_BERRIES,
    SHED_SHELL,
} from "./iteminfo";

// The actions ability handlers can take (they live in abilities.js, which can't import this
// file): change stats, hurt/heal, give a status, disable a move.
function abilityApi(field) {
    return {
        boost: (pokemon, changes, t, source = null) => {
            addArrayToArray(t, doStatChanges(pokemon, { stat_changes: changes }, source));
            tryConsumeWhiteHerb(pokemon, t);
        },
        inflictStatus: (pokemon, status, t) => inflictStatusDirect(pokemon, status, t, field),
        // indirect damage, which Magic Guard shrugs off
        hurt: (pokemon, amount, t, msg) => {
            if (indirectDamageBlocked(pokemon) || pokemon.hp[0] <= 0) return;
            pokemon.hp[0] = Math.max(0, pokemon.hp[0] - Math.max(1, amount));
            t.push(pokemonNameToString(pokemon) + msg);
            if (pokemon.hp[0] === 0) t.push(pokemonNameToString(pokemon) + " fainted!");
        },
        heal: (pokemon, amount, t, msg) => {
            const healed = Math.min(amount, pokemon.hp[1] - pokemon.hp[0]);
            if (healed <= 0 || pokemon.hp[0] <= 0) return 0;
            pokemon.hp[0] += healed;
            t.push(pokemonNameToString(pokemon) + msg);
            return healed;
        },
        disable: (pokemon, move, t) => {
            pokemon.disabled = { move: move.name, turns: 5 };
            t.push(pokemonNameToString(pokemon) + "'s " + moveNameToString(move) + " was disabled!");
        },
    };
}

function hasCustapBoost(pokemon) {
    return (
        pokemon.item &&
        pokemon.item.name === CUSTAP_BERRY &&
        pokemon.hp[0] / pokemon.hp[1] <= 0.25
    );
}

// Consuming an item (eating a berry, popping a balloon, etc.) stashes it as the pokemon's
// "last consumed item" instead of just discarding it, so Recycle can restore it later.
function consumeItem(pokemon) {
    // Cud Chew: a berry that gets eaten is eaten again at the end of the next turn
    if (pokemon.item && pokemon.item.name.endsWith("-berry") && abilityName(pokemon) === "cud-chew") {
        pokemon.cudChew = { berry: pokemon.item, turns: 2 };
    }
    pokemon.consumedItem = pokemon.item;
    pokemon.item = null;
}

function isRemovable(item) {
    return item && !UNREMOVABLE_ITEMS.has(item.name);
}

// Applies a berry's "eaten" effect immediately (used by Bug Bite/Pluck stealing the
// defender's berry), without the HP-fraction gating tryConsumeHpTriggeredItem uses for
// a berry reacting to its own holder's HP dropping. Takes the berry object directly
// rather than reading pokemon.item, since the eater usually never held this berry.
function applyBerryEffect(pokemon, berry, text) {
    const name = berry.name;
    const label = berry.korean_name || berry.name;
    const mult = hasRipen(pokemon) ? 2 : 1; // Ripen doubles a berry's effect
    let healAmount = 0;
    if (name === BERRY_JUICE) healAmount = 20;
    else if (name === "sitrus-berry") healAmount = Math.floor(pokemon.hp[1] / 4);
    else if (HP_HEAL_BERRIES.has(name)) healAmount = Math.floor(pokemon.hp[1] / 3);
    if (healAmount > 0 && pokemon.hp[0] < pokemon.hp[1]) {
        pokemon.hp[0] = Math.min(pokemon.hp[1], pokemon.hp[0] + healAmount * mult);
        text.push(pokemonNameToString(pokemon) + " ate the " + label + " and restored HP!");
        afterBerry(pokemon, text);
        return;
    }
    const statIndex = STAT_BOOST_BERRIES[name];
    if (statIndex !== undefined) {
        addArrayToArray(text, doStatChangesRaw(pokemon, [{ statIndex, change: mult }]));
    }
    if (STATUS_CURE_BERRIES[name]) cureConditions(pokemon, STATUS_CURE_BERRIES[name], label, text);
    afterBerry(pokemon, text);
}

// Cheek Pouch heals after any berry is eaten
function afterBerry(pokemon, text) {
    if (pokemon.hp[0] > 0) runHook(pokemon, "onEatBerry", { text, ...abilityApi(null) });
}

// The other side's Unnerve stops a pokemon from eating berries
function berryBlocked(pokemon) {
    return !!pokemon.unnerved && !!pokemon.item && pokemon.item.name.endsWith("-berry");
}

// Removes whichever of `cures` the pokemon currently has; returns true if it cured anything.
function cureConditions(pokemon, cures, berryLabel, text) {
    const cured = [];
    if (pokemon.status && cures.includes(pokemon.status.name)) {
        cured.push(pokemon.status.name);
        pokemon.status = null;
    }
    if (pokemon.confusion && cures.includes("confusion")) {
        cured.push("confusion");
        pokemon.confusion = null;
    }
    if (cured.length === 0) return false;
    text.push(
        pokemonNameToString(pokemon) + " was cured of " + cured.join(" and ") + " by the " + berryLabel + "!"
    );
    return true;
}

// A status-curing berry (Lum, Chesto, ...) is eaten the moment its holder gets a condition
// it cures. Called wherever a pokemon can pick one up.
function tryConsumeStatusCureItem(pokemon, text) {
    if (!pokemon.item || pokemon.hp[0] <= 0 || berryBlocked(pokemon)) return;
    const cures = STATUS_CURE_BERRIES[pokemon.item.name];
    if (!cures) return;
    const applies =
        (pokemon.status && cures.includes(pokemon.status.name)) ||
        (pokemon.confusion && cures.includes("confusion"));
    if (!applies) return;
    const label = itemLabel(pokemon);
    consumeItem(pokemon);
    cureConditions(pokemon, cures, label, text);
    afterBerry(pokemon, text);
}

// Speed used for turn-order only: applies stat stage, Choice Scarf's 1.5x, and
// paralysis's 0.5x (modern-gen value; older gens used 0.25x).
function getEffectiveSpeed(pokemon, field = null) {
    let speed = statCalc(pokemon.base_stats[5], pokemon.stat_levels[4]);
    speed = Math.floor(speed * abilitySpeedMod(pokemon, field)); // Chlorophyll, Swift Swim, Quark Drive...
    if (pokemon.item && pokemon.item.name === "choice-scarf") speed = Math.floor(speed * 1.5);
    if (pokemon.status && pokemon.status.name === "paralysis") speed = Math.floor(speed / 2);
    // Unburden: twice as fast once its item is gone
    if (!pokemon.item && pokemon.originalItem && hasUnburden(pokemon)) speed *= 2;
    return speed;
}

// A pokemon in the middle of a two-turn move has no say in what it does next.
function forcedMove(pokemon, chosenMove) {
    if (!pokemon.charging) return chosenMove;
    return pokemon.moveset.find((m) => m.name === pokemon.charging) || chosenMove;
}

// A pokemon that is trapped (Wrap, Mean Look, ...) can't switch out by choice. Pivot moves
// and Baton Pass still get it out, and a Shed Shell holder slips free. It only lasts while
// whoever trapped it is still out on the field.
export function isTrapped(team, foeTeam) {
    const pokemon = team[0];
    if (pokemon.item && pokemon.item.name === SHED_SHELL) return false;
    // Arena Trap / Shadow Tag / Magnet Pull (Ghost types slip past every kind of trap)
    if (
        foeTeam[0].hp[0] > 0 &&
        !pokemon.types.some((t) => t.type.name === "ghost") &&
        trapsFoe(foeTeam[0], pokemon)
    )
        return true;
    const trap = pokemon.trap;
    if (!trap) return false;
    if (foeTeam[0] !== trap.source || foeTeam[0].hp[0] <= 0) return false;
    return true;
}

// Who is out there decides two field-wide things: whether the weather counts (Cloud Nine /
// Air Lock) and whether berries can be eaten (Unnerve). Kept as flags so the rest of the
// engine only has to read them.
function refreshBattlefield(teamA, teamB) {
    const field = ensureField(teamA, teamB);
    const [a, b] = [teamA[0], teamB[0]];
    field.suppressed = [a, b].some((p) => p.hp[0] > 0 && suppressesWeather(p));
    a.unnerved = b.hp[0] > 0 && unnervesFoes(b);
    b.unnerved = a.hp[0] > 0 && unnervesFoes(a);
}

// A move's priority once everything that changes it is counted: the move itself, Prankster,
// Gale Wings, Triage and the like. (Custap Berry is added by the caller.)
export function movePriority(mv, mon, field) {
    if (mv.priority === 6) return 6; // a switch
    const move = adaptMoveToField(mv, mon, field);
    return (
        move.priority +
        (mv.damage_class.name === "status" && boostsStatusPriority(mon) ? 1 : 0) + // Prankster
        abilityPriorityBonus(mon, move)
    );
}

export function doTurn(playerPokemon, opponentPokemon, chosenMove) {
    ensureField(playerPokemon, opponentPokemon);
    const field = playerPokemon.field;
    playerPokemon.isPlayerSide = true;
    opponentPokemon.isPlayerSide = false;
    refreshBattlefield(playerPokemon, opponentPokemon);
    // Abilities that trigger on entering (Intimidate, Illusion, Imposter...) go off for both
    // starting pokemon before the first turn's moves, the faster one first.
    const entryText = [];
    if (!playerPokemon.entered) {
        playerPokemon.entered = true;
        opponentPokemon.entered = true;
        const order = getEffectiveSpeed(playerPokemon[0], field) >= getEffectiveSpeed(opponentPokemon[0], field)
            ? [playerPokemon, opponentPokemon]
            : [opponentPokemon, playerPokemon];
        for (const team of order) {
            addArrayToArray(entryText, runEntryAbilities(team, team === playerPokemon ? opponentPokemon : playerPokemon, field));
        }
    }
    // The button the player pressed can be a snapshot copy, so find the real move (its PP
    // is what gets spent). A switch has no name to look up.
    let move = chosenMove;
    if (move.priority !== 6) {
        move = playerPokemon[0].moveset.find((m) => m.name === move.name) || move;
    }
    move = forcedMove(playerPokemon[0], move);
    const cpuMove = forcedMove(opponentPokemon[0], makeMove(playerPokemon, opponentPokemon));
    const priorityOf = (mv, mon) => movePriority(mv, mon, field) + (hasCustapBoost(mon) ? 1 : 0);
    let playerPriority = priorityOf(move, playerPokemon[0]);
    let cpuPriority = priorityOf(cpuMove, opponentPokemon[0]);
    let movefirst = playerPriority > cpuPriority ? true : false;
    if (playerPriority === cpuPriority) {
        movefirst =
            getEffectiveSpeed(playerPokemon[0], field) > getEffectiveSpeed(opponentPokemon[0], field)
                ? true
                : false;
    }
    return addArrayToArray(entryText, runTurn(playerPokemon, opponentPokemon, { playerFirst: movefirst, move, cpuMove }, 0));
}

// The on-entry abilities of `team`'s active pokemon; returns the lines they produced.
function runEntryAbilities(team, foeTeam, field) {
    const text = [];
    const self = team[0];
    refreshBattlefield(team, foeTeam);
    runHook(self, "onSwitchIn", { foe: foeTeam[0], selfTeam: team, foeTeam, field, text, selfIsPlayer: !!team.isPlayerSide, ...abilityApi(field) }, foeTeam[0]);
    runHook(self, "onUpdate", { field, text });
    return text;
}

// Plays out a turn from `step` onward: step 0 is whoever moves first, step 1 the other,
// step 2 the end-of-turn effects. A turn can pause after a step when the player's pokemon
// pivots out (U-turn, Baton Pass, ...) and the player has to pick its replacement; the
// plan is parked on the team as pendingSwitch and resumeTurn() picks it back up.
function runTurn(playerPokemon, opponentPokemon, plan, step) {
    let text = [];
    const field = ensureField(playerPokemon, opponentPokemon);
    for (; step < 2; step++) {
        const isPlayer = (step === 0) === plan.playerFirst;
        const team = isPlayer ? playerPokemon : opponentPokemon;
        const foeTeam = isPlayer ? opponentPokemon : playerPokemon;
        const move = isPlayer ? plan.move : plan.cpuMove;
        if (step === 1 && team[0].hp[0] <= 0) return text;
        // A side that was switched out (Emergency Exit) before it got to move loses its action
        if (plan.skipSide === (isPlayer ? "player" : "cpu")) continue;
        if (hasCustapBoost(team[0])) consumeItem(team[0]);
        text = addArrayToArray(text, playerTurn(team, foeTeam, move));
        refreshBattlefield(playerPokemon, opponentPokemon);
        for (const t of [playerPokemon, opponentPokemon]) runHook(t[0], "onUpdate", { field, text });

        // Either side can end up wanting to switch: the mover (U-turn...) or the one it hit
        // (Emergency Exit). The CPU switches straight away; the player is asked.
        for (const swapper of [team, foeTeam]) {
            const pivot = swapper.pivotRequest;
            swapper.pivotRequest = null;
            if (!pivot) continue;
            const swapperIsPlayer = swapper === playerPokemon;
            const swapperActsLater = swapper === foeTeam && step === 0;
            if (swapperIsPlayer) {
                if (swapperActsLater) plan.skipSide = "player";
                playerPokemon.pendingSwitch = { plan, nextStep: step + 1, baton: pivot.baton };
                return text;
            }
            const index = switchPokemon(playerPokemon, opponentPokemon);
            if (index !== -1) {
                if (swapperActsLater) plan.skipSide = "cpu";
                text.push(doSwitch(opponentPokemon, index, { baton: pivot.baton, foeTeam: playerPokemon }));
            }
        }
    }
    // The weather counts down first (a 5-turn weather deals its damage 4 times, then ends)
    tickWeather(field, text);
    text = addArrayToArray(text, doEndOfTurn(playerPokemon[0], field, opponentPokemon[0]));
    text = addArrayToArray(text, doEndOfTurn(opponentPokemon[0], field, playerPokemon[0]));
    tickTerrain(field, text);
    // The field may have changed at the end of the turn (weather ran out, a Cloud Nine holder
    // fainted): abilities that follow it (Forecast, Protosynthesis...) catch up
    refreshBattlefield(playerPokemon, opponentPokemon);
    for (const t of [playerPokemon, opponentPokemon]) runHook(t[0], "onUpdate", { field, text });
    for (const team of [playerPokemon, opponentPokemon]) {
        team[0].movedThisTurn = false;
        if (team.reflectTurns > 0) team.reflectTurns -= 1;
        if (team.lightScreenTurns > 0) team.lightScreenTurns -= 1;
        if (team.auroraTurns > 0) team.auroraTurns -= 1;
        team[0].flinched = false; // a flinch only ever lasts the turn it happens in
        team[0].activeTurns = (team[0].activeTurns || 0) + 1;
    }
    return text;
}

// Finishes a turn that paused for the player to choose a replacement after a pivot move.
export function resumeTurn(playerPokemon, opponentPokemon, index) {
    const pending = playerPokemon.pendingSwitch;
    playerPokemon.pendingSwitch = null;
    if (!pending) return [];
    const text = [doSwitch(playerPokemon, index, { baton: pending.baton, foeTeam: opponentPokemon })];
    return addArrayToArray(
        text,
        runTurn(playerPokemon, opponentPokemon, pending.plan, pending.nextStep)
    );
}

export function playerTurn(playerPokemon, opponentPokemon, chosenMove) {
    let text = [];
    ensureField(playerPokemon, opponentPokemon);
    /// Move is switch
    if (chosenMove.priority === 6) {
        if (isTrapped(playerPokemon, opponentPokemon)) {
            text.push(pokemonNameToString(playerPokemon[0]) + " can't escape!");
            return text;
        }
        text.push(doSwitch(playerPokemon, chosenMove.index, { foeTeam: opponentPokemon }));
        playerPokemon[0].movedThisTurn = true;
        return text;
    }
    /// Move is attack
    const attacker = playerPokemon[0];
    attacker.movedThisTurn = true; // (Analytic wants to know who has already gone)
    attacker.actionsSinceSwitch = (attacker.actionsSinceSwitch || 0) + 1;
    // The turn after a recharge move (Hyper Beam, ...) is spent recharging
    if (attacker.mustRecharge) {
        attacker.mustRecharge = false;
        text.push(pokemonNameToString(attacker) + " must recharge!");
        return text;
    }
    if (!canAct(attacker, text, chosenMove)) {
        attacker.charging = null; // being stopped mid-charge wastes the move
        return text;
    }

    if (attacker.disabled && attacker.disabled.move === chosenMove.name && chosenMove.name !== "struggle") {
        text.push(pokemonNameToString(attacker) + "'s " + moveNameToString(chosenMove) + " is disabled!");
        return text;
    }
    // Using a move spends a PP (the second turn of a two-turn move is free); Pressure on the
    // other side makes it two
    if (attacker.charging !== chosenMove.name) {
        const pressured = opponentPokemon[0].hp[0] > 0 && abilityName(opponentPokemon[0]) === "pressure" && aimsAtFoe(chosenMove);
        spendPP(chosenMove, pressured ? 2 : 1);
    }
    executeMove(playerPokemon, opponentPokemon, chosenMove, text, {});
    return text;
}

// Carries out a move that has already been paid for (PP spent, able to act): the same steps
// whether the pokemon picked it, a Magic Bounce sent it back (opts.bounced) or Dancer copied
// it (opts.copied). Everything it says goes into `text`.
function executeMove(playerPokemon, opponentPokemon, chosenMove, text, opts) {
    const field = ensureField(playerPokemon, opponentPokemon);
    const attacker = playerPokemon[0];
    // Weather Ball, Terrain Pulse and Grassy Glide change with the field; Pixilate, Normalize
    // and Liquid Voice change a move's type
    const move = abilityAdaptMove(attacker, adaptMoveToField(chosenMove, attacker, field));
    attacker.faintedAllies = playerPokemon.slice(1).filter((p) => p.hp[0] <= 0).length; // Supreme Overlord

    if (trySetupScreen(playerPokemon, move, text, field)) return;
    if (tryStartCharge(attacker, move, text, field)) return;
    // Protean / Libero change the user's type to the move's, before anything else happens
    if (!opts.bounced) runHook(attacker, "onPrepareMove", { move, text });

    const foe = opponentPokemon[0];
    // Damp: nothing can explode while it is out
    if (EXPLOSIVE_MOVES.has(move.name)) {
        const damp = [attacker, foe].find((p) => p.hp[0] > 0 && abilityName(p) === "damp");
        if (damp) {
            text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
            text.push(pokemonNameToString(damp) + "'s Damp prevents it from exploding!");
            return;
        }
    }
    // Fake Out / First Impression only work on the turn right after switching in
    if (FIRST_TURN_ONLY_MOVES.has(move.name) && attacker.actionsSinceSwitch > 1) {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push("But it failed!");
        return;
    }

    // A pokemon that is up in the air / underground / underwater can't be reached
    if (!hasNoGuard(attacker) && !hasNoGuard(foe) && isUnreachable(foe, move)) {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push(pokemonNameToString(foe) + " avoided the attack!");
        return;
    }
    // Psychic Terrain shields grounded pokemon from priority moves
    if (foe.hp[0] > 0 && aimsAtFoe(move) && terrainBlocksPriority(move, foe, field)) {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push(pokemonNameToString(foe) + " is protected by the Psychic Terrain!");
        return;
    }

    // Magic Bounce: a status move aimed at this pokemon is sent straight back at the user
    if (
        !opts.bounced &&
        foe.hp[0] > 0 &&
        move.damage_class.name === "status" &&
        (aimsAtFoe(move) || (move.target && move.target.name === "opponents-field")) &&
        REFLECTABLE_MOVES.has(move.name) &&
        bouncesMoves(foe, attacker)
    ) {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push(pokemonNameToString(foe) + "'s Magic Bounce bounced the move back!");
        executeMove(opponentPokemon, playerPokemon, { ...chosenMove }, text, { bounced: true });
        return;
    }

    // Prankster's boosted status moves don't work on Dark types
    if (
        !opts.bounced &&
        foe.hp[0] > 0 &&
        move.damage_class.name === "status" &&
        aimsAtFoe(move) &&
        boostsStatusPriority(attacker) &&
        foe.types.some((t) => t.type.name === "dark")
    ) {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push("It doesn't affect " + pokemonNameToString(foe) + "!");
        return;
    }
    // Good as Gold: status moves aimed at it don't work
    if (foe.hp[0] > 0 && move.damage_class.name === "status" && aimsAtFoe(move) && blocksStatusMoves(foe, attacker)) {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push(pokemonNameToString(foe) + "'s " + abilityLabel(foe) + " blocked it!");
        return;
    }
    // Queenly Majesty / Dazzling / Armor Tail: priority moves aimed at it don't work
    if (
        !opts.copied &&
        foe.hp[0] > 0 &&
        aimsAtFoe(move) &&
        blocksPriorityMoves(foe, attacker) &&
        movePriority(chosenMove, attacker, field) > 0
    ) {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push(pokemonNameToString(foe) + "'s " + abilityLabel(foe) + " protected it from the move!");
        return;
    }
    // Water Absorb / Volt Absorb / Flash Fire / Sap Sipper...: the move is soaked up instead
    if (foe.hp[0] > 0 && typeEffectiveness(move, foe, attacker) !== 0 && absorbsMove(foe, attacker, move)) {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        tryAbsorb(foe, attacker, move, text, abilityApi(field));
        return;
    }
    // One-hit KO moves can't touch an immune type (Sheer Cold vs Ice), or a Sturdy pokemon
    if (foe.hp[0] > 0 && (ohkoImmune(foe, move) || (isOhkoMove(move) && blocksOhko(foe, attacker)))) {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push("It doesn't affect " + pokemonNameToString(foe) + "!");
        return;
    }
    // Accuracy is checked after immunity, before anything happens (like Showdown)
    if (foe.hp[0] > 0 && typeEffectiveness(move, foe, attacker) !== 0 && !rollAccuracy(attacker, foe, move, field)) {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push(pokemonNameToString(attacker) + "'s attack missed!");
        if (attacker.item && CHOICE_ITEMS[attacker.item.name] !== undefined)
            attacker.lockedMove = move.name; // a missed move still locks a Choice item
        tryCrashDamage(attacker, move, text);
        return;
    }

    addArrayToArray(text, turnText(attacker, foe, move));
    if (typeEffectiveness(move, foe, attacker) === 0) tryCrashDamage(attacker, move, text);
    if (typeEffectiveness(move, foe, attacker) !== 0) {
        addArrayToArray(text, doAttack(attacker, foe, move, opponentPokemon));
        trackMetronome(attacker, move);
        if (attacker.item && CHOICE_ITEMS[attacker.item.name] !== undefined)
            attacker.lockedMove = move.name;
        /// temporary fix for moves giving me errors
        if (move.meta !== undefined)
            addArrayToArray(text, doMoveEffects(attacker, foe, move, {
                sheerForced: removesSecondaries(attacker) && SECONDARY_MOVES.has(move.name),
                shieldDust: blocksSecondaryEffects(foe, attacker),
            }));
        if (RECHARGE_MOVES.has(move.name) && attacker.hp[0] > 0) attacker.mustRecharge = true;
        // Rapid Spin & Mortal Spin free the user's side (and the user from being bound);
        // Defog & Tidy Up clear both sides, Defog also blowing away the foe's screens
        if (CLEAR_OWN_SIDE_MOVES.has(move.name) && attacker.hp[0] > 0) {
            clearHazards(playerPokemon, text);
            attacker.trap = null;
        }
        if (CLEAR_BOTH_SIDES_MOVES.has(move.name)) {
            clearHazards(playerPokemon, text);
            clearHazards(opponentPokemon, text);
            if (move.name === "defog") {
                opponentPokemon.reflectTurns = 0;
                opponentPokemon.lightScreenTurns = 0;
                opponentPokemon.auroraTurns = 0;
                addArrayToArray(text, doStatChanges(foe, { stat_changes: [{ stat: { name: "evasion" }, change: -1 }] }, attacker));
            }
        }
        tryRequestPivot(playerPokemon, foe, move, text);
        runHook(attacker, "onAfterMove", { foe, move, text, ...abilityApi(field) });
    }

    // Dancer: the other side copies a dance move right after it is used
    if (
        !opts.copied &&
        DANCE_MOVES.has(move.name) &&
        foe.hp[0] > 0 &&
        attacker.hp[0] > 0 &&
        abilityName(foe) === "dancer"
    ) {
        text.push(pokemonNameToString(foe) + "'s Dancer copied the dance!");
        executeMove(opponentPokemon, playerPokemon, { ...chosenMove }, text, { copied: true });
    }
}

// Does this move go at the opposing pokemon (as opposed to the user or the whole field)?
function aimsAtFoe(move) {
    return move.damage_class.name !== "status" || FOE_TARGETS.has(move.target && move.target.name);
}

// Jump Kick / High Jump Kick / Supercell Slam / Axe Kick: missing (or hitting something
// immune) costs the user half its max HP.
function tryCrashDamage(attacker, move, text) {
    if (!CRASH_MOVES.has(move.name)) return;
    attacker.hp[0] = Math.max(0, attacker.hp[0] - Math.floor(attacker.hp[1] / 2));
    text.push(pokemonNameToString(attacker) + " kept going and crashed!");
    if (attacker.hp[0] === 0) text.push(pokemonNameToString(attacker) + " fainted!");
}

// Whether the foe is mid-charge in a way that lets this move miss it entirely.
function isUnreachable(foe, move) {
    const hiding = foe.charging && SEMI_INVULNERABLE_MOVES[foe.charging];
    if (!hiding) return false;
    const target = move.target && move.target.name;
    const aimedAtFoe = move.damage_class.name !== "status" || FOE_TARGETS.has(target);
    return aimedAtFoe && !hiding.hitBy.includes(move.name);
}

const CHARGE_MESSAGES = {
    fly: "flew up high!",
    bounce: "sprang up!",
    dig: "burrowed its way underground!",
    dive: "hid underwater!",
    "phantom-force": "vanished instantly!",
    "shadow-force": "vanished instantly!",
    "solar-beam": "absorbed light!",
    "solar-blade": "absorbed light!",
    "razor-wind": "whipped up a whirlwind!",
    "skull-bash": "tucked in its head!",
    "sky-attack": "became cloaked in a harsh light!",
    "meteor-beam": "is overflowing with space power!",
    "electro-shot": "absorbed electricity!",
    "freeze-shock": "became cloaked in a freezing light!",
    "ice-burn": "became cloaked in freezing air!",
    geomancy: "is absorbing power!",
};

// First turn of a two-turn move: spend the turn charging (the move itself fires next turn,
// when doTurn forces it again). Returns true if this turn was the charge turn.
function tryStartCharge(attacker, move, text, field) {
    if (!CHARGE_MOVES.has(move.name)) return false;
    if (attacker.charging === move.name) {
        attacker.charging = null; // second turn: fall through and actually use it
        return false;
    }
    // Solar Beam/Blade need no charge in sun, and Electro Shot none in rain
    const weather = weatherOf(field);
    const weatherSkip =
        (weather === "sun" && (move.name === "solar-beam" || move.name === "solar-blade")) ||
        (weather === "rain" && move.name === "electro-shot");
    if (weatherSkip) {
        if (CHARGE_TURN_BOOSTS[move.name]) {
            addArrayToArray(text, doStatChanges(attacker, { stat_changes: CHARGE_TURN_BOOSTS[move.name] }));
        }
        return false;
    }
    const powerHerb = attacker.item && attacker.item.name === POWER_HERB;
    if (!powerHerb) {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push(pokemonNameToString(attacker) + " " + (CHARGE_MESSAGES[move.name] || "began charging!"));
    }
    if (CHARGE_TURN_BOOSTS[move.name]) {
        addArrayToArray(text, doStatChanges(attacker, { stat_changes: CHARGE_TURN_BOOSTS[move.name] }));
    }
    // Power Herb: skip the wait, the move goes off right now (the charge-turn boost above
    // still happens, like in the real games)
    if (powerHerb) {
        text.push(pokemonNameToString(attacker) + " became fully charged due to its " + itemLabel(attacker) + "!");
        consumeItem(attacker);
        return false;
    }
    attacker.charging = move.name;
    if (attacker.item && CHOICE_ITEMS[attacker.item.name] !== undefined)
        attacker.lockedMove = move.name;
    return true;
}

// U-turn / Volt Switch / Flip Turn / Parting Shot / Baton Pass / Teleport: after the move
// the user swaps out. Only flags the request (team.pivotRequest); runTurn does the swap,
// since the player has to choose the replacement.
function tryRequestPivot(team, foe, move, text) {
    if (!SUPPORTED_PIVOT_MOVES.has(move.name) || team[0].hp[0] <= 0) return;
    const hasBench = team.slice(1).some((p) => p.hp[0] > 0);
    const isStatus = move.damage_class.name === "status";
    if (!hasBench) {
        if (isStatus) text.push("But it failed!");
        return;
    }
    // A damaging pivot that KOs its target leaves the user in (no time for both swaps)
    if (!isStatus && foe.hp[0] <= 0) return;
    team.pivotRequest = { baton: move.name === "baton-pass" };
    text.push(pokemonNameToString(team[0]) + " went back to its trainer!");
}

// Typeless physical hit a confused pokemon deals to itself (fixed 40 power, own atk/def).
function confusionSelfDamage(pokemon) {
    const attack = statCalc(pokemon.base_stats[1], pokemon.stat_levels[0]);
    const defense = statCalc(pokemon.base_stats[2], pokemon.stat_levels[1]);
    return Math.floor((42 * 40 * (attack / defense)) / 50 + 2);
}

// Sleep/freeze/confusion/paralysis can each stop a pokemon from acting this turn.
// Returns false (having pushed the reason into `text`) if it can't move.
function canAct(attacker, text, move) {
    if (attacker.status && attacker.status.name === "sleep") {
        if (attacker.status.counter <= 0) {
            attacker.status = null;
            text.push(pokemonNameToString(attacker) + " woke up!");
        } else {
            attacker.status.counter -= hasEarlyBird(attacker) ? 2 : 1; // Early Bird sleeps half as long
            text.push(pokemonNameToString(attacker) + " is fast asleep.");
            return false;
        }
    }
    if (attacker.status && attacker.status.name === "freeze") {
        if (move && DEFROST_MOVES.has(move.name)) {
            // Using a defrost move (Flare Blitz, Scald, ...) thaws the user with no roll
            attacker.status = null;
            text.push(pokemonNameToString(attacker) + " thawed out using " + moveNameToString(move) + "!");
        } else if (Math.random() < 0.2) {
            attacker.status = null;
            text.push(pokemonNameToString(attacker) + " thawed out!");
        } else {
            text.push(pokemonNameToString(attacker) + " is frozen solid!");
            return false;
        }
    }
    if (attacker.flinched) {
        attacker.flinched = false;
        text.push(pokemonNameToString(attacker) + " flinched and couldn't move!");
        runHook(attacker, "onFlinch", { text, ...abilityApi(null) }); // Steadfast
        return false;
    }
    if (attacker.confusion) {
        // Count down first, then check, so the last turn snaps out and acts normally
        // (same order as Showdown: a counter of 2 gives one confused attempt, not two).
        attacker.confusion.counter -= 1;
        if (attacker.confusion.counter <= 0) {
            attacker.confusion = null;
            text.push(pokemonNameToString(attacker) + " snapped out of confusion!");
        } else if (Math.random() < 1 / 3) {
            attacker.hp[0] = Math.max(0, attacker.hp[0] - confusionSelfDamage(attacker));
            text.push(pokemonNameToString(attacker) + " is confused! It hurt itself in its confusion!");
            if (attacker.hp[0] === 0) text.push(pokemonNameToString(attacker) + " fainted!");
            return false;
        }
    }
    if (attacker.status && attacker.status.name === "paralysis" && Math.random() < 0.25) {
        text.push(pokemonNameToString(attacker) + " is paralyzed! It can't move!");
        return false;
    }
    return true;
}

// Reflect/Light Screen are side-wide, not per-pokemon, so their turn counters live
// directly on the team array (attackingTeam) rather than on a pokemon object — the
// team arrays are already threaded through doTurn/playerTurn everywhere.
function trySetupScreen(attackingTeam, move, text, field) {
    if (move.name !== "reflect" && move.name !== "light-screen" && move.name !== "aurora-veil") return false;
    const holder = attackingTeam[0].item;
    const turns = holder && holder.name === LIGHT_CLAY ? 8 : 5; // Light Clay stretches a screen to 8 turns
    if (move.name === "aurora-veil") {
        // Aurora Veil (both categories at once) can only be raised in hail or snow
        const weather = weatherOf(field);
        text.push(pokemonNameToString(attackingTeam[0]) + " used " + moveNameToString(move) + "!");
        if ((weather !== "hail" && weather !== "snow") || attackingTeam.auroraTurns > 0) {
            text.push("But it failed!");
            return true;
        }
        attackingTeam.auroraTurns = turns;
        text.push("An Aurora Veil made " + pokemonNameToString(attackingTeam[0]) + "'s team stronger!");
        return true;
    }
    if (move.name === "reflect") attackingTeam.reflectTurns = turns;
    else attackingTeam.lightScreenTurns = turns;
    text.push(
        pokemonNameToString(attackingTeam[0]) + " set up " + moveNameToString(move) + "!"
    );
    return true;
}

function trackMetronome(attacker, move) {
    if (!attacker.item || attacker.item.name !== METRONOME_ITEM) return;
    if (attacker.lastMoveName === move.name) {
        attacker.moveRepeatCount = Math.min((attacker.moveRepeatCount || 1) + 1, 6);
    } else {
        attacker.lastMoveName = move.name;
        attacker.moveRepeatCount = 1;
    }
}

export function turnText(attacker, defender, move) {
    let text = [
        pokemonNameToString(attacker) +
            " used " +
            moveNameToString(move) +
            "!",
    ];
    if (defender.hp[0] <= 0) {
        // attempt to stop turn when mon dies to recoil
        text.push("But it failed!");
        return text;
    }
    if (typeEffectiveness(move, defender, attacker) === 0) {
        text.push(
            "It doesnt't affect " + pokemonNameToString(defender) + "!"
        );
    }
    if (
        move.damage_class.name !== "status" && // a status move deals no damage, so no effectiveness text
        typeEffectiveness(move, defender, attacker) > 0 &&
        typeEffectiveness(move, defender, attacker) !== 1
    ) {
        let t =
            typeEffectiveness(move, defender, attacker) > 1
                ? " It's super effective!"
                : " It's not very effective...";
        text[0] = text[0] + t;
    }
    return text;
}

export function addArrayToArray(arr1, arr2) {
    for (const elem of arr2) {
        arr1.push(elem);
    }
    return arr1;
}

function itemLabel(pokemon) {
    return pokemon.item ? pokemon.item.korean_name || pokemon.item.name : "";
}

function healPercent(pokemon, amount, verb) {
    if (amount <= 0) return null;
    pokemon.hp[0] = Math.min(pokemon.hp[1], pokemon.hp[0] + amount);
    return (
        pokemonNameToString(pokemon) +
        (verb || " healed some HP using its ") +
        itemLabel(pokemon) +
        "!"
    );
}

// Berries/items that react to the holder's own HP after it changes (own HP threshold
// heals and stat boosts). Consumed on use.
function tryConsumeHpTriggeredItem(pokemon, text) {
    if (!pokemon.item || pokemon.hp[0] <= 0 || berryBlocked(pokemon)) return;
    const name = pokemon.item.name;
    const fraction = pokemon.hp[0] / pokemon.hp[1];
    const mult = hasRipen(pokemon) ? 2 : 1; // Ripen: berries work twice as well
    const lowHp = hasGluttony(pokemon) ? 0.5 : 0.25; // Gluttony eats "1/4 HP" berries at half HP

    if (name === BERRY_JUICE && fraction < 0.5) {
        const msg = healPercent(pokemon, 20, " restored 20 HP using its ");
        if (msg) text.push(msg);
        consumeItem(pokemon);
        return;
    }
    if (name === "sitrus-berry" && fraction <= 0.5) {
        const msg = healPercent(pokemon, Math.floor(pokemon.hp[1] / 4) * mult, " ate its ");
        if (msg) text.push(msg + " and restored HP!");
        consumeItem(pokemon);
        afterBerry(pokemon, text);
        return;
    }
    if (HP_HEAL_BERRIES.has(name) && name !== "sitrus-berry" && fraction <= lowHp) {
        const msg = healPercent(pokemon, Math.floor(pokemon.hp[1] / 3) * mult, " ate its ");
        if (msg) text.push(msg + " and restored HP!");
        consumeItem(pokemon);
        afterBerry(pokemon, text);
        return;
    }
    const statIndex = STAT_BOOST_BERRIES[name];
    if (statIndex !== undefined && fraction <= lowHp) {
        addArrayToArray(
            text,
            doStatChangesRaw(pokemon, [{ statIndex, change: mult }])
        );
        text.push(pokemonNameToString(pokemon) + " ate its " + itemLabel(pokemon) + "!");
        consumeItem(pokemon);
        afterBerry(pokemon, text);
    }
}

// Item-swap/removal moves that either don't deal damage at all, or whose only extra
// effect (beyond normal damage) is on the target's item. Handled up front so the rest
// of doAttack's damage pipeline only runs for the moves that still need it.
function tryItemMove(attacker, defender, move, text) {
    if (move.name === "trick" || move.name === "switcheroo") {
        if (
            (attacker.item && !isRemovable(attacker.item)) ||
            (defender.item && !isRemovable(defender.item)) ||
            protectsItem(defender, attacker)
        ) {
            text.push("But it failed!"); // an unremovable item (e.g. Soul Dew) can't be swapped
            return true;
        }
        const temp = attacker.item;
        attacker.item = defender.item;
        defender.item = temp;
        text.push(
            pokemonNameToString(attacker) + " switched items with " + pokemonNameToString(defender) + " using " + moveNameToString(move) + "!"
        );
        return true;
    }
    if (move.name === "corrosive-gas") {
        if (isRemovable(defender.item) && !protectsItem(defender, attacker)) {
            text.push(pokemonNameToString(defender) + "'s " + itemLabel(defender) + " was destroyed!");
            consumeItem(defender);
        } else {
            text.push("But it failed!");
        }
        return true;
    }
    if (move.name === "bestow") {
        if (!defender.item && attacker.item) {
            text.push(pokemonNameToString(attacker) + " gave its " + itemLabel(attacker) + " to " + pokemonNameToString(defender) + "!");
            defender.item = attacker.item;
            attacker.item = null;
        } else {
            text.push("But it failed!");
        }
        return true;
    }
    if (move.name === "recycle") {
        if (!attacker.item && attacker.consumedItem) {
            text.push(pokemonNameToString(attacker) + " recycled its " + (attacker.consumedItem.korean_name || attacker.consumedItem.name) + "!");
            attacker.item = attacker.consumedItem;
            attacker.consumedItem = null;
        } else {
            text.push("But it failed!");
        }
        return true;
    }
    return false;
}

const SELF_TARGETS = new Set(["user", "user-and-allies", "user-or-ally"]);
// Extra HP a self-buffing move costs, as a divisor of max HP (Belly Drum is handled by name).
const HP_COST_DIVISOR = { "clangorous-soul": 3 };
// Stat-changing status moves PokeAPI files under "unique" instead of "net-good-stats".
const EXTRA_STAT_MOVES = new Set(["shell-smash"]);

// Status moves whose whole effect PokeAPI describes as data: self-buffs (Swords Dance,
// Calm Mind), debuffs (Growl, Charm), and self-heals (Recover, Roost), driven by
// stat_changes / meta.healing plus the move's target. A few need their own handling
// because the data alone would be wrong (Belly Drum, Rest, Stuff Cheeks, HP-cost moves).
function tryStatusMoveEffect(attacker, defender, move, text, field, defenderTeam) {
    const attackerName = pokemonNameToString(attacker);
    const category = move.meta && move.meta.category && move.meta.category.name;
    const target = move.target && move.target.name;

    // Stealth Rock, Spikes, Toxic Spikes, Sticky Web: laid on the opposing side
    if (HAZARD_MOVES[move.name]) {
        if (!defenderTeam || !setHazard(defenderTeam, HAZARD_MOVES[move.name], text)) text.push("But it failed!");
        return;
    }

    // Weather and terrain moves (Sunny Day, Electric Terrain, ...)
    if (WEATHER_MOVES[move.name] || TERRAIN_MOVES[move.name]) {
        const started = !field
            ? false
            : WEATHER_MOVES[move.name]
            ? setWeather(field, WEATHER_MOVES[move.name], attacker, text)
            : setTerrain(field, TERRAIN_MOVES[move.name], attacker, text);
        if (!started) text.push("But it failed!");
        return;
    }

    // Mean Look / Block / Spider Web: the target can't switch out while the user is around
    if (TRAPPING_MOVES.has(move.name)) {
        if (defender.types.some((t) => t.type.name === "ghost")) {
            text.push("It doesn't affect " + pokemonNameToString(defender) + "!");
        } else if (!applyTrap(attacker, defender, "trapped", move, text)) {
            text.push("But it failed!");
        }
        return;
    }

    if (move.name === "focus-energy") {
        // +2 to the user's critical-hit stage until it switches out
        if (attacker.focusEnergy) {
            text.push("But it failed!");
        } else {
            attacker.focusEnergy = true;
            text.push(attackerName + " is getting pumped!");
        }
        return;
    }

    if (move.name === "belly-drum") {
        // Pays half its max HP to max out Attack; fails if it can't afford it or is already maxed
        const cost = Math.floor(attacker.hp[1] / 2);
        if (attacker.hp[0] <= cost || attacker.stat_levels[0] >= 6) {
            text.push("But it failed!");
            return;
        }
        attacker.hp[0] -= cost;
        attacker.stat_levels[0] = 6;
        text.push(attackerName + " cut its own HP and maximized its Attack!");
        return;
    }

    if (move.name === "rest") {
        // Fully heals and sleeps for two turns, curing any other status first
        if (
            attacker.hp[0] >= attacker.hp[1] ||
            (attacker.status && attacker.status.name === "sleep") ||
            terrainBlocksStatus(attacker, "sleep", field) ||
            abilityBlocksStatus(attacker, "sleep", null, field) // Insomnia / Vital Spirit
        ) {
            text.push("But it failed!");
            return;
        }
        attacker.hp[0] = attacker.hp[1];
        attacker.status = { name: "sleep", counter: 2 };
        text.push(attackerName + " slept and became healthy!");
        tryConsumeStatusCureItem(attacker, text); // the classic Rest + Chesto Berry
        return;
    }

    if (move.name === "stuff-cheeks") {
        // Needs a berry to eat; the +2 Defense below is its normal stat_changes handling
        if (!attacker.item || !attacker.item.name.endsWith("-berry")) {
            text.push("But it failed!");
            return;
        }
        const berry = attacker.item;
        text.push(attackerName + " ate its " + itemLabel(attacker) + "!");
        consumeItem(attacker);
        applyBerryEffect(attacker, berry, text);
    }

    if (
        (category === "net-good-stats" || EXTRA_STAT_MOVES.has(move.name)) &&
        move.stat_changes &&
        move.stat_changes.length > 0
    ) {
        let changes = move.stat_changes.filter((s) => STAT_NAMES.includes(s.stat.name));
        if (changes.length === 0) return;
        // Growth is twice as strong in the sun
        if (move.name === "growth" && weatherOf(field) === "sun") {
            changes = changes.map((s) => ({ ...s, change: s.change * 2 }));
        }

        let recipient = null;
        if (SELF_TARGETS.has(target)) recipient = attacker;
        // A buff aimed at "selected-pokemon" (Decorate) is meant for an ally, so only
        // debuffs (Growl, Charm, Screech) are applied to the opponent.
        else if (FOE_TARGETS.has(target) && changes.every((s) => s.change < 0)) recipient = defender;
        if (!recipient) return;

        const divisor = HP_COST_DIVISOR[move.name];
        if (divisor) {
            const cost = Math.floor(attacker.hp[1] / divisor);
            if (attacker.hp[0] <= cost) {
                text.push("But it failed!");
                return;
            }
            attacker.hp[0] -= cost;
            text.push(attackerName + " cut its own HP to power up!");
        }
        addArrayToArray(text, doStatChanges(recipient, { stat_changes: changes }, recipient === attacker ? null : attacker));
        return;
    }

    if (
        category === "heal" &&
        move.meta.healing > 0 &&
        SELF_TARGETS.has(target) &&
        move.name !== "swallow" // scales with Stockpile layers, which don't exist here
    ) {
        if (attacker.hp[0] >= attacker.hp[1]) {
            text.push("But it failed!");
            return;
        }
        // Synthesis / Morning Sun / Moonlight / Shore Up heal more or less with the weather
        const percent = weatherHealPercent(move, field) || move.meta.healing;
        const amount = Math.floor((attacker.hp[1] * percent) / 100);
        const healed = Math.min(amount, attacker.hp[1] - attacker.hp[0]);
        attacker.hp[0] += healed;
        text.push(
            attackerName + " healed " + Math.round((healed / attacker.hp[1]) * 1000) / 10 + "% HP!"
        );
    }
}

// Gives `pokemon` a major status directly (no move involved), respecting type immunities,
// terrain, weather and its own ability. Used by ability effects like Gulp Missile.
function inflictStatusDirect(pokemon, statusName, text, field) {
    if (pokemon.status || pokemon.hp[0] <= 0) return false;
    const types = pokemon.types.map((t) => t.type.name);
    if ((STATUS_IMMUNE_TYPES[statusName] || []).some((t) => types.includes(t))) return false;
    if (weatherBlocksStatus(statusName, field) || terrainBlocksStatus(pokemon, statusName, field)) return false;
    if (abilityBlocksStatus(pokemon, statusName, null, field)) return false;
    pokemon.status = statusName === "toxic" ? { name: "toxic", counter: 1 } : { name: statusName };
    text.push(pokemonNameToString(pokemon) + " is now afflicted with " + statusName + "!");
    tryConsumeStatusCureItem(pokemon, text);
    return true;
}

// Traps `defender` so it can't switch out. kind "binding" (Wrap, Fire Spin...) lasts 4-5
// turns and deals 1/8 max HP each turn; kind "trapped" (Mean Look, Block...) lasts until the
// trapper leaves. Ghost types can't be trapped. Returns false if it didn't take hold.
function applyTrap(attacker, defender, kind, move, text) {
    if (defender.hp[0] <= 0 || defender.trap) return false;
    if (defender.types.some((t) => t.type.name === "ghost")) return false;
    defender.trap = { source: attacker, kind, move: move.name, turns: kind === "binding" ? 5 + Math.floor(Math.random() * 2) : null };
    text.push(pokemonNameToString(defender) + (kind === "binding" ? " was trapped by " : " can no longer escape because of ") + moveNameToString(move) + "!");
    return true;
}

// Status ailments / confusion (Thunder Wave, Toxic, Confuse Ray, and damage moves with a
// secondary ailment chance like Nuzzle). Only one major status at a time; confusion is
// tracked separately since it can stack with a major status.
function tryInflictAilment(attacker, defender, move, text, field) {
    if (
        !move.meta ||
        !move.meta.ailment ||
        move.meta.ailment.name === "none" ||
        defender.hp[0] <= 0
    )
        return;

    let ailmentName = move.meta.ailment.name;
    // Wrap, Fire Spin, Whirlpool...: PokeAPI calls this ailment "trap"
    if (ailmentName === "trap") {
        if (BINDING_MOVES.has(move.name)) applyTrap(attacker, defender, "binding", move, text);
        return;
    }
    // Pure status moves (category "ailment") always apply on hit; damaging moves roll
    // their secondary chance.
    const isGuaranteed = move.meta.category.name === "ailment";
    const chance = isGuaranteed ? 100 : move.meta.ailment_chance * chanceMultiplier(attacker); // Serene Grace

    // PokeAPI only knows a plain "poison" ailment; Toxic/Poison Fang/Malignant Chain
    // actually badly poison.
    if (ailmentName === "poison" && TOXIC_MOVES.has(move.name)) ailmentName = "toxic";

    const isMajor = ["paralysis", "burn", "poison", "toxic", "sleep", "freeze"].includes(ailmentName);
    // leech-seed, yawn, disable, ... come through as "ailments" too but aren't statuses.
    if (ailmentName !== "confusion" && !isMajor) return;

    const defenderTypes = defender.types.map((t) => t.type.name);
    // Corrosion can poison Steel and Poison types
    const typeImmune =
        (STATUS_IMMUNE_TYPES[ailmentName] || []).some((t) => defenderTypes.includes(t)) &&
        !((ailmentName === "poison" || ailmentName === "toxic") && canPoisonAnything(attacker));
    const immune =
        typeImmune ||
        (POWDER_MOVES.has(move.name) && (defenderTypes.includes("grass") || isPowderImmune(defender, attacker)));
    if (immune) {
        if (isGuaranteed) text.push("It doesn't affect " + pokemonNameToString(defender) + "!");
        return;
    }
    // Sun stops freezing; Misty Terrain stops every status (and Electric Terrain sleep) on
    // grounded pokemon
    if (weatherBlocksStatus(ailmentName, field) || terrainBlocksStatus(defender, ailmentName, field)) {
        if (isGuaranteed) text.push("But it failed!");
        return;
    }
    // The target's own ability can refuse the status (Comatose...)
    if (abilityBlocksStatus(defender, ailmentName, attacker, field)) {
        if (isGuaranteed) text.push("It doesn't affect " + pokemonNameToString(defender) + "!");
        return;
    }

    if (ailmentName === "confusion") {
        if (defender.confusion) {
            if (isGuaranteed) text.push("But it failed!");
            return;
        }
        if (Math.random() * 100 >= chance) return;
        defender.confusion = { counter: 2 + Math.floor(Math.random() * 4) };
        text.push(pokemonNameToString(defender) + " became confused!");
        tryConsumeStatusCureItem(defender, text);
        return;
    }

    if (defender.status) {
        if (isGuaranteed) text.push("But it failed!");
        return;
    }
    if (Math.random() * 100 >= chance) return;
    defender.status =
        ailmentName === "sleep"
            ? { name: "sleep", counter: 1 + Math.floor(Math.random() * 3) }
            : ailmentName === "toxic"
            ? { name: "toxic", counter: 1 }
            : { name: ailmentName };
    text.push(pokemonNameToString(defender) + " is now afflicted with " + ailmentName + "!");
    // Synchronize: a burn/paralysis/poison it was given is passed straight back
    runHook(defender, "onStatusInflicted", { attacker, status: ailmentName, text, ...abilityApi(field) });
    // Poison Puppeteer: what it poisons is confused as well
    runHook(attacker, "onStatusGiven", { defender, status: ailmentName, text });
    tryConsumeStatusCureItem(defender, text);
}

// How many times a multi-hit move strikes: fixed for most, the standard 35/35/15/15 split
// over 2-5 hits for the "2-5 times" moves.
function rollHitCount(move, attacker) {
    const range = MULTIHIT_MOVES[move.name];
    if (!range) return 1;
    const [min, max] = range;
    if (min === max) return min;
    if (hasMaxHits(attacker)) return max; // Skill Link
    // Loaded Dice: a "2-5 hits" move always hits 4 or 5 times
    if (attacker.item && attacker.item.name === LOADED_DICE) return Math.random() < 0.5 ? 4 : 5;
    const roll = Math.random();
    return roll < 0.35 ? 2 : roll < 0.7 ? 3 : roll < 0.85 ? 4 : 5;
}

export function doAttack(attacker, defender, move, defenderTeam) {
    let text = [];
    if (defender.hp[0] <= 0) return text; // attempt to stop turn when mon dies to recoil
    const field = defenderTeam ? ensureField(defenderTeam, null) : null;
    // Sheer Force drops a move's secondary effect (and its Life Orb recoil) for extra power
    const sheerForced = removesSecondaries(attacker) && SECONDARY_MOVES.has(move.name) && move.damage_class.name !== "status";

    // Non-damaging item-swap/removal moves (Trick, Switcheroo, Corrosive Gas, Bestow, Recycle)
    if (tryItemMove(attacker, defender, move, text)) return text;

    // Poltergeist: fails outright if the target has no item
    if (move.name === "poltergeist" && !defender.item) {
        text.push("But it failed!");
        return text;
    }
    // Fling: fails if the attacker has nothing to throw
    if (move.name === "fling" && !attacker.item) {
        text.push("But it failed!");
        return text;
    }

    // Any other status move deals no damage, so skip the whole damage/reactive-item
    // pipeline below (it would otherwise trigger things like Weakness Policy or resist
    // berries off a hit that never happened). Only its ailment, if it has one, applies.
    if (move.damage_class.name === "status") {
        tryStatusMoveEffect(attacker, defender, move, text, field, defenderTeam);
        tryInflictAilment(attacker, defender, move, text, field);
        // Moves that cost HP (Belly Drum) can put the user in range of its Sitrus Berry
        if (attacker.hp[0] > 0) tryConsumeHpTriggeredItem(attacker, text);
        return text;
    }

    // Multi-hit moves (Fury Attack, Bullet Seed, ...) run the whole damage pipeline once per
    // hit, so per-hit reactions (Rocky Helmet, Weakness Policy, a Balloon popping) behave
    // like the real thing. Drain, recoil and Life Orb work off the combined damage below.
    const totalHits = rollHitCount(move, attacker);
    let hitsLanded = 0;
    let totalDamage = 0;
    let damage_number = 0;
    for (let hit = 0; hit < totalHits; hit++) {
        if (hit > 0 && (defender.hp[0] <= 0 || attacker.hp[0] <= 0)) break;
        if (hit > 0 && ROLLS_ACCURACY_EACH_HIT.has(move.name) && !rollAccuracy(attacker, defender, move, field)) break;
        const hitMove = ESCALATING_MULTIHIT.has(move.name) ? { ...move, power: move.power * (hit + 1) } : move;
        const ohko = isOhkoMove(move); // Fissure & co. deal exactly the target's remaining HP
        const isCrit = !ohko && rollCrit(attacker, defender, move);
        let damage = ohko ? defender.hp[0] : damageCalc(attacker, defender, hitMove, { crit: isCrit, field });
        const typeEff = typeEffectiveness(move, defender, attacker);

        // Reflect/Light Screen/Aurora Veil: halve incoming damage of the matching category for
        // the defending side while the screen is still up (a critical hit goes right through).
        if (defenderTeam && !ohko && !isCrit && !bypassesScreens(attacker)) {
            if (
                (move.damage_class.name === "physical" && defenderTeam.reflectTurns > 0) ||
                (move.damage_class.name === "special" && defenderTeam.lightScreenTurns > 0) ||
                defenderTeam.auroraTurns > 0
            )
                damage = Math.floor(damage / 2);
        }

        // Hitting a Fly/Dig/Dive user with the one move that can reach it does double damage
        const hiding = defender.charging && SEMI_INVULNERABLE_MOVES[defender.charging];
        if (hiding && hiding.doubled.includes(move.name)) damage *= 2;

        // Resist berry: halves a super-effective hit of the matching type, then is eaten
        if (
            defender.item &&
            RESIST_BERRIES[defender.item.name] === move.type.name &&
            typeEff > 1 &&
            !ohko &&
            !berryBlocked(defender)
        ) {
            damage = Math.floor(damage / (hasRipen(defender) ? 4 : 2));
            text.push(
                pokemonNameToString(defender) +
                    "'s " +
                    itemLabel(defender) +
                    " weakened the hit!"
            );
            consumeItem(defender);
        }

        // Sturdy: survive a would-be KO from full HP with 1 HP
        if (sturdyEndures(defender, attacker, defender.hp[0], damage)) {
            damage = defender.hp[0] - 1;
            text.push(pokemonNameToString(defender) + " endured the hit!");
        }
        // Focus Sash: survive a would-be KO from full HP with 1 HP, then is consumed
        let sashSaved = false;
        if (
            defender.item &&
            defender.item.name === FOCUS_SASH &&
            defender.hp[0] === defender.hp[1] &&
            damage >= defender.hp[0]
        ) {
            damage = defender.hp[0] - 1;
            sashSaved = true;
        }

        if (isCrit) text.push("A critical hit!");
        // Mimikyu's Disguise soaks up the first damaging hit (then it takes 1/8 max HP)
        let disguiseBroke = false;
        if (abilityName(defender) === "disguise" && !defender.disguiseBusted && !ignoresAbilities(attacker)) {
            damage = 0;
            defender.disguiseBusted = true;
            disguiseBroke = true;
        }
        const hpBefore = defender.hp[0];
        damage_number = 0; // this hit's damage; totalDamage collects them across hits
        [defender.hp[0], damage_number] =
            defender.hp[0] - damage > 0
                ? [defender.hp[0] - damage, damage]
                : [0, defender.hp[0]];
        if (disguiseBroke) {
            text.push(pokemonNameToString(defender) + "'s disguise served it as a decoy!");
            defender.hp[0] = Math.max(0, defender.hp[0] - Math.floor(defender.hp[1] / 8));
            text.push(pokemonNameToString(defender) + "'s disguise busted!");
        } else {
            text.push(
                pokemonNameToString(defender) +
                    " lost " +
                    Math.round((damage_number / defender.hp[1]) * 1000) / 10 +
                    "% HP!"
            );
        }
        if (ohko && defender.hp[0] === 0) text.push("It's a one-hit KO!");
        if (sashSaved) {
            text.push(
                pokemonNameToString(defender) + " hung on using its " + itemLabel(defender) + "!"
            );
            consumeItem(defender);
        }

        // Air Balloon: pops the moment the holder takes any damage (ground hits never reach here, see typeEffectiveness)
        if (defender.item && defender.item.name === AIR_BALLOON && damage_number > 0) {
            text.push(pokemonNameToString(defender) + "'s Balloon popped!");
            consumeItem(defender);
        }

        // Weakness Policy: +2 Atk/SpA when hit by a super-effective move
        if (
            defender.item &&
            defender.item.name === WEAKNESS_POLICY &&
            typeEff > 1 &&
            defender.hp[0] > 0
        ) {
            addArrayToArray(
                text,
                doStatChangesRaw(defender, [
                    { statIndex: 0, change: 2 },
                    { statIndex: 2, change: 2 },
                ])
            );
            consumeItem(defender);
        }

        // Kee Berry: +1 Defense when hit by a physical move
        if (
            defender.item &&
            defender.item.name === KEE_BERRY &&
            move.damage_class.name === "physical" &&
            defender.hp[0] > 0 &&
            !berryBlocked(defender)
        ) {
            addArrayToArray(text, doStatChangesRaw(defender, [{ statIndex: 1, change: hasRipen(defender) ? 2 : 1 }]));
            consumeItem(defender);
        }

        // Rocky Helmet: contact against the holder costs the attacker 1/6 max HP
        if (
            makesContact(attacker, move) &&
            defender.item &&
            defender.item.name === ROCKY_HELMET &&
            damage_number > 0 &&
            attacker.hp[0] > 0 &&
            !indirectDamageBlocked(attacker)
        ) {
            attacker.hp[0] = Math.max(0, attacker.hp[0] - Math.floor(attacker.hp[1] / 6));
            text.push(pokemonNameToString(attacker) + " was hurt by Rocky Helmet!");
            if (attacker.hp[0] === 0) text.push(pokemonNameToString(attacker) + " fainted!");
        }

        // Sticky Barb: contact against the holder transfers it to the attacker (if it has none)
        if (
            makesContact(attacker, move) &&
            defender.item &&
            defender.item.name === STICKY_BARB &&
            damage_number > 0 &&
            !attacker.item
        ) {
            text.push(pokemonNameToString(defender) + "'s Sticky Barb attached to " + pokemonNameToString(attacker) + "!");
            attacker.item = defender.item;
            defender.item = null;
        }

        // The defender's ability reacting to being hit (Mummy, Wandering Spirit, Illusion...)
        if (damage_number > 0) {
            runHook(defender, "onDamagingHit", {
                attacker,
                move,
                damage: damage_number,
                text,
                field,
                ...abilityApi(field),
            }, attacker);
            // ...and a hit that takes it to half HP or less can trigger Emergency Exit, Berserk...
            if (defender.hp[0] > 0 && hpBefore > defender.hp[1] / 2 && defender.hp[0] <= defender.hp[1] / 2 && defenderTeam) {
                runHook(defender, "onHpBelowHalf", { selfTeam: defenderTeam, text, ...abilityApi(field) }, attacker);
            }
            // The attacker's own ability reacting to a hit it landed (Poison Touch, Magician...)
            runHook(attacker, "onAttackHit", { defender, move, damage: damage_number, sheerForced, text, ...abilityApi(field) });
        }

        // Knock Off: knocks the defender's item away after the hit (unless it's unremovable)
        if (move.name === "knock-off" && isRemovable(defender.item) && !protectsItem(defender, attacker) && damage_number > 0) {
            text.push(pokemonNameToString(defender) + " lost its " + itemLabel(defender) + "!");
            consumeItem(defender);
        }

        // Thief: steals the defender's item if the attacker isn't already holding one
        if (
            move.name === "thief" &&
            !attacker.item &&
            isRemovable(defender.item) &&
            !protectsItem(defender, attacker) &&
            damage_number > 0
        ) {
            text.push(
                pokemonNameToString(attacker) + " stole " + pokemonNameToString(defender) + "'s " + itemLabel(defender) + "!"
            );
            attacker.item = defender.item;
            defender.item = null;
        }

        // Incinerate: burns up the defender's Berry after the hit (no effect triggers, it's just gone)
        if (
            move.name === "incinerate" &&
            defender.item &&
            defender.item.name.endsWith("-berry") &&
            !protectsItem(defender, attacker) &&
            damage_number > 0
        ) {
            text.push(pokemonNameToString(defender) + "'s " + itemLabel(defender) + " was burnt up!");
            consumeItem(defender);
        }

        // Bug Bite / Pluck: eats the defender's Berry immediately for its effect
        if (
            (move.name === "bug-bite" || move.name === "pluck") &&
            defender.item &&
            defender.item.name.endsWith("-berry") &&
            !protectsItem(defender, attacker) &&
            damage_number > 0 &&
            attacker.hp[0] > 0
        ) {
            const stolenBerry = defender.item;
            text.push(
                pokemonNameToString(attacker) + " stole and ate " + pokemonNameToString(defender) + "'s " + itemLabel(defender) + "!"
            );
            consumeItem(defender);
            applyBerryEffect(attacker, stolenBerry, text);
        }

        // A frozen target thaws when hit by a Fire-type damaging move (Polar Flare excepted)
        // or by one of the few moves flagged to thaw their target (Scald, Steam Eruption, ...).
        if (
            defender.status &&
            defender.status.name === "freeze" &&
            damage_number > 0 &&
            defender.hp[0] > 0 &&
            ((move.type.name === "fire" && move.name !== "polar-flare") ||
                THAWS_TARGET_MOVES.has(move.name))
        ) {
            defender.status = null;
            text.push(pokemonNameToString(defender) + " thawed out!");
        }

        // Shield Dust keeps every secondary effect of the move off it
        const secondaryBlocked = blocksSecondaryEffects(defender, attacker);
        if (!sheerForced && !secondaryBlocked) tryInflictAilment(attacker, defender, move, text, field);

        // Secondary flinch (Air Slash, Bite, Fake Out...): only matters if the target hasn't
        // moved yet this turn, since the flinch is wiped at the end of the turn. Covert Cloak
        // blocks it.
        const flinchChance = move.meta && move.meta.flinch_chance * chanceMultiplier(attacker);
        if (
            !sheerForced &&
            !secondaryBlocked &&
            flinchChance > 0 &&
            damage_number > 0 &&
            defender.hp[0] > 0 &&
            !preventsFlinch(defender, attacker) && // Inner Focus
            !(defender.item && defender.item.name === COVERT_CLOAK) &&
            Math.random() * 100 < flinchChance
        ) {
            defender.flinched = true;
        }
        // Anchor Shot / Spirit Shackle / Thousand Waves / Jaw Lock trap the target on hit
        // (Jaw Lock traps the user too)
        if (TRAPPING_MOVES.has(move.name) && damage_number > 0) {
            if (applyTrap(attacker, defender, "trapped", move, text) && move.name === "jaw-lock") {
                applyTrap(defender, attacker, "trapped", move, text);
            }
        }

        totalDamage += damage_number;
        hitsLanded += 1;
    }
    damage_number = totalDamage;
    if (hitsLanded > 1) text.push("Hit " + hitsLanded + " times!");
    // Knocking something out (Moxie, Beast Boost...)
    if (defender.hp[0] === 0 && attacker.hp[0] > 0 && totalDamage > 0) {
        runHook(attacker, "onKO", { defender, text, ...abilityApi(field) });
    }

    if (move.meta && move.meta.drain > 0 && totalDamage > 0 && hasLiquidOoze(defender, attacker)) {
        // Liquid Ooze: the drained HP is taken from the attacker instead of healing it
        abilityApi(field).hurt(
            attacker,
            Math.floor(totalDamage * (move.meta.drain / 100)),
            text,
            " sucked up the liquid ooze!"
        );
    } else if (
        attacker.hp[0] < attacker.hp[1] &&
        move.meta &&
        move.meta.drain > 0
    ) {
        // Drain hp (giga-drain, drain-punch)
        let hpNumber = 0;
        [hpNumber, attacker.hp[0]] =
            attacker.hp[0] +
                Math.floor(damage_number * (Math.abs(move.meta.drain) / 100)) >
            attacker.hp[1]
                ? [attacker.hp[1] - attacker.hp[0], attacker.hp[1]]
                : [
                      Math.floor(
                          damage_number * (Math.abs(move.meta.drain) / 100)
                      ),
                      attacker.hp[0] +
                          Math.floor(
                              (damage_number * Math.abs(move.meta.drain)) / 100
                          ),
                  ];
        if (attacker.hp[0] > attacker.hp[1]) attacker.hp[0] = attacker.hp[1];
        if (hpNumber === 0) {
            hpNumber = 1;
            attacker.hp[0] = attacker.hp[0] + hpNumber;
        }
        text.push(
            pokemonNameToString(attacker) +
                " healed " +
                Math.round((hpNumber / attacker.hp[1]) * 1000) / 10 +
                "% HP!"
        );
    } else if (move.meta && move.meta.drain < 0 && !hasNoRecoil(attacker) && !indirectDamageBlocked(attacker)) {
        // Recoil
        let hpNumber = 0;
        [hpNumber, attacker.hp[0]] =
            attacker.hp[0] -
                Math.floor(damage_number * (Math.abs(move.meta.drain) / 100)) <=
            0
                ? [attacker.hp[0], 0]
                : [
                      Math.floor(
                          damage_number * (Math.abs(move.meta.drain) / 100)
                      ),
                      attacker.hp[0] -
                          Math.floor(
                              damage_number * (Math.abs(move.meta.drain) / 100)
                          ),
                  ];
        if (hpNumber === 0) {
            hpNumber = 1;
            attacker.hp[0] = attacker.hp[0] - hpNumber;
        }
        text.push(
            pokemonNameToString(attacker) +
                " lost " +
                Math.round((hpNumber / attacker.hp[1]) * 1000) / 10 +
                "% HP to recoil!"
        );
    } else if (move.name === "explosion" || move.name === "self-destruct") {
        attacker.hp[0] = 0;
        text.push(pokemonNameToString(attacker) + " blew up!");
    }

    // Struggle: the user takes 1/4 of its own max HP no matter how much it dealt
    if (move.name === "struggle" && damage_number > 0 && attacker.hp[0] > 0) {
        attacker.hp[0] = Math.max(0, attacker.hp[0] - Math.max(1, Math.floor(attacker.hp[1] / 4)));
        text.push(pokemonNameToString(attacker) + " was hurt by recoil!");
        if (attacker.hp[0] === 0) text.push(pokemonNameToString(attacker) + " fainted!");
    }

    // Life Orb: 1/10 max HP recoil on the attacker whenever it deals damage
    if (
        attacker.hp[0] > 0 &&
        damage_number > 0 &&
        !sheerForced &&
        !indirectDamageBlocked(attacker) &&
        attacker.item &&
        attacker.item.name === LIFE_ORB
    ) {
        attacker.hp[0] = Math.max(0, attacker.hp[0] - Math.floor(attacker.hp[1] / 10));
        text.push(pokemonNameToString(attacker) + " was hurt by its Life Orb!");
    }

    // Fling: whatever was thrown is gone after use
    if (move.name === "fling" && attacker.item) consumeItem(attacker);

    if (defender.hp[0] === 0) {
        text.push(pokemonNameToString(defender) + " fainted!");
    }
    if (attacker.hp[0] === 0) {
        text.push(pokemonNameToString(attacker) + " fainted!");
    }

    if (defender.hp[0] > 0) tryConsumeHpTriggeredItem(defender, text);
    if (attacker.hp[0] > 0) tryConsumeHpTriggeredItem(attacker, text);

    return text;
}

export function doSwitch(pokemon, index, options = {}) {
    let oldCurrent = pokemon[0];
    // Baton Pass hands stat stages and confusion to the replacement
    const passed = options.baton
        ? { stat_levels: [...oldCurrent.stat_levels], confusion: oldCurrent.confusion, focusEnergy: oldCurrent.focusEnergy }
        : null;
    // Abilities that act on leaving (Regenerator, Natural Cure)
    const leaveText = [];
    if (oldCurrent.hp[0] > 0) {
        runHook(oldCurrent, "onSwitchOut", { selfTeam: pokemon, text: leaveText, ...abilityApi(pokemon.field) });
    }
    resetAbilityState(oldCurrent); // undo Transform / borrowed abilities / Illusion
    oldCurrent.disabled = null;
    resetStatChanges(oldCurrent); // Reset stat changes on switch out
    oldCurrent.lockedMove = null;
    oldCurrent.charging = null;
    oldCurrent.mustRecharge = false;
    oldCurrent.flinched = false;
    oldCurrent.trap = null;
    oldCurrent.focusEnergy = false;
    oldCurrent.actionsSinceSwitch = 0;
    oldCurrent.activeTurns = 0;
    // Confusion is a volatile status: it doesn't survive a switch. (Major statuses do,
    // except that a badly-poisoned mon's toxic counter restarts.)
    oldCurrent.confusion = null;
    if (oldCurrent.status && oldCurrent.status.name === "toxic") oldCurrent.status.counter = 1;
    let text = "";
    if (oldCurrent.hp[0] > 0)
        text = "Switch out " + pokemonNameToString(oldCurrent) + "! " + (leaveText.length > 0 ? leaveText.join(" ") + " " : "");
    pokemon[0] = pokemon[index];
    pokemon[index] = oldCurrent;
    pokemon[0].lockedMove = null;
    pokemon[0].charging = null;
    pokemon[0].mustRecharge = false;
    pokemon[0].flinched = false;
    pokemon[0].trap = null;
    pokemon[0].focusEnergy = false;
    pokemon[0].actionsSinceSwitch = 0;
    pokemon[0].activeTurns = 0;
    pokemon[0].disabled = null;
    pokemon[0].confusion = null;
    if (pokemon[0].status && pokemon[0].status.name === "toxic") pokemon[0].status.counter = 1;
    resetStatChanges(pokemon[0]); // Reset stat changes on switch in
    if (passed) {
        pokemon[0].stat_levels = passed.stat_levels;
        pokemon[0].confusion = passed.confusion;
        pokemon[0].focusEnergy = passed.focusEnergy;
    }
    // Abilities that trigger on entering (Intimidate, Illusion, Imposter...); the on-entry
    // text is tacked onto the switch line since callers expect a single string back
    text = text + "Switch in " + pokemonNameToString(pokemon[0]) + "!";
    // Entry hazards hit first; a pokemon that faints to them never gets its ability going
    const hazardText = [];
    applyHazards(pokemon[0], pokemon, hazardText, (p, changes, t) =>
        addArrayToArray(t, doStatChanges(p, { stat_changes: changes }))
    );
    const entry =
        options.foeTeam && pokemon[0].hp[0] > 0
            ? runEntryAbilities(pokemon, options.foeTeam, ensureField(pokemon, options.foeTeam))
            : [];
    const extra = [...hazardText, ...entry];
    return extra.length > 0 ? text + " " + extra.join(" ") : text;
}

export function doMoveEffects(attacker, defender, move, opts = {}) {
    let text = [];
    // Sheer Force strips the secondary stat changes off the moves it powers up
    if (opts.sheerForced) {
        tryConsumeWhiteHerb(attacker, text);
        tryConsumeWhiteHerb(defender, text);
        return text;
    }
    if (
        attacker.hp[0] > 0 &&
        move.meta &&
        move.meta.stat_chance === 100 &&
        move.meta.category.name === "damage-raise" // was "damage+raise", which PokeAPI never returns
    ) {
        addArrayToArray(text, doStatChanges(attacker, move));
    }
    if (
        defender.hp[0] > 0 &&
        move.meta &&
        move.meta.stat_chance === 100 &&
        move.meta.category.name === "damage-lower" // was "damage+lower", which PokeAPI never returns
    ) {
        if (opts.shieldDust) {
            // Shield Dust: the secondary stat drop just doesn't happen
        } else if (defender.item && defender.item.name === COVERT_CLOAK) {
            text.push(
                pokemonNameToString(defender) +
                    "'s Covert Cloak protected it from the effect!"
            );
        } else {
            addArrayToArray(text, doStatChanges(defender, move, attacker));
        }
    }
    tryConsumeWhiteHerb(attacker, text);
    tryConsumeWhiteHerb(defender, text);
    return text;
}

function tryConsumeWhiteHerb(pokemon, text) {
    if (!pokemon.item || pokemon.item.name !== WHITE_HERB) return;
    if (pokemon.stat_levels.some((level) => level < 0)) {
        pokemon.stat_levels = pokemon.stat_levels.map((level) => Math.max(level, 0));
        text.push(pokemonNameToString(pokemon) + " restored its stats using its White Herb!");
        consumeItem(pokemon);
    }
}

// Order matches pokemon.stat_levels: the five battle stats, then accuracy and evasion.
const STAT_NAMES = ["attack", "defense", "special-attack", "special-defense", "speed", "accuracy", "evasion"];

// Applies stat stage changes described as {statIndex, change} pairs (used by items,
// which don't come with a move's stat_changes array to read from).
function doStatChangesRaw(pokemon, changes) {
    return doStatChanges(pokemon, {
        stat_changes: changes.map(({ statIndex, change }) => ({
            stat: { name: STAT_NAMES[statIndex] },
            change,
        })),
    });
}

// Changes `pokemon`'s stat stages. `source` is who caused it when that's another pokemon
// (Growl, Intimidate...): their drops can be stopped by Clear Body and set off Defiant, while
// Contrary/Simple rewrite every change the owner gets, its own included.
export function doStatChanges(pokemon, move, source = null) {
    let texts = [];
    const stat_names = STAT_NAMES;
    // A pokemon from before accuracy/evasion existed only has five stages
    while (pokemon.stat_levels.length < STAT_NAMES.length) pokemon.stat_levels.push(0);
    const fromFoe = source && source !== pokemon;
    let droppedByFoe = false;
    for (const stat of move.stat_changes) {
        let text = "";
        const stat_index = stat_names.indexOf(stat.stat.name);
        if (stat_index === -1) continue; // not a stage this engine tracks (HP, ...)
        const delta = abilityModifyBoost(pokemon, stat.change, fromFoe ? source : null);
        if (delta < 0 && fromFoe) {
            const blocker = abilityBlocksDrop(pokemon, stat.stat.name, source);
            if (blocker) {
                texts.push(pokemonNameToString(pokemon) + "'s " + blocker + " prevents its stats from being lowered!");
                continue;
            }
        }
        pokemon.stat_levels[stat_index] = pokemon.stat_levels[stat_index] + delta;
        let change = delta < 0 ? " lowered!" : " raised!";
        text =
            pokemonNameToString(pokemon) +
            " had it's " +
            statNameToString(stat_names[stat_index]) +
            change;
        if (pokemon.stat_levels[stat_index] < -6) {
            pokemon.stat_levels[stat_index] = -6;
            text =
                pokemonNameToString(pokemon) +
                "'s " +
                statNameToString(stat_names[stat_index]) +
                " can't go lower!";
        } else if (pokemon.stat_levels[stat_index] > 6) {
            pokemon.stat_levels[stat_index] = 6;
            text =
                pokemonNameToString(pokemon) +
                "'s " +
                statNameToString(stat_names[stat_index]) +
                " can't go higher!";
        } else if (delta < 0 && fromFoe) {
            droppedByFoe = true;
        }
        texts.push(text);
    }
    // Defiant / Competitive answer a stat drop from the other side
    if (droppedByFoe && pokemon.hp[0] > 0) {
        runHook(pokemon, "onStatDropped", { text: texts, ...abilityApi(null) }, source);
    }
    return texts;
}

export function resetStatChanges(pokemon) {
    // (This used to write a stray stat_changes field, so stat stages were never
    // actually cleared when a pokemon switched.)
    pokemon.stat_levels = Array(STAT_NAMES.length).fill(0);
}

// `field` is the shared weather/terrain, `foe` the pokemon out on the other side (a trap
// only holds while whoever trapped you is still there).
function doEndOfTurn(pokemon, field, foe) {
    let text = [];
    if (pokemon.hp[0] <= 0) return text;

    const magicGuard = indirectDamageBlocked(pokemon);
    // Sandstorm / hail chip damage
    const weatherDamage = weatherEndOfTurnDamage(pokemon, field);
    if (weatherDamage > 0) {
        pokemon.hp[0] = Math.max(0, pokemon.hp[0] - weatherDamage);
        text.push(
            pokemonNameToString(pokemon) +
                (weatherOf(field) === "sand" ? " is buffeted by the sandstorm!" : " is buffeted by the hail!")
        );
        if (pokemon.hp[0] === 0) {
            text.push(pokemonNameToString(pokemon) + " fainted!");
            return text;
        }
    }
    // Grassy Terrain heals grounded pokemon 1/16 of their max HP
    if (terrainOf(field) === "grassy" && isGrounded(pokemon) && pokemon.hp[0] < pokemon.hp[1]) {
        const healed = Math.min(Math.floor(pokemon.hp[1] / 16), pokemon.hp[1] - pokemon.hp[0]);
        pokemon.hp[0] += healed;
        text.push(pokemonNameToString(pokemon) + "'s HP was restored by the Grassy Terrain!");
    }

    if (
        hasPoisonHeal(pokemon) &&
        pokemon.status &&
        (pokemon.status.name === "poison" || pokemon.status.name === "toxic")
    ) {
        // Poison Heal turns poison into healing (1/8 max HP)
        const healed = Math.min(Math.floor(pokemon.hp[1] / 8), pokemon.hp[1] - pokemon.hp[0]);
        if (healed > 0) {
            pokemon.hp[0] += healed;
            text.push(pokemonNameToString(pokemon) + " was healed by its Poison Heal!");
        }
    } else if (magicGuard && pokemon.status && ["burn", "poison", "toxic"].includes(pokemon.status.name)) {
        // Magic Guard: the status stays, the damage doesn't
    } else if (pokemon.status && pokemon.status.name === "burn") {
        pokemon.hp[0] = Math.max(0, pokemon.hp[0] - Math.floor(pokemon.hp[1] / (halvesBurnDamage(pokemon) ? 32 : 16))); // Heatproof
        text.push(pokemonNameToString(pokemon) + " is hurt by its burn!");
        if (pokemon.hp[0] === 0) text.push(pokemonNameToString(pokemon) + " fainted!");
    } else if (pokemon.status && pokemon.status.name === "poison") {
        pokemon.hp[0] = Math.max(0, pokemon.hp[0] - Math.floor(pokemon.hp[1] / 8));
        text.push(pokemonNameToString(pokemon) + " is hurt by poison!");
        if (pokemon.hp[0] === 0) text.push(pokemonNameToString(pokemon) + " fainted!");
    } else if (pokemon.status && pokemon.status.name === "toxic") {
        // Showdown: floor(maxHP / 16) * stage, with the stage capped at 15
        pokemon.hp[0] = Math.max(
            0,
            pokemon.hp[0] -
                Math.max(1, Math.floor(pokemon.hp[1] / 16)) * pokemon.status.counter
        );
        text.push(pokemonNameToString(pokemon) + " is hurt by poison!");
        pokemon.status.counter = Math.min(pokemon.status.counter + 1, 15);
        if (pokemon.hp[0] === 0) text.push(pokemonNameToString(pokemon) + " fainted!");
    }

    if (pokemon.hp[0] > 0 && pokemon.item) {
        if (pokemon.item.name === LEFTOVERS) {
            const msg = healPercent(pokemon, Math.floor(pokemon.hp[1] / 16), " restored a little HP using its ");
            if (msg) text.push(msg);
        } else if (pokemon.item.name === BLACK_SLUDGE) {
            const isPoison = pokemon.types.some((t) => t.type.name === "poison");
            if (isPoison) {
                const msg = healPercent(pokemon, Math.floor(pokemon.hp[1] / 16), " restored a little HP using its ");
                if (msg) text.push(msg);
            } else if (!magicGuard) {
                pokemon.hp[0] = Math.max(0, pokemon.hp[0] - Math.floor(pokemon.hp[1] / 8));
                text.push(pokemonNameToString(pokemon) + " was hurt by its Black Sludge!");
                if (pokemon.hp[0] === 0) text.push(pokemonNameToString(pokemon) + " fainted!");
            }
        } else if (pokemon.item.name === STICKY_BARB && !magicGuard) {
            pokemon.hp[0] = Math.max(0, pokemon.hp[0] - Math.floor(pokemon.hp[1] / 8));
            text.push(pokemonNameToString(pokemon) + " was hurt by its Sticky Barb!");
            if (pokemon.hp[0] === 0) text.push(pokemonNameToString(pokemon) + " fainted!");
        } else if (
            (pokemon.item.name === TOXIC_ORB || pokemon.item.name === FLAME_ORB) &&
            !pokemon.status
        ) {
            // The orb afflicts its own holder at the end of the turn, unless the type is immune
            const status = pokemon.item.name === TOXIC_ORB ? "toxic" : "burn";
            const types = pokemon.types.map((t) => t.type.name);
            if (
                !STATUS_IMMUNE_TYPES[status].some((t) => types.includes(t)) &&
                !terrainBlocksStatus(pokemon, status, field) &&
                !abilityBlocksStatus(pokemon, status, null, field)
            ) {
                pokemon.status = status === "toxic" ? { name: "toxic", counter: 1 } : { name: "burn" };
                text.push(
                    pokemonNameToString(pokemon) +
                        (status === "toxic" ? " was badly poisoned by its " : " was burned by its ") +
                        itemLabel(pokemon) +
                        "!"
                );
                tryConsumeStatusCureItem(pokemon, text);
            }
        }
    }

    // Abilities that act at the end of every turn (Cud Chew, Hunger Switch...)
    if (pokemon.hp[0] > 0) {
        runHook(pokemon, "onResidual", { field, foe, text, applyBerry: applyBerryEffect, ...abilityApi(field) });
    }
    // A disabled move comes back after a few turns
    if (pokemon.disabled) {
        pokemon.disabled.turns -= 1;
        if (pokemon.disabled.turns <= 0) {
            pokemon.disabled = null;
            text.push(pokemonNameToString(pokemon) + " is no longer disabled!");
        }
    }

    // Being bound (Wrap, Fire Spin...) hurts every turn until it runs out; any trap ends
    // quietly once whoever set it has left the field.
    if (pokemon.hp[0] > 0 && pokemon.trap) {
        const trap = pokemon.trap;
        if (!foe || foe !== trap.source || foe.hp[0] <= 0) {
            pokemon.trap = null;
        } else if (trap.kind === "binding") {
            trap.turns -= 1;
            if (trap.turns <= 0) {
                pokemon.trap = null;
                text.push(pokemonNameToString(pokemon) + " was freed!");
            } else if (!magicGuard) {
                pokemon.hp[0] = Math.max(0, pokemon.hp[0] - Math.floor(pokemon.hp[1] / 8));
                text.push(pokemonNameToString(pokemon) + " is hurt by being trapped!");
                if (pokemon.hp[0] === 0) text.push(pokemonNameToString(pokemon) + " fainted!");
            }
        }
    }

    if (pokemon.hp[0] > 0) tryConsumeHpTriggeredItem(pokemon, text);
    return text;
}
