import { summarize } from "../src/session/summary";
import type { WorkoutSession, SessionExercise, SetLog } from "@pulsia/shared";

function setLog(over: Partial<SetLog> & { setNumber: number; startedAt: number }): SetLog {
  return {
    reps: 0,
    weightKg: null,
    rpe: null,
    endedAt: null,
    durationMs: null,
    repTimestamps: [],
    hrAvg: null,
    hrMax: null,
    skipped: false,
    ...over,
  };
}

function exercise(over: Partial<SessionExercise> & { catalogId: string; garminName: string; order: number }): SessionExercise {
  return {
    planned: { sets: 2, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90 },
    skipped: false,
    sets: [],
    note: "",
    substitutedFromId: null,
    ...over,
  };
}

function session(over: Partial<WorkoutSession> & { exercises: SessionExercise[] }): WorkoutSession {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    programId: "22222222-2222-4222-8222-222222222222",
    weekNumber: 1,
    dayLabel: "Día 1",
    location: "gym",
    startedAt: 1000,
    endedAt: null,
    totalDurationMs: null,
    notes: "",
    ...over,
  };
}

// Sesión de ejemplo: bench (chest) con 2 series terminadas + 1 planificada faltante,
// row (back) saltado con 0 series; total planned 4, done 2.
function sampleSession(): WorkoutSession {
  const bench = exercise({
    catalogId: "barbell_bench_press",
    garminName: "Barbell Bench Press",
    order: 0,
    planned: { sets: 3, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90 },
    sets: [
      // serie 1: startedAt 2000, endedAt 5000 (dur 3000), rest hasta próxima startedAt 6000 => 1000
      setLog({ setNumber: 1, startedAt: 2000, endedAt: 5000, durationMs: 3000, reps: 10, weightKg: 40, rpe: 8, hrAvg: 120, hrMax: 130 }),
      // serie 2: startedAt 6000, endedAt 10000 (dur 4000), es la última => rest null
      setLog({ setNumber: 2, startedAt: 6000, endedAt: 10000, durationMs: 4000, reps: 8, weightKg: 42, rpe: 9, hrAvg: 130, hrMax: 145 }),
    ],
  });
  const row = exercise({
    catalogId: "barbell_row",
    garminName: "Barbell Row",
    order: 1,
    planned: { sets: 1, reps: "10", targetLoad: "RPE 8", restSeconds: 60 },
    skipped: true,
    sets: [],
  });
  return session({
    exercises: [bench, row],
    startedAt: 1000,
    endedAt: 12000,
    totalDurationMs: 11000,
  });
}

test("completionPct baja cuando hay series faltantes/ejercicio saltado", () => {
  const s = summarize(sampleSession());
  // planned: bench 3 + row 1 = 4; done: 2 => 50%
  expect(s.totalPlannedSets).toBe(4);
  expect(s.totalDoneSets).toBe(2);
  expect(s.completionPct).toBe(50);
  expect(s.exercisesTotal).toBe(2);
  // bench doneSets 2 < planned 3 => no completo; row 0 < 1 => no completo
  expect(s.exercisesDone).toBe(0);
});

test("work/rest a partir de durationMs por serie y duración total", () => {
  const s = summarize(sampleSession());
  expect(s.durationMs).toBe(11000);
  expect(s.workMs).toBe(7000); // 3000 + 4000
  expect(s.restMs).toBe(4000); // 11000 - 7000
});

test("totalReps y totalVolumeKg (peso null cuenta 0)", () => {
  const s = summarize(sampleSession());
  expect(s.totalReps).toBe(18); // 10 + 8
  expect(s.totalVolumeKg).toBe(10 * 40 + 8 * 42); // 400 + 336 = 736
});

test("volumen de fila null cuando el peso es null (peso corporal)", () => {
  const bodyweight = exercise({
    catalogId: "incline_dip",
    garminName: "Incline Dip",
    order: 0,
    planned: { sets: 1, reps: "12", targetLoad: "peso corporal", restSeconds: 60 },
    sets: [setLog({ setNumber: 1, startedAt: 2000, endedAt: 4000, durationMs: 2000, reps: 12, weightKg: null })],
  });
  const s = summarize(session({ exercises: [bodyweight], endedAt: 5000, totalDurationMs: 4000 }));
  expect(s.totalReps).toBe(12);
  expect(s.totalVolumeKg).toBe(0);
  expect(s.perSet[0].volumeKg).toBeNull();
  expect(s.perExercise[0].volumeKg).toBe(0);
});

