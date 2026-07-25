import { test, expect } from "bun:test";
import { fitStrengthToSession } from "./fitStrengthToSession";
import type { FitStrengthPreview } from "./parseFitStrength";
import { WorkoutSessionSchema } from "@pulsia/shared";

const preview: FitStrengthPreview = {
  workoutName: "Push A",
  exercises: [
    { category: "shoulderPress", exerciseNameIndex: 8, displayName: "Dumbbell Push Press",
      sets: [ { startedAt: 1000, reps: 8, weightKg: 20, durationMs: 30000 }, { startedAt: 100000, reps: 8, weightKg: 22, durationMs: 28000 } ] },
    { category: "plank", exerciseNameIndex: 43, displayName: "Plank",
      sets: [ { startedAt: 128000, reps: null, weightKg: null, durationMs: 60000 } ] }, // isométrico
  ],
  totalSets: 3, totalReps: 16, totalVolumeKg: 336,
};

const meta = { id: "33333333-3333-4333-8333-333333333333", startedAt: 1000, endedAt: 5000, totalDurationMs: 4000, location: "home" as const };

// FC sintética: 2 samples dentro de la serie 1 [1000, 31000], uno fuera de toda serie.
const hrSamples = [
  { tMs: 1000, bpm: 100 }, { tMs: 1015, bpm: 110 },
  { tMs: 200000, bpm: 150 },
];

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
      sets: [{ startedAt: 0, reps: 10, weightKg: 15, durationMs: 20000 }] }],
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

test("las series tienen startedAt/endedAt reales y quedan 'terminadas' (endedAt != null)", () => {
  const s = fitStrengthToSession(preview, meta, hrSamples);
  const set0 = s.exercises[0].sets[0];
  expect(set0.startedAt).toBe(preview.exercises[0].sets[0].startedAt);
  expect(set0.endedAt).toBe(set0.startedAt! + set0.durationMs!);
  expect(set0.endedAt).not.toBeNull(); // la corrección de la causa raíz
});

test("hrAvg/hrMax por serie salen de los samples de su intervalo", () => {
  const s = fitStrengthToSession(preview, meta, hrSamples);
  const set0 = s.exercises[0].sets[0]; // serie 1: startedAt 1000, dur 30000 → [1000,31000], samples 100 y 110
  expect(set0.hrAvg).toBe(105);
  expect(set0.hrMax).toBe(110);
});

test("sin hrSamples, hrAvg/hrMax son null y hrSeries se omite (import sin banda)", () => {
  const s = fitStrengthToSession(preview, meta, []);
  expect(s.exercises[0].sets[0].hrAvg).toBeNull();
  expect(s.hrSeries).toBeUndefined();
});

test("hrSeries se puebla (downsampleada, relativa a startedAt de la sesión)", () => {
  const s = fitStrengthToSession(preview, { ...meta, startedAt: 1000 }, hrSamples);
  expect(s.hrSeries).toBeDefined();
  expect(s.hrSeries!.length).toBeGreaterThan(0);
  expect(s.hrSeries![0].t).toBe(0); // el primer bucket relativo al inicio
});

// Costura (lado backend): el transformador REAL —no un objeto armado a mano— debe producir una
// WorkoutSession "lista para resumen": es lo que summarize (mobile/src/session/summary.ts) necesita
// para no mostrar todo en 0. summarize solo cuenta las series con endedAt != null (doneSetsOf) y saca
// reps/volumen de ahí; la FC media/curva vienen de hrAvg y hrSeries. Este test cierra el hueco que
// dejaba tener la mitad de la costura (summarize) probada solo contra un WorkoutSession hecho a mano.
test("la costura: fitStrengthToSession produce una sesión con reps/volumen/trabajo/FC no vacíos", () => {
  const s = fitStrengthToSession(preview, meta, hrSamples);
  const done = s.exercises.flatMap((ex) => ex.sets).filter((set) => set.endedAt != null);
  expect(done.length).toBeGreaterThan(0); // hay series "terminadas" que summarize va a contar
  const totalReps = done.reduce((acc, set) => acc + (set.reps ?? 0), 0);
  const totalVolumeKg = done.reduce((acc, set) => acc + (set.reps ?? 0) * (set.weightKg ?? 0), 0);
  const workMs = done.reduce((acc, set) => acc + (set.durationMs ?? 0), 0);
  expect(totalReps).toBeGreaterThan(0);       // 8 + 8 (el plank aporta 0), no 0
  expect(totalVolumeKg).toBeGreaterThan(0);   // 8*20 + 8*22, no 0
  expect(workMs).toBeGreaterThan(0);          // trabajo real, no todo descanso
  expect(done.some((set) => set.hrAvg != null)).toBe(true); // FC por serie
  expect(s.hrSeries && s.hrSeries.length > 0).toBe(true);   // curva de FC de la sesión
});
