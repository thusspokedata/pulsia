import type { NutritionGoalResult } from "@pulsia/shared";

export interface MacroBar {
  key: "protein" | "carbs" | "fat";
  label: string;
  comido: number;
  meta: number;
  restante: number;
  pct: number; // 0–100, clamp
  over: boolean;
}
export interface GoalView {
  status: "ok" | "incomplete";
  missing?: string[];
  kcal?: { meta: number; comido: number; exercise: number; restante: number; over: boolean };
  macros?: MacroBar[];
}

const clampPct = (comido: number, meta: number): number =>
  meta <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((comido / meta) * 100)));

export function buildGoalView(
  goal: NutritionGoalResult,
  comido: { kcal: number; protein_g: number; carbs_g: number; fat_g: number },
  exercise = 0,
): GoalView {
  if (goal.status === "incomplete") return { status: "incomplete", missing: goal.missing };
  // `over` se deriva SIEMPRE del restante redondeado (mismo criterio para macros y kcal): así
  // el color/texto no se contradicen en el borde .5. El `|| 0` normaliza el -0 de Math.round(-0.5).
  const bar = (key: MacroBar["key"], label: string, c: number, meta: number): MacroBar => {
    const restante = Math.round(meta - c) || 0;
    return { key, label, comido: Math.round(c), meta, restante, pct: clampPct(c, meta), over: restante < 0 };
  };
  const kcalRestante = Math.round(goal.kcal - comido.kcal + exercise) || 0;
  return {
    status: "ok",
    kcal: { meta: goal.kcal, comido: Math.round(comido.kcal), exercise: Math.round(exercise), restante: kcalRestante, over: kcalRestante < 0 },
    macros: [
      bar("protein", "Proteína", comido.protein_g, goal.protein_g),
      bar("carbs", "Carbohidratos", comido.carbs_g, goal.carbs_g),
      bar("fat", "Grasa", comido.fat_g, goal.fat_g),
    ],
  };
}

// Texto del restante según estado. `positiveWord` es el verbo para el caso "falta algo"
// (macros dicen "faltan N", la card de kcal dice "te quedan N"); "meta cumplida" y "N de más"
// son el mismo wording en ambos lugares.
export function restanteLabel(restante: number, positiveWord: string): string {
  if (restante > 0) return `${positiveWord} ${restante}`;
  if (restante === 0) return "meta cumplida";
  return `${-restante} de más`;
}

// Wording de los macros (compartido por la card y el detalle).
export function remainingLabel(restante: number): string {
  return restanteLabel(restante, "faltan");
}
