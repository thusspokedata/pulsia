import type { CatalogExercise, Equipment } from "../index";
import { EXERCISE_CATALOG_DATA } from "./exercises.data";

export const EXERCISE_CATALOG: CatalogExercise[] = EXERCISE_CATALOG_DATA;

export function getExerciseById(id: string): CatalogExercise | undefined {
  return EXERCISE_CATALOG.find((e) => e.id === id);
}

export function catalogForEquipment(available: Equipment[]): CatalogExercise[] {
  const set = new Set(available);
  return EXERCISE_CATALOG.filter((e) => e.equipment.every((eq) => set.has(eq)));
}

export function alternativesFor(catalogId: string, availableEquipment: Equipment[]): CatalogExercise[] {
  const current = getExerciseById(catalogId);
  if (!current) return [];
  const avail = new Set(availableEquipment);
  const targetMuscles = new Set(current.primaryMuscles);
  return EXERCISE_CATALOG.filter(
    (e) =>
      e.id !== catalogId &&
      e.primaryMuscles.some((m) => targetMuscles.has(m)) &&
      e.equipment.every((eq) => avail.has(eq)),
  );
}
