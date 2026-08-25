import type { SugarClass } from "../schemas/nutrition";

// Azúcares LIBRES vs INTRÍNSECOS. La OMS acota los azúcares LIBRES (<10% de la energía), y
// EXCLUYE el azúcar intrínseco de la fruta/verdura ENTERA. La app persiste el azúcar TOTAL
// (`sugars_g`) y, cuando se sabe, el AGREGADO de USDA (`added_sugars_g`); junto con la clase del
// alimento (`sugarClass`) esto deriva cuánto de ese total es "libre" a los fines del límite OMS.
export interface FreeSugarsInput {
  sugars_g?: number | null; // azúcar TOTAL
  added_sugars_g?: number | null; // azúcar agregada (USDA), o null si no se sabe
  sugarClass?: SugarClass | null;
}

function finite(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/**
 * Azúcar LIBRE por la misma base que `sugars_g` (por 100 g/ml). `null` si no sabemos el total:
 * sin el total no se puede afirmar cuánto es libre. Reglas:
 *   intrinsic → el AGREGADO conocido, o 0 (fruta/verdura entera: nada NATURAL es libre, pero si
 *     igual trae un added_sugars_g finito y positivo —misclasificación heurística/IA— ese azúcar
 *     agregado es REAL y no se descarta: el libre es al menos el agregado).
 *   free      → total (jugo/seco/puré/miel/jarabe/dulce: todo es libre)
 *   mixed / null / undefined → el AGREGADO si es un número finito; si no, el total (CONSERVADOR:
 *     ante la duda, contamos de más, no de menos).
 * El resultado se clampea a [0, total].
 */
export function freeSugarsG(input: FreeSugarsInput): number | null {
  const total = finite(input.sugars_g);
  if (total === null) return null; // no sabemos el total → no sabemos los libres
  const added = finite(input.added_sugars_g); // el agregado conocido, o null

  let free: number;
  if (input.sugarClass === "intrinsic") {
    // Piso en el agregado conocido: la fruta entera no aporta azúcar libre NATURAL, pero un added
    // finito y positivo (misclasificación) es azúcar agregada real que no puede perderse.
    free = added ?? 0;
  } else if (input.sugarClass === "free") {
    free = total;
  } else {
    // mixed o sin clase: usar el agregado si se conoce, si no el total (conservador).
    free = added ?? total;
  }

  return Math.min(Math.max(free, 0), total);
}

/**
 * Azúcar INTRÍNSECO (el que NO cuenta para el límite OMS): total − libre. `null` si no sabemos
 * el total. Nunca negativo.
 */
export function intrinsicSugarsG(input: FreeSugarsInput): number | null {
  const free = freeSugarsG(input);
  if (free === null) return null;
  const total = finite(input.sugars_g) ?? 0; // free != null ⟹ total finito
  return Math.max(0, total - free);
}