test("avgRpe y sessionLoadRpe (null si no hay rpe)", () => {
  const s = summarize(sampleSession());
  // rpe 8 y 9 => avg 8.5
  expect(s.avgRpe).toBe(8.5);
  // Σ reps*rpe = 10*8 + 8*9 = 80 + 72 = 152
  expect(s.sessionLoadRpe).toBe(152);
});

test("avgRpe/sessionLoadRpe null cuando no hay rpe", () => {
  const noRpe = exercise({
    catalogId: "barbell_bench_press",
    garminName: "Barbell Bench Press",
    order: 0,
    planned: { sets: 1, reps: "8", targetLoad: "x", restSeconds: 60 },
    sets: [setLog({ setNumber: 1, startedAt: 2000, endedAt: 4000, durationMs: 2000, reps: 8, weightKg: 40, rpe: null })],
  });
  const s = summarize(session({ exercises: [noRpe], endedAt: 5000, totalDurationMs: 4000 }));
  expect(s.avgRpe).toBeNull();
  expect(s.sessionLoadRpe).toBeNull();
});

test("avgHr redondeado y maxHr; null si no hay banda", () => {
  const s = summarize(sampleSession());
  expect(s.avgHr).toBe(125); // round((120+130)/2)
  expect(s.maxHr).toBe(145);

  const noHr = exercise({
    catalogId: "barbell_bench_press",
    garminName: "Barbell Bench Press",
    order: 0,
    planned: { sets: 1, reps: "8", targetLoad: "x", restSeconds: 60 },
    sets: [setLog({ setNumber: 1, startedAt: 2000, endedAt: 4000, durationMs: 2000, reps: 8, weightKg: 40 })],
  });
  const s2 = summarize(session({ exercises: [noHr], endedAt: 5000, totalDurationMs: 4000 }));
  expect(s2.avgHr).toBeNull();
  expect(s2.maxHr).toBeNull();
});

test("perExercise: avgHr/maxHr calculados por ejercicio (misma convención que a nivel sesión)", () => {
  const s = summarize(sampleSession());
  // bench: hrAvg 120,130 => avg 125; hrMax 130,145 => max 145
  expect(s.perExercise[0].avgHr).toBe(125);
  expect(s.perExercise[0].maxHr).toBe(145);
  // row: sin series terminadas => null
  expect(s.perExercise[1].avgHr).toBeNull();
  expect(s.perExercise[1].maxHr).toBeNull();
});

test("perExercise: avgHr/maxHr null cuando el ejercicio no tiene datos de FC", () => {
  const noHr = exercise({
    catalogId: "barbell_bench_press",
    garminName: "Barbell Bench Press",
    order: 0,
    planned: { sets: 1, reps: "8", targetLoad: "x", restSeconds: 60 },
    sets: [setLog({ setNumber: 1, startedAt: 2000, endedAt: 4000, durationMs: 2000, reps: 8, weightKg: 40 })],
  });
  const s = summarize(session({ exercises: [noHr], endedAt: 5000, totalDurationMs: 4000 }));
  expect(s.perExercise[0].avgHr).toBeNull();
  expect(s.perExercise[0].maxHr).toBeNull();
});

test("perExercise: con series mixtas (algunas sin FC) promedia/max solo las no-null", () => {
  const mixed = exercise({
    catalogId: "barbell_bench_press",
    garminName: "Barbell Bench Press",
    order: 0,
    planned: { sets: 3, reps: "8", targetLoad: "x", restSeconds: 60 },
    sets: [
      setLog({ setNumber: 1, startedAt: 2000, endedAt: 3000, durationMs: 1000, reps: 8, weightKg: 40, hrAvg: 100, hrMax: 110 }),
      setLog({ setNumber: 2, startedAt: 4000, endedAt: 5000, durationMs: 1000, reps: 8, weightKg: 40, hrAvg: null, hrMax: null }),
      setLog({ setNumber: 3, startedAt: 6000, endedAt: 7000, durationMs: 1000, reps: 8, weightKg: 40, hrAvg: 140, hrMax: 150 }),
    ],
  });
  const s = summarize(session({ exercises: [mixed], endedAt: 8000, totalDurationMs: 7000 }));
  // avg de (100,140) => 120; max de (110,150) => 150
  expect(s.perExercise[0].avgHr).toBe(120);
  expect(s.perExercise[0].maxHr).toBe(150);
});

