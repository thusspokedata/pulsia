import { NUTRIENTS, type NutrientKey } from "./nutrients";
import { foodMacrosRaw, type MacroSource } from "./macros";
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

// Deriva una receta a sus totales y a los valores por 100 g. Reusa el MISMO núcleo de escalado que
// el diario (foodMacrosRaw, el corazón sin redondear de foodMacrosForQuantity) pero suma las
// contribuciones CRUDAS de cada ingrediente y redondea recién al final: sumar valores que ya
// vinieron redondeados por-ingrediente y volver a escalar a por-100g arrastra el error de redondeo
// (p.ej. 50 g de un alimento de 89 kcal/100g redondearía a 45 kcal → 90 kcal/100g en vez de 89).
// La semántica de null se preserva a mano (no con sumNutrientByKey, que redondea por-llamada y
// reintroduciría el mismo sesgo): un micro que ningún ingrediente tiene queda null, nunca 0.
export function deriveRecipe(ingredients: RecipeIngredient[], cookedWeightG: number | null): DerivedRecipe {
  const raw = ingredients.map((i) => foodMacrosRaw(i.food, i.quantity, i.unit, { weighedCooked: false }));
  const sumGrams = raw.reduce((a, m) => a + m.grams, 0);
  const effectiveWeightG = cookedWeightG ?? sumGrams;
  if (effectiveWeightG <= 0) throw new Error("La receta necesita al menos un ingrediente con peso.");
  const factor = 100 / effectiveWeightG;

  const rawKcal = raw.reduce((a, m) => a + m.kcal, 0);
  const rawProtein = raw.reduce((a, m) => a + m.protein_g, 0);
  const rawCarbs = raw.reduce((a, m) => a + m.carbs_g, 0);
  const rawFat = raw.reduce((a, m) => a + m.fat_g, 0);

  const total = {
    kcal: Math.round(rawKcal),
    protein_g: round1(rawProtein),
    carbs_g: round1(rawCarbs),
    fat_g: round1(rawFat),
  } as MacroBlock;
  const per100 = {
    kcal: Math.round(rawKcal * factor),
    protein_g: round1(rawProtein * factor),
    carbs_g: round1(rawCarbs * factor),
    fat_g: round1(rawFat * factor),
  } as MacroBlock;

  for (const n of NUTRIENTS) {
    const values = raw.map((m) => m[n.key]);
    const hasData = values.some((v) => v != null);
    const rawSum = hasData ? values.reduce<number>((a, v) => a + (v ?? 0), 0) : null;
    total[n.key] = rawSum == null ? null : roundTo(rawSum, n.decimals);
    per100[n.key] = rawSum == null ? null : roundTo(rawSum * factor, n.decimals);
  }
  return { sumGrams, effectiveWeightG, total, per100 };
}
