import { foodMacrosForQuantity } from "@pulsia/shared";
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
  const sum = rows.reduce(
    (acc, r) => {
      const m = foodMacrosForQuantity(r.food, r.quantity, r.unit);
      acc.kcal += m.kcal;
      acc.protein_g += m.protein_g;
      acc.carbs_g += m.carbs_g;
      acc.fat_g += m.fat_g;
      return acc;
    },
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    kcal: sum.kcal,
    protein_g: round1(sum.protein_g),
    carbs_g: round1(sum.carbs_g),
    fat_g: round1(sum.fat_g),
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
