import { dayAtNoon } from "../session/metricDate";
import type { ReportKind } from "@pulsia/shared";

export interface Period { kind: ReportKind; start: number; end: number; label: string }

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Día local. Convención: offset POSITIVO = días hacia atrás (offset 0 = hoy, 1 = ayer),
// igual que `dayAtNoon`/`dayLabel` y `dayBounds` del tab de Nutrición.
export function dayPeriod(offset: number, now: number): Period {
  const noon = dayAtNoon(offset, now);
  const start = noon - 12 * 3600_000;
  const end = start + 24 * 3600_000 - 1;
  const d = new Date(noon);
  return { kind: "daily", start, end, label: `${d.getDate()} de ${MESES[d.getMonth()]}` };
}
