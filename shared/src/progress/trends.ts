import type { WorkoutSession } from "../schemas/session";

// Epley. reps 0 → devuelve el peso.
export function estimate1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

export interface Perf1RMPoint { measuredAt: number; est1RM: number; topSetWeightKg: number; reps: number }
export interface ExercisePerfTrend { catalogId: string; garminName: string; points: Perf1RMPoint[] }
export interface VolumePoint { measuredAt: number; volumeKg: number }
export interface ExercisePR { catalogId: string; garminName: string; best1RM: number; heaviestKg: number }
export interface PerformanceTrends {
  perExercise: ExercisePerfTrend[];
  volumeSeries: VolumePoint[];
  prs: ExercisePR[];
}

// Una serie "de trabajo" válida para fuerza: con carga y reps, no saltada.
function isWorkingSet(s: WorkoutSession["exercises"][number]["sets"][number]): boolean {
  return !s.skipped && s.weightKg != null && s.weightKg > 0 && s.reps > 0;
}

export function computePerformanceTrends(sessions: WorkoutSession[]): PerformanceTrends {
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);

  const perExMap = new Map<string, ExercisePerfTrend>();
  const prMap = new Map<string, ExercisePR>();
  const volumeSeries: VolumePoint[] = [];

  for (const s of sorted) {
    let sessionVolume = 0;
    for (const ex of s.exercises) {
      let best: { est1RM: number; w: number; reps: number } | null = null;
      let heaviestInSession = 0;
      for (const set of ex.sets) {
        if (set.weightKg != null && !set.skipped) sessionVolume += set.reps * set.weightKg;
        if (!isWorkingSet(set)) continue;
        const est = estimate1RM(set.weightKg as number, set.reps);
        if (!best || est > best.est1RM) best = { est1RM: est, w: set.weightKg as number, reps: set.reps };
        heaviestInSession = Math.max(heaviestInSession, set.weightKg as number);
      }
      if (best) {
        const trend = perExMap.get(ex.catalogId) ?? { catalogId: ex.catalogId, garminName: ex.garminName, points: [] };
        trend.points.push({ measuredAt: s.startedAt, est1RM: best.est1RM, topSetWeightKg: best.w, reps: best.reps });
        perExMap.set(ex.catalogId, trend);

        const pr = prMap.get(ex.catalogId) ?? { catalogId: ex.catalogId, garminName: ex.garminName, best1RM: 0, heaviestKg: 0 };
        pr.best1RM = Math.max(pr.best1RM, best.est1RM);
        pr.heaviestKg = Math.max(pr.heaviestKg, heaviestInSession);
        prMap.set(ex.catalogId, pr);
      }
    }
    volumeSeries.push({ measuredAt: s.startedAt, volumeKg: sessionVolume });
  }

  const perExercise = [...perExMap.values()]
    .filter((e) => e.points.length >= 2)
    .sort((a, b) => {
      const byLength = b.points.length - a.points.length;
      if (byLength !== 0) return byLength; // más frecuentes primero
      return b.points.at(-1)!.measuredAt - a.points.at(-1)!.measuredAt; // desempate: más recientes primero
    });

  return { perExercise, volumeSeries, prs: [...prMap.values()] };
}
