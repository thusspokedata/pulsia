import { computeNutritionGoal } from "@pulsia/shared";
import type { NutritionGoalInput, NutritionGoalResult, TrainingProfile } from "@pulsia/shared";
import { getNutritionGoal } from "../api/nutrition";
import { getProfile } from "../storage/profile";
import { getLatestMetrics } from "../api/metrics";

export interface DailyGoalContext {
  profile: TrainingProfile | null;
  weightKg?: number;
  goalResult: NutritionGoalResult | null;
  // El insumo crudo (objective/rateKgPerWeek/manualKcal) que ya se buscó para computar goalResult.
  // Se expone para que pantallas como Plan de trabajo puedan reconstruir buildGoalRationale(...) sin
  // volver a pedir el objetivo por su cuenta (una sola fuente de verdad para el "porqué" de la meta).
  goalInput: NutritionGoalInput | null;
}

/**
 * Resuelve la meta diaria (kcal y macros) UNA sola vez para toda la app.
 *
 * Vive en su propio módulo, y no dentro de `useNutritionDay`, porque el detalle de UNA comida
 * también compara contra la meta del día: si cada pantalla resolviera el peso por su cuenta, la
 * card del día y el detalle de la comida podrían mostrar dos metas distintas del mismo día (la
 * pantalla que no pisara `profile.weightKg` con el último pesaje quedaría con la meta vieja).
 *
 * El peso del perfil es el fallback, no la fuente: la última medición manda. Si el backend no
 * responde (offline) se sigue con el del perfil en vez de quedarse sin meta.
 */
export async function loadDailyGoalContext(url: string): Promise<DailyGoalContext> {
  const [goalInput, profile] = await Promise.all([getNutritionGoal(url), getProfile()]);
  let weightKg = profile?.weightKg;
  try {
    const latest = await getLatestMetrics(url);
    if (latest.weight_kg?.value != null) weightKg = latest.weight_kg.value;
  } catch {
    /* offline: alcanza con el peso del perfil */
  }
  const goalResult = goalInput
    ? computeNutritionGoal({
        sex: profile?.sex, age: profile?.age, heightCm: profile?.heightCm, weightKg,
        activityLevel: profile?.activityLevel,
        objective: goalInput.objective, rateKgPerWeek: goalInput.rateKgPerWeek, manualKcal: goalInput.manualKcal,
      })
    : null;
  return { profile, weightKg, goalResult, goalInput: goalInput ?? null };
}
