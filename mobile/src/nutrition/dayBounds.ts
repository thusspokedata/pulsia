import { dayAtNoon } from "../session/metricDate";

export function dayBounds(offset: number): { from: number; to: number; noon: number } {
  const noon = dayAtNoon(offset, Date.now()); // mediodía del día (offset 0 = hoy)
  const start = noon - 12 * 3600_000; // 00:00
  const end = start + 24 * 3600_000 - 1; // 23:59:59.999
  return { from: start, to: end, noon };
}
