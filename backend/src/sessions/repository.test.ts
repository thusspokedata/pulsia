import { test, expect } from "bun:test";
import { rowsToSession } from "./repository";

// Fila anidada tal como la devuelve db.query.workoutSession.findFirst({ with: ... }).
const nestedRow = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "00000000-0000-0000-0000-000000000001",
  programId: "22222222-2222-4222-8222-222222222222",
  weekNumber: 1,
  dayLabel: "Día 1 - Pecho",
  location: "gym",
  startedAt: 1782900000000,
  endedAt: 1782903600000,
  totalDurationMs: 3600000,
  notes: "",
  createdAt: new Date(),
  updatedAt: new Date(),
  exercises: [
    {
      id: "ex-1", sessionId: "11111111-1111-4111-8111-111111111111",
      catalogId: "barbell_bench_press", garminName: "Barbell Bench Press",
      orderIndex: 0, planned: { sets: 4, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90 }, skipped: false,
      note: "no tengo barra", substitutedFromId: "band_assisted_pull_up",
      sets: [
        {
          id: "s-1", sessionExerciseId: "ex-1", setNumber: 1, reps: 10, weightKg: 40, rpe: 7,
          startedAt: 1782900000000, endedAt: 1782900045000, durationMs: 45000,
          repTimestamps: [0, 4000], hrAvg: null, hrMax: null, skipped: false,
        },
      ],
    },
  ],
};

test("rowsToSession convierte filas anidadas a WorkoutSession", () => {
  const s = rowsToSession(nestedRow as any);
  expect(s.id).toBe("11111111-1111-4111-8111-111111111111");
  expect(s.exercises[0].order).toBe(0); // orderIndex -> order
  expect(s.exercises[0].garminName).toBe("Barbell Bench Press");
  expect(s.exercises[0].sets[0].reps).toBe(10);
  // No filtra campos de DB al shape compartido:
  expect((s as any).createdAt).toBeUndefined();
  expect((s.exercises[0] as any).sessionId).toBeUndefined();
});

test("rowsToSession mapea note y substitutedFromId", () => {
  const s = rowsToSession(nestedRow as any);
  expect(s.exercises[0].note).toBe("no tengo barra");
  expect(s.exercises[0].substitutedFromId).toBe("band_assisted_pull_up");
});
