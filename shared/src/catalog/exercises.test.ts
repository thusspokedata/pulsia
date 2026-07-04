import { test, expect } from "bun:test";
import { CatalogExerciseSchema } from "../schemas/catalog";
import { EXERCISE_CATALOG, getExerciseById, catalogForEquipment, alternativesFor } from "./exercises";

test("todas las entradas son válidas según el schema", () => {
  for (const ex of EXERCISE_CATALOG) {
    expect(() => CatalogExerciseSchema.parse(ex)).not.toThrow();
  }
});

test("los ids son únicos", () => {
  const ids = EXERCISE_CATALOG.map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("cubre todos los grupos musculares principales", () => {
  const covered = new Set(EXERCISE_CATALOG.flatMap((e) => e.primaryMuscles));
  for (const m of ["chest", "back", "shoulders", "quads", "hamstrings", "glutes", "abs"]) {
    expect(covered.has(m as any)).toBe(true);
  }
});

test("getExerciseById devuelve la entrada correcta", () => {
  expect(getExerciseById("barbell_bench_press")?.garminName).toBe("Barbell Bench Press");
});

test("catalogForEquipment filtra por equipamiento disponible", () => {
  const home = catalogForEquipment(["bodyweight"]);
  expect(home.every((e) => e.equipment.includes("bodyweight"))).toBe(true);
  expect(home.length).toBeGreaterThan(0);
});

test("el catálogo tiene un tamaño razonable (150-250)", () => {
  expect(EXERCISE_CATALOG.length).toBeGreaterThanOrEqual(150);
  expect(EXERCISE_CATALOG.length).toBeLessThanOrEqual(250);
});

test("las dominadas asistidas con banda requieren también barra (pull_up_bar)", () => {
  const bandOnly = catalogForEquipment(["resistance_band"]).map((e) => e.id);
  const bandPlusBar = catalogForEquipment(["resistance_band", "pull_up_bar"]).map((e) => e.id);

  for (const id of ["band_assisted_pull_up", "band_assisted_chin_up", "banded_pull_ups"]) {
    expect(bandOnly).not.toContain(id);
    expect(bandPlusBar).toContain(id);
  }
});

test("alternativesFor: mismo músculo primario, equipo disponible, excluye el actual", () => {
  const alts = alternativesFor("band_assisted_pull_up", ["dumbbell"]);
  expect(alts.every((e) => e.primaryMuscles.includes("back"))).toBe(true);
  expect(alts.every((e) => e.equipment.every((eq) => eq === "dumbbell"))).toBe(true);
  expect(alts.some((e) => e.id === "band_assisted_pull_up")).toBe(false);
  expect(alts.length).toBeGreaterThan(0);
});

test("alternativesFor: catalogId inexistente → []", () => {
  expect(alternativesFor("no_existe", ["dumbbell"])).toEqual([]);
});
