import { computeNutritionGoal, type NutritionGoalResult } from "@pulsia/shared";
import { useGoalInput } from "./useGoalInput";
import { useProfile } from "./useProfile";

// Ensambla la meta calórica del perfil + el objetivo. undefined mientras carga; si no,
// NutritionGoalResult (ok con targets, o incomplete si falta perfil).
export function useNutritionGoal(): NutritionGoalResult | undefined {
  const goal = useGoalInput();
  const profile = useProfile();
  if (goal.isLoading || profile.isLoading) return undefined;
  const gi = goal.data ?? { objective: "maintain" as const, rateKgPerWeek: 0, manualKcal: null };
  const p = profile.data ?? undefined;
  return computeNutritionGoal({
    sex: p?.sex, age: p?.age, heightCm: p?.heightCm, weightKg: p?.weightKg,
    activityLevel: p?.activityLevel, objective: gi.objective, rateKgPerWeek: gi.rateKgPerWeek,
    manualKcal: gi.manualKcal ?? null,
  });
}
