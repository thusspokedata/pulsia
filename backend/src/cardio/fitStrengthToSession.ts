import type { WorkoutSession } from "@pulsia/shared";
import type { FitStrengthPreview } from "./parseFitStrength";
import { catalogIdForFit } from "./fitExerciseMap";
import { hrForInterval, downsampleHrSeries, type HrSample } from "./hrSamples";

export interface FitSessionMeta {
  id: string;
  startedAt: number;
  endedAt: number | null;
  totalDurationMs: number | null;
  location: "gym" | "home";
}

// Transforma el preview de fuerza del .FIT en una WorkoutSession sin programa. El catalogId se
// resuelve contra el catálogo (mapFitExercise); los ejercicios que no están usan `fit:<category>`
// para no violar el `min(1)` de SessionExerciseSchema y quedar como su propio grupo en las
// tendencias. Los isométricos (reps null) van con reps 0: SetLogSchema no admite null, y un plank
// no aporta a 1RM/volumen igual (isWorkingSet exige reps>0).
export function fitStrengthToSession(preview: FitStrengthPreview, meta: FitSessionMeta, hrSamples: HrSample[] = []): WorkoutSession {
  const hrSeries = downsampleHrSeries(hrSamples, meta.startedAt);
  return {
    id: meta.id,
    programId: null,
    weekNumber: null,
    dayLabel: preview.workoutName ?? "Entreno importado",
    location: meta.location,
    startedAt: meta.startedAt,
    endedAt: meta.endedAt,
    totalDurationMs: meta.totalDurationMs,
    notes: "",
    ...(hrSeries.length > 0 ? { hrSeries } : {}),
    exercises: preview.exercises.map((ex, i) => {
      const catalogId = catalogIdForFit(ex.category, ex.exerciseNameIndex);
      return {
        catalogId,
        garminName: ex.displayName ?? ex.category,
        order: i,
        planned: { sets: ex.sets.length, reps: "", targetLoad: "", restSeconds: 0 },
        skipped: false,
        note: "",
        substitutedFromId: null,
        sets: ex.sets.map((set, j) => {
          const startedAt = set.startedAt || meta.startedAt;
          const endedAt = startedAt + set.durationMs;
          const { avg, max } = hrForInterval(hrSamples, startedAt, endedAt);
          return {
            setNumber: j + 1,
            reps: set.reps ?? 0,
            weightKg: set.weightKg,
            rpe: null,
            startedAt,
            endedAt,
            durationMs: set.durationMs,
            repTimestamps: [],
            hrAvg: avg,
            hrMax: max,
            skipped: false,
          };
        }),
      };
    }),
  };
}
