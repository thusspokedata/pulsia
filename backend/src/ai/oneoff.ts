import { catalogForEquipment, type TrainingProfile, type Equipment, type MuscleGroup } from "@pulsia/shared";

export type OneOffArgs = {
  location: "gym" | "home";
  focus: MuscleGroup[];
  sessionMinutes: number;
  equipment: Equipment[];
  notes?: string;
};

export function buildOneOffPrompt(profile: TrainingProfile, args: OneOffArgs): string {
  // Equipo explícito de la sesión; si viene vacío, cae al equipo del location del perfil.
  const equipment: Equipment[] =
    args.equipment.length > 0
      ? args.equipment
      : args.location === "home"
        ? profile.homeEquipment
        : profile.gymEquipment;

  const catalogList = catalogForEquipment(equipment)
    .map((e) => `- ${e.id} | ${e.garminName} | músculos: ${e.primaryMuscles.join(",")} | equip: ${e.equipment.join(",")}`)
    .join("\n");
  const lugar = args.location === "home" ? "casa" : "gimnasio";
  const musculos = args.focus.join(", ");

  const lines = [
    "Sos un entrenador de fuerza experto. Diseñá UN ENTRENAMIENTO de un solo día (puntual, para viaje/vacaciones).",
    "",
    "Perfil del atleta:",
    `- Experiencia: ${profile.experience}`,
    `- Objetivo: ${profile.goal}`,
    `- Minutos disponibles para esta sesión: ${args.sessionMinutes}`,
    `- Limitaciones: ${profile.limitations.join("; ") || "ninguna"}`,
    "",
    `Entrenamiento pedido: enfoque en los grupos musculares: ${musculos}. En ${lugar} (location=${args.location}).`,
  ];

  if (args.notes && args.notes.trim().length > 0) {
    lines.push(
      "",
      `Notas del atleta para HOY (respetalas estrictamente): ${args.notes.trim()}`,
    );
  }

  lines.push(
    "",
    "Reglas:",
    "1. Usá ÚNICAMENTE ejercicios de este catálogo (catalogId = id; garminName = nombre exacto):",
    catalogList,
    `2. Devolvé un programa (schema Program) con EXACTAMENTE 1 semana (weekNumber 1) y 1 workout, location=${args.location}, focus="${args.focus[0]}".`,
    `3. Cubrí de forma balanceada TODOS los grupos pedidos (${musculos}). Ajustá la cantidad de ejercicios al tiempo disponible (~1 ejercicio cada 10 minutos, con un mínimo de 3 y un máximo de 10).`,
    "4. Es un entrenamiento de un único día: no encadenes ni ajustes semana a semana. Elegí cargas/series/reps razonables para el nivel.",
    "5. Respetá las limitaciones del atleta y las notas de hoy.",
    "Devolvé el resultado llamando a la herramienta provista.",
  );

  return lines.join("\n");
}
