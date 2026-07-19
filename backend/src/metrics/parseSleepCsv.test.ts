import { test, expect } from "bun:test";
import { parseSleepCsv, parseHmToHours } from "./parseSleepCsv";

const HEADER =
  "Sleep Score 7 Days,Score,Resting Heart Rate,Body Battery,Pulse Ox,Respiration,HRV Status,Quality,Duration,Sleep Need,Bedtime,Wake Time";
const SAMPLE = [
  HEADER,
  "2026-07-17,70,60,50,97.00,15.00,40,Good,7h 42min,8h 45min,11:52 PM,7:34 AM",
  "2026-07-16,55,62,30,96.50,16.00,40,Poor,6h 15min,8h 0min,12:40 AM,6:50 AM",
].join("\n");

test("parseHmToHours convierte 'Xh Ymin' a horas decimales", () => {
  expect(parseHmToHours("8h 0min")).toBe(8);
  expect(parseHmToHours("6h 17min")).toBeCloseTo(6 + 17 / 60, 5);
  expect(parseHmToHours("50min")).toBeCloseTo(50 / 60, 5);
  expect(parseHmToHours("10h")).toBe(10);
  expect(parseHmToHours("basura")).toBeNull();
});

test("parseSleepCsv mapea columnas por nombre de header", () => {
  const { rows } = parseSleepCsv(SAMPLE, 0);
  expect(rows).toHaveLength(2);
  const first = rows[0];
  expect(first.date).toBe("2026-07-17");
  const byType = Object.fromEntries(first.entries.map((e) => [e.metricType, e.value]));
  expect(byType.sleep_score).toBe(70);
  expect(byType.resting_hr).toBe(60);
  expect(byType.body_battery).toBe(50);
  expect(byType.pulse_ox).toBeCloseTo(97.0, 2);
  expect(byType.respiration).toBeCloseTo(15.0, 2);
  expect(byType.hrv).toBe(40);
  expect(byType.sleep_hours).toBeCloseTo(7 + 42 / 60, 5);
  expect(byType.sleep_need_hours).toBe(8.75);
  expect(byType.sleep_quality).toBeUndefined();
});

test("parseSleepCsv usa mediodía local (offset del cliente) como measuredAt", () => {
  const { rows } = parseSleepCsv(SAMPLE, -120);
  expect(rows[0].measuredAt).toBe(Date.UTC(2026, 6, 17, 10, 0, 0));
});

test("parseSleepCsv con offset 0 usa mediodía UTC (compatible hacia atrás)", () => {
  const { rows } = parseSleepCsv(SAMPLE, 0);
  expect(rows[0].measuredAt).toBe(Date.UTC(2026, 6, 17, 12, 0, 0));
});

test("parseSleepCsv salta una fila cuya col 0 no es fecha", () => {
  const csv = [
    HEADER,
    "no-fecha,70,60,50,96.00,15.50,40,Good,6h 30min,8h 0min,1:00 AM,8:00 AM",
    "2026-07-10,80,50,60,96,14,44,Good,7h 0min,8h 0min,1:00 AM,8:00 AM",
  ].join("\n");
  const { rows, skipped } = parseSleepCsv(csv, 0);
  expect(skipped.some((s) => /no es una fecha/i.test(s.reason))).toBe(true);
  expect(rows.some((r) => r.date === "2026-07-10")).toBe(true);
});

test("parseSleepCsv omite un valor fuera de rango pero conserva el resto de la fila", () => {
  const csv = [HEADER, "2026-07-09,80,50,60,5,14,44,Good,7h 0min,8h 0min,1:00 AM,8:00 AM"].join("\n");
  const { rows } = parseSleepCsv(csv, 0);
  const byType = Object.fromEntries(rows[0].entries.map((e) => [e.metricType, e.value]));
  expect(byType.pulse_ox).toBeUndefined();
  expect(byType.sleep_score).toBe(80);
});

test("parseSleepCsv tira error si no hay ninguna noche válida", () => {
  expect(() => parseSleepCsv(HEADER + "\n", 0)).toThrow();
});

test("parseSleepCsv salta una fecha de calendario inválida (no la normaliza)", () => {
  const csv = [
    HEADER,
    "2026-02-30,80,50,60,96,14,44,Good,7h 0min,8h 0min,1:00 AM,8:00 AM",
    "2026-07-10,80,50,60,96,14,44,Good,7h 0min,8h 0min,1:00 AM,8:00 AM",
  ].join("\n");
  const { rows, skipped } = parseSleepCsv(csv, -120);
  // La fecha inválida NO debe aparecer normalizada (p. ej. como 2 de marzo).
  expect(rows.some((r) => r.date === "2026-02-30")).toBe(false);
  expect(rows.every((r) => r.date !== "2026-03-02")).toBe(true);
  expect(skipped.some((s) => /fecha/i.test(s.reason))).toBe(true);
  // La fila válida siguiente sí entra (una fecha mala no tumba el resto).
  expect(rows.some((r) => r.date === "2026-07-10")).toBe(true);
});
