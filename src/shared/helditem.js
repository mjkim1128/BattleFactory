// The item a pokemon can actually use. Klutz keeps its item (it can still be traded, stolen
// or knocked off) but the item does nothing, so every place that applies an item's effect
// asks for this instead of reading pokemon.item.
export function activeItem(pokemon) {
    if (!pokemon || !pokemon.item) return null;
    return pokemon.ability && pokemon.ability.name === "klutz" ? null : pokemon.item;
}
