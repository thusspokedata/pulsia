// Fecha LOCAL en formato YYYY-MM-DD (no UTC). Usado por heatmap.ts y weeklyBars.ts
// para bucketizar sesiones por día calendario del usuario.

export function dateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
