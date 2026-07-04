import type { Program, WorkoutSession, SessionExercise, SetLog } from "@pulsia/shared";

function updateExercise(
  session: WorkoutSession,
  order: number,
  fn: (ex: SessionExercise) => SessionExercise,
): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises.map((ex) => (ex.order === order ? fn(ex) : ex)),
  };
}

function withOpenSet(ex: SessionExercise, setStartMs: number): { ex: SessionExercise; idx: number } {
  const openIdx = ex.sets.findIndex((s) => s.endedAt == null);
  if (openIdx >= 0) return { ex, idx: openIdx };
  const newSet: SetLog = {
    setNumber: ex.sets.length + 1, reps: 0, weightKg: null, rpe: null,
    startedAt: setStartMs, endedAt: null, durationMs: null,
    repTimestamps: [], hrAvg: null, hrMax: null, skipped: false,
  };
  return { ex: { ...ex, sets: [...ex.sets, newSet] }, idx: ex.sets.length };
}

export function startSession(input: {
  program: Program; programId: string; weekNumber: number;
  dayLabel: string; location: "gym" | "home"; id: string; nowMs: number;
}): WorkoutSession {
  const week = input.program.weeks.find((w) => w.weekNumber === input.weekNumber);
  const workout = week?.workouts.find((w) => w.dayLabel === input.dayLabel && w.location === input.location);
  const exercises: SessionExercise[] = (workout?.exercises ?? []).map((e, i) => ({
    catalogId: e.catalogId,
    garminName: e.garminName,
    order: i,
    planned: { sets: e.sets, reps: e.reps, targetLoad: e.targetLoad, restSeconds: e.restSeconds },
    skipped: false,
    sets: [],
    note: "",
    substitutedFromId: null,
  }));
  return {
    id: input.id, programId: input.programId, weekNumber: input.weekNumber,
    dayLabel: input.dayLabel, location: input.location,
    startedAt: input.nowMs, endedAt: null, totalDurationMs: null, notes: "",
    exercises,
  };
}

export function tapRep(session: WorkoutSession, args: { exerciseOrder: number; setStartMs: number; nowMs: number }): WorkoutSession {
  return updateExercise(session, args.exerciseOrder, (ex) => {
    const { ex: withSet, idx } = withOpenSet(ex, args.setStartMs);
    const sets = withSet.sets.map((s, i) =>
      i === idx ? { ...s, reps: s.reps + 1, repTimestamps: [...s.repTimestamps, args.nowMs - s.startedAt] } : s,
    );
    return { ...withSet, sets };
  });
}

export function adjustReps(session: WorkoutSession, args: { exerciseOrder: number; setStartMs: number; delta: number }): WorkoutSession {
  return updateExercise(session, args.exerciseOrder, (ex) => {
    const { ex: withSet, idx } = withOpenSet(ex, args.setStartMs);
    const sets = withSet.sets.map((s, i) =>
      i === idx ? { ...s, reps: Math.max(0, s.reps + args.delta) } : s,
    );
    return { ...withSet, sets };
  });
}

export function endSet(session: WorkoutSession, args: { exerciseOrder: number; weightKg: number | null; rpe: number | null; nowMs: number; hrAvg?: number | null; hrMax?: number | null }): WorkoutSession {
  return updateExercise(session, args.exerciseOrder, (ex) => {
    const openIdx = ex.sets.findIndex((s) => s.endedAt == null);
    if (openIdx < 0) return ex;
    const sets = ex.sets.map((s, i) =>
      i === openIdx
        ? { ...s, weightKg: args.weightKg, rpe: args.rpe, endedAt: args.nowMs, durationMs: args.nowMs - s.startedAt, hrAvg: args.hrAvg ?? null, hrMax: args.hrMax ?? null }
        : s,
    );
    return { ...ex, sets };
  });
}

export function editSet(session: WorkoutSession, args: { exerciseOrder: number; setNumber: number; reps?: number; weightKg?: number | null; rpe?: number | null }): WorkoutSession {
  return updateExercise(session, args.exerciseOrder, (ex) => ({
    ...ex,
    sets: ex.sets.map((s) =>
      s.setNumber === args.setNumber
        ? {
            ...s,
            reps: args.reps ?? s.reps,
            weightKg: args.weightKg === undefined ? s.weightKg : args.weightKg,
            rpe: args.rpe === undefined ? s.rpe : args.rpe,
          }
        : s,
    ),
  }));
}

export function discardOpenSets(session: WorkoutSession, args: { exerciseOrder: number }): WorkoutSession {
  return updateExercise(session, args.exerciseOrder, (ex) => ({
    ...ex,
    sets: ex.sets.filter((s) => s.endedAt != null),
  }));
}

// Cierra/descarta todas las series abiertas al terminar la sesión, para que ninguna quede con
// endedAt=null. El ejercicio ACTIVO se cierra con los valores visibles (peso/RPE/HR le corresponden);
// los ABANDONADOS por navegación se cierran preservando solo las reps (sin metadata ajena); los
// SALTADOS se descartan.
export function closeOpenSets(
  session: WorkoutSession,
  args: { activeOrder: number | null; weightKg: number | null; rpe: number | null; nowMs: number; hrAvg?: number | null; hrMax?: number | null },
): WorkoutSession {
  let s = session;
  for (const e of s.exercises) {
    if (!e.sets.some((x) => x.endedAt == null)) continue;
    if (e.skipped) {
      s = discardOpenSets(s, { exerciseOrder: e.order });
    } else if (e.order === args.activeOrder) {
      s = endSet(s, { exerciseOrder: e.order, weightKg: args.weightKg, rpe: args.rpe, nowMs: args.nowMs, hrAvg: args.hrAvg ?? null, hrMax: args.hrMax ?? null });
    } else {
      s = endSet(s, { exerciseOrder: e.order, weightKg: null, rpe: null, nowMs: args.nowMs, hrAvg: null, hrMax: null });
    }
  }
  return s;
}

export function skipExercise(session: WorkoutSession, args: { exerciseOrder: number }): WorkoutSession {
  return updateExercise(session, args.exerciseOrder, (ex) => ({ ...ex, skipped: true }));
}

export function finishSession(session: WorkoutSession, args: { nowMs: number; pausedMs?: number }): WorkoutSession {
  // El tiempo pausado (ir al baño, etc.) no cuenta en el total. Nunca negativo.
  const total = Math.max(0, args.nowMs - session.startedAt - (args.pausedMs ?? 0));
  return { ...session, endedAt: args.nowMs, totalDurationMs: total };
}

export function setNotes(session: WorkoutSession, notes: string): WorkoutSession {
  return { ...session, notes };
}
