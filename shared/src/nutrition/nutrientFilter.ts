import {
  nutrientLevel,
  nutrientSentiment,
  nutrientValue,
  type FlaggedNutrient,
  type FoodFlagsInput,
} from "./nutrientLevel";

export type NutrientFilterResult<T> = {
  /** Los que califican, de mayor a menor valor. */
  matches: T[];
  /** Los que no tienen el dato cargado. Se muestran aparte, nunca se descartan. */
  unknown: T[];
};

/**
 * "Mostrame los altos en X". Para la fibra, que es piso, "califica" significa buena fuente.
 *
 * Los alimentos sin el dato salen por `unknown` en vez de quedar afuera: si desaparecieran,
 * la lista estaría afirmando que no son altos, y no lo sabe.
 */
export function filterFoodsByNutrient<T extends FoodFlagsInput>(
  foods: readonly T[],
  nutrient: FlaggedNutrient,
): NutrientFilterResult<T> {
  const wanted = nutrient === "fiber_g" ? "good" : "bad";
  const scored: Array<{ food: T; value: number }> = [];
  const unknown: T[] = [];

  for (const food of foods) {
    const value = nutrientValue(food, nutrient);
    const level = nutrientLevel(nutrient, value, food.basis);
    if (level === "unknown") {
      unknown.push(food);
      continue;
    }
    // level ya descartó "unknown" arriba, y nutrientLevel solo devuelve "unknown" cuando
    // value es null (o no finito): acá value es necesariamente un number.
    if (nutrientSentiment(nutrient, level) === wanted) {
      scored.push({ food, value: value as number });
    }
  }

  scored.sort((a, b) => b.value - a.value);
  return { matches: scored.map((s) => s.food), unknown };
}
