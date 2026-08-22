import { getExerciseById, exercisesOutOfScope, type Program, type TrainingProfile, type Workout, type ProgramExercise } from "@pulsia/shared";
import type { AiClient } from "./client";
import type { OneOffArgs } from "./oneoff";

// Nota honesta y genérica que reemplaza al rationale de un día re-planeado por la Fase B (la
// reparación por oneOff no emite rationale, y el previo describiría ejercicios ya reemplazados).
export const AUTO_ADJUST_RATIONALE =
  "Este día se ajustó automáticamente para respetar el objetivo muscular del día.";

function unknownCatalogIds(program: Program): string[] {
  const bad: string[] = [];
  for (const w of program.weeks)
    for (const day of w.workouts)
      for (const ex of day.exercises)
        if (!getExerciseById(ex.catalogId)) bad.push(ex.catalogId);
  return bad;
}

// Re-planea UN día vía IA (reusa la maquinaria del entreno puntual), enfocado en los targetMuscles
// del día. Devuelve los ejercicios reparados, o null si la llamada falla o introduce un catalogId
// inexistente (en ese caso el caller conserva el día original — nunca se despacha un ID inválido).
async function repairDayExercises(input: {
  workout: Workout;
  profile: TrainingProfile;
  apiKey: string;
  model: string;
  ai: AiClient;
}): Promise<ProgramExercise[] | null> {
  const { workout, profile, apiKey, model, ai } = input;
  try {
    const repaired = await ai.generateProgram({
      profile, apiKey, model,
      oneOff: {
        location: workout.location,
        focus: workout.targetMuscles,
        sessionMinutes: profile.sessionMinutes ?? 60,
        equipment: [],
      },
    });
    const day = repaired.weeks[0]?.workouts[0];
    if (!day) return null;
    // Solo se acepta la reparación si es válida Y realmente queda dentro del objetivo del día:
    // un catalogId inexistente, o un ejercicio válido pero fuera de targetMuscles, hace que se
    // conserve el día original (Fase B nunca reemplaza con un día peor). Si queda sin arreglar,
    // el usuario lo ajusta con el selector de alternativas de la app.
    const replacement = { ...workout, exercises: day.exercises };
    if (
      day.exercises.some((ex) => !getExerciseById(ex.catalogId)) ||
      exercisesOutOfScope(replacement, getExerciseById).length > 0
    ) return null;
    return day.exercises;
  } catch {
    return null;
  }
}

export async function generateProgramForProfile(input: {
  profile: TrainingProfile;
  apiKey: string;
  model: string;
  ai: AiClient;
  historySummary?: string;
  memory?: string;
  progressSummary?: string;
  ecgSummary?: string;
  workObjective?: string;
  oneOff?: OneOffArgs;
}): Promise<Program> {
  const { profile, apiKey, model, ai, historySummary, memory, progressSummary, ecgSummary, workObjective, oneOff } = input;

  // Fase A: generación con reintento por catalogIds inexistentes (invariante: todos los IDs válidos).
  let program: Program | null = null;
  let lastBad: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const candidate = await ai.generateProgram({ profile, apiKey, model, historySummary, memory, progressSummary, ecgSummary, workObjective, oneOff });
    lastBad = unknownCatalogIds(candidate);
    if (lastBad.length === 0) { program = candidate; break; }
  }
  if (!program) throw new Error(`La IA usó ejercicios fuera del catálogo: ${lastBad.join(", ")}`);

  // Fase B: coherencia día↔objetivo. No corre para oneOff (el pedido ya fija el objetivo del día).
  // Por cada día con ejercicios fuera de objetivo, re-planea SOLO ese día (best-effort). Si la
  // reparación falla o mete un ID inexistente, conserva el día original: el usuario puede ajustar
  // el ejercicio con el selector de alternativas de la app.
  if (!oneOff) {
    for (const week of program.weeks) {
      for (const workout of week.workouts) {
        if (exercisesOutOfScope(workout, getExerciseById).length === 0) continue;
        const repaired = await repairDayExercises({ workout, profile, apiKey, model, ai });
        // Al reemplazar los ejercicios, el `rationale` previo describiría ejercicios que ya no
        // están (el oneOff de la reparación usa buildOneOffPrompt, que no emite rationale). No se
        // conserva (sería stale) ni se vacía (mostraría el fallback "regenerá" en un plan recién
        // generado): se pone una nota honesta y genérica del ajuste automático.
        if (repaired) { workout.exercises = repaired; workout.rationale = AUTO_ADJUST_RATIONALE; }
      }
    }
  }

  return program;
}
