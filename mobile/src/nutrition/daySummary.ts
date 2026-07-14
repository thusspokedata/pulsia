import { sumNullableMicro } from "@pulsia/shared";
import type { Meal, WaterLog } from "@pulsia/shared";

export interface NutritionDaySummary {
  dayTotals: {
    kcal: number; protein_g: number; carbs_g: number; fat_g: number;
    sugars_g: number | null; fiber_g: number | null; saturated_fat_g: number | null; salt_g: number | null;
  };
  cholesterolMg: number | null;
  liquid: { total: number; drank: number; fromFood: number };
}

export function buildNutritionDaySummary(meals: Meal[], water: WaterLog[]): NutritionDaySummary {
  const items = meals.flatMap((m) => m.items);
  const micro = (key: "sugars_g" | "fiber_g" | "saturated_fat_g" | "salt_g"): number | null =>
    sumNullableMicro(items.map((it) => it[key]));
  const dayTotals = {
    kcal: items.reduce((a, it) => a + it.kcal, 0),
    protein_g: items.reduce((a, it) => a + it.protein_g, 0),
    carbs_g: items.reduce((a, it) => a + it.carbs_g, 0),
    fat_g: items.reduce((a, it) => a + it.fat_g, 0),
    sugars_g: micro("sugars_g"), fiber_g: micro("fiber_g"),
    saturated_fat_g: micro("saturated_fat_g"), salt_g: micro("salt_g"),
  };
  const cholesterolMg = sumNullableMicro(items.map((it) => it.cholesterol_mg));
  const fromFood = sumNullableMicro(items.map((it) => it.water_ml)) ?? 0;
  const drank = water.reduce((a, w) => a + w.ml, 0);
  return { dayTotals, cholesterolMg, liquid: { total: Math.round(fromFood + drank), drank, fromFood } };
}
