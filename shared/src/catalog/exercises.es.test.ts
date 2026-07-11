import { test, expect } from "bun:test";
import { EXERCISE_CATALOG, exerciseNameEs } from "./exercises";
import { EXERCISE_NAMES_ES } from "./exercises.es";

test("cobertura: TODOS los ids del catálogo tienen traducción no vacía", () => {
  const faltantes = EXERCISE_CATALOG.filter(
    (e) => !EXERCISE_NAMES_ES[e.id] || EXERCISE_NAMES_ES[e.id].trim() === "",
  ).map((e) => e.id);
  expect(faltantes).toEqual([]);
});

test("exerciseNameEs devuelve el español (valor concreto) de un id conocido", () => {
  expect(exerciseNameEs("barbell_bench_press")).toBe("Press de banca con barra");
});

test("exerciseNameEs devuelve undefined para un id inexistente", () => {
  expect(exerciseNameEs("id-que-no-existe-xyz")).toBeUndefined();
});

test("exerciseNameEs no devuelve miembros heredados del prototipo", () => {
  expect(exerciseNameEs("toString")).toBeUndefined();
  expect(exerciseNameEs("constructor")).toBeUndefined();
});
