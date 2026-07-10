export function buildMemoryUpdatePrompt(current: string, historySummary: string, progressSummary?: string): string {
  return [
    "Sos el sistema de memoria de un entrenador de fuerza. Mantenés una memoria evolutiva y concisa del atleta.",
    "",
    "Memoria actual del atleta:",
    current.trim() || "(vacía)",
    "",
    "Sesiones recientes (rendimiento, notas, sustituciones):",
    historySummary.trim() || "(sin sesiones recientes)",
    ...(progressSummary && progressSummary.trim()
      ? ["", "Progreso medido (métricas y fuerza en el tiempo):", progressSummary]
      : []),
    "",
    "Actualizá la memoria: incorporá lo nuevo y durable (equipo que NO tiene, molestias/lesiones, preferencias, niveles de fuerza y tendencias, qué le funciona), mantené lo relevante previo, descartá lo efímero. Escribí SOLO la memoria actualizada, en texto plano, máximo ~1500 caracteres, sin preámbulos.",
  ].join("\n");
}
