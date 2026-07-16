import type { Meal, MealType } from "../schemas/nutrition";

export type MealSliceKey = MealType | "sin_tipo";

export interface MealSlice {
  key: MealSliceKey;
  label: string;
  kcal: number;
  pct: number; // 0–100, sobre el total del día
}

// Label de cada tipo de comida. El `satisfies Record<MealType, string>` fuerza exhaustividad: si
// se agrega una variante a MealTypeSchema y no se agrega acá, este archivo deja de compilar. Sin
// ese guard, las kcal del tipo nuevo sumarían al total (el denominador del %) pero no tendrían
// porción: la torta mostraría todo lo demás más chico, sin ningún error.
const MEAL_LABELS = {
  desayuno: "Desayuno",
  almuerzo: "Almuerzo",
  cena: "Cena",
  snack: "Snack",
} satisfies Record<MealType, string>;

// Orden canónico de la torta. Explícito y no derivado de MEAL_LABELS: el orden es una decisión de
// UI, no del schema. "sin_tipo" va último — mealType es nullable en el schema.
const MEAL_ORDER: { key: MealSliceKey; label: string }[] = [
  { key: "desayuno", label: MEAL_LABELS.desayuno },
  { key: "almuerzo", label: MEAL_LABELS.almuerzo },
  { key: "cena", label: MEAL_LABELS.cena },
  { key: "snack", label: MEAL_LABELS.snack },
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
  // El % se calcula antes de redondear: el schema permite kcal no-enteros, aunque hoy los ítems
  // lleguen ya redondeados desde foodMacrosForQuantity.
  // OJO: cada pct se redondea por separado, así que pueden sumar 99 o 101 (p.ej. tres tercios). Es
  // solo texto de la leyenda: los arcos de la torta se dibujan con `kcal`, nunca con `pct`.
  return MEAL_ORDER.flatMap(({ key, label }) => {
    const kcal = kcalBy.get(key) ?? 0;
    if (kcal <= 0) return [];
    return [{ key, label, kcal: Math.round(kcal), pct: Math.round((kcal / total) * 100) }];
  });
}
