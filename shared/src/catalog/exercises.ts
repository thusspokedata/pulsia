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
