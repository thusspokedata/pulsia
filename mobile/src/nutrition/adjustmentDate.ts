import { dayAtNoon } from "../session/metricDate";
import { dateKey } from "../session/dateKey";
import type { ReportKind } from "@pulsia/shared";

// Día calendario (dispositivo) SIGUIENTE al día del informe — solo aplica a informes "daily"
// (weekly/biweekly/monthly no ajustan el plan de suplementos, ver ReportGenerateInputSchema).
// `offset` es el mismo que usa periods.ts: positivo = pasado. El día del informe es
// dayAtNoon(offset, now); el día SIGUIENTE es un offset uno más chico (offset - 1), y para
// offset 0 (informe de hoy) eso es dayAtNoon(-1, now) = mañana. dayAtNoon soporta offsets
// negativos porque usa `d.setDate(d.getDate() - offsetDays)`, que con offsetDays negativo suma
// días — verificado contra metricDate.ts, no hace falta aritmética de calendario aparte.
export function adjustmentDateForReport(kind: ReportKind, offset: number, now: number): string | undefined {
  if (kind !== "daily") return undefined;
  return dateKey(dayAtNoon(offset - 1, now));
}
