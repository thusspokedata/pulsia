import { startSession, tapRep, adjustReps, endSet, editSet, skipExercise, finishSession, discardOpenSets, closeOpenSets, setNotes } from "../src/session/engine";
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

test("startSession inicializa note='' y substitutedFromId=null por ejercicio", () => {
  const s = start();
  expect(s.exercises[0].note).toBe("");
  expect(s.exercises[0].substitutedFromId).toBe(null);
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

test("adjustReps con delta +5 sobre serie nueva deja reps en 5", () => {
  let s = start();
  s = adjustReps(s, { exerciseOrder: 0, setStartMs: 2000, delta: 5 });
  const set = s.exercises[0].sets[0];
  expect(set.reps).toBe(5);
  expect(set.startedAt).toBe(2000);
  expect(set.repTimestamps).toEqual([]);
});

test("adjustReps suma y resta reps (+1 y −1)", () => {
  let s = start();
  s = adjustReps(s, { exerciseOrder: 0, setStartMs: 2000, delta: 1 });
  s = adjustReps(s, { exerciseOrder: 0, setStartMs: 2000, delta: 1 });
  s = adjustReps(s, { exerciseOrder: 0, setStartMs: 2000, delta: -1 });
  expect(s.exercises[0].sets[0].reps).toBe(1);
});

test("adjustReps no baja de 0", () => {
  let s = start();
  s = adjustReps(s, { exerciseOrder: 0, setStartMs: 2000, delta: -5 });
  expect(s.exercises[0].sets[0].reps).toBe(0);
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

test("finishSession con pausedMs resta el tiempo pausado del total", () => {
  let s = start(); // startedAt = 1000
  s = finishSession(s, { nowMs: 3601000, pausedMs: 600000 });
  expect(s.endedAt).toBe(3601000);
  expect(s.totalDurationMs).toBe(3000000); // 3600000 - 600000
});

test("finishSession sin pausedMs se comporta igual que antes (retrocompat)", () => {
  let s = start();
  const a = finishSession(s, { nowMs: 3601000 });
  const b = finishSession(s, { nowMs: 3601000, pausedMs: 0 });
  expect(a.totalDurationMs).toBe(3600000);
  expect(b.totalDurationMs).toBe(3600000);
});

test("finishSession nunca deja totalDurationMs negativo", () => {
  let s = start(); // startedAt = 1000
  s = finishSession(s, { nowMs: 2000, pausedMs: 999999 });
  expect(s.totalDurationMs).toBe(0);
});

test("endSet puebla hrAvg/hrMax cuando se pasan", () => {
  let s = start();
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 2000 });
  s = endSet(s, { exerciseOrder: 0, weightKg: 40, rpe: 8, nowMs: 5000, hrAvg: 128, hrMax: 141 });
  const set = s.exercises[0].sets[0];
  expect(set.hrAvg).toBe(128);
  expect(set.hrMax).toBe(141);
});

test("discardOpenSets elimina las series abiertas y conserva las cerradas", () => {
  let s = start();
  // Serie 1: cerrada.
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 2000 });
  s = endSet(s, { exerciseOrder: 0, weightKg: 40, rpe: 8, nowMs: 5000 });
  // Serie 2: abierta (sin endSet).
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 6000, nowMs: 6000 });
  expect(s.exercises[0].sets.length).toBe(2);
  s = discardOpenSets(s, { exerciseOrder: 0 });
  expect(s.exercises[0].sets.length).toBe(1);
  expect(s.exercises[0].sets[0].endedAt).toBe(5000);
  // No toca otros ejercicios.
  expect(s.exercises[1].sets).toEqual([]);
});

test("endSet sin HR deja hrAvg/hrMax en null (retrocompat)", () => {
  let s = start();
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 2000 });
  s = endSet(s, { exerciseOrder: 0, weightKg: 40, rpe: 8, nowMs: 5000 });
  const set = s.exercises[0].sets[0];
  expect(set.hrAvg).toBeNull();
  expect(set.hrMax).toBeNull();
});

test("closeOpenSets: activo con valores visibles, abandonado sin metadata ajena, ninguno queda endedAt=null", () => {
  let s = start();
  // Serie abierta en ejercicio 0 (activo) y en ejercicio 1 (abandonado por navegación).
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 2000 });
  s = tapRep(s, { exerciseOrder: 1, setStartMs: 3000, nowMs: 3000 });
  s = closeOpenSets(s, { activeOrder: 0, weightKg: 40, rpe: 8, nowMs: 9000, hrAvg: 120, hrMax: 130 });
  const active = s.exercises[0].sets[0];
  const stale = s.exercises[1].sets[0];
  // Ninguna serie queda abierta.
  expect(active.endedAt).toBe(9000);
  expect(stale.endedAt).toBe(9000);
  // El activo recibe los valores visibles.
  expect(active.weightKg).toBe(40);
  expect(active.rpe).toBe(8);
  expect(active.hrAvg).toBe(120);
  // El abandonado preserva reps pero NO recibe metadata ajena.
  expect(stale.reps).toBe(1);
  expect(stale.weightKg).toBeNull();
  expect(stale.rpe).toBeNull();
  expect(stale.hrAvg).toBeNull();
});

test("closeOpenSets descarta la serie abierta de un ejercicio saltado", () => {
  let s = start();
  s = tapRep(s, { exerciseOrder: 1, setStartMs: 2000, nowMs: 2000 });
  s = skipExercise(s, { exerciseOrder: 1 });
  s = closeOpenSets(s, { activeOrder: 0, weightKg: null, rpe: null, nowMs: 9000 });
  expect(s.exercises[1].sets).toEqual([]);
});

test("setNotes setea la nota sin mutar la sesión original ni tocar el resto", () => {
  const base = { id: "s1", programId: "p1", weekNumber: 1, dayLabel: "Día 1", location: "gym",
    startedAt: 1000, endedAt: null, totalDurationMs: null, notes: "", exercises: [] } as any;
  const next = setNotes(base, "me dolió el hombro");
  expect(next.notes).toBe("me dolió el hombro");
  expect(base.notes).toBe("");
  expect(next.exercises).toBe(base.exercises);
});
