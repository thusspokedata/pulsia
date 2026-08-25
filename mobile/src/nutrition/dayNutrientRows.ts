import {
  NUTRIENT_REFERENCES,
  NUTRIENT_REFERENCE_KIND,
  saltGFromSodiumMg,
  saturatedFatRefG,
} from "@pulsia/shared";
import type { NutrientKey, NutrientReference } from "@pulsia/shared";
import type { NutritionDaySummary } from "./daySummary";
import {
  buildNutrientRows,
  filaDeAzucar,
  filaDeSal,
  separarValoresYParciales,
  sustituirAzucar,
  sustituirSodioPorSal,
  type NutrientSection,
} from "./nutrientRows";

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
 * Las 5 referencias de la OMS, listas para pasar como override a `buildNutrientRows`.
 *
 * Se exporta porque el detalle de UNA comida las necesita IGUALES: esa pantalla también compara
 * "sobre la referencia diaria", y con las de EFSA solas mostraba referencia para las vitaminas y
 * la sal pero ninguna para azúcares, fibra, colesterol y saturadas. Dos pantallas que dicen medir
 * lo mismo contra lo mismo tienen que leer la misma tabla, no copiarla.
 *
 * `goalKcal` en null = todavía no hay meta diaria (perfil incompleto).
 */
export function referenciasOms(goalKcal: number | null): Partial<Record<NutrientKey, NutrientReference | null>> {
  return {
    // El límite OMS de `sugars_g` (50 g) es de azúcares LIBRES: la fruta y la verdura ENTERA no
    // cuentan, sí el jugo, la fruta seca y el azúcar agregada. En el TOTAL DEL DÍA la fila de
    // `sugars_g` se sustituye luego por `filaDeAzucar`, que mide libres (ver buildDayNutrientRows).
    // LIMITACIÓN CONOCIDA: el detalle de UNA comida reusa este override pero AÚN muestra el total,
    // no los libres (no separa por ítem). Se deja así en esta fase; el override sigue siendo el
    // mismo valor de referencia (50 g), solo cambia contra qué se lo compara.
    sugars_g: { value: NUTRIENT_REFERENCES.sugars_g, kind: NUTRIENT_REFERENCE_KIND.sugars_g },
    fiber_g: { value: NUTRIENT_REFERENCES.fiber_g, kind: NUTRIENT_REFERENCE_KIND.fiber_g },
    cholesterol_mg: { value: NUTRIENT_REFERENCES.cholesterol_mg, kind: NUTRIENT_REFERENCE_KIND.cholesterol_mg },
    // La AHA acota las saturadas al 6% de la ENERGÍA, no a gramos fijos: sin meta de kcal no hay
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
  const { values, partial } = separarValoresYParciales(summary.nutrients);

  // El agua de la fila es el LÍQUIDO TOTAL del día (lo bebido + el que aportan los alimentos) y
  // no solo la columna `water_ml` de los ítems: la referencia EFSA es de agua TOTAL, así que
  // comparar contra ella los 300 ml que aportó la comida diría que el usuario tomó un 12% de lo
  // que necesita el día que tomó 2,1 L. Es el mismo número que la card de Líquido del Resumen.
  // Sin nada bebido y sin ningún alimento que declare agua no hay dato: un 0 afirmaría que no
  // tomó nada, cuando lo que pasa es que no se registró.
  const hayLiquido = summary.liquid.drank > 0 || summary.nutrients.water_ml.value != null;
  values.water_ml = hayLiquido ? summary.liquid.total : null;

  const secciones = buildNutrientRows(values, persona, {
    refs: referenciasOms(goalKcal),
    partial,
    supplement: summary.supplementNutrients,
  });

  // La sal se convierte sobre el sodio YA SUMADO del día, no ítem por ítem (ver daySummary.ts), y
  // hereda el `partial`: es el sodio en otra unidad, así que si el sodio del día tenía agujeros,
  // la sal también. El aporte de suplemento en sal se deriva del sodio de suplemento, igual que la
  // comida: son el mismo hecho en otra unidad.
  const sodio = summary.nutrients.sodium_mg;
  const supplementSaltG = saltGFromSodiumMg(summary.supplementNutrients.sodium_mg ?? null);
  const conSal = sustituirSodioPorSal(
    secciones,
    filaDeSal(sodio.value, NUTRIENT_REFERENCES.salt_g, sodio.partial, supplementSaltG),
  );

  // El azúcar se mide como LIBRE contra el límite OMS: la fila de `sugars_g` (total) se sustituye
  // por la derivada, que compara solo la parte que cuenta (fruta/verdura entera no suma). El total
  // viaja en `split` para que la UI aclare cuánto era intrínseco. El azúcar de suplemento se cuenta
  // como libre (conservador: ante la duda, cuenta contra el techo).
  const total = summary.nutrients.sugars_g.value;
  const free = summary.sugarFree.value;
  const supplementFree = summary.supplementNutrients.sugars_g ?? null;
  return sustituirAzucar(
    conSal,
    filaDeAzucar(free, total, NUTRIENT_REFERENCES.sugars_g, summary.sugarFree.partial, supplementFree),
  );
}
