import { catalogForEquipment, type TrainingProfile, type Equipment, type MuscleGroup } from "@pulsia/shared";

export function buildOneOffPrompt(
  profile: TrainingProfile,
  args: { location: "gym" | "home"; focus: MuscleGroup },
): string {
  const equipment: Equipment[] = args.location === "home" ? profile.homeEquipment : profile.gymEquipment;
  const catalogList = catalogForEquipment(equipment)
    .map((e) => `- ${e.id} | ${e.garminName} | músculos: ${e.primaryMuscles.join(",")} | equip: ${e.equipment.join(",")}`)
    .join("\n");
  const lugar = args.location === "home" ? "casa" : "gimnasio";

  return [
    "Sos un entrenador de fuerza experto. Diseñá UN ENTRENAMIENTO de un solo día (puntual, para viaje/vacaciones).",
    "",
    "Perfil del atleta:",
    `- Experiencia: ${profile.experience}`,
    `- Objetivo: ${profile.goal}`,
    `- Minutos por sesión: ${profile.sessionMinutes}`,
    `- Limitaciones: ${profile.limitations.join("; ") || "ninguna"}`,
    "",
    `Entrenamiento pedido: enfoque en el grupo muscular "${args.focus}", en ${lugar} (location=${args.location}).`,
    "",
    "Reglas:",
    "1. Usá ÚNICAMENTE ejercicios de este catálogo (catalogId = id; garminName = nombre exacto):",
    catalogList,
    `2. Devolvé un programa (schema Program) con EXACTAMENTE 1 semana (weekNumber 1) y 1 workout, location=${args.location}, focus="${args.focus}", máximo 5 ejercicios.`,
    "3. Es un entrenamiento de un único día: no encadenes ni ajustes semana a semana. Elegí cargas/series/reps razonables para el nivel.",
    "4. Respetá las limitaciones del atleta.",
    "Devolvé el resultado llamando a la herramienta provista.",
  ].join("\n");
}
