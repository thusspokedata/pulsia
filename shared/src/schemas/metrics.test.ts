import { expect, test } from "bun:test";
import {
  METRIC_TYPES, BODY_METRIC_TYPES, BP_METRIC_TYPES, METRIC_UNITS, METRIC_LABELS,
  MetricTypeSchema, BodyMetricEntrySchema, MetricReadingSchema,
} from "./metrics";

test("BODY_METRIC_TYPES cubre los 6 tipos originales y tiene unidad + label cada uno", () => {
  expect(BODY_METRIC_TYPES).toEqual([
    "weight_kg", "body_fat_pct", "skeletal_muscle_mass_kg",
    "bone_mass_kg", "body_water_pct", "waist_cm",
  ]);
  for (const t of METRIC_TYPES) {
    expect(METRIC_UNITS[t]).toBeTruthy();
    expect(METRIC_LABELS[t]).toBeTruthy();
  }
});

test("METRIC_TYPES combina BODY_METRIC_TYPES y BP_METRIC_TYPES (9 tipos)", () => {
  expect(METRIC_TYPES).toHaveLength(9);
  expect(METRIC_TYPES).toEqual([...BODY_METRIC_TYPES, ...BP_METRIC_TYPES]);
});

test("MetricTypeSchema rechaza tipos desconocidos", () => {
  expect(MetricTypeSchema.safeParse("weight_kg").success).toBe(true);
  expect(MetricTypeSchema.safeParse("bmi").success).toBe(false);
});

test("MetricTypeSchema acepta tipos de presión arterial", () => {
  expect(MetricTypeSchema.safeParse("bp_systolic").success).toBe(true);
});

test("BodyMetricEntrySchema valida el rango por tipo", () => {
  expect(BodyMetricEntrySchema.safeParse({ metricType: "weight_kg", value: 80 }).success).toBe(true);
  expect(BodyMetricEntrySchema.safeParse({ metricType: "weight_kg", value: 5 }).success).toBe(false); // < 20
  expect(BodyMetricEntrySchema.safeParse({ metricType: "body_fat_pct", value: 90 }).success).toBe(false); // > 70
});

test("BodyMetricEntrySchema valida el rango para presión arterial", () => {
  expect(BodyMetricEntrySchema.safeParse({ metricType: "bp_systolic", value: 300 }).success).toBe(false); // > 260
  expect(BodyMetricEntrySchema.safeParse({ metricType: "bp_systolic", value: 120 }).success).toBe(true);
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
