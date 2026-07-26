import type { SupplementComponent, TakeStatus } from "../schemas/supplements";
import { NUTRIENTS, type NutrientKey } from "./nutrients";
import { parseLeadingNumber } from "./parseDose";

// Lo mínimo que necesita la agregación de una toma: su estado, el dose planeado y el real (desvío)
// —ambos texto libre— y los componentes del suplemento (con su mapeo canónico). El backend arma
// esta lista uniendo takes + plan items + catálogo; el móvil consume el resultado.
export interface TakeForMicros {
  status: TakeStatus;
  plannedDose: string;
  actualDose: string | null;
  supplementName: string;
  components: SupplementComponent[];
}

export interface SupplementNutrientRank {
  supplementName: string;
  amount: number;
}

export interface SupplementMicrosResult {
  totals: Partial<Record<NutrientKey, number>>;
  byNutrient: Partial<Record<NutrientKey, SupplementNutrientRank[]>>;
}

const DECIMALS = new Map<string, number>(NUTRIENTS.map((n) => [n.key, n.decimals]));
const roundTo = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

// Unidades tomadas de una toma. skipped=0; deviated usa actualDose (fallback plannedDose); taken
// usa plannedDose; si nada parsea, 1 unidad (fallback honesto — no rompe el diario).
function unitsOf(t: TakeForMicros): number {
  if (t.status === "skipped") return 0;
  const primary = t.status === "deviated" ? t.actualDose : t.plannedDose;
  return parseLeadingNumber(primary) ?? parseLeadingNumber(t.plannedDose) ?? 1;
}

// Aporte por nutriente de los suplementos tomados. Cuenta en TODO (pisos y límites por igual): un
// componente que mapea a sodium_mg suma al sodio del día como cualquier otro. La conversión a sal
// vive donde ya vive (filaDeSal en el móvil), sobre el sodio ya sumado.
export function supplementMicros(takes: TakeForMicros[]): SupplementMicrosResult {
  const acc = new Map<NutrientKey, number>();
  // Por nutriente, aporte acumulado POR suplemento (agrega multi-slot / multi-componente antes de
  // rankear — dos tomas del mismo suplemento deben sumar en una sola fila, no duplicarse).
  const ranks = new Map<NutrientKey, Map<string, number>>();
  for (const t of takes) {
    const units = unitsOf(t);
    if (units <= 0) continue;
    for (const c of t.components) {
      if (c.nutrientKey == null || c.amountPerUnit == null) continue;
      const key = c.nutrientKey as NutrientKey;
      const amount = c.amountPerUnit * units;
      if (amount <= 0) continue;
      acc.set(key, (acc.get(key) ?? 0) + amount);
      const bySupp = ranks.get(key) ?? new Map<string, number>();
      bySupp.set(t.supplementName, (bySupp.get(t.supplementName) ?? 0) + amount);
      ranks.set(key, bySupp);
    }
  }
  const totals: Partial<Record<NutrientKey, number>> = {};
  for (const [key, sum] of acc) totals[key] = roundTo(sum, DECIMALS.get(key) ?? 1);
  const byNutrient: Partial<Record<NutrientKey, SupplementNutrientRank[]>> = {};
  for (const [key, bySupp] of ranks) {
    byNutrient[key] = Array.from(bySupp, ([supplementName, amount]) => ({
      supplementName,
      amount: roundTo(amount, DECIMALS.get(key) ?? 1),
    })).sort((a, b) => b.amount - a.amount || a.supplementName.localeCompare(b.supplementName));
  }
  return { totals, byNutrient };
}
