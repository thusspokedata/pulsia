// Mediodía local del día `offsetDays` hacia atrás desde `now` (bucket diario, sin líos de TZ).
export function dayAtNoon(offsetDays: number, now: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() - offsetDays);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}
// Hora local de un instante, en HH:MM.
export function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
// Label corto del día ("hoy", "ayer", o "mié 9 jul").
export function dayLabel(offsetDays: number, now: number): string {
  if (offsetDays === 0) return "hoy";
  if (offsetDays === 1) return "ayer";
  return new Date(dayAtNoon(offsetDays, now)).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
}
