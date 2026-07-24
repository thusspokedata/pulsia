import {
  NUTRIENT_KEYS,
  NUTRIENT_REFERENCES,
  NUTRIENT_REFERENCE_KIND,
  saltGFromSodiumMg,
  saturatedFatRefG,
} from "@pulsia/shared";
import type { NutrientKey, NutrientReference, NutrientSum } from "@pulsia/shared";
import type { NutritionDaySummary } from "./daySummary";
import { buildNutrientRows, porcentaje, type NutrientRow, type NutrientSection } from "./nutrientRows";

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

/**
 * DECISIÓN: la fila del día es SAL, y REEMPLAZA a la de sodio; no se muestran las dos.
 *
 * El ítem persiste sodio (es lo que entrega USDA), pero 1600 mg de sodio y 4 g de sal son el
 * MISMO hecho en dos unidades: mostrarlos como dos filas sería duplicar un dato, con el agravante
 * de que solo una de las dos tendría referencia (EFSA marca el sodio como "ongoing", sin valor,
 * mientras que la OMS acota la sal a 5 g/día). La sal es además lo que el resto de la app habla:
 * el ranking de alimentos, la curva de evolución, el semáforo del catálogo y el backend.
 *
 * ⚠️ Queda una inconsistencia para el owner: el detalle de comida y el del catálogo siguen
 * mostrando "Sodio" (sin referencia, porque EFSA no la da). Unificar las tres superficies es una
 * decisión de producto, no de implementación.
 */
function filaDeSal(sodio: NutrientSum): NutrientRow {
  // Se convierte sobre el sodio YA SUMADO del día, no ítem por ítem (ver daySummary.ts).
  const value = saltGFromSodiumMg(sodio.value);
  const ref = NUTRIENT_REFERENCES.salt_g;
  return {
    key: "salt_g",
    label: "Sal",
    unit: "g",
    value,
    ref,
    pct: value == null ? null : porcentaje(value, ref),
    kind: NUTRIENT_REFERENCE_KIND.salt_g,
    // La sal es el sodio en otra unidad: si el sodio del día tenía agujeros, la sal también.
    partial: sodio.partial,
  };
}

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

  // La sustitución se hace acá y no dentro de `buildNutrientRows` porque la sal no existe en el
  // registro: es un derivado que solo esta superficie muestra. Se sustituye EN SU LUGAR para que
  // la fila siga en Minerales y el conteo "N de M con dato" del grupo no cambie.
  return secciones.map((s) => ({
    ...s,
    rows: s.rows.map((r) => (r.key === "sodium_mg" ? filaDeSal(summary.nutrients.sodium_mg) : r)),
  }));
}
