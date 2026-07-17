import { test, expect } from "bun:test";
import { parseSleepCsv, parseHmToHours } from "./parseSleepCsv";

const HEADER =
  "Sleep Score 7 Days,Score,Resting Heart Rate,Body Battery,Pulse Ox,Respiration,HRV Status,Quality,Duration,Sleep Need,Bedtime,Wake Time";
const SAMPLE = [
  HEADER,
  "2026-07-17,85,52,69,95.54,13.86,45,Good,7h 1min,9h 0min,1:14 AM,8:23 AM",
  "2026-07-16,48,57,27,95.87,14.77,45,Poor,3h 28min,8h 30min,4:23 AM,7:52 AM",
].join("\n");

test("parseHmToHours convierte 'Xh Ymin' a horas decimales", () => {
  expect(parseHmToHours("9h 0min")).toBe(9);
  expect(parseHmToHours("7h 1min")).toBeCloseTo(7 + 1 / 60, 5);
  expect(parseHmToHours("45min")).toBeCloseTo(0.75, 5);
  expect(parseHmToHours("8h")).toBe(8);
  expect(parseHmToHours("basura")).toBeNull();
});

test("parseSleepCsv mapea columnas por nombre de header", () => {
  const { rows } = parseSleepCsv(SAMPLE);
  expect(rows).toHaveLength(2);
  const first = rows[0];
  expect(first.date).toBe("2026-07-17");
  const byType = Object.fromEntries(first.entries.map((e) => [e.metricType, e.value]));
  expect(byType.sleep_score).toBe(85);
  expect(byType.resting_hr).toBe(52);
  expect(byType.body_battery).toBe(69);
  expect(byType.pulse_ox).toBeCloseTo(95.54, 2);
  expect(byType.respiration).toBeCloseTo(13.86, 2);
  expect(byType.hrv).toBe(45);
  expect(byType.sleep_hours).toBeCloseTo(7 + 1 / 60, 5);
  expect(byType.sleep_need_hours).toBe(9);
  expect(byType.sleep_quality).toBeUndefined();
});

test("parseSleepCsv usa mediodía UTC como measuredAt", () => {
  const { rows } = parseSleepCsv(SAMPLE);
  expect(rows[0].measuredAt).toBe(Date.UTC(2026, 6, 17, 12, 0, 0));
});

test("parseSleepCsv salta una fila cuya col 0 no es fecha", () => {
  const csv = [
    HEADER,
    "no-fecha,85,52,69,95.5,13.8,45,Good,7h 0min,9h 0min,1:00 AM,8:00 AM",
    "2026-07-10,80,50,60,96,14,44,Good,7h 0min,8h 0min,1:00 AM,8:00 AM",
  ].join("\n");
  const { rows, skipped } = parseSleepCsv(csv);
  expect(skipped.some((s) => /no es una fecha/i.test(s.reason))).toBe(true);
  expect(rows.some((r) => r.date === "2026-07-10")).toBe(true);
});

test("parseSleepCsv omite un valor fuera de rango pero conserva el resto de la fila", () => {
  const csv = [HEADER, "2026-07-09,80,50,60,5,14,44,Good,7h 0min,8h 0min,1:00 AM,8:00 AM"].join("\n");
  const { rows } = parseSleepCsv(csv);
  const byType = Object.fromEntries(rows[0].entries.map((e) => [e.metricType, e.value]));
  expect(byType.pulse_ox).toBeUndefined();
  expect(byType.sleep_score).toBe(80);
});

test("parseSleepCsv tira error si no hay ninguna noche válida", () => {
  expect(() => parseSleepCsv(HEADER + "\n")).toThrow();
});
