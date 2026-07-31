import { coveragePeriod, type PerDayNutrients } from "@pulsia/shared";
import type { ReferencePerson, ReportKind } from "@pulsia/shared";
import { periodFor } from "../reports/periods";
import { dateKey } from "../session/dateKey";

export interface CoveragePoint { x: number; y: number }

// Mediodía local del día `YYYY-MM-DD` (mismo criterio que nutrientSeries.noonOf): representa el
// día, no la hora de la comida. Sirve para ubicar cada día dentro de un período.
function noonOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

// Conserva las entradas cuyo día (mediodía local) cae dentro de [start, end].
export function filterByPeriod(per: PerDayNutrients, period: { start: number; end: number }): PerDayNutrients {
  const out: PerDayNutrients = {};
  for (const [day, values] of Object.entries(per)) {
    const t = noonOf(day);
    if (t >= period.start && t <= period.end) out[day] = values;
  }
  return out;
}

// Serie de `onlyFoodPct` de los últimos `count` períodos del tipo `kind` que terminan en `offset`.
// Del más viejo al más nuevo. Los períodos sin nutrientes clasificables (onlyFoodPct null) se omiten.
export function coverageEvolution(
  kind: ReportKind,
  offset: number,
  count: number,
  perDayFood: PerDayNutrients,
  perDaySupp: PerDayNutrients,
  person: ReferencePerson,
  opts: { minDataDays: number },
  now: number,
): CoveragePoint[] {
  const points: CoveragePoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const period = periodFor(kind, offset + i, now);
    const food = filterByPeriod(perDayFood, period);
    const supp = filterByPeriod(perDaySupp, period);
    const res = coveragePeriod(food, supp, person, opts);
    if (res.onlyFoodPct == null) continue;
    points.push({ x: period.start, y: res.onlyFoodPct });
  }
  return points;
}

// Rango de días (from/to YYYY-MM-DD LOCAL) que cubre los últimos `count` períodos hasta `offset`.
// Se usa para pedir la ventana al backend/listMeals una sola vez.
export function windowBounds(kind: ReportKind, offset: number, count: number, now: number): { from: string; to: string } {
  const oldest = periodFor(kind, offset + count - 1, now);
  const newest = periodFor(kind, offset, now);
  return { from: dateKey(oldest.start), to: dateKey(newest.end) };
}
