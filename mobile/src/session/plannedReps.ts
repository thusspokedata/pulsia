// Extrae el número entero inicial de un texto de reps planificadas (p.ej. "8-10" → 8,
// "12 reps" → 12). Sirve para pre-llenar el contador de reps con el objetivo antes de
// que el usuario toque nada. Texto sin número al inicio (AMRAP, vacío, etc.) → 0.
export function parsePlannedReps(reps: string): number {
  const match = reps.trim().match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
