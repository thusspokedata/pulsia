import type { Sex, ActivityLevel } from "../schemas/profile";
import type { NutritionObjective } from "../schemas/nutrition";

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725,
};
const KCAL_FLOOR = 1500;
const KCAL_PER_KG = 7700; // 1 kg de masa corporal ≈ 7700 kcal → /7 por día

export interface NutritionGoalArgs {
  sex?: Sex;
  age?: number;
  heightCm?: number;
  weightKg?: number; // resuelto por quien llama: último weight_kg ?? profile.weightKg
  activityLevel?: ActivityLevel;
  objective: NutritionObjective;
  rateKgPerWeek: number;
  manualKcal?: number | null;
}

export type NutritionGoalResult =
  | { status: "ok"; source: "auto" | "manual"; kcal: number; protein_g: number; carbs_g: number; fat_g: number; bmr: number | null; tdee: number | null }
  | { status: "incomplete"; missing: string[] };

const round = (n: number) => Math.round(n);

// Proteína por peso (más alta en déficit); si no hay peso (solo camino manual) → 25% de las kcal.
function macros(kcal: number, weightKg: number | undefined, objective: NutritionObjective) {
  const protein_g = weightKg != null
    ? round(weightKg * (objective === "lose" ? 2.0 : 1.8))
    : round((kcal * 0.25) / 4);
  const fat_g = round((kcal * 0.27) / 9);
  const carbs_g = Math.max(0, round((kcal - protein_g * 4 - fat_g * 9) / 4));
  return { protein_g, carbs_g, fat_g };
}

export function computeNutritionGoal(args: NutritionGoalArgs): NutritionGoalResult {
  const { sex, age, heightCm, weightKg, activityLevel, objective, rateKgPerWeek, manualKcal } = args;

  // BMR/TDEE se computan si hay datos, ANTES del branch manual: el camino manual los devuelve
  // informativos (los usa el gasto neto de #2b), aunque la meta sea la manual.
  const s = sex === "male" ? 5 : sex === "female" ? -161 : -78; // other/sin sexo → promedio
  const hasAnthro = age != null && heightCm != null && weightKg != null;
  const bmrRaw = hasAnthro ? 10 * (weightKg as number) + 6.25 * (heightCm as number) - 5 * (age as number) + s : null;
  const tdeeRaw = bmrRaw != null ? bmrRaw * ACTIVITY_FACTOR[activityLevel ?? "light"] : null;

  // Camino manual: el usuario fija las kcal; pisa el cálculo y no fuerza el piso.
  // Se llama directo desde el móvil con un número parseado, así que 0/negativo NO cuentan como override.
  if (manualKcal != null && manualKcal > 0) {
    return {
      status: "ok", source: "manual", kcal: manualKcal, ...macros(manualKcal, weightKg, objective),
      bmr: bmrRaw != null ? round(bmrRaw) : null, tdee: tdeeRaw != null ? round(tdeeRaw) : null,
    };
  }

  const missing: string[] = [];
  if (age == null) missing.push("edad");
  if (heightCm == null) missing.push("altura");
  if (weightKg == null) missing.push("peso");
  if (missing.length > 0) return { status: "incomplete", missing };

  // Acá bmrRaw/tdeeRaw son no-null (hasAnthro garantizado por el check de missing).
  const adj = (rateKgPerWeek * KCAL_PER_KG) / 7;
  const raw = objective === "lose" ? (tdeeRaw as number) - adj : objective === "gain" ? (tdeeRaw as number) + adj : (tdeeRaw as number);
  const kcal = Math.max(KCAL_FLOOR, round(raw));
  return { status: "ok", source: "auto", kcal, ...macros(kcal, weightKg, objective), bmr: round(bmrRaw as number), tdee: round(tdeeRaw as number) };
}
