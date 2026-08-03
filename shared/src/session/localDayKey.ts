// Fecha LOCAL en formato YYYY-MM-DD (no UTC). Corre client-side (mobile/web), donde el huso del
// runtime ES el del usuario.
export function localDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
