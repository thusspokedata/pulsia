import type { Meal, MealType } from "../schemas/nutrition";

// Criterio de redondeo de `pct`/`pctActual`/`pctTarget`, compartido por todas las tortas de este
// archivo (comidas y macros): cada porcentaje se redondea por separado, así que pueden sumar 99 o
// 101 (p.ej. tres tercios). Es solo texto de la leyenda: los arcos de cada torta se dibujan
// siempre con las kcal, nunca con el %.

// 0 cuando no hay total: evita 0/0 → NaN. También atrapa un total NaN (NaN > 0 es false).
const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

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
  // lleguen ya redondeados desde foodMacrosForQuantity. (Criterio de redondeo de `pct`: ver arriba.)
  return MEAL_ORDER.flatMap(({ key, label }) => {
    const kcal = kcalBy.get(key) ?? 0;
    if (kcal <= 0) return [];
    return [{ key, label, kcal: Math.round(kcal), pct: pct(kcal, total) }];
  });
}

export interface MacroGrams {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface MacroSlice {
  key: "protein" | "carbs" | "fat";
  label: string;
  g: number;
  kcal: number;
  pctActual: number; // 0–100, sobre las kcal derivadas de los macros
  pctTarget: number | null; // null si no hay meta
}

// Las kcal de la torta se DERIVAN de los gramos (4/4/9), no se toman de dayTotals.kcal: los dos
// números pueden diferir por redondeos de etiqueta, y una torta tiene que cerrar en 100%.
const MACRO_ROWS = [
  { key: "protein", label: "Proteína", field: "protein_g", kcalPerG: 4 },
  { key: "carbs", label: "Carbohidratos", field: "carbs_g", kcalPerG: 4 },
  { key: "fat", label: "Grasa", field: "fat_g", kcalPerG: 9 },
] as const;

export function macroSplit(comido: MacroGrams, meta: MacroGrams | null): MacroSlice[] {
  const kcalOf = (src: MacroGrams) => MACRO_ROWS.map((r) => src[r.field] * r.kcalPerG);
  const actual = kcalOf(comido);
  const totalActual = actual.reduce((a, v) => a + v, 0);
  const target = meta ? kcalOf(meta) : null;
  const totalTarget = target ? target.reduce((a, v) => a + v, 0) : 0;
  return MACRO_ROWS.map((r, i) => ({
    key: r.key,
    label: r.label,
    g: Math.round(comido[r.field]),
    kcal: Math.round(actual[i]),
    pctActual: pct(actual[i], totalActual),
    // El guard de totalTarget se queda: sin meta (o con una meta toda en 0) esto es null, no 0 —
    // un 0/0 no significa "0% de la meta", significa que no hay meta contra la cual comparar.
    pctTarget: target && totalTarget > 0 ? pct(target[i], totalTarget) : null,
  }));
}
