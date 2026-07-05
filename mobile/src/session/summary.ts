import type { WorkoutSession, SessionExercise, SetLog } from "@pulsia/shared";
import { getExerciseById, sessionCompletionPct } from "@pulsia/shared";

export interface SetRow {
  setNumber: number;
  exerciseName: string; // garminName
  durationMs: number | null; // tiempo de la serie
  restMs: number | null; // hueco hasta la próxima serie (null en la última)
  reps: number;
  weightKg: number | null;
  volumeKg: number | null; // reps*weightKg, o null si peso corporal
}

export interface ExerciseSummary {
  order: number;
  garminName: string;
  plannedSets: number;
  doneSets: number;
  completed: boolean;
  reps: number;
  volumeKg: number; // volumen del ejercicio (Σ reps*peso; peso corporal cuenta 0)
}

export interface MuscleVolume {
  muscle: string;
  sets: number; // nº de series por músculo primario
}

export interface SessionSummary {
  dayLabel: string;
  startedAt: number;
  durationMs: number;
  workMs: number;
  restMs: number;
  totalPlannedSets: number;
  totalDoneSets: number;
  completionPct: number;
  exercisesDone: number;
  exercisesTotal: number;
  totalReps: number;
  totalVolumeKg: number;
  avgRpe: number | null;
  sessionLoadRpe: number | null;
  avgHr: number | null;
  maxHr: number | null;
  perExercise: ExerciseSummary[];
  perMuscle: MuscleVolume[];
  primaryMuscles: string[]; // músculos primarios distintos de ejercicios con series terminadas
  secondaryMuscles: string[]; // músculos secundarios distintos de ejercicios con series terminadas
  perSet: SetRow[];
}

// Series terminadas (endedAt != null) de un ejercicio.
function doneSetsOf(ex: SessionExercise): SetLog[] {
  return ex.sets.filter((s) => s.endedAt != null);
}

export function summarize(session: WorkoutSession): SessionSummary {
  const durationMs =
    session.totalDurationMs != null
      ? session.totalDurationMs
      : session.endedAt != null
        ? session.endedAt - session.startedAt
        : 0;

  // Aplanado global de series terminadas ordenadas por startedAt (para work/rest/perSet).
  const flat: { set: SetLog; garminName: string }[] = session.exercises
    .flatMap((ex) => doneSetsOf(ex).map((set) => ({ set, garminName: ex.garminName })))
    .sort((a, b) => a.set.startedAt - b.set.startedAt);

  const workMs = flat.reduce((acc, { set }) => acc + (set.durationMs ?? 0), 0);
  const restMs = Math.max(0, durationMs - workMs);

  const totalPlannedSets = session.exercises.reduce((acc, ex) => acc + ex.planned.sets, 0);
  const totalDoneSets = flat.length;
  const completionPct = sessionCompletionPct(session);

  const exercisesTotal = session.exercises.length;

  const perExercise: ExerciseSummary[] = session.exercises.map((ex) => {
    const done = doneSetsOf(ex);
    const reps = done.reduce((acc, s) => acc + s.reps, 0);
    const volumeKg = done.reduce((acc, s) => acc + (s.weightKg != null ? s.reps * s.weightKg : 0), 0);
    const completed = done.length >= ex.planned.sets;
    return {
      order: ex.order,
      garminName: ex.garminName,
      plannedSets: ex.planned.sets,
      doneSets: done.length,
      completed,
      reps,
      volumeKg,
    };
  });
  const exercisesDone = perExercise.filter((e) => e.completed).length;

  const totalReps = flat.reduce((acc, { set }) => acc + set.reps, 0);
  const totalVolumeKg = flat.reduce(
    (acc, { set }) => acc + (set.weightKg != null ? set.reps * set.weightKg : 0),
    0,
  );

  // RPE: promedio de rpe no nulos; carga interna = Σ reps*rpe.
  const rpeSets = flat.filter(({ set }) => set.rpe != null);
  const avgRpe =
    rpeSets.length > 0
      ? Math.round((rpeSets.reduce((acc, { set }) => acc + (set.rpe as number), 0) / rpeSets.length) * 10) / 10
      : null;
  const sessionLoadRpe =
    rpeSets.length > 0
      ? rpeSets.reduce((acc, { set }) => acc + set.reps * (set.rpe as number), 0)
      : null;

  // HR: promedio redondeado de hrAvg no nulos; máximo de hrMax no nulos.
  const hrAvgSets = flat.filter(({ set }) => set.hrAvg != null);
  const avgHr =
    hrAvgSets.length > 0
      ? Math.round(hrAvgSets.reduce((acc, { set }) => acc + (set.hrAvg as number), 0) / hrAvgSets.length)
      : null;
  const hrMaxVals = flat.map(({ set }) => set.hrMax).filter((v): v is number => v != null);
  const maxHr = hrMaxVals.length > 0 ? Math.max(...hrMaxVals) : null;

  // perMuscle: por cada serie terminada, +1 a cada primaryMuscle del ejercicio (via catálogo).
  const muscleCounts = new Map<string, number>();
  for (const ex of session.exercises) {
    const done = doneSetsOf(ex);
    if (done.length === 0) continue;
    const muscles = getExerciseById(ex.catalogId)?.primaryMuscles;
    if (!muscles) continue;
    for (const m of muscles) {
      muscleCounts.set(m, (muscleCounts.get(m) ?? 0) + done.length);
    }
  }
  const perMuscle: MuscleVolume[] = [...muscleCounts.entries()]
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);

  // primaryMuscles/secondaryMuscles: músculos distintos (via catálogo) de ejercicios con series
  // terminadas. Orden de primera aparición, sin duplicados.
  const primarySet = new Set<string>();
  const secondarySet = new Set<string>();
  for (const ex of session.exercises) {
    if (doneSetsOf(ex).length === 0) continue;
    const cat = getExerciseById(ex.catalogId);
    if (!cat) continue;
    for (const m of cat.primaryMuscles ?? []) primarySet.add(m);
    for (const m of cat.secondaryMuscles ?? []) secondarySet.add(m);
  }
  const primaryMuscles = [...primarySet];
  const secondaryMuscles = [...secondarySet];

  // perSet: rest = próxima.startedAt - esta.endedAt (>= 0); null en la última.
  const perSet: SetRow[] = flat.map(({ set, garminName }, i) => {
    const next = flat[i + 1];
    const restMsRow =
      next != null && set.endedAt != null ? Math.max(0, next.set.startedAt - set.endedAt) : null;
    const volumeKg = set.weightKg != null ? set.reps * set.weightKg : null;
    return {
      setNumber: set.setNumber,
      exerciseName: garminName,
      durationMs: set.durationMs,
      restMs: restMsRow,
      reps: set.reps,
      weightKg: set.weightKg,
      volumeKg,
    };
  });

  return {
    dayLabel: session.dayLabel,
    startedAt: session.startedAt,
    durationMs,
    workMs,
    restMs,
    totalPlannedSets,
    totalDoneSets,
    completionPct,
    exercisesDone,
    exercisesTotal,
    totalReps,
    totalVolumeKg,
    avgRpe,
    sessionLoadRpe,
    avgHr,
    maxHr,
    perExercise,
    perMuscle,
    primaryMuscles,
    secondaryMuscles,
    perSet,
  };
}
