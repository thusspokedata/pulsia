import { expect, test } from "bun:test";
import {
  METRIC_TYPES, METRIC_UNITS, METRIC_LABELS,
  MetricTypeSchema, BodyMetricEntrySchema, MetricReadingSchema,
} from "./metrics";

test("METRIC_TYPES cubre los 6 tipos y tiene unidad + label cada uno", () => {
  expect(METRIC_TYPES).toEqual([
    "weight_kg", "body_fat_pct", "skeletal_muscle_mass_kg",
    "bone_mass_kg", "body_water_pct", "waist_cm",
  ]);
  for (const t of METRIC_TYPES) {
    expect(METRIC_UNITS[t]).toBeTruthy();
    expect(METRIC_LABELS[t]).toBeTruthy();
  }
});

test("MetricTypeSchema rechaza tipos desconocidos", () => {
  expect(MetricTypeSchema.safeParse("weight_kg").success).toBe(true);
  expect(MetricTypeSchema.safeParse("bmi").success).toBe(false);
});

test("BodyMetricEntrySchema valida el rango por tipo", () => {
  expect(BodyMetricEntrySchema.safeParse({ metricType: "weight_kg", value: 80 }).success).toBe(true);
  expect(BodyMetricEntrySchema.safeParse({ metricType: "weight_kg", value: 5 }).success).toBe(false); // < 20
  expect(BodyMetricEntrySchema.safeParse({ metricType: "body_fat_pct", value: 90 }).success).toBe(false); // > 70
});

test("MetricReadingSchema exige al menos una entry y acepta measuredAt opcional", () => {
  expect(MetricReadingSchema.safeParse({ entries: [] }).success).toBe(false);
  const ok = MetricReadingSchema.safeParse({
    measuredAt: 1_700_000_000_000,
    entries: [{ metricType: "weight_kg", value: 80 }, { metricType: "waist_cm", value: 85 }],
  });
  expect(ok.success).toBe(true);
});

test("MetricReadingSchema rechaza metricType duplicado dentro de la misma lectura", () => {
  const dup = MetricReadingSchema.safeParse({
    entries: [{ metricType: "weight_kg", value: 80 }, { metricType: "weight_kg", value: 79 }],
  });
  expect(dup.success).toBe(false);

  const distinct = MetricReadingSchema.safeParse({
    entries: [{ metricType: "weight_kg", value: 80 }, { metricType: "waist_cm", value: 85 }],
  });
  expect(distinct.success).toBe(true);
});
