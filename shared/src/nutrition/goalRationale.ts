import type { NutritionGoalArgs, NutritionGoalResult } from "./goal";

type OkGoal = Extract<NutritionGoalResult, { status: "ok" }>;

// Explica, de forma determinista y coherente con el número, el porqué de la meta calórica/macros.
// NO usa IA: reconstruye el razonamiento desde la misma fórmula de computeNutritionGoal.
export function buildGoalRationale(goal: OkGoal, args: NutritionGoalArgs): { lines: string[] } {
  const lines: string[] = [];

  if (goal.source === "manual") {
    lines.push(`Vos fijaste la meta en ${goal.kcal} kcal (override manual).`);
    if (goal.tdee != null) lines.push(`A modo informativo, tu gasto estimado (TDEE) es ~${goal.tdee} kcal.`);
  } else {
    if (goal.bmr != null && goal.tdee != null) {
      lines.push(`Tu metabolismo basal (BMR, Mifflin-St Jeor) es ~${goal.bmr} kcal; con tu nivel de actividad tu gasto diario estimado (TDEE) es ~${goal.tdee} kcal.`);
    }
    if (args.objective === "lose") {
      lines.push(`Como el objetivo es bajar (${args.rateKgPerWeek} kg/sem), aplicamos un déficit sobre el TDEE → meta ${goal.kcal} kcal.`);
    } else if (args.objective === "gain") {
      lines.push(`Como el objetivo es subir (${args.rateKgPerWeek} kg/sem), aplicamos un superávit sobre el TDEE → meta ${goal.kcal} kcal.`);
    } else {
      lines.push(`Como el objetivo es mantener el peso, la meta iguala tu TDEE → ${goal.kcal} kcal.`);
    }
  }

  // Macros (misma lógica que goal.ts): proteína por peso corporal, grasa 27%, carbos por diferencia.
  const protPerKg = args.objective === "lose" ? 2.0 : 1.8;
  if (args.weightKg != null) {
    lines.push(`Proteína: ${goal.protein_g} g (~${protPerKg} g por kg de peso corporal).`);
  } else {
    lines.push(`Proteína: ${goal.protein_g} g (~25% de las calorías).`);
  }
  lines.push(`Grasa: ${goal.fat_g} g (~27% de las calorías). Carbohidratos: ${goal.carbs_g} g (el resto de la energía).`);

  return { lines };
}
