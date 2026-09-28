import React from "react";
import "./StatusBadges.css";

// The Substitute doll (PokeAPI's sprite collection, the same place every pokemon sprite comes
// from): it takes the place of the pokemon while its Substitute is up.
const DOLL_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";
export const SUBSTITUTE_FRONT = DOLL_BASE + "substitute.png";
export const SUBSTITUTE_BACK = DOLL_BASE + "back/substitute.png";

const MAJOR_STATUS = {
    burn: "화상",
    paralysis: "마비",
    poison: "독",
    toxic: "맹독",
    sleep: "잠듦",
    freeze: "얼음",
};

// Everything that is going on with a pokemon besides its HP: the status condition, confusion
// and the temporary effects from moves (names are the moves' own Korean names).
export function conditionsOf(pokemon) {
    const list = [];
    const add = (label, kind) => list.push({ label, kind });
    if (pokemon.status && MAJOR_STATUS[pokemon.status.name]) add(MAJOR_STATUS[pokemon.status.name], "status");
    if (pokemon.confusion) add("혼란", "status");
    if (pokemon.substitute) add(`대타출동 (HP ${pokemon.substitute.hp})`, "field");
    if (pokemon.taunt) add(`도발 (${pokemon.taunt.turns}턴)`, "bad");
    if (pokemon.encore) add(`앵콜 (${pokemon.encore.turns}턴)`, "bad");
    if (pokemon.disabled) add(`사슬묶기 (${pokemon.disabled.turns}턴)`, "bad");
    if (pokemon.healBlock) add(`회복봉인 (${pokemon.healBlock.turns}턴)`, "bad");
    if (pokemon.leechSeed) add("씨뿌리기", "bad");
    if (pokemon.yawn) add("하품", "bad");
    if (pokemon.cursed) add("저주", "bad");
    if (pokemon.perish != null) add(`멸망의노래 ${Math.min(pokemon.perish, 3)}`, "bad");
    if (pokemon.trap) add("교체 불가", "bad");
    if (pokemon.foresight) add("꿰뚫어보기", "bad");
    if (pokemon.destinyBond) add("길동무", "field");
    if (pokemon.magnetRise) add(`전자부유 (${pokemon.magnetRise.turns}턴)`, "good");
    if (pokemon.focusEnergy) add("기충전", "good");
    return list;
}

export function StatusBadges(props) {
    if (!props.pokemon || props.pokemon.hp[0] <= 0) return null;
    const list = conditionsOf(props.pokemon);
    if (list.length === 0) return null;
    return (
        <div className="status-badges">
            {list.map((c) => (
                <span key={c.label} className={"status-badge status-badge-" + c.kind}>
                    {c.label}
                </span>
            ))}
        </div>
    );
}
