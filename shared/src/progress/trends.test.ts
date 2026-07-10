import { expect, test } from "bun:test";
import type { WorkoutSession } from "../schemas/session";
import { estimate1RM, computePerformanceTrends } from "./trends";

test("estimate1RM usa Epley: w*(1+reps/30)", () => {
  expect(estimate1RM(100, 0)).toBeCloseTo(100, 5);
  expect(estimate1RM(100, 5)).toBeCloseTo(116.667, 2);
});

function session(id: string, startedAt: number, sets: { w: number | null; reps: number; skipped?: boolean }[]): WorkoutSession {
  return {
    id, programId: "00000000-0000-4000-8000-000000000000", weekNumber: 1,
    dayLabel: "Día 1", location: "gym", startedAt, endedAt: startedAt + 1000,
    totalDurationMs: 1000, notes: "",
    exercises: [{
      catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", order: 0,
      planned: { sets: sets.length, reps: "5", targetLoad: "", restSeconds: 90 },
      skipped: false, note: "", substitutedFromId: null,
      sets: sets.map((s, i) => ({
        setNumber: i + 1, reps: s.reps, weightKg: s.w, rpe: null,
        startedAt, endedAt: startedAt + 500, durationMs: 500, repTimestamps: [],
        hrAvg: null, hrMax: null, skipped: s.skipped ?? false,
      })),
    }],
  };
}

test("computePerformanceTrends: 1RMe por sesión, volumen, PRs; excluye bodyweight/skipped", () => {
  const s1 = session("11111111-1111-4111-8111-111111111111", 1000, [{ w: 80, reps: 5 }, { w: 0, reps: 10 }]);
  const s2 = session("22222222-2222-4222-8222-222222222222", 2000, [{ w: 90, reps: 3 }, { w: 100, reps: 1, skipped: true }]);
  const t = computePerformanceTrends([s2, s1]); // desordenadas a propósito

  const bench = t.perExercise.find((e) => e.catalogId === "barbell_bench_press")!;
  expect(bench.points.map((p) => p.measuredAt)).toEqual([1000, 2000]); // ordenadas asc
  expect(bench.points[0].topSetWeightKg).toBe(80); // el set de w:0 no cuenta
  expect(bench.points[0].est1RM).toBeCloseTo(estimate1RM(80, 5), 3);
  expect(bench.points[1].topSetWeightKg).toBe(90); // el skipped no cuenta

  expect(t.volumeSeries).toEqual([
    { measuredAt: 1000, volumeKg: 400 }, // 80*5 (bodyweight cuenta 0)
    { measuredAt: 2000, volumeKg: 270 }, // 90*3
  ]);

  const pr = t.prs.find((p) => p.catalogId === "barbell_bench_press")!;
  expect(pr.heaviestKg).toBe(90);
});

test("computePerformanceTrends: perExercise solo incluye ejercicios con >=2 puntos", () => {
  const s1 = session("11111111-1111-4111-8111-111111111111", 1000, [{ w: 80, reps: 5 }]);
  const t = computePerformanceTrends([s1]);
  expect(t.perExercise.length).toBe(0); // un solo punto → sin tendencia
});

test("computePerformanceTrends: heaviestKg toma el peso máximo real, no el del mejor 1RMe", () => {
  // 120x1 → est1RM 124; 100x8 → est1RM 126.67 (gana el 1RMe pero no es el más pesado)
  const s1 = session("11111111-1111-4111-8111-111111111111", 1000, [{ w: 120, reps: 1 }, { w: 100, reps: 8 }]);
  const t = computePerformanceTrends([s1]);
  const pr = t.prs.find((p) => p.catalogId === "barbell_bench_press")!;
  expect(pr.heaviestKg).toBe(120);
  expect(pr.best1RM).toBeCloseTo(estimate1RM(100, 8), 3);
});

test("computePerformanceTrends: perExercise desempata por recencia cuando el largo es igual", () => {
  function makeSession(id: string, startedAt: number, catalogId: string): WorkoutSession {
    const base = session(id, startedAt, [{ w: 50, reps: 5 }]);
    base.exercises[0].catalogId = catalogId;
    base.exercises[0].garminName = catalogId;
    return base;
  }
  // Ambos ejercicios tienen 2 puntos; "reciente" tiene su último punto más tarde.
  const t = computePerformanceTrends([
    makeSession("11111111-1111-4111-8111-111111111111", 1000, "viejo"),
    makeSession("22222222-2222-4222-8222-222222222222", 2000, "viejo"),
    makeSession("33333333-3333-4333-8333-333333333333", 1500, "reciente"),
    makeSession("44444444-4444-4444-8444-444444444444", 3000, "reciente"),
  ]);
  expect(t.perExercise.map((e) => e.catalogId)).toEqual(["reciente", "viejo"]);
});
