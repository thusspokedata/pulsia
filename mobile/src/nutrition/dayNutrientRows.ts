import {
  NUTRIENT_KEYS,
  NUTRIENT_REFERENCES,
  NUTRIENT_REFERENCE_KIND,
  saturatedFatRefG,
} from "@pulsia/shared";
import type { NutrientKey, NutrientReference } from "@pulsia/shared";
import type { NutritionDaySummary } from "./daySummary";
import { buildNutrientRows, filaDeSal, sustituirSodioPorSal, type NutrientSection } from "./nutrientRows";

/**
 * Filas de nutrientes del TOTAL DEL DÍA.
 *
 * Es la única superficie donde conviven dos tablas de referencia, y por eso vive en su propio
 * módulo en vez de dentro del componente:
 *
 *  - Vitaminas y minerales se comparan contra **EFSA**, personalizado por sexo y edad.
 *  - Azúcares, fibra, saturadas, colesterol y sal se comparan contra la **OMS**
 *    (`references.ts`). Esos cinco están en `null` en la tabla EFSA a propósito, justamente para
 *    que no haya dos referencias distintas del mismo nutriente. Se pasan como override para que
 *    la precedencia sea explícita y no dependa de que EFSA siga sin cubrirlos.
 */

// `goalKcal` en null = todavía no hay meta diaria (perfil incompleto).
function referenciasOms(goalKcal: number | null): Partial<Record<NutrientKey, NutrientReference | null>> {
  return {
    sugars_g: { value: NUTRIENT_REFERENCES.sugars_g, kind: NUTRIENT_REFERENCE_KIND.sugars_g },
    fiber_g: { value: NUTRIENT_REFERENCES.fiber_g, kind: NUTRIENT_REFERENCE_KIND.fiber_g },
    cholesterol_mg: { value: NUTRIENT_REFERENCES.cholesterol_mg, kind: NUTRIENT_REFERENCE_KIND.cholesterol_mg },
    // La OMS acota las saturadas al 10% de la ENERGÍA, no a gramos fijos: sin meta de kcal no hay
    // referencia honesta que mostrar, y el `null` explícito impide que herede otra.
    saturated_fat_g:
      goalKcal != null
        ? { value: saturatedFatRefG(goalKcal), kind: NUTRIENT_REFERENCE_KIND.saturated_fat_g }
        : null,
    // El sodio no lleva referencia porque su fila se sustituye por la de sal (ver filaDeSal).
    sodium_mg: null,
  };
}

export function buildDayNutrientRows(
  summary: NutritionDaySummary,
  persona: { sex?: string; age?: number },
  goalKcal: number | null,
): NutrientSection[] {
  const values: Partial<Record<NutrientKey, number | null>> = {};
  const partial: Partial<Record<NutrientKey, boolean>> = {};
  for (const key of NUTRIENT_KEYS) {
    values[key] = summary.nutrients[key].value;
    partial[key] = summary.nutrients[key].partial;
  }

  // El agua de la fila es el LÍQUIDO TOTAL del día (lo bebido + el que aportan los alimentos) y
  // no solo la columna `water_ml` de los ítems: la referencia EFSA es de agua TOTAL, así que
  // comparar contra ella los 300 ml que aportó la comida diría que el usuario tomó un 12% de lo
  // que necesita el día que tomó 2,1 L. Es el mismo número que la card de Líquido del Resumen.
  // Sin nada bebido y sin ningún alimento que declare agua no hay dato: un 0 afirmaría que no
  // tomó nada, cuando lo que pasa es que no se registró.
  const hayLiquido = summary.liquid.drank > 0 || summary.nutrients.water_ml.value != null;
  values.water_ml = hayLiquido ? summary.liquid.total : null;

  const secciones = buildNutrientRows(values, persona, { refs: referenciasOms(goalKcal), partial });

  // La sal se convierte sobre el sodio YA SUMADO del día, no ítem por ítem (ver daySummary.ts), y
  // hereda el `partial`: es el sodio en otra unidad, así que si el sodio del día tenía agujeros,
  // la sal también.
  const sodio = summary.nutrients.sodium_mg;
  return sustituirSodioPorSal(secciones, filaDeSal(sodio.value, NUTRIENT_REFERENCES.salt_g, sodio.partial));
}
