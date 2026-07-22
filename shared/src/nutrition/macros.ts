import type { FoodBasis, QuantityUnit } from "../schemas/nutrition";
import { NUTRIENTS, type NutrientValues } from "./nutrients";

export type MacroSource = {
  basis: FoodBasis;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  unitWeightG: number | null;
} & NutrientValues;

export type ScaledMacros = {
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
} & { [K in keyof NutrientValues]-?: number | null };

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundTo = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

// null si TODOS los valores son null/undefined; si no, suma tratando null como 0, redondeado a 1 decimal.
export function sumNullableMicro(values: Array<number | null | undefined>): number | null {
  if (!values.some((v) => v != null)) return null;
  return Math.round(values.reduce<number>((a, v) => a + (v ?? 0), 0) * 10) / 10;
}

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

  // Recorre el REGISTRO, no una lista escrita a mano: agregar un nutriente al registro lo hace
  // escalar solo. Un nutriente ausente queda null — nunca 0, que afirmaría "no tiene".
  const scaled = {} as Record<string, number | null>;
  for (const n of NUTRIENTS) {
    const v = (food as unknown as Record<string, number | null | undefined>)[n.key];
    scaled[n.key] = v == null ? null : roundTo(v * factor, n.decimals);
  }

  return {
    grams,
    kcal: Math.round(food.kcal * factor),
    protein_g: round1(food.protein_g * factor),
    carbs_g: round1(food.carbs_g * factor),
    fat_g: round1(food.fat_g * factor),
    ...scaled,
  } as ScaledMacros;
}
