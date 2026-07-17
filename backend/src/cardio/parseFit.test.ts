import { test, expect } from "bun:test";
import { parseFit, mapSport } from "./parseFit";
import { buildFitFixture } from "./fitFixture";

const START = 1_700_000_000_000;

test("parseFit extrae los campos device de una caminata", () => {
  const bytes = buildFitFixture({
    startTimeMs: START, sport: "walking", totalTimerTime: 1800,
    totalDistance: 2500, totalCalories: 150, avgHeartRate: 110, maxHeartRate: 130, totalAscent: 12,
    hr: [{ atMs: START, bpm: 108 }, { atMs: START + 60_000, bpm: 114 }],
  });
  const p = parseFit(Buffer.from(bytes));
  expect(p.type).toBe("walk");
  expect(p.startedAt).toBe(START);
  expect(p.durationMs).toBe(1_800_000);
  expect(p.distanceM).toBe(2500);
  expect(p.kcal).toBe(150);
  expect(p.avgHr).toBe(110);
  expect(p.maxHr).toBe(130);
  expect(p.elevationGainM).toBe(12);
  expect(p.hrSeries).toEqual([{ t: 0, bpm: 108 }, { t: 60_000, bpm: 114 }]);
});

test("parseFit deja null los campos device ausentes y omite hrSeries sin FC", () => {
  const bytes = buildFitFixture({
    startTimeMs: START, sport: "running", totalTimerTime: 600,
    totalDistance: null, totalCalories: null, avgHeartRate: null, maxHeartRate: null, totalAscent: null,
    hr: [],
  });
  const p = parseFit(Buffer.from(bytes));
  expect(p.type).toBe("run");
  expect(p.distanceM).toBeNull();
  expect(p.kcal).toBeNull();
  expect(p.hrSeries).toBeUndefined();
});

test("parseFit descarta records de FC anteriores al inicio (nunca t < 0)", () => {
  const bytes = buildFitFixture({
    startTimeMs: START, sport: "walking", totalTimerTime: 1800,
    hr: [{ atMs: START - 5000, bpm: 90 }, { atMs: START + 30_000, bpm: 120 }],
  });
  const p = parseFit(Buffer.from(bytes));
  expect(p.hrSeries).toEqual([{ t: 30_000, bpm: 120 }]);
  for (const point of p.hrSeries ?? []) expect(point.t).toBeGreaterThanOrEqual(0);
});

test("parseFit deriva durationMs de totalElapsedTime cuando no hay totalTimerTime", () => {
  const bytes = buildFitFixture({
    startTimeMs: START, sport: "running", totalTimerTime: null, totalElapsedTime: 900,
  });
  const p = parseFit(Buffer.from(bytes));
  expect(p.durationMs).toBe(900_000);
});

test("parseFit lanza si el archivo no tiene sesión", () => {
  const bytes = buildFitFixture({ withSession: false, hr: [{ atMs: START, bpm: 100 }] });
  expect(() => parseFit(Buffer.from(bytes))).toThrow(/sesión/i);
});

test("parseFit lanza con bytes que no son FIT", () => {
  expect(() => parseFit(Buffer.from("no soy un fit", "latin1"))).toThrow();
});

test("mapSport traduce los sports conocidos y cae en 'other'", () => {
  expect(mapSport("walking")).toBe("walk");
  expect(mapSport("hiking")).toBe("walk");
  expect(mapSport("running")).toBe("run");
  expect(mapSport("cycling")).toBe("bike");
  expect(mapSport("swimming")).toBe("swim");
  expect(mapSport("rowing")).toBe("rowing");
  expect(mapSport("fitness_equipment", "elliptical")).toBe("elliptical");
  expect(mapSport("generic")).toBe("other");
  expect(mapSport(undefined)).toBe("other");
});
