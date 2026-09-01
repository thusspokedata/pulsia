import { deriveRecipe, type Food, type FoodInput, type SugarClass } from "@pulsia/shared";
import { nutrientsFromRow } from "./columns";
import { food } from "../db/schema";

type FoodRow = typeof food.$inferSelect;

// Error de input del cliente (ingrediente inexistente / unidad incoherente) → el route lo mapea a 400.
export class RecipeValidationError extends Error {}

// Si el input es una receta, RE-DERIVA su per-100g desde los ingredientes reales del catálogo
// (autoridad del server: no confía en los macros que mandó el cliente) y valida que cada
// ingrediente exista. Un alimento común (sin `recipe`) se devuelve intacto. `catalog` = Map
// foodId → fila del alimento, provisto por el route (que hace la query).
export function applyRecipeDerivation(input: FoodInput, catalog: Map<string, FoodRow>): FoodInput {
  if (!input.recipe) return input;
  const ingredients = input.recipe.items.map((it) => {
    const f = catalog.get(it.foodId);
    if (!f) throw new RecipeValidationError(`Ingrediente no encontrado en el catálogo: ${it.foodId}`);
    return {
      food: {
        basis: f.basis as Food["basis"], kcal: f.kcal, protein_g: f.proteinG, carbs_g: f.carbsG, fat_g: f.fatG,
        unitWeightG: f.unitWeightG,
        ...nutrientsFromRow(f),
      },
      quantity: it.quantity,
      unit: it.unit,
      // Metadata de azúcar del ingrediente (no escala): la receta compone su sugarClass con esto.
      sugarClass: (f.sugarClass ?? null) as SugarClass | null,
    };
  });
  let per100: ReturnType<typeof deriveRecipe>["per100"];
  let derived: ReturnType<typeof deriveRecipe>;
  try {
    derived = deriveRecipe(ingredients, input.recipe.cookedWeightG);
    per100 = derived.per100;
  } catch (e) {
    throw new RecipeValidationError((e as Error).message);
  }
  // Sobrescribe SOLO la nutrición (per-100g) + fuerza basis/procedencia; conserva name, recipe, etc.
  return {
    ...input,
    basis: "per_100g",
    ...per100, // kcal + macros + 30 nutrientes por 100 g
    unitWeightG: null,
    sourceMacros: "recipe",
    sugarClass: derived.sugarClass, // clase de azúcar compuesta desde los ingredientes
    sourceMicros: null,
    usdaFdcId: null,
  };
}
