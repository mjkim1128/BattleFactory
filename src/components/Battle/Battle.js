import {
    CurrentPokemon,
    GameOverDisplay,
    Move,
    PokemonParty,
    TurnFeed,
    BattleAnnouncer,
} from "components";
import React, { useEffect, useRef, useState } from "react";
import { SUBSTITUTE_FRONT, SUBSTITUTE_BACK } from "components/StatusBadges";
import {
    doSwitch,
    doTurn,
    resumeTurn,
    isTrapped,
    getUsableMoves,
    STRUGGLE,
    WEATHER_LABEL,
    TERRAIN_LABEL,
    HAZARD_LABEL,
    switchPokemon,
    lodash,
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
    /// A turn plays out one beat at a time instead of jumping straight to the end result:
    /// animFrames holds the {text, playerPokemon, opponentPokemon} snapshots for the turn
    /// in progress, animIndex is which one is on screen right now.
    const [animFrames, setAnimFrames] = useState(null);
    const [animIndex, setAnimIndex] = useState(0);
    const animDoneRef = useRef(null);
    /// A beat needs to stay up long enough for the typewriter (10ms/char, see useTypedMessage)
    /// to finish typing it out, plus a short pause so it can actually be read.
    const beatDelay = (frame) => Math.max(900, frame.text.join(" ").length * 10 + 500);

    /// Starts playing `frames` out one at a time; `onDone` runs once the last one has shown
    /// (or immediately if there's nothing to play). Move/switch input stays locked until then.
    function playFrames(frames, onDone) {
        if (!frames || frames.length === 0) {
            onDone();
            return;
        }
        animDoneRef.current = onDone;
        setAnimating(true);
        setAnimFrames(frames);
        setAnimIndex(0);
    }

    useEffect(() => {
        if (!animFrames) return;
        if (animIndex >= animFrames.length) {
            setAnimFrames(null);
            setAnimating(false);
            const done = animDoneRef.current;
            animDoneRef.current = null;
            if (done) done();
            return;
        }
        setAnnouncerMessage(animFrames[animIndex].text);
        const timer = setTimeout(() => setAnimIndex((i) => i + 1), beatDelay(animFrames[animIndex]));
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [animFrames, animIndex]);

    /// Skips straight to the end of the turn currently playing out (a click during the reveal).
    function skipAnimation() {
        if (animFrames) setAnimIndex(animFrames.length);
    }

    /// What's actually on screen right now: the live board, or (mid-reveal) the snapshot for
    /// the beat currently showing.
    const liveState =
        animFrames && animIndex < animFrames.length
            ? animFrames[animIndex]
            : { playerPokemon: props.playerPokemon, opponentPokemon: props.opponentPokemon };

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
        let t = [...turns];
        t.push(text);
        setTurns(t);
        playFrames(text.frames, () => {
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
        });
    }

    function finishPivot(index) {
        const text = resumeTurn(props.playerPokemon, props.opponentPokemon, index);
        for (const t of text) updateTurnText(t);
        playFrames(text.frames, () => {
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
        });
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
        setAnnouncerMessage([text]);
        /// The replacement can faint to entry hazards the moment it arrives
        if (pokemonArr[0].hp[0] <= 0) {
            if (pokemonArr === props.opponentPokemon) {
                return forcedSwitch(props.opponentPokemon, -1); /// the CPU sends in another (or the fight ends)
            }
            if (props.playerPokemon.filter((poke) => poke.hp[0] > 0).length === 0) {
                setGameOver(true);
                updateHistory();
                return;
            }
            setForceSwitch(true); /// the player has to pick again
            return;
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
    /// Stealth Rock, Spikes... waiting on each side, e.g. "스텔스록, 압정뿌리기 x2"
    const hazardsOf = (team) => {
        const h = team.hazards;
        if (!h) return "";
        return [
            h.stealthRock && HAZARD_LABEL.stealthRock,
            h.spikes > 0 && `${HAZARD_LABEL.spikes} x${h.spikes}`,
            h.toxicSpikes > 0 && `${HAZARD_LABEL.toxicSpikes} x${h.toxicSpikes}`,
            h.stickyWeb && HAZARD_LABEL.stickyWeb,
        ]
            .filter(Boolean)
            .join(", ");
    };
    const myHazards = hazardsOf(liveState.playerPokemon);
    const theirHazards = hazardsOf(liveState.opponentPokemon);
    const fieldText = [
        field && field.weather && `${WEATHER_LABEL[field.weather.name]} (${field.weather.turns}턴)`,
        field && field.terrain && `${TERRAIN_LABEL[field.terrain.name]} (${field.terrain.turns}턴)`,
        field && field.trickRoom && `트릭룸 (${field.trickRoom.turns}턴)`,
        liveState.playerPokemon.tailwindTurns > 0 && `내 쪽 순풍 (${liveState.playerPokemon.tailwindTurns}턴)`,
        liveState.opponentPokemon.tailwindTurns > 0 && `상대 쪽 순풍 (${liveState.opponentPokemon.tailwindTurns}턴)`,
        liveState.playerPokemon.safeguardTurns > 0 && `내 쪽 신비의부적 (${liveState.playerPokemon.safeguardTurns}턴)`,
        liveState.opponentPokemon.safeguardTurns > 0 && `상대 쪽 신비의부적 (${liveState.opponentPokemon.safeguardTurns}턴)`,
        myHazards && `내 쪽 함정: ${myHazards}`,
        theirHazards && `상대 쪽 함정: ${theirHazards}`,
    ]
        .filter(Boolean)
        .join(" · ");
    /// Mid-reveal, always show the live/animating board even if stepNumber hasn't caught up
    /// to history yet (updateHistory only runs once the turn finishes playing out).
    let isCurrent = !(stepNumber < history.length) || animFrames !== null;
    /// Nothing playing out, nothing pending, and not looking back at an old turn via </>:
    /// it's on the player to pick a move or a switch.
    const isBrowsingPast = animFrames === null && stepNumber < history.length - 1;
    const awaitingInput = !isBrowsingPast && !isAnimating && !isForceSwitch && !isGameOver;
    /// The player's own pokemon just fainted and it's on them (not the CPU) to send in the next one.
    const needsPlayerSwitch =
        isForceSwitch &&
        !isGameOver &&
        props.playerPokemon[0].hp[0] <= 0 &&
        props.playerPokemon.slice(1).some((poke) => poke.hp[0] > 0);
    let displaypokes = isCurrent
        ? liveState.playerPokemon
        : history[stepNumber].playerPokemon;
    let currentpoke = isCurrent
        ? liveState.playerPokemon[0]
        : history[stepNumber].playerPokemon[0];
    /// A pokemon mid-way through a two-turn move (Fly, Solar Beam, ...) must finish it;
    /// a Choice item locks it to the move it already used.
    /// Encore locks it into its last move while that move has PP left.
    const usableMoves = getUsableMoves(currentpoke);
    const encoredMove = currentpoke.encore && usableMoves.find((move) => move.name === currentpoke.encore.move);
    const forcedMoveName =
        currentpoke.charging || currentpoke.lockedMove || (encoredMove && usableMoves.length === 1 ? encoredMove.name : null);
    let playableMoves = forcedMoveName
        ? currentpoke.moveset.filter((move) => move.name === forcedMoveName)
        : currentpoke.moveset;
    /// Out of PP on every move (or on the one it is locked into): Struggle is all that's left
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
                            ? [liveState.playerPokemon[0], liveState.opponentPokemon[0]]
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
                                      liveState.playerPokemon[i + 1],
                                      liveState.opponentPokemon[0],
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
                                ? liveState.opponentPokemon
                                : history[stepNumber].opponentPokemon
                        }
                    />
                    <CurrentPokemon
                        pokemon={
                            isCurrent
                                ? liveState.opponentPokemon[0]
                                : history[stepNumber].opponentPokemon[0]
                        }
                        substituteImg={SUBSTITUTE_FRONT}
                        img={
                            /// a pokemon under Illusion shows its disguise's sprite
                            (isCurrent
                                ? liveState.opponentPokemon[0].illusion || liveState.opponentPokemon[0]
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
                                ? liveState.playerPokemon[0]
                                : history[stepNumber].playerPokemon[0]
                        }
                        substituteImg={SUBSTITUTE_BACK}
                        img={
                            isCurrent
                                ? liveState.playerPokemon[0].sprites.back_default
                                : history[stepNumber].playerPokemon[0].sprites
                                      .back_default
                        }
                    />
                    <div className="pokemon-moves">{moves}</div>
                    <PokemonParty
                        pokemon={
                            isCurrent
                                ? liveState.playerPokemon
                                : history[stepNumber].playerPokemon
                        }
                        onClick={onSwitch}
                    />
                    <div className="party-moves">
                        {partyMoves[0]}&nbsp;&nbsp;&nbsp;{partyMoves[1]}
                    </div>
                </div>
                <div
                    className="battle-announcer-parent"
                    onClick={skipAnimation}
                    style={animFrames ? { cursor: "pointer" } : undefined}
                >
                    <div className="battle-announcer-child">
                        {needsPlayerSwitch ? (
                            <div>다음 포켓몬을 선택하세요!</div>
                        ) : awaitingInput ? (
                            <div>Turn {turns.length + 1} - 행동을 결정하세요!</div>
                        ) : (
                            turns.length > 0 && (
                                <div>
                                    <BattleAnnouncer text={announcerMessage} />
                                </div>
                            )
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
