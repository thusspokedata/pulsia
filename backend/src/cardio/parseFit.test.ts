import { test, expect } from "bun:test";
import { parseFit, mapSport, buildSamples } from "./parseFit";
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

// ── Fase 1 (captura total) ──────────────────────────────────────────────────────────────────

test("parseFit extrae los 13 escalares nuevos de sesión + tzOffsetMinutes", () => {
  const bytes = buildFitFixture({ startTimeMs: START, hr: [{ atMs: START, bpm: 100 }] });
  const p = parseFit(Buffer.from(bytes));
  expect(p.totalCycles).toBe(500);
  expect(p.trainingLoad).toBeCloseTo(80, 0);
  expect(p.trainingEffectAerobic).toBeCloseTo(3.2, 1);
  expect(p.trainingEffectAnaerobic).toBeCloseTo(0.4, 1);
  expect(p.avgCadence).toBeCloseTo(70, 0);
  expect(p.maxCadence).toBeCloseTo(90, 0);
  expect(p.avgFractionalCadence).toBeCloseTo(0.5, 1);
  expect(p.avgRespiration).toBeCloseTo(28, 0);
  expect(p.maxRespiration).toBeCloseTo(34, 0);
  expect(p.minRespiration).toBeCloseTo(20, 0);
  expect(p.metabolicKcal).toBe(40);
  expect(p.sportProfileName).toBe("Test Sport");
  // localOffsetSec por defecto del fixture es +7200s = +120min.
  expect(p.tzOffsetMinutes).toBe(120);
});

test("parseFit arma samples columnar: t relativo al inicio, huecos null por canal, mismo largo en todos los canales", () => {
  const points = [0, 60_000, 120_000, 180_000, 240_000, 300_000].map((offset, i) => ({
    atMs: START + offset,
    bpm: 100 + i,
  }));
  const bytes = buildFitFixture({ startTimeMs: START, hr: points });
  const p = parseFit(Buffer.from(bytes));
  const s = p.samples;
  expect(s).toBeDefined();
  expect(s?.t).toEqual([0, 60_000, 120_000, 180_000, 240_000, 300_000]);
  expect(s?.hr).toEqual([100, 101, 102, 103, 104, 105]);
  // cadencia densa: presente en todos los records del fixture
  expect(s?.cad?.every((v) => typeof v === "number")).toBe(true);
  // respiración dispersa: el fixture la emite en i % 3 === 0
  expect(s?.resp).toEqual([28, null, null, 31, null, null]);
  // cycleLength16 disperso: el fixture lo emite en i % 4 === 0
  s?.cycleLen?.forEach((v, i) => {
    if (i % 4 === 0) expect(v).toBeCloseTo(1.1 + 0.01 * i, 2);
    else expect(v).toBeNull();
  });
  for (const channel of [s?.hr, s?.cad, s?.fracCad, s?.resp, s?.cycleLen]) {
    expect(channel).toHaveLength(s!.t.length);
  }
});

test("parseFit descarta records de samples anteriores al inicio (mismo criterio que hrSeries)", () => {
  const bytes = buildFitFixture({
    startTimeMs: START,
    hr: [{ atMs: START - 5000, bpm: 90 }, { atMs: START + 30_000, bpm: 120 }],
  });
  const p = parseFit(Buffer.from(bytes));
  expect(p.samples?.t).toEqual([30_000]);
  expect(p.samples?.hr).toEqual([120]);
  for (const t of p.samples?.t ?? []) expect(t).toBeGreaterThanOrEqual(0);
});

test("buildSamples guarda las claves numéricas sin nombre en `unknown`, crudas y sin interpretar", () => {
  // El Encoder del SDK no permite sintetizar campos desconocidos por nombre (ver fitFixture.ts),
  // así que esta cobertura arma los records a mano, tal como los expondría el decoder real con
  // `includeUnknownData: true`.
  const records = [
    { timestamp: new Date(START), heartRate: 100, "143": 60, "144": 100 },
    { timestamp: new Date(START + 60_000), heartRate: 101, "135": 5 },
    { timestamp: new Date(START + 120_000), heartRate: 102 },
  ];
  const samples = buildSamples(records, START);
  expect(samples?.t).toEqual([0, 60_000, 120_000]);
  expect(samples?.hr).toEqual([100, 101, 102]);
  expect(samples?.unknown).toEqual({
    "143": [60, null, null],
    "144": [100, null, null],
    "135": [null, 5, null],
  });
});

test("buildSamples descarta records anteriores a startedAt (t nunca negativo)", () => {
  const records = [
    { timestamp: new Date(START - 5000), heartRate: 90 },
    { timestamp: new Date(START + 30_000), heartRate: 95 },
  ];
  const samples = buildSamples(records, START);
  expect(samples?.t).toEqual([30_000]);
  expect(samples?.hr).toEqual([95]);
});

test("buildSamples devuelve undefined si no queda ningún record", () => {
  expect(buildSamples([], START)).toBeUndefined();
  expect(buildSamples([{ timestamp: new Date(START - 1000), heartRate: 90 }], START)).toBeUndefined();
});

test("parseFit arma fitExtras: zonas de la entrada referenceMesg==='session', atleta, dispositivos, vueltas y eventos", () => {
  const bytes = buildFitFixture({ startTimeMs: START, hr: [{ atMs: START, bpm: 100 }] });
  const p = parseFit(Buffer.from(bytes));
  expect(p.fitExtras?.zones).toEqual({
    secondsPerZone: [60, 120, 180, 20],
    highBoundary: [100, 130, 150, 180],
    maxHr: 180,
    restingHr: 55,
    thresholdHr: 150,
    calcType: "percentMaxHr",
  });
  expect(p.fitExtras?.athlete?.friendlyName).toBe("Test Atleta");
  expect(p.fitExtras?.devices).toHaveLength(2);
  expect(p.fitExtras?.laps).toHaveLength(1);
  expect(p.fitExtras?.events).toHaveLength(2);
});

test("parseFit: un .FIT sin ninguno de los mensajes opcionales sigue parseando (todo lo nuevo ausente, sin throw)", () => {
  const bytes = buildFitFixture({ startTimeMs: START, includeExtras: false, hr: [{ atMs: START, bpm: 100 }] });
  const p = parseFit(Buffer.from(bytes));
  expect(p.type).toBe("walk");
  expect(p.hrSeries).toEqual([{ t: 0, bpm: 100 }]);
  expect(p.totalCycles).toBeUndefined();
  expect(p.trainingLoad).toBeUndefined();
  expect(p.trainingEffectAerobic).toBeUndefined();
  expect(p.trainingEffectAnaerobic).toBeUndefined();
  expect(p.avgCadence).toBeUndefined();
  expect(p.maxCadence).toBeUndefined();
  expect(p.avgFractionalCadence).toBeUndefined();
  expect(p.avgRespiration).toBeUndefined();
  expect(p.maxRespiration).toBeUndefined();
  expect(p.minRespiration).toBeUndefined();
  expect(p.metabolicKcal).toBeUndefined();
  expect(p.sportProfileName).toBeUndefined();
  expect(p.tzOffsetMinutes).toBeUndefined();
  expect(p.fitExtras).toBeUndefined();
});
