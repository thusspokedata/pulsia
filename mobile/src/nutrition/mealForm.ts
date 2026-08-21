import { foodMacrosForQuantity, saltGFromSodiumMg, sumNullableMicro } from "@pulsia/shared";
import type { Food, MealInput, MealType, QuantityUnit } from "@pulsia/shared";

export interface MealRow {
  food: Food;
  quantity: number;
  unit: QuantityUnit;
  weighedCooked?: boolean; // sólo relevante si food.cookingYield != null
}

// Unidades válidas para un alimento: la base (g/ml) + "unit" si tiene peso por unidad.
export function allowedUnits(food: Food): QuantityUnit[] {
  const base: QuantityUnit = food.basis === "per_100ml" ? "ml" : "g";
  return food.unitWeightG != null ? [base, "unit"] : [base];
}

export function itemPreview(food: Food, quantity: number, unit: QuantityUnit, weighedCooked?: boolean) {
  return foodMacrosForQuantity(food, quantity, unit, { weighedCooked: weighedCooked ?? true });
}

export function mealTotals(rows: MealRow[]) {
  const scaled = rows.map((r) => foodMacrosForQuantity(r.food, r.quantity, r.unit, { weighedCooked: r.weighedCooked ?? true }));
  const round1 = (n: number) => Math.round(n * 10) / 10;
  // Micro: null si NINGÚN ítem lo tiene; si al menos uno lo tiene, suma tratando null como 0.
  const micro = (key: "saturated_fat_g" | "sugars_g" | "fiber_g" | "cholesterol_mg" | "water_ml"): number | null =>
    sumNullableMicro(scaled.map((m) => m[key]));
  // El alimento guarda SODIO; el resumen de la comida habla en SAL, igual que el total del día.
  // Se suma el sodio y se convierte al final (convertir por ítem redondearía cada uno a 1 decimal
  // y el total derivaría) — mismo criterio que buildNutritionDaySummary.
  const saltG = saltGFromSodiumMg(sumNullableMicro(scaled.map((m) => m.sodium_mg)));
  return {
    kcal: scaled.reduce((a, m) => a + m.kcal, 0),
    protein_g: round1(scaled.reduce((a, m) => a + m.protein_g, 0)),
    carbs_g: round1(scaled.reduce((a, m) => a + m.carbs_g, 0)),
    fat_g: round1(scaled.reduce((a, m) => a + m.fat_g, 0)),
    saturated_fat_g: micro("saturated_fat_g"),
    sugars_g: micro("sugars_g"),
    fiber_g: micro("fiber_g"),
    salt_g: saltG,
    cholesterol_mg: micro("cholesterol_mg"),
    water_ml: micro("water_ml"),
  };
}

export function buildMealInput(args: {
  eatenAt: number;
  mealType: MealType | null;
  note: string;
  rows: MealRow[];
}): MealInput {
  return {
    eatenAt: args.eatenAt,
    mealType: args.mealType,
    note: args.note.trim() === "" ? null : args.note.trim(),
    items: args.rows.map((r) => {
      const base = { foodId: r.food.id, quantity: r.quantity, quantityUnit: r.unit };
      // Solo las filas con cookingYield usan weighedCooked (ver toggle en la UI); para esas,
      // persistimos el valor EFECTIVO con el que se calcularon los macros (`?? true`, mismo
      // default que itemPreview/mealTotals) — no el `undefined` crudo del row, que el refresh
      // (FIX A) reinterpretaría distinto. Las demás filas mandan el campo AUSENTE.
      return r.food.cookingYield != null
        ? { ...base, weighedCooked: r.weighedCooked ?? true }
        : base;
    }),
  };
}

// Toma el DÍA (Y/M/D local) de dayMs y le aplica la hora del texto "HH:MM".
// Devuelve el timestamp en ms, o null si el texto no es un HH:MM válido (00–23 : 00–59).
// Exige exactamente dos dígitos por lado para no aceptar "8", "8:5", etc.
// También rechaza horas locales inexistentes (el salto del cambio de horario: p.ej. en
// Europe/Berlin "02:30" el día del spring-forward), que setHours normalizaría en silencio.
export function combineDayAndTime(dayMs: number, hhmm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  const d = new Date(dayMs);
  const year = d.getFullYear();
  const month = d.getMonth();
  const date = d.getDate();
  d.setHours(h, m, 0, 0);
  // Si el runtime tuvo que normalizar (hora inexistente por DST), la fecha/hora ya no coincide.
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== date || d.getHours() !== h || d.getMinutes() !== m) {
    return null;
  }
  return d.getTime();
}
