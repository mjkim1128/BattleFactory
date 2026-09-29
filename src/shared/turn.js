import { makeMove, switchPokemon } from "./computermove";
import { damageCalc, statCalc, typeEffectiveness, isFixedDamageMove } from "./damagecalc";
import {
    moveNameToString,
    pokemonNameToString,
    statNameToString,
} from "./helpers";
import { FOE_TARGETS, isOhkoMove, ohkoImmune, rollAccuracy } from "./accuracy";
import { spendPP, restorePP, ppLeft, maxPP, hasPP } from "./pp";
import { effectiveSpeed } from "./speed";
import { activeItem } from "./helditem";
import {
    HAZARD_MOVES,
    CLEAR_OWN_SIDE_MOVES,
    CLEAR_BOTH_SIDES_MOVES,
    setHazard,
    getHazards,
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
    hasPoisonHeal,
    boostsStatusPriority,
    removesSecondaries,
    chanceMultiplier,
    indirectDamageBlocked,
    abilityLabel,
    makesContact,
    abilityAdaptMove,
    abilityPriorityBonus,
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
    preventsDisable,
    hasSlowStatusMoves,
    tryIceFace,
    preventsDrag,
    copiesFoeBoosts,
    hasUnseenFist,
    preventsTaunt,
    preventsDisable as preventsMoveLock,
    getAbility,
    canChangeAbility,
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
    FORCE_SWITCH_MOVES,
    PROTECT_MOVES,
    STALL_MOVES,
    PROTECT_BLOCKED,
    SUBSTITUTE_BYPASS,
    NO_SLEEP_TALK,
    FAIL_ENCORE,
    SNATCHABLE_MOVES,
    FAIL_COPYCAT,
    FAIL_ME_FIRST,
    HEAL_MOVES,
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
import { PogeyData } from "./pogey";
import METRONOME_POOL from "./metronome_pool.json";
import MIRROR_MOVE_LIST from "./mirror_moves.json";

const jsonClone = (x) => JSON.parse(JSON.stringify(x));
const MIRROR_MOVES = new Set(MIRROR_MOVE_LIST);
// Moves a teammate can't lend through Assist (charge/two-turn, calls-another-move, and
// anything that would need information Assist doesn't have)
const ASSIST_BLOCKED = new Set([
    "assist", "metronome", "mimic", "sketch", "mirror-move", "copycat", "me-first", "transform",
    "sleep-talk", "chatter", "struggle", "counter", "mirror-coat", "metal-burst", "focus-punch",
    "beak-blast", "shell-trap", "belch", "celebrate", "hold-hands", "baton-pass", "instruct",
]);
// Moves that can't be used while Gravity is in effect (everyone is grounded)
const GRAVITY_BLOCKED_MOVES = new Set(["fly", "bounce", "splash", "magnet-rise", "telekinesis", "high-jump-kick", "jump-kick", "sky-drop"]);

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
            if (healed <= 0 || pokemon.hp[0] <= 0 || pokemon.healBlock) return 0;
            pokemon.hp[0] += healed;
            t.push(pokemonNameToString(pokemon) + msg);
            return healed;
        },
        layHazard: (team, kind, t) => setHazard(team, kind, t),
        disable: (pokemon, move, t) => {
            if (preventsDisable(pokemon)) {
                t.push(pokemonNameToString(pokemon) + "'s Aroma Veil protected it from Disable!");
                return;
            }
            pokemon.disabled = { move: move.name, turns: 5 };
            t.push(pokemonNameToString(pokemon) + "'s " + moveNameToString(move) + " was disabled!");
        },
    };
}

