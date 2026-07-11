import { test, expect } from "bun:test";
import { EXERCISE_CATALOG, exerciseNameEs } from "./exercises";
import { EXERCISE_NAMES_ES } from "./exercises.es";

test("cobertura: TODOS los ids del catálogo tienen traducción no vacía", () => {
  const faltantes = EXERCISE_CATALOG.filter(
    (e) => !EXERCISE_NAMES_ES[e.id] || EXERCISE_NAMES_ES[e.id].trim() === "",
  ).map((e) => e.id);
  expect(faltantes).toEqual([]);
});

test("exerciseNameEs devuelve el español de un id conocido", () => {
  const first = EXERCISE_CATALOG[0];
  expect(exerciseNameEs(first.id)).toBe(EXERCISE_NAMES_ES[first.id]);
  expect(typeof exerciseNameEs(first.id)).toBe("string");
});

test("exerciseNameEs devuelve undefined para un id inexistente", () => {
  expect(exerciseNameEs("id-que-no-existe-xyz")).toBeUndefined();
});
