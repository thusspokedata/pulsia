import { GOAL_ES } from "./prompt";
import type { TrainingProfile } from "@pulsia/shared";

const NUTRITION_ES: Record<string, string> = {
  lose: "bajar de peso / grasa", maintain: "mantener el peso", gain: "subir de peso / masa",
};

// Redacta el prompt para que la IA proponga un "objetivo de trabajo" (el norte) de la persona.
// Es un BORRADOR: el usuario lo edita/confirma. No debe inventar datos que no estén acá.
export function buildWorkObjectiveDraftPrompt(input: {
  profile: TrainingProfile;
  memory: string;
  nutritionObjective: string;
}): string {
  const { profile, memory, nutritionObjective } = input;
  return [
    "Sos un coach. Redactá el OBJETIVO DE TRABAJO (el norte) de esta persona: qué buscamos lograr y",
    "el enfoque general, en 2-4 frases claras en español. Es un borrador que la persona va a editar.",
    "No inventes datos que no estén acá.",
    "",
    `Objetivo de entrenamiento: ${profile.goal}${GOAL_ES[profile.goal] ? ` (${GOAL_ES[profile.goal]})` : ""}`,
    `Objetivo nutricional: ${nutritionObjective}${NUTRITION_ES[nutritionObjective] ? ` (${NUTRITION_ES[nutritionObjective]})` : ""}`,
    `Experiencia: ${profile.experience}`,
    `Días por semana: ${profile.daysPerWeek} · Minutos por sesión: ${profile.sessionMinutes}`,
    `Limitaciones: ${profile.limitations.join("; ") || "ninguna"}`,
    "",
    "Lo que la IA sabe de la persona (memoria):",
    memory.trim() || "(sin memoria todavía)",
    "",
    "Escribí SOLO el objetivo de trabajo, en texto plano, sin preámbulos.",
  ].join("\n");
}
