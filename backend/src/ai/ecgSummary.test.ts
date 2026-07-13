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
test("incluye la FC media cuando está presente", () => {
  const out = buildEcgSummary([
    { recordedAt: "2026-06-15", kardiaVerdict: "Normal", avgHr: 72 },
    { recordedAt: "2026-07-01", kardiaVerdict: "Normal", avgHr: 81 },
  ]);
  expect(out).toMatch(/FC media 72 lpm/);
  expect(out).toMatch(/FC media 81 lpm/);
  // orden cronológico: la FC más vieja (72) antes que la más nueva (81)
  expect(out.indexOf("72")).toBeLessThan(out.indexOf("81"));
});
test("ordena por createdAt (fecha de subida), no por el texto libre de recordedAt", () => {
  const out = buildEcgSummary([
    { recordedAt: "Friday, 20 Jul 2026", kardiaVerdict: "Normal", avgHr: 90, createdAt: new Date("2026-07-20") },
    { recordedAt: "Monday, 6 Jul 2026", kardiaVerdict: "Normal", avgHr: 70, createdAt: new Date("2026-07-06") },
  ]);
  // 6 jul (FC 70) debe ir antes que 20 jul (FC 90), aunque "Friday" < "Monday" alfabéticamente
  expect(out.indexOf("70")).toBeLessThan(out.indexOf("90"));
});
test("omite la FC si es null/ausente (pero conserva el veredicto)", () => {
  const out = buildEcgSummary([{ recordedAt: "2026-07-01", kardiaVerdict: "Normal", avgHr: null }]);
  expect(out).toContain("Normal");
  expect(out).not.toContain("FC media");
});
test("vacío si no hay ECGs", () => {
  expect(buildEcgSummary([])).toBe("");
});
test("ignora los que no tienen veredicto", () => {
  expect(buildEcgSummary([{ recordedAt: "2026-07-01", kardiaVerdict: null }])).toBe("");
});
