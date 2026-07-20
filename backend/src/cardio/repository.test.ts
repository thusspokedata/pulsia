import { test, expect } from "bun:test";
import { secondWindow, insertCardio, getCardio, listCardio, insertCardioFitFile } from "./repository";
import type { CardioActivity } from "@pulsia/shared";

test("secondWindow: dos timestamps del mismo segundo comparten from", () => {
  expect(secondWindow(1784000000000).from).toBe(secondWindow(1784000000999).from);
});

test("secondWindow: un segundo de diferencia da distinto from", () => {
  expect(secondWindow(1784000000000).from).not.toBe(secondWindow(1784000001000).from);
  expect(secondWindow(1784000000999).from).not.toBe(secondWindow(1784000001000).from);
});

test("secondWindow: to es from + 999", () => {
  const w = secondWindow(1784000000123);
  expect(w.to).toBe(w.from + 999);
});

const AID = "22222222-2222-4222-8222-222222222222";
const UID = "33333333-3333-4333-8333-333333333333";

const fullActivity: CardioActivity = {
  id: AID, type: "run", startedAt: 1784000000000, durationMs: 1800000,
  distanceM: 5000, avgHr: 140, maxHr: 165, elevationGainM: 40,
  kcal: 300, kcalSource: "device", source: "fit", notes: "",
  totalCycles: 4200, trainingLoad: 55.5, trainingEffectAerobic: 3.2, trainingEffectAnaerobic: 1.1,
  avgCadence: 82, maxCadence: 95, avgFractionalCadence: 0.5, avgRespiration: 28, maxRespiration: 40,
  minRespiration: 12, metabolicKcal: 280, sportProfileName: "Running", tzOffsetMinutes: -180,
  samples: { t: [0, 1000], hr: [120, 125] },
  fitExtras: { zones: { secondsPerZone: [1, 2], highBoundary: [100, 120], maxHr: 190, restingHr: 50, thresholdHr: 160, calcType: "percent_hrr" } },
};

function fakeInsertDb() {
  const inserts: any[] = [];
  const db: any = { insert: () => ({ values: (v: any) => { inserts.push(v); return { onConflictDoNothing: async () => {} }; } }) };
  return { db, inserts };
}

test("insertCardio persiste las 13 métricas extendidas + samples + fitExtras", async () => {
  const { db, inserts } = fakeInsertDb();
  await insertCardio(db, UID, fullActivity);
  const v = inserts[0];
  expect(v.totalCycles).toBe(4200);
  expect(v.trainingLoad).toBe(55.5);
  expect(v.trainingEffectAerobic).toBe(3.2);
  expect(v.trainingEffectAnaerobic).toBe(1.1);
  expect(v.avgCadence).toBe(82);
  expect(v.maxCadence).toBe(95);
  expect(v.avgFractionalCadence).toBe(0.5);
  expect(v.avgRespiration).toBe(28);
  expect(v.maxRespiration).toBe(40);
  expect(v.minRespiration).toBe(12);
  expect(v.metabolicKcal).toBe(280);
  expect(v.sportProfileName).toBe("Running");
  expect(v.tzOffsetMinutes).toBe(-180);
  expect(v.samples).toEqual(fullActivity.samples);
  expect(v.fitExtras).toEqual(fullActivity.fitExtras);
});

test("insertCardio de una actividad manual (sin métricas extendidas) inserta null, no undefined", async () => {
  const { db, inserts } = fakeInsertDb();
  const manual: CardioActivity = {
    id: AID, type: "walk", startedAt: 1784000000000, durationMs: 600000,
    distanceM: 1000, avgHr: null, maxHr: null, elevationGainM: null,
    kcal: null, kcalSource: "estimate", source: "manual", notes: "",
  };
  await insertCardio(db, UID, manual);
  const v = inserts[0];
  expect(v.totalCycles).toBeNull();
  expect(v.trainingLoad).toBeNull();
  expect(v.sportProfileName).toBeNull();
  expect(v.tzOffsetMinutes).toBeNull();
  expect(v.samples).toBeNull();
  expect(v.fitExtras).toBeNull();
});

// Distingue la fila completa de la actividad (select() sin proyección, o con proyección sin
// `activityId`) del select({ activityId }) que getCardio hace contra cardio_fit_file para saber
// si hay archivo guardado. Sin archivo por default: los tests de getCardio que no lo mencionan no
// deben verse afectados por la nueva query.
function fakeSelectDb(row: any, fileRows: any[] = []) {
  return {
    select: (proj?: any) => ({
      from: () => ({ where: async () => (proj && "activityId" in proj ? fileRows : [row]) }),
    }),
  } as any;
}

// Captura las columnas que pide el select, para poder afirmar QUÉ trae el listado.
function fakeListDb(rows: any[], onSelect: (cols: any) => void) {
  return {
    select: (cols: any) => {
      onSelect(cols);
      return { from: () => ({ where: () => ({ orderBy: async () => rows }) }) };
    },
  } as any;
}

test("listCardio NO trae hrSeries/samples/fitExtras: las columnas pesadas son solo del detalle", async () => {
  let cols: any;
  const row = {
    id: AID, type: "run", startedAt: 1784000000000, durationMs: 1800000,
    distanceM: null, avgHr: null, maxHr: null, elevationGainM: null, kcal: null,
    kcalSource: "estimate", source: "fit", notes: "",
    totalCycles: 4200, trainingLoad: null, trainingEffectAerobic: null, trainingEffectAnaerobic: null,
    avgCadence: null, maxCadence: null, avgFractionalCadence: null, avgRespiration: null,
    maxRespiration: null, minRespiration: null, metabolicKcal: null,
    sportProfileName: null, tzOffsetMinutes: null,
  };
  const out = await listCardio(fakeListDb([row], (c) => { cols = c; }), UID);

  // El select pide columnas explícitas y ninguna de las pesadas.
  expect(cols).toBeDefined();
  expect(Object.keys(cols)).not.toContain("hrSeries");
  expect(Object.keys(cols)).not.toContain("samples");
  expect(Object.keys(cols)).not.toContain("fitExtras");
  // Y el resultado tampoco las inventa, pero sí conserva los escalares del listado.
  expect(out[0]).not.toHaveProperty("hrSeries");
  expect(out[0]).not.toHaveProperty("samples");
  expect(out[0]).not.toHaveProperty("fitExtras");
  expect(out[0].totalCycles).toBe(4200);
});

