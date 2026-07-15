import { dayAtNoon } from "../session/metricDate";
import { dateKey } from "../session/dateKey";
import type { ReportKind } from "@pulsia/shared";

// Día calendario (dispositivo) SIGUIENTE al día del informe = MAÑANA — solo para el informe
// "daily" de HOY (offset 0). weekly/biweekly/monthly no ajustan el plan de suplementos.
// SOLO offset 0: el ajuste ("mañana saltealo") solo tiene sentido para el día que recién
// terminó. Regenerar el informe de un día PASADO (offset > 0) NO debe dejar un ajuste — su
// "día siguiente" cae en el pasado o en HOY, y como el ajuste es único por (usuario, fecha),
// pisaría en silencio el ajuste real de un día posterior (bug encontrado en review externo #133).
export function adjustmentDateForReport(kind: ReportKind, offset: number, now: number): string | undefined {
  if (kind !== "daily" || offset !== 0) return undefined;
  return dateKey(dayAtNoon(-1, now)); // mañana
}
