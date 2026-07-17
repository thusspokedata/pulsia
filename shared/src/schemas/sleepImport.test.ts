import { test, expect } from "bun:test";
import { SleepCsvPreviewSchema, SleepImportResultSchema } from "./sleepImport";

test("SleepCsvPreviewSchema acepta un preview válido", () => {
  const ok = SleepCsvPreviewSchema.safeParse({
    rows: [{ date: "2026-07-17", measuredAt: Date.UTC(2026, 6, 17, 12), entries: [{ metricType: "sleep_score", value: 85 }] }],
    skipped: [{ line: 3, reason: "sin datos" }],
  });
  expect(ok.success).toBe(true);
});

test("SleepCsvPreviewSchema rechaza una fila con fecha mal formada", () => {
  const bad = SleepCsvPreviewSchema.safeParse({
    rows: [{ date: "17/07/2026", measuredAt: 1, entries: [{ metricType: "sleep_score", value: 85 }] }],
    skipped: [],
  });
  expect(bad.success).toBe(false);
});

test("SleepCsvPreviewSchema rechaza una fila sin entradas", () => {
  const bad = SleepCsvPreviewSchema.safeParse({
    rows: [{ date: "2026-07-17", measuredAt: 1, entries: [] }],
    skipped: [],
  });
  expect(bad.success).toBe(false);
});

test("SleepImportResultSchema valida conteos + filas", () => {
  const ok = SleepImportResultSchema.safeParse({
    imported: 5, duplicates: 2,
    rows: [{ date: "2026-07-17", measuredAt: 1, entries: [{ metricType: "sleep_score", value: 85 }] }],
    skipped: [],
  });
  expect(ok.success).toBe(true);
});
