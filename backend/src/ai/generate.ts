import { getExerciseById, type MuscleGroup, type Program, type TrainingProfile } from "@pulsia/shared";
import type { AiClient } from "./client";

function unknownCatalogIds(program: Program): string[] {
  const bad: string[] = [];
  for (const w of program.weeks)
    for (const day of w.workouts)
      for (const ex of day.exercises)
        if (!getExerciseById(ex.catalogId)) bad.push(ex.catalogId);
  return bad;
}

export async function generateProgramForProfile(input: {
  profile: TrainingProfile;
  apiKey: string;
  model: string;
  ai: AiClient;
  historySummary?: string;
  memory?: string;
  oneOff?: { location: "gym" | "home"; focus: MuscleGroup };
}): Promise<Program> {
  const { profile, apiKey, model, ai, historySummary, memory, oneOff } = input;
  let lastBad: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const program = await ai.generateProgram({ profile, apiKey, model, historySummary, memory, oneOff });
    lastBad = unknownCatalogIds(program);
    if (lastBad.length === 0) return program;
  }
  throw new Error(`La IA usó ejercicios fuera del catálogo: ${lastBad.join(", ")}`);
}
