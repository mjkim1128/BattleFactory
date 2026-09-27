import { HoverPokemonData } from "components/HoverPokemonData";
import React, { useState } from "react";
import "./PokemonPartyMember.css";

export function PokemonPartyMember(props) {
    const [style, setStyle] = useState({ display: "none" });

    return (
        <div
            onMouseOver={(e) => {
                setStyle({ display: "table" });
            }}
            onMouseOut={(e) => {
                setStyle({ display: "none" });
            }}
        >
            <button
                className={props.pokemon.hp[0] <= 0 ? "disabledButton" : ""}
                disabled={props.pokemon.hp[0] === 0}
                onClick={() => {
                    if (props.onClick) props.onClick(props.index);
                }}
            >
                <img
                    src={props.pokemon.sprites.front_default}
                    alt={props.pokemon.name}
                ></img>
            </button>
            <div style={style}>
                <HoverPokemonData pokemon={props.pokemon} />
            </div>
        </div>
    );
}
