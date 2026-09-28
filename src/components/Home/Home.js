import { Battle, TeamBuilder, PokemonSwap, BossDisplay } from "components";
import React, { useEffect, useState } from "react";
import {
    baseStatTotalTo600,
    generateRandomPokemon,
    generateRandomItem,
    getGoodRandomMoveset,
    getMoveByName,
    getItemByName,
    getPokemonByName,
    getRandomInt,
    getRandomType,
    shuffle,
    TRAINER_ALAZAR,
    TRAINER_BLAKE,
    hpCalc,
    BANNED_MOVES,
    DEFAULT_MOVES,
    pickFactorySet,
    resolveFactoryMoveSlugs,
} from "shared";

const BATTLE_ROUNDS = 4;

export function Home() {
    const [isApiLoading, setApiLoading] = useState(true);
    const [pokemonOptions, setPokemonOptions] = useState([]);
    const [opponentPokemon, setOpponentPokemon] = useState([]);
    const [selectedPokemon, setSelectedPokemon] = useState(null);
    const [playerPokemon, setPlayerPokemon] = useState([]);
    const [battleFactoryState, setBattleFactoryState] = useState("home");
    const [winStreak, setWinStreak] = useState(0);
    const [, updateState] = React.useState();
    const forceUpdate = React.useCallback(() => updateState({}), []);

    useEffect(() => {
        loadNewPokemon(true).then(() => setApiLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        forceUpdate();
        if (isApiLoading) return;
        /// glitchy
        setSelectedPokemon(null);
        /// Pokemon Center :)
        let [temp, dumb] = [[...playerPokemon], [...opponentPokemon]];
        for (const arr of [temp, dumb]) {
            for (const poke of arr) {
                poke.hp[0] = poke.hp[1];
                poke.stat_levels = Array(5).fill(0);
                /// Nothing battle-specific should leak into the next fight
                poke.status = null;
                poke.confusion = null;
                poke.lockedMove = null;
                poke.lastMoveName = null;
                poke.moveRepeatCount = 0;
            }
            /// Reflect/Light Screen live on the team array itself, not on a pokemon
            arr.reflectTurns = 0;
            arr.lightScreenTurns = 0;
        }
        setPlayerPokemon(temp);
        setOpponentPokemon(dumb);
        /// (Lose) reset playerPokemon and reset winStreak
        if (battleFactoryState === "home" && playerPokemon.length > 0) {
            setPlayerPokemon([]);
            setWinStreak(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [battleFactoryState]);

    async function loadNewPokemon(init = true) {
        setSelectedPokemon(null);
        if (init) {
            for (let i = 0; i < 6; i++) {
                await randomNewPokemon(pokemonOptions, i, setPokemonOptions);
            }
        }
        for (let i = 0; i < 3; i++) {
            if (
                (winStreak + 1) % (BATTLE_ROUNDS + 1) !== 0 ||
                winStreak >= (BATTLE_ROUNDS + 1) * 2
            )
                await randomNewPokemon(opponentPokemon, i, setOpponentPokemon);
            else {
                if (winStreak === BATTLE_ROUNDS)
                    opponentPokemon[i] = await getPokemonByName(
                        TRAINER_ALAZAR.pokemon[i]
                    );
                if (winStreak === BATTLE_ROUNDS * 2 + 1)
                    opponentPokemon[i] = await getPokemonByName(
                        TRAINER_BLAKE.pokemon[i]
                    );
                await getPokemonData(opponentPokemon, i, setOpponentPokemon);
                await createRandomMoveset(opponentPokemon, i, setOpponentPokemon);
                setOpponentPokemon(opponentPokemon);
            }
        }
        forceUpdate();
    }

    async function randomNewPokemon(pokemonData, i, setFunc) {
        pokemonData[i] = await generateRandomPokemon(pokemonData);
        await getPokemonData(pokemonData, i, setFunc);
        await createRandomMoveset(pokemonData, i, setFunc);
        setFunc(pokemonData);
    }

    async function getPokemonData(pokemonData, i, setFunc) {
        pokemonData[i].base_stats = baseStatTotalTo600(pokemonData[i]);
        pokemonData[i].moveset = [{ name: "Tackle" }];
        pokemonData[i].hp = [
            hpCalc(pokemonData[i].base_stats[0]),
            hpCalc(pokemonData[i].base_stats[0]),
        ];
        pokemonData[i].stat_levels = Array(5).fill(0);
        /// Try a real Showdown "Battle Factory" set first, so item + moveset come
        /// from the same coherent competitive set instead of two unrelated random picks.
        const factorySet = pickFactorySet(pokemonData[i].name);
        pokemonData[i].factorySet = factorySet;
        pokemonData[i].item =
            factorySet && factorySet.item
                ? await getItemByName(factorySet.item)
                : await generateRandomItem(pokemonData[i].name);
        pokemonData[i].lockedMove = null;
        pokemonData[i].lastMoveName = null;
        pokemonData[i].moveRepeatCount = 0;
        pokemonData[i].status = null; // 무상태
        pokemonData[i].confusion = null; // 무혼란
        setFunc(pokemonData);
    }

    async function createRandomMoveset(pokemonArr, index, setFunc) {
        let moves = [];
        let pokemon = pokemonArr[index];

        /// If a real Showdown "Battle Factory" set was picked for this mon (see getPokemonData),
        /// try to use ITS actual moves first instead of the fully-random diversity pick below.
        if (pokemon.factorySet) {
            let newMoves = await Promise.all(
                pokemonArr[index].moves.map((move) => getMoveByName(move.move.name))
            );
            pokemonArr[index].moves_data = newMoves;
            const learnableSlugs = new Set(newMoves.map((m) => m.name));
            const chosen = resolveFactoryMoveSlugs(pokemon.factorySet).filter(
                (c) => c.slug === "hidden-power" || learnableSlugs.has(c.slug)
            );
            if (chosen.length >= 2) {
                let moveset = await Promise.all(
                    chosen.map((c) => getMoveByName(c.slug))
                );
                moveset.forEach((m, idx) => {
                    if (chosen[idx].hpType) m.hpTypeHint = chosen[idx].hpType;
                });
                if (moveset.length < 4) {
                    let padChoices = shuffle(
                        newMoves.filter(
                            (m) =>
                                BANNED_MOVES.includes(m.name) === false &&
                                !moveset.some((mm) => mm.name === m.name)
                        )
                    );
                    moveset = [...moveset, ...padChoices].slice(0, 4);
                }
                if (moveset.length < 4) {
                    let padDefaults = shuffle(
                        await Promise.all(
                            DEFAULT_MOVES.map((m) => getMoveByName(m.name))
                        )
                    ).filter((m) => !moveset.some((mm) => mm.name === m.name));
                    moveset = [...moveset, ...padDefaults].slice(0, 4);
                }
                for (let move of moveset) {
                    if (move.name === "hidden-power" || move.name === "secret-power") {
                        move.type.name = move.hpTypeHint || getRandomType();
                        move.power = 80;
                    } else if (
                        move.name === "explosion" ||
                        move.name === "self-destruct"
                    ) {
                        // Do nothing
                    } else if (move.meta && move.meta.drain < 0)
                        move.power =
                            move.power > 120 || move.name === "volt-tackle" ? 150 : 120;
                    else if (
                        move.meta &&
                        move.damage_class.name !== "status" && /// status moves have no power to clamp
                        move.priority === 0 &&
                        move.meta.stat_chance !== 100
                    ) {
                        if (move.power < 75) move.power = 75;
                        if (move.power > 95) move.power = 95;
                        else if (move.name === "tri-attack")
                            move.type.name = ["fire", "electric", "ice"][
                                getRandomInt(3)
                            ];
                    }
                }
                pokemonArr[index].moveset = moveset;
                setFunc(pokemonArr);
                return;
            }
        }

        /// Determine whether pokemon should use physical, special, or both categories of moves
        let diff = Math.abs(pokemon.base_stats[1] - pokemon.base_stats[3]);
        let attack =
            diff > 30 ||
            !(pokemon.base_stats[1] > 75 && pokemon.base_stats[3] > 75)
                ? "attack"
                : null;
        if (attack !== null)
            attack =
                pokemon.base_stats[1] > pokemon.base_stats[3]
                    ? "physical"
                    : "special";
        /// New move arr (fetched in parallel so one pokemon's whole learnset resolves in one round trip)
        let newMoves = await Promise.all(
            pokemonArr[index].moves.map((move) => getMoveByName(move.move.name))
        );
        for (const m of newMoves) {
            if (
                m.damage_class.name !== "status" &&
                m.power &&
                (m.power > 50 || m.priority > 0) &&
                BANNED_MOVES.includes(m.name) === false
            ) {
                if (
                    attack === null ||
                    m.damage_class.name === attack ||
                    (m.priority > 0 && m.damage_class.name === "physical") /// for physical priority moves (& not vacuum wave lol)
                )
                    moves.push(m);
            }
        }
        /// update pokemon moves;
        pokemonArr[index].moves_data = newMoves;
        if (moves.length < 4) {
            let choices = await Promise.all(
                DEFAULT_MOVES.map((m) => getMoveByName(m.name)) // Load the default moves
            );
            shuffle(choices);
            moves = [...moves, ...choices];
        }
        for (let move of moves) {
            if (move.name === "hidden-power" || move.name === "secret-power") {
                move.type.name = (" " + getRandomType()).slice(1);
                move.power = 80;
            } else if (
                move.name === "explosion" ||
                move.name === "self-destruct"
            ) {
                // Do nothing
            } else if (move.meta && move.meta.drain < 0)
                move.power =
                    move.power > 120 || move.name === "volt-tackle" ? 150 : 120;
            else if (move.meta && move.damage_class.name !== "status" && move.priority === 0 && move.meta.stat_chance !== 100) {
                if (move.power < 75) move.power = 75;
                if (move.power > 95) move.power = 95;
                else if (move.name === "tri-attack")
                    move.type.name = ["fire", "electric", "ice"][
                        getRandomInt(3)
                    ];
            }
        }
        shuffle(moves);
        pokemonArr[index].moveset = await getGoodRandomMoveset(moves);
        setFunc(pokemonArr);
    }

    async function nextBattle() {
        if (
            (winStreak + 1) % (BATTLE_ROUNDS + 1) === 0 &&
            winStreak < 10 && // no third boss yet
            battleFactoryState === "swap"
        ) {
            setBattleFactoryState("boss");
            return;
        }
        setApiLoading(true);
        await loadNewPokemon(false);
        setBattleFactoryState("battle");
        setApiLoading(false);
    }

    if (isApiLoading) {
        return (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100vh",
                }}
            >
                Loading the data...
            </div>
        );
    }

    return (
        <div>
            {battleFactoryState === "home" && (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100vh",
                    }}
                >
                    <h1>Battle Factory</h1>
                    <button
                        onClick={async () => {
                            setApiLoading(true);
                            await loadNewPokemon();
                            setBattleFactoryState("teambuild");
                            setApiLoading(false);
                        }}
                    >
                        Start!
                    </button>
                </div>
            )}
            {battleFactoryState === "teambuild" && (
                <div>
                    <TeamBuilder
                        properties={[
                            pokemonOptions,
                            selectedPokemon,
                            setSelectedPokemon,
                            playerPokemon,
                            setPlayerPokemon,
                            setBattleFactoryState,
                            loadNewPokemon,
                        ]}
                    />
                </div>
            )}
            {battleFactoryState === "battle" && (
                <div>
                    <Battle
                        playerPokemon={playerPokemon}
                        opponentPokemon={opponentPokemon}
                        setBattleFactoryState={setBattleFactoryState}
                        winStreak={winStreak}
                        setWinStreak={setWinStreak}
                    />
                </div>
            )}
            {battleFactoryState === "swap" && (
                <div>
                    <PokemonSwap
                        properties={[
                            opponentPokemon,
                            selectedPokemon,
                            setSelectedPokemon,
                            playerPokemon,
                            setPlayerPokemon,
                            nextBattle,
                            winStreak,
                        ]}
                    />
                </div>
            )}
            {battleFactoryState === "boss" && (
                <div>
                    <BossDisplay
                        winStreak={winStreak}
                        nextBattle={nextBattle}
                    />
                </div>
            )}
        </div>
    );
}
