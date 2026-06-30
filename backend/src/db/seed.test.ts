import { test, expect } from "bun:test";
import { EXERCISE_CATALOG } from "@pulsia/shared";
import { buildCatalogRows } from "./seed";

test("convierte el catálogo a filas insertables", () => {
  const rows = buildCatalogRows();
  expect(rows.length).toBe(EXERCISE_CATALOG.length);
  const bench = rows.find((r) => r.id === "barbell_bench_press");
  expect(bench?.garminName).toBe("Barbell Bench Press");
  expect(Array.isArray(bench?.primaryMuscles)).toBe(true);
});
