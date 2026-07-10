import { METRIC_TYPES, METRIC_RANGES, type MetricReading, type MetricType } from "@pulsia/shared";

export function buildReadingFromForm(form: Partial<Record<MetricType, string>>, measuredAt: number): MetricReading | null {
  const entries = METRIC_TYPES.flatMap((t) => {
    const raw = form[t]?.trim();
    if (!raw) return [];
    const value = Number(raw);
    if (!Number.isFinite(value)) return [];
    const [min, max] = METRIC_RANGES[t];
    if (value < min || value > max) return [];
    return [{ metricType: t, value }];
  });
  return entries.length ? { measuredAt, entries } : null;
}