test("perMuscle cuenta series por músculo primario vía catálogo, ordenado desc", () => {
  // bench (chest) 2 series terminadas; añadimos un row con 1 serie terminada (back).
  const bench = exercise({
    catalogId: "barbell_bench_press",
    garminName: "Barbell Bench Press",
    order: 0,
    planned: { sets: 2, reps: "8", targetLoad: "x", restSeconds: 60 },
    sets: [
      setLog({ setNumber: 1, startedAt: 2000, endedAt: 3000, durationMs: 1000, reps: 8, weightKg: 40 }),
      setLog({ setNumber: 2, startedAt: 4000, endedAt: 5000, durationMs: 1000, reps: 8, weightKg: 40 }),
    ],
  });
  const row = exercise({
    catalogId: "barbell_row",
    garminName: "Barbell Row",
    order: 1,
    planned: { sets: 1, reps: "10", targetLoad: "x", restSeconds: 60 },
    sets: [setLog({ setNumber: 1, startedAt: 6000, endedAt: 7000, durationMs: 1000, reps: 10, weightKg: 50 })],
  });
  const s = summarize(session({ exercises: [bench, row], endedAt: 8000, totalDurationMs: 7000 }));
  expect(s.perMuscle).toEqual([
    { muscle: "chest", sets: 2 },
    { muscle: "back", sets: 1 },
  ]);
});

test("primaryMuscles/secondaryMuscles: músculos distintos de series terminadas vía catálogo", () => {
  // bench: primary chest, secondary triceps/shoulders. row: primary back, secondary biceps.
  const bench = exercise({
    catalogId: "barbell_bench_press",
    garminName: "Barbell Bench Press",
    order: 0,
    planned: { sets: 1, reps: "8", targetLoad: "x", restSeconds: 60 },
    sets: [setLog({ setNumber: 1, startedAt: 2000, endedAt: 3000, durationMs: 1000, reps: 8, weightKg: 40 })],
  });
  const row = exercise({
    catalogId: "barbell_row",
    garminName: "Barbell Row",
    order: 1,
    planned: { sets: 1, reps: "10", targetLoad: "x", restSeconds: 60 },
    sets: [setLog({ setNumber: 1, startedAt: 4000, endedAt: 5000, durationMs: 1000, reps: 10, weightKg: 50 })],
  });
  const s = summarize(session({ exercises: [bench, row], endedAt: 6000, totalDurationMs: 5000 }));
  expect([...s.primaryMuscles].sort()).toEqual(["back", "chest"]);
  expect([...s.secondaryMuscles].sort()).toEqual(["biceps", "shoulders", "triceps"]);
});

test("primaryMuscles/secondaryMuscles ignoran ejercicios sin series terminadas o sin match", () => {
  // bench sin series terminadas (sets vacíos) + unknown con serie => nada.
  const benchNoDone = exercise({
    catalogId: "barbell_bench_press",
    garminName: "Barbell Bench Press",
    order: 0,
    planned: { sets: 1, reps: "8", targetLoad: "x", restSeconds: 60 },
    sets: [],
  });
  const unknown = exercise({
    catalogId: "no_existe_en_catalogo",
    garminName: "Mystery Move",
    order: 1,
    planned: { sets: 1, reps: "8", targetLoad: "x", restSeconds: 60 },
    sets: [setLog({ setNumber: 1, startedAt: 2000, endedAt: 3000, durationMs: 1000, reps: 8, weightKg: 40 })],
  });
  const s = summarize(session({ exercises: [benchNoDone, unknown], endedAt: 4000, totalDurationMs: 3000 }));
  expect(s.primaryMuscles).toEqual([]);
  expect(s.secondaryMuscles).toEqual([]);
});

