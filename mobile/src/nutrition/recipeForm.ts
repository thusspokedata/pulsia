import { deriveRecipe, foldAccents } from "@pulsia/shared";
import type { Food, FoodInput } from "@pulsia/shared";
import type { MealRow } from "./mealForm";

// Reusa MealRow ({food, quantity, unit}) del constructor de comidas: un ingrediente de receta se
// pesa igual que un ítem de una comida.
export function recipeTotals(rows: MealRow[], cookedWeightG: number | null) {
  return deriveRecipe(
    rows.map((r) => ({ food: r.food, quantity: r.quantity, unit: r.unit })),
    cookedWeightG,
  );
}

// Arma el FoodInput que persiste la receta como un Food per-100g. sourceMicros = null: los micros
// son compuestos (no de un único USDA/IA); el chip "receta" de los macros ya comunica la procedencia.
export function buildRecipeFoodInput(args: {
  name: string;
  rows: MealRow[];
  cookedWeightG: number | null;
}): FoodInput {
  const d = recipeTotals(args.rows, args.cookedWeightG);
  return {
    name: args.name.trim(),
    basis: "per_100g",
    ...d.per100, // kcal + protein_g/carbs_g/fat_g + los 30 nutrientes por 100 g
    unitWeightG: null,
    sourceMacros: "recipe",
    sourceMicros: null,
    usdaFdcId: null,
    recipe: {
      items: args.rows.map((r) => ({ foodId: r.food.id, quantity: r.quantity, unit: r.unit })),
      cookedWeightG: args.cookedWeightG,
    },
  };
}

// Parsea la cantidad tipeada (coma o punto decimal). Cualquier cosa no finita (vacío, texto,
// "1e309" → Infinity) cae a 0 — la validación de guardar exige > 0, así que 0 bloquea el guardado
// sin dejar que un valor no finito llegue a deriveRecipe (que dividiría/mostraría NaN/Infinity).
export function parseQuantityInput(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Ingredientes candidatos para el buscador: matchean el nombre (case-insensitive, substring) y
// excluyen `excludeFoodId` — la receta que se está editando no puede agregarse a sí misma como
// ingrediente. Query vacía → sin resultados.
export function filterIngredientMatches(foods: Food[], query: string, excludeFoodId?: string): Food[] {
  const q = foldAccents(query.trim());
  if (q === "") return [];
  return foods.filter((f) => f.id !== excludeFoodId && foldAccents(f.name).includes(q));
}
