import { test, expect } from "bun:test";
import { WorkoutSessionSchema, SessionExerciseSchema } from "./session";

const validSession = {
  id: "11111111-1111-4111-8111-111111111111",
  programId: "22222222-2222-4222-8222-222222222222",
  weekNumber: 1,
  dayLabel: "Día 1 - Pecho",
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
      planned: { sets: 4, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90 },
      skipped: false,
      sets: [
        {
          setNumber: 1, reps: 10, weightKg: 40, rpe: 7,
          startedAt: 1782900000000, endedAt: 1782900045000, durationMs: 45000,
          repTimestamps: [0, 4000, 8500], hrAvg: null, hrMax: null, skipped: false,
        },
      ],
    },
  ],
};

test("parsea una sesión válida", () => {
  const parsed = WorkoutSessionSchema.parse(validSession);
  expect(parsed.exercises[0].sets[0].reps).toBe(10);
  expect(parsed.exercises[0].order).toBe(0);
});

test("rechaza rpe fuera de 1..10", () => {
  const bad = structuredClone(validSession);
  bad.exercises[0].sets[0].rpe = 11;
  expect(WorkoutSessionSchema.safeParse(bad).success).toBe(false);
});

test("rechaza reps negativas", () => {
  const bad = structuredClone(validSession);
  bad.exercises[0].sets[0].reps = -1;
  expect(WorkoutSessionSchema.safeParse(bad).success).toBe(false);
});

test("rechaza location inválida", () => {
  const bad = structuredClone(validSession);
  (bad as any).location = "park";
  expect(WorkoutSessionSchema.safeParse(bad).success).toBe(false);
});

test("SessionExercise tiene note y substitutedFromId con defaults", () => {
  const parsed = SessionExerciseSchema.parse({
    catalogId: "x", garminName: "X", order: 0,
    planned: { sets: 2, reps: "8", targetLoad: "RPE 8", restSeconds: 60 },
    sets: [],
  });
  expect(parsed.note).toBe("");
  expect(parsed.substitutedFromId).toBe(null);
});