test("perMuscle ignora ejercicios sin match en el catálogo", () => {
  const unknown = exercise({
    catalogId: "no_existe_en_catalogo",
    garminName: "Mystery Move",
    order: 0,
    planned: { sets: 1, reps: "8", targetLoad: "x", restSeconds: 60 },
    sets: [setLog({ setNumber: 1, startedAt: 2000, endedAt: 3000, durationMs: 1000, reps: 8, weightKg: 40 })],
  });
  const s = summarize(session({ exercises: [unknown], endedAt: 4000, totalDurationMs: 3000 }));
  expect(s.perMuscle).toEqual([]);
});

test("perSet ordenado por startedAt con rest = gap a la próxima serie (null en la última)", () => {
  const s = summarize(sampleSession());
  expect(s.perSet.map((r) => r.setNumber)).toEqual([1, 2]);
  // rest de serie 1 = próxima.startedAt (6000) - esta.endedAt (5000) = 1000
  expect(s.perSet[0].restMs).toBe(1000);
  expect(s.perSet[0].durationMs).toBe(3000);
  expect(s.perSet[0].exerciseName).toBe("Barbell Bench Press");
  expect(s.perSet[0].weightKg).toBe(40);
  expect(s.perSet[0].volumeKg).toBe(400);
  // última serie => rest null
  expect(s.perSet[1].restMs).toBeNull();
});

test("sesión sin series: totales en 0 y campos null donde aplica", () => {
  const empty = exercise({
    catalogId: "barbell_bench_press",
    garminName: "Barbell Bench Press",
    order: 0,
    planned: { sets: 3, reps: "8", targetLoad: "x", restSeconds: 60 },
    sets: [],
  });
  const s = summarize(session({ exercises: [empty], endedAt: 3000, totalDurationMs: 2000 }));
  expect(s.totalDoneSets).toBe(0);
  expect(s.totalReps).toBe(0);
  expect(s.totalVolumeKg).toBe(0);
  expect(s.workMs).toBe(0);
  expect(s.restMs).toBe(2000);
  expect(s.avgRpe).toBeNull();
  expect(s.sessionLoadRpe).toBeNull();
  expect(s.avgHr).toBeNull();
  expect(s.maxHr).toBeNull();
  expect(s.perMuscle).toEqual([]);
  expect(s.primaryMuscles).toEqual([]);
  expect(s.secondaryMuscles).toEqual([]);
  expect(s.perSet).toEqual([]);
  expect(s.completionPct).toBe(0); // done 0 / planned 3
});

test("plan de 0 series no crashea y da completionPct 0", () => {
  const zero = exercise({
    catalogId: "barbell_bench_press",
    garminName: "Barbell Bench Press",
    order: 0,
    planned: { sets: 0, reps: "", targetLoad: "", restSeconds: 0 },
    sets: [],
  });
  const s = summarize(session({ exercises: [zero], endedAt: 1000, totalDurationMs: 0 }));
  expect(s.totalPlannedSets).toBe(0);
  expect(s.completionPct).toBe(0);
});

test("hrSeries pasa igual cuando la sesión la tiene", () => {
  const series = [{ t: 0, bpm: 100 }, { t: 5000, bpm: 110 }];
  const s = summarize(session({ exercises: sampleSession().exercises, hrSeries: series, endedAt: 12000, totalDurationMs: 11000 }));
  expect(s.hrSeries).toEqual(series);
});

test("hrSeries null cuando la sesión no la tiene", () => {
  const s = summarize(sampleSession());
  expect(s.hrSeries).toBeNull();
});

test("durationMs fallback a endedAt-startedAt cuando totalDurationMs es null", () => {
  const ex = exercise({
    catalogId: "barbell_bench_press",
    garminName: "Barbell Bench Press",
    order: 0,
    planned: { sets: 1, reps: "8", targetLoad: "x", restSeconds: 60 },
    sets: [setLog({ setNumber: 1, startedAt: 2000, endedAt: 4000, durationMs: 2000, reps: 8, weightKg: 40 })],
  });
  const s = summarize(session({ exercises: [ex], startedAt: 1000, endedAt: 9000, totalDurationMs: null }));
  expect(s.durationMs).toBe(8000); // 9000 - 1000
});
