import {
    CurrentPokemon,
    GameOverDisplay,
    Move,
    PokemonParty,
    TurnFeed,
    BattleAnnouncer,
} from "components";
import React, { useEffect, useState } from "react";
import {
    doSwitch,
    doTurn,
    resumeTurn,
    isTrapped,
    getUsableMoves,
    STRUGGLE,
    WEATHER_LABEL,
    TERRAIN_LABEL,
    switchPokemon,
    lodash,
    arraysEqual,
    wait,
} from "shared";
import "./Battle.css";

export function Battle(props) {
    const [turns, setTurns] = useState([]);
    const [isForceSwitch, setForceSwitch] = useState(false);
    const [isGameOver, setGameOver] = useState(false);
    const [isVictory, setVictory] = useState(null);
    const [history, setHistory] = useState([
        {
            playerPokemon: lodash.cloneDeep(props.playerPokemon),
            opponentPokemon: lodash.cloneDeep(props.opponentPokemon),
        },
    ]);
    const [stepNumber, setStepNumber] = useState(0);
    const [announcerMessage, setAnnouncerMessage] = useState([]);
    const [isAnimating, setAnimating] = useState(false);

    useEffect(() => {
        if (isForceSwitch === false) return;
        if (
            props.opponentPokemon[0].hp[0] <= 0 &&
            props.playerPokemon[0].hp[0] > 0
        )
            forcedSwitch(props.opponentPokemon, -1);
        if (props.playerPokemon.filter((poke) => poke.hp[0] > 0).length === 0)
            setGameOver(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isForceSwitch]);

    useEffect(() => {
        /// Game is over
        if (!isGameOver || isVictory !== null) return;
        let isOppAlive =
            props.opponentPokemon.filter((poke) => poke.hp[0] > 0).length > 0; /// currently player wins on recoil doublekill both last pokemon
        let [message, win] =
            props.playerPokemon[0].hp[0] === 0 && isOppAlive
                ? ["You Lose!", false]
                : ["You Win!", true];
        updateTurnText(message);
        updateTurnText("Player2(CPU): GGWP!");
        setVictory(win);
        if (win) props.setWinStreak(props.winStreak + 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGameOver]);

    useEffect(() => {
        /// wait after move
        setAnimating(false);
    }, [announcerMessage, turns]);

    useEffect(() => {
        // Update announcer message
        if (
            stepNumber >= history.length &&
            announcerMessage !== undefined &&
            announcerMessage.length === 1
        )
            return;
        if (turns.length > 0 && stepNumber > 0) {
            setAnnouncerMessage(
                stepNumber < history.length
                    ? turns[stepNumber - 1]
                    : turns[turns.length - 1]
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepNumber]);

    function nextTurn(move) {
        if (isAnimating) return;
        if (stepNumber < history.length - 1) {
            alert("You are living in the past... Let's try that again...");
            setStepNumber(history.length - 1);
            return;
        }
        if (isGameOver) {
            alert("Game is over.");
            return;
        } else if (isForceSwitch) {
            alert("Pick a pokemon to switch into!");
            return;
        }
        let text = doTurn(props.playerPokemon, props.opponentPokemon, move);
        let texts = "";
        for (const t of text) {
            texts = texts + t;
        }
        let t = [...turns];
        t.push(text);
        setTurns(t);
        if (arraysEqual(text, announcerMessage)) text.push(" (again lol)");
        setAnnouncerMessage(text);
        if (props.playerPokemon.pendingSwitch) {
            /// The player's pokemon pivoted out (U-turn, Baton Pass, ...): the turn is paused
            /// until they pick who comes in. Show the live board so the party is clickable.
            setForceSwitch(true);
            setStepNumber(stepNumber + 1);
        } else if (
            props.playerPokemon[0].hp[0] === 0 ||
            props.opponentPokemon[0].hp[0] === 0
        ) {
            setForceSwitch(true);
            if (props.playerPokemon[0].hp[0] === 0)
                setStepNumber(stepNumber + 1);
        } else updateHistory();

        (async () => {
            setAnimating(true);
            await wait(100);
        })();
    }

    function finishPivot(index) {
        const text = resumeTurn(props.playerPokemon, props.opponentPokemon, index);
        for (const t of text) updateTurnText(t);
        setAnnouncerMessage(text);
        const opponentDown = props.opponentPokemon[0].hp[0] <= 0;
        const playerDown = props.playerPokemon[0].hp[0] <= 0;
        if (!opponentDown && !playerDown) {
            setForceSwitch(false);
            updateHistory();
            return;
        }
        /// Something fainted after the swap; isForceSwitch is already true, so its effect
        /// won't fire again and the CPU's replacement / game over is handled here.
        if (props.playerPokemon.filter((poke) => poke.hp[0] > 0).length === 0) {
            setGameOver(true);
            updateHistory();
        } else if (opponentDown && !playerDown) {
            forcedSwitch(props.opponentPokemon, -1);
        }
    }

    function forcedSwitch(pokemonArr, index, playerType = "cpu") {
        if (playerType === "player" && props.playerPokemon.pendingSwitch) {
            finishPivot(index);
            return;
        }
        let switch_index =
            playerType === "cpu"
                ? switchPokemon(props.playerPokemon, props.opponentPokemon)
                : index;
        if (switch_index === -1 && playerType === "cpu") {
            setGameOver(true);
            updateHistory();
            return;
        }
        setForceSwitch(false);
        /// (the other side is needed for on-entry abilities like Intimidate)
        let text = doSwitch(pokemonArr, switch_index, {
            foeTeam: pokemonArr === props.playerPokemon ? props.opponentPokemon : props.playerPokemon,
        });
        updateTurnText(text);
        if (playerType === "player") {
            setAnnouncerMessage([text]);
        }
        if (playerType === "player" && props.opponentPokemon[0].hp[0] === 0)
            return forcedSwitch(props.opponentPokemon, -1);
        updateHistory();
    }

    function onSwitch(index) {
        if (isGameOver) {
            alert("Game is over.");
            return;
        }
        if (isForceSwitch) {
            forcedSwitch(props.playerPokemon, index, "player");
        } else if (!isForceSwitch) {
            if (isTrapped(props.playerPokemon, props.opponentPokemon)) {
                alert("Trapped! You can't switch out right now.");
                return;
            }
            let move = { priority: 6, index: index };
            nextTurn(move);
        }
    }

    function updateTurnText(text) {
        let t = [...turns];
        t[t.length - 1].push(text);
        setTurns(t);
    }

    function updateHistory() {
        history.push({
            playerPokemon: lodash.cloneDeep(props.playerPokemon),
            opponentPokemon: lodash.cloneDeep(props.opponentPokemon),
        });
        setStepNumber(history.length - 1);
        setHistory(history);
    }

    /// Weather / terrain currently in play, e.g. "비 (3턴) · 그래스필드 (5턴)"
    const field = props.playerPokemon.field;
    const fieldText = field
        ? [
              field.weather && `${WEATHER_LABEL[field.weather.name]} (${field.weather.turns}턴)`,
              field.terrain && `${TERRAIN_LABEL[field.terrain.name]} (${field.terrain.turns}턴)`,
          ]
              .filter(Boolean)
              .join(" · ")
        : "";
    let isCurrent = !(stepNumber < history.length);
    let displaypokes = isCurrent
        ? props.playerPokemon
        : history[stepNumber].playerPokemon;
    let currentpoke = isCurrent
        ? props.playerPokemon[0]
        : history[stepNumber].playerPokemon[0];
    /// A pokemon mid-way through a two-turn move (Fly, Solar Beam, ...) must finish it;
    /// a Choice item locks it to the move it already used.
    const forcedMoveName = currentpoke.charging || currentpoke.lockedMove;
    let playableMoves = forcedMoveName
        ? currentpoke.moveset.filter((move) => move.name === forcedMoveName)
        : currentpoke.moveset;
    /// Out of PP on every move (or on the one it is locked into): Struggle is all that's left
    const usableMoves = getUsableMoves(currentpoke);
    if (usableMoves.length === 1 && usableMoves[0] === STRUGGLE) playableMoves = [STRUGGLE];
    if (playableMoves.length === 0) playableMoves = currentpoke.moveset;
    let moves = playableMoves.map((move, index) => {
        return (
            <div key={index}>
                <Move
                    move={move}
                    onClick={nextTurn}
                    attackerDefender={
                        isCurrent
                            ? [props.playerPokemon[0], props.opponentPokemon[0]]
                            : [
                                  history[stepNumber].playerPokemon[0],
                                  history[stepNumber].opponentPokemon[0],
                              ]
                    }
                    moveOwner="current"
                />
            </div>
        );
    });
    let partyMoves = [];
    for (let i = 0; i < 2; i++) {
        partyMoves[i] = displaypokes[i + 1].moveset.map((move, index) => {
            return (
                <div key={index}>
                    <Move
                        move={move}
                        onClick={() => {}}
                        attackerDefender={
                            isCurrent
                                ? [
                                      props.playerPokemon[i + 1],
                                      props.opponentPokemon[0],
                                  ]
                                : [
                                      history[stepNumber].playerPokemon[i + 1],
                                      history[stepNumber].opponentPokemon[0],
                                  ]
                        }
                        moveOwner="party"
                    />
                </div>
            );
        });
    }
    return (
        <div className="battle">
            <div className="pokemon-grid">
                <div>
                    {isGameOver && (
                        <div className="game-over">
                            <GameOverDisplay
                                win={isVictory}
                                onClick={props.setBattleFactoryState}
                                winStreak={props.winStreak}
                            />
                        </div>
                    )}
                    {!isGameOver && (
                        <div>
                            <h2>
                                Turn {isCurrent ? turns.length : stepNumber}
                            </h2>
                            {fieldText && <p className="field-info">{fieldText}</p>}
                        </div>
                    )}
                </div>
                <div className="opponent">
                    <PokemonParty
                        pokemon={
                            isCurrent
                                ? props.opponentPokemon
                                : history[stepNumber].opponentPokemon
                        }
                    />
                    <CurrentPokemon
                        pokemon={
                            isCurrent
                                ? props.opponentPokemon[0]
                                : history[stepNumber].opponentPokemon[0]
                        }
                        img={
                            /// a pokemon under Illusion shows its disguise's sprite
                            (isCurrent
                                ? props.opponentPokemon[0].illusion || props.opponentPokemon[0]
                                : history[stepNumber].opponentPokemon[0].illusion ||
                                  history[stepNumber].opponentPokemon[0]
                            ).sprites.front_default
                        }
                    />
                </div>
                <div className="player">
                    <CurrentPokemon
                        pokemon={
                            isCurrent
                                ? props.playerPokemon[0]
                                : history[stepNumber].playerPokemon[0]
                        }
                        img={
                            isCurrent
                                ? props.playerPokemon[0].sprites.back_default
                                : history[stepNumber].playerPokemon[0].sprites
                                      .back_default
                        }
                    />
                    <div className="pokemon-moves">{moves}</div>
                    <PokemonParty
                        pokemon={
                            isCurrent
                                ? props.playerPokemon
                                : history[stepNumber].playerPokemon
                        }
                        onClick={onSwitch}
                    />
                    <div className="party-moves">
                        {partyMoves[0]}&nbsp;&nbsp;&nbsp;{partyMoves[1]}
                    </div>
                </div>
                <div className="battle-announcer-parent">
                    <div className="battle-announcer-child">
                        {turns.length > 0 && stepNumber > 0 && (
                            <div>
                                <BattleAnnouncer text={announcerMessage} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="turn-feed">
                <TurnFeed turns={turns} setStepNumber={setStepNumber} />
                <div className="turn-control-buttons">
                    <button
                        onClick={() => {
                            setStepNumber(0);
                        }}
                    >
                        |&lt;&lt;
                    </button>
                    <button
                        onClick={() => {
                            if (stepNumber > 0) setStepNumber(stepNumber - 1);
                        }}
                    >
                        &lt;
                    </button>
                    <button
                        onClick={() => {
                            if (stepNumber < history.length)
                                setStepNumber(stepNumber + 1);
                        }}
                    >
                        &gt;
                    </button>
                    <button
                        onClick={() => {
                            if (stepNumber < history.length)
                                setStepNumber(history.length);
                        }}
                    >
                        &gt;&gt;|
                    </button>
                </div>
            </div>
        </div>
    );
}
