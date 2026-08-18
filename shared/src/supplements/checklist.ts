import { TAKE_SLOTS } from "../schemas/supplements";
import type { Frequency, TakeSlot, TakeStatus, AdjustmentItem } from "../schemas/supplements";

export interface ChecklistPlanItem {
  id: string;
  supplementId: string;
  slot: TakeSlot;
  frequency: Frequency;
  dose: string;
  active: boolean;
  reason?: string | null;
  supplementName: string;
}

export interface ChecklistTake {
  planItemId: string;
  status: TakeStatus;
  actualDose?: string | null;
  note?: string | null;
}

export interface ChecklistAdHocTake {
  takeId: string;
  supplementId: string;
  supplementName: string;
  slot: TakeSlot;
  plannedDose: string;
  status: TakeStatus;
  actualDose?: string | null;
  note?: string | null;
}

export interface DayChecklistEntry {
  origin: "plan" | "adhoc";
  planItemId: string | null;   // null en filas ad-hoc
  takeId: string | null;       // el supplement_take.id en filas ad-hoc; null en las del plan
  supplementId: string;
  supplementName: string;
  slot: TakeSlot;
  dose: string;          // efectiva (con reduce aplicado en las del plan)
  plannedDose: string;   // la del plan / la elegida en ad-hoc
  reason: string | null;
  adjusted: { action: "skip" | "reduce"; reason: string } | null;
  status: TakeStatus | null;
  actualDose: string | null;
  note: string | null;
}

// Días completos entre dos YYYY-MM-DD, sin timezone (ambos se parsean como UTC).
function daysBetween(a: string, b: string): number {
  const ms = Date.UTC(...splitDate(a)) - Date.UTC(...splitDate(b));
  return Math.round(ms / 86_400_000);
}
// YYYY-MM-DD → [año, mes 0-based, día] listo para Date.UTC (compartido con overlap.ts).
export function splitDate(d: string): [number, number, number] {
  const [y, m, day] = d.split("-").map(Number);
  return [y, m - 1, day];
}

// Asume YYYY-MM-DD válido (validar en el borde con Zod); una fecha inválida hace que el ítem NO aplique.
export function frequencyAppliesOn(freq: Frequency, date: string): boolean {
  if (freq.type === "daily") return true;
  if (freq.type === "every_other_day") return Math.abs(daysBetween(date, freq.anchorDate)) % 2 === 0;
  // weekdays: convención JS getDay() (0 = domingo). getUTCDay sobre el date-only parseado como UTC.
  const dow = new Date(Date.UTC(...splitDate(date))).getUTCDay();
  return freq.days.includes(dow);
}

// OJO — keying deliberado por supplementId (no por planItemId): un ajuste (skip/reduce) del
// informe diario aplica a TODAS las franjas de ese suplemento ese día (ver adjBySupplement
// abajo). La IA razona por producto ("ya cubriste el magnesio"), no por franja individual —
// si un suplemento está en 2 franjas (split dosing), el ajuste pega en ambas por diseño.
export function resolveDayChecklist({ planItems, adjustments, takes, adHocTakes, date }: {
  planItems: ChecklistPlanItem[];
  adjustments: AdjustmentItem[];
  takes: ChecklistTake[];
  adHocTakes: ChecklistAdHocTake[];
  date: string; // YYYY-MM-DD (día calendario del dispositivo)
}): DayChecklistEntry[] {
  const takesByItem = new Map(takes.map((t) => [t.planItemId, t]));
  const adjBySupplement = new Map(adjustments.map((a) => [a.supplementId, a]));
  const planEntries = planItems
    .filter((it) => it.active !== false && frequencyAppliesOn(it.frequency, date))
    .map((it): DayChecklistEntry => {
      const adj = adjBySupplement.get(it.supplementId) ?? null;
      const take = takesByItem.get(it.id) ?? null;
      return {
        origin: "plan",
        planItemId: it.id,
        takeId: null,
        supplementId: it.supplementId,
        supplementName: it.supplementName,
        slot: it.slot,
        dose: adj?.action === "reduce" && adj.dose ? adj.dose : it.dose,
        plannedDose: it.dose,
        reason: it.reason ?? null,
        adjusted: adj ? { action: adj.action, reason: adj.reason } : null,
        status: take?.status ?? null,
        actualDose: take?.actualDose ?? null,
        note: take?.note ?? null,
      };
    });
  const adHocEntries = adHocTakes.map((t): DayChecklistEntry => ({
    origin: "adhoc",
    planItemId: null,
    takeId: t.takeId,
    supplementId: t.supplementId,
    supplementName: t.supplementName,
    slot: t.slot,
    dose: t.plannedDose,
    plannedDose: t.plannedDose,
    reason: null,
    adjusted: null,
    status: t.status,
    actualDose: t.actualDose ?? null,
    note: t.note ?? null,
  }));
  const order = new Map(TAKE_SLOTS.map((s, i) => [s, i]));
  return [...planEntries, ...adHocEntries].sort((a, b) => (order.get(a.slot)! - order.get(b.slot)!));
}
