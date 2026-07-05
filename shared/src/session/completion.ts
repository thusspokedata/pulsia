import type { WorkoutSession } from "../schemas/session";

// % de cumplimiento = series terminadas / series planeadas (redondeado, tope 100). 0 si no hay planeadas.
// Fuente única compartida por el resumen (mobile) y la lista de sesiones (backend).
export function sessionCompletionPct(session: WorkoutSession): number {
  const planned = session.exercises.reduce((acc, ex) => acc + ex.planned.sets, 0);
  const done = session.exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.endedAt != null).length,
    0,
  );
  return planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0;
}
