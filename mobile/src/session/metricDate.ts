// Mediodía local del día `offsetDays` hacia atrás desde `now` (bucket diario, sin líos de TZ).
export function dayAtNoon(offsetDays: number, now: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() - offsetDays);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}
// Label corto del día ("hoy", "ayer", o "mié 9 jul").
export function dayLabel(offsetDays: number, now: number): string {
  if (offsetDays === 0) return "hoy";
  if (offsetDays === 1) return "ayer";
  return new Date(dayAtNoon(offsetDays, now)).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
}
