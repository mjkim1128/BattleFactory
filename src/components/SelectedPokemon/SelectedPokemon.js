import { Move } from "components";
import { StatsDisplay } from "components/StatsDisplay";
import { pokemonNameToString, pokemonTypeToString } from "shared";
import React from "react";
import "./SelectedPokemon.css";

export function SelectedPokemon(props) {

    const moves = props.pokemon.moveset.map((move, index) => {
        return (
            <div className="move-row" key={index}>
                <Move 
                    move={move} 
                    onClick={()=>{}}
                />
            </div>
        );
    });

    return (
        <div className="selected-pokemon-div">
            <div className="selected-pokemon-row">
                <img className="pokemon-img"
                    src={props.pokemon.sprites.front_default}
                    alt={props.pokemon.name}
                ></img>
                <div>
                    <p>{pokemonNameToString(props.pokemon)}</p>
                    <p>{pokemonTypeToString(props.pokemon)}</p>
                    {props.pokemon.item && (
                        <p className="selected-pokemon-item">
                            {props.pokemon.item.sprites && props.pokemon.item.sprites.default && (
                                <img
                                    className="selected-pokemon-item-icon"
                                    src={props.pokemon.item.sprites.default}
                                    alt={props.pokemon.item.name}
                                />
                            )}
                            {props.pokemon.item.korean_name || props.pokemon.item.name}
                        </p>
                    )}
                </div>
            </div>
            <div className="selected-pokemon-row">
                <StatsDisplay pokemon={props.pokemon} />
            </div>
            <div>
                {moves !== null && (
                    <div className="selected-pokemon-row">
                        <p className="moves-p"> MOVES: </p>
                        {moves}
                    </div>
                )}
            </div>
        </div>
    );
}
