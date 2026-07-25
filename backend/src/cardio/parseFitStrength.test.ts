import { test, expect } from "bun:test";
import { parseFitStrength } from "./parseFitStrength";

// Mensajes SINTÉTICOS (nunca el .FIT real del owner). Los category/exerciseName son del SDK de
// Garmin (formato público), pero los pesos, reps, nombres de workout son inventados.
// Estructura verificada contra un .FIT de fuerza real: la serie identifica su ejercicio por
// category[0] + categorySubtype[0], que casan con exerciseCategory + exerciseName del diccionario.
function fixture(over: any = {}) {
  return {
    exerciseTitleMesgs: [
      { messageIndex: 0, exerciseCategory: "shoulderPress", exerciseName: 8, wktStepName: "Overhead Press" },
      { messageIndex: 1, exerciseCategory: "plank", exerciseName: 43, wktStepName: "Front Plank" },
    ],
    setMesgs: [
      { setType: "active", category: ["shoulderPress", "shoulderPress", "shoulderPress"], categorySubtype: [8, 8, 8], repetitions: 10, weight: 20, duration: 30 },
      { setType: "rest", duration: 60 },
      { setType: "active", category: ["shoulderPress"], categorySubtype: [8], repetitions: 8, weight: 25, duration: 28 },
      { setType: "active", category: ["plank"], categorySubtype: [43], duration: 60 }, // isométrico: sin reps ni weight
    ],
    workoutMesgs: [{ wktName: "Test Push" }],
    ...over,
  };
}

test("agrupa las series activas por ejercicio y descarta los descansos", () => {
  const p = parseFitStrength(fixture());
  expect(p.exercises).toHaveLength(2);
  expect(p.exercises[0].category).toBe("shoulderPress");
  expect(p.exercises[0].sets).toHaveLength(2); // 2 activas de shoulderPress
  expect(p.exercises[1].category).toBe("plank");
  expect(p.exercises[1].sets).toHaveLength(1);
  expect(p.totalSets).toBe(3); // el "rest" NO cuenta
});

test("totalReps y totalVolumeKg suman solo las series con reps y peso", () => {
  // shoulderPress: 10×20 + 8×25 = 200 + 200 = 400; reps 10+8 = 18. El plank (isométrico) no aporta.
  const p = parseFitStrength(fixture());
  expect(p.totalReps).toBe(18);
  expect(p.totalVolumeKg).toBe(400);
});

test("un ejercicio isométrico (sin reps ni peso) da reps y weightKg null, no rompe", () => {
  const p = parseFitStrength(fixture());
  const plank = p.exercises[1];
  expect(plank.sets[0]).toEqual({ reps: null, weightKg: null, durationMs: 60000 });
});

test("un ejercicio de peso corporal (weight 0) conserva weightKg 0 y aporta volumen 0", () => {
  const p = parseFitStrength(fixture({
    exerciseTitleMesgs: [{ messageIndex: 0, exerciseCategory: "hipStability", exerciseName: 1, wktStepName: "Dead Bug" }],
    setMesgs: [{ setType: "active", category: ["hipStability"], categorySubtype: [1], repetitions: 12, weight: 0, duration: 40 }],
    workoutMesgs: [],
  }));
  expect(p.exercises[0].sets[0]).toEqual({ reps: 12, weightKg: 0, durationMs: 40000 });
  expect(p.totalReps).toBe(12);
  expect(p.totalVolumeKg).toBe(0); // 12 × 0
});

test("displayName sale del diccionario por (category, exerciseName)", () => {
  const p = parseFitStrength(fixture());
  expect(p.exercises[0].displayName).toBe("Overhead Press");
  expect(p.exercises[0].exerciseNameIndex).toBe(8);
});

test("sin entrada en el diccionario, displayName es null (no rompe)", () => {
  const p = parseFitStrength(fixture({
    exerciseTitleMesgs: [],
    setMesgs: [{ setType: "active", category: ["curl"], categorySubtype: [0], repetitions: 10, weight: 15, duration: 20 }],
    workoutMesgs: [],
  }));
  expect(p.exercises[0].displayName).toBeNull();
  expect(p.exercises[0].category).toBe("curl");
});

test("workoutName sale del wktName; sin plan es null", () => {
  expect(parseFitStrength(fixture()).workoutName).toBe("Test Push");
  expect(parseFitStrength(fixture({ workoutMesgs: [] })).workoutName).toBeNull();
});

test("la duración pasa de segundos a milisegundos", () => {
  const p = parseFitStrength(fixture());
  expect(p.exercises[0].sets[0].durationMs).toBe(30000); // 30 s
});
