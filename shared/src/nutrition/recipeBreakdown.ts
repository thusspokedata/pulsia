import { foodMacrosRaw, type MacroSource, type ScaledMacros } from "./macros";
import type { RecipeItemInput } from "../schemas/nutrition";

// Un ingrediente de una receta con su aporte crudo al nutriente/macro elegido.
export interface RecipeContribution {
  foodId: string;
  name: string;
  value: number; // aporte SIN redondear (la pantalla reparte el amount de la fila por fracción)
}

export interface RecipeExpansion {
  // Ingredientes que resuelven Y aportan > 0, de mayor a menor. Desempate por nombre, igual que
  // rankFoods, para que la lista no baile entre renders.
  contributions: RecipeContribution[];
  // false si ALGÚN item de la receta no resolvió (borrado/no está en el catálogo). La pantalla
  // usa esto para NO expandir (decisión d del owner): nunca reparte sobre un total incompleto.
  complete: boolean;
}

// Reparte una receta a sus ingredientes para un macro/micro. `resolve` mapea foodId → el Food del
// ingrediente (per-100g + nombre); `valueOf` es el MISMO extractor que usa el ranking de la pantalla
// (macroValueOf / nutrientValueOf), así comida y expansión hablan la misma unidad (incl. sal→sodio).
// Aplana un solo nivel: si un ingrediente es a su vez una receta, se usa su per-100g tal cual (no se
// recursea). No se usa cookedWeightG ni redondeo: el reparto de la pantalla es por FRACCIÓN, y la
// fracción entre ingredientes es invariante a la escala.
export function expandRecipe(
  items: RecipeItemInput[],
  resolve: (foodId: string) => (MacroSource & { name: string }) | null,
  valueOf: (m: ScaledMacros) => number | null,
): RecipeExpansion {
  let complete = true;
  const contributions: RecipeContribution[] = [];
  for (const it of items) {
    const food = resolve(it.foodId);
    if (food == null) {
      complete = false;
      continue; // seguimos: no depender del orden para marcar incompleto
    }
    let scaled: ScaledMacros;
    try {
      // weighedCooked:false alinea con deriveRecipe (recipe.ts): la receta se derivó aplicando el
      // per-100g SECO tal cual, sin dividir por cookingYield. Repartir con otra semántica sesgaría
      // las fracciones respecto a cómo se construyó la receta.
      scaled = foodMacrosRaw(food, it.quantity, it.unit, { weighedCooked: false });
    } catch {
      // Unidad incoherente con el basis del ingrediente (dato viejo/corrupto): tratamos como faltante.
      complete = false;
      continue;
    }
    const value = valueOf(scaled);
    if (value == null || value <= 0) continue; // no aporta: no enseña nada (igual que rankFoods)
    contributions.push({ foodId: it.foodId, name: food.name, value });
  }
  contributions.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return { contributions, complete };
}
