import { exerciseAdjustedTargets, type NutritionGoalResult, type AdjustedTarget } from "@pulsia/shared";

export interface MacroBar {
  key: "protein" | "carbs" | "fat";
  label: string;
  comido: number;
  meta: number;      // BASE — es lo que se muestra como referencia del día de descanso
  bonus: number;     // añadido por el ejercicio (solo carbos)
  metaTotal: number; // meta + bonus — contra esto miden la barra y el restante
  restante: number;
  over: boolean;
}
export interface GoalView {
  status: "ok" | "incomplete";
  missing?: string[];
  kcal?: { meta: number; comido: number; exercise: number; restante: number; over: boolean };
  macros?: MacroBar[];
}

export function buildGoalView(
  goal: NutritionGoalResult,
  comido: { kcal: number; protein_g: number; carbs_g: number; fat_g: number },
  exercise = 0,
): GoalView {
  if (goal.status === "incomplete") return { status: "incomplete", missing: goal.missing };
  const targets = exerciseAdjustedTargets(goal, exercise);

  // `over` se deriva SIEMPRE del restante redondeado (mismo criterio para macros y kcal): así
  // el color/texto no se contradicen en el borde .5. El `|| 0` normaliza el -0 de Math.round(-0.5).
  const bar = (key: MacroBar["key"], label: string, c: number, t: AdjustedTarget): MacroBar => {
    const restante = Math.round(t.total - c) || 0;
    return { key, label, comido: Math.round(c), meta: t.base, bonus: t.bonus, metaTotal: t.total, restante, over: restante < 0 };
  };
  const kcalRestante = Math.round(goal.kcal - comido.kcal + exercise) || 0;
  return {
    status: "ok",
    // `meta` es la BASE a propósito: NutrientesTab la usa para el techo de saturadas, que no
    // escala con el ejercicio. El presupuesto real es meta + exercise.
    kcal: { meta: goal.kcal, comido: Math.round(comido.kcal), exercise: Math.round(exercise), restante: kcalRestante, over: kcalRestante < 0 },
    macros: [
      bar("protein", "Proteína", comido.protein_g, targets.protein_g),
      bar("carbs", "Carbohidratos", comido.carbs_g, targets.carbs_g),
      bar("fat", "Grasa", comido.fat_g, targets.fat_g),
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
