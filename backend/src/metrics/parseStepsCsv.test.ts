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
