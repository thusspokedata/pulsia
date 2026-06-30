import { catalogForEquipment, type TrainingProfile, type Equipment } from "@pulsia/shared";

export function buildGenerationPrompt(profile: TrainingProfile): string {
  const allEquipment = Array.from(
    new Set<Equipment>([...profile.gymEquipment, ...profile.homeEquipment]),
  );
  const allowed = catalogForEquipment(allEquipment);
  const catalogList = allowed
    .map((e) => `- ${e.id} | ${e.garminName} | músculos: ${e.primaryMuscles.join(",")} | equip: ${e.equipment.join(",")}`)
    .join("\n");

  return [
    "Sos un entrenador de fuerza experto. Diseñá un programa multi-semana.",
    "",
    "Perfil del atleta:",
    `- Experiencia: ${profile.experience}`,
    `- Objetivo: ${profile.goal}`,
    `- Días por semana: ${profile.daysPerWeek}`,
    `- Minutos por sesión: ${profile.sessionMinutes}`,
    `- Equipamiento gimnasio: ${profile.gymEquipment.join(", ") || "ninguno"}`,
    `- Equipamiento casa: ${profile.homeEquipment.join(", ") || "ninguno"}`,
    `- Limitaciones: ${profile.limitations.join("; ") || "ninguna"}`,
    "",
    "Reglas:",
    "1. Usá ÚNICAMENTE ejercicios de este catálogo (campo catalogId = id; garminName = nombre exacto):",
    catalogList,
    "2. Por cada día de gimnasio (location=gym) incluí también un día equivalente para casa (location=home) usando solo el equipamiento de casa.",
    "3. Aplicá progresión semana a semana (cargas/series/reps).",
    "4. Respetá las limitaciones del atleta.",
    "5. Generá un programa de 2 semanas, con un máximo de 5 ejercicios por día.",
    "Devolvé el resultado llamando a la herramienta provista.",
  ].join("\n");
}
