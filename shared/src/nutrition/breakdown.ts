import type { Meal, MealType } from "../schemas/nutrition";

export type MealSliceKey = MealType | "sin_tipo";

export interface MealSlice {
  key: MealSliceKey;
  label: string;
  kcal: number;
  pct: number; // 0–100, sobre el total del día
}

// Orden canónico de la torta. "sin_tipo" va último: mealType es nullable en el schema, así que
// una comida puede no tener tipo.
const MEAL_ORDER: { key: MealSliceKey; label: string }[] = [
  { key: "desayuno", label: "Desayuno" },
  { key: "almuerzo", label: "Almuerzo" },
  { key: "cena", label: "Cena" },
  { key: "snack", label: "Snack" },
  { key: "sin_tipo", label: "Sin tipo" },
];

export function caloriesByMeal(meals: Meal[]): MealSlice[] {
  const kcalBy = new Map<MealSliceKey, number>();
  for (const m of meals) {
    const key: MealSliceKey = m.mealType ?? "sin_tipo";
    const kcal = m.items.reduce((a, it) => a + it.kcal, 0);
    kcalBy.set(key, (kcalBy.get(key) ?? 0) + kcal);
  }
  const total = [...kcalBy.values()].reduce((a, v) => a + v, 0);
  if (total <= 0) return [];
  // El % se calcula sobre los kcal CRUDOS (no los redondeados) para que no se desvíe.
  return MEAL_ORDER.flatMap(({ key, label }) => {
    const kcal = kcalBy.get(key) ?? 0;
    if (kcal <= 0) return [];
    return [{ key, label, kcal: Math.round(kcal), pct: Math.round((kcal / total) * 100) }];
  });
}
