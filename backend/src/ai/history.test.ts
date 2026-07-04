import { test, expect } from "bun:test";
import { buildTrainingHistorySummary } from "./history";
import type { WorkoutSession } from "@pulsia/shared";

function sess(over: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    programId: "22222222-2222-4222-8222-222222222222",
    weekNumber: 1,
    dayLabel: "Día 1: Pecho",
    location: "gym",
    startedAt: 1782900000000,
    endedAt: 1782903600000,
    totalDurationMs: 3600000,
    notes: "",
    exercises: [
      {
        catalogId: "barbell_bench_press",
        garminName: "Barbell Bench Press",
        order: 0,
        planned: { sets: 2, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90 },
        skipped: false,
        note: "",
        substitutedFromId: null,
        sets: [
          {
            setNumber: 1,
            reps: 10,
            weightKg: 40,
            rpe: 8,
            startedAt: 1,
            endedAt: 2,
            durationMs: 1,
            repTimestamps: [],
            hrAvg: null,
            hrMax: null,
            skipped: false,
          },
          {
            setNumber: 2,
            reps: 8,
            weightKg: 42,
            rpe: 9,
            startedAt: 3,
            endedAt: 4,
            durationMs: 1,
            repTimestamps: [],
            hrAvg: null,
            hrMax: null,
            skipped: false,
          },
        ],
      },
    ],
    ...over,
  } as WorkoutSession;
}

test("vacío → cadena vacía", () => {
  expect(buildTrainingHistorySummary([])).toBe("");
});

test("incluye día, sets logrados (peso×reps@RPE) y la nota de sesión", () => {
  const out = buildTrainingHistorySummary([sess({ notes: "me sentí fuerte" })]);
  expect(out).toContain("Día 1: Pecho");
  expect(out).toContain("40×10@8");
  expect(out).toContain("42×8@9");
  expect(out).toContain("me sentí fuerte");
});

test("incluye sustituciones y notas por-ejercicio", () => {
  const s = sess();
  s.exercises[0] = {
    ...s.exercises[0],
    catalogId: "dumbbell_row",
    substitutedFromId: "band_assisted_pull_up",
    note: "no tengo barra",
  };
  const out = buildTrainingHistorySummary([s]);
  expect(out).toContain("band_assisted_pull_up");
  expect(out).toContain("dumbbell_row");
  expect(out).toContain("no tengo barra");
});

test("sets con weightKg/rpe null no rompen", () => {
  const s = sess();
  s.exercises[0].sets[0] = { ...s.exercises[0].sets[0], weightKg: null, rpe: null };
  const out = buildTrainingHistorySummary([s]);
  expect(typeof out).toBe("string");
  expect(out.length).toBeGreaterThan(0);
});
