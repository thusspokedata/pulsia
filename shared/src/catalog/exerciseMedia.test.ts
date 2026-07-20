import { test, expect } from "bun:test";
import { exerciseMediaFor, hasExerciseMedia } from "./exerciseMedia";
import { EXERCISE_MEDIA_DATA } from "./exerciseMedia.data";

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

test("los cues salen en español cuando hay traducción", () => {
  const m = exerciseMediaFor("barbell_bench_press");
  expect(m!.cues.length).toBeGreaterThan(0);
  // Sin traducir diría "Lie on a flat bench..."; nunca debe filtrarse inglés a la UI.
  expect(m!.cues.join(" ")).not.toMatch(/\b(the|your|with|and)\b/i);
});

test("cobertura: todos los ejercicios con media tienen cues en español", () => {
  const sinCues = Object.keys(EXERCISE_MEDIA_DATA).filter(
    (id) => (exerciseMediaFor(id)?.cues.length ?? 0) === 0,
  );
  expect(sinCues).toEqual([]);
});

test("no devuelve cues vacíos (el upstream trae basura de maquetado)", () => {
  const vacios: string[] = [];
  for (const id of Object.keys(EXERCISE_MEDIA_DATA)) {
    const m = exerciseMediaFor(id);
    if (m?.cues.some((c) => c.trim() === "")) vacios.push(id);
  }
  expect(vacios).toEqual([]);
});
