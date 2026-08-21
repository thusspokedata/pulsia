import type { FoodBasis, QuantityUnit } from "../schemas/nutrition";
import { NUTRIENTS, type NutrientKey, type NutrientValues } from "./nutrients";

export type MacroSource = {
  basis: FoodBasis;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  unitWeightG: number | null;
  // cocido ÷ seco. null/ausente = el per-100g se aplica tal cual (comportamiento actual).
  cookingYield?: number | null;
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
// `decimals` default 1 preserva el comportamiento de los llamadores existentes (informes, resumen
// del día): cambiar el default les movería totales que ya están en producción sin que nadie lo
// pidiera. Quien sabe qué nutriente suma y necesita más precisión usa sumNutrientByKey.
export function sumNutrient(values: Array<number | null | undefined>, decimals = 1): NutrientSum {
  const total = values.length;
  const withData = values.filter((v) => v != null).length;
  if (withData === 0) return { value: null, partial: false, withData: 0, total };
  const sum = values.reduce<number>((a, v) => a + (v ?? 0), 0);
  return {
    value: roundTo(sum, decimals),
    partial: withData < total,
    withData,
    total,
  };
}

// Suma el nutriente `key` respetando los decimales que declara el registro. Es la que hay que
// usar cuando se sabe QUÉ nutriente se está sumando: sumar zinc a 1 decimal convierte 0.12 en
// 0.1, un 17% de error en silencio.
export function sumNutrientByKey(values: Array<number | null | undefined>, key: NutrientKey): NutrientSum {
  const def = NUTRIENTS.find((n) => n.key === key);
  return sumNutrient(values, def?.decimals ?? 1);
}

// Compatibilidad con los llamadores existentes. Se implementa sobre sumNutrient a propósito:
// dos criterios de suma distintos es exactamente cómo Progreso y Nutrición terminan mostrando
// cifras distintas del mismo día.
export function sumNullableMicro(values: Array<number | null | undefined>): number | null {
  return sumNutrient(values).value;
}

// Convierte los gramos que el usuario PESÓ a los gramos SECOS equivalentes, para aplicarles el
// per-100g seco del alimento. Sólo convierte si el alimento tiene yield y se pesó cocido.
// `cocidos = secos × yield` ⟹ `secos = cocidos / yield`.
export function rawEquivalentGrams(grams: number, cookingYield: number | null | undefined, weighedCooked: boolean): number {
  if (cookingYield == null || !weighedCooked) return grams;
  return grams / cookingYield;
}

// Núcleo sin redondear: la usa foodMacrosForQuantity (abajo) y deriveRecipe, que necesita sumar
// contribuciones crudas de varios ingredientes ANTES de redondear (sumar valores ya redondeados y
// volver a escalar a por-100g introduce sesgo — ver deriveRecipe).
export function foodMacrosRaw(
  food: MacroSource,
  quantity: number,
  unit: QuantityUnit,
  opts?: { weighedCooked?: boolean },
): ScaledMacros {
  // Guard de coherencia unidad/basis.
  if (unit === "unit") {
    if (food.unitWeightG == null) throw new Error("El alimento no tiene peso por unidad; cargá gramos/ml.");
  } else if (unit === "g" && food.basis !== "per_100g") {
    throw new Error("Unidad incoherente con el alimento (basis per_100ml no se mide en g).");
  } else if (unit === "ml" && food.basis !== "per_100ml") {
    throw new Error("Unidad incoherente con el alimento (basis per_100g no se mide en ml).");
  }
  const grams = unit === "unit" ? quantity * (food.unitWeightG as number) : quantity;
  // Peso seco equivalente para el escalado; `grams` (el peso real pesado) se devuelve tal cual.
  // cookingYield solo aplica a sólidos (per_100g): el schema ya lo bloquea para per_100ml, pero
  // este guard protege contra una fila YA persistida que lo trajera de todos modos — dividir ml
  // pesados por el yield estaría mal.
  const scaleGrams = food.basis === "per_100g"
    ? rawEquivalentGrams(grams, food.cookingYield, opts?.weighedCooked ?? true)
    : grams;
  const factor = scaleGrams / 100;

  // Recorre el REGISTRO, no una lista escrita a mano: agregar un nutriente al registro lo hace
  // escalar solo. Un nutriente ausente queda null — nunca 0, que afirmaría "no tiene".
  const scaled = {} as Record<string, number | null>;
  for (const n of NUTRIENTS) {
    const v = (food as unknown as Record<string, number | null | undefined>)[n.key];
    scaled[n.key] = v == null ? null : v * factor;
  }

  return {
    grams,
    kcal: food.kcal * factor,
    protein_g: food.protein_g * factor,
    carbs_g: food.carbs_g * factor,
    fat_g: food.fat_g * factor,
    ...scaled,
  } as ScaledMacros;
}

// Fuente única del cálculo: la usan el móvil (preview) y el backend (snapshot). Envuelve
// foodMacrosRaw aplicando el redondeo de siempre — su salida no cambia.
export function foodMacrosForQuantity(
  food: MacroSource,
  quantity: number,
  unit: QuantityUnit,
  opts?: { weighedCooked?: boolean },
): ScaledMacros {
  const raw = foodMacrosRaw(food, quantity, unit, opts);

  const scaled = {} as Record<string, number | null>;
  for (const n of NUTRIENTS) {
    const v = (raw as unknown as Record<string, number | null>)[n.key];
    scaled[n.key] = v == null ? null : roundTo(v, n.decimals);
  }

  return {
    grams: raw.grams,
    kcal: Math.round(raw.kcal),
    protein_g: round1(raw.protein_g),
    carbs_g: round1(raw.carbs_g),
    fat_g: round1(raw.fat_g),
    ...scaled,
  } as ScaledMacros;
}
