import { METRIC_TYPES, METRIC_RANGES, type MetricReading, type MetricType } from "@pulsia/shared";

export interface BuildReadingResult {
  reading: MetricReading | null;
  invalid: MetricType[];
}

export function buildReadingFromForm(form: Partial<Record<MetricType, string>>, measuredAt: number): BuildReadingResult {
  const entries: { metricType: MetricType; value: number }[] = [];
  const invalid: MetricType[] = [];
  for (const t of METRIC_TYPES) {
    const raw = form[t]?.trim();
    if (!raw) continue;
    const value = Number(raw);
    const [min, max] = METRIC_RANGES[t];
    if (!Number.isFinite(value) || value < min || value > max) {
      invalid.push(t);
      continue;
    }
    entries.push({ metricType: t, value });
  }
  return { reading: entries.length ? { measuredAt, entries } : null, invalid };
}
