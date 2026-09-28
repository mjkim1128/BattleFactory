import React, { useState } from "react";
import {
    damageClassToString,
    damageCalc,
    moveNameToString,
    pokemonNameToString,
    typeNameToString,
} from "shared";
import "./Move.css";

export function Move(props) {
    const [style, setStyle] = useState({ display: "none" });

    let [attack, defend] = [null, null];
    let [atkStat, defStat] = [null, null];
    let damage_text = "";
    let move_text = "";
    let percent_text = "";

    if (props.attackerDefender) {
        [attack, defend] = props.attackerDefender;

        [atkStat, defStat] =
            props.move.damage_class.name === "physical"
                ? [
                      // eslint-disable-next-line
                      "(" + `${attack.base_stats[1].toString()}` + " " + "Atk)",
                      // eslint-disable-next-line
                      "(" + `${defend.base_stats[2].toString()}` + " " + "Def)",
                  ]
                : [
                      // eslint-disable-next-line
                      "(" + attack.base_stats[3].toString() + " " + "SpA)",
                      // eslint-disable-next-line
                      "(" + defend.base_stats[4].toString() + " " + "SpD)",
                  ];
        damage_text =
            "Damage: " +
            pokemonNameToString(attack) +
            " " +
            atkStat +
            " vs. " +
            pokemonNameToString(defend) +
            " " +
            defStat;
        let damage = damageCalc(attack, defend, props.move);
        let percent = Math.round((damage / defend.hp[1]) * 1000) / 10;
        move_text =
            moveNameToString(props.move) +
            " (" +
            props.move.power +
            "bp): " +
            damage +
            "/" +
            defend.hp[1] +
            "hp";
        percent_text = "(" + percent + "%)";
    }

    let moveClassName =
        props.moveOwner === "party" ? "party-move" : "move-button";

    let effect_text = (
        props.move.flavor_text_entries.find(
            (entry) => entry.language && entry.language.name === "ko"
        ) ||
        props.move.flavor_text_entries.find(
            (entry) =>
                entry.language === undefined ||
                entry.language.name === undefined ||
                entry.language.name === "en"
        )
    ).flavor_text;

    if (props.move.meta === undefined) {
        /// temporary error fix
        console.log("CHECK THIS!!! ERROR WITH: ");
        console.log(props.move);
        return;
    }

    if (props.move.type === undefined) {
        return <div></div>;
    }

    return (
        <div>
            <div className="move-div">
                <button
                    className={moveClassName}
                    id={props.move.type.name}
                    onClick={() => props.onClick(props.move)}
                    onMouseOver={(e) => {
                        setStyle({ display: "table" });
                    }}
                    onMouseOut={(e) => {
                        setStyle({ display: "none" });
                    }}
                >
                    <p>{moveNameToString(props.move)}</p>
                    <p>{typeNameToString(props.move.type.name)}</p>
                </button>
            </div>
            <div style={style}>
                <div
                    className="move-info-div"
                    id={
                        props.moveOwner === "party"
                            ? (props.move.meta &&
                                  (props.move.meta.stat_chance === 100 ||
                                      props.move.meta.drain !== 0))
                                ? "party-extra-space"
                                : "party"
                            : ""
                    }
                >
                    <p>
                        Power: {props.move.power}
                        {typeof props.move.accuracy === "number" &&
                            " / Accuracy: " + props.move.accuracy}
                    </p>
                    <p>
                        Damage Class:{" "}
                        {damageClassToString(props.move.damage_class.name)}
                    </p>
                    <p>Priority: {props.move.priority}</p>

                    {((props.move.meta &&
                        (props.move.meta.stat_chance === 100 ||
                            props.move.meta.drain !== 0)) ||
                        props.move.name === "explosion" ||
                        props.move.name === "self-destruct") && (
                        <p>Description: {effect_text}</p>
                    )}
                    {/* <p>Accuracy: {props.move.accuracy}</p> */}
                    {/* <p>PP: {props.move.pp}</p>
                    <p>
                        Effect:{" "}
                        {props.move.effect_entries[0] !== undefined
                            ? props.move.effect_entries[0].effect
                            : "ERROR!"}
                    </p>
                    <p>
                        Description:{" "}
                        {props.move.flavor_text_entries[1].flavor_text}
                    </p> */}
                    {props.attackerDefender && (
                        <div className="damage-info-div">
                            <p>{damage_text}</p>
                            <p>
                                {move_text} <b>{percent_text}</b>
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
