import { HealthBar } from "components";
import { HoverPokemonData } from "components";
import React, { useState } from "react";
import { pokemonNameToString, pokemonTypeToString } from "shared";
import "./CurrentPokemon.css";

export function CurrentPokemon(props) {
    const [style, setStyle] = useState({ display: "none" });

    return (
        <div className="current-pokemon-div">
            <div>
                <p>{pokemonNameToString(props.pokemon)}</p>
                <p>{pokemonTypeToString(props.pokemon.illusion || props.pokemon)}</p>
            </div>
            <div>
                <HealthBar
                    label=""
                    value={props.pokemon.hp[0]}
                    maxValue={props.pokemon.hp[1]}
                />
                <img id={props.pokemon.hp[0] > 0 ? "" : "fainted-current-pokemon"}
                    src={props.img}
                    alt=""
                    onMouseOver={() => {
                        setStyle({ display: "table" });
                    }}
                    onMouseOut={() => {
                        setStyle({ display: "none" });
                    }}
                ></img>
                <div style={style} className="display-hover-pokemon-div">
                    <HoverPokemonData pokemon={props.pokemon} />
                </div>
            </div>
        </div>
    );
}
