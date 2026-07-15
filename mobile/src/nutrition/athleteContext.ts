import { getProfile } from "../storage/profile";
import { getLatestMetrics } from "../api/metrics";
import { getNutritionGoal } from "../api/nutrition";
import { computeNutritionGoal } from "@pulsia/shared";
import type { AthleteContext } from "@pulsia/shared";

// Arma el contexto del atleta (perfil + objetivo nutricional + último peso conocido) para
// mandárselo a la IA (informes, plan de suplementos). Compartido entre esas pantallas.
export async function buildAthleteContext(baseUrl: string): Promise<AthleteContext> {
  const p = await getProfile();
  let weightKg = p?.weightKg;
  const gi = await getNutritionGoal(baseUrl);
  try {
    const lm = await getLatestMetrics(baseUrl);
    if (lm.weight_kg?.value != null) weightKg = lm.weight_kg.value;
  } catch { /* offline */ }
  const goalRes = gi
    ? computeNutritionGoal({
        sex: p?.sex, age: p?.age, heightCm: p?.heightCm, weightKg,
        activityLevel: p?.activityLevel, objective: gi.objective, rateKgPerWeek: gi.rateKgPerWeek, manualKcal: gi.manualKcal,
      })
    : null;
  const goal = goalRes && goalRes.status === "ok"
    ? { status: "ok" as const, kcal: goalRes.kcal, protein_g: goalRes.protein_g, carbs_g: goalRes.carbs_g, fat_g: goalRes.fat_g, bmr: goalRes.bmr }
    : { status: "incomplete" as const };
  return { sex: p?.sex, age: p?.age, heightCm: p?.heightCm, weightKg, activityLevel: p?.activityLevel, objective: gi?.objective, goal };
}
