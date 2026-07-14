import type { NutritionGoalResult } from "@pulsia/shared";

export interface MacroBar {
  key: "protein" | "carbs" | "fat";
  label: string;
  comido: number;
  meta: number;
  restante: number;
  pct: number; // 0–100, clamp
}
export interface GoalView {
  status: "ok" | "incomplete";
  missing?: string[];
  kcal?: { meta: number; comido: number; restante: number };
  macros?: MacroBar[];
}

const clampPct = (comido: number, meta: number): number =>
  meta <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((comido / meta) * 100)));

export function buildGoalView(
  goal: NutritionGoalResult,
  comido: { kcal: number; protein_g: number; carbs_g: number; fat_g: number },
): GoalView {
  if (goal.status === "incomplete") return { status: "incomplete", missing: goal.missing };
  const bar = (key: MacroBar["key"], label: string, c: number, meta: number): MacroBar => ({
    key, label, comido: Math.round(c), meta, restante: Math.round(meta - c), pct: clampPct(c, meta),
  });
  return {
    status: "ok",
    kcal: { meta: goal.kcal, comido: Math.round(comido.kcal), restante: Math.round(goal.kcal - comido.kcal) },
    macros: [
      bar("protein", "P", comido.protein_g, goal.protein_g),
      bar("carbs", "C", comido.carbs_g, goal.carbs_g),
      bar("fat", "G", comido.fat_g, goal.fat_g),
    ],
  };
}
