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

const atMidnight = (d: Date): Date => { d.setHours(0, 0, 0, 0); return d; };
const label2 = (a: Date, b: Date): string => `${a.getDate()} al ${b.getDate()} de ${MESES[b.getMonth()]}`;

// Semana desde LUNES. offset 0 = semana actual, 1 = anterior.
export function weekPeriod(offset: number, now: number): Period {
  const d = atMidnight(new Date(now));
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow - offset * 7);
  const start = d.getTime();
  const end = start + 7 * 24 * 3600_000 - 1;
  const a = new Date(start); const b = new Date(end);
  return { kind: "weekly", start, end, label: `Semana del ${label2(a, b)}` };
}

// Quincena: [1..15] y [16..fin de mes]. offset cuenta quincenas hacia atrás.
export function biweekPeriod(offset: number, now: number): Period {
  const base = new Date(now);
  let year = base.getFullYear();
  let month = base.getMonth();
  let half = base.getDate() <= 15 ? 0 : 1; // 0 = primera, 1 = segunda
  for (let i = 0; i < offset; i++) {
    if (half === 1) half = 0;
    else { half = 1; month -= 1; if (month < 0) { month = 11; year -= 1; } }
  }
  const startDay = half === 0 ? 1 : 16;
  const start = new Date(year, month, startDay, 0, 0, 0, 0).getTime();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const endDay = half === 0 ? 15 : lastDay;
  const end = new Date(year, month, endDay, 23, 59, 59, 999).getTime();
  return { kind: "biweekly", start, end, label: `${startDay}–${endDay} de ${MESES[month]}` };
}

// Mes calendario. offset 0 = mes actual.
export function monthPeriod(offset: number, now: number): Period {
  const base = new Date(now);
  const year = base.getFullYear();
  const month = base.getMonth() - offset;
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { kind: "monthly", start: start.getTime(), end: end.getTime(), label: `${MESES[start.getMonth()]} ${start.getFullYear()}` };
}

export function periodFor(kind: ReportKind, offset: number, now: number): Period {
  switch (kind) {
    case "weekly": return weekPeriod(offset, now);
    case "biweekly": return biweekPeriod(offset, now);
    case "monthly": return monthPeriod(offset, now);
    default: return dayPeriod(offset, now);
  }
}