test("getCardio devuelve las métricas extendidas + samples + fitExtras de una fila del .FIT", async () => {
  const row = {
    id: AID, userId: UID, type: "run", startedAt: 1784000000000, durationMs: 1800000,
    distanceM: 5000, avgHr: 140, maxHr: 165, elevationGainM: 40, kcal: 300,
    kcalSource: "device", source: "fit", hrSeries: null, notes: "",
    totalCycles: 4200, trainingLoad: 55.5, trainingEffectAerobic: 3.2, trainingEffectAnaerobic: 1.1,
    avgCadence: 82, maxCadence: 95, avgFractionalCadence: 0.5, avgRespiration: 28, maxRespiration: 40,
    minRespiration: 12, metabolicKcal: 280, sportProfileName: "Running", tzOffsetMinutes: -180,
    samples: { t: [0, 1000], hr: [120, 125] },
    fitExtras: { zones: { secondsPerZone: [1, 2], highBoundary: [100, 120], maxHr: 190, restingHr: 50, thresholdHr: 160, calcType: "percent_hrr" } },
  };
  const result = await getCardio(fakeSelectDb(row), AID, UID);
  expect(result?.totalCycles).toBe(4200);
  expect(result?.avgCadence).toBe(82);
  expect(result?.sportProfileName).toBe("Running");
  expect(result?.tzOffsetMinutes).toBe(-180);
  expect(result?.samples).toEqual(row.samples);
  expect(result?.fitExtras).toEqual(row.fitExtras);
});

test("getCardio de una actividad manual vieja (columnas null, sin clave) omite sportProfileName/tzOffsetMinutes/samples/fitExtras", () => {
  const row = {
    id: AID, userId: UID, type: "walk", startedAt: 1784000000000, durationMs: 600000,
    distanceM: 1000, avgHr: null, maxHr: null, elevationGainM: null, kcal: null,
    kcalSource: "estimate", source: "manual", hrSeries: null, notes: "",
    totalCycles: null, trainingLoad: null, trainingEffectAerobic: null, trainingEffectAnaerobic: null,
    avgCadence: null, maxCadence: null, avgFractionalCadence: null, avgRespiration: null, maxRespiration: null,
    minRespiration: null, metabolicKcal: null, sportProfileName: null, tzOffsetMinutes: null,
    samples: null, fitExtras: null,
  };
  return getCardio(fakeSelectDb(row), AID, UID).then((result) => {
    expect(result).not.toHaveProperty("sportProfileName");
    expect(result).not.toHaveProperty("tzOffsetMinutes");
    expect(result).not.toHaveProperty("samples");
    expect(result).not.toHaveProperty("fitExtras");
    // Las nullable+optional sí quedan presentes, en null (son mediciones que pueden faltar).
    expect(result?.totalCycles).toBeNull();
  });
});

test("getCardio devuelve hasFitFile: true cuando hay un .FIT guardado", async () => {
  const row = {
    id: AID, userId: UID, type: "run", startedAt: 1784000000000, durationMs: 1800000,
    distanceM: 5000, avgHr: 140, maxHr: 165, elevationGainM: 40, kcal: 300,
    kcalSource: "device", source: "fit", hrSeries: null, notes: "",
    totalCycles: null, trainingLoad: null, trainingEffectAerobic: null, trainingEffectAnaerobic: null,
    avgCadence: null, maxCadence: null, avgFractionalCadence: null, avgRespiration: null, maxRespiration: null,
    minRespiration: null, metabolicKcal: null, sportProfileName: null, tzOffsetMinutes: null,
    samples: null, fitExtras: null,
  };
  const result = await getCardio(fakeSelectDb(row, [{ activityId: AID }]), AID, UID);
  expect(result?.hasFitFile).toBe(true);
});

test("getCardio devuelve hasFitFile: false cuando no hay .FIT guardado", async () => {
  const row = {
    id: AID, userId: UID, type: "run", startedAt: 1784000000000, durationMs: 1800000,
    distanceM: 5000, avgHr: 140, maxHr: 165, elevationGainM: 40, kcal: 300,
    kcalSource: "device", source: "fit", hrSeries: null, notes: "",
    totalCycles: null, trainingLoad: null, trainingEffectAerobic: null, trainingEffectAnaerobic: null,
    avgCadence: null, maxCadence: null, avgFractionalCadence: null, avgRespiration: null, maxRespiration: null,
    minRespiration: null, metabolicKcal: null, sportProfileName: null, tzOffsetMinutes: null,
    samples: null, fitExtras: null,
  };
  const result = await getCardio(fakeSelectDb(row, []), AID, UID);
  expect(result?.hasFitFile).toBe(false);
});

test("insertCardioFitFile inserta el binario con onConflictDoNothing (no explota en re-POST)", async () => {
  const { db, inserts } = fakeInsertDb();
  const bytes = Buffer.from("fake fit bytes");
  await insertCardioFitFile(db, AID, bytes, bytes.length, "a".repeat(64));
  expect(inserts[0]).toEqual({ activityId: AID, bytes, sizeBytes: bytes.length, sha256: "a".repeat(64) });
});
