// Move PP. Every move gets its base PP x 8/5 (the max with three PP Ups, what competitive
// sets use), tracked per pokemon on the move object as ppLeft. A move object that has
// never been used has no ppLeft yet, which just means "full".

export const STRUGGLE = {
    id: 165,
    name: "struggle",
    korean_name: "발버둥",
    type: { name: "typeless" }, // typeless: never resisted, never immune, no STAB
    damage_class: { name: "physical" },
    power: 50,
    accuracy: null, // never misses
    pp: 1,
    priority: 0,
    target: { name: "random-opponent" },
    stat_changes: [],
    effect_chance: null,
    effect_changes: [],
    effect_entries: [],
    // The recoil (1/4 of the user's max HP) is done in doAttack, not through meta.drain
    meta: {
        ailment: { name: "none" },
        ailment_chance: 0,
        category: { name: "damage" },
        crit_rate: 0,
        drain: 0,
        flinch_chance: 0,
        healing: 0,
        max_hits: null,
        max_turns: null,
        min_hits: null,
        min_turns: null,
        stat_chance: 0,
    },
    flavor_text_entries: [
        { language: { name: "ko" }, flavor_text: "쓸 수 있는 기술이 없을 때 필사적으로 부딪친다. 자신도 반동으로 데미지를 입는다." },
    ],
};

export function maxPP(move) {
    if (move.ppCap !== undefined) return move.ppCap; // Transform: copied moves have 5 PP
    return Math.floor((move.pp || 5) * 8 / 5);
}

export function ppLeft(move) {
    return move.ppLeft === undefined ? maxPP(move) : move.ppLeft;
}

export function hasPP(move) {
    return ppLeft(move) > 0;
}

// Uses up PP (Pressure makes it 2). Struggle has none to spend.
export function spendPP(move, amount = 1) {
    if (move.name === STRUGGLE.name) return;
    move.ppLeft = Math.max(0, ppLeft(move) - amount);
}

export function restorePP(pokemon) {
    for (const move of pokemon.moveset || []) move.ppLeft = maxPP(move);
}

// The moves a pokemon can pick from right now: a Choice item locks it to one move, moves
// out of PP are unusable, and with nothing left it has to Struggle.
export function getUsableMoves(pokemon) {
    let moves = pokemon.moveset;
    if (pokemon.lockedMove) {
        const locked = moves.filter((m) => m.name === pokemon.lockedMove);
        if (locked.length > 0) moves = locked;
    }
    // Disable (Cursed Body...) shuts one move off for a few turns
    const usable = moves.filter((m) => hasPP(m) && !(pokemon.disabled && pokemon.disabled.move === m.name));
    return usable.length > 0 ? usable : [STRUGGLE];
}
