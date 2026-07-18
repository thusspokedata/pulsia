import { test, expect } from "bun:test";
import { MetricCsvPreviewSchema, MetricImportResultSchema, MetricCsvRowSchema } from "./metricImport";

test("MetricCsvPreviewSchema acepta un preview válido", () => {
  const ok = MetricCsvPreviewSchema.safeParse({
    rows: [{ date: "2026-07-17", measuredAt: Date.UTC(2026, 6, 17, 12), entries: [{ metricType: "sleep_score", value: 85 }] }],
    skipped: [{ line: 3, reason: "sin datos" }],
  });
  expect(ok.success).toBe(true);
});

test("MetricCsvPreviewSchema rechaza una fila con fecha mal formada", () => {
  const bad = MetricCsvPreviewSchema.safeParse({
    rows: [{ date: "17/07/2026", measuredAt: 1, entries: [{ metricType: "sleep_score", value: 85 }] }],
    skipped: [],
  });
  expect(bad.success).toBe(false);
});

test("MetricCsvPreviewSchema rechaza una fila sin entradas", () => {
  const bad = MetricCsvPreviewSchema.safeParse({
    rows: [{ date: "2026-07-17", measuredAt: 1, entries: [] }],
    skipped: [],
  });
  expect(bad.success).toBe(false);
});

test("MetricImportResultSchema valida conteos + filas", () => {
  const ok = MetricImportResultSchema.safeParse({
    imported: 5, duplicates: 2,
    rows: [{ date: "2026-07-17", measuredAt: 1, entries: [{ metricType: "sleep_score", value: 85 }] }],
    skipped: [],
  });
  expect(ok.success).toBe(true);
});

test("MetricCsvRowSchema acepta un label opcional", () => {
  const withLabel = MetricCsvRowSchema.safeParse({
    date: "2026-07-17", measuredAt: 1,
    entries: [{ metricType: "weight_kg", value: 80 }],
    label: "08:15",
  });
  expect(withLabel.success).toBe(true);

  const withoutLabel = MetricCsvRowSchema.safeParse({
    date: "2026-07-17", measuredAt: 1,
    entries: [{ metricType: "weight_kg", value: 80 }],
  });
  expect(withoutLabel.success).toBe(true);
});
