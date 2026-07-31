import { NUTRIENT_KEYS, sumNullableMicro, type Meal, type NutrientKey, type NutrientValues, type PerDayNutrients } from "@pulsia/shared";
import type { SupplementNutrients } from "../api/supplements";
import { dateKey } from "../session/dateKey";

// Comida por día → PerDayNutrients. Agrupa por mediodía local (dateKey, mismo criterio que
// dailyNutrientSeries) y suma cada nutriente con sumNullableMicro: `null` si NINGÚN ítem del día
// declaró el dato (no es lo mismo que 0). Un 0 declarado sí es número.
export function mealsToPerDayNutrients(meals: Meal[]): PerDayNutrients {
  const byDay: Record<string, Meal[]> = {};
  for (const m of meals) (byDay[dateKey(m.eatenAt)] ??= []).push(m);
  const out: PerDayNutrients = {};
  for (const [day, dayMeals] of Object.entries(byDay)) {
    const values: NutrientValues = {};
    for (const key of NUTRIENT_KEYS) {
      const nums: Array<number | null | undefined> = [];
      for (const m of dayMeals) for (const it of m.items) nums.push((it as Record<NutrientKey, number | null | undefined>)[key]);
      values[key] = sumNullableMicro(nums);
    }
    out[day] = values;
  }
  return out;
}

// Aporte de suplemento por día (respuesta del backend) → PerDayNutrients (usa solo `.totals`).
export function suppPerDayToNutrients(perDay: Record<string, SupplementNutrients>): PerDayNutrients {
  const out: PerDayNutrients = {};
  for (const [day, res] of Object.entries(perDay)) out[day] = res.totals as NutrientValues;
  return out;
}
