import type { WorkoutSession } from "@pulsia/shared";

// % de cumplimiento = series terminadas / series planeadas (redondeado). 0 si no hay planeadas.
export function sessionCompletionPct(session: WorkoutSession): number {
  const planned = session.exercises.reduce((acc, ex) => acc + ex.planned.sets, 0);
  const done = session.exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.endedAt != null).length,
    0,
  );
  return planned > 0 ? Math.round((done / planned) * 100) : 0;
}
