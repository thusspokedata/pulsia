import { test, expect } from "bun:test";
import { exerciseInScope, exercisesOutOfScope } from "./programScope";
import type { CatalogExercise } from "./catalog";
import type { Workout } from "./program";

// Lookup falso: mapea catalogId → primaryMuscles.
function fakeLookup(map: Record<string, string[]>) {
  return (id: string): CatalogExercise | undefined =>
    map[id]
      ? ({ id, garminCategory: "c", garminName: id, displayName: id, primaryMuscles: map[id] as any, secondaryMuscles: [], equipment: ["bodyweight"] })
      : undefined;
}

function ex(catalogId: string): Workout["exercises"][number] {
  return { catalogId, garminName: catalogId, sets: 3, reps: "8", targetLoad: "RPE 7", restSeconds: 60, notes: "" };
}

function workout(targetMuscles: string[], exerciseIds: string[]): Workout {
  return { dayLabel: "D", location: "gym", targetMuscles: targetMuscles as any, exercises: exerciseIds.map(ex) };
}

test("exerciseInScope: intersección directa", () => {
  expect(exerciseInScope(["back"], ["back", "biceps"])).toBe(true);
  expect(exerciseInScope(["quads"], ["back", "biceps"])).toBe(false);
});

test("exerciseInScope: full_body es comodín en ambos sentidos", () => {
  expect(exerciseInScope(["full_body"], ["back"])).toBe(true);
  expect(exerciseInScope(["quads"], ["full_body"])).toBe(true);
});

test("exercisesOutOfScope: marca la prensa en día de espalda/bíceps", () => {
  const lookup = fakeLookup({ row: ["back"], curl: ["biceps"], leg_press: ["quads"] });
  const out = exercisesOutOfScope(workout(["back", "biceps"], ["row", "curl", "leg_press"]), lookup);
  expect(out.map((e) => e.catalogId)).toEqual(["leg_press"]);
});

test("exercisesOutOfScope: día coherente → vacío", () => {
  const lookup = fakeLookup({ row: ["back"], curl: ["biceps"] });
  expect(exercisesOutOfScope(workout(["back", "biceps"], ["row", "curl"]), lookup)).toEqual([]);
});

test("exercisesOutOfScope: peso muerto (full_body) NO se marca en día de espalda", () => {
  const lookup = fakeLookup({ deadlift: ["full_body"] });
  expect(exercisesOutOfScope(workout(["back"], ["deadlift"]), lookup)).toEqual([]);
});

test("exercisesOutOfScope: solo cuenta primaryMuscles (secundario no alcanza)", () => {
  const lookup = fakeLookup({ bench: ["chest"] });
  expect(exercisesOutOfScope(workout(["triceps"], ["bench"]), lookup).map((e) => e.catalogId)).toEqual(["bench"]);
});

test("exercisesOutOfScope: catalogId desconocido no es asunto de esta validación", () => {
  const lookup = fakeLookup({});
  expect(exercisesOutOfScope(workout(["back"], ["no_existe"]), lookup)).toEqual([]);
});

test("exercisesOutOfScope: ejercicio multi-grupo entra si ALGÚN primary coincide (no todos)", () => {
  // peso muerto: primary hamstrings/glutes/back → en día de espalda debe estar EN objetivo.
  const lookup = fakeLookup({ deadlift: ["hamstrings", "glutes", "back"] });
  expect(exercisesOutOfScope(workout(["back"], ["deadlift"]), lookup)).toEqual([]);
});