function hasCustapBoost(pokemon) {
    return (
        activeItem(pokemon) &&
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
    pokemon.itemUsedThisTurn = true;
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
    if (healAmount > 0 && pokemon.hp[0] < pokemon.hp[1] && !pokemon.healBlock) {
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
    return !!pokemon.unnerved && !!activeItem(pokemon) && pokemon.item.name.endsWith("-berry");
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
    if (!activeItem(pokemon) || pokemon.hp[0] <= 0 || berryBlocked(pokemon)) return;
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
    return effectiveSpeed(pokemon, field);
}

// A pokemon in the middle of a two-turn move has no say in what it does next.
function forcedMove(pokemon, chosenMove) {
    if (pokemon.charging) return pokemon.moveset.find((m) => m.name === pokemon.charging) || chosenMove;
    // Encore: it can only repeat the move it used last (while that move has PP left)
    if (pokemon.encore) {
        const encored = pokemon.moveset.find((m) => m.name === pokemon.encore.move);
        if (encored && hasPP(encored)) return encored;
    }
    return chosenMove;
}

// A pokemon that is trapped (Wrap, Mean Look, ...) can't switch out by choice. Pivot moves
// and Baton Pass still get it out, and a Shed Shell holder slips free. It only lasts while
// whoever trapped it is still out on the field.
export function isTrapped(team, foeTeam) {
    const pokemon = team[0];
    if (team.field && team.field.fairyLock) return true; // Fairy Lock: no one can switch this turn, Shed Shell included
    if (activeItem(pokemon) && pokemon.item.name === SHED_SHELL) return false;
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
    a.tailwindActive = teamA.tailwindTurns > 0;
    b.tailwindActive = teamB.tailwindTurns > 0;
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
        // Mycelium Might: its status moves go last in the bracket whatever the speed
        const lastInBracket = (mv, mon) => mv.priority !== 6 && mv.damage_class.name === "status" && hasSlowStatusMoves(mon);
        const [playerLast, cpuLast] = [lastInBracket(move, playerPokemon[0]), lastInBracket(cpuMove, opponentPokemon[0])];
        if (playerLast !== cpuLast) movefirst = cpuLast;
        else {
            const [mine, theirs] = [getEffectiveSpeed(playerPokemon[0], field), getEffectiveSpeed(opponentPokemon[0], field)];
            movefirst = field.trickRoom ? mine < theirs : mine > theirs; // Trick Room: the slower one goes first
        }
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
        const stages = snapshotStages(playerPokemon, opponentPokemon);
        team.actingLast = step === 1; // Protect fails for whoever moves last
        foeTeam.queuedMove = step === 0 ? (isPlayer ? plan.cpuMove : plan.move) : null; // Me First copies it
        text = addArrayToArray(text, playerTurn(team, foeTeam, move));
        foeTeam.queuedMove = null;
        refreshBattlefield(playerPokemon, opponentPokemon);
        copyBoostsForOpportunist(stages, playerPokemon, opponentPokemon, text);
        // Roar / Whirlwind / Dragon Tail / Circle Throw: a random pokemon is dragged in, and
        // a target that hadn't moved yet loses its action
        for (const victim of [team, foeTeam]) {
            if (!victim.dragRequest) continue;
            victim.dragRequest = false;
            const options = [];
            for (let i = 1; i < victim.length; i++) if (victim[i].hp[0] > 0) options.push(i);
            if (options.length === 0 || victim[0].hp[0] <= 0) continue;
            victim.pivotRequest = null;
            const victimIsPlayer = victim === playerPokemon;
            if (victim === foeTeam && step === 0) plan.skipSide = victimIsPlayer ? "player" : "cpu";
            text.push(
                doSwitch(victim, options[Math.floor(Math.random() * options.length)], {
                    foeTeam: victimIsPlayer ? opponentPokemon : playerPokemon,
                })
            );
        }
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
    if (field.trickRoom) {
        field.trickRoom.turns -= 1;
        if (field.trickRoom.turns <= 0) {
            field.trickRoom = null;
            text.push("The twisted dimensions returned to normal!");
        }
    }
    if (field.gravity && --field.gravity.turns <= 0) {
        field.gravity = null;
        text.push("Gravity turned back to normal!");
    }
    if (field.wonderRoom && --field.wonderRoom.turns <= 0) {
        field.wonderRoom = null;
        text.push("Wonder Room wore off, and Defenses and Sp. Defenses returned to normal!");
    }
    if (field.magicRoom && --field.magicRoom.turns <= 0) {
        field.magicRoom = null;
        text.push("Magic Room wore off, and held items' effects returned to normal!");
    }
    if (field.mudSport && --field.mudSport.turns <= 0) field.mudSport = null;
    if (field.waterSport && --field.waterSport.turns <= 0) field.waterSport = null;
    if (field.ionDeluge) field.ionDeluge = null; // lasts one turn
    if (field.fairyLock && --field.fairyLock.turns <= 0) field.fairyLock = null;
    // Wish comes true at the end of the turn after it was made
    processWish(playerPokemon, text);
    processWish(opponentPokemon, text);
    // Doom Desire / Future Sight land two turns after they were used
    processFutureAttack(playerPokemon, text, field);
    processFutureAttack(opponentPokemon, text, field);
    const endStages = snapshotStages(playerPokemon, opponentPokemon);
    text = addArrayToArray(text, doEndOfTurn(playerPokemon[0], field, opponentPokemon[0]));
    text = addArrayToArray(text, doEndOfTurn(opponentPokemon[0], field, playerPokemon[0]));
    copyBoostsForOpportunist(endStages, playerPokemon, opponentPokemon, text);
    tickTerrain(field, text);
    // The field may have changed at the end of the turn (weather ran out, a Cloud Nine holder
    // fainted): abilities that follow it (Forecast, Protosynthesis...) catch up
    refreshBattlefield(playerPokemon, opponentPokemon);
    for (const t of [playerPokemon, opponentPokemon]) runHook(t[0], "onUpdate", { field, text });
    for (const team of [playerPokemon, opponentPokemon]) {
        team[0].movedThisTurn = false;
        team[0].itemUsedThisTurn = false;
        // Protect & co. only last the turn; a stall move that wasn't used again this turn starts
        // the chain over
        team[0].protection = null;
        team[0].enduring = false;
        team[0].lastPhysicalDamage = team[0].lastSpecialDamage = team[0].lastDamageTaken = 0; // Counter & co. only look at this turn
        if (!team[0].stalledThisTurn) team[0].stallDivisor = 1;
        team[0].stalledThisTurn = false;
        if (team.reflectTurns > 0) team.reflectTurns -= 1;
        if (team.lightScreenTurns > 0) team.lightScreenTurns -= 1;
        if (team.auroraTurns > 0) team.auroraTurns -= 1;
        if (team.tailwindTurns > 0 && --team.tailwindTurns === 0) text.push("The tailwind petered out!");
        if (team.safeguardTurns > 0 && --team.safeguardTurns === 0) text.push("The team is no longer protected by Safeguard!");
        if (team.luckyChantTurns > 0 && --team.luckyChantTurns === 0) text.push("The team is no longer shielded from critical hits!");
        if (team.mistTurns > 0 && --team.mistTurns === 0) text.push("The team's Mist wore off!");
        team[0].mistActive = team.mistTurns > 0;
        // Quick Guard / Wide Guard / Crafty Shield / Mat Block only hold up for the turn they're used
        team.quickGuardTurn = false;
        team.wideGuardTurn = false;
        team.craftyShieldTurn = false;
        team.matBlockTurn = false;
        team[0].magicCoat = false;
        team[0].snatching = false;
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
    const field = ensureField(playerPokemon, opponentPokemon);
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
    // Taunt: no status moves
    if (attacker.taunt && chosenMove.damage_class.name === "status" && chosenMove.name !== "struggle") {
        text.push(pokemonNameToString(attacker) + " can't use " + moveNameToString(chosenMove) + " after the taunt!");
        return text;
    }
    // Heal Block: no healing moves
    if (attacker.healBlock && HEAL_MOVES.has(chosenMove.name)) {
        text.push(pokemonNameToString(attacker) + " can't use " + moveNameToString(chosenMove) + " because of Heal Block!");
        return text;
    }
    // Imprison: the foe can't use any move the imprisoning pokemon also knows
    if (opponentPokemon[0].imprison && opponentPokemon[0].imprison.has(chosenMove.name) && chosenMove.name !== "struggle") {
        text.push(pokemonNameToString(attacker) + " can't use " + moveNameToString(chosenMove) + "! It's imprisoned!");
        return text;
    }
    // Torment: can't use the same move twice in a row
    if (attacker.torment && chosenMove.name === attacker.lastMove && chosenMove.name !== "struggle" && attacker.charging !== chosenMove.name) {
        text.push(pokemonNameToString(attacker) + " can't use the same move twice in a row because of the torment!");
        return text;
    }
    // Gravity: some moves can't be used while grounded
    if (field && field.gravity && GRAVITY_BLOCKED_MOVES.has(chosenMove.name)) {
        text.push(pokemonNameToString(attacker) + " can't use " + moveNameToString(chosenMove) + " because of gravity!");
        return text;
    }
    // Destiny Bond / Grudge only last until the user's next move
    if (attacker.destinyBond && chosenMove.name !== "destiny-bond") attacker.destinyBond = false;
    if (attacker.grudge && chosenMove.name !== "grudge") attacker.grudge = false;
    attacker.lastMove = chosenMove.name;
    // Using a move spends a PP (the second turn of a two-turn move is free); Pressure on the
    // other side makes it two
    if (attacker.charging !== chosenMove.name) {
        const pressured = opponentPokemon[0].hp[0] > 0 && abilityName(opponentPokemon[0]) === "pressure" && aimsAtFoe(chosenMove);
        spendPP(chosenMove, pressured ? 2 : 1);
    }
    attacker.ignoresAbilityNow = chosenMove.damage_class.name === "status" && hasSlowStatusMoves(attacker);
    executeMove(playerPokemon, opponentPokemon, chosenMove, text, {});
    if (playerPokemon.field) playerPokemon.field.lastMove = chosenMove; // (Copycat copies what was used before it)
    attacker.ignoresAbilityNow = false;
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
    // Electrify / Ion Deluge: this move becomes Electric-type just for this use
    if (attacker.electrify && move.type.name !== "electric") {
        move.type = { name: "electric" };
        attacker.electrify = false;
    } else if (field && field.ionDeluge && move.type.name === "normal") {
        move.type = { name: "electric" };
    }
    // Powder: a Fire-type move blows up in the user's face instead of firing
    if (attacker.powder && move.type.name === "fire") {
        attacker.powder = false;
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push(pokemonNameToString(attacker) + " is covered in powder!");
        const boom = Math.floor(attacker.hp[1] / 4);
        attacker.hp[0] = Math.max(0, attacker.hp[0] - boom);
        text.push(pokemonNameToString(attacker) + " was hurt!");
        if (attacker.hp[0] === 0) text.push(pokemonNameToString(attacker) + " fainted!");
        return;
    }

    if (trySetupScreen(playerPokemon, move, text, field)) return;
    if (tryStartCharge(attacker, move, text, field)) return;
    // Snatch: the other side has been waiting to steal a move like this
    if (!opts.snatched && opponentPokemon[0].snatching && SNATCHABLE_MOVES.has(move.name) && opponentPokemon[0].hp[0] > 0) {
        opponentPokemon[0].snatching = false;
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push(pokemonNameToString(opponentPokemon[0]) + " snatched " + pokemonNameToString(attacker) + "'s move!");
        executeMove(opponentPokemon, playerPokemon, { ...chosenMove }, text, { snatched: true });
        return;
    }
    if (move.name === "tailwind") {
        tryTailwind(playerPokemon, move, text);
        return;
    }
    if (move.name === "safeguard") {
        trySafeguard(playerPokemon, move, text);
        return;
    }
    if (move.name === "court-change") {
        tryCourtChange(playerPokemon, opponentPokemon, move, text);
        return;
    }
    if (move.name === "bide") {
        tryBide(attacker, opponentPokemon[0], move, text, field);
        return;
    }
    if (move.name === "doom-desire" || move.name === "future-sight") {
        tryFutureAttack(playerPokemon, opponentPokemon, move, text);
        return;
    }
    if (move.name === "copycat") {
        tryCopycat(playerPokemon, opponentPokemon, move, text);
        return;
    }
    if (move.name === "me-first") {
        tryMeFirst(playerPokemon, opponentPokemon, move, text);
        return;
    }
    if (move.name === "nature-power") {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        executeMove(playerPokemon, opponentPokemon, natureMove(terrainOf(field)), text, { called: true });
        return;
    }
    if (move.name === "healing-wish" || move.name === "lunar-dance") {
        tryHealingWish(playerPokemon, move, text);
        return;
    }
    if (move.name === "perish-song") {
        tryPerishSong(attacker, opponentPokemon[0], move, text);
        return;
    }
    if (move.name === "wish") {
        tryWish(playerPokemon, move, text);
        return;
    }
    if (STALL_MOVES.has(move.name)) {
        tryStallMove(playerPokemon, move, text);
        return;
    }
    if (move.name === "substitute") {
        trySubstitute(attacker, move, text);
        return;
    }
    if (move.name === "heal-bell" || move.name === "aromatherapy") {
        tryCureTeam(playerPokemon, move, text);
        return;
    }
    if (move.name === "sleep-talk") {
        trySleepTalk(playerPokemon, opponentPokemon, move, text);
        return;
    }
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

    // Feint knocks a shield down and hits anyway
    if (move.name === "feint" && foe.hp[0] > 0 && foe.protection) {
        foe.protection = null;
        text.push(pokemonNameToString(foe) + " fell for the feint!");
    }
    // Protect, Detect, Spiky Shield...: the move is stopped (and a contact move pays for it)
    if (foe.hp[0] > 0 && aimsAtFoe(move) && isBlockedByProtection(foe, attacker, move)) {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push(pokemonNameToString(foe) + " protected itself!");
        protectionPunishesContact(foe, attacker, move, text, field);
        tryCrashDamage(attacker, move, text);
        return;
    }
    // Quick Guard / Wide Guard / Crafty Shield / Mat Block: a side-wide shield for this turn
    if (foe.hp[0] > 0 && aimsAtFoe(move)) {
        const sideBlock = isBlockedBySideProtection(opponentPokemon, move, attacker, field);
        if (sideBlock) {
            text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
            text.push(sideBlock + " protected " + pokemonNameToString(foe) + "!");
            tryCrashDamage(attacker, move, text);
            return;
        }
    }
    // Magic Bounce: a status move aimed at this pokemon is sent straight back at the user
    if (
        !opts.bounced &&
        foe.hp[0] > 0 &&
        move.damage_class.name === "status" &&
        (aimsAtFoe(move) || (move.target && move.target.name === "opponents-field")) &&
        REFLECTABLE_MOVES.has(move.name) &&
        (bouncesMoves(foe, attacker) || foe.magicCoat)
    ) {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push(pokemonNameToString(foe) + (bouncesMoves(foe, attacker) ? "'s Magic Bounce" : "'s Magic Coat") + " bounced the move back!");
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
    // Counter / Mirror Coat / Metal Burst need to have been hit, Endeavor needs the target to be
    // healthier than the user
    if (foe.hp[0] > 0 && fixedMoveHasNothingToWorkWith(move, attacker, foe)) {
        text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
        text.push("But it failed!");
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
        if (activeItem(attacker) && CHOICE_ITEMS[attacker.item.name] !== undefined)
            attacker.lockedMove = move.name; // a missed move still locks a Choice item
        tryCrashDamage(attacker, move, text);
        return;
    }

    addArrayToArray(text, turnText(attacker, foe, move));
    if (typeEffectiveness(move, foe, attacker) === 0) tryCrashDamage(attacker, move, text);
    if (typeEffectiveness(move, foe, attacker) !== 0) {
        foe.subHitFlag = false;
        const snowAlready = !!(field && field.weather && field.weather.name === "snow");
        addArrayToArray(text, doAttack(attacker, foe, move, opponentPokemon, playerPokemon));
        const hitSubstitute = !!foe.subHitFlag;
        foe.subHitFlag = false;
        trackMetronome(attacker, move);
        if (activeItem(attacker) && CHOICE_ITEMS[attacker.item.name] !== undefined)
            attacker.lockedMove = move.name;
        /// temporary fix for moves giving me errors
        if (move.meta !== undefined)
            addArrayToArray(text, doMoveEffects(attacker, foe, move, {
                sheerForced: removesSecondaries(attacker) && SECONDARY_MOVES.has(move.name),
                shieldDust: blocksSecondaryEffects(foe, attacker) || hitSubstitute,
            }));
        if (RECHARGE_MOVES.has(move.name) && attacker.hp[0] > 0) attacker.mustRecharge = true;
        // Rapid Spin & Mortal Spin free the user's side (and the user from being bound);
        // Defog & Tidy Up clear both sides, Defog also blowing away the foe's screens
        if (CLEAR_OWN_SIDE_MOVES.has(move.name) && attacker.hp[0] > 0) {
            clearHazards(playerPokemon, text);
            attacker.trap = null;
            attacker.leechSeed = false;
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
        if (!(move.name === "chilly-reception" && snowAlready)) tryRequestPivot(playerPokemon, foe, move, text);
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

// Healing Wish / Lunar Dance: the user faints and whoever comes in next is fully healed
// (Lunar Dance restores PP too). It fails with nobody left to send in. If the replacement is
// already in perfect shape the wish waits for one that isn't (Showdown's slot condition).
function tryHealingWish(team, move, text) {
    const user = team[0];
    text.push(pokemonNameToString(user) + " used " + moveNameToString(move) + "!");
    if (!team.slice(1).some((p) => p.hp[0] > 0)) {
        text.push("But it failed!");
        return;
    }
    user.hp[0] = 0;
    team.healingWish = move.name === "lunar-dance" ? "lunar" : "healing";
    text.push(pokemonNameToString(user) + " fainted!");
}

// The wish comes true for the pokemon that just switched in, if it needs it.
function applyHealingWish(team, text) {
    const kind = team.healingWish;
    const mon = team[0];
    if (!kind || mon.hp[0] <= 0) return;
    const needsPP = kind === "lunar" && (mon.moveset || []).some((m) => ppLeft(m) < maxPP(m));
    if (mon.hp[0] >= mon.hp[1] && !mon.status && !needsPP) return;
    mon.hp[0] = mon.hp[1];
    mon.status = null;
    if (kind === "lunar") restorePP(mon);
    team.healingWish = null;
    text.push(
        kind === "lunar"
            ? pokemonNameToString(mon) + " became cloaked in mystical moonlight!"
            : pokemonNameToString(mon) + "'s healing wish came true!"
    );
}

// Tailwind (4 turns, doubles the team's Speed) and Safeguard (5 turns, keeps status off the team)
function tryTailwind(team, move, text) {
    text.push(pokemonNameToString(team[0]) + " used " + moveNameToString(move) + "!");
    if (team.tailwindTurns > 0) {
        text.push("But it failed!");
        return;
    }
    team.tailwindTurns = 4;
    team[0].tailwindActive = true;
    text.push("The tailwind blew from behind the team!");
    // Wind Rider gets its Attack up when a tailwind starts
    if (abilityName(team[0]) === "wind-rider") {
        abilityApi(team.field).boost(team[0], [{ stat: { name: "attack" }, change: 1 }], text);
    }
}
function trySafeguard(team, move, text) {
    text.push(pokemonNameToString(team[0]) + " used " + moveNameToString(move) + "!");
    if (team.safeguardTurns > 0) {
        text.push("But it failed!");
        return;
    }
    team.safeguardTurns = 5;
    text.push("The team cloaked itself in a mystical veil!");
}

// Court Change: the two sides trade Reflect, Light Screen, Safeguard, Tailwind, Stealth Rock,
// Spikes and Toxic Spikes (not Aurora Veil or Sticky Web).
function tryCourtChange(teamA, teamB, move, text) {
    text.push(pokemonNameToString(teamA[0]) + " used " + moveNameToString(move) + "!");
    const has = (t) => t.reflectTurns > 0 || t.lightScreenTurns > 0 || t.safeguardTurns > 0 || t.tailwindTurns > 0 ||
        (t.hazards && (t.hazards.stealthRock || t.hazards.spikes > 0 || t.hazards.toxicSpikes > 0));
    if (!has(teamA) && !has(teamB)) {
        text.push("But it failed!");
        return;
    }
    for (const key of ["reflectTurns", "lightScreenTurns", "safeguardTurns", "tailwindTurns"]) {
        [teamA[key], teamB[key]] = [teamB[key] || 0, teamA[key] || 0];
    }
    const hazardsA = getHazards(teamA), hazardsB = getHazards(teamB);
    for (const key of ["stealthRock", "spikes", "toxicSpikes"]) {
        [hazardsA[key], hazardsB[key]] = [hazardsB[key], hazardsA[key]];
    }
    text.push(pokemonNameToString(teamA[0]) + " swapped the battlefield conditions!");
}

// Bide: absorbs hits for 2 turns (see trackDamageTaken), then unleashes double that as damage.
function tryBide(attacker, foe, move, text, field) {
    text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
    if (!attacker.bideTurns) {
        attacker.bideTurns = 2;
        attacker.bideDamage = 0;
        attacker.charging = "bide";
        text.push(pokemonNameToString(attacker) + " is storing energy!");
        return;
    }
    attacker.bideTurns -= 1;
    if (attacker.bideTurns > 0) {
        text.push(pokemonNameToString(attacker) + " is storing energy!");
        return;
    }
    attacker.charging = null;
    const dmg = (attacker.bideDamage || 0) * 2;
    attacker.bideDamage = 0;
    if (dmg <= 0 || foe.hp[0] <= 0) {
        text.push("But it failed!");
        return;
    }
    text.push(pokemonNameToString(attacker) + " unleashed energy!");
    if (typeEffectiveness(move, foe, attacker) === 0) {
        text.push("It doesn't affect " + pokemonNameToString(foe) + "!");
        return;
    }
    foe.hp[0] = Math.max(0, foe.hp[0] - dmg);
    trackDamageTaken(foe, move, Math.min(dmg, foe.hp[1]));
    if (foe.hp[0] === 0) text.push(pokemonNameToString(foe) + " fainted!");
}

// Copycat: uses whichever move was used last, by either side.
function tryCopycat(team, foeTeam, move, text) {
    text.push(pokemonNameToString(team[0]) + " used " + moveNameToString(move) + "!");
    const last = team.field && team.field.lastMove;
    if (!last || FAIL_COPYCAT.has(last.name) || CHARGE_MOVES.has(last.name)) {
        text.push("But it failed!");
        return;
    }
    executeMove(team, foeTeam, { ...last }, text, { called: true });
}

// Me First: goes ahead of the foe's move, using it at 1.5x power. It only works when the foe
// hasn't moved yet and has a damaging move lined up.
function tryMeFirst(team, foeTeam, move, text) {
    text.push(pokemonNameToString(team[0]) + " used " + moveNameToString(move) + "!");
    const queued = foeTeam.queuedMove;
    if (
        !queued ||
        queued.priority === 6 ||
        queued.damage_class.name === "status" ||
        FAIL_ME_FIRST.has(queued.name) ||
        CHARGE_MOVES.has(queued.name) ||
        foeTeam[0].mustRecharge
    ) {
        text.push("But it failed!");
        return;
    }
    executeMove(team, foeTeam, { ...queued, abilityPowerMod: 1.5 }, text, { called: true });
}

// Nature Power becomes a different move depending on the terrain (Showdown: Tri Attack,
// Thunderbolt, Energy Ball, Moonblast, Psychic).
const NATURE_MOVES = {
    default: { name: "tri-attack", ko: "트라이어택", type: "normal", power: 80 },
    electric: { name: "thunderbolt", ko: "10만볼트", type: "electric", power: 90 },
    grassy: { name: "energy-ball", ko: "에너지볼", type: "grass", power: 90 },
    misty: { name: "moonblast", ko: "문포스", type: "fairy", power: 95 },
    psychic: { name: "psychic", ko: "사이코키네시스", type: "psychic", power: 90 },
};
function natureMove(terrain) {
    const def = NATURE_MOVES[terrain] || NATURE_MOVES.default;
    return {
        name: def.name,
        korean_name: def.ko,
        type: { name: def.type },
        damage_class: { name: "special" },
        power: def.power,
        accuracy: 100,
        priority: 0,
        pp: 15,
        target: { name: "selected-pokemon" },
        stat_changes: [],
        meta: { category: { name: "damage" }, ailment: { name: "none" }, ailment_chance: 0, crit_rate: 0, drain: 0, flinch_chance: 0, healing: 0, stat_chance: 0 },
    };
}

// Counter / Mirror Coat / Metal Burst answer damage the user took this turn; Endeavor only works
// on a target with more HP than the user.
function fixedMoveHasNothingToWorkWith(move, attacker, foe) {
    if (move.name === "counter") return !(attacker.lastPhysicalDamage > 0);
    if (move.name === "mirror-coat") return !(attacker.lastSpecialDamage > 0);
    if (move.name === "metal-burst") return !(attacker.lastDamageTaken > 0);
    if (move.name === "endeavor") return attacker.hp[0] >= foe.hp[0];
    return false;
}

// Substitute: pays a quarter of the user's max HP for a decoy with that much HP. It fails
// with one already up or without the HP to spare.
function trySubstitute(user, move, text) {
    text.push(pokemonNameToString(user) + " used " + moveNameToString(move) + "!");
    const cost = Math.floor(user.hp[1] / 4);
    if (user.substitute || user.hp[0] <= user.hp[1] / 4 || user.hp[1] === 1) {
        text.push("But it failed!");
        return;
    }
    user.hp[0] -= cost;
    user.substitute = { hp: cost };
    text.push(pokemonNameToString(user) + " put in a substitute!");
}

// Heal Bell / Aromatherapy: cure the status of the whole party (the ones that are still up).
// Soundproof shrugs off the bell and Sap Sipper the scent, and Good as Gold both; it fails when
// nobody had anything to cure.
function tryCureTeam(team, move, text) {
    const user = team[0];
    text.push(pokemonNameToString(user) + " used " + moveNameToString(move) + "!");
    const shrugsOff = move.name === "heal-bell" ? "soundproof" : "sap-sipper";
    let cured = false;
    for (const member of team) {
        if (member.hp[0] <= 0 || !member.status) continue;
        if (member !== user && [shrugsOff, "good-as-gold"].includes(abilityName(member))) continue;
        member.status = null;
        cured = true;
    }
    text.push(cured ? (move.name === "heal-bell" ? "A bell chimed!" : "A soothing aroma wafted through the air!") : "But it failed!");
}

// Sleep Talk: while asleep, use one of the other moves at random (it costs nothing extra).
function trySleepTalk(team, foeTeam, move, text) {
    const user = team[0];
    text.push(pokemonNameToString(user) + " used " + moveNameToString(move) + "!");
    const asleep = (user.status && user.status.name === "sleep") || abilityName(user) === "comatose";
    const options = (user.moveset || []).filter((m) => m.name !== move.name && !NO_SLEEP_TALK.has(m.name) && !CHARGE_MOVES.has(m.name));
    if (!asleep || options.length === 0) {
        text.push("But it failed!");
        return;
    }
    const chosen = options[Math.floor(Math.random() * options.length)];
    executeMove(team, foeTeam, chosen, text, {});
}

// Protect, Detect, King's Shield, Spiky Shield, Baneful Bunker, Obstruct, Silk Trap, Burning
// Bulwark and Endure. Using one in a row is a third as likely to work each time, and it fails
// outright for whoever moves last in the turn (nothing left to protect against).
function tryStallMove(team, move, text) {
    const user = team[0];
    text.push(pokemonNameToString(user) + " used " + moveNameToString(move) + "!");
    const divisor = user.stallDivisor || 1;
    if (team.actingLast || !(Math.random() * divisor < 1)) {
        user.stallDivisor = 1;
        text.push("But it failed!");
        return;
    }
    user.stallDivisor = Math.min(divisor * 3, 729);
    user.stalledThisTurn = true;
    if (move.name === "endure") {
        user.enduring = true;
        text.push(pokemonNameToString(user) + " braced itself!");
    } else {
        user.protection = move.name;
    }
}

// Does the shield `foe` is holding up stop this move?
function isBlockedByProtection(foe, attacker, move) {
    const shield = PROTECT_MOVES[foe.protection];
    if (!shield || !PROTECT_BLOCKED.has(move.name)) return false;
    if (shield.kind === "damaging" && move.damage_class.name === "status") return false;
    if (hasUnseenFist(attacker) && makesContact(attacker, move)) return false;
    return true;
}

// Does Quick Guard / Wide Guard / Crafty Shield / Mat Block, set up this turn on `foeTeam`,
// stop this move? Returns the (English) shield name for the log, or a falsy value.
function isBlockedBySideProtection(foeTeam, move, attacker, field) {
    if (!foeTeam || !PROTECT_BLOCKED.has(move.name)) return null;
    if (foeTeam.wideGuardTurn && move.target && (move.target.name === "all-opponents" || move.target.name === "all-other-pokemon")) {
        return "Wide Guard";
    }
    if (foeTeam.quickGuardTurn && movePriority(move, attacker, field) > 0) return "Quick Guard";
    if (foeTeam.craftyShieldTurn && move.damage_class.name === "status") return "Crafty Shield";
    if (foeTeam.matBlockTurn && move.damage_class.name !== "status") return "Mat Block";
    return null;
}

// What touching Spiky Shield / King's Shield / Baneful Bunker... does to the attacker
function protectionPunishesContact(foe, attacker, move, text, field) {
    const contact = PROTECT_MOVES[foe.protection].contact;
    if (!contact || !makesContact(attacker, move) || attacker.hp[0] <= 0) return;
    if (contact.damage) abilityApi(field).hurt(attacker, Math.floor(attacker.hp[1] * contact.damage), text, " was hurt by the shield!");
    if (contact.drop) {
        addArrayToArray(text, doStatChanges(attacker, { stat_changes: contact.drop.map(([stat, change]) => ({ stat: { name: stat }, change })) }, foe));
    }
    if (contact.status) inflictStatusDirect(attacker, contact.status, text, field);
}

// What Counter, Mirror Coat and Metal Burst look at: the last damage the pokemon took this turn
function trackDamageTaken(pokemon, move, amount) {
    if (!(amount > 0)) return;
    pokemon.lastDamageTaken = amount;
    if (move.damage_class.name === "physical") pokemon.lastPhysicalDamage = amount;
    if (move.damage_class.name === "special") pokemon.lastSpecialDamage = amount;
    if (pokemon.bideTurns) pokemon.bideDamage = (pokemon.bideDamage || 0) + amount; // Bide
}

// Wish: at the end of the next turn whoever is in the user's slot recovers half of the
// user's max HP, even if the user has switched out by then.
function tryWish(team, move, text) {
    const user = team[0];
    text.push(pokemonNameToString(user) + " used " + moveNameToString(move) + "!");
    if (team.wish) {
        text.push("But it failed!");
        return;
    }
    team.wish = { turns: 2, amount: Math.floor(user.hp[1] / 2) };
    text.push(pokemonNameToString(user) + " made a wish!");
}

function processWish(team, text) {
    const wish = team.wish;
    if (!wish) return;
    wish.turns -= 1;
    if (wish.turns > 0) return;
    team.wish = null;
    const mon = team[0];
    if (mon.hp[0] <= 0 || mon.healBlock) return;
    const healed = Math.min(wish.amount, mon.hp[1] - mon.hp[0]);
    if (healed <= 0) return;
    mon.hp[0] += healed;
    text.push(pokemonNameToString(mon) + "'s wish came true!");
}

// Doom Desire / Future Sight: hits the target's slot two turns from now, even through a switch.
function tryFutureAttack(team, foeTeam, move, text) {
    text.push(pokemonNameToString(team[0]) + " used " + moveNameToString(move) + "!");
    if (foeTeam.futureAttack) {
        text.push("But it failed!");
        return;
    }
    foeTeam.futureAttack = { turns: 3, move: { ...move }, attacker: team[0] };
    text.push(pokemonNameToString(team[0]) + " foresaw an attack!");
}

function processFutureAttack(team, text, field) {
    const pending = team.futureAttack;
    if (!pending) return;
    pending.turns -= 1;
    if (pending.turns > 0) return;
    team.futureAttack = null;
    const target = team[0];
    if (target.hp[0] <= 0) return;
    text.push(pokemonNameToString(target) + " took the " + moveNameToString(pending.move) + " attack!");
    if (typeEffectiveness(pending.move, target, pending.attacker) === 0) {
        text.push("It doesn't affect " + pokemonNameToString(target) + "!");
        return;
    }
    const damage = Math.max(0, damageCalc(pending.attacker, target, pending.move, { field }));
    const dealt = Math.min(damage, target.hp[0]);
    target.hp[0] -= dealt;
    text.push(pokemonNameToString(target) + " lost " + Math.round((dealt / target.hp[1]) * 1000) / 10 + "% HP!");
    if (target.hp[0] === 0) text.push(pokemonNameToString(target) + " fainted!");
}

// Roar / Whirlwind / Dragon Tail / Circle Throw: ask for the target to be dragged out (runTurn
// does it). Suction Cups and Guard Dog hold it in place; it fails with nothing left to drag in.
function requestDrag(attacker, defender, defenderTeam, text, isStatusMove) {
    if (!defenderTeam || defender.hp[0] <= 0) return;
    if (preventsDrag(defender, attacker)) {
        text.push(pokemonNameToString(defender) + "'s " + abilityLabel(defender) + " keeps it in place!");
        return;
    }
    if (!defenderTeam.slice(1).some((p) => p.hp[0] > 0)) {
        if (isStatusMove) text.push("But it failed!");
        return;
    }
    defenderTeam.dragRequest = true;
}

// Opportunist copies whatever stat boosts the other side gets: the stages of both active
// pokemon are noted before an action and compared after it.
function snapshotStages(teamA, teamB) {
    return [teamA, teamB].map((team) => ({ mon: team[0], levels: team[0].stat_levels.slice() }));
}
function copyBoostsForOpportunist(stages, teamA, teamB, text) {
    const pending = [];
    [[teamA, teamB, stages[1]], [teamB, teamA, stages[0]]].forEach(([team, foeTeam, snap]) => {
        const self = team[0];
        const foe = foeTeam[0];
        if (self.hp[0] <= 0 || !copiesFoeBoosts(self) || foe !== snap.mon) return;
        const changes = [];
        foe.stat_levels.forEach((level, i) => {
            const gained = level - (snap.levels[i] || 0);
            if (gained > 0) changes.push({ stat: { name: STAT_NAMES[i] }, change: gained });
        });
        if (changes.length > 0) pending.push([self, changes]);
    });
    for (const [self, changes] of pending) {
        text.push(pokemonNameToString(self) + " seized the opportunity!");
        addArrayToArray(text, doStatChanges(self, { stat_changes: changes }));
    }
}

// Perish Song: everything on the field that hears it faints in a few turns unless it switches
// out (the count is 4 so the first end-of-turn tick shows 3, like Showdown's duration).
function tryPerishSong(attacker, foe, move, text) {
    text.push(pokemonNameToString(attacker) + " used " + moveNameToString(move) + "!");
    let affected = false;
    for (const mon of [attacker, foe]) {
        if (mon.hp[0] <= 0 || mon.perish != null || (mon !== attacker && abilityName(mon) === "soundproof")) continue;
        mon.perish = 4;
        affected = true;
    }
    text.push(affected ? "All Pokemon that heard the song will faint in three turns!" : "But it failed!");
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
    const powerHerb = activeItem(attacker) && attacker.item.name === POWER_HERB;
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
    if (activeItem(attacker) && CHOICE_ITEMS[attacker.item.name] !== undefined)
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
            if (!move || move.name !== "sleep-talk") {
                text.push(pokemonNameToString(attacker) + " is fast asleep.");
                return false;
            }
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
    if (attacker.attract && Math.random() < 0.5) {
        text.push(pokemonNameToString(attacker) + " is immobilized by love!");
        return false;
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
    const holder = activeItem(attackingTeam[0]);
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
    if (!activeItem(attacker) || attacker.item.name !== METRONOME_ITEM) return;
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
    if (amount <= 0 || pokemon.healBlock) return null;
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
    if (!activeItem(pokemon) || pokemon.hp[0] <= 0 || berryBlocked(pokemon)) return;
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
function tryStatusMoveEffect(attacker, defender, move, text, field, defenderTeam, attackerTeam) {
    if (trySpecialStatusMove(attacker, defender, move, text, field, defenderTeam, attackerTeam)) return;
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

    // Taunt / Encore: the target is locked out of status moves / into its last move for a few
    // turns (one turn longer when it has already moved this turn)
    if (move.name === "taunt") {
        if (defender.taunt || preventsTaunt(defender, attacker) || preventsMoveLock(defender, attacker)) {
            text.push(defender.taunt ? "But it failed!" : "It doesn't affect " + pokemonNameToString(defender) + "!");
            return;
        }
        defender.taunt = { turns: 3 + (defender.activeTurns && defender.movedThisTurn ? 1 : 0) };
        text.push(pokemonNameToString(defender) + " fell for the taunt!");
        return;
    }
    if (move.name === "encore") {
        const slot = (defender.moveset || []).find((m) => m.name === defender.lastMove);
        if (defender.encore || !slot || FAIL_ENCORE.has(slot.name) || !hasPP(slot) || preventsMoveLock(defender, attacker)) {
            text.push("But it failed!");
            return;
        }
        defender.encore = { move: slot.name, turns: 3 + (defender.movedThisTurn ? 1 : 0) };
        text.push(pokemonNameToString(defender) + " received an encore!");
        return;
    }
    // Leech Seed: drains 1/8 max HP from the target every turn for as long as it stays in
    if (move.name === "leech-seed") {
        if (defender.types.some((t) => t.type.name === "grass")) {
            text.push("It doesn't affect " + pokemonNameToString(defender) + "!");
        } else if (defender.leechSeed) {
            text.push("But it failed!");
        } else {
            defender.leechSeed = true;
            text.push(pokemonNameToString(defender) + " was seeded!");
        }
        return;
    }
    // Roar / Whirlwind
    if (FORCE_SWITCH_MOVES.has(move.name)) {
        requestDrag(attacker, defender, defenderTeam, text, true);
        return;
    }

    // Memento: the user faints to sharply lower the target's Attack and Sp. Atk
    if (move.name === "memento") {
        addArrayToArray(
            text,
            doStatChanges(defender, { stat_changes: [{ stat: { name: "attack" }, change: -2 }, { stat: { name: "special-attack" }, change: -2 }] }, attacker)
        );
        attacker.hp[0] = 0;
        text.push(attackerName + " fainted!");
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
        if (!activeItem(attacker) || !attacker.item.name.endsWith("-berry")) {
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

// The status moves that each need their own little bit of code. Returns true if `move` was one
// of them (and has been dealt with).
function trySpecialStatusMove(attacker, defender, move, text, field, defenderTeam, attackerTeam) {
    const me = pokemonNameToString(attacker);
    const foe = pokemonNameToString(defender);
    const fail = (msg) => {
        text.push(msg || "But it failed!");
        return true;
    };
    const api = abilityApi(field);
    switch (move.name) {
        case "haze":
            resetStatChanges(attacker);
            resetStatChanges(defender);
            text.push("All stat changes were eliminated!");
            return true;
        case "curse":
            if (!attacker.types.some((t) => t.type.name === "ghost")) {
                // anyone else: Attack and Defense up, Speed down
                addArrayToArray(text, doStatChanges(attacker, { stat_changes: [
                    { stat: { name: "speed" }, change: -1 },
                    { stat: { name: "attack" }, change: 1 },
                    { stat: { name: "defense" }, change: 1 },
                ] }));
                return true;
            }
            // a Ghost pays half its HP to lay a curse that costs the target 1/4 max HP every turn
            if (defender.cursed) return fail();
            attacker.hp[0] = Math.max(0, attacker.hp[0] - Math.floor(attacker.hp[1] / 2));
            defender.cursed = true;
            text.push(me + " cut its own HP and put a curse on " + foe + "!");
            if (attacker.hp[0] === 0) text.push(me + " fainted!");
            return true;
        case "destiny-bond":
            if (attacker.destinyBond) {
                attacker.destinyBond = false;
                return fail();
            }
            attacker.destinyBond = true;
            text.push(me + " is trying to take its foe down with it!");
            return true;
        case "pain-split": {
            const average = Math.floor((attacker.hp[0] + defender.hp[0]) / 2) || 1;
            defender.hp[0] = Math.min(defender.hp[1], average);
            attacker.hp[0] = Math.min(attacker.hp[1], average);
            text.push("The battlers shared their pain!");
            return true;
        }
        case "trick-room":
            if (!field) return fail();
            if (field.trickRoom) {
                field.trickRoom = null;
                text.push("The twisted dimensions returned to normal!");
            } else {
                field.trickRoom = { turns: 5 };
                text.push(me + " twisted the dimensions!");
            }
            return true;
        case "refresh":
            if (!attacker.status || ["sleep", "freeze"].includes(attacker.status.name)) return fail();
            attacker.status = null;
            text.push(me + " cured its status!");
            return true;
        case "magnet-rise":
            if (attacker.magnetRise) return fail();
            attacker.magnetRise = { turns: 5 };
            text.push(me + " levitated with electromagnetism!");
            return true;
        case "strength-sap": {
            if (defender.stat_levels[0] <= -6) return fail();
            const stolen = statCalc(defender.base_stats[1], defender.stat_levels[0]);
            addArrayToArray(text, doStatChanges(defender, { stat_changes: [{ stat: { name: "attack" }, change: -1 }] }, attacker));
            api.heal(attacker, stolen, text, " drained energy from " + foe + "!");
            return true;
        }
        case "magic-coat":
            attacker.magicCoat = true;
            text.push(me + " shrouded itself with Magic Coat!");
            return true;
        case "snatch":
            attacker.snatching = true;
            text.push(me + " waits for a target to make a move!");
            return true;
        case "yawn":
            if (
                defender.status ||
                defender.yawn ||
                abilityBlocksStatus(defender, "sleep", attacker, field) ||
                terrainBlocksStatus(defender, "sleep", field) ||
                (defenderTeam && defenderTeam.safeguardTurns > 0 && !bypassesScreens(attacker))
            ) {
                return fail();
            }
            defender.yawn = 2;
            text.push(foe + " grew drowsy!");
            return true;
        case "soak":
            if (defender.types.length === 1 && defender.types[0].type.name === "water") return fail();
            if (!defender.baseTypes) defender.baseTypes = defender.types;
            defender.types = [{ slot: 1, type: { name: "water" } }];
            text.push(foe + " transformed into the Water type!");
            return true;
        case "reflect-type":
            if (!defender.types.length) return fail();
            if (!attacker.baseTypes) attacker.baseTypes = attacker.types;
            attacker.types = defender.types.map((t) => ({ ...t, type: { ...t.type } }));
            text.push(me + "'s type changed to match " + foe + "'s!");
            return true;
        case "conversion": {
            const type = attacker.moveset && attacker.moveset[0] && attacker.moveset[0].type.name;
            if (!type || attacker.types.some((t) => t.type.name === type)) return fail();
            if (!attacker.baseTypes) attacker.baseTypes = attacker.types;
            attacker.types = [{ slot: 1, type: { name: type } }];
            text.push(me + " transformed into the " + type + " type!");
            return true;
        }
        case "foresight":
            if (defender.foresight) return fail();
            defender.foresight = true;
            text.push(foe + " was identified!");
            return true;
        case "heart-swap": {
            const mine = attacker.stat_levels.slice();
            attacker.stat_levels = defender.stat_levels.slice();
            defender.stat_levels = mine;
            text.push(me + " switched stat changes with " + foe + "!");
            return true;
        }
        case "heal-block":
            if (defender.healBlock) return fail();
            defender.healBlock = { turns: 5 };
            text.push(foe + " was prevented from healing!");
            return true;
        case "disable": {
            const slot = (defender.moveset || []).find((m) => m.name === defender.lastMove);
            if (!slot || slot.name === "struggle" || !hasPP(slot) || defender.disabled || preventsMoveLock(defender, attacker)) return fail();
            defender.disabled = { move: slot.name, turns: defender.movedThisTurn ? 5 : 4 };
            text.push(foe + "'s " + moveNameToString(slot) + " was disabled!");
            return true;
        }
        case "spite": {
            const slot = (defender.moveset || []).find((m) => m.name === defender.lastMove);
            if (!slot || !hasPP(slot)) return fail();
            spendPP(slot, Math.min(4, ppLeft(slot)));
            text.push(foe + "'s " + moveNameToString(slot) + " lost some PP!");
            return true;
        }
        case "toxic-thread":
            addArrayToArray(text, doStatChanges(defender, { stat_changes: [{ stat: { name: "speed" }, change: -1 }] }, attacker));
            tryInflictAilment(
                attacker,
                defender,
                { ...move, meta: { ...move.meta, category: { name: "ailment" }, ailment: { name: "poison" } } },
                text,
                field,
                defenderTeam
            );
            return true;
        case "psycho-shift": {
            if (!attacker.status || defender.status) return fail();
            if (!inflictStatusDirect(defender, attacker.status.name, text, field)) return fail();
            attacker.status = null;
            text.push(me + " passed its status on to " + foe + "!");
            return true;
        }
        case "jungle-healing": {
            const before = attacker.hp[0];
            const healed = api.heal(attacker, Math.floor(attacker.hp[1] / 4), text, " restored some HP!");
            const cured = !!attacker.status;
            attacker.status = null;
            if (!healed && !cured && before === attacker.hp[0]) return fail();
            return true;
        }
        case "lunar-blessing": {
            const before = attacker.hp[0];
            const healed = api.heal(attacker, Math.floor(attacker.hp[1] / 4), text, " restored some HP!");
            const cured = !!attacker.status;
            attacker.status = null;
            if (!healed && !cured && before === attacker.hp[0]) return fail();
            return true;
        }
        // ---- stat-stage / stat copy, swap and split ----
        case "guard-swap": {
            const t = [defender.stat_levels[1], defender.stat_levels[3]];
            defender.stat_levels[1] = attacker.stat_levels[1];
            defender.stat_levels[3] = attacker.stat_levels[3];
            attacker.stat_levels[1] = t[0];
            attacker.stat_levels[3] = t[1];
            text.push(me + " swapped Defense and Sp. Def changes with " + foe + "!");
            return true;
        }
        case "power-swap": {
            const t = [defender.stat_levels[0], defender.stat_levels[2]];
            defender.stat_levels[0] = attacker.stat_levels[0];
            defender.stat_levels[2] = attacker.stat_levels[2];
            attacker.stat_levels[0] = t[0];
            attacker.stat_levels[2] = t[1];
            text.push(me + " swapped Attack and Sp. Atk changes with " + foe + "!");
            return true;
        }
        case "speed-swap": {
            const t = defender.base_stats[5];
            defender.base_stats[5] = attacker.base_stats[5];
            attacker.base_stats[5] = t;
            text.push(me + " swapped Speed with " + foe + "!");
            return true;
        }
        case "guard-split": {
            const def = Math.floor((attacker.base_stats[2] + defender.base_stats[2]) / 2);
            const spd = Math.floor((attacker.base_stats[4] + defender.base_stats[4]) / 2);
            attacker.base_stats[2] = defender.base_stats[2] = def;
            attacker.base_stats[4] = defender.base_stats[4] = spd;
            text.push(me + " shared its Defense and Sp. Def with " + foe + "!");
            return true;
        }
        case "power-split": {
            const atk = Math.floor((attacker.base_stats[1] + defender.base_stats[1]) / 2);
            const spa = Math.floor((attacker.base_stats[3] + defender.base_stats[3]) / 2);
            attacker.base_stats[1] = defender.base_stats[1] = atk;
            attacker.base_stats[3] = defender.base_stats[3] = spa;
            text.push(me + " shared its Attack and Sp. Atk with " + foe + "!");
            return true;
        }
        case "power-trick": {
            const t = attacker.base_stats[1];
            attacker.base_stats[1] = attacker.base_stats[2];
            attacker.base_stats[2] = t;
            text.push(me + " switched its Attack and Defense!");
            return true;
        }
        case "psych-up":
            attacker.stat_levels = defender.stat_levels.slice();
            attacker.focusEnergy = defender.focusEnergy;
            attacker.laserFocus = defender.laserFocus;
            text.push(me + " copied " + foe + "'s stat changes!");
            return true;
        case "topsy-turvy":
            defender.stat_levels = defender.stat_levels.map((s) => -s);
            text.push(foe + "'s stat changes were all reversed!");
            return true;
        case "acupressure": {
            const raisable = [0, 1, 2, 3, 4, 5, 6].filter((i) => attacker.stat_levels[i] < 6);
            if (raisable.length === 0) return fail();
            const i = raisable[Math.floor(Math.random() * raisable.length)];
            addArrayToArray(text, doStatChanges(attacker, { stat_changes: [{ stat: { name: STAT_NAMES[i] }, change: 2 }] }));
            return true;
        }
        // ---- ability copy / swap / suppress ----
        case "role-play": {
            const theirs = abilityName(defender);
            const mine = abilityName(attacker);
            if (!theirs || theirs === mine || !canChangeAbility(theirs) || !canChangeAbility(mine)) return fail();
            attacker.ability = defender.ability;
            text.push(me + "'s ability became " + abilityLabel(attacker) + "!");
            return true;
        }
        case "skill-swap": {
            const theirs = abilityName(defender);
            const mine = abilityName(attacker);
            if (!theirs || !mine || theirs === mine || !canChangeAbility(theirs) || !canChangeAbility(mine)) return fail();
            const tmp = attacker.ability;
            attacker.ability = defender.ability;
            defender.ability = tmp;
            text.push(me + " swapped abilities with " + foe + "!");
            return true;
        }
        case "entrainment": {
            const theirs = abilityName(defender);
            const mine = abilityName(attacker);
            if (!mine || theirs === mine || !canChangeAbility(theirs) || !canChangeAbility(mine)) return fail();
            defender.ability = attacker.ability;
            text.push(foe + " mimicked the ability of " + me + "!");
            return true;
        }
        case "doodle": {
            const theirs = abilityName(defender);
            const mine = abilityName(attacker);
            if (!theirs || theirs === mine || !canChangeAbility(theirs) || !canChangeAbility(mine)) return fail();
            attacker.ability = defender.ability;
            text.push(me + " copied " + foe + "'s ability!");
            return true;
        }
        case "worry-seed": {
            const theirs = abilityName(defender);
            if (theirs === "insomnia" || !canChangeAbility(theirs)) return fail();
            defender.ability = getAbility("insomnia");
            if (defender.status && defender.status.name === "sleep") defender.status = null;
            text.push(foe + " acquired Insomnia!");
            return true;
        }
        case "simple-beam": {
            const theirs = abilityName(defender);
            if (theirs === "simple" || theirs === "truant" || !canChangeAbility(theirs)) return fail();
            defender.ability = getAbility("simple");
            text.push(foe + " acquired Simple!");
            return true;
        }
        case "gastro-acid": {
            const theirs = abilityName(defender);
            if (!theirs || defender.abilitySuppressed || !canChangeAbility(theirs)) return fail();
            defender.ability = null;
            defender.abilitySuppressed = true;
            text.push(foe + "'s ability was suppressed!");
            return true;
        }
        // ---- type changes ----
        case "conversion-2": {
            const lastSlot = (defender.moveset || []).find((m) => m.name === defender.lastMove);
            const lastType = lastSlot && lastSlot.type && lastSlot.type.name;
            if (!lastType || lastType === "typeless") return fail();
            const candidates = [...PogeyData.types.keys()]
                .map((t) => t.toLowerCase())
                .filter((t) => !attacker.types.some((at) => at.type.name === t))
                .filter((t) => PogeyData.getMoveResult({ type: { name: lastType } }, { types: [{ type: { name: t } }] }) < 1);
            if (candidates.length === 0) return fail();
            const chosen = candidates[Math.floor(Math.random() * candidates.length)];
            if (!attacker.baseTypes) attacker.baseTypes = attacker.types;
            attacker.types = [{ slot: 1, type: { name: chosen } }];
            text.push(me + " changed type to resist " + moveNameToString(lastSlot) + "!");
            return true;
        }
        case "camouflage": {
            const terrain = terrainOf(field);
            const type =
                terrain === "electric" ? "electric" : terrain === "grassy" ? "grass" : terrain === "misty" ? "fairy" : terrain === "psychic" ? "psychic" : "normal";
            if (attacker.types.length === 1 && attacker.types[0].type.name === type) return fail();
            if (!attacker.baseTypes) attacker.baseTypes = attacker.types;
            attacker.types = [{ slot: 1, type: { name: type } }];
            text.push(me + " transformed into the " + type + " type!");
            return true;
        }
        case "magic-powder": {
            if (defender.types.some((t) => t.type.name === "grass") || isPowderImmune(defender, attacker)) {
                return fail(foe + " is unaffected!");
            }
            if (defender.types.length === 1 && defender.types[0].type.name === "psychic") return fail();
            if (!defender.baseTypes) defender.baseTypes = defender.types;
            defender.types = [{ slot: 1, type: { name: "psychic" } }];
            text.push(foe + " transformed into the Psychic type!");
            return true;
        }
        case "forests-curse":
            if (defender.types.some((t) => t.type.name === "grass")) return fail();
            if (!defender.baseTypes) defender.baseTypes = defender.types;
            defender.types = [...defender.baseTypes, { slot: defender.baseTypes.length + 1, type: { name: "grass" } }];
            text.push(foe + " was cursed by the forest!");
            return true;
        case "trick-or-treat":
            if (defender.types.some((t) => t.type.name === "ghost")) return fail();
            if (!defender.baseTypes) defender.baseTypes = defender.types;
            defender.types = [...defender.baseTypes, { slot: defender.baseTypes.length + 1, type: { name: "ghost" } }];
            text.push(foe + " added Ghost to its type!");
            return true;
        // ---- accuracy / evasion utility ----
        case "odor-sleuth":
        case "miracle-eye":
            if (defender.foresight) return fail();
            defender.foresight = true;
            text.push(foe + " was identified!");
            return true;
        case "mind-reader":
        case "lock-on":
            attacker.lockOn = { turns: 2 };
            text.push(me + " took aim at " + foe + "!");
            return true;
        // ---- self volatiles: residual healing / crit boost ----
        case "aqua-ring":
            if (attacker.aquaRing) return fail();
            attacker.aquaRing = true;
            text.push(me + " surrounded itself with a veil of water!");
            return true;
        case "ingrain":
            if (attacker.ingrain) return fail();
            attacker.ingrain = true;
            text.push(me + " planted its roots!");
            return true;
        case "laser-focus":
            attacker.laserFocus = { turns: 2 };
            text.push(me + " focused!");
            return true;
        // ---- stockpile / spit up / swallow ----
        case "stockpile": {
            if ((attacker.stockpile || 0) >= 3) return fail();
            attacker.stockpile = (attacker.stockpile || 0) + 1;
            addArrayToArray(
                text,
                doStatChanges(attacker, { stat_changes: [{ stat: { name: "defense" }, change: 1 }, { stat: { name: "special-defense" }, change: 1 }] })
            );
            text.push(me + " stockpiled " + attacker.stockpile + "!");
            return true;
        }
        case "spit-up": {
            if (!attacker.stockpile) return fail();
            attacker.stockpile = 0;
            text.push(me + " unleashed its stockpiled power!");
            return true;
        }
        case "swallow": {
            if (!attacker.stockpile) return fail();
            const percent = [0, 25, 50, 100][attacker.stockpile];
            addArrayToArray(
                text,
                doStatChanges(attacker, { stat_changes: [{ stat: { name: "defense" }, change: -attacker.stockpile }, { stat: { name: "special-defense" }, change: -attacker.stockpile }] })
            );
            attacker.stockpile = 0;
            api.heal(attacker, Math.floor((attacker.hp[1] * percent) / 100), text, " swallowed and restored HP!");
            return true;
        }
        // ---- copying / calling other moves ----
        case "mimic": {
            const lastSlot = (defender.moveset || []).find((m) => m.name === defender.lastMove);
            const mimicIndex = (attacker.moveset || []).findIndex((m) => m.name === "mimic");
            if (!lastSlot || mimicIndex < 0 || attacker.moveset.some((m) => m.name === lastSlot.name) || lastSlot.name === "mimic") {
                return fail();
            }
            attacker.mimicBackup = { index: mimicIndex, original: attacker.moveset[mimicIndex] };
            attacker.moveset[mimicIndex] = { ...jsonClone(lastSlot), ppLeft: 5, ppCap: 5 };
            text.push(me + " learned " + moveNameToString(lastSlot) + "!");
            return true;
        }
        case "sketch": {
            const lastSlot = (defender.moveset || []).find((m) => m.name === defender.lastMove);
            const sketchIndex = (attacker.moveset || []).findIndex((m) => m.name === "sketch");
            const badSketch = new Set(["sketch", "struggle", "transform", "chatter"]);
            if (!lastSlot || sketchIndex < 0 || badSketch.has(lastSlot.name) || attacker.moveset.some((m) => m.name === lastSlot.name)) {
                return fail();
            }
            attacker.moveset[sketchIndex] = jsonClone(lastSlot);
            text.push(me + " sketched " + moveNameToString(lastSlot) + "!");
            return true;
        }
        case "mirror-move": {
            if (!attackerTeam || !defenderTeam) return fail();
            const lastSlot = (defender.moveset || []).find((m) => m.name === defender.lastMove);
            if (!lastSlot || !MIRROR_MOVES.has(lastSlot.name)) return fail();
            executeMove(attackerTeam, defenderTeam, { ...jsonClone(lastSlot), ppLeft: undefined }, text, { copied: true });
            return true;
        }
        case "instruct": {
            if (!attackerTeam || !defenderTeam) return fail();
            const lastSlot = (defender.moveset || []).find((m) => m.name === defender.lastMove);
            if (!lastSlot || !hasPP(lastSlot) || CHARGE_MOVES.has(lastSlot.name) || RECHARGE_MOVES.has(lastSlot.name)) return fail();
            text.push(foe + " used the move instructed by " + me + "!");
            executeMove(defenderTeam, attackerTeam, { ...jsonClone(lastSlot) }, text, { copied: true });
            return true;
        }
        case "assist": {
            if (!attackerTeam || !defenderTeam) return fail();
            const pool = [];
            for (let i = 1; i < attackerTeam.length; i++) {
                const mate = attackerTeam[i];
                if (!mate || mate.hp[0] <= 0) continue;
                for (const m of mate.moveset || []) {
                    if (!ASSIST_BLOCKED.has(m.name)) pool.push(m);
                }
            }
            if (pool.length === 0) return fail();
            const picked = pool[Math.floor(Math.random() * pool.length)];
            executeMove(attackerTeam, defenderTeam, { ...jsonClone(picked), ppLeft: undefined }, text, { copied: true });
            return true;
        }
        case "metronome": {
            if (!attackerTeam || !defenderTeam) return fail();
            const picked = METRONOME_POOL[Math.floor(Math.random() * METRONOME_POOL.length)];
            executeMove(attackerTeam, defenderTeam, { ...jsonClone(picked), ppLeft: undefined }, text, { copied: true });
            return true;
        }
        case "transform": {
            if (attacker.transformBackup || defender.transformBackup || defender.illusion || defender.hp[0] <= 0) return fail();
            attacker.transformBackup = {
                types: attacker.types,
                base_stats: attacker.base_stats,
                moveset: attacker.moveset,
                ability: attacker.ability,
                stat_levels: attacker.stat_levels,
            };
            attacker.types = jsonClone(defender.types);
            attacker.base_stats = [attacker.base_stats[0], ...defender.base_stats.slice(1)];
            attacker.stat_levels = [...defender.stat_levels];
            attacker.moveset = defender.moveset.map((m) => ({ ...jsonClone(m), ppLeft: 5, ppCap: 5 }));
            attacker.ability = defender.ability;
            text.push(me + " transformed into " + foe + "!");
            return true;
        }
        // ---- shelter / take heart / spicy extract / fillet away: PokeAPI has no data for these ----
        case "shelter":
            addArrayToArray(text, doStatChanges(attacker, { stat_changes: [{ stat: { name: "defense" }, change: 2 }] }));
            return true;
        case "take-heart": {
            const cured = !!attacker.status;
            attacker.status = null;
            addArrayToArray(
                text,
                doStatChanges(attacker, { stat_changes: [{ stat: { name: "special-attack" }, change: 1 }, { stat: { name: "special-defense" }, change: 1 }] })
            );
            if (cured) text.push(me + " cured its own status problem!");
            return true;
        }
        case "spicy-extract":
            addArrayToArray(
                text,
                doStatChanges(defender, { stat_changes: [{ stat: { name: "attack" }, change: 2 }, { stat: { name: "defense" }, change: -2 }] }, attacker)
            );
            return true;
        case "fillet-away": {
            const cost = Math.floor(attacker.hp[1] / 2);
            if (attacker.hp[0] <= cost) return fail();
            attacker.hp[0] -= cost;
            addArrayToArray(
                text,
                doStatChanges(attacker, {
                    stat_changes: [
                        { stat: { name: "attack" }, change: 2 },
                        { stat: { name: "special-attack" }, change: 2 },
                        { stat: { name: "speed" }, change: 2 },
                    ],
                })
            );
            return true;
        }
        // ---- teatime / flower shield: hit every active pokemon (both sides, in singles) ----
        case "teatime": {
            let any = false;
            for (const p of [attacker, defender]) {
                if (p.hp[0] > 0 && activeItem(p) && p.item.name.endsWith("-berry")) {
                    const berry = p.item;
                    text.push(pokemonNameToString(p) + " ate its " + itemLabel(p) + "!");
                    consumeItem(p);
                    applyBerryEffect(p, berry, text);
                    any = true;
                }
            }
            if (!any) return fail();
            return true;
        }
        case "flower-shield": {
            let any = false;
            for (const p of [attacker, defender]) {
                if (p.hp[0] > 0 && p.types.some((t) => t.type.name === "grass")) {
                    addArrayToArray(text, doStatChanges(p, { stat_changes: [{ stat: { name: "defense" }, change: 1 }] }));
                    any = true;
                }
            }
            if (!any) return fail();
            return true;
        }
        // ---- purify / nightmare / octolock / embargo / fairy-lock ----
        case "purify": {
            if (!defender.status) return fail();
            defender.status = null;
            api.heal(attacker, Math.ceil(attacker.hp[1] / 2), text, " was purified and restored HP!");
            return true;
        }
        case "nightmare":
            if (!defender.status || defender.status.name !== "sleep" || defender.nightmare) return fail();
            defender.nightmare = true;
            text.push(foe + " began having a nightmare!");
            return true;
        case "octolock":
            if (defender.types.some((t) => t.type.name === "ghost") || defender.octolock) return fail();
            defender.octolock = { source: attacker };
            text.push(foe + " can't escape!");
            return true;
        case "embargo":
            if (defender.embargo) return fail();
            defender.embargo = { turns: 5 };
            text.push(foe + " can't use items anymore!");
            return true;
        case "fairy-lock":
            if (!field) return fail();
            field.fairyLock = { turns: 2 };
            text.push("No one will be able to escape next turn!");
            return true;
        case "electrify":
            defender.electrify = true;
            text.push(foe + "'s move was charged with electricity!");
            return true;
        case "powder":
            if (defender.types.some((t) => t.type.name === "grass") || isPowderImmune(defender, attacker)) {
                return fail(foe + " is unaffected!");
            }
            if (defender.powder) return fail();
            defender.powder = true;
            text.push(foe + " is covered in powder!");
            return true;
        case "grudge":
            attacker.grudge = true;
            text.push(me + " wants its target to bear a grudge!");
            return true;
        case "attract":
            if (defender.attract) return fail();
            defender.attract = true;
            text.push(foe + " fell in love!");
            return true;
        case "swagger":
            addArrayToArray(text, doStatChanges(defender, { stat_changes: [{ stat: { name: "attack" }, change: 2 }] }, attacker));
            tryInflictAilment(attacker, defender, { ...move, meta: { ...move.meta, ailment_chance: 100 } }, text, field, defenderTeam);
            return true;
        case "flatter":
            addArrayToArray(text, doStatChanges(defender, { stat_changes: [{ stat: { name: "special-attack" }, change: 1 }] }, attacker));
            tryInflictAilment(attacker, defender, { ...move, meta: { ...move.meta, ailment_chance: 100 } }, text, field, defenderTeam);
            return true;
        case "tar-shot":
            addArrayToArray(text, doStatChanges(defender, { stat_changes: [{ stat: { name: "speed" }, change: -1 }] }, attacker));
            defender.tarShot = true;
            return true;
        case "torment":
            if (defender.torment) return fail();
            defender.torment = true;
            text.push(foe + " was subjected to torment!");
            return true;
        // ---- imprison ----
        case "imprison": {
            if (attacker.imprison) return fail();
            const known = (attacker.moveset || []).map((m) => m.name);
            if (known.length === 0) return fail();
            attacker.imprison = new Set(known);
            text.push(me + " sealed the opponent's move(s)!");
            return true;
        }
        // ---- field-wide rooms and gravity ----
        case "gravity": {
            if (!field || field.gravity) return fail();
            field.gravity = { turns: 5 };
            for (const p of [attacker, defender]) {
                p.magnetRise = null;
                p.telekinesis = null;
            }
            text.push("Gravity intensified!");
            return true;
        }
        case "telekinesis": {
            if ((field && field.gravity) || defender.telekinesis || defender.ingrain) return fail();
            defender.telekinesis = { turns: 3 };
            text.push(foe + " was hurled into the air!");
            return true;
        }
        case "wonder-room":
            if (!field) return fail();
            if (field.wonderRoom) {
                field.wonderRoom = null;
                text.push("Wonder Room wore off, and Defenses and Sp. Defenses returned to normal!");
            } else {
                field.wonderRoom = { turns: 5 };
                text.push(me + " twisted the dimensions!");
            }
            return true;
        case "magic-room":
            if (!field) return fail();
            if (field.magicRoom) {
                field.magicRoom = null;
                text.push("Magic Room wore off, and held items' effects returned to normal!");
            } else {
                field.magicRoom = { turns: 5 };
                attacker.embargo = { turns: 5 };
                defender.embargo = { turns: 5 };
                text.push(me + " twisted the dimensions!");
            }
            return true;
        case "mud-sport":
            if (!field || field.mudSport) return fail();
            field.mudSport = { turns: 5 };
            text.push("Electricity's power was weakened!");
            return true;
        case "water-sport":
            if (!field || field.waterSport) return fail();
            field.waterSport = { turns: 5 };
            text.push("Fire's power was weakened!");
            return true;
        case "ion-deluge":
            if (!field) return fail();
            field.ionDeluge = true;
            text.push("A deluge of ions showers the battlefield!");
            return true;
        // ---- side conditions: Mist, Lucky Chant, Quick/Wide Guard, Crafty Shield, Mat Block ----
        case "mist":
            if (!attackerTeam || attackerTeam.mistTurns > 0) return fail();
            attackerTeam.mistTurns = 5;
            attacker.mistActive = true;
            text.push(me + "'s team became shrouded in mist!");
            return true;
        case "lucky-chant":
            if (!attackerTeam || attackerTeam.luckyChantTurns > 0) return fail();
            attackerTeam.luckyChantTurns = 5;
            text.push(me + "'s team is shielded from critical hits!");
            return true;
        case "quick-guard":
            if (!attackerTeam) return fail();
            attackerTeam.quickGuardTurn = true;
            text.push(me + " protects its team from priority moves!");
            return true;
        case "wide-guard":
            if (!attackerTeam) return fail();
            attackerTeam.wideGuardTurn = true;
            text.push(me + " protects its team from wide-spreading moves!");
            return true;
        case "crafty-shield":
            if (!attackerTeam) return fail();
            attackerTeam.craftyShieldTurn = true;
            text.push(me + " protects its team from status moves!");
            return true;
        case "mat-block":
            if (!attackerTeam) return fail();
            attackerTeam.matBlockTurn = true;
            text.push(me + " creates a shield using its mat!");
            return true;
        default:
            return false;
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
    pokemon.status =
        statusName === "toxic"
            ? { name: "toxic", counter: 1 }
            : statusName === "sleep"
            ? { name: "sleep", counter: 1 + Math.floor(Math.random() * 3) }
            : { name: statusName };
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
function tryInflictAilment(attacker, defender, move, text, field, defenderTeam = null) {
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
    // Safeguard keeps every status and confusion off the team (Infiltrator gets past it)
    if (defenderTeam && defenderTeam.safeguardTurns > 0 && !bypassesScreens(attacker)) {
        if (isGuaranteed) text.push(pokemonNameToString(defender) + " is protected by Safeguard!");
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
    if (activeItem(attacker) && attacker.item.name === LOADED_DICE) return Math.random() < 0.5 ? 4 : 5;
    const roll = Math.random();
    return roll < 0.35 ? 2 : roll < 0.7 ? 3 : roll < 0.85 ? 4 : 5;
}

export function doAttack(attacker, defender, move, defenderTeam, attackerTeam = null) {
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
    if (move.name === "fling" && !activeItem(attacker)) {
        text.push("But it failed!");
        return text;
    }
    // Present: a 1-in-5 chance it heals the target instead of hitting it
    if (move.name === "present" && Math.random() < 0.2) {
        if (defender.hp[0] >= defender.hp[1]) {
            text.push("But it failed!");
        } else {
            abilityApi(field).heal(defender, Math.floor(defender.hp[1] / 4), text, " was given a Present and restored HP!");
        }
        return text;
    }

    // Any other status move deals no damage, so skip the whole damage/reactive-item
    // pipeline below (it would otherwise trigger things like Weakness Policy or resist
    // berries off a hit that never happened). Only its ailment, if it has one, applies.
    if (move.damage_class.name === "status") {
        // A Substitute stops status moves aimed at the pokemon behind it (unless they get past it)
        if (defender.substitute && aimsAtFoe(move) && !SUBSTITUTE_BYPASS.has(move.name) && !bypassesScreens(attacker)) {
            text.push("But it failed!");
            return text;
        }
        tryStatusMoveEffect(attacker, defender, move, text, field, defenderTeam, attackerTeam);
        tryInflictAilment(attacker, defender, move, text, field, defenderTeam);
        // Moves that cost HP (Belly Drum) can put the user in range of its Sitrus Berry
        if (attacker.hp[0] > 0) tryConsumeHpTriggeredItem(attacker, text);
        return text;
    }

    // Multi-hit moves (Fury Attack, Bullet Seed, ...) run the whole damage pipeline once per
    // hit, so per-hit reactions (Rocky Helmet, Weakness Policy, a Balloon popping) behave
    // like the real thing. Drain, recoil and Life Orb work off the combined damage below.
    // Beat Up: one hit for every healthy pokemon in the user's party
    const beatUpAllies =
        move.name === "beat-up"
            ? (attackerTeam || [attacker]).filter((p) => p === attacker || (p.hp[0] > 0 && !p.status))
            : null;
    const totalHits = beatUpAllies ? beatUpAllies.length : rollHitCount(move, attacker);
    let hitsLanded = 0;
    let totalDamage = 0;
    let damage_number = 0;
    for (let hit = 0; hit < totalHits; hit++) {
        if (hit > 0 && (defender.hp[0] <= 0 || attacker.hp[0] <= 0)) break;
        if (hit > 0 && ROLLS_ACCURACY_EACH_HIT.has(move.name) && !rollAccuracy(attacker, defender, move, field)) break;
        const hitMove = beatUpAllies
            ? { ...move, power: 5 + Math.floor(beatUpAllies[hit].base_stats[1] / 10) } // each hit uses that member's Attack
            : ESCALATING_MULTIHIT.has(move.name)
            ? { ...move, power: move.power * (hit + 1) }
            : move;
        const ohko = isOhkoMove(move); // Fissure & co. deal exactly the target's remaining HP
        const fixed = isFixedDamageMove(move); // Seismic Toss, Super Fang...: no crit, no screens, no berries
        const gambit = move.name === "final-gambit";
        const isCrit = !ohko && !fixed && !(defenderTeam && defenderTeam.luckyChantTurns > 0) && rollCrit(attacker, defender, move);
        let damage = ohko ? defender.hp[0] : damageCalc(attacker, defender, hitMove, { crit: isCrit, field });
        const typeEff = typeEffectiveness(move, defender, attacker);

        // Reflect/Light Screen/Aurora Veil: halve incoming damage of the matching category for
        // the defending side while the screen is still up (a critical hit goes right through).
        if (defenderTeam && !ohko && !fixed && !isCrit && !bypassesScreens(attacker)) {
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

        // A Substitute takes the hit: its own HP soaks up the damage (none of it carries over) and
        // nothing that happens to the target itself (items, abilities, secondary effects) applies.
        // Sound moves, Infiltrator and the like go past it.
        if (defender.substitute && !SUBSTITUTE_BYPASS.has(move.name) && !bypassesScreens(attacker)) {
            const decoy = defender.substitute;
            const dealt = Math.min(damage, decoy.hp);
            decoy.hp -= dealt;
            defender.subHitFlag = true;
            if (isCrit) text.push("A critical hit!");
            if (decoy.hp <= 0) {
                defender.substitute = null;
                text.push(pokemonNameToString(defender) + "'s substitute faded!");
            } else {
                text.push("The substitute took damage for " + pokemonNameToString(defender) + "!");
            }
            trackDamageTaken(defender, move, dealt);
            if (gambit) attacker.hp[0] = 0;
            totalDamage += dealt;
            hitsLanded += 1;
            damage_number = dealt;
            continue;
        }

        // Resist berry: halves a super-effective hit of the matching type, then is eaten
        if (
            activeItem(defender) &&
            RESIST_BERRIES[defender.item.name] === move.type.name &&
            typeEff > 1 &&
            !ohko &&
            !fixed &&
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
            activeItem(defender) &&
            defender.item.name === FOCUS_SASH &&
            defender.hp[0] === defender.hp[1] &&
            damage >= defender.hp[0]
        ) {
            damage = defender.hp[0] - 1;
            sashSaved = true;
        }

        // Endure: hangs on at 1 HP
        if (defender.enduring && damage >= defender.hp[0]) {
            damage = defender.hp[0] - 1;
            text.push(pokemonNameToString(defender) + " endured the hit!");
        }

        if (isCrit) text.push("A critical hit!");
        // Eiscue's Ice Face soaks up the first physical hit (its form changes, it loses no HP)
        let iceFaceBroke = false;
        if (damage > 0 && tryIceFace(defender, attacker, move, text)) {
            damage = 0;
            iceFaceBroke = true;
        }
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
        // Final Gambit: the user gives everything it has left
        if (gambit) attacker.hp[0] = 0;
        if (disguiseBroke) {
            text.push(pokemonNameToString(defender) + "'s disguise served it as a decoy!");
            defender.hp[0] = Math.max(0, defender.hp[0] - Math.floor(defender.hp[1] / 8));
            text.push(pokemonNameToString(defender) + "'s disguise busted!");
        } else if (!iceFaceBroke) {
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

        trackDamageTaken(defender, move, damage_number);

        // Air Balloon: pops the moment the holder takes any damage (ground hits never reach here, see typeEffectiveness)
        if (activeItem(defender) && defender.item.name === AIR_BALLOON && damage_number > 0) {
            text.push(pokemonNameToString(defender) + "'s Balloon popped!");
            consumeItem(defender);
        }

        // Weakness Policy: +2 Atk/SpA when hit by a super-effective move
        if (
            activeItem(defender) &&
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
            activeItem(defender) &&
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
            activeItem(defender) &&
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
            activeItem(defender) &&
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
                attackerTeam,
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
            defender.itemUsedThisTurn = false; // knocked away, not used
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
        if (!sheerForced && !secondaryBlocked) tryInflictAilment(attacker, defender, move, text, field, defenderTeam);

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
            !(activeItem(defender) && defender.item.name === COVERT_CLOAK) &&
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
    // Dragon Tail / Circle Throw throw the target out if it is still standing
    if (FORCE_SWITCH_MOVES.has(move.name) && totalDamage > 0 && defender.hp[0] > 0) {
        requestDrag(attacker, defender, defenderTeam, text, false);
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
        !attacker.healBlock &&
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

    // Destiny Bond: whatever knocked it out goes down with it
    if (defender.hp[0] === 0 && defender.destinyBond && attacker.hp[0] > 0) {
        attacker.hp[0] = 0;
        text.push(pokemonNameToString(defender) + " took its attacker down with it!");
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
        activeItem(attacker) &&
        attacker.item.name === LIFE_ORB
    ) {
        attacker.hp[0] = Math.max(0, attacker.hp[0] - Math.floor(attacker.hp[1] / 10));
        text.push(pokemonNameToString(attacker) + " was hurt by its Life Orb!");
    }

    // Fling: whatever was thrown is gone after use
    if (move.name === "fling" && attacker.item) consumeItem(attacker);

    if (defender.hp[0] === 0) {
        text.push(pokemonNameToString(defender) + " fainted!");
        // Grudge: the move that just KO'd it loses every last PP
        if (defender.grudge) {
            const slot = (attacker.moveset || []).find((m) => m.name === move.name);
            if (slot) {
                spendPP(slot, ppLeft(slot));
                text.push(pokemonNameToString(attacker) + "'s " + moveNameToString(slot) + " lost all its PP!");
            }
        }
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
    oldCurrent.perish = null;
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
    pokemon[0].perish = null;
    // Healing Wish / Lunar Dance heal the newcomer before anything else touches it
    const hazardText = [];
    applyHealingWish(pokemon, hazardText);
    // Entry hazards hit first; a pokemon that faints to them never gets its ability going
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
    // A secondary stat change happens with the move's chance (doubled by Serene Grace)
    const statChance = move.meta && move.meta.stat_chance > 0 ? move.meta.stat_chance * chanceMultiplier(attacker) : 0;
    const statRolled = statChance >= 100 || Math.random() * 100 < statChance;
    if (
        attacker.hp[0] > 0 &&
        statChance > 0 &&
        statRolled &&
        move.meta.category.name === "damage-raise" // was "damage+raise", which PokeAPI never returns
    ) {
        addArrayToArray(text, doStatChanges(attacker, move));
    }
    if (
        defender.hp[0] > 0 &&
        statChance > 0 &&
        statRolled &&
        move.meta.category.name === "damage-lower" // was "damage+lower", which PokeAPI never returns
    ) {
        if (opts.shieldDust) {
            // Shield Dust: the secondary stat drop just doesn't happen
        } else if (activeItem(defender) && defender.item.name === COVERT_CLOAK) {
            text.push(
                pokemonNameToString(defender) +
                    "'s Covert Cloak protected it from the effect!"
            );
        } else {
            addArrayToArray(text, doStatChanges(defender, move, attacker));
        }
    }
    // Syrup Bomb: sticks a coat of syrup on the target that saps Speed every turn
    if (defender.hp[0] > 0 && move.name === "syrup-bomb" && !opts.shieldDust && !defender.syrupBomb) {
        if (activeItem(defender) && defender.item.name === COVERT_CLOAK) {
            text.push(pokemonNameToString(defender) + "'s Covert Cloak protected it from the effect!");
        } else {
            defender.syrupBomb = { turns: 3, source: attacker };
            text.push(pokemonNameToString(defender) + " got covered in sticky candy syrup!");
        }
    }
    tryConsumeWhiteHerb(attacker, text);
    tryConsumeWhiteHerb(defender, text);
    return text;
}

function tryConsumeWhiteHerb(pokemon, text) {
    if (!activeItem(pokemon) || pokemon.item.name !== WHITE_HERB) return;
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
    if (fromFoe && pokemon.mistActive && move.stat_changes.some((s) => s.change < 0)) {
        texts.push(pokemonNameToString(pokemon) + " is protected by Mist!");
        return texts;
    }
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
    if (terrainOf(field) === "grassy" && isGrounded(pokemon) && pokemon.hp[0] < pokemon.hp[1] && !pokemon.healBlock) {
        const healed = Math.min(Math.floor(pokemon.hp[1] / 16), pokemon.hp[1] - pokemon.hp[0]);
        pokemon.hp[0] += healed;
        text.push(pokemonNameToString(pokemon) + "'s HP was restored by the Grassy Terrain!");
    }

    // Ingrain / Aqua Ring: heal 1/16 max HP every turn
    if ((pokemon.ingrain || pokemon.aquaRing) && pokemon.hp[0] < pokemon.hp[1] && !pokemon.healBlock) {
        const healed = Math.min(Math.floor(pokemon.hp[1] / 16), pokemon.hp[1] - pokemon.hp[0]);
        if (healed > 0) {
            pokemon.hp[0] += healed;
            text.push(pokemonNameToString(pokemon) + " restored a little HP using its " + (pokemon.ingrain ? "roots!" : "water veil!"));
        }
    }
    // Nightmare: an asleep pokemon loses 1/4 max HP; the nightmare ends the moment it wakes
    if (pokemon.nightmare) {
        if (!pokemon.status || pokemon.status.name !== "sleep") {
            pokemon.nightmare = false;
        } else if (!magicGuard) {
            pokemon.hp[0] = Math.max(0, pokemon.hp[0] - Math.floor(pokemon.hp[1] / 4));
            text.push(pokemonNameToString(pokemon) + " is locked in a nightmare!");
            if (pokemon.hp[0] === 0) {
                text.push(pokemonNameToString(pokemon) + " fainted!");
                return text;
            }
        }
    }
    // Syrup Bomb: Speed falls every turn while the syrup coat lasts, or until the source leaves
    if (pokemon.syrupBomb) {
        const source = pokemon.syrupBomb.source;
        if (!source || source.hp[0] <= 0) {
            pokemon.syrupBomb = null;
        } else {
            addArrayToArray(text, doStatChanges(pokemon, { stat_changes: [{ stat: { name: "speed" }, change: -1 }] }, source));
            pokemon.syrupBomb.turns -= 1;
            if (pokemon.syrupBomb.turns <= 0) pokemon.syrupBomb = null;
        }
    }
    // Octolock: Defense and Sp. Def fall every turn while it holds, as long as the source stays in
    if (pokemon.octolock) {
        const source = pokemon.octolock.source;
        if (!source || source.hp[0] <= 0) {
            pokemon.octolock = null;
        } else {
            addArrayToArray(
                text,
                doStatChanges(pokemon, { stat_changes: [{ stat: { name: "defense" }, change: -1 }, { stat: { name: "special-defense" }, change: -1 }] }, source)
            );
        }
    }
    // Leech Seed saps 1/8 max HP for whoever is out on the seeder's side
    if (pokemon.leechSeed && pokemon.hp[0] > 0 && foe && foe.hp[0] > 0 && !magicGuard) {
        const before = pokemon.hp[0];
        pokemon.hp[0] = Math.max(0, pokemon.hp[0] - Math.max(1, Math.floor(pokemon.hp[1] / 8)));
        const drained = before - pokemon.hp[0];
        text.push(pokemonNameToString(pokemon) + "'s health is sapped by Leech Seed!");
        if (hasLiquidOoze(pokemon, foe)) {
            abilityApi(field).hurt(foe, drained, text, " sucked up the liquid ooze!");
        } else {
            abilityApi(field).heal(foe, drained, text, " restored some HP!");
        }
        if (pokemon.hp[0] === 0) {
            text.push(pokemonNameToString(pokemon) + " fainted!");
            return text;
        }
    }

    if (
        hasPoisonHeal(pokemon) &&
        pokemon.status &&
        (pokemon.status.name === "poison" || pokemon.status.name === "toxic")
    ) {
        // Poison Heal turns poison into healing (1/8 max HP)
        const healed = pokemon.healBlock ? 0 : Math.min(Math.floor(pokemon.hp[1] / 8), pokemon.hp[1] - pokemon.hp[0]);
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

    if (pokemon.hp[0] > 0 && activeItem(pokemon)) {
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

    // Perish Song / Perish Body count down and finally faint
    if (pokemon.hp[0] > 0 && pokemon.perish != null) {
        pokemon.perish -= 1;
        if (pokemon.perish <= 0) {
            pokemon.perish = null;
            pokemon.hp[0] = 0;
            text.push(pokemonNameToString(pokemon) + "'s perish count fell to 0!");
            text.push(pokemonNameToString(pokemon) + " fainted!");
            return text;
        }
        text.push(pokemonNameToString(pokemon) + "'s perish count fell to " + pokemon.perish + "!");
    }
    // Abilities that act at the end of every turn (Cud Chew, Hunger Switch...)
    if (pokemon.hp[0] > 0) {
        runHook(pokemon, "onResidual", { field, foe, text, applyBerry: applyBerryEffect, ...abilityApi(field) });
    }
    // Taunt and Encore wear off (Encore also ends when the move runs out of PP)
    if (pokemon.taunt) {
        pokemon.taunt.turns -= 1;
        if (pokemon.taunt.turns <= 0) {
            pokemon.taunt = null;
            text.push(pokemonNameToString(pokemon) + " is no longer taunted!");
        }
    }
    if (pokemon.encore) {
        const encored = (pokemon.moveset || []).find((m) => m.name === pokemon.encore.move);
        pokemon.encore.turns -= 1;
        if (pokemon.encore.turns <= 0 || !encored || !hasPP(encored)) {
            pokemon.encore = null;
            text.push(pokemonNameToString(pokemon) + "'s encore ended!");
        }
    }
    // Curse (Ghost): 1/4 max HP lost every turn
    if (pokemon.cursed && pokemon.hp[0] > 0 && !magicGuard) {
        pokemon.hp[0] = Math.max(0, pokemon.hp[0] - Math.max(1, Math.floor(pokemon.hp[1] / 4)));
        text.push(pokemonNameToString(pokemon) + " is afflicted by the curse!");
        if (pokemon.hp[0] === 0) {
            text.push(pokemonNameToString(pokemon) + " fainted!");
            return text;
        }
    }
    // Yawn: falls asleep at the end of the next turn
    if (pokemon.yawn) {
        pokemon.yawn -= 1;
        if (pokemon.yawn <= 0) {
            pokemon.yawn = null;
            inflictStatusDirect(pokemon, "sleep", text, field);
        }
    }
    // Magnet Rise and Heal Block wear off
    if (pokemon.magnetRise && --pokemon.magnetRise.turns <= 0) {
        pokemon.magnetRise = null;
        text.push(pokemonNameToString(pokemon) + "'s electromagnetism wore off!");
    }
    if (pokemon.healBlock && --pokemon.healBlock.turns <= 0) {
        pokemon.healBlock = null;
        text.push(pokemonNameToString(pokemon) + "'s Heal Block wore off!");
    }
    if (pokemon.embargo && --pokemon.embargo.turns <= 0) {
        pokemon.embargo = null;
        text.push(pokemonNameToString(pokemon) + "'s Embargo wore off!");
    }
    if (pokemon.lockOn && --pokemon.lockOn.turns <= 0) pokemon.lockOn = null;
    if (pokemon.laserFocus && --pokemon.laserFocus.turns <= 0) pokemon.laserFocus = null;
    if (pokemon.telekinesis && --pokemon.telekinesis.turns <= 0) {
        pokemon.telekinesis = null;
        text.push(pokemonNameToString(pokemon) + " fell back down!");
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
