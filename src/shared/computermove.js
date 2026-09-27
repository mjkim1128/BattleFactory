import { damageCalc } from "./damagecalc";

// A Choice item holder can only pick the move it locked itself into.
function usableMoveset(pokemon) {
    if (!pokemon.lockedMove) return pokemon.moveset;
    const locked = pokemon.moveset.filter((m) => m.name === pokemon.lockedMove);
    return locked.length > 0 ? locked : pokemon.moveset;
}

export function makeMove(playerTeam, opponentTeam) {
    for (const move of usableMoveset(opponentTeam[0])) {
        // attempt for priority
        if (
            playerTeam[0].hp[0] -
                damageCalc(opponentTeam[0], playerTeam[0], move) <=
                0 &&
            move.priority > 0
        )
            return move;
        // above works, attempt 2 for last hit before dying
        if (
            opponentTeam[0].hp[0] -
                damageCalc(
                    playerTeam[0],
                    opponentTeam[0],
                    strongestMove(opponentTeam, playerTeam)
                ) <=
                0 &&
            move.priority > 0 &&
            playerTeam[0].base_stats[5] > opponentTeam[0].base_stats[5]
        )
            return move;
    }
    return strongestMove(playerTeam, opponentTeam);
}

export function strongestMove(playerTeam, opponentTeam) {
    let damage = 0;
    let choice = null;
    for (const move of usableMoveset(opponentTeam[0])) {
        [damage, choice] =
            damageCalc(opponentTeam[0], playerTeam[0], move) > damage
                ? [damageCalc(opponentTeam[0], playerTeam[0], move), move]
                : [damage, choice];
    }
    return choice;
}

export function switchPokemon(playerTeam, opponentTeam) {
    let options = opponentTeam.filter(
        (poke) => poke !== opponentTeam[0] && poke.hp[0] > 0
    );
    for (const option of options) {
        if (
            option.base_stats[5] > playerTeam[0].base_stats[5] &&
            doesMoveKill(option, playerTeam[0], strongestMove(playerTeam, [option]))
        ) {
            return opponentTeam.indexOf(option);
        }
    }
    let damages = options.map((poke) => {
        return [damageCalc(
            poke,
            playerTeam[0],
            strongestMove(playerTeam, [poke]), poke.hp[0] - damageCalc(playerTeam[0], poke, strongestMove([poke], playerTeam)) > 0 )]
    });
    if (options.length > 1 && damages[0][0] < damages[1][0] && damages[1][1])
        return opponentTeam.indexOf(options[1]);
    else if (options.length >= 1) return opponentTeam.indexOf(options[0]);
    else return -1;
}

export function doesMoveKill(attacker, defender, move) {
    return defender.hp[0] - damageCalc(attacker, defender, move) <= 0;
}