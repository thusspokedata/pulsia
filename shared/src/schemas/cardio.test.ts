import { test, expect } from "bun:test";
import { CardioActivitySchema, CardioHrPointSchema, CARDIO_TYPES, CARDIO_LABELS, CardioFitPreviewSchema } from "./cardio";
import { HrSeriesPointSchema } from "./session";

const valid = {
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  type: "walk" as const,
  startedAt: 1784000000000,
  durationMs: 1800_000,
  distanceM: 2500,
  avgHr: 105,
  maxHr: 128,
  elevationGainM: 30,
  kcal: 140,
  kcalSource: "device" as const,
  source: "fit" as const,
  notes: "",
};

test("acepta una actividad válida completa", () => {
  expect(CardioActivitySchema.safeParse(valid).success).toBe(true);
});

test("los opcionales son nullable y notes tiene default", () => {
  const r = CardioActivitySchema.safeParse({
    id: valid.id, type: "elliptical", startedAt: valid.startedAt, durationMs: 600_000,
    distanceM: null, avgHr: null, maxHr: null, elevationGainM: null, kcal: null,
    kcalSource: "estimate", source: "manual",
  });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.notes).toBe("");
});

test("rechaza un tipo de actividad desconocido", () => {
  expect(CardioActivitySchema.safeParse({ ...valid, type: "yoga" }).success).toBe(false);
});

test("rechaza duración <= 0", () => {
  expect(CardioActivitySchema.safeParse({ ...valid, durationMs: 0 }).success).toBe(false);
  expect(CardioActivitySchema.safeParse({ ...valid, durationMs: -1 }).success).toBe(false);
});

test("rechaza valores negativos en los campos >= 0", () => {
  for (const field of ["distanceM", "kcal", "avgHr", "maxHr", "elevationGainM"] as const) {
    expect(CardioActivitySchema.safeParse({ ...valid, [field]: -1 }).success).toBe(false);
  }
});

test("rechaza un kcalSource desconocido", () => {
  expect(CardioActivitySchema.safeParse({ ...valid, kcalSource: "guess" }).success).toBe(false);
});

test("rechaza un source desconocido", () => {
  expect(CardioActivitySchema.safeParse({ ...valid, source: "garmin" }).success).toBe(false);
});

test("rechaza un id que no es uuid", () => {
  expect(CardioActivitySchema.safeParse({ ...valid, id: "abc" }).success).toBe(false);
});

test("hrSeries acepta puntos bien formados", () => {
  const r = CardioActivitySchema.safeParse({ ...valid, hrSeries: [{ t: 0, bpm: 90 }, { t: 5000, bpm: 95 }] });
  expect(r.success).toBe(true);
});

test("hrSeries rechaza un punto mal formado", () => {
  expect(CardioActivitySchema.safeParse({ ...valid, hrSeries: [{ time: 0, hr: 90 }] }).success).toBe(false);
  expect(CardioActivitySchema.safeParse({ ...valid, hrSeries: [{ t: -1, bpm: 90 }] }).success).toBe(false);
});

// El spec declara la igualdad de shape con workout_session como invariante ("mismo shape → reusa
// el LineChart"), no como coincidencia: si alguien divergiera cardio, este test lo frena.
test("CardioHrPointSchema es el mismo schema que el de workout_session", () => {
  expect(CardioHrPointSchema).toBe(HrSeriesPointSchema);
});

test("CARDIO_LABELS cubre todos los tipos (exhaustividad)", () => {
  for (const t of CARDIO_TYPES) {
    expect(typeof CARDIO_LABELS[t]).toBe("string");
    expect(CARDIO_LABELS[t].length).toBeGreaterThan(0);
  }
  expect(Object.keys(CARDIO_LABELS).length).toBe(CARDIO_TYPES.length);
});

test("CardioFitPreviewSchema acepta un preview completo del reloj", () => {
  const preview = {
    type: "walk" as const,
    startedAt: 1_700_000_000_000,
    durationMs: 1_800_000,
    distanceM: 2500,
    avgHr: 110,
    maxHr: 130,
    elevationGainM: 12,
    kcal: 150,
    hrSeries: [{ t: 0, bpm: 108 }],
  };
  const parsed = CardioFitPreviewSchema.parse(preview);
  expect(parsed.type).toBe("walk");
  expect(parsed.kcal).toBe(150);
});

test("CardioFitPreviewSchema acepta campos device nulos y hrSeries ausente", () => {
  const parsed = CardioFitPreviewSchema.parse({
    type: "run",
    startedAt: 1_700_000_000_000,
    durationMs: 600_000,
    distanceM: null,
    avgHr: null,
    maxHr: null,
    elevationGainM: null,
    kcal: null,
  });
  expect(parsed.hrSeries).toBeUndefined();
  expect(parsed.kcal).toBeNull();
});
