import { test, expect } from "bun:test";
import { parseWeightCsv } from "./parseWeightCsv";

const HEADER = "Time,Weight,Change,BMI,Body Fat,Skeletal Muscle Mass,Bone Mass,Body Water,";
const SAMPLE = [
  HEADER,
  '" Jul 18, 2026",',
  "8:28 AM,80.0 kg,0.5 kg,25.0,18.0 %,35.0 kg,3.5 kg,61.0 %,",
  '" Jul 15, 2026",',
  "9:46 AM,80.5 kg,0.5 kg,25.0,18.5 %,35.0 kg,3.5 kg,60.5 %,",
  "8:40 AM,81.0 kg,0.3 kg,25.2,19.5 %,35.5 kg,3.5 kg,60.0 %,",
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
  expect(byType.weight_kg).toBe(80.5);
  expect(byType.body_fat_pct).toBe(18.5);
  expect(byType.skeletal_muscle_mass_kg).toBe(35.0);
  expect(byType.bone_mass_kg).toBe(3.5);
  expect(byType.body_water_pct).toBe(60.5);
  expect(row!.entries).toHaveLength(5);
  expect(row!.entries.some((e) => e.metricType === ("bmi" as never))).toBe(false);
});

test("parseWeightCsv salta una fila de medición sin fecha previa", () => {
  const csv = [
    HEADER,
    "8:28 AM,80.0 kg,0.5 kg,25.0,18.0 %,35.0 kg,3.5 kg,61.0 %,",
    '" Jul 18, 2026",',
    "9:00 AM,79.8 kg,0.2 kg,25.1,17.5 %,34.8 kg,3.5 kg,60.7 %,",
  ].join("\n");
  const { rows, skipped } = parseWeightCsv(csv, -120);
  expect(skipped.length).toBeGreaterThan(0);
  expect(rows.some((r) => r.date === "2026-07-18")).toBe(true);
});

test("parseWeightCsv tira error si sólo hay header", () => {
  expect(() => parseWeightCsv(HEADER, -120)).toThrow();
});

test("parseWeightCsv parsea el formato regional D MMM YYYY", () => {
  const csv = [
    HEADER,
    '"16 Aug 2026",',
    "8:28 AM,80.0 kg,0.5 kg,25.0,18.0 %,35.0 kg,3.5 kg,61.0 %,",
  ].join("\n");
  const { rows } = parseWeightCsv(csv, -120);
  expect(rows).toHaveLength(1);
  expect(rows[0].date).toBe("2026-08-16");
  const byType = Object.fromEntries(rows[0].entries.map((e) => [e.metricType, e.value]));
  expect(byType.weight_kg).toBe(80.0);
  expect(byType.body_fat_pct).toBe(18.0);
});

test("parseWeightCsv parsea un CSV que mezcla ambos formatos de fecha", () => {
  const csv = [
    HEADER,
    '" Jul 18, 2026",',
    "8:28 AM,80.0 kg,0.5 kg,25.0,18.0 %,35.0 kg,3.5 kg,61.0 %,",
    '"16 Aug 2026",',
    "9:00 AM,79.8 kg,0.2 kg,25.1,17.5 %,34.8 kg,3.5 kg,60.7 %,",
  ].join("\n");
  const { rows } = parseWeightCsv(csv, -120);
  expect(rows.some((r) => r.date === "2026-07-18")).toBe(true);
  expect(rows.some((r) => r.date === "2026-08-16")).toBe(true);
});

test("parseWeightCsv parsea el formato regional completo (fecha D MMM + hora 24h)", () => {
  // Reproduce el export regional del owner: fecha día-primero + hora 24h sin AM/PM.
  // Sin el fix de 24h esto daba 0 rows y tiraba "No se pudo leer ninguna medición".
  const csv = [
    HEADER,
    '" 16 Aug 2026",',
    "10:54,74.1 kg,0.1 kg,23.7,23.9 %,30.7 kg,3.9 kg,55.6 %,",
    '" 14 Aug 2026",',
    "23:54,74.2 kg,0.8 kg,23.7,22.6 %,30.7 kg,4.0 kg,56.5 %,",
    "09:04,73.8 kg,1.0 kg,23.6,23.3 %,30.6 kg,4.0 kg,56.0 %,",
  ].join("\n");
  const { rows } = parseWeightCsv(csv, -120);
  expect(rows.length).toBe(3);

  const aug16 = rows.find((r) => r.date === "2026-08-16");
  expect(aug16).toBeDefined();
  expect(aug16!.label).toBe("2026-08-16 10:54");
  expect(aug16!.measuredAt).toBe(Date.UTC(2026, 7, 16, 8, 54, 0));
  const a16 = Object.fromEntries(aug16!.entries.map((e) => [e.metricType, e.value]));
  expect(a16.weight_kg).toBe(74.1);
  expect(a16.body_fat_pct).toBe(23.9);

  const aug14 = rows.filter((r) => r.date === "2026-08-14");
  expect(aug14).toHaveLength(2);
  const late = aug14.find((r) => r.label?.includes("23:54"));
  const early = aug14.find((r) => r.label?.includes("09:04"));
  expect(late).toBeDefined();
  expect(early).toBeDefined();
  expect(late!.measuredAt).toBe(Date.UTC(2026, 7, 14, 21, 54, 0));
  expect(early!.measuredAt).toBe(Date.UTC(2026, 7, 14, 7, 4, 0));
});

test("parseWeightCsv salta la fila-fecha DMY con mes inválido (Mes no reconocido)", () => {
  const csv = [
    HEADER,
    '"16 Xyz 2026",',
    "8:28 AM,80.0 kg,0.5 kg,25.0,18.0 %,35.0 kg,3.5 kg,61.0 %,",
    '"16 Aug 2026",',
    "9:00 AM,79.8 kg,0.2 kg,25.1,17.5 %,34.8 kg,3.5 kg,60.7 %,",
  ].join("\n");
  const { skipped } = parseWeightCsv(csv, -120);
  expect(skipped.some((s) => /Mes no reconocido: "16 Xyz 2026"/.test(s.reason))).toBe(true);
});
