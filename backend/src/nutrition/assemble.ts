// Mezcla PURA: combina lo que identificó la 1ª llamada de IA (FoodIdentification) con la fila de
// USDA elegida (o null si no hubo match) y devuelve la forma persistida (FoodExtraction).
//
// La regla vive acá y en ningún otro lado (spec §5.2). Es el punto donde más fácil se cuela un
// bug invisible, así que los tres conjuntos de campos se DERIVAN del registro de nutrientes, no
// se escriben a mano: un nutriente nuevo cae solo en el conjunto correcto (USDA) en vez de
// perderse en silencio (el bug de buildFitActivity).

import { NUTRIENT_KEYS, type FoodExtraction, type FoodIdentification } from "@pulsia/shared";
import type { UsdaFoodRow } from "../usda/matcher";
import { nutrientColumn } from "./columns";

// Lo que la IA aporta (los 10 del §5.2): los 4 macros + los 6 micros legibles de una etiqueta.
// Fuente ÚNICA; los otros dos conjuntos se derivan de acá.
export const AI_PROVIDED_KEYS = [
  "kcal", "protein_g", "carbs_g", "fat_g",
  "saturated_fat_g", "sugars_g", "fiber_g", "sodium_mg", "cholesterol_mg", "water_ml",
] as const;

const AI_SET = new Set<string>(AI_PROVIDED_KEYS);
const REGISTRO = new Set<string>(NUTRIENT_KEYS);

// Macros = los que la IA aporta y NO están en el registro de micronutrientes (los 4 núcleo,
// no-nullable). Micros de etiqueta = los que SÍ están en el registro (los 6).
const MACRO_KEYS = AI_PROVIDED_KEYS.filter((k) => !REGISTRO.has(k));
const LABEL_MICRO_KEYS = AI_PROVIDED_KEYS.filter((k) => REGISTRO.has(k));

// Vitaminas y minerales puros = el registro MENOS lo que aporta la IA. Se DERIVA a propósito: si
// alguien agrega un nutriente al registro y no lo agrega a AI_PROVIDED_KEYS, cae acá (USDA) en
// vez de desaparecer. El test de partición de assemble.test.ts lo blinda.
export const VITAMIN_MINERAL_KEYS = NUTRIENT_KEYS.filter((k) => !AI_SET.has(k));

// Valor de un nutriente/macro en la fila de USDA (camelCase), o null si no hay fila o la columna
// no trae número (una fila de USDA puede tener el campo en null).
function usdaValue(usda: UsdaFoodRow | null, key: string): number | null {
  if (!usda) return null;
  const v = (usda as Record<string, unknown>)[nutrientColumn(key)];
  return typeof v === "number" ? v : null;
}

// Regla de mezcla para los campos que aporta la IA (§5.2):
//   - sourceMacros "label": la etiqueta GANA; si no cubre el campo (null), rellena USDA.
//   - sourceMacros "ai":    USDA gana donde tenga dato; si no, cae a la estimación de la IA.
function mixAiProvided(
  aiVal: number | null | undefined,
  usdaVal: number | null,
  sourceMacros: "label" | "ai",
): number | null {
  const ai = aiVal ?? null;
  return sourceMacros === "label" ? (ai ?? usdaVal) : (usdaVal ?? ai);
}

/**
 * Combina la identificación de la IA con la fila de USDA elegida. Sin match → `usda: null`:
 * las vitaminas y minerales quedan en `null` (NO en 0), `sourceMicros: null`, `usdaFdcId: null`,
 * y lo que aportó la IA (macros + micros de etiqueta) se conserva tal cual.
 *
 * Los campos identitarios (`name`, `basis`, `unitWeightG`) salen SIEMPRE de `id`: el usuario
 * escribió "banana", no importa que la fila de USDA se llame "Bananas, raw".
 */
export function assembleFoodExtraction(id: FoodIdentification, usda: UsdaFoodRow | null): FoodExtraction {
  const idRec = id as unknown as Record<string, number | null | undefined>;
  const out: Record<string, unknown> = {
    name: id.name,
    basis: id.basis,
    unitWeightG: id.unitWeightG,
    sourceMacros: id.sourceMacros,
    sourceMicros: usda ? "usda" : null,
    usdaFdcId: usda?.fdcId ?? null,
  };
  // Macros (4): siempre presentes. La 1ª llamada trae siempre un número, así que la mezcla nunca
  // devuelve null acá; el `?? 0` es un cinturón por si el input viniera roto (el schema exige un
  // número no-negativo y sin esto un null lo rompería).
  for (const key of MACRO_KEYS) {
    out[key] = mixAiProvided(idRec[key], usdaValue(usda, key), id.sourceMacros) ?? 0;
  }
  // Micros de etiqueta (6): misma regla; pueden quedar en null.
  for (const key of LABEL_MICRO_KEYS) {
    out[key] = mixAiProvided(idRec[key], usdaValue(usda, key), id.sourceMacros);
  }
  // Vitaminas y minerales puros: SIEMPRE de USDA. Sin match → null.
  for (const key of VITAMIN_MINERAL_KEYS) {
    out[key] = usdaValue(usda, key);
  }
  return out as unknown as FoodExtraction;
}
