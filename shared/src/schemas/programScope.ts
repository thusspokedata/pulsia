import type { CatalogExercise, MuscleGroup } from "./catalog";
import type { ProgramExercise, Workout } from "./program";

// Un ejercicio pertenece al objetivo del día si alguno de sus primaryMuscles está entre los
// targetMuscles del día. `full_body` es comodín BIDIRECCIONAL: un ejercicio full_body (peso
// muerto, cargadas) entra en cualquier día, y un día con target full_body acepta cualquier
// ejercicio. Solo se consideran primaryMuscles (los secundarios serían demasiado laxos).
export function exerciseInScope(primaryMuscles: MuscleGroup[], targetMuscles: MuscleGroup[]): boolean {
  if (primaryMuscles.includes("full_body")) return true;
  if (targetMuscles.includes("full_body")) return true;
  return primaryMuscles.some((m) => targetMuscles.includes(m));
}

// Ejercicios de un día cuyo grupo principal no coincide con el objetivo del día. Un catalogId
// desconocido se ignora (esa validación la hace el loop de IDs de generate.ts, no ésta).
export function exercisesOutOfScope(
  workout: Workout,
  lookup: (id: string) => CatalogExercise | undefined,
): ProgramExercise[] {
  return workout.exercises.filter((exercise) => {
    const cat = lookup(exercise.catalogId);
    if (!cat) return false;
    return !exerciseInScope(cat.primaryMuscles, workout.targetMuscles);
  });
}
