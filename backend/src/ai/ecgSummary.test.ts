import { test, expect } from "bun:test";
import { buildEcgSummary } from "./ecgSummary";

test("resume veredictos por fecha (cronológico)", () => {
  const out = buildEcgSummary([
    { recordedAt: "2026-07-01", kardiaVerdict: "Posible FA" },
    { recordedAt: "2026-06-15", kardiaVerdict: "Normal" },
  ]);
  expect(out).toContain("ECG (Kardia)");
  expect(out.indexOf("Normal")).toBeLessThan(out.indexOf("Posible FA")); // 06-15 antes que 07-01
});
test("vacío si no hay ECGs", () => {
  expect(buildEcgSummary([])).toBe("");
});
test("ignora los que no tienen veredicto", () => {
  expect(buildEcgSummary([{ recordedAt: "2026-07-01", kardiaVerdict: null }])).toBe("");
});
