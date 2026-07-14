import type { FoodBasis, QuantityUnit } from "../schemas/nutrition";

export interface MacroSource {
  basis: FoodBasis;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  unitWeightG: number | null;
  saturated_fat_g?: number | null;
  sugars_g?: number | null;
  fiber_g?: number | null;
  salt_g?: number | null;
  cholesterol_mg?: number | null;
  water_ml?: number | null;
}

export interface ScaledMacros {
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  saturated_fat_g: number | null;
  sugars_g: number | null;
  fiber_g: number | null;
  salt_g: number | null;
  cholesterol_mg: number | null;
  water_ml: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// null si TODOS los valores son null/undefined; si no, suma tratando null como 0, redondeado a 1 decimal.
export function sumNullableMicro(values: Array<number | null | undefined>): number | null {
  if (!values.some((v) => v != null)) return null;
  return Math.round(values.reduce<number>((a, v) => a + (v ?? 0), 0) * 10) / 10;
}

// Escala un micro opcional por el factor; null/undefined → null.
const scaleMicro = (v: number | null | undefined, factor: number): number | null =>
  v == null ? null : round1(v * factor);

// Fuente única del cálculo: la usan el móvil (preview) y el backend (snapshot).
export function foodMacrosForQuantity(food: MacroSource, quantity: number, unit: QuantityUnit): ScaledMacros {
  // Guard de coherencia unidad/basis.
  if (unit === "unit") {
    if (food.unitWeightG == null) throw new Error("El alimento no tiene peso por unidad; cargá gramos/ml.");
  } else if (unit === "g" && food.basis !== "per_100g") {
    throw new Error("Unidad incoherente con el alimento (basis per_100ml no se mide en g).");
  } else if (unit === "ml" && food.basis !== "per_100ml") {
    throw new Error("Unidad incoherente con el alimento (basis per_100g no se mide en ml).");
  }
  const grams = unit === "unit" ? quantity * (food.unitWeightG as number) : quantity;
  const factor = grams / 100;
  return {
    grams,
    kcal: Math.round(food.kcal * factor),
    protein_g: round1(food.protein_g * factor),
    carbs_g: round1(food.carbs_g * factor),
    fat_g: round1(food.fat_g * factor),
    saturated_fat_g: scaleMicro(food.saturated_fat_g, factor),
    sugars_g: scaleMicro(food.sugars_g, factor),
    fiber_g: scaleMicro(food.fiber_g, factor),
    salt_g: scaleMicro(food.salt_g, factor),
    cholesterol_mg: scaleMicro(food.cholesterol_mg, factor),
    water_ml: scaleMicro(food.water_ml, factor),
  };
}
