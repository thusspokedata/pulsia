import { and, asc, eq } from "drizzle-orm";
import { supplement, supplementPlan, supplementPlanItem, supplementTake, supplementAdjustment } from "../db/schema";
import type {
  Supplement, SupplementInput, PlanView, PlanItemPatch, TakeInput,
  AdjustmentItem, Frequency, TakeSlot,
} from "@pulsia/shared";
import type { Db } from "../db/client";

type SupplementRow = typeof supplement.$inferSelect;

export function toSupplement(row: SupplementRow): Supplement {
  return {
    id: row.id, name: row.name, brand: row.brand ?? null,
    servingLabel: row.servingLabel,
    components: row.components,
    labelMaxPerDay: row.labelMaxPerDay ?? null,
    source: row.source as Supplement["source"],
    info: row.info ?? null, notes: row.notes ?? null,
    createdAt: new Date(row.createdAt).getTime(),
  };
}

export async function insertSupplement(db: Db, userId: string, input: SupplementInput): Promise<Supplement> {
  const rows = await db.insert(supplement).values({
    userId, name: input.name, brand: input.brand ?? null,
    servingLabel: input.servingLabel, components: [...input.components],
    labelMaxPerDay: input.labelMaxPerDay ?? null, source: input.source,
    info: input.info ?? null, notes: input.notes ?? null,
  }).returning();
  return toSupplement(rows[0]);
}

export async function listSupplements(db: Db, userId: string): Promise<Supplement[]> {
  const rows = await db.select().from(supplement)
    .where(eq(supplement.userId, userId)).orderBy(asc(supplement.name));
  return rows.map(toSupplement);
}

export async function getSupplement(db: Db, userId: string, id: string): Promise<Supplement | null> {
  const row = await db.query.supplement.findFirst({ where: and(eq(supplement.id, id), eq(supplement.userId, userId)) });
  return row ? toSupplement(row) : null;
}

// Full replace: el cliente debe mandar la info preservada (el form la conserva); si no, se pierde.
export async function updateSupplement(db: Db, userId: string, id: string, input: SupplementInput): Promise<Supplement | null> {
  const rows = await db.update(supplement).set({
    name: input.name, brand: input.brand ?? null,
    servingLabel: input.servingLabel, components: [...input.components],
    labelMaxPerDay: input.labelMaxPerDay ?? null, source: input.source,
    info: input.info ?? null, notes: input.notes ?? null,
  }).where(and(eq(supplement.id, id), eq(supplement.userId, userId))).returning();
  return rows[0] ? toSupplement(rows[0]) : null;
}

export async function setSupplementInfo(db: Db, userId: string, id: string, info: string): Promise<Supplement | null> {
  const rows = await db.update(supplement).set({ info })
    .where(and(eq(supplement.id, id), eq(supplement.userId, userId))).returning();
  return rows[0] ? toSupplement(rows[0]) : null;
}

export async function deleteSupplement(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(supplement)
    .where(and(eq(supplement.id, id), eq(supplement.userId, userId))).returning({ id: supplement.id });
  return rows.length > 0;
}

// ---- Plan de tomas + checklist diario (PR2) ----

type PlanRow = typeof supplementPlan.$inferSelect;
type PlanItemRow = typeof supplementPlanItem.$inferSelect;
type PlanItemJoined = PlanItemRow & { supplementName: string };

export function toPlanView(plan: Pick<PlanRow, "id" | "userNote" | "createdAt">, items: PlanItemJoined[]): PlanView {
  return {
    id: plan.id, userNote: plan.userNote ?? null, createdAt: new Date(plan.createdAt).getTime(),
    items: items.map((it) => ({
      id: it.id, supplementId: it.supplementId, slot: it.slot as TakeSlot,
      frequency: it.frequency as Frequency, dose: it.dose, reason: it.reason ?? null,
      supplementName: it.supplementName,
    })),
  };
}

export function snapshotForTake(item: Pick<PlanItemJoined, "supplementName" | "dose" | "slot">) {
  return { supplementName: item.supplementName, plannedDose: item.dose, slot: item.slot };
}

