import type { Meal } from "../schemas/nutrition";
import { NUTRIENTS, type NutrientKey, type NutrientValues } from "./nutrients";

export interface DayNutritionTotals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  nutrients: NutrientValues; // suma por clave; ausente = ningún ítem lo declaró (≠ 0)
}

// Agrupa comidas por día LOCAL. `dayKey` lo pasa el caller: shared NO maneja zonas horarias (mismo
// criterio que coverage.ts). Suma macros (siempre números en el snapshot del ítem) y micros
// (nullable: se suman solo los presentes; la clave queda ausente si ningún ítem del día la declaró).
export function mealsByLocalDay(meals: Meal[], dayKey: (ms: number) => string): Record<string, DayNutritionTotals> {
  const out: Record<string, DayNutritionTotals> = {};
  for (const meal of meals) {
    const day = dayKey(meal.eatenAt);
    const acc = (out[day] ??= { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, nutrients: {} });
    for (const it of meal.items) {
      acc.kcal += it.kcal;
      acc.protein_g += it.protein_g;
      acc.carbs_g += it.carbs_g;
      acc.fat_g += it.fat_g;
      for (const n of NUTRIENTS) {
        const key = n.key as NutrientKey;
        const v = (it as unknown as Record<string, number | null | undefined>)[key];
        if (v == null) continue;
        acc.nutrients[key] = (acc.nutrients[key] ?? 0) + v;
      }
    }
  }
  return out;
}
