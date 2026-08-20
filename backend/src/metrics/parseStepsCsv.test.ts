import { test, expect } from "bun:test";
import { parseStepsCsv } from "./parseStepsCsv";

const HEADER = ",Actual,Goal";
const SAMPLE = [HEADER, "07/12/2026,5565,11790", "07/17/2026,19002,11170"].join("\n");

test("parseStepsCsv mapea Actual → steps y Goal → steps_goal", () => {
  const { rows } = parseStepsCsv(SAMPLE, -120);
  const row = rows.find((r) => r.date === "2026-07-17");
  expect(row).toBeDefined();
  const byType = Object.fromEntries(row!.entries.map((e) => [e.metricType, e.value]));
  expect(byType.steps).toBe(19002);
  expect(byType.steps_goal).toBe(11170);
});

test("parseStepsCsv usa mediodía local (offset del cliente)", () => {
  const { rows } = parseStepsCsv(SAMPLE, -120);
  const row = rows.find((r) => r.date === "2026-07-17");
  expect(row!.measuredAt).toBe(Date.UTC(2026, 6, 17, 10, 0, 0));
});

test("parseStepsCsv normaliza MM/DD/AAAA a fecha ISO", () => {
  const { rows } = parseStepsCsv(SAMPLE, -120);
  expect(rows.some((r) => r.date === "2026-07-17")).toBe(true);
});

test("parseStepsCsv salta una fecha de calendario inválida y sigue con la siguiente", () => {
  const csv = [HEADER, "13/45/2026,5565,11790", "07/17/2026,19002,11170"].join("\n");
  const { rows, skipped } = parseStepsCsv(csv, -120);
  expect(skipped.length).toBeGreaterThan(0);
  expect(rows.some((r) => r.date === "2026-07-17")).toBe(true);
});

test("parseStepsCsv tira error si sólo hay header", () => {
  expect(() => parseStepsCsv(HEADER, -120)).toThrow();
});

// IMP-2: el export regional del owner viene DD/MM/AAAA. Detectar la orientación por archivo.
test("parseStepsCsv lee DD/MM/AAAA cuando alguna fila tiene día > 12", () => {
  const csv = [HEADER, "14/08/2026,10000,11000", "20/08/2026,12000,11000"].join("\n");
  const { rows } = parseStepsCsv(csv, -120);
  expect(rows.some((r) => r.date === "2026-08-14")).toBe(true);
  expect(rows.some((r) => r.date === "2026-08-20")).toBe(true);
});

test("parseStepsCsv desambigua una fila ambigua con la orientación del archivo (DD/MM)", () => {
  // "05/08" es ambiguo por sí solo, pero "14/08" fuerza DD/MM en todo el archivo →
  // debe leerse como 5-ago, NO como 8-may (la corrupción silenciosa que reporta IMP-2).
  const csv = [HEADER, "05/08/2026,9000,11000", "14/08/2026,10000,11000"].join("\n");
  const { rows } = parseStepsCsv(csv, -120);
  expect(rows.some((r) => r.date === "2026-08-05")).toBe(true);
  expect(rows.some((r) => r.date === "2026-05-08")).toBe(false);
});

test("parseStepsCsv default día-primero cuando todo es ambiguo (formato regional del owner)", () => {
  const csv = [HEADER, "07/08/2026,9000,11000", "05/06/2026,8000,11000"].join("\n");
  const { rows } = parseStepsCsv(csv, -120);
  expect(rows.some((r) => r.date === "2026-08-07")).toBe(true);
  expect(rows.some((r) => r.date === "2026-06-05")).toBe(true);
});

test("parseStepsCsv tira error si el archivo mezcla orientaciones en conflicto", () => {
  // "13/07" exige DD/MM; "07/25" exige MM/DD → no se puede confiar en el archivo.
  const csv = [HEADER, "13/07/2026,9000,11000", "07/25/2026,10000,11000"].join("\n");
  expect(() => parseStepsCsv(csv, -120)).toThrow();
});
