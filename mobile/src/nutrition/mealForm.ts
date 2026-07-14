import { foodMacrosForQuantity, sumNullableMicro } from "@pulsia/shared";
import type { Food, MealInput, MealType, QuantityUnit } from "@pulsia/shared";

export interface MealRow {
  food: Food;
  quantity: number;
  unit: QuantityUnit;
}

// Unidades válidas para un alimento: la base (g/ml) + "unit" si tiene peso por unidad.
export function allowedUnits(food: Food): QuantityUnit[] {
  const base: QuantityUnit = food.basis === "per_100ml" ? "ml" : "g";
  return food.unitWeightG != null ? [base, "unit"] : [base];
}

export function itemPreview(food: Food, quantity: number, unit: QuantityUnit) {
  return foodMacrosForQuantity(food, quantity, unit);
}

export function mealTotals(rows: MealRow[]) {
  const scaled = rows.map((r) => foodMacrosForQuantity(r.food, r.quantity, r.unit));
  const round1 = (n: number) => Math.round(n * 10) / 10;
  // Micro: null si NINGÚN ítem lo tiene; si al menos uno lo tiene, suma tratando null como 0.
  const micro = (key: "saturated_fat_g" | "sugars_g" | "fiber_g" | "salt_g"): number | null =>
    sumNullableMicro(scaled.map((m) => m[key]));
  return {
    kcal: scaled.reduce((a, m) => a + m.kcal, 0),
    protein_g: round1(scaled.reduce((a, m) => a + m.protein_g, 0)),
    carbs_g: round1(scaled.reduce((a, m) => a + m.carbs_g, 0)),
    fat_g: round1(scaled.reduce((a, m) => a + m.fat_g, 0)),
    saturated_fat_g: micro("saturated_fat_g"),
    sugars_g: micro("sugars_g"),
    fiber_g: micro("fiber_g"),
    salt_g: micro("salt_g"),
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
    items: args.rows.map((r) => ({ foodId: r.food.id, quantity: r.quantity, quantityUnit: r.unit })),
  };
}
