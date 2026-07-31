// Clave de día LOCAL (no UTC): el heatmap muestra "qué días entrené" según el huso del usuario.
export function localDayKey(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function yearOf(ms: number): number {
  return new Date(ms).getFullYear();
}

export function countByLocalDay(timestamps: number[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const ms of timestamps) {
    const k = localDayKey(ms);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}
