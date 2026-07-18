import { test, expect } from "bun:test";
import { parseWeightCsv } from "./parseWeightCsv";

const HEADER = "Time,Weight,Change,BMI,Body Fat,Skeletal Muscle Mass,Bone Mass,Body Water,";
const SAMPLE = [
  HEADER,
  '" Jul 18, 2026",',
  "8:28 AM,73.2 kg,0.5 kg,23.4,22.1 %,30.5 kg,4.0 kg,56.9 %,",
  '" Jul 15, 2026",',
  "9:46 AM,73.3 kg,0.5 kg,23.4,22.3 %,30.5 kg,4.0 kg,56.7 %,",
  "8:40 AM,73.8 kg,0.3 kg,23.6,23.3 %,30.6 kg,4.0 kg,56.0 %,",
].join("\n");

test("parseWeightCsv no colapsa varias pesadas del mismo día", () => {
  const { rows } = parseWeightCsv(SAMPLE, -120);
  const jul15 = rows.filter((r) => r.date === "2026-07-15");
  expect(jul15).toHaveLength(2);
  expect(jul15[0].measuredAt).not.toBe(jul15[1].measuredAt);
});

test("parseWeightCsv usa localEpoch con el offset del cliente", () => {
  const { rows } = parseWeightCsv(SAMPLE, -120);
  const row = rows.find((r) => r.date === "2026-07-15" && r.label?.includes("09:46"));
  expect(row).toBeDefined();
  expect(row!.measuredAt).toBe(Date.UTC(2026, 6, 15, 7, 46, 0));
});

test("parseWeightCsv mapea las 5 métricas por nombre de columna, sin bmi", () => {
  const { rows } = parseWeightCsv(SAMPLE, -120);
  const row = rows.find((r) => r.date === "2026-07-15" && r.label?.includes("09:46"));
  expect(row).toBeDefined();
  const byType = Object.fromEntries(row!.entries.map((e) => [e.metricType, e.value]));
  expect(byType.weight_kg).toBe(73.3);
  expect(byType.body_fat_pct).toBe(22.3);
  expect(byType.skeletal_muscle_mass_kg).toBe(30.5);
  expect(byType.bone_mass_kg).toBe(4.0);
  expect(byType.body_water_pct).toBe(56.7);
  expect(row!.entries).toHaveLength(5);
  expect(row!.entries.some((e) => e.metricType === ("bmi" as never))).toBe(false);
});

test("parseWeightCsv salta una fila de medición sin fecha previa", () => {
  const csv = [
    HEADER,
    "8:28 AM,73.2 kg,0.5 kg,23.4,22.1 %,30.5 kg,4.0 kg,56.9 %,",
    '" Jul 18, 2026",',
    "9:00 AM,73.0 kg,0.2 kg,23.3,22.0 %,30.4 kg,4.0 kg,56.8 %,",
  ].join("\n");
  const { rows, skipped } = parseWeightCsv(csv, -120);
  expect(skipped.length).toBeGreaterThan(0);
  expect(rows.some((r) => r.date === "2026-07-18")).toBe(true);
});

test("parseWeightCsv tira error si sólo hay header", () => {
  expect(() => parseWeightCsv(HEADER, -120)).toThrow();
});
