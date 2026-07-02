import { startSession, tapRep, endSet, editSet, skipExercise, finishSession } from "../src/session/engine";
import type { Program } from "@pulsia/shared";

const program = {
  name: "Plan",
  weeks: [{
    weekNumber: 1,
    workouts: [{
      dayLabel: "Día 1", location: "gym", focus: "chest",
      exercises: [
        { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 3, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90, notes: "" },
        { catalogId: "incline_dip", garminName: "Incline Dip", sets: 3, reps: "12", targetLoad: "peso corporal", restSeconds: 60, notes: "" },
      ],
    }],
  }],
} as Program;

const ID = "11111111-1111-4111-8111-111111111111";
const PID = "22222222-2222-4222-8222-222222222222";
const start = () => startSession({ program, programId: PID, weekNumber: 1, dayLabel: "Día 1", location: "gym", id: ID, nowMs: 1000 });

test("startSession arma la sesión con planned y sin series", () => {
  const s = start();
  expect(s.id).toBe(ID);
  expect(s.startedAt).toBe(1000);
  expect(s.exercises.length).toBe(2);
  expect(s.exercises[0].planned.sets).toBe(3);
  expect(s.exercises[0].sets).toEqual([]);
  expect(s.exercises[0].order).toBe(0);
});

test("tapRep agrega un timestamp relativo al inicio de la serie", () => {
  let s = start();
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 2000 });
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 6000 });
  const set = s.exercises[0].sets[0];
  expect(set.reps).toBe(2);
  expect(set.repTimestamps).toEqual([0, 4000]);
  expect(set.startedAt).toBe(2000);
});

test("endSet cierra la serie con peso/rpe y durationMs", () => {
  let s = start();
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 2000 });
  s = endSet(s, { exerciseOrder: 0, weightKg: 40, rpe: 8, nowMs: 2045000 });
  const set = s.exercises[0].sets[0];
  expect(set.weightKg).toBe(40);
  expect(set.rpe).toBe(8);
  expect(set.endedAt).toBe(2045000);
  expect(set.durationMs).toBe(2043000);
});

test("editSet corrige reps/peso de una serie ya cargada", () => {
  let s = start();
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 2000 });
  s = endSet(s, { exerciseOrder: 0, weightKg: 40, rpe: 8, nowMs: 5000 });
  s = editSet(s, { exerciseOrder: 0, setNumber: 1, reps: 9, weightKg: 42.5 });
  const set = s.exercises[0].sets[0];
  expect(set.reps).toBe(9);
  expect(set.weightKg).toBe(42.5);
});

test("editSet distingue null (borra) de undefined (deja igual)", () => {
  let s = start();
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 2000 });
  s = endSet(s, { exerciseOrder: 0, weightKg: 40, rpe: 8, nowMs: 5000 });
  // null borra el peso; rpe omitido queda igual
  s = editSet(s, { exerciseOrder: 0, setNumber: 1, weightKg: null });
  expect(s.exercises[0].sets[0].weightKg).toBeNull();
  expect(s.exercises[0].sets[0].rpe).toBe(8);
  // omitir weightKg no lo toca (sigue null)
  s = editSet(s, { exerciseOrder: 0, setNumber: 1, reps: 7 });
  expect(s.exercises[0].sets[0].weightKg).toBeNull();
  expect(s.exercises[0].sets[0].reps).toBe(7);
});

test("skipExercise marca el ejercicio como saltado", () => {
  let s = start();
  s = skipExercise(s, { exerciseOrder: 1 });
  expect(s.exercises[1].skipped).toBe(true);
});

test("finishSession setea endedAt y totalDurationMs", () => {
  let s = start();
  s = finishSession(s, { nowMs: 3601000 });
  expect(s.endedAt).toBe(3601000);
  expect(s.totalDurationMs).toBe(3600000);
});
