import { test, expect } from "bun:test";
import { CatalogExerciseSchema } from "../schemas/catalog";
import { EXERCISE_CATALOG, getExerciseById, catalogForEquipment, alternativesFor } from "./exercises";
import { FROZEN_CATALOG_IDS } from "./catalogIds.frozen";

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

test("el catálogo tiene un tamaño razonable (150-300)", () => {
  // La cota alta subió de 250 a 300 al sumar los básicos de MUST_INCLUDE (2026-07-18).
  // Coincide con MAX_TOTAL en generate-catalog.ts: si cambia una, cambiá la otra.
  // Sigue existiendo para atajar una explosión accidental del generador.
  expect(EXERCISE_CATALOG.length).toBeGreaterThanOrEqual(150);
  expect(EXERCISE_CATALOG.length).toBeLessThanOrEqual(300);
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

test("no-regresión: ningún id congelado desapareció del catálogo", () => {
  const actuales = new Set(EXERCISE_CATALOG.map((e) => e.id));
  const perdidos = FROZEN_CATALOG_IDS.filter((id) => !actuales.has(id));
  expect(perdidos).toEqual([]);
});

test("el catálogo incluye los ejercicios básicos de gimnasio", () => {
  const nombres = EXERCISE_CATALOG.map((e) => e.garminName.toLowerCase());
  const basicos = [
    "leg press",
    "seated cable row",
    "goblet squat",
    "barbell front squat",
    "dumbbell flye",
    "cable crossover",
    "t bar row",
    "wide grip lat pulldown",
    "dumbbell shoulder press",
    "dumbbell hammer curl",
  ];
  const faltantes = basicos.filter((b) => !nombres.includes(b));
  expect(faltantes).toEqual([]);
});

test("el catálogo incluye los ejercicios ilustrados que se agregaron", () => {
  const ids = new Set(EXERCISE_CATALOG.map((e) => e.id));
  // Agregados porque Everkinetic los ilustra y el SDK de Garmin los tiene (2026-07-18).
  // Llenan huecos reales: no había ningún pushdown de tríceps, ni fondos en paralelas,
  // ni press inclinado con barra, ni subidas al cajón.
  const ilustrados = [
    "reverse_grip_triceps_pressdown",
    "body_weight_dip",
    "incline_barbell_bench_press",
    "barbell_step_up",
    "dumbbell_step_up",
    "walking_lunge",
    "bent_over_lateral_raise",
    "overhead_barbell_squat",
  ];
  expect(ilustrados.filter((id) => !ids.has(id))).toEqual([]);
});
