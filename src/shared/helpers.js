export const wait = (ms) =>
    new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, ms);
    });

// PokeAPI's own Korean names cover pokemon/moves (fetched live, see processjson.js),
// but types, damage classes, and stat names are small fixed sets we display from a
// local table instead of paying an extra request for each one.
const TYPE_KO = {
    typeless: "무속성", // Struggle
    normal: "노말",
    fire: "불꽃",
    water: "물",
    electric: "전기",
    grass: "풀",
    ice: "얼음",
    fighting: "격투",
    poison: "독",
    ground: "땅",
    flying: "비행",
    psychic: "에스퍼",
    bug: "벌레",
    rock: "바위",
    ghost: "고스트",
    dragon: "드래곤",
    dark: "악",
    steel: "강철",
    fairy: "페어리",
};

const DAMAGE_CLASS_KO = {
    physical: "물리",
    special: "특수",
    status: "변화",
};

const STAT_KO = {
    attack: "공격",
    defense: "방어",
    "special-attack": "특수공격",
    "special-defense": "특수방어",
    speed: "스피드",
    accuracy: "명중률",
    evasion: "회피율",
};

export function typeNameToString(typeName) {
    return TYPE_KO[typeName] || capitalizeFirstLetter(typeName);
}

export function damageClassToString(damageClassName) {
    return DAMAGE_CLASS_KO[damageClassName] || capitalizeFirstLetter(damageClassName);
}

export function statNameToString(statName) {
    return STAT_KO[statName] || capitalizeFirstLetter(statName);
}

export function pokemonTypeToString(pokemon) {
    let types = "";
    for (let i = 0; i < pokemon.types.length; i++) {
        types =
            types +
            typeNameToString(pokemon.types[i].type.name) +
            (i === 0 && pokemon.types.length > 1 ? "/" : "");
    }
    return types;
}

export function pokemonNameToString(pokemon) {
    const shown = pokemon.illusion || pokemon; // a pokemon under Illusion goes by its disguise's name
    return shown.korean_name || capitalizeFirstLetter(shown.name);
}

export function moveNameToString(move) {
    return move.korean_name || capitalizeFirstLetter(move.name);
}

export function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

export function shuffle(array) {
    let currentIndex = array.length,
        randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex !== 0) {
        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex],
            array[currentIndex],
        ];
    }

    return array;
}

export function arraysEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;

    // If you don't care about the order of the elements inside
    // the array, you should sort both arrays here.
    // Please note that calling sort on an array will modify that array.
    // you might want to clone your array first.

    for (var i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}
