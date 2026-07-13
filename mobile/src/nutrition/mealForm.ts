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
  return rows.reduce(
    (acc, r) => {
      const m = foodMacrosForQuantity(r.food, r.quantity, r.unit);
      return {
        kcal: acc.kcal + m.kcal,
        protein_g: Math.round((acc.protein_g + m.protein_g) * 10) / 10,
        carbs_g: Math.round((acc.carbs_g + m.carbs_g) * 10) / 10,
        fat_g: Math.round((acc.fat_g + m.fat_g) * 10) / 10,
      };
    },
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
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
