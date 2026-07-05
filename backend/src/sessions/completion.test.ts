import { test, expect } from "bun:test";
import { sessionCompletionPct } from "./completion";
import type { WorkoutSession } from "@pulsia/shared";

function ex(planned: number, doneSets: number) {
  return {
    catalogId: "x", garminName: "X", order: 0, note: "", substitutedFromId: null,
    planned: { sets: planned, reps: "8", targetLoad: "RPE 8", restSeconds: 60 }, skipped: false,
    sets: Array.from({ length: doneSets }, (_, i) => ({
      setNumber: i + 1, reps: 8, weightKg: 40, rpe: 8, startedAt: 1, endedAt: 2, durationMs: 1,
      repTimestamps: [], hrAvg: null, hrMax: null, skipped: false,
    })),
  };
}
function sess(exercises: any[]): WorkoutSession {
  return { id: "s", programId: "p", weekNumber: 1, dayLabel: "D", location: "gym",
    startedAt: 1, endedAt: 2, totalDurationMs: 1, notes: "", exercises } as WorkoutSession;
}

test("100% si todas las series planeadas están hechas", () => {
  expect(sessionCompletionPct(sess([ex(2, 2), ex(3, 3)]))).toBe(100);
});
test("50% con la mitad hechas", () => {
  expect(sessionCompletionPct(sess([ex(4, 2)]))).toBe(50);
});
test("0% sin series planeadas → 0 (sin división por cero)", () => {
  expect(sessionCompletionPct(sess([ex(0, 0)]))).toBe(0);
});
test("sólo cuenta series terminadas (endedAt != null)", () => {
  const s = sess([ex(2, 1)]);
  s.exercises[0].sets.push({ setNumber: 2, reps: 8, weightKg: null, rpe: null, startedAt: 3, endedAt: null, durationMs: null, repTimestamps: [], hrAvg: null, hrMax: null, skipped: false } as any);
  expect(sessionCompletionPct(s)).toBe(50);
});
