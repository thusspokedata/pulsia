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

export interface NutrientSum {
  value: number | null; // null = ningún ítem tenía dato
  partial: boolean; // true = al menos uno tenía dato y al menos uno no
  withData: number;
  total: number;
}

// `partial` es la diferencia entre "comiste 0,8 mg de zinc" y "0,8 de los que sabemos". La UI
// tiene que poder decirlo; sumar los ausentes como 0 en silencio es afirmar un dato falso.
export function sumNutrient(values: Array<number | null | undefined>): NutrientSum {
  const total = values.length;
  const withData = values.filter((v) => v != null).length;
  if (withData === 0) return { value: null, partial: false, withData: 0, total };
  const sum = values.reduce<number>((a, v) => a + (v ?? 0), 0);
  return {
    value: Math.round(sum * 10) / 10,
    partial: withData < total,
    withData,
    total,
  };
}

// Compatibilidad con los llamadores existentes. Se implementa sobre sumNutrient a propósito:
// dos criterios de suma distintos es exactamente cómo Progreso y Nutrición terminan mostrando
// cifras distintas del mismo día.
export function sumNullableMicro(values: Array<number | null | undefined>): number | null {
  return sumNutrient(values).value;
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
