import type { Food, FoodIdentification } from "@pulsia/shared";

// Construye la identificación que espera assembleFoodExtraction a partir de un alimento YA
// guardado. La identidad (nombre, basis, unitWeightG) sale siempre del alimento del usuario: da
// igual que la fila de USDA se llame "Almonds, raw", el usuario escribió "Almendra".
export function identificationFromFood(f: Food, searchQuery: string): FoodIdentification {
  return {
    name: f.name,
    basis: f.basis,
    unitWeightG: f.unitWeightG,
    kcal: f.kcal,
    protein_g: f.protein_g,
    carbs_g: f.carbs_g,
    fat_g: f.fat_g,
    saturated_fat_g: f.saturated_fat_g ?? null,
    sugars_g: f.sugars_g ?? null,
    fiber_g: f.fiber_g ?? null,
    sodium_mg: f.sodium_mg ?? null,
    cholesterol_mg: f.cholesterol_mg ?? null,
    water_ml: f.water_ml ?? null,
    // `manual` no existe en FoodIdentification. Se mapea a "label" y NO a "ai" a propósito: así
    // los macros que tipeó el usuario ganan y USDA solo rellena las vitaminas vacías. Pisar en
    // silencio un número escrito por una persona es peor que dejarlo imperfecto.
    sourceMacros: f.sourceMacros === "ai" ? "ai" : "label",
    searchQuery,
  };
}
