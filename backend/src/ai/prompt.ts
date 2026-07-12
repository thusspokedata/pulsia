import { catalogForEquipment, type TrainingProfile, type Equipment } from "@pulsia/shared";

const SEX_ES: Record<string, string> = { male: "masculino", female: "femenino", other: "otro", prefer_not_to_say: "prefiere no decir" };

export function buildGenerationPrompt(
  profile: TrainingProfile,
  historySummary?: string,
  memory?: string,
  progressSummary?: string,
  ecgSummary?: string,
): string {
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
    ...(profile.sex != null ? [`- Sexo: ${SEX_ES[profile.sex]}`] : []),
    ...(profile.age != null ? [`- Edad: ${profile.age} años`] : []),
    ...(profile.heightCm != null ? [`- Altura: ${profile.heightCm} cm`] : []),
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
    ...(historySummary && historySummary.trim()
      ? [
          "",
          "Historial reciente del atleta (usalo para ajustar cargas, volumen y ejercicios; respetá las notas y sustituciones — el atleta NO puede hacer los ejercicios sustituidos):",
          historySummary,
        ]
      : []),
    ...(memory && memory.trim()
      ? [
          "",
          "Memoria del atleta (conocimiento acumulado — equipo que NO tiene, molestias/lesiones, preferencias, niveles y tendencias): usala para personalizar el plan.",
          memory,
        ]
      : []),
    ...(progressSummary && progressSummary.trim()
      ? [
          "",
          "Progreso medido del atleta (métricas corporales y de fuerza en el tiempo): tenelo en cuenta para ajustar cargas, volumen y objetivo del plan.",
          progressSummary,
        ]
      : []),
    ...(ecgSummary && ecgSummary.trim()
      ? ["", `Contexto de salud cardíaca (SOLO informativo — NO es indicación clínica ni base para prescribir o restringir ejercicio): ${ecgSummary}. Ante hallazgos cardíacos, la conducta correcta es sugerir consultar a un médico, no ajustar la intensidad por tu cuenta.`]
      : []),
    "Devolvé el resultado llamando a la herramienta provista.",
  ].join("\n");
}
