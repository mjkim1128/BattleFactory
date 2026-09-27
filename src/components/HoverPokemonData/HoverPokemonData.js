import { HealthBar } from "components/HealthBar";
import { StatsDisplay } from "components/StatsDisplay";
import {
    pokemonNameToString,
    pokemonTypeToString,
    statNameToString,
} from "shared";
import React from "react";
import "./HoverPokemonData.css";

export function HoverPokemonData(props) {
    const abilities = [];
    for (let i = 0; i < props.pokemon.abilities.length; i++) {
        abilities.push(props.pokemon.abilities[i].ability.name + " ");
    }

    const stat_names = [
        "attack",
        "defense",
        "special-attack",
        "special-defense",
        "speed",
    ];
    let stat_levels = "";
    for (let i=0; i<props.pokemon.stat_levels.length; i++) {
        let level = props.pokemon.stat_levels[i];
        if (level !== 0) {
            let symbol = level < 0 ? "" : "+";
            stat_levels =
                stat_levels +
                statNameToString(stat_names[i]) +
                " (" +
                symbol +
                level +
                ") ";
        }
    }

    return (
        <div className="hover-pokemon-div">
            <div className="hover-pokemon-div-top">
                <p>
                    {pokemonNameToString(props.pokemon)} &nbsp; hp:{" "}
                    {props.pokemon.hp[0]}/{props.pokemon.hp[1]}
                </p>
                <HealthBar
                    label=""
                    value={props.pokemon.hp[0]}
                    maxValue={props.pokemon.hp[1]}
                />
            </div>
            <p>Type: {pokemonTypeToString(props.pokemon)}</p>
            {props.pokemon.item && (
                <p className="hover-pokemon-item">
                    {props.pokemon.item.sprites && props.pokemon.item.sprites.default && (
                        <img
                            className="hover-pokemon-item-icon"
                            src={props.pokemon.item.sprites.default}
                            alt={props.pokemon.item.name}
                        />
                    )}
                    {props.pokemon.item.korean_name || props.pokemon.item.name}
                </p>
            )}
            {/* <p>Abilities: {abilities}</p>
            <p>Weight: {props.pokemon.weight}</p> */}
            <StatsDisplay pokemon={props.pokemon} />
            {props.pokemon.hp[0] > 0 && stat_levels.length > 0 && (
                <div>
                    <p>{stat_levels}</p>
                </div>
            )}
        </div>
    );
}
