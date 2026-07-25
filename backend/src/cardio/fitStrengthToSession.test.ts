import { test, expect } from "bun:test";
import { fitStrengthToSession } from "./fitStrengthToSession";
import type { FitStrengthPreview } from "./parseFitStrength";
import { WorkoutSessionSchema } from "@pulsia/shared";

const preview: FitStrengthPreview = {
  workoutName: "Push A",
  exercises: [
    { category: "shoulderPress", exerciseNameIndex: 8, displayName: "Dumbbell Push Press",
      sets: [ { reps: 8, weightKg: 20, durationMs: 30000 }, { reps: 8, weightKg: 22, durationMs: 28000 } ] },
    { category: "plank", exerciseNameIndex: 43, displayName: "Plank",
      sets: [ { reps: null, weightKg: null, durationMs: 60000 } ] }, // isométrico
  ],
  totalSets: 3, totalReps: 16, totalVolumeKg: 336,
};

const meta = { id: "33333333-3333-4333-8333-333333333333", startedAt: 1000, endedAt: 5000, totalDurationMs: 4000, location: "home" as const };

test("arma una WorkoutSession sin programa desde el preview", () => {
  const s = fitStrengthToSession(preview, meta);
  expect(s.programId).toBeNull();
  expect(s.weekNumber).toBeNull();
  expect(s.dayLabel).toBe("Push A"); // el workoutName pasa a dayLabel
  expect(s.id).toBe(meta.id);
  expect(s.location).toBe("home");
  expect(s.exercises).toHaveLength(2);
});

test("resuelve el catalogId con mapFitExercise; el mapeado usa el id real", () => {
  const s = fitStrengthToSession(preview, meta);
  // shoulderPress#8 → dumbbell_push_press (está en el catálogo)
  expect(s.exercises[0].catalogId).toBe("dumbbell_push_press");
  expect(s.exercises[0].garminName).toBe("Dumbbell Push Press");
});

test("un ejercicio no mapeable usa fit:<category> como id sintético", () => {
  const p2: FitStrengthPreview = {
    workoutName: null, totalSets: 1, totalReps: 10, totalVolumeKg: 150,
    exercises: [{ category: "noSuch", exerciseNameIndex: 99999, displayName: null,
      sets: [{ reps: 10, weightKg: 15, durationMs: 20000 }] }],
  };
  const s = fitStrengthToSession(p2, meta);
  expect(s.exercises[0].catalogId).toBe("fit:noSuch");
  expect(s.exercises[0].garminName).toBe("noSuch"); // sin displayName, cae al category
  expect(s.dayLabel).toBe("Entreno importado"); // sin workoutName, fallback
});

test("los isométricos van con reps 0 (SetLogSchema exige reps>=0, no null)", () => {
  const s = fitStrengthToSession(preview, meta);
  const plankSet = s.exercises[1].sets[0];
  expect(plankSet.reps).toBe(0);
  expect(plankSet.weightKg).toBeNull();
  expect(plankSet.durationMs).toBe(60000);
});

test("el resultado valida contra WorkoutSessionSchema", () => {
  expect(WorkoutSessionSchema.safeParse(fitStrengthToSession(preview, meta)).success).toBe(true);
});
