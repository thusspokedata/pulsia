import type { BodyMetric } from "./useMetric";

export interface Point { t: number; v: number }

export function toSeries(metrics: BodyMetric[]): Point[] {
  return metrics
    .map((m) => ({ t: m.measuredAt, v: m.value }))
    .sort((a, b) => a.t - b.t);
}
