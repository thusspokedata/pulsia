import { test, expect } from "bun:test";
import { lastWeightByExercise } from "./lastWeight";
import type { WorkoutSession } from "@pulsia/shared";

function setL(setNumber: number, weightKg: number | null) {
  return { setNumber, reps: 8, weightKg, rpe: 8, startedAt: 1, endedAt: 2, durationMs: 1, repTimestamps: [], hrAvg: null, hrMax: null, skipped: false };
}
function exL(catalogId: string, sets: any[]) {
  return { catalogId, garminName: catalogId, order: 0, note: "", substitutedFromId: null, planned: { sets: 3, reps: "8", targetLoad: "RPE 8", restSeconds: 60 }, skipped: false, sets };
}
function sessL(startedAt: number, exercises: any[]): WorkoutSession {
  return { id: `s${startedAt}`, programId: "p", weekNumber: 1, dayLabel: "D", location: "gym", startedAt, endedAt: startedAt + 1, totalDurationMs: 1, notes: "", exercises } as WorkoutSession;
}

test("toma el último peso (última serie con weightKg) de la sesión más reciente por ejercicio", () => {
  const sessions = [
    sessL(200, [exL("bench", [setL(1, 42), setL(2, 44)])]),
    sessL(100, [exL("bench", [setL(1, 40)]), exL("squat", [setL(1, 80)])]),
  ];
  const map = lastWeightByExercise(sessions);
  expect(map.bench).toBe(44);
  expect(map.squat).toBe(80);
});

test("ignora sets sin peso (weightKg null)", () => {
  const map = lastWeightByExercise([sessL(100, [exL("bench", [setL(1, null), setL(2, 50)])])]);
  expect(map.bench).toBe(50);
});

test("ejercicio sin ningún peso registrado no aparece", () => {
  const map = lastWeightByExercise([sessL(100, [exL("bench", [setL(1, null)])])]);
  expect(map.bench).toBeUndefined();
});
