import { NUTRIENTS, type NutrientKey } from "./nutrients";
import { foodMacrosForQuantity, sumNutrientByKey, type MacroSource } from "./macros";
import type { QuantityUnit } from "../schemas/nutrition";

export interface RecipeIngredient {
  food: MacroSource;
  quantity: number;
  unit: QuantityUnit;
}

type MacroBlock = { kcal: number; protein_g: number; carbs_g: number; fat_g: number } & Record<NutrientKey, number | null>;

export interface DerivedRecipe {
  sumGrams: number;          // suma de gramos de los ingredientes (ml cuenta como g 1:1)
  effectiveWeightG: number;  // cookedWeightG ?? sumGrams
  total: MacroBlock;         // totales absolutos de toda la receta (para el preview)
  per100: MacroBlock;        // por 100 g (lo que se guarda como Food)
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundTo = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

// Deriva una receta a sus totales y a los valores por 100 g. Reusa la MISMA fuente de escalado que
// el diario (foodMacrosForQuantity) y la MISMA semántica de null que las sumas del día
// (sumNutrientByKey): un micro que ningún ingrediente tiene queda null, nunca 0.
export function deriveRecipe(ingredients: RecipeIngredient[], cookedWeightG: number | null): DerivedRecipe {
  const scaled = ingredients.map((i) => foodMacrosForQuantity(i.food, i.quantity, i.unit));
  const sumGrams = scaled.reduce((a, m) => a + m.grams, 0);
  const effectiveWeightG = cookedWeightG ?? sumGrams;
  if (effectiveWeightG <= 0) throw new Error("La receta necesita al menos un ingrediente con peso.");
  const factor = 100 / effectiveWeightG;

  const totalKcal = scaled.reduce((a, m) => a + m.kcal, 0);
  const totalProtein = round1(scaled.reduce((a, m) => a + m.protein_g, 0));
  const totalCarbs = round1(scaled.reduce((a, m) => a + m.carbs_g, 0));
  const totalFat = round1(scaled.reduce((a, m) => a + m.fat_g, 0));

  const total = { kcal: totalKcal, protein_g: totalProtein, carbs_g: totalCarbs, fat_g: totalFat } as MacroBlock;
  const per100 = {
    kcal: Math.round(totalKcal * factor),
    protein_g: round1(totalProtein * factor),
    carbs_g: round1(totalCarbs * factor),
    fat_g: round1(totalFat * factor),
  } as MacroBlock;

  for (const n of NUTRIENTS) {
    const sum = sumNutrientByKey(scaled.map((m) => m[n.key]), n.key).value; // null si ninguno tenía dato
    total[n.key] = sum;
    per100[n.key] = sum == null ? null : roundTo(sum * factor, n.decimals);
  }
  return { sumGrams, effectiveWeightG, total, per100 };
}
