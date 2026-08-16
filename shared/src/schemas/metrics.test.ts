import { expect, test } from "bun:test";
import {
  METRIC_TYPES, BODY_METRIC_TYPES, BP_METRIC_TYPES, METRIC_UNITS, METRIC_LABELS, METRIC_RANGES,
  MetricTypeSchema, BodyMetricEntrySchema, MetricReadingSchema,
  ACTIVITY_METRIC_TYPES, SUBJECTIVE_METRIC_TYPES, FLOW_METRIC_TYPES, formatMetricValue,
  CURRENT_METRIC_TYPES, TREND_METRIC_TYPES, metricsWithData,
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

test("METRIC_TYPES combina BODY_METRIC_TYPES, BP_METRIC_TYPES, ACTIVITY_METRIC_TYPES y SUBJECTIVE_METRIC_TYPES", () => {
  expect(METRIC_TYPES).toEqual([
    ...BODY_METRIC_TYPES, ...BP_METRIC_TYPES, ...ACTIVITY_METRIC_TYPES, ...SUBJECTIVE_METRIC_TYPES,
  ]);
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

test("MetricReadingSchema exige presión alta > baja cuando vienen ambas", () => {
  const bad = MetricReadingSchema.safeParse({
    entries: [{ metricType: "bp_systolic", value: 80 }, { metricType: "bp_diastolic", value: 120 }],
  });
  expect(bad.success).toBe(false);

  const ok = MetricReadingSchema.safeParse({
    entries: [{ metricType: "bp_systolic", value: 120 }, { metricType: "bp_diastolic", value: 80 }],
  });
  expect(ok.success).toBe(true);

  // Solo una de las dos → no aplica la regla cruzada.
  const onlySys = MetricReadingSchema.safeParse({ entries: [{ metricType: "bp_systolic", value: 120 }] });
  expect(onlySys.success).toBe(true);
});

test("los tipos nuevos están en METRIC_TYPES y cubiertos por units/labels/ranges", () => {
  for (const t of [...ACTIVITY_METRIC_TYPES, ...SUBJECTIVE_METRIC_TYPES]) {
    expect(METRIC_TYPES).toContain(t);
    expect(METRIC_UNITS[t]).toBeDefined();
    expect(METRIC_LABELS[t]).toBeDefined();
    expect(METRIC_RANGES[t]).toBeDefined();
  }
});

test("FLOW_METRIC_TYPES = actividad + subjetivo", () => {
  expect(new Set(FLOW_METRIC_TYPES)).toEqual(new Set([...ACTIVITY_METRIC_TYPES, ...SUBJECTIVE_METRIC_TYPES]));
});

test("valida rango de una métrica nueva", () => {
  expect(BodyMetricEntrySchema.safeParse({ metricType: "steps", value: 8000 }).success).toBe(true);
  expect(BodyMetricEntrySchema.safeParse({ metricType: "sleep_hours", value: 30 }).success).toBe(false);
});

test("formatMetricValue redondea a ≤2 decimales sin ceros de relleno", () => {
  // El caso que reportó el owner: sueño con el float completo.
  expect(formatMetricValue(10.78333333333333)).toBe("10.78");
  // Enteros y valores que quedan redondos NO arrastran ".0" ni ".00".
  expect(formatMetricValue(7)).toBe("7");
  expect(formatMetricValue(7.0)).toBe("7");
  expect(formatMetricValue(80.0)).toBe("80");
  expect(formatMetricValue(19002)).toBe("19002");
  // Un decimal se conserva tal cual (no se rellena a dos).
  expect(formatMetricValue(7.5)).toBe("7.5");
  expect(formatMetricValue(0.1)).toBe("0.1");
  // Redondeo al segundo decimal (no truncado).
  expect(formatMetricValue(85.126)).toBe("85.13");
  expect(formatMetricValue(85.124)).toBe("85.12");
  // Negativos y cero.
  expect(formatMetricValue(0)).toBe("0");
  expect(formatMetricValue(-1.005)).toBe("-1");
});

test("formatMetricValue devuelve '—' para valores no finitos", () => {
  expect(formatMetricValue(NaN)).toBe("—");
  expect(formatMetricValue(Infinity)).toBe("—");
});

test("sleep_quality vive en SUBJECTIVE_METRIC_TYPES, no en ACTIVITY_METRIC_TYPES", () => {
  // Decisión del owner: la calidad de sueño es un rating 1-5 manual, su lugar es "Cómo te sentís".
  expect(SUBJECTIVE_METRIC_TYPES).toContain("sleep_quality");
  expect(ACTIVITY_METRIC_TYPES).not.toContain("sleep_quality");
});

test("TREND_METRIC_TYPES excluye steps_goal pero conserva las series a seguir", () => {
  expect(TREND_METRIC_TYPES).not.toContain("steps_goal");
  expect(TREND_METRIC_TYPES).toContain("weight_kg");
  expect(TREND_METRIC_TYPES).toContain("steps");
});

test("CURRENT_METRIC_TYPES sí incluye steps_goal (es un valor actual)", () => {
  expect(CURRENT_METRIC_TYPES).toContain("steps_goal");
});

test("metricsWithData filtra las métricas sin dato y preserva el orden", () => {
  const out = metricsWithData(["weight_kg", "steps", "stress"], {
    weight_kg: { value: 80, measuredAt: 1 },
    stress: { value: 3, measuredAt: 1 },
  });
  expect(out).toEqual(["weight_kg", "stress"]);
});
