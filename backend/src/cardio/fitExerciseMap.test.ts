import { test, expect } from "bun:test";
import { mapFitExercise } from "./fitExerciseMap";

// Casos verificados contra Profile.types del SDK + EXERCISE_CATALOG (no adivinados).
// El catálogo es un subconjunto curado de 273: algunos ejercicios del SDK NO están, y para esos
// el mapeo debe devolver null (el llamador guarda con el displayName del .FIT), nunca un id inventado.

test("resuelve un ejercicio del .FIT que SÍ está en el catálogo", () => {
  // flye#2 → dumbbellFlye → dumbbell_flye (en el catálogo)
  expect(mapFitExercise("flye", 2)).toBe("dumbbell_flye");
});

test("resuelve otro par category+index conocido", () => {
  // pushUp#0 → chestPressWithBand → chest_press_with_band; squat#0 → legPress → leg_press
  expect(mapFitExercise("pushUp", 0)).toBe("chest_press_with_band");
  expect(mapFitExercise("squat", 0)).toBe("leg_press");
});

test("un ejercicio del SDK que NO está en el catálogo curado da null", () => {
  // shoulderPress#17 → seatedDumbbellShoulderPress, y tricepsExtension#19 → ropePressdown:
  // ambos existen en el SDK pero no en nuestro catálogo de 273.
  expect(mapFitExercise("shoulderPress", 17)).toBeNull();
  expect(mapFitExercise("tricepsExtension", 19)).toBeNull();
});

test("una category inexistente en el SDK da null, sin romper", () => {
  expect(mapFitExercise("noSuchCategory", 0)).toBeNull();
});

test("un índice que no existe en la category da null", () => {
  expect(mapFitExercise("flye", 99999)).toBeNull();
});

test("índice null da null (una serie sin exerciseName)", () => {
  expect(mapFitExercise("flye", null)).toBeNull();
});
