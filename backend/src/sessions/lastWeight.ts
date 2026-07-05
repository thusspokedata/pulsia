import type { WorkoutSession } from "@pulsia/shared";

// Mapa catalogId → último peso (kg) usado. `sessions` viene más-reciente-primero.
// Para cada ejercicio, el peso de la última serie (mayor setNumber) con weightKg != null de
// la sesión más reciente donde aparece con peso. No asume que los sets vengan ordenados.
export function lastWeightByExercise(sessions: WorkoutSession[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (ex.catalogId in map) continue;
      let best: { setNumber: number; weightKg: number } | null = null;
      for (const st of ex.sets) {
        if (st.weightKg != null && (best == null || st.setNumber > best.setNumber)) {
          best = { setNumber: st.setNumber, weightKg: st.weightKg };
        }
      }
      if (best != null) map[ex.catalogId] = best.weightKg;
    }
  }
  return map;
}