// Regenerar = archivar el activo + crear el nuevo, atómico.
export async function createPlan(db: Db, userId: string, userNote: string | null, items: {
  supplementId: string; slot: string; frequency: Frequency; dose: string; reason: string | null;
}[]): Promise<PlanView> {
  return db.transaction(async (tx) => {
    await tx.update(supplementPlan).set({ status: "archived" })
      .where(and(eq(supplementPlan.userId, userId), eq(supplementPlan.status, "active")));
    const [plan] = await tx.insert(supplementPlan).values({ userId, status: "active", userNote }).returning();
    const rows = items.length
      ? await tx.insert(supplementPlanItem).values(items.map((it) => ({ planId: plan.id, ...it }))).returning()
      : [];
    // nombres para la vista: los ítems vienen validados contra el catálogo en la ruta
    const sups = await tx.select().from(supplement).where(eq(supplement.userId, userId));
    const nameById = new Map(sups.map((s) => [s.id, s.name]));
    return toPlanView(plan, rows.map((r) => ({ ...r, supplementName: nameById.get(r.supplementId) ?? "?" })));
  });
}

export async function getActivePlan(db: Db, userId: string): Promise<PlanView | null> {
  const plan = await db.query.supplementPlan.findFirst({
    where: and(eq(supplementPlan.userId, userId), eq(supplementPlan.status, "active")),
  });
  if (!plan) return null;
  const items = await db.select({
    id: supplementPlanItem.id, planId: supplementPlanItem.planId,
    supplementId: supplementPlanItem.supplementId, slot: supplementPlanItem.slot,
    frequency: supplementPlanItem.frequency, dose: supplementPlanItem.dose, reason: supplementPlanItem.reason,
    supplementName: supplement.name,
  }).from(supplementPlanItem)
    .innerJoin(supplement, eq(supplementPlanItem.supplementId, supplement.id))
    .where(eq(supplementPlanItem.planId, plan.id));
  return toPlanView(plan, items as PlanItemJoined[]);
}

// Ownership vía el plan (el ítem no tiene userId propio).
export async function getOwnedPlanItem(db: Db, userId: string, itemId: string): Promise<PlanItemJoined | null> {
  const rows = await db.select({
    id: supplementPlanItem.id, planId: supplementPlanItem.planId,
    supplementId: supplementPlanItem.supplementId, slot: supplementPlanItem.slot,
    frequency: supplementPlanItem.frequency, dose: supplementPlanItem.dose, reason: supplementPlanItem.reason,
    supplementName: supplement.name,
  }).from(supplementPlanItem)
    .innerJoin(supplementPlan, eq(supplementPlanItem.planId, supplementPlan.id))
    .innerJoin(supplement, eq(supplementPlanItem.supplementId, supplement.id))
    .where(and(eq(supplementPlanItem.id, itemId), eq(supplementPlan.userId, userId)));
  return (rows[0] as PlanItemJoined | undefined) ?? null;
}

export async function updatePlanItem(db: Db, userId: string, itemId: string, patch: PlanItemPatch): Promise<PlanItemJoined | null> {
  const owned = await getOwnedPlanItem(db, userId, itemId);
  if (!owned) return null;
  const set: Record<string, unknown> = {};
  if (patch.slot !== undefined) set.slot = patch.slot;
  if (patch.frequency !== undefined) set.frequency = patch.frequency;
  if (patch.dose !== undefined) set.dose = patch.dose;
  await db.update(supplementPlanItem).set(set).where(eq(supplementPlanItem.id, itemId));
  return { ...owned, ...set } as PlanItemJoined;
}

export async function upsertTake(db: Db, userId: string, input: TakeInput, snapshot: {
  supplementName: string; plannedDose: string; slot: string;
}): Promise<void> {
  await db.insert(supplementTake).values({
    userId, date: input.date, planItemId: input.planItemId,
    supplementName: snapshot.supplementName, plannedDose: snapshot.plannedDose, slot: snapshot.slot,
    status: input.status, actualDose: input.actualDose ?? null, note: input.note ?? null,
  }).onConflictDoUpdate({
    target: [supplementTake.userId, supplementTake.date, supplementTake.planItemId],
    set: { status: input.status, actualDose: input.actualDose ?? null, note: input.note ?? null },
  });
}

export async function listTakesForDate(db: Db, userId: string, date: string) {
  return db.select().from(supplementTake)
    .where(and(eq(supplementTake.userId, userId), eq(supplementTake.date, date)));
}

// PR3 la escribe; PR2 solo la lee (vacía hasta entonces).
export async function getAdjustmentItems(db: Db, userId: string, forDate: string): Promise<AdjustmentItem[]> {
  const row = await db.query.supplementAdjustment.findFirst({
    where: and(eq(supplementAdjustment.userId, userId), eq(supplementAdjustment.forDate, forDate)),
  });
  return (row?.items as AdjustmentItem[]) ?? [];
}
