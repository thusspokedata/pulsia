import type { WorkoutSession } from "@pulsia/shared";

// Mapa catalogId → último peso (kg) usado. `sessions` viene más-reciente-primero.
// Para cada ejercicio, el peso de la última serie con weightKg != null de la sesión
// más reciente donde aparece con peso.
export function lastWeightByExercise(sessions: WorkoutSession[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (ex.catalogId in map) continue;
      for (let i = ex.sets.length - 1; i >= 0; i--) {
        const w = ex.sets[i].weightKg;
        if (w != null) { map[ex.catalogId] = w; break; }
      }
    }
  }
  return map;
}
