import { deriveRecipe } from "@pulsia/shared";
import type { FoodInput } from "@pulsia/shared";
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
