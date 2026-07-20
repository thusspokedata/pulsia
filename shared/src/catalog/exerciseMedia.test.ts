import { test, expect } from "bun:test";
import { exerciseMediaFor, hasExerciseMedia } from "./exerciseMedia";

test("devuelve la media de un ejercicio que la tiene", () => {
  const m = exerciseMediaFor("barbell_bench_press");
  expect(m).toBeDefined();
  expect(m!.frames).toHaveLength(2);
  expect(m!.cues.length).toBeGreaterThan(0);
});

test("devuelve undefined para un ejercicio sin ilustración", () => {
  // kettlebell_squat existe en el catálogo pero Everkinetic no cubre kettlebell
  expect(exerciseMediaFor("kettlebell_squat")).toBeUndefined();
});

test("devuelve undefined para un id que no existe", () => {
  expect(exerciseMediaFor("id-que-no-existe-xyz")).toBeUndefined();
});

test("no devuelve miembros heredados del prototipo", () => {
  expect(exerciseMediaFor("toString")).toBeUndefined();
  expect(exerciseMediaFor("constructor")).toBeUndefined();
});

test("hasExerciseMedia coincide con exerciseMediaFor", () => {
  expect(hasExerciseMedia("barbell_bench_press")).toBe(true);
  expect(hasExerciseMedia("kettlebell_squat")).toBe(false);
});
