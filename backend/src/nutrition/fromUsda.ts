// Arma un `FoodInput` ENTERO desde una fila de la copia local de USDA: los 4 macros y los 30
// micronutrientes salen todos de la fila. Es lo que usa el seed del catálogo base (ingredientes
// canónicos sin foto ni etiqueta) — a diferencia de `assembleFoodExtraction`, acá NO hay una
// identificación de IA que aporte macros: la fila de USDA es la única fuente.
//
// Procedencia honesta: `sourceMacros: "usda"` (los macros vienen de la base de composición, no de
// una etiqueta ni de la IA) y `sourceMicros: "usda"`. Se guarda `usdaFdcId` para trazar la fila.

import type { FoodBasis, FoodInput } from "@pulsia/shared";
import type { UsdaFoodRow } from "../usda/matcher";
import { nutrientsFromRow } from "./columns";

export interface FoodMeta {
  name: string;
  basis: FoodBasis;
  unitWeightG: number | null;
}

// USDA calcula los "carbs by difference" restando; en algunas filas Foundation da un valor
// levemente negativo (p. ej. Lamb, ground: -0.251). `FoodInput` exige todo no-negativo, así que se
// recorta a 0 — que es el valor honesto para ese artefacto. null (dato ausente) se conserva.
function clampNonNeg(v: number | null): number | null {
  return v == null ? null : Math.max(0, v);
}

export function foodInputFromUsdaRow(row: UsdaFoodRow, meta: FoodMeta): FoodInput {
  const micros = nutrientsFromRow(row);
  for (const k of Object.keys(micros) as (keyof typeof micros)[]) micros[k] = clampNonNeg(micros[k]);
  return {
    name: meta.name,
    basis: meta.basis,
    unitWeightG: meta.unitWeightG,
    // Macros: la fila de USDA los tiene nullable, pero `FoodInput` los exige no-nullable. Para un
    // ingrediente canónico siempre están; el `?? 0` es el mismo cinturón que usa `assemble.ts`.
    kcal: clampNonNeg(row.kcal) ?? 0,
    protein_g: clampNonNeg(row.proteinG) ?? 0,
    carbs_g: clampNonNeg(row.carbsG) ?? 0,
    fat_g: clampNonNeg(row.fatG) ?? 0,
    // Los 30 micronutrientes desde la fila (null donde la fila no tiene dato — null es "no
    // sabemos", NO 0). Sale del registro, no de una lista a mano.
    ...micros,
    sourceMacros: "usda",
    sourceMicros: "usda",
    usdaFdcId: row.fdcId,
  };
}
